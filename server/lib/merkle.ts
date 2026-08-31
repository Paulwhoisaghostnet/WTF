/**
 * Merkle primitives used by the app-registry fingerprint and the WTF
 * buyback allowlist. The legacy sorted-pair BLAKE2 functions remain stable
 * for app fingerprints. Buyback proofs use the separate, versioned SHA-256
 * functions below because they must exactly match `WtfBuybackV1.swap`.
 */

import { createHash } from "node:crypto";

/** Base58 alphabet used by Tezos (same as Bitcoin). */
const B58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function b58decode(s: string): Uint8Array {
  let n = 0n;
  for (const ch of s) {
    const idx = B58_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`invalid base58 character: ${ch}`);
    n = n * 58n + BigInt(idx);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.push(Number(n & 0xffn));
    n >>= 8n;
  }
  // leading zeros in base58 are "1"s
  for (const ch of s) {
    if (ch === "1") bytes.push(0);
    else break;
  }
  bytes.reverse();
  const out = new Uint8Array(bytes);
  if (out.length < 5) {
    throw new Error("base58 payload too short");
  }
  // verify checksum
  const payload = out.slice(0, -4);
  const checksum = out.slice(-4);
  const h = sha256(sha256(payload));
  for (let i = 0; i < 4; i++) {
    if (h[i] !== checksum[i]) {
      throw new Error("base58check checksum mismatch");
    }
  }
  return payload;
}

function sha256(buf: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(buf).digest());
}

/**
 * Blake2b-256 using node's crypto. Node has native BLAKE2b support
 * via `createHash("blake2b512")` but not a 256-bit variant directly;
 * we use 512 and truncate to 32 bytes to match Tezos' michelson
 * `blake2b-256` semantics where digests are 32 bytes. Node ≥ 20 may
 * expose `blake2b256` — prefer it when available for safety.
 */
function blake2b256(buf: Uint8Array): Uint8Array {
  // Node's hash names vary by OpenSSL build. Prefer 256-bit names,
  // otherwise truncate the 512-bit variant.
  const tryNames = ["blake2b256", "blake2s256", "blake2b512"];
  for (const name of tryNames) {
    try {
      const out = createHash(name).update(buf).digest();
      return new Uint8Array(out).slice(0, 32);
    } catch {
      /* try next */
    }
  }
  throw new Error(
    "node crypto does not expose a BLAKE2 hash — please upgrade Node"
  );
}

/**
 * Pack a Tezos address (tz1/tz2/tz3/KT1) into the 22-byte Michelson
 * representation used by the SmartPy contract.
 * Layout: 1 prefix byte + 20 body bytes + 1 entrypoint byte = 22.
 *
 * - tz1 → 0x00 0x00 + body20
 * - tz2 → 0x00 0x01 + body20
 * - tz3 → 0x00 0x02 + body20
 * - KT1 → 0x01 + body20 + 0x00
 */
export function packAddress(addr: string): Uint8Array {
  const decoded = b58decode(addr);
  // Tezos prefixes are 3 bytes for tz* / KT1 — total length 20 + 3 = 23.
  if (decoded.length !== 23) {
    throw new Error(`unexpected address payload length: ${decoded.length}`);
  }
  const body = decoded.slice(3);
  if (addr.startsWith("tz1")) {
    return Uint8Array.from([0x00, 0x00, ...body]);
  }
  if (addr.startsWith("tz2")) {
    return Uint8Array.from([0x00, 0x01, ...body]);
  }
  if (addr.startsWith("tz3")) {
    return Uint8Array.from([0x00, 0x02, ...body]);
  }
  if (addr.startsWith("KT1")) {
    return Uint8Array.from([0x01, ...body, 0x00]);
  }
  throw new Error(`unsupported address prefix: ${addr.slice(0, 3)}`);
}

/** Encode a nonnegative bigint to 16 big-endian bytes (u128). */
export function bigintTo16BEBytes(n: bigint): Uint8Array {
  if (n < 0n) throw new Error("amount must be nonnegative");
  if (n >= 1n << 128n) throw new Error("amount exceeds 128 bits");
  const out = new Uint8Array(16);
  let x = n;
  for (let i = 15; i >= 0; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

export function buildLeaf(walletAddress: string, maxWtf: bigint): Uint8Array {
  const addr = packAddress(walletAddress);
  const amt = bigintTo16BEBytes(maxWtf);
  const buf = new Uint8Array(addr.length + amt.length);
  buf.set(addr, 0);
  buf.set(amt, addr.length);
  return blake2b256(buf);
}

export const WTF_BUYBACK_PROOF_VERSION =
  "wtf-buyback-v1.sha256-packed-address.directional.v1";
export const WTF_BUYBACK_CONTRACT_ARTIFACT =
  "contracts/wtf-buyback/WtfBuybackV1.py#WtfBuybackV1.swap";

export type BuybackMerkleStep = {
  sibling: Uint8Array;
  /** True when the sibling is concatenated to the right of the current node. */
  right: boolean;
};

export type EncodedBuybackMerkleProof = {
  version: typeof WTF_BUYBACK_PROOF_VERSION;
  contractArtifact: typeof WTF_BUYBACK_CONTRACT_ARTIFACT;
  steps: Array<{ sibling: string; right: boolean }>;
};

/** Exact bytes produced by Michelson `PACK` for a value of type `address`. */
export function packMichelsonAddress(addr: string): Uint8Array {
  const optimizedAddress = packAddress(addr);
  const out = new Uint8Array(1 + 1 + 4 + optimizedAddress.length);
  out[0] = 0x05; // PACK prefix
  out[1] = 0x0a; // Micheline bytes node
  const view = new DataView(out.buffer);
  view.setUint32(2, optimizedAddress.length, false);
  out.set(optimizedAddress, 6);
  return out;
}

/** `sha256(sp.pack(address))`, matching the checked-in SmartPy contract. */
export function buildBuybackLeaf(walletAddress: string): Uint8Array {
  return sha256(packMichelsonAddress(walletAddress));
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const out = new Uint8Array(left.length + right.length);
  out.set(left, 0);
  out.set(right, left.length);
  return out;
}

/**
 * Directional SHA-256 tree used by `WtfBuybackV1.swap`. Odd nodes are paired
 * with themselves and the duplicate sibling is included in the proof.
 */
export function buildBuybackMerkleTree(leaves: Uint8Array[]): {
  root: Uint8Array;
  proofs: BuybackMerkleStep[][];
} {
  if (leaves.length === 0) {
    return { root: new Uint8Array(32), proofs: [] };
  }

  const layers: Uint8Array[][] = [leaves.map((leaf) => leaf.slice())];
  while (layers[layers.length - 1].length > 1) {
    const current = layers[layers.length - 1];
    const next: Uint8Array[] = [];
    for (let index = 0; index < current.length; index += 2) {
      const left = current[index];
      const right = current[index + 1] ?? left;
      next.push(sha256(concatBytes(left, right)));
    }
    layers.push(next);
  }

  const proofs = leaves.map((_, leafIndex) => {
    const proof: BuybackMerkleStep[] = [];
    let index = leafIndex;
    for (let depth = 0; depth < layers.length - 1; depth++) {
      const layer = layers[depth];
      const isLeft = index % 2 === 0;
      const siblingIndex = isLeft ? index + 1 : index - 1;
      proof.push({
        sibling: (layer[siblingIndex] ?? layer[index]).slice(),
        right: isLeft,
      });
      index = Math.floor(index / 2);
    }
    return proof;
  });

  return { root: layers[layers.length - 1][0], proofs };
}

export function verifyBuybackProof(
  leaf: Uint8Array,
  proof: BuybackMerkleStep[],
  root: Uint8Array,
): boolean {
  let computed = leaf;
  for (const step of proof) {
    computed = sha256(
      step.right
        ? concatBytes(computed, step.sibling)
        : concatBytes(step.sibling, computed),
    );
  }
  return compareBytes(computed, root) === 0;
}

export function encodeBuybackProof(
  proof: BuybackMerkleStep[],
): EncodedBuybackMerkleProof {
  return {
    version: WTF_BUYBACK_PROOF_VERSION,
    contractArtifact: WTF_BUYBACK_CONTRACT_ARTIFACT,
    steps: proof.map((step) => ({ sibling: toHex(step.sibling), right: step.right })),
  };
}

export function decodeBuybackProof(value: unknown): BuybackMerkleStep[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<EncodedBuybackMerkleProof>;
  if (
    candidate.version !== WTF_BUYBACK_PROOF_VERSION ||
    candidate.contractArtifact !== WTF_BUYBACK_CONTRACT_ARTIFACT ||
    !Array.isArray(candidate.steps)
  ) {
    return null;
  }
  const decoded: BuybackMerkleStep[] = [];
  for (const step of candidate.steps) {
    if (
      !step ||
      typeof step !== "object" ||
      typeof step.sibling !== "string" ||
      !/^(?:0x)?[0-9a-fA-F]{64}$/.test(step.sibling) ||
      typeof step.right !== "boolean"
    ) {
      return null;
    }
    decoded.push({ sibling: fromHex(step.sibling), right: step.right });
  }
  return decoded;
}

function concatSorted(a: Uint8Array, b: Uint8Array): Uint8Array {
  const cmp = compareBytes(a, b);
  const [left, right] = cmp <= 0 ? [a, b] : [b, a];
  const out = new Uint8Array(left.length + right.length);
  out.set(left, 0);
  out.set(right, left.length);
  return out;
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

export function buildMerkleTree(leaves: Uint8Array[]): {
  root: Uint8Array;
  proofs: Uint8Array[][];
} {
  if (leaves.length === 0) {
    return { root: new Uint8Array(32), proofs: [] };
  }
  // Layers of nodes, starting at the leaves.
  const layers: Uint8Array[][] = [leaves.slice()];
  while (layers[layers.length - 1].length > 1) {
    const cur = layers[layers.length - 1];
    const next: Uint8Array[] = [];
    for (let i = 0; i < cur.length; i += 2) {
      const left = cur[i];
      const right = i + 1 < cur.length ? cur[i + 1] : cur[i];
      next.push(blake2b256(concatSorted(left, right)));
    }
    layers.push(next);
  }

  const proofs: Uint8Array[][] = leaves.map((_, idx) => {
    const proof: Uint8Array[] = [];
    let index = idx;
    for (let depth = 0; depth < layers.length - 1; depth++) {
      const layer = layers[depth];
      const pairIndex = index ^ 1;
      if (pairIndex < layer.length) {
        proof.push(layer[pairIndex]);
      }
      index = Math.floor(index / 2);
    }
    return proof;
  });

  return { root: layers[layers.length - 1][0], proofs };
}

export function verifyProof(
  leaf: Uint8Array,
  proof: Uint8Array[],
  root: Uint8Array
): boolean {
  let node = leaf;
  for (const p of proof) {
    node = blake2b256(concatSorted(node, p));
  }
  return compareBytes(node, root) === 0;
}

export function toHex(buf: Uint8Array): string {
  let s = "";
  for (const b of buf) s += b.toString(16).padStart(2, "0");
  return s;
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("odd hex length");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
