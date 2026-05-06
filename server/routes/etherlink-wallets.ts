import { Router } from "express";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  etherlinkTokenMetadata,
  etherlinkWalletHoldings,
  userEtherlinkWallets,
} from "@shared/schema";
import { isAuthenticated } from "../auth/passport";
import { db } from "../db";
import {
  ETHERLINK_NETWORKS,
  etherlinkExplorerAddressUrl,
  etherlinkExplorerTokenUrl,
  normalizeEvmAddress,
  resolveEtherlinkNetwork,
  resolveEtherlinkNetworkByChainId,
} from "../lib/etherlink/config";
import {
  buildEtherlinkChallengeMessage,
  consumeEtherlinkWalletAuthNonce,
  createEtherlinkWalletAuthNonce,
  verifyEtherlinkWalletSignature,
} from "../lib/etherlink/auth";
import {
  runEtherlinkPortfolioSyncForAll,
  syncEtherlinkWalletAssets,
} from "../lib/etherlink/portfolio-sync";

const router = Router();

function chainIdFromBody(value: unknown): number {
  if (value == null || value === "") return resolveEtherlinkNetwork().chainId;
  const n = Number(value);
  if (!Number.isInteger(n)) return NaN;
  return n;
}

function supportedNetworkOrNull(chainId: number) {
  return Number.isInteger(chainId)
    ? resolveEtherlinkNetworkByChainId(chainId)
    : null;
}

function walletKey(chainId: number, address: string) {
  return `${chainId}:${address.toLowerCase()}`;
}

function formatNativeXtz(wei: string | null | undefined): string {
  try {
    const raw = BigInt(wei || "0");
    const whole = raw / 10n ** 18n;
    const frac = raw % 10n ** 18n;
    const fracText = frac.toString().padStart(18, "0").slice(0, 6);
    return `${whole.toString()}.${fracText}`.replace(/\.?0+$/, "");
  } catch {
    return "0";
  }
}

async function userOwnsEtherlinkWallet(userId: number, walletId: number) {
  const [wallet] = await db
    .select()
    .from(userEtherlinkWallets)
    .where(
      and(
        eq(userEtherlinkWallets.id, walletId),
        eq(userEtherlinkWallets.userId, userId),
      ),
    )
    .limit(1);
  return wallet ?? null;
}

router.get("/api/etherlink/networks", (_req, res) => {
  res.json({
    defaultChainId: resolveEtherlinkNetwork().chainId,
    networks: Object.values(ETHERLINK_NETWORKS),
  });
});

router.get("/api/etherlink/wallets", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as { id: number };
    const wallets = await db
      .select()
      .from(userEtherlinkWallets)
      .where(eq(userEtherlinkWallets.userId, user.id))
      .orderBy(asc(userEtherlinkWallets.chainId), desc(userEtherlinkWallets.isPrimary));

    const countRows = await db
      .select({
        walletAddress: etherlinkWalletHoldings.walletAddress,
        chainId: etherlinkWalletHoldings.chainId,
        tokenCount: sql<number>`count(*)::int`,
      })
      .from(etherlinkWalletHoldings)
      .where(
        and(
          eq(etherlinkWalletHoldings.userId, user.id),
          sql`COALESCE(NULLIF(${etherlinkWalletHoldings.balance}, ''), '0')::numeric > 0`,
        ),
      )
      .groupBy(
        etherlinkWalletHoldings.walletAddress,
        etherlinkWalletHoldings.chainId,
      );
    const counts = new Map(
      countRows.map((row) => [
        walletKey(row.chainId, row.walletAddress),
        Number(row.tokenCount),
      ]),
    );

    res.json(
      wallets.map((wallet) => ({
        id: wallet.id,
        walletAddress: wallet.walletAddress,
        chainId: wallet.chainId,
        network: wallet.network,
        providerKey: wallet.providerKey,
        providerName: wallet.providerName,
        nativeBalanceWei: wallet.nativeBalanceWei,
        nativeBalanceXtz: formatNativeXtz(wallet.nativeBalanceWei),
        isPrimary: wallet.isPrimary,
        linkedAt: wallet.linkedAt,
        lastSyncedAt: wallet.lastSyncedAt,
        tokenCount: counts.get(walletKey(wallet.chainId, wallet.walletAddress)) ?? 0,
        explorerUrl: etherlinkExplorerAddressUrl(
          wallet.chainId,
          wallet.walletAddress,
        ),
      })),
    );
  } catch (err) {
    console.error("[etherlink] GET /wallets failed:", err);
    res.status(500).json({ error: "Failed to fetch Etherlink wallets" });
  }
});

router.post("/api/etherlink/wallets/challenge", isAuthenticated, async (req, res) => {
  try {
    const walletAddress = normalizeEvmAddress(req.body?.walletAddress);
    const chainId = chainIdFromBody(req.body?.chainId);
    const network = supportedNetworkOrNull(chainId);
    if (!walletAddress) return res.status(400).json({ error: "Invalid Etherlink wallet address" });
    if (!network) return res.status(400).json({ error: "Unsupported Etherlink chain" });

    const nonce = await createEtherlinkWalletAuthNonce(walletAddress, network.chainId);
    const message = buildEtherlinkChallengeMessage({
      nonce,
      walletAddress,
      chainId: network.chainId,
    });
    res.json({ nonce, message, chainId: network.chainId, network: network.id });
  } catch (err) {
    console.error("[etherlink] challenge failed:", err);
    res.status(500).json({ error: "Failed to create Etherlink challenge" });
  }
});

router.post("/api/etherlink/wallets", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as { id: number };
    const walletAddress = normalizeEvmAddress(req.body?.walletAddress);
    const chainId = chainIdFromBody(req.body?.chainId);
    const network = supportedNetworkOrNull(chainId);
    if (!walletAddress) return res.status(400).json({ error: "Invalid Etherlink wallet address" });
    if (!network) return res.status(400).json({ error: "Unsupported Etherlink chain" });

    const existing = await db
      .select()
      .from(userEtherlinkWallets)
      .where(
        and(
          eq(userEtherlinkWallets.userId, user.id),
          eq(userEtherlinkWallets.chainId, network.chainId),
          eq(userEtherlinkWallets.walletAddress, walletAddress),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      const sync = await syncEtherlinkWalletAssets(
        user.id,
        walletAddress,
        network.chainId,
      ).catch((err) => ({
        error: err instanceof Error ? err.message : String(err),
      }));
      return res.status(200).json({ ...existing[0], sync });
    }

    const signature = String(req.body?.signature || "");
    const nonce = String(req.body?.nonce || "");
    if (!signature || !nonce) {
      return res
        .status(400)
        .json({ error: "Signature proof required to link a new Etherlink wallet" });
    }

    const nonceValid = await consumeEtherlinkWalletAuthNonce(
      walletAddress,
      network.chainId,
      nonce,
    );
    if (!nonceValid) return res.status(401).json({ error: "Invalid or expired nonce" });

    const message = buildEtherlinkChallengeMessage({
      nonce,
      walletAddress,
      chainId: network.chainId,
    });
    const signatureValid = await verifyEtherlinkWalletSignature({
      walletAddress,
      message,
      signature,
    });
    if (!signatureValid) {
      return res.status(401).json({ error: "Etherlink signature verification failed" });
    }

    const owners = await db
      .select()
      .from(userEtherlinkWallets)
      .where(
        and(
          eq(userEtherlinkWallets.chainId, network.chainId),
          sql`LOWER(${userEtherlinkWallets.walletAddress}) = LOWER(${walletAddress})`,
        ),
      )
      .limit(1);
    if (owners.length > 0 && owners[0]!.userId !== user.id) {
      return res.status(409).json({ error: "Etherlink wallet is already linked to another account" });
    }

    const existingWallets = await db
      .select({ id: userEtherlinkWallets.id })
      .from(userEtherlinkWallets)
      .where(
        and(
          eq(userEtherlinkWallets.userId, user.id),
          eq(userEtherlinkWallets.chainId, network.chainId),
        ),
      );

    const [wallet] = await db
      .insert(userEtherlinkWallets)
      .values({
        userId: user.id,
        walletAddress,
        chainId: network.chainId,
        network: network.id,
        providerKey:
          typeof req.body?.providerKey === "string"
            ? req.body.providerKey.slice(0, 32)
            : null,
        providerName:
          typeof req.body?.providerName === "string"
            ? req.body.providerName.slice(0, 80)
            : null,
        isPrimary: existingWallets.length === 0,
      })
      .returning();

    const sync = await syncEtherlinkWalletAssets(
      user.id,
      walletAddress,
      network.chainId,
    ).catch((err) => ({
      error: err instanceof Error ? err.message : String(err),
    }));

    res.status(201).json({ ...wallet, sync });
  } catch (err) {
    console.error("[etherlink] wallet link failed:", err);
    res.status(500).json({ error: "Failed to link Etherlink wallet" });
  }
});

router.put("/api/etherlink/wallets/:id/primary", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as { id: number };
    const walletId = parseInt(String(req.params.id), 10);
    const wallet = await userOwnsEtherlinkWallet(user.id, walletId);
    if (!wallet) return res.status(404).json({ error: "Etherlink wallet not found" });

    await db
      .update(userEtherlinkWallets)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(
        and(
          eq(userEtherlinkWallets.userId, user.id),
          eq(userEtherlinkWallets.chainId, wallet.chainId),
        ),
      );
    const [updated] = await db
      .update(userEtherlinkWallets)
      .set({ isPrimary: true, updatedAt: new Date() })
      .where(eq(userEtherlinkWallets.id, wallet.id))
      .returning();
    res.json(updated);
  } catch (err) {
    console.error("[etherlink] primary update failed:", err);
    res.status(500).json({ error: "Failed to set Etherlink primary wallet" });
  }
});

router.delete("/api/etherlink/wallets/:id", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as { id: number };
    const walletId = parseInt(String(req.params.id), 10);
    const wallet = await userOwnsEtherlinkWallet(user.id, walletId);
    if (!wallet) return res.status(404).json({ error: "Etherlink wallet not found" });

    await db
      .delete(etherlinkWalletHoldings)
      .where(
        and(
          eq(etherlinkWalletHoldings.userId, user.id),
          eq(etherlinkWalletHoldings.chainId, wallet.chainId),
          eq(etherlinkWalletHoldings.walletAddress, wallet.walletAddress),
        ),
      );
    await db
      .delete(userEtherlinkWallets)
      .where(eq(userEtherlinkWallets.id, wallet.id));

    if (wallet.isPrimary) {
      const [next] = await db
        .select({ id: userEtherlinkWallets.id })
        .from(userEtherlinkWallets)
        .where(
          and(
            eq(userEtherlinkWallets.userId, user.id),
            eq(userEtherlinkWallets.chainId, wallet.chainId),
          ),
        )
        .orderBy(asc(userEtherlinkWallets.linkedAt))
        .limit(1);
      if (next) {
        await db
          .update(userEtherlinkWallets)
          .set({ isPrimary: true, updatedAt: new Date() })
          .where(eq(userEtherlinkWallets.id, next.id));
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[etherlink] unlink failed:", err);
    res.status(500).json({ error: "Failed to unlink Etherlink wallet" });
  }
});

router.post("/api/etherlink/wallets/:id/sync", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as { id: number };
    const walletId = parseInt(String(req.params.id), 10);
    const wallet = await userOwnsEtherlinkWallet(user.id, walletId);
    if (!wallet) return res.status(404).json({ error: "Etherlink wallet not found" });
    const result = await syncEtherlinkWalletAssets(
      user.id,
      wallet.walletAddress,
      wallet.chainId,
    );
    res.json({ ok: true, result });
  } catch (err) {
    console.error("[etherlink] wallet sync failed:", err);
    res.status(500).json({ error: "Failed to sync Etherlink wallet" });
  }
});

router.post("/api/etherlink/wallets/sync", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as { id: number };
    const wallets = await db
      .select()
      .from(userEtherlinkWallets)
      .where(eq(userEtherlinkWallets.userId, user.id));
    if (wallets.length === 0) {
      return res.status(400).json({ error: "No linked Etherlink wallets to sync" });
    }

    let upserted = 0;
    for (const wallet of wallets) {
      const result = await syncEtherlinkWalletAssets(
        user.id,
        wallet.walletAddress,
        wallet.chainId,
      );
      upserted += result.upserted;
    }
    res.json({ ok: true, walletsProcessed: wallets.length, totalAssets: upserted });
  } catch (err) {
    console.error("[etherlink] sync all failed:", err);
    res.status(500).json({ error: "Failed to sync Etherlink wallets" });
  }
});

router.get("/api/etherlink/assets", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as { id: number };
    const limit = Math.min(
      200,
      Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50),
    );
    const offset = Math.max(0, parseInt(String(req.query.offset ?? "0"), 10) || 0);
    const q = String(req.query.q ?? "").trim();
    const walletId = parseInt(String(req.query.walletId ?? ""), 10);
    const chainId = parseInt(String(req.query.chainId ?? ""), 10);

    const whereParts: any[] = [
      eq(etherlinkWalletHoldings.userId, user.id),
      sql`COALESCE(NULLIF(${etherlinkWalletHoldings.balance}, ''), '0')::numeric > 0`,
    ];

    if (Number.isInteger(walletId)) {
      const wallet = await userOwnsEtherlinkWallet(user.id, walletId);
      if (!wallet) return res.status(403).json({ error: "Etherlink wallet not linked" });
      whereParts.push(eq(etherlinkWalletHoldings.walletAddress, wallet.walletAddress));
      whereParts.push(eq(etherlinkWalletHoldings.chainId, wallet.chainId));
    } else if (Number.isInteger(chainId)) {
      whereParts.push(eq(etherlinkWalletHoldings.chainId, chainId));
    }

    if (q) {
      const like = `%${q}%`;
      whereParts.push(sql`(
        COALESCE(${etherlinkTokenMetadata.name}, '') ILIKE ${like}
        OR COALESCE(${etherlinkTokenMetadata.symbol}, '') ILIKE ${like}
        OR COALESCE(${etherlinkTokenMetadata.raw}::text, '') ILIKE ${like}
        OR ${etherlinkWalletHoldings.walletAddress} ILIKE ${like}
        OR ${etherlinkWalletHoldings.tokenContract} ILIKE ${like}
        OR CAST(${etherlinkWalletHoldings.tokenId} AS TEXT) ILIKE ${like}
      )`);
    }

    const rows = await db
      .select({
        id: etherlinkWalletHoldings.id,
        walletAddress: etherlinkWalletHoldings.walletAddress,
        chainId: etherlinkWalletHoldings.chainId,
        network: etherlinkWalletHoldings.network,
        tokenContract: etherlinkWalletHoldings.tokenContract,
        tokenId: etherlinkWalletHoldings.tokenId,
        tokenStandard: etherlinkWalletHoldings.tokenStandard,
        balance: etherlinkWalletHoldings.balance,
        name: etherlinkTokenMetadata.name,
        symbol: etherlinkTokenMetadata.symbol,
        decimals: etherlinkTokenMetadata.decimals,
        thumbnail: etherlinkTokenMetadata.thumbnail,
        displayUri: etherlinkTokenMetadata.displayUri,
        artifactUri: etherlinkTokenMetadata.artifactUri,
        externalUrl: etherlinkTokenMetadata.externalUrl,
        metadata: etherlinkTokenMetadata.raw,
        updatedAt: etherlinkWalletHoldings.derivedAt,
      })
      .from(etherlinkWalletHoldings)
      .leftJoin(
        etherlinkTokenMetadata,
        and(
          eq(etherlinkTokenMetadata.chainId, etherlinkWalletHoldings.chainId),
          eq(etherlinkTokenMetadata.tokenContract, etherlinkWalletHoldings.tokenContract),
          eq(etherlinkTokenMetadata.tokenId, etherlinkWalletHoldings.tokenId),
        ),
      )
      .where(and(...whereParts))
      .orderBy(desc(etherlinkWalletHoldings.derivedAt))
      .limit(limit)
      .offset(offset);

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(etherlinkWalletHoldings)
      .leftJoin(
        etherlinkTokenMetadata,
        and(
          eq(etherlinkTokenMetadata.chainId, etherlinkWalletHoldings.chainId),
          eq(etherlinkTokenMetadata.tokenContract, etherlinkWalletHoldings.tokenContract),
          eq(etherlinkTokenMetadata.tokenId, etherlinkWalletHoldings.tokenId),
        ),
      )
      .where(and(...whereParts));

    const walletRows = await db
      .select({ id: userEtherlinkWallets.id })
      .from(userEtherlinkWallets)
      .where(eq(userEtherlinkWallets.userId, user.id));

    res.json({
      items: rows.map((row) => ({
        ...row,
        thumbnail: row.thumbnail || row.displayUri || row.artifactUri || undefined,
        explorerUrl: etherlinkExplorerTokenUrl(
          row.chainId,
          row.tokenContract,
          row.tokenId,
        ),
      })),
      pagination: {
        limit,
        offset,
        total: Number(totalRow?.count ?? 0),
        hasMore: offset + rows.length < Number(totalRow?.count ?? 0),
        nextOffset: offset + rows.length,
      },
      wallets: walletRows.map((row) => row.id),
    });
  } catch (err) {
    console.error("[etherlink] assets fetch failed:", err);
    res.status(500).json({ error: "Failed to fetch Etherlink assets" });
  }
});

router.post("/api/admin/etherlink/sync-all", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as { role?: string };
    if (user.role !== "admin" && user.role !== "host" && user.role !== "cohost") {
      return res.status(403).json({ error: "Admin role required" });
    }
    const result = await runEtherlinkPortfolioSyncForAll();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[etherlink] admin sync-all failed:", err);
    res.status(500).json({ error: "Failed to sync Etherlink wallets" });
  }
});

export default router;
