export const WTF_TV_DIAL = 3;
export const WTF_TV_OWNER_USERNAME = "paulwhoisaghost";
export const WTF_TV_CANONICAL_SLUG = "paulwhoisaghost-wtf-tv";

export type WtfSourceScopeResolution = {
  mode: "all_users" | "selected_users" | "specific_wallets";
  sourceUserIds: number[];
  sourceWalletAddresses: string[];
  reason: "configured" | "owner_fallback";
};

function sanitizeUserIds(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const out: number[] = [];
  for (const value of input) {
    const id = Number(value);
    if (Number.isInteger(id) && id > 0 && !out.includes(id)) out.push(id);
  }
  return out;
}

function sanitizeWallets(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const value of input) {
    const wallet = String(value || "").trim();
    if (!wallet || out.includes(wallet)) continue;
    out.push(wallet);
  }
  return out;
}

export function buildTvChannelMediaPath(channelId: number, mediaItemId: number): string {
  const channel = Math.max(1, Math.floor(Number(channelId) || 0));
  const media = Math.max(1, Math.floor(Number(mediaItemId) || 0));
  return `/api/tv/channels/${channel}/media/${media}/file`;
}

export function resolveTvChannelPlaybackSource(input: {
  channelId: number;
  mediaItemId?: number | null;
  sourceType?: string | null;
  sourceUri?: string | null;
  playbackUrl?: string | null;
}): string {
  const mediaItemId = Number(input.mediaItemId);
  const raw = String(input.playbackUrl || input.sourceUri || "").trim();
  const sourceType = String(input.sourceType || "").trim().toLowerCase();
  const looksLikeGenericUploadPath = /^\/api\/media\/\d+\/file(?:[/?#].*)?$/i.test(raw);
  const looksInternal =
    raw.startsWith("disk://") ||
    raw.startsWith("cache://") ||
    raw.startsWith("staging://") ||
    raw.startsWith("s3://");

  if (
    Number.isInteger(mediaItemId) &&
    mediaItemId > 0 &&
    (sourceType === "upload" || looksLikeGenericUploadPath || looksInternal)
  ) {
    return buildTvChannelMediaPath(input.channelId, mediaItemId);
  }

  return raw;
}

export function resolveWtfSourceScope(input: {
  sourceMode?: string | null;
  sourceUserIds?: unknown;
  sourceWalletAddresses?: unknown;
  channelOwnerUserId?: number | null;
  channelOwnerUsername?: string | null;
  channelSlug?: string | null;
  channelDialNumber?: number | null;
}): WtfSourceScopeResolution {
  const mode =
    input.sourceMode === "selected_users" || input.sourceMode === "specific_wallets"
      ? input.sourceMode
      : "all_users";
  const sourceUserIds = sanitizeUserIds(input.sourceUserIds);
  const sourceWalletAddresses = sanitizeWallets(input.sourceWalletAddresses);

  if (mode === "selected_users" && sourceUserIds.length > 0) {
    return { mode, sourceUserIds, sourceWalletAddresses: [], reason: "configured" };
  }
  if (mode === "specific_wallets" && sourceWalletAddresses.length > 0) {
    return { mode, sourceUserIds: [], sourceWalletAddresses, reason: "configured" };
  }

  const ownerId = Number(input.channelOwnerUserId);
  const ownerUsername = String(input.channelOwnerUsername || "").trim().toLowerCase();
  const slug = String(input.channelSlug || "").trim().toLowerCase();
  const dialNumber = Number(input.channelDialNumber);
  const isCanonicalWtfChannel =
    (Number.isInteger(dialNumber) && dialNumber === WTF_TV_DIAL) ||
    ownerUsername === WTF_TV_OWNER_USERNAME ||
    slug === WTF_TV_CANONICAL_SLUG;

  if (mode === "all_users" && isCanonicalWtfChannel && Number.isInteger(ownerId) && ownerId > 0) {
    return {
      mode: "selected_users",
      sourceUserIds: [ownerId],
      sourceWalletAddresses: [],
      reason: "owner_fallback",
    };
  }

  return {
    mode: "all_users",
    sourceUserIds: [],
    sourceWalletAddresses: [],
    reason: "configured",
  };
}
