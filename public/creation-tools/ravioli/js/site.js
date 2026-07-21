"use strict";

(() => {
  const config = window.PASTA_SITE_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const state = { account: "", contract: null, storage: null, unitPrice: 0, maxAmount: null, action: "", secondaryAction: "", rotiniProject: null };
  const gateway = config.ipfsGateway || "https://ipfs.fileship.xyz/";

  function setStatus(message, error) {
    $("status").textContent = message;
    $("status").dataset.error = error ? "true" : "false";
  }
  function optionValue(value) {
    if (!value || typeof value !== "object") return value;
    if (Object.prototype.hasOwnProperty.call(value, "Some")) return value.Some;
    if (Object.prototype.hasOwnProperty.call(value, "None")) return null;
    return value;
  }
  function number(value) {
    value = optionValue(value);
    if (value == null) return 0;
    if (typeof value.toNumber === "function") return value.toNumber();
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function uri(value) {
    if (typeof value !== "string") return "";
    return value.startsWith("ipfs://") ? gateway + value.slice(7) : value;
  }
  function bytesToText(value) {
    if (typeof value !== "string") return "";
    try { return MD.hexToUtf8(value); } catch (_) { return value; }
  }
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-pasta-runtime="${src}"]`);
      if (existing?.dataset.loaded === "true") return resolve();
      const script = existing || document.createElement("script");
      script.dataset.pastaRuntime = src;
      script.src = src;
      script.onload = () => { script.dataset.loaded = "true"; resolve(); };
      script.onerror = () => reject(new Error(`Could not load ${src}.`));
      if (!existing) document.head.appendChild(script);
    });
  }
  async function ensureRotiniRuntime() {
    if (!window.RotiniArtifacts) await loadScript("js/rotini-artifact.js");
    if (!window.PastaRotiniMint) await loadScript("js/rotini-mint.js");
  }
  async function mapGet(map, key) {
    if (!map || typeof map.get !== "function") return undefined;
    return (await map.get(String(key))) ?? (await map.get(Number(key)));
  }
  function timeMs(value) {
    value = optionValue(value);
    if (value == null) return null;
    if (typeof value === "object" && typeof value.toString === "function") value = value.toString();
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  }
  function saleWindow(sale) {
    if (!sale?.active) return { open: false, label: "Sale closed" };
    const now = Date.now();
    const start = timeMs(sale.start);
    const end = timeMs(sale.end);
    if (start != null && now < start) return { open: false, label: `Starts ${new Date(start).toLocaleString()}` };
    if (end != null && now > end) return { open: false, label: "Sale ended" };
    return { open: true, label: "Sale open" };
  }
  function hexFromBytes(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  async function sha256Hex(blob) {
    return hexFromBytes(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())));
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
  async function ravioliGenerativePayload(serial) {
    const artifact = $("openArtifact").files?.[0];
    if (!artifact) throw new Error("Select the PNG, GIF, or offline ZIP for this generative opening.");
    const mimeType = artifact.type || (artifact.name.toLowerCase().endsWith(".zip") ? "application/zip" : "");
    if (!["image/png", "image/gif", "application/zip"].includes(mimeType)) throw new Error("Artifact must be PNG, GIF, or application/zip.");
    const provider = MD.pinProviderFromForm();
    const artifactUri = `ipfs://${await MD.pinBlob(provider, artifact, artifact.name)}`;
    let preview = artifact;
    if (mimeType === "application/zip") {
      preview = $("openPreview").files?.[0];
      if (!preview || !["image/png", "image/gif"].includes(preview.type)) throw new Error("Offline ZIP output needs a PNG or GIF display image.");
    }
    const displayUri = preview === artifact ? artifactUri : `ipfs://${await MD.pinBlob(provider, preview, preview.name)}`;
    const metadata = {
      name: `${config.title || "Ravioli generated token"} #${serial + 1}`,
      decimals: 0,
      artifactUri,
      displayUri,
      thumbnailUri: displayUri,
      creators: [state.account],
      formats: [{ uri: artifactUri, mimeType }],
      ravioli: { generatedAtOpen: true },
    };
    const metadataUri = `ipfs://${await MD.pinJson(provider, metadata, "ravioli-generated-token.json")}`;
    const ordered = [
      await sha256Hex(artifact),
      MD.utf8ToHex(artifactUri),
      MD.utf8ToHex(displayUri),
      MD.utf8ToHex(metadataUri),
      MD.utf8ToHex(mimeType),
      MD.utf8ToHex(displayUri),
    ].map((bytes) => ({ bytes }));
    const packed = await new TZ.MichelCodecPacker().packData({ data: nestedPair(ordered), type: nestedBytesType(ordered.length) });
    return packed.packed;
  }
  async function ravioliOpen(contract, tokenId) {
    const kit = JSON.parse($("openKit").value.trim());
    if (kit?.schema !== "pasta-ravioli-open-kit@3" || !Array.isArray(kit.recipes)) throw new Error("Import a Ravioli v3 open kit.");
    if (kit.contract !== config.contract || Number(kit.tokenId) !== tokenId) throw new Error("Open kit contract/token does not match this page.");
    const serial = number(await mapGet(state.storage.opened, tokenId));
    const recipe = kit.recipes[serial];
    if (!recipe) throw new Error(`Open kit has no recipe for serial ${serial}.`);
    let generatedPayload;
    if (recipe.actions.some((action) => action.kind === "generative")) generatedPayload = await ravioliGenerativePayload(serial);
    const actions = recipe.actions.map((action) => {
      if (action.kind === "escrow") return { escrow: { fa2: action.fa2, token_id: action.tokenId, amount: action.amount } };
      if (action.kind === "allocated") return {
        allocated_mint: {
          adapter: action.adapter,
          resource_id: action.resourceId,
          payload: "",
          payload_commitment: action.payloadCommitment,
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
      throw new Error(`Unknown Ravioli action ${action.kind}.`);
    });
    return contract.methodsObject.open_pack({ token_id: tokenId, nonce: recipe.nonce, actions }).send();
  }
  function explorerUrl() {
    const host = config.network === "shadownet" ? "shadownet.tzkt.io" : config.network === "ghostnet" ? "ghostnet.tzkt.io" : "tzkt.io";
    return `https://${host}/${config.contract}`;
  }
  async function applyMetadata(metadataUri) {
    if (!metadataUri) return;
    const response = await fetch(uri(metadataUri));
    if (!response.ok) return;
    const metadata = await response.json();
    if (!config.title && metadata.name) $("title").textContent = metadata.name;
    if (!config.description && (metadata.description || metadata.statement)) $("description").textContent = metadata.description || metadata.statement;
    const image = metadata.displayUri || metadata.thumbnailUri || metadata.image || metadata.artifactUri;
    if (image) {
      $("cover").src = uri(image);
      $("cover").alt = metadata.name ? `${metadata.name} artwork` : "Published artwork";
      $("cover").hidden = false;
      $("mediaFallback").hidden = true;
    }
  }
  async function loadMetadata() {
    if (!state.storage?.token_metadata) return;
    const token = await mapGet(state.storage.token_metadata, config.tokenId || 0);
    const info = token?.token_info || token;
    const raw = info && typeof info.get === "function" ? await info.get("") : undefined;
    const metadataUri = bytesToText(raw || "");
    if (!metadataUri) return;
    await applyMetadata(metadataUri);
  }
  async function loadExhibition() {
    const revisionId = number(state.storage.current_revision);
    const revision = await mapGet(state.storage.revisions, revisionId);
    if (!revision) throw new Error("This exhibition has no published revision.");
    $("itemId").textContent = String(revisionId);
    $("chainState").textContent = `${number(state.storage.revision_count)} revisions · ${revision.items?.length || 0} works shown`;
    await applyMetadata(bytesToText(revision.metadata_uri || ""));
  }
  async function configureAction() {
    const app = config.app;
    const tokenId = Number(config.tokenId || 0);
    state.action = "";
    state.secondaryAction = "";
    state.maxAmount = null;
    $("amountRow").hidden = false;
    $("submit").hidden = false;
    $("secondarySubmit").hidden = true;
    if (app === "gnocchi") {
      const sale = await mapGet(state.storage.sales, tokenId);
      const currentSupply = number(await mapGet(state.storage.total_supply, tokenId));
      const minted = number(await mapGet(state.storage.total_minted || state.storage.total_supply, tokenId));
      if (!sale) throw new Error("No open-edition sale exists for this token.");
      const steps = Math.floor(minted / Math.max(1, number(sale.step_size)));
      state.unitPrice = number(sale.base_price) + number(sale.increment) * steps;
      const windowState = saleWindow(sale);
      const maxSupply = optionValue(sale.max_supply);
      const soldOut = maxSupply != null && minted >= number(maxSupply);
      state.maxAmount = maxSupply == null ? null : Math.max(0, number(maxSupply) - minted);
      state.action = windowState.open && !soldOut ? "open_mint" : "";
      const hasWindow = optionValue(sale.start) != null || optionValue(sale.end) != null;
      const hasCap = maxSupply != null;
      const label = hasWindow && hasCap ? "Limited Edition" : hasWindow ? "Timed OE" : hasCap ? "Capped OE" : "Forever OE";
      $("actionTitle").textContent = `Mint this ${label}`;
      $("actionDetail").textContent = `${minted} lifetime minted${currentSupply === minted ? "" : ` · ${currentSupply} current supply`} · ${(state.unitPrice / 1_000_000).toFixed(6)} tez each`;
      $("chainState").textContent = soldOut ? "Sold out" : windowState.open ? "Minting open" : windowState.label;
      $("submit").textContent = "Mint editions";
      $("submit").disabled = !state.action;
      return;
    }
    if (app === "rotini") {
      const project = await mapGet(state.storage.projects, tokenId);
      if (!project) throw new Error("No generative project exists at this id.");
      const minted = number(project.minted);
      const reserved = number(project.reserved);
      const decodedMaxSupply = optionValue(project.max_supply);
      const maxSupply = decodedMaxSupply == null ? null : number(decodedMaxSupply);
      const soldOut = maxSupply != null && minted + reserved >= maxSupply;
      state.unitPrice = number(project.price);
      state.maxAmount = soldOut ? 0 : 1;
      state.rotiniProject = project;
      state.action = project.active && !soldOut ? "rotini_finalize" : "";
      const projectName = bytesToText(project.name || "");
      const outputMode = bytesToText(project.output_mode || "").toUpperCase() || "ARTIFACT";
      if (!config.title && projectName) $("title").textContent = projectName;
      $("actionTitle").textContent = `Generate a ${outputMode} iteration`;
      $("actionDetail").textContent = `${minted} finalized + ${reserved} rendering${maxSupply == null ? "" : ` / ${maxSupply}`} · ${(state.unitPrice / 1_000_000).toFixed(6)} tez`;
      $("chainState").textContent = soldOut ? "Sold out" : project.active ? "Generation open" : "Generation closed";
      $("amountRow").hidden = true;
      $("rotiniStorage").hidden = false;
      $("submit").textContent = "Reserve, render & mint";
      $("submit").disabled = !state.action;
      return;
    }
    if (app === "penne") {
      state.action = "claim";
      $("actionTitle").textContent = "Claim your allocation";
      $("actionDetail").textContent = "The contract checks your connected wallet's allocation.";
      $("chainState").textContent = state.storage.claim_active ? "Claim open" : "Claim closed";
      $("amountRow").hidden = true;
      $("submit").textContent = "Claim allocation";
      $("submit").disabled = !state.storage.claim_active;
      return;
    }
    if (app === "ravioli") {
      const pack = await mapGet(state.storage.packs, tokenId);
      if (!pack) throw new Error("No Ravioli v3 pack exists for this token.");
      const sale = await mapGet(state.storage.sales, tokenId);
      const windowState = saleWindow(sale);
      const opened = number(await mapGet(state.storage.opened, tokenId));
      const supply = number(await mapGet(state.storage.total_supply, tokenId));
      const fullyReserved = pack.finalized && !pack.cancelled;
      $("ravioliOpen").hidden = false;
      $("rotiniStorage").hidden = false;
      const storedKit = config.openKit || localStorage.getItem(`pasta.ravioli.open-kit.v3:${config.network}:${config.contract}:${tokenId}`);
      if (storedKit && !$("openKit").value.trim()) $("openKit").value = typeof storedKit === "string" ? storedKit : JSON.stringify(storedKit, null, 2);
      if (windowState.open && number(sale.remaining) > 0) {
        state.action = "buy";
        state.unitPrice = number(sale.price);
        state.maxAmount = number(sale.remaining);
        $("actionTitle").textContent = "Buy this atomic pack";
        $("actionDetail").textContent = `${number(sale.remaining)} available · ${(state.unitPrice / 1_000_000).toFixed(6)} tez each`;
        $("chainState").textContent = fullyReserved ? "Primary sale open · fully reserved" : "Primary sale open · pack not ready";
        $("submit").textContent = "Buy pack editions";
        $("submit").disabled = false;
        state.secondaryAction = "open_pack";
        $("secondarySubmit").textContent = "Open one held pack";
        $("secondarySubmit").hidden = false;
        return;
      }
      state.action = "open_pack";
      state.maxAmount = 1;
      $("amountRow").hidden = true;
      $("actionTitle").textContent = "Open one held pack";
      $("actionDetail").textContent = `${number(pack.item_count)} atomic child action(s) · ${opened}/${number(pack.max_supply)} opened`;
      $("chainState").textContent = fullyReserved ? `${supply} wrappers live · fully reserved` : "Pack closed";
      $("submit").textContent = "Open pack atomically";
      $("submit").disabled = !pack.finalized || pack.cancelled;
      return;
    }
    if (app === "spaghetti") {
      const sale = await mapGet(state.storage.sales, tokenId);
      const windowState = saleWindow(sale);
      if (windowState.open && number(sale.remaining) > 0) {
        state.action = "buy";
        state.unitPrice = number(sale.price);
        state.maxAmount = number(sale.remaining);
        $("actionTitle").textContent = "Buy directly from the creator";
        $("actionDetail").textContent = `${number(sale.remaining)} available · ${(state.unitPrice / 1_000_000).toFixed(6)} tez each`;
        $("chainState").textContent = "Primary sale open";
        $("submit").textContent = "Buy editions";
        $("submit").disabled = false;
      } else {
        state.action = "";
        $("actionTitle").textContent = "Creator-owned collection";
        $("actionDetail").textContent = sale ? "This primary sale is unavailable." : "No direct primary sale is configured for this token.";
        $("chainState").textContent = sale ? (number(sale.remaining) < 1 ? "Sold out" : windowState.label) : "Published";
        $("amountRow").hidden = true;
        $("submit").hidden = true;
      }
      return;
    }
    $("actionTitle").textContent = app === "lasagna" ? "On-chain exhibition" : "Creator-owned collection";
    $("actionDetail").textContent = app === "lasagna" ? "This page follows the curator's current on-chain revision." : "This contract does not expose a direct primary-sale entrypoint.";
    if (app !== "lasagna") $("chainState").textContent = "Published";
    $("amountRow").hidden = true;
    $("submit").hidden = true;
  }
  async function load() {
    $("appLabel").textContent = `${config.label || config.app || "Pasta"} · Pasta Protocol`;
    $("title").textContent = config.title || "Published work";
    $("description").textContent = config.description || "";
    $("network").textContent = config.network || "mainnet";
    $("itemId").textContent = config.app === "lasagna" ? "current" : String(config.tokenId || 0);
    $("contract").textContent = config.contract || "No contract configured";
    $("contract").href = explorerUrl();
    document.title = `${config.title || "Published work"} · Pasta Protocol`;
    if (!MD.isAddress(config.contract) || !config.contract.startsWith("KT1")) throw new Error("This site package needs a valid KT1 contract address.");
    MD.setupToolkit(config.network || "mainnet");
    if (config.app === "rotini" || config.app === "ravioli") {
      await MD.loadPlatformCapabilities();
      MD.updatePinProviderRows();
      if (config.app === "rotini") await ensureRotiniRuntime();
    }
    state.contract = await MD.getToolkit().contract.at(config.contract);
    state.storage = await state.contract.storage();
    if (config.app === "lasagna") await loadExhibition();
    else await Promise.allSettled([loadMetadata()]);
    await configureAction();
    setStatus("On-chain state loaded.");
  }
  async function connect() {
    try {
      const connection = await MD.connectWallet(config.label || "Pasta Protocol");
      state.account = typeof connection === "string" ? connection : connection.address;
      $("connect").textContent = `${state.account.slice(0, 7)}…${state.account.slice(-5)}`;
      setStatus("Wallet connected. Review the action before signing.");
    } catch (error) { setStatus(error.message || "Wallet connection failed.", true); }
  }
  async function submit(actionOverride) {
    try {
      if (!state.account) await connect();
      if (!state.account) return;
      await MD.assertOperationSafety();
      const amount = Number($("amount").value || 1);
      if (!Number.isSafeInteger(amount) || amount < 1) throw new Error("Amount must be a positive whole number.");
      if (state.maxAmount != null && amount > state.maxAmount) throw new Error(`Only ${state.maxAmount} editions remain.`);
      const tokenId = Number(config.tokenId || 0);
      const contract = await MD.getToolkit().wallet.at(config.contract);
      $("submit").disabled = true;
      setStatus("Waiting for wallet signature…");
      let operation;
      const action = actionOverride || state.action;
      if (action === "rotini_finalize") {
        await window.PastaRotiniMint.run({ config, state, project: state.rotiniProject, setStatus, reload: load });
        return;
      }
      const payment = state.unitPrice * amount;
      if ((action === "open_mint" || action === "buy") && !Number.isSafeInteger(payment)) throw new Error("The total mutez amount is outside the safe transaction range.");
      if (action === "open_mint") operation = await contract.methodsObject.open_mint({ token_id: tokenId, amount }).send({ amount: payment, mutez: true });
      else if (action === "claim") operation = await contract.methodsObject.claim(tokenId).send();
      else if (action === "open_pack") operation = await ravioliOpen(contract, tokenId);
      else if (action === "buy") operation = await contract.methodsObject.buy({ token_id: tokenId, amount }).send({ amount: payment, mutez: true });
      else return;
      await operation.confirmation();
      await load();
      setStatus("Confirmed on Tezos. On-chain state refreshed.");
    } catch (error) {
      setStatus(error.message || "The operation failed.", true);
      $("submit").disabled = false;
    }
  }
  $("connect").addEventListener("click", connect);
  $("submit").addEventListener("click", () => submit());
  $("secondarySubmit").addEventListener("click", () => submit(state.secondaryAction));
  $("pinProvider").addEventListener("change", MD.updatePinProviderRows);
  $("openKitFile").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (file) $("openKit").value = JSON.stringify(JSON.parse(await file.text()), null, 2);
    event.target.value = "";
  });
  load().catch((error) => setStatus(error.message || "Could not read the published work.", true));
})();
