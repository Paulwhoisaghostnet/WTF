/* Ravioli Studio — Pasta Protocol atomic pack publisher.
 *
 * Ravioli never treats a manifest as delivery. Every wrapper recipe is committed and fully funded
 * before issuance. Opening invokes escrow transfers and/or typed Gnocchi/Rotini adapters in one Tezos
 * operation; any failed child operation reverts the entire tree and preserves the wrapper.
 */
import {
  buildBundleManifest,
  buildCollectionMetadata,
  buildTokenMetadata,
  isCheasePackage,
  sanitizeRelationshipMetadata,
  validateCheasePackage,
} from "./pasta-foundation.js";

const ARTIFACTS = {
  router: "contract/pasta-bundle.contract.json",
  gnocchiAdapter: "contract/pasta-gnocchi-pack-adapter.contract.json",
  rotiniAdapter: "contract/pasta-rotini-pack-adapter.contract.json",
};
const OPEN_KIT_SCHEMA = "pasta-ravioli-open-kit@3";
const PACK_MANIFEST_SCHEMA = "wtfos.pasta.pack-manifest.v2";
const MODE_NAMES = [
  "deterministic_vault",
  "blind_funded_pool",
  "blind_allocated_mint",
  "blind_generative_mint",
  "hybrid_atomic_pack",
];
const MD = window.MD;
const TZ = window.TZ;
const $ = (id) => document.getElementById(id);
const state = { network: "shadownet", members: [] };

function log(message, kind) {
  const el = $("log");
  const line = `${new Date().toLocaleTimeString()}  ${message}`;
  el.textContent += (el.textContent ? "\n" : "") + (kind === "err" ? "✗ " : "") + line;
  el.scrollTop = el.scrollHeight;
}

function bigToNum(value) {
  if (value == null) return 0;
  return typeof value === "object" && typeof value.toNumber === "function" ? value.toNumber() : Number(value);
}

function targetMode() {
  return document.querySelector('input[name="target"]:checked')?.value || "new_collection";
}

function pinProvider() {
  return MD.pinProviderFromForm();
}

function readRelationship() {
  return sanitizeRelationshipMetadata({
    parent_contract: $("relParent").value,
    franchise_contract: $("relFranchise").value,
    collection_group: $("relGroup").value,
  });
}

function randomHex(bytes = 32) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesFromHex(hex) {
  const clean = String(hex || "").replace(/^0x/, "");
  return Uint8Array.from(clean.match(/.{1,2}/g) || [], (part) => parseInt(part, 16));
}

function hexFromBytes(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function nonceCommitment(nonceHex) {
  if (typeof TZ.blake2b !== "function") throw new Error("Ravioli cryptographic helper is missing; rebuild the Tezos browser vendor");
  return hexFromBytes(TZ.blake2b(bytesFromHex(nonceHex), undefined, 32));
}

function payloadCommitment(payloadHex = "") {
  if (typeof TZ.blake2b !== "function") throw new Error("Ravioli cryptographic helper is missing; rebuild the Tezos browser vendor");
  return hexFromBytes(TZ.blake2b(bytesFromHex(payloadHex), undefined, 32));
}

async function sha256Hex(blob) {
  return hexFromBytes(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())));
}

function downloadJson(value, fileName) {
  const blob = new Blob([JSON.stringify(value, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function loadArtifact(name) {
  const response = await fetch(ARTIFACTS[name]);
  if (!response.ok) throw new Error(`could not load ${name} contract artifact`);
  const code = await response.json();
  if (!Array.isArray(code)) throw new Error(`${name} contract artifact is invalid`);
  return code;
}

function metadataMap(uri) {
  const map = new TZ.MichelsonMap();
  map.set("", MD.utf8ToHex(uri));
  return map;
}

function routerStorage(admin, metadataUri) {
  const M = TZ.MichelsonMap;
  return {
    administrator: admin,
    pending_administrator: null,
    metadata: metadataMap(metadataUri),
    ledger: new M(),
    operators: new M(),
    token_metadata: new M(),
    total_supply: new M(),
    packs: new M(),
    recipe_commitments: new M(),
    minted: new M(),
    opened: new M(),
    opened_by: new M(),
    asset_allowances: new M(),
    adapter_allowances: new M(),
    sales: new M(),
    minters: new M(),
    next_token_id: 0,
  };
}

function adapterStorage(admin, metadataUri, kind) {
  const M = TZ.MichelsonMap;
  const base = {
    administrator: admin,
    pending_administrator: null,
    metadata: metadataMap(metadataUri),
    routers: new M(),
    reservations: new M(),
    next_resource_id: 0,
  };
  return kind === "Gnocchi" ? { ...base, allocations: new M() } : { ...base, resources: new M() };
}

async function originateAdapter(admin, kind, artifactName) {
  const metadata = {
    name: `Pasta ${kind} Pack Adapter`,
    description: `Typed Ravioli helper for atomic ${kind} pack fulfillment.`,
    interfaces: ["TZIP-016"],
    pasta: { app: "ravioli", helper: `${kind.toLowerCase()}-pack-adapter`, version: 1 },
  };
  log(`pinning ${kind} adapter contract metadata…`);
  const metadataUri = `ipfs://${await MD.pinJson(pinProvider(), metadata, `pasta-${kind.toLowerCase()}-pack-adapter-contract.json`)}`;
  return originate(await loadArtifact(artifactName), adapterStorage(admin, metadataUri, kind), `${kind} ${kind === "Gnocchi" ? "allocation" : "generative"} adapter`);
}

async function originate(code, storage, label) {
  log(`originating ${label} (sign in wallet)…`);
  const operation = await MD.getToolkit().wallet.originate({ code, storage }).send();
  const contract = await operation.contract();
  log(`${label} deployed: ${contract.address}`);
  return contract.address;
}

function addMemberRow(initial = {}) {
  const element = $("memberRowTpl").content.firstElementChild.cloneNode(true);
  const member = { el: element };
  element.querySelector(".m-name").value = initial.name || "";
  element.querySelector(".m-type").value = initial.kind || initial.type || "escrow";
  element.querySelector(".m-kt").value = initial.fa2 || initial.adapter || initial.tokenContract || "";
  element.querySelector(".m-tid").value = String(initial.tokenId ?? initial.resourceId ?? 0);
  element.querySelector(".m-qty").value = String(initial.amount ?? initial.quantity ?? 1);
  element.querySelector(".m-uri").value = initial.uri || "";
  element.querySelector(".m-mime").value = initial.mimeType || "";
  element.querySelector(".pp-member-del").addEventListener("click", () => {
    state.members = state.members.filter((candidate) => candidate !== member);
    element.remove();
  });
  $("members").appendChild(element);
  state.members.push(member);
  return member;
}

function readMemberRow(member) {
  const element = member.el;
  const kind = element.querySelector(".m-type").value;
  const address = element.querySelector(".m-kt").value.trim();
  const id = Math.max(0, parseInt(element.querySelector(".m-tid").value, 10) || 0);
  const amount = Math.max(1, parseInt(element.querySelector(".m-qty").value, 10) || 1);
  return {
    name: element.querySelector(".m-name").value.trim(),
    kind,
    ...(kind === "escrow" ? { fa2: address, tokenId: id, amount } : { adapter: address, resourceId: id, amount }),
    uri: element.querySelector(".m-uri").value.trim(),
    mimeType: element.querySelector(".m-mime").value.trim(),
  };
}

function applyDraftMembers(members) {
  state.members.forEach((member) => member.el.remove());
  state.members = [];
  (Array.isArray(members) && members.length ? members : [{}]).forEach(addMemberRow);
}

function normalizeAction(raw) {
  const kind = String(raw?.kind || raw?.type || "").trim();
  if (kind === "escrow") {
    return {
      kind,
      fa2: String(raw.fa2 || raw.tokenContract || "").trim(),
      tokenId: Math.max(0, Number(raw.tokenId ?? raw.token_id ?? 0) || 0),
      amount: Math.max(1, Number(raw.amount ?? raw.quantity ?? 1) || 1),
      name: String(raw.name || "").trim(),
      uri: String(raw.uri || "").trim(),
      mimeType: String(raw.mimeType || "").trim(),
    };
  }
  if (kind === "allocated" || kind === "generative") {
    return {
      kind,
      adapter: String(raw.adapter || "").trim(),
      resourceId: Math.max(0, Number(raw.resourceId ?? raw.resource_id ?? 0) || 0),
      amount: kind === "allocated" ? Math.max(1, Number(raw.amount ?? raw.quantity ?? 1) || 1) : 1,
      name: String(raw.name || "").trim(),
      uri: String(raw.uri || "").trim(),
      mimeType: String(raw.mimeType || "").trim(),
    };
  }
  throw new Error(`unknown recipe action kind: ${kind || "empty"}`);
}

function readRecipes(editions) {
  const advanced = $("recipeJson").value.trim();
  let recipes;
  if (advanced) {
    const parsed = JSON.parse(advanced);
    if (!Array.isArray(parsed)) throw new Error("advanced recipe matrix must be an array");
    recipes = parsed.map((recipe) => {
      if (!Array.isArray(recipe)) throw new Error("every advanced recipe must be an action array");
      return recipe.map(normalizeAction);
    });
  } else {
    const visible = state.members.map(readMemberRow).map(normalizeAction);
    recipes = Array.from({ length: editions }, () => visible.map((action) => ({ ...action })));
  }
  if (recipes.length !== editions) throw new Error(`expected ${editions} recipes, received ${recipes.length}`);
  const itemCount = recipes[0]?.length || 0;
  if (itemCount < 1 || itemCount > 8) throw new Error("each pack recipe must contain 1–8 actions");
  if (recipes.some((recipe) => recipe.length !== itemCount)) throw new Error("every pack recipe must have the same action count");
  return recipes;
}

function validateMode(mode, recipes) {
  const every = (kind) => recipes.every((recipe) => recipe.every((action) => action.kind === kind));
  if (mode === 0 && !every("escrow")) throw new Error("deterministic vault recipes may contain only escrowed existing tokens");
  if (mode === 1 && !every("escrow")) throw new Error("blind funded-pool recipes may contain only escrowed existing tokens");
  if (mode === 2 && !every("allocated")) throw new Error("allocation packs may contain only Gnocchi allocation actions");
  if (mode === 3 && !every("generative")) throw new Error("generative packs may contain only Rotini generation actions");
  if (mode === 4) {
    for (const recipe of recipes) {
      const kinds = new Set(recipe.map((action) => action.kind));
      for (const kind of ["escrow", "allocated", "generative"]) {
        if (!kinds.has(kind)) throw new Error("every hybrid recipe must include escrow, allocation, and generative actions");
      }
    }
  }
}

async function importPackage(file) {
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return MD.notify("That file is not valid JSON.", "error");
  }
  return importCheasePackage(parsed, "file");
}

function importCheasePackage(parsed, source) {
  const result = validateCheasePackage(parsed);
  if (!result.ok || !isCheasePackage(parsed)) return MD.notify(`Invalid CH-EASE package:\n${result.errors.join("\n")}`, "error");
  const items = parsed.kind === "collection" ? parsed.items : [parsed.token];
  if (parsed.kind === "collection") {
    if (parsed.title) $("bnName").value = parsed.title;
    if (parsed.symbol) $("collSymbol").value = parsed.symbol;
    if (parsed.description) $("bnDesc").value = parsed.description;
  } else {
    if (parsed.token?.name) $("bnName").value = parsed.token.name;
    if (parsed.token?.description) $("bnDesc").value = parsed.token.description;
  }
  if (parsed.relationship) {
    $("relParent").value = parsed.relationship.parent_contract || "";
    $("relFranchise").value = parsed.relationship.franchise_contract || "";
    $("relGroup").value = parsed.relationship.collection_group || "";
  }
  for (const member of [...state.members]) {
    const row = readMemberRow(member);
    if (!row.name && !row.fa2 && !row.uri) {
      state.members = state.members.filter((candidate) => candidate !== member);
      member.el.remove();
    }
  }
  for (const item of items) {
    addMemberRow({
      name: item.name,
      kind: "escrow",
      tokenContract: item.tokenContract,
      tokenId: item.tokenId,
      uri: item.artifactUri || item.previewUri,
      mimeType: item.mimeType,
    });
  }
  log(`imported ${items.length} recipe reference(s) from CH-EASE ${source || "package"}`);
  MD.notify(`Imported ${items.length} recipe reference(s) from CH-EASE. Add a KT1/token id to every delivered item.`, "success");
}

async function connect() {
  try {
    state.network = $("network").value;
    MD.setupToolkit(state.network);
    await MD.connectWallet("Ravioli");
    $("account").textContent = MD.short(MD.getAccount());
    log(`connected ${MD.getAccount()} on ${state.network}`);
  } catch (error) {
    log(`connect failed: ${error.message || error}`, "err");
    MD.notify(`Connect failed: ${error.message || error}`, "error");
  }
}

async function nextTokenId(address) {
  const contract = await MD.getToolkit().contract.at(address);
  const storage = await contract.storage();
  return bigToNum(storage.next_token_id);
}

async function setupAdapters(routerAddress, recipes, admin) {
  const usesAllocated = recipes.some((recipe) => recipe.some((action) => action.kind === "allocated"));
  const usesGenerative = recipes.some((recipe) => recipe.some((action) => action.kind === "generative"));
  const auto = $("autoAdapters").checked;
  const tezos = MD.getToolkit();

  if (usesAllocated) {
    let adapter = $("gAdapterKt").value.trim();
    if (auto) {
      const target = $("gTargetKt").value.trim();
      if (!MD.isAddress(target) || !target.startsWith("KT1")) throw new Error("enter the Gnocchi KT1 used by allocated actions");
      if (!adapter) adapter = await originateAdapter(admin, "Gnocchi", "gnocchiAdapter");
      const adapterContract = await tezos.wallet.at(adapter);
      const adapterRead = await tezos.contract.at(adapter);
      const adapterStorageValue = await adapterRead.storage();
      const resourceId = bigToNum(adapterStorageValue.next_resource_id);
      const allocatedActions = recipes.flat().filter((action) => action.kind === "allocated");
      const amounts = new Set(allocatedActions.map((action) => action.amount));
      if (amounts.size !== 1) throw new Error("automatic Gnocchi adapter setup requires the same amount per opening in every allocation recipe");
      const targetContract = await tezos.wallet.at(target);
      log("authorizing allocation adapter on Gnocchi (sign in wallet)…");
      let operation = await targetContract.methodsObject.add_minter(adapter).send();
      await operation.confirmation();
      operation = await adapterContract.methodsObject.create_allocation({
        target,
        token_id: Math.max(0, parseInt($("gTokenId").value, 10) || 0),
        amount_per_open: allocatedActions[0].amount,
        active: true,
      }).send();
      await operation.confirmation();
      operation = await adapterContract.methodsObject.add_router(routerAddress).send();
      await operation.confirmation();
      recipes.flat().filter((action) => action.kind === "allocated").forEach((action) => {
        action.adapter = adapter;
        action.resourceId = resourceId;
      });
      $("gAdapterKt").value = adapter;
    } else {
      recipes.flat().filter((action) => action.kind === "allocated" && !action.adapter).forEach((action) => { action.adapter = adapter; });
    }
  }

  if (usesGenerative) {
    let adapter = $("rAdapterKt").value.trim();
    if (auto) {
      const target = $("rTargetKt").value.trim();
      if (!MD.isAddress(target) || !target.startsWith("KT1")) throw new Error("enter the Rotini KT1 used by generative actions");
      if (!adapter) adapter = await originateAdapter(admin, "Rotini", "rotiniAdapter");
      const adapterRead = await tezos.contract.at(adapter);
      const adapterStorageValue = await adapterRead.storage();
      const resourceId = bigToNum(adapterStorageValue.next_resource_id);
      const targetContract = await tezos.wallet.at(target);
      const adapterContract = await tezos.wallet.at(adapter);
      log("authorizing generative adapter on Rotini (sign in wallet)…");
      let operation = await targetContract.methodsObject.add_pack_minter(adapter).send();
      await operation.confirmation();
      operation = await adapterContract.methodsObject.create_resource({
        target,
        project_id: Math.max(0, parseInt($("rProjectId").value, 10) || 0),
        active: true,
      }).send();
      await operation.confirmation();
      operation = await adapterContract.methodsObject.add_router(routerAddress).send();
      await operation.confirmation();
      recipes.flat().filter((action) => action.kind === "generative").forEach((action) => {
        action.adapter = adapter;
        action.resourceId = resourceId;
      });
      $("rAdapterKt").value = adapter;
    } else {
      recipes.flat().filter((action) => action.kind === "generative" && !action.adapter).forEach((action) => { action.adapter = adapter; });
    }
  }

  for (const action of recipes.flat()) {
    const address = action.kind === "escrow" ? action.fa2 : action.adapter;
    if (!MD.isAddress(address) || !address.startsWith("KT1")) throw new Error(`${action.kind} action needs a valid KT1 contract`);
  }
}

async function approveEscrow(routerAddress, recipes, owner) {
  const byContract = new Map();
  for (const action of recipes.flat()) {
    if (action.kind !== "escrow") continue;
    const list = byContract.get(action.fa2) || new Set();
    list.add(action.tokenId);
    byContract.set(action.fa2, list);
  }
  for (const [fa2, tokenIds] of byContract) {
    const contract = await MD.getToolkit().wallet.at(fa2);
    const updates = [...tokenIds].map((tokenId) => ({ add_operator: { owner, operator: routerAddress, token_id: tokenId } }));
    log(`approving Ravioli escrow on ${MD.short(fa2)} (sign in wallet)…`);
    const operation = await contract.methodsObject.update_operators(updates).send();
    await operation.confirmation();
  }
}

function reservationFor(action) {
  if (action.kind === "escrow") return { escrow: { fa2: action.fa2, token_id: action.tokenId, amount: action.amount } };
  const value = {
    adapter: action.adapter,
    resource_id: action.resourceId,
    // Allocated recipes have one exact, empty adapter payload. Generative
    // output does not exist yet, so null deliberately commits the separate
    // generated-at-open policy rather than pretending an artifact was fixed.
    payload_commitment: action.kind === "allocated" ? payloadCommitment("") : null,
  };
  return action.kind === "allocated" ? { allocated_mint: value } : { generative_mint: value };
}

function kitAction(action) {
  if (action.kind === "escrow") return { kind: "escrow", fa2: action.fa2, tokenId: action.tokenId, amount: action.amount };
  return {
    kind: action.kind,
    adapter: action.adapter,
    resourceId: action.resourceId,
    payloadCommitment: action.kind === "allocated" ? payloadCommitment("") : null,
  };
}

async function publish() {
  $("btnPublish").disabled = true;
  try {
    if (!MD.getAccount()) throw new Error("connect your wallet first");
    await MD.assertOperationSafety();
    const admin = MD.getAccount();
    const provider = pinProvider();
    const name = $("bnName").value.trim();
    if (!name) throw new Error("the pack needs a name");
    const mode = Math.max(0, Math.min(4, parseInt($("bnMode").value, 10) || 0));
    const editions = Math.max(1, Math.min(64, parseInt($("bnEditions").value, 10) || 1));
    const saleCount = Math.max(1, parseInt($("bnSaleCount").value, 10) || 1);
    if ($("bnForSale").checked && saleCount > editions) throw new Error("sale quantity exceeds wrapper supply");
    const recipes = readRecipes(editions);
    validateMode(mode, recipes);
    const blind = mode > 0 || $("bnMystery").checked;
    const relationship = readRelationship();

    let wrapperArtifactUri;
    let wrapperMimeType;
    const wrapperFile = $("bnArtifact").files?.[0];
    if (wrapperFile) {
      log("pinning wrapper artwork…");
      wrapperArtifactUri = `ipfs://${await MD.pinBlob(provider, wrapperFile, wrapperFile.name)}`;
      wrapperMimeType = wrapperFile.type;
    }

    let coverUri;
    const cover = $("collCover").files?.[0];
    if (cover) coverUri = `ipfs://${await MD.pinBlob(provider, cover, cover.name)}`;
    const collectionMetadata = buildCollectionMetadata({
      name: $("collName").value.trim() || "Ravioli Atomic Packs",
      symbol: $("collSymbol").value.trim() || "RAV",
      imageUri: coverUri,
      relationship,
      interfaces: ["TZIP-012", "TZIP-016"],
      extra: { ravioli: { version: 2, fulfillment: "atomic" } },
    });
    const collectionUri = `ipfs://${await MD.pinJson(provider, collectionMetadata, "collection.json")}`;

    let routerAddress;
    let tokenId;
    if (targetMode() === "new_collection") {
      routerAddress = await originate(await loadArtifact("router"), routerStorage(admin, collectionUri), "Ravioli pack router");
      tokenId = 0;
      MD.recordColanderContract(routerAddress, "ravioli");
      MD.logEvent("ravioli.collection_deployed", "Ravioli deployed an atomic pack router", { contract: routerAddress, network: state.network });
    } else {
      routerAddress = $("existingKt").value.trim();
      if (!MD.isAddress(routerAddress) || !routerAddress.startsWith("KT1")) throw new Error("enter a Ravioli router KT1 you administer");
      tokenId = await nextTokenId(routerAddress);
    }

    await setupAdapters(routerAddress, recipes, admin);
    await approveEscrow(routerAddress, recipes, admin);

    // Adapter/resource addresses are part of the enforceable recipe. Pin public metadata only after
    // automatic helper setup has resolved those addresses so the manifest matches what is committed.
    const publicMembers = recipes[0].map((action) => ({
      name: action.name,
      uri: action.uri,
      mimeType: action.mimeType,
      tokenContract: action.kind === "escrow" ? action.fa2 : action.adapter,
      tokenId: action.kind === "escrow" ? action.tokenId : action.resourceId,
      quantity: action.kind === "escrow" ? action.amount : 1,
    }));
    const baseManifest = buildBundleManifest({ name, description: $("bnDesc").value.trim(), members: publicMembers, mystery: blind, relationship });
    const manifest = {
      ...baseManifest,
      schemaVersion: PACK_MANIFEST_SCHEMA,
      mode: MODE_NAMES[mode],
      maxSupply: editions,
      itemCount: recipes[0].length,
      funding: "fully-reserved-before-wrapper-issuance",
      fulfillment: "atomic-router-and-typed-adapters",
      blindSecurity: blind ? "commit-reveal-ui-hidden-chain-public" : "public-recipe",
      recipes: recipes.map((recipe) => recipe.map(kitAction)),
    };
    log("pinning pack manifest…");
    const manifestUri = `ipfs://${await MD.pinJson(provider, manifest, "ravioli-pack-manifest.json")}`;
    const tags = $("bnTags").value.split(",").map((tag) => tag.trim()).filter(Boolean);
    const tokenMetadata = buildTokenMetadata({
      name,
      description: $("bnDesc").value.trim() || undefined,
      symbol: $("collSymbol").value.trim() || "RAV",
      artifactUri: wrapperArtifactUri,
      mimeType: wrapperMimeType,
      creators: [admin],
      minter: admin,
      tags,
      relationship,
      extra: {
        ravioli: {
          version: 2,
          mode: MODE_NAMES[mode],
          itemCount: recipes[0].length,
          maxSupply: editions,
          manifestUri: blind ? undefined : manifestUri,
          fulfillment: "atomic",
          blindSecurity: blind ? "commit-reveal-ui-hidden-chain-public" : "public",
        },
      },
    });
    const tokenUri = `ipfs://${await MD.pinJson(provider, tokenMetadata, "token.json")}`;
    const router = await MD.getToolkit().wallet.at(routerAddress);
    const info = new TZ.MichelsonMap();
    info.set("", MD.utf8ToHex(tokenUri));
    info.set("name", MD.utf8ToHex(name));
    info.set("symbol", MD.utf8ToHex($("collSymbol").value.trim() || "RAV"));
    info.set("decimals", MD.utf8ToHex("0"));
    info.set("pasta:packMode", MD.utf8ToHex(MODE_NAMES[mode]));
    info.set("pasta:fulfillment", MD.utf8ToHex("atomic"));

    log("registering bounded pack config (sign in wallet)…");
    let operation = await router.methodsObject.create_pack({
      token_info: info,
      config: {
        mode,
        blind,
        item_count: recipes[0].length,
        max_supply: editions,
        committed_recipes: 0,
        finalized: false,
        cancelled: false,
        contents_uri: blind ? null : MD.utf8ToHex(manifestUri),
      },
    }).send();
    await operation.confirmation();

    const kit = {
      schema: OPEN_KIT_SCHEMA,
      network: state.network,
      contract: routerAddress,
      tokenId,
      mode: MODE_NAMES[mode],
      manifestUri,
      blindSecurity: blind ? "commit-reveal-ui-hidden-chain-public" : "public",
      warning: "Do not publish recipe nonces before you intend holders to open. Tezos funding operations remain public.",
      recipes: [],
    };
    for (let serial = 0; serial < recipes.length; serial += 1) {
      const nonce = randomHex();
      const recipe = recipes[serial];
      log(`funding recipe ${serial + 1}/${recipes.length} (sign in wallet)…`);
      operation = await router.methodsObject.commit_recipe({
        token_id: tokenId,
        nonce_commitment: nonceCommitment(nonce),
        reservations: recipe.map(reservationFor),
      }).send();
      await operation.confirmation();
      kit.recipes.push({ serial, nonce, actions: recipe.map(kitAction) });
    }

    log("finalizing pack after all backing is reserved (sign in wallet)…");
    operation = await router.methodsObject.finalize_pack(tokenId).send();
    await operation.confirmation();
    log(`minting ${editions} backed wrapper edition(s) (sign in wallet)…`);
    operation = await router.methodsObject.mint({ to_: admin, token_id: tokenId, amount: editions }).send();
    await operation.confirmation();

    if ($("bnForSale").checked) {
      const price = Math.round(Math.max(0, Number($("bnPrice").value) || 0) * 1_000_000);
      operation = await router.methodsObject.set_sale({
        token_id: tokenId,
        sale: { active: true, seller: admin, treasury: admin, price, remaining: saleCount, start: null, end: null },
      }).send();
      await operation.confirmation();
      log("direct wrapper sale opened ✓");
    }

    $("opKt").value = routerAddress;
    $("opTokenId").value = String(tokenId);
    $("openKit").value = JSON.stringify(kit, null, 2);
    $("revealUri").value = manifestUri;
    localStorage.setItem(`pasta.ravioli.open-kit.v3:${state.network}:${routerAddress}:${tokenId}`, JSON.stringify(kit));
    downloadJson(kit, `ravioli-open-kit-${tokenId}.json`);
    MD.recordColanderContract(routerAddress, "ravioli");
    MD.logEvent("ravioli.bundle_published", "Ravioli published a fully backed atomic pack", { contract: routerAddress, network: state.network, tokenId, mode: MODE_NAMES[mode] });
    MD.logEvent("ravioli.pack_published", "Ravioli finalized every recipe before wrapper issuance", { contract: routerAddress, network: state.network, tokenId, mode: MODE_NAMES[mode], editions });
    log(`pack ${tokenId} is fully reserved and ready — open kit downloaded`);
    MD.notify("Atomic pack deployed. Store the downloaded open kit safely; blind recipe nonces must not be published early.", "success");
  } catch (error) {
    log(`publish failed: ${error.message || JSON.stringify(error)}`, "err");
    MD.notify(`Publish failed: ${error.message || error}`, "error");
  } finally {
    $("btnPublish").disabled = false;
  }
}

async function loadBundle() {
  try {
    const address = $("opKt").value.trim();
    if (!MD.isAddress(address)) throw new Error("enter the Ravioli KT1");
    const tokenId = Math.max(0, parseInt($("opTokenId").value, 10) || 0);
    const storage = await (await MD.getToolkit().contract.at(address)).storage();
    const config = await storage.packs.get(String(tokenId));
    if (!config) throw new Error("no Ravioli v3 pack at that token id");
    const supply = bigToNum(await storage.total_supply.get(String(tokenId)));
    const opened = bigToNum(await storage.opened.get(String(tokenId)));
    const mode = MODE_NAMES[bigToNum(config.mode)] || `mode_${config.mode}`;
    $("opInfo").textContent = `${mode} · ${bigToNum(config.item_count)} item(s) per open · live wrapper supply ${supply} · opened ${opened}/${bigToNum(config.max_supply)} · ${config.finalized ? "fully reserved" : "not finalized"}`;
    const stored = localStorage.getItem(`pasta.ravioli.open-kit.v3:${state.network}:${address}:${tokenId}`);
    if (stored && !$("openKit").value.trim()) $("openKit").value = JSON.stringify(JSON.parse(stored), null, 2);
  } catch (error) {
    $("opInfo").textContent = "";
    MD.notify(`Could not load pack: ${error.message || error}`, "error");
  }
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

async function buildGenerativePayload(provider, name) {
  const artifact = $("openArtifact").files?.[0];
  if (!artifact) throw new Error("select the PNG, GIF, or offline ZIP generated for this opening");
  const allowed = new Set(["image/png", "image/gif", "application/zip"]);
  const mimeType = artifact.type || (artifact.name.toLowerCase().endsWith(".zip") ? "application/zip" : "");
  if (!allowed.has(mimeType)) throw new Error("generated artifact must be PNG, GIF, or application/zip");
  const artifactUri = `ipfs://${await MD.pinBlob(provider, artifact, artifact.name)}`;
  let displayFile = artifact;
  if (mimeType === "application/zip") {
    displayFile = $("openPreview").files?.[0];
    if (!displayFile || !["image/png", "image/gif"].includes(displayFile.type)) throw new Error("offline ZIP output needs a PNG or GIF display/thumbnail image");
  }
  const displayUri = displayFile === artifact ? artifactUri : `ipfs://${await MD.pinBlob(provider, displayFile, displayFile.name)}`;
  const metadata = buildTokenMetadata({
    name,
    artifactUri,
    displayUri,
    thumbnailUri: displayUri,
    mimeType,
    creators: [MD.getAccount()],
    minter: MD.getAccount(),
    extra: { ravioli: { generatedAtOpen: true } },
  });
  const metadataUri = `ipfs://${await MD.pinJson(provider, metadata, "ravioli-generated-token.json")}`;
  const ordered = [
    await sha256Hex(artifact),
    MD.utf8ToHex(artifactUri),
    MD.utf8ToHex(displayUri),
    MD.utf8ToHex(metadataUri),
    MD.utf8ToHex(mimeType),
    MD.utf8ToHex(displayUri),
  ].map((bytes) => ({ bytes }));
  const packer = new TZ.MichelCodecPacker();
  const result = await packer.packData({ data: nestedPair(ordered), type: nestedBytesType(ordered.length) });
  return result.packed;
}

async function openPack() {
  $("btnRedeem").disabled = true;
  try {
    if (!MD.getAccount()) throw new Error("connect your wallet first");
    await MD.assertOperationSafety();
    const kit = JSON.parse($("openKit").value.trim());
    if (kit?.schema !== OPEN_KIT_SCHEMA || !Array.isArray(kit.recipes)) throw new Error("paste or import a Ravioli v3 open kit");
    const address = $("opKt").value.trim();
    const tokenId = Math.max(0, parseInt($("opTokenId").value, 10) || 0);
    if (kit.contract !== address || Number(kit.tokenId) !== tokenId) throw new Error("open kit contract/token does not match the selected pack");
    const readContract = await MD.getToolkit().contract.at(address);
    const storage = await readContract.storage();
    const serial = bigToNum(await storage.opened.get(String(tokenId)));
    const recipe = kit.recipes[serial];
    if (!recipe) throw new Error(`open kit has no recipe for next serial ${serial}`);
    const provider = pinProvider();
    let generatedPayload;
    if (recipe.actions.some((action) => action.kind === "generative")) generatedPayload = await buildGenerativePayload(provider, `${kit.mode || "Ravioli"} #${serial + 1}`);
    const actions = recipe.actions.map((action) => {
      if (action.kind === "escrow") return { escrow: { fa2: action.fa2, token_id: action.tokenId, amount: action.amount } };
      if (action.kind === "allocated") return {
        allocated_mint: {
          adapter: action.adapter,
          resource_id: action.resourceId,
          payload: "",
          payload_commitment: action.payloadCommitment || payloadCommitment(""),
        },
      };
      if (action.kind === "generative") return {
        generative_mint: {
          adapter: action.adapter,
          resource_id: action.resourceId,
          payload: generatedPayload,
          payload_commitment: action.payloadCommitment || null,
        },
      };
      throw new Error(`unknown open action ${action.kind}`);
    });
    log(`opening serial ${serial} with ${actions.length} atomic child action(s) (sign in wallet)…`);
    const contract = await MD.getToolkit().wallet.at(address);
    const operation = await contract.methodsObject.open_pack({ token_id: tokenId, nonce: recipe.nonce, actions }).send();
    await operation.confirmation();
    log(`opened ✓ ${operation.opHash || operation.hash}`);
    MD.logEvent("ravioli.redeemed", "Ravioli opened and burned one wrapper", { contract: address, network: state.network, tokenId, serial });
    MD.logEvent("ravioli.pack_opened", "Ravioli atomically fulfilled a pack recipe", { contract: address, network: state.network, tokenId, serial, actions: actions.length });
    MD.notify("Pack opened. Every enclosed transfer/mint applied and the wrapper burned in the same operation.", "success");
    await loadBundle();
  } catch (error) {
    log(`open failed: ${error.message || JSON.stringify(error)}`, "err");
    MD.notify(`Open failed: ${error.message || error}`, "error");
  } finally {
    $("btnRedeem").disabled = false;
  }
}

async function reveal() {
  $("btnReveal").disabled = true;
  try {
    if (!MD.getAccount()) throw new Error("connect your wallet first");
    await MD.assertOperationSafety();
    const address = $("opKt").value.trim();
    const tokenId = Math.max(0, parseInt($("opTokenId").value, 10) || 0);
    const uri = $("revealUri").value.trim();
    if (!uri) throw new Error("enter the pinned contents manifest URI");
    const contract = await MD.getToolkit().wallet.at(address);
    const operation = await contract.methodsObject.set_pack_contents({ token_id: tokenId, contents_uri: MD.utf8ToHex(uri) }).send();
    await operation.confirmation();
    MD.logEvent("ravioli.contents_revealed", "Ravioli published pack contents", { contract: address, network: state.network, tokenId, uri });
    MD.notify("Pack contents URI published. This reveal is permanent.", "success");
    await loadBundle();
  } catch (error) {
    MD.notify(`Reveal failed: ${error.message || error}`, "error");
  } finally {
    $("btnReveal").disabled = false;
  }
}

function updateModeNote() {
  const mode = parseInt($("bnMode").value, 10) || 0;
  if (mode > 0) $("bnMystery").checked = true;
  $("bnMysteryNote").textContent = mode > 0
    ? "This pack uses commit/reveal. Its public page can hide recipes, but Tezos reservation operations remain inspectable."
    : "Deterministic vault: the declared existing-token recipe is delivered atomically.";
}

function wire() {
  MD.updatePinProviderRows();
  void MD.loadPlatformCapabilities();
  $("network").addEventListener("change", () => { state.network = $("network").value; });
  $("btnConnect").addEventListener("click", connect);
  $("btnAddMember").addEventListener("click", () => addMemberRow());
  $("btnPublish").addEventListener("click", publish);
  $("btnLoadBundle").addEventListener("click", loadBundle);
  $("btnRedeem").addEventListener("click", openPack);
  $("btnReveal").addEventListener("click", reveal);
  $("bnMode").addEventListener("change", updateModeNote);
  $("bnMystery").addEventListener("change", updateModeNote);
  $("pinProvider").addEventListener("change", MD.updatePinProviderRows);
  $("importPkg").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) void importPackage(file);
    event.target.value = "";
  });
  $("openKitFile").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (file) $("openKit").value = JSON.stringify(JSON.parse(await file.text()), null, 2);
    event.target.value = "";
  });
  document.querySelectorAll('input[name="target"]').forEach((radio) => radio.addEventListener("change", () => {
    $("newCollectionFields").hidden = targetMode() !== "new_collection";
    $("existingContractFields").hidden = targetMode() !== "existing_contract";
  }));
  $("btnLoadContract").addEventListener("click", async () => {
    try {
      const address = $("existingKt").value.trim();
      const contract = await MD.getToolkit().contract.at(address);
      const entrypoints = Object.keys(contract.entrypoints.entrypoints || {});
      for (const required of ["create_pack", "commit_recipe", "open_pack"]) if (!entrypoints.includes(required)) throw new Error(`missing ${required}`);
      $("existingInfo").textContent = `Ravioli v3 router · next token id ${await nextTokenId(address)}`;
    } catch (error) {
      $("existingInfo").textContent = `Not a compatible router: ${error.message || error}`;
    }
  });

  addMemberRow();
  updateModeNote();
  const handoff = MD.consumeCheaseHandoff("ravioli");
  if (handoff) importCheasePackage(handoff, "handoff");
  const routeHandoff = MD.readRouteHandoff();
  if (routeHandoff?.contract) $("opKt").value = routeHandoff.contract;
  if (routeHandoff?.projectTitle) $("bnName").value = routeHandoff.projectTitle;

  window.PastaStudioDraft.start({
    app: "ravioli",
    summary: () => $("bnName").value.trim() || "Ravioli atomic pack draft",
    collect: () => ({ members: state.members.map(readMemberRow) }),
    apply: (extra) => applyDraftMembers(extra.members),
    afterApply: () => { state.network = $("network").value; updateModeNote(); },
  });
  window.PastaStudioContracts.start({
    app: "ravioli",
    label: "Ravioli",
    contractInputs: ["existingKt", "opKt"],
    title: () => $("bnName").value.trim(),
    onResume: () => {
      document.querySelector('input[name="target"][value="existing_contract"]').checked = true;
      document.querySelector('input[name="target"]:checked')?.dispatchEvent(new Event("change"));
    },
  });
}

wire();
