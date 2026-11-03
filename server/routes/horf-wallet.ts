import { Router, type Request } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { horfPossePartners, horfVerifiedWallets, userWallets } from "@shared/schema";
import { createWalletAuthNonce, consumeWalletAuthNonce } from "../auth/storage";
import { buildChallengeMessage, normalizeWalletProofOrigin, verifyPublicKeyOwnership, verifyWalletSignature } from "../auth/wallet-verify";
import { isTezosWallet } from "../features/horf/model";
import { horfSessionWallet, horfWalletSource, requireHorfCsrf } from "../features/horf/wallet-scope";
import { getOwnedFa2TokensPage } from "../tzkt";
import { horfMainnetIndex, HORF_MAINNET_TZKT_BASE } from "../features/horf/mainnet-index";
import { HORF_HORSE_CHAIN_ID } from "../features/horf/horse-config";

const router = Router();

function proofOrigin(req: Request) {
  return normalizeWalletProofOrigin(req.get("origin") || `${req.protocol}://${req.get("host")}`);
}

function sessionSave(req: { session: { save: (cb: (error?: unknown) => void) => void } }): Promise<void> {
  return new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
}

router.post("/api/horf/wallet/challenge", requireHorfCsrf, async (req, res) => {
  const walletAddress = req.body?.walletAddress;
  if (!isTezosWallet(walletAddress)) return res.status(400).json({ error: "A valid Tezos wallet address is required" });
  try {
    const origin = proofOrigin(req);
    const { nonce, expiresAt } = await createWalletAuthNonce(walletAddress, { origin, action: "horf" });
    const message = buildChallengeMessage({ nonce, walletAddress, origin, action: "horf", expiresAt });
    return res.json({ nonce, message, expiresAt: expiresAt.toISOString(), action: "horf", origin });
  } catch (error) {
    console.error("[horf] challenge failed:", error);
    return res.status(503).json({ error: "Wallet challenge is temporarily unavailable" });
  }
});

router.post("/api/horf/wallet/verify", requireHorfCsrf, async (req, res) => {
  const { walletAddress, publicKey, signature, nonce } = req.body || {};
  if (!isTezosWallet(walletAddress) || typeof publicKey !== "string" ||
      typeof signature !== "string" || typeof nonce !== "string") {
    return res.status(400).json({ error: "Wallet address, public key, signature, and nonce are required" });
  }
  if (!verifyPublicKeyOwnership(walletAddress, publicKey)) {
    return res.status(403).json({ error: "Public key does not match this wallet" });
  }
  try {
    const origin = proofOrigin(req);
    const claimed = await consumeWalletAuthNonce(walletAddress, nonce, { origin, action: "horf" });
    if (!claimed) return res.status(403).json({ error: "Wallet challenge expired or was already used" });
    const message = buildChallengeMessage({ nonce, walletAddress, origin, action: "horf", expiresAt: claimed.expiresAt });
    if (!verifyWalletSignature(message, signature, publicKey)) {
      return res.status(403).json({ error: "Wallet signature could not be verified" });
    }

    const userId = Number((req.user as { id?: unknown } | undefined)?.id);
    const signedIn = Number.isSafeInteger(userId) && userId > 0;
    const [owner] = await db.select({ userId: userWallets.userId }).from(userWallets)
      .where(eq(userWallets.walletAddress, walletAddress)).limit(1);
    if (signedIn && owner && owner.userId !== userId) {
      return res.status(409).json({ error: "Wallet is already linked to another WTF OS account" });
    }
    const source = signedIn && owner?.userId === userId ? "linked" : "wallet-proof";

    // Legacy account-owned contacts with no wallet at migration time follow
    // the account's first Horf-proven wallet, once, then stay wallet-scoped.
    if (signedIn) {
      await db.transaction(async (tx) => {
        const legacy = await tx.select().from(horfPossePartners)
          .where(and(eq(horfPossePartners.userId, userId), isNull(horfPossePartners.ownerWalletAddress)));
        for (const row of legacy) {
          const [same] = await tx.select().from(horfPossePartners)
            .where(and(eq(horfPossePartners.ownerWalletAddress, walletAddress), eq(horfPossePartners.address, row.address)))
            .limit(1);
          if (same) {
            if (!same.nickname && row.nickname) {
              await tx.update(horfPossePartners).set({ nickname: row.nickname }).where(eq(horfPossePartners.id, same.id));
            }
            await tx.delete(horfPossePartners).where(eq(horfPossePartners.id, row.id));
          } else {
            await tx.update(horfPossePartners).set({ ownerWalletAddress: walletAddress })
              .where(and(eq(horfPossePartners.id, row.id), isNull(horfPossePartners.ownerWalletAddress)));
          }
        }
      });
    }

    await db.insert(horfVerifiedWallets).values({
      address: walletAddress,
      proofSource: owner ? "linked-account" : "wallet-proof",
      linkedUserId: owner?.userId ?? null,
    }).onConflictDoUpdate({
      target: horfVerifiedWallets.address,
      set: {
        lastVerifiedAt: new Date(),
        proofSource: owner ? "linked-account" : "wallet-proof",
        ...(owner ? { linkedUserId: owner.userId } : {}),
      },
    });

    // Regenerate only anonymous sessions. Passport data survives signed-in Horf proof.
    if (!signedIn) {
      await new Promise<void>((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
    }
    (req.session as typeof req.session & { horfWalletAddress?: string }).horfWalletAddress = walletAddress;
    await sessionSave(req);
    return res.json({ walletAddress, verified: true, source });
  } catch (error) {
    console.error("[horf] wallet verification failed:", error);
    return res.status(503).json({ error: "Wallet proof could not be saved right now" });
  }
});

router.get("/api/horf/wallet/session", async (req, res) => {
  const address = req.query.address;
  if (address != null && !isTezosWallet(address)) return res.status(400).json({ error: "A valid Tezos wallet address is required" });
  const walletAddress = address || horfSessionWallet(req);
  if (!walletAddress) return res.json({ walletAddress: null, verified: false });
  try {
    const source = await horfWalletSource(req, walletAddress);
    return source
      ? res.json({ walletAddress, verified: true, source })
      : res.json({ walletAddress, verified: false });
  } catch (error) {
    console.error("[horf] wallet session read failed:", error);
    return res.status(503).json({ error: "Wallet session could not be checked" });
  }
});

router.post("/api/horf/wallet/disconnect", requireHorfCsrf, async (req, res) => {
  delete (req.session as typeof req.session & { horfWalletAddress?: string }).horfWalletAddress;
  try {
    await sessionSave(req);
    return res.json({ walletAddress: null, verified: false });
  } catch (error) {
    console.error("[horf] wallet disconnect failed:", error);
    return res.status(503).json({ error: "Wallet session could not be cleared" });
  }
});

/** On-chain balances are public; no WTF account or Horf proof is required. */
router.get("/api/horf/wallet/tokens", async (req, res) => {
  const address = req.query.address;
  const offset = Number(req.query.offset ?? 0);
  const q = String(req.query.q ?? "").trim().toLowerCase();
  const refresh = req.query.refresh === "1";
  if (!isTezosWallet(address) || !Number.isSafeInteger(offset) || offset < 0 ||
      (req.query.refresh != null && !refresh)) {
    return res.status(400).json({ error: "Valid wallet, offset, and search are required" });
  }
  try {
    const head = await horfMainnetIndex.getJson<{ chainId?: string }>("/head");
    if (head.chainId !== HORF_HORSE_CHAIN_ID) {
      return res.status(503).json({ error: "Horf wallet tokens require the Tezos Mainnet index" });
    }
    const limit = 48;
    if (!q) {
      const page = await getOwnedFa2TokensPage(address, limit, offset, { sourceBase: HORF_MAINNET_TZKT_BASE, forceFresh: refresh });
      return res.json({ items: page.items.map((token) => ({ ...token, walletAddress: address })),
        pagination: { hasMore: page.hasMore, nextOffset: page.nextOffset } });
    }
    const matches: Awaited<ReturnType<typeof getOwnedFa2TokensPage>>["items"] = [];
    let cursor = offset;
    let hasMore = false;
    while (matches.length < limit) {
      const page = await getOwnedFa2TokensPage(address, 200, cursor, { sourceBase: HORF_MAINNET_TZKT_BASE, forceFresh: refresh });
      for (const token of page.items) {
        if (`${token.contract} ${token.tokenId} ${token.name || ""}`.toLowerCase().includes(q)) matches.push(token);
      }
      cursor = page.nextOffset;
      hasMore = page.hasMore;
      if (!hasMore) break;
    }
    return res.json({ items: matches.map((token) => ({ ...token, walletAddress: address })),
      pagination: { hasMore, nextOffset: cursor } });
  } catch (error) {
    console.error("[horf] public wallet token read failed:", error);
    return res.status(503).json({ error: "Wallet tokens are temporarily unavailable" });
  }
});

export default router;
