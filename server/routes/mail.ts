import { createHmac, timingSafeEqual } from "crypto";
import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth/passport";
import { getMailConfig, isMailProvisioningEnabled } from "../features/mail/config";
import {
  getMailMessageForUser,
  getMailStatusForUser,
  ingestInboundMail,
  listMailMessagesForUser,
  recordMailDeliveryEvent,
  sendUserMail,
} from "../features/mail/service";
import {
  evaluateUserMailProvisioning,
  provisionBotMailbox,
  provisionUserMailbox,
} from "../features/mail/provisioner";
import { createInMemoryRateLimit } from "../lib/in-memory-rate-limit";

const router = Router();

const sendSchema = z.object({
  to: z.array(z.string().trim().email()).min(1).max(20),
  subject: z.string().trim().min(1).max(500),
  textBody: z.string().trim().min(1).max(20_000),
  htmlBody: z.string().max(100_000).optional().nullable(),
});

const botProvisionSchema = z.object({
  localPart: z.string().trim().min(3).max(40).optional(),
  botLabel: z.string().trim().min(1).max(120).optional(),
});

const USER_MAIL_GATE_ERRORS = new Set([
  "missing_tezos_wallet",
  "missing_identity",
  "wtfos_identity_incomplete",
  "guest_not_registered",
]);

export function mailSendErrorStatus(message: string): number {
  if (USER_MAIL_GATE_ERRORS.has(message)) return 403;
  if (message === "mailbox_not_active" || message === "recipient_required") return 400;
  if (message.includes("resend") || message.includes("mail_outbound")) return 503;
  return 500;
}

const mailProvisionRateLimit = createInMemoryRateLimit({
  windowMs: 60_000,
  max: 6,
  message: { error: "mail_provision_rate_limited" },
  keyGenerator: (req) => `mail-provision:${(req.user as any)?.id ?? req.ip}`,
});

const botMailRateLimit = createInMemoryRateLimit({
  windowMs: 60_000,
  max: 20,
  message: { error: "bot_mail_rate_limited" },
  keyGenerator: (req) => `bot-mail:${req.headers.authorization?.slice(0, 24) ?? req.ip}`,
});

function readAppKey(req: any): string | null {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  return null;
}

function provisioningDisabled(res: any): boolean {
  if (!isMailProvisioningEnabled()) {
    res.status(503).json({ error: "mail_provisioning_disabled" });
    return true;
  }
  return false;
}

const mailSendRateLimit = createInMemoryRateLimit({
  windowMs: 60_000,
  max: 12,
  message: { error: "mail_rate_limited" },
  keyGenerator: (req) => `mail:${(req.user as any)?.id ?? req.ip}`,
});

function timingSafeStringEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function verifyResendWebhook(req: any): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";

  const body =
    typeof req.rawBody === "string"
      ? req.rawBody
      : req.body
        ? JSON.stringify(req.body)
        : "";

  const wtfSignature =
    typeof req.headers["x-wtf-signature"] === "string"
      ? req.headers["x-wtf-signature"].replace(/^sha256=/, "")
      : "";
  const wtfTimestamp =
    typeof req.headers["x-wtf-timestamp"] === "string"
      ? req.headers["x-wtf-timestamp"]
      : "";
  if (wtfSignature && wtfTimestamp) {
    const expected = createHmac("sha256", secret)
      .update(`${wtfTimestamp}.${body}`)
      .digest("hex");
    return timingSafeStringEqual(wtfSignature, expected);
  }

  const resendSignature =
    typeof req.headers["resend-signature"] === "string"
      ? req.headers["resend-signature"]
      : typeof req.headers["x-resend-signature"] === "string"
        ? req.headers["x-resend-signature"]
        : "";
  if (!resendSignature) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return (
    timingSafeStringEqual(resendSignature.replace(/^sha256=/, ""), expected) ||
    timingSafeStringEqual(resendSignature, expected)
  );
}

router.get("/api/mail/eligibility", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const evaluated = await evaluateUserMailProvisioning(user.id);
    res.json({
      gate: evaluated.gate,
      mailbox: evaluated.existing,
      domain: getMailConfig().domain,
    });
  } catch (err) {
    console.error("[mail] eligibility failed:", err);
    res.status(500).json({ error: "Failed to evaluate mail eligibility" });
  }
});

router.post("/api/mail/provision", isAuthenticated, mailProvisionRateLimit, async (req, res) => {
  if (provisioningDisabled(res)) return;
  try {
    const user = req.user as any;
    const result = await provisionUserMailbox(user.id);
    if (!result.ok) {
      return res.status(403).json({
        error: result.gate.code,
        message: result.gate.message,
        requiredSteps: result.gate.requiredSteps,
      });
    }
    res.status(result.provisioned ? 201 : 200).json({
      ok: true,
      mailbox: result.mailbox,
      provisioned: result.provisioned,
      credentials: result.credentials,
      gate: {
        identitySource: result.gate.identitySource,
        handle: result.gate.handle,
        did: result.gate.did,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message === "mail_provision_not_configured" ? 503 : 500;
    console.error("[mail] provision failed:", err);
    res.status(status).json({ error: message || "Failed to provision mailbox" });
  }
});

router.post("/api/mail/bot/provision", botMailRateLimit, async (req, res) => {
  if (provisioningDisabled(res)) return;
  const appKey = readAppKey(req);
  if (!appKey) return res.status(401).json({ error: "app_key_required" });
  const parsed = botProvisionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "invalid_payload" });
  try {
    const result = await provisionBotMailbox({
      appKeySecret: appKey,
      localPart: parsed.data.localPart,
      botLabel: parsed.data.botLabel,
    });
    if (!result.ok) {
      return res.status(403).json({ error: result.gate.code, message: result.gate.message });
    }
    res.status(201).json({
      ok: true,
      appId: result.gate.appId,
      mailbox: result.mailbox,
      credentials: result.credentials,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message === "mail_provision_not_configured" ? 503 : 500;
    console.error("[mail] bot provision failed:", err);
    res.status(status).json({ error: message || "Failed to provision bot mailbox" });
  }
});

router.get("/api/mail/status", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    res.json(await getMailStatusForUser(user.id));
  } catch (err) {
    console.error("[mail] status failed:", err);
    res.status(500).json({ error: "Failed to load mail status" });
  }
});

router.get("/api/mail/messages", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const messages = await listMailMessagesForUser({
      userId: user.id,
      limit: Number(req.query.limit || 80),
    });
    res.json({ messages });
  } catch (err) {
    console.error("[mail] messages failed:", err);
    res.status(500).json({ error: "Failed to load mail messages" });
  }
});

router.get("/api/mail/messages/:id", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const messageId = Number(req.params.id);
    if (!Number.isInteger(messageId) || messageId <= 0) {
      return res.status(400).json({ error: "Invalid message id" });
    }
    const message = await getMailMessageForUser({ userId: user.id, messageId });
    if (!message) return res.status(404).json({ error: "Message not found" });
    res.json({ message });
  } catch (err) {
    console.error("[mail] message detail failed:", err);
    res.status(500).json({ error: "Failed to load mail message" });
  }
});

router.post("/api/mail/send", isAuthenticated, mailSendRateLimit, async (req, res) => {
  try {
    const parsed = sendSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid mail send payload" });
    }
    const user = req.user as any;
    const message = await sendUserMail({
      userId: user.id,
      to: parsed.data.to,
      subject: parsed.data.subject,
      textBody: parsed.data.textBody,
      htmlBody: parsed.data.htmlBody,
    });
    res.status(201).json({ message });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = mailSendErrorStatus(message);
    res.status(status).json({ error: message || "Failed to send mail" });
  }
});

router.post("/api/mail/webhooks/resend", async (req, res) => {
  try {
    const config = getMailConfig();
    if (!config.inboundEnabled && process.env.NODE_ENV === "production") {
      return res.status(503).json({ error: "mail_inbound_disabled" });
    }
    if (!verifyResendWebhook(req)) {
      return res.status(401).json({ error: "bad_mail_webhook_signature" });
    }

    const type = String(req.body?.type || req.body?.event || "");
    if (type.includes("received") || type.includes("inbound") || !type) {
      const result = await ingestInboundMail(req.body || {});
      return res.status("ignored" in result && result.ignored ? 202 : 201).json(result);
    }
    await recordMailDeliveryEvent(req.body || {});
    return res.status(202).json({ ok: true });
  } catch (err) {
    console.error("[mail] resend webhook failed:", err);
    res.status(500).json({ error: "Failed to process mail webhook" });
  }
});

export default router;
