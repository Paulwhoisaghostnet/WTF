/* Gnocchi studio — Pasta Protocol open-edition publisher.
 *
 * Forked from the Spaghetti studio: same proven Macaroni wallet/RPC/IPFS kernel (window.MD via
 * common.js) and Taquito bundle (window.TZ). Pure metadata/package/pricing logic comes from the
 * parity-tested pasta-foundation.js (shared/pasta-protocol port).
 *
 * Chain flow (user-signed): pin cover + artifact + metadata -> originate PastaOpenEditionFA2 ->
 * create_open_edition (token + sale config). A separate public mint surface calls open_mint, paying the
 * exact bonding-curve cost computed locally with the same math the contract enforces. The on-chain
 * `current_price` view and `priceAtSupply` here agree. Rehearse on Shadownet before mainnet.
 */
import {
  buildCollectionMetadata,
  buildTokenMetadata,
  costForBatch,
  isCheasePackage,
  priceAtSupply,
  sanitizeRelationshipMetadata,
  validateBondingCurve,
  validateCheasePackage,
} from "./pasta-foundation.js";

const CONTRACT_ARTIFACT = "contract/pasta-open-edition.contract.json";
const MD = window.MD;
const TZ = window.TZ;
const MUTEZ_PER_TEZ = 1_000_000;

const $ = (id) => document.getElementById(id);
const state = {
  network: "shadownet",
  artifactUri: "",
  artifactMime: "",
};

function log(message, kind) {
  const el = $("log");
  const line = `${new Date().toLocaleTimeString()}  ${message}`;
  el.textContent += (el.textContent ? "\n" : "") + (kind === "err" ? "✗ " : "") + line;
  el.scrollTop = el.scrollHeight;
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

function tezToMutez(value) {
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * MUTEZ_PER_TEZ);
}

function fmtTez(mutez) {
  return `${(mutez / MUTEZ_PER_TEZ).toLocaleString(undefined, { maximumFractionDigits: 6 })} tez`;
}

function optMutez(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return tezToMutez(raw);
}

// Build the mutez bonding-curve config from the form (for validation + preview + contract params).
function readCurveConfig() {
  const base_price = tezToMutez($("basePrice").value);
  const increment = tezToMutez($("increment").value);
  const step_size = Math.max(1, parseInt($("stepSize").value, 10) || 1);
  const config = {
    base_price: base_price ?? 0,
    increment: increment ?? 0,
    step_size,
  };
  const min = optMutez($("minPrice").value);
  const max = optMutez($("maxPrice").value);
  if (min != null) config.minimum_price = min;
  if (max != null) config.maximum_price = max;
  return config;
}

function saleMode() {
  return $("saleMode").value;
}

function readMaxSupply() {
  if (saleMode() !== "capped") return null;
  const n = parseInt($("saleMaxSupply").value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function readWindow() {
  if (saleMode() !== "timed") return { start: null, end: null };
  const startRaw = $("saleStart").value;
  const endRaw = $("saleEnd").value;
  return {
    start: startRaw ? new Date(startRaw).toISOString() : null,
    end: endRaw ? new Date(endRaw).toISOString() : null,
  };
}

function refreshCurvePreview() {
  const config = readCurveConfig();
  const result = validateBondingCurve(config);
  if (!result.ok) {
    $("curvePreview").textContent = "";
    $("curveError").textContent = result.errors.join(" · ");
    return;
  }
  $("curveError").textContent = "";
  const first = priceAtSupply(config, 0);
  const afterStep = priceAtSupply(config, config.step_size);
  const cap = readMaxSupply();
  const last = cap ? priceAtSupply(config, Math.max(0, cap - 1)) : null;
  let text = `First mint: ${fmtTez(first)} · after ${config.step_size} sold: ${fmtTez(afterStep)}`;
  if (last != null) text += ` · final (#${cap}): ${fmtTez(last)}`;
  $("curvePreview").textContent = text;
}

// ---------- CH-EASE single-token import ----------

async function importPackage(file) {
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch (_) {
    return alert("That file is not valid JSON.");
  }
  const result = validateCheasePackage(parsed);
  if (!result.ok) return alert("Invalid CH-EASE package:\n" + result.errors.join("\n"));
  if (!isCheasePackage(parsed)) return alert("Unrecognized package.");
  const token = parsed.kind === "single_token" ? parsed.token : parsed.items?.[0];
  if (!token) return alert("Package has no token to import.");
  $("oeName").value = token.name || "";
  $("oeDesc").value = token.description || "";
  $("oeTags").value = (token.tags || []).join(", ");
  if (token.artifactUri) {
    state.artifactUri = token.artifactUri;
    state.artifactMime = token.mimeType || "";
    $("oeArtifactStatus").textContent = `artifact: ${token.artifactUri}`;
  }
  if (parsed.relationship) {
    $("relParent").value = parsed.relationship.parent_contract || "";
    $("relFranchise").value = parsed.relationship.franchise_contract || "";
    $("relGroup").value = parsed.relationship.collection_group || "";
  }
  log(`imported "${token.name}" from CH-EASE package`);
}

// ---------- wallet ----------

async function connect() {
  try {
    state.network = $("network").value;
    MD.setupToolkit(state.network);
    await MD.connectWallet("Gnocchi");
    const acc = MD.getAccount();
    $("account").textContent = MD.short(acc);
    if (!$("treasury").value.trim()) $("treasury").value = acc;
    log(`connected ${acc} on ${state.network}`);
  } catch (e) {
    log("connect failed: " + (e.message || e), "err");
    alert("Connect failed: " + (e.message || e));
  }
}

// ---------- publish ----------

async function loadContractArtifact() {
  const res = await fetch(CONTRACT_ARTIFACT);
  if (!res.ok) throw new Error("could not load contract artifact");
  return res.json();
}

async function publish() {
  $("btnPublish").disabled = true;
  try {
    if (!MD.getAccount()) throw new Error("connect your wallet first");
    const me = MD.getAccount();
    const name = $("oeName").value.trim();
    if (!name) throw new Error("the open edition needs a name");

    const config = readCurveConfig();
    const curve = validateBondingCurve(config);
    if (!curve.ok) throw new Error("fix the pricing: " + curve.errors.join("; "));

    const treasury = $("treasury").value.trim() || me;
    if (!MD.isAddress(treasury)) throw new Error("treasury must be a valid tz/KT address");

    const provider = pinProvider();
    await MD.assertOperationSafety();
    const relationship = readRelationship();
    const symbol = $("oeSymbol").value.trim() || undefined;

    // 1. Artifact
    let artifactUri = state.artifactUri;
    let mimeType = state.artifactMime;
    const artifactFile = $("oeArtifact").files?.[0];
    if (artifactFile) {
      log("pinning artifact…");
      artifactUri = "ipfs://" + (await MD.pinBlob(provider, artifactFile, artifactFile.name));
      mimeType = artifactFile.type || mimeType;
    }

    // 2. Cover + collection metadata
    let coverUri;
    const coverFile = $("oeCover").files?.[0];
    if (coverFile) {
      log("pinning cover image…");
      coverUri = "ipfs://" + (await MD.pinBlob(provider, coverFile, coverFile.name));
    }
    const collectionMeta = buildCollectionMetadata({
      name,
      description: $("oeDesc").value.trim() || undefined,
      symbol,
      imageUri: coverUri,
      relationship,
    });
    log("pinning collection metadata…");
    const collCid = await MD.pinJson(provider, collectionMeta, "collection.json");

    // 3. Token metadata
    const tags = $("oeTags")
      .value.split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const tokenMeta = buildTokenMetadata({
      name,
      description: $("oeDesc").value.trim() || undefined,
      symbol,
      artifactUri: artifactUri || undefined,
      mimeType: mimeType || undefined,
      creators: [me],
      minter: me,
      tags: tags.length ? tags : undefined,
      relationship,
    });
    log("pinning token metadata…");
    const tokenCid = await MD.pinJson(provider, tokenMeta, "token.json");

    // 4. Originate the open-edition contract
    const code = await loadContractArtifact();
    const M = TZ.MichelsonMap;
    const metadataMap = new M();
    metadataMap.set("", MD.utf8ToHex("ipfs://" + collCid));
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
    log("originating open-edition contract (sign in wallet)…");
    const tezos = MD.getToolkit();
    const op = await tezos.wallet.originate({ code, storage }).send();
    const contract = await op.contract();
    const kt = contract.address;
    log("contract deployed: " + kt);
    log("explorer: " + MD.explorerUrl(state.network, kt));

    // 5. create_open_edition (token + sale)
    const win = readWindow();
    const info = new M();
    info.set("", MD.utf8ToHex("ipfs://" + tokenCid));
    const sale = {
      active: true,
      start: win.start,
      end: win.end,
      base_price: config.base_price,
      increment: config.increment,
      step_size: config.step_size,
      min_price: config.minimum_price ?? null,
      max_price: config.maximum_price ?? null,
      max_supply: readMaxSupply(),
      treasury,
    };
    log("registering open edition + sale config (sign in wallet)…");
    const c = await tezos.wallet.at(kt);
    const createOp = await c.methodsObject.create_open_edition({ token_info: info, sale }).send();
    await createOp.confirmation();
    log("open edition live ✓ — token id 0");
    $("mintKt").value = kt;
    $("mintTokenId").value = "0";
    alert("Open edition deployed. Token id 0 is live for minting. See the log for explorer links.");
  } catch (e) {
    log("publish failed: " + (e.message || JSON.stringify(e)), "err");
    alert("Publish failed: " + (e.message || e));
  } finally {
    $("btnPublish").disabled = false;
  }
}

// ---------- public mint ----------

function bigToNum(value) {
  if (value == null) return null;
  return typeof value === "object" && typeof value.toNumber === "function" ? value.toNumber() : Number(value);
}

async function readSale(kt, tokenId) {
  const tezos = MD.getToolkit();
  const c = await tezos.contract.at(kt);
  const st = await c.storage();
  const sale = await st.sales.get(String(tokenId));
  if (!sale) throw new Error("no sale configured for that token id");
  const mintedRaw = await st.total_supply.get(String(tokenId));
  const minted = bigToNum(mintedRaw) || 0;
  const config = {
    base_price: bigToNum(sale.base_price) || 0,
    increment: bigToNum(sale.increment) || 0,
    step_size: bigToNum(sale.step_size) || 1,
  };
  const min = bigToNum(sale.min_price);
  const max = bigToNum(sale.max_price);
  if (min != null) config.minimum_price = min;
  if (max != null) config.maximum_price = max;
  return { sale, config, minted, active: sale.active, maxSupply: bigToNum(sale.max_supply) };
}

async function loadPrice() {
  try {
    const kt = $("mintKt").value.trim();
    if (!MD.isAddress(kt)) return alert("Enter the KT1 contract address.");
    const tokenId = parseInt($("mintTokenId").value, 10) || 0;
    const { config, minted, active, maxSupply } = await readSale(kt, tokenId);
    const unit = priceAtSupply(config, minted);
    let info = `unit price now: ${fmtTez(unit)} · ${minted} minted`;
    if (maxSupply != null) info += ` / ${maxSupply} cap`;
    if (!active) info += " · SALE PAUSED";
    $("mintInfo").textContent = info;
  } catch (e) {
    $("mintInfo").textContent = "";
    alert("Could not load price: " + (e.message || e));
  }
}

async function mint() {
  $("btnMint").disabled = true;
  try {
    if (!MD.getAccount()) throw new Error("connect your wallet first");
    const kt = $("mintKt").value.trim();
    if (!MD.isAddress(kt)) throw new Error("enter the KT1 contract address");
    const tokenId = parseInt($("mintTokenId").value, 10) || 0;
    const amount = Math.max(1, parseInt($("mintAmount").value, 10) || 1);
    await MD.assertOperationSafety();

    const { config, minted, active, maxSupply } = await readSale(kt, tokenId);
    if (!active) throw new Error("this sale is paused");
    if (maxSupply != null && minted + amount > maxSupply) throw new Error("not enough supply left");
    const cost = costForBatch(config, minted, amount);
    log(`minting ${amount} edition(s) for ${fmtTez(cost)} (sign in wallet)…`);

    const tezos = MD.getToolkit();
    const c = await tezos.wallet.at(kt);
    const op = await c.methodsObject
      .open_mint({ token_id: tokenId, amount })
      .send({ amount: cost, mutez: true });
    await op.confirmation();
    log("minted ✓");
    alert(`Minted ${amount} edition(s) for ${fmtTez(cost)}.`);
    await loadPrice();
  } catch (e) {
    log("mint failed: " + (e.message || JSON.stringify(e)), "err");
    alert("Mint failed: " + (e.message || e));
  } finally {
    $("btnMint").disabled = false;
  }
}

// ---------- wiring ----------

function wire() {
  $("network").addEventListener("change", () => {
    state.network = $("network").value;
  });
  $("btnConnect").addEventListener("click", connect);
  $("btnPublish").addEventListener("click", publish);
  $("btnLoadPrice").addEventListener("click", loadPrice);
  $("btnMint").addEventListener("click", mint);
  $("importPkg").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) importPackage(file);
    e.target.value = "";
  });
  $("pinProvider").addEventListener("change", () => {
    const kind = $("pinProvider").value;
    $("pinJwtRow").hidden = kind !== "pinata";
    $("pinNodeRow").hidden = kind !== "node";
  });
  $("saleMode").addEventListener("change", () => {
    const mode = saleMode();
    $("windowStartRow").hidden = mode !== "timed";
    $("windowEndRow").hidden = mode !== "timed";
    $("supplyCapRow").hidden = mode !== "capped";
    refreshCurvePreview();
  });
  ["basePrice", "increment", "stepSize", "minPrice", "maxPrice", "saleMaxSupply"].forEach((id) =>
    $(id).addEventListener("input", refreshCurvePreview)
  );

  refreshCurvePreview();
}

wire();
