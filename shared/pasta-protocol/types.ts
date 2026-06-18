/**
 * Pasta Protocol — shared architecture foundation types.
 *
 * Phase 0 skeleton. These types define the cross-app contracts so every Pasta app speaks the same
 * language: Contract Products vs Token Products, ownership/relationship metadata, the CH-EASE package
 * format, and mint targets. No runtime behavior is wired in Phase 0.
 *
 * Design rules (see docs/superpowers/plans/2026-06-17-pasta-protocol-mvp.md):
 * - A Contract Product creates a contract and may contain Token Products.
 * - A Token Product is a token definition that can live inside many Contract Products.
 * - Ownership relationship metadata must never block a future Wallet -> Franchise -> Collection ->
 *   Token hierarchy, even though MVP does not enforce it.
 */

/** Every app in the Pasta Protocol suite. */
export type PastaAppId =
  | "spaghetti"
  | "gnocchi"
  | "ravioli"
  | "rotini"
  | "penne"
  | "lasagna"
  | "chease"
  | "colander";

/** Apps that create a new on-chain contract. */
export type ContractProductKind =
  | "standard_collection" // Spaghetti
  | "blind_mint_collection" // Macaroni (existing, unchanged)
  | "open_edition_collection" // Gnocchi standalone
  | "bundle_collection" // Ravioli standalone
  | "generative_collection" // Rotini standalone
  | "distribution" // Penne
  | "exhibition" // Lasagna
  | "franchise"; // future

/** Token definitions that can live inside a Contract Product. */
export type TokenProductKind =
  | "one_of_one"
  | "limited_edition"
  | "fixed_supply_edition"
  | "timed_open_edition"
  | "forever_open_edition"
  | "supply_limited_open_edition"
  | "bonding_curve_open_edition"
  | "membership_token"
  | "badge_token"
  | "reward_token"
  | "bundle_token";

/**
 * Relationship metadata stamped into contract/token metadata JSON. All optional for MVP; present so the
 * architecture can evolve into franchise-level ownership without a schema migration.
 */
export type OwnershipRelationshipMetadata = {
  parent_contract?: string;
  franchise_contract?: string;
  related_contracts?: string[];
  collection_group?: string;
  publisher_contract?: string;
  ownership_chain?: string[];
};

/** Bonding-curve parameters (Gnocchi; design reused from tezos-franchise-factory). */
export type BondingCurveConfig = {
  base_price: number; // mutez
  increment: number; // mutez per step; positive or negative
  minimum_price?: number; // mutez clamp
  maximum_price?: number; // mutez clamp
  step_size?: number; // editions per price step (default 1)
};

/** Tezos network selector shared by all Pasta apps. */
export type PastaNetwork = "mainnet" | "shadownet";

/** A contract a user may publish/mint a Token Product into (Spaghetti mint-target selection). */
export type MintTarget = {
  kind: "new_collection" | "own_collection" | "hen_shared" | "wtfos_open_collection";
  contractAddress?: string; // KT1 (omitted for new_collection until deployed)
  label: string;
  /** Why the user is allowed to mint here. Resolved per target at publish time. */
  permission: "admin" | "minter" | "open" | "wtfos_policy";
};

/**
 * CH-EASE export package format — the contract every publishing app consumes.
 * A package is either a full collection (for originating a new contract) or a single token product.
 */
export type CheasePackageKind = "collection" | "single_token";

export type CheaseTokenItem = {
  tokenId?: number;
  name: string;
  description?: string;
  /** ipfs:// or app-local reference to the primary artifact. */
  artifactUri?: string;
  /** Optional preview/display image. */
  previewUri?: string;
  mimeType?: string;
  attributes?: Array<{ name: string; value: string }>;
  tags?: string[];
  /** TZIP-21 token metadata, fully built and ready to pin. */
  tokenMetadata?: Record<string, unknown>;
};

export type CheaseCollectionPackage = {
  schemaVersion: "wtfos.pasta.chease-package.v1";
  kind: "collection";
  /** Which app this export is formatted for. */
  targetApp: PastaAppId;
  title: string;
  description?: string;
  symbol?: string;
  /** Collection cover image (ipfs:// or app-local reference). */
  coverImageUri?: string;
  /** Collection-level (TZIP-16/21) metadata, ready to originate a contract. */
  collectionMetadata?: Record<string, unknown>;
  relationship?: OwnershipRelationshipMetadata;
  items: CheaseTokenItem[];
};

export type CheaseSingleTokenPackage = {
  schemaVersion: "wtfos.pasta.chease-package.v1";
  kind: "single_token";
  targetApp: PastaAppId;
  token: CheaseTokenItem;
  relationship?: OwnershipRelationshipMetadata;
};

export type CheasePackage = CheaseCollectionPackage | CheaseSingleTokenPackage;

/** Distribution mode of an app build (Owner Directive #3). */
export type PastaDistributionMode = "wtfos_embedded" | "downloaded_standalone";
