/* Ravioli studio — Pasta Protocol bundle publisher.
 *
 * Forked from the Spaghetti/Gnocchi kernel: same proven Macaroni wallet/RPC/IPFS kernel (window.MD via
 * common.js) and Taquito bundle (window.TZ). Pure metadata/manifest logic comes from the parity-tested
 * pasta-foundation.js (shared/pasta-protocol port).
 *
 * Chain flow (user-signed): pin contents manifest + wrapper metadata -> originate PastaBundleFA2 (or use
 * an administered contract) -> create_bundle (token + config) -> mint editions. A separate panel redeems
 * (burns the wrapper edition on-chain, recording the redemption) and reveals mystery contents. Contents
 * delivery is OFF-chain via the pinned manifest URI. Rehearse on Shadownet before mainnet.
 */
import {
  buildBundleManifest,
  buildCollectionMetadata,
  buildTokenMetadata,
  isCheasePackage,
  sanitizeRelationshipMetadata,
  validateCheasePackage,
} from "./pasta-foundation.js";

const CONTRACT_ARTIFACT = "contract/pasta-bundle.contract.json";
const MD = window.MD;
const TZ = window.TZ;

const $ = (id) => document.getElementById(id);
const state = {
  network: "shadownet",
  members: [],
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

// ---------- member rows ----------

function addMemberRow(initial) {
  const tpl = $("memberRowTpl").content.firstElementChild.cloneNode(true);
  const member = { el: tpl };
  if (initial) {
    tpl.querySelector(".m-name").value = initial.name || "";
    tpl.querySelector(".m-uri").value = initial.uri || "";
    tpl.querySelector(".m-mime").value = initial.mimeType || "";
    tpl.querySelector(".m-kt").value = initial.tokenContract || "";
    if (initial.tokenId != null) tpl.querySelector(".m-tid").value = String(initial.tokenId);
    tpl.querySelector(".m-qty").value = String(initial.quantity || 1);
  }
  tpl.querySelector(".pp-member-del").addEventListener("click", () => {
    state.members = state.members.filter((m) => m !== member);
    tpl.remove();
  });
  $("members").appendChild(tpl);
  state.members.push(member);
  return member;
}

function readMemberRow(member) {
  const el = member.el;
  const tidRaw = el.querySelector(".m-tid").value.trim();
  const qtyRaw = el.querySelector(".m-qty").value.trim();
  return {
    name: el.querySelector(".m-name").value.trim(),
    uri: el.querySelector(".m-uri").value.trim(),
    mimeType: el.querySelector(".m-mime").value.trim(),
    tokenContract: el.querySelector(".m-kt").value.trim(),
    tokenId: tidRaw ? parseInt(tidRaw, 10) : undefined,
    quantity: qtyRaw ? parseInt(qtyRaw, 10) : 1,
  };
}

function applyDraftMembers(members) {
  state.members.forEach((member) => member.el.remove());
  state.members = [];
  (Array.isArray(members) && members.length ? members : [{}]).forEach(addMemberRow);
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

  const items = parsed.kind === "collection" ? parsed.items : [parsed.token];
  const first = items[0];
  if (parsed.kind === "collection") {
    if (parsed.title) {
      $("collName").value = parsed.title;
      $("bnName").value = parsed.title;
    }
  } else if (first?.name) {
    $("bnName").value = first.name;
  }
  if (parsed.description) $("bnDesc").value = parsed.description;
  else if (first?.description) $("bnDesc").value = first.description;
  const tags = [...new Set(items.flatMap((item) => item.tags || []))];
  if (tags.length) $("bnTags").value = tags.join(", ");
  if (first?.artifactUri) $("bnArtifactStatus").textContent = `CH-EASE artifact: ${first.artifactUri}`;
  if (parsed.relationship) {
    $("relParent").value = parsed.relationship.parent_contract || "";
    $("relFranchise").value = parsed.relationship.franchise_contract || "";
    $("relGroup").value = parsed.relationship.collection_group || "";
  }
  items.forEach((item) =>
    addMemberRow({
      name: item.name,
      uri: item.artifactUri || item.previewUri || "",
      mimeType: item.mimeType || "",
      tokenId: item.tokenId,
      quantity: 1,
    })
  );
  log(`imported ${items.length} bundle item(s) from CH-EASE ${source || "package"}`);
  MD.notify(`Imported ${items.length} bundle item(s) from CH-EASE.`, "success");
}

// ---------- wallet ----------

async function connect() {
  try {
    state.network = $("network").value;
    MD.setupToolkit(state.network);
    await MD.connectWallet("Ravioli");
    const acc = MD.getAccount();
    $("account").textContent = MD.short(acc);
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

async function originateCollection(provider, me) {
  const relationship = readRelationship();
  let imageUri;
  const coverFile = $("collCover").files?.[0];
  if (coverFile) {
    log("pinning cover image…");
    imageUri = "ipfs://" + (await MD.pinBlob(provider, coverFile, coverFile.name));
  }
  const metadata = buildCollectionMetadata({
    name: $("collName").value.trim() || "Bundle Collection",
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
    bundles: new M(),
    redeemed: new M(),
    redeemed_by: new M(),
    sales: new M(),
    minters: new M(),
    next_token_id: 0,
  };
  log("originating bundle contract (sign in wallet)…");
  const tezos = MD.getToolkit();
  const op = await tezos.wallet.originate({ code, storage }).send();
  const contract = await op.contract();
  log("contract deployed: " + contract.address);
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
    const me = MD.getAccount();
    const name = $("bnName").value.trim();
    if (!name) throw new Error("the bundle needs a name");
    const editions = Math.max(1, parseInt($("bnEditions").value, 10) || 1);
    const forSale = $("bnForSale").checked;
    const saleCount = Math.max(1, parseInt($("bnSaleCount").value, 10) || 1);
    if (forSale && saleCount > editions) throw new Error("sale quantity exceeds minted bundle editions");
    const priceMutez = Math.round(Math.max(0, Number($("bnPrice").value) || 0) * 1_000_000);
    const redeemable = $("bnRedeemable").checked;
    const mystery = $("bnMystery").checked;
    const provider = pinProvider();
    await MD.assertOperationSafety();
    const relationship = readRelationship();
    const symbol = $("collSymbol").value.trim() || undefined;

    const members = state.members.map(readMemberRow).filter((m) => m.name || m.uri || m.tokenContract);

    // 1. Contents manifest (always pinned; on-chain URI withheld for mystery until reveal)
    const manifest = buildBundleManifest({
      name,
      description: $("bnDesc").value.trim() || undefined,
      members,
      mystery,
      relationship,
    });
    log("pinning bundle contents manifest…");
    const manifestCid = await MD.pinJson(provider, manifest, "bundle-manifest.json");
    const manifestUri = "ipfs://" + manifestCid;

    // 2. Wrapper artwork
    let artifactUri = "";
    let mimeType = "";
    const artifactFile = $("bnArtifact").files?.[0];
    if (artifactFile) {
      log("pinning wrapper artwork…");
      artifactUri = "ipfs://" + (await MD.pinBlob(provider, artifactFile, artifactFile.name));
      mimeType = artifactFile.type || "";
    }

    // 3. Wrapper token metadata. Mystery packs omit the manifest URI from public metadata.
    const tags = $("bnTags")
      .value.split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const bundleExtra = mystery
      ? { mystery: true, itemCount: manifest.itemCount }
      : { mystery: false, itemCount: manifest.itemCount, manifestUri };
    const tokenMeta = buildTokenMetadata({
      name,
      description: $("bnDesc").value.trim() || undefined,
      symbol,
      artifactUri: artifactUri || undefined,
      mimeType: mimeType || undefined,
      creators: [me],
      minter: me,
      tags: tags.length ? tags : undefined,
      relationship,
      extra: { bundle: bundleExtra },
    });
    log("pinning wrapper token metadata…");
    const tokenCid = await MD.pinJson(provider, tokenMeta, "token.json");

    // 4. Target contract
    let kt;
    let startId;
    if (targetMode() === "new_collection") {
      kt = await originateCollection(provider, me);
      startId = 0;
    } else {
      kt = $("existingKt").value.trim();
      if (!MD.isAddress(kt) || !kt.startsWith("KT1")) throw new Error("enter a KT1 bundle contract you administer");
      startId = await nextTokenId(kt);
    }

    // 5. create_bundle + mint
    const tezos = MD.getToolkit();
    const c = await tezos.wallet.at(kt);
    const M = TZ.MichelsonMap;
    const info = new M();
    info.set("", MD.utf8ToHex("ipfs://" + tokenCid));
    const config = {
      redeemable,
      mystery,
      item_count: manifest.itemCount,
      contents_uri: mystery ? null : MD.utf8ToHex(manifestUri),
    };
    log("registering bundle (sign in wallet)…");
    const createOp = await c.methodsObject.create_bundle({ token_info: info, config }).send();
    await createOp.confirmation();
    log(`bundle registered — token id ${startId}`);

    log(`minting ${editions} edition(s) (sign in wallet)…`);
    const mintOp = await c.methodsObject.mint({ to_: me, token_id: startId, amount: editions }).send();
    await mintOp.confirmation();
    log("editions minted ✓");
    if (forSale) {
      log("opening direct bundle sale (sign in wallet)…");
      const saleOp = await c.methodsObject.set_sale({
        token_id: startId,
        sale: { active: true, seller: me, treasury: me, price: priceMutez, remaining: saleCount, start: null, end: null },
      }).send();
      await saleOp.confirmation();
      log("direct primary sale opened ✓");
    }

    $("opKt").value = kt;
    $("opTokenId").value = String(startId);
    if (mystery) {
      $("revealUri").value = manifestUri;
      log(`mystery pack: keep this manifest URI to reveal later → ${manifestUri}`);
    }
    if (targetMode() === "new_collection") {
      MD.recordColanderContract(kt, "ravioli");
      MD.logEvent("ravioli.collection_deployed", "Ravioli deployed a bundle collection", {
        contract: kt,
        network: state.network,
      });
    }
    MD.logEvent("ravioli.bundle_published", "Ravioli published a bundle", {
      contract: kt,
      network: state.network,
      tokenId: startId,
      editions,
      mystery,
      redeemable,
    });
    MD.notify(
      mystery
        ? `Mystery bundle deployed (token id ${startId}). Save the manifest URI shown in the log to reveal contents later.`
        : `Bundle deployed (token id ${startId}). See the log for explorer links.`,
      "success"
    );
  } catch (e) {
    log("publish failed: " + (e.message || JSON.stringify(e)), "err");
    MD.notify("Publish failed: " + (e.message || e), "error");
  } finally {
    $("btnPublish").disabled = false;
  }
}

// ---------- redeem & reveal ----------

function bigToNum(value) {
  if (value == null) return null;
  return typeof value === "object" && typeof value.toNumber === "function" ? value.toNumber() : Number(value);
}

async function loadBundle() {
  try {
    const kt = $("opKt").value.trim();
    if (!MD.isAddress(kt)) return MD.notify("Enter the KT1 contract address.", "error");
    const tokenId = parseInt($("opTokenId").value, 10) || 0;
    const c = await MD.getToolkit().contract.at(kt);
    const st = await c.storage();
    const cfg = await st.bundles.get(String(tokenId));
    if (!cfg) throw new Error("no bundle at that token id");
    const supply = bigToNum(await st.total_supply.get(String(tokenId))) || 0;
    const redeemed = bigToNum(await st.redeemed.get(String(tokenId))) || 0;
    const items = bigToNum(cfg.item_count) || 0;
    let info = `${items} item(s) · supply ${supply} · redeemed ${redeemed} · ${cfg.redeemable ? "redeemable" : "not redeemable"}`;
    if (cfg.mystery) info += ` · mystery (${cfg.contents_uri ? "revealed" : "hidden"})`;
    $("opInfo").textContent = info;
  } catch (e) {
    $("opInfo").textContent = "";
    MD.notify("Could not load bundle: " + (e.message || e), "error");
  }
}

async function redeem() {
  $("btnRedeem").disabled = true;
  try {
    if (!MD.getAccount()) throw new Error("connect your wallet first");
    const kt = $("opKt").value.trim();
    if (!MD.isAddress(kt)) throw new Error("enter the KT1 contract address");
    const tokenId = parseInt($("opTokenId").value, 10) || 0;
    const amount = Math.max(1, parseInt($("redeemAmount").value, 10) || 1);
    await MD.assertOperationSafety();
    const c = await MD.getToolkit().wallet.at(kt);
    log(`redeeming ${amount} edition(s) of token ${tokenId} (sign in wallet)…`);
    const op = await c.methodsObject.redeem({ token_id: tokenId, amount }).send();
    await op.confirmation();
    log("redeemed ✓ — wrapper burned on-chain");
    MD.logEvent("ravioli.redeemed", "Ravioli redeemed bundle editions", {
      contract: kt,
      network: state.network,
      tokenId,
      amount,
    });
    MD.notify("Redeemed. The wrapper edition was burned on-chain.", "success");
    await loadBundle();
  } catch (e) {
    log("redeem failed: " + (e.message || JSON.stringify(e)), "err");
    MD.notify("Redeem failed: " + (e.message || e), "error");
  } finally {
    $("btnRedeem").disabled = false;
  }
}

async function reveal() {
  $("btnReveal").disabled = true;
  try {
    if (!MD.getAccount()) throw new Error("connect your wallet first");
    const kt = $("opKt").value.trim();
    if (!MD.isAddress(kt)) throw new Error("enter the KT1 contract address");
    const tokenId = parseInt($("opTokenId").value, 10) || 0;
    const uri = $("revealUri").value.trim();
    if (!uri) throw new Error("enter the contents manifest URI to reveal");
    await MD.assertOperationSafety();
    const c = await MD.getToolkit().wallet.at(kt);
    log(`revealing mystery contents for token ${tokenId} (sign in wallet)…`);
    const op = await c.methodsObject
      .set_bundle_contents({ token_id: tokenId, contents_uri: MD.utf8ToHex(uri) })
      .send();
    await op.confirmation();
    log("contents revealed ✓");
    MD.logEvent("ravioli.contents_revealed", "Ravioli revealed mystery contents", {
      contract: kt,
      network: state.network,
      tokenId,
      uri,
    });
    MD.notify("Mystery contents revealed on-chain.", "success");
    await loadBundle();
  } catch (e) {
    log("reveal failed: " + (e.message || JSON.stringify(e)), "err");
    MD.notify("Reveal failed: " + (e.message || e), "error");
  } finally {
    $("btnReveal").disabled = false;
  }
}

// ---------- wiring ----------

function updateMysteryNote() {
  $("bnMysteryNote").textContent = $("bnMystery").checked
    ? "Mystery: the contents manifest is pinned but its URI is withheld on-chain until you reveal it after the drop."
    : "";
}

function wire() {
  MD.updatePinProviderRows();
  void MD.loadPlatformCapabilities();
  $("network").addEventListener("change", () => {
    state.network = $("network").value;
  });
  $("btnConnect").addEventListener("click", connect);
  $("btnAddMember").addEventListener("click", () => addMemberRow());
  $("btnPublish").addEventListener("click", publish);
  $("btnLoadBundle").addEventListener("click", loadBundle);
  $("btnRedeem").addEventListener("click", redeem);
  $("btnReveal").addEventListener("click", reveal);
  $("bnMystery").addEventListener("change", updateMysteryNote);
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

  addMemberRow();
  updateMysteryNote();
  const handoff = MD.consumeCheaseHandoff("ravioli");
  if (handoff) importCheasePackage(handoff, "handoff");
  const routeHandoff = MD.readRouteHandoff();
  if (routeHandoff?.contract) {
    $("opKt").value = routeHandoff.contract;
    MD.notify(`Loaded ${routeHandoff.contract} from Colander.`, "success");
  }
  if (routeHandoff?.projectTitle && !$("bnName").value) $("bnName").value = routeHandoff.projectTitle;

  window.PastaStudioDraft.start({
    app: "ravioli",
    summary: () => $("bnName").value.trim() || "Ravioli bundle draft",
    collect: () => ({ members: state.members.map(readMemberRow) }),
    apply: (extra) => applyDraftMembers(extra.members),
    afterApply: () => {
      state.network = $("network").value;
      updateMysteryNote();
      document.querySelector('input[name="target"]:checked')?.dispatchEvent(new Event("change"));
    },
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
