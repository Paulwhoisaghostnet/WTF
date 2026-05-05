import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCollektPagination,
  resolveCollektWalletScope,
  toCollektTokenItem,
} from "./collekt-tokens";

describe("colleKT bridge token shape", () => {
  it("maps wallet holding rows into the WTF colleKT API contract", () => {
    const item = toCollektTokenItem({
      id: 11,
      tokenContract: "KT1ExampleContract1111111111111111111",
      tokenId: "9",
      balance: "3",
      tokenName: "WTF Museum Piece",
      metaName: null,
      tokenSymbol: "WTFART",
      tokenThumbnail: "ipfs://thumb",
      metadata: {
        description: "displayed in colleKT",
        displayUri: "ipfs://display",
      },
      walletAddress: "tz1Owner1111111111111111111111111111",
      creatorFromMeta: "tz1Creator11111111111111111111111111",
      derivedAt: new Date("2026-04-24T10:00:00.000Z"),
      onTradeBoard: true,
      tradeBoardQuantity: 2,
    });

    assert.equal(item.id, 11);
    assert.equal(item.contract, "KT1ExampleContract1111111111111111111");
    assert.equal(item.tokenId, "9");
    assert.equal(item.name, "WTF Museum Piece");
    assert.equal(item.symbol, "WTFART");
    assert.equal(item.thumbnail, "ipfs://thumb");
    assert.equal(item.walletAddress, "tz1Owner1111111111111111111111111111");
    assert.equal(item.creatorAddress, "tz1Creator11111111111111111111111111");
    assert.equal(item.updatedAt, "2026-04-24T10:00:00.000Z");
    assert.equal(item.onTradeBoard, true);
    assert.equal(item.tradeBoardQuantity, 2);
    assert.deepEqual(item.metadata, {
      description: "displayed in colleKT",
      displayUri: "ipfs://display",
    });
  });

  it("builds offset pagination for room-sized gallery pages", () => {
    assert.deepEqual(buildCollektPagination(20, 20, 45, 5), {
      limit: 20,
      offset: 20,
      total: 45,
      hasMore: true,
      nextOffset: 25,
    });
  });

  it("scopes token queries to currently linked profile wallets", () => {
    assert.deepEqual(
      resolveCollektWalletScope(
        ["tz1Linked1111111111111111111111111111", "tz1Linked2222222222222222222222222222"],
        ""
      ),
      {
        ok: true,
        walletAddresses: [
          "tz1Linked1111111111111111111111111111",
          "tz1Linked2222222222222222222222222222",
        ],
      }
    );

    assert.deepEqual(
      resolveCollektWalletScope(
        ["tz1Linked1111111111111111111111111111", "tz1Linked2222222222222222222222222222"],
        "tz1Linked2222222222222222222222222222"
      ),
      {
        ok: true,
        walletAddresses: ["tz1Linked2222222222222222222222222222"],
      }
    );
  });

  it("does not expose stale holdings when no linked wallet matches", () => {
    assert.deepEqual(resolveCollektWalletScope([], ""), {
      ok: true,
      walletAddresses: [],
    });

    assert.deepEqual(
      resolveCollektWalletScope(
        ["tz1Linked1111111111111111111111111111"],
        "tz1Unlinked11111111111111111111111111"
      ),
      {
        ok: false,
        status: 403,
        error: "wallet not linked to this account",
      }
    );
  });
});
