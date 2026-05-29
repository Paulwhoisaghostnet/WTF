import { createHash } from "node:crypto";
import { buildMerkleTree, toHex } from "../../lib/merkle";

/**
 * Integrity fingerprinting (Req4 / D3). Pure + dependency-light so it unit-tests
 * without a DB. The fingerprint is deterministic for a given manifest + asset
 * tree + build, so any change to an app's structure/code changes the fingerprint
 * and auto-invalidates its key (see key-policy.ts).
 *
 *   manifestHash       = sha256(canonicalize(manifest))
 *   bundleHash         = merkle root (hex) over the app's asset/bundle tree
 *   buildHash          = git commit / package version (resolved by config.ts)
 *   integrityFingerprint = sha256(manifestHash ‖ bundleHash ‖ buildHash)
 */

export const FINGERPRINT_ALGO = "sha256" as const;

export interface BundleFile {
  /** Repo-relative (or app-relative) path. */
  path: string;
  /** sha256 hex of the file contents. */
  sha256: string;
}

export interface FingerprintInput {
  manifest: unknown;
  bundleFiles: readonly BundleFile[];
  buildHash: string;
}

export interface FingerprintResult {
  manifestHash: string;
  bundleHash: string;
  buildHash: string;
  integrityFingerprint: string;
  fingerprintAlgo: typeof FINGERPRINT_ALGO;
}

function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Deterministic JSON canonicalization: object keys sorted recursively, arrays
 * preserved in order, undefined dropped. Two structurally-equal manifests always
 * serialize identically regardless of key insertion order.
 */
export function canonicalizeJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value === undefined ? null : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    if (record[key] === undefined) continue;
    sorted[key] = canonicalize(record[key]);
  }
  return sorted;
}

export function computeManifestHash(manifest: unknown): string {
  return sha256Hex(canonicalizeJson(manifest));
}

/**
 * Bundle tree hash. Reuses the kernel merkle helper (server/lib/merkle.ts): each
 * file becomes a sha256 leaf over `path\0contentHash`, the merkle root is the
 * bundle hash. Order-independent (the merkle helper sorts pairs bytewise) and we
 * sort by path first for a stable leaf ordering. Empty bundle → all-zero root.
 */
export function computeBundleHash(files: readonly BundleFile[]): string {
  const leaves = [...files]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((file) =>
      new Uint8Array(createHash("sha256").update(`${file.path}\0${file.sha256}`).digest()),
    );
  const { root } = buildMerkleTree(leaves);
  return toHex(root);
}

export function computeIntegrityFingerprint(
  manifestHash: string,
  bundleHash: string,
  buildHash: string,
): string {
  return sha256Hex(`${manifestHash}\u2016${bundleHash}\u2016${buildHash}`);
}

export function computeFingerprint(input: FingerprintInput): FingerprintResult {
  const manifestHash = computeManifestHash(input.manifest);
  const bundleHash = computeBundleHash(input.bundleFiles);
  const integrityFingerprint = computeIntegrityFingerprint(
    manifestHash,
    bundleHash,
    input.buildHash,
  );
  return {
    manifestHash,
    bundleHash,
    buildHash: input.buildHash,
    integrityFingerprint,
    fingerprintAlgo: FINGERPRINT_ALGO,
  };
}

/** Whether a stored fingerprint still matches a freshly recomputed one. */
export function fingerprintMatches(
  stored: string | null | undefined,
  current: string | null | undefined,
): boolean {
  return Boolean(stored) && Boolean(current) && stored === current;
}
