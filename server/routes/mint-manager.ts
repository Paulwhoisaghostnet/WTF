import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { mediaMintReceipts, userMediaLibrary, userWallets } from "@shared/schema";
import { isAuthenticated } from "../auth/passport";
import { ingestSystemEvent } from "../challenges/events/ingest";
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
  mediaItemId: z.coerce.number().int().positive(),
  opHash: z.string().trim().refine(isValidOpHash, "Invalid Tezos operation hash"),
  contract: z.string().trim().regex(KT1_PATTERN).optional(),
  tokenId: z.string().trim().regex(/^(0|[1-9][0-9]*)$/).optional(),
  network: z.enum(["mainnet", "shadownet"]).default("mainnet"),
  artifactUri: z.string().trim().max(2_000).optional(),
});

const mediaItemParamSchema = z.coerce.number().int().positive();

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

function explorerUrl(network: "mainnet" | "shadownet", opHash: string) {
  return network === "shadownet"
    ? `https://shadownet.tzkt.io/${opHash}`
    : `https://tzkt.io/${opHash}`;
}

function publicReceipt(receipt: typeof mediaMintReceipts.$inferSelect) {
  return {
    id: receipt.id,
    mediaItemId: receipt.mediaItemId,
    status: receipt.status,
    network: receipt.network,
    opHash: receipt.opHash,
    minterWallet: receipt.minterWallet,
    contract: receipt.contract ?? undefined,
    tokenId: receipt.tokenId ?? undefined,
    amount: receipt.amount ?? undefined,
    artifactUri: receipt.artifactUri ?? undefined,
    explorerUrl: explorerUrl(receipt.network, receipt.opHash),
    ...(receipt.network === "mainnet" && receipt.contract && receipt.tokenId
      ? { objktUrl: `https://objkt.com/tokens/${receipt.contract}/${receipt.tokenId}` }
      : {}),
    verifiedAt: receipt.verifiedAt?.toISOString() ?? undefined,
    createdAt: receipt.createdAt.toISOString(),
    updatedAt: receipt.updatedAt.toISOString(),
  };
}

router.get("/api/mint-manager/receipts/:mediaItemId", isAuthenticated, async (req, res) => {
  const mediaItemId = mediaItemParamSchema.safeParse(req.params.mediaItemId);
  if (!mediaItemId.success) return res.status(400).json({ error: "Choose a valid owned media item." });
  const user = req.user as any;
  const [media] = await db
    .select({ id: userMediaLibrary.id })
    .from(userMediaLibrary)
    .where(and(
      eq(userMediaLibrary.id, mediaItemId.data),
      eq(userMediaLibrary.ownerUserId, user.id),
    ))
    .limit(1);
  if (!media) return res.status(404).json({ error: "That media item is not in your library." });
  const receipts = await db
    .select()
    .from(mediaMintReceipts)
    .where(and(
      eq(mediaMintReceipts.mediaItemId, media.id),
      eq(mediaMintReceipts.ownerUserId, user.id),
    ))
    .orderBy(desc(mediaMintReceipts.updatedAt), desc(mediaMintReceipts.id));
  return res.json(receipts.map(publicReceipt));
});

router.post("/api/mint-manager/receipt", isAuthenticated, async (req, res) => {
  try {
    const parsed = receiptSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid receipt request" });
    const user = req.user as any;
    const [media] = await db
      .select({ id: userMediaLibrary.id })
      .from(userMediaLibrary)
      .where(and(
        eq(userMediaLibrary.id, parsed.data.mediaItemId),
        eq(userMediaLibrary.ownerUserId, user.id),
      ))
      .limit(1);
    if (!media) return res.status(404).json({ error: "That media item is not in your library." });
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
        mediaItemId: media.id,
        network: parsed.data.network,
        opHash: parsed.data.opHash,
        explorerUrl: explorerUrl(parsed.data.network, parsed.data.opHash),
        persistence: "awaiting_linked_wallet_operation",
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
    const minterWallet = String(appliedByLinkedWallet[0]?.sender?.address || "");
    const contract = transfer ? tokenContractAddress(transfer) : parsed.data.contract;
    const tokenId = transfer ? String(transfer.token?.tokenId ?? "") : parsed.data.tokenId;
    const status = transfer ? "applied" : "pending";
    const [saved] = await db
      .insert(mediaMintReceipts)
      .values({
        mediaItemId: media.id,
        ownerUserId: user.id,
        network: parsed.data.network,
        opHash: parsed.data.opHash,
        minterWallet,
        contract: contract || null,
        tokenId: tokenId || null,
        amount: transfer ? String(transfer.amount ?? "") : null,
        artifactUri: parsed.data.artifactUri || null,
        status,
        verifiedAt: transfer ? new Date() : null,
      })
      .onConflictDoUpdate({
        target: [mediaMintReceipts.mediaItemId, mediaMintReceipts.opHash],
        set: {
          network: parsed.data.network,
          minterWallet,
          contract: contract || null,
          tokenId: tokenId || null,
          amount: transfer ? String(transfer.amount ?? "") : null,
          artifactUri: parsed.data.artifactUri || null,
          status,
          verifiedAt: transfer ? new Date() : null,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (status === "applied") {
      await ingestSystemEvent({
        eventId: `media.mint_manager.receipt_verified:${saved.id}`,
        eventType: "media.mint_manager.receipt_verified",
        userId: user.id,
        walletAddress: minterWallet,
        source: "media",
        sourceModule: "mint-manager",
        rawRefType: "media_mint_receipt",
        rawRefId: saved.id,
        metadata: {
          mediaItemId: media.id,
          network: parsed.data.network,
          opHash: parsed.data.opHash,
          contract,
          tokenId,
        },
      });
    }

    return res.status(transfer ? 200 : 202).json(publicReceipt(saved));
  } catch (error) {
    console.error("[mint-manager] receipt verification failed:", error);
    res.status(502).json({ error: "Mint receipt verification is temporarily unavailable. Keep the operation hash and retry without signing again." });
  }
});

export default router;
