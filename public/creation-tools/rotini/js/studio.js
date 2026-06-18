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
  maxCombinations,
  sanitizeRelationshipMetadata,
  traitAttributes,
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
  const kind = $("pinProvider").value;
  if (kind === "pinata") {
    const jwt = $("pinJwt").value.trim();
    if (!jwt) throw new Error("Enter your Pinata JWT, or switch pinning provider.");
    return { kind: "pinata", jwt };
  }
  if (kind === "node") {
    const url = $("pinNode").value.trim();
    if (!url) throw new Error("Enter your IPFS node URL, or switch pinning provider.");
    return { kind: "node", url };
  }
  return { kind: "wtfos" };
}

function readRelationship() {
  return sanitizeRelationshipMetadata({
    parent_contract: $("relParent").value,
    franchise_contract: $("relFranchise").value,
    collection_group: $("relGroup").value,
  });
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
    if (config.length === 0) return alert("Add at least one layer with a named variant.");
    const size = Math.max(64, Math.min(2048, parseInt($("genSize").value, 10) || 512));
    const count = Math.max(1, parseInt($("genCount").value, 10) || 1);
    const seed = $("genSeed").value.trim() || "rotini";
    const unique = $("genUnique").checked;

    const editions = generateEditions(engineLayers(config), count, seed, { unique });
    if (editions.length === 0) return alert("Nothing generated — check your layers.");

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
  } catch (e) {
    log("generate failed: " + (e.message || e), "err");
    alert("Generate failed: " + (e.message || e));
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
    log("generative collection published ✓");
    alert(`Published ${prepared.length} generative token(s) to ${kt}.`);
  } catch (e) {
    log("publish failed: " + (e.message || JSON.stringify(e)), "err");
    alert("Publish failed: " + (e.message || e));
  } finally {
    $("btnPublish").disabled = false;
  }
}

function exportPackage() {
  if (state.editions.length === 0) return alert("Generate a preview first.");
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
    alert("Connect failed: " + (e.message || e));
  }
}

function wire() {
  $("network").addEventListener("change", () => {
    state.network = $("network").value;
  });
  $("btnConnect").addEventListener("click", connect);
  $("btnAddLayer").addEventListener("click", () => addLayer());
  $("btnGenerate").addEventListener("click", generate);
  $("btnPublish").addEventListener("click", publish);
  $("btnExportPkg").addEventListener("click", exportPackage);
  $("pinProvider").addEventListener("change", () => {
    const kind = $("pinProvider").value;
    $("pinJwtRow").hidden = kind !== "pinata";
    $("pinNodeRow").hidden = kind !== "node";
  });
  document.querySelectorAll('input[name="target"]').forEach((radio) =>
    radio.addEventListener("change", () => {
      $("newCollectionFields").hidden = targetMode() !== "new_collection";
      $("existingContractFields").hidden = targetMode() !== "existing_contract";
    })
  );
  $("btnLoadContract").addEventListener("click", async () => {
    const kt = $("existingKt").value.trim();
    if (!MD.isAddress(kt)) return alert("Enter a KT1 address.");
    const id = await nextTokenId(kt);
    $("existingInfo").textContent = `next token id: ${id}`;
  });
  $("genCount").addEventListener("input", refreshCombos);

  addLayer("Background");
  addLayer("Foreground");
}

wire();
