import {
  verifyPublicKeyOwnership,
  verifyWalletSignature,
} from "../../auth/wallet-verify";

export const MACARONI_V35_REGISTRATION_VERSION = "macaroni-v35-managed-registration.v1";

export type MacaroniV35RegistrationIdentity = {
  clientSetupId: string;
  network: "mainnet" | "shadownet";
  contract?: string | null;
  administrator: string;
};

export type MacaroniV35RegistrationProof = {
  nonce: string;
  publicKey: string;
  signature: string;
};

export type MacaroniV35ProofDependencies = {
  consumeNonce: (walletAddress: string, nonce: string) => Promise<boolean>;
  ownsPublicKey: (walletAddress: string, publicKey: string) => boolean;
  verifiesSignature: (message: string, signature: string, publicKey: string) => boolean;
};

export function buildMacaroniV35RegistrationMessage(
  identity: MacaroniV35RegistrationIdentity,
  nonce: string
): string {
  return [
    "wtfOS Macaroni V3.5 managed setup registration",
    `Version: ${MACARONI_V35_REGISTRATION_VERSION}`,
    `Setup: ${identity.clientSetupId}`,
    `Network: ${identity.network}`,
    `Contract: ${identity.contract || "not-originated"}`,
    `Administrator: ${identity.administrator}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

export async function createMacaroniV35RegistrationChallenge(
  identity: MacaroniV35RegistrationIdentity
) {
  const { createWalletAuthNonce } = await import("../../auth/storage");
  const nonce = await createWalletAuthNonce(identity.administrator);
  return {
    nonce,
    message: buildMacaroniV35RegistrationMessage(identity, nonce),
    version: MACARONI_V35_REGISTRATION_VERSION,
  };
}

export async function verifyMacaroniV35RegistrationProof(
  identity: MacaroniV35RegistrationIdentity,
  proof: MacaroniV35RegistrationProof,
  suppliedDependencies?: MacaroniV35ProofDependencies
): Promise<void> {
  const dependencies = suppliedDependencies || {
    consumeNonce: (await import("../../auth/storage")).consumeWalletAuthNonce,
    ownsPublicKey: verifyPublicKeyOwnership,
    verifiesSignature: verifyWalletSignature,
  };
  if (!dependencies.ownsPublicKey(identity.administrator, proof.publicKey)) {
    throw new Error("Registration public key does not control the administrator wallet");
  }
  if (!(await dependencies.consumeNonce(identity.administrator, proof.nonce))) {
    throw new Error("Registration challenge is invalid, expired, or already used");
  }
  const message = buildMacaroniV35RegistrationMessage(identity, proof.nonce);
  if (!dependencies.verifiesSignature(message, proof.signature, proof.publicKey)) {
    throw new Error("Registration wallet signature is invalid");
  }
}
