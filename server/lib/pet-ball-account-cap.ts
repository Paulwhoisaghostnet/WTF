import { sql, type SQLWrapper } from "drizzle-orm";

export const PET_BALL_MAX_OWNED = 3;

const PET_BALL_CAP_LOCK_NAMESPACE = 0x575446;

type SqlExecutor = {
  execute: (query: string | SQLWrapper) => unknown;
};

export function itemMetadataKind(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const kind = (metadata as Record<string, unknown>).kind;
  return typeof kind === "string" ? kind : null;
}

export function isPetBallItem(sku: string, kind: string | null): boolean {
  return sku === "pet-ball" || kind === "ball" || kind === "toy-ball";
}

export function petBallAccountCapDecision(
  owned: number,
  requested: number,
  limit = PET_BALL_MAX_OWNED
): { ok: true; owned: number; requested: number; limit: number; remaining: number } | {
  ok: false;
  owned: number;
  requested: number;
  limit: number;
  remaining: number;
} {
  const normalizedOwned = Math.max(0, Math.floor(Number.isFinite(owned) ? owned : 0));
  const normalizedRequested = Math.max(0, Math.floor(Number.isFinite(requested) ? requested : 0));
  const normalizedLimit = Math.max(0, Math.floor(Number.isFinite(limit) ? limit : PET_BALL_MAX_OWNED));
  const remaining = Math.max(0, normalizedLimit - normalizedOwned);
  if (normalizedRequested <= remaining) {
    return {
      ok: true,
      owned: normalizedOwned,
      requested: normalizedRequested,
      limit: normalizedLimit,
      remaining,
    };
  }
  return {
    ok: false,
    owned: normalizedOwned,
    requested: normalizedRequested,
    limit: normalizedLimit,
    remaining,
  };
}

export async function lockPetBallAccountCap(queryDb: SqlExecutor, userId: number): Promise<void> {
  const normalizedUserId = Math.max(0, Math.floor(Number.isFinite(userId) ? userId : 0));
  await queryDb.execute(sql`SELECT pg_advisory_xact_lock(${PET_BALL_CAP_LOCK_NAMESPACE}, ${normalizedUserId})`);
}
