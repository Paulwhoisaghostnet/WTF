import { db } from "../../db";
import { ingestSystemEvent } from "../../challenges/events/ingest";
import { syncChallengeEvent, syncRoundEvent } from "../../lib/calendar-sync";
import { challenges } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createGameshowService, type GameshowEvent } from "./service";
import { createGameshowEditing } from "./editing";
import { createGameshowComposer } from "./composer";
import { createGameshowProgress } from "./progress";

async function publishGameshowEvent(event: GameshowEvent) {
  const effects: Promise<unknown>[] = [ingestSystemEvent({
    eventId: `gameshow-operator-${event.id}`,
    eventType: "app.interaction.tracked",
    userId: event.actorUserId,
    source: "gameshow",
    sourceModule: "gameshow",
    rawRefType: "operator_action",
    rawRefId: event.id,
    metadata: { handle: event.action, seasonId: event.seasonId, targetId: event.targetId, trustLevel: "server" },
  })];
  if (event.action.startsWith("gameshow.round.")) {
    effects.push(syncRoundEvent(event.targetId));
    effects.push((async () => {
      const rows = await db.select({ id: challenges.id }).from(challenges).where(eq(challenges.roundId, event.targetId));
      await Promise.all(rows.map((challenge) => syncChallengeEvent(challenge.id)));
    })());
  }
  if (event.action === "gameshow.challenge.edited") effects.push(syncChallengeEvent(event.targetId));
  const results = await Promise.allSettled(effects);
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failures.length) throw new AggregateError(failures.map((result) => result.reason), "Gameshow event/calendar projection failed; authoritative state is committed");
}

export const gameshowService = createGameshowService(db, publishGameshowEvent);
export const gameshowEditing = createGameshowEditing(db, publishGameshowEvent);
export const gameshowComposer = createGameshowComposer(db, publishGameshowEvent);
export const gameshowProgress = createGameshowProgress(db);
