const KNOWN_MAINNET_SOURCE = "https://api.tzkt.io/v1";
const LOCAL_KEY = "__wtfosIndexer";

/** Bound at ingestion, never inferred for an old row from the current environment. */
export function stampWalletEventProvenance(raw: unknown, configuredSource: string): Record<string, unknown> {
  let source: string | null = null;
  let network: "mainnet" | null = null;
  try {
    const parsed = new URL(configuredSource);
    source = `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
    if (source === KNOWN_MAINNET_SOURCE) network = "mainnet";
  } catch { /* An invalid/unknown source never gains network authority. */ }
  const data = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
  // Always overwrite the reserved key; an upstream payload cannot provide its own provenance.
  return { ...data, [LOCAL_KEY]: { version: 1, source, network } };
}

export function walletEventProvenance(raw: unknown): { network: "mainnet" | "unverified"; source: string | null } {
  if (!raw || typeof raw !== "object") return { network: "unverified", source: null };
  const value = (raw as Record<string, unknown>)[LOCAL_KEY] as Record<string, unknown> | undefined;
  if (value?.version === 1 && value.source === KNOWN_MAINNET_SOURCE && value.network === "mainnet") return { network: "mainnet", source: KNOWN_MAINNET_SOURCE };
  // Unknown sources are diagnostic origins, never credentials, arbitrary upstream strings or network claims.
  if (value?.version === 1 && typeof value.source === "string") {
    try { const url = new URL(value.source); return { network: "unverified", source: url.origin }; } catch { /* no usable source */ }
  }
  return { network: "unverified", source: null };
}
