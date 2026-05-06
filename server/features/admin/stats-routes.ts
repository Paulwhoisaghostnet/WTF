import type { Router } from "express";
import { sql } from "drizzle-orm";
import { requirePermission } from "../../auth/passport";
import { db } from "../../db";
import {
  boardThreads,
  challenges,
  faqItems,
  links,
  marketplaceListings,
  rounds,
  seasons,
  sideQuests,
  users,
} from "@shared/schema";

export function registerAdminStatsRoutes(router: Router) {
  router.get(
    "/api/admin/stats",
    requirePermission("access_admin_panel"),
    async (_req, res) => {
      try {
        const [
          [userCount],
          [seasonCount],
          [roundCount],
          [challengeCount],
          [questCount],
          [listingCount],
          [threadCount],
          [linkCount],
          [faqCount],
        ] = await Promise.all([
          db.select({ count: sql<number>`count(*)::int` }).from(users),
          db.select({ count: sql<number>`count(*)::int` }).from(seasons),
          db.select({ count: sql<number>`count(*)::int` }).from(rounds),
          db.select({ count: sql<number>`count(*)::int` }).from(challenges),
          db.select({ count: sql<number>`count(*)::int` }).from(sideQuests),
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(marketplaceListings),
          db.select({ count: sql<number>`count(*)::int` }).from(boardThreads),
          db.select({ count: sql<number>`count(*)::int` }).from(links),
          db.select({ count: sql<number>`count(*)::int` }).from(faqItems),
        ]);

        res.json({
          users: userCount.count,
          seasons: seasonCount.count,
          rounds: roundCount.count,
          challenges: challengeCount.count,
          sideQuests: questCount.count,
          listings: listingCount.count,
          threads: threadCount.count,
          links: linkCount.count,
          faq: faqCount.count,
        });
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch stats" });
      }
    }
  );
}
