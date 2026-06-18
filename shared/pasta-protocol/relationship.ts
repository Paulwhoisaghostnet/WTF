/**
 * Pasta Protocol — ownership relationship metadata helpers.
 *
 * Pure, dependency-free. These embed/extract the optional Wallet -> Franchise -> Collection -> Token
 * relationship block in contract/token metadata JSON without enforcing any hierarchy (MVP rule).
 */
import type { OwnershipRelationshipMetadata } from "./types";

/** Metadata JSON key under which the relationship block is stored. */
export const RELATIONSHIP_METADATA_KEY = "relationships" as const;

const STRING_FIELDS = [
  "parent_contract",
  "franchise_contract",
  "collection_group",
  "publisher_contract",
] as const;

const STRING_ARRAY_FIELDS = ["related_contracts", "ownership_chain"] as const;

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function cleanStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const cleaned = value
    .map((item) => cleanString(item))
    .filter((item): item is string => Boolean(item));
  const deduped = [...new Set(cleaned)];
  return deduped.length > 0 ? deduped : undefined;
}

/**
 * Returns a sanitized relationship object with empty/blank fields omitted, or `undefined` when no
 * meaningful field is present.
 */
export function sanitizeRelationshipMetadata(
  relationship: OwnershipRelationshipMetadata | undefined | null
): OwnershipRelationshipMetadata | undefined {
  if (!relationship || typeof relationship !== "object") return undefined;

  const result: OwnershipRelationshipMetadata = {};
  for (const field of STRING_FIELDS) {
    const value = cleanString(relationship[field]);
    if (value) result[field] = value;
  }
  for (const field of STRING_ARRAY_FIELDS) {
    const value = cleanStringArray(relationship[field]);
    if (value) result[field] = value;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Returns a shallow copy of `metadata` with the sanitized relationship block embedded under
 * {@link RELATIONSHIP_METADATA_KEY}. When the relationship is empty, the key is omitted entirely so
 * exports stay clean and round-trippable.
 */
export function mergeRelationshipMetadata<T extends Record<string, unknown>>(
  metadata: T,
  relationship: OwnershipRelationshipMetadata | undefined | null
): T {
  const sanitized = sanitizeRelationshipMetadata(relationship);
  if (!sanitized) {
    if (RELATIONSHIP_METADATA_KEY in metadata) {
      const copy = { ...metadata };
      delete (copy as Record<string, unknown>)[RELATIONSHIP_METADATA_KEY];
      return copy;
    }
    return { ...metadata };
  }
  return { ...metadata, [RELATIONSHIP_METADATA_KEY]: sanitized };
}

/** Reads a relationship block back out of metadata JSON, sanitized. */
export function extractRelationshipMetadata(
  metadata: Record<string, unknown> | undefined | null
): OwnershipRelationshipMetadata | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const block = metadata[RELATIONSHIP_METADATA_KEY];
  if (!block || typeof block !== "object") return undefined;
  return sanitizeRelationshipMetadata(block as OwnershipRelationshipMetadata);
}
