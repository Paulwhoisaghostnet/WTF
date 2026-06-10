import { WTF_TOKEN } from "@shared/types";

function normalizedKt1(value: string | undefined | null): string | null {
  const raw = (value ?? "").trim();
  return /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(raw) ? raw : null;
}

function normalizedNat(value: string | undefined | null): number | null {
  const raw = (value ?? "").trim();
  if (!/^[0-9]+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function getClientWtfToken() {
  return {
    ...WTF_TOKEN,
    contract:
      normalizedKt1(import.meta.env.VITE_WTF_TOKEN_CONTRACT) ?? WTF_TOKEN.contract,
    tokenId:
      normalizedNat(import.meta.env.VITE_WTF_TOKEN_ID) ?? WTF_TOKEN.tokenId,
  };
}
