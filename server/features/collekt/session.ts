import { asc, eq } from "drizzle-orm";

import { db } from "../../db";
import { userWallets } from "@shared/schema";
import type {
  CollektSession,
  CollektUserSummary,
  CollektWalletSummary,
} from "@shared/collekt";
import { getCollektModuleUrl } from "./config";

export async function loadCollektSession(
  user: CollektUserSummary
): Promise<CollektSession> {
  const wallets = await db
    .select({
      id: userWallets.id,
      walletAddress: userWallets.walletAddress,
      tezDomain: userWallets.tezDomain,
      isPrimary: userWallets.isPrimary,
      lastSyncedAt: userWallets.lastSyncedAt,
    })
    .from(userWallets)
    .where(eq(userWallets.userId, user.id))
    .orderBy(asc(userWallets.id));

  return buildCollektSession(user, wallets, getCollektModuleUrl());
}

export function buildCollektSession(
  user: CollektUserSummary,
  wallets: CollektWalletSummary[],
  moduleUrl: string | null
): CollektSession {
  return {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    },
    wallets,
    gallery: {
      id: "wtf:me",
      path: "/wtf",
      moduleUrl,
    },
  };
}
