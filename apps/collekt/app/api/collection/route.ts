/**
 * Server-side API route for COLLECTION gallery token collection data
 *
 * Handles cache-first token collection fetching for contract-based collections
 * via direct TzKT queries with contract filtering.
 */

import { NextRequest, NextResponse } from "next/server";
import { dataOrchestrator } from "@/lib/data/orchestrator/data-orchestrator";

/**
 * GET /api/collection
 *
 * Query params:
 * - contractAddress: Tezos contract address (KT1...)
 * - page: Page number (default: 1)
 * - pageSize: Items per page (default: 20)
 * - forceRefresh: Skip cache (default: false)
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const contractAddress = searchParams.get("contractAddress");
        const page = parseInt(searchParams.get("page") || "1");
        const pageSize = parseInt(searchParams.get("pageSize") || "20");
        const forceRefresh = searchParams.get("forceRefresh") === "true";

        if (!contractAddress) {
            return NextResponse.json({ error: "ContractAddress parameter is required" }, { status: 400 });
        }

        // Use data orchestrator for cache-first COLLECTION gallery fetching
        // This will be implemented in Step 2
        const result = await dataOrchestrator.getCollectionTokenCollection({
            contractAddress,
            pagination: { page, pageSize },
            forceRefresh,
            applyFilters: true,
            cacheResults: true,
        });

        return NextResponse.json({
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
        });
    } catch (error) {
        console.error("Collection gallery API error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
        );
    }
}
