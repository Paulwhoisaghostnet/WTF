import { and, count, eq, isNull, sql } from "drizzle-orm";
import {
  atprotoAccounts,
  atprotoHandleClaims,
  calendarTickets,
  challengeAutomationCompletions,
  challengeAutomationDefinitions,
  inAppMarketPurchases,
  studioProjects,
  userEtherlinkWallets,
  userWallets,
  users,
  wtfLiveRooms,
  wtfLiveStages,
  wtfSubdomainGrants,
  wtfUserSites,
} from "@shared/schema";
import { db } from "../../db";

/**
 * DB-backed predicates for Reggie's onboarding questline.
 *
 * These verify durable account state directly (profile fields, wallet rows,
 * identity claims, owned surfaces) so steps complete even when the proving
 * action happened before the quest existed or emitted no SystemEvent.
 */

export interface ReggiePredicateResult {
  handled: boolean;
  satisfied: boolean;
  detail: unknown;
}

const NOT_HANDLED: ReggiePredicateResult = {
  handled: false,
  satisfied: false,
  detail: null,
};

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

async function rowExists(query: Promise<Array<{ id: number }>>): Promise<boolean> {
  const rows = await query;
  return rows.length > 0;
}

export async function evaluateReggiePredicate(
  predicateKey: string,
  params: Record<string, unknown>,
  userId: number
): Promise<ReggiePredicateResult> {
  if (!predicateKey.startsWith("reggie.")) return NOT_HANDLED;

  switch (predicateKey) {
    case "reggie.step_completed": {
      const stepKey = String(params.stepKey ?? "");
      if (!stepKey) {
        return { handled: true, satisfied: false, detail: { error: "stepKey required" } };
      }
      const rows = await db
        .select({ id: challengeAutomationCompletions.id })
        .from(challengeAutomationCompletions)
        .innerJoin(
          challengeAutomationDefinitions,
          eq(challengeAutomationCompletions.challengeId, challengeAutomationDefinitions.id)
        )
        .where(
          and(
            eq(challengeAutomationCompletions.userId, userId),
            sql`${challengeAutomationDefinitions.metadata}->>'reggieQuest' = 'true'`,
            sql`${challengeAutomationDefinitions.metadata}->>'stepKey' = ${stepKey}`
          )
        )
        .limit(1);
      return { handled: true, satisfied: rows.length > 0, detail: { stepKey } };
    }

    case "reggie.profile_ready": {
      // Display name is the only profile-identity field the Profile UI can
      // write today (users.bio has no write surface), so it is the proof.
      const [row] = await db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const satisfied = Boolean(row && hasText(row.displayName));
      return {
        handled: true,
        satisfied,
        detail: { hasDisplayName: satisfied },
      };
    }

    case "reggie.pfp_set": {
      const [row] = await db
        .select({ avatarUrl: users.avatarUrl, pfpImageUrl: users.pfpImageUrl })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const satisfied = Boolean(row && (hasText(row.avatarUrl) || hasText(row.pfpImageUrl)));
      return { handled: true, satisfied, detail: { pfp: satisfied } };
    }

    case "reggie.x_linked": {
      const [row] = await db
        .select({ twitterVerified: users.twitterVerified })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const satisfied = Boolean(row?.twitterVerified);
      return { handled: true, satisfied, detail: { twitterVerified: satisfied } };
    }

    case "reggie.bsky_linked": {
      const satisfied = await rowExists(
        db
          .select({ id: atprotoAccounts.id })
          .from(atprotoAccounts)
          .where(and(eq(atprotoAccounts.userId, userId), isNull(atprotoAccounts.disconnectedAt)))
          .limit(1)
      );
      return { handled: true, satisfied, detail: { atprotoLinked: satisfied } };
    }

    case "reggie.tezos_wallet_connected": {
      const satisfied = await rowExists(
        db
          .select({ id: userWallets.id })
          .from(userWallets)
          .where(eq(userWallets.userId, userId))
          .limit(1)
      );
      return { handled: true, satisfied, detail: { tezosWallet: satisfied } };
    }

    case "reggie.multi_wallet_primary": {
      const [row] = await db
        .select({
          total: count(),
          primaries: sql<number>`count(*) filter (where ${userWallets.isPrimary})::int`,
        })
        .from(userWallets)
        .where(eq(userWallets.userId, userId));
      const total = Number(row?.total ?? 0);
      const primaries = Number(row?.primaries ?? 0);
      const satisfied = total >= 2 && primaries >= 1;
      return { handled: true, satisfied, detail: { wallets: total, primaries } };
    }

    case "reggie.etherlink_connected": {
      const satisfied = await rowExists(
        db
          .select({ id: userEtherlinkWallets.id })
          .from(userEtherlinkWallets)
          .where(eq(userEtherlinkWallets.userId, userId))
          .limit(1)
      );
      return { handled: true, satisfied, detail: { etherlinkWallet: satisfied } };
    }

    case "reggie.wtfosme_claimed": {
      const verifiedClaim = await rowExists(
        db
          .select({ id: atprotoHandleClaims.id })
          .from(atprotoHandleClaims)
          .where(
            and(
              eq(atprotoHandleClaims.userId, userId),
              sql`${atprotoHandleClaims.desiredHandle} LIKE '%.wtfos.me'`,
              sql`${atprotoHandleClaims.verificationStatus} = 'verified'`
            )
          )
          .limit(1)
      );
      if (verifiedClaim) {
        return { handled: true, satisfied: true, detail: { via: "handle_claim" } };
      }
      const site = await rowExists(
        db
          .select({ id: wtfUserSites.id })
          .from(wtfUserSites)
          .where(eq(wtfUserSites.userId, userId))
          .limit(1)
      );
      return { handled: true, satisfied: site, detail: { via: site ? "wtf_site" : null } };
    }

    case "reggie.wtftez_claimed": {
      const satisfied = await rowExists(
        db
          .select({ id: wtfSubdomainGrants.id })
          .from(wtfSubdomainGrants)
          .where(eq(wtfSubdomainGrants.userId, userId))
          .limit(1)
      );
      return { handled: true, satisfied, detail: { wtfTezGrant: satisfied } };
    }

    case "reggie.live_room_owner": {
      const satisfied = await rowExists(
        db
          .select({ id: wtfLiveRooms.id })
          .from(wtfLiveRooms)
          .where(eq(wtfLiveRooms.ownerUserId, userId))
          .limit(1)
      );
      return { handled: true, satisfied, detail: { ownsRoom: satisfied } };
    }

    case "reggie.live_stage_owner": {
      const satisfied = await rowExists(
        db
          .select({ id: wtfLiveStages.id })
          .from(wtfLiveStages)
          .where(eq(wtfLiveStages.ownerUserId, userId))
          .limit(1)
      );
      return { handled: true, satisfied, detail: { ownsStage: satisfied } };
    }

    case "reggie.calendar_ticket_submitted": {
      const satisfied = await rowExists(
        db
          .select({ id: calendarTickets.id })
          .from(calendarTickets)
          .where(eq(calendarTickets.submitterUserId, userId))
          .limit(1)
      );
      return { handled: true, satisfied, detail: { calendarTicket: satisfied } };
    }

    case "reggie.studio_project_owner": {
      const satisfied = await rowExists(
        db
          .select({ id: studioProjects.id })
          .from(studioProjects)
          .where(eq(studioProjects.ownerUserId, userId))
          .limit(1)
      );
      return { handled: true, satisfied, detail: { ownsProject: satisfied } };
    }

    case "reggie.market_purchase_made": {
      const satisfied = await rowExists(
        db
          .select({ id: inAppMarketPurchases.id })
          .from(inAppMarketPurchases)
          .where(eq(inAppMarketPurchases.userId, userId))
          .limit(1)
      );
      return { handled: true, satisfied, detail: { marketPurchase: satisfied } };
    }

    default:
      return {
        handled: true,
        satisfied: false,
        detail: { error: `Unknown reggie predicate: ${predicateKey}` },
      };
  }
}
