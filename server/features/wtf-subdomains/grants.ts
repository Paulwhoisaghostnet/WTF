import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { users, userWallets, wtfSubdomainGrants } from "@shared/schema";
import type {
  WtfSubdomainGrantDto,
  WtfSubdomainGrantStatus,
} from "@shared/wtf-subdomains";

const LABEL_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

const RESERVED_LABELS = new Set([
  "admin",
  "api",
  "app",
  "bot",
  "dns",
  "ftp",
  "hack",
  "help",
  "mail",
  "null",
  "official",
  "root",
  "support",
  "system",
  "tez",
  "tezos",
  "undefined",
  "www",
  "wtf",
]);

export type WtfSubdomainLabelResult =
  | { ok: true; label: string }
  | { ok: false; error: string };

export interface WtfSubdomainUserSeed {
  id: number;
  username: string;
  displayName?: string | null;
}

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

export interface UpdateWtfSubdomainStatusInput {
  status: WtfSubdomainGrantStatus;
  opHash?: string | null;
  notes?: string | null;
}

export function getWtfParentDomain(): string {
  const raw = (
    process.env.WTF_DOMAINS_PARENT_DOMAIN ||
    process.env.WTF_TEZ_PARENT_DOMAIN ||
    "wtf.tez"
  )
    .trim()
    .toLowerCase();
  return raw.replace(/^\.+|\.+$/g, "") || "wtf.tez";
}

export function validateWtfSubdomainLabel(
  input: string,
  parentDomain = getWtfParentDomain()
): WtfSubdomainLabelResult {
  const normalizedParent = parentDomain.toLowerCase().replace(/^\.+|\.+$/g, "");
  let label = String(input || "").trim().toLowerCase();
  const suffix = `.${normalizedParent}`;
  if (label.endsWith(suffix)) label = label.slice(0, -suffix.length);

  if (!label) return { ok: false, error: "Subdomain label is required" };
  if (label.includes(".")) {
    return { ok: false, error: "Use only one label under wtf.tez" };
  }
  if (label.length < 3) {
    return { ok: false, error: "Subdomain label must be at least 3 characters" };
  }
  if (label.length > 63) {
    return { ok: false, error: "Subdomain label must be 63 characters or fewer" };
  }
  if (!LABEL_PATTERN.test(label)) {
    return {
      ok: false,
      error: "Use lowercase letters, numbers, and internal hyphens only",
    };
  }
  if (RESERVED_LABELS.has(label)) {
    return { ok: false, error: "That label is reserved" };
  }
  return { ok: true, label };
}

export function buildWtfSubdomainFullName(
  label: string,
  parentDomain = getWtfParentDomain()
): string {
  return `${label
    .toLowerCase()
    .replace(/^\.+|\.+$/g, "")}.${parentDomain
    .toLowerCase()
    .replace(/^\.+|\.+$/g, "")}`;
}

export function renderWtfSubdomainLabel(
  template: string | null | undefined,
  user: WtfSubdomainUserSeed
): string {
  const rawTemplate = template?.trim() || "{username}";
  const rendered = rawTemplate
    .replaceAll("{username}", user.username)
    .replaceAll("{displayName}", user.displayName || user.username)
    .replaceAll("{userId}", String(user.id));
  return slugify(rendered);
}

export async function listWtfSubdomainGrants(
  userId?: number
): Promise<WtfSubdomainGrantDto[]> {
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
  return rows as WtfSubdomainGrantDto[];
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
  const requestedLabel =
    input.label || renderWtfSubdomainLabel(input.labelTemplate, seed);
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
    return {
      ok: false as const,
      status: 409,
      error: `${fullName} is already granted`,
    };
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

export async function updateWtfSubdomainGrantStatus(
  id: number,
  input: UpdateWtfSubdomainStatusInput
) {
  const now = new Date();
  const [updated] = await db
    .update(wtfSubdomainGrants)
    .set({
      status: input.status,
      opHash: input.opHash ?? undefined,
      notes: input.notes ?? undefined,
      updatedAt: now,
      provisionedAt: input.status === "provisioned" ? now : undefined,
      revokedAt: input.status === "revoked" ? now : undefined,
    })
    .where(eq(wtfSubdomainGrants.id, id))
    .returning();

  return updated ?? null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 63);
}
