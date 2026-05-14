export const DEFAULT_IPFS_GATEWAYS = [
  "https://nftstorage.link/ipfs/",
  "https://w3s.link/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
  "https://dweb.link/ipfs/",
  "https://cf-ipfs.com/ipfs/",
  "https://ipfs.io/ipfs/",
] as const;

const CID_RE = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[1-9A-Za-z][1-9A-Za-z]+)(?:\/.*)?$/i;

export function normalizeIpfsGatewayBase(input: string): string | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    const cleanPath = parsed.pathname.replace(/\/+$/, "");
    const pathWithIpfs = cleanPath.toLowerCase().endsWith("/ipfs")
      ? cleanPath
      : `${cleanPath}/ipfs`;
    parsed.pathname = `${pathWithIpfs}/`;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

export function normalizeIpfsGatewayList(
  gateways: readonly string[] | string | null | undefined
): string[] {
  const source =
    typeof gateways === "string"
      ? gateways.split(",")
      : Array.isArray(gateways)
        ? gateways
        : DEFAULT_IPFS_GATEWAYS;
  const normalized = new Set<string>();
  for (const gateway of source) {
    const value = normalizeIpfsGatewayBase(gateway);
    if (value) normalized.add(value);
  }
  return normalized.size > 0 ? Array.from(normalized) : [...DEFAULT_IPFS_GATEWAYS];
}

export function extractIpfsPath(uri: string | null | undefined): string | null {
  const trimmed = String(uri || "").trim();
  if (!trimmed) return null;
  if (/^ipfs:\/\//i.test(trimmed)) {
    const path = trimmed
      .replace(/^ipfs:\/\//i, "")
      .replace(/^ipfs\//i, "")
      .replace(/^\/+/, "");
    return path || null;
  }
  if (CID_RE.test(trimmed)) return trimmed.replace(/^\/+/, "");

  try {
    const parsed = new URL(trimmed);
    const pathMatch = parsed.pathname.match(/^\/ipfs\/(.+)$/i);
    if (pathMatch?.[1]) return `${pathMatch[1]}${parsed.search || ""}`;

    const subdomain = parsed.hostname.match(/^([a-z0-9]+)\.ipfs\./i);
    if (subdomain?.[1]) {
      const cleanPath = parsed.pathname.replace(/^\/+/, "");
      return `${subdomain[1]}${cleanPath ? `/${cleanPath}` : ""}${parsed.search || ""}`;
    }
  } catch {
    return null;
  }
  return null;
}

export function normalizeIpfsUri(uri: string, gatewayBase: string = DEFAULT_IPFS_GATEWAYS[0]): string {
  const ipfsPath = extractIpfsPath(uri);
  if (!ipfsPath) return String(uri || "").trim();
  const gateway = normalizeIpfsGatewayBase(gatewayBase) || DEFAULT_IPFS_GATEWAYS[0];
  return `${gateway}${ipfsPath.replace(/^\/+/, "")}`;
}

export function buildIpfsGatewayCandidates(
  uri: string | null | undefined,
  gateways: readonly string[] | string | null | undefined = DEFAULT_IPFS_GATEWAYS
): string[] {
  const ipfsPath = extractIpfsPath(uri);
  if (!ipfsPath) return [];
  const cleanPath = ipfsPath.replace(/^\/+/, "");
  const candidates = new Set<string>();
  for (const gateway of normalizeIpfsGatewayList(gateways)) {
    candidates.add(`${gateway}${cleanPath}`);
  }
  return Array.from(candidates);
}

export function buildWtfIpfsGatewayPolicy(gateways?: readonly string[] | string | null) {
  const normalizedGateways = normalizeIpfsGatewayList(gateways);
  return {
    version: 1 as const,
    gateways: normalizedGateways,
    primaryGateway: normalizedGateways[0] || DEFAULT_IPFS_GATEWAYS[0],
    finalFallbackGateway: normalizedGateways.at(-1) || DEFAULT_IPFS_GATEWAYS.at(-1)!,
    invariants: [
      "IPFS rendering uses ordered gateway candidates instead of a single hard-coded gateway.",
      "Gateway bases are normalized to HTTPS /ipfs/ roots before use.",
      "ipfs.io remains a fallback by default, not the only rendering path.",
    ] as const,
  };
}
