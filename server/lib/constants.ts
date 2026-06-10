/**
 * Centralised server-side constants for the WTF FA2 token and the
 * gameshow operator wallet. Routes and workers import from here so
 * there is only one place to change when a new contract/token is
 * deployed or the operator wallet rotates.
 *
 * The WTF FA2 contract/token-id mirrors `shared/types.ts` WTF_TOKEN by
 * default, with env overrides for Shadownet rehearsals.
 * The operator wallet address is driven by the environment variable
 * `WTF_OPERATOR_WALLET_ADDRESS` so ops can rotate keys without a
 * code change.
 */

import { getServerWtfToken } from "./wtf-token-config";

const wtfToken = getServerWtfToken();

export const WTF_FA2_CONTRACT: string = wtfToken.contract;
export const WTF_FA2_TOKEN_ID: string = String(wtfToken.tokenId);

/**
 * The gameshow operator wallet, set via env var. Undefined on dev
 * boxes where we haven't wired the signer yet — callers must
 * gracefully no-op when absent (e.g. `if (!WTF_OPERATOR_WALLET_ADDRESS) return;`).
 */
export const WTF_OPERATOR_WALLET_ADDRESS: string | null =
  (process.env.WTF_OPERATOR_WALLET_ADDRESS ?? "").trim() || null;

/**
 * Assets the wtf-operator-signer is authorised to transfer on behalf of
 * the unified operator wallet. v1 is WTF FA2 + native XTZ; additional
 * FA2 tokens are added here as they are introduced. Each entry drives
 * balance probes, disbursement routes, and the signer's allow-list.
 */
export type OperatorAsset =
  | { kind: "fa2"; contract: string; tokenId: number; label: string }
  | { kind: "xtz"; label: string };

export const WTF_OPERATOR_ASSETS: readonly OperatorAsset[] = [
  {
    kind: "fa2",
    contract: WTF_FA2_CONTRACT,
    tokenId: Number(WTF_FA2_TOKEN_ID) || 0,
    label: "WTF",
  },
  { kind: "xtz", label: "XTZ" },
];

/**
 * Handles the CRP nomination watcher must drop from nominee lists
 * (e.g. the poster themselves and ecosystem mega-accounts). Configurable
 * via comma-separated env var `WTF_CRP_EXCLUDED_HANDLES`.
 */
const DEFAULT_EXCLUDED_CRP_HANDLES = ["TezosCommons", "Tezos", "tezosfoundation"];

export function getExcludedCrpHandles(): string[] {
  const raw = (process.env.WTF_CRP_EXCLUDED_HANDLES ?? "").trim();
  if (!raw) return [...DEFAULT_EXCLUDED_CRP_HANDLES];
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((h) => h.trim().replace(/^@/, ""))
        .filter((h) => h.length > 0)
        .concat(DEFAULT_EXCLUDED_CRP_HANDLES)
    )
  );
}
