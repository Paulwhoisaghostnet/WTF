import { Router } from "express";
import { z } from "zod";
import { asc, eq, or, sql } from "drizzle-orm";
import { isAuthenticated } from "../auth/passport";
import { db } from "../db";
import {
  boardThreadReplies,
  boardThreads,
  users,
  userRoles,
} from "@shared/schema";
import { createNotificationsForUsers } from "../lib/notifications";
import { ingestSystemEvent } from "../challenges/events/ingest";
import { publishCommunicationItem } from "../features/comms/publisher";

const router = Router();

const BUG_REPORTS_CHANNEL_TITLE = "bug reports";
const MAX_BODY_FIELD = 4_000;

const optionalText = (max = MAX_BODY_FIELD) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null));

const bugReportSchema = z
  .object({
    summary: z.string().trim().min(4).max(180),
    details: z.string().trim().min(4).max(MAX_BODY_FIELD),
    expected: optionalText(),
    steps: optionalText(),
    severity: z.enum(["bug", "papercut", "broken", "security"]).default("bug"),
    routePath: optionalText(400),
    windowTitle: optionalText(180),
    surfaceId: optionalText(120),
    surfaceLabel: optionalText(180),
    domain: optionalText(120),
    subdomain: optionalText(180),
    clientUrl: optionalText(1_000),
    userAgent: optionalText(500),
    viewport: z
      .object({
        width: z.number().int().positive().max(10_000).optional(),
        height: z.number().int().positive().max(10_000).optional(),
      })
      .optional()
      .nullable(),
  })
  .strict();

function isMissingRelationError(err: unknown): boolean {
  const candidate = err as { code?: string; cause?: { code?: string } } | null;
  return candidate?.code === "42P01" || candidate?.cause?.code === "42P01";
}

function compact(value: string | null | undefined, fallback = "n/a"): string {
  const text = String(value || "").trim();
  return text || fallback;
}

function reportField(label: string, value: string | null | undefined): string | null {
  const text = String(value || "").trim();
  if (!text) return null;
  return `### ${label}\n${text}`;
}

async function listAdminUserIds(): Promise<number[]> {
  try {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .leftJoin(userRoles, eq(userRoles.userId, users.id))
      .where(or(eq(users.role, "admin"), eq(userRoles.role, "admin")));
    return Array.from(new Set(rows.map((row) => row.id)));
  } catch (err) {
    if (!isMissingRelationError(err)) throw err;
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"));
    return rows.map((row) => row.id);
  }
}

async function ensureBugReportsChannel(creatorUserId: number) {
  const [existing] = await db
    .select()
    .from(boardThreads)
    .where(sql`lower(${boardThreads.title}) = ${BUG_REPORTS_CHANNEL_TITLE}`)
    .orderBy(asc(boardThreads.id))
    .limit(1);

  if (existing) return existing;

  const [channel] = await db
    .insert(boardThreads)
    .values({
      title: BUG_REPORTS_CHANNEL_TITLE,
      body: "System-filed bug reports from wtfOS app windows.",
      createdBy: creatorUserId,
      channelType: "text",
      topic: "Bug reports filed from app-window ant controls",
      position: 0,
      slowModeSeconds: 0,
      viewRoles: ["admin"],
      replyRoles: ["admin"],
      active: true,
      pinned: true,
    })
    .returning();

  return channel;
}

function buildReportBody(input: z.infer<typeof bugReportSchema>, user: any): string {
  const reporter =
    user?.displayName || user?.username
      ? `${user.displayName || user.username} (#${user.id})`
      : `User #${user.id}`;
  const surfaceLabel = compact(input.surfaceLabel || input.windowTitle, "Unknown surface");
  const domain = compact(input.domain, "WTF OS");
  const subdomain = compact(input.subdomain || input.windowTitle, "App window");
  const viewport =
    input.viewport?.width && input.viewport?.height
      ? `${input.viewport.width}x${input.viewport.height}`
      : "n/a";

  return [
    `## Bug report: ${input.summary}`,
    `- Surface: ${surfaceLabel}`,
    `- Domain: ${domain}`,
    `- Subdomain: ${subdomain}`,
    `- Route: ${compact(input.routePath)}`,
    `- Severity: ${input.severity}`,
    `- Reporter: ${reporter}`,
    `- Reported at: ${new Date().toISOString()}`,
    `- Client URL: ${compact(input.clientUrl)}`,
    `- Viewport: ${viewport}`,
    "",
    reportField("What happened", input.details),
    reportField("Expected", input.expected),
    reportField("Reproduction notes", input.steps),
    reportField("Browser", input.userAgent),
  ]
    .filter(Boolean)
    .join("\n\n");
}

router.post("/api/system/bug-reports", isAuthenticated, async (req, res) => {
  const parsed = bugReportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid bug report payload" });
  }

  try {
    const user = req.user as any;
    const adminIds = await listAdminUserIds();
    const channel = await ensureBugReportsChannel(adminIds[0] ?? user.id);
    const input = parsed.data;
    const content = buildReportBody(input, user);

    const [message] = await db
      .insert(boardThreadReplies)
      .values({
        threadId: channel.id,
        userId: user.id,
        content,
        attachments: [],
      })
      .returning();

    await db
      .update(boardThreads)
      .set({ updatedAt: new Date() })
      .where(eq(boardThreads.id, channel.id));

    const routePath = `/messageboard?channel=${channel.id}&message=${message.id}`;
    const surfaceLabel = compact(input.surfaceLabel || input.windowTitle, "Unknown surface");
    const domain = compact(input.domain, "WTF OS");
    const subdomain = compact(input.subdomain || input.windowTitle, "App window");
    const metadata = {
      bugReportId: message.id,
      boardChannelId: channel.id,
      routePath: input.routePath ?? null,
      windowTitle: input.windowTitle ?? null,
      surfaceId: input.surfaceId ?? null,
      surfaceLabel,
      domain,
      subdomain,
      severity: input.severity,
    };

    await ingestSystemEvent({
      eventId: `bug_report.created:${message.id}`,
      eventType: "bug_report.created",
      userId: user.id,
      source: "desktop",
      sourceModule: "app-window-bug-reporter",
      rawRefType: "board_thread_reply",
      rawRefId: message.id,
      metadata,
    });

    await Promise.all(
      adminIds.map((adminId) =>
        publishCommunicationItem({
          sourceKey: "system",
          externalRef: `bug-report:${message.id}:admin:${adminId}`,
          itemKind: "system",
          title: `Bug report: ${input.summary}`,
          summary: `${surfaceLabel} - ${domain} / ${subdomain}`,
          body: content,
          authorLabel: user.displayName || user.username || "wtfOS user",
          targetUserId: adminId,
          routePath,
          thread: {
            externalThreadRef: "bug-reports",
            title: "Bug reports",
            routePath: "/messageboard",
            metadata: { channelId: channel.id },
          },
          metadata,
          occurredAt: message.createdAt,
        })
      )
    );

    await createNotificationsForUsers(adminIds, {
      eventKey: "bug_report.created",
      title: `Bug report: ${input.summary}`,
      body: `${surfaceLabel} - ${domain} / ${subdomain}`,
      sourceUserId: user.id,
      metadata: {
        ...metadata,
        boardRoutePath: routePath,
      },
    });

    res.status(201).json({
      ok: true,
      reportId: message.id,
      channelId: channel.id,
      routePath,
      adminRecipients: adminIds.length,
    });
  } catch (err) {
    console.error("[bug-reports] failed to file report:", err);
    res.status(500).json({ error: "Failed to file bug report" });
  }
});

export default router;
