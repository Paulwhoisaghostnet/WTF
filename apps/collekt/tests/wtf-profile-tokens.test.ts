import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    normalizeWtfProfileTokensResponse,
    wtfProfileTokenToUnifiedToken,
} from "../lib/wtf/profile-tokens";

const fetchedAt = new Date("2026-04-25T12:00:00.000Z");

describe("WTF profile token normalization", () => {
    it("maps WTF profile token rows into ColleKT unified tokens", () => {
        const token = wtfProfileTokenToUnifiedToken(
            {
                id: 42,
                contract: "KT1ExampleContract1111111111111111111",
                tokenId: "7",
                balance: "2",
                name: "FAFO Gallery Pass",
                symbol: "FAFO",
                thumbnail: "ipfs://thumb",
                metadata: {
                    description: "Gallery access token",
                    displayUri: "ipfs://display",
                    artifactUri: "ipfs://artifact",
                    formats: [{ uri: "ipfs://artifact", mimeType: "image/png" }],
                    attributes: [{ trait_type: "Season", value: 3 }],
                },
                walletAddress: "tz1Owner1111111111111111111111111111",
                creatorAddress: "tz1Creator11111111111111111111111111",
                updatedAt: "2026-04-24T10:30:00.000Z",
                onTradeBoard: true,
                tradeBoardQuantity: 1,
            },
            fetchedAt
        );

        assert.equal(token.id, "KT1ExampleContract1111111111111111111_7");
        assert.equal(token.contractAddress, "KT1ExampleContract1111111111111111111");
        assert.equal(token.tokenId, "7");
        assert.equal(token.balance, "2");
        assert.equal(token.displayName, "FAFO Gallery Pass");
        assert.equal(token.displayImage, "ipfs://display");
        assert.equal(token.metadata.thumbnailUri, "ipfs://thumb");
        assert.deepEqual(token.metadata.creators, ["tz1Creator11111111111111111111111111"]);
        assert.equal(token.source.provider, "custom");
        assert.equal(token.source.endpoint, "wtfgameshow:/api/collekt/tokens");
        assert.equal(token.sortKey, "2026-04-24T10:30:00.000Z");
        assert.equal(token.fetchedAt.toISOString(), fetchedAt.toISOString());
        assert.equal(token.metadata.raw?.walletAddress, "tz1Owner1111111111111111111111111111");
        assert.equal(token.metadata.raw?.onTradeBoard, true);
    });

    it("converts WTF pagination offsets into ColleKT room pagination", () => {
        const result = normalizeWtfProfileTokensResponse(
            {
                items: [
                    {
                        id: 1,
                        contract: "KT1ExampleContract1111111111111111111",
                        tokenId: "0",
                        balance: "1",
                        walletAddress: "tz1Owner1111111111111111111111111111",
                        onTradeBoard: false,
                        tradeBoardQuantity: 0,
                    },
                ],
                contracts: ["KT1ExampleContract1111111111111111111"],
                pagination: {
                    limit: 20,
                    offset: 20,
                    total: 45,
                    hasMore: true,
                    nextOffset: 40,
                },
            },
            { fetchedAt, totalTimeMs: 17 }
        );

        assert.equal(result.tokens.length, 1);
        assert.equal(result.pagination.currentPage, 2);
        assert.equal(result.pagination.pageSize, 20);
        assert.equal(result.pagination.totalItems, 45);
        assert.equal(result.pagination.totalPages, 3);
        assert.equal(result.pagination.hasNextPage, true);
        assert.equal(result.pagination.hasPreviousPage, true);
        assert.equal(result.pagination.startIndex, 20);
        assert.equal(result.pagination.endIndex, 20);
        assert.equal(result.cache.source, "api");
        assert.equal(result.performance.totalTimeMs, 17);
        assert.equal(result.dataSources[0]?.provider, "custom");
    });
});
