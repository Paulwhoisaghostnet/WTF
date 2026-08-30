import type { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { requirePermission } from "../../auth/passport";
import { db } from "../../db";
import {
  boardThreads,
  calendarTickets,
  casinoPracticeGames,
  challenges,
  consoleGames,
  faqItems,
  inAppMarketItems,
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
          [storePendingCount],
          [arcadePendingCount],
          [casinoPendingCount],
          [calendarPendingCount],
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
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(inAppMarketItems)
            .where(sql`${inAppMarketItems.metadata}->>'source' = 'trusted_creator' AND COALESCE(${inAppMarketItems.metadata}->>'submissionStatus', 'submitted') = 'submitted'`),
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(consoleGames)
            .where(eq(consoleGames.status, "pending")),
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(casinoPracticeGames)
            .where(eq(casinoPracticeGames.status, "submitted")),
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(calendarTickets)
            .where(eq(calendarTickets.status, "submitted")),
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
          commissionQueue: [
            {
              id: "store",
              label: "Store",
              pending: storePendingCount.count,
              owner: "WTFIAM Market",
              destination: { kind: "admin-section", value: "in-app-market" },
            },
            {
              id: "arcade",
              label: "Arcade",
              pending: arcadePendingCount.count,
              owner: "Arcade moderation",
              destination: { kind: "admin-section", value: "arcade" },
            },
            {
              id: "casino",
              label: "Casino",
              pending: casinoPendingCount.count,
              owner: "Casino practice tables",
              destination: { kind: "route", value: "/casino" },
            },
            {
              id: "calendar",
              label: "Calendar",
              pending: calendarPendingCount.count,
              owner: "Control Board tickets",
              destination: { kind: "route", value: "/control-board" },
            },
          ],
        });
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch stats" });
      }
    }
  );
}
