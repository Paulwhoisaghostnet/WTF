import type {
  ConsoleMarketplaceLink,
  ConsoleTokenProvenance,
} from "@shared/console-provenance";
import { buildObjktTokenUrl, buildTzktTokenUrl } from "@shared/console-provenance";
import { shortAddr } from "./media-resolve";

type MaybeProvenanceHost = {
  provenance?: ConsoleTokenProvenance | null;
  metadata?: Record<string, any> | null;
  contract?: string | null;
  tokenContract?: string | null;
  tokenId?: string | null;
  creatorName?: string | null;
  creatorAddress?: string | null;
  name?: string | null;
  title?: string | null;
};

export function readEmbeddedProvenance(
  item: MaybeProvenanceHost
): ConsoleTokenProvenance | null {
  const direct = item.provenance;
  if (isConsoleTokenProvenance(direct)) return direct;

  const fromMetadata = item.metadata?.wtfProvenance || item.metadata?.provenance;
  if (isConsoleTokenProvenance(fromMetadata)) return fromMetadata;

  const contract = String(item.contract || item.tokenContract || "").trim();
  const tokenId = String(item.tokenId || "").trim();
  if (!contract || !tokenId || contract === "demo" || contract === "console") {
    return null;
  }

  const creatorName = stringOrNull(item.creatorName);
  const creatorAddress = stringOrNull(item.creatorAddress);
  return {
    source: "tezos-token",
    chain: "tezos",
    tokenContract: contract,
    tokenId,
    tokenTitle: stringOrNull(item.name) || stringOrNull(item.title),
    tokenUrl: buildObjktTokenUrl(contract, tokenId),
    explorerUrl: buildTzktTokenUrl(contract, tokenId),
    creatorName,
    creatorAddress,
    tezosIdentity: creatorName || (creatorAddress ? shortAddr(creatorAddress) : null),
    marketplaceLinks: [
      {
        label: "objkt",
        url: buildObjktTokenUrl(contract, tokenId),
        kind: "marketplace",
        marketplace: "objkt",
      },
    ],
    attributionRequired: true,
  };
}

export function provenanceCreatorLabel(
  provenance: ConsoleTokenProvenance | null | undefined
): string {
  if (!provenance) return "unknown creator";
  return (
    provenance.tezosIdentity ||
    provenance.creatorName ||
    (provenance.creatorAddress ? shortAddr(provenance.creatorAddress) : "") ||
    "unknown creator"
  );
}

export function provenanceXLabel(
  provenance: ConsoleTokenProvenance | null | undefined
): string | null {
  const handle = String(provenance?.xHandle || "").replace(/^@+/, "").trim();
  return handle ? `@${handle}` : null;
}

export function provenanceSupportLinks(
  provenance: ConsoleTokenProvenance | null | undefined
): ConsoleMarketplaceLink[] {
  if (!provenance) return [];
  const links = provenance.marketplaceLinks.filter(
    (link) => link.kind === "listing" || link.kind === "marketplace" || link.kind === "offer"
  );
  if (links.length > 0) return dedupeLinks(links);
  return [
    {
      label: "objkt",
      url: provenance.tokenUrl,
      kind: "marketplace",
      marketplace: "objkt",
    },
  ];
}

export function formatProvenancePrice(link: ConsoleMarketplaceLink): string | null {
  if (!link.priceMutez) return null;
  const mutez = Number(link.priceMutez);
  if (!Number.isFinite(mutez) || mutez <= 0) return null;
  const xtz = mutez / 1_000_000;
  return `${xtz.toLocaleString(undefined, {
    maximumFractionDigits: xtz >= 100 ? 2 : 6,
  })} tez`;
}

function isConsoleTokenProvenance(value: unknown): value is ConsoleTokenProvenance {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ConsoleTokenProvenance>;
  return (
    record.chain === "tezos" &&
    typeof record.tokenContract === "string" &&
    typeof record.tokenId === "string" &&
    typeof record.tokenUrl === "string" &&
    Array.isArray(record.marketplaceLinks)
  );
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function dedupeLinks(links: ConsoleMarketplaceLink[]): ConsoleMarketplaceLink[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = `${link.kind}:${link.url}:${link.listingId || ""}:${link.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

