import { db } from "../db";
import { userWallets, userOwnedTokens } from "@shared/schema";
import { eq, and, sql, lt } from "drizzle-orm";
import { getOwnedFa2TokensPage, getTokenBalance } from "../tzkt";
import { cleanupExpiredNonces } from "../auth/storage";
import {
  startWalletSurveillance,
  stopWalletSurveillance,
} from "./wallet-events";

const TOKEN_SYNC_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours
const NONCE_CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

let syncTimer: ReturnType<typeof setInterval> | null = null;
let nonceTimer: ReturnType<typeof setInterval> | null = null;

export async function runTokenSync(): Promise<void> {
  const wallets = await db.select().from(userWallets);
  let synced = 0;
  let errors = 0;

  for (const wallet of wallets) {
    try {
      const syncStartedAt = new Date();
      const pageSize = 250;
      let offset = 0;
      let keepGoing = true;

      while (keepGoing) {
        const page = await getOwnedFa2TokensPage(
          wallet.walletAddress,
          pageSize,
          offset
        );
        const tokens = page.items;

        if (tokens.length > 0) {
          const updatedAt = new Date();
          const rows = tokens.map((token) => ({
            userId: wallet.userId,
            walletAddress: wallet.walletAddress,
            tokenContract: token.contract,
            tokenId: token.tokenId,
            balance: token.balance,
            tokenName: typeof token.name === "string" ? token.name : null,
            tokenSymbol: typeof token.symbol === "string" ? token.symbol : null,
            tokenThumbnail: token.thumbnail ?? null,
            metadata: token.metadata ?? null,
            creatorAddress: token.creatorAddress ?? null,
            lastSeenAt: syncStartedAt,
            updatedAt,
          }));

          await db
            .insert(userOwnedTokens)
            .values(rows)
            .onConflictDoUpdate({
              target: [
                userOwnedTokens.userId,
                userOwnedTokens.walletAddress,
                userOwnedTokens.tokenContract,
                userOwnedTokens.tokenId,
              ],
              set: {
                balance: sql`excluded.balance`,
                tokenName: sql`excluded.token_name`,
                tokenSymbol: sql`excluded.token_symbol`,
                tokenThumbnail: sql`excluded.token_thumbnail`,
                metadata: sql`excluded.metadata`,
                creatorAddress: sql`excluded.creator_address`,
                lastSeenAt: sql`excluded.last_seen_at`,
                updatedAt: sql`excluded.updated_at`,
              },
            });
        }

        keepGoing = page.hasMore;
        offset = page.nextOffset;
      }

      await db
        .delete(userOwnedTokens)
        .where(
          and(
            eq(userOwnedTokens.userId, wallet.userId),
            eq(userOwnedTokens.walletAddress, wallet.walletAddress),
            sql`${userOwnedTokens.tokenContract} <> 'WTF'`,
            lt(userOwnedTokens.lastSeenAt, syncStartedAt)
          )
        );

      const wtf = await getTokenBalance(wallet.walletAddress);
      const wtfBalance = String(wtf?.balance ?? "0");
      const existing = await db
        .select({ id: userOwnedTokens.id })
        .from(userOwnedTokens)
        .where(
          and(
            eq(userOwnedTokens.userId, wallet.userId),
            eq(userOwnedTokens.walletAddress, wallet.walletAddress),
            eq(userOwnedTokens.tokenContract, "WTF"),
            eq(userOwnedTokens.tokenId, "0")
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(userOwnedTokens)
          .set({
            balance: wtfBalance,
            lastSeenAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(userOwnedTokens.id, existing[0].id));
      } else {
        await db.insert(userOwnedTokens).values({
          userId: wallet.userId,
          walletAddress: wallet.walletAddress,
          tokenContract: "WTF",
          tokenId: "0",
          balance: wtfBalance,
          tokenName: "WTF",
          tokenSymbol: "WTF",
          metadata: { synthetic: true, source: "tzkt_wtf_balance" } as any,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        });
      }

      synced++;
    } catch (err) {
      console.error(
        `[token-sync] failed for wallet ${wallet.walletAddress}:`,
        err
      );
      errors++;
    }
  }

  console.log(
    `[token-sync] done: ${synced} synced, ${errors} errors, ${wallets.length} total wallets`
  );
}

export function startBackgroundJobs(): void {
  console.log("[jobs] Starting background intervals");

  runTokenSync().catch((err) =>
    console.error("[token-sync] initial run failed:", err)
  );
  syncTimer = setInterval(() => {
    runTokenSync().catch((err) =>
      console.error("[token-sync] scheduled run failed:", err)
    );
  }, TOKEN_SYNC_INTERVAL);

  cleanupExpiredNonces().catch((err) =>
    console.error("[nonce-cleanup] initial run failed:", err)
  );
  nonceTimer = setInterval(() => {
    cleanupExpiredNonces().catch((err) =>
      console.error("[nonce-cleanup] scheduled run failed:", err)
    );
  }, NONCE_CLEANUP_INTERVAL);

  console.log(
    `[jobs] token-sync every ${TOKEN_SYNC_INTERVAL / 60000}min, nonce cleanup every ${NONCE_CLEANUP_INTERVAL / 60000}min`
  );

  startWalletSurveillance();
}

export function stopBackgroundJobs(): void {
  if (syncTimer) clearInterval(syncTimer);
  if (nonceTimer) clearInterval(nonceTimer);
  syncTimer = null;
  nonceTimer = null;
  stopWalletSurveillance();
  console.log("[jobs] Background intervals stopped");
}
