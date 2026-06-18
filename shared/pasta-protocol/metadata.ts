/**
 * Pasta Protocol — TZIP-21 token and TZIP-16 collection metadata builders.
 *
 * Pure, dependency-free. Field shape mirrors the proven Macaroni studio output
 * (public/creation-tools/macaroni/js/studio.js) so packages stay compatible with the proven deploy
 * path. Undefined fields are omitted; the optional relationship block is embedded when present.
 */
import type { OwnershipRelationshipMetadata } from "./types";
import { mergeRelationshipMetadata } from "./relationship";

export type TokenFormat = { uri: string; mimeType: string };

export type BuildTokenMetadataInput = {
  name: string;
  description?: string;
  symbol?: string;
  decimals?: number;
  isBooleanAmount?: boolean;
  artifactUri?: string;
  displayUri?: string;
  thumbnailUri?: string;
  mimeType?: string;
  creators?: string[];
  minter?: string;
  royalties?: Record<string, unknown>;
  tags?: string[];
  attributes?: Array<{ name: string; value: string }>;
  relationship?: OwnershipRelationshipMetadata;
  /** Extra namespaced fields merged last (e.g. app-specific blocks). */
  extra?: Record<string, unknown>;
};

function omitUndefined<T extends Record<string, unknown>>(record: T): T {
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) delete record[key];
  }
  return record;
}

function dedupeNonEmpty(values: readonly string[] | undefined): string[] | undefined {
  if (!values) return undefined;
  const cleaned = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
  return cleaned.length > 0 ? cleaned : undefined;
}

/** Builds a TZIP-21 token metadata object ready to pin. */
export function buildTokenMetadata(input: BuildTokenMetadataInput): Record<string, unknown> {
  const artifact = input.artifactUri?.trim() || undefined;
  const display = input.displayUri?.trim() || artifact;
  const thumbnail = input.thumbnailUri?.trim() || display;

  const formats: TokenFormat[] = [];
  if (artifact && input.mimeType) formats.push({ uri: artifact, mimeType: input.mimeType });

  const attributes =
    input.attributes && input.attributes.length > 0
      ? input.attributes
          .filter((attr) => attr && typeof attr.name === "string" && attr.name.trim().length > 0)
          .map((attr) => ({ name: attr.name.trim(), value: String(attr.value ?? "") }))
      : undefined;

  const base = omitUndefined({
    name: input.name,
    description: input.description,
    symbol: input.symbol,
    decimals: input.decimals ?? 0,
    isBooleanAmount: input.isBooleanAmount ?? false,
    artifactUri: artifact,
    displayUri: display,
    thumbnailUri: thumbnail,
    minter: input.minter?.trim() || undefined,
    creators: dedupeNonEmpty(input.creators),
    formats: formats.length > 0 ? formats : undefined,
    tags: dedupeNonEmpty(input.tags),
    attributes: attributes && attributes.length > 0 ? attributes : undefined,
    royalties: input.royalties,
    ...(input.extra ?? {}),
  });

  return mergeRelationshipMetadata(base, input.relationship);
}

export type BuildCollectionMetadataInput = {
  name: string;
  description?: string;
  symbol?: string;
  version?: string;
  license?: string | { name: string; details?: string };
  authors?: string[];
  homepage?: string;
  /** ipfs:// cover/logo image for the collection. */
  imageUri?: string;
  interfaces?: string[];
  relationship?: OwnershipRelationshipMetadata;
  extra?: Record<string, unknown>;
};

const DEFAULT_INTERFACES = ["TZIP-012", "TZIP-016", "TZIP-021"] as const;

/** Builds a TZIP-16 collection (contract) metadata object ready to pin/originate. */
export function buildCollectionMetadata(
  input: BuildCollectionMetadataInput
): Record<string, unknown> {
  const base = omitUndefined({
    name: input.name,
    description: input.description,
    symbol: input.symbol,
    version: input.version,
    license: input.license,
    authors: dedupeNonEmpty(input.authors),
    homepage: input.homepage?.trim() || undefined,
    imageUri: input.imageUri?.trim() || undefined,
    interfaces: dedupeNonEmpty(input.interfaces) ?? [...DEFAULT_INTERFACES],
    ...(input.extra ?? {}),
  });

  return mergeRelationshipMetadata(base, input.relationship);
}
