import assert from "node:assert/strict";
import {
  createCipheriv,
  createHash,
} from "node:crypto";
import test from "node:test";

import { packDataBytes } from "@taquito/michel-codec";
import { blake2b } from "blakejs";

import {
  computeRavioliRevealCommitment,
  RAVIOLI_MODE1_PRE_OP10_PROOF_SCHEMA,
  type RavioliMode1PreOp10ProofInput,
  type RavioliPinnedJsonMaterial,
  verifyRavioliMode1PreOp10PrivateProof,
} from "./shadownet-ravioli-blind-proof-verifier";

const ROUTER = "KT1N6ZEgWS4HyJte7EtSuwHtrnNSVThaNhb7";
const GNOCCHI = "KT1ShvgCuQZAKWTUFeCQZphNcn1y6Bi7LyYi";
const MANIFEST_URI =
  "ipfs://bafkreiej26526d3eqrnd6ih3abvl6ajnvjh5muts2wyjerzrnpcmacb5wu";
const ENVELOPE_URI =
  "ipfs://bafkreice4djom4bwdqmjj4kohpqpxovm5fbud4q4rbedni4ej3kv2vshce";
const TOKEN_URI =
  "ipfs://bafkreigytdnjdf5vsd5qk6d7pxtouj6iziebj274qkfrhmputrcjt77juq";
const SALT = "12".repeat(32);
const IV = Buffer.from("000102030405060708090a0b", "hex");
const OFFSET = 1;

const REVEAL_TYPE = {
  prim: "pair",
  args: [
    { prim: "bytes" },
    {
      prim: "pair",
      args: [{ prim: "nat" }, { prim: "bytes" }],
    },
  ],
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [
          key,
          canonical((value as Record<string, unknown>)[key]),
        ]),
    );
  }
  return value;
}

function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(canonical(value)), "utf8");
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function pinned(
  uri: string,
  fileName: string,
  value: unknown,
): RavioliPinnedJsonMaterial {
  const bytes = canonicalBytes(value);
  return {
    value: JSON.parse(bytes.toString("utf8")),
    bytes,
    proof: {
      cid: uri.slice("ipfs://".length),
      uri,
      fileName,
      mimeType: "application/json",
      byteLength: bytes.byteLength,
      sha256: digest(bytes),
      publicGatewayVerified: true,
    },
  };
}

function hex(value: string): string {
  return Buffer.from(value, "utf8").toString("hex");
}

function independentCommitment(
  contentsUri: string,
  salt: string,
  offset: number,
): string {
  const packed = packDataBytes(
    {
      prim: "Pair",
      args: [
        { bytes: hex(contentsUri) },
        {
          prim: "Pair",
          args: [{ int: String(offset) }, { bytes: salt }],
        },
      ],
    } as any,
    REVEAL_TYPE as any,
  ).bytes;
  return Buffer.from(
    blake2b(Buffer.from(packed, "hex"), undefined, 32),
  ).toString("hex");
}

function encryptEnvelope(
  publicReveal: unknown,
  aad: Record<string, unknown>,
  saltHex = SALT,
): Record<string, unknown> {
  const key = createHash("sha256")
    .update(Buffer.from("pasta-ravioli-sealed-reveal@1\0", "utf8"))
    .update(Buffer.from(saltHex, "hex"))
    .digest();
  const cipher = createCipheriv(
    "aes-256-gcm",
    key,
    IV,
    { authTagLength: 16 },
  );
  cipher.setAAD(Buffer.from(JSON.stringify(aad), "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(publicReveal), "utf8")),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  // Keep both the envelope and nested AAD in canonical pin order. The
  // verifier deliberately authenticates the bytes holders will fetch, not a
  // differently ordered pre-pin JavaScript object.
  return {
    aad,
    cipher: "AES-256-GCM",
    ciphertext: ciphertext.toString("base64"),
    iv: IV.toString("base64"),
    keyDerivation:
      "SHA-256(pasta-ravioli-sealed-reveal@1 || 0x00 || reveal-salt)",
    schema: "pasta-ravioli-sealed-reveal@1",
  };
}

function fixture(options: { maxSupply?: number; offset?: number } = {}): RavioliMode1PreOp10ProofInput {
  const maxSupply = options.maxSupply ?? 3;
  const offset = options.offset ?? OFFSET;
  const editionPolicy = {
    earliestChildEnd: null,
    openDeadline: "2026-08-03T00:00:00.000Z",
    requiresLimitedWrapper: false,
    revealDeadline: "2026-08-02T00:00:00.000Z",
    wrapperEditionClass: "limited-edition",
    wrapperSaleEnd: "2026-08-01T00:00:00.000Z",
    wrapperSaleStart: null,
  };
  const recipes = [
    {
      actions: [{ amount: 1, fa2: GNOCCHI, kind: "escrow", tokenId: 0 }],
      nonce: "ab".repeat(32),
      serial: 0,
    },
    {
      actions: [{ amount: 1, fa2: GNOCCHI, kind: "escrow", tokenId: 1 }],
      nonce: "cd".repeat(32),
      serial: 1,
    },
    {
      actions: [{ amount: 1, fa2: GNOCCHI, kind: "escrow", tokenId: 0 }],
      nonce: "ef".repeat(32),
      serial: 2,
    },
  ].slice(0, maxSupply);
  const publicKit = {
    blindSecurity: "commit-reveal-ui-hidden-chain-public",
    contract: ROUTER,
    editionPolicy,
    manifestUri: MANIFEST_URI,
    mode: "blind_funded_pool",
    network: "shadownet",
    recipes,
    schema: "pasta-ravioli-open-kit@3",
    tokenId: 1,
    warning: "Keep all three recipe nonces private until reveal.",
  };
  const publicReveal = {
    contract: ROUTER,
    itemCount: 1,
    manifestUri: MANIFEST_URI,
    maxSupply,
    mode: "blind_funded_pool",
    network: "shadownet",
    openKit: publicKit,
    schema: "pasta-ravioli-public-reveal@1",
    tokenId: 1,
  };
  const aad = {
    contract: ROUTER,
    manifestUri: MANIFEST_URI,
    network: "shadownet",
    schema: "pasta-ravioli-sealed-reveal@1",
    tokenId: 1,
  };
  const envelope = pinned(
    ENVELOPE_URI,
    "ravioli-sealed-reveal-1.json",
    encryptEnvelope(publicReveal, aad),
  );
  const openKit = {
    ...publicKit,
    sealedReveal: {
      contentsUri: ENVELOPE_URI,
      envelopeSha256: envelope.proof.sha256,
      offset,
      salt: SALT,
      schema: "pasta-ravioli-sealed-reveal-reference@1",
    },
  };
  const manifest = pinned(
    MANIFEST_URI,
    "ravioli-pack-manifest.json",
    {
      assignmentPolicy: "precommitted-salted-cyclic-rotation",
      blindSecurity: "commit-reveal-ui-hidden-chain-public",
      editionPolicy: {
        afterOpenDeadline:
          "refund-only; expiry credits the holder, who withdraws separately",
        earliestChildEnd: null,
        openDeadline: editionPolicy.openDeadline,
        requiresLimitedWrapper: false,
        revealDeadline: editionPolicy.revealDeadline,
        wrapperEditionClass: "limited-edition",
        wrapperSaleEnd: editionPolicy.wrapperSaleEnd,
        wrapperSaleStart: null,
      },
      itemCount: 1,
      maxSupply,
      members: [],
      mode: "blind_funded_pool",
      mystery: true,
      name: "Ravioli Blind Funded Pool",
      schemaVersion: "wtfos.pasta.pack-manifest.v2",
    },
  );
  const revealCommitment = independentCommitment(
    ENVELOPE_URI,
    SALT,
    offset,
  );
  const tokenMetadata = pinned(
    TOKEN_URI,
    "token.json",
    {
      artifactUri:
        "ipfs://bafkreidolkumbkrtfamcbfmzodwognixhm3yd7ps6tkxl2de5ozlwb3hmi",
      decimals: 0,
      name: "Ravioli Blind Funded Pool",
      ravioli: {
        blindSecurity: "authenticated-ciphertext-until-reveal",
        itemCount: 1,
        manifestUri: MANIFEST_URI,
        maxSupply,
        mode: "blind_funded_pool",
        revealCommitment,
        sealedContentsUri: ENVELOPE_URI,
        version: 3,
      },
      symbol: "RAV",
    },
  );
  const tokenInfo = [
    ["", hex(TOKEN_URI)],
    ["decimals", hex("0")],
    ["name", hex("Ravioli Blind Funded Pool")],
    ["pasta:editionClass", hex("limited-edition")],
    ["pasta:fulfillment", hex("atomic")],
    ["pasta:packMode", hex("blind_funded_pool")],
    [
      "pasta:transferExpiry",
      hex("reveal/open deadline; refund-only afterward"),
    ],
    ["symbol", hex("RAV")],
  ];
  return {
    expected: {
      network: "shadownet",
      contract: ROUTER,
      tokenId: 1,
    },
    openKit,
    manifest,
    envelope,
    tokenMetadata,
    operationTen: {
      call: {
        contractAddress: ROUTER,
        entrypoint: "create_pack",
        payload: {
          config: {
            blind: true,
            cancelled: false,
            child_expiry: null,
            committed_recipes: 0,
            contents_uri: null,
            finalized: false,
            item_count: 1,
            manifest_uri: hex(MANIFEST_URI),
            max_supply: maxSupply,
            mode: 1,
            open_deadline: editionPolicy.openDeadline,
            reveal_commitment: revealCommitment,
            reveal_deadline: editionPolicy.revealDeadline,
            wrapper_sale_end: null,
          },
          expected_token_id: 1,
          token_info: { $map: tokenInfo },
        },
      },
      kind: "call",
      sendOptions: {},
    },
  };
}

function refreshMaterial(
  input: RavioliMode1PreOp10ProofInput,
  field: "manifest" | "envelope" | "tokenMetadata",
  value: unknown,
): void {
  const prior = input[field];
  (input as any)[field] = pinned(
    prior.proof.uri,
    prior.proof.fileName,
    value,
  );
}

test("mode-1 verifier independently authenticates the exact pre-op10 private proof", () => {
  const input = fixture();
  const proof = verifyRavioliMode1PreOp10PrivateProof(input);
  assert.deepEqual(proof, {
    schema: RAVIOLI_MODE1_PRE_OP10_PROOF_SCHEMA,
    network: "shadownet",
    contract: ROUTER,
    tokenId: 1,
    mode: "blind_funded_pool",
    maxSupply: 3,
    itemCount: 1,
    nonceCount: 3,
    manifestUri: MANIFEST_URI,
    envelopeUri: ENVELOPE_URI,
    tokenMetadataUri: TOKEN_URI,
    openKitSha256: digest(canonicalBytes(input.openKit)),
    publicRevealSha256: proof.publicRevealSha256,
    manifestSha256: input.manifest.proof.sha256,
    envelopeSha256: input.envelope.proof.sha256,
    tokenMetadataSha256: input.tokenMetadata.proof.sha256,
    revealCommitment: independentCommitment(
      ENVELOPE_URI,
      SALT,
      OFFSET,
    ),
  });
  assert.equal(
    computeRavioliRevealCommitment(ENVELOPE_URI, SALT, OFFSET),
    independentCommitment(ENVELOPE_URI, SALT, OFFSET),
  );
  assert.match(proof.publicRevealSha256, /^[0-9a-f]{64}$/);
});

test("mode-1 verifier derives and cross-authenticates the current two-recipe supply", () => {
  const input = fixture({ maxSupply: 2, offset: 1 });
  const proof = verifyRavioliMode1PreOp10PrivateProof(input);
  assert.equal(proof.maxSupply, 2);
  assert.equal(proof.nonceCount, 2);
  assert.equal(proof.itemCount, 1);
  assert.equal(
    proof.revealCommitment,
    independentCommitment(ENVELOPE_URI, SALT, 1),
  );
});

test("mode-1 verifier fails closed on private, pin, metadata, and op10 mutations", () => {
  {
    const input = structuredClone(fixture());
    (input.openKit as any).recipes[0].nonce = "01".repeat(32);
    assert.throws(
      () => verifyRavioliMode1PreOp10PrivateProof(input),
      /decrypted public reveal drift/,
    );
  }
  {
    const input = structuredClone(fixture());
    (input.openKit as any).recipes[1].nonce =
      (input.openKit as any).recipes[0].nonce;
    assert.throws(
      () => verifyRavioliMode1PreOp10PrivateProof(input),
      /reuses a nonce/,
    );
  }
  {
    const input = structuredClone(fixture());
    (input.openKit as any).sealedReveal.salt = "34".repeat(32);
    assert.throws(
      () => verifyRavioliMode1PreOp10PrivateProof(input),
      /sealed reveal authentication failed/,
    );
  }
  {
    const input = structuredClone(fixture());
    const envelope = structuredClone(input.envelope.value) as any;
    const ciphertext = Buffer.from(envelope.ciphertext, "base64");
    ciphertext[0] ^= 1;
    envelope.ciphertext = ciphertext.toString("base64");
    refreshMaterial(input, "envelope", envelope);
    (input.openKit as any).sealedReveal.envelopeSha256 =
      input.envelope.proof.sha256;
    assert.throws(
      () => verifyRavioliMode1PreOp10PrivateProof(input),
      /sealed reveal authentication failed/,
    );
  }
  {
    const input = structuredClone(fixture());
    const envelope = structuredClone(input.envelope.value) as any;
    envelope.aad.tokenId = 2;
    refreshMaterial(input, "envelope", envelope);
    (input.openKit as any).sealedReveal.envelopeSha256 =
      input.envelope.proof.sha256;
    assert.throws(
      () => verifyRavioliMode1PreOp10PrivateProof(input),
      /envelope AAD drift/,
    );
  }
  {
    const input = structuredClone(fixture());
    (input.openKit as any).sealedReveal.envelopeSha256 = "00".repeat(32);
    assert.throws(
      () => verifyRavioliMode1PreOp10PrivateProof(input),
      /open-kit envelope hash drift/,
    );
  }
  {
    const input = structuredClone(fixture());
    const manifest = structuredClone(input.manifest.value) as any;
    manifest.maxSupply = 2;
    refreshMaterial(input, "manifest", manifest);
    assert.throws(
      () => verifyRavioliMode1PreOp10PrivateProof(input),
      /manifest supply drift/,
    );
  }
  {
    const input = structuredClone(fixture());
    const token = structuredClone(input.tokenMetadata.value) as any;
    token.ravioli.revealCommitment = "00".repeat(32);
    refreshMaterial(input, "tokenMetadata", token);
    assert.throws(
      () => verifyRavioliMode1PreOp10PrivateProof(input),
      /token reveal commitment drift/,
    );
  }
  {
    const input = structuredClone(fixture());
    (input.operationTen as any).call.payload.config.reveal_commitment =
      "00".repeat(32);
    assert.throws(
      () => verifyRavioliMode1PreOp10PrivateProof(input),
      /operation 10 reveal commitment drift/,
    );
  }
  {
    const input = structuredClone(fixture());
    (input.operationTen as any).call.contractAddress =
      "KT1P7qjWpPjsqJCUuzWW6qgf7JGfeNbb1jNK";
    assert.throws(
      () => verifyRavioliMode1PreOp10PrivateProof(input),
      /operation 10 target drift/,
    );
  }
  {
    const input = structuredClone(fixture());
    (input.envelope.proof as any).uri = TOKEN_URI;
    assert.throws(
      () => verifyRavioliMode1PreOp10PrivateProof(input),
      /proof CID drift/,
    );
  }
});
