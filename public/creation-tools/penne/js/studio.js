/* Penne studio — Pasta Protocol distribution publisher (airdrops & claims).
 *
 * Forked from the Spaghetti/Gnocchi studios: same proven Macaroni wallet/RPC/IPFS kernel (window.MD via
 * common.js) and Taquito bundle (window.TZ). Pure metadata + recipient-list logic comes from the
 * parity-tested pasta-foundation.js (shared/pasta-protocol port).
 *
 * Chain flow (user-signed): pin cover + artifact + metadata -> originate PastaDistributionFA2 ->
 * create_token -> set_allocations (batched). Distribution then happens in one of two modes that consume
 * the same loaded allocations: pull (open_claim + recipients call claim) or push (admin airdrop batches).
 * Per Bowers lesson: airdrop reports real per-batch tx state and never simulates success.
 */
import {
  buildCollectionMetadata,
  buildTokenMetadata,
  parseRecipientList,
  sanitizeRelationshipMetadata,
  totalAllocation,
} from "./pasta-foundation.js";

const CONTRACT_ARTIFACT = "contract/pasta-distribution.contract.json";
const MD = window.MD;
const TZ = window.TZ;

const $ = (id) => document.getElementById(id);
const state = {
  network: "shadownet",
  parsed: { entries: [], errors: [] },
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

// ---------- recipient list ----------

function defaultAmount() {
  return Math.max(1, parseInt($("defaultAmount").value, 10) || 1);
}

function parseList() {
  state.parsed = parseRecipientList($("recipients").value, defaultAmount());
  const { entries, errors } = state.parsed;
  $("sumCount").textContent = String(entries.length);
  $("sumTotal").textContent = String(totalAllocation(entries));
  $("sumErrCount").textContent = errors.length ? `${errors.length} bad line(s)` : "";
  const list = $("errors");
  list.innerHTML = "";
  errors.slice(0, 50).forEach((e) => {
    const li = document.createElement("li");
    li.textContent = `line ${e.line}: ${e.message}`;
    list.appendChild(li);
  });
  return state.parsed;
}

// ---------- wallet ----------

async function connect() {
  try {
    state.network = $("network").value;
    MD.setupToolkit(state.network);
    await MD.connectWallet("Penne");
    const acc = MD.getAccount();
    $("account").textContent = MD.short(acc);
    log(`connected ${acc} on ${state.network}`);
  } catch (e) {
    log("connect failed: " + (e.message || e), "err");
    alert("Connect failed: " + (e.message || e));
  }
}

// ---------- deploy ----------

async function loadContractArtifact() {
  const res = await fetch(CONTRACT_ARTIFACT);
  if (!res.ok) throw new Error("could not load contract artifact");
  return res.json();
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function deploy() {
  $("btnDeploy").disabled = true;
  try {
    if (!MD.getAccount()) throw new Error("connect your wallet first");
    const me = MD.getAccount();
    const tokenName = $("tokName").value.trim();
    if (!tokenName) throw new Error("the claimable token needs a name");

    const { entries, errors } = parseList();
    if (errors.length) throw new Error(`fix ${errors.length} bad recipient line(s) first`);
    if (entries.length === 0) throw new Error("add at least one recipient");

    const provider = pinProvider();
    await MD.assertOperationSafety();
    const relationship = readRelationship();
    const symbol = $("collSymbol").value.trim() || undefined;
    const M = TZ.MichelsonMap;

    // 1. Artifact
    let artifactUri = "";
    let mimeType = "";
    const artifactFile = $("tokFile").files?.[0];
    if (artifactFile) {
      log("pinning artifact…");
      artifactUri = "ipfs://" + (await MD.pinBlob(provider, artifactFile, artifactFile.name));
      mimeType = artifactFile.type || "";
    }

    // 2. Cover + collection metadata
    let coverUri;
    const coverFile = $("collCover").files?.[0];
    if (coverFile) {
      log("pinning cover image…");
      coverUri = "ipfs://" + (await MD.pinBlob(provider, coverFile, coverFile.name));
    }
    const collectionMeta = buildCollectionMetadata({
      name: $("collName").value.trim() || tokenName,
      description: $("tokDesc").value.trim() || undefined,
      symbol,
      imageUri: coverUri,
      relationship,
    });
    log("pinning collection metadata…");
    const collCid = await MD.pinJson(provider, collectionMeta, "collection.json");

    // 3. Token metadata
    const tags = $("tokTags")
      .value.split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const tokenMeta = buildTokenMetadata({
      name: tokenName,
      description: $("tokDesc").value.trim() || undefined,
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

    // 4. Originate the distribution contract
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
      allocations: new M(),
      claimed: new M(),
      claim_active: false,
      claim_start: null,
      claim_end: null,
      minters: new M(),
      next_token_id: 0,
    };
    log("originating distribution contract (sign in wallet)…");
    const tezos = MD.getToolkit();
    const op = await tezos.wallet.originate({ code, storage }).send();
    const contract = await op.contract();
    const kt = contract.address;
    log("contract deployed: " + kt);
    log("explorer: " + MD.explorerUrl(state.network, kt));
    $("contractKt").value = kt;

    // 5. create_token (id 0)
    const info = new M();
    info.set("", MD.utf8ToHex("ipfs://" + tokenCid));
    const c = await tezos.wallet.at(kt);
    log("registering claimable token product (sign in wallet)…");
    const createOp = await c.methodsObject.create_token(info).send();
    await createOp.confirmation();
    log("token id 0 registered ✓");

    // 6. set_allocations (batched: large lists exceed a single operation's gas/size)
    const allocs = entries.map((e) => ({ recipient: e.recipient, token_id: 0, amount: e.amount }));
    const groups = chunk(allocs, Math.max(1, parseInt($("batchSize").value, 10) || 50));
    let loaded = 0;
    for (let i = 0; i < groups.length; i++) {
      log(`loading allocations ${i + 1}/${groups.length} (${groups[i].length} recipients, sign in wallet)…`);
      const setOp = await c.methodsObject.set_allocations(groups[i]).send();
      await setOp.confirmation();
      loaded += groups[i].length;
      log(`allocations loaded: ${loaded}/${allocs.length}`);
    }
    log(`done — ${loaded} allocations live on ${kt}. Choose a distribution mode below.`);
    alert(`Distribution contract deployed with ${loaded} allocations.\n${kt}`);
  } catch (e) {
    log("deploy failed: " + (e.message || JSON.stringify(e)), "err");
    alert("Deploy failed: " + (e.message || e));
  } finally {
    $("btnDeploy").disabled = false;
  }
}

// ---------- distribute ----------

function contractAddress() {
  const kt = $("contractKt").value.trim();
  if (!MD.isAddress(kt) || !kt.startsWith("KT1")) throw new Error("enter the KT1 distribution contract");
  return kt;
}

function optIso(value) {
  const raw = String(value ?? "").trim();
  return raw ? new Date(raw).toISOString() : null;
}

async function setClaim(active) {
  const btn = active ? $("btnOpenClaim") : $("btnCloseClaim");
  btn.disabled = true;
  try {
    if (!MD.getAccount()) throw new Error("connect your wallet first");
    const kt = contractAddress();
    await MD.assertOperationSafety();
    const params = {
      active,
      start: active ? optIso($("claimStart").value) : null,
      end: active ? optIso($("claimEnd").value) : null,
    };
    log(`${active ? "opening" : "closing"} claim window (sign in wallet)…`);
    const c = await MD.getToolkit().wallet.at(kt);
    const op = await c.methodsObject.open_claim(params).send();
    await op.confirmation();
    log(`claim window ${active ? "OPEN ✓" : "closed ✓"}`);
  } catch (e) {
    log("claim config failed: " + (e.message || JSON.stringify(e)), "err");
    alert("Claim config failed: " + (e.message || e));
  } finally {
    btn.disabled = false;
  }
}

async function claim() {
  $("btnClaim").disabled = true;
  try {
    if (!MD.getAccount()) throw new Error("connect your wallet first");
    const kt = contractAddress();
    const tokenId = parseInt($("claimTokenId").value, 10) || 0;
    await MD.assertOperationSafety();
    log(`claiming allocation for token ${tokenId} (sign in wallet)…`);
    const c = await MD.getToolkit().wallet.at(kt);
    const op = await c.methodsObject.claim(tokenId).send();
    await op.confirmation();
    log("claimed ✓");
    alert("Claimed your allocation. See the log for details.");
  } catch (e) {
    log("claim failed: " + (e.message || JSON.stringify(e)), "err");
    alert("Claim failed: " + (e.message || e));
  } finally {
    $("btnClaim").disabled = false;
  }
}

async function airdrop() {
  $("btnAirdrop").disabled = true;
  try {
    if (!MD.getAccount()) throw new Error("connect your wallet first");
    const kt = contractAddress();
    const tokenId = parseInt($("airdropTokenId").value, 10) || 0;
    const { entries, errors } = parseList();
    if (errors.length) throw new Error(`fix ${errors.length} bad recipient line(s) first`);
    if (entries.length === 0) throw new Error("recipient list is empty");
    await MD.assertOperationSafety();

    const items = entries.map((e) => ({ recipient: e.recipient, token_id: tokenId }));
    const groups = chunk(items, Math.max(1, parseInt($("batchSize").value, 10) || 50));
    const c = await MD.getToolkit().wallet.at(kt);
    let done = 0;
    for (let i = 0; i < groups.length; i++) {
      log(`airdrop batch ${i + 1}/${groups.length} (${groups[i].length} recipients, sign in wallet)…`);
      const op = await c.methodsObject.airdrop(groups[i]).send();
      await op.confirmation();
      done += groups[i].length;
      log(`distributed: ${done}/${items.length}`);
    }
    log(`airdrop complete ✓ — ${done} recipients`);
    alert(`Airdropped to ${done} recipients.`);
  } catch (e) {
    log("airdrop failed (some batches may have succeeded — check the log): " + (e.message || JSON.stringify(e)), "err");
    alert("Airdrop failed: " + (e.message || e));
  } finally {
    $("btnAirdrop").disabled = false;
  }
}

// ---------- wiring ----------

function wire() {
  $("network").addEventListener("change", () => {
    state.network = $("network").value;
  });
  $("btnConnect").addEventListener("click", connect);
  $("btnParse").addEventListener("click", parseList);
  $("recipients").addEventListener("input", parseList);
  $("defaultAmount").addEventListener("input", parseList);
  $("btnDeploy").addEventListener("click", deploy);
  $("btnOpenClaim").addEventListener("click", () => setClaim(true));
  $("btnCloseClaim").addEventListener("click", () => setClaim(false));
  $("btnClaim").addEventListener("click", claim);
  $("btnAirdrop").addEventListener("click", airdrop);
  $("importCsv").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      $("recipients").value = await file.text();
      parseList();
    }
    e.target.value = "";
  });
  $("pinProvider").addEventListener("change", () => {
    const kind = $("pinProvider").value;
    $("pinJwtRow").hidden = kind !== "pinata";
    $("pinNodeRow").hidden = kind !== "node";
  });
}

wire();
