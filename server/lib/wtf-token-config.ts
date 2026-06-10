import { WTF_TOKEN } from "@shared/types";

function normalizeKt1(value: string | undefined | null): string | null {
  const raw = (value ?? "").trim();
  return /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(raw) ? raw : null;
}

function normalizeNat(value: string | undefined | null): number | null {
  const raw = (value ?? "").trim();
  if (!/^[0-9]+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export type WtfTokenConfig = {
  contract: string;
  tokenId: number;
  symbol: string;
  decimals: number;
  name: string;
  description: string;
  thumbnailUri: string;
};

export function getServerWtfToken(): WtfTokenConfig {
  return {
    ...WTF_TOKEN,
    contract:
      normalizeKt1(process.env.WTF_TOKEN_CONTRACT) ||
      normalizeKt1(process.env.VITE_WTF_TOKEN_CONTRACT) ||
      WTF_TOKEN.contract,
    tokenId:
      normalizeNat(process.env.WTF_TOKEN_ID) ??
      normalizeNat(process.env.VITE_WTF_TOKEN_ID) ??
      WTF_TOKEN.tokenId,
  };
}
