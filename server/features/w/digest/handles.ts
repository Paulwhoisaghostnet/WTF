import { asc, eq } from "drizzle-orm";
import { db } from "../../../db";
import { wDigestHandles } from "@shared/schema";

export const DEFAULT_W_DIGEST_HANDLES = [
  "tezos",
  "tezoscommons",
  "artontezos_",
  "thetezos",
  "tezosartnetwork",
  "transparentart",
] as const;

export function normalizeDigestHandle(raw: string): string | null {
  const cleaned = String(raw || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
  if (!cleaned) return null;
  if (!/^[a-z0-9_]{1,15}$/.test(cleaned)) return null;
  return cleaned;
}

export async function listDigestHandles() {
  return db.select().from(wDigestHandles).orderBy(asc(wDigestHandles.handle));
}

export async function listEnabledDigestHandles() {
  return db
    .select()
    .from(wDigestHandles)
    .where(eq(wDigestHandles.enabled, true))
    .orderBy(asc(wDigestHandles.handle));
}

export async function upsertDigestHandle(input: {
  handle: string;
  enabled?: boolean;
  notes?: string | null;
}) {
  const handle = normalizeDigestHandle(input.handle);
  if (!handle) throw new Error("invalid_handle");
  const now = new Date();
  const [row] = await db
    .insert(wDigestHandles)
    .values({
      handle,
      enabled: input.enabled ?? true,
      notes: input.notes ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: wDigestHandles.handle,
      set: {
        enabled: input.enabled ?? true,
        notes: input.notes ?? null,
        updatedAt: now,
      },
    })
    .returning();
  return row;
}

export async function removeDigestHandle(handle: string) {
  const normalized = normalizeDigestHandle(handle);
  if (!normalized) throw new Error("invalid_handle");
  await db.delete(wDigestHandles).where(eq(wDigestHandles.handle, normalized));
}

export async function replaceDigestHandles(handles: string[]) {
  const normalized = Array.from(
    new Set(
      handles
        .map((h) => normalizeDigestHandle(h))
        .filter((h): h is string => Boolean(h))
    )
  );
  if (normalized.length === 0) throw new Error("at_least_one_handle_required");

  const existing = await listDigestHandles();
  const keep = new Set(normalized);
  for (const row of existing) {
    if (!keep.has(row.handle)) {
      await db.delete(wDigestHandles).where(eq(wDigestHandles.handle, row.handle));
    }
  }
  for (const handle of normalized) {
    await upsertDigestHandle({ handle, enabled: true });
  }
  return listDigestHandles();
}
