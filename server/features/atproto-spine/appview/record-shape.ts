import { lexiconSchemas } from "@shared/atproto";
import { domainForType } from "../echo-router";

/**
 * Pure AppView record shaping (S3.1). No DB. Builds at:// URIs and denormalized index rows
 * from repo ops, so the indexer logic is unit-testable.
 */

export interface RepoOp {
  action: "create" | "update" | "delete";
  did: string;
  collection: string;
  rkey: string;
  cid?: string | null;
  /** at:// URI; derived when absent. */
  uri?: string;
  record?: Record<string, unknown> | null;
}

export interface AppviewRow {
  uri: string;
  did: string;
  collection: string;
  rkey: string;
  cid: string | null;
  domain: string;
  json: Record<string, unknown>;
  source: string;
}

/** Build an at:// URI from its parts. */
export function buildAtUri(did: string, collection: string, rkey: string): string {
  return `at://${did}/${collection}/${rkey}`;
}

/** Parse an at:// URI into its parts. Throws on malformed input. */
export function parseAtUri(uri: string): { did: string; collection: string; rkey: string } {
  const m = /^at:\/\/([^/]+)\/([^/]+)\/(.+)$/.exec(uri);
  if (!m) throw new Error(`invalid at:// uri: ${uri}`);
  return { did: m[1], collection: m[2], rkey: m[3] };
}

/** Whether a collection is one of our published lexicons. */
export function isWtfosLexicon(collection: string): boolean {
  return Object.prototype.hasOwnProperty.call(lexiconSchemas, collection);
}

/** Build a denormalized AppView row from a create/update op. Returns null for deletes/malformed. */
export function toAppviewRow(op: RepoOp, source = "firehose"): AppviewRow | null {
  if (op.action === "delete") return null;
  if (!op.record || !op.did || !op.collection || !op.rkey) return null;
  const uri = op.uri ?? buildAtUri(op.did, op.collection, op.rkey);
  return {
    uri,
    did: op.did,
    collection: op.collection,
    rkey: op.rkey,
    cid: op.cid ?? null,
    domain: domainForType(op.collection),
    json: op.record,
    source,
  };
}
