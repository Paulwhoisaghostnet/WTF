import {
  buildSingleTokenPackage,
  detectPastaContract,
  type CheasePackage,
  type PastaContractKind,
} from "@shared/pasta-protocol";
import { withTezosRpcFallback } from "../../lib/tezos/wallet";
import {
  COLANDER_WORKSPACE_STORAGE_KEY,
  parsePastaProjects,
  type PastaProjectContractRecord,
} from "../pasta-protocol/colander/colander-workspace";

export const MINT_MANAGER_SCHEMA = "wtfos-mint-manager@1" as const;
export const MINT_MANAGER_STORAGE_PREFIX = "wtfos.mint-manager.workflow.v1";
export const PASTA_HANDOFF_PREFIX = "wtfos.pasta.handoff.v1";
export const PASTA_HANDOFF_ENVELOPE = "pasta-handoff-envelope@1";
// This is the existing CH-EASE -> publisher handoff contract.
export const PASTA_HANDOFF_TTL_MS = 5 * 60 * 1000;

export type MintManagerStage = "destination" | "metadata" | "review" | "publisher" | "complete";
export type MintDestinationKind = "hen" | "objkt" | "known_contract" | "new_pasta";
export type PastaPublisherId = "spaghetti" | "gnocchi" | "ravioli" | "rotini" | "penne" | "lasagna";

export interface MintTokenDraft {
  name: string;
  description: string;
  tags: string;
  editions: string;
  royaltyPercent: string;
}

export interface MintManagerSnapshot {
  schema: typeof MINT_MANAGER_SCHEMA;
  stage: MintManagerStage;
  destinationKind: MintDestinationKind;
  network: "mainnet" | "shadownet";
  selectedContract: string;
  newPastaPublisher: "spaghetti" | "gnocchi";
  token: MintTokenDraft;
  artifactUri?: string;
  preparedHen?: unknown;
  result?: {
    opHash: string;
    contract?: string;
    tokenId?: string;
  };
}

export interface WalletDossierLike {
  wallets?: Array<{
    events?: Array<{
      eventType?: string;
      counterpartyAddress?: string | null;
      walletAddress?: string;
      timestamp?: string;
    }>;
  }>;
}

export interface KnownMintContract {
  address: string;
  label: string;
  network: "mainnet" | "shadownet";
  toolId?: string;
  source: "pasta" | "wallet";
  walletAddress?: string;
}

export interface InspectedMintContract extends KnownMintContract {
  kind: PastaContractKind | null;
  publisher: PastaPublisherId | null;
  entrypoints: string[];
  supported: boolean;
  reason?: string;
}

const KT1_PATTERN = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;

export function isKt1Address(value: string): boolean {
  return KT1_PATTERN.test(value.trim());
}

export function parseTags(value: string): string[] {
  return [...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))];
}

function normalizedNetwork(value: unknown): "mainnet" | "shadownet" {
  return value === "mainnet" ? "mainnet" : "shadownet";
}

function recordToKnownContract(record: PastaProjectContractRecord): KnownMintContract {
  return {
    address: record.address,
    label: record.label,
    network: normalizedNetwork(record.network),
    toolId: record.toolId,
    source: "pasta",
  };
}

export function readKnownMintContracts(
  dossier: WalletDossierLike | null | undefined,
  colanderRaw?: string | null,
): KnownMintContract[] {
  const byAddress = new Map<string, KnownMintContract>();
  const raw = colanderRaw === undefined && typeof window !== "undefined"
    ? window.localStorage.getItem(COLANDER_WORKSPACE_STORAGE_KEY)
    : colanderRaw;

  for (const project of parsePastaProjects(raw ?? null)) {
    for (const record of project.contractRecords) {
      if (!isKt1Address(record.address)) continue;
      byAddress.set(record.address, recordToKnownContract(record));
    }
  }

  for (const wallet of dossier?.wallets ?? []) {
    for (const event of wallet.events ?? []) {
      const address = String(event.counterpartyAddress || "").trim();
      if (event.eventType !== "origination" || !isKt1Address(address) || byAddress.has(address)) continue;
      byAddress.set(address, {
        address,
        label: "Wallet-originated contract",
        network: "mainnet",
        source: "wallet",
        walletAddress: event.walletAddress,
      });
    }
  }

  return [...byAddress.values()].sort((a, b) => a.label.localeCompare(b.label) || a.address.localeCompare(b.address));
}

export function publisherForContractKind(kind: PastaContractKind | null): PastaPublisherId | null {
  switch (kind) {
    case "standard_collection": return "spaghetti";
    case "open_edition_collection": return "gnocchi";
    case "bundle_collection": return "ravioli";
    case "generative_collection": return "rotini";
    case "distribution": return "penne";
    case "exhibition": return "lasagna";
    default: return null;
  }
}

export async function inspectMintContract(contract: KnownMintContract): Promise<InspectedMintContract> {
  const result = await withTezosRpcFallback(async (tezos) => {
    const abstraction = await tezos.contract.at(contract.address);
    const entrypoints = Object.keys(abstraction?.entrypoints?.entrypoints ?? {}).sort();
    const adapter = detectPastaContract(entrypoints);
    const publisher = publisherForContractKind(adapter?.kind ?? null);
    return { entrypoints, kind: adapter?.kind ?? null, publisher };
  }, { network: contract.network });

  if (!result.kind) {
    return {
      ...contract,
      ...result,
      supported: false,
      reason: "WTF could not match this contract to a known Pasta or mintable FA2 interface. Open it in Colander before signing anything.",
    };
  }
  if (!result.publisher) {
    return {
      ...contract,
      ...result,
      supported: false,
      reason: result.kind === "blind_mint_collection"
        ? "Macaroni blind-drop contracts use committed pools and cannot accept a loose single-media handoff. Continue in Macaroni."
        : "This FA2 does not expose a destination-specific media publisher workflow.",
    };
  }
  return { ...contract, ...result, supported: true };
}

export function buildMediaPastaPackage(input: {
  publisher: PastaPublisherId;
  name: string;
  description: string;
  artifactUri: string;
  mimeType: string;
  tags: string[];
}): CheasePackage {
  return buildSingleTokenPackage({
    targetApp: input.publisher,
    token: {
      name: input.name,
      description: input.description || undefined,
      artifactUri: input.artifactUri,
      mimeType: input.mimeType,
      tags: input.tags,
    },
  });
}

export function stagePastaMediaHandoff(input: {
  publisher: PastaPublisherId;
  package: CheasePackage;
  network: "mainnet" | "shadownet";
  contract?: string;
}): string {
  if (typeof window === "undefined") throw new Error("Pasta handoff requires a browser session.");
  const key = `${PASTA_HANDOFF_PREFIX}:${input.publisher}`;
  let staged = false;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(input.package));
    staged = true;
  } catch {
    // localStorage is the reload/new-window recovery lane below.
  }
  try {
    window.localStorage.setItem(key, JSON.stringify({
      schema: PASTA_HANDOFF_ENVELOPE,
      expiresAt: Date.now() + PASTA_HANDOFF_TTL_MS,
      payload: input.package,
    }));
    staged = true;
  } catch {
    // sessionStorage may still have accepted the package.
  }
  if (!staged) throw new Error("Browser storage is unavailable. Keep this screen open and enable site storage before continuing.");

  const query = new URLSearchParams({
    handoff: "chease-package",
    handoffKey: key,
    network: input.network,
  });
  if (input.contract) query.set("contract", input.contract);
  return `/tools/${input.publisher}?${query.toString()}`;
}

export function mintWorkflowStorageKey(mediaKey: string | number): string {
  return `${MINT_MANAGER_STORAGE_PREFIX}:${String(mediaKey)}`;
}

export function readMintManagerSnapshot(mediaKey: string | number): MintManagerSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(mintWorkflowStorageKey(mediaKey)) || "null");
    return value?.schema === MINT_MANAGER_SCHEMA ? value : null;
  } catch {
    return null;
  }
}

export function writeMintManagerSnapshot(mediaKey: string | number, snapshot: MintManagerSnapshot): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(mintWorkflowStorageKey(mediaKey), JSON.stringify(snapshot));
}
