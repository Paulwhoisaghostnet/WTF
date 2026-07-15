"use strict";

(() => {
  const config = window.PASTA_SITE_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const state = { account: "", contract: null, storage: null, unitPrice: 0, maxAmount: null, action: "", secondaryAction: "" };
  const gateway = config.ipfsGateway || "https://ipfs.fileship.xyz/";

  function setStatus(message, error) {
    $("status").textContent = message;
    $("status").dataset.error = error ? "true" : "false";
  }
  function number(value) {
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
  async function mapGet(map, key) {
    if (!map || typeof map.get !== "function") return undefined;
    return (await map.get(String(key))) ?? (await map.get(Number(key)));
  }
  function timeMs(value) {
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
      const minted = number(await mapGet(state.storage.total_supply, tokenId));
      if (!sale) throw new Error("No open-edition sale exists for this token.");
      const steps = Math.floor(minted / Math.max(1, number(sale.step_size)));
      state.unitPrice = number(sale.base_price) + number(sale.increment) * steps;
      const windowState = saleWindow(sale);
      const soldOut = sale.max_supply != null && minted >= number(sale.max_supply);
      state.maxAmount = sale.max_supply == null ? null : Math.max(0, number(sale.max_supply) - minted);
      state.action = windowState.open && !soldOut ? "open_mint" : "";
      $("actionTitle").textContent = "Mint this open edition";
      $("actionDetail").textContent = `${minted} minted · ${(state.unitPrice / 1_000_000).toFixed(6)} tez each`;
      $("chainState").textContent = soldOut ? "Sold out" : windowState.open ? "Minting open" : windowState.label;
      $("submit").textContent = "Mint editions";
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
      const bundle = await mapGet(state.storage.bundles, tokenId);
      if (!bundle) throw new Error("No bundle exists for this token.");
      const sale = await mapGet(state.storage.sales, tokenId);
      const windowState = saleWindow(sale);
      if (windowState.open && number(sale.remaining) > 0) {
        state.action = "buy";
        state.unitPrice = number(sale.price);
        state.maxAmount = number(sale.remaining);
        $("actionTitle").textContent = "Buy this bundle";
        $("actionDetail").textContent = `${number(sale.remaining)} available · ${(state.unitPrice / 1_000_000).toFixed(6)} tez each`;
        $("chainState").textContent = "Primary sale open";
        $("submit").textContent = "Buy bundle editions";
        $("submit").disabled = false;
        if (bundle.redeemable) {
          state.secondaryAction = "redeem";
          $("secondarySubmit").textContent = "Redeem held editions";
          $("secondarySubmit").hidden = false;
        }
        return;
      }
      state.action = "redeem";
      $("actionTitle").textContent = bundle.redeemable ? "Redeem bundle" : "View bundle";
      $("actionDetail").textContent = bundle.mystery && !bundle.contents_uri ? "Mystery contents have not been revealed." : `${number(bundle.item_count)} items`;
      $("chainState").textContent = bundle.redeemable ? "Redeemable" : "Display only";
      $("submit").textContent = "Redeem editions";
      $("submit").disabled = !bundle.redeemable;
      return;
    }
    if (app === "spaghetti" || app === "rotini") {
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
      const payment = state.unitPrice * amount;
      if ((action === "open_mint" || action === "buy") && !Number.isSafeInteger(payment)) throw new Error("The total mutez amount is outside the safe transaction range.");
      if (action === "open_mint") operation = await contract.methodsObject.open_mint({ token_id: tokenId, amount }).send({ amount: payment, mutez: true });
      else if (action === "claim") operation = await contract.methodsObject.claim(tokenId).send();
      else if (action === "redeem") operation = await contract.methodsObject.redeem({ token_id: tokenId, amount }).send();
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
  load().catch((error) => setStatus(error.message || "Could not read the published work.", true));
})();
