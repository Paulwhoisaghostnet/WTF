// Phase 11 — Test gameshow scaffolder.
//
// Idempotently materializes a 5-contestant / 3-round test gameshow ("Test
// Gameshow S0") using only schema that is already shipped:
//
//   - seasons           (number 900, reserved for the dummy test run)
//   - rounds            (3 rounds, one per round-shape in the plan)
//   - challenges        (1 per round, grading surface for operators)
//   - side_quests       (WITWIB-style persistent side quest)
//   - users             (tester01..tester05, witness role until operator promotes)
//   - season_contestants (all five linked to the test season, status=active)
//   - buyback_windows    (ghostnet dry-run scaffold, status=draft)
//
// Operator runs the scaffolder once via
// POST /api/control-board/test-gameshow/seed to stand everything up with zero
// SSH or manual SQL. The only subsequent manual steps are the ones the plan's
// acceptance criterion calls out: calendar approvals, round-advance clicks,
// elimination confirmations, and buyback window open/close.

import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  seasons,
  rounds,
  challenges,
  sideQuests,
  users,
  seasonContestants,
  buybackWindows,
  operatorActions,
} from "@shared/schema";
import { WTF_OPERATOR_WALLET_ADDRESS } from "./constants";

// Reserved season number — keeps the test run visibly outside the real S1/S2/S3
// sequence in every UI that sorts by `seasons.number`.
export const TEST_GAMESHOW_SEASON_NUMBER = 900;
export const TEST_GAMESHOW_SEASON_NAME = "Test Gameshow S0";

export const TEST_CONTESTANT_USERNAMES = [
  "tester01",
  "tester02",
  "tester03",
  "tester04",
  "tester05",
] as const;

const TEST_ROUND_SPECS = [
  {
    number: 1,
    name: "Round 1 — Teia Mint",
    description:
      "Contestants mint a 1/1 via the Teia-style WTF collection contract on ghostnet. Surface validates Phase 8 mode 1 + Phase 7 Mint Portal + Phase 2 round lifecycle.",
    challengeTitle: "Mint a 1/1 to the Test WTF Collection",
    challengeDescription:
      "Use the Mint Portal to mint a single-edition token to the designated ghostnet WTF Collection contract. Tag the submission with `test-round-1`.",
    criteria:
      "Operator grades pass/fail by confirming one mint event per contestant tagged `test-round-1` to the target contract.",
  },
  {
    number: 2,
    name: "Round 2 — WTF-Hold + CRP Nomination",
    description:
      "Contestants must hold ≥ 100 WTF throughout the window AND post one #TezosCRP nomination from their linked X account. Validates Phase 5 CRP watcher + Phase 9 disbursement reconciliation + `did_not_hold_token` elimination DSL.",
    challengeTitle: "Hold WTF and nominate someone for #TezosCRP",
    challengeDescription:
      "Hold ≥ 100 WTF for the full round window and post exactly one #TezosCRP nomination from your linked X account during the window.",
    criteria:
      "Operator grades pass/fail by verifying (a) continuous WTF balance ≥ 100 via TzKT snapshot and (b) one qualifying CRP nomination tweet.",
  },
  {
    number: 3,
    name: "Round 3 — Inverse Snake Hi-Score",
    description:
      "Contestants submit a run on Inverse Snake via the Console microapp. Top three survive; bottom two eliminated via `submission_rank` rule. Validates Phase 6 console hi-score infrastructure + Phase 2 elimination DSL.",
    challengeTitle: "Post a hi-score on Inverse Snake",
    challengeDescription:
      "Launch Inverse Snake from the WTF Games category and submit your best score via the HMAC-signed console scoreboard endpoint before the window closes.",
    criteria:
      "Operator grades by ordering contestants by `console_scores.score` (valid=true). Top 3 survive, bottom 2 eliminated.",
  },
] as const;

const WITWIB_SIDE_QUEST_TITLE = "WITWIB — What In The Witness Is Bro";
const WITWIB_SIDE_QUEST_DESCRIPTION =
  "Submit a meme, image, or short video that captures a wtfgameshow.app moment that made you say 'what in the witness is bro.' Operator grades. Persistent — accepts one entry per witness per calendar day.";

const PRE_TEST_BUYBACK_LABEL = "Pre-Test Buyback Dry Run";

/** Types returned to the caller so the Control Board can render links/ids. */
export interface TestGameshowState {
  season: { id: number; number: number; status: string };
  contestants: Array<{
    userId: number;
    username: string;
    contestantRowId: number;
  }>;
  rounds: Array<{ id: number; number: number; name: string }>;
  challenges: Array<{ id: number; roundId: number; title: string }>;
  sideQuest: { id: number; title: string } | null;
  buybackDryRun: { id: number; label: string; status: string } | null;
  notes: string[];
}

/** Ensure the reserved test season exists (upserts by number). */
async function ensureTestSeason(createdByUserId: number | null) {
  const [existing] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.number, TEST_GAMESHOW_SEASON_NUMBER))
    .limit(1);
  if (existing) return existing;

  const [row] = await db
    .insert(seasons)
    .values({
      name: TEST_GAMESHOW_SEASON_NAME,
      number: TEST_GAMESHOW_SEASON_NUMBER,
      status: "upcoming",
      description:
        "Dummy season used to exercise every surface before Season 3 cohort lock. Does not count toward real standings.",
      createdBy: createdByUserId ?? undefined,
    })
    .returning();
  return row;
}

/** Ensure five `testerNN` accounts exist; returns their users rows. */
async function ensureTestContestants() {
  const results: Array<{ id: number; username: string; created: boolean }> = [];
  for (const username of TEST_CONTESTANT_USERNAMES) {
    const [existing] = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    if (existing) {
      results.push({ id: existing.id, username: existing.username, created: false });
      continue;
    }
    const [row] = await db
      .insert(users)
      .values({
        username,
        displayName: username,
        // Operator sets a temp password through the existing admin user
        // management screen. We intentionally leave passwordHash null so these
        // accounts can't log in until somebody with manage_gameshow grants
        // credentials.
        role: "witness",
      })
      .returning({ id: users.id, username: users.username });
    results.push({ id: row.id, username: row.username, created: true });
  }
  return results;
}

/** Make sure every test contestant is linked to the test season. */
async function ensureContestantRoster(
  seasonId: number,
  contestants: Array<{ id: number; username: string }>
) {
  const out: Array<{ userId: number; username: string; contestantRowId: number }> = [];
  for (const c of contestants) {
    const [existing] = await db
      .select({ id: seasonContestants.id })
      .from(seasonContestants)
      .where(
        and(
          eq(seasonContestants.seasonId, seasonId),
          eq(seasonContestants.userId, c.id)
        )
      )
      .limit(1);
    if (existing) {
      out.push({
        userId: c.id,
        username: c.username,
        contestantRowId: existing.id,
      });
      continue;
    }
    const [row] = await db
      .insert(seasonContestants)
      .values({
        seasonId,
        userId: c.id,
        status: "active",
        notes: "Seeded by test-gameshow scaffolder (phase 11).",
      })
      .returning({ id: seasonContestants.id });
    out.push({ userId: c.id, username: c.username, contestantRowId: row.id });
  }
  return out;
}

/** Materialize rounds 1/2/3 exactly once per (seasonId, number). */
async function ensureRounds(seasonId: number) {
  const existing = await db
    .select()
    .from(rounds)
    .where(eq(rounds.seasonId, seasonId));
  const byNumber = new Map(existing.map((r) => [r.number, r]));
  const out: Array<{ id: number; number: number; name: string }> = [];
  for (const spec of TEST_ROUND_SPECS) {
    const hit = byNumber.get(spec.number);
    if (hit) {
      out.push({ id: hit.id, number: hit.number, name: hit.name });
      continue;
    }
    const [row] = await db
      .insert(rounds)
      .values({
        seasonId,
        number: spec.number,
        name: spec.name,
        description: spec.description,
        status: "upcoming",
      })
      .returning({ id: rounds.id, number: rounds.number, name: rounds.name });
    out.push(row);
  }
  return out;
}

/** Create one challenge per round, idempotent by (roundId, title). */
async function ensureChallenges(
  seededRounds: Array<{ id: number; number: number }>
) {
  const out: Array<{ id: number; roundId: number; title: string }> = [];
  for (const r of seededRounds) {
    const spec = TEST_ROUND_SPECS.find((s) => s.number === r.number);
    if (!spec) continue;
    const [existing] = await db
      .select({ id: challenges.id, title: challenges.title })
      .from(challenges)
      .where(
        and(
          eq(challenges.roundId, r.id),
          eq(challenges.title, spec.challengeTitle)
        )
      )
      .limit(1);
    if (existing) {
      out.push({ id: existing.id, roundId: r.id, title: existing.title });
      continue;
    }
    const [row] = await db
      .insert(challenges)
      .values({
        roundId: r.id,
        title: spec.challengeTitle,
        description: spec.challengeDescription,
        criteria: spec.criteria,
        status: "draft",
      })
      .returning({ id: challenges.id, title: challenges.title });
    out.push({ id: row.id, roundId: r.id, title: row.title });
  }
  return out;
}

/** Ensure the persistent WITWIB side quest exists. */
async function ensureWitwibSideQuest() {
  const [existing] = await db
    .select({ id: sideQuests.id, title: sideQuests.title })
    .from(sideQuests)
    .where(eq(sideQuests.title, WITWIB_SIDE_QUEST_TITLE))
    .limit(1);
  if (existing) return existing;
  const [row] = await db
    .insert(sideQuests)
    .values({
      title: WITWIB_SIDE_QUEST_TITLE,
      description: WITWIB_SIDE_QUEST_DESCRIPTION,
      criteria:
        "Operator grades pass/fail. One completion per witness per day. No auto-verify; manual.",
      status: "active",
      persistent: true,
      autoVerifyType: "manual",
      rewardXp: 25,
    })
    .returning({ id: sideQuests.id, title: sideQuests.title });
  return row;
}

/**
 * Scaffold (don't originate) a draft buyback window row for the pre-test dry
 * run. The operator still has to originate the contract on ghostnet via the
 * Phase 8 factory and then call the Phase 9 fund/open routes; this row just
 * gives them a pre-populated record to attach that contract to.
 */
async function ensurePreTestBuybackWindow() {
  if (!WTF_OPERATOR_WALLET_ADDRESS) {
    return {
      row: null as null | { id: number; label: string; status: string },
      note:
        "Skipped pre-test buyback window scaffold: WTF_OPERATOR_WALLET_ADDRESS is not configured.",
    };
  }
  const [existing] = await db
    .select({
      id: buybackWindows.id,
      label: buybackWindows.label,
      status: buybackWindows.status,
    })
    .from(buybackWindows)
    .where(eq(buybackWindows.label, PRE_TEST_BUYBACK_LABEL))
    .limit(1);
  if (existing) {
    return {
      row: { id: existing.id, label: existing.label, status: existing.status },
      note: "Pre-test buyback window already scaffolded.",
    };
  }
  const opens = new Date(Date.now() + 60 * 60 * 1000);
  const closes = new Date(opens.getTime() + 15 * 60 * 1000);
  const [row] = await db
    .insert(buybackWindows)
    .values({
      label: PRE_TEST_BUYBACK_LABEL,
      // Placeholder — operator updates this once the ghostnet origination
      // finishes via POST /api/buyback-windows/:id (or the Control Board).
      contractAddress: "KT1__pending_origination__________________",
      network: "ghostnet",
      status: "draft",
      rateMutezPerWtf: "1000",
      perSellerCapWtf: "500",
      totalXtzBudgetMutez: "10000000",
      opensAt: opens,
      closesAt: closes,
      notes:
        "Seeded by test-gameshow scaffolder (phase 11). 15-minute ghostnet dry-run window. Operator updates contract_address and merkle_root after origination + allowlist upload.",
    })
    .returning({
      id: buybackWindows.id,
      label: buybackWindows.label,
      status: buybackWindows.status,
    });
  return {
    row,
    note: "Pre-test buyback window scaffolded as draft; allowlist + origination still pending.",
  };
}

/**
 * Main entry point. Idempotent. Returns the resulting resource ids so the
 * caller (the Control Board route) can render links to each surface.
 */
export async function scaffoldTestGameshow(params: {
  actorUserId: number | null;
  actorIp?: string | null;
}): Promise<TestGameshowState> {
  const season = await ensureTestSeason(params.actorUserId ?? null);
  const userRows = await ensureTestContestants();
  const contestants = await ensureContestantRoster(season.id, userRows);
  const roundRows = await ensureRounds(season.id);
  const challengeRows = await ensureChallenges(roundRows);
  const sideQuest = await ensureWitwibSideQuest();
  const buyback = await ensurePreTestBuybackWindow();

  const notes: string[] = [];
  const newlyCreated = userRows.filter((u) => u.created);
  if (newlyCreated.length > 0) {
    notes.push(
      `Created ${newlyCreated.length} test user(s): ${newlyCreated
        .map((u) => u.username)
        .join(", ")}. Set temp passwords via the admin user panel.`
    );
  } else {
    notes.push(
      "All five tester accounts already present; no new users created."
    );
  }
  notes.push(buyback.note);
  notes.push(
    "Discord stage event for the run is created manually in the gameshow Discord server; the bot mirrors it once Phase 4 lands."
  );

  await db.insert(operatorActions).values({
    actorUserId: params.actorUserId ?? null,
    actionKind: "test_gameshow.seed",
    targetKind: "season",
    targetId: season.id,
    payloadJson: sql`${JSON.stringify({
      contestants: contestants.map((c) => ({
        userId: c.userId,
        username: c.username,
      })),
      rounds: roundRows.map((r) => ({ id: r.id, number: r.number })),
      challenges: challengeRows.map((c) => ({ id: c.id, roundId: c.roundId })),
      sideQuestId: sideQuest?.id ?? null,
      buybackWindowId: buyback.row?.id ?? null,
    })}::jsonb`,
    ip: params.actorIp ?? null,
  });

  return {
    season: {
      id: season.id,
      number: season.number,
      status: season.status,
    },
    contestants,
    rounds: roundRows,
    challenges: challengeRows,
    sideQuest: sideQuest ? { id: sideQuest.id, title: sideQuest.title } : null,
    buybackDryRun: buyback.row,
    notes,
  };
}

/** Read-only summary (no mutation) for the Control Board status chip. */
export async function getTestGameshowStatus(): Promise<TestGameshowState | null> {
  const [season] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.number, TEST_GAMESHOW_SEASON_NUMBER))
    .limit(1);
  if (!season) return null;

  const contestantRows = await db
    .select({
      userId: seasonContestants.userId,
      contestantRowId: seasonContestants.id,
      username: users.username,
    })
    .from(seasonContestants)
    .leftJoin(users, eq(users.id, seasonContestants.userId))
    .where(eq(seasonContestants.seasonId, season.id));

  const roundRows = await db
    .select({ id: rounds.id, number: rounds.number, name: rounds.name })
    .from(rounds)
    .where(eq(rounds.seasonId, season.id));

  const roundIds = roundRows.map((r) => r.id);
  const challengeRows =
    roundIds.length > 0
      ? await db
          .select({
            id: challenges.id,
            roundId: challenges.roundId,
            title: challenges.title,
          })
          .from(challenges)
          .where(sql`${challenges.roundId} IN (${sql.join(roundIds, sql`, `)})`)
      : [];

  const [sideQuest] = await db
    .select({ id: sideQuests.id, title: sideQuests.title })
    .from(sideQuests)
    .where(eq(sideQuests.title, WITWIB_SIDE_QUEST_TITLE))
    .limit(1);

  const [buyback] = await db
    .select({
      id: buybackWindows.id,
      label: buybackWindows.label,
      status: buybackWindows.status,
    })
    .from(buybackWindows)
    .where(eq(buybackWindows.label, PRE_TEST_BUYBACK_LABEL))
    .limit(1);

  return {
    season: {
      id: season.id,
      number: season.number,
      status: season.status,
    },
    contestants: contestantRows.map((r) => ({
      userId: r.userId,
      username: r.username ?? `user#${r.userId}`,
      contestantRowId: r.contestantRowId,
    })),
    rounds: roundRows.map((r) => ({
      id: r.id,
      number: r.number,
      name: r.name,
    })),
    challenges: challengeRows
      .filter((c): c is { id: number; roundId: number; title: string } =>
        typeof c.roundId === "number"
      )
      .map((c) => ({ id: c.id, roundId: c.roundId, title: c.title })),
    sideQuest: sideQuest ? { id: sideQuest.id, title: sideQuest.title } : null,
    buybackDryRun: buyback ?? null,
    notes: [],
  };
}
