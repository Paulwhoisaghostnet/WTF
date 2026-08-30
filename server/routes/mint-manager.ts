import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { userWallets } from "@shared/schema";
import { isAuthenticated } from "../auth/passport";
import { db } from "../db";
import { fetchTransactionsByHash, isValidOpHash } from "../lib/tzkt-ops";
import { tzkt, UpstreamClient } from "../lib/upstream";

const router = Router();
const KT1_PATTERN = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;
const shadownetTzkt = new UpstreamClient({
  label: "tzkt-shadownet-mint-manager",
  baseUrl: (process.env.SHADOWNET_TZKT_API_URL || "https://api.shadownet.tzkt.io/v1").replace(/\/+$/, ""),
  requestsPerSecond: 8,
  burst: 16,
  timeoutMs: 25_000,
  maxRetries: 5,
});

const receiptSchema = z.object({
  opHash: z.string().trim().refine(isValidOpHash, "Invalid Tezos operation hash"),
  contract: z.string().trim().regex(KT1_PATTERN).optional(),
  tokenId: z.string().trim().regex(/^(0|[1-9][0-9]*)$/).optional(),
  network: z.enum(["mainnet", "shadownet"]).default("mainnet"),
});

type IndexedTransfer = {
  id?: number;
  transactionId?: number;
  token?: {
    contract?: { address?: string } | string;
    tokenId?: string | number;
  };
  from?: { address?: string } | null;
  to?: { address?: string } | null;
  amount?: string | number;
};

export function tokenContractAddress(transfer: IndexedTransfer): string {
  const contract = transfer.token?.contract;
  return typeof contract === "string" ? contract : String(contract?.address || "");
}

export function findLinkedMintTransfer(
  transfers: IndexedTransfer[],
  linkedWallets: string[],
  expected: { contract?: string; tokenId?: string },
): IndexedTransfer | null {
  const linked = new Set(linkedWallets.map((address) => address.toLowerCase()));
  return transfers.find((transfer) => {
    const contract = tokenContractAddress(transfer);
    const tokenId = String(transfer.token?.tokenId ?? "");
    const recipient = String(transfer.to?.address || "").toLowerCase();
    const from = transfer.from?.address;
    return (
      (!expected.contract || contract === expected.contract) &&
      (!expected.tokenId || tokenId === expected.tokenId) &&
      linked.has(recipient) &&
      !from
    );
  }) ?? null;
}

router.post("/api/mint-manager/receipt", isAuthenticated, async (req, res) => {
  try {
    const parsed = receiptSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid receipt request" });
    const user = req.user as any;
    const linkedRows = await db
      .select({ walletAddress: userWallets.walletAddress })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id));
    const linkedWallets = linkedRows.map((row) => row.walletAddress);
    if (linkedWallets.length === 0) return res.status(403).json({ error: "Link the signing wallet to this account before verifying a mint." });

    const indexer = parsed.data.network === "shadownet" ? shadownetTzkt : tzkt;
    const operations = await fetchTransactionsByHash(parsed.data.opHash, { client: indexer });
    if (operations.length === 0) {
      return res.status(202).json({
        status: "pending",
        opHash: parsed.data.opHash,
        explorerUrl: parsed.data.network === "shadownet"
          ? `https://shadownet.tzkt.io/${parsed.data.opHash}`
          : `https://tzkt.io/${parsed.data.opHash}`,
      });
    }

    const linkedSet = new Set(linkedWallets.map((address) => address.toLowerCase()));
    const appliedByLinkedWallet = operations.filter((operation) =>
      operation.status === "applied" && linkedSet.has(String(operation.sender?.address || "").toLowerCase())
    );
    if (appliedByLinkedWallet.length === 0) {
      return res.status(422).json({ error: "That operation is not an applied transaction from one of your linked wallets." });
    }
    if (parsed.data.contract && !appliedByLinkedWallet.some((operation) => operation.target?.address === parsed.data.contract)) {
      return res.status(422).json({ error: "That operation does not call the contract shown in this mint workflow." });
    }

    const transactionIds = appliedByLinkedWallet
      .map((operation) => operation.id)
      .filter((id): id is number => Number.isSafeInteger(id));
    const transfers = transactionIds.length > 0
      ? await indexer.getJson<IndexedTransfer[]>("/tokens/transfers", {
          "transactionId.in": transactionIds.join(","),
          limit: 1000,
        })
      : [];
    const transfer = findLinkedMintTransfer(transfers, linkedWallets, parsed.data);
    const explorerUrl = parsed.data.network === "shadownet"
      ? `https://shadownet.tzkt.io/${parsed.data.opHash}`
      : `https://tzkt.io/${parsed.data.opHash}`;
    if (!transfer) {
      return res.status(202).json({
        status: "pending",
        opHash: parsed.data.opHash,
        contract: parsed.data.contract,
        tokenId: parsed.data.tokenId,
        explorerUrl,
      });
    }

    const contract = tokenContractAddress(transfer);
    const tokenId = String(transfer.token?.tokenId ?? "");
    return res.json({
      status: "applied",
      opHash: parsed.data.opHash,
      contract,
      tokenId,
      amount: String(transfer.amount ?? ""),
      explorerUrl,
      ...(parsed.data.network === "mainnet" ? { objktUrl: `https://objkt.com/tokens/${contract}/${tokenId}` } : {}),
    });
  } catch (error) {
    console.error("[mint-manager] receipt verification failed:", error);
    res.status(502).json({ error: "Mint receipt verification is temporarily unavailable. Keep the operation hash and retry without signing again." });
  }
});

export default router;
