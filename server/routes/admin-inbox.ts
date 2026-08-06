import { Router } from "express";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { isAdmin } from "@shared/types";
import {
  adminInboxMessages,
  adminInboxReplies,
  userMediaLibrary,
  userRoles,
  users,
} from "@shared/schema";
import { isAuthenticated } from "../auth/passport";
import { ingestSystemEvent } from "../challenges/events/ingest";
import { db } from "../db";
import { createInMemoryRateLimit } from "../lib/in-memory-rate-limit";

const router = Router();
const MAX_ATTACHMENTS = 5;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => value || null);

const submissionSchema = z
  .object({
    kind: z.enum(["issue", "idea", "question", "feedback", "other"]),
    subject: z.string().trim().min(4).max(180),
    message: z.string().trim().min(4).max(10_000),
    evidence: optionalText(6_000),
    reproductionSteps: optionalText(6_000),
    expectedOutcome: optionalText(4_000),
    impact: optionalText(4_000),
    routePath: optionalText(500),
    clientUrl: optionalText(1_000),
    attachmentMediaIds: z.array(z.number().int().positive()).max(MAX_ATTACHMENTS).default([]),
  })
  .strict();

const replySchema = z.object({ body: z.string().trim().min(1).max(10_000) }).strict();

const submitRateLimit = createInMemoryRateLimit({
  windowMs: 60_000,
  max: 6,
  message: { error: "admin_inbox_rate_limited" },
  keyGenerator: (req) => `admin-inbox:${(req.user as any)?.id ?? req.ip}`,
});

function userIsAdmin(user: any): boolean {
  return isAdmin(user?.roles ?? user?.role);
}

function requireAdmin(req: any, res: any, next: any) {
  if (!userIsAdmin(req.user)) {
    return res.status(403).json({ error: "Admin inbox access required" });
  }
  next();
}

function isMissingRelationError(err: unknown): boolean {
  const candidate = err as { code?: string; cause?: { code?: string } } | null;
  return candidate?.code === "42P01" || candidate?.cause?.code === "42P01";
}

async function listAdminUserIds(): Promise<number[]> {
  try {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .leftJoin(userRoles, eq(userRoles.userId, users.id))
      .where(
        or(
          inArray(users.role, ["admin", "host", "cohost"]),
          inArray(userRoles.role, ["admin", "host", "cohost"])
        )
      );
    return Array.from(new Set(rows.map((row) => row.id)));
  } catch (err) {
    if (!isMissingRelationError(err)) throw err;
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.role, ["admin", "host", "cohost"]));
    return rows.map((row) => row.id);
  }
}

type AttachmentView = {
  mediaId: number;
  name: string;
  mimeType: string;
  size: number | null;
  url: string;
};

type ReplyView = {
  id: number;
  senderUserId: number;
  senderKind: "admin" | "user";
  senderUsername: string;
  senderDisplayName: string | null;
  body: string;
  createdAt: string;
};

async function validatedAttachments(userId: number, ids: number[]): Promise<AttachmentView[]> {
  const orderedIds = Array.from(new Set(ids));
  if (orderedIds.length === 0) return [];
  const rows = await db
    .select({
      id: userMediaLibrary.id,
      name: userMediaLibrary.originalFilename,
      title: userMediaLibrary.title,
      mimeType: userMediaLibrary.mimeType,
      size: userMediaLibrary.fileSizeBytes,
      sourceType: userMediaLibrary.sourceType,
      status: userMediaLibrary.status,
    })
    .from(userMediaLibrary)
    .where(
      and(
        eq(userMediaLibrary.ownerUserId, userId),
        inArray(userMediaLibrary.id, orderedIds)
      )
    );

  const byId = new Map(rows.map((row) => [row.id, row]));
  return orderedIds.map((id) => {
    const row = byId.get(id);
    if (
      !row ||
      row.sourceType !== "upload" ||
      row.status !== "ready" ||
      !row.mimeType.toLowerCase().startsWith("image/")
    ) {
      throw new Error("invalid_admin_inbox_attachment");
    }
    return {
      mediaId: row.id,
      name: row.name || row.title || `Screenshot ${row.id}`,
      mimeType: row.mimeType,
      size: row.size ?? null,
      url: `/api/media/${row.id}/file`,
    };
  });
}

function clean(value: unknown, fallback = "Not provided"): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function markdownCell(value: unknown): string {
  return clean(value).replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function serializeMessage(row: any, attachments: AttachmentView[], replies: ReplyView[] = []) {
  const senderName = row.senderDisplayName || row.senderUsername || `User ${row.senderUserId}`;
  const senderAddress = row.senderEmail || `${row.senderUsername || `user-${row.senderUserId}`}@wtfos.app`;
  const createdAt = row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt);
  const rawFields = [
    { field: "Message ID", value: String(row.id) },
    { field: "Type", value: row.kind },
    { field: "Subject", value: row.subject },
    { field: "Reporter", value: senderName },
    { field: "Reporter username", value: row.senderUsername || "" },
    { field: "Reporter user ID", value: String(row.senderUserId) },
    { field: "Reporter email", value: row.senderEmail || "" },
    { field: "Message", value: row.message },
    { field: "Evidence", value: row.evidence || "" },
    { field: "Reproduction steps", value: row.reproductionSteps || "" },
    { field: "Expected outcome", value: row.expectedOutcome || "" },
    { field: "Impact", value: row.impact || "" },
    { field: "App route", value: row.routePath || "" },
    { field: "Client URL", value: row.clientUrl || "" },
    { field: "Submitted at", value: createdAt },
    { field: "Screenshot count", value: String(attachments.length) },
  ];
  const conversationMarkdown = replies.length
    ? replies
        .map(
          (reply) =>
            `### ${reply.senderKind === "admin" ? "Admin" : "User"} reply — ${reply.senderDisplayName || reply.senderUsername} — ${reply.createdAt}\n\n${reply.body}`
        )
        .join("\n\n")
    : "No replies yet.";
  const attachmentMarkdown = attachments.length
    ? attachments.map((item) => `- [${item.name}](${item.url}) (${item.mimeType})`).join("\n")
    : "- No screenshots attached";
  const rawTable = rawFields
    .map((item) => `| ${markdownCell(item.field)} | ${markdownCell(item.value)} |`)
    .join("\n");

  const email = [
    `From: ${senderName} <${senderAddress}>`,
    "To: WTF OS administrators",
    `Subject: [${String(row.kind).toUpperCase()}] ${row.subject}`,
    `Date: ${createdAt}`,
    `X-WTFOS-Admin-Inbox-ID: ${row.id}`,
    "",
    row.message,
    "",
    `Evidence: ${clean(row.evidence)}`,
    `Reproduction steps: ${clean(row.reproductionSteps)}`,
    `Expected outcome: ${clean(row.expectedOutcome)}`,
    `Impact: ${clean(row.impact)}`,
    `App route: ${clean(row.routePath)}`,
    "",
    `Screenshots: ${attachments.length}`,
    ...attachments.map((item) => `- ${item.name}: ${item.url}`),
  ].join("\n");

  const agentMarkdown = [
    `# Admin inbox message ${row.id}: ${row.subject}`,
    "",
    "## Triage snapshot",
    `- **Type:** ${row.kind}`,
    `- **Reporter:** ${senderName} (@${row.senderUsername || "unknown"}, user ${row.senderUserId})`,
    `- **Submitted:** ${createdAt}`,
    `- **Status:** ${row.status}`,
    `- **Context:** ${clean(row.routePath)}`,
    "",
    "## Message",
    row.message,
    "",
    "## Evidence supplied by the reporter",
    clean(row.evidence),
    "",
    "## Reproduction steps",
    clean(row.reproductionSteps),
    "",
    "## Expected outcome",
    clean(row.expectedOutcome),
    "",
    "## Reported impact",
    clean(row.impact),
    "",
    "## Screenshot attachments",
    attachmentMarkdown,
    "",
    "## Conversation",
    conversationMarkdown,
    "",
    "## Raw form data",
    "| Field | Value |",
    "| --- | --- |",
    rawTable,
  ].join("\n");

  return {
    id: row.id,
    kind: row.kind,
    subject: row.subject,
    message: row.message,
    status: row.status,
    sender: {
      id: row.senderUserId,
      username: row.senderUsername,
      displayName: row.senderDisplayName,
      email: row.senderEmail,
    },
    routePath: row.routePath,
    createdAt,
    readAt: row.readAt,
    readByUserId: row.readByUserId,
    senderReadAt: row.senderReadAt,
    attachments,
    replies,
    rawFields,
    email,
    agentMarkdown,
  };
}

async function repliesForMessages(messageIds: number[]): Promise<Map<number, ReplyView[]>> {
  if (messageIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: adminInboxReplies.id,
      messageId: adminInboxReplies.messageId,
      senderUserId: adminInboxReplies.senderUserId,
      senderKind: adminInboxReplies.senderKind,
      senderUsername: users.username,
      senderDisplayName: users.displayName,
      body: adminInboxReplies.body,
      createdAt: adminInboxReplies.createdAt,
    })
    .from(adminInboxReplies)
    .innerJoin(users, eq(users.id, adminInboxReplies.senderUserId))
    .where(inArray(adminInboxReplies.messageId, messageIds))
    .orderBy(asc(adminInboxReplies.createdAt));
  const grouped = new Map<number, ReplyView[]>();
  for (const row of rows) {
    const list = grouped.get(row.messageId) ?? [];
    list.push({
      id: row.id,
      senderUserId: row.senderUserId,
      senderKind: row.senderKind === "admin" ? "admin" : "user",
      senderUsername: row.senderUsername,
      senderDisplayName: row.senderDisplayName,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
    });
    grouped.set(row.messageId, list);
  }
  return grouped;
}

async function attachmentViewsForRows(rows: any[]): Promise<Map<number, AttachmentView>> {
  const ids = Array.from(
    new Set(rows.flatMap((row) => (Array.isArray(row.attachmentMediaIds) ? row.attachmentMediaIds : [])))
  ).filter((id): id is number => Number.isInteger(id));
  if (ids.length === 0) return new Map();
  const media = await db
    .select({
      id: userMediaLibrary.id,
      name: userMediaLibrary.originalFilename,
      title: userMediaLibrary.title,
      mimeType: userMediaLibrary.mimeType,
      size: userMediaLibrary.fileSizeBytes,
    })
    .from(userMediaLibrary)
    .where(inArray(userMediaLibrary.id, ids));
  return new Map(
    media.map((row) => [
      row.id,
      {
        mediaId: row.id,
        name: row.name || row.title || `Screenshot ${row.id}`,
        mimeType: row.mimeType,
        size: row.size ?? null,
        url: `/api/media/${row.id}/file`,
      },
    ])
  );
}

router.post("/api/admin-inbox/messages", isAuthenticated, submitRateLimit, async (req, res) => {
  if (userIsAdmin(req.user)) {
    return res.status(403).json({ error: "Admin accounts read this inbox instead of submitting to it" });
  }
  const parsed = submissionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid admin inbox message", issues: parsed.error.issues });
  }

  try {
    const user = req.user as any;
    const attachments = await validatedAttachments(user.id, parsed.data.attachmentMediaIds);
    const [created] = await db
      .insert(adminInboxMessages)
      .values({
        senderUserId: user.id,
        kind: parsed.data.kind,
        subject: parsed.data.subject,
        message: parsed.data.message,
        evidence: parsed.data.evidence,
        reproductionSteps: parsed.data.reproductionSteps,
        expectedOutcome: parsed.data.expectedOutcome,
        impact: parsed.data.impact,
        routePath: parsed.data.routePath,
        clientUrl: parsed.data.clientUrl,
        attachmentMediaIds: attachments.map((item) => item.mediaId),
      })
      .returning();

    const adminIds = await listAdminUserIds();

    await ingestSystemEvent({
      eventId: `admin_inbox.message.created:${created.id}`,
      eventType: "admin_inbox.message.created",
      userId: user.id,
      source: "desktop",
      sourceModule: "admin-inbox",
      rawRefType: "admin_inbox_message",
      rawRefId: created.id,
      metadata: { kind: created.kind, attachmentCount: attachments.length },
    });

    res.status(201).json({
      ok: true,
      messageId: created.id,
      adminRecipients: adminIds.length,
      attachmentCount: attachments.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "invalid_admin_inbox_attachment") {
      return res.status(400).json({ error: "One or more screenshots are unavailable or invalid" });
    }
    console.error("[admin-inbox] submission failed", err);
    res.status(500).json({ error: "Failed to deliver message to administrators" });
  }
});

router.get("/api/admin-inbox/messages", isAuthenticated, requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const rows = await db
      .select({
        id: adminInboxMessages.id,
        senderUserId: adminInboxMessages.senderUserId,
        senderUsername: users.username,
        senderDisplayName: users.displayName,
        senderEmail: users.email,
        kind: adminInboxMessages.kind,
        subject: adminInboxMessages.subject,
        message: adminInboxMessages.message,
        evidence: adminInboxMessages.evidence,
        reproductionSteps: adminInboxMessages.reproductionSteps,
        expectedOutcome: adminInboxMessages.expectedOutcome,
        impact: adminInboxMessages.impact,
        routePath: adminInboxMessages.routePath,
        clientUrl: adminInboxMessages.clientUrl,
        attachmentMediaIds: adminInboxMessages.attachmentMediaIds,
        status: adminInboxMessages.status,
        senderReadAt: adminInboxMessages.senderReadAt,
        readAt: adminInboxMessages.readAt,
        readByUserId: adminInboxMessages.readByUserId,
        createdAt: adminInboxMessages.createdAt,
      })
      .from(adminInboxMessages)
      .innerJoin(users, eq(users.id, adminInboxMessages.senderUserId))
      .orderBy(desc(adminInboxMessages.createdAt))
      .limit(limit);
    const attachments = await attachmentViewsForRows(rows);
    const replies = await repliesForMessages(rows.map((row) => row.id));
    res.json({
      messages: rows.map((row) =>
        serializeMessage(
          row,
          (row.attachmentMediaIds || [])
            .map((id) => attachments.get(id))
            .filter((item): item is AttachmentView => Boolean(item)),
          replies.get(row.id) ?? []
        )
      ),
      unreadCount: rows.filter((row) => row.status === "unread").length,
    });
  } catch (err) {
    console.error("[admin-inbox] list failed", err);
    res.status(500).json({ error: "Failed to load admin inbox" });
  }
});

router.get("/api/admin-inbox/threads", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    if (userIsAdmin(user)) return requireAdmin(req, res, () => {
      res.redirect(307, "/api/admin-inbox/messages");
    });
    const rows = await db
      .select({
        id: adminInboxMessages.id,
        senderUserId: adminInboxMessages.senderUserId,
        senderUsername: users.username,
        senderDisplayName: users.displayName,
        senderEmail: users.email,
        kind: adminInboxMessages.kind,
        subject: adminInboxMessages.subject,
        message: adminInboxMessages.message,
        evidence: adminInboxMessages.evidence,
        reproductionSteps: adminInboxMessages.reproductionSteps,
        expectedOutcome: adminInboxMessages.expectedOutcome,
        impact: adminInboxMessages.impact,
        routePath: adminInboxMessages.routePath,
        clientUrl: adminInboxMessages.clientUrl,
        attachmentMediaIds: adminInboxMessages.attachmentMediaIds,
        status: adminInboxMessages.status,
        senderReadAt: adminInboxMessages.senderReadAt,
        readAt: adminInboxMessages.readAt,
        readByUserId: adminInboxMessages.readByUserId,
        createdAt: adminInboxMessages.createdAt,
      })
      .from(adminInboxMessages)
      .innerJoin(users, eq(users.id, adminInboxMessages.senderUserId))
      .where(eq(adminInboxMessages.senderUserId, user.id))
      .orderBy(desc(adminInboxMessages.createdAt))
      .limit(100);
    const attachments = await attachmentViewsForRows(rows);
    const replies = await repliesForMessages(rows.map((row) => row.id));
    const serialized = rows.map((row) =>
      serializeMessage(
        row,
        (row.attachmentMediaIds || [])
          .map((id) => attachments.get(id))
          .filter((item): item is AttachmentView => Boolean(item)),
        replies.get(row.id) ?? []
      )
    );
    const unreadCount = serialized.filter((thread) =>
      thread.replies.some(
        (reply) =>
          reply.senderKind === "admin" &&
          new Date(reply.createdAt).getTime() > new Date(thread.senderReadAt || 0).getTime()
      )
    ).length;
    res.json({ messages: serialized, unreadCount });
  } catch (err) {
    console.error("[admin-inbox] user threads failed", err);
    res.status(500).json({ error: "Failed to load admin conversations" });
  }
});

router.post("/api/admin-inbox/messages/:id/replies", isAuthenticated, async (req, res) => {
  const parsed = replySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid reply" });
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid message id" });
    const user = req.user as any;
    const [thread] = await db
      .select({ id: adminInboxMessages.id, senderUserId: adminInboxMessages.senderUserId, subject: adminInboxMessages.subject })
      .from(adminInboxMessages)
      .where(eq(adminInboxMessages.id, id))
      .limit(1);
    if (!thread) return res.status(404).json({ error: "Message not found" });
    const senderKind = userIsAdmin(user) ? "admin" : "user";
    if (senderKind === "user" && thread.senderUserId !== user.id) {
      return res.status(403).json({ error: "Not authorized for this conversation" });
    }
    const [reply] = await db
      .insert(adminInboxReplies)
      .values({ messageId: id, senderUserId: user.id, senderKind, body: parsed.data.body })
      .returning();

    if (senderKind === "admin") {
      await db
        .update(adminInboxMessages)
        .set({ status: "read", readAt: new Date(), readByUserId: user.id, senderReadAt: null, updatedAt: new Date() })
        .where(eq(adminInboxMessages.id, id));
    } else {
      await db
        .update(adminInboxMessages)
        .set({ status: "unread", readAt: null, readByUserId: null, senderReadAt: new Date(), updatedAt: new Date() })
        .where(eq(adminInboxMessages.id, id));
    }
    await ingestSystemEvent({
      eventId: `admin_inbox.reply.created:${reply.id}`,
      eventType: "admin_inbox.reply.created",
      userId: user.id,
      source: "desktop",
      sourceModule: "admin-inbox",
      rawRefType: "admin_inbox_reply",
      rawRefId: reply.id,
      metadata: { messageId: id, senderKind },
    });
    res.status(201).json({ ok: true, replyId: reply.id });
  } catch (err) {
    console.error("[admin-inbox] reply failed", err);
    res.status(500).json({ error: "Failed to send reply" });
  }
});

router.patch("/api/admin-inbox/messages/:id/user-read", isAuthenticated, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user as any;
    if (userIsAdmin(user)) return res.status(403).json({ error: "Use the admin read endpoint" });
    const [updated] = await db
      .update(adminInboxMessages)
      .set({ senderReadAt: new Date(), updatedAt: new Date() })
      .where(and(eq(adminInboxMessages.id, id), eq(adminInboxMessages.senderUserId, user.id)))
      .returning({ id: adminInboxMessages.id });
    if (!updated) return res.status(404).json({ error: "Message not found" });
    res.json({ ok: true, id });
  } catch (err) {
    console.error("[admin-inbox] user read update failed", err);
    res.status(500).json({ error: "Failed to mark conversation read" });
  }
});

router.patch("/api/admin-inbox/messages/:id/read", isAuthenticated, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid message id" });
    const user = req.user as any;
    const [updated] = await db
      .update(adminInboxMessages)
      .set({ status: "read", readAt: new Date(), readByUserId: user.id, updatedAt: new Date() })
      .where(eq(adminInboxMessages.id, id))
      .returning({ id: adminInboxMessages.id });
    if (!updated) return res.status(404).json({ error: "Message not found" });
    await ingestSystemEvent({
      eventId: `admin_inbox.message.read:${id}:${user.id}`,
      eventType: "admin_inbox.message.read",
      userId: user.id,
      source: "desktop",
      sourceModule: "admin-inbox",
      rawRefType: "admin_inbox_message",
      rawRefId: id,
    });
    res.json({ ok: true, id });
  } catch (err) {
    console.error("[admin-inbox] read update failed", err);
    res.status(500).json({ error: "Failed to mark message read" });
  }
});

export default router;
