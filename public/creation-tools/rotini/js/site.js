"use strict";

(() => {
  const config = window.PASTA_SITE_CONFIG || {};
  const PASTA_SUGO_FAVICONS = Object.freeze({
    spaghetti: Object.freeze({
      title: "Spaghetti icon",
      description: "three spaghetti strands mark in the Sugo Pasta Protocol palette.",
      mark: [
        '<g>',
        '  <path d="M20 16c-4 8 4 12 0 20s4 12 0 20M32 16c-4 8 4 12 0 20s4 12 0 20M44 16c-4 8 4 12 0 20s4 12 0 20" fill="none" stroke="#e5483e" stroke-width="4" stroke-linecap="round"/>',
        '  <circle cx="20" cy="14" r="2.3" fill="#fff0d2"/><circle cx="32" cy="14" r="2.3" fill="#fff0d2"/><circle cx="44" cy="14" r="2.3" fill="#fff0d2"/>',
        '</g>',
      ].join("\n"),
    }),
    gnocchi: Object.freeze({
      title: "Gnocchi icon",
      description: "three rounded dumplings mark in the Sugo Pasta Protocol palette.",
      mark: [
        '<g>',
        '  <g fill="#fff0d2" stroke="#b6d56b" stroke-width="2.2">',
        '    <path d="M15 32c0-6 5-10 11-10s10 4 10 10-4 10-10 10-11-4-11-10Z"/>',
        '    <path d="M31 22c0-6 5-10 11-10s8 4 8 9-3 9-9 9-10-3-10-8Z"/>',
        '    <path d="M30 45c0-5 4-8 9-8s9 3 9 8-4 8-9 8-9-3-9-8Z"/>',
        '  </g>',
        '  <path d="M21 27l5 3M37 18l5 3M36 42l5 3" stroke="#4a1e3a" stroke-width="2.3" stroke-linecap="round"/>',
        '</g>',
      ].join("\n"),
    }),
    ravioli: Object.freeze({
      title: "Ravioli icon",
      description: "a square ravioli parcel mark in the Sugo Pasta Protocol palette.",
      mark: [
        '<g>',
        '  <path d="M16 24c0-4 4-8 8-8h16c4 0 8 4 8 8v16c0 4-4 8-8 8H24c-4 0-8-4-8-8Z" fill="#d98cb3" stroke="#fff0d2" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>',
        '  <rect x="24" y="24" width="16" height="16" rx="3" fill="#fff0d2"/>',
        '  <path d="M19 24h-3M19 32h-3M19 40h-3M48 24h-3M48 32h-3M48 40h-3" stroke="#fff0d2" stroke-width="2.3" stroke-linecap="round"/>',
        '</g>',
      ].join("\n"),
    }),
    rotini: Object.freeze({
      title: "Rotini icon",
      description: "a corkscrew spiral mark in the Sugo Pasta Protocol palette.",
      mark: [
        '<g>',
        '  <path d="M18 20c4-7 16-8 23-2 8 7 5 19-3 26-8 7-20 5-24-2-4-7 2-13 9-13 6 0 8 6 5 9-3 3-8 0-7-4" fill="none" stroke="#80a93d" stroke-width="6" stroke-linecap="round"/>',
        '  <path d="M21 20c4-3 8-4 12-3" fill="none" stroke="#fff0d2" stroke-width="2.5" stroke-linecap="round"/>',
        '</g>',
      ].join("\n"),
    }),
    penne: Object.freeze({
      title: "Penne icon",
      description: "two diagonal pasta tubes mark in the Sugo Pasta Protocol palette.",
      mark: [
        '<g>',
        '  <g fill="#ffcf59" stroke="#fff0d2" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">',
        '    <path d="M17 47 29 20l11 5-12 27Z"/>',
        '    <path d="M31 43l9-24 10 4-10 25Z"/>',
        '  </g>',
        '  <ellipse cx="31.5" cy="22.5" rx="3.5" ry="2.2" transform="rotate(25 31.5 22.5)" fill="#32142d" stroke="#fff0d2" stroke-width="1.7"/>',
        '  <ellipse cx="45" cy="21" rx="3.2" ry="2" transform="rotate(25 45 21)" fill="#32142d" stroke="#fff0d2" stroke-width="1.7"/>',
        '</g>',
      ].join("\n"),
    }),
    lasagna: Object.freeze({
      title: "Lasagna icon",
      description: "stacked wavy layers mark in the Sugo Pasta Protocol palette.",
      mark: [
        '<g>',
        '  <path d="M14 23c4-3 8 3 12 0s8 3 12 0 8 3 12 0v7c-4 3-8-3-12 0s-8-3-12 0-8-3-12 0Z" fill="#e5683a" stroke="#fff0d2" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>',
        '  <path d="M14 33c4-3 8 3 12 0s8 3 12 0 8 3 12 0v7c-4 3-8-3-12 0s-8-3-12 0-8-3-12 0Z" fill="#fff0d2" stroke="#fff0d2" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>',
        '  <path d="M14 43c4-3 8 3 12 0s8 3 12 0 8 3 12 0v7c-4 3-8-3-12 0s-8-3-12 0-8-3-12 0Z" fill="#e5683a" stroke="#fff0d2" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>',
        '</g>',
      ].join("\n"),
    }),
  });

  function applyPastaFavicon() {
    const icon = PASTA_SUGO_FAVICONS[config.app];
    const favicon = document.getElementById("pastaFavicon");
    if (!icon || !favicon) return;
    const source = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-labelledby="title desc">',
      '  <title id="title">' + icon.title + '</title>',
      '  <desc id="desc">' + icon.description + '</desc>',
      '  <rect width="64" height="64" rx="16" fill="#32142d"/>',
      '  <rect x="2" y="2" width="60" height="60" rx="14" fill="none" stroke="#70405f" stroke-width="1.5"/>',
      icon.mark,
      '</svg>',
    ].join("\n");
    favicon.href = "data:image/svg+xml," + encodeURIComponent(source);
  }

  applyPastaFavicon();
  const RAVIOLI_OPEN_KIT_SCHEMA = "pasta-ravioli-open-kit@3";
  const RAVIOLI_PUBLIC_REVEAL_SCHEMA = "pasta-ravioli-public-reveal@1";
  const RAVIOLI_SEALED_REVEAL_SCHEMA = "pasta-ravioli-sealed-reveal@1";
  const RAVIOLI_SEALED_REVEAL_CIPHER = "AES-256-GCM";
  const RAVIOLI_SEALED_REVEAL_KDF = "SHA-256(pasta-ravioli-sealed-reveal@1 || 0x00 || reveal-salt)";
  const RAVIOLI_LEGACY_PACK_MANIFEST_SCHEMA = "wtfos.pasta.pack-manifest.v2";
  const MAX_RAVIOLI_REVEAL_BYTES = 2_000_000;
  const MAX_RAVIOLI_ADAPTER_PAYLOAD_BYTES = 4096;
  const MAX_RAVIOLI_TOTAL_ADAPTER_PAYLOAD_BYTES = 24576;
  const RAVIOLI_MODE_NAMES = [
    "deterministic_vault",
    "blind_funded_pool",
    "blind_allocated_mint",
    "blind_generative_mint",
    "hybrid_atomic_pack",
  ];
  const $ = (id) => document.getElementById(id);
  const state = {
    account: "",
    contract: null,
    storage: null,
    unitPrice: 0,
    maxAmount: null,
    action: "",
    secondaryAction: "",
    rotiniProject: null,
    ravioliKitSource: "",
    pendingRavioliDelivery: null,
    ravioliRefundCredit: 0,
    ravioliControllerAddress: "",
    operationPending: false,
  };
  const gateway = config.ipfsGateway || "https://ipfs.fileship.xyz/";

  function setStatus(message, error) {
    $("status").textContent = message;
    $("status").dataset.error = error ? "true" : "false";
  }
  function optionValue(value) {
    if (!value || typeof value !== "object") return value;
    if (Object.prototype.hasOwnProperty.call(value, "Some")) return value.Some;
    if (Object.prototype.hasOwnProperty.call(value, "None")) return null;
    return value;
  }
  function number(value) {
    value = optionValue(value);
    if (value == null) return 0;
    if (typeof value.toNumber === "function") return value.toNumber();
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function uri(value) {
    if (typeof value !== "string") return "";
    return value.startsWith("ipfs://") ? gateway + value.slice(7) : value;
  }
  function bytesToText(value) {
    if (typeof value !== "string") return "";
    try { return MD.hexToUtf8(value); } catch (_) { return value; }
  }
  function ravioliKitStorageKey(tokenId) {
    return `pasta.ravioli.open-kit.v3:${config.network || "mainnet"}:${config.contract}:${tokenId}`;
  }
  function ravioliNat(value, label) {
    value = optionValue(value);
    if (typeof value === "bigint") value = value.toString();
    else if (value && typeof value.toFixed === "function") value = value.toFixed();
    const text = typeof value === "number" ? String(value) : String(value ?? "");
    if (!/^(?:0|[1-9][0-9]*)$/.test(text)) throw new Error(`${label} must be a non-negative whole number.`);
    const parsed = Number(text);
    if (!Number.isSafeInteger(parsed)) throw new Error(`${label} is outside the safe integer range.`);
    return parsed;
  }
  function ravioliKt1(value, label) {
    if (typeof value !== "string" || !value.startsWith("KT1") || !MD.isAddress(value)) throw new Error(`${label} must be a valid KT1 contract.`);
    return value;
  }
  function ravioliExactKeys(value, expected, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
      throw new Error(`${label} has unsupported or missing fields.`);
    }
  }
  function ravioliIpfsUri(value, label) {
    if (typeof value !== "string" || !value.startsWith("ipfs://") || value.length > 256 || /\s/.test(value) || value.length <= 7) {
      throw new Error(`${label} must be a bounded IPFS URI.`);
    }
    return value;
  }
  function validateRavioliOpenKit(value, tokenId, pack) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Ravioli open kit must be an object.");
    ravioliExactKeys(value, ["schema", "network", "contract", "tokenId", "mode", "manifestUri", "blindSecurity", "warning", "editionPolicy", "recipes"], "Ravioli open kit");
    if (value.schema !== RAVIOLI_OPEN_KIT_SCHEMA) throw new Error("Ravioli reveal does not contain a v3 open kit.");
    if (value.network !== (config.network || "mainnet")) throw new Error("Ravioli open kit network does not match this page.");
    if (value.contract !== config.contract || ravioliNat(value.tokenId, "Ravioli open kit token id") !== tokenId) throw new Error("Ravioli open kit contract/token does not match this page.");
    if (!["commit-reveal-ui-hidden-chain-public", "public"].includes(value.blindSecurity)) throw new Error("Ravioli open kit disclosure policy is unsupported.");
    if (typeof value.warning !== "string" || !value.warning.trim() || value.warning.length > 512) throw new Error("Ravioli open kit warning is invalid.");
    ravioliIpfsUri(value.manifestUri, "Ravioli open kit manifest URI");
    const packMode = RAVIOLI_MODE_NAMES[ravioliNat(pack.mode, "Ravioli pack mode")];
    if (!packMode || value.mode !== packMode) throw new Error("Ravioli open kit mode does not match the immutable pack.");
    const maxSupply = ravioliNat(pack.max_supply, "Ravioli pack supply");
    if (!Array.isArray(value.recipes) || value.recipes.length !== maxSupply) throw new Error("Ravioli open kit recipe count does not match the immutable pack supply.");
    const itemCount = ravioliNat(pack.item_count, "Ravioli pack item count");
    ravioliExactKeys(value.editionPolicy, [
      "requiresLimitedWrapper",
      "wrapperEditionClass",
      "earliestChildEnd",
      "wrapperSaleStart",
      "wrapperSaleEnd",
      "revealDeadline",
      "openDeadline",
    ], "Ravioli open kit edition policy");
    if (typeof value.editionPolicy.requiresLimitedWrapper !== "boolean") throw new Error("Ravioli open kit edition policy flag is invalid.");
    if (!["fixed-supply", "limited-edition"].includes(value.editionPolicy.wrapperEditionClass)) {
      throw new Error("Ravioli open kit wrapper edition class is invalid.");
    }
    for (const field of ["earliestChildEnd", "wrapperSaleStart", "wrapperSaleEnd", "revealDeadline", "openDeadline"]) {
      const date = value.editionPolicy[field];
      if (date != null && (typeof date !== "string" || !Number.isFinite(Date.parse(date)))) throw new Error(`Ravioli open kit ${field} is invalid.`);
    }
    const seenNonces = new Set();
    for (let index = 0; index < value.recipes.length; index += 1) {
      const recipe = value.recipes[index];
      ravioliExactKeys(recipe, ["serial", "nonce", "actions"], `Ravioli open kit recipe ${index}`);
      if (!recipe || typeof recipe !== "object" || Array.isArray(recipe) || ravioliNat(recipe.serial, `Ravioli open kit recipe ${index} serial`) !== index) throw new Error(`Ravioli open kit recipe ${index} is malformed.`);
      if (typeof recipe.nonce !== "string" || !/^[0-9a-f]{64}$/.test(recipe.nonce)) throw new Error(`Ravioli open kit recipe ${index} nonce is malformed.`);
      if (seenNonces.has(recipe.nonce)) throw new Error(`Ravioli open kit recipe ${index} reuses a nonce.`);
      seenNonces.add(recipe.nonce);
      if (!Array.isArray(recipe.actions) || recipe.actions.length !== itemCount) throw new Error(`Ravioli open kit recipe ${index} action count does not match the pack.`);
      for (const action of recipe.actions) {
        if (!action || typeof action !== "object" || Array.isArray(action)) throw new Error(`Ravioli open kit recipe ${index} contains a malformed action.`);
        if (action.kind === "escrow") {
          ravioliExactKeys(action, ["kind", "fa2", "tokenId", "amount"], `Ravioli open kit recipe ${index} escrow action`);
          ravioliKt1(action.fa2, "Ravioli escrow contract");
          ravioliNat(action.tokenId, "Ravioli escrow token id");
          if (ravioliNat(action.amount, "Ravioli escrow amount") < 1) throw new Error("Ravioli escrow amount must be positive.");
        } else if (action.kind === "allocated" || action.kind === "generative") {
          ravioliExactKeys(action, ["kind", "adapter", "resourceId", "payloadCommitment"], `Ravioli open kit recipe ${index} adapter action`);
          ravioliKt1(action.adapter, "Ravioli adapter");
          ravioliNat(action.resourceId, "Ravioli adapter resource id");
          if (action.kind === "allocated" && !/^[0-9a-f]{64}$/.test(String(action.payloadCommitment || ""))) {
            throw new Error("Ravioli allocated action requires an exact payload commitment.");
          }
          if (action.kind === "generative" && action.payloadCommitment != null && !/^[0-9a-f]{64}$/.test(String(action.payloadCommitment))) {
            throw new Error("Ravioli generative payload commitment is malformed.");
          }
        } else {
          throw new Error(`Ravioli open kit recipe ${index} contains an unknown action kind.`);
        }
      }
    }
    return value;
  }
  async function fetchBoundedJson(source, label) {
    const response = await fetch(uri(source), { headers: { accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error(`${label} could not be loaded (${response.status}).`);
    const declaredHeader = response.headers.get("content-length");
    const declaredLength = declaredHeader == null ? null : Number(declaredHeader);
    if (declaredLength != null && Number.isFinite(declaredLength) && declaredLength > MAX_RAVIOLI_REVEAL_BYTES) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`${label} exceeds the 2 MB safety limit.`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error(`${label} could not be safely streamed.`);
    const chunks = [];
    let byteLength = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        byteLength += value.byteLength;
        if (byteLength > MAX_RAVIOLI_REVEAL_BYTES) {
          await reader.cancel().catch(() => {});
          throw new Error(`${label} exceeds the 2 MB safety limit.`);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch (_) { throw new Error(`${label} is not valid UTF-8 JSON.`); }
    try { return JSON.parse(text); } catch (_) { throw new Error(`${label} is not valid JSON.`); }
  }
  function ravioliBytesFromHex(value, label) {
    const clean = String(value || "").replace(/^0x/i, "").toLowerCase();
    if (!/^(?:[0-9a-f]{2})*$/.test(clean)) throw new Error(`${label} is not valid bytes.`);
    return Uint8Array.from(clean.match(/.{2}/g) || [], (pair) => Number.parseInt(pair, 16));
  }
  function ravioliBytesFromBase64(value, label) {
    if (typeof value !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error(`${label} is not valid base64.`);
    let binary;
    try { binary = atob(value); } catch (_) { throw new Error(`${label} is not valid base64.`); }
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }
  function ravioliCanonicalJson(value, label) {
    const visit = (child, depth) => {
      if (depth > 64) throw new Error(`${label} exceeds the canonical JSON depth limit.`);
      if (child === null || typeof child === "string" || typeof child === "boolean") return child;
      if (typeof child === "number") {
        if (!Number.isFinite(child)) throw new Error(`${label} contains a non-finite number.`);
        return Object.is(child, -0) ? 0 : child;
      }
      if (Array.isArray(child)) return child.map((entry) => visit(entry, depth + 1));
      if (!child || typeof child !== "object") throw new Error(`${label} is not canonical JSON.`);
      const result = {};
      for (const key of Object.keys(child).sort()) result[key] = visit(child[key], depth + 1);
      return result;
    };
    return JSON.stringify(visit(value, 0));
  }
  async function ravioliSealedRevealKey(saltHex) {
    const salt = ravioliBytesFromHex(saltHex, "Ravioli reveal salt");
    if (salt.length !== 32) throw new Error("Ravioli reveal salt must be exactly 32 bytes.");
    const domain = new TextEncoder().encode(`${RAVIOLI_SEALED_REVEAL_SCHEMA}\0`);
    const material = new Uint8Array(domain.length + salt.length);
    material.set(domain);
    material.set(salt, domain.length);
    const digest = await crypto.subtle.digest("SHA-256", material);
    return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["decrypt"]);
  }
  async function ravioliRevealCommitment(contentsUri, saltHex, offset) {
    const salt = ravioliBytesFromHex(saltHex, "Ravioli reveal salt");
    if (salt.length !== 32) throw new Error("Ravioli reveal salt must be exactly 32 bytes.");
    const normalizedOffset = ravioliNat(offset, "Ravioli reveal offset");
    const packed = await new TZ.MichelCodecPacker().packData({
      data: {
        prim: "Pair",
        args: [
          { bytes: MD.utf8ToHex(ravioliIpfsUri(contentsUri, "Ravioli reveal contents URI")) },
          { prim: "Pair", args: [{ int: String(normalizedOffset) }, { bytes: saltHex }] },
        ],
      },
      type: {
        prim: "pair",
        args: [
          { prim: "bytes" },
          { prim: "pair", args: [{ prim: "nat" }, { prim: "bytes" }] },
        ],
      },
    });
    return hexFromBytes(TZ.blake2b(ravioliBytesFromHex(packed.packed, "Packed Ravioli reveal"), undefined, 32));
  }
  function ravioliSealedRevealAad(tokenId, pack) {
    return {
      schema: RAVIOLI_SEALED_REVEAL_SCHEMA,
      network: config.network || "mainnet",
      contract: config.contract,
      tokenId,
      manifestUri: ravioliIpfsUri(bytesToText(pack.manifest_uri), "Ravioli immutable pack manifest URI"),
    };
  }
  async function decryptRavioliPublicReveal(envelope, saltHex, tokenId, pack) {
    ravioliExactKeys(envelope, ["schema", "cipher", "keyDerivation", "iv", "aad", "ciphertext"], "Ravioli sealed reveal");
    if (
      envelope.schema !== RAVIOLI_SEALED_REVEAL_SCHEMA
      || envelope.cipher !== RAVIOLI_SEALED_REVEAL_CIPHER
      || envelope.keyDerivation !== RAVIOLI_SEALED_REVEAL_KDF
    ) {
      throw new Error("Ravioli sealed reveal uses an unsupported encryption policy.");
    }
    const expectedAad = ravioliSealedRevealAad(tokenId, pack);
    if (
      ravioliCanonicalJson(envelope.aad, "Ravioli sealed reveal AAD")
      !== ravioliCanonicalJson(expectedAad, "Expected Ravioli sealed reveal AAD")
    ) {
      throw new Error("Ravioli sealed reveal context does not match this pack.");
    }
    const iv = ravioliBytesFromBase64(envelope.iv, "Ravioli sealed reveal IV");
    if (iv.length !== 12) throw new Error("Ravioli sealed reveal IV must be 12 bytes.");
    const ciphertext = ravioliBytesFromBase64(envelope.ciphertext, "Ravioli sealed reveal ciphertext");
    const key = await ravioliSealedRevealKey(saltHex);
    let plaintext;
    try {
      plaintext = await crypto.subtle.decrypt({
        name: "AES-GCM",
        iv,
        additionalData: new TextEncoder().encode(
          ravioliCanonicalJson(envelope.aad, "Ravioli sealed reveal AAD"),
        ),
        tagLength: 128,
      }, key, ciphertext);
    } catch (_) {
      throw new Error("Ravioli sealed reveal authentication failed; its key or ciphertext is wrong.");
    }
    let publicReveal;
    try { publicReveal = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext)); }
    catch (_) { throw new Error("Ravioli sealed reveal plaintext is invalid."); }
    return validateRavioliPublicReveal(publicReveal, tokenId, pack);
  }
  function validateRavioliPublicReveal(value, tokenId, pack) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Ravioli public reveal must be an object.");
    ravioliExactKeys(value, ["schema", "network", "contract", "tokenId", "mode", "manifestUri", "maxSupply", "itemCount", "openKit"], "Ravioli public reveal");
    if (value.schema !== RAVIOLI_PUBLIC_REVEAL_SCHEMA) throw new Error("Ravioli public reveal schema is unsupported.");
    const expectedNetwork = config.network || "mainnet";
    if (value.network !== expectedNetwork) throw new Error("Ravioli public reveal network does not match this page.");
    if (value.contract !== config.contract || ravioliNat(value.tokenId, "Ravioli public reveal token id") !== tokenId) {
      throw new Error("Ravioli public reveal contract/token does not match this page.");
    }
    const packMode = RAVIOLI_MODE_NAMES[ravioliNat(pack.mode, "Ravioli pack mode")];
    if (!packMode || value.mode !== packMode) throw new Error("Ravioli public reveal mode does not match the immutable pack.");
    if (ravioliNat(value.maxSupply, "Ravioli public reveal supply") !== ravioliNat(pack.max_supply, "Ravioli pack supply")) {
      throw new Error("Ravioli public reveal supply does not match the immutable pack.");
    }
    if (ravioliNat(value.itemCount, "Ravioli public reveal item count") !== ravioliNat(pack.item_count, "Ravioli pack item count")) {
      throw new Error("Ravioli public reveal item count does not match the immutable pack.");
    }
    const manifestUri = ravioliIpfsUri(value.manifestUri, "Ravioli public reveal manifest URI");
    const immutableManifestUri = ravioliIpfsUri(bytesToText(pack.manifest_uri), "Ravioli immutable pack manifest URI");
    if (manifestUri !== immutableManifestUri) throw new Error("Ravioli public reveal manifest does not match the immutable pack identity.");
    const kit = validateRavioliOpenKit(value.openKit, tokenId, pack);
    if (kit.network !== value.network || kit.mode !== value.mode || kit.manifestUri !== manifestUri) {
      throw new Error("Ravioli public reveal does not match its nested open kit.");
    }
    return kit;
  }
  async function getRavioliPackStatus(tokenId) {
    const controllerAddress = ravioliKt1(
      String(state.storage.blind_controller || ""),
      "Ravioli blind controller",
    );
    const controller = await MD.getToolkit().contract.at(controllerAddress);
    const status = await executeContractView(controller, "get_pack_status", {
      pack_contract: config.contract,
      pack_token_id: tokenId,
    }, "Ravioli blind controller", state.account || config.contract);
    if (!status || typeof status !== "object") throw new Error("Ravioli blind controller returned a malformed pack status.");
    return { controller, controllerAddress, status };
  }
  function normalizedRavioliBytes(value) {
    const unwrapped = optionValue(value);
    return unwrapped == null ? null : String(unwrapped).replace(/^0x/i, "").toLowerCase();
  }
  function assertRavioliControllerStatus(pack, status, routerSupply = null, sale = null) {
    if (ravioliNat(status.max_supply, "Ravioli controller supply") !== ravioliNat(pack.max_supply, "Ravioli pack supply")) {
      throw new Error("Ravioli router and blind controller disagree about pack supply.");
    }
    for (const [label, controllerValue, routerValue] of [
      ["reveal deadline", status.reveal_deadline, pack.reveal_deadline],
      ["delivery / refund cutoff", status.open_deadline, pack.open_deadline],
    ]) {
      const controllerTime = timeMs(controllerValue);
      const routerTime = timeMs(routerValue);
      if (controllerTime == null || routerTime == null || controllerTime !== routerTime) {
        throw new Error(`Ravioli router and blind controller disagree about the ${label}.`);
      }
    }
    if (normalizedRavioliBytes(status.reveal_commitment) !== normalizedRavioliBytes(pack.reveal_commitment)) {
      throw new Error("Ravioli router and blind controller disagree about the reveal commitment.");
    }
    if (normalizedRavioliBytes(status.contents_uri) !== normalizedRavioliBytes(pack.contents_uri)) {
      throw new Error("Ravioli router and blind controller disagree about the reveal contents.");
    }
    if (Boolean(status.revealed) !== (normalizedRavioliBytes(status.contents_uri) != null)) {
      throw new Error("Ravioli blind controller reveal flag disagrees with its contents state.");
    }
    if (sale && (
      String(status.inventory_owner || "") !== String(sale.seller || "")
      || String(status.treasury || "") !== String(sale.treasury || "")
      || ravioliNat(status.unit_price, "Ravioli controller unit price") !== ravioliNat(sale.price, "Ravioli router unit price")
      || timeMs(status.sale_end) !== timeMs(sale.end)
    )) {
      throw new Error("Ravioli router and blind controller disagree about the primary sale.");
    }
    if (Boolean(status.cancelled) !== Boolean(pack.cancelled)) {
      const safeRevealedClosure = Boolean(pack.cancelled)
        && !Boolean(status.cancelled)
        && Boolean(status.revealed)
        && routerSupply === 0
        && ravioliNat(status.outstanding, "Ravioli outstanding claims") === 0
        && ravioliNat(status.escrowed, "Ravioli escrowed proceeds") === 0;
      if (!safeRevealedClosure) {
        throw new Error("Ravioli router and blind controller disagree about cancellation state.");
      }
    }
    return status;
  }
  async function discoverRavioliOpenKit(pack, tokenId, controllerState = null, routerSupply = null, sale = null) {
    const mode = ravioliNat(pack.mode, "Ravioli pack mode");
    const contentsUri = bytesToText(optionValue(pack.contents_uri));
    if (mode > 0) {
      const { status } = controllerState || await getRavioliPackStatus(tokenId);
      assertRavioliControllerStatus(pack, status, routerSupply, sale);
      const controllerContentsUri = bytesToText(optionValue(status.contents_uri));
      if (!status.revealed) {
        if (contentsUri || controllerContentsUri || optionValue(status.reveal_salt) != null) {
          throw new Error("Unrevealed Ravioli state unexpectedly exposes reveal material.");
        }
        return null;
      }
      if (!contentsUri || controllerContentsUri !== contentsUri) {
        throw new Error("Ravioli router and blind controller disagree about the authenticated reveal URI.");
      }
      const salt = String(optionValue(status.reveal_salt) || "").replace(/^0x/i, "").toLowerCase();
      const offset = optionValue(status.reveal_offset);
      const committed = normalizedRavioliBytes(pack.reveal_commitment);
      const reconstructed = await ravioliRevealCommitment(contentsUri, salt, offset);
      if (!committed || reconstructed !== committed) {
        throw new Error("Ravioli controller reveal material does not match the immutable router commitment.");
      }
      const contents = await fetchBoundedJson(contentsUri, "Ravioli encrypted on-chain reveal");
      if (contents?.schema !== RAVIOLI_SEALED_REVEAL_SCHEMA) {
        throw new Error("Revealed blind Ravioli contents are not an authenticated encrypted reveal.");
      }
      const kit = await decryptRavioliPublicReveal(contents, salt, tokenId, pack);
      localStorage.setItem(ravioliKitStorageKey(tokenId), JSON.stringify(kit));
      return { kit, source: "the authenticated encrypted on-chain reveal" };
    }
    if (contentsUri) {
      const contents = await fetchBoundedJson(contentsUri, "Ravioli on-chain contents");
      if (contents?.schema === RAVIOLI_PUBLIC_REVEAL_SCHEMA) {
        const kit = validateRavioliPublicReveal(contents, tokenId, pack);
        localStorage.setItem(ravioliKitStorageKey(tokenId), JSON.stringify(kit));
        return { kit, source: "the on-chain public reveal" };
      }
      if (typeof contents?.schema === "string" && contents.schema.startsWith("pasta-ravioli-public-reveal@")) {
        throw new Error("Ravioli on-chain contents use an unsupported public reveal version.");
      }
      // Older Ravioli products stored a display manifest rather than a reveal
      // document. Only that explicit legacy shape may fall back to a bundled or
      // browser-imported kit.
      if (contents?.schemaVersion !== RAVIOLI_LEGACY_PACK_MANIFEST_SCHEMA) {
        throw new Error("Ravioli on-chain contents are neither a supported public reveal nor a legacy pack manifest.");
      }
    }
    const configured = config.openKit || localStorage.getItem(ravioliKitStorageKey(tokenId));
    if (!configured) return null;
    let parsed;
    try { parsed = typeof configured === "string" ? JSON.parse(configured) : configured; }
    catch (_) { throw new Error("The configured Ravioli open kit is not valid JSON."); }
    return { kit: validateRavioliOpenKit(parsed, tokenId, pack), source: config.openKit ? "site package" : "this browser" };
  }
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-pasta-runtime="${src}"]`);
      if (existing?.dataset.loaded === "true") return resolve();
      const script = existing || document.createElement("script");
      script.dataset.pastaRuntime = src;
      script.src = src;
      script.onload = () => { script.dataset.loaded = "true"; resolve(); };
      script.onerror = () => reject(new Error(`Could not load ${src}.`));
      if (!existing) document.head.appendChild(script);
    });
  }
  async function ensureRotiniRuntime() {
    if (!window.RotiniArtifacts) await loadScript("js/rotini-artifact.js");
    if (!window.PastaRotiniMint) await loadScript("js/rotini-mint.js");
  }
  async function mapGet(map, key) {
    if (!map || typeof map.get !== "function") return undefined;
    return (await map.get(String(key))) ?? (await map.get(Number(key)));
  }
  async function executeContractView(contract, name, params, label, viewCaller) {
    const build = contract?.contractViews?.[name];
    if (typeof build !== "function") throw new Error(`${label} does not expose the required ${name} on-chain view.`);
    const invocation = build(params);
    if (!invocation || typeof invocation.executeView !== "function") throw new Error(`${label} ${name} view is unavailable.`);
    return invocation.executeView({ viewCaller: viewCaller || state.account || config.contract });
  }
  function ravioliBytes32(value, label) {
    const bytes = String(value || "").replace(/^0x/i, "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(bytes)) throw new Error(`${label} must be exactly 32 bytes.`);
    return bytes;
  }
  async function resolveRavioliClaim(tokenId, holderAddress) {
    if (!holderAddress) throw new Error("Connect the wrapper holder before resolving a blind-pack claim.");
    const { controller } = await getRavioliPackStatus(tokenId);
    const holder = {
      pack_contract: config.contract,
      pack_token_id: tokenId,
      owner: holderAddress,
    };
    const claimCount = ravioliNat(
      await executeContractView(controller, "get_claim_count", holder, "Ravioli blind controller", holderAddress),
      "Ravioli holder claim count",
    );
    if (claimCount < 1) {
      throw new Error("Connected wallet has no unconsumed claim for this blind Ravioli pack.");
    }
    const claim = await executeContractView(
      controller,
      "get_last_claim",
      holder,
      "Ravioli blind controller",
      holderAddress,
    );
    return {
      controller,
      count: claimCount,
      expectedClaimId: ravioliNat(claim?.claim_id, "Ravioli claim id"),
      paid: ravioliNat(claim?.paid, "Ravioli claim payment"),
    };
  }
  async function ravioliRefundCredit(controller, owner) {
    if (!owner) return 0;
    return ravioliNat(
      await executeContractView(
        controller,
        "get_refund_credit",
        owner,
        "Ravioli blind controller",
        owner,
      ),
      "Ravioli refund credit",
    );
  }
  async function resolveRavioliOpenEntitlement(pack, tokenId, opener) {
    const mode = ravioliNat(pack.mode, "Ravioli pack mode");
    if (mode === 0) {
      return {
        serial: ravioliNat(await mapGet(state.storage.opened, tokenId), "Ravioli public serial"),
        expectedClaimId: null,
      };
    }
    const claim = await resolveRavioliClaim(tokenId, opener);
    const expectedClaimId = claim.expectedClaimId;
    const serial = ravioliNat(
      await executeContractView(claim.controller, "get_claim_serial", {
        pack_contract: config.contract,
        pack_token_id: tokenId,
        holder: opener,
        expected_claim_id: expectedClaimId,
      }, "Ravioli blind controller", opener),
      "Ravioli assigned claim serial",
    );
    if (serial >= ravioliNat(pack.max_supply, "Ravioli pack supply")) {
      throw new Error("Ravioli assigned claim serial is outside this pack's supply.");
    }
    return { serial, expectedClaimId };
  }
  function timeMs(value) {
    value = optionValue(value);
    if (value == null) return null;
    if (typeof value === "object" && typeof value.toString === "function") value = value.toString();
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  }
  function saleWindow(sale) {
    if (!sale?.active) return { open: false, label: "Sale closed" };
    const now = Date.now();
    const start = timeMs(sale.start);
    const end = timeMs(sale.end);
    if (start != null && now < start) return { open: false, label: `Starts ${new Date(start).toLocaleString()}` };
    if (end != null && now > end) return { open: false, label: "Sale ended" };
    return { open: true, label: "Sale open" };
  }
  function ravioliDeadlineDetail(sale, pack, controllerStatus = null) {
    const details = [];
    const saleEnd = timeMs(controllerStatus?.sale_end ?? sale?.end);
    const revealDeadline = timeMs(controllerStatus?.reveal_deadline ?? pack?.reveal_deadline);
    const openDeadline = timeMs(controllerStatus?.open_deadline ?? pack?.open_deadline);
    const childExpiry = timeMs(pack?.child_expiry);
    if (saleEnd != null) details.push(`Sale ends ${new Date(saleEnd).toLocaleString()}`);
    if (revealDeadline != null) details.push(`Reveal due ${new Date(revealDeadline).toLocaleString()}`);
    if (openDeadline != null) details.push(`Open-or-refund cutoff ${new Date(openDeadline).toLocaleString()}`);
    if (childExpiry != null) {
      details.push(`LE child public mint ends ${new Date(childExpiry).toLocaleString()}; its reserved pack capacity remains deliverable until the open cutoff`);
    }
    return details.length ? ` · ${details.join(" · ")}` : "";
  }
  function hexFromBytes(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  async function sha256Hex(blob) {
    return hexFromBytes(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())));
  }
  function nestedPair(values) {
    let value = { prim: "Pair", args: [values.at(-2), values.at(-1)] };
    for (let index = values.length - 3; index >= 0; index -= 1) value = { prim: "Pair", args: [values[index], value] };
    return value;
  }
  function nestedBytesType(length) {
    let value = { prim: "pair", args: [{ prim: "bytes" }, { prim: "bytes" }] };
    for (let index = length - 3; index >= 0; index -= 1) value = { prim: "pair", args: [{ prim: "bytes" }, value] };
    return value;
  }
  async function ravioliRotiniContext({ tokenId, serial, actionIndex, action, opener }) {
    const toolkit = MD.getToolkit();
    const adapter = await toolkit.contract.at(action.adapter);
    const adapterStorage = await adapter.storage();
    const resource = await mapGet(adapterStorage.resources, action.resourceId);
    if (!resource) throw new Error(`Rotini resource ${action.resourceId} does not exist on ${action.adapter}.`);
    const reservationKey = {
      pack_contract: config.contract,
      pack_token_id: tokenId,
      resource_id: action.resourceId,
    };
    const reserved = ravioliNat(
      await executeContractView(adapter, "get_reserved", reservationKey, "Rotini pack adapter", opener),
      "Rotini reserved pack capacity",
    );
    if (reserved < 1) {
      throw new Error(`Rotini resource ${action.resourceId} has no reserved pack capacity remaining.`);
    }
    // Artwork identity is fixed by pack, serial, action, and project. The
    // eventual owner remains provenance and authorization, never seed entropy.
    const authoritative = await executeContractView(adapter, "get_render_context", {
      pack_contract: config.contract,
      pack_token_id: tokenId,
      open_serial: serial,
      action_index: actionIndex,
      resource_id: action.resourceId,
    }, "Rotini pack adapter", opener);
    const target = ravioliKt1(String(authoritative?.target || ""), "Rotini render target");
    const projectId = ravioliNat(authoritative?.project_id, "Rotini render project id");
    if (String(resource.target || "") !== target || ravioliNat(resource.project_id, "Rotini resource project id") !== projectId) {
      throw new Error("Rotini render context does not match the adapter's selected resource.");
    }
    const seed = ravioliBytes32(authoritative?.seed, "Rotini pack-assigned seed");
    const targetContract = await toolkit.contract.at(target);
    const targetStorage = await targetContract.storage();
    const project = await mapGet(targetStorage.projects, projectId);
    if (!project) throw new Error(`Rotini project ${projectId} does not exist on ${target}.`);
    const outputMode = bytesToText(project.output_mode);
    if (!window.RotiniArtifacts.OUTPUTS[outputMode]) {
      throw new Error(`Rotini project ${projectId} declares unsupported output mode ${outputMode || "(empty)"}.`);
    }
    return { adapter, project, projectId, resource, seed, target, targetContract };
  }
  async function ravioliGenerativePayload({ tokenId, serial, actionOrdinal, actionIndex, action, opener }) {
    await ensureRotiniRuntime();
    setStatus(`Resolving Rotini generator for child ${actionOrdinal + 1}…`);
    const context = await ravioliRotiniContext({ tokenId, serial, actionIndex, action, opener });
    const provenance = {
      schema: "pasta-ravioli-rotini-render@1",
      packContract: config.contract,
      packTokenId: tokenId,
      openSerial: serial,
      actionIndex,
      adapter: action.adapter,
      resourceId: action.resourceId,
      target: context.target,
      projectId: context.projectId,
      recipient: opener,
      seed: context.seed,
      canonicalAuthority: "generator-and-immutable-seed",
      artifactRole: "reproducible-self-rendered-cache-not-on-chain-pixel-verification",
    };
    const rendered = await window.PastaRotiniMint.renderProject({
      project: context.project,
      seed: context.seed,
      tokenId: `ravioli:${tokenId}:${serial}:${actionIndex}`,
      projectId: context.projectId,
      iteration: serial,
      artifactName: `${config.title || "Ravioli"} · generated child ${actionIndex + 1}`,
      provenance,
    }, setStatus);
    const output = window.RotiniArtifacts.OUTPUTS[rendered.outputMode];
    const digest = await window.RotiniArtifacts.sha256(rendered.artifactBlob);
    const independentlyRecomputedDigest = await sha256Hex(rendered.artifactBlob);
    if (digest.hex !== independentlyRecomputedDigest) {
      throw new Error("The independently recomputed Rotini cache hash did not match the renderer hash.");
    }
    const provider = MD.pinProviderFromForm();
    setStatus(`Pinning the generated ${output.mimeType} child ${actionOrdinal + 1}…`);
    const artifactUri = `ipfs://${await MD.pinBlob(
      provider,
      rendered.artifactBlob,
      `ravioli-${tokenId}-${serial}-${actionIndex}.${output.extension}`,
    )}`;
    let displayUri = artifactUri;
    if (rendered.outputMode === "zip") {
      setStatus(`Pinning the generated interactive cover for child ${actionOrdinal + 1}…`);
      displayUri = `ipfs://${await MD.pinBlob(
        provider,
        rendered.coverBlob,
        `ravioli-${tokenId}-${serial}-${actionIndex}-cover.png`,
      )}`;
    }
    const creator = String(rendered.manifest.creator || context.project.treasury || "");
    const metadata = window.PastaRotiniMint.tokenMetadata({
      name: `${rendered.manifest.name || config.title || "Ravioli generated token"} · pack ${tokenId} / ${serial + 1}.${actionIndex + 1}`,
      description: `${rendered.manifest.description || config.description || ""}\n\nThe Rotini generator and immutable seed are canonical. This PNG/GIF/ZIP is a reproducible self-rendered cache; the Tezos contract does not pixel-verify it.`.trim(),
      symbol: bytesToText(context.project.symbol),
      artifactUri,
      displayUri,
      thumbnailUri: displayUri,
      mimeType: output.mimeType,
      fileSize: rendered.artifactBlob.size,
      minter: opener,
      creator,
      traits: rendered.traits,
      seed: context.seed,
      projectId: context.projectId,
      iteration: undefined,
      generatorUri: rendered.generatorUri,
      digest: digest.hex,
    });
    metadata.attributes = [
      ...metadata.attributes,
      { name: "Ravioli pack serial", value: String(serial) },
      { name: "Ravioli action index", value: String(actionIndex) },
    ];
    metadata.mintingTool = "Pasta Protocol Ravioli + Rotini 3";
    metadata["pasta:packContract"] = config.contract;
    metadata["pasta:packTokenId"] = tokenId;
    metadata["pasta:openSerial"] = serial;
    metadata["pasta:actionIndex"] = actionIndex;
    metadata["pasta:adapter"] = action.adapter;
    metadata["pasta:resourceId"] = action.resourceId;
    metadata["pasta:target"] = context.target;
    metadata.ravioli = { generatedAtOpen: true, ...provenance };
    const metadataFileName = actionOrdinal === 0
      ? "ravioli-generated-token.json"
      : `ravioli-generated-token-${tokenId}-${serial}-${actionIndex}.json`;
    setStatus(`Pinning generator-bound metadata for child ${actionOrdinal + 1}…`);
    const metadataUri = `ipfs://${await MD.pinJson(provider, metadata, metadataFileName)}`;
    const ordered = [
      digest.hex,
      MD.utf8ToHex(artifactUri),
      MD.utf8ToHex(displayUri),
      MD.utf8ToHex(metadataUri),
      MD.utf8ToHex(output.mimeType),
      MD.utf8ToHex(displayUri),
    ].map((bytes) => ({ bytes }));
    const packed = await new TZ.MichelCodecPacker().packData({ data: nestedPair(ordered), type: nestedBytesType(ordered.length) });
    return {
      packed: packed.packed,
      metadata,
      metadataUri,
      artifactUri,
      displayUri,
      mimeType: output.mimeType,
      provenance,
    };
  }
  function ravioliPayloadByteLength(payload) {
    const clean = String(payload || "").replace(/^0x/, "");
    if (!/^(?:[0-9a-fA-F]{2})*$/.test(clean)) throw new Error("Ravioli adapter payload is not valid packed bytes.");
    return clean.length / 2;
  }
  function assertRavioliPayloadBudget(actions) {
    let total = 0;
    for (const action of actions) {
      if (!("allocated_mint" in action) && !("generative_mint" in action)) continue;
      const payload = action.allocated_mint?.payload ?? action.generative_mint?.payload ?? "";
      const size = ravioliPayloadByteLength(payload);
      if (size > MAX_RAVIOLI_ADAPTER_PAYLOAD_BYTES) throw new Error(`One Ravioli adapter payload is ${size} bytes; the limit is ${MAX_RAVIOLI_ADAPTER_PAYLOAD_BYTES}.`);
      total += size;
    }
    if (total > MAX_RAVIOLI_TOTAL_ADAPTER_PAYLOAD_BYTES) {
      throw new Error(`Ravioli adapter payloads total ${total} bytes; the Tezos-safe aggregate limit is ${MAX_RAVIOLI_TOTAL_ADAPTER_PAYLOAD_BYTES}.`);
    }
  }
  async function ravioliOpen(contract, tokenId) {
    const pack = await mapGet(state.storage.packs, tokenId);
    let openKitText = $("openKit").value.trim();
    if (!openKitText) {
      const sale = await mapGet(state.storage.sales, tokenId);
      const supply = number(await mapGet(state.storage.total_supply, tokenId));
      const controllerState = ravioliNat(pack.mode, "Ravioli pack mode") > 0
        ? await getRavioliPackStatus(tokenId)
        : null;
      const discovered = await discoverRavioliOpenKit(pack, tokenId, controllerState, supply, sale);
      if (!discovered) {
        throw new Error("No authenticated Ravioli open kit is available yet. Import the creator's kit before opening.");
      }
      openKitText = JSON.stringify(discovered.kit);
      $("openKit").value = JSON.stringify(discovered.kit, null, 2);
      $("openKit").dataset.source = discovered.source;
      state.ravioliKitSource = discovered.source;
    }
    const kit = validateRavioliOpenKit(JSON.parse(openKitText), tokenId, pack);
    const opener = state.account;
    if (!opener) throw new Error("Connect the wrapper holder before opening a Ravioli pack.");
    const entitlement = await resolveRavioliOpenEntitlement(pack, tokenId, opener);
    const serial = entitlement.serial;
    const recipe = kit.recipes[serial];
    if (!recipe) throw new Error(`Open kit has no recipe for serial ${serial}.`);
    const generatedPayloads = new Map();
    let actionOrdinal = 0;
    for (let actionIndex = 0; actionIndex < recipe.actions.length; actionIndex += 1) {
      const action = recipe.actions[actionIndex];
      if (action.kind !== "generative") continue;
      generatedPayloads.set(actionIndex, await ravioliGenerativePayload({
        tokenId,
        serial,
        actionOrdinal,
        actionIndex,
        action,
        opener,
      }));
      actionOrdinal += 1;
    }
    const actions = recipe.actions.map((action, actionIndex) => {
      if (action.kind === "escrow") return { escrow: { fa2: action.fa2, token_id: action.tokenId, amount: action.amount } };
      if (action.kind === "allocated") return {
        allocated_mint: {
          adapter: action.adapter,
          resource_id: action.resourceId,
          payload: "",
          payload_commitment: action.payloadCommitment,
        },
      };
      if (action.kind === "generative") return {
        generative_mint: {
          adapter: action.adapter,
          resource_id: action.resourceId,
          payload: generatedPayloads.get(actionIndex).packed,
          payload_commitment: action.payloadCommitment || null,
        },
      };
      throw new Error(`Unknown Ravioli action ${action.kind}.`);
    });
    assertRavioliPayloadBudget(actions);
    state.pendingRavioliDelivery = {
      tokenId,
      serial,
      actions: recipe.actions.map((action, actionIndex) => {
        if (action.kind === "escrow") return {
          kind: "escrow",
          actionIndex,
          label: action.name || `Existing FA2 token ${action.tokenId}`,
          contract: action.fa2,
          tokenId: action.tokenId,
          amount: action.amount,
          metadataUri: action.uri || "",
        };
        if (action.kind === "allocated") return {
          kind: "allocated",
          actionIndex,
          label: action.name || "Reserved allocated mint",
          adapter: action.adapter,
          resourceId: action.resourceId,
          amount: action.amount,
        };
        const generated = generatedPayloads.get(actionIndex);
        return {
          kind: "generative",
          actionIndex,
          label: action.name || "Generated-at-open token",
          adapter: action.adapter,
          resourceId: action.resourceId,
          amount: action.amount,
          metadataUri: generated.metadataUri,
          artifactUri: generated.artifactUri,
          displayUri: generated.displayUri,
          mimeType: generated.mimeType,
        };
      }),
    };
    const currentEntitlement = await resolveRavioliOpenEntitlement(pack, tokenId, opener);
    if (state.account !== opener) {
      throw new Error("Connected Ravioli opener changed while its Rotini child was rendering; nothing was submitted.");
    }
    if (
      currentEntitlement.serial !== entitlement.serial
      || currentEntitlement.expectedClaimId !== entitlement.expectedClaimId
    ) {
      throw new Error("Ravioli wrapper entitlement changed while its Rotini child was rendering; nothing was submitted.");
    }
    return contract.methodsObject.open_pack({
      token_id: tokenId,
      expected_claim_id: entitlement.expectedClaimId,
      nonce: recipe.nonce,
      actions,
    }).send();
  }
  function explorerUrl() {
    const host = config.network === "shadownet" ? "shadownet.tzkt.io" : config.network === "ghostnet" ? "ghostnet.tzkt.io" : "tzkt.io";
    return `https://${host}/${config.contract}`;
  }
  function renderRavioliDelivery(delivery, operationHash) {
    if (!delivery || !Array.isArray(delivery.actions)) return;
    const list = $("deliveryItems");
    list.replaceChildren();
    for (const action of delivery.actions) {
      const item = document.createElement("li");
      const detail = action.kind === "escrow"
        ? `${action.label}: ${action.amount} × ${action.contract} token ${action.tokenId}`
        : action.kind === "allocated"
          ? `${action.label}: ${action.amount} reserved mint via resource ${action.resourceId}`
          : `${action.label}: ${action.mimeType} reproducible cache generated and minted at open (generator + immutable seed are canonical)`;
      item.append(document.createTextNode(detail));
      for (const [label, target] of [[" metadata", action.metadataUri], [" artwork", action.artifactUri]]) {
        if (!target) continue;
        const link = document.createElement("a");
        link.textContent = label;
        link.href = uri(target);
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        item.append(" · ", link);
      }
      list.append(item);
    }
    $("deliverySummary").textContent = `Wrapper ${delivery.tokenId}, serial ${delivery.serial}: ${delivery.actions.length} child action${delivery.actions.length === 1 ? "" : "s"} confirmed atomically.`;
    const operationLink = $("deliveryOperation");
    operationLink.href = operationHash ? `${new URL(explorerUrl()).origin}/${operationHash}` : explorerUrl();
    $("deliveryResult").hidden = false;
  }
  async function applyMetadata(metadataUri) {
    if (!metadataUri) return;
    const response = await fetch(uri(metadataUri));
    if (!response.ok) return;
    const metadata = await response.json();
    if (!config.title && metadata.name) $("title").textContent = metadata.name;
    if (!config.description && (metadata.description || metadata.statement)) $("description").textContent = metadata.description || metadata.statement;
    const image = metadata.displayUri || metadata.thumbnailUri || metadata.image || metadata.artifactUri;
    if (image) {
      $("cover").src = uri(image);
      $("cover").alt = metadata.name ? `${metadata.name} artwork` : "Published artwork";
      $("cover").hidden = false;
      $("mediaFallback").hidden = true;
    }
  }
  async function loadMetadata() {
    if (!state.storage?.token_metadata) return;
    const token = await mapGet(state.storage.token_metadata, config.tokenId || 0);
    const info = token?.token_info || token;
    const raw = info && typeof info.get === "function" ? await info.get("") : undefined;
    const metadataUri = bytesToText(raw || "");
    if (!metadataUri) return;
    await applyMetadata(metadataUri);
  }
  async function loadExhibition() {
    const revisionId = number(state.storage.current_revision);
    const revision = await mapGet(state.storage.revisions, revisionId);
    if (!revision) throw new Error("This exhibition has no published revision.");
    $("itemId").textContent = String(revisionId);
    $("chainState").textContent = `${number(state.storage.revision_count)} revisions · ${revision.items?.length || 0} works shown`;
    await applyMetadata(bytesToText(revision.metadata_uri || ""));
  }
  async function configureAction() {
    const app = config.app;
    const tokenId = Number(config.tokenId || 0);
    state.action = "";
    state.secondaryAction = "";
    state.maxAmount = null;
    $("amountRow").hidden = false;
    $("submit").hidden = false;
    $("secondarySubmit").hidden = true;
    $("secondarySubmit").disabled = false;
    $("refundDestinationRow").hidden = true;
    if (app === "gnocchi") {
      const sale = await mapGet(state.storage.sales, tokenId);
      const currentSupply = number(await mapGet(state.storage.total_supply, tokenId));
      const minted = number(await mapGet(state.storage.total_minted || state.storage.total_supply, tokenId));
      if (!sale) throw new Error("No open-edition sale exists for this token.");
      const steps = Math.floor(minted / Math.max(1, number(sale.step_size)));
      state.unitPrice = number(sale.base_price) + number(sale.increment) * steps;
      const windowState = saleWindow(sale);
      const maxSupply = optionValue(sale.max_supply);
      const soldOut = maxSupply != null && minted >= number(maxSupply);
      state.maxAmount = maxSupply == null ? null : Math.max(0, number(maxSupply) - minted);
      state.action = windowState.open && !soldOut ? "open_mint" : "";
      const hasWindow = optionValue(sale.start) != null || optionValue(sale.end) != null;
      const hasCap = maxSupply != null;
      const label = hasWindow && hasCap ? "Limited Edition" : hasWindow ? "Timed OE" : hasCap ? "Capped OE" : "Forever OE";
      $("actionTitle").textContent = `Mint this ${label}`;
      $("actionDetail").textContent = `${minted} lifetime minted${currentSupply === minted ? "" : ` · ${currentSupply} current supply`} · ${(state.unitPrice / 1_000_000).toFixed(6)} tez each`;
      $("chainState").textContent = soldOut ? "Sold out" : windowState.open ? "Minting open" : windowState.label;
      $("submit").textContent = "Mint editions";
      $("submit").disabled = !state.action;
      return;
    }
    if (app === "rotini") {
      const project = await mapGet(state.storage.projects, tokenId);
      if (!project) throw new Error("No generative project exists at this id.");
      const minted = number(project.minted);
      const reserved = number(project.reserved);
      const decodedMaxSupply = optionValue(project.max_supply);
      const maxSupply = decodedMaxSupply == null ? null : number(decodedMaxSupply);
      const soldOut = maxSupply != null && minted + reserved >= maxSupply;
      state.unitPrice = number(project.price);
      state.maxAmount = soldOut ? 0 : 1;
      state.rotiniProject = project;
      state.action = project.active && !soldOut ? "rotini_finalize" : "";
      const projectName = bytesToText(project.name || "");
      const outputMode = bytesToText(project.output_mode || "").toUpperCase() || "ARTIFACT";
      if (!config.title && projectName) $("title").textContent = projectName;
      $("actionTitle").textContent = `Generate a ${outputMode} iteration`;
      $("actionDetail").textContent = `${minted} finalized + ${reserved} rendering${maxSupply == null ? "" : ` / ${maxSupply}`} · ${(state.unitPrice / 1_000_000).toFixed(6)} tez`;
      $("chainState").textContent = soldOut ? "Sold out" : project.active ? "Generation open" : "Generation closed";
      $("amountRow").hidden = true;
      $("rotiniStorage").hidden = false;
      $("submit").textContent = "Reserve, render & mint";
      $("submit").disabled = !state.action;
      return;
    }
    if (app === "penne") {
      state.action = "claim";
      $("actionTitle").textContent = "Claim your allocation";
      $("actionDetail").textContent = "The contract checks your connected wallet's allocation.";
      $("chainState").textContent = state.storage.claim_active ? "Claim open" : "Claim closed";
      $("amountRow").hidden = true;
      $("submit").textContent = "Claim allocation";
      $("submit").disabled = !state.storage.claim_active;
      return;
    }
    if (app === "ravioli") {
      const pack = await mapGet(state.storage.packs, tokenId);
      if (!pack) throw new Error("No Ravioli v3 pack exists for this token.");
      const sale = await mapGet(state.storage.sales, tokenId);
      const windowState = saleWindow(sale);
      const opened = number(await mapGet(state.storage.opened, tokenId));
      const supply = number(await mapGet(state.storage.total_supply, tokenId));
      const fullyReserved = pack.finalized && !pack.cancelled;
      const blind = ravioliNat(pack.mode, "Ravioli pack mode") > 0;
      const controllerState = blind ? await getRavioliPackStatus(tokenId) : null;
      const controllerStatus = controllerState ? assertRavioliControllerStatus(pack, controllerState.status, supply, sale) : null;
      state.ravioliControllerAddress = controllerState?.controllerAddress || "";
      state.ravioliRefundCredit = controllerState
        ? await ravioliRefundCredit(controllerState.controller, state.account)
        : 0;
      const deadlineDetail = ravioliDeadlineDetail(sale, pack, controllerStatus);
      const revealDeadline = timeMs(controllerStatus?.reveal_deadline);
      const openDeadline = timeMs(controllerStatus?.open_deadline);
      const now = Date.now();
      const refundOnly = blind && (
        controllerStatus.revealed
          ? openDeadline != null && now >= openDeadline
          : revealDeadline != null && now >= revealDeadline
      );
      const awaitingReveal = blind && !controllerStatus.revealed && !refundOnly;
      const canOpen = !blind || (
        controllerStatus.revealed
        && openDeadline != null
        && now < openDeadline
        && !controllerStatus.cancelled
      );
      $("ravioliOpen").hidden = false;
      $("rotiniStorage").hidden = false;
      if (windowState.open && number(sale.remaining) > 0) {
        state.action = "buy";
        state.unitPrice = number(sale.price);
        state.maxAmount = number(sale.remaining);
        $("actionTitle").textContent = blind ? "Buy this Limited Edition blind pack" : "Buy this atomic pack";
        $("actionDetail").textContent = `${number(sale.remaining)} available · ${(state.unitPrice / 1_000_000).toFixed(6)} tez each${deadlineDetail}${blind ? " · Reveal data is not needed to buy" : ""}`;
        $("chainState").textContent = fullyReserved ? "Primary sale open · fully reserved" : "Primary sale open · pack not ready";
        $("submit").textContent = "Buy pack editions";
        $("submit").disabled = false;
        if (canOpen && pack.finalized && !pack.cancelled) {
          state.secondaryAction = "open_pack";
          $("secondarySubmit").textContent = blind ? "Open one revealed pack" : "Open one held pack";
          $("secondarySubmit").hidden = false;
        }
        return;
      }
      if (refundOnly) {
        state.maxAmount = 1;
        $("amountRow").hidden = true;
        const refundClaimsClosed = Boolean(pack.cancelled) || Boolean(controllerStatus.cancelled);
        const holder = {
          pack_contract: config.contract,
          pack_token_id: tokenId,
          owner: state.account,
        };
        const claimCount = state.account
          ? ravioliNat(
            await executeContractView(controllerState.controller, "get_claim_count", holder, "Ravioli blind controller", state.account),
            "Ravioli holder claim count",
          )
          : 0;
        if (state.ravioliRefundCredit > 0) {
          state.action = "withdraw_refund";
          $("refundDestinationRow").hidden = false;
          if (!$("refundDestination").value.trim() && state.account) $("refundDestination").value = state.account;
          $("actionTitle").textContent = "Withdraw your credited Ravioli refund";
          $("actionDetail").textContent = `${(state.ravioliRefundCredit / 1_000_000).toFixed(6)} tez is credited to the connected holder${deadlineDetail} · Choose the current or another implicit Tezos account as destination. A rejected withdrawal leaves the credit intact.`;
          $("submit").textContent = "Withdraw refund credit";
          if (!refundClaimsClosed && claimCount > 0) {
            state.secondaryAction = "refund_blind_claims";
            $("secondarySubmit").textContent = "Credit another held pack refund";
            $("secondarySubmit").hidden = false;
          }
        } else if (!refundClaimsClosed && (!state.account || claimCount > 0)) {
          state.action = "refund_blind_claims";
          $("actionTitle").textContent = "Credit one unopened Limited Edition pack refund";
          $("actionDetail").textContent = `Delivery is closed${deadlineDetail} · This self-hosted page credits the connected current holder. The protocol and Ravioli Studio can trigger expiry for any holder, but credit always belongs to that holder—not the caller.`;
          $("submit").textContent = "Credit one held pack refund";
        } else {
          state.action = "";
          $("actionTitle").textContent = "Ravioli refund settlement complete";
          $("actionDetail").textContent = `No unopened claim or refund credit remains for the connected account${deadlineDetail}.`;
          $("submit").hidden = true;
        }
        $("chainState").textContent = controllerStatus.revealed
          ? "Open cutoff passed · refund-only"
          : "Reveal deadline missed · refund-only";
        $("submit").disabled = !state.action
          || (state.action === "refund_blind_claims" && refundClaimsClosed);
        return;
      }
      if (awaitingReveal) {
        state.action = "";
        $("amountRow").hidden = true;
        $("actionTitle").textContent = "Awaiting the authenticated reveal";
        $("actionDetail").textContent = `Opening stays locked until the creator publishes the committed reveal key${deadlineDetail}.`;
        $("chainState").textContent = "Primary sale ended · reveal pending";
        $("submit").hidden = true;
        return;
      }
      const discoveredKit = await discoverRavioliOpenKit(pack, tokenId, controllerState, supply, sale);
      if (discoveredKit && !$("openKit").value.trim()) {
        $("openKit").value = JSON.stringify(discoveredKit.kit, null, 2);
        $("openKit").dataset.source = discoveredKit.source;
        state.ravioliKitSource = discoveredKit.source;
      }
      const openKitDetail = state.ravioliKitSource
        ? ` · Open kit loaded from ${state.ravioliKitSource}`
        : blind
          ? " · The self-hosted page decrypts the authenticated reveal after the creator publishes its key"
          : " · Import the creator's open kit to open";
      state.action = "open_pack";
      state.maxAmount = 1;
      $("amountRow").hidden = true;
      $("actionTitle").textContent = blind ? "Open one revealed Limited Edition pack" : "Open one held pack";
      $("actionDetail").textContent = `${number(pack.item_count)} atomic child action(s) · ${opened}/${number(pack.max_supply)} opened${deadlineDetail}${openKitDetail}`;
      $("chainState").textContent = fullyReserved
        ? `${supply} wrappers live · fully reserved${blind ? " · transfers freeze at the open cutoff" : ""}`
        : "Pack closed";
      $("submit").textContent = "Open pack atomically";
      $("submit").disabled = !pack.finalized || pack.cancelled || !canOpen;
      return;
    }
    if (app === "spaghetti") {
      const sale = await mapGet(state.storage.sales, tokenId);
      const windowState = saleWindow(sale);
      if (windowState.open && number(sale.remaining) > 0) {
        state.action = "buy";
        state.unitPrice = number(sale.price);
        state.maxAmount = number(sale.remaining);
        $("actionTitle").textContent = "Buy directly from the creator";
        $("actionDetail").textContent = `${number(sale.remaining)} available · ${(state.unitPrice / 1_000_000).toFixed(6)} tez each`;
        $("chainState").textContent = "Primary sale open";
        $("submit").textContent = "Buy editions";
        $("submit").disabled = false;
      } else {
        state.action = "";
        $("actionTitle").textContent = "Creator-owned collection";
        $("actionDetail").textContent = sale ? "This primary sale is unavailable." : "No direct primary sale is configured for this token.";
        $("chainState").textContent = sale ? (number(sale.remaining) < 1 ? "Sold out" : windowState.label) : "Published";
        $("amountRow").hidden = true;
        $("submit").hidden = true;
      }
      return;
    }
    $("actionTitle").textContent = app === "lasagna" ? "On-chain exhibition" : "Creator-owned collection";
    $("actionDetail").textContent = app === "lasagna" ? "This page follows the curator's current on-chain revision." : "This contract does not expose a direct primary-sale entrypoint.";
    if (app !== "lasagna") $("chainState").textContent = "Published";
    $("amountRow").hidden = true;
    $("submit").hidden = true;
  }
  async function load() {
    $("appLabel").textContent = `${config.label || config.app || "Pasta"} · Pasta Protocol`;
    $("title").textContent = config.title || "Published work";
    $("description").textContent = config.description || "";
    $("network").textContent = config.network || "mainnet";
    $("itemId").textContent = config.app === "lasagna" ? "current" : String(config.tokenId || 0);
    $("contract").textContent = config.contract || "No contract configured";
    $("contract").href = explorerUrl();
    document.title = `${config.title || "Published work"} · Pasta Protocol`;
    if (!MD.isAddress(config.contract) || !config.contract.startsWith("KT1")) throw new Error("This site package needs a valid KT1 contract address.");
    MD.setupToolkit(config.network || "mainnet");
    if (config.app === "rotini" || config.app === "ravioli") {
      await MD.loadPlatformCapabilities();
      MD.updatePinProviderRows();
      await ensureRotiniRuntime();
    }
    state.contract = await MD.getToolkit().contract.at(config.contract);
    state.storage = await state.contract.storage();
    if (config.app === "lasagna") await loadExhibition();
    else await Promise.allSettled([loadMetadata()]);
    await configureAction();
    setStatus("On-chain state loaded.");
  }
  async function connect(forSubmission = false) {
    try {
      const actionWasPending = state.operationPending;
      const connection = await MD.connectWallet(config.label || "Pasta Protocol");
      state.account = typeof connection === "string" ? connection : connection.address;
      $("connect").textContent = `${state.account.slice(0, 7)}…${state.account.slice(-5)}`;
      if ((actionWasPending || state.operationPending) && forSubmission !== true) return;
      if (config.app === "ravioli") await configureAction();
      setStatus("Wallet connected. Review the action before signing.");
    } catch (error) { setStatus(error.message || "Wallet connection failed.", true); }
  }
  async function submit(actionOverride) {
    const requestedAction = actionOverride || state.action;
    if (!requestedAction || state.operationPending) return;
    const initialControls = {
      connectDisabled: $("connect").disabled,
      submitDisabled: $("submit").disabled,
      secondaryDisabled: $("secondarySubmit").disabled,
    };
    let actionControlsRefreshed = false;
    state.operationPending = true;
    $("connect").disabled = true;
    $("submit").disabled = true;
    $("secondarySubmit").disabled = true;
    try {
      if (!state.account) await connect(true);
      if (!state.account) return;
      await MD.assertOperationSafety();
      const amount = Number($("amount").value || 1);
      if (!Number.isSafeInteger(amount) || amount < 1) throw new Error("Amount must be a positive whole number.");
      if (state.maxAmount != null && amount > state.maxAmount) throw new Error(`Only ${state.maxAmount} editions remain.`);
      const tokenId = Number(config.tokenId || 0);
      const contract = await MD.getToolkit().wallet.at(config.contract);
      setStatus("Waiting for wallet signature…");
      let operation;
      const action = actionOverride || state.action;
      if (action === "rotini_finalize") {
        await window.PastaRotiniMint.run({ config, state, project: state.rotiniProject, setStatus, reload: load });
        return;
      }
      const payment = state.unitPrice * amount;
      if ((action === "open_mint" || action === "buy") && !Number.isSafeInteger(payment)) throw new Error("The total mutez amount is outside the safe transaction range.");
      if (action === "open_mint") operation = await contract.methodsObject.open_mint({ token_id: tokenId, amount }).send({ amount: payment, mutez: true });
      else if (action === "claim") operation = await contract.methodsObject.claim(tokenId).send();
      else if (action === "open_pack") operation = await ravioliOpen(contract, tokenId);
      else if (action === "refund_blind_claims") {
        const claim = await resolveRavioliClaim(tokenId, state.account);
        operation = await contract.methodsObject.refund_blind_claims({
          token_id: tokenId,
          holder: state.account,
          amount: 1,
          expected_claim_id: claim.expectedClaimId,
        }).send();
      }
      else if (action === "withdraw_refund") {
        const destination = $("refundDestination").value.trim() || state.account;
        if (!/^(?:tz1|tz2|tz3|tz4)/.test(destination) || !MD.isAddress(destination)) {
          throw new Error("Refund destination must be a valid implicit Tezos account.");
        }
        const controllerAddress = ravioliKt1(state.ravioliControllerAddress, "Ravioli blind controller");
        const controller = await MD.getToolkit().wallet.at(controllerAddress);
        operation = await controller.methodsObject.withdraw_refund({
          destination,
          amount: state.ravioliRefundCredit,
        }).send();
      }
      else if (action === "buy") operation = await contract.methodsObject.buy({ token_id: tokenId, amount }).send({ amount: payment, mutez: true });
      else return;
      const completedDelivery = action === "open_pack" ? state.pendingRavioliDelivery : null;
      await operation.confirmation();
      if (action === "refund_blind_claims") {
        MD.logEvent("ravioli.refund_credited", "Ravioli portable page credited an expired wrapper claim refund", {
          contract: config.contract,
          network: config.network,
          tokenId,
          holder: state.account,
        });
      } else if (action === "withdraw_refund") {
        MD.logEvent("ravioli.refund_withdrawn", "Ravioli portable page withdrew holder refund credit", {
          contract: config.contract,
          network: config.network,
          tokenId,
          owner: state.account,
          destination: $("refundDestination").value.trim() || state.account,
          amount: state.ravioliRefundCredit,
        });
      }
      await load();
      actionControlsRefreshed = true;
      if (completedDelivery) renderRavioliDelivery(completedDelivery, operation.opHash || operation.hash || "");
      setStatus("Confirmed on Tezos. On-chain state refreshed.");
    } catch (error) {
      try {
        await configureAction();
        actionControlsRefreshed = true;
      } catch (_) { /* Preserve the original operation error and prior control state. */ }
      setStatus(error.message || "The operation failed.", true);
    } finally {
      state.operationPending = false;
      $("connect").disabled = initialControls.connectDisabled;
      if (!actionControlsRefreshed) {
        $("submit").disabled = initialControls.submitDisabled;
        $("secondarySubmit").disabled = initialControls.secondaryDisabled;
      }
    }
  }
  $("connect").addEventListener("click", connect);
  $("submit").addEventListener("click", () => submit());
  $("secondarySubmit").addEventListener("click", () => submit(state.secondaryAction));
  $("pinProvider").addEventListener("change", MD.updatePinProviderRows);
  $("openKitFile").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (file) $("openKit").value = JSON.stringify(JSON.parse(await file.text()), null, 2);
    event.target.value = "";
  });
  load().catch((error) => setStatus(error.message || "Could not read the published work.", true));
})();
