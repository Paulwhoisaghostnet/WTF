import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "../db";
import { userCurses } from "@shared/schema";
import {
  findWtfCurseDefinition,
  isWtfCurseKey,
  type WtfCurseKey,
  type WtfCurseStatus,
} from "@shared/curses";

type DbLike = typeof db;

function isMissingRelationError(err: unknown): boolean {
  const candidate = err as { code?: string; cause?: { code?: string } } | null;
  return candidate?.code === "42P01" || candidate?.cause?.code === "42P01";
}

function toCurseStatus(row: typeof userCurses.$inferSelect): WtfCurseStatus | null {
  if (!isWtfCurseKey(row.curseKey)) return null;
  return {
    ...findWtfCurseDefinition(row.curseKey),
    reason: row.reason,
    assignedBy: row.assignedBy,
    assignedAt: row.assignedAt,
    expiresAt: row.expiresAt,
  };
}

export async function listActiveUserCurses(
  userId: number,
  database: DbLike = db
): Promise<WtfCurseStatus[]> {
  if (!Number.isInteger(userId) || userId <= 0) return [];
  try {
    const now = new Date();
    const rows = await database
      .select()
      .from(userCurses)
      .where(
        and(
          eq(userCurses.userId, userId),
          eq(userCurses.active, true),
          or(isNull(userCurses.expiresAt), gt(userCurses.expiresAt, now))
        )
      );
    return rows.flatMap((row) => {
      const status = toCurseStatus(row);
      return status ? [status] : [];
    });
  } catch (err) {
    if (isMissingRelationError(err)) return [];
    throw err;
  }
}

export async function hasActiveUserCurse(
  userId: number,
  curseKey: WtfCurseKey,
  database: DbLike = db
): Promise<boolean> {
  const curses = await listActiveUserCurses(userId, database);
  return curses.some((curse) => curse.key === curseKey);
}

export async function setUserCurse(input: {
  userId: number;
  curseKey: WtfCurseKey;
  active: boolean;
  reason?: string | null;
  actorUserId?: number | null;
  expiresAt?: Date | null;
  database?: DbLike;
}): Promise<WtfCurseStatus[]> {
  const database = input.database ?? db;
  if (!Number.isInteger(input.userId) || input.userId <= 0) {
    throw new Error("Invalid user id");
  }
  if (!isWtfCurseKey(input.curseKey)) {
    throw new Error("Invalid curse key");
  }

  if (input.active) {
    await database
      .insert(userCurses)
      .values({
        userId: input.userId,
        curseKey: input.curseKey,
        active: true,
        reason: input.reason?.trim() || null,
        assignedBy: input.actorUserId ?? null,
        assignedAt: new Date(),
        expiresAt: input.expiresAt ?? null,
        liftedBy: null,
        liftedAt: null,
        metadata: {},
      })
      .onConflictDoUpdate({
        target: [userCurses.userId, userCurses.curseKey],
        set: {
          active: true,
          reason: input.reason?.trim() || null,
          assignedBy: input.actorUserId ?? null,
          assignedAt: new Date(),
          expiresAt: input.expiresAt ?? null,
          liftedBy: null,
          liftedAt: null,
          metadata: {},
        },
      });
  } else {
    await database
      .update(userCurses)
      .set({
        active: false,
        liftedBy: input.actorUserId ?? null,
        liftedAt: new Date(),
      })
      .where(
        and(
          eq(userCurses.userId, input.userId),
          eq(userCurses.curseKey, input.curseKey)
        )
      );
  }

  return listActiveUserCurses(input.userId, database);
}
