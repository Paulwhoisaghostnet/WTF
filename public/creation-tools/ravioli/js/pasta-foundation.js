/* Pasta Protocol — browser foundation (ES module).
 *
 * Framework-free, dependency-free port of shared/pasta-protocol (relationship + metadata + package
 * builders). Kept byte-for-byte behavior-equal to the TypeScript source via
 * tests/unit/pasta-foundation-parity.test.mjs. When forking a new Pasta static app, copy this file so
 * the downloaded/standalone build stays self-contained.
 */
"use strict";

export const RELATIONSHIP_METADATA_KEY = "relationships";
export const CHEASE_PACKAGE_SCHEMA_VERSION = "wtfos.pasta.chease-package.v1";

const PASTA_APP_IDS = [
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

const RELATIONSHIP_STRING_FIELDS = [
  "parent_contract",
  "franchise_contract",
  "collection_group",
  "publisher_contract",
];
const RELATIONSHIP_ARRAY_FIELDS = ["related_contracts", "ownership_chain"];

const DEFAULT_INTERFACES = ["TZIP-012", "TZIP-016", "TZIP-021"];

function cleanString(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function cleanStringArray(value) {
  if (!Array.isArray(value)) return undefined;
  const cleaned = value.map(cleanString).filter(Boolean);
  const deduped = [...new Set(cleaned)];
  return deduped.length > 0 ? deduped : undefined;
}

function omitUndefined(record) {
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) delete record[key];
  }
  return record;
}

function dedupeNonEmpty(values) {
  if (!values) return undefined;
  const cleaned = [...new Set(values.map((v) => String(v).trim()).filter(Boolean))];
  return cleaned.length > 0 ? cleaned : undefined;
}

export function isPastaAppId(value) {
  return typeof value === "string" && PASTA_APP_IDS.includes(value);
}

export function sanitizeRelationshipMetadata(relationship) {
  if (!relationship || typeof relationship !== "object") return undefined;
  const result = {};
  for (const field of RELATIONSHIP_STRING_FIELDS) {
    const value = cleanString(relationship[field]);
    if (value) result[field] = value;
  }
  for (const field of RELATIONSHIP_ARRAY_FIELDS) {
    const value = cleanStringArray(relationship[field]);
    if (value) result[field] = value;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function mergeRelationshipMetadata(metadata, relationship) {
  const sanitized = sanitizeRelationshipMetadata(relationship);
  if (!sanitized) {
    const copy = { ...metadata };
    delete copy[RELATIONSHIP_METADATA_KEY];
    return copy;
  }
  return { ...metadata, [RELATIONSHIP_METADATA_KEY]: sanitized };
}

export function extractRelationshipMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return undefined;
  const block = metadata[RELATIONSHIP_METADATA_KEY];
  if (!block || typeof block !== "object") return undefined;
  return sanitizeRelationshipMetadata(block);
}

export function buildTokenMetadata(input) {
  const artifact = (input.artifactUri && input.artifactUri.trim()) || undefined;
  const display = (input.displayUri && input.displayUri.trim()) || artifact;
  const thumbnail = (input.thumbnailUri && input.thumbnailUri.trim()) || display;

  const formats = [];
  if (artifact && input.mimeType) formats.push({ uri: artifact, mimeType: input.mimeType });

  let attributes;
  if (input.attributes && input.attributes.length > 0) {
    attributes = input.attributes
      .filter((attr) => attr && typeof attr.name === "string" && attr.name.trim().length > 0)
      .map((attr) => ({ name: attr.name.trim(), value: String(attr.value ?? "") }));
  }

  const base = omitUndefined({
    name: input.name,
    description: input.description,
    symbol: input.symbol,
    decimals: input.decimals ?? 0,
    isBooleanAmount: input.isBooleanAmount ?? false,
    artifactUri: artifact,
    displayUri: display,
    thumbnailUri: thumbnail,
    minter: (input.minter && input.minter.trim()) || undefined,
    creators: dedupeNonEmpty(input.creators),
    formats: formats.length > 0 ? formats : undefined,
    tags: dedupeNonEmpty(input.tags),
    attributes: attributes && attributes.length > 0 ? attributes : undefined,
    royalties: input.royalties,
    ...(input.extra ?? {}),
  });

  return mergeRelationshipMetadata(base, input.relationship);
}

export function buildCollectionMetadata(input) {
  const base = omitUndefined({
    name: input.name,
    description: input.description,
    symbol: input.symbol,
    version: input.version,
    license: input.license,
    authors: dedupeNonEmpty(input.authors),
    homepage: (input.homepage && input.homepage.trim()) || undefined,
    imageUri: (input.imageUri && input.imageUri.trim()) || undefined,
    interfaces: dedupeNonEmpty(input.interfaces) ?? [...DEFAULT_INTERFACES],
    ...(input.extra ?? {}),
  });
  return mergeRelationshipMetadata(base, input.relationship);
}

function normalizeAttributes(attributes) {
  if (!attributes || attributes.length === 0) return undefined;
  const cleaned = attributes
    .filter((attr) => attr && typeof attr.name === "string" && attr.name.trim().length > 0)
    .map((attr) => ({ name: attr.name.trim(), value: String(attr.value ?? "") }));
  return cleaned.length > 0 ? cleaned : undefined;
}

function normalizeTokenItem(item) {
  const cleaned = { name: (item.name ?? "").trim() };
  if (typeof item.tokenId === "number" && Number.isFinite(item.tokenId)) cleaned.tokenId = item.tokenId;
  if (item.description && item.description.trim()) cleaned.description = item.description.trim();
  if (item.artifactUri && item.artifactUri.trim()) cleaned.artifactUri = item.artifactUri.trim();
  if (item.previewUri && item.previewUri.trim()) cleaned.previewUri = item.previewUri.trim();
  if (item.mimeType && item.mimeType.trim()) cleaned.mimeType = item.mimeType.trim();
  const attributes = normalizeAttributes(item.attributes);
  if (attributes) cleaned.attributes = attributes;
  const tags = item.tags && item.tags.map((t) => t.trim()).filter(Boolean);
  if (tags && tags.length > 0) cleaned.tags = [...new Set(tags)];
  if (item.tokenMetadata && typeof item.tokenMetadata === "object") cleaned.tokenMetadata = item.tokenMetadata;
  return cleaned;
}

export function buildCollectionPackage(input) {
  const pkg = {
    schemaVersion: CHEASE_PACKAGE_SCHEMA_VERSION,
    kind: "collection",
    targetApp: input.targetApp,
    title: (input.title ?? "").trim(),
    items: (input.items ?? []).map(normalizeTokenItem),
  };
  if (input.description && input.description.trim()) pkg.description = input.description.trim();
  if (input.symbol && input.symbol.trim()) pkg.symbol = input.symbol.trim();
  if (input.coverImageUri && input.coverImageUri.trim()) pkg.coverImageUri = input.coverImageUri.trim();
  if (input.collectionMetadata && typeof input.collectionMetadata === "object") {
    pkg.collectionMetadata = input.collectionMetadata;
  }
  const relationship = sanitizeRelationshipMetadata(input.relationship);
  if (relationship) pkg.relationship = relationship;
  return pkg;
}

export function buildSingleTokenPackage(input) {
  const pkg = {
    schemaVersion: CHEASE_PACKAGE_SCHEMA_VERSION,
    kind: "single_token",
    targetApp: input.targetApp,
    token: normalizeTokenItem(input.token),
  };
  const relationship = sanitizeRelationshipMetadata(input.relationship);
  if (relationship) pkg.relationship = relationship;
  return pkg;
}

export function isCheasePackage(value) {
  if (!value || typeof value !== "object") return false;
  return (
    value.schemaVersion === CHEASE_PACKAGE_SCHEMA_VERSION &&
    (value.kind === "collection" || value.kind === "single_token") &&
    isPastaAppId(value.targetApp)
  );
}

export function isCheaseCollectionPackage(value) {
  return isCheasePackage(value) && value.kind === "collection";
}

export function isCheaseSingleTokenPackage(value) {
  return isCheasePackage(value) && value.kind === "single_token";
}

function validateTokenItem(item, label, errors) {
  if (!item || typeof item !== "object") {
    errors.push(`${label} must be an object`);
    return;
  }
  if (typeof item.name !== "string" || item.name.trim().length === 0) {
    errors.push(`${label} requires a non-empty name`);
  }
  if ("tokenId" in item && item.tokenId !== undefined) {
    if (typeof item.tokenId !== "number" || !Number.isFinite(item.tokenId)) {
      errors.push(`${label} tokenId must be a finite number when present`);
    }
  }
}

// ---------- bonding-curve pricing (Gnocchi) ----------

function clampPrice(config, price) {
  let result = price;
  if (typeof config.minimum_price === "number") result = Math.max(result, config.minimum_price);
  if (typeof config.maximum_price === "number") result = Math.min(result, config.maximum_price);
  return Math.max(0, Math.floor(result));
}

export function priceAtSupply(config, minted) {
  const step = config.step_size && config.step_size > 0 ? Math.floor(config.step_size) : 1;
  const safeMinted = Number.isFinite(minted) && minted > 0 ? Math.floor(minted) : 0;
  const steps = Math.floor(safeMinted / step);
  return clampPrice(config, config.base_price + config.increment * steps);
}

export function costForBatch(config, minted, amount) {
  const qty = Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : 0;
  return priceAtSupply(config, minted) * qty;
}

export function validateBondingCurve(config) {
  const errors = [];
  if (!config || typeof config !== "object") return { ok: false, errors: ["config must be an object"] };
  if (!Number.isInteger(config.base_price) || config.base_price < 0) {
    errors.push("base_price must be a non-negative integer (mutez)");
  }
  if (!Number.isInteger(config.increment)) {
    errors.push("increment must be an integer (mutez, may be negative)");
  }
  if (config.minimum_price !== undefined && (!Number.isInteger(config.minimum_price) || config.minimum_price < 0)) {
    errors.push("minimum_price must be a non-negative integer when set");
  }
  if (config.maximum_price !== undefined && (!Number.isInteger(config.maximum_price) || config.maximum_price < 0)) {
    errors.push("maximum_price must be a non-negative integer when set");
  }
  if (
    config.minimum_price !== undefined &&
    config.maximum_price !== undefined &&
    config.minimum_price > config.maximum_price
  ) {
    errors.push("minimum_price cannot exceed maximum_price");
  }
  if (config.step_size !== undefined && (!Number.isInteger(config.step_size) || config.step_size < 1)) {
    errors.push("step_size must be a positive integer when set");
  }
  return { ok: errors.length === 0, errors };
}

// ---------- bundle contents manifest (Ravioli) ----------

export const BUNDLE_MANIFEST_SCHEMA_VERSION = "wtfos.pasta.pack-manifest.v2";

function cleanInt(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const n = Math.floor(value);
  return n >= 0 ? n : undefined;
}

export function normalizeBundleMember(member) {
  const out = {};
  const name = cleanString(member?.name);
  const description = cleanString(member?.description);
  const uri = cleanString(member?.uri);
  const mimeType = cleanString(member?.mimeType);
  const tokenContract = cleanString(member?.tokenContract);
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

export function buildBundleManifest(input) {
  const members = (Array.isArray(input.members) ? input.members : [])
    .map(normalizeBundleMember)
    .filter((m) => m !== undefined);
  const manifest = {
    schemaVersion: BUNDLE_MANIFEST_SCHEMA_VERSION,
    name: cleanString(input.name) ?? "Untitled Bundle",
    mystery: input.mystery === true,
    itemCount: members.length,
    members,
  };
  const description = cleanString(input.description);
  if (description) manifest.description = description;
  const relationship = sanitizeRelationshipMetadata(input.relationship);
  if (relationship) manifest.relationship = relationship;
  return manifest;
}

export function validateCheasePackage(value) {
  const errors = [];
  if (!value || typeof value !== "object") {
    return { ok: false, errors: ["package must be an object"] };
  }
  if (value.schemaVersion !== CHEASE_PACKAGE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be "${CHEASE_PACKAGE_SCHEMA_VERSION}"`);
  }
  if (!isPastaAppId(value.targetApp)) {
    errors.push("targetApp must be a known Pasta app id");
  }
  if (value.kind === "collection") {
    if (typeof value.title !== "string" || value.title.trim().length === 0) {
      errors.push("collection package requires a non-empty title");
    }
    if (!Array.isArray(value.items)) {
      errors.push("collection package requires an items array");
    } else {
      value.items.forEach((item, index) => validateTokenItem(item, `items[${index}]`, errors));
    }
  } else if (value.kind === "single_token") {
    validateTokenItem(value.token, "token", errors);
  } else {
    errors.push('kind must be "collection" or "single_token"');
  }
  return { ok: errors.length === 0, errors };
}
