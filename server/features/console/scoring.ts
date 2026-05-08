import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  consoleAuditEvents,
  consoleGames,
  consolePlayerStats,
  consolePlayTickets,
  consoleScores,
  users,
  xpEvents,
} from "@shared/schema";
import { awardConsolePlayerXpSafely } from "./liveops";
import type {
  ConsoleAuthUser,
  ConsoleLeaderboardEntry,
  ConsolePlayerLeaderboardEntry,
  ConsoleRecentScoreEntry,
} from "./types";
import {
  gameSurfaceAliasSql,
  gameSurfaceSql,
  type GameSurface,
} from "./surfaces";

const PLAY_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const TICKET_VERSION = 1;

export type ConsoleScoreInput = {
  slug: string;
  runId: string;
  score: number;
  ticket?: string;
  payload?: Record<string, unknown>;
};

export type ConsoleTicketPayload = {
  v: typeof TICKET_VERSION;
  gameId: number;
  slug: string;
  userId: number;
  runId: string;
  issuedAt: string;
  expiresAt: string;
};

export async function createConsolePlaySession(
  user: ConsoleAuthUser,
  slug: string,
  context: { userAgent?: string; ip?: string } = {},
  options: { surface?: GameSurface } = {}
) {
  const game = await loadPlayableGame(slug, options.surface ?? "console");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PLAY_SESSION_TTL_MS);
  const runId = randomUUID();
  const ticketPayload: ConsoleTicketPayload = {
    v: TICKET_VERSION,
    gameId: game.id,
    slug: game.slug,
    userId: user.id,
    runId,
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  await db.insert(consolePlayTickets).values({
    gameId: game.id,
    userId: user.id,
    runId,
    issuedAt: now,
    expiresAt,
    userAgent: context.userAgent || null,
    ip: context.ip || null,
  });

  return {
    runId,
    sessionId: runId,
    ticket: createConsoleTicket(ticketPayload, consoleTicketSigningSecret(game)),
    expiresAt: expiresAt.toISOString(),
    game: {
      slug: game.slug,
      title: game.title,
      maxPossibleScore: game.maxPossibleScore ?? null,
      maxScorePerSecond: game.maxScorePerSecond ?? null,
    },
    player: {
      id: user.id,
      username: user.username,
      displayName: user.displayName ?? null,
    },
  };
}

export async function submitConsoleScore(
  user: ConsoleAuthUser,
  input: ConsoleScoreInput,
  options: { surface?: GameSurface } = {}
) {
  const surface = options.surface ?? "console";
  const game = await loadPlayableGame(input.slug, surface);
  const now = new Date();
  let score = 0;
  try {
    score = normalizeScore(input.score);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Invalid score payload.";
    await recordRejectedScoreAttempt({
      game,
      user,
      runId: String(input.runId || "").trim() || null,
      score: null,
      rawScore: input.score,
      reason,
      payload: input.payload,
      now,
      consumeTicketId: null,
    });
    throw new Error(reason);
  }

  const runId = String(input.runId || "").trim();
  if (!runId) {
    const reason = "Missing console play session.";
    await recordRejectedScoreAttempt({
      game,
      user,
      runId: null,
      score,
      rawScore: input.score,
      reason,
      payload: input.payload,
      now,
      consumeTicketId: null,
    });
    throw new Error(reason);
  }

  const [ticket] = await db
    .select()
    .from(consolePlayTickets)
    .where(
      and(
        eq(consolePlayTickets.gameId, game.id),
        eq(consolePlayTickets.userId, user.id),
        eq(consolePlayTickets.runId, runId)
      )
    )
    .limit(1);

  if (!ticket) {
    const reason = "Console play session not found.";
    await recordRejectedScoreAttempt({
      game,
      user,
      runId: null,
      score,
      rawScore: input.score,
      reason,
      payload: input.payload,
      now,
      consumeTicketId: null,
    });
    throw new Error(reason);
  }

  const ticketCheck = verifyConsoleTicket(
    String(input.ticket || ""),
    {
      gameId: game.id,
      slug: game.slug,
      userId: user.id,
      runId,
      expiresAt: ticket.expiresAt,
    },
    consoleTicketSigningSecret(game),
    now
  );
  if (!ticketCheck.ok) {
    const reason = ticketCheck.reason;
    await recordRejectedScoreAttempt({
      game,
      user,
      runId: null,
      score,
      rawScore: input.score,
      reason,
      payload: input.payload,
      now,
      consumeTicketId: null,
    });
    throw new Error(reason);
  }

  if (ticket.usedAt) {
    const reason = "Console play session was already scored.";
    await recordRejectedScoreAttempt({
      game,
      user,
      runId: null,
      score,
      rawScore: input.score,
      reason,
      payload: input.payload,
      now,
      consumeTicketId: null,
    });
    throw new Error(reason);
  }

  if (ticket.expiresAt.getTime() < now.getTime()) {
    const reason = "Console play session expired.";
    await recordRejectedScoreAttempt({
      game,
      user,
      runId,
      score,
      rawScore: input.score,
      reason,
      payload: input.payload,
      now,
      consumeTicketId: ticket.id,
    });
    throw new Error(reason);
  }

  const rejectReason = validateScoreAgainstCaps({
    score,
    issuedAt: ticket.issuedAt,
    now,
    maxPossibleScore: game.maxPossibleScore ?? null,
    maxScorePerSecond: game.maxScorePerSecond ?? null,
  });
  if (rejectReason) {
    await recordRejectedScoreAttempt({
      game,
      user,
      runId,
      score,
      rawScore: input.score,
      reason: rejectReason,
      payload: input.payload,
      now,
      consumeTicketId: ticket.id,
    });
    throw new Error(rejectReason);
  }

  const payload = input.payload && typeof input.payload === "object" ? input.payload : {};
  const [scoreRow] = await db
    .insert(consoleScores)
    .values({
      gameId: game.id,
      userId: user.id,
      score,
      runId,
      ticketPayloadJson: {
        ...payload,
        source: "console-sdk",
        ticket: {
          version: ticketCheck.payload?.v ?? TICKET_VERSION,
          issuedAt: ticketCheck.payload?.issuedAt ?? ticket.issuedAt.toISOString(),
          expiresAt: ticketCheck.payload?.expiresAt ?? ticket.expiresAt.toISOString(),
          signatureDigest: digestTicket(String(input.ticket || "")),
        },
        submittedAt: now.toISOString(),
      },
      valid: true,
      verificationMode: game.verificationMode,
      submittedAt: now,
    })
    .returning();

  await db
    .update(consolePlayTickets)
    .set({ usedAt: now })
    .where(eq(consolePlayTickets.id, ticket.id));

  const [previousStats] = await db
    .select({
      id: consolePlayerStats.id,
      plays: consolePlayerStats.plays,
      bestScore: consolePlayerStats.bestScore,
    })
    .from(consolePlayerStats)
    .where(
      and(
        eq(consolePlayerStats.gameId, game.id),
        eq(consolePlayerStats.userId, user.id)
      )
    )
    .limit(1);

  await db
    .insert(consolePlayerStats)
    .values({
      gameId: game.id,
      userId: user.id,
      plays: 1,
      bestScore: score,
      totalScore: score,
      lastPlayedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [consolePlayerStats.gameId, consolePlayerStats.userId],
      set: {
        plays: sql`${consolePlayerStats.plays} + 1`,
        bestScore: sql`GREATEST(${consolePlayerStats.bestScore}, ${score})`,
        totalScore: sql`${consolePlayerStats.totalScore} + ${score}`,
        lastPlayedAt: now,
        updatedAt: now,
      },
    });

  await db
    .update(consoleGames)
    .set({
      playCount: sql`${consoleGames.playCount} + 1`,
      playerCount: sql`${consoleGames.playerCount} + ${previousStats ? 0 : 1}`,
      updatedAt: now,
    })
    .where(eq(consoleGames.id, game.id));

  const leaderboard = await getConsoleLeaderboard(game.slug, 10, { surface });
  const playerRank = leaderboard.find((entry) => entry.userId === user.id)?.rank ?? null;
  const xpAwards = await awardConsoleScoreXp({
    userId: user.id,
    gameId: game.id,
    gameSlug: game.slug,
    runId,
    score,
    playerRank,
    wasFirstPlay: !previousStats || Number(previousStats.plays || 0) <= 0,
    isPersonalBest: !previousStats || score > Number(previousStats.bestScore || 0),
    surface,
  });

  return {
    ok: true,
    score: {
      id: scoreRow.id,
      slug: game.slug,
      score: scoreRow.score,
      submittedAt: scoreRow.submittedAt.toISOString(),
      playerRank,
    },
    xp: xpAwards
      .filter((award): award is NonNullable<typeof award> => Boolean(award?.awarded))
      .map((award) => ({
        amount: award.amount,
        reason: award.reason,
        totalXp: award.totalXp,
      })),
    leaderboard,
  };
}

export async function getConsoleLeaderboard(
  slug: string,
  limit = 25,
  options: { surface?: GameSurface } = {}
): Promise<ConsoleLeaderboardEntry[]> {
  const game = await loadPlayableGame(slug, options.surface ?? "any");
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const rows = await db.execute(sql`
    WITH best_scores AS (
      SELECT
        cs.user_id,
        MAX(cs.score) AS score,
        MAX(cs.submitted_at) AS submitted_at
      FROM console_scores cs
      WHERE cs.game_id = ${game.id}
        AND cs.valid = true
      GROUP BY cs.user_id
    )
    SELECT
      ROW_NUMBER() OVER (ORDER BY bs.score DESC, bs.submitted_at ASC, bs.user_id ASC) AS rank,
      bs.user_id,
      u.username,
      u.display_name,
      bs.score,
      bs.submitted_at
    FROM best_scores bs
    LEFT JOIN users u ON u.id = bs.user_id
    ORDER BY bs.score DESC, bs.submitted_at ASC, bs.user_id ASC
    LIMIT ${safeLimit}
  `);

  return (((rows as any).rows ?? []) as any[]).map((row) => ({
    rank: Number(row.rank),
    userId: Number(row.user_id),
    username: String(row.username || `user-${row.user_id}`),
    displayName: row.display_name ? String(row.display_name) : null,
    score: Number(row.score),
    submittedAt: row.submitted_at
      ? new Date(row.submitted_at).toISOString()
      : null,
  }));
}

export async function getRecentConsoleScores(
  limit = 25,
  options: { surface?: GameSurface } = {}
): Promise<ConsoleRecentScoreEntry[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const rows = await db
    .select({
      id: consoleScores.id,
      score: consoleScores.score,
      submittedAt: consoleScores.submittedAt,
      slug: consoleGames.slug,
      title: consoleGames.title,
      category: consoleGames.category,
      userId: consoleScores.userId,
      username: users.username,
      displayName: users.displayName,
    })
    .from(consoleScores)
    .innerJoin(consoleGames, eq(consoleGames.id, consoleScores.gameId))
    .leftJoin(users, eq(users.id, consoleScores.userId))
    .where(
      and(
        eq(consoleScores.valid, true),
        eq(consoleGames.active, true),
        eq(consoleGames.status, "active"),
        eq(consoleGames.isPublic, true),
        gameSurfaceSql(options.surface ?? "any")
      )
    )
    .orderBy(desc(consoleScores.submittedAt))
    .limit(safeLimit);

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    gameSlug: row.slug,
    gameTitle: row.title,
    category: row.category || "general",
    userId: row.userId,
    username: row.username || `user-${row.userId}`,
    displayName: row.displayName ?? null,
    score: Number(row.score || 0),
    submittedAt: row.submittedAt.toISOString(),
  }));
}

export async function getConsoleChampions(
  limit = 50,
  options: { surface?: GameSurface } = {}
) {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const rows = await db.execute(sql`
    WITH best_scores AS (
      SELECT
        cs.game_id,
        cs.user_id,
        MAX(cs.score) AS score,
        MIN(cs.submitted_at) AS submitted_at
      FROM console_scores cs
      WHERE cs.valid = true
      GROUP BY cs.game_id, cs.user_id
    ),
    ranked AS (
      SELECT
        bs.*,
        ROW_NUMBER() OVER (
          PARTITION BY bs.game_id
          ORDER BY bs.score DESC, bs.submitted_at ASC, bs.user_id ASC
        ) AS rank
      FROM best_scores bs
    )
    SELECT
      cg.slug,
      cg.title,
      cg.cover_uri,
      cg.category,
      ranked.user_id,
      u.username,
      u.display_name,
      ranked.score,
      ranked.submitted_at
    FROM ranked
    INNER JOIN console_games cg ON cg.id = ranked.game_id
    LEFT JOIN users u ON u.id = ranked.user_id
    WHERE ranked.rank = 1
      AND cg.active = true
      AND cg.status = 'active'
      AND cg.is_public = true
      AND ${gameSurfaceAliasSql(options.surface ?? "any", "cg")}
    ORDER BY ranked.score DESC, ranked.submitted_at ASC
    LIMIT ${safeLimit}
  `);

  return (((rows as any).rows ?? []) as any[]).map((row) => ({
    slug: String(row.slug),
    title: String(row.title),
    coverUri: row.cover_uri ? String(row.cover_uri) : null,
    category: String(row.category || "general"),
    userId: Number(row.user_id),
    username: String(row.username || `user-${row.user_id}`),
    displayName: row.display_name ? String(row.display_name) : null,
    score: Number(row.score),
    submittedAt: row.submitted_at
      ? new Date(row.submitted_at).toISOString()
      : null,
  }));
}

export async function getConsolePlayerLeaderboard(
  limit = 50,
  options: { surface?: GameSurface } = {}
): Promise<ConsolePlayerLeaderboardEntry[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const rows = await db.execute(sql`
    WITH playable_stats AS (
      SELECT
        cps.game_id,
        cps.user_id,
        cps.plays,
        cps.best_score,
        cps.total_score,
        cps.last_played_at,
        cps.updated_at
      FROM console_player_stats cps
      INNER JOIN console_games cg ON cg.id = cps.game_id
      WHERE cg.active = true
        AND cg.status = 'active'
        AND cg.is_public = true
        AND ${gameSurfaceAliasSql(options.surface ?? "any", "cg")}
    ),
    ranked_stats AS (
      SELECT
        ps.*,
        ROW_NUMBER() OVER (
          PARTITION BY ps.game_id
          ORDER BY ps.best_score DESC, ps.updated_at ASC, ps.user_id ASC
        ) AS game_rank
      FROM playable_stats ps
    ),
    player_xp AS (
      SELECT
        xe.user_id,
        COALESCE(SUM(xe.amount), 0)::int AS console_xp
      FROM xp_events xe
      INNER JOIN console_games xp_games ON xp_games.id::text = xe.metadata->>'gameId'
      WHERE xe.metadata->>'source' = 'console'
        AND ${gameSurfaceAliasSql(options.surface ?? "any", "xp_games")}
      GROUP BY xe.user_id
    ),
    aggregate_players AS (
      SELECT
        rs.user_id,
        u.username,
        u.display_name,
        COUNT(*)::int AS games_played,
        COALESCE(SUM(rs.plays), 0)::int AS total_plays,
        COALESCE(SUM(rs.total_score), 0) AS total_score,
        COALESCE(MAX(rs.best_score), 0) AS best_score,
        COUNT(*) FILTER (WHERE rs.game_rank = 1)::int AS first_place_count,
        COALESCE(px.console_xp, 0)::int AS console_xp,
        MAX(rs.last_played_at) AS last_played_at
      FROM ranked_stats rs
      LEFT JOIN users u ON u.id = rs.user_id
      LEFT JOIN player_xp px ON px.user_id = rs.user_id
      GROUP BY rs.user_id, u.username, u.display_name, px.console_xp
    )
    SELECT
      ROW_NUMBER() OVER (
        ORDER BY console_xp DESC, total_score DESC, total_plays DESC, user_id ASC
      ) AS rank,
      *
    FROM aggregate_players
    ORDER BY console_xp DESC, total_score DESC, total_plays DESC, user_id ASC
    LIMIT ${safeLimit}
  `);

  return (((rows as any).rows ?? []) as any[]).map((row) => ({
    rank: Number(row.rank),
    userId: Number(row.user_id),
    username: String(row.username || `user-${row.user_id}`),
    displayName: row.display_name ? String(row.display_name) : null,
    gamesPlayed: Number(row.games_played || 0),
    totalPlays: Number(row.total_plays || 0),
    totalScore: Number(row.total_score || 0),
    bestScore: Number(row.best_score || 0),
    firstPlaceCount: Number(row.first_place_count || 0),
    consoleXp: Number(row.console_xp || 0),
    lastPlayedAt: row.last_played_at
      ? new Date(row.last_played_at).toISOString()
      : null,
  }));
}

export async function getConsolePlayerProfile(
  usernameOrId: string,
  limit = 50,
  options: { surface?: GameSurface } = {}
) {
  const lookup = String(usernameOrId || "").trim();
  if (!lookup) throw new Error("Missing console player.");
  const numericId = Number(lookup);
  const [player] = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
    })
    .from(users)
    .where(
      Number.isInteger(numericId) && numericId > 0
        ? or(eq(users.id, numericId), eq(users.username, lookup))
        : eq(users.username, lookup)
    )
    .limit(1);
  if (!player) throw new Error("Console player not found.");

  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const rows = await db.execute(sql`
    WITH player_stats AS (
      SELECT
        cps.game_id,
        cps.plays,
        cps.best_score,
        cps.total_score,
        cps.last_played_at
      FROM console_player_stats cps
      WHERE cps.user_id = ${player.id}
    ),
    ranked AS (
      SELECT
        ps.game_id,
        1 + COUNT(other.user_id) AS rank
      FROM player_stats ps
      LEFT JOIN console_player_stats other
        ON other.game_id = ps.game_id
       AND other.best_score > ps.best_score
      GROUP BY ps.game_id
    )
    SELECT
      cg.slug,
      cg.title,
      cg.cover_uri,
      cg.category,
      ps.plays,
      ps.best_score,
      ps.total_score,
      ps.last_played_at,
      ranked.rank
    FROM player_stats ps
    INNER JOIN console_games cg ON cg.id = ps.game_id
    LEFT JOIN ranked ON ranked.game_id = ps.game_id
    WHERE cg.active = true
      AND cg.status = 'active'
      AND cg.is_public = true
      AND ${gameSurfaceAliasSql(options.surface ?? "any", "cg")}
    ORDER BY ps.best_score DESC, ps.last_played_at DESC NULLS LAST
    LIMIT ${safeLimit}
  `);

  const games = (((rows as any).rows ?? []) as any[]).map((row) => ({
    slug: String(row.slug),
    title: String(row.title),
    coverUri: row.cover_uri ? String(row.cover_uri) : null,
    category: String(row.category || "general"),
    plays: Number(row.plays || 0),
    bestScore: Number(row.best_score || 0),
    totalScore: Number(row.total_score || 0),
    rank: Number(row.rank || 1),
    lastPlayedAt: row.last_played_at
      ? new Date(row.last_played_at).toISOString()
      : null,
  }));

  const [{ consoleXp = 0 } = { consoleXp: 0 }] = await db
    .select({
      consoleXp: sql<number>`COALESCE(SUM(${xpEvents.amount}), 0)::int`,
    })
    .from(xpEvents)
    .innerJoin(consoleGames, sql`${consoleGames.id}::text = ${xpEvents.metadata}->>'gameId'`)
    .where(
      and(
        eq(xpEvents.userId, player.id),
        sql`${xpEvents.metadata}->>'source' = 'console'`,
        gameSurfaceSql(options.surface ?? "any")
      )
    );

  return {
    player: {
      id: player.id,
      username: player.username,
      displayName: player.displayName ?? null,
    },
    summary: {
      gamesPlayed: games.length,
      totalPlays: games.reduce((sum, game) => sum + game.plays, 0),
      totalScore: games.reduce((sum, game) => sum + game.totalScore, 0),
      firstPlaceCount: games.filter((game) => game.rank === 1).length,
      consoleXp: Number(consoleXp || 0),
    },
    games,
  };
}

async function loadPlayableGame(slug: string, surface: GameSurface = "any") {
  const normalizedSlug = String(slug || "").trim();
  if (!normalizedSlug) throw new Error("Missing console game slug.");
  const [game] = await db
    .select()
    .from(consoleGames)
    .where(
      and(
        eq(consoleGames.slug, normalizedSlug),
        eq(consoleGames.active, true),
        eq(consoleGames.status, "active"),
        eq(consoleGames.isPublic, true),
        gameSurfaceSql(surface)
      )
    )
    .limit(1);
  if (!game) {
    throw new Error(
      surface === "arcade"
        ? "WTF Arcade game not found or not playable."
        : surface === "console"
          ? "Console game not found or not playable."
          : "Game not found or not playable."
    );
  }
  return game;
}

function normalizeScore(value: unknown): number {
  const score = Number(value);
  if (!Number.isFinite(score)) throw new Error("Score must be a finite number.");
  if (score < 0) throw new Error("Score must be zero or greater.");
  if (score > Number.MAX_SAFE_INTEGER) throw new Error("Score is too large.");
  return Math.floor(score);
}

function validateScoreAgainstCaps(input: {
  score: number;
  issuedAt: Date;
  now: Date;
  maxPossibleScore: number | null;
  maxScorePerSecond: number | null;
}): string | null {
  if (input.maxPossibleScore != null && input.score > input.maxPossibleScore) {
    return "Score exceeds this game's configured maximum.";
  }

  if (input.maxScorePerSecond != null && input.maxScorePerSecond > 0) {
    const elapsedSeconds = Math.max(
      1,
      Math.floor((input.now.getTime() - input.issuedAt.getTime()) / 1000)
    );
    if (input.score / elapsedSeconds > input.maxScorePerSecond) {
      return "Score exceeded this game's speed cap.";
    }
  }

  return null;
}

export function createConsoleTicket(
  payload: ConsoleTicketPayload,
  secret: string
): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signConsoleTicketPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifyConsoleTicket(
  ticket: string,
  expected: {
    gameId: number;
    slug: string;
    userId: number;
    runId: string;
    expiresAt: Date;
  },
  secret: string,
  now = new Date()
): { ok: true; payload: ConsoleTicketPayload } | { ok: false; reason: string } {
  const [encodedPayload, signature, extra] = String(ticket || "").split(".");
  if (!encodedPayload || !signature || extra !== undefined) {
    return { ok: false, reason: "Console play ticket signature is missing." };
  }

  const expectedSignature = signConsoleTicketPayload(encodedPayload, secret);
  if (!safeSignatureEqual(signature, expectedSignature)) {
    return { ok: false, reason: "Console play ticket signature is invalid." };
  }

  let payload: ConsoleTicketPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "Console play ticket payload is invalid." };
  }

  if (payload.v !== TICKET_VERSION) {
    return { ok: false, reason: "Console play ticket version is unsupported." };
  }
  if (
    payload.gameId !== expected.gameId ||
    payload.slug !== expected.slug ||
    payload.userId !== expected.userId ||
    payload.runId !== expected.runId
  ) {
    return { ok: false, reason: "Console play ticket does not match this run." };
  }

  const payloadExpiresAt = new Date(payload.expiresAt);
  if (!Number.isFinite(payloadExpiresAt.getTime())) {
    return { ok: false, reason: "Console play ticket expiry is invalid." };
  }
  if (payloadExpiresAt.getTime() !== expected.expiresAt.getTime()) {
    return { ok: false, reason: "Console play ticket expiry does not match this run." };
  }
  if (payloadExpiresAt.getTime() < now.getTime()) {
    return { ok: false, reason: "Console play ticket expired." };
  }

  return { ok: true, payload };
}

function signConsoleTicketPayload(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function safeSignatureEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.byteLength !== right.byteLength) return false;
  return timingSafeEqual(left, right);
}

function consoleTicketSigningSecret(game: Pick<typeof consoleGames.$inferSelect, "slug" | "hmacSecret">): string {
  const serverSecret =
    process.env.CONSOLE_TICKET_SIGNING_SECRET ||
    process.env.SESSION_SECRET ||
    "development-console-ticket-secret";
  return `${serverSecret}:${game.hmacSecret || game.slug}`;
}

function digestTicket(ticket: string): string {
  return createHmac("sha256", "console-ticket-digest")
    .update(ticket)
    .digest("hex")
    .slice(0, 24);
}

async function awardConsoleScoreXp(input: {
  userId: number;
  gameId: number;
  gameSlug: string;
  runId: string;
  score: number;
  playerRank: number | null;
  wasFirstPlay: boolean;
  isPersonalBest: boolean;
  surface: GameSurface;
}) {
  const metadata = { surface: input.surface };
  const awards: Array<ReturnType<typeof awardConsolePlayerXpSafely>> = [
    awardConsolePlayerXpSafely({
      userId: input.userId,
      gameId: input.gameId,
      gameSlug: input.gameSlug,
      eventType: "score_submit",
      runId: input.runId,
      score: input.score,
      rank: input.playerRank,
      metadata,
    }),
  ];

  if (input.wasFirstPlay) {
    awards.push(
      awardConsolePlayerXpSafely({
        userId: input.userId,
        gameId: input.gameId,
        gameSlug: input.gameSlug,
        eventType: "first_play",
        runId: input.runId,
        score: input.score,
        rank: input.playerRank,
        metadata,
      })
    );
  }

  if (input.isPersonalBest) {
    awards.push(
      awardConsolePlayerXpSafely({
        userId: input.userId,
        gameId: input.gameId,
        gameSlug: input.gameSlug,
        eventType: "personal_best",
        runId: input.runId,
        score: input.score,
        rank: input.playerRank,
        metadata,
      })
    );
  }

  if (input.playerRank === 1) {
    awards.push(
      awardConsolePlayerXpSafely({
        userId: input.userId,
        gameId: input.gameId,
        gameSlug: input.gameSlug,
        eventType: "game_champion",
        runId: input.runId,
        score: input.score,
        rank: input.playerRank,
        metadata,
      })
    );
  }

  return Promise.all(awards);
}

async function recordRejectedScoreAttempt(input: {
  game: typeof consoleGames.$inferSelect;
  user: ConsoleAuthUser;
  runId: string | null;
  score: number | null;
  rawScore: unknown;
  reason: string;
  payload?: Record<string, unknown>;
  now: Date;
  consumeTicketId: number | null;
}) {
  const payload = input.payload && typeof input.payload === "object" ? input.payload : {};
  const auditPayload = {
    slug: input.game.slug,
    runId: input.runId,
    score: input.score,
    rawScoreType: typeof input.rawScore,
    payload,
    rejectedAt: input.now.toISOString(),
    consumedTicket: Boolean(input.consumeTicketId),
  };

  if (input.score != null && Number.isFinite(input.score)) {
    await db
      .insert(consoleScores)
      .values({
        gameId: input.game.id,
        userId: input.user.id,
        score: input.score,
        runId: input.consumeTicketId ? input.runId : null,
        ticketPayloadJson: {
          ...payload,
          source: "console-sdk",
          rejectedAt: input.now.toISOString(),
        },
        valid: false,
        rejectReason: input.reason,
        verificationMode: input.game.verificationMode,
        submittedAt: input.now,
      })
      .catch((error) => {
        console.warn("[console] failed to persist rejected score row:", error);
      });
  }

  await db
    .insert(consoleAuditEvents)
    .values({
      gameId: input.game.id,
      actorUserId: input.user.id,
      action: "score_rejected",
      reason: input.reason,
      payloadJson: auditPayload,
    })
    .catch((error) => {
      console.warn("[console] failed to persist rejected score audit:", error);
    });

  if (input.consumeTicketId) {
    await db
      .update(consolePlayTickets)
      .set({ usedAt: input.now })
      .where(eq(consolePlayTickets.id, input.consumeTicketId))
      .catch((error) => {
        console.warn("[console] failed to consume rejected score ticket:", error);
      });
  }
}
