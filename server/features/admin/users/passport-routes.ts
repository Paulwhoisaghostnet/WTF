import type { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { requirePermission } from "../../../auth/passport";
import { db } from "../../../db";
import {
  userWallets,
  users,
  wtfSubdomainGrants,
  xpEvents,
} from "@shared/schema";
import { getXpTierForTotal, type UserRole } from "@shared/types";
import { listUserRoles } from "../../../lib/user-roles";
import { listActiveUserCurses } from "../../../lib/user-curses";
import { listRoleCatalog } from "../../../lib/role-catalog";
import { getEffectivePermissionsForRoles } from "../../../lib/permissions";
import { getWtfOsAccessForRoles } from "../../../lib/role-surface-access";
import {
  getUserDesktopSettings,
  updateUserDesktopSettings,
} from "../../../lib/user-desktop-settings";
import { logSystemEvent } from "../../../lib/system-log";

function parseTargetId(value: unknown): number | null {
  const targetId = Number(value);
  return Number.isInteger(targetId) && targetId > 0 ? targetId : null;
}

export function registerAdminUserPassportRoutes(router: Router) {
  router.get(
    "/api/admin/users/:id/passport",
    requirePermission("manage_users"),
    async (req, res) => {
      try {
        const targetId = parseTargetId(req.params.id);
        if (!targetId) return res.status(400).json({ error: "Invalid user id" });

        const [row] = await db
          .select({
            id: users.id,
            username: users.username,
            email: users.email,
            displayName: users.displayName,
            avatarUrl: users.avatarUrl,
            role: users.role,
            experiencePoints: users.experiencePoints,
            bio: users.bio,
            twitterHandle: users.twitterHandle,
            twitterVerified: users.twitterVerified,
            twitterPublic: users.twitterPublic,
            discordHandle: users.discordHandle,
            discordVerified: users.discordVerified,
            discordPublic: users.discordPublic,
            emailPublic: users.emailPublic,
            googleId: users.googleId,
            githubId: users.githubId,
            pfpTokenContract: users.pfpTokenContract,
            pfpTokenId: users.pfpTokenId,
            pfpImageUrl: users.pfpImageUrl,
            welcomedToWtfOs: users.welcomedToWtfOs,
            welcomedToWtfOsAt: users.welcomedToWtfOsAt,
            gmWelcomeUtcDay: users.gmWelcomeUtcDay,
            gmWelcomeLastSeenAt: users.gmWelcomeLastSeenAt,
            passwordHash: users.passwordHash,
            tempPasswordHash: users.tempPasswordHash,
            tempPasswordExpiresAt: users.tempPasswordExpiresAt,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt,
          })
          .from(users)
          .where(eq(users.id, targetId))
          .limit(1);
        if (!row) return res.status(404).json({ error: "User not found" });

        const roles = await listUserRoles(targetId, row.role as UserRole, db);
        const roleCatalog = await listRoleCatalog(db);
        const roleDefinitions = roles.map((slug) => {
          const definition = roleCatalog.find((candidate) => candidate.slug === slug);
          return definition ?? {
            slug,
            label: slug.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
            category: "access",
            purpose: "Role definition is not available in the current catalog.",
            description: null,
            accessLevel: 0,
            sortOrder: 10_000,
            color: null,
            icon: null,
            defaultWtfOsAccess: false,
            isSystem: false,
            isAssignable: false,
          };
        });
        const highestRole = [...roleDefinitions].sort(
          (a, b) => b.accessLevel - a.accessLevel || a.sortOrder - b.sortOrder
        )[0] ?? null;

        const [
          curses,
          effectivePermissions,
          wtfOsAccess,
          desktopSettings,
          wallets,
          subdomains,
          recentXpEvents,
        ] = await Promise.all([
          listActiveUserCurses(targetId, db),
          getEffectivePermissionsForRoles(roles),
          getWtfOsAccessForRoles(roles, db),
          getUserDesktopSettings(targetId, db),
          db
            .select({
              id: userWallets.id,
              walletAddress: userWallets.walletAddress,
              tezDomain: userWallets.tezDomain,
              isPrimary: userWallets.isPrimary,
              linkedAt: userWallets.linkedAt,
              lastActivityAt: userWallets.lastActivityAt,
              lastSyncedAt: userWallets.lastSyncedAt,
            })
            .from(userWallets)
            .where(eq(userWallets.userId, targetId)),
          db
            .select({
              id: wtfSubdomainGrants.id,
              fullName: wtfSubdomainGrants.fullName,
              status: wtfSubdomainGrants.status,
              walletAddress: wtfSubdomainGrants.walletAddress,
              notes: wtfSubdomainGrants.notes,
              createdAt: wtfSubdomainGrants.createdAt,
              updatedAt: wtfSubdomainGrants.updatedAt,
            })
            .from(wtfSubdomainGrants)
            .where(eq(wtfSubdomainGrants.userId, targetId)),
          db
            .select({
              id: xpEvents.id,
              amount: xpEvents.amount,
              reason: xpEvents.reason,
              awardedBy: xpEvents.awardedBy,
              createdAt: xpEvents.createdAt,
            })
            .from(xpEvents)
            .where(eq(xpEvents.userId, targetId))
            .orderBy(desc(xpEvents.createdAt))
            .limit(25),
        ]);

        logSystemEvent({
          source: "admin",
          eventType: "admin.user.passport.viewed",
          severity: "info",
          userId: targetId,
          message: `Admin opened the WTF Passport for ${row.username}`,
          metadata: {
            actorUserId: Number((req.user as any)?.id) || null,
            targetUserId: targetId,
          },
        });

        res.json({
          user: {
            id: row.id,
            username: row.username,
            email: row.email,
            displayName: row.displayName,
            avatarUrl: row.avatarUrl,
            bio: row.bio,
            experiencePoints: row.experiencePoints,
            twitterHandle: row.twitterHandle,
            twitterVerified: row.twitterVerified,
            twitterPublic: row.twitterPublic,
            discordHandle: row.discordHandle,
            discordVerified: row.discordVerified,
            discordPublic: row.discordPublic,
            emailPublic: row.emailPublic,
            googleLinked: Boolean(row.googleId),
            githubLinked: Boolean(row.githubId),
            pfpTokenContract: row.pfpTokenContract,
            pfpTokenId: row.pfpTokenId,
            pfpImageUrl: row.pfpImageUrl,
            welcomedToWtfOs: row.welcomedToWtfOs,
            welcomedToWtfOsAt: row.welcomedToWtfOsAt,
            gmWelcomeUtcDay: row.gmWelcomeUtcDay,
            gmWelcomeLastSeenAt: row.gmWelcomeLastSeenAt,
            hasPassword: Boolean(row.passwordHash),
            hasTemporaryPassword: Boolean(
              row.tempPasswordHash &&
                row.tempPasswordExpiresAt &&
                row.tempPasswordExpiresAt > new Date()
            ),
            tempPasswordExpiresAt: row.tempPasswordExpiresAt,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          },
          roles: roleDefinitions,
          highestRole,
          xpTier: getXpTierForTotal(row.experiencePoints),
          curses,
          effectivePermissions,
          wtfOsAccess,
          desktopSettings,
          wallets,
          subdomains,
          recentXpEvents,
          generatedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error("[admin] user passport fetch failed:", err);
        res.status(500).json({ error: "Failed to load user WTF Passport" });
      }
    }
  );

  router.put(
    "/api/admin/users/:id/passport/desktop-settings",
    requirePermission("manage_users"),
    async (req, res) => {
      try {
        const targetId = parseTargetId(req.params.id);
        if (!targetId) return res.status(400).json({ error: "Invalid user id" });

        const [target] = await db
          .select({ id: users.id, username: users.username })
          .from(users)
          .where(eq(users.id, targetId))
          .limit(1);
        if (!target) return res.status(404).json({ error: "User not found" });

        const result = await updateUserDesktopSettings(targetId, req.body, db);
        if (!result.ok && result.code === "desktop_settings_bad_concurrency_token") {
          return res.status(400).json({
            error: "updatedAt must be null or a valid settings timestamp.",
            code: result.code,
          });
        }
        if (!result.ok) {
          return res.status(409).json({
            error: "Desktop settings changed before this save completed.",
            code: result.code,
            current: result.current,
          });
        }

        logSystemEvent({
          source: "admin",
          eventType: "admin.user.desktop_settings.updated",
          severity: "warn",
          userId: targetId,
          message: `Admin updated desktop settings for ${target.username}`,
          metadata: {
            actorUserId: Number((req.user as any)?.id) || null,
            targetUserId: targetId,
            appearanceKeys: Object.keys(
              req.body?.appearance && typeof req.body.appearance === "object"
                ? req.body.appearance
                : {}
            ),
            iconLayoutUpdated: req.body?.iconLayout !== undefined,
            localizationUpdated: req.body?.localization !== undefined,
          },
        });

        res.json(result.settings);
      } catch (err) {
        console.error("[admin] user desktop settings update failed:", err);
        res.status(500).json({ error: "Failed to update user desktop settings" });
      }
    }
  );
}
