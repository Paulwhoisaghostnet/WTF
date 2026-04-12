import { Router } from "express";
import { db } from "../db";
import { links } from "@shared/schema";
import { eq, asc } from "drizzle-orm";
import { requireRole } from "../auth/passport";
import { classifyDbError } from "../errors/db-errors";
import { z } from "zod";

const router = Router();

const httpUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }, "Invalid URL protocol");

const linkCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    url: httpUrlSchema,
    description: z
      .string()
      .trim()
      .max(10_000)
      .optional()
      .nullable()
      .transform((value) => (value ? value : null)),
    category: z
      .string()
      .trim()
      .max(100)
      .optional()
      .nullable()
      .transform((value) => (value ? value : null)),
    displayOrder: z.coerce.number().int().min(0).max(1_000_000).optional(),
  })
  .strict();

const linkUpdateSchema = linkCreateSchema.partial().strict();

router.get("/api/links", async (_req, res) => {
  try {
    const all = await db.select().from(links).orderBy(asc(links.displayOrder));
    res.json(all);
  } catch (err) {
    console.error("Failed to fetch links:", err);
    const classified = classifyDbError(err);
    if (classified) return res.status(classified.status).json(classified);
    res.status(500).json({ error: "Failed to fetch links" });
  }
});

router.post("/api/links", requireRole("admin", "host", "cohost"), async (req, res) => {
  try {
    const user = req.user as any;
    const parsed = linkCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid link payload" });
    }
    const [link] = await db
      .insert(links)
      .values({
        title: parsed.data.title,
        url: parsed.data.url,
        description: parsed.data.description ?? null,
        category: parsed.data.category ?? null,
        displayOrder: parsed.data.displayOrder ?? 0,
        createdBy: user.id,
      })
      .returning();
    res.status(201).json(link);
  } catch (err) {
    console.error("Failed to create link:", err);
    const classified = classifyDbError(err);
    if (classified) return res.status(classified.status).json(classified);
    res.status(500).json({ error: "Failed to create link" });
  }
});

router.put(
  "/api/links/:id",
  requireRole("admin", "host", "cohost"),
  async (req, res) => {
    try {
      const parsed = linkUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid link payload" });
      }
      if (Object.keys(parsed.data).length === 0) {
        return res.status(400).json({ error: "No updatable fields provided" });
      }

      const updates: Record<string, unknown> = {};
      if (parsed.data.title !== undefined) updates.title = parsed.data.title;
      if (parsed.data.url !== undefined) updates.url = parsed.data.url;
      if (parsed.data.description !== undefined) {
        updates.description = parsed.data.description;
      }
      if (parsed.data.category !== undefined) updates.category = parsed.data.category;
      if (parsed.data.displayOrder !== undefined) {
        updates.displayOrder = parsed.data.displayOrder;
      }

      const [updated] = await db
        .update(links)
        .set(updates)
        .where(eq(links.id, parseInt(req.params.id as string)))
        .returning();
      if (!updated) return res.status(404).json({ error: "Link not found" });
      res.json(updated);
    } catch (err) {
      console.error("Failed to update link:", err);
      const classified = classifyDbError(err);
      if (classified) return res.status(classified.status).json(classified);
      res.status(500).json({ error: "Failed to update link" });
    }
  }
);

router.delete(
  "/api/links/:id",
  requireRole("admin", "host", "cohost"),
  async (req, res) => {
    try {
      await db.delete(links).where(eq(links.id, parseInt(req.params.id as string)));
      res.json({ ok: true });
    } catch (err) {
      console.error("Failed to delete link:", err);
      const classified = classifyDbError(err);
      if (classified) return res.status(classified.status).json(classified);
      res.status(500).json({ error: "Failed to delete link" });
    }
  }
);

export default router;
