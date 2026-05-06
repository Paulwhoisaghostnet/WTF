import { randomBytes } from "crypto";
import { and, eq, lt } from "drizzle-orm";
import { verifyMessage } from "viem";
import { db } from "../../db";
import { etherlinkWalletAuthNonces } from "@shared/schema";

const NONCE_TTL_MS = 5 * 60 * 1000;

export function buildEtherlinkChallengeMessage(input: {
  nonce: string;
  walletAddress: string;
  chainId: number;
}): string {
  return [
    "WTF Gameshow Etherlink Wallet Link",
    "",
    `Address: ${input.walletAddress}`,
    `Chain ID: ${input.chainId}`,
    `Nonce: ${input.nonce}`,
  ].join("\n");
}

export async function createEtherlinkWalletAuthNonce(
  walletAddress: string,
  chainId: number,
): Promise<string> {
  const nonce = randomBytes(32).toString("hex");
  await db.insert(etherlinkWalletAuthNonces).values({
    walletAddress,
    chainId,
    nonce,
    expiresAt: new Date(Date.now() + NONCE_TTL_MS),
  });
  return nonce;
}

export async function consumeEtherlinkWalletAuthNonce(
  walletAddress: string,
  chainId: number,
  nonce: string,
): Promise<boolean> {
  const [row] = await db
    .select()
    .from(etherlinkWalletAuthNonces)
    .where(
      and(
        eq(etherlinkWalletAuthNonces.walletAddress, walletAddress),
        eq(etherlinkWalletAuthNonces.chainId, chainId),
        eq(etherlinkWalletAuthNonces.nonce, nonce),
        eq(etherlinkWalletAuthNonces.consumed, false),
      ),
    )
    .limit(1);

  if (!row) return false;
  if (row.expiresAt < new Date()) return false;

  await db
    .update(etherlinkWalletAuthNonces)
    .set({ consumed: true })
    .where(eq(etherlinkWalletAuthNonces.id, row.id));

  return true;
}

export async function verifyEtherlinkWalletSignature(input: {
  walletAddress: string;
  message: string;
  signature: string;
}): Promise<boolean> {
  try {
    return await verifyMessage({
      address: input.walletAddress as `0x${string}`,
      message: input.message,
      signature: input.signature as `0x${string}`,
    });
  } catch (err) {
    console.warn("[etherlink] signature verification failed:", err);
    return false;
  }
}

export async function cleanupExpiredEtherlinkNonces(): Promise<void> {
  await db
    .delete(etherlinkWalletAuthNonces)
    .where(lt(etherlinkWalletAuthNonces.expiresAt, new Date()));
}
