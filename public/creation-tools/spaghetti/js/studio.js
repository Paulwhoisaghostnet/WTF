/* Spaghetti studio — Pasta Protocol standard collection + token-product publisher.
 *
 * Reuses the proven Macaroni wallet/RPC/IPFS kernel (window.MD, set up by common.js) and the Taquito
 * bundle (window.TZ). Pure metadata/package logic comes from the parity-tested pasta-foundation.js.
 *
 * Chain flow (user-signed, like Macaroni): pin metadata -> originate PastaStandardCollectionFA2 (or use
 * an admdinistered contract) -> batch create_token -> batch mint. Rehearse on Shadownet before mainnet.
 */
import {
  buildCollectionMetadata,
  buildCollectionPackage,
  buildTokenMetadata,
  isCheasePackage,
  sanitizeRelationshipMetadata,
  validateCheasePackage,
} from "./pasta-foundation.js";

const CONTRACT_ARTIFACT = "contract/pasta-standard-collection.contract.json";
const MD = window.MD;
const TZ = window.TZ;

const $ = (id) => document.getElementById(id);
const state = {
  network: "shadownet",
  tokens: [],
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

// ---------- token rows ----------

function addTokenRow(initial) {
  const tpl = $("tokenRowTpl").content.firstElementChild.cloneNode(true);
  const token = {
    el: tpl,
    name: initial?.name || "",
    description: initial?.description || "",
    editions: initial?.editions || 1,
    tags: initial?.tags || [],
    file: null,
    artifactUri: initial?.artifactUri || "",
    mimeType: initial?.mimeType || "",
  };
  tpl.querySelector(".t-name").value = token.name;
  tpl.querySelector(".t-desc").value = token.description;
  tpl.querySelector(".t-editions").value = String(token.editions);
  tpl.querySelector(".t-tags").value = token.tags.join(", ");
  if (token.artifactUri) tpl.querySelector(".t-status").textContent = `artifact: ${token.artifactUri}`;

  tpl.querySelector(".t-file").addEventListener("change", (e) => {
    token.file = e.target.files?.[0] || null;
    token.mimeType = token.file?.type || token.mimeType;
  });
  tpl.querySelector(".pp-token-del").addEventListener("click", () => {
    state.tokens = state.tokens.filter((t) => t !== token);
    tpl.remove();
  });
  $("tokens").appendChild(tpl);
  state.tokens.push(token);
  return token;
}

function readTokenRow(token) {
  token.name = token.el.querySelector(".t-name").value.trim();
  token.description = token.el.querySelector(".t-desc").value.trim();
  token.editions = Math.max(1, parseInt(token.el.querySelector(".t-editions").value, 10) || 1);
  token.tags = token.el
    .querySelector(".t-tags")
    .value.split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return token;
}

// ---------- CH-EASE package import/export ----------

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

  const items = parsed.kind === "collection" ? parsed.items : [parsed.token];
  if (parsed.kind === "collection") {
    if (parsed.title) $("collName").value = parsed.title;
    if (parsed.symbol) $("collSymbol").value = parsed.symbol;
    if (parsed.description) $("collDesc").value = parsed.description;
  }
  if (parsed.relationship) {
    $("relParent").value = parsed.relationship.parent_contract || "";
    $("relFranchise").value = parsed.relationship.franchise_contract || "";
    $("relGroup").value = parsed.relationship.collection_group || "";
  }
  items.forEach((item) =>
    addTokenRow({
      name: item.name,
      description: item.description,
      editions: 1,
      tags: item.tags || [],
      artifactUri: item.artifactUri || "",
      mimeType: item.mimeType || "",
    })
  );
  log(`imported ${items.length} token(s) from CH-EASE package`);
}

function exportPackage() {
  const items = state.tokens.map(readTokenRow).map((t) => ({
    name: t.name,
    description: t.description || undefined,
    artifactUri: t.artifactUri || undefined,
    mimeType: t.mimeType || undefined,
    tags: t.tags.length ? t.tags : undefined,
  }));
  const pkg = buildCollectionPackage({
    targetApp: "spaghetti",
    title: $("collName").value.trim() || "Untitled",
    description: $("collDesc").value.trim() || undefined,
    symbol: $("collSymbol").value.trim() || undefined,
    relationship: readRelationship(),
    items,
  });
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `spaghetti-package-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  log("exported CH-EASE package");
}

// ---------- wallet ----------

async function connect() {
  try {
    state.network = $("network").value;
    MD.setupToolkit(state.network);
    await MD.connectWallet("Spaghetti");
    const acc = MD.getAccount();
    $("account").textContent = MD.short(acc);
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

async function originateCollection(provider, me) {
  const relationship = readRelationship();
  let imageUri;
  const coverFile = $("collCover").files?.[0];
  if (coverFile) {
    log("pinning cover image…");
    imageUri = "ipfs://" + (await MD.pinBlob(provider, coverFile, coverFile.name));
  }
  const metadata = buildCollectionMetadata({
    name: $("collName").value.trim() || "Untitled Collection",
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

async function startTokenId(kt) {
  try {
    const c = await MD.getToolkit().contract.at(kt);
    const st = await c.storage();
    return Number(st.next_token_id ?? 0);
  } catch (_) {
    return 0;
  }
}

async function publishTokens(provider, kt, me, startId) {
  const tezos = MD.getToolkit();
  const contract = await tezos.wallet.at(kt);
  const relationship = readRelationship();
  const M = TZ.MichelsonMap;

  const prepared = [];
  for (const token of state.tokens.map(readTokenRow)) {
    if (!token.name) throw new Error("every token needs a name");
    let artifactUri = token.artifactUri;
    let mimeType = token.mimeType;
    if (token.file) {
      log(`pinning artifact for "${token.name}"…`);
      artifactUri = "ipfs://" + (await MD.pinBlob(provider, token.file, token.file.name));
      mimeType = token.file.type || mimeType;
    }
    const meta = buildTokenMetadata({
      name: token.name,
      description: token.description || undefined,
      symbol: $("collSymbol").value.trim() || undefined,
      artifactUri: artifactUri || undefined,
      mimeType: mimeType || undefined,
      creators: [me],
      minter: me,
      tags: token.tags.length ? token.tags : undefined,
      relationship,
    });
    log(`pinning token metadata for "${token.name}"…`);
    const cid = await MD.pinJson(provider, meta, "token.json");
    const info = new M();
    info.set("", MD.utf8ToHex("ipfs://" + cid));
    prepared.push({ info, editions: token.editions });
  }

  log(`creating ${prepared.length} token type(s) (sign in wallet)…`);
  const createBatch = tezos.wallet.batch();
  prepared.forEach((p) => createBatch.withContractCall(contract.methodsObject.create_token(p.info)));
  const createOp = await createBatch.send();
  await createOp.confirmation();
  log("token types created");

  log(`minting editions (sign in wallet)…`);
  const mintBatch = tezos.wallet.batch();
  prepared.forEach((p, index) =>
    mintBatch.withContractCall(
      contract.methodsObject.mint({ to_: me, token_id: startId + index, amount: p.editions })
    )
  );
  const mintOp = await mintBatch.send();
  await mintOp.confirmation();
  log("editions minted ✓");
}

async function publish() {
  $("btnPublish").disabled = true;
  try {
    if (!MD.getAccount()) throw new Error("connect your wallet first");
    if (state.tokens.length === 0) throw new Error("add at least one token product");
    const provider = pinProvider();
    const me = MD.getAccount();
    await MD.assertOperationSafety();

    let kt;
    let startId;
    if (targetMode() === "new_collection") {
      kt = await originateCollection(provider, me);
      startId = 0;
    } else {
      kt = $("existingKt").value.trim();
      if (!MD.isAddress(kt) || !kt.startsWith("KT1")) throw new Error("enter a KT1 contract you administer");
      startId = await startTokenId(kt);
    }
    await publishTokens(provider, kt, me, startId);
    log(`done — collection ${kt}`);
    alert("Published. See the log for explorer links.");
  } catch (e) {
    log("publish failed: " + (e.message || JSON.stringify(e)), "err");
    alert("Publish failed: " + (e.message || e));
  } finally {
    $("btnPublish").disabled = false;
  }
}

// ---------- wiring ----------

function wire() {
  $("network").addEventListener("change", () => {
    state.network = $("network").value;
  });
  $("btnConnect").addEventListener("click", connect);
  $("btnAddToken").addEventListener("click", () => addTokenRow());
  $("btnExportPkg").addEventListener("click", exportPackage);
  $("btnPublish").addEventListener("click", publish);
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
  document.querySelectorAll('input[name="target"]').forEach((radio) =>
    radio.addEventListener("change", () => {
      $("newCollectionFields").hidden = targetMode() !== "new_collection";
      $("existingContractFields").hidden = targetMode() !== "existing_contract";
    })
  );
  $("btnLoadContract").addEventListener("click", async () => {
    const kt = $("existingKt").value.trim();
    if (!MD.isAddress(kt)) return alert("Enter a KT1 address.");
    const id = await startTokenId(kt);
    $("existingInfo").textContent = `next token id: ${id}`;
  });

  addTokenRow();
}

wire();
