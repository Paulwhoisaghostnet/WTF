/* Lasagna studio — Pasta Protocol on-chain curation / exhibition publisher.
 *
 * Forked from the Spaghetti studio: same proven Macaroni wallet/RPC/IPFS kernel (window.MD via
 * common.js) and Taquito bundle (window.TZ). Pure reference-parsing + manifest logic comes from the
 * parity-tested pasta-foundation.js (shared/pasta-protocol port).
 *
 * Lasagna references existing tokens — it mints nothing and uploads no media. It pins only the small
 * exhibition manifest, then deploys/operates a PastaExhibitionRegistry: curator set + append-only
 * revisions (ordered token references) + a movable "current" pointer. Rehearse on Shadownet first.
 */
import {
  buildExhibitionMetadata,
  isCheasePackage,
  parseTokenReferences,
  validateCheasePackage,
} from "./pasta-foundation.js";

const CONTRACT_ARTIFACT = "contract/pasta-exhibition.contract.json";
const MD = window.MD;
const TZ = window.TZ;

const $ = (id) => document.getElementById(id);
const state = {
  network: "shadownet",
  parsed: { items: [], errors: [] },
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

function parseRefs() {
  state.parsed = parseTokenReferences($("refs").value);
  const { items, errors } = state.parsed;
  $("sumCount").textContent = String(items.length);
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

function itemReference(item, relationship) {
  const meta = item?.tokenMetadata && typeof item.tokenMetadata === "object" ? item.tokenMetadata : {};
  const contract = String(meta.contract || item.contract || relationship?.parent_contract || "").trim();
  const tokenId = Number(item?.tokenId ?? meta.tokenId);
  if (!/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(contract) || !Number.isInteger(tokenId) || tokenId < 0) {
    return "";
  }
  return `${contract}, ${tokenId}`;
}

function importCheasePackage(parsed, source) {
  const result = validateCheasePackage(parsed);
  if (!result.ok) return MD.notify("Invalid CH-EASE package:\n" + result.errors.join("\n"), "error");
  if (!isCheasePackage(parsed)) return MD.notify("Unrecognized package.", "error");
  const items = parsed.kind === "collection" ? parsed.items : [parsed.token];
  if (parsed.kind === "collection") {
    if (parsed.title) $("exName").value = parsed.title;
    if (parsed.description) $("exDesc").value = parsed.description;
    if (parsed.coverImageUri) $("exCover").value = parsed.coverImageUri;
  } else if (items[0]) {
    $("exName").value = items[0].name || "";
    $("exDesc").value = items[0].description || "";
    $("exCover").value = items[0].previewUri || items[0].artifactUri || "";
  }
  const refs = items.map((item) => itemReference(item, parsed.relationship)).filter(Boolean);
  if (refs.length) {
    $("refs").value = refs.join("\n");
    parseRefs();
  }
  log(`imported exhibition context from CH-EASE ${source || "package"}`);
  MD.notify(
    refs.length
      ? `Imported ${refs.length} token reference(s) from CH-EASE.`
      : "Imported CH-EASE exhibition context. Add KT1/token references before publishing.",
    "success"
  );
}

// ---------- wallet ----------

async function connect() {
  try {
    state.network = $("network").value;
    MD.setupToolkit(state.network);
    await MD.connectWallet("Lasagna");
    const acc = MD.getAccount();
    $("account").textContent = MD.short(acc);
    log(`connected ${acc} on ${state.network}`);
  } catch (e) {
    log("connect failed: " + (e.message || e), "err");
    MD.notify("Connect failed: " + (e.message || e), "error");
  }
}

// ---------- deploy ----------

async function loadContractArtifact() {
  const res = await fetch(CONTRACT_ARTIFACT);
  if (!res.ok) throw new Error("could not load contract artifact");
  return res.json();
}

function contractAddress() {
  const kt = $("contractKt").value.trim();
  if (!MD.isAddress(kt) || !kt.startsWith("KT1")) throw new Error("enter the KT1 exhibition contract");
  return kt;
}

async function readRevisionCount(kt) {
  try {
    const c = await MD.getToolkit().contract.at(kt);
    const st = await c.storage();
    const raw = st.revision_count;
    return typeof raw === "object" && typeof raw.toNumber === "function" ? raw.toNumber() : Number(raw) || 0;
  } catch (_) {
    return 0;
  }
}

async function deploy() {
  $("btnDeploy").disabled = true;
  try {
    if (!MD.getAccount()) throw new Error("connect your wallet first");
    const me = MD.getAccount();
    const name = $("exName").value.trim();
    if (!name) throw new Error("the exhibition needs a title");
    const provider = pinProvider();
    await MD.assertOperationSafety();

    const contractMeta = {
      name,
      description: $("exDesc").value.trim() || undefined,
      interfaces: ["TZIP-016", "TZIP-021"],
    };
    if (contractMeta.description === undefined) delete contractMeta.description;
    log("pinning contract metadata…");
    const metaCid = await MD.pinJson(provider, contractMeta, "exhibition.json");

    const code = await loadContractArtifact();
    const M = TZ.MichelsonMap;
    const metadataMap = new M();
    metadataMap.set("", MD.utf8ToHex("ipfs://" + metaCid));
    const storage = {
      administrator: me,
      pending_administrator: null,
      metadata: metadataMap,
      curators: new M(),
      revisions: new M(),
      revision_count: 0,
      current_revision: null,
    };
    log("originating exhibition contract (sign in wallet)…");
    const tezos = MD.getToolkit();
    const op = await tezos.wallet.originate({ code, storage }).send();
    const contract = await op.contract();
    const kt = contract.address;
    log("exhibition deployed: " + kt);
    log("explorer: " + MD.explorerUrl(state.network, kt));
    $("contractKt").value = kt;
    log("you are the admin curator. Publish the first revision below.");
    MD.logEvent("lasagna.registry_updated", "Lasagna deployed an exhibition registry", {
      contract: kt,
      network: state.network,
    });
    MD.notify("Exhibition contract deployed: " + kt, "success");
  } catch (e) {
    log("deploy failed: " + (e.message || JSON.stringify(e)), "err");
    MD.notify("Deploy failed: " + (e.message || e), "error");
  } finally {
    $("btnDeploy").disabled = false;
  }
}

// ---------- curate ----------

async function publishRevision() {
  $("btnPublish").disabled = true;
  try {
    if (!MD.getAccount()) throw new Error("connect your wallet first");
    const me = MD.getAccount();
    const kt = contractAddress();
    const { items, errors } = parseRefs();
    if (errors.length) throw new Error(`fix ${errors.length} bad reference line(s) first`);
    if (items.length === 0) throw new Error("add at least one token reference");
    const provider = pinProvider();
    await MD.assertOperationSafety();

    const revision = await readRevisionCount(kt);
    const manifest = buildExhibitionMetadata({
      name: $("exName").value.trim() || "Untitled Exhibition",
      description: $("exDesc").value.trim() || undefined,
      statement: $("exStatement").value.trim() || undefined,
      curators: [me],
      items,
      imageUri: $("exCover").value.trim() || undefined,
      revision,
    });
    log(`pinning revision #${revision} manifest (${items.length} references)…`);
    const cid = await MD.pinJson(provider, manifest, "revision.json");

    const params = {
      metadata_uri: MD.utf8ToHex("ipfs://" + cid),
      items: items.map((it) => ({ contract: it.contract, token_id: it.token_id })),
    };
    log("publishing revision (sign in wallet)…");
    const c = await MD.getToolkit().wallet.at(kt);
    const op = await c.methodsObject.publish_revision(params).send();
    await op.confirmation();
    log(`revision #${revision} published ✓ — now the current revision`);
    MD.logEvent("lasagna.exhibition_published", "Lasagna published an exhibition revision", {
      contract: kt,
      network: state.network,
      revision,
      referenceCount: items.length,
    });
    MD.notify(`Published revision #${revision}.`, "success");
  } catch (e) {
    log("publish failed: " + (e.message || JSON.stringify(e)), "err");
    MD.notify("Publish failed: " + (e.message || e), "error");
  } finally {
    $("btnPublish").disabled = false;
  }
}

async function curatorOp(add) {
  const btn = add ? $("btnAddCurator") : $("btnRemoveCurator");
  btn.disabled = true;
  try {
    if (!MD.getAccount()) throw new Error("connect your wallet first");
    const kt = contractAddress();
    const addr = $("curatorAddr").value.trim();
    if (!MD.isAddress(addr)) throw new Error("enter a valid curator address");
    await MD.assertOperationSafety();
    const c = await MD.getToolkit().wallet.at(kt);
    log(`${add ? "adding" : "removing"} curator ${MD.short(addr)} (sign in wallet)…`);
    const op = await (add ? c.methodsObject.add_curator(addr) : c.methodsObject.remove_curator(addr)).send();
    await op.confirmation();
    log(`curator ${add ? "added" : "removed"} ✓`);
    MD.logEvent("lasagna.registry_updated", "Lasagna updated curator roles", {
      contract: kt,
      network: state.network,
      action: add ? "add_curator" : "remove_curator",
      curator: addr,
    });
  } catch (e) {
    log("curator op failed: " + (e.message || JSON.stringify(e)), "err");
    MD.notify("Curator op failed: " + (e.message || e), "error");
  } finally {
    btn.disabled = false;
  }
}

async function setCurrent() {
  $("btnSetCurrent").disabled = true;
  try {
    if (!MD.getAccount()) throw new Error("connect your wallet first");
    const kt = contractAddress();
    const rid = parseInt($("currentRid").value, 10);
    if (!Number.isInteger(rid) || rid < 0) throw new Error("enter a revision number");
    await MD.assertOperationSafety();
    const c = await MD.getToolkit().wallet.at(kt);
    log(`setting current revision to #${rid} (sign in wallet)…`);
    const op = await c.methodsObject.set_current_revision(rid).send();
    await op.confirmation();
    log(`current revision set to #${rid} ✓`);
    MD.logEvent("lasagna.registry_updated", "Lasagna set the current exhibition revision", {
      contract: kt,
      network: state.network,
      revision: rid,
    });
  } catch (e) {
    log("set current failed: " + (e.message || JSON.stringify(e)), "err");
    MD.notify("Set current failed: " + (e.message || e), "error");
  } finally {
    $("btnSetCurrent").disabled = false;
  }
}

// ---------- wiring ----------

function wire() {
  MD.updatePinProviderRows();
  void MD.loadPlatformCapabilities();
  $("network").addEventListener("change", () => {
    state.network = $("network").value;
  });
  $("btnConnect").addEventListener("click", connect);
  $("btnParse").addEventListener("click", parseRefs);
  $("refs").addEventListener("input", parseRefs);
  $("btnDeploy").addEventListener("click", deploy);
  $("btnPublish").addEventListener("click", publishRevision);
  $("btnAddCurator").addEventListener("click", () => curatorOp(true));
  $("btnRemoveCurator").addEventListener("click", () => curatorOp(false));
  $("btnSetCurrent").addEventListener("click", setCurrent);
  $("importRefs").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      $("refs").value = await file.text();
      parseRefs();
    }
    e.target.value = "";
  });
  $("importPkg")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) importPackage(file);
    e.target.value = "";
  });
  $("pinProvider").addEventListener("change", MD.updatePinProviderRows);
  const handoff = MD.consumeCheaseHandoff("lasagna");
  if (handoff) importCheasePackage(handoff, "handoff");
  const routeHandoff = MD.readRouteHandoff();
  if (routeHandoff?.contract) {
    $("contractKt").value = routeHandoff.contract;
    MD.notify(`Loaded ${routeHandoff.contract} from Colander.`, "success");
  }
}

wire();
