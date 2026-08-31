import {
  verifyPublicKeyOwnership,
  verifyWalletSignature,
} from "../../auth/wallet-verify";
import type { MacaroniRevealNetwork } from "./reveal-automation";

export const MACARONI_REVEAL_REGISTRATION_VERSION = "macaroni-v3-reveal-registration.v1";

export type MacaroniRevealRegistrationIdentity = {
  network: MacaroniRevealNetwork;
  contract: string;
  administrator: string;
};

export type MacaroniRevealRegistrationProof = {
  nonce: string;
  publicKey: string;
  signature: string;
};

export type MacaroniRevealProofDependencies = {
  consumeNonce: (walletAddress: string, nonce: string) => Promise<boolean>;
  ownsPublicKey: (walletAddress: string, publicKey: string) => boolean;
  verifiesSignature: (message: string, signature: string, publicKey: string) => boolean;
};

export function buildMacaroniRevealRegistrationMessage(
  identity: MacaroniRevealRegistrationIdentity,
  nonce: string
): string {
  return [
    "wtfOS Macaroni automatic reveal registration",
    `Version: ${MACARONI_REVEAL_REGISTRATION_VERSION}`,
    `Network: ${identity.network}`,
    `Contract: ${identity.contract}`,
    `Administrator: ${identity.administrator}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

export async function createMacaroniRevealRegistrationChallenge(
  identity: MacaroniRevealRegistrationIdentity
): Promise<{ nonce: string; message: string; version: string }> {
  const { createWalletAuthNonce } = await import("../../auth/storage");
  const nonce = await createWalletAuthNonce(identity.administrator);
  return {
    nonce,
    message: buildMacaroniRevealRegistrationMessage(identity, nonce),
    version: MACARONI_REVEAL_REGISTRATION_VERSION,
  };
}

export async function verifyMacaroniRevealRegistrationProof(
  identity: MacaroniRevealRegistrationIdentity,
  proof: MacaroniRevealRegistrationProof,
  suppliedDependencies?: MacaroniRevealProofDependencies
): Promise<void> {
  const dependencies = suppliedDependencies || {
    consumeNonce: (await import("../../auth/storage")).consumeWalletAuthNonce,
    ownsPublicKey: verifyPublicKeyOwnership,
    verifiesSignature: verifyWalletSignature,
  };
  if (!dependencies.ownsPublicKey(identity.administrator, proof.publicKey)) {
    throw new Error("Reveal registration public key does not control the contract administrator");
  }
  const nonceValid = await dependencies.consumeNonce(identity.administrator, proof.nonce);
  if (!nonceValid) {
    throw new Error("Reveal registration challenge is invalid, expired, or already used");
  }
  const message = buildMacaroniRevealRegistrationMessage(identity, proof.nonce);
  if (!dependencies.verifiesSignature(message, proof.signature, proof.publicKey)) {
    throw new Error("Reveal registration wallet signature is invalid");
  }
}
