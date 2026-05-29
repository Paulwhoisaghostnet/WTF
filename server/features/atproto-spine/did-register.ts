import { PdsAdminClient } from "@wtfos/atproto-spine";
import { getSpineConfig } from "./config";

/**
 * DID register service (S2.2).
 *
 * Two DID methods per the decisions ledger (docs/atproto/00-decisions.md):
 *  - did:web  — WTF-owned infra/service identities (master repo, domain repos). Cheap,
 *               self-served from /.well-known/did.json, fully under WTF control.
 *  - did:plc  — user-owned, portable identities minted by the users PDS. Durable across
 *               handle changes and PDS migration.
 *
 * "Dual PLC": the genesis/rotation operations are mirrored to BOTH the public
 * plc.directory and the self-hosted PLC mirror (plc.wtfos.me) so the network keeps
 * resolving even if either directory is unavailable. The PDS performs the primary
 * submission; this service replays the op log to the secondary directory.
 *
 * Network calls take an injectable fetch so the request shaping is unit-testable.
 */

export type DidMethod = "web" | "plc";

export interface ParsedDid {
  method: DidMethod;
  /** For did:web this is the host (and optional path) form; for did:plc the identifier. */
  identifier: string;
  /** did:web only: the resolvable did.json URL. */
  didDocUrl?: string;
}

/** Parse + validate a DID, returning its method and the did.json URL for did:web. */
export function parseDid(did: string): ParsedDid {
  if (did.startsWith("did:web:")) {
    const rest = did.slice("did:web:".length);
    if (!rest) throw new Error(`invalid did:web: ${did}`);
    const [host, ...segments] = rest.split(":");
    const decodedHost = decodeURIComponent(host);
    const path = segments.length > 0 ? `/${segments.map(decodeURIComponent).join("/")}/did.json` : "/.well-known/did.json";
    return { method: "web", identifier: rest, didDocUrl: `https://${decodedHost}${path}` };
  }
  if (did.startsWith("did:plc:")) {
    const id = did.slice("did:plc:".length);
    if (!/^[a-z2-7]{24}$/.test(id)) {
      // length/charset is base32; be lenient but non-empty
      if (!id) throw new Error(`invalid did:plc: ${did}`);
    }
    return { method: "plc", identifier: id };
  }
  throw new Error(`unsupported DID method: ${did}`);
}

/** Build a did:web identifier from a host (and optional path segments). */
export function didWebForHost(host: string, ...pathSegments: string[]): string {
  const encodedHost = host.replace(/:/g, "%3A");
  const suffix = pathSegments.length > 0 ? `:${pathSegments.map(encodeURIComponent).join(":")}` : "";
  return `did:web:${encodedHost}${suffix}`;
}

export interface DidWebDocumentInput {
  did: string;
  /** Handle that should resolve to this DID (becomes alsoKnownAs at://handle). */
  handle: string;
  /** PDS service endpoint, e.g. https://pds.wtfos.me. */
  pdsUrl: string;
  /** Optional secp256k1 verification key (multibase) for atproto signing. */
  signingKeyMultibase?: string;
  /** Extra alsoKnownAs entries. */
  alsoKnownAs?: string[];
}

/** Build a spec-compliant did:web DID document for a WTF service identity. */
export function buildDidWebDocument(input: DidWebDocumentInput): Record<string, unknown> {
  const aka = [`at://${input.handle}`, ...(input.alsoKnownAs ?? [])];
  const doc: Record<string, unknown> = {
    "@context": ["https://www.w3.org/ns/did/v1", "https://w3id.org/security/multikey/v1"],
    id: input.did,
    alsoKnownAs: Array.from(new Set(aka)),
    service: [
      {
        id: "#atproto_pds",
        type: "AtprotoPersonalDataServer",
        serviceEndpoint: input.pdsUrl.replace(/\/$/, ""),
      },
    ],
  };
  if (input.signingKeyMultibase) {
    doc.verificationMethod = [
      {
        id: `${input.did}#atproto`,
        type: "Multikey",
        controller: input.did,
        publicKeyMultibase: input.signingKeyMultibase,
      },
    ];
  }
  return doc;
}

/** True if a DID document advertises the given handle via alsoKnownAs. */
export function didDocServesHandle(doc: unknown, handle: string): boolean {
  if (!doc || typeof doc !== "object") return false;
  const aka = (doc as { alsoKnownAs?: unknown }).alsoKnownAs;
  return Array.isArray(aka) && aka.includes(`at://${handle}`);
}

/** Resolve a did:web document over HTTPS. */
export async function resolveDidWeb(did: string, fetchImpl: typeof fetch = fetch): Promise<Record<string, unknown> | null> {
  const parsed = parseDid(did);
  if (parsed.method !== "web" || !parsed.didDocUrl) throw new Error(`not a did:web: ${did}`);
  const res = await fetchImpl(parsed.didDocUrl, { headers: { accept: "application/json" } });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}

/** PLC directory endpoints to keep in sync (public + self-hosted mirror). */
export function plcDirectories(env: NodeJS.ProcessEnv = process.env): string[] {
  const out = new Set<string>();
  const primary = env.WTFOS_PLC_PRIMARY_URL || env.DID_PLC_URL || "https://plc.directory";
  out.add(primary.replace(/\/$/, ""));
  const mirror = env.WTFOS_PLC_MIRROR_URL;
  if (mirror) out.add(mirror.replace(/\/$/, ""));
  return [...out];
}

/** Fetch the operation log for a did:plc from a given directory. */
export async function fetchPlcOpLog(
  did: string,
  directoryUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown[]> {
  const url = new URL(`/${did}/log`, directoryUrl.replace(/\/$/, "") + "/");
  const res = await fetchImpl(url, { headers: { accept: "application/json" } });
  if (!res.ok) return [];
  const payload = await res.json().catch(() => []);
  return Array.isArray(payload) ? payload : [];
}

/**
 * Normalize a fetched PLC op log into the ordered list of operations to replay to a mirror.
 * PLC op logs are ordered oldest→newest, so the **genesis op is index 0** (not the last entry).
 * Some directories return audit entries that wrap the operation as `{ operation, cid, ... }`;
 * those are unwrapped. A faithful dual-PLC mirror must replay the FULL log in order, so this
 * returns every operation (callers iterate in sequence) rather than a single op.
 */
export function orderedPlcOpsForReplay(log: unknown[]): Array<Record<string, unknown>> {
  const ops: Array<Record<string, unknown>> = [];
  for (const entry of log) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const op =
      e.operation && typeof e.operation === "object"
        ? (e.operation as Record<string, unknown>)
        : e;
    ops.push(op);
  }
  return ops;
}

export interface PlcMirrorResult {
  directory: string;
  ok: boolean;
  status?: number;
  error?: string;
}

/**
 * Mirror a did:plc operation to one or more directories (dual-PLC). Best-effort: each
 * directory is attempted independently and failures are reported per-directory rather
 * than throwing, so a mirror outage never blocks identity creation.
 */
export async function mirrorPlcOperation(input: {
  did: string;
  operation: Record<string, unknown>;
  directories?: string[];
  fetchImpl?: typeof fetch;
}): Promise<PlcMirrorResult[]> {
  const directories = input.directories ?? plcDirectories();
  const fetchImpl = input.fetchImpl ?? fetch;
  const results: PlcMirrorResult[] = [];
  for (const directory of directories) {
    const url = new URL(`/${input.did}`, directory.replace(/\/$/, "") + "/");
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input.operation),
      });
      results.push({ directory, ok: res.ok, status: res.status });
    } catch (err) {
      results.push({ directory, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

export interface RegisterPlcIdentityInput {
  handle: string;
  email: string;
  password: string;
  inviteCode?: string;
  /** PDS that mints the did:plc; defaults to the users PDS from spine config. */
  pdsUrl?: string;
  adminPassword?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Mint a user-owned did:plc on the users PDS, then mirror its op log to the secondary
 * PLC directory. Returns the created DID + the per-directory mirror results.
 */
export async function registerPlcIdentity(input: RegisterPlcIdentityInput) {
  const config = getSpineConfig();
  const pdsUrl = input.pdsUrl ?? config.users?.url ?? config.master.url;
  const adminPassword = input.adminPassword ?? config.users?.adminPassword ?? config.master.adminPassword;
  const fetchImpl = input.fetchImpl ?? fetch;
  const admin = new PdsAdminClient(pdsUrl, adminPassword, fetchImpl);
  const account = await admin.createAccount({
    handle: input.handle,
    email: input.email,
    password: input.password,
    inviteCode: input.inviteCode,
  });

  // Replay the PDS-submitted PLC op log to any secondary directories (dual-PLC). The op log is
  // ordered oldest→newest (genesis is index 0), and a faithful mirror must replay EVERY op in
  // order — not just one — so the secondary directory reconstructs the full identity history.
  // Best-effort and per-op so a mirror outage never blocks identity creation.
  const directories = plcDirectories();
  const mirror: PlcMirrorResult[] = [];
  if (directories.length > 1) {
    const [primary, ...rest] = directories;
    const ops = orderedPlcOpsForReplay(
      await fetchPlcOpLog(account.did, primary, fetchImpl).catch(() => []),
    );
    for (const operation of ops) {
      const results = await mirrorPlcOperation({
        did: account.did,
        operation,
        directories: rest,
        fetchImpl,
      });
      mirror.push(...results);
    }
  }
  return { account, mirror };
}
