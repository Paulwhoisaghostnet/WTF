import type {
    DataSource,
    UnifiedMetadata,
    UnifiedToken,
} from "@/lib/data/types/token-types";
import type { OrchestrationResult } from "@/lib/data/orchestrator/data-orchestrator";

export const WTF_PROFILE_GALLERY_ID = "wtf:me";

export interface WtfProfileToken {
    id: number;
    contract: string;
    tokenId: string;
    balance: string;
    name?: string;
    symbol?: string;
    thumbnail?: string;
    metadata?: Record<string, any> | null;
    walletAddress: string;
    creatorAddress?: string;
    onTradeBoard: boolean;
    tradeBoardQuantity: number;
    updatedAt?: string | Date | null;
}

export interface WtfProfileTokensResponse {
    items: WtfProfileToken[];
    contracts?: string[];
    pagination: {
        limit: number;
        offset: number;
        total: number;
        hasMore: boolean;
        nextOffset: number;
    };
}

export interface NormalizeWtfProfileTokensOptions {
    fetchedAt?: Date;
    totalTimeMs?: number;
    fetchTimeMs?: number;
}

export interface FetchWtfProfileTokenCollectionOptions {
    page?: number;
    pageSize?: number;
    forceRefresh?: boolean;
    cookieHeader?: string | null;
    requestOrigin?: string;
    apiOrigin?: string;
}

export class WtfProfileTokenFetchError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = "WtfProfileTokenFetchError";
        this.status = status;
    }
}

const WTF_SOURCE: DataSource = {
    provider: "custom",
    version: "wtf-profile-v1",
    endpoint: "wtfgameshow:/api/collekt/tokens",
    priority: 0,
};

export function isWtfProfileGallery(address: string): boolean {
    const normalized = address.trim().toLowerCase();
    return normalized === WTF_PROFILE_GALLERY_ID || normalized === "me" || normalized === "wtf";
}

export function wtfProfileTokenToUnifiedToken(
    item: WtfProfileToken,
    fetchedAt = new Date()
): UnifiedToken {
    const rawMetadata = item.metadata ?? {};
    const creators = normalizeCreators(rawMetadata.creators, item.creatorAddress);
    const thumbnailUri =
        item.thumbnail ||
        stringOrUndefined(rawMetadata.thumbnailUri) ||
        stringOrUndefined(rawMetadata.thumbnail) ||
        stringOrUndefined(rawMetadata.thumbnail_uri);

    const metadata: UnifiedMetadata = {
        name: item.name || stringOrUndefined(rawMetadata.name),
        symbol: item.symbol || stringOrUndefined(rawMetadata.symbol),
        decimals: rawMetadata.decimals,
        description: stringOrUndefined(rawMetadata.description),
        image: stringOrUndefined(rawMetadata.image),
        artifactUri:
            stringOrUndefined(rawMetadata.artifactUri) ||
            stringOrUndefined(rawMetadata.artifact_uri),
        displayUri:
            stringOrUndefined(rawMetadata.displayUri) ||
            stringOrUndefined(rawMetadata.display_uri),
        thumbnailUri,
        supply: rawMetadata.supply,
        creators,
        tags: Array.isArray(rawMetadata.tags) ? rawMetadata.tags : undefined,
        attributes: Array.isArray(rawMetadata.attributes)
            ? rawMetadata.attributes
            : undefined,
        formats: Array.isArray(rawMetadata.formats) ? rawMetadata.formats : undefined,
        raw: {
            ...rawMetadata,
            wtfHoldingId: item.id,
            walletAddress: item.walletAddress,
            onTradeBoard: item.onTradeBoard,
            tradeBoardQuantity: item.tradeBoardQuantity,
        },
    };

    const displayImage =
        metadata.displayUri ||
        metadata.artifactUri ||
        metadata.image ||
        metadata.thumbnailUri;
    const timestamp = coerceDate(item.updatedAt) ?? fetchedAt;

    return {
        id: `${item.contract}_${item.tokenId}`,
        contractAddress: item.contract,
        tokenId: item.tokenId,
        balance: item.balance || "0",
        standard: "fa2",
        metadata,
        source: WTF_SOURCE,
        fetchedAt,
        lastTransferAt: timestamp,
        firstMintAt: timestamp,
        displayImage,
        displayName: metadata.name || `Token #${item.tokenId}`,
        sortKey: timestamp.toISOString(),
        isValid: Boolean(item.contract && item.tokenId),
        hasImage: Boolean(displayImage),
        hasMetadata: Boolean(Object.keys(rawMetadata).length || item.name || item.thumbnail),
    };
}

export function normalizeWtfProfileTokensResponse(
    response: WtfProfileTokensResponse,
    options: NormalizeWtfProfileTokensOptions = {}
): OrchestrationResult {
    const fetchedAt = options.fetchedAt ?? new Date();
    const pageSize = Math.max(1, Number(response.pagination.limit || 20));
    const offset = Math.max(0, Number(response.pagination.offset || 0));
    const totalItems = Math.max(0, Number(response.pagination.total || 0));
    const currentPage = Math.floor(offset / pageSize) + 1;
    const totalPages = Math.ceil(totalItems / pageSize);
    const tokens = response.items.map((item) =>
        wtfProfileTokenToUnifiedToken(item, fetchedAt)
    );

    return {
        tokens,
        pagination: {
            currentPage,
            pageSize,
            totalItems,
            totalPages,
            hasNextPage: response.pagination.hasMore,
            hasPreviousPage: currentPage > 1,
            startIndex: offset,
            endIndex: tokens.length > 0 ? offset + tokens.length - 1 : offset,
        },
        cache: {
            hit: false,
            source: "api",
        },
        performance: {
            totalTimeMs: options.totalTimeMs ?? 0,
            fetchTimeMs: options.fetchTimeMs,
        },
        dataSources: [WTF_SOURCE],
        fetchedAt,
    };
}

export async function fetchWtfProfileTokenCollection(
    options: FetchWtfProfileTokenCollectionOptions
): Promise<OrchestrationResult> {
    const startedAt = Date.now();
    const page = Math.max(1, Number(options.page || 1));
    const pageSize = Math.max(1, Number(options.pageSize || 20));
    const offset = (page - 1) * pageSize;
    const origin = resolveWtfApiOrigin(options);
    const url = new URL(process.env.WTF_PROFILE_TOKENS_PATH || "/api/collekt/tokens", origin);

    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("sortBy", "lastSeenAt");
    url.searchParams.set("sortDir", "desc");
    if (options.forceRefresh) url.searchParams.set("refresh", "1");

    const fetchStartedAt = Date.now();
    const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
            Accept: "application/json",
            ...(options.cookieHeader ? { Cookie: options.cookieHeader } : {}),
        },
        cache: "no-store",
    });
    const fetchTimeMs = Date.now() - fetchStartedAt;

    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new WtfProfileTokenFetchError(
            body.error || `WTF profile token request failed: ${response.status}`,
            response.status
        );
    }

    const payload = (await response.json()) as WtfProfileTokensResponse;
    return normalizeWtfProfileTokensResponse(payload, {
        fetchedAt: new Date(),
        totalTimeMs: Date.now() - startedAt,
        fetchTimeMs,
    });
}

function resolveWtfApiOrigin(options: FetchWtfProfileTokenCollectionOptions): string {
    const configured =
        options.apiOrigin ||
        process.env.WTF_API_ORIGIN ||
        process.env.NEXT_PUBLIC_WTF_API_ORIGIN ||
        options.requestOrigin;

    if (!configured) {
        throw new WtfProfileTokenFetchError(
            "WTF API origin is not configured. Set WTF_API_ORIGIN for standalone deployments.",
            500
        );
    }

    return new URL(configured).origin;
}

function normalizeCreators(value: unknown, fallback?: string): string[] | undefined {
    if (Array.isArray(value)) {
        const creators = value
            .map((entry) => {
                if (typeof entry === "string") return entry;
                if (entry && typeof entry === "object" && "address" in entry) {
                    return String((entry as { address?: unknown }).address || "");
                }
                return "";
            })
            .filter(Boolean);
        if (creators.length > 0) return creators;
    }
    return fallback ? [fallback] : undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value : undefined;
}

function coerceDate(value: string | Date | null | undefined): Date | null {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === "string" && value.trim()) {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return null;
}
