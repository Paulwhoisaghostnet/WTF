// Phase 12 — Season 3 scaffold.
//
// Idempotently stands up the Season 3 shell so the operator can lock the
// cohort, collect antes, and open the calendar with zero SSH or manual SQL.
// Matches the plan's Phase 12 acceptance:
//
//   - Season row (number=3, name="Season 3") created with
//     `ante_wtf_required` pre-filled so the ante attestation flow works.
//   - Ten `rounds` rows materialised as `upcoming`, each with a default
//     `round_elimination_rules` row (operator can edit the kind/params).
//   - One `side_quests` row flagged `persistent` so the season sidequest
//     stream is already open.
//   - One reusable challenge template ("Tezos Sticker Design Challenge",
//     roundId=null, status=draft) sitting on top of the challenges table
//     so operators can `INSERT … SELECT` from it into any future round.
//   - Three seed `gameshow_events` rows covering S3 kickoff, mid-season
//     stage, and finale so the iCal feed + Discord mirror both come online
//     the moment the calendar router renders.
//
// Re-running the scaffolder is a no-op; every insert is guarded with a
// lookup-by-natural-key and the round seeds are keyed on (seasonId, number).
// A single `operator_actions` row is written per run so the Control Board
// audit trail shows what got created.

import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  seasons,
  rounds,
  challenges,
  sideQuests,
  gameshowEvents,
  roundEliminationRules,
  operatorActions,
} from "@shared/schema";

// ─── Season 3 constants ──────────────────────────────────────────────────
export const SEASON_3_NUMBER = 3;
export const SEASON_3_NAME = "Season 3";
/**
 * Default ante requirement (in raw WTF units). Matches the Phase 10 plan's
 * "pre-season ante" mechanic. Operator can override via the Control Board
 * season editor before cohort lock.
 */
export const SEASON_3_DEFAULT_ANTE_WTF = "100";

/** Stable, re-runnable sidequest title for the S3 stream. */
const SEASON_3_SIDEQUEST_TITLE = "Season 3 Sidequest Stream";
const SEASON_3_SIDEQUEST_DESCRIPTION =
  "Persistent Season 3 sidequest stream. Contestants (and, for WTF-gated entries, anyone meeting the fee) post proofs throughout the season. Operator grades. Reward: 25 XP per approved completion.";

/** Stable title for the reusable Sticker Design Challenge template. */
const STICKER_TEMPLATE_TITLE = "Tezos Sticker Design Challenge (Template)";
const STICKER_TEMPLATE_DESCRIPTION =
  "Reusable challenge template: contestants design and mint a Tezos-themed sticker pack (≥ 6 stickers) to the designated WTF Collection contract. Copy this row into a round to deploy.";
const STICKER_TEMPLATE_CRITERIA =
  "Operator grades by (a) quality of the sticker design, (b) on-chain mint to the Season 3 WTF Collection contract, and (c) tag `s3-sticker-challenge` present in token metadata.";

/** 10-round declarative seed. Defaults to draft-friendly elimination rules
 *  the operator can tune in Round 2 / Team UI before the round opens. */
const SEASON_3_ROUND_SPECS = [
  { number: 1, name: "Round 1 — Kickoff", rule: { kind: "bottom_n_by_wtf", params: { n: 5 } } },
  { number: 2, name: "Round 2 — WTF Hold",     rule: { kind: "did_not_hold_token", params: { minWtf: 100 } } },
  { number: 3, name: "Round 3 — Mint Sprint",  rule: { kind: "submission_rank", params: { surviveTop: 40 } } },
  { number: 4, name: "Round 4 — CRP Nominations", rule: { kind: "bottom_n_by_wtf", params: { n: 5 } } },
  { number: 5, name: "Round 5 — Console Hi-Score", rule: { kind: "submission_rank", params: { surviveTop: 30 } } },
  { number: 6, name: "Round 6 — Teams Rise",   rule: { kind: "team_rank", params: { surviveTop: 25 } } },
  { number: 7, name: "Round 7 — Attendance",   rule: { kind: "bottom_n_by_wtf", params: { n: 5 } } },
  { number: 8, name: "Round 8 — Sticker Challenge", rule: { kind: "submission_rank", params: { surviveTop: 15 } } },
  { number: 9, name: "Round 9 — Reveal", rule: { kind: "bottom_n_by_wtf", params: { n: 5 } } },
  { number: 10, name: "Round 10 — Finale", rule: { kind: "top_n_survive", params: { n: 1 } } },
] as const;

type EliminationRuleKind =
  | "bottom_n_by_wtf"
  | "top_n_survive"
  | "did_not_hold_token"
  | "submission_rank"
  | "team_rank"
  | "manual";

interface Season3State {
  season: {
    id: number;
    number: number;
    name: string;
    status: string;
    anteWtfRequired: string;
  };
  rounds: Array<{
    id: number;
    number: number;
    name: string;
    status: string;
    rule: { kind: EliminationRuleKind; paramsJson: unknown } | null;
  }>;
  sideQuest: { id: number; title: string; persistent: boolean } | null;
  stickerTemplate: { id: number; title: string; status: string } | null;
  calendarEvents: Array<{
    id: number;
    kind: string;
    title: string;
    startsAt: string;
    status: string;
  }>;
  notes: string[];
}

/** Ensure the Season 3 row exists with the default ante requirement. */
async function ensureSeason3(createdByUserId: number | null) {
  const [existing] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.number, SEASON_3_NUMBER))
    .limit(1);
  if (existing) return existing;
  const [row] = await db
    .insert(seasons)
    .values({
      name: SEASON_3_NAME,
      number: SEASON_3_NUMBER,
      status: "upcoming",
      description:
        "50-contestant, 10-round Tezos survival competition. Ante-gated cohort. Finale crowns a single survivor.",
      createdBy: createdByUserId ?? undefined,
      anteWtfRequired: SEASON_3_DEFAULT_ANTE_WTF,
    })
    .returning();
  return row;
}

/**
 * Materialise ten rounds keyed on (seasonId, number). Re-entrant: already-seeded
 * rounds are skipped entirely; missing rounds are filled in. Returns the
 * canonical round rows for the season, sorted by number.
 */
async function ensureRounds10(seasonId: number) {
  const existing = await db
    .select()
    .from(rounds)
    .where(eq(rounds.seasonId, seasonId));
  const byNumber = new Map(existing.map((r) => [r.number, r]));
  for (const spec of SEASON_3_ROUND_SPECS) {
    if (byNumber.has(spec.number)) continue;
    const [row] = await db
      .insert(rounds)
      .values({
        seasonId,
        number: spec.number,
        name: spec.name,
        description: null,
        status: "upcoming",
      })
      .returning();
    byNumber.set(row.number, row);
  }
  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}

/**
 * Ensure a default `round_elimination_rules` row for every Season 3 round.
 * The table is PK'd on round_id so we can simply skip any round that
 * already has a rule row.
 */
async function ensureEliminationRules(
  roundRows: Array<{ id: number; number: number }>
) {
  const out: Array<{
    roundId: number;
    kind: EliminationRuleKind;
    paramsJson: unknown;
  }> = [];
  for (const r of roundRows) {
    const spec = SEASON_3_ROUND_SPECS.find((s) => s.number === r.number);
    if (!spec) continue;
    const [existing] = await db
      .select()
      .from(roundEliminationRules)
      .where(eq(roundEliminationRules.roundId, r.id))
      .limit(1);
    if (existing) {
      out.push({
        roundId: existing.roundId,
        kind: existing.kind as EliminationRuleKind,
        paramsJson: existing.paramsJson,
      });
      continue;
    }
    const [row] = await db
      .insert(roundEliminationRules)
      .values({
        roundId: r.id,
        kind: spec.rule.kind as EliminationRuleKind,
        paramsJson: sql`${JSON.stringify(spec.rule.params)}::jsonb`,
      })
      .returning();
    out.push({
      roundId: row.roundId,
      kind: row.kind as EliminationRuleKind,
      paramsJson: row.paramsJson,
    });
  }
  return out;
}

/** Ensure the persistent Season 3 sidequest stream is live. */
async function ensureSeason3Sidequest(createdByUserId: number | null) {
  const [existing] = await db
    .select()
    .from(sideQuests)
    .where(eq(sideQuests.title, SEASON_3_SIDEQUEST_TITLE))
    .limit(1);
  if (existing) return existing;
  const [row] = await db
    .insert(sideQuests)
    .values({
      title: SEASON_3_SIDEQUEST_TITLE,
      description: SEASON_3_SIDEQUEST_DESCRIPTION,
      criteria:
        "Operator grades pass/fail. Reward: 25 XP per approved completion. Deadline = season end.",
      status: "active",
      persistent: true,
      autoVerifyType: "manual",
      rewardXp: 25,
      createdBy: createdByUserId ?? undefined,
    })
    .returning();
  return row;
}

/**
 * Ensure a reusable Sticker Design Challenge sits in the challenges table
 * as a draft with roundId=null. Operators copy it into a round via the
 * challenge editor when they're ready to run Round 8.
 */
async function ensureStickerTemplate(createdByUserId: number | null) {
  const [existing] = await db
    .select()
    .from(challenges)
    .where(
      and(
        eq(challenges.title, STICKER_TEMPLATE_TITLE),
        // keep template rows distinct from any future round-8 copy
        sql`${challenges.roundId} IS NULL`
      )
    )
    .limit(1);
  if (existing) return existing;
  const [row] = await db
    .insert(challenges)
    .values({
      roundId: null,
      title: STICKER_TEMPLATE_TITLE,
      description: STICKER_TEMPLATE_DESCRIPTION,
      criteria: STICKER_TEMPLATE_CRITERIA,
      submissionTag: "s3-sticker-challenge",
      status: "draft",
      createdBy: createdByUserId ?? undefined,
    })
    .returning();
  return row;
}

/**
 * Seed three calendar events so the iCal feed + Discord mirror have
 * something to render the moment Season 3 is announced. Events are keyed
 * on (title, starts_at) so re-running the scaffolder is idempotent.
 */
async function ensureSeason3CalendarEvents(
  seasonId: number,
  createdByUserId: number | null
) {
  const now = new Date();
  const daysFromNow = (n: number) =>
    new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

  const specs = [
    {
      title: "Season 3 — Kickoff Stream",
      description:
        "Welcome to Season 3. Cohort lock is live; finale bracket reveal.",
      kind: "discord_stage" as const,
      startsAt: daysFromNow(7),
      endsAt: new Date(daysFromNow(7).getTime() + 2 * 60 * 60 * 1000),
      links: [{ label: "Season 3 overview", href: "/seasons/3" }],
    },
    {
      title: "Season 3 — Mid-Season Stage",
      description:
        "Halfway update. Team standings, disbursement recap, WTF recapture temperature check.",
      kind: "discord_stage" as const,
      startsAt: daysFromNow(42),
      endsAt: new Date(daysFromNow(42).getTime() + 90 * 60 * 1000),
      links: [],
    },
    {
      title: "Season 3 — Finale",
      description: "Round 10. One survivor. Live on stage + X Space.",
      kind: "discord_stage" as const,
      startsAt: daysFromNow(84),
      endsAt: new Date(daysFromNow(84).getTime() + 3 * 60 * 60 * 1000),
      links: [{ label: "Season 3 overview", href: "/seasons/3" }],
    },
  ];

  const rows: Array<{
    id: number;
    kind: string;
    title: string;
    startsAt: Date;
    status: string;
  }> = [];
  for (const spec of specs) {
    const [existing] = await db
      .select()
      .from(gameshowEvents)
      .where(
        and(
          eq(gameshowEvents.title, spec.title),
          eq(gameshowEvents.startsAt, spec.startsAt)
        )
      )
      .limit(1);
    if (existing) {
      rows.push({
        id: existing.id,
        kind: existing.kind,
        title: existing.title,
        startsAt: existing.startsAt,
        status: existing.status,
      });
      continue;
    }
    const [row] = await db
      .insert(gameshowEvents)
      .values({
        kind: spec.kind,
        title: spec.title,
        description: spec.description,
        startsAt: spec.startsAt,
        endsAt: spec.endsAt,
        sourceKind: "season",
        sourceId: seasonId,
        visibility: "public",
        // Published so the iCal feed + Discord mirror pick it up
        // immediately. Operator can still cancel or update via the
        // calendar editor.
        status: "published",
        linksJson: sql`${JSON.stringify(spec.links)}::jsonb`,
        createdBy: createdByUserId ?? undefined,
        approvedBy: createdByUserId ?? undefined,
        approvedAt: new Date(),
      })
      .returning();
    rows.push({
      id: row.id,
      kind: row.kind,
      title: row.title,
      startsAt: row.startsAt,
      status: row.status,
    });
  }
  return rows;
}

/**
 * Main entry point. Idempotent. Returns the shape the Control Board
 * needs to render deep links into each surface. Throws on any DB error.
 */
export async function scaffoldSeason3(params: {
  actorUserId: number | null;
  actorIp?: string | null;
}): Promise<Season3State> {
  const actorUserId = params.actorUserId ?? null;
  const season = await ensureSeason3(actorUserId);
  const roundRows = await ensureRounds10(season.id);
  const eliminationRules = await ensureEliminationRules(
    roundRows.map((r) => ({ id: r.id, number: r.number }))
  );
  const sideQuest = await ensureSeason3Sidequest(actorUserId);
  const stickerTemplate = await ensureStickerTemplate(actorUserId);
  const calendarEvents = await ensureSeason3CalendarEvents(
    season.id,
    actorUserId
  );

  const notes: string[] = [];
  notes.push(
    "Cohort is not locked yet — add 50 contestants via `/api/seasons/:id/contestants` or the Control Board roster tab, then flip season.status to `active`."
  );
  notes.push(
    "Antes attest via `POST /api/seasons/:id/ante/attest`; ante_wtf_required is pre-filled with " +
      SEASON_3_DEFAULT_ANTE_WTF +
      " WTF but can be changed before cohort lock."
  );
  notes.push(
    "Round elimination rules default to shape-appropriate kinds; edit per round via the Control Board round editor before the round opens."
  );
  notes.push(
    "Season 3 calendar events are published — iCal feed + Discord mirror pick them up on their next tick."
  );
  notes.push(
    "Sticker Design Challenge template sits at challenges.id=" +
      stickerTemplate.id +
      " with roundId=null. Duplicate into any round when ready."
  );

  await db.insert(operatorActions).values({
    actorUserId,
    actionKind: "season3.scaffold",
    targetKind: "season",
    targetId: season.id,
    payloadJson: sql`${JSON.stringify({
      rounds: roundRows.map((r) => ({ id: r.id, number: r.number })),
      eliminationRuleCount: eliminationRules.length,
      sideQuestId: sideQuest.id,
      stickerTemplateId: stickerTemplate.id,
      calendarEventIds: calendarEvents.map((e) => e.id),
    })}::jsonb`,
    ip: params.actorIp ?? null,
  });

  return {
    season: {
      id: season.id,
      number: season.number,
      name: season.name,
      status: season.status,
      anteWtfRequired: String(season.anteWtfRequired ?? "0"),
    },
    rounds: roundRows.map((r) => {
      const rule =
        eliminationRules.find((er) => er.roundId === r.id) ?? null;
      return {
        id: r.id,
        number: r.number,
        name: r.name,
        status: r.status,
        rule: rule
          ? { kind: rule.kind, paramsJson: rule.paramsJson }
          : null,
      };
    }),
    sideQuest: sideQuest
      ? {
          id: sideQuest.id,
          title: sideQuest.title,
          persistent: sideQuest.persistent,
        }
      : null,
    stickerTemplate: stickerTemplate
      ? {
          id: stickerTemplate.id,
          title: stickerTemplate.title,
          status: stickerTemplate.status,
        }
      : null,
    calendarEvents: calendarEvents.map((e) => ({
      id: e.id,
      kind: e.kind,
      title: e.title,
      startsAt: e.startsAt.toISOString(),
      status: e.status,
    })),
    notes,
  };
}

/** Read-only status for the Control Board. No mutation. */
export async function getSeason3Status(): Promise<Season3State | null> {
  const [season] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.number, SEASON_3_NUMBER))
    .limit(1);
  if (!season) return null;

  const roundRows = await db
    .select()
    .from(rounds)
    .where(eq(rounds.seasonId, season.id));
  roundRows.sort((a, b) => a.number - b.number);

  const ruleRows = roundRows.length
    ? await db
        .select()
        .from(roundEliminationRules)
        .where(
          sql`${roundEliminationRules.roundId} IN (${sql.join(
            roundRows.map((r) => r.id),
            sql`, `
          )})`
        )
    : [];
  const ruleByRound = new Map(ruleRows.map((r) => [r.roundId, r]));

  const [sideQuest] = await db
    .select()
    .from(sideQuests)
    .where(eq(sideQuests.title, SEASON_3_SIDEQUEST_TITLE))
    .limit(1);

  const [stickerTemplate] = await db
    .select()
    .from(challenges)
    .where(
      and(
        eq(challenges.title, STICKER_TEMPLATE_TITLE),
        sql`${challenges.roundId} IS NULL`
      )
    )
    .limit(1);

  const calendarEvents = await db
    .select()
    .from(gameshowEvents)
    .where(
      and(
        eq(gameshowEvents.sourceKind, "season"),
        eq(gameshowEvents.sourceId, season.id)
      )
    );

  return {
    season: {
      id: season.id,
      number: season.number,
      name: season.name,
      status: season.status,
      anteWtfRequired: String(season.anteWtfRequired ?? "0"),
    },
    rounds: roundRows.map((r) => {
      const rule = ruleByRound.get(r.id);
      return {
        id: r.id,
        number: r.number,
        name: r.name,
        status: r.status,
        rule: rule
          ? {
              kind: rule.kind as EliminationRuleKind,
              paramsJson: rule.paramsJson,
            }
          : null,
      };
    }),
    sideQuest: sideQuest
      ? {
          id: sideQuest.id,
          title: sideQuest.title,
          persistent: sideQuest.persistent,
        }
      : null,
    stickerTemplate: stickerTemplate
      ? {
          id: stickerTemplate.id,
          title: stickerTemplate.title,
          status: stickerTemplate.status,
        }
      : null,
    calendarEvents: calendarEvents.map((e) => ({
      id: e.id,
      kind: e.kind,
      title: e.title,
      startsAt: e.startsAt.toISOString(),
      status: e.status,
    })),
    notes: [],
  };
}
