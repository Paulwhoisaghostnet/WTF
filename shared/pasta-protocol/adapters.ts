/**
 * Pasta Protocol — contract adapter registry (Colander).
 *
 * Pure, dependency-free. Each publisher's on-chain contract type is described here once: a detection
 * signature (entrypoints that must be present), a specificity for disambiguation, and the admin / transfer
 * / role workflows it supports with their access level and input shape. Colander composes these adapters
 * to understand any contract a wallet opens — it never hardcodes per-app logic. Detection is driven purely
 * by the set of entrypoint names read off-chain, so this module is fully unit-testable without Taquito.
 */
import type { ContractProductKind, PastaAppId } from "./types";

export type PastaContractKind = ContractProductKind | "generic_fa2";

/** Who may successfully submit an action (advisory in the UI; the chain enforces). */
export type ActionAccess = "admin" | "minter" | "owner" | "curator" | "pending_admin" | "public";

export type ActionInputType = "address" | "nat" | "amount_mutez" | "bool" | "datetime" | "text";

export type ActionInput = {
  name: string;
  label: string;
  type: ActionInputType;
  optional?: boolean;
  placeholder?: string;
};

export type ActionGroup =
  | "transfer"
  | "mint"
  | "role"
  | "sale"
  | "distribution"
  | "curation"
  | "admin"
  | "metadata";

export type PastaContractActionId =
  | "transfer"
  | "mint"
  | "burn"
  | "reveal"
  | "set_stages"
  | "set_allowlist"
  | "set_pause"
  | "set_paused"
  | "add_minter"
  | "remove_minter"
  | "set_token_metadata"
  | "set_sale"
  | "set_sale_active"
  | "create_open_edition"
  | "open_mint"
  | "set_project_active"
  | "reserve_iteration"
  | "finalize_iteration"
  | "cancel_expired_reservation"
  | "open_pack"
  | "cancel_pack"
  | "set_pack_contents"
  | "redeem"
  | "set_bundle_contents"
  | "open_claim"
  | "claim"
  | "set_allocations"
  | "airdrop"
  | "add_curator"
  | "remove_curator"
  | "publish_revision"
  | "set_current_revision"
  | "transfer_administration"
  | "accept_administration";

export type PastaContractAction = {
  id: PastaContractActionId;
  label: string;
  group: ActionGroup;
  /** Entrypoint that must exist on the contract for this action to be offered. */
  entrypoint: string;
  access: ActionAccess;
  inputs: ActionInput[];
  /** Bulk/complex actions are performed in the named publisher app; Colander deep-links instead of forms. */
  external?: PastaAppId;
  description?: string;
};

export type PastaContractAdapter = {
  kind: PastaContractKind;
  label: string;
  description: string;
  /** All of these entrypoints must be present for the adapter to match. */
  signature: string[];
  /** Higher wins when multiple adapters match (more specific contract type). */
  specificity: number;
  actions: PastaContractAction[];
};

// ---- shared action definitions ----

const A_TRANSFER: PastaContractAction = {
  id: "transfer",
  label: "Transfer token",
  group: "transfer",
  entrypoint: "transfer",
  access: "owner",
  inputs: [
    { name: "to_", label: "Recipient", type: "address", placeholder: "tz1…" },
    { name: "token_id", label: "Token id", type: "nat" },
    { name: "amount", label: "Amount", type: "nat" },
  ],
  description: "Send editions you hold to another wallet.",
};

const A_MINT: PastaContractAction = {
  id: "mint",
  label: "Mint more",
  group: "mint",
  entrypoint: "mint",
  access: "minter",
  inputs: [
    { name: "to_", label: "Recipient", type: "address", placeholder: "tz1…" },
    { name: "token_id", label: "Token id", type: "nat" },
    { name: "amount", label: "Amount", type: "nat" },
  ],
  description: "Mint additional editions of an existing token (admin/minter only).",
};

const A_BURN: PastaContractAction = {
  id: "burn",
  label: "Burn token",
  group: "transfer",
  entrypoint: "burn",
  access: "owner",
  inputs: [
    { name: "token_id", label: "Token id", type: "nat" },
    { name: "amount", label: "Amount", type: "nat" },
  ],
};

const A_ADD_MINTER: PastaContractAction = {
  id: "add_minter",
  label: "Add minter",
  group: "role",
  entrypoint: "add_minter",
  access: "admin",
  inputs: [{ name: "minter", label: "Minter address", type: "address", placeholder: "tz1…" }],
};

const A_REMOVE_MINTER: PastaContractAction = {
  id: "remove_minter",
  label: "Remove minter",
  group: "role",
  entrypoint: "remove_minter",
  access: "admin",
  inputs: [{ name: "minter", label: "Minter address", type: "address", placeholder: "tz1…" }],
};

const A_TRANSFER_ADMIN: PastaContractAction = {
  id: "transfer_administration",
  label: "Transfer admin",
  group: "admin",
  entrypoint: "transfer_administration",
  access: "admin",
  inputs: [{ name: "pending_administrator", label: "New admin", type: "address", placeholder: "tz1…" }],
  description: "Step 1 of a two-step admin handoff. The new admin must then accept.",
};

const A_ACCEPT_ADMIN: PastaContractAction = {
  id: "accept_administration",
  label: "Accept admin",
  group: "admin",
  entrypoint: "accept_administration",
  access: "pending_admin",
  inputs: [],
  description: "Step 2: the pending admin accepts administration.",
};

const A_SET_FIXED_SALE: PastaContractAction = {
  id: "set_sale",
  label: "Configure direct sale",
  group: "sale",
  entrypoint: "set_sale",
  access: "admin",
  inputs: [
    { name: "token_id", label: "Token id", type: "nat" },
    { name: "treasury", label: "Treasury (defaults to connected wallet)", type: "address", optional: true, placeholder: "tz1…" },
    { name: "price", label: "Price per edition (mutez)", type: "amount_mutez" },
    { name: "remaining", label: "Quantity for sale", type: "nat" },
    { name: "active", label: "Active", type: "bool" },
    { name: "start", label: "Start", type: "datetime", optional: true },
    { name: "end", label: "End", type: "datetime", optional: true },
  ],
  description: "List creator-held inventory for exact-price purchase from a self-hosted page.",
};

const A_SET_SALE_ACTIVE: PastaContractAction = {
  id: "set_sale_active",
  label: "Pause / resume sale",
  group: "sale",
  entrypoint: "set_sale_active",
  access: "admin",
  inputs: [
    { name: "token_id", label: "Token id", type: "nat" },
    { name: "active", label: "Active", type: "bool" },
  ],
  description: "Toggle the public primary-sale entrypoint without changing its price or inventory.",
};

// ---- per-type adapters ----

const STANDARD_ACTIONS: PastaContractAction[] = [
  A_TRANSFER,
  A_MINT,
  A_BURN,
  A_SET_FIXED_SALE,
  A_SET_SALE_ACTIVE,
  A_ADD_MINTER,
  A_REMOVE_MINTER,
  A_TRANSFER_ADMIN,
  A_ACCEPT_ADMIN,
];

export const STANDARD_COLLECTION_ADAPTER: PastaContractAdapter = {
  kind: "standard_collection",
  label: "Standard collection",
  description: "Spaghetti multi-asset FA2 collection.",
  signature: ["transfer", "create_token"],
  specificity: 1,
  actions: STANDARD_ACTIONS,
};

export const BLIND_MINT_COLLECTION_ADAPTER: PastaContractAdapter = {
  kind: "blind_mint_collection",
  label: "Macaroni blind-mint collection",
  description: "Macaroni V1 or V2 blind-mint collection with staged sales and optional delayed reveal.",
  signature: ["mint", "reveal", "set_stages", "set_allowlist"],
  specificity: 4,
  actions: [
    A_TRANSFER,
    {
      id: "mint",
      label: "Mint blind drop",
      group: "mint",
      entrypoint: "mint",
      access: "public",
      inputs: [],
      external: "macaroni",
      description: "Open Macaroni so the current stage price, wallet limit, allowlist, and payable amount are calculated before signing.",
    },
    {
      id: "reveal",
      label: "Reveal queued tokens",
      group: "metadata",
      entrypoint: "reveal",
      access: "public",
      inputs: [],
      external: "macaroni",
      description: "Open Macaroni to reveal eligible delayed-mint tokens from the committed metadata pool.",
    },
    {
      id: "set_stages",
      label: "Configure sale stages",
      group: "sale",
      entrypoint: "set_stages",
      access: "admin",
      inputs: [],
      external: "macaroni",
      description: "Open Macaroni to edit the complete ordered sale-stage schedule.",
    },
    {
      id: "set_allowlist",
      label: "Manage allowlist",
      group: "sale",
      entrypoint: "set_allowlist",
      access: "admin",
      inputs: [],
      external: "macaroni",
      description: "Open Macaroni to load or revise staged wallet capacities.",
    },
    {
      id: "set_pause",
      label: "Pause / resume V2 drop",
      group: "sale",
      entrypoint: "set_pause",
      access: "admin",
      inputs: [{ name: "paused", label: "Paused", type: "bool" }],
      description: "Pause or resume a Macaroni V2 blind-mint contract without changing its configured stages.",
    },
    {
      id: "set_paused",
      label: "Pause / resume V1 drop",
      group: "sale",
      entrypoint: "set_paused",
      access: "admin",
      inputs: [{ name: "paused", label: "Paused", type: "bool" }],
      description: "Pause or resume a Macaroni V1 blind-mint contract without changing its configured stages.",
    },
    A_TRANSFER_ADMIN,
    A_ACCEPT_ADMIN,
  ],
};

export const BLIND_MINT_V3_COLLECTION_ADAPTER: PastaContractAdapter = {
  ...BLIND_MINT_COLLECTION_ADAPTER,
  description: "Macaroni V3 collection with finalized pre-sale inventory, deterministic sealed allocation, automatic operator reveal, and creator recovery.",
  signature: ["mint", "reveal_tokens_v3", "set_stages", "set_allowlist"],
  specificity: 5,
  actions: BLIND_MINT_COLLECTION_ADAPTER.actions.map((action) =>
    action.id === "reveal"
      ? {
          ...action,
          label: "Emergency reveal minted tokens",
          entrypoint: "reveal_tokens_v3",
          access: "admin",
          description: "Automatic reveal is the normal path. Open Macaroni only to recover a minted token whose metadata matches its sealed pre-sale commitment.",
        }
      : action,
  ),
};

export const GENERATIVE_COLLECTION_ADAPTER: PastaContractAdapter = {
  kind: "generative_collection",
  label: "Generative collection",
  description: "Rotini projects whose collectors reserve a seed, render a self-contained artifact, and finalize the NFT.",
  signature: ["create_project", "reserve_iteration", "finalize_iteration", "set_project_active"],
  specificity: 4,
  actions: [
    A_TRANSFER,
    {
      id: "reserve_iteration",
      label: "Reserve, render & mint",
      group: "mint",
      entrypoint: "reserve_iteration",
      access: "public",
      inputs: [{ name: "project_id", label: "Project id", type: "nat" }],
      external: "rotini",
      description: "Open Rotini to reserve an immutable seed, create a PNG/GIF/offline ZIP, pin it, and finalize its NFT.",
    },
    {
      id: "finalize_iteration",
      label: "Resume unfinished iteration",
      group: "mint",
      entrypoint: "finalize_iteration",
      access: "public",
      inputs: [],
      external: "rotini",
      description: "Resume a paid reservation in Rotini and finalize it only after its self-contained artifact is pinned.",
    },
    {
      id: "cancel_expired_reservation",
      label: "Refund expired reservation",
      group: "mint",
      entrypoint: "cancel_expired_reservation",
      access: "public",
      inputs: [{ name: "reservation_id", label: "Reservation id", type: "nat" }],
      description: "Release an expired reservation and return its locked payment to the collector.",
    },
    {
      id: "set_project_active",
      label: "Close / reopen generation",
      group: "sale",
      entrypoint: "set_project_active",
      access: "admin",
      inputs: [
        { name: "project_id", label: "Project id", type: "nat" },
        { name: "active", label: "Active", type: "bool" },
      ],
      description: "Stop or resume collector generation without changing existing iteration tokens.",
    },
    A_TRANSFER_ADMIN,
    A_ACCEPT_ADMIN,
  ],
};

export const OPEN_EDITION_ADAPTER: PastaContractAdapter = {
  kind: "open_edition_collection",
  label: "Multi-edition issuance collection",
  description: "Gnocchi collection with independent Timed OE, Forever OE, and Limited Edition policies per token.",
  signature: ["open_mint", "set_sale_active"],
  specificity: 3,
  actions: [
    A_TRANSFER,
    {
      id: "create_open_edition",
      label: "Add edition to collection",
      group: "metadata",
      entrypoint: "create_open_edition",
      access: "admin",
      inputs: [],
      external: "gnocchi",
      description: "Open Gnocchi with this KT1 to publish its next token id using an independent timed, forever, limited, or custom issuance policy.",
    },
    {
      id: "open_mint",
      label: "Mint edition",
      group: "mint",
      entrypoint: "open_mint",
      access: "public",
      inputs: [
        { name: "token_id", label: "Token id", type: "nat" },
        { name: "amount", label: "Amount", type: "nat" },
      ],
      external: "gnocchi",
      description: "Read the live curve price and mint through Gnocchi so the exact payable amount is calculated before signing.",
    },
    {
      id: "set_sale",
      label: "Edit sale configuration",
      group: "sale",
      entrypoint: "set_sale",
      access: "admin",
      inputs: [],
      external: "gnocchi",
      description: "Price curves and treasury remain manageable in Gnocchi; a locked token's declared start, end, and maximum supply cannot be changed.",
    },
    A_SET_SALE_ACTIVE,
    A_MINT,
    A_BURN,
    A_ADD_MINTER,
    A_REMOVE_MINTER,
    A_TRANSFER_ADMIN,
    A_ACCEPT_ADMIN,
  ],
};

export const BUNDLE_ADAPTER: PastaContractAdapter = {
  kind: "bundle_collection",
  label: "Atomic pack router",
  description: "Ravioli collection with escrowed, allocation-minted, generative, and hybrid fulfillment.",
  signature: ["open_pack", "create_pack", "commit_recipe"],
  specificity: 5,
  actions: [
    A_TRANSFER,
    A_MINT,
    {
      id: "open_pack",
      label: "Open pack",
      group: "transfer",
      entrypoint: "open_pack",
      access: "owner",
      inputs: [],
      external: "ravioli",
      description: "Open Ravioli with the reveal kit. Every enclosed transfer or mint succeeds atomically before the wrapper burns.",
    },
    {
      id: "set_pack_contents",
      label: "Publish contents reveal",
      group: "metadata",
      entrypoint: "set_pack_contents",
      access: "admin",
      inputs: [
        { name: "token_id", label: "Token id", type: "nat" },
        { name: "contents_uri", label: "Contents manifest URI", type: "text", placeholder: "ipfs://…" },
      ],
      description: "Publish the one-time contents manifest pointer for a blind pack.",
    },
    {
      id: "cancel_pack",
      label: "Close pack",
      group: "sale",
      entrypoint: "cancel_pack",
      access: "admin",
      inputs: [{ name: "token_id", label: "Token id", type: "nat" }],
      description: "Permanently stop new wrapper issuance before launch or after every issued wrapper has opened.",
    },
    A_SET_FIXED_SALE,
    A_SET_SALE_ACTIVE,
    A_ADD_MINTER,
    A_REMOVE_MINTER,
    A_TRANSFER_ADMIN,
    A_ACCEPT_ADMIN,
  ],
};

export const DISTRIBUTION_ADAPTER: PastaContractAdapter = {
  kind: "distribution",
  label: "Distribution",
  description: "Penne distribution contract (allowlist claims + airdrops).",
  signature: ["airdrop", "claim", "set_allocations"],
  specificity: 4,
  actions: [
    {
      id: "open_claim",
      label: "Open / close claim",
      group: "distribution",
      entrypoint: "open_claim",
      access: "admin",
      inputs: [
        { name: "active", label: "Active", type: "bool" },
        { name: "start", label: "Start", type: "datetime", optional: true },
        { name: "end", label: "End", type: "datetime", optional: true },
      ],
      description: "Open or close the pull-claim window.",
    },
    {
      id: "set_allocations",
      label: "Load recipients",
      group: "distribution",
      entrypoint: "set_allocations",
      access: "admin",
      inputs: [],
      external: "penne",
      description: "Loading large recipient lists is done in Penne.",
    },
    {
      id: "claim",
      label: "Claim allocation",
      group: "distribution",
      entrypoint: "claim",
      access: "public",
      inputs: [{ name: "token_id", label: "Token id", type: "nat" }],
      description: "Claim the connected wallet's configured allocation for this token.",
    },
    {
      id: "airdrop",
      label: "Airdrop (push)",
      group: "distribution",
      entrypoint: "airdrop",
      access: "admin",
      inputs: [],
      external: "penne",
      description: "Batched push distribution is done in Penne.",
    },
    A_TRANSFER,
    A_TRANSFER_ADMIN,
    A_ACCEPT_ADMIN,
  ],
};

export const EXHIBITION_ADAPTER: PastaContractAdapter = {
  kind: "exhibition",
  label: "Exhibition",
  description: "Lasagna on-chain curation registry (curators + append-only revisions).",
  signature: ["publish_revision", "add_curator"],
  specificity: 4,
  actions: [
    A_ADD_CURATOR(),
    A_REMOVE_CURATOR(),
    {
      id: "set_current_revision",
      label: "Set current revision",
      group: "curation",
      entrypoint: "set_current_revision",
      access: "curator",
      inputs: [{ name: "rid", label: "Revision #", type: "nat" }],
      description: "Point the exhibition at any earlier revision.",
    },
    {
      id: "publish_revision",
      label: "Publish revision",
      group: "curation",
      entrypoint: "publish_revision",
      access: "curator",
      inputs: [],
      external: "lasagna",
      description: "Composing and publishing a revision is done in Lasagna.",
    },
    A_TRANSFER_ADMIN,
    A_ACCEPT_ADMIN,
  ],
};

function A_ADD_CURATOR(): PastaContractAction {
  return {
    id: "add_curator",
    label: "Add curator",
    group: "role",
    entrypoint: "add_curator",
    access: "admin",
    inputs: [{ name: "curator", label: "Curator address", type: "address", placeholder: "tz1…" }],
  };
}

function A_REMOVE_CURATOR(): PastaContractAction {
  return {
    id: "remove_curator",
    label: "Remove curator",
    group: "role",
    entrypoint: "remove_curator",
    access: "admin",
    inputs: [{ name: "curator", label: "Curator address", type: "address", placeholder: "tz1…" }],
  };
}

export const GENERIC_FA2_ADAPTER: PastaContractAdapter = {
  kind: "generic_fa2",
  label: "FA2 contract",
  description: "A TZIP-12 FA2 contract not recognized as a specific Pasta type. Transfers are supported.",
  signature: ["transfer", "balance_of"],
  specificity: 0,
  actions: [A_TRANSFER],
};

/** Registry of every known Pasta contract adapter, plus the generic FA2 fallback. */
export const PASTA_ADAPTERS: PastaContractAdapter[] = [
  GENERATIVE_COLLECTION_ADAPTER,
  BLIND_MINT_V3_COLLECTION_ADAPTER,
  BLIND_MINT_COLLECTION_ADAPTER,
  STANDARD_COLLECTION_ADAPTER,
  OPEN_EDITION_ADAPTER,
  BUNDLE_ADAPTER,
  DISTRIBUTION_ADAPTER,
  EXHIBITION_ADAPTER,
  GENERIC_FA2_ADAPTER,
];

/**
 * Detects the best-matching adapter from a contract's entrypoint names. Returns the highest-specificity
 * adapter whose full signature is present, or `null` when nothing (not even generic FA2) matches.
 */
export function detectPastaContract(entrypoints: Iterable<string>): PastaContractAdapter | null {
  const set = new Set<string>();
  for (const e of entrypoints) set.add(e);
  const matches = PASTA_ADAPTERS.filter((a) => a.signature.every((s) => set.has(s)));
  if (matches.length === 0) return null;
  return matches.reduce((best, cur) => (cur.specificity > best.specificity ? cur : best));
}

/** The subset of an adapter's actions whose entrypoint is actually present on the contract. */
export function availableActions(
  adapter: PastaContractAdapter,
  entrypoints: Iterable<string>
): PastaContractAction[] {
  const set = new Set<string>();
  for (const e of entrypoints) set.add(e);
  return adapter.actions.filter((a) => set.has(a.entrypoint));
}
