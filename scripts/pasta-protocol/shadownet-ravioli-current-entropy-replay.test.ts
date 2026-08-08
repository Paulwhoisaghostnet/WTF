import assert from "node:assert/strict";
import { createCipheriv, createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { inspect } from "node:util";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { packDataBytes } from "@taquito/michel-codec";
import { blake2b } from "blakejs";
import { chromium } from "playwright";

import {
  assertRavioliCurrentEntropyReplayConsumed,
  installRavioliCurrentEntropyReplay,
  loadRavioliCurrentEntropyReplay,
  type RavioliCurrentEntropyReplay,
} from "./shadownet-ravioli-current-entropy-replay";
import type {
  RavioliCurrentResumePin,
  RavioliCurrentResumePlan,
} from "./shadownet-ravioli-current-resume";
import { deterministicJsonBytes } from "./shadownet-proof-kit";

const ROUTER = "KT1GVYrXn9dw4mYjcme3YVupFFev9SHtY2dq";
const MODE0_NONCE = "11".repeat(32);
const MODE1_NONCE_0 = "22".repeat(32);
const MODE1_NONCE_1 = "33".repeat(32);
const MODE1_SALT = "44".repeat(32);
const MODE1_OFFSET = 1;
const MODE1_IV = Buffer.from("55".repeat(12), "hex");
const STATE_KEY = "__pastaRavioliCurrentEntropyReplayV1";
const REVEAL_PACK_TYPE = {
  prim: "pair",
  args: [
    { prim: "bytes" },
    { prim: "pair", args: [{ prim: "nat" }, { prim: "bytes" }] },
  ],
} as const;

type Fixture = Readonly<{
  root: string;
  appRoot: string;
  plan: RavioliCurrentResumePlan;
  secrets: readonly string[];
}>;

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function revealCommitment(contentsUri: string, salt: string, offset: number): string {
  const packed = packDataBytes({
    prim: "Pair",
    args: [
      { bytes: Buffer.from(contentsUri, "utf8").toString("hex") },
      {
        prim: "Pair",
        args: [{ int: String(offset) }, { bytes: salt }],
      },
    ],
  } as any, REVEAL_PACK_TYPE as any).bytes;
  return Buffer.from(
    blake2b(Buffer.from(packed, "hex"), undefined, 32),
  ).toString("hex");
}

function publicRevealDocument(kit: Record<string, any>): Record<string, any> {
  const { sealedReveal: _sealedReveal, ...publicKit } = kit;
  return {
    schema: "pasta-ravioli-public-reveal@1",
    network: kit.network,
    contract: kit.contract,
    tokenId: kit.tokenId,
    mode: kit.mode,
    manifestUri: kit.manifestUri,
    maxSupply: kit.recipes.length,
    itemCount: kit.recipes[0].actions.length,
    openKit: publicKit,
  };
}

function pin(input: Readonly<{
  sequence: number;
  fileName: string;
  cid: string;
  value: unknown;
}>): RavioliCurrentResumePin {
  const bytes = deterministicJsonBytes(input.value);
  const sha256 = digest(bytes);
  return Object.freeze({
    kind: "pin" as const,
    actor: "creator" as const,
    eventIndex: input.sequence,
    pinSequence: input.sequence,
    action: "pin_json" as const,
    fingerprint: `pin_json:${input.fileName}:${sha256}:${bytes.byteLength}`,
    bytes,
    value: input.value,
    proof: Object.freeze({
      cid: input.cid,
      uri: `ipfs://${input.cid}`,
      fileName: input.fileName,
      mimeType: "application/json",
      byteLength: bytes.byteLength,
      sha256,
      localGatewayUrl: `http://127.0.0.1:8080/ipfs/${input.cid}`,
      publicGatewayUrl: `https://ipfs.io/ipfs/${input.cid}`,
      publicGatewayVerified: true,
      verificationAttempts: 1,
    }),
  });
}

function baseKit(input: Readonly<{
  tokenId: number;
  mode: "deterministic_vault" | "blind_funded_pool";
  manifestUri: string;
  nonces: readonly string[];
}>): Record<string, any> {
  return {
    schema: "pasta-ravioli-open-kit@3",
    network: "shadownet",
    contract: ROUTER,
    tokenId: input.tokenId,
    mode: input.mode,
    manifestUri: input.manifestUri,
    blindSecurity: input.tokenId === 0
      ? "public"
      : "commit-reveal-ui-hidden-chain-public",
    warning: "Synthetic retained material for an exact entropy-replay regression.",
    editionPolicy: {
      requiresLimitedWrapper: false,
      wrapperEditionClass: input.tokenId === 0 ? "fixed-supply" : "limited-edition",
      earliestChildEnd: null,
      wrapperSaleStart: null,
      wrapperSaleEnd: input.tokenId === 0 ? null : "9999-12-31T23:57:00Z",
      revealDeadline: input.tokenId === 0 ? null : "9999-12-31T23:58:00Z",
      openDeadline: input.tokenId === 0 ? null : "9999-12-31T23:59:00Z",
    },
    recipes: input.nonces.map((nonce, serial) => ({
      serial,
      nonce,
      actions: [{
        kind: "escrow",
        fa2: "KT1KGB1PRsJw58fgZPGRjoj4ZHNsFR7SuEzv",
        tokenId: serial,
        amount: 1,
      }],
    })),
  };
}

async function fixture(): Promise<Fixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), "ravioli-current-entropy-"));
  const appRoot = path.join(root, "ravioli");
  const openKitRoot = path.join(appRoot, "artifacts", "open-kits");
  await mkdir(openKitRoot, { recursive: true });

  const mode0ManifestCid = "bafymode0manifest";
  const mode1ManifestCid = "bafymode1manifest";
  const envelopeCid = "bafymode1envelope";
  const mode0Kit = baseKit({
    tokenId: 0,
    mode: "deterministic_vault",
    manifestUri: `ipfs://${mode0ManifestCid}`,
    nonces: [MODE0_NONCE],
  });
  const mode1PublicKit = baseKit({
    tokenId: 1,
    mode: "blind_funded_pool",
    manifestUri: `ipfs://${mode1ManifestCid}`,
    nonces: [MODE1_NONCE_0, MODE1_NONCE_1],
  });
  const aad = {
    schema: "pasta-ravioli-sealed-reveal@1",
    network: "shadownet",
    contract: ROUTER,
    tokenId: 1,
    manifestUri: mode1PublicKit.manifestUri,
  };
  const key = createHash("sha256")
    .update(Buffer.from("pasta-ravioli-sealed-reveal@1\0", "utf8"))
    .update(Buffer.from(MODE1_SALT, "hex"))
    .digest();
  const cipher = createCipheriv("aes-256-gcm", key, MODE1_IV);
  cipher.setAAD(Buffer.from(deterministicJsonBytes(aad)));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(deterministicJsonBytes(publicRevealDocument(mode1PublicKit)))),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const envelope = {
    schema: "pasta-ravioli-sealed-reveal@1",
    cipher: "AES-256-GCM",
    keyDerivation: "SHA-256(pasta-ravioli-sealed-reveal@1 || 0x00 || reveal-salt)",
    iv: MODE1_IV.toString("base64"),
    aad,
    ciphertext: ciphertext.toString("base64"),
  };
  const envelopePin = pin({
    sequence: 9,
    fileName: "ravioli-sealed-reveal-1.json",
    cid: envelopeCid,
    value: envelope,
  });
  const mode1Kit = {
    ...mode1PublicKit,
    sealedReveal: {
      schema: "pasta-ravioli-sealed-reveal-reference@1",
      contentsUri: envelopePin.proof.uri,
      salt: MODE1_SALT,
      offset: MODE1_OFFSET,
      envelopeSha256: envelopePin.proof.sha256,
    },
  };
  const mode1TokenPin = pin({
    sequence: 10,
    fileName: "token.json",
    cid: "bafymode1tokenmetadata",
    value: {
      name: "Synthetic blind funded pool",
      ravioli: {
        mode: "blind_funded_pool",
        manifestUri: mode1PublicKit.manifestUri,
        sealedContentsUri: envelopePin.proof.uri,
        revealCommitment: revealCommitment(
          envelopePin.proof.uri,
          MODE1_SALT,
          MODE1_OFFSET,
        ),
      },
    },
  });
  const mode0Bytes = Buffer.from(JSON.stringify(mode0Kit, null, 2), "utf8");
  const mode1Bytes = Buffer.from(JSON.stringify(mode1Kit, null, 2), "utf8");
  await writeFile(path.join(openKitRoot, "ravioli-open-kit-0.json"), mode0Bytes);
  await writeFile(path.join(openKitRoot, "ravioli-open-kit-1.json"), mode1Bytes);
  await writeFile(
    path.join(openKitRoot, "open-kit-capture-progress.json"),
    deterministicJsonBytes({
      schema: "pastaprotocol-ravioli-open-kit-capture-progress@1",
      status: "PARTIAL",
      disclosurePolicy: "Retain locally until the exact journal-bound reveal.",
      openKits: [
        {
          fileName: "ravioli-open-kit-0.json",
          ipfsPinned: false,
          mode: "deterministic_vault",
          path: "artifacts/open-kits/ravioli-open-kit-0.json",
          sha256: digest(mode0Bytes),
          tokenId: 0,
        },
        {
          fileName: "ravioli-open-kit-1.json",
          ipfsPinned: false,
          mode: "blind_funded_pool",
          path: "artifacts/open-kits/ravioli-open-kit-1.json",
          sha256: digest(mode1Bytes),
          tokenId: 1,
        },
      ],
    }),
  );

  const pins = Object.freeze([
    pin({
      sequence: 4,
      fileName: "ravioli-pack-manifest.json",
      cid: mode0ManifestCid,
      value: { schemaVersion: "wtfos.pasta.pack-manifest.v2", mode: "deterministic_vault" },
    }),
    pin({
      sequence: 5,
      fileName: "ravioli-public-reveal-0.json",
      cid: "bafymode0reveal",
      value: publicRevealDocument(mode0Kit),
    }),
    pin({
      sequence: 8,
      fileName: "ravioli-pack-manifest.json",
      cid: mode1ManifestCid,
      value: { schemaVersion: "wtfos.pasta.pack-manifest.v2", mode: "blind_funded_pool" },
    }),
    envelopePin,
    mode1TokenPin,
  ]);
  const plan = Object.freeze({
    schema: "pastaprotocol-ravioli-current-resume-plan@1" as const,
    classification: "CURRENT_SAFE_PREFIX" as const,
    journalRoot: path.join(appRoot, "artifacts", "journal"),
    journalId: "synthetic-current-journal",
    intentSha256: "aa".repeat(32),
    completedOperationCount: 9,
    nextOperation: null,
    uiStage: Object.freeze({
      partition: "mode-1-blind-funded-pool",
      actor: "creator",
      action: "create_pack",
      tokenId: 1,
    }),
    actorSequences: Object.freeze({
      creator: Object.freeze({ applied: 9, nextOperationSequence: 10, counterOffset: 0 }),
      collector1: Object.freeze({ applied: 0, nextOperationSequence: 1, counterOffset: 0 }),
      collector2: Object.freeze({ applied: 0, nextOperationSequence: 1, counterOffset: 0 }),
    }),
    targetBindings: Object.freeze({ router: ROUTER }),
    pins,
    operations: Object.freeze([]),
    writeReceipts: Object.freeze([]),
    privateRecovery: null,
  }) as unknown as RavioliCurrentResumePlan;
  return Object.freeze({
    root,
    appRoot,
    plan,
    secrets: Object.freeze([
      MODE0_NONCE,
      MODE1_NONCE_0,
      MODE1_NONCE_1,
      MODE1_SALT,
      MODE1_IV.toString("hex"),
      MODE1_IV.toString("base64"),
    ]),
  });
}

async function loadedFixture(): Promise<Fixture & { replay: RavioliCurrentEntropyReplay }> {
  const value = await fixture();
  const replay = await loadRavioliCurrentEntropyReplay({
    appRoot: value.appRoot,
    plan: value.plan,
  });
  return Object.freeze({ ...value, replay });
}

test("loader authenticates both retained modes while keeping every secret outside public evidence", async () => {
  const value = await loadedFixture();
  try {
    assert.equal(value.replay.modes["0"].targetDrawCount, 1);
    assert.equal(value.replay.modes["1"].targetDrawCount, 5);
    assert.equal(value.replay.modes["0"].nativeDraftDrawCount, 1);
    assert.equal(value.replay.modes["1"].nativeDraftDrawCount, 1);
    const enumerable = JSON.stringify({ ...value.replay });
    const diagnostic = inspect(value.replay, { depth: null, showHidden: true });
    for (const secret of value.secrets) {
      assert.doesNotMatch(enumerable, new RegExp(secret));
      assert.doesNotMatch(diagnostic, new RegExp(secret));
    }
    assert.deepEqual(Object.getOwnPropertySymbols(value.replay), []);
    // A public spread is harmless because it loses the WeakMap capability.
    const clone = { ...value.replay } as RavioliCurrentEntropyReplay;
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await assert.rejects(
        installRavioliCurrentEntropyReplay(page, clone, 0),
        /not produced by the authenticated loader/,
      );
    } finally {
      await browser.close();
    }
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("mode 0 and mode 1 consume exact draws, delegate one native draft id, and restore cleanly", async () => {
  const value = await loadedFixture();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto("about:blank");
    await installRavioliCurrentEntropyReplay(page, value.replay, 0);
    const mode0 = await page.evaluate(({ stateKey, expectedNonce }) => {
      const draft = crypto.getRandomValues(new Uint8Array(16));
      const nonce = crypto.getRandomValues(new Uint8Array(32));
      const nonceHex = [...nonce]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      const state = (window as any)[stateKey];
      return {
        draftByteLength: draft.byteLength,
        nonceMatches: nonceHex === expectedNonce,
        stateEnumerable: Object.keys(window).includes(stateKey),
        overrideEnumerable: Object.keys(crypto).includes("getRandomValues"),
        publicState: JSON.stringify(state),
      };
    }, { stateKey: STATE_KEY, expectedNonce: MODE0_NONCE });
    assert.equal(mode0.draftByteLength, 16);
    assert.equal(mode0.nonceMatches, true);
    assert.equal(mode0.stateEnumerable, false);
    assert.equal(mode0.overrideEnumerable, false);
    for (const secret of value.secrets) assert.doesNotMatch(mode0.publicState, new RegExp(secret));
    await assertRavioliCurrentEntropyReplayConsumed(page, 0);
    assert.deepEqual(await page.evaluate(({ stateKey }) => ({
      state: Object.prototype.hasOwnProperty.call(window, stateKey),
      override: Object.prototype.hasOwnProperty.call(crypto, "getRandomValues"),
    }), { stateKey: STATE_KEY }), { state: false, override: false });

    await installRavioliCurrentEntropyReplay(page, value.replay, 1);
    const mode1 = await page.evaluate(({
      stateKey,
      expectedOffset,
      expectedNonce0,
      expectedNonce1,
      expectedSalt,
      expectedIv,
    }) => {
      const draft = crypto.getRandomValues(new Uint8Array(16));
      const nonce0 = crypto.getRandomValues(new Uint8Array(32));
      const nonce1 = crypto.getRandomValues(new Uint8Array(32));
      const salt = crypto.getRandomValues(new Uint8Array(32));
      const offset = crypto.getRandomValues(new Uint32Array(1));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const state = (window as any)[stateKey];
      return {
        draftByteLength: draft.byteLength,
        nonce0Matches: [...nonce0].map((byte) => byte.toString(16).padStart(2, "0")).join("") === expectedNonce0,
        nonce1Matches: [...nonce1].map((byte) => byte.toString(16).padStart(2, "0")).join("") === expectedNonce1,
        saltMatches: [...salt].map((byte) => byte.toString(16).padStart(2, "0")).join("") === expectedSalt,
        ivMatches: [...iv].map((byte) => byte.toString(16).padStart(2, "0")).join("") === expectedIv,
        offsetMatches: offset[0] === expectedOffset,
        stateEnumerable: Object.keys(window).includes(stateKey),
        overrideEnumerable: Object.keys(crypto).includes("getRandomValues"),
        publicState: JSON.stringify(state),
      };
    }, {
      stateKey: STATE_KEY,
      expectedOffset: MODE1_OFFSET,
      expectedNonce0: MODE1_NONCE_0,
      expectedNonce1: MODE1_NONCE_1,
      expectedSalt: MODE1_SALT,
      expectedIv: MODE1_IV.toString("hex"),
    });
    assert.equal(mode1.draftByteLength, 16);
    assert.equal(mode1.nonce0Matches, true);
    assert.equal(mode1.nonce1Matches, true);
    assert.equal(mode1.saltMatches, true);
    assert.equal(mode1.ivMatches, true);
    assert.equal(mode1.offsetMatches, true);
    assert.equal(mode1.stateEnumerable, false);
    assert.equal(mode1.overrideEnumerable, false);
    for (const secret of value.secrets) assert.doesNotMatch(mode1.publicState, new RegExp(secret));
    await assertRavioliCurrentEntropyReplayConsumed(page, 1);
    assert.deepEqual(await page.evaluate(({ stateKey }) => ({
      state: Object.prototype.hasOwnProperty.call(window, stateKey),
      override: Object.prototype.hasOwnProperty.call(crypto, "getRandomValues"),
    }), { stateKey: STATE_KEY }), { state: false, override: false });
  } finally {
    await browser.close();
    await rm(value.root, { recursive: true, force: true });
  }
});

test("target-sized draws fail closed when out of order, wrong-shaped, or extra", async () => {
  const value = await loadedFixture();
  const browser = await chromium.launch({ headless: true });
  try {
    const wrongOrder = await browser.newPage();
    await wrongOrder.goto("about:blank");
    await installRavioliCurrentEntropyReplay(wrongOrder, value.replay, 0);
    assert.match(await wrongOrder.evaluate(() => {
      try {
        crypto.getRandomValues(new Uint8Array(32));
        return "accepted";
      } catch (error) {
        return String((error as Error).message);
      }
    }), /expected-native-draft-id/);
    await assert.rejects(
      assertRavioliCurrentEntropyReplayConsumed(wrongOrder, 0),
      /violated expected-native-draft-id/,
    );

    const wrongShape = await browser.newPage();
    await wrongShape.goto("about:blank");
    await installRavioliCurrentEntropyReplay(wrongShape, value.replay, 1);
    assert.match(await wrongShape.evaluate(() => {
      crypto.getRandomValues(new Uint8Array(16));
      crypto.getRandomValues(new Uint8Array(32));
      crypto.getRandomValues(new Uint8Array(32));
      crypto.getRandomValues(new Uint8Array(32));
      try {
        crypto.getRandomValues(new Uint8Array(4));
        return "accepted";
      } catch (error) {
        return String((error as Error).message);
      }
    }), /bounded-offset-draw-shape/);
    await assert.rejects(
      assertRavioliCurrentEntropyReplayConsumed(wrongShape, 1),
      /violated bounded-offset-draw-shape/,
    );

    const extra = await browser.newPage();
    await extra.goto("about:blank");
    await installRavioliCurrentEntropyReplay(extra, value.replay, 0);
    assert.match(await extra.evaluate(() => {
      crypto.getRandomValues(new Uint8Array(16));
      crypto.getRandomValues(new Uint8Array(32));
      try {
        crypto.getRandomValues(new Uint8Array(32));
        return "accepted";
      } catch (error) {
        return String((error as Error).message);
      }
    }), /extra-target-draw/);
    await assert.rejects(
      assertRavioliCurrentEntropyReplayConsumed(extra, 0),
      /violated extra-target-draw/,
    );
  } finally {
    await browser.close();
    await rm(value.root, { recursive: true, force: true });
  }
});

test("loader rejects retained-kit and authenticated-pin byte drift before browser installation", async () => {
  const value = await fixture();
  try {
    const kitPath = path.join(
      value.appRoot,
      "artifacts",
      "open-kits",
      "ravioli-open-kit-0.json",
    );
    await writeFile(kitPath, Buffer.from("{}", "utf8"));
    await assert.rejects(
      loadRavioliCurrentEntropyReplay({ appRoot: value.appRoot, plan: value.plan }),
      /retained open-kit bytes drift/,
    );
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }

  const offsetValue = await fixture();
  try {
    const openKitRoot = path.join(offsetValue.appRoot, "artifacts", "open-kits");
    const kitPath = path.join(openKitRoot, "ravioli-open-kit-1.json");
    const kit = JSON.parse(await readFile(kitPath, "utf8"));
    kit.sealedReveal.offset = 0;
    const kitBytes = Buffer.from(JSON.stringify(kit, null, 2), "utf8");
    await writeFile(kitPath, kitBytes);
    const progressPath = path.join(openKitRoot, "open-kit-capture-progress.json");
    const progress = JSON.parse(await readFile(progressPath, "utf8"));
    progress.openKits.find((entry: any) => entry.tokenId === 1).sha256 = digest(kitBytes);
    await writeFile(progressPath, deterministicJsonBytes(progress));
    await assert.rejects(
      loadRavioliCurrentEntropyReplay({
        appRoot: offsetValue.appRoot,
        plan: offsetValue.plan,
      }),
      /retained reveal offset differs from its journal commitment/,
    );
  } finally {
    await rm(offsetValue.root, { recursive: true, force: true });
  }

  const pinValue = await fixture();
  try {
    const pins = [...pinValue.plan.pins];
    const envelopeIndex = pins.findIndex((entry) =>
      entry.proof.fileName === "ravioli-sealed-reveal-1.json");
    const envelope = pins[envelopeIndex]!;
    const bytes = Uint8Array.from(envelope.bytes);
    bytes[bytes.byteLength - 1] ^= 1;
    pins[envelopeIndex] = Object.freeze({ ...envelope, bytes });
    const plan = Object.freeze({ ...pinValue.plan, pins: Object.freeze(pins) });
    await assert.rejects(
      loadRavioliCurrentEntropyReplay({ appRoot: pinValue.appRoot, plan }),
      /byte proof drift/,
    );
  } finally {
    await rm(pinValue.root, { recursive: true, force: true });
  }
});
