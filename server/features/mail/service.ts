import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import {
  mailDeliveryEvents,
  mailMailboxes,
  mailMessages,
  mailOutbox,
  wtfSubdomainGrants,
} from "@shared/schema";
import { createNotification } from "../../lib/notifications";
import { publishCommunicationItem } from "../comms/publisher";
import { getMailConfig } from "./config";
import {
  normalizeEmailAddress,
  normalizeMailLocalPart,
  splitEmailAddress,
  validateMailLocalPart,
} from "./address";
import { sendWithResend } from "./resend-provider";
import { evaluateUserMailProvisioning } from "./provisioner";

export async function getOrProvisionMailboxForUser(userId: number) {
  const evaluated = await evaluateUserMailProvisioning(userId);
  if (!evaluated.user) throw new Error("user_not_found");
  const existing = evaluated.existing;
  if (existing) {
    return {
      mailbox: existing,
      eligible: evaluated.gate.ok,
      gate: evaluated.gate,
    };
  }

  const config = getMailConfig();
  const localPart = evaluated.gate.ok
    ? evaluated.gate.localPart
    : normalizeMailLocalPart(evaluated.user.username);
  const validated = validateMailLocalPart(localPart);
  if (!validated.ok) throw new Error(validated.error);

  const [grant] = await db
    .select({ id: wtfSubdomainGrants.id })
    .from(wtfSubdomainGrants)
    .where(
      and(
        eq(wtfSubdomainGrants.userId, userId),
        eq(wtfSubdomainGrants.label, validated.localPart)
      )
    )
    .limit(1);

  const [mailbox] = await db
    .insert(mailMailboxes)
    .values({
      ownerKind: "user",
      userId,
      localPart: validated.localPart,
      domain: config.domain,
      address: `${validated.localPart}@${config.domain}`,
      status: evaluated.gate.ok ? "reserved" : "reserved",
      wtfSubdomainGrantId: grant?.id ?? null,
      provisionedAt: null,
      metadata: {
        rolloutMode: config.rolloutMode,
        gateCode: evaluated.gate.ok ? "ok" : evaluated.gate.code,
      },
    })
    .returning();

  return { mailbox, eligible: evaluated.gate.ok, gate: evaluated.gate };
}

export async function listMailMessagesForUser(input: {
  userId: number;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(input.limit ?? 80, 120));
  return db
    .select()
    .from(mailMessages)
    .where(eq(mailMessages.userId, input.userId))
    .orderBy(desc(mailMessages.createdAt))
    .limit(limit);
}

export async function getMailMessageForUser(input: {
  userId: number;
  messageId: number;
}) {
  const [message] = await db
    .select()
    .from(mailMessages)
    .where(
      and(
        eq(mailMessages.id, input.messageId),
        eq(mailMessages.userId, input.userId)
      )
    )
    .limit(1);
  return message ?? null;
}

export async function sendUserMail(input: {
  userId: number;
  to: string[];
  subject: string;
  textBody: string;
  htmlBody?: string | null;
}) {
  const { mailbox, eligible, gate } = await getOrProvisionMailboxForUser(input.userId);
  if (!eligible || mailbox.status !== "active") {
    if (gate && !gate.ok) {
      throw new Error(gate.code);
    }
    throw new Error("mailbox_not_active");
  }
  const config = getMailConfig();
  if (mailbox.domain !== config.fromDomain && mailbox.domain !== config.domain) {
    throw new Error("mailbox_domain_not_allowed");
  }

  const to = input.to.map(normalizeEmailAddress).filter(Boolean).slice(0, 20);
  if (to.length === 0) throw new Error("recipient_required");

  const now = new Date();
  const [message] = await db
    .insert(mailMessages)
    .values({
      mailboxId: mailbox.id,
      userId: input.userId,
      direction: "outbound",
      status: "queued",
      fromAddress: mailbox.address,
      toAddresses: to,
      subject: input.subject.slice(0, 500),
      textBody: input.textBody,
      htmlBody: input.htmlBody ?? null,
      sentAt: null,
    })
    .returning();

  const [outbox] = await db
    .insert(mailOutbox)
    .values({
      mailboxId: mailbox.id,
      userId: input.userId,
      mailMessageId: message.id,
      status: "queued",
    })
    .returning();

  const sendResult = await sendWithResend({
    from: mailbox.address,
    to,
    subject: input.subject,
    text: input.textBody,
    html: input.htmlBody,
  });

  if (!sendResult.ok) {
    await db
      .update(mailOutbox)
      .set({
        status: "failed",
        attempts: outbox.attempts + 1,
        lastError: sendResult.error,
        updatedAt: now,
      })
      .where(eq(mailOutbox.id, outbox.id));
    await db
      .update(mailMessages)
      .set({ status: "failed", updatedAt: now })
      .where(eq(mailMessages.id, message.id));
    throw new Error(sendResult.error);
  }

  const [updated] = await db
    .update(mailMessages)
    .set({
      status: "sent",
      providerMessageId: sendResult.providerMessageId,
      sentAt: now,
      updatedAt: now,
    })
    .where(eq(mailMessages.id, message.id))
    .returning();

  await db
    .update(mailOutbox)
    .set({
      status: "sent",
      providerMessageId: sendResult.providerMessageId,
      attempts: outbox.attempts + 1,
      sentAt: now,
      updatedAt: now,
    })
    .where(eq(mailOutbox.id, outbox.id));

  const item = await publishCommunicationItem({
    sourceKey: "mail",
    externalRef: `mail:outbound:${updated.id}`,
    itemKind: "email",
    title: updated.subject,
    summary: updated.textBody?.slice(0, 260) ?? null,
    body: updated.textBody,
    authorLabel: mailbox.address,
    targetUserId: input.userId,
    routePath: `/mail?message=${updated.id}`,
    metadata: { direction: "outbound", to },
    occurredAt: now,
  });

  await db
    .update(mailMessages)
    .set({ commsItemId: item.id, updatedAt: new Date() })
    .where(eq(mailMessages.id, updated.id));

  return updated;
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

export async function ingestInboundMail(payload: Record<string, unknown>) {
  const data =
    payload.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : payload;
  const to = stringArray(data.to ?? data.recipients ?? data.to_addresses).map(
    normalizeEmailAddress
  );
  const firstRecipient = to.find((address) => splitEmailAddress(address).ok);
  if (!firstRecipient) {
    await db.insert(mailDeliveryEvents).values({
      eventType: "inbound_rejected_no_recipient",
      payload,
    });
    return { ok: true as const, ignored: true as const };
  }

  const split = splitEmailAddress(firstRecipient);
  if (!split.ok) throw new Error(split.error);
  const [mailbox] = await db
    .select()
    .from(mailMailboxes)
    .where(eq(mailMailboxes.address, split.address))
    .limit(1);
  if (!mailbox || mailbox.status !== "active") {
    await db.insert(mailDeliveryEvents).values({
      eventType: "inbound_unknown_or_inactive_recipient",
      providerMessageId: typeof data.id === "string" ? data.id : null,
      payload,
    });
    return { ok: true as const, ignored: true as const };
  }

  if (mailbox.ownerKind === "bot" || mailbox.userId == null) {
    await db.insert(mailDeliveryEvents).values({
      mailboxId: mailbox.id,
      eventType: "inbound_bot_mailbox",
      providerMessageId: typeof data.id === "string" ? data.id : null,
      payload,
    });
    return { ok: true as const, ignored: true as const, botMailbox: mailbox.address };
  }

  const from = normalizeEmailAddress(
    String(data.from ?? data.from_address ?? "unknown@example.invalid")
  );
  const subject = String(data.subject ?? "(no subject)").slice(0, 500);
  const textBody = String(data.text ?? data.text_body ?? data.body ?? "");
  const htmlBody =
    typeof data.html === "string"
      ? data.html
      : typeof data.html_body === "string"
        ? data.html_body
        : null;
  const now = new Date();
  const [message] = await db
    .insert(mailMessages)
    .values({
      mailboxId: mailbox.id,
      userId: mailbox.userId,
      direction: "inbound",
      status: "received",
      providerMessageId: typeof data.id === "string" ? data.id : null,
      messageIdHeader:
        typeof data.message_id === "string" ? data.message_id.slice(0, 320) : null,
      fromAddress: from,
      fromName: typeof data.from_name === "string" ? data.from_name : null,
      toAddresses: to,
      ccAddresses: stringArray(data.cc),
      subject,
      textBody,
      htmlBody,
      rawPayload: payload,
      receivedAt: now,
    })
    .returning();

  const item = await publishCommunicationItem({
    sourceKey: "mail",
    externalRef: `mail:inbound:${message.id}`,
    itemKind: "email",
    title: subject,
    summary: textBody.slice(0, 260),
    body: textBody,
    authorLabel: from,
    targetUserId: mailbox.userId,
    routePath: `/mail?message=${message.id}`,
    metadata: { direction: "inbound", from, to },
    occurredAt: now,
  });

  await db
    .update(mailMessages)
    .set({ commsItemId: item.id, updatedAt: new Date() })
    .where(eq(mailMessages.id, message.id));

  await createNotification({
    userId: mailbox.userId,
    eventKey: "mail.message.received",
    title: `New mail: ${subject}`,
    body: textBody.slice(0, 180),
    metadata: { mailMessageId: message.id, commsItemId: item.id },
  });

  return { ok: true as const, message };
}

export async function recordMailDeliveryEvent(payload: Record<string, unknown>) {
  const data =
    payload.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : payload;
  const providerMessageId = String(data.email_id ?? data.id ?? data.message_id ?? "");
  const eventType = String(payload.type ?? data.type ?? "delivery_event").slice(0, 80);
  let messageId: number | null = null;
  let mailboxId: number | null = null;
  if (providerMessageId) {
    const [message] = await db
      .select({
        id: mailMessages.id,
        mailboxId: mailMessages.mailboxId,
      })
      .from(mailMessages)
      .where(eq(mailMessages.providerMessageId, providerMessageId))
      .limit(1);
    messageId = message?.id ?? null;
    mailboxId = message?.mailboxId ?? null;
  }
  await db.insert(mailDeliveryEvents).values({
    mailMessageId: messageId,
    mailboxId,
    eventType,
    providerMessageId: providerMessageId || null,
    payload,
  });

  if (messageId && ["email.bounced", "email.complained"].includes(eventType)) {
    await db
      .update(mailMessages)
      .set({
        status: eventType === "email.bounced" ? "bounced" : "complained",
        updatedAt: new Date(),
      })
      .where(eq(mailMessages.id, messageId));
  }
}

export async function getMailStatusForUser(userId: number) {
  const evaluated = await evaluateUserMailProvisioning(userId);
  const config = getMailConfig();
  const mailbox =
    evaluated.existing ??
    (await getOrProvisionMailboxForUser(userId).then((r) => r.mailbox).catch(() => null));
  return {
    mailbox,
    eligible: evaluated.gate.ok,
    gate: evaluated.gate.ok
      ? { ok: true as const, identitySource: evaluated.gate.identitySource, handle: evaluated.gate.handle, did: evaluated.gate.did }
      : {
          ok: false as const,
          code: evaluated.gate.code,
          message: evaluated.gate.message,
          requiredSteps: evaluated.gate.requiredSteps,
        },
    config: {
      provider: config.provider,
      domain: config.domain,
      inboundEnabled: config.inboundEnabled,
      outboundEnabled: config.outboundEnabled,
      rolloutMode: config.rolloutMode,
      resendConfigured: Boolean(config.resendApiKey),
      webhookSecretConfigured: config.resendWebhookSecretConfigured,
    },
  };
}

export async function findMailMessagesByIds(ids: number[], userId: number) {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(mailMessages)
    .where(and(eq(mailMessages.userId, userId), inArray(mailMessages.id, ids)));
}
