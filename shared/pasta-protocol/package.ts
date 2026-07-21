/**
 * Pasta Protocol — CH-EASE package builders, guards, and validators.
 *
 * Pure, dependency-free. Implements the `wtfos.pasta.chease-package.v1` contract that CH-EASE produces
 * and publishing apps (Spaghetti, etc.) consume.
 */
import type {
  CheaseCollectionPackage,
  CheasePackage,
  CheaseSingleTokenPackage,
  CheaseTokenItem,
  OwnershipRelationshipMetadata,
  PastaAppId,
} from "./types";
import { sanitizeRelationshipMetadata } from "./relationship";

export const CHEASE_PACKAGE_SCHEMA_VERSION = "wtfos.pasta.chease-package.v1" as const;

const PASTA_APP_IDS: readonly PastaAppId[] = [
  "macaroni",
  "spaghetti",
  "gnocchi",
  "ravioli",
  "rotini",
  "penne",
  "lasagna",
  "chease",
  "colander",
];

export function isPastaAppId(value: unknown): value is PastaAppId {
  return typeof value === "string" && (PASTA_APP_IDS as readonly string[]).includes(value);
}

function normalizeAttributes(
  attributes: CheaseTokenItem["attributes"]
): CheaseTokenItem["attributes"] {
  if (!attributes || attributes.length === 0) return undefined;
  const cleaned = attributes
    .filter((attr) => attr && typeof attr.name === "string" && attr.name.trim().length > 0)
    .map((attr) => ({ name: attr.name.trim(), value: String(attr.value ?? "") }));
  return cleaned.length > 0 ? cleaned : undefined;
}

function normalizeTokenItem(item: CheaseTokenItem): CheaseTokenItem {
  const cleaned: CheaseTokenItem = {
    name: (item.name ?? "").trim(),
  };
  if (typeof item.tokenId === "number" && Number.isFinite(item.tokenId)) cleaned.tokenId = item.tokenId;
  if (item.description?.trim()) cleaned.description = item.description.trim();
  if (item.artifactUri?.trim()) cleaned.artifactUri = item.artifactUri.trim();
  if (item.previewUri?.trim()) cleaned.previewUri = item.previewUri.trim();
  if (item.mimeType?.trim()) cleaned.mimeType = item.mimeType.trim();
  const attributes = normalizeAttributes(item.attributes);
  if (attributes) cleaned.attributes = attributes;
  const tags = item.tags?.map((t) => t.trim()).filter(Boolean);
  if (tags && tags.length > 0) cleaned.tags = [...new Set(tags)];
  if (item.tokenMetadata && typeof item.tokenMetadata === "object") {
    cleaned.tokenMetadata = item.tokenMetadata;
  }
  return cleaned;
}

export type BuildCollectionPackageInput = {
  targetApp: PastaAppId;
  title: string;
  description?: string;
  symbol?: string;
  coverImageUri?: string;
  collectionMetadata?: Record<string, unknown>;
  relationship?: OwnershipRelationshipMetadata;
  items: CheaseTokenItem[];
};

export function buildCollectionPackage(
  input: BuildCollectionPackageInput
): CheaseCollectionPackage {
  const pkg: CheaseCollectionPackage = {
    schemaVersion: CHEASE_PACKAGE_SCHEMA_VERSION,
    kind: "collection",
    targetApp: input.targetApp,
    title: (input.title ?? "").trim(),
    items: (input.items ?? []).map(normalizeTokenItem),
  };
  if (input.description?.trim()) pkg.description = input.description.trim();
  if (input.symbol?.trim()) pkg.symbol = input.symbol.trim();
  if (input.coverImageUri?.trim()) pkg.coverImageUri = input.coverImageUri.trim();
  if (input.collectionMetadata && typeof input.collectionMetadata === "object") {
    pkg.collectionMetadata = input.collectionMetadata;
  }
  const relationship = sanitizeRelationshipMetadata(input.relationship);
  if (relationship) pkg.relationship = relationship;
  return pkg;
}

export type BuildSingleTokenPackageInput = {
  targetApp: PastaAppId;
  token: CheaseTokenItem;
  relationship?: OwnershipRelationshipMetadata;
};

export function buildSingleTokenPackage(
  input: BuildSingleTokenPackageInput
): CheaseSingleTokenPackage {
  const pkg: CheaseSingleTokenPackage = {
    schemaVersion: CHEASE_PACKAGE_SCHEMA_VERSION,
    kind: "single_token",
    targetApp: input.targetApp,
    token: normalizeTokenItem(input.token),
  };
  const relationship = sanitizeRelationshipMetadata(input.relationship);
  if (relationship) pkg.relationship = relationship;
  return pkg;
}

export function isCheasePackage(value: unknown): value is CheasePackage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.schemaVersion === CHEASE_PACKAGE_SCHEMA_VERSION &&
    (candidate.kind === "collection" || candidate.kind === "single_token") &&
    isPastaAppId(candidate.targetApp)
  );
}

export function isCheaseCollectionPackage(value: unknown): value is CheaseCollectionPackage {
  return isCheasePackage(value) && value.kind === "collection";
}

export function isCheaseSingleTokenPackage(value: unknown): value is CheaseSingleTokenPackage {
  return isCheasePackage(value) && value.kind === "single_token";
}

export type PackageValidationResult = { ok: boolean; errors: string[] };

function validateTokenItem(item: unknown, label: string, errors: string[]): void {
  if (!item || typeof item !== "object") {
    errors.push(`${label} must be an object`);
    return;
  }
  const token = item as Record<string, unknown>;
  if (typeof token.name !== "string" || token.name.trim().length === 0) {
    errors.push(`${label} requires a non-empty name`);
  }
  if ("tokenId" in token && token.tokenId !== undefined) {
    if (typeof token.tokenId !== "number" || !Number.isFinite(token.tokenId)) {
      errors.push(`${label} tokenId must be a finite number when present`);
    }
  }
}

/**
 * Structurally validates an untrusted value as a v1 CH-EASE package. Validation is shape-only; it does
 * not pin, resolve URIs, or originate anything.
 */
export function validateCheasePackage(value: unknown): PackageValidationResult {
  const errors: string[] = [];
  if (!value || typeof value !== "object") {
    return { ok: false, errors: ["package must be an object"] };
  }
  const candidate = value as Record<string, unknown>;

  if (candidate.schemaVersion !== CHEASE_PACKAGE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be "${CHEASE_PACKAGE_SCHEMA_VERSION}"`);
  }
  if (!isPastaAppId(candidate.targetApp)) {
    errors.push("targetApp must be a known Pasta app id");
  }

  if (candidate.kind === "collection") {
    if (typeof candidate.title !== "string" || candidate.title.trim().length === 0) {
      errors.push("collection package requires a non-empty title");
    }
    if (!Array.isArray(candidate.items)) {
      errors.push("collection package requires an items array");
    } else {
      candidate.items.forEach((item, index) =>
        validateTokenItem(item, `items[${index}]`, errors)
      );
    }
  } else if (candidate.kind === "single_token") {
    validateTokenItem(candidate.token, "token", errors);
  } else {
    errors.push('kind must be "collection" or "single_token"');
  }

  return { ok: errors.length === 0, errors };
}
