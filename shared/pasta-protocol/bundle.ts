/**
 * Pasta Protocol — bundle contents manifest (Ravioli).
 *
 * Pure, dependency-free builder for the off-chain bundle manifest pinned alongside a bundle wrapper
 * token. The on-chain `PastaBundleFA2` only stores the manifest URI (`contents_uri`); the member list
 * lives here so it round-trips and can be revealed later for mystery packs. Mirrored byte-for-byte in
 * the browser port (`pasta-foundation.js`) and locked by tests/unit/pasta-foundation-parity.test.mjs.
 */
import type { OwnershipRelationshipMetadata } from "./types";
import { sanitizeRelationshipMetadata } from "./relationship";

export const BUNDLE_MANIFEST_SCHEMA_VERSION = "wtfos.pasta.bundle-manifest.v1";

export type BundleMember = {
  name?: string;
  description?: string;
  uri?: string;
  mimeType?: string;
  tokenContract?: string;
  tokenId?: number;
  quantity?: number;
};

export type BuildBundleManifestInput = {
  name: string;
  description?: string;
  members: BundleMember[];
  mystery?: boolean;
  relationship?: OwnershipRelationshipMetadata | null;
};

function cleanStr(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function cleanInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const n = Math.floor(value);
  return n >= 0 ? n : undefined;
}

/** Normalizes a single member, dropping empty fields. Returns undefined if nothing meaningful remains. */
export function normalizeBundleMember(member: BundleMember): BundleMember | undefined {
  const out: BundleMember = {};
  const name = cleanStr(member?.name);
  const description = cleanStr(member?.description);
  const uri = cleanStr(member?.uri);
  const mimeType = cleanStr(member?.mimeType);
  const tokenContract = cleanStr(member?.tokenContract);
  const tokenId = cleanInt(member?.tokenId);
  const quantity = cleanInt(member?.quantity);
  if (name) out.name = name;
  if (description) out.description = description;
  if (uri) out.uri = uri;
  if (mimeType) out.mimeType = mimeType;
  if (tokenContract) out.tokenContract = tokenContract;
  if (tokenId !== undefined) out.tokenId = tokenId;
  if (quantity !== undefined) out.quantity = quantity;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Builds the bundle contents manifest object ready to pin. */
export function buildBundleManifest(input: BuildBundleManifestInput): Record<string, unknown> {
  const members = (Array.isArray(input.members) ? input.members : [])
    .map(normalizeBundleMember)
    .filter((m): m is BundleMember => m !== undefined);
  const manifest: Record<string, unknown> = {
    schemaVersion: BUNDLE_MANIFEST_SCHEMA_VERSION,
    name: cleanStr(input.name) ?? "Untitled Bundle",
    mystery: input.mystery === true,
    itemCount: members.length,
    members,
  };
  const description = cleanStr(input.description);
  if (description) manifest.description = description;
  const relationship = sanitizeRelationshipMetadata(input.relationship);
  if (relationship) manifest.relationship = relationship;
  return manifest;
}
