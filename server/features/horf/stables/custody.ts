import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../../../db";
import { horfInspectionApprovals } from "@shared/schema";
import { horfMainnetIndex } from "../mainnet-index";
import { HORF_MAINNET_CHAIN_ID } from "./config";

export const HORF_CUSTODY_BLOCK_REASON = "This horse token needs an active inspector approval before any Stable deposit";
export class HorfCustodyUntrustedError extends Error {}

export interface HorfFa2Identity {
  contract: string;
  creatorAddress: string;
  codeHash: number;
  codeSha256: string;
  asOf: string;
  source: "Tezos Mainnet TzKT and RPC";
}

async function rpcJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Mainnet RPC identity read failed: ${response.status}`);
  return response.json();
}

/** Bind a review to its exact FA2 address, originator, and full Micheline code. */
export async function readHorfFa2Identity(
  contract: string,
  readIndex: typeof horfMainnetIndex.getJson = horfMainnetIndex.getJson.bind(horfMainnetIndex),
  readRpc: (url: string) => Promise<unknown> = rpcJson,
  env: NodeJS.ProcessEnv = process.env,
): Promise<HorfFa2Identity> {
  const [head, indexed] = await Promise.all([
    readIndex<{ chainId?: string; timestamp?: string }>("/head"),
    readIndex<{ address?: string; creator?: { address?: string }; codeHash?: number }>(`/contracts/${contract}`),
  ]);
  if (head.chainId !== HORF_MAINNET_CHAIN_ID || indexed.address !== contract ||
      !indexed.creator?.address || !Number.isInteger(indexed.codeHash) || !head.timestamp) {
    throw new HorfCustodyUntrustedError("FA2 identity could not be verified on Tezos Mainnet");
  }
  const configured = env.HORF_MAINNET_RPC_URL?.trim() ||
    ((env.TEZOS_NETWORK || "").trim().toLowerCase() === "mainnet" ? env.TEZOS_RPC_URL?.trim() : undefined);
  const bases = configured ? [configured] : ["https://tezos-mainnet.octez.io/", "https://tcinfra.net/rpc/tezos/mainnet"];
  let script: { code?: unknown } | null = null;
  for (const baseUrl of bases) {
    const base = baseUrl.replace(/\/$/, "");
    try {
      const chainId = await readRpc(`${base}/chains/main/chain_id`);
      if (chainId !== HORF_MAINNET_CHAIN_ID) throw new HorfCustodyUntrustedError("FA2 script RPC is not Tezos Mainnet");
      script = await readRpc(`${base}/chains/main/blocks/head/context/contracts/${contract}/script`) as { code?: unknown };
      break;
    } catch {
      // Only the configured Mainnet RPC, or the declared primary then fallback.
    }
  }
  if (!script || !Array.isArray(script.code)) {
    throw new HorfCustodyUntrustedError("FA2 script could not be verified on Tezos Mainnet");
  }
  return {
    contract,
    creatorAddress: indexed.creator.address,
    codeHash: indexed.codeHash!,
    codeSha256: createHash("sha256").update(JSON.stringify(script.code)).digest("hex"),
    asOf: head.timestamp,
    source: "Tezos Mainnet TzKT and RPC",
  };
}

export function identityMatchesApproval(
  identity: HorfFa2Identity,
  approval: Pick<typeof horfInspectionApprovals.$inferSelect, "tokenContract" | "creatorAddress" | "codeHash" | "codeSha256" | "active">,
): boolean {
  return approval.active && approval.tokenContract === identity.contract &&
    approval.creatorAddress === identity.creatorAddress && approval.codeHash === identity.codeHash &&
    approval.codeSha256 === identity.codeSha256;
}

/** Human approval is a trust decision; immutable identity parity prevents substitution. */
export async function assertHorfCustodyTrusted(_mode: 0 | 1 | 2, contract: string, tokenId: string): Promise<void> {
  const [approval] = await db.select().from(horfInspectionApprovals)
    .where(and(eq(horfInspectionApprovals.tokenContract, contract), eq(horfInspectionApprovals.tokenId, tokenId)))
    .limit(1);
  if (!approval?.active) throw new HorfCustodyUntrustedError(HORF_CUSTODY_BLOCK_REASON);
  const identity = await readHorfFa2Identity(contract);
  if (!identityMatchesApproval(identity, approval)) {
    throw new HorfCustodyUntrustedError("FA2 identity or code differs from the inspected approval");
  }
}
