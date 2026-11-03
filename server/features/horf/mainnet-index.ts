import { tzkt } from "../../lib/upstream";

/** Horf is Tezos Mainnet even when the rest of WTF OS targets Shadownet. */
export const HORF_MAINNET_TZKT_BASE = (process.env.HORF_MAINNET_TZKT_URL || "https://api.tzkt.io/v1").replace(/\/+$/, "");

export const horfMainnetIndex = {
  getJson<T>(path: string, params?: Record<string, string | number | boolean | null | undefined>): Promise<T> {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    return tzkt.getJson<T>(`${HORF_MAINNET_TZKT_BASE}${normalized}`, params);
  },
};
