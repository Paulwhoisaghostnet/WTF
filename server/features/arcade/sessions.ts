import { db } from "../../db";
import { consoleAuditEvents } from "@shared/schema";
import {
  createConsolePlaySession,
  submitConsoleScore,
  type ConsoleScoreInput,
} from "../console/scoring";
import type { ConsoleAuthUser } from "../console/types";
import { getArcadeCartridgeBySlug, getDbBackedArcadeGameBySlug } from "./catalog";
import { consumeArcadePlayTicket, createArcadePlayIntent } from "./payment";

export async function createArcadePlaySession(
  user: ConsoleAuthUser,
  slug: string,
  context: { userAgent?: string; ip?: string; walletAddress?: string | null } = {}
) {
  const cart = await getArcadeCartridgeBySlug(slug);
  if (!cart) throw new Error("WTF Arcade game not found.");

  const ticket = await consumeArcadePlayTicket(user, cart.slug);
  if (!ticket.ok) {
    const intent = await createArcadePlayIntent({
      userId: user.id,
      walletAddress: context.walletAddress,
    }).catch(() => null);
    const error = new Error(
      ticket.message ||
        "Windows Arcade Error: You need a WTF Arcade Play Pass Card loaded with credits to play this game."
    ) as Error & { statusCode?: number; intent?: unknown };
    error.statusCode = 402;
    error.intent = intent;
    throw error;
  }

  const dbGame = await getDbBackedArcadeGameBySlug(slug);
  if (dbGame) {
    const session = await createConsolePlaySession(user, slug, context, {
      surface: "arcade",
    });
    await auditArcadePlay(user.id, dbGame.id, slug, ticket);
    return {
      ...session,
    arcade: {
      ticketConsumed: ticket.consumed,
      bypass: ticket.bypass,
      creditsPerPlay: ticket.creditsPerPlay,
      remainingCredits: ticket.remaining ?? null,
    },
  };
  }

  await auditArcadePlay(user.id, null, slug, ticket);
  return {
    runId: null,
    sessionId: null,
    ticket: null,
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    game: {
      slug: cart.slug,
      title: cart.title,
      maxPossibleScore: null,
      maxScorePerSecond: null,
    },
    player: {
      id: user.id,
      username: user.username,
      displayName: user.displayName ?? null,
      avatarUrl: user.avatarUrl ?? null,
    },
    arcade: {
      ticketConsumed: ticket.consumed,
      bypass: ticket.bypass,
      creditsPerPlay: ticket.creditsPerPlay,
      remainingCredits: ticket.remaining ?? null,
      leaderboardEnabled: false,
    },
  };
}

export async function submitArcadeScore(user: ConsoleAuthUser, input: ConsoleScoreInput) {
  return submitConsoleScore(user, input, { surface: "arcade" });
}

async function auditArcadePlay(
  userId: number,
  gameId: number | null,
  slug: string,
  ticket: Awaited<ReturnType<typeof consumeArcadePlayTicket>>
) {
  await db.insert(consoleAuditEvents).values({
    gameId,
    actorUserId: userId,
    action: ticket.bypass ? "arcade_play_bypass" : "arcade_play_credit_consumed",
    reason: ticket.bypass
      ? "Trusted/admin WTF Arcade fee bypass"
      : "WTF Arcade Play Pass credit consumed",
    payloadJson: {
      surface: "arcade",
      slug,
      ticketConsumed: ticket.consumed,
      bypass: ticket.bypass,
      creditsPerPlay: ticket.creditsPerPlay,
      remainingCredits: ticket.remaining ?? null,
    },
  });
}
