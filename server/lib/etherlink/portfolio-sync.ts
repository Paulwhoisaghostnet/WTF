import { and, eq, sql } from "drizzle-orm";
import {
  etherlinkTokenMetadata,
  etherlinkWalletHoldings,
  userEtherlinkWallets,
} from "@shared/schema";
import { db } from "../../db";
import {
  normalizeEvmAddress,
  resolveEtherlinkNetworkByChainId,
} from "./config";
import {
  getEtherlinkAddressInfo,
  getEtherlinkTokenBalancesPage,
  type BlockscoutTokenBalanceRow,
} from "./blockscout";

type TokenStandard = "ERC-20" | "ERC-721" | "ERC-1155";

export interface EtherlinkSyncResult {
  walletAddress: string;
  chainId: number;
  scanned: number;
  upserted: number;
  nativeBalanceWei: string;
}

function normalizeStandard(value: unknown): TokenStandard | null {
  const text = String(value ?? "").toUpperCase();
  if (text === "ERC-20" || text === "ERC20") return "ERC-20";
  if (text === "ERC-721" || text === "ERC721") return "ERC-721";
  if (text === "ERC-1155" || text === "ERC1155") return "ERC-1155";
  return null;
}

function normalizeIpfsUri(uri: unknown): string | null {
  if (typeof uri !== "string" || !uri.trim()) return null;
  const trimmed = uri.trim();
  if (trimmed.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${trimmed.slice(7)}`;
  }
  return trimmed;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function parseDecimals(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 255) return null;
  return n;
}

function isPositiveBalance(value: string): boolean {
  if (!/^[0-9]+$/.test(value)) return value !== "0";
  try {
    return BigInt(value) > 0n;
  } catch {
    return value !== "0";
  }
}

function mapBalanceRow(row: BlockscoutTokenBalanceRow) {
  const token = (row.token_instance?.token ?? row.token ?? {}) as Record<string, any>;
  const instance = (row.token_instance ?? {}) as Record<string, any>;
  const metadata = (instance.metadata ?? {}) as Record<string, any>;
  const tokenContract = normalizeEvmAddress(
    token.address_hash ?? token.address ?? token.contract_address_hash,
  );
  const tokenStandard = normalizeStandard(token.type);
  if (!tokenContract || !tokenStandard) return null;

  const tokenId =
    tokenStandard === "ERC-20"
      ? "0"
      : String(row.token_id ?? instance.id ?? metadata.id ?? "");
  if (!tokenId) return null;

  const balance = String(row.value ?? "0");
  if (!isPositiveBalance(balance)) return null;

  const name = firstString(metadata.name, token.name);
  const description = firstString(metadata.description);
  const thumbnail = normalizeIpfsUri(
    firstString(
      instance.image_url,
      metadata.image_url,
      metadata.image,
      metadata.thumbnail,
      token.icon_url,
    ),
  );
  const artifactUri = normalizeIpfsUri(
    firstString(instance.animation_url, metadata.animation_url, metadata.animation),
  );
  const displayUri = normalizeIpfsUri(
    firstString(metadata.display_url, metadata.displayUri, thumbnail),
  );
  const externalUrl = firstString(
    instance.external_app_url,
    metadata.external_url,
    metadata.home_url,
  );

  return {
    tokenContract,
    tokenId,
    tokenStandard,
    balance,
    name,
    symbol: firstString(token.symbol),
    decimals: parseDecimals(token.decimals),
    description,
    thumbnail,
    artifactUri,
    displayUri,
    externalUrl,
    raw: row as Record<string, unknown>,
  };
}

async function upsertEtherlinkTokenMetadata(
  chainId: number,
  network: string,
  token: NonNullable<ReturnType<typeof mapBalanceRow>>,
): Promise<void> {
  const now = new Date();
  await db
    .insert(etherlinkTokenMetadata)
    .values({
      chainId,
      network,
      tokenContract: token.tokenContract,
      tokenId: token.tokenId,
      tokenStandard: token.tokenStandard,
      name: token.name,
      symbol: token.symbol,
      decimals: token.decimals,
      description: token.description,
      thumbnail: token.thumbnail,
      artifactUri: token.artifactUri,
      displayUri: token.displayUri,
      externalUrl: token.externalUrl,
      raw: token.raw as any,
      fetchedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        etherlinkTokenMetadata.chainId,
        etherlinkTokenMetadata.tokenContract,
        etherlinkTokenMetadata.tokenId,
      ],
      set: {
        tokenStandard: sql`EXCLUDED.token_standard`,
        name: sql`COALESCE(EXCLUDED.name, ${etherlinkTokenMetadata.name})`,
        symbol: sql`COALESCE(EXCLUDED.symbol, ${etherlinkTokenMetadata.symbol})`,
        decimals: sql`COALESCE(EXCLUDED.decimals, ${etherlinkTokenMetadata.decimals})`,
        description: sql`COALESCE(EXCLUDED.description, ${etherlinkTokenMetadata.description})`,
        thumbnail: sql`COALESCE(EXCLUDED.thumbnail, ${etherlinkTokenMetadata.thumbnail})`,
        artifactUri: sql`COALESCE(EXCLUDED.artifact_uri, ${etherlinkTokenMetadata.artifactUri})`,
        displayUri: sql`COALESCE(EXCLUDED.display_uri, ${etherlinkTokenMetadata.displayUri})`,
        externalUrl: sql`COALESCE(EXCLUDED.external_url, ${etherlinkTokenMetadata.externalUrl})`,
        raw: sql`COALESCE(EXCLUDED.raw, ${etherlinkTokenMetadata.raw})`,
        updatedAt: now,
      },
    });
}

export async function syncEtherlinkWalletAssets(
  userId: number,
  walletAddress: string,
  chainId: number,
): Promise<EtherlinkSyncResult> {
  const address = normalizeEvmAddress(walletAddress);
  if (!address) throw new Error("Invalid Etherlink wallet address");

  const network = resolveEtherlinkNetworkByChainId(chainId);
  if (!network) throw new Error("Unsupported Etherlink chain");

  const addressInfo = await getEtherlinkAddressInfo(network, address);
  const nativeBalanceWei = String(addressInfo?.coin_balance ?? "0");

  let scanned = 0;
  let upserted = 0;
  let pageParams: Record<string, string | number | boolean | null> | null = null;
  let pageCount = 0;
  const now = new Date();

  do {
    const page = await getEtherlinkTokenBalancesPage(
      network,
      address,
      pageParams ?? undefined,
    );
    const rows = Array.isArray(page.items) ? page.items : [];
    scanned += rows.length;

    for (const row of rows) {
      const token = mapBalanceRow(row);
      if (!token) continue;
      await upsertEtherlinkTokenMetadata(network.chainId, network.id, token);
      await db
        .insert(etherlinkWalletHoldings)
        .values({
          userId,
          walletAddress: address,
          chainId: network.chainId,
          network: network.id,
          tokenContract: token.tokenContract,
          tokenId: token.tokenId,
          tokenStandard: token.tokenStandard,
          balance: token.balance,
          derivedAt: now,
          lastActivityAt: null,
        })
        .onConflictDoUpdate({
          target: [
            etherlinkWalletHoldings.chainId,
            etherlinkWalletHoldings.walletAddress,
            etherlinkWalletHoldings.tokenContract,
            etherlinkWalletHoldings.tokenId,
          ],
          set: {
            userId: sql`EXCLUDED.user_id`,
            network: sql`EXCLUDED.network`,
            tokenStandard: sql`EXCLUDED.token_standard`,
            balance: sql`EXCLUDED.balance`,
            derivedAt: sql`EXCLUDED.derived_at`,
          },
        });
      upserted++;
    }

    pageParams = page.next_page_params ?? null;
    pageCount++;
  } while (pageParams && pageCount < 20);

  await db
    .update(userEtherlinkWallets)
    .set({
      nativeBalanceWei,
      lastSyncedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(userEtherlinkWallets.userId, userId),
        eq(userEtherlinkWallets.chainId, network.chainId),
        eq(userEtherlinkWallets.walletAddress, address),
      ),
    );

  return {
    walletAddress: address,
    chainId: network.chainId,
    scanned,
    upserted,
    nativeBalanceWei,
  };
}

export async function runEtherlinkPortfolioSyncForAll(): Promise<{
  itemsIn: number;
  itemsOut: number;
}> {
  const wallets = await db.select().from(userEtherlinkWallets);
  let ok = 0;
  for (const wallet of wallets) {
    try {
      await syncEtherlinkWalletAssets(
        wallet.userId,
        wallet.walletAddress,
        wallet.chainId,
      );
      ok++;
    } catch (err) {
      console.error(
        `[etherlink-sync] ${wallet.chainId}:${wallet.walletAddress}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return { itemsIn: wallets.length, itemsOut: ok };
}
