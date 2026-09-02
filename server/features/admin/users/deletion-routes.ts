import type { Router } from "express";
import { eq } from "drizzle-orm";
import { requirePermission } from "../../../auth/passport";
import { db as defaultDb } from "../../../db";
import {
  boardThreads,
  challengeSubmissions,
  challenges,
  channels,
  dmConversations,
  links,
  marketplaceBids,
  marketplaceListings,
  messages,
  rewardLedger,
  seasons,
  sideQuestCompletions,
  sideQuests,
  users,
  xpEvents,
} from "@shared/schema";

export interface AdminUserDeletionRouteDeps {
  db: typeof defaultDb;
  requirePermission: typeof requirePermission;
}

export const defaultAdminUserDeletionRouteDeps: AdminUserDeletionRouteDeps = {
  db: defaultDb,
  requirePermission,
};

export function registerAdminUserDeletionRoutes(
  router: Router,
  deps: AdminUserDeletionRouteDeps = defaultAdminUserDeletionRouteDeps
) {
  const { db, requirePermission } = deps;

  router.delete(
    "/api/admin/users/:id",
    requirePermission("delete_users"),
    async (req, res) => {
      try {
        const actor = req.user as any;
        const targetId = parseInt(req.params.id as string);

        if (targetId === actor.id) {
          return res.status(400).json({ error: "Cannot delete yourself" });
        }

        const [target] = await db
          .select({ id: users.id, role: users.role, username: users.username })
          .from(users)
          .where(eq(users.id, targetId));

        if (!target) {
          return res.status(404).json({ error: "User not found" });
        }

        if (
          (target.role === "admin" || target.role === "host") &&
          actor.role !== "admin"
        ) {
          return res
            .status(403)
            .json({ error: "Only admins can delete admin/host users" });
        }

        await db.transaction(async (tx) => {
          await tx
            .update(challengeSubmissions)
            .set({ gradedBy: null })
            .where(eq(challengeSubmissions.gradedBy, targetId));
          await tx
            .update(seasons)
            .set({ createdBy: null })
            .where(eq(seasons.createdBy, targetId));
          await tx
            .update(challenges)
            .set({ createdBy: null })
            .where(eq(challenges.createdBy, targetId));
          await tx
            .update(channels)
            .set({ createdBy: null })
            .where(eq(channels.createdBy, targetId));
          await tx
            .update(sideQuests)
            .set({ createdBy: null })
            .where(eq(sideQuests.createdBy, targetId));
          await tx
            .update(sideQuestCompletions)
            .set({ approvedBy: null })
            .where(eq(sideQuestCompletions.approvedBy, targetId));
          await tx
            .update(links)
            .set({ createdBy: null })
            .where(eq(links.createdBy, targetId));
          await tx
            .update(dmConversations)
            .set({ createdBy: null })
            .where(eq(dmConversations.createdBy, targetId));
          await tx
            .update(xpEvents)
            .set({ awardedBy: null })
            .where(eq(xpEvents.awardedBy, targetId));
          await tx
            .update(rewardLedger)
            .set({ paidBy: null })
            .where(eq(rewardLedger.paidBy, targetId));

          await tx
            .delete(challengeSubmissions)
            .where(eq(challengeSubmissions.userId, targetId));
          await tx.delete(messages).where(eq(messages.userId, targetId));
          await tx
            .delete(marketplaceBids)
            .where(eq(marketplaceBids.bidderUserId, targetId));
          await tx
            .delete(marketplaceListings)
            .where(eq(marketplaceListings.sellerUserId, targetId));
          await tx
            .delete(sideQuestCompletions)
            .where(eq(sideQuestCompletions.userId, targetId));
          await tx.delete(boardThreads).where(eq(boardThreads.createdBy, targetId));

          const deleted = await tx
            .delete(users)
            .where(eq(users.id, targetId))
            .returning({ id: users.id });

          if (deleted.length === 0) {
            throw new Error("User already deleted");
          }
        });

        res.json({ ok: true, deleted: target.username });
      } catch (err) {
        console.error("Failed to delete user:", err);
        res.status(500).json({ error: "Failed to delete user" });
      }
    }
  );
}
