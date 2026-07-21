/* Rotini studio — Pasta Protocol generative publisher.
 *
 * Forked from the Spaghetti/Gnocchi/Ravioli kernel: same proven Macaroni wallet/RPC/IPFS kernel
 * (window.MD via common.js) and Taquito bundle (window.TZ). Trait selection / rarity / uniqueness comes
 * from the parity-tested deterministic engine in pasta-foundation.js; artwork compositing is done here
 * with the browser <canvas> (no external dependencies). Publishing originates the dedicated
 * PastaGenerativeCollectionFA2 and registers the generator project. Collectors reserve an immutable
 * token id and seed, render/pin a normal artifact locally, then call `finalize_iteration`; metadata,
 * supply, and ownership do not exist before finalization.
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

const CONTRACT_ARTIFACT = "contract/pasta-generative-collection.contract.json";
const MD = window.MD;
const TZ = window.TZ;

const $ = (id) => document.getElementById(id);
const state = {
  network: "shadownet",
  layers: [],
  editions: [],
  pendingReservation: null,
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

function addLayer(initial) {
  const tpl = $("layerTpl").content.firstElementChild.cloneNode(true);
  const layer = { el: tpl, variantsEl: tpl.querySelector(".l-variants"), variants: [] };
  const initialName = typeof initial === "string" ? initial : initial?.name;
  if (initialName) tpl.querySelector(".l-name").value = initialName;
  tpl.querySelector(".l-add-variant").addEventListener("click", () => addVariant(layer));
  tpl.querySelector(".pp-layer-del").addEventListener("click", () => {
    state.layers = state.layers.filter((l) => l !== layer);
    tpl.remove();
    refreshCombos();
  });
  $("layers").appendChild(tpl);
  state.layers.push(layer);
  const variants = typeof initial === "object" && Array.isArray(initial?.variants) && initial.variants.length
    ? initial.variants
    : [{}];
  variants.forEach((variant) => addVariant(layer, variant));
  return layer;
}

function addVariant(layer, initial) {
  const tpl = $("variantTpl").content.firstElementChild.cloneNode(true);
  const variant = { el: tpl, img: null, file: null };
  if (initial?.value) tpl.querySelector(".v-label").value = initial.value;
  if (initial?.weight != null) tpl.querySelector(".v-weight").value = String(initial.weight);
  tpl.querySelector(".v-file").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      variant.img = null;
      variant.file = null;
      return;
    }
    variant.file = file;
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
          file: v.file,
        }))
        .filter((v) => v.value),
    }))
    .filter((l) => l.name && l.variants.length > 0);
}

function collectDraftLayers() {
  return state.layers.map((layer) => ({
    name: layer.el.querySelector(".l-name").value,
    variants: layer.variants.map((variant) => ({
      value: variant.el.querySelector(".v-label").value,
      weight: variant.el.querySelector(".v-weight").value,
    })),
  }));
}

function applyDraftLayers(layers) {
  state.layers.forEach((layer) => layer.el.remove());
  state.layers = [];
  (Array.isArray(layers) && layers.length ? layers : ["Background", "Foreground"]).forEach(addLayer);
  state.editions = [];
  $("preview").replaceChildren();
  $("genStatus").textContent = "Recovered layer settings. Reselect layer images, then generate a new preview.";
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

// ---------- publish / export ----------

async function loadContractArtifact() {
  const res = await fetch(CONTRACT_ARTIFACT);
  if (!res.ok) throw new Error("could not load contract artifact");
  return res.json();
}

async function originateCollection(provider, me, generatorUri, imageUri) {
  const relationship = readRelationship();
  const metadata = buildCollectionMetadata({
    name: $("collName").value.trim() || "Generative Collection",
    description: $("collDesc").value.trim() || undefined,
    symbol: $("collSymbol").value.trim() || undefined,
    imageUri,
    relationship,
    extra: { rotini: { generatorUri, mintModel: "collector-finalized-artifact-v2" } },
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
    projects: new M(),
    reservations: new M(),
    latest_reservation: new M(),
    token_project: new M(),
    token_seed: new M(),
    token_artifact: new M(),
    minted_by: new M(),
    reserved_by: new M(),
    pack_minters: new M(),
    pack_reserved: new M(),
    next_project_id: 0,
    next_reservation_id: 0,
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

async function nextProjectId(kt) {
  try {
    const c = await MD.getToolkit().contract.at(kt);
    const st = await c.storage();
    return Number(st.next_project_id ?? 0);
  } catch (_) {
    return 0;
  }
}

async function pinProjectDisplay(provider) {
  const coverFile = $("collCover").files?.[0];
  if (coverFile) {
    log("pinning collection cover…");
    return "ipfs://" + (await MD.pinBlob(provider, coverFile, coverFile.name));
  }
  if (!state.editions[0]?.canvas) throw new Error("generate a preview or select a collection cover");
  log("encoding and pinning collection preview…");
  const preview = await window.RotiniArtifacts.canvasToPng(state.editions[0].canvas);
  return "ipfs://" + (await MD.pinBlob(provider, preview, "rotini-collection-preview.png"));
}

async function pinGeneratorManifest(provider, config, baseName, size, outputMode, creator) {
  const layers = [];
  for (const layer of config) {
    const variants = [];
    for (const variant of layer.variants) {
      if (!variant.file) throw new Error(`select an image file for ${layer.name} / ${variant.value}`);
      log(`pinning generator layer ${layer.name} / ${variant.value}…`);
      const artifactUri = "ipfs://" + (await MD.pinBlob(provider, variant.file, variant.file.name));
      variants.push({
        value: variant.value,
        weight: variant.weight,
        artifactUri,
        mimeType: variant.file.type || "image/png",
      });
    }
    layers.push({ name: layer.name, variants });
  }
  const manifest = {
    schema: "pasta-rotini-generator@2",
    name: baseName,
    description: $("collDesc").value.trim() || undefined,
    creator,
    width: size,
    height: size,
    outputMode,
    seedField: "pasta:seed",
    selection: "weighted-deterministic",
    layers,
  };
  log("pinning generator manifest…");
  return "ipfs://" + (await MD.pinJson(provider, manifest, "rotini-generator.json"));
}

async function publish() {
  $("btnPublish").disabled = true;
  try {
    if (!MD.getAccount()) throw new Error("connect your wallet first");
    if (state.editions.length === 0) throw new Error("generate a preview first");
    const me = MD.getAccount();
    const provider = pinProvider();
    await MD.assertOperationSafety();
    const symbol = $("collSymbol").value.trim() || "ROTINI";
    const baseName = $("collName").value.trim() || "Generative";
    const config = readLayerConfig();
    const size = Math.max(64, Math.min(2048, parseInt($("genSize").value, 10) || 512));
    const outputMode = $("outputMode").value;
    const reservationMinutes = Math.max(5, Math.min(1440, parseInt($("reservationMinutes").value, 10) || 60));
    const displayUri = await pinProjectDisplay(provider);
    const generatorUri = await pinGeneratorManifest(provider, config, baseName, size, outputMode, me);
    const maxSupply = Math.max(1, parseInt($("genCount").value, 10) || 1);
    const walletCapRaw = parseInt($("saleWalletCap").value, 10);
    const walletCap = Number.isInteger(walletCapRaw) && walletCapRaw > 0 ? walletCapRaw : null;
    const priceMutez = Math.round(Math.max(0, Number($("salePrice").value) || 0) * 1_000_000);

    let kt;
    let startId;
    if (targetMode() === "new_collection") {
      kt = await originateCollection(provider, me, generatorUri, displayUri);
      startId = 0;
    } else {
      kt = $("existingKt").value.trim();
      if (!MD.isAddress(kt) || !kt.startsWith("KT1")) throw new Error("enter a KT1 contract you administer");
      startId = await nextProjectId(kt);
    }

    const tezos = MD.getToolkit();
    const contract = await tezos.wallet.at(kt);
    log("registering collector-finalized generator project (sign in wallet)…");
    const createOp = await contract.methodsObject.create_project({
      active: $("saleEnabled").checked,
      name: MD.utf8ToHex(baseName),
      symbol: MD.utf8ToHex(symbol),
      generator_uri: MD.utf8ToHex(generatorUri),
      display_uri: MD.utf8ToHex(displayUri),
      output_mode: MD.utf8ToHex(outputMode),
      price: priceMutez,
      treasury: me,
      max_supply: maxSupply,
      max_per_wallet: walletCap,
      reservation_ttl: reservationMinutes * 60,
    }).send();
    await createOp.confirmation();
    log("generative project published ✓ — no iteration tokens exist until collectors finalize artifacts");
    if (targetMode() === "new_collection") {
      MD.recordColanderContract(kt, "rotini");
      MD.logEvent("rotini.collection_deployed", "Rotini deployed a generative collection", {
        contract: kt,
        network: state.network,
      });
    }
    MD.logEvent("rotini.project_published", "Rotini published a collector-finalized generator", {
      contract: kt,
      network: state.network,
      projectId: startId,
      maxSupply,
      generatorUri,
      outputMode,
      reservationMinutes,
    });
    $("existingKt").value = kt;
    $("mintKt").value = kt;
    $("mintProjectId").value = String(startId);
    $("exportTokenId").value = String(startId);
    MD.notify(`Published ${outputMode.toUpperCase()} generator project ${startId}. Collector reservations become tokens only after artifact finalization.`, "success");
  } catch (e) {
    log("publish failed: " + (e.message || JSON.stringify(e)), "err");
    MD.notify("Publish failed: " + (e.message || e), "error");
  } finally {
    $("btnPublish").disabled = false;
  }
}

async function loadProject() {
  try {
    const kt = $("mintKt").value.trim();
    if (!MD.isAddress(kt)) return MD.notify("Enter the KT1 contract address.", "error");
    const projectId = parseInt($("mintProjectId").value, 10) || 0;
    const contract = await MD.getToolkit().contract.at(kt);
    const storage = await contract.storage();
    const project = await storage.projects.get(String(projectId));
    if (!project) throw new Error("no generator project at that id");
    const minted = Number(project.minted?.toString?.() ?? project.minted ?? 0);
    const reserved = Number(project.reserved?.toString?.() ?? project.reserved ?? 0);
    const maxSupply = project.max_supply && typeof project.max_supply === "object" && Object.prototype.hasOwnProperty.call(project.max_supply, "Some")
      ? project.max_supply.Some
      : project.max_supply;
    const max = maxSupply == null ? "∞" : String(maxSupply?.toString?.() ?? maxSupply);
    const price = Number(project.price?.toString?.() ?? project.price ?? 0) / 1_000_000;
    const outputMode = bytesText(project.output_mode || "").toUpperCase() || "ARTIFACT";
    $("mintInfo").textContent = `${project.active ? "minting open" : "minting closed"} · ${minted} finalized + ${reserved} rendering / ${max} · ${outputMode} · ${price.toFixed(6)} tez`;
  } catch (error) {
    $("mintInfo").textContent = "";
    MD.notify("Could not load project: " + (error.message || error), "error");
  }
}

function bytesText(value) {
  if (value == null) return "";
  const raw = typeof value === "string" ? value : String(value);
  try { return MD.hexToUtf8(raw); } catch (_) { return raw; }
}

function numberValue(value) {
  if (value == null) return 0;
  if (typeof value.toNumber === "function") return value.toNumber();
  const parsed = Number(typeof value.toString === "function" ? value.toString() : value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function mapGet(map, key) {
  if (!map || typeof map.get !== "function") return undefined;
  const direct = await map.get(key);
  if (direct !== undefined && direct !== null) return direct;
  if (typeof key === "number") return map.get(String(key));
  if (/^\d+$/.test(key)) return map.get(Number(key));
  return undefined;
}

async function loadImage(blob) {
  if (typeof createImageBitmap === "function") return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("could not decode a selected generator layer"));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function copyCanvas(source) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  canvas.getContext("2d").drawImage(source, 0, 0);
  return canvas;
}

async function renderReservedIteration(project, reservation) {
  const generatorUri = bytesText(project.generator_uri);
  const response = await fetch(MD.ipfsToHttp(generatorUri));
  if (!response.ok) throw new Error(`could not load generator manifest (${response.status})`);
  const manifest = await response.json();
  if (manifest.schema !== "pasta-rotini-generator@2") throw new Error("this project does not publish self-contained Rotini artifacts");
  const outputMode = bytesText(project.output_mode);
  if (!window.RotiniArtifacts.OUTPUTS[outputMode] || manifest.outputMode !== outputMode) {
    throw new Error("project output mode does not match its generator manifest");
  }
  const seed = String(reservation.seed || "");
  const traits = window.RotiniArtifacts.selectTraits(manifest, seed);
  const selectedLayers = [];
  for (const trait of traits) {
    log(`loading reserved layer ${trait.layer} / ${trait.value}…`);
    const layerResponse = await fetch(MD.ipfsToHttp(trait.artifactUri));
    if (!layerResponse.ok) throw new Error(`could not load ${trait.layer} / ${trait.value} (${layerResponse.status})`);
    const blob = await layerResponse.blob();
    const image = await loadImage(blob);
    selectedLayers.push({ ...trait, blob, image, mimeType: blob.type || trait.mimeType || "image/png" });
  }

  const size = Math.max(64, Math.min(2048, Number(manifest.width) || 512));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  const frames = [];
  for (const layer of selectedLayers) {
    context.drawImage(layer.image, 0, 0, size, size);
    frames.push(copyCanvas(canvas));
  }
  if (!frames.length) throw new Error("generator selection produced no renderable layers");

  let artifactBlob;
  if (outputMode === "png") {
    artifactBlob = await window.RotiniArtifacts.canvasToPng(canvas);
  } else if (outputMode === "gif") {
    artifactBlob = window.RotiniArtifacts.encodeGif(frames, { delayMs: 420 });
  } else {
    const packaged = await window.RotiniArtifacts.buildInteractiveZip({
      name: `${manifest.name || "Rotini"} #${numberValue(reservation.iteration) + 1}`,
      seed,
      tokenId: numberValue(reservation.token_id),
      projectId: numberValue(reservation.project_id),
      width: size,
      height: size,
      traits: traits.map(({ layer, value }) => ({ layer, value })),
      layers: selectedLayers.map((layer) => ({ name: layer.layer, mimeType: layer.mimeType, blob: layer.blob })),
    });
    artifactBlob = packaged.blob;
    log(`interactive ZIP validated offline (${packaged.validation.totalBytes.toLocaleString()} source bytes)`);
  }
  if (artifactBlob.size > window.RotiniArtifacts.MAX_ARTIFACT_BYTES) throw new Error("artifact exceeds Objkt's 250 MB limit");
  const coverBlob = outputMode === "zip" ? await window.RotiniArtifacts.canvasToPng(canvas) : artifactBlob;
  if (outputMode === "zip" && coverBlob.size > 2 * 1024 * 1024) throw new Error("interactive ZIP cover exceeds Objkt's 2 MB limit");
  return { artifactBlob, coverBlob, generatorUri, manifest, outputMode, seed, traits };
}

async function latestOpenReservation(storage, owner, projectId) {
  const reservationId = await mapGet(storage.latest_reservation, owner);
  if (reservationId == null) return null;
  const reservation = await mapGet(storage.reservations, numberValue(reservationId));
  if (!reservation || numberValue(reservation.project_id) !== projectId) return null;
  return { id: numberValue(reservationId), value: reservation };
}

async function finalizeReservedIteration(kt, projectId, project, reservationId, reservation, provider) {
  const rendered = await renderReservedIteration(project, reservation);
  const output = window.RotiniArtifacts.OUTPUTS[rendered.outputMode];
  const tokenId = numberValue(reservation.token_id);
  const iteration = numberValue(reservation.iteration);
  const name = `${rendered.manifest.name || "Rotini"} #${iteration + 1}`;
  const digest = await window.RotiniArtifacts.sha256(rendered.artifactBlob);

  log(`pinning finalized ${output.mimeType} artifact…`);
  const artifactUri = "ipfs://" + await MD.pinBlob(provider, rendered.artifactBlob, `rotini-${tokenId}.${output.extension}`);
  let displayUri = artifactUri;
  let thumbnailUri = artifactUri;
  if (rendered.outputMode === "zip") {
    log("pinning interactive token cover…");
    displayUri = "ipfs://" + await MD.pinBlob(provider, rendered.coverBlob, `rotini-${tokenId}-cover.png`);
    thumbnailUri = displayUri;
  }
  const creator = String(rendered.manifest.creator || project.treasury || "");
  const metadata = buildTokenMetadata({
    name,
    description: rendered.manifest.description || undefined,
    symbol: bytesText(project.symbol),
    artifactUri,
    displayUri,
    thumbnailUri,
    mimeType: output.mimeType,
    minter: MD.getAccount(),
    creators: creator ? [creator] : undefined,
    attributes: rendered.traits.map((trait) => ({ name: trait.layer, value: trait.value })),
    extra: {
      mintingTool: "Pasta Protocol Rotini 2",
      "pasta:seed": rendered.seed,
      "pasta:projectId": projectId,
      "pasta:iteration": iteration,
      "pasta:generatorUri": rendered.generatorUri,
      "pasta:artifactSha256": digest.hex,
      "pasta:artifactBytes": rendered.artifactBlob.size,
    },
  });
  log("pinning TZIP-21 token metadata…");
  const metadataUri = "ipfs://" + await MD.pinJson(provider, metadata, `rotini-${tokenId}.json`);
  const contract = await MD.getToolkit().wallet.at(kt);
  log(`finalizing reservation ${reservationId} (sign in wallet)…`);
  const operation = await contract.methodsObject.finalize_iteration({
    reservation_id: reservationId,
    metadata_uri: MD.utf8ToHex(metadataUri),
    artifact_uri: MD.utf8ToHex(artifactUri),
    display_uri: MD.utf8ToHex(displayUri),
    thumbnail_uri: MD.utf8ToHex(thumbnailUri),
    mime_type: MD.utf8ToHex(output.mimeType),
    artifact_hash: digest.hex,
  }).send();
  await operation.confirmation();
  return { operation, tokenId, artifactUri, metadataUri, outputMode: rendered.outputMode, digest: digest.hex };
}

async function mintIteration() {
  $("btnMintIteration").disabled = true;
  try {
    if (!MD.getAccount()) throw new Error("connect your wallet first");
    const kt = $("mintKt").value.trim();
    if (!MD.isAddress(kt)) throw new Error("enter the KT1 contract address");
    const projectId = parseInt($("mintProjectId").value, 10) || 0;
    await MD.assertOperationSafety();
    const provider = pinProvider();
    const readContract = await MD.getToolkit().contract.at(kt);
    let storage = await readContract.storage();
    const project = await mapGet(storage.projects, projectId);
    if (!project) throw new Error("this generator project does not exist");
    let pending = await latestOpenReservation(storage, MD.getAccount(), projectId);
    if (!pending) {
      if (!project.active) throw new Error("this generator project is not open");
      const price = numberValue(project.price);
      const contract = await MD.getToolkit().wallet.at(kt);
      log("reserving immutable token id and seed (sign in wallet)…");
      const reserveOperation = await contract.methodsObject.reserve_iteration(projectId).send({ amount: price, mutez: true });
      await reserveOperation.confirmation();
      storage = await readContract.storage();
      pending = await latestOpenReservation(storage, MD.getAccount(), projectId);
      if (!pending) throw new Error("reservation confirmed but could not be recovered from contract storage");
      log(`reservation ${pending.id} confirmed; rendering token ${numberValue(pending.value.token_id)} from its on-chain seed`);
    } else {
      log(`resuming unfinalized reservation ${pending.id}`);
    }
    state.pendingReservation = { contract: kt, projectId, ...pending };
    const result = await finalizeReservedIteration(kt, projectId, project, pending.id, pending.value, provider);
    state.pendingReservation = null;
    log(`collector finalized ${result.outputMode.toUpperCase()} token ${result.tokenId} with ${result.operation.opHash || result.operation.hash}`);
    MD.logEvent("rotini.iteration_minted", "Rotini collector finalized a self-contained iteration token", {
      contract: kt,
      network: state.network,
      projectId,
      tokenId: result.tokenId,
      outputMode: result.outputMode,
      artifactUri: result.artifactUri,
      metadataUri: result.metadataUri,
      artifactSha256: result.digest,
    });
    MD.notify(`${result.outputMode.toUpperCase()} iteration ${result.tokenId} finalized. Objkt-compatible metadata, supply, and ownership now exist on-chain.`, "success");
    await loadProject();
  } catch (error) {
    const recovery = state.pendingReservation ? ` Reservation ${state.pendingReservation.id} remains recoverable until expiry; press the button again to resume.` : "";
    MD.notify("Iteration mint failed: " + (error.message || error) + recovery, "error");
  } finally {
    $("btnMintIteration").disabled = false;
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
  $("btnLoadProject").addEventListener("click", loadProject);
  $("btnMintIteration").addEventListener("click", mintIteration);
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
    const id = await nextProjectId(kt);
    $("existingInfo").textContent = `next project id: ${id}`;
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

  window.PastaStudioDraft.start({
    app: "rotini",
    summary: () => $("collName").value.trim() || "Rotini generative draft",
    collect: () => ({ layers: collectDraftLayers() }),
    apply: (extra) => applyDraftLayers(extra.layers),
    afterApply: () => {
      state.network = $("network").value;
      document.querySelector('input[name="target"]:checked')?.dispatchEvent(new Event("change"));
      refreshCombos();
    },
  });
  window.PastaStudioContracts.start({
    app: "rotini",
    label: "Rotini",
    contractInputs: ["existingKt"],
    title: () => $("collName").value.trim(),
    onResume: () => {
      document.querySelector('input[name="target"][value="existing_contract"]').checked = true;
      document.querySelector('input[name="target"]:checked')?.dispatchEvent(new Event("change"));
    },
  });
}

wire();
