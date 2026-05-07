export const TEZOS_ADDRESS_RE = /^(tz1|tz2|tz3|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/;

export type TezosCreatorCandidate = {
  name: string | null;
  address: string | null;
};

export type ExtractedTokenIdentityFields = {
  tokenName: string | null;
  creatorName: string | null;
  creatorAddress: string | null;
  collectionName: string | null;
  mintedAtIso: string | null;
};

export function isTezosAddress(value: unknown): value is string {
  return typeof value === "string" && TEZOS_ADDRESS_RE.test(value.trim());
}

export function shortTezosAddress(value: string | null | undefined): string {
  const address = String(value || "").trim();
  if (!address || address.length < 14) return address;
  return `${address.slice(0, 8)}...${address.slice(-5)}`;
}

export function pickTezosString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function pickHumanTezosString(value: unknown): string | null {
  const picked = pickTezosString(value);
  if (!picked || isTezosAddress(picked)) return null;
  return picked;
}

export function bestTezosIdentityDisplay(input: {
  address?: string | null;
  tezosDomain?: string | null;
  label?: string | null;
  alias?: string | null;
  name?: string | null;
  fallbackToShort?: boolean;
}): string | null {
  return (
    pickHumanTezosString(input.tezosDomain) ??
    pickHumanTezosString(input.label) ??
    pickHumanTezosString(input.alias) ??
    pickHumanTezosString(input.name) ??
    (input.fallbackToShort === false || !input.address
      ? null
      : shortTezosAddress(input.address))
  );
}

export function normalizeTezosCreatorCandidate(input: unknown): TezosCreatorCandidate {
  if (typeof input === "string") {
    const value = pickTezosString(input);
    if (!value) return { name: null, address: null };
    return isTezosAddress(value)
      ? { name: null, address: value }
      : { name: value, address: null };
  }

  if (!isRecord(input)) {
    return { name: null, address: null };
  }

  const name =
    pickHumanTezosString(input.name) ??
    pickHumanTezosString(input.alias) ??
    pickHumanTezosString(input.label) ??
    pickHumanTezosString(input.displayName) ??
    pickHumanTezosString(input.username) ??
    pickHumanTezosString(input.creatorName) ??
    pickHumanTezosString(input.creator) ??
    pickHumanTezosString(input.artist) ??
    pickHumanTezosString(input.author) ??
    null;

  const address =
    pickTezosAddress(input.address) ??
    pickTezosAddress(input.walletAddress) ??
    pickTezosAddress(input.wallet) ??
    pickTezosAddress(input.account) ??
    pickTezosAddress(input.creatorAddress) ??
    pickTezosAddress(input.id) ??
    pickTezosAddress(input.value) ??
    null;

  return { name, address };
}

export function collectTezosCreatorCandidates(metadata: unknown): TezosCreatorCandidate[] {
  const meta = isRecord(metadata) ? metadata : {};
  const sources: unknown[] = [];

  const creators = Array.isArray(meta.creators) ? meta.creators : [];
  const authors = Array.isArray(meta.authors) ? meta.authors : [];
  sources.push(...creators, ...authors);
  sources.push(
    meta.creatorName,
    meta.creator,
    meta.artist,
    meta.author,
    meta.createdBy,
    meta.minter
  );

  return sources
    .map((candidate) => normalizeTezosCreatorCandidate(candidate))
    .filter((candidate) => candidate.name || candidate.address);
}

export function extractTokenIdentityFields(
  metadata: unknown,
  tokenName?: string | null
): ExtractedTokenIdentityFields {
  const meta = isRecord(metadata) ? metadata : {};
  const candidates = collectTezosCreatorCandidates(meta);
  const mintedAtIso = normalizeIsoDate(
    pickTezosString(meta.date) ??
      pickTezosString(meta.mintedAt) ??
      pickTezosString(meta.created)
  );

  return {
    tokenName: pickTezosString(meta.name) ?? pickTezosString(tokenName),
    creatorName: candidates.find((candidate) => candidate.name)?.name ?? null,
    creatorAddress:
      candidates.find((candidate) => candidate.address)?.address ??
      pickTezosAddress(meta.creatorAddress) ??
      null,
    collectionName: extractCollectionName(meta),
    mintedAtIso,
  };
}

export function extractCollectionName(metadata: unknown): string | null {
  const meta = isRecord(metadata) ? metadata : {};

  return (
    pickHumanTezosString(meta.collectionName) ??
    pickHumanTezosString(meta.collection_name) ??
    pickHumanTezosString(meta.collectionTitle) ??
    pickHumanTezosString(meta.collection_title) ??
    pickNestedHumanString(meta.collection, ["name", "title", "alias"]) ??
    pickNestedHumanString(meta.contract, ["name", "title", "alias"]) ??
    pickNestedHumanString(meta.fa, ["name", "title", "alias"]) ??
    pickNestedHumanString(meta.fa2, ["name", "title", "alias"]) ??
    pickNestedHumanString(meta.contractMetadata, ["name", "title", "alias"]) ??
    pickNestedHumanString(meta.contract_metadata, ["name", "title", "alias"]) ??
    pickNestedHumanString(meta.project, ["name", "title", "alias"]) ??
    pickHumanTezosString(meta.projectName) ??
    pickHumanTezosString(meta.project_name) ??
    pickHumanTezosString(meta.series) ??
    pickHumanTezosString(meta.album) ??
    null
  );
}

function pickTezosAddress(value: unknown): string | null {
  const picked = pickTezosString(value);
  return picked && isTezosAddress(picked) ? picked : null;
}

function pickNestedHumanString(input: unknown, keys: string[]): string | null {
  if (!isRecord(input)) return null;
  for (const key of keys) {
    const value = pickHumanTezosString(input[key]);
    if (value) return value;
  }
  return null;
}

function normalizeIsoDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
