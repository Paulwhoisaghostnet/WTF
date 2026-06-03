export type ExternalMarketplaceKey = "objkt" | "hen" | "teia";

export type ExternalMarketplaceInteraction =
  | "listing"
  | "sale"
  | "cancel";

export interface ExternalMarketplaceContract {
  address: string;
  marketplace: ExternalMarketplaceKey;
  name: string;
  version: string;
  listingEntrypoints: readonly string[];
  saleEntrypoints: readonly string[];
  cancelEntrypoints: readonly string[];
}

export const EXTERNAL_MARKETPLACE_CONTRACTS: readonly ExternalMarketplaceContract[] = [
  {
    address: "KT1FvqJwEDWb1Gwc55Jd1jjTHRVWbYKUUpyq",
    marketplace: "objkt",
    name: "objkt v1",
    version: "v1",
    listingEntrypoints: ["ask"],
    saleEntrypoints: ["fulfill_ask", "collect"],
    cancelEntrypoints: ["retract_ask"],
  },
  {
    address: "KT1WvzYHCNBvDSdwafTHv7nJ1dWmZ8GCYuuC",
    marketplace: "objkt",
    name: "objkt v4",
    version: "v4",
    listingEntrypoints: ["ask"],
    saleEntrypoints: ["fulfill_ask", "collect"],
    cancelEntrypoints: ["retract_ask"],
  },
  {
    address: "KT1CePTyk6fk4cFr6fasY5YXPGks6ttjSLp4",
    marketplace: "objkt",
    name: "objkt v6",
    version: "v6",
    listingEntrypoints: ["ask"],
    saleEntrypoints: ["fulfill_ask", "collect"],
    cancelEntrypoints: ["retract_ask"],
  },
  {
    address: "KT1Xjap1TwmDR1d8yEd8ErkraAj2mbdMrPZY",
    marketplace: "objkt",
    name: "objkt v6.1",
    version: "v6.1",
    listingEntrypoints: ["ask"],
    saleEntrypoints: ["fulfill_ask", "collect"],
    cancelEntrypoints: ["retract_ask"],
  },
  {
    address: "KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X",
    marketplace: "objkt",
    name: "objkt v6.2",
    version: "v6.2",
    listingEntrypoints: ["ask"],
    saleEntrypoints: ["fulfill_ask", "collect"],
    cancelEntrypoints: ["retract_ask"],
  },
  {
    address: "KT1NiZkkW82wsTKP95x8FefdiseDyU9vX66W",
    marketplace: "objkt",
    name: "objkt fixed price",
    version: "fixed-price",
    listingEntrypoints: ["ask"],
    saleEntrypoints: ["fulfill_ask", "collect"],
    cancelEntrypoints: ["retract_ask"],
  },
  {
    address: "KT1KzmnX6Ffip7zVgGiCUV6ygqDU8hhGsMAy",
    marketplace: "objkt",
    name: "objkt fixed price v2",
    version: "fixed-price-v2",
    listingEntrypoints: ["ask"],
    saleEntrypoints: ["fulfill_ask", "collect"],
    cancelEntrypoints: ["retract_ask"],
  },
  {
    address: "KT1XaCf6gkjFnKg3QmPfn6gep53moMvjkj1E",
    marketplace: "objkt",
    name: "objkt open edition",
    version: "open-edition",
    listingEntrypoints: [],
    saleEntrypoints: ["claim"],
    cancelEntrypoints: [],
  },
  {
    address: "KT1HbQepzV1nVGg8QVznG7z4RcHseD5kwqBn",
    marketplace: "hen",
    name: "HEN v2",
    version: "v2",
    listingEntrypoints: ["swap"],
    saleEntrypoints: ["collect"],
    cancelEntrypoints: ["cancel_swap"],
  },
  {
    address: "KT1PHubm9HtyQEJ4BBpMTVomq6mhbfNZ9z5w",
    marketplace: "teia",
    name: "Teia",
    version: "v1",
    listingEntrypoints: ["swap"],
    saleEntrypoints: ["collect"],
    cancelEntrypoints: ["cancel_swap"],
  },
];

const MARKETPLACE_BY_ADDRESS = new Map(
  EXTERNAL_MARKETPLACE_CONTRACTS.map((contract) => [
    contract.address,
    contract,
  ])
);

export const EXTERNAL_MARKETPLACE_NAMES: Record<string, string> = Object.fromEntries(
  EXTERNAL_MARKETPLACE_CONTRACTS.map((contract) => [
    contract.address,
    contract.name,
  ])
);

export const EXTERNAL_CANCEL_ENTRYPOINT_BY_MARKETPLACE: Record<string, string> =
  Object.fromEntries(
    EXTERNAL_MARKETPLACE_CONTRACTS.flatMap((contract) =>
      contract.cancelEntrypoints[0]
        ? [[contract.address, contract.cancelEntrypoints[0]]]
        : []
    )
  );

function normalizeEntrypoint(entrypoint: string | null | undefined): string | null {
  return typeof entrypoint === "string" && entrypoint.trim()
    ? entrypoint.trim()
    : null;
}

export function externalMarketplaceInfo(
  address: string | null | undefined
): ExternalMarketplaceContract | null {
  if (!address) return null;
  return MARKETPLACE_BY_ADDRESS.get(address) ?? null;
}

export function externalMarketplaceName(address: string | null | undefined): string {
  if (!address) return "external";
  return externalMarketplaceInfo(address)?.name ?? address;
}

export function externalMarketplaceKey(
  address: string | null | undefined
): ExternalMarketplaceKey | null {
  return externalMarketplaceInfo(address)?.marketplace ?? null;
}

export function isKnownExternalMarketplace(address: string | null | undefined): boolean {
  return externalMarketplaceInfo(address) !== null;
}

export function externalCancelEntrypoint(address: string | null | undefined): string | null {
  return externalMarketplaceInfo(address)?.cancelEntrypoints[0] ?? null;
}

export function isCancellableExternalMarketplace(address: string | null | undefined): boolean {
  return externalCancelEntrypoint(address) !== null;
}

export function externalMarketplaceEntrypoints(
  address: string | null | undefined,
  interaction: ExternalMarketplaceInteraction
): readonly string[] {
  const contract = externalMarketplaceInfo(address);
  if (!contract) return [];
  if (interaction === "listing") return contract.listingEntrypoints;
  if (interaction === "sale") return contract.saleEntrypoints;
  return contract.cancelEntrypoints;
}

export function isExternalMarketplaceEntrypoint(
  address: string | null | undefined,
  entrypoint: string | null | undefined,
  interaction: ExternalMarketplaceInteraction
): boolean {
  const normalized = normalizeEntrypoint(entrypoint);
  if (!normalized) return false;
  return externalMarketplaceEntrypoints(address, interaction).includes(normalized);
}
