import { Router } from "express";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { isAuthenticated } from "../auth/passport";
import { db } from "../db";
import { ingestSystemEvent } from "../challenges/events/ingest";
import { diaryEntries } from "@shared/schema";

const router = Router();

const tagsListSchema = z
  .array(z.string().trim().min(1).max(48))
  .max(30);

const crossRefsListSchema = z
  .array(z.number().int().positive())
  .max(40);

const entrySchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    body: z.string().max(50_000).optional().default(""),
    classification: z.string().trim().min(1).max(80).optional().default("general"),
    tags: tagsListSchema.optional().default([]),
    entryAt: z.string().datetime().optional(),
    crossRefs: crossRefsListSchema.optional().default([]),
  })
  .strict();

const entryPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(180).optional(),
    body: z.string().max(50_000).optional(),
    classification: z.string().trim().min(1).max(80).optional(),
    tags: tagsListSchema.optional(),
    entryAt: z.string().datetime().optional(),
    crossRefs: crossRefsListSchema.optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    { message: "No fields provided" }
  );

type DiaryEntryRow = typeof diaryEntries.$inferSelect;

function userIdFrom(req: any): number {
  return Number(req.user?.id);
}

function parseId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeTags(tags: string[] = []): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const tag of tags) {
    const value = tag.trim().replace(/\s+/g, " ").slice(0, 48);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    normalized.push(value);
  }
  return normalized.slice(0, 30);
}

function normalizeCrossRefs(ids: number[] = []): number[] {
  return Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0))).slice(0, 40);
}

function serializeEntry(row: DiaryEntryRow) {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    body: row.body,
    classification: row.classification,
    tags: Array.isArray(row.tags) ? row.tags : [],
    entryAt: row.entryAt.toISOString(),
    crossRefs: Array.isArray(row.crossRefs) ? row.crossRefs : [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function orderFor(sort: string | undefined) {
  switch (sort) {
    case "entry_asc":
      return [asc(diaryEntries.entryAt), asc(diaryEntries.id)];
    case "updated_desc":
      return [desc(diaryEntries.updatedAt), desc(diaryEntries.id)];
    case "title_asc":
      return [asc(diaryEntries.title), asc(diaryEntries.id)];
    case "entry_desc":
    default:
      return [desc(diaryEntries.entryAt), desc(diaryEntries.id)];
  }
}

function emitDiaryEvent(input: {
  eventType: "diary.index.viewed" | "diary.entry.created" | "diary.entry.updated" | "diary.entry.deleted";
  userId: number;
  entry?: DiaryEntryRow;
  metadata?: Record<string, unknown>;
}) {
  void ingestSystemEvent({
    eventType: input.eventType,
    userId: input.userId,
    source: "dear-diary",
    sourceModule: "diary",
    rawRefType: input.entry ? "diary_entry" : "diary",
    rawRefId: input.entry?.id ?? input.eventType,
    metadata: {
      entryId: input.entry?.id,
      classification: input.entry?.classification,
      tagCount: Array.isArray(input.entry?.tags) ? input.entry.tags.length : undefined,
      ...input.metadata,
    },
  });
}

router.get("/api/diary/entries", isAuthenticated, async (req, res) => {
  try {
    const userId = userIdFrom(req);
    const q = String(req.query.q ?? "").trim().slice(0, 160);
    const classification = String(req.query.classification ?? "").trim().slice(0, 80);
    const tag = String(req.query.tag ?? "").trim().slice(0, 48);
    const limit = Math.max(1, Math.min(150, Number(req.query.limit) || 100));
    const filters: SQL[] = [eq(diaryEntries.userId, userId)];

    if (classification) filters.push(eq(diaryEntries.classification, classification));
    if (tag) filters.push(sql`${diaryEntries.tags} ? ${tag}`);
    if (q) {
      filters.push(
        or(
          ilike(diaryEntries.title, `%${q}%`),
          ilike(diaryEntries.body, `%${q}%`),
          ilike(diaryEntries.classification, `%${q}%`)
        )!
      );
    }

    const rows = await db
      .select()
      .from(diaryEntries)
      .where(and(...filters))
      .orderBy(...orderFor(String(req.query.sort ?? "entry_desc")))
      .limit(limit);

    res.json({ entries: rows.map(serializeEntry) });
  } catch (err) {
    console.error("[diary] list failed", err);
    res.status(500).json({ error: "Could not load diary entries" });
  }
});

router.get("/api/diary/index", isAuthenticated, async (req, res) => {
  try {
    const userId = userIdFrom(req);
    const rows = await db
      .select()
      .from(diaryEntries)
      .where(eq(diaryEntries.userId, userId))
      .orderBy(desc(diaryEntries.entryAt))
      .limit(500);

    const classifications = new Map<string, number>();
    const tags = new Map<string, number>();
    const refs = new Map<number, number[]>();
    for (const row of rows) {
      classifications.set(row.classification, (classifications.get(row.classification) ?? 0) + 1);
      for (const tag of Array.isArray(row.tags) ? row.tags : []) {
        tags.set(tag, (tags.get(tag) ?? 0) + 1);
      }
      for (const refId of Array.isArray(row.crossRefs) ? row.crossRefs : []) {
        refs.set(refId, [...(refs.get(refId) ?? []), row.id]);
      }
    }

    emitDiaryEvent({
      eventType: "diary.index.viewed",
      userId,
      metadata: { entryCount: rows.length },
    });

    res.json({
      classifications: Array.from(classifications.entries()).map(([name, count]) => ({ name, count })),
      tags: Array.from(tags.entries()).map(([name, count]) => ({ name, count })),
      backlinks: Array.from(refs.entries()).map(([entryId, sourceIds]) => ({ entryId, sourceIds })),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[diary] index failed", err);
    res.status(500).json({ error: "Could not load diary index" });
  }
});

router.post("/api/diary/entries", isAuthenticated, async (req, res) => {
  const parsed = entrySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid diary entry" });
  }

  try {
    const userId = userIdFrom(req);
    const now = new Date();
    const [entry] = await db
      .insert(diaryEntries)
      .values({
        userId,
        title: parsed.data.title,
        body: parsed.data.body,
        classification: parsed.data.classification,
        tags: normalizeTags(parsed.data.tags),
        entryAt: parsed.data.entryAt ? new Date(parsed.data.entryAt) : now,
        crossRefs: normalizeCrossRefs(parsed.data.crossRefs),
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    emitDiaryEvent({ eventType: "diary.entry.created", userId, entry });
    res.status(201).json({ entry: serializeEntry(entry) });
  } catch (err) {
    console.error("[diary] create failed", err);
    res.status(500).json({ error: "Could not create diary entry" });
  }
});

router.patch("/api/diary/entries/:id", isAuthenticated, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid diary entry id" });

  const parsed = entryPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid diary entry" });
  }

  try {
    const userId = userIdFrom(req);
    const patch: Partial<typeof diaryEntries.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (parsed.data.title !== undefined) patch.title = parsed.data.title;
    if (parsed.data.body !== undefined) patch.body = parsed.data.body;
    if (parsed.data.classification !== undefined) patch.classification = parsed.data.classification;
    if (parsed.data.tags !== undefined) patch.tags = normalizeTags(parsed.data.tags);
    if (parsed.data.entryAt !== undefined) patch.entryAt = new Date(parsed.data.entryAt);
    if (parsed.data.crossRefs !== undefined) patch.crossRefs = normalizeCrossRefs(parsed.data.crossRefs);

    const [entry] = await db
      .update(diaryEntries)
      .set(patch)
      .where(and(eq(diaryEntries.id, id), eq(diaryEntries.userId, userId)))
      .returning();

    if (!entry) return res.status(404).json({ error: "Diary entry not found" });

    emitDiaryEvent({ eventType: "diary.entry.updated", userId, entry });
    res.json({ entry: serializeEntry(entry) });
  } catch (err) {
    console.error("[diary] update failed", err);
    res.status(500).json({ error: "Could not update diary entry" });
  }
});

router.delete("/api/diary/entries/:id", isAuthenticated, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid diary entry id" });

  try {
    const userId = userIdFrom(req);
    const [entry] = await db
      .delete(diaryEntries)
      .where(and(eq(diaryEntries.id, id), eq(diaryEntries.userId, userId)))
      .returning();

    if (!entry) return res.status(404).json({ error: "Diary entry not found" });

    emitDiaryEvent({ eventType: "diary.entry.deleted", userId, entry });
    res.json({ ok: true });
  } catch (err) {
    console.error("[diary] delete failed", err);
    res.status(500).json({ error: "Could not delete diary entry" });
  }
});

export default router;
