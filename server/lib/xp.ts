import { eq, sql, desc } from "drizzle-orm";
import { db } from "../db";
import { users, xpEvents } from "@shared/schema";

export interface AwardXpInput {
  userId: number;
  amount: number;
  reason: string;
  metadata?: Record<string, unknown> | null;
  awardedBy?: number | null;
}

export async function awardXp(input: AwardXpInput): Promise<{
  userId: number;
  totalXp: number;
  eventId: number;
}> {
  if (!Number.isFinite(input.amount) || !Number.isInteger(input.amount)) {
    throw new Error("XP amount must be an integer");
  }
  if (!input.reason || typeof input.reason !== "string") {
    throw new Error("XP reason is required");
  }

  const result = await db.transaction(async (tx) => {
    const [existingUser] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, input.userId));

    if (!existingUser) {
      throw new Error("User not found for XP award");
    }

    const [updated] = await tx
      .update(users)
      .set({
        experiencePoints: sql`GREATEST(0, ${users.experiencePoints} + ${input.amount})`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, input.userId))
      .returning({
        id: users.id,
        experiencePoints: users.experiencePoints,
      });

    const [event] = await tx
      .insert(xpEvents)
      .values({
        userId: input.userId,
        amount: input.amount,
        reason: input.reason,
        metadata: input.metadata ?? null,
        awardedBy: input.awardedBy ?? null,
      })
      .returning({ id: xpEvents.id });

    return {
      userId: updated.id,
      totalXp: updated.experiencePoints,
      eventId: event.id,
    };
  });

  void import("../challenges/events/ingest")
    .then(({ ingestSystemEvent }) =>
      ingestSystemEvent({
        eventId: `xp.awarded:${result.eventId}`,
        eventType: "xp.awarded",
        userId: input.userId,
        source: "xp_service",
        sourceModule: "rewards",
        rawRefType: "xp_event",
        rawRefId: result.eventId,
        metadata: {
          amount: input.amount,
          reason: input.reason,
          awardedBy: input.awardedBy ?? null,
          ...(input.metadata ?? {}),
        },
      })
    )
    .catch((err) =>
      console.warn("[xp] failed to emit xp.awarded SystemEvent", err)
    );

  return result;
}

export async function getUserXpEvents(userId: number, limit = 100) {
  const safeLimit = Math.max(1, Math.min(limit, 200));
  return db
    .select()
    .from(xpEvents)
    .where(eq(xpEvents.userId, userId))
    .orderBy(desc(xpEvents.createdAt))
    .limit(safeLimit);
}
