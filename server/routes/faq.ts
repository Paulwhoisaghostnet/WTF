import { Router } from "express";
import { db } from "../db";
import { faqItems } from "@shared/schema";
import { eq, asc } from "drizzle-orm";
import { requireRole } from "../auth/passport";

const router = Router();

router.get("/api/faq", async (_req, res) => {
  try {
    const all = await db
      .select()
      .from(faqItems)
      .orderBy(asc(faqItems.displayOrder));
    res.json(all);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch FAQ" });
  }
});

router.post("/api/faq", requireRole("host", "cohost"), async (req, res) => {
  try {
    const [item] = await db.insert(faqItems).values(req.body).returning();
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: "Failed to create FAQ item" });
  }
});

router.put(
  "/api/faq/:id",
  requireRole("host", "cohost"),
  async (req, res) => {
    try {
      const [updated] = await db
        .update(faqItems)
        .set(req.body)
        .where(eq(faqItems.id, parseInt(req.params.id as string)))
        .returning();
      if (!updated)
        return res.status(404).json({ error: "FAQ item not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to update FAQ item" });
    }
  }
);

router.delete(
  "/api/faq/:id",
  requireRole("host"),
  async (req, res) => {
    try {
      await db.delete(faqItems).where(eq(faqItems.id, parseInt(req.params.id as string)));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete FAQ item" });
    }
  }
);

export default router;
