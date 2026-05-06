import { WTF_TOKEN } from "@shared/types";
import type { SelectedToken } from "./types";

export function parseWtfInputToRaw(input: string): number | null {
  const normalized = input.trim();
  const decimals = WTF_TOKEN.decimals;
  const re = new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`);
  if (!re.test(normalized)) return null;

  const [whole, fraction = ""] = normalized.split(".");
  const paddedFraction = (fraction + "0".repeat(decimals)).slice(0, decimals);
  const raw = Number(`${whole}${paddedFraction}`.replace(/^0+(?=\d)/, ""));
  if (!Number.isSafeInteger(raw) || raw <= 0) return null;
  return raw;
}

export function inferRoyalty(token: SelectedToken): {
  recipient: string | null;
  bps: number;
} {
  const shares = token.metadata?.royalties?.shares;
  if (!shares || typeof shares !== "object") return { recipient: null, bps: 0 };
  const entries = Object.entries(shares as Record<string, any>);
  if (entries.length === 0) return { recipient: null, bps: 0 };
  const [recipient, rawShare] = entries[0];
  const numeric = Number(rawShare);
  if (!recipient || !Number.isFinite(numeric) || numeric <= 0)
    return { recipient: null, bps: 0 };
  const bps = numeric <= 1000 ? Math.round(numeric * 10) : Math.round(numeric);
  return { recipient, bps: Math.min(10_000, Math.max(0, bps)) };
}

export function shortAddress(addr: string): string {
  return `${addr.slice(0, 7)}...${addr.slice(-5)}`;
}
