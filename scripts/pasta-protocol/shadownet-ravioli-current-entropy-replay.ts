import { createDecipheriv, createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

import { packDataBytes } from "@taquito/michel-codec";
import { blake2b } from "blakejs";
import type { Page } from "playwright";

import { deterministicJsonBytes } from "./shadownet-proof-kit";
import type {
  RavioliCurrentResumePin,
  RavioliCurrentResumePlan,
} from "./shadownet-ravioli-current-resume";

const HASH_RE = /^[0-9a-f]{64}$/;
const KT1_RE = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;
const IPFS_URI_RE = /^ipfs:\/\/[A-Za-z0-9]+$/;
const OPEN_KIT_SCHEMA = "pasta-ravioli-open-kit@3";
const PUBLIC_REVEAL_SCHEMA = "pasta-ravioli-public-reveal@1";
const SEALED_REVEAL_SCHEMA = "pasta-ravioli-sealed-reveal@1";
const SEALED_REVEAL_REFERENCE_SCHEMA =
  "pasta-ravioli-sealed-reveal-reference@1";
const SEALED_REVEAL_CIPHER = "AES-256-GCM";
const SEALED_REVEAL_KDF =
  "SHA-256(pasta-ravioli-sealed-reveal@1 || 0x00 || reveal-salt)";
const CAPTURE_PROGRESS_SCHEMA =
  "pastaprotocol-ravioli-open-kit-capture-progress@1";
const BROWSER_STATE_KEY = "__pastaRavioliCurrentEntropyReplayV1";
const RAVIOLI_REVEAL_PACK_TYPE = {
  prim: "pair",
  args: [
    { prim: "bytes" },
    { prim: "pair", args: [{ prim: "nat" }, { prim: "bytes" }] },
  ],
} as const;

type JsonRecord = Record<string, any>;

export type RavioliCurrentEntropyReplayMode = 0 | 1;

export type RavioliCurrentEntropyReplay = Readonly<{
  schema: "pastaprotocol-ravioli-current-entropy-replay@1";
  journalId: string;
  intentSha256: string;
  routerAddress: string;
  modes: Readonly<Record<"0" | "1", Readonly<{
    mode: RavioliCurrentEntropyReplayMode;
    modeName: "deterministic_vault" | "blind_funded_pool";
    tokenId: number;
    recipeCount: number;
    targetDrawCount: number;
    nativeDraftDrawCount: 1;
    openKitSha256: string;
    sourcePinSequence: number;
    sourcePinSha256: string;
    replayPlanSha256: string;
  }>>>;
}>;

type PrivateDraw =
  | Readonly<{
      kind: "bytes";
      role: "recipe-nonce" | "reveal-salt" | "aes-gcm-iv";
      bytes: Uint8Array;
    }>
  | Readonly<{
      kind: "bounded-offset";
      role: "reveal-offset";
      value: number;
      bound: number;
    }>;

type PrivateModeReplay = Readonly<{
  mode: RavioliCurrentEntropyReplayMode;
  replayPlanSha256: string;
  draws: readonly PrivateDraw[];
}>;

type PrivateReplay = Readonly<{
  modes: Readonly<Record<"0" | "1", PrivateModeReplay>>;
}>;

const PRIVATE_REPLAYS = new WeakMap<RavioliCurrentEntropyReplay, PrivateReplay>();

function fail(message: string): never {
  throw new Error(`Ravioli current entropy replay: ${message}`);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function exactKeys(value: JsonRecord, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} fields drift`);
  }
}

function exactJson(actual: unknown, expected: unknown, label: string): void {
  if (
    !Buffer.from(deterministicJsonBytes(actual)).equals(
      Buffer.from(deterministicJsonBytes(expected)),
    )
  ) {
    fail(`${label} drift`);
  }
}

function requiredHash(value: unknown, label: string): string {
  if (typeof value !== "string" || !HASH_RE.test(value)) {
    fail(`${label} must be a lowercase SHA-256 value`);
  }
  return value;
}

function requiredNat(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    fail(`${label} must be a natural number`);
  }
  return Number(value);
}

function requiredIpfsUri(value: unknown, label: string): string {
  if (typeof value !== "string" || !IPFS_URI_RE.test(value)) {
    fail(`${label} must be an IPFS URI`);
  }
  return value;
}

function parseJsonBytes(bytes: Uint8Array, label: string): JsonRecord {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    fail(`${label} must be UTF-8 JSON`);
  }
  return record(value, label);
}

function parseCanonicalJsonBytes(bytes: Uint8Array, label: string): JsonRecord {
  const value = parseJsonBytes(bytes, label);
  if (
    !Buffer.from(bytes).equals(Buffer.from(deterministicJsonBytes(value)))
  ) {
    fail(`${label} must use canonical JSON bytes`);
  }
  return value;
}

function canonicalBase64(value: unknown, label: string): Uint8Array {
  if (
    typeof value !== "string"
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    fail(`${label} must be canonical base64`);
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) fail(`${label} must be canonical base64`);
  return bytes;
}

function publicRevealDocument(kit: JsonRecord): JsonRecord {
  const { sealedReveal: _sealedReveal, ...publicKit } = kit;
  const recipes = Array.isArray(kit.recipes) ? kit.recipes : [];
  const firstRecipe = recipes[0] && typeof recipes[0] === "object"
    ? recipes[0] as JsonRecord
    : {};
  return {
    schema: PUBLIC_REVEAL_SCHEMA,
    network: kit.network,
    contract: kit.contract,
    tokenId: kit.tokenId,
    mode: kit.mode,
    manifestUri: kit.manifestUri,
    maxSupply: recipes.length,
    itemCount: Array.isArray(firstRecipe.actions) ? firstRecipe.actions.length : 0,
    openKit: publicKit,
  };
}

function authenticatePin(pin: RavioliCurrentResumePin, label: string): void {
  if (pin.action !== "pin_json" || pin.proof.mimeType !== "application/json") {
    fail(`${label} is not an authenticated JSON pin`);
  }
  if (
    pin.proof.byteLength !== pin.bytes.byteLength
    || pin.proof.sha256 !== sha256(pin.bytes)
    || pin.proof.uri !== `ipfs://${pin.proof.cid}`
  ) {
    fail(`${label} byte proof drift`);
  }
  parseCanonicalJsonBytes(pin.bytes, label);
}

function onePin(
  plan: RavioliCurrentResumePlan,
  predicate: (pin: RavioliCurrentResumePin) => boolean,
  label: string,
): RavioliCurrentResumePin {
  const matches = plan.pins.filter(predicate);
  if (matches.length !== 1) fail(`${label} must match exactly one journal pin`);
  const pin = matches[0]!;
  authenticatePin(pin, label);
  return pin;
}

function validateKit(
  value: JsonRecord,
  input: Readonly<{
    mode: RavioliCurrentEntropyReplayMode;
    routerAddress: string;
  }>,
): Readonly<{
  tokenId: number;
  modeName: "deterministic_vault" | "blind_funded_pool";
  manifestUri: string;
  nonces: readonly Uint8Array[];
}> {
  const hasSealedReveal = Object.prototype.hasOwnProperty.call(value, "sealedReveal");
  exactKeys(value, [
    "schema",
    "network",
    "contract",
    "tokenId",
    "mode",
    "manifestUri",
    "blindSecurity",
    "warning",
    "editionPolicy",
    "recipes",
    ...(hasSealedReveal ? ["sealedReveal"] : []),
  ], `mode ${input.mode} open kit`);
  if (value.schema !== OPEN_KIT_SCHEMA || value.network !== "shadownet") {
    fail(`mode ${input.mode} open-kit identity drift`);
  }
  if (value.contract !== input.routerAddress) {
    fail(`mode ${input.mode} open-kit router drift`);
  }
  const tokenId = requiredNat(value.tokenId, `mode ${input.mode} token id`);
  if (tokenId !== input.mode) fail(`mode ${input.mode} token id drift`);
  const modeName = input.mode === 0 ? "deterministic_vault" : "blind_funded_pool";
  if (value.mode !== modeName) fail(`mode ${input.mode} name drift`);
  if (
    value.blindSecurity !== (input.mode === 0
      ? "public"
      : "commit-reveal-ui-hidden-chain-public")
  ) {
    fail(`mode ${input.mode} disclosure policy drift`);
  }
  if (typeof value.warning !== "string" || !value.warning || value.warning.length > 512) {
    fail(`mode ${input.mode} warning is invalid`);
  }
  record(value.editionPolicy, `mode ${input.mode} edition policy`);
  const manifestUri = requiredIpfsUri(value.manifestUri, `mode ${input.mode} manifest URI`);
  if (!Array.isArray(value.recipes) || value.recipes.length < 1 || value.recipes.length > 64) {
    fail(`mode ${input.mode} recipe count is invalid`);
  }
  const seen = new Set<string>();
  const nonces = value.recipes.map((entry: unknown, index: number) => {
    const recipe = record(entry, `mode ${input.mode} recipe ${index}`);
    exactKeys(recipe, ["serial", "nonce", "actions"], `mode ${input.mode} recipe ${index}`);
    if (requiredNat(recipe.serial, `mode ${input.mode} recipe ${index} serial`) !== index) {
      fail(`mode ${input.mode} recipe order drift`);
    }
    const nonce = requiredHash(recipe.nonce, `mode ${input.mode} recipe ${index} nonce`);
    if (seen.has(nonce)) fail(`mode ${input.mode} recipe ${index} reuses a nonce`);
    seen.add(nonce);
    if (!Array.isArray(recipe.actions) || recipe.actions.length < 1) {
      fail(`mode ${input.mode} recipe ${index} actions are invalid`);
    }
    return Uint8Array.from(Buffer.from(nonce, "hex"));
  });
  if (input.mode === 0 && (hasSealedReveal || value.recipes.length !== 1)) {
    fail("mode 0 must contain one public deterministic recipe");
  }
  if (input.mode === 1 && !hasSealedReveal) {
    fail("mode 1 must contain a sealed reveal reference");
  }
  return Object.freeze({
    tokenId,
    modeName,
    manifestUri,
    nonces: Object.freeze(nonces),
  });
}

function decryptModeOneEnvelope(input: Readonly<{
  kit: JsonRecord;
  envelopePin: RavioliCurrentResumePin;
  routerAddress: string;
}>): Readonly<{
  salt: Uint8Array;
  offset: number;
  iv: Uint8Array;
}> {
  const sealed = record(input.kit.sealedReveal, "mode 1 sealed reveal reference");
  exactKeys(
    sealed,
    ["schema", "contentsUri", "salt", "offset", "envelopeSha256"],
    "mode 1 sealed reveal reference",
  );
  if (sealed.schema !== SEALED_REVEAL_REFERENCE_SCHEMA) {
    fail("mode 1 sealed reveal reference schema drift");
  }
  if (requiredIpfsUri(sealed.contentsUri, "mode 1 sealed reveal URI") !== input.envelopePin.proof.uri) {
    fail("mode 1 sealed reveal URI differs from its journal pin");
  }
  if (
    requiredHash(sealed.envelopeSha256, "mode 1 sealed reveal digest")
    !== input.envelopePin.proof.sha256
  ) {
    fail("mode 1 sealed reveal digest differs from its journal pin");
  }
  const salt = Uint8Array.from(Buffer.from(
    requiredHash(sealed.salt, "mode 1 reveal salt"),
    "hex",
  ));
  const recipes = input.kit.recipes as unknown[];
  const offset = requiredNat(sealed.offset, "mode 1 reveal offset");
  if (offset >= recipes.length) fail("mode 1 reveal offset is outside its supply");

  const envelope = parseCanonicalJsonBytes(input.envelopePin.bytes, "mode 1 sealed envelope");
  exactKeys(
    envelope,
    ["schema", "cipher", "keyDerivation", "iv", "aad", "ciphertext"],
    "mode 1 sealed envelope",
  );
  if (
    envelope.schema !== SEALED_REVEAL_SCHEMA
    || envelope.cipher !== SEALED_REVEAL_CIPHER
    || envelope.keyDerivation !== SEALED_REVEAL_KDF
  ) {
    fail("mode 1 sealed envelope policy drift");
  }
  const aad = record(envelope.aad, "mode 1 sealed envelope AAD");
  exactKeys(
    aad,
    ["schema", "network", "contract", "tokenId", "manifestUri"],
    "mode 1 sealed envelope AAD",
  );
  exactJson(aad, {
    schema: SEALED_REVEAL_SCHEMA,
    network: "shadownet",
    contract: input.routerAddress,
    tokenId: input.kit.tokenId,
    manifestUri: input.kit.manifestUri,
  }, "mode 1 sealed envelope AAD");
  const iv = canonicalBase64(envelope.iv, "mode 1 sealed envelope IV");
  if (iv.byteLength !== 12) fail("mode 1 sealed envelope IV must be 12 bytes");
  const ciphertextAndTag = canonicalBase64(
    envelope.ciphertext,
    "mode 1 sealed envelope ciphertext",
  );
  if (ciphertextAndTag.byteLength <= 16) {
    fail("mode 1 sealed envelope ciphertext is too short");
  }
  const key = createHash("sha256")
    .update(Buffer.from(`${SEALED_REVEAL_SCHEMA}\0`, "utf8"))
    .update(salt)
    .digest();
  const ciphertext = ciphertextAndTag.subarray(0, -16);
  const tag = ciphertextAndTag.subarray(-16);
  let plaintext: Uint8Array;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(deterministicJsonBytes(aad)));
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    fail("mode 1 sealed envelope authentication failed");
  }
  const revealed = parseCanonicalJsonBytes(plaintext, "mode 1 decrypted public reveal");
  exactJson(revealed, publicRevealDocument(input.kit), "mode 1 decrypted public reveal");
  return Object.freeze({
    salt,
    offset,
    iv: Uint8Array.from(iv),
  });
}

function revealCommitment(contentsUri: string, salt: Uint8Array, offset: number): string {
  const packed = packDataBytes(
    {
      prim: "Pair",
      args: [
        { bytes: Buffer.from(contentsUri, "utf8").toString("hex") },
        {
          prim: "Pair",
          args: [
            { int: String(offset) },
            { bytes: Buffer.from(salt).toString("hex") },
          ],
        },
      ],
    } as any,
    RAVIOLI_REVEAL_PACK_TYPE as any,
  ).bytes;
  return Buffer.from(
    blake2b(Buffer.from(packed, "hex"), undefined, 32),
  ).toString("hex");
}

function authenticateModeOneTokenMetadata(input: Readonly<{
  plan: RavioliCurrentResumePlan;
  kit: JsonRecord;
  envelopePin: RavioliCurrentResumePin;
  salt: Uint8Array;
  offset: number;
}>): RavioliCurrentResumePin {
  const matches: RavioliCurrentResumePin[] = [];
  for (const pin of input.plan.pins.filter((candidate) =>
    candidate.proof.fileName === "token.json")) {
    authenticatePin(pin, "mode 1 token metadata candidate");
    const metadata = parseCanonicalJsonBytes(pin.bytes, "mode 1 token metadata candidate");
    const ravioli = metadata.ravioli;
    if (!ravioli || typeof ravioli !== "object" || Array.isArray(ravioli)) continue;
    if (
      ravioli.mode === "blind_funded_pool"
      && ravioli.manifestUri === input.kit.manifestUri
      && ravioli.sealedContentsUri === input.envelopePin.proof.uri
    ) {
      matches.push(pin);
    }
  }
  if (matches.length !== 1) {
    fail("mode 1 token metadata must match exactly one journal pin");
  }
  const pin = matches[0]!;
  const metadata = parseCanonicalJsonBytes(pin.bytes, "mode 1 token metadata");
  const ravioli = record(metadata.ravioli, "mode 1 token metadata Ravioli policy");
  const observed = requiredHash(
    ravioli.revealCommitment,
    "mode 1 token metadata reveal commitment",
  );
  const expected = revealCommitment(
    input.envelopePin.proof.uri,
    input.salt,
    input.offset,
  );
  if (observed !== expected) {
    fail("mode 1 retained reveal offset differs from its journal commitment");
  }
  return pin;
}

async function regularFileBytes(filePath: string, label: string): Promise<Uint8Array> {
  const info = await lstat(filePath);
  if (!info.isFile() || info.isSymbolicLink()) fail(`${label} must be a regular file`);
  return readFile(filePath);
}

function publicModeEvidence(input: Readonly<{
  mode: RavioliCurrentEntropyReplayMode;
  modeName: "deterministic_vault" | "blind_funded_pool";
  tokenId: number;
  recipeCount: number;
  openKitSha256: string;
  sourcePin: RavioliCurrentResumePin;
  replayPlanSha256: string;
  targetDrawCount: number;
}>): RavioliCurrentEntropyReplay["modes"]["0"] {
  return Object.freeze({
    mode: input.mode,
    modeName: input.modeName,
    tokenId: input.tokenId,
    recipeCount: input.recipeCount,
    targetDrawCount: input.targetDrawCount,
    nativeDraftDrawCount: 1 as const,
    openKitSha256: input.openKitSha256,
    sourcePinSequence: input.sourcePin.pinSequence,
    sourcePinSha256: input.sourcePin.proof.sha256,
    replayPlanSha256: input.replayPlanSha256,
  });
}

/**
 * Authenticates the retained mode-0/mode-1 open kits against the already
 * authenticated journal pin bytes in a current-generation resume plan.
 * Secret draw material is retained only in a module-private WeakMap.
 */
export async function loadRavioliCurrentEntropyReplay(input: Readonly<{
  appRoot: string;
  plan: RavioliCurrentResumePlan;
}>): Promise<RavioliCurrentEntropyReplay> {
  if (!path.isAbsolute(input.appRoot)) fail("app root must be absolute");
  if (
    input.plan.schema !== "pastaprotocol-ravioli-current-resume-plan@1"
    || !HASH_RE.test(input.plan.intentSha256)
    || typeof input.plan.journalId !== "string"
    || !input.plan.journalId
  ) {
    fail("resume plan identity is invalid");
  }
  const routerAddress = input.plan.targetBindings.router;
  if (typeof routerAddress !== "string" || !KT1_RE.test(routerAddress)) {
    fail("resume plan has no authenticated router binding");
  }
  const openKitRoot = path.join(input.appRoot, "artifacts", "open-kits");
  const progressPath = path.join(openKitRoot, "open-kit-capture-progress.json");
  const progressBytes = await regularFileBytes(progressPath, "open-kit capture progress");
  const progress = parseCanonicalJsonBytes(progressBytes, "open-kit capture progress");
  exactKeys(
    progress,
    ["schema", "status", "disclosurePolicy", "openKits"],
    "open-kit capture progress",
  );
  if (
    progress.schema !== CAPTURE_PROGRESS_SCHEMA
    || !["PARTIAL", "COMPLETE"].includes(String(progress.status))
    || typeof progress.disclosurePolicy !== "string"
    || !progress.disclosurePolicy
    || !Array.isArray(progress.openKits)
  ) {
    fail("open-kit capture progress identity is invalid");
  }

  const privateModes = {} as Record<"0" | "1", PrivateModeReplay>;
  const publicModes = {} as Record<"0" | "1", RavioliCurrentEntropyReplay["modes"]["0"]>;
  for (const mode of [0, 1] as const) {
    const modeName = mode === 0 ? "deterministic_vault" : "blind_funded_pool";
    const fileName = `ravioli-open-kit-${mode}.json`;
    const relativePath = `artifacts/open-kits/${fileName}`;
    const entries = progress.openKits.filter((entry: unknown) => {
      const candidate = record(entry, "open-kit capture entry");
      return candidate.tokenId === mode || candidate.mode === modeName;
    });
    if (entries.length !== 1) fail(`mode ${mode} capture entry must be unique`);
    const entry = record(entries[0], `mode ${mode} capture entry`);
    exactKeys(
      entry,
      ["fileName", "ipfsPinned", "mode", "path", "sha256", "tokenId"],
      `mode ${mode} capture entry`,
    );
    if (
      entry.fileName !== fileName
      || entry.path !== relativePath
      || entry.mode !== modeName
      || entry.tokenId !== mode
      || entry.ipfsPinned !== false
    ) {
      fail(`mode ${mode} capture entry drift`);
    }
    const expectedOpenKitSha256 = requiredHash(
      entry.sha256,
      `mode ${mode} captured open-kit digest`,
    );
    const openKitBytes = await regularFileBytes(
      path.join(openKitRoot, fileName),
      `mode ${mode} open kit`,
    );
    if (sha256(openKitBytes) !== expectedOpenKitSha256) {
      fail(`mode ${mode} retained open-kit bytes drift`);
    }
    const kit = parseJsonBytes(openKitBytes, `mode ${mode} open kit`);
    const validated = validateKit(kit, { mode, routerAddress });
    const manifestPin = onePin(
      input.plan,
      (pin) => pin.proof.fileName === "ravioli-pack-manifest.json"
        && pin.proof.uri === validated.manifestUri,
      `mode ${mode} manifest`,
    );
    void manifestPin;

    const draws: PrivateDraw[] = validated.nonces.map((bytes) => Object.freeze({
      kind: "bytes" as const,
      role: "recipe-nonce" as const,
      bytes: Uint8Array.from(bytes),
    }));
    let sourcePin: RavioliCurrentResumePin;
    let bindingPin: RavioliCurrentResumePin;
    if (mode === 0) {
      sourcePin = onePin(
        input.plan,
        (pin) => pin.proof.fileName === `ravioli-public-reveal-${validated.tokenId}.json`,
        "mode 0 public reveal",
      );
      exactJson(
        parseCanonicalJsonBytes(sourcePin.bytes, "mode 0 public reveal"),
        publicRevealDocument(kit),
        "mode 0 retained open kit/public reveal",
      );
      bindingPin = sourcePin;
    } else {
      const sealed = record(kit.sealedReveal, "mode 1 sealed reveal reference");
      sourcePin = onePin(
        input.plan,
        (pin) => pin.proof.fileName === `ravioli-sealed-reveal-${validated.tokenId}.json`
          && pin.proof.uri === sealed.contentsUri,
        "mode 1 sealed envelope",
      );
      const recovered = decryptModeOneEnvelope({
        kit,
        envelopePin: sourcePin,
        routerAddress,
      });
      bindingPin = authenticateModeOneTokenMetadata({
        plan: input.plan,
        kit,
        envelopePin: sourcePin,
        salt: recovered.salt,
        offset: recovered.offset,
      });
      draws.push(
        Object.freeze({
          kind: "bytes" as const,
          role: "reveal-salt" as const,
          bytes: Uint8Array.from(recovered.salt),
        }),
        Object.freeze({
          kind: "bounded-offset" as const,
          role: "reveal-offset" as const,
          value: recovered.offset,
          bound: validated.nonces.length,
        }),
        Object.freeze({
          kind: "bytes" as const,
          role: "aes-gcm-iv" as const,
          bytes: Uint8Array.from(recovered.iv),
        }),
      );
    }
    const replayPlanSha256 = sha256(deterministicJsonBytes({
      journalId: input.plan.journalId,
      intentSha256: input.plan.intentSha256,
      mode,
      tokenId: validated.tokenId,
      openKitSha256: expectedOpenKitSha256,
      sourcePinSequence: sourcePin.pinSequence,
      sourcePinSha256: sourcePin.proof.sha256,
      bindingPinSequence: bindingPin.pinSequence,
      bindingPinSha256: bindingPin.proof.sha256,
      targetDrawCount: draws.length,
    }));
    privateModes[String(mode) as "0" | "1"] = Object.freeze({
      mode,
      replayPlanSha256,
      draws: Object.freeze(draws),
    });
    publicModes[String(mode) as "0" | "1"] = publicModeEvidence({
      mode,
      modeName: validated.modeName,
      tokenId: validated.tokenId,
      recipeCount: validated.nonces.length,
      openKitSha256: expectedOpenKitSha256,
      sourcePin,
      replayPlanSha256,
      targetDrawCount: draws.length,
    });
  }

  const replay = Object.freeze({
    schema: "pastaprotocol-ravioli-current-entropy-replay@1" as const,
    journalId: input.plan.journalId,
    intentSha256: input.plan.intentSha256,
    routerAddress,
    modes: Object.freeze(publicModes),
  });
  PRIVATE_REPLAYS.set(replay, Object.freeze({ modes: Object.freeze(privateModes) }));
  return replay;
}

type BrowserDraw =
  | Readonly<{
      kind: "bytes";
      role: string;
      hex: string;
    }>
  | Readonly<{
      kind: "bounded-offset";
      role: string;
      value: number;
      bound: number;
    }>;

// Keep Playwright callbacks as top-level declarations. Transpiler name helpers
// attached to anonymous inline callbacks are not present in the browser realm.
function ravioliBrowserInstallEntropyReplay(input: Readonly<{
  stateKey: string;
  exactMode: RavioliCurrentEntropyReplayMode;
  planSha256: string;
  exactDraws: readonly BrowserDraw[];
}>): void {
  // tsx/esbuild preserves names for nested functions with a `__name` helper.
  // Playwright serializes only this declaration, so provide the identity helper
  // non-enumerably while the nested closures are constructed, then remove it.
  Object.defineProperty(globalThis, "__name", {
    configurable: true,
    enumerable: false,
    writable: false,
    value: Object,
  });
  const scope = window as typeof window & Record<string, any>;
  const reject = (state: Record<string, any>, code: string): never => {
    state.violationCode = code;
    throw new Error(`Ravioli entropy replay rejected ${code}`);
  };
  if (Object.prototype.hasOwnProperty.call(scope, input.stateKey)) {
    throw new Error("Ravioli entropy replay state is already installed");
  }
  if (Object.prototype.hasOwnProperty.call(crypto, "getRandomValues")) {
    throw new Error("Ravioli entropy replay refuses to stack over another entropy override");
  }
  const original = crypto.getRandomValues.bind(crypto);
  const draws = input.exactDraws.map((draw) => draw.kind === "bytes"
    ? {
        kind: "bytes" as const,
        role: draw.role,
        bytes: Uint8Array.from(draw.hex.match(/../g)!.map((part) => Number.parseInt(part, 16))),
      }
    : {
        kind: "bounded-offset" as const,
        role: draw.role,
        value: draw.value,
        bound: draw.bound,
      });
  const state: Record<string, any> = {
    schema: "pastaprotocol-ravioli-browser-entropy-replay-state@1",
    mode: input.exactMode,
    replayPlanSha256: input.planSha256,
    expectedTargetDrawCount: draws.length,
    consumedTargetDrawCount: 0,
    nativeDraftDrawCount: 0,
    complete: false,
    violationCode: null,
    restored: false,
  };
  Object.defineProperty(scope, input.stateKey, {
    configurable: true,
    enumerable: false,
    writable: false,
    value: state,
  });
  Object.defineProperty(crypto, "getRandomValues", {
    configurable: true,
    enumerable: false,
    writable: false,
    value(array: ArrayBufferView<ArrayBuffer>) {
      if (state.violationCode) return reject(state, "after-violation");
      const uint8 = array instanceof Uint8Array;
      const uint32 = array instanceof Uint32Array;
      const byteLength = array?.byteLength;
      const targetSized = byteLength === 4
        || byteLength === 12
        || byteLength === 16
        || byteLength === 32;
      if (state.nativeDraftDrawCount === 0) {
        if (uint8 && byteLength === 16) {
          state.nativeDraftDrawCount = 1;
          return original(array);
        }
        if (targetSized) return reject(state, "expected-native-draft-id");
        return original(array);
      }
      const expected = draws[state.consumedTargetDrawCount];
      if (!expected) {
        if (targetSized) return reject(state, "extra-target-draw");
        return original(array);
      }
      if (expected.kind === "bytes") {
        if (!uint8 || byteLength !== expected.bytes.byteLength) {
          if (targetSized) return reject(state, "target-draw-shape");
          return original(array);
        }
        array.set(expected.bytes);
      } else {
        if (!uint32 || byteLength !== 4 || (array as Uint32Array).length !== 1) {
          if (targetSized) return reject(state, "bounded-offset-draw-shape");
          return original(array);
        }
        const ceiling = Math.floor(0x1_0000_0000 / expected.bound) * expected.bound;
        if (
          expected.bound < 1
          || expected.bound > 64
          || expected.value < 0
          || expected.value >= expected.bound
          || expected.value >= ceiling
        ) {
          return reject(state, "bounded-offset-plan");
        }
        (array as Uint32Array)[0] = expected.value;
      }
      state.consumedTargetDrawCount += 1;
      state.complete = state.consumedTargetDrawCount === draws.length;
      return array;
    },
  });
  delete (globalThis as any).__name;
}

function ravioliBrowserInspectAndRestoreEntropyReplay(input: Readonly<{
  stateKey: string;
  exactMode: RavioliCurrentEntropyReplayMode;
}>): Readonly<{
  snapshot: null | Readonly<Record<string, any>>;
  restored: boolean;
  stateRemoved: boolean;
}> {
  const scope = window as typeof window & Record<string, any>;
  const descriptor = Object.getOwnPropertyDescriptor(scope, input.stateKey);
  const state = descriptor?.value as Record<string, any> | undefined;
  const snapshot = state
    ? {
        schema: state.schema,
        mode: state.mode,
        expectedTargetDrawCount: state.expectedTargetDrawCount,
        consumedTargetDrawCount: state.consumedTargetDrawCount,
        nativeDraftDrawCount: state.nativeDraftDrawCount,
        complete: state.complete,
        violationCode: state.violationCode,
        stateEnumerable: descriptor?.enumerable === true,
        overrideEnumerable:
          Object.getOwnPropertyDescriptor(crypto, "getRandomValues")?.enumerable === true,
        hasOwnOverride: Object.prototype.hasOwnProperty.call(crypto, "getRandomValues"),
      }
    : null;
  if (
    state
    && state.mode === input.exactMode
    && state.complete === true
    && state.violationCode === null
    && state.nativeDraftDrawCount === 1
    && state.consumedTargetDrawCount === state.expectedTargetDrawCount
    && descriptor?.enumerable === false
    && Object.getOwnPropertyDescriptor(crypto, "getRandomValues")?.enumerable === false
  ) {
    delete (crypto as any).getRandomValues;
    state.restored = !Object.prototype.hasOwnProperty.call(crypto, "getRandomValues");
    delete scope[input.stateKey];
    return {
      snapshot,
      restored: state.restored === true,
      stateRemoved: !Object.prototype.hasOwnProperty.call(scope, input.stateKey),
    };
  }
  return { snapshot, restored: false, stateRemoved: false };
}

/** Installs one exact publish-scoped entropy plan in the existing Studio page. */
export async function installRavioliCurrentEntropyReplay(
  page: Pick<Page, "evaluate">,
  replay: RavioliCurrentEntropyReplay,
  mode: RavioliCurrentEntropyReplayMode,
): Promise<void> {
  const privateReplay = PRIVATE_REPLAYS.get(replay);
  if (!privateReplay) fail("replay object was not produced by the authenticated loader");
  const plan = privateReplay.modes[String(mode) as "0" | "1"];
  if (!plan || plan.mode !== mode) fail(`mode ${mode} has no authenticated replay plan`);
  await page.evaluate(ravioliBrowserInstallEntropyReplay, {
    stateKey: BROWSER_STATE_KEY,
    exactMode: mode,
    planSha256: plan.replayPlanSha256,
    exactDraws: plan.draws.map((draw) => draw.kind === "bytes"
      ? {
          kind: "bytes" as const,
          role: draw.role,
          hex: Buffer.from(draw.bytes).toString("hex"),
        }
      : {
          kind: "bounded-offset" as const,
          role: draw.role,
          value: draw.value,
          bound: draw.bound,
        }),
  });
}

/** Verifies exact consumption and restores the browser's native entropy method. */
export async function assertRavioliCurrentEntropyReplayConsumed(
  page: Pick<Page, "evaluate">,
  mode: RavioliCurrentEntropyReplayMode,
): Promise<void> {
  const status = await page.evaluate(
    ravioliBrowserInspectAndRestoreEntropyReplay,
    { stateKey: BROWSER_STATE_KEY, exactMode: mode },
  );
  if (!status.snapshot) fail(`mode ${mode} browser replay state is missing`);
  if (status.snapshot.mode !== mode) fail(`mode ${mode} browser replay state differs`);
  if (status.snapshot.violationCode) {
    fail(`mode ${mode} browser replay violated ${status.snapshot.violationCode}`);
  }
  if (
    status.snapshot.complete !== true
    || status.snapshot.nativeDraftDrawCount !== 1
    || status.snapshot.consumedTargetDrawCount
      !== status.snapshot.expectedTargetDrawCount
  ) {
    fail(`mode ${mode} browser replay was not completely consumed`);
  }
  if (
    status.snapshot.stateEnumerable
    || status.snapshot.overrideEnumerable
    || !status.snapshot.hasOwnOverride
    || !status.restored
    || !status.stateRemoved
  ) {
    fail(`mode ${mode} browser replay did not restore its private override`);
  }
}
