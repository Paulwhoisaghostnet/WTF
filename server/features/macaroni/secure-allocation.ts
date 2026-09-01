import { createHash, randomBytes, randomInt } from "node:crypto";

export type MacaroniSlotCommitment = {
  slotId: number;
  commitment: string;
};

export type MacaroniRevealManifestSlot = MacaroniSlotCommitment & {
  tokenId: number;
  nonce: string;
};

export type MacaroniAllocationToken = {
  tokenId: number;
  quantity: number;
  metadataCommitment: string;
};

export function createSecureAllocation(
  tokens: MacaroniAllocationToken[],
  supply: number
): MacaroniRevealManifestSlot[] {
  const deck: number[] = [];
  const commitments = new Map<number, string>();
  for (const token of tokens) {
    if (!Number.isSafeInteger(token.quantity) || token.quantity <= 0) {
      throw new Error(`Invalid on-chain edition quantity for token ${token.tokenId}`);
    }
    const commitment = String(token.metadataCommitment || "").replace(/^0x/i, "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(commitment)) {
      throw new Error(`Missing metadata commitment for token ${token.tokenId}`);
    }
    commitments.set(token.tokenId, commitment);
    for (let edition = 0; edition < token.quantity; edition += 1) deck.push(token.tokenId);
  }
  if (!Number.isSafeInteger(supply) || supply <= 0 || deck.length !== supply) {
    throw new Error("V3 secure allocation does not match the on-chain edition supply");
  }
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck.map((tokenId, slotId) => {
    const nonce = randomBytes(32).toString("hex");
    const commitment = createHash("sha256")
      .update(Buffer.concat([
        Buffer.from(nonce, "hex"),
        Buffer.from(commitments.get(tokenId)!, "hex"),
      ]))
      .digest("hex");
    return { slotId, tokenId, nonce, commitment };
  });
}
