import { pool } from "../../db";

export type HorfTraderName = {
  username: string | null;
  displayName: string | null;
  usernameSource: "wtf" | "horf" | "wallet";
  canEditUsername: boolean;
};

type NameRow = {
  address: string;
  wtf_username: string | null;
  horf_username: string | null;
};

export function resolveHorfTraderName(row: Pick<NameRow, "wtf_username" | "horf_username">): HorfTraderName {
  const wtf = row.wtf_username?.trim() || null;
  const horf = row.horf_username?.trim() || null;
  return {
    username: horf,
    displayName: wtf || horf,
    usernameSource: wtf ? "wtf" : horf ? "horf" : "wallet",
    canEditUsername: !wtf,
  };
}

/** One indexed join for a whole leaderboard or offer page; account data wins. */
export async function loadHorfTraderNames(addresses: readonly string[]): Promise<Map<string, HorfTraderName>> {
  const unique = [...new Set(addresses)];
  if (!unique.length) return new Map();
  const result = await pool.query<NameRow>(
    `SELECT input.address, account.username AS wtf_username,
            profile.horf_username
       FROM unnest($1::text[]) AS input(address)
       LEFT JOIN public.user_wallets AS wallet ON wallet.wallet_address = input.address
       LEFT JOIN public.users AS account ON account.id = wallet.user_id
       LEFT JOIN public.horf_trader_profiles AS profile ON profile.address = input.address`,
    [unique],
  );
  return new Map(result.rows.map((row) => [row.address, resolveHorfTraderName(row)]));
}
