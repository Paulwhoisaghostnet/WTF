import assert from "node:assert/strict";
import test from "node:test";
import { verifyHorfPrivateOfferEvent } from "./private-proof";

const room = "KT1Rg7ippRJGrFgKBDCGUyiFG7jKdcU7Dmsg";
const owner = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";
const offerer = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const output = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const input = "KT1U4p17VUNcinntAzUULBhzpPK7f2a4Ht4P";
const hash = "op84g6ySuPjHmpEdRip2ge4cJ84kRZxw7HLkBJQSsmU4M57bUya";

test("private escrow proof binds applied root, same-counter callback, and event payload", async () => {
  const previous = process.env.HORF_ROOMS_CONTRACT_ADDRESS;
  process.env.HORF_ROOMS_CONTRACT_ADDRESS = room;
  try {
    const reader = { async getJson<T>(path: string, params?: Record<string, unknown>): Promise<T> {
      if (path === "/head") return { chainId: "NetXdQprcVkpaWU" } as T;
      if (path === `/operations/transactions/${hash}`) return [
        { id: 10, hash, counter: 3, nonce: null, status: "applied", sender: { address: offerer },
          target: { address: room }, parameter: { entrypoint: "fulfill_private_offer", value: { listing_id: "0" } } },
        { id: 11, hash, counter: 3, nonce: 0, status: "applied", sender: { address: output },
          target: { address: room }, parameter: { entrypoint: "on_balance" } },
      ] as T;
      if (path === "/contracts/events") return params?.transactionId === 11 ? [{
        id: 99, transactionId: 11, contract: { address: room }, tag: "private_offer_fulfilled",
        payload: { listing_id: "0", claimant: offerer, owner, output_contract: output,
          output_id: "12", input_contract: input, input_id: "3" },
      }] as T : [] as T;
      throw new Error(`Unexpected ${path}`);
    } };
    const proof = await verifyHorfPrivateOfferEvent(hash, "private_offer_fulfilled", reader);
    assert.deepEqual(proof, {
      kind: "private_offer_fulfilled", chainId: "NetXdQprcVkpaWU", contractAddress: room,
      operationHash: hash, listingId: "0", ownerAddress: owner, offererAddress: offerer,
      outputTokenContract: output, outputTokenId: "12", inputTokenContract: input, inputTokenId: "3",
    });
  } finally {
    if (previous === undefined) delete process.env.HORF_ROOMS_CONTRACT_ADDRESS;
    else process.env.HORF_ROOMS_CONTRACT_ADDRESS = previous;
  }
});
