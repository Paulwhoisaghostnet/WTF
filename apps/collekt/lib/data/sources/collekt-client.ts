/**
 * ColleKT Client - Local API client for token collection data
 *
 * Replaces direct TzKT SDK calls with calls to our secure server-side API.
 * All caching, filtering, and data orchestration happens server-side.
 */

import {
    isWtfProfileGallery,
    normalizeWtfProfileTokensResponse,
    type WtfProfileTokensResponse,
} from "@/lib/wtf/profile-tokens";

export interface CollektCollectionResponse {
    success: boolean;
    data?: {
        tokens: any[]; // Will match UnifiedToken format from server
        pagination: {
            currentPage: number;
            pageSize: number;
            totalItems: number;
            totalPages: number;
            hasNextPage: boolean;
            hasPreviousPage: boolean;
            startIndex: number;
            endIndex: number;
        };
        cacheInfo: {
            hit: boolean;
            source: "cache" | "api" | "hybrid";
            buildTimeMs?: number;
        };
        performance: {
            totalTimeMs: number;
            fetchTimeMs?: number;
            filterTimeMs?: number;
        };
    };
    error?: string;
}

export interface CollektCollectionOptions {
    address: string;
    page?: number;
    pageSize?: number;
    forceRefresh?: boolean;
}

export interface CollektCurationOptions {
    curationId: string;
    page?: number;
    pageSize?: number;
    forceRefresh?: boolean;
}

export interface CollektContractCollectionOptions {
    contractAddress: string;
    page?: number;
    pageSize?: number;
    forceRefresh?: boolean;
}

/**
 * ColleKT API Client
 */
export class CollektClient {
    private baseUrl: string;

    constructor() {
        // Use current domain for API calls
        this.baseUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    }

    /**
     * Get token collection with server-side caching and filtering (USER galleries)
     */
    async getTokenCollection(options: CollektCollectionOptions): Promise<CollektCollectionResponse> {
        const { address, page = 1, pageSize = 20, forceRefresh = false } = options;
        const wtfApiOrigin = isWtfProfileGallery(address) ? this.getWtfApiOrigin() : "";
        if (wtfApiOrigin) {
            return this.getWtfProfileCollection({ page, pageSize, forceRefresh }, wtfApiOrigin);
        }

        try {
            const params = new URLSearchParams({
                address,
                page: page.toString(),
                pageSize: pageSize.toString(),
                forceRefresh: forceRefresh.toString(),
            });

            const response = await fetch(`${this.baseUrl}/api/user?${params}`, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result: CollektCollectionResponse = await response.json();

            if (!result.success) {
                throw new Error(result.error || "Unknown API error");
            }

            return result;
        } catch (error) {
            console.error("ColleKT API error:", error);
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }

    /**
     * Get curation token collection (CURATION galleries)
     */
    async getCurationCollection(options: CollektCurationOptions): Promise<CollektCollectionResponse> {
        const { curationId, page = 1, pageSize = 20, forceRefresh = false } = options;

        try {
            const params = new URLSearchParams({
                curationId,
                page: page.toString(),
                pageSize: pageSize.toString(),
                forceRefresh: forceRefresh.toString(),
            });

            const response = await fetch(`${this.baseUrl}/api/curation?${params}`, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result: CollektCollectionResponse = await response.json();

            if (!result.success) {
                throw new Error(result.error || "Unknown API error");
            }

            return result;
        } catch (error) {
            console.error("ColleKT Curation API error:", error);
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }

    /**
     * Get contract collection token collection (COLLECTION galleries)
     */
    async getContractCollection(options: CollektContractCollectionOptions): Promise<CollektCollectionResponse> {
        const { contractAddress, page = 1, pageSize = 20, forceRefresh = false } = options;

        try {
            const params = new URLSearchParams({
                contractAddress,
                page: page.toString(),
                pageSize: pageSize.toString(),
                forceRefresh: forceRefresh.toString(),
            });

            const response = await fetch(`${this.baseUrl}/api/collection?${params}`, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result: CollektCollectionResponse = await response.json();

            if (!result.success) {
                throw new Error(result.error || "Unknown API error");
            }

            return result;
        } catch (error) {
            console.error("ColleKT Collection API error:", error);
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }

    /**
     * Health check for the API
     */
    async healthCheck(): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/api/health`, {
                method: "GET",
            });
            return response.ok;
        } catch (error) {
            console.error("Health check failed:", error);
            return false;
        }
    }

    private async getWtfProfileCollection(
        options: { page: number; pageSize: number; forceRefresh: boolean },
        apiOrigin: string
    ): Promise<CollektCollectionResponse> {
        try {
            const offset = (options.page - 1) * options.pageSize;
            const params = new URLSearchParams({
                limit: options.pageSize.toString(),
                offset: offset.toString(),
                sortBy: "lastSeenAt",
                sortDir: "desc",
            });
            if (options.forceRefresh) params.set("refresh", "1");

            const response = await fetch(`${apiOrigin}/api/collekt/tokens?${params}`, {
                method: "GET",
                credentials: "include",
                headers: {
                    Accept: "application/json",
                },
            });

            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.error || `HTTP ${response.status}: ${response.statusText}`);
            }

            const raw = (await response.json()) as WtfProfileTokensResponse;
            const result = normalizeWtfProfileTokensResponse(raw, { fetchedAt: new Date() });

            return {
                success: true,
                data: {
                    tokens: result.tokens,
                    pagination: result.pagination,
                    cacheInfo: {
                        hit: result.cache.hit,
                        source: result.cache.source,
                        buildTimeMs: result.cache.buildTimeMs,
                    },
                    performance: {
                        totalTimeMs: result.performance.totalTimeMs,
                        fetchTimeMs: result.performance.fetchTimeMs,
                        filterTimeMs: result.performance.filterTimeMs,
                    },
                },
            };
        } catch (error) {
            console.error("WTF colleKT API error:", error);
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }

    private getWtfApiOrigin(): string {
        if (typeof window === "undefined") return "";
        const params = new URLSearchParams(window.location.search);
        const configured = params.get("wtfApi") || process.env.NEXT_PUBLIC_WTF_API_ORIGIN || "";
        if (!configured) return "";
        try {
            return new URL(configured).origin;
        } catch {
            return "";
        }
    }
}

// Export singleton instance
export const collektClient = new CollektClient();
