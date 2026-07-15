/* Rotini studio — Pasta Protocol generative publisher.
 *
 * Forked from the Spaghetti/Gnocchi/Ravioli kernel: same proven Macaroni wallet/RPC/IPFS kernel
 * (window.MD via common.js) and Taquito bundle (window.TZ). Trait selection / rarity / uniqueness comes
 * from the parity-tested deterministic engine in pasta-foundation.js; artwork compositing is done here
 * with the browser <canvas> (no external dependencies). Publishing reuses the standard Pasta FA2
 * (PastaStandardCollectionFA2) — no new contract. Large drops can also be exported as a CH-EASE
 * collection package for the user / trusted-creator backend to pin. Rehearse on Shadownet before mainnet.
 */
import {
  buildCollectionMetadata,
  buildCollectionPackage,
  buildTokenMetadata,
  generateEditions,
  isCheasePackage,
  maxCombinations,
  sanitizeRelationshipMetadata,
  traitAttributes,
  validateCheasePackage,
} from "./pasta-foundation.js";

const CONTRACT_ARTIFACT = "contract/pasta-standard-collection.contract.json";
const MD = window.MD;
const TZ = window.TZ;

const $ = (id) => document.getElementById(id);
const state = {
  network: "shadownet",
  layers: [],
  editions: [],
};

function log(message, kind) {
  const el = $("log");
  const line = `${new Date().toLocaleTimeString()}  ${message}`;
  el.textContent += (el.textContent ? "\n" : "") + (kind === "err" ? "✗ " : "") + line;
  el.scrollTop = el.scrollHeight;
}

function targetMode() {
  const checked = document.querySelector('input[name="target"]:checked');
  return checked ? checked.value : "new_collection";
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

// ---------- CH-EASE package import ----------

async function importPackage(file) {
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch (_) {
    return MD.notify("That file is not valid JSON.", "error");
  }
  return importCheasePackage(parsed, "file");
}

function importCheasePackage(parsed, source) {
  const result = validateCheasePackage(parsed);
  if (!result.ok) return MD.notify("Invalid CH-EASE package:\n" + result.errors.join("\n"), "error");
  if (!isCheasePackage(parsed)) return MD.notify("Unrecognized package.", "error");
  if (parsed.kind === "collection") {
    if (parsed.title) $("collName").value = parsed.title;
    if (parsed.symbol) $("collSymbol").value = parsed.symbol;
    if (parsed.description) $("collDesc").value = parsed.description;
  } else if (parsed.token?.name) {
    $("collName").value = parsed.token.name;
    if (parsed.token.description) $("collDesc").value = parsed.token.description;
  }
  if (parsed.relationship) {
    $("relParent").value = parsed.relationship.parent_contract || "";
    $("relFranchise").value = parsed.relationship.franchise_contract || "";
    $("relGroup").value = parsed.relationship.collection_group || "";
  }
  log(`imported collection context from CH-EASE ${source || "package"}`);
  MD.notify("Imported CH-EASE collection context. Build the layer traits in Rotini before publishing.", "success");
}

// ---------- layers & variants ----------

function addLayer(initialName) {
  const tpl = $("layerTpl").content.firstElementChild.cloneNode(true);
  const layer = { el: tpl, variantsEl: tpl.querySelector(".l-variants"), variants: [] };
  if (initialName) tpl.querySelector(".l-name").value = initialName;
  tpl.querySelector(".l-add-variant").addEventListener("click", () => addVariant(layer));
  tpl.querySelector(".pp-layer-del").addEventListener("click", () => {
    state.layers = state.layers.filter((l) => l !== layer);
    tpl.remove();
    refreshCombos();
  });
  $("layers").appendChild(tpl);
  state.layers.push(layer);
  addVariant(layer);
  return layer;
}

function addVariant(layer) {
  const tpl = $("variantTpl").content.firstElementChild.cloneNode(true);
  const variant = { el: tpl, img: null };
  tpl.querySelector(".v-file").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      variant.img = null;
      return;
    }
    const img = new Image();
    img.onload = () => {
      variant.img = img;
      let thumb = tpl.querySelector(".pp-variant-thumb");
      if (!thumb) {
        thumb = document.createElement("img");
        thumb.className = "pp-variant-thumb";
        tpl.insertBefore(thumb, tpl.querySelector(".pp-variant-del"));
      }
      thumb.src = img.src;
    };
    img.src = URL.createObjectURL(file);
  });
  tpl.querySelector(".pp-variant-del").addEventListener("click", () => {
    layer.variants = layer.variants.filter((v) => v !== variant);
    tpl.remove();
    refreshCombos();
  });
  layer.variantsEl.appendChild(tpl);
  layer.variants.push(variant);
  refreshCombos();
  return variant;
}

// Snapshot the current layer config: { name, variants: [{ value, weight, img }] }.
function readLayerConfig() {
  return state.layers
    .map((layer) => ({
      name: layer.el.querySelector(".l-name").value.trim(),
      variants: layer.variants
        .map((v) => ({
          value: v.el.querySelector(".v-label").value.trim(),
          weight: parseFloat(v.el.querySelector(".v-weight").value) || 1,
          img: v.img,
        }))
        .filter((v) => v.value),
    }))
    .filter((l) => l.name && l.variants.length > 0);
}

function engineLayers(config) {
  return config.map((l) => ({ name: l.name, variants: l.variants.map((v) => ({ value: v.value, weight: v.weight })) }));
}

function refreshCombos() {
  const combos = maxCombinations(engineLayers(readLayerConfig()));
  $("genCombos").textContent = combos > 0 ? `${combos} unique trait combination(s) possible` : "";
}

// ---------- generation / compositing ----------

function variantImage(config, layerName, value) {
  const layer = config.find((l) => l.name === layerName);
  if (!layer) return null;
  const variant = layer.variants.find((v) => v.value === value);
  return variant ? variant.img : null;
}

function compositeEdition(edition, config, size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  for (const trait of edition.traits) {
    const img = variantImage(config, trait.layer, trait.value);
    if (img) ctx.drawImage(img, 0, 0, size, size);
  }
  return canvas;
}

function generate() {
  try {
    const config = readLayerConfig();
    if (config.length === 0) return MD.notify("Add at least one layer with a named variant.", "error");
    const size = Math.max(64, Math.min(2048, parseInt($("genSize").value, 10) || 512));
    const count = Math.max(1, parseInt($("genCount").value, 10) || 1);
    const seed = $("genSeed").value.trim() || "rotini";
    const unique = $("genUnique").checked;

    const editions = generateEditions(engineLayers(config), count, seed, { unique });
    if (editions.length === 0) return MD.notify("Nothing generated — check your layers.", "error");

    const preview = $("preview");
    preview.textContent = "";
    state.editions = editions.map((edition) => {
      const canvas = compositeEdition(edition, config, size);
      const fig = document.createElement("figure");
      const view = document.createElement("canvas");
      view.width = size;
      view.height = size;
      view.getContext("2d").drawImage(canvas, 0, 0);
      const cap = document.createElement("figcaption");
      cap.textContent = `#${edition.index + 1}`;
      fig.appendChild(view);
      fig.appendChild(cap);
      preview.appendChild(fig);
      return { ...edition, canvas };
    });

    const requested = unique ? Math.min(count, maxCombinations(engineLayers(config))) : count;
    let status = `generated ${state.editions.length} edition(s) from seed "${seed}"`;
    if (unique && state.editions.length < count) status += ` (capped to ${requested} unique combos)`;
    $("genStatus").textContent = status;
    log(status);
    MD.logEvent("rotini.generated", "Rotini generated edition previews", {
      editionCount: state.editions.length,
      seed,
      unique,
    });
  } catch (e) {
    log("generate failed: " + (e.message || e), "err");
    MD.notify("Generate failed: " + (e.message || e), "error");
  }
}

function canvasToFile(canvas, name) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("canvas export failed"));
      resolve(new File([blob], name, { type: "image/png" }));
    }, "image/png");
  });
}

// ---------- publish / export ----------

async function loadContractArtifact() {
  const res = await fetch(CONTRACT_ARTIFACT);
  if (!res.ok) throw new Error("could not load contract artifact");
  return res.json();
}

async function originateCollection(provider, me) {
  const relationship = readRelationship();
  let imageUri;
  const coverFile = $("collCover").files?.[0];
  if (coverFile) {
    log("pinning cover image…");
    imageUri = "ipfs://" + (await MD.pinBlob(provider, coverFile, coverFile.name));
  }
  const metadata = buildCollectionMetadata({
    name: $("collName").value.trim() || "Generative Collection",
    description: $("collDesc").value.trim() || undefined,
    symbol: $("collSymbol").value.trim() || undefined,
    imageUri,
    relationship,
  });
  log("pinning collection metadata…");
  const metaCid = await MD.pinJson(provider, metadata, "collection.json");

  const code = await loadContractArtifact();
  const M = TZ.MichelsonMap;
  const metadataMap = new M();
  metadataMap.set("", MD.utf8ToHex("ipfs://" + metaCid));
  const storage = {
    administrator: me,
    pending_administrator: null,
    metadata: metadataMap,
    ledger: new M(),
    operators: new M(),
    token_metadata: new M(),
    total_supply: new M(),
    sales: new M(),
    minters: new M(),
    next_token_id: 0,
  };
  log("originating collection contract (sign in wallet)…");
  const tezos = MD.getToolkit();
  const op = await tezos.wallet.originate({ code, storage }).send();
  const contract = await op.contract();
  log("collection deployed: " + contract.address);
  log("explorer: " + MD.explorerUrl(state.network, contract.address));
  return contract.address;
}

async function nextTokenId(kt) {
  try {
    const c = await MD.getToolkit().contract.at(kt);
    const st = await c.storage();
    return Number(st.next_token_id ?? 0);
  } catch (_) {
    return 0;
  }
}

async function publish() {
  $("btnPublish").disabled = true;
  try {
    if (!MD.getAccount()) throw new Error("connect your wallet first");
    if (state.editions.length === 0) throw new Error("generate a preview first");
    const me = MD.getAccount();
    const provider = pinProvider();
    await MD.assertOperationSafety();
    const relationship = readRelationship();
    const symbol = $("collSymbol").value.trim() || undefined;
    const baseName = $("collName").value.trim() || "Generative";

    // Pin every composite + per-token metadata.
    const M = TZ.MichelsonMap;
    const prepared = [];
    for (const edition of state.editions) {
      const file = await canvasToFile(edition.canvas, `rotini-${edition.index + 1}.png`);
      log(`pinning artwork #${edition.index + 1}…`);
      const artifactUri = "ipfs://" + (await MD.pinBlob(provider, file, file.name));
      const meta = buildTokenMetadata({
        name: `${baseName} #${edition.index + 1}`,
        symbol,
        artifactUri,
        mimeType: "image/png",
        creators: [me],
        minter: me,
        attributes: traitAttributes(edition.traits),
        relationship,
      });
      log(`pinning metadata #${edition.index + 1}…`);
      const cid = await MD.pinJson(provider, meta, "token.json");
      const info = new M();
      info.set("", MD.utf8ToHex("ipfs://" + cid));
      prepared.push(info);
    }

    let kt;
    let startId;
    if (targetMode() === "new_collection") {
      kt = await originateCollection(provider, me);
      startId = 0;
    } else {
      kt = $("existingKt").value.trim();
      if (!MD.isAddress(kt) || !kt.startsWith("KT1")) throw new Error("enter a KT1 contract you administer");
      startId = await nextTokenId(kt);
    }

    const tezos = MD.getToolkit();
    const contract = await tezos.wallet.at(kt);
    log(`creating ${prepared.length} token type(s) (sign in wallet)…`);
    const createBatch = tezos.wallet.batch();
    prepared.forEach((info) => createBatch.withContractCall(contract.methodsObject.create_token(info)));
    const createOp = await createBatch.send();
    await createOp.confirmation();

    log(`minting ${prepared.length} edition(s) (sign in wallet)…`);
    const mintBatch = tezos.wallet.batch();
    prepared.forEach((_info, i) =>
      mintBatch.withContractCall(contract.methodsObject.mint({ to_: me, token_id: startId + i, amount: 1 }))
    );
    const mintOp = await mintBatch.send();
    await mintOp.confirmation();
    if ($("saleEnabled").checked) {
      const priceMutez = Math.round(Math.max(0, Number($("salePrice").value) || 0) * 1_000_000);
      log(`opening ${prepared.length} direct sale(s) (sign in wallet)…`);
      const saleBatch = tezos.wallet.batch();
      prepared.forEach((_info, i) => saleBatch.withContractCall(contract.methodsObject.set_sale({
        token_id: startId + i,
        sale: { active: true, seller: me, treasury: me, price: priceMutez, remaining: 1, start: null, end: null },
      })));
      const saleOp = await saleBatch.send();
      await saleOp.confirmation();
    }
    log("generative collection published ✓");
    if (targetMode() === "new_collection") {
      MD.recordColanderContract(kt, "rotini");
      MD.logEvent("rotini.collection_deployed", "Rotini deployed a generative collection", {
        contract: kt,
        network: state.network,
      });
    }
    MD.logEvent("rotini.tokens_published", "Rotini published generated tokens", {
      contract: kt,
      network: state.network,
      tokenCount: prepared.length,
      startTokenId: startId,
    });
    $("existingKt").value = kt;
    $("exportTokenId").value = String(startId);
    MD.notify(`Published ${prepared.length} generative token(s) to ${kt}.`, "success");
  } catch (e) {
    log("publish failed: " + (e.message || JSON.stringify(e)), "err");
    MD.notify("Publish failed: " + (e.message || e), "error");
  } finally {
    $("btnPublish").disabled = false;
  }
}

function exportPackage() {
  if (state.editions.length === 0) return MD.notify("Generate a preview first.", "error");
  const baseName = $("collName").value.trim() || "Generative";
  const items = state.editions.map((edition) => ({
    name: `${baseName} #${edition.index + 1}`,
    mimeType: "image/png",
    attributes: traitAttributes(edition.traits),
    tags: edition.traits.map((t) => t.value),
  }));
  const pkg = buildCollectionPackage({
    targetApp: "rotini",
    title: baseName,
    description: $("collDesc").value.trim() || undefined,
    symbol: $("collSymbol").value.trim() || undefined,
    relationship: readRelationship(),
    items,
  });
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `rotini-package-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  log(`exported CH-EASE collection package (${items.length} item(s); pin the artwork separately)`);
  MD.logEvent("rotini.package_exported", "Rotini exported a CH-EASE package", {
    tokenCount: items.length,
    targetApp: "rotini",
  });
}

// ---------- wallet & wiring ----------

async function connect() {
  try {
    state.network = $("network").value;
    MD.setupToolkit(state.network);
    await MD.connectWallet("Rotini");
    const acc = MD.getAccount();
    $("account").textContent = MD.short(acc);
    log(`connected ${acc} on ${state.network}`);
  } catch (e) {
    log("connect failed: " + (e.message || e), "err");
    MD.notify("Connect failed: " + (e.message || e), "error");
  }
}

function wire() {
  MD.updatePinProviderRows();
  void MD.loadPlatformCapabilities();
  $("network").addEventListener("change", () => {
    state.network = $("network").value;
  });
  $("btnConnect").addEventListener("click", connect);
  $("btnAddLayer").addEventListener("click", () => addLayer());
  $("btnGenerate").addEventListener("click", generate);
  $("btnPublish").addEventListener("click", publish);
  $("btnExportPkg").addEventListener("click", exportPackage);
  $("importPkg")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) importPackage(file);
    e.target.value = "";
  });
  $("pinProvider").addEventListener("change", MD.updatePinProviderRows);
  document.querySelectorAll('input[name="target"]').forEach((radio) =>
    radio.addEventListener("change", () => {
      $("newCollectionFields").hidden = targetMode() !== "new_collection";
      $("existingContractFields").hidden = targetMode() !== "existing_contract";
    })
  );
  $("btnLoadContract").addEventListener("click", async () => {
    const kt = $("existingKt").value.trim();
    if (!MD.isAddress(kt)) return MD.notify("Enter a KT1 address.", "error");
    const id = await nextTokenId(kt);
    $("existingInfo").textContent = `next token id: ${id}`;
  });
  $("genCount").addEventListener("input", refreshCombos);

  addLayer("Background");
  addLayer("Foreground");
  const handoff = MD.consumeCheaseHandoff("rotini");
  if (handoff) importCheasePackage(handoff, "handoff");
  const routeHandoff = MD.readRouteHandoff();
  if (routeHandoff?.contract) {
    $("existingKt").value = routeHandoff.contract;
    document.querySelector('input[name="target"][value="existing_contract"]').checked = true;
    $("newCollectionFields").hidden = true;
    $("existingContractFields").hidden = false;
  }
  if (routeHandoff?.projectTitle && !$("collName").value) $("collName").value = routeHandoff.projectTitle;
}

wire();
