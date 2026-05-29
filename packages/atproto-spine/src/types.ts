/**
 * Shared shapes for the wtfOS AT Protocol spine. App-agnostic: no Tezos, no wtfOS
 * domain knowledge baked in. Everything domain-specific arrives via {@link SpineConfig}.
 */

/** A single record write targeted at a collection (NSID) + record key. */
export interface AtprotoRecordWrite {
  collection: string;
  rkey: string;
  record: Record<string, unknown>;
}

/** Credentials/endpoint for one PDS (or PDS-like XRPC service). */
export interface PdsServiceConfig {
  /** Base service URL, e.g. https://pds.wtfos.me */
  url: string;
  /** App-password identifier used for record writes (the repo owner). */
  identifier?: string;
  /** App password paired with {@link identifier}. */
  password?: string;
  /** PDS admin password (basic auth) for admin XRPC (createAccount side-effects, etc.). */
  adminPassword?: string;
  /** Explicit repo DID when writing into a non-self repo. */
  repoDid?: string;
}

/** Routes a record `$type` to one or more logical domains (each backed by a PDS). */
export interface SpineRoutingRule {
  /** Match when a record `$type` starts with this prefix, e.g. "app.wtfos.social.". */
  typePrefix: string;
  /** Logical domain key, e.g. "social" (keys into {@link SpineConfig.domains}). */
  domain: string;
}

/** Top-level configuration for a spine deployment. Supplied by the host (the kernel). */
export interface SpineConfig {
  /** Handle/host base for the network, e.g. "wtfos.me". */
  networkDomain: string;
  /** Canonical lexicon namespace, e.g. "app.wtfos". */
  lexiconNamespace: string;
  /** Master/canonical PDS. */
  master: PdsServiceConfig;
  /** Users PDS hosting user-owned did:plc repos (optional). */
  users?: PdsServiceConfig;
  /** Private (non-federated) PDS for encrypted DM/room records (optional). */
  privatePds?: PdsServiceConfig;
  /** Indigo relay subscribeRepos URL (optional until the relay is online). */
  relayUrl?: string;
  /** Per-domain PDS endpoints keyed by domain (e.g. "social", "media", ...). */
  domains: Record<string, PdsServiceConfig>;
  /** `$type`-prefix → domain routing rules for pointer echoes. */
  routing: SpineRoutingRule[];
  /** Handle labels that may never be registered by users (infra/reserved). */
  reservedHandles: string[];
  /** Max serialized record size before {@link shrink} is applied. Defaults to 900_000. */
  maxRecordBytes?: number;
}
