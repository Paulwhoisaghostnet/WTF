export type TvOverlayOverrideInput = {
  creatorName?: string | null;
  collectionName?: string | null;
  mintedAtIso?: string | null;
};

export type TvOverlayOverride = {
  creatorName: string | null;
  collectionName: string | null;
  mintedAtIso: string | null;
};

export type ResolvedTvOverlayMetadata = {
  creatorName: string | null;
  creatorAddress: string | null;
  collectionName: string | null;
  mintedAt: Date | null;
  objktUrl: string | null;
  addedByUsername: string | null;
};

type CreatorCandidate = {
  name: string | null;
  address: string | null;
};

const TEZ_ADDRESS_RE = /^(tz1|tz2|tz3|KT1)[A-Za-z0-9]{33,34}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function pickHumanString(value: unknown): string | null {
  const picked = pickString(value);
  if (!picked || TEZ_ADDRESS_RE.test(picked)) return null;
  return picked;
}

function parseDate(value: unknown): Date | null {
  const picked = pickString(value);
  if (!picked) return null;
  const parsed = new Date(picked);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeCreatorCandidate(input: unknown): CreatorCandidate {
  if (typeof input === "string") {
    const value = pickString(input);
    if (!value) return { name: null, address: null };
    return TEZ_ADDRESS_RE.test(value)
      ? { name: null, address: value }
      : { name: value, address: null };
  }
  if (!isRecord(input)) {
    return { name: null, address: null };
  }

  const name =
    pickHumanString(input.name) ??
    pickHumanString(input.alias) ??
    pickHumanString(input.label) ??
    pickHumanString(input.displayName) ??
    pickHumanString(input.username) ??
    pickHumanString(input.creatorName) ??
    pickHumanString(input.creator) ??
    pickHumanString(input.artist) ??
    pickHumanString(input.author) ??
    null;

  const address =
    pickString(input.address) ??
    pickString(input.walletAddress) ??
    pickString(input.wallet) ??
    pickString(input.account) ??
    pickString(input.creatorAddress) ??
    pickString(input.id) ??
    pickString(input.value) ??
    null;

  return {
    name,
    address: address && TEZ_ADDRESS_RE.test(address) ? address : null,
  };
}

function collectCreatorCandidates(metadata: Record<string, unknown>): CreatorCandidate[] {
  const sources: unknown[] = [];

  const creators = Array.isArray(metadata.creators) ? metadata.creators : [];
  const authors = Array.isArray(metadata.authors) ? metadata.authors : [];
  sources.push(...creators, ...authors);
  sources.push(
    metadata.creatorName,
    metadata.creator,
    metadata.artist,
    metadata.author,
    metadata.createdBy
  );

  return sources
    .map((candidate) => normalizeCreatorCandidate(candidate))
    .filter((candidate) => candidate.name || candidate.address);
}

function buildObjktUrl(
  tokenContract: string | null | undefined,
  tokenId: string | null | undefined
): string | null {
  const contract = pickString(tokenContract);
  const id = pickString(tokenId);
  if (!contract || !id) return null;
  if (!TEZ_ADDRESS_RE.test(contract)) return null;
  return `https://objkt.com/tokens/${contract}/${id}`;
}

export function readTvOverlayOverride(metadata: unknown): TvOverlayOverride {
  if (!isRecord(metadata)) {
    return {
      creatorName: null,
      collectionName: null,
      mintedAtIso: null,
    };
  }

  const rawOverride = isRecord(metadata.wtfTvOverlay)
    ? metadata.wtfTvOverlay
    : isRecord(metadata.tvOverlay)
      ? metadata.tvOverlay
      : null;

  if (!rawOverride) {
    return {
      creatorName: null,
      collectionName: null,
      mintedAtIso: null,
    };
  }

  return {
    creatorName: pickString(rawOverride.creatorName),
    collectionName: pickString(rawOverride.collectionName),
    mintedAtIso: pickString(rawOverride.mintedAtIso),
  };
}

export function writeTvOverlayOverride(
  metadata: unknown,
  input: TvOverlayOverrideInput
): Record<string, unknown> | null {
  const base = isRecord(metadata) ? { ...metadata } : {};
  const existing = readTvOverlayOverride(base);
  const nextOverride: Record<string, string> = {};

  const mergeField = (
    key: keyof TvOverlayOverrideInput,
    existingValue: string | null
  ) => {
    const hasKey = Object.prototype.hasOwnProperty.call(input, key);
    const rawValue = hasKey ? input[key] : existingValue;
    const sanitized = pickString(rawValue);
    if (sanitized) nextOverride[key] = sanitized;
  };

  mergeField("creatorName", existing.creatorName);
  mergeField("collectionName", existing.collectionName);
  mergeField("mintedAtIso", existing.mintedAtIso);

  if (Object.keys(nextOverride).length > 0) {
    base.wtfTvOverlay = nextOverride;
  } else {
    delete base.wtfTvOverlay;
    delete base.tvOverlay;
  }

  return Object.keys(base).length > 0 ? base : null;
}

export function resolveTvOverlayMetadata(input: {
  metadata: unknown;
  tokenContract?: string | null;
  tokenId?: string | null;
  storedCreatorName?: string | null;
  storedCreatorAddress?: string | null;
  storedCollectionName?: string | null;
  storedMintedAt?: Date | string | null;
  creatorLabel?: string | null;
  creatorDomain?: string | null;
  uploaderUsername?: string | null;
  channelOwnerUsername?: string | null;
  addedByUsername?: string | null;
}): ResolvedTvOverlayMetadata {
  const metadata = isRecord(input.metadata) ? input.metadata : null;
  const override = readTvOverlayOverride(metadata);
  const creatorCandidates = metadata ? collectCreatorCandidates(metadata) : [];
  const metadataCreatorName =
    creatorCandidates.find((candidate) => candidate.name)?.name ?? null;
  const metadataCreatorAddress =
    creatorCandidates.find((candidate) => candidate.address)?.address ?? null;
  const objktUrl = buildObjktUrl(input.tokenContract, input.tokenId);
  const uploaderFallback = objktUrl
    ? null
    : pickString(input.uploaderUsername)
      ? `from ${pickString(input.uploaderUsername)}'s media`
      : null;
  const addedByUsername =
    pickString(input.addedByUsername) ??
    pickString(input.channelOwnerUsername) ??
    pickString(input.uploaderUsername) ??
    null;

  const creatorName =
    override.creatorName ??
    metadataCreatorName ??
    pickHumanString(input.storedCreatorName) ??
    pickHumanString(input.creatorLabel) ??
    pickHumanString(input.creatorDomain) ??
    uploaderFallback ??
    null;

  const creatorAddress =
    metadataCreatorAddress ??
    (pickString(input.storedCreatorAddress) &&
    TEZ_ADDRESS_RE.test(String(input.storedCreatorAddress).trim())
      ? String(input.storedCreatorAddress).trim()
      : null);

  const collectionName =
    override.collectionName ??
    (metadata
      ? pickString(metadata.collectionName) ??
        (isRecord(metadata.collection) ? pickString(metadata.collection.name) : null) ??
        (isRecord(metadata.contract) ? pickString(metadata.contract.name) : null) ??
        pickString(metadata.series) ??
        pickString(metadata.album)
      : null) ??
    pickString(input.storedCollectionName) ??
    null;

  const mintedAt =
    parseDate(override.mintedAtIso) ??
    (metadata
      ? parseDate(metadata.date) ??
        parseDate(metadata.mintedAt) ??
        parseDate(metadata.created)
      : null) ??
    parseDate(input.storedMintedAt) ??
    (input.storedMintedAt instanceof Date &&
    !Number.isNaN(input.storedMintedAt.getTime())
      ? input.storedMintedAt
      : null);

  return {
    creatorName,
    creatorAddress,
    collectionName,
    mintedAt,
    objktUrl,
    addedByUsername,
  };
}
