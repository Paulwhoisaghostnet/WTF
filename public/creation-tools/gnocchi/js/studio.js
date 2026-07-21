/* Gnocchi studio — Pasta Protocol open-edition publisher.
 *
 * Forked from the Spaghetti studio: same proven Macaroni wallet/RPC/IPFS kernel (window.MD via
 * common.js) and Taquito bundle (window.TZ). Pure metadata/package/pricing logic comes from the
 * parity-tested pasta-foundation.js (shared/pasta-protocol port).
 *
 * Chain flow (user-signed): pin artifact + metadata -> originate a new PastaOpenEditionFA2 or verify an
 * existing app-owned collection -> create_open_edition with an independent timed OE, forever OE, or
 * capped timed LE policy. A separate public mint surface calls open_mint, paying the exact bonding-curve
 * cost computed locally with the same math the contract enforces. Rehearse on Shadownet before mainnet.
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
  verifiedCollection: null,
};

function log(message, kind) {
  const el = $("log");
  const line = `${new Date().toLocaleTimeString()}  ${message}`;
  el.textContent += (el.textContent ? "\n" : "") + (kind === "err" ? "✗ " : "") + line;
  el.scrollTop = el.scrollHeight;
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
  if (!new Set(["limited", "custom"]).has(saleMode())) return null;
  const n = parseInt($("saleMaxSupply").value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function readWindow() {
  if (!new Set(["timed", "limited", "custom"]).has(saleMode())) return { start: null, end: null };
  const startRaw = $("saleStart").value;
  const endRaw = $("saleEnd").value;
  return {
    start: startRaw ? new Date(startRaw).toISOString() : null,
    end: endRaw ? new Date(endRaw).toISOString() : null,
  };
}

function readCreatorReserve() {
  const value = parseInt($("creatorReserve").value, 10);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function readIssuancePolicy() {
  const mode = saleMode();
  const window = readWindow();
  const maxSupply = readMaxSupply();
  const creatorReserve = readCreatorReserve();
  if ((mode === "timed" || mode === "limited") && (!window.start || !window.end)) {
    throw new Error(`${mode === "limited" ? "Limited Edition" : "Timed OE"} requires both a start and end time`);
  }
  if (mode === "limited" && maxSupply == null) throw new Error("Limited Edition requires a maximum supply");
  if (window.start && window.end && Date.parse(window.start) > Date.parse(window.end)) {
    throw new Error("the issuance start must be before the end");
  }
  if (maxSupply != null && creatorReserve > maxSupply) {
    throw new Error("creator reserve cannot exceed the maximum supply");
  }
  return {
    mode,
    start: window.start,
    end: window.end,
    maxSupply,
    creatorReserve,
    lockPolicy: $("lockPolicy").checked,
  };
}

function optionValue(value) {
  if (value == null) return null;
  if (typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "Some")) return value.Some;
  if (typeof value === "object" && value.prim === "Some" && Array.isArray(value.args) && value.args.length === 1) {
    return value.args[0]?.string ?? value.args[0]?.int ?? value.args[0];
  }
  return value;
}

function optionDate(value) {
  const unwrapped = optionValue(value);
  if (unwrapped == null) return null;
  const candidate = typeof unwrapped === "object" && typeof unwrapped.toISOString === "function"
    ? unwrapped.toISOString()
    : typeof unwrapped === "object" && typeof unwrapped.string === "string"
      ? unwrapped.string
      : String(unwrapped);
  return Number.isFinite(Date.parse(candidate)) ? candidate : null;
}

function readableSale(sale) {
  if (!sale || typeof sale !== "object") return sale;
  return {
    ...sale,
    start: optionDate(sale.start),
    end: optionDate(sale.end),
    min_price: optionValue(sale.min_price),
    max_price: optionValue(sale.max_price),
    max_supply: optionValue(sale.max_supply),
  };
}

function issuanceLabel(rawSale) {
  const sale = readableSale(rawSale);
  const hasWindow = sale?.start != null || sale?.end != null;
  const hasCap = sale?.max_supply != null;
  if (hasWindow && hasCap) return "Limited Edition";
  if (hasWindow) return "Timed OE";
  if (hasCap) return "Capped OE";
  return "Forever OE";
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
  text += ` · preset: ${saleMode() === "limited" ? "Limited Edition" : saleMode() === "timed" ? "Timed OE" : saleMode() === "forever" ? "Forever OE" : "Custom"}`;
  $("curvePreview").textContent = text;
}

// ---------- CH-EASE single-token import ----------

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
  const token = parsed.kind === "single_token" ? parsed.token : parsed.items?.[0];
  if (!token) return MD.notify("Package has no token to import.", "error");
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
  log(`imported "${token.name}" from CH-EASE ${source || "package"}`);
  MD.notify(`Imported "${token.name}" from CH-EASE.`, "success");
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
    MD.notify("Connect failed: " + (e.message || e), "error");
  }
}

// ---------- publish ----------

async function loadContractArtifact() {
  const res = await fetch(CONTRACT_ARTIFACT);
  if (!res.ok) throw new Error("could not load contract artifact");
  return res.json();
}

function publishTarget() {
  return $("publishTarget").value;
}

function clearVerifiedCollection() {
  state.verifiedCollection = null;
  $("publishTargetStatus").textContent = "";
}

async function verifyExistingCollection({ announce = true } = {}) {
  if (!MD.getAccount()) throw new Error("connect the collection administrator wallet first");
  const kt = $("existingCollectionKt").value.trim();
  if (!MD.isAddress(kt) || !kt.startsWith("KT1")) throw new Error("enter a valid Gnocchi KT1 collection address");
  const tezos = MD.getToolkit();
  const contract = await tezos.contract.at(kt);
  if (
    typeof contract.methodsObject?.create_open_edition !== "function" ||
    typeof contract.methodsObject?.lock_sale_policy !== "function" ||
    typeof contract.methodsObject?.open_mint !== "function"
  ) {
    throw new Error("that contract does not expose the current Gnocchi multi-edition interface");
  }
  const storage = await contract.storage();
  if (!storage.total_minted || !storage.policy_locked || !storage.sales || !storage.token_metadata) {
    throw new Error("that contract uses an older or incompatible Gnocchi storage version");
  }
  if (String(storage.administrator) !== MD.getAccount()) {
    throw new Error("the connected wallet is not this Gnocchi collection's administrator");
  }
  const nextTokenId = bigToNum(storage.next_token_id);
  if (!Number.isSafeInteger(nextTokenId) || nextTokenId < 0) throw new Error("collection returned an invalid next token id");
  state.verifiedCollection = { contract: kt, nextTokenId };
  $("publishTargetStatus").textContent = `Verified administrator · next edition will be token #${nextTokenId}`;
  if (announce) {
    MD.logEvent("gnocchi.collection_verified", "Gnocchi verified an existing multi-edition collection", {
      contract: kt,
      network: state.network,
      nextTokenId,
    });
    MD.notify(`Collection verified. The next edition will be token #${nextTokenId}.`, "success");
  }
  return { contract, storage, nextTokenId };
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
    const policy = readIssuancePolicy();

    const treasury = $("treasury").value.trim() || me;
    if (!MD.isAddress(treasury)) throw new Error("treasury must be a valid tz/KT address");

    const provider = pinProvider();
    await MD.assertOperationSafety();
    const relationship = readRelationship();
    const symbol = $("oeSymbol").value.trim() || undefined;
    const target = publishTarget();
    let existing = null;
    if (target === "existing") existing = await verifyExistingCollection({ announce: false });

    // 1. Artifact
    let artifactUri = state.artifactUri;
    let mimeType = state.artifactMime;
    const artifactFile = $("oeArtifact").files?.[0];
    if (artifactFile) {
      log("pinning artifact…");
      artifactUri = "ipfs://" + (await MD.pinBlob(provider, artifactFile, artifactFile.name));
      mimeType = artifactFile.type || mimeType;
    }

    // 2. Cover + collection metadata (only a new KT1 owns new collection metadata).
    let coverUri;
    let collCid = "";
    if (target === "new") {
      const coverFile = $("oeCover").files?.[0];
      if (coverFile) {
        log("pinning collection cover image…");
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
      collCid = await MD.pinJson(provider, collectionMeta, "collection.json");
    }

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

    // 4. Originate a collection or use the verified existing multi-edition KT1.
    const M = TZ.MichelsonMap;
    const tezos = MD.getToolkit();
    let kt;
    let tokenId;
    let c;
    if (target === "new") {
      const code = await loadContractArtifact();
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
        total_minted: new M(),
        total_reserved: new M(),
        reserved_mints: new M(),
        sales: new M(),
        policy_locked: new M(),
        minters: new M(),
        next_token_id: 0,
      };
      log("originating multi-edition Gnocchi collection (sign in wallet)…");
      const op = await tezos.wallet.originate({ code, storage }).send();
      const contract = await op.contract();
      kt = contract.address;
      const originatedStorage = await (await tezos.contract.at(kt)).storage();
      tokenId = bigToNum(originatedStorage.next_token_id);
      if (!Number.isSafeInteger(tokenId) || tokenId < 0) throw new Error("originated collection returned an invalid next token id");
      c = await tezos.wallet.at(kt);
      log("collection deployed: " + kt);
      log("explorer: " + MD.explorerUrl(state.network, kt));
      MD.logEvent("gnocchi.collection_deployed", "Gnocchi deployed a multi-edition collection", {
        contract: kt,
        network: state.network,
      });
    } else {
      kt = existing.contract.address;
      tokenId = existing.nextTokenId;
      c = await tezos.wallet.at(kt);
      log(`adding edition token #${tokenId} to verified collection ${kt}`);
    }

    // 5. Register the next token id and its independently locked issuance policy.
    const info = new M();
    info.set("", MD.utf8ToHex("ipfs://" + tokenCid));
    const sale = {
      active: true,
      start: policy.start,
      end: policy.end,
      base_price: config.base_price,
      increment: config.increment,
      step_size: config.step_size,
      min_price: config.minimum_price ?? null,
      max_price: config.maximum_price ?? null,
      max_supply: policy.maxSupply,
      treasury,
    };
    log(`publishing ${policy.mode} edition #${tokenId} (sign in wallet)…`);
    const createOp = await c.methodsObject.create_open_edition({
      token_info: info,
      sale,
      creator_reserve: policy.creatorReserve,
      lock_policy: policy.lockPolicy,
    }).send();
    await createOp.confirmation();
    const confirmedStorage = await (await tezos.contract.at(kt)).storage();
    const confirmedNextTokenId = bigToNum(confirmedStorage.next_token_id);
    if (confirmedNextTokenId !== tokenId + 1) {
      throw new Error(`confirmed collection state did not advance from token #${tokenId}`);
    }
    const confirmedSale = await confirmedStorage.sales.get(String(tokenId));
    if (!confirmedSale) throw new Error(`confirmed collection state is missing sale policy for token #${tokenId}`);
    log(`${issuanceLabel(confirmedSale)} live ✓ — token id ${tokenId}`);
    $("mintKt").value = kt;
    $("mintTokenId").value = String(tokenId);
    $("existingCollectionKt").value = kt;
    state.verifiedCollection = { contract: kt, nextTokenId: confirmedNextTokenId };
    $("publishTargetStatus").textContent = `Collection now has ${confirmedNextTokenId} edition${confirmedNextTokenId === 1 ? "" : "s"} · next token #${confirmedNextTokenId}`;
    MD.recordColanderContract(kt, "gnocchi");
    MD.logEvent("gnocchi.edition_published", "Gnocchi published an open edition", {
      contract: kt,
      network: state.network,
      tokenId,
      saleMode: policy.mode,
      basePriceMutez: config.base_price,
      maxSupply: policy.maxSupply,
      start: policy.start,
      end: policy.end,
      creatorReserve: policy.creatorReserve,
      policyLocked: policy.lockPolicy,
      collectionTarget: target,
    });
    MD.notify(`${issuanceLabel(confirmedSale)} token #${tokenId} is live in ${MD.short(kt)}.`, "success");
    await loadCollectionEditions();
  } catch (e) {
    log("publish failed: " + (e.message || JSON.stringify(e)), "err");
    MD.notify("Publish failed: " + (e.message || e), "error");
  } finally {
    $("btnPublish").disabled = false;
  }
}

// ---------- public mint ----------

function bigToNum(value) {
  const unwrapped = optionValue(value);
  if (unwrapped == null) return null;
  const converted = typeof unwrapped === "object" && typeof unwrapped.toNumber === "function"
    ? unwrapped.toNumber()
    : Number(unwrapped);
  return Number.isFinite(converted) ? converted : null;
}

async function readSale(kt, tokenId) {
  const tezos = MD.getToolkit();
  const c = await tezos.contract.at(kt);
  const st = await c.storage();
  const rawSale = await st.sales.get(String(tokenId));
  if (!rawSale) throw new Error("no sale configured for that token id");
  const sale = readableSale(rawSale);
  const currentSupplyRaw = await st.total_supply.get(String(tokenId));
  const mintedRaw = st.total_minted ? await st.total_minted.get(String(tokenId)) : currentSupplyRaw;
  const minted = bigToNum(mintedRaw) || 0;
  const currentSupply = bigToNum(currentSupplyRaw) || 0;
  const lockedRaw = st.policy_locked ? await st.policy_locked.get(String(tokenId)) : false;
  const config = {
    base_price: bigToNum(sale.base_price) || 0,
    increment: bigToNum(sale.increment) || 0,
    step_size: bigToNum(sale.step_size) || 1,
  };
  const min = bigToNum(sale.min_price);
  const max = bigToNum(sale.max_price);
  if (min != null) config.minimum_price = min;
  if (max != null) config.maximum_price = max;
  return {
    sale,
    config,
    minted,
    currentSupply,
    locked: lockedRaw === true,
    active: sale.active,
    maxSupply: bigToNum(sale.max_supply),
  };
}

async function loadCollectionEditions() {
  const button = $("btnLoadCollectionEditions");
  button.disabled = true;
  try {
    const kt = $("mintKt").value.trim();
    if (!MD.isAddress(kt) || !kt.startsWith("KT1")) throw new Error("enter a valid Gnocchi KT1 collection address");
    const contract = await MD.getToolkit().contract.at(kt);
    const storage = await contract.storage();
    if (!storage.sales || !storage.total_supply || !storage.token_metadata) {
      throw new Error("that contract is not a readable Gnocchi collection");
    }
    const total = bigToNum(storage.next_token_id);
    if (!Number.isSafeInteger(total) || total < 0) throw new Error("collection returned an invalid edition count");
    const visibleTotal = Math.min(total, 250);
    const editions = await Promise.all(
      Array.from({ length: visibleTotal }, async (_, tokenId) => {
        const [sale, supplyRaw, mintedRaw, lockedRaw] = await Promise.all([
          Promise.resolve(storage.sales.get(String(tokenId))).then(readableSale),
          storage.total_supply.get(String(tokenId)),
          storage.total_minted ? storage.total_minted.get(String(tokenId)) : null,
          storage.policy_locked ? storage.policy_locked.get(String(tokenId)) : null,
        ]);
        return {
          tokenId,
          sale,
          supply: bigToNum(supplyRaw) || 0,
          minted: bigToNum(mintedRaw ?? supplyRaw) || 0,
          locked: lockedRaw === true,
        };
      })
    );
    const list = $("editionList");
    list.replaceChildren();
    for (const edition of editions) {
      if (!edition.sale) continue;
      const card = document.createElement("article");
      card.className = "pp-token";
      const heading = document.createElement("div");
      heading.className = "pp-token-head";
      const title = document.createElement("strong");
      title.textContent = `Token #${edition.tokenId} · ${issuanceLabel(edition.sale)}`;
      const use = document.createElement("button");
      use.type = "button";
      use.textContent = "Manage";
      use.addEventListener("click", () => {
        $("mintTokenId").value = String(edition.tokenId);
        void loadPrice();
      });
      heading.append(title, use);
      const facts = document.createElement("p");
      facts.className = "pp-note";
      const cap = bigToNum(edition.sale.max_supply);
      const boundaries = [];
      if (edition.sale.start) boundaries.push(`starts ${new Date(edition.sale.start).toLocaleString()}`);
      if (edition.sale.end) boundaries.push(`ends ${new Date(edition.sale.end).toLocaleString()}`);
      facts.textContent = [
        `${edition.supply} current supply`,
        `${edition.minted}${cap == null ? "" : ` / ${cap}`} lifetime minted`,
        edition.sale.active ? "issuance open" : "vaulted",
        edition.locked ? "policy locked" : "policy mutable",
        ...boundaries,
      ].join(" · ");
      card.append(heading, facts);
      list.append(card);
    }
    if (!editions.length) {
      const empty = document.createElement("p");
      empty.className = "pp-note";
      empty.textContent = "This collection does not contain any editions yet.";
      list.append(empty);
    }
    if (total > visibleTotal) {
      const bounded = document.createElement("p");
      bounded.className = "pp-warn";
      bounded.textContent = `Showing the first ${visibleTotal} of ${total} editions.`;
      list.append(bounded);
    }
    MD.logEvent("gnocchi.collection_editions_viewed", "Gnocchi listed collection editions", {
      contract: kt,
      network: state.network,
      editionCount: total,
    });
  } catch (error) {
    $("editionList").replaceChildren();
    MD.notify(`Could not list collection editions: ${error.message || error}`, "error");
  } finally {
    button.disabled = false;
  }
}

async function loadPrice() {
  try {
    const kt = $("mintKt").value.trim();
    if (!MD.isAddress(kt)) return MD.notify("Enter the KT1 contract address.", "error");
    const tokenId = parseInt($("mintTokenId").value, 10) || 0;
    const { sale, config, minted, currentSupply, locked, active, maxSupply } = await readSale(kt, tokenId);
    const unit = priceAtSupply(config, minted);
    let info = `${issuanceLabel(sale)} · unit price now: ${fmtTez(unit)} · ${minted} lifetime minted`;
    if (maxSupply != null) info += ` / ${maxSupply} cap`;
    if (currentSupply !== minted) info += ` · ${currentSupply} current supply after burns`;
    if (sale.start) info += ` · starts ${new Date(sale.start).toLocaleString()}`;
    if (sale.end) info += ` · ends ${new Date(sale.end).toLocaleString()}`;
    info += locked ? " · POLICY LOCKED" : " · POLICY MUTABLE";
    info += active ? " · ISSUANCE OPEN" : " · VAULTED — EXISTING TOKENS UNAFFECTED";
    $("mintInfo").textContent = info;
  } catch (e) {
    $("mintInfo").textContent = "";
    MD.notify("Could not load price: " + (e.message || e), "error");
  }
}

async function setIssuanceActive(active) {
  const button = active ? $("btnUnvaultEdition") : $("btnVaultEdition");
  button.disabled = true;
  try {
    if (!MD.getAccount()) throw new Error("connect the collection administrator wallet first");
    const kt = $("mintKt").value.trim();
    if (!MD.isAddress(kt)) throw new Error("enter the KT1 contract address");
    const tokenId = parseInt($("mintTokenId").value, 10) || 0;
    await MD.assertOperationSafety();

    const { active: current } = await readSale(kt, tokenId);
    if (current === active) {
      MD.notify(active ? "Issuance is already open." : "This edition is already vaulted.", "success");
      await loadPrice();
      return;
    }

    log(`${active ? "unvaulting" : "vaulting"} edition ${tokenId} (sign in administrator wallet)…`);
    const tezos = MD.getToolkit();
    const c = await tezos.wallet.at(kt);
    const op = await c.methodsObject.set_sale_active({ token_id: tokenId, active }).send();
    await op.confirmation();
    log(active ? "issuance reopened ✓" : "issuance vaulted ✓");
    MD.logEvent(
      active ? "gnocchi.edition_unvaulted" : "gnocchi.edition_vaulted",
      active ? "Gnocchi reopened open-edition issuance" : "Gnocchi vaulted open-edition issuance",
      { contract: kt, network: state.network, tokenId }
    );
    MD.notify(
      active ? "Edition unvaulted. New public mints are open again." : "Edition vaulted. New mints are closed; existing tokens are unchanged.",
      "success"
    );
    await loadPrice();
  } catch (e) {
    log(`${active ? "unvault" : "vault"} failed: ${e.message || JSON.stringify(e)}`, "err");
    MD.notify(`${active ? "Unvault" : "Vault"} failed: ${e.message || e}`, "error");
  } finally {
    button.disabled = false;
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
    MD.logEvent("gnocchi.edition_minted", "Gnocchi minted open-edition tokens", {
      contract: kt,
      network: state.network,
      tokenId,
      amount,
      costMutez: cost,
    });
    MD.notify(`Minted ${amount} edition(s) for ${fmtTez(cost)}.`, "success");
    await loadPrice();
  } catch (e) {
    log("mint failed: " + (e.message || JSON.stringify(e)), "err");
    MD.notify("Mint failed: " + (e.message || e), "error");
  } finally {
    $("btnMint").disabled = false;
  }
}

// ---------- wiring ----------

function wire() {
  MD.updatePinProviderRows();
  void MD.loadPlatformCapabilities();
  $("network").addEventListener("change", () => {
    state.network = $("network").value;
    clearVerifiedCollection();
  });
  $("btnConnect").addEventListener("click", connect);
  $("btnPublish").addEventListener("click", publish);
  $("btnVerifyCollection").addEventListener("click", async () => {
    $("btnVerifyCollection").disabled = true;
    try {
      await verifyExistingCollection();
    } catch (error) {
      clearVerifiedCollection();
      MD.notify(`Collection verification failed: ${error.message || error}`, "error");
    } finally {
      $("btnVerifyCollection").disabled = false;
    }
  });
  $("btnLoadPrice").addEventListener("click", loadPrice);
  $("btnLoadCollectionEditions").addEventListener("click", loadCollectionEditions);
  $("btnMint").addEventListener("click", mint);
  $("btnVaultEdition").addEventListener("click", () => setIssuanceActive(false));
  $("btnUnvaultEdition").addEventListener("click", () => setIssuanceActive(true));
  $("importPkg").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) importPackage(file);
    e.target.value = "";
  });
  $("pinProvider").addEventListener("change", MD.updatePinProviderRows);
  const refreshPolicyControls = () => {
    const mode = saleMode();
    const showWindow = mode === "timed" || mode === "limited" || mode === "custom";
    const showCap = mode === "limited" || mode === "custom";
    $("windowStartRow").hidden = !showWindow;
    $("windowEndRow").hidden = !showWindow;
    $("supplyCapRow").hidden = !showCap;
    $("saleStart").required = mode === "timed" || mode === "limited";
    $("saleEnd").required = mode === "timed" || mode === "limited";
    $("saleMaxSupply").required = mode === "limited";
    refreshCurvePreview();
  };
  $("saleMode").addEventListener("change", refreshPolicyControls);
  const refreshPublishTarget = () => {
    const existing = publishTarget() === "existing";
    $("existingCollectionRow").hidden = !existing;
    $("btnVerifyCollection").hidden = !existing;
    $("oeCover").disabled = existing;
    $("btnPublish").textContent = existing ? "Add edition to verified collection" : "Create collection & publish edition";
    clearVerifiedCollection();
  };
  $("publishTarget").addEventListener("change", refreshPublishTarget);
  $("existingCollectionKt").addEventListener("input", clearVerifiedCollection);
  ["basePrice", "increment", "stepSize", "minPrice", "maxPrice", "saleMaxSupply", "creatorReserve"].forEach((id) =>
    $(id).addEventListener("input", refreshCurvePreview)
  );

  refreshPolicyControls();
  refreshPublishTarget();
  const handoff = MD.consumeCheaseHandoff("gnocchi");
  if (handoff) importCheasePackage(handoff, "handoff");
  const routeHandoff = MD.readRouteHandoff();
  if (routeHandoff?.contract) {
    $("mintKt").value = routeHandoff.contract;
    $("existingCollectionKt").value = routeHandoff.contract;
    $("publishTarget").value = "existing";
    refreshPublishTarget();
  }
  if (routeHandoff?.projectTitle && !$("oeName").value) $("oeName").value = routeHandoff.projectTitle;

  window.PastaStudioDraft.start({
    app: "gnocchi",
    summary: () => $("oeName").value.trim() || "Gnocchi open-edition draft",
    collect: () => ({ artifactUri: state.artifactUri, artifactMime: state.artifactMime }),
    apply: (extra) => {
      state.artifactUri = extra.artifactUri || "";
      state.artifactMime = extra.artifactMime || "";
      $("oeArtifactStatus").textContent = state.artifactUri ? `artifact: ${state.artifactUri}` : "";
    },
    afterApply: () => {
      state.network = $("network").value;
      if (!["timed", "forever", "limited", "custom"].includes(saleMode())) $("saleMode").value = "custom";
      refreshPolicyControls();
      refreshPublishTarget();
    },
  });
  window.PastaStudioContracts.start({
    app: "gnocchi",
    label: "Gnocchi",
    contractInputs: ["mintKt", "existingCollectionKt"],
    title: () => $("oeName").value.trim(),
  });
}

wire();
