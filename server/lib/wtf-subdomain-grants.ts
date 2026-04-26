import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { users, userWallets, wtfSubdomainGrants } from "@shared/schema";
import {
  buildWtfSubdomainFullName,
  getWtfParentDomain,
  renderWtfSubdomainLabel,
  validateWtfSubdomainLabel,
  type WtfSubdomainUserSeed,
} from "./wtf-subdomains";

export interface GrantWtfSubdomainInput {
  userId: number;
  label?: string | null;
  labelTemplate?: string | null;
  walletAddress?: string | null;
  sourceType?: string;
  sourceId?: number | null;
  grantedBy?: number | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export async function listWtfSubdomainGrants(userId?: number) {
  const rows = await db
    .select({
      id: wtfSubdomainGrants.id,
      userId: wtfSubdomainGrants.userId,
      username: users.username,
      displayName: users.displayName,
      label: wtfSubdomainGrants.label,
      fullName: wtfSubdomainGrants.fullName,
      parentDomain: wtfSubdomainGrants.parentDomain,
      status: wtfSubdomainGrants.status,
      walletAddress: wtfSubdomainGrants.walletAddress,
      sourceType: wtfSubdomainGrants.sourceType,
      sourceId: wtfSubdomainGrants.sourceId,
      grantedBy: wtfSubdomainGrants.grantedBy,
      notes: wtfSubdomainGrants.notes,
      opHash: wtfSubdomainGrants.opHash,
      createdAt: wtfSubdomainGrants.createdAt,
      updatedAt: wtfSubdomainGrants.updatedAt,
      provisionedAt: wtfSubdomainGrants.provisionedAt,
      revokedAt: wtfSubdomainGrants.revokedAt,
    })
    .from(wtfSubdomainGrants)
    .leftJoin(users, eq(wtfSubdomainGrants.userId, users.id))
    .where(userId ? eq(wtfSubdomainGrants.userId, userId) : undefined)
    .orderBy(desc(wtfSubdomainGrants.createdAt));
  return rows;
}

export async function grantWtfSubdomainToUser(input: GrantWtfSubdomainInput) {
  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
    })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  if (!user) {
    return { ok: false as const, status: 404, error: "User not found" };
  }

  const seed: WtfSubdomainUserSeed = {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
  };
  const requestedLabel = input.label || renderWtfSubdomainLabel(input.labelTemplate, seed);
  const parentDomain = getWtfParentDomain();
  const labelResult = validateWtfSubdomainLabel(requestedLabel, parentDomain);
  if (!labelResult.ok) {
    return { ok: false as const, status: 400, error: labelResult.error };
  }

  const label = labelResult.label;
  const fullName = buildWtfSubdomainFullName(label, parentDomain);
  const [existing] = await db
    .select()
    .from(wtfSubdomainGrants)
    .where(
      and(
        eq(wtfSubdomainGrants.parentDomain, parentDomain),
        eq(wtfSubdomainGrants.label, label)
      )
    )
    .limit(1);

  if (existing) {
    if (existing.userId === input.userId) {
      return { ok: true as const, created: false, grant: existing };
    }
    return { ok: false as const, status: 409, error: `${fullName} is already granted` };
  }

  let walletAddress = input.walletAddress?.trim() || null;
  if (!walletAddress) {
    const [wallet] = await db
      .select({ walletAddress: userWallets.walletAddress })
      .from(userWallets)
      .where(eq(userWallets.userId, input.userId))
      .orderBy(desc(userWallets.isPrimary), desc(userWallets.linkedAt))
      .limit(1);
    walletAddress = wallet?.walletAddress ?? null;
  }

  const [grant] = await db
    .insert(wtfSubdomainGrants)
    .values({
      userId: input.userId,
      label,
      fullName,
      parentDomain,
      walletAddress,
      sourceType: input.sourceType ?? "admin",
      sourceId: input.sourceId ?? null,
      grantedBy: input.grantedBy ?? null,
      notes: input.notes ?? null,
      metadata: input.metadata,
    })
    .returning();

  return { ok: true as const, created: true, grant };
}
