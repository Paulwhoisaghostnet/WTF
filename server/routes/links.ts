import { Router } from "express";
import { db } from "../db";
import { links } from "@shared/schema";
import { eq, asc } from "drizzle-orm";
import { requireRole } from "../auth/passport";
import { classifyDbError } from "../errors/db-errors";

const router = Router();

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

router.post("/api/links", requireRole("host", "cohost"), async (req, res) => {
  try {
    const user = req.user as any;
    const [link] = await db
      .insert(links)
      .values({ ...req.body, createdBy: user.id })
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
  requireRole("host", "cohost"),
  async (req, res) => {
    try {
      const [updated] = await db
        .update(links)
        .set(req.body)
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
  requireRole("host"),
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
