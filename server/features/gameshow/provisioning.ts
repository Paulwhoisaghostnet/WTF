import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { inAppInventoryItems, operatorActions, roles as roleCatalog, seasonContestants, seasons, userRoles, users } from "@shared/schema";
import { GAMESHOW_TOOL_APP_KEYS, type GameshowProvisioningResult, type GameshowToolAppKey } from "@shared/gameshow-provisioning";
import { isAppStoreAppKey, wtfosAppMarketSku } from "@shared/wtfos-app-catalog";
import { normalizeUserRoles } from "@shared/types";
import { GameshowError } from "./policy";

type ProvisionEvent = { id: number; actorUserId: number; seasonId: number; userId: number };

export function createGameshowProvisioning(database: typeof db, emit?: (event: ProvisionEvent) => Promise<void>) {
  return async function provision(input: { seasonId: number; userId: number; appKeys: GameshowToolAppKey[]; actorUserId: number; ip?: string | null }, globallyAvailable: Partial<Record<GameshowToolAppKey, boolean>> = {}): Promise<GameshowProvisioningResult> {
    const appKeys = [...new Set(input.appKeys)];
    if (appKeys.some((key) => !GAMESHOW_TOOL_APP_KEYS.includes(key))) throw new GameshowError(400, "Select a supported contestant tool.");
    const result = await database.transaction(async (tx) => {
      const [season] = await tx.select().from(seasons).where(eq(seasons.id, input.seasonId)).for("update");
      if (!season) throw new GameshowError(404, "Season not found");
      if (season.status === "completed") throw new GameshowError(409, "This show is complete; its contestant setup is archived.");
      const [membership] = await tx.select().from(seasonContestants).where(and(eq(seasonContestants.seasonId, input.seasonId), eq(seasonContestants.userId, input.userId))).for("update");
      if (!membership || !["active", "reserve"].includes(membership.status)) throw new GameshowError(403, "Prepare tools only for an active or reserve contestant on this show's roster.");
      const [user] = await tx.select().from(users).where(eq(users.id, input.userId)).for("update");
      if (!user) throw new GameshowError(404, "Contestant account not found");
      const assigned = await tx.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, user.id));
      const existingRoles = normalizeUserRoles(assigned.length ? assigned.map((row) => row.role) : user.role);
      if (existingRoles.includes("time_out")) throw new GameshowError(403, "This account is in time out. Resolve that through account moderation first.");
      const grantCreator = appKeys.includes("pasta-protocol");
      if (grantCreator) await tx.insert(roleCatalog).values({ slug: "gameshow_creator", label: "Gameshow Creator", category: "gameshow",
        purpose: "Scoped Macaroni access supplied with the host-prepared Pasta contestant toolkit.",
        description: "Only managed Macaroni permission; no moderation, trusted-publishing bypass, or administrative access. Persists until revoked through Roles.",
        defaultWtfOsAccess: false, isSystem: true, isAssignable: true }).onConflictDoNothing();
      const roles = [...new Set([...existingRoles, "contestant", ...(grantCreator ? ["gameshow_creator"] : [])])];
      // Preserve legacy-role access when this is the first additive assignment.
      await tx.insert(userRoles).values(roles.map((role) => ({ userId: user.id, role, assignedBy: input.actorUserId }))).onConflictDoNothing();
      const passKeys = appKeys.filter(isAppStoreAppKey);
      const skus = passKeys.map(wtfosAppMarketSku);
      const inventory = skus.length ? await tx.select().from(inAppInventoryItems).where(and(eq(inAppInventoryItems.userId, user.id), inArray(inAppInventoryItems.sku, skus))) : [];
      const missingKeys = passKeys.filter((key) => !inventory.some((row) => row.sku === wtfosAppMarketSku(key) && row.quantity > 0));
      for (const key of missingKeys) {
        const metadata = { gameshowProvisioning: { seasonId: season.id, grantedBy: input.actorUserId, appKey: key } };
        await tx.insert(inAppInventoryItems).values({ userId: user.id, sku: wtfosAppMarketSku(key), quantity: 1, metadata }).onConflictDoUpdate({
          target: [inAppInventoryItems.userId, inAppInventoryItems.sku],
          set: { quantity: sql`GREATEST(${inAppInventoryItems.quantity}, 1)`, metadata: sql`COALESCE(${inAppInventoryItems.metadata}, '{}'::jsonb) || ${JSON.stringify(metadata)}::jsonb`, updatedAt: new Date() },
        });
      }
      const [event] = await tx.insert(operatorActions).values({ actorUserId: input.actorUserId, actionKind: "gameshow.contestant.provisioned", targetKind: "user", targetId: user.id,
        payloadJson: { seasonId: season.id, previousRoles: existingRoles, roles, requestedAppKeys: appKeys, grantedAppKeys: missingKeys }, ip: input.ip ?? null }).returning({ id: operatorActions.id });
      return { event: { id: event.id, actorUserId: input.actorUserId, seasonId: season.id, userId: user.id }, value: {
        seasonId: season.id, userId: user.id, roles, grantedRole: !existingRoles.includes("contestant"), grantedAppKeys: missingKeys,
        tools: appKeys.map((appKey) => ({ appKey, sku: wtfosAppMarketSku(appKey), owned: true, globallyAvailable: globallyAvailable[appKey] === true })),
      } };
    });
    if (emit) await emit(result.event).catch((error) => console.error("[gameshow] provision event projection failed", { auditId: result.event.id, error }));
    return result.value;
  };
}
