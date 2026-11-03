import { assertTraderAddress } from "./recipient-input";

export type HorfGuestSession = { walletAddress: string | null; verified: boolean };

export type HorfGuestChallenge = {
  nonce: string;
  message: string;
  expiresAt: string;
  action: "horf";
  origin: string;
};

export type HorfGuestVerification = {
  walletAddress: string;
  verified: true;
  source: "wallet-proof" | "linked";
};

export async function proveHorfGuestWallet(
  walletAddress: string,
  deps: {
    challenge: (walletAddress: string) => Promise<HorfGuestChallenge>;
    sign: (message: string) => Promise<{ signature: string; publicKey: string }>;
    verify: (proof: { walletAddress: string; publicKey: string; signature: string; nonce: string }) => Promise<HorfGuestVerification>;
  },
): Promise<string> {
  const address = assertTraderAddress(walletAddress);
  const challenge = await deps.challenge(address);
  if (challenge.action !== "horf" || !challenge.nonce || !challenge.message) {
    throw new Error("Horf received an invalid wallet challenge. Try again.");
  }
  const signed = await deps.sign(challenge.message);
  if (!signed.publicKey || !signed.signature) {
    throw new Error("Your wallet did not provide a complete ownership signature.");
  }
  const verified = await deps.verify({
    walletAddress: address,
    publicKey: signed.publicKey,
    signature: signed.signature,
    nonce: challenge.nonce,
  });
  if (!verified.verified || verified.walletAddress !== address) {
    throw new Error("Horf could not verify the selected wallet. Try again.");
  }
  return address;
}
