import { Router } from "express";
import { db } from "../db";
import { faqItems } from "@shared/schema";
import { eq, asc } from "drizzle-orm";
import { requireRole } from "../auth/passport";
import { classifyDbError } from "../errors/db-errors";
import { z } from "zod";

const router = Router();

const faqCreateSchema = z
  .object({
    question: z.string().trim().min(1).max(10_000),
    answer: z.string().trim().min(1).max(50_000),
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

const faqUpdateSchema = faqCreateSchema.partial().strict();

router.get("/api/faq", async (_req, res) => {
  try {
    const all = await db
      .select()
      .from(faqItems)
      .orderBy(asc(faqItems.displayOrder));
    res.json(all);
  } catch (err) {
    console.error("Failed to fetch FAQ:", err);
    const classified = classifyDbError(err);
    if (classified) return res.status(classified.status).json(classified);
    res.status(500).json({ error: "Failed to fetch FAQ" });
  }
});

router.post("/api/faq", requireRole("admin", "host", "cohost"), async (req, res) => {
  try {
    const parsed = faqCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid FAQ payload" });
    }

    const [item] = await db
      .insert(faqItems)
      .values({
        question: parsed.data.question,
        answer: parsed.data.answer,
        category: parsed.data.category ?? null,
        displayOrder: parsed.data.displayOrder ?? 0,
      })
      .returning();
    res.status(201).json(item);
  } catch (err) {
    console.error("Failed to create FAQ item:", err);
    const classified = classifyDbError(err);
    if (classified) return res.status(classified.status).json(classified);
    res.status(500).json({ error: "Failed to create FAQ item" });
  }
});

router.put(
  "/api/faq/:id",
  requireRole("admin", "host", "cohost"),
  async (req, res) => {
    try {
      const parsed = faqUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid FAQ payload" });
      }
      if (Object.keys(parsed.data).length === 0) {
        return res.status(400).json({ error: "No updatable fields provided" });
      }

      const updates: Record<string, unknown> = {};
      if (parsed.data.question !== undefined) updates.question = parsed.data.question;
      if (parsed.data.answer !== undefined) updates.answer = parsed.data.answer;
      if (parsed.data.category !== undefined) updates.category = parsed.data.category;
      if (parsed.data.displayOrder !== undefined) {
        updates.displayOrder = parsed.data.displayOrder;
      }

      const [updated] = await db
        .update(faqItems)
        .set(updates)
        .where(eq(faqItems.id, parseInt(req.params.id as string)))
        .returning();
      if (!updated)
        return res.status(404).json({ error: "FAQ item not found" });
      res.json(updated);
    } catch (err) {
      console.error("Failed to update FAQ item:", err);
      const classified = classifyDbError(err);
      if (classified) return res.status(classified.status).json(classified);
      res.status(500).json({ error: "Failed to update FAQ item" });
    }
  }
);

router.delete(
  "/api/faq/:id",
  requireRole("admin", "host", "cohost"),
  async (req, res) => {
    try {
      await db.delete(faqItems).where(eq(faqItems.id, parseInt(req.params.id as string)));
      res.json({ ok: true });
    } catch (err) {
      console.error("Failed to delete FAQ item:", err);
      const classified = classifyDbError(err);
      if (classified) return res.status(classified.status).json(classified);
      res.status(500).json({ error: "Failed to delete FAQ item" });
    }
  }
);

export default router;
