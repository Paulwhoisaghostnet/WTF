import { primaryDomainFor, routeRecordToDomains, type AtprotoRecordWrite } from "@wtfos/atproto-spine";
import type { IndexRef } from "@shared/atproto";
import { getSpineConfig } from "./config";
import { buildSpineWrite } from "./records";

/**
 * Echo router (S2.5). Pure helpers that turn a canonical "fact" record (living in a domain
 * or user repo) into an `app.wtfos.index.ref` pointer echo for the master repo. The master
 * repo thus indexes every domain without holding the bytes — the doctrine "spine, not body".
 * The DB enqueue (echoRecordToMaster) lives in ./service.ts.
 */

export interface FactRef {
  /** Repo DID that holds the canonical record. */
  factRepo: string;
  /** Collection NSID of the canonical record, e.g. app.wtfos.social.board.post. */
  factCollection: string;
  /** Record key of the canonical record. */
  factRkey: string;
  /** Optional $type (defaults to factCollection). */
  factType?: string;
  /** Small denormalized summary the master can index without fetching the fact. */
  summary?: unknown;
  refKind?: string;
  subdomain?: string;
  createdAt?: string;
}

/** The most specific configured domain for a `$type`, or "os" as the catch-all. */
export function domainForType(type: string): string {
  const { routing } = getSpineConfig();
  return primaryDomainFor(type, routing) ?? "os";
}

/** All domains a `$type` routes to (a type may fan out to several). */
export function domainsForType(type: string): string[] {
  const { routing } = getSpineConfig();
  const matched = routeRecordToDomains(type, routing);
  return matched.length > 0 ? matched : ["os"];
}

/** Build the validated index.ref record body for a fact (no $type; injected on build). */
export function buildIndexRef(fact: FactRef): Omit<IndexRef, "$type"> {
  const factType = fact.factType ?? fact.factCollection;
  return {
    schemaVersion: 1,
    domain: domainForType(factType),
    subdomain: fact.subdomain,
    refKind: fact.refKind ?? "fact",
    factType,
    factRepo: fact.factRepo,
    factCollection: fact.factCollection,
    factRkey: fact.factRkey,
    summary: fact.summary,
    createdAt: fact.createdAt ?? new Date().toISOString(),
  };
}

/** Deterministic, idempotent rkey for an echo pointing at a specific fact. */
export function echoRkeyParts(fact: FactRef): Array<string | number> {
  return [domainForType(fact.factType ?? fact.factCollection), fact.factCollection, fact.factRkey];
}

/** Build the full publishable write for an index.ref echo (validated). */
export function buildEchoWrite(fact: FactRef): AtprotoRecordWrite {
  return buildSpineWrite(
    "app.wtfos.index.ref",
    buildIndexRef(fact) as unknown as Record<string, unknown>,
    echoRkeyParts(fact),
  );
}
