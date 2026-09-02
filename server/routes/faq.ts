import { Router } from "express";
import { db } from "../db";
import { faqItems } from "@shared/schema";
import { eq, asc } from "drizzle-orm";
import { requirePermission } from "../auth/passport";
import { classifyDbError } from "../errors/db-errors";
import { z } from "zod";
import {
  findFaqTutorial,
  getPublicFaqTutorialCatalog,
  serveFaqTutorialAsset,
  type FaqTutorialAssetKind,
} from "../lib/faq-tutorials";
import {
  findWtfosPromo,
  getPublicWtfosPromoCatalog,
  serveWtfosPromoAsset,
} from "../lib/wtfos-promos";

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

router.get("/api/faq/tutorials", (_req, res) => {
  res.json(getPublicFaqTutorialCatalog());
});

router.get("/api/faq/promos", (_req, res) => {
  res.json(getPublicWtfosPromoCatalog());
});

router.get("/api/faq/promos/:slug/:asset", async (req, res) => {
  const promo = findWtfosPromo(String(req.params.slug || ""));
  const asset = String(req.params.asset || "") as FaqTutorialAssetKind;
  if (!promo || !["video", "captions", "poster"].includes(asset)) {
    return res.status(404).json({ error: "Promo asset not found" });
  }
  try {
    await serveWtfosPromoAsset({ req, res, promo, kind: asset });
  } catch (error) {
    console.error("Failed to serve wtfOS promo asset:", error);
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("faq_tutorial_storage_unconfigured")) {
      return res.status(503).json({ error: "Promo storage is not configured" });
    }
    if (/NoSuchKey|not found|404/i.test(message)) {
      return res.status(404).json({ error: "Promo asset has not been published" });
    }
    return res.status(502).json({ error: "Failed to load promo asset" });
  }
});

router.get("/api/faq/tutorials/:slug/:asset", async (req, res) => {
  const tutorial = findFaqTutorial(String(req.params.slug || ""));
  const asset = String(req.params.asset || "") as FaqTutorialAssetKind;
  if (!tutorial || !["video", "captions", "poster"].includes(asset)) {
    return res.status(404).json({ error: "Tutorial asset not found" });
  }
  try {
    await serveFaqTutorialAsset({ req, res, tutorial, kind: asset });
  } catch (error) {
    console.error("Failed to serve FAQ tutorial asset:", error);
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("faq_tutorial_storage_unconfigured")) {
      return res.status(503).json({ error: "Tutorial storage is not configured" });
    }
    if (/NoSuchKey|not found|404/i.test(message)) {
      return res.status(404).json({ error: "Tutorial asset has not been published" });
    }
    return res.status(502).json({ error: "Failed to load tutorial asset" });
  }
});

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

router.post("/api/faq", requirePermission("manage_content"), async (req, res) => {
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
  requirePermission("manage_content"),
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
  requirePermission("manage_content"),
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
