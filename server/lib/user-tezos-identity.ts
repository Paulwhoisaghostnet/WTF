import { asc, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { userWallets } from "@shared/schema";
import { resolveTezosDomainsIdentity } from "./tezos-domains";

export type UserTezosIdentitySource = "selected" | "reverse" | "owned" | "none";

export interface UserTezosWalletIdentity {
  id: number;
  walletAddress: string;
  isPrimary: boolean;
  selectedTezosDomain: string | null;
  reverseTezosDomain: string | null;
  ownedTezosDomains: string[];
  preferredTezosDomain: string | null;
  preferredSource: UserTezosIdentitySource;
}

export interface UserTezosIdentity {
  primaryWalletAddress: string | null;
  preferredTezosDomain: string | null;
  preferredSource: UserTezosIdentitySource;
  ownedTezosDomains: string[];
  wallets: UserTezosWalletIdentity[];
}

function uniqueDomains(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized.endsWith(".tez")) seen.add(normalized);
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

function preferredForWallet(input: {
  selectedTezosDomain?: string | null;
  reverseTezosDomain?: string | null;
  ownedTezosDomains?: string[];
}): { domain: string | null; source: UserTezosIdentitySource } {
  if (input.selectedTezosDomain) return { domain: input.selectedTezosDomain, source: "selected" };
  if (input.reverseTezosDomain) return { domain: input.reverseTezosDomain, source: "reverse" };
  if (input.ownedTezosDomains?.[0]) return { domain: input.ownedTezosDomains[0], source: "owned" };
  return { domain: null, source: "none" };
}

export async function resolveUserTezosIdentity(userId: number): Promise<UserTezosIdentity> {
  const rows = await db
    .select()
    .from(userWallets)
    .where(eq(userWallets.userId, userId))
    .orderBy(desc(userWallets.isPrimary), asc(userWallets.linkedAt));

  const resolved = await Promise.allSettled(
    rows.map((wallet) => resolveTezosDomainsIdentity(wallet.walletAddress))
  );

  const wallets = rows.map((wallet, index) => {
    const identity =
      resolved[index]?.status === "fulfilled"
        ? resolved[index].value
        : { reverseDomain: null, ownedDomains: [] };
    const preferred = preferredForWallet({
      selectedTezosDomain: wallet.tezDomain,
      reverseTezosDomain: identity.reverseDomain,
      ownedTezosDomains: identity.ownedDomains,
    });
    return {
      id: wallet.id,
      walletAddress: wallet.walletAddress,
      isPrimary: wallet.isPrimary,
      selectedTezosDomain: wallet.tezDomain ?? null,
      reverseTezosDomain: identity.reverseDomain,
      ownedTezosDomains: identity.ownedDomains,
      preferredTezosDomain: preferred.domain,
      preferredSource: preferred.source,
    };
  });

  const primaryWallet = wallets.find((wallet) => wallet.isPrimary) ?? wallets[0] ?? null;
  const reverseFallback = wallets.find((wallet) => wallet.reverseTezosDomain)?.reverseTezosDomain ?? null;
  const ownedFallback = wallets.find((wallet) => wallet.ownedTezosDomains.length > 0)?.ownedTezosDomains[0] ?? null;
  const selectedFallback = wallets.find((wallet) => wallet.selectedTezosDomain)?.selectedTezosDomain ?? null;
  const preferred = preferredForWallet({
    selectedTezosDomain: primaryWallet?.selectedTezosDomain ?? selectedFallback,
    reverseTezosDomain: primaryWallet?.reverseTezosDomain ?? reverseFallback,
    ownedTezosDomains: [
      ...(primaryWallet?.ownedTezosDomains ?? []),
      ...(ownedFallback ? [ownedFallback] : []),
    ],
  });

  return {
    primaryWalletAddress: primaryWallet?.walletAddress ?? null,
    preferredTezosDomain: preferred.domain,
    preferredSource: preferred.source,
    ownedTezosDomains: uniqueDomains(wallets.flatMap((wallet) => wallet.ownedTezosDomains)),
    wallets,
  };
}
