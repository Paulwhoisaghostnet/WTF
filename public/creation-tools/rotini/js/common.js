/* Rotini (Pasta Protocol) — shared helpers (wallet, RPC, IPFS, bytes). Forked from the Spaghetti kernel
 * (itself the proven Macaroni kernel) with only the wallet-session namespace changed.
   Forked verbatim from the proven Macaroni kernel; only the RPC defaults (octez.io doctrine for new
   Pasta apps) and the wallet-session namespace differ. Depends on vendor/tezos.js, with
   octez-wallet.js preferred when present. */

"use strict";

const MD = (() => {
  const NETWORKS = {
    mainnet: {
      label: "Mainnet",
      rpc: "https://tezos-mainnet.octez.io/",
      beaconNetwork: "mainnet",
    },
    shadownet: {
      label: "Shadownet (test)",
      rpc: "https://tezos-shadownet.octez.io/",
      beaconNetwork: "shadownet",
    },
  };

  const CHAIN_IDS = {
    mainnet: "NetXdQprcVkpaWU",
    shadownet: "NetXsqzbfFenSTS",
  };

  const DEFAULT_GATEWAY = "https://ipfs.fileship.xyz/";
  const WALLET_SESSION_PREFIX = "rotini.wallet.session.v1";

  const ADDRESS_RE = /^(tz1|tz2|tz3|tz4|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/;
  const isAddress = (s) => ADDRESS_RE.test(String(s || "").trim());

  let tezos = null;
  let wallet = null;
  let activeAccount = null;
  let netKey = null;
  let rpcUrl = null;
  let connectPromise = null;

  const PASTA_HANDOFF_PREFIX = "wtfos.pasta.handoff.v1";
  let platformCapabilities = {
    loaded: false,
    embedded: false,
    authenticated: false,
    trustedMarketCreator: false,
    canUseWtfosPinner: false,
  };

  function appIdFromPath() {
    const match = String(location?.pathname || "").match(/\/creation-tools\/([^/]+)/);
    return match ? match[1] : "pasta";
  }

  function isEmbeddedInWtfos() {
    try {
      return window.parent !== window && location.protocol !== "file:";
    } catch (_) {
      return false;
    }
  }

  function ensureNoticeRegion() {
    let el = document.getElementById("ppNotice");
    if (el) return el;
    el = document.createElement("div");
    el.id = "ppNotice";
    el.className = "pp-notice";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.hidden = true;
    const header = document.querySelector(".pp-top");
    if (header && header.parentNode) header.parentNode.insertBefore(el, header.nextSibling);
    else document.body.prepend(el);
    return el;
  }

  function notify(message, kind) {
    const text = String(message || "").trim();
    if (!text) return;
    const el = ensureNoticeRegion();
    const tone = kind || "info";
    el.className = "pp-notice pp-notice-" + tone;
    el.textContent = text;
    el.hidden = false;
    el.setAttribute("role", tone === "error" ? "alert" : "status");
    el.setAttribute("aria-live", tone === "error" ? "assertive" : "polite");
  }

  function clearNotice() {
    const el = ensureNoticeRegion();
    el.textContent = "";
    el.hidden = true;
    el.className = "pp-notice";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
  }

  function roleList(user) {
    const roles = Array.isArray(user?.roles) ? user.roles : user?.role ? [user.role] : [];
    return roles.map((role) => String(role));
  }

  async function loadPlatformCapabilities() {
    const embedded = isEmbeddedInWtfos();
    const next = { ...platformCapabilities, loaded: true, embedded };
    try {
      const res = await fetch("/api/auth/user", { credentials: "same-origin" });
      if (res.ok) {
        const user = await res.json();
        const permissions = user?.effectivePermissions || {};
        const roles = roleList(user);
        const trustedMarketCreator = Boolean(
          permissions.trusted_market_creator || roles.includes("admin") || roles.includes("trusted_creator")
        );
        Object.assign(next, {
          authenticated: true,
          trustedMarketCreator,
          canUseWtfosPinner: embedded && trustedMarketCreator,
        });
      }
    } catch (_) {
      /* standalone/downloaded builds cannot see wtfOS session APIs */
    }
    platformCapabilities = next;
    updatePinProviderRows();
    return platformCapabilities;
  }

  function getPlatformCapabilities() {
    return platformCapabilities;
  }

  function updatePinProviderRows() {
    const select = document.getElementById("pinProvider");
    if (!select) return;
    const option = [...select.options].find((candidate) => candidate.value === "wtfos");
    if (option) {
      option.disabled = !platformCapabilities.canUseWtfosPinner;
      option.hidden = !platformCapabilities.canUseWtfosPinner;
    }
    if (!platformCapabilities.canUseWtfosPinner && select.value === "wtfos") {
      select.value = "pinata";
      notify("wtfOS platform pinning is available only inside wtfOS for trusted market creators. Pinata is selected for this session.", "warn");
    }
    const kind = select.value;
    const jwtRow = document.getElementById("pinJwtRow");
    const nodeRow = document.getElementById("pinNodeRow");
    if (jwtRow) jwtRow.hidden = kind !== "pinata";
    if (nodeRow) nodeRow.hidden = kind !== "node";
  }

  function pinProviderFromForm() {
    const select = document.getElementById("pinProvider");
    const kind = select ? select.value : "pinata";
    if (kind === "pinata") {
      const jwt = document.getElementById("pinJwt")?.value.trim();
      if (!jwt) throw new Error("Enter your Pinata JWT, or switch pinning provider.");
      return { kind: "pinata", jwt };
    }
    if (kind === "node") {
      const url = document.getElementById("pinNode")?.value.trim();
      if (!url) throw new Error("Enter your IPFS node URL, or switch pinning provider.");
      return { kind: "node", url };
    }
    if (!platformCapabilities.canUseWtfosPinner) {
      throw new Error("wtfOS platform pinning requires an embedded trusted-market-creator session. Use Pinata or your own IPFS node for self-managed publishing.");
    }
    return { kind: "wtfos" };
  }

  function handoffStorageKey(appId) {
    return PASTA_HANDOFF_PREFIX + ":" + (appId || appIdFromPath());
  }

  function consumeCheaseHandoff(appId) {
    const params = new URLSearchParams(location.search || "");
    if (params.get("handoff") !== "chease-package") return null;
    const key = params.get("handoffKey") || handoffStorageKey(appId);
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      sessionStorage.removeItem(key);
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function readRouteHandoff() {
    const params = new URLSearchParams(location.search || "");
    const source = params.get("handoff") || "";
    if (!source || source === "chease-package") return null;
    return {
      source,
      action: params.get("action") || "",
      contract: params.get("contract") || "",
      network: params.get("network") || "",
      kind: params.get("kind") || "",
    };
  }

  function logEvent(eventType, message, metadata, severity) {
    try {
      const payload = {
        eventType,
        severity: severity || "info",
        message,
        url: location.href,
        metadata: {
          app: appIdFromPath(),
          viewport: { width: window.innerWidth, height: window.innerHeight },
          userAgent: navigator.userAgent,
          ...(metadata || {}),
        },
      };
      fetch("/api/system/logs/client", {
        method: "POST",
        credentials: "include",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => undefined);
    } catch (_) {
      /* event logging must never block publishing */
    }
  }

  function walletSessionKey() {
    const path = typeof location !== "undefined" ? `${location.origin}${location.pathname}` : "local";
    return `${WALLET_SESSION_PREFIX}:${netKey || "unknown"}:${path}`;
  }

  function readWalletSession() {
    try {
      const raw = localStorage.getItem(walletSessionKey());
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function saveWalletSession(address) {
    try {
      localStorage.setItem(
        walletSessionKey(),
        JSON.stringify({ address, network: netKey, rpcUrl, savedAt: new Date().toISOString() })
      );
    } catch (_) {
      /* restricted storage */
    }
  }

  function clearWalletSession() {
    try {
      localStorage.removeItem(walletSessionKey());
    } catch (_) {
      /* restricted storage */
    }
  }

  function getNetworks() {
    return NETWORKS;
  }

  function setupToolkit(networkKey, customRpc) {
    netKey = networkKey;
    rpcUrl = customRpc || NETWORKS[networkKey].rpc;
    tezos = new TZ.TezosToolkit(rpcUrl);
    if (wallet) tezos.setWalletProvider(wallet);
    return tezos;
  }

  function getToolkit() {
    if (!tezos) throw new Error("Toolkit not initialised — pick a network first");
    return tezos;
  }

  // The RPC must actually be the network the user selected (catches bad
  // custom RPC overrides before any tez moves). In strict mode an
  // unreachable RPC also fails (required before signing operations); in
  // lax mode only a confirmed mismatch fails, so a momentary RPC hiccup
  // never blocks the wallet pairing flow itself.
  async function assertRpcChainId(strict) {
    const expected = CHAIN_IDS[netKey];
    if (!expected) return; // custom aliases stay opt-in for exploratory dev RPCs
    let actual;
    try {
      actual = await getToolkit().rpc.getChainId();
    } catch (e) {
      if (!strict) return; // re-checked strictly before every operation
      throw new Error(
        `could not reach the ${netKey} RPC at ${rpcUrl} — check your connection or RPC override (${e.message})`
      );
    }
    if (actual !== expected)
      throw new Error(
        `RPC network mismatch: app is set to ${netKey} (${expected}) but the RPC reports ${actual} — check your RPC override`
      );
  }

  function accountMatchesNetwork(acc) {
    const net = NETWORKS[netKey];
    if (!acc || !acc.network || !net) return false;
    if (net.beaconNetwork === "custom")
      return acc.network.type === "custom" && acc.network.name === netKey;
    return acc.network.type === net.beaconNetwork;
  }

  // Adopt the cached Beacon session only if it was granted for the network
  // the app is on; otherwise drop it so a stale testnet session can never
  // sign for a mainnet flow (or vice versa).
  async function ensureSessionNetwork() {
    if (!wallet) return activeAccount;
    const acc = await wallet.client.getActiveAccount();
    if (!acc) {
      activeAccount = null;
      return null;
    }
    if (!accountMatchesNetwork(acc)) {
      await wallet.clearActiveAccount();
      activeAccount = null;
      return null;
    }
    activeAccount = acc.address;
    return activeAccount;
  }

  // Call before every operation that signs/sends (deploy, sync, mint).
  async function assertOperationSafety() {
    await assertRpcChainId(true);
    const addr = await ensureSessionNetwork();
    if (!addr)
      throw new Error(
        `wallet is not connected on ${netKey} — click Connect to pair on the right network`
      );
    return addr;
  }

  function beaconNetworkSpec() {
    const net = NETWORKS[netKey];
    return net.beaconNetwork === "custom"
      ? { type: "custom", name: netKey, rpcUrl }
      : { type: net.beaconNetwork };
  }

  function beaconPreferredNetwork() {
    const net = NETWORKS[netKey];
    return net && net.beaconNetwork === "ghostnet" ? "ghostnet" : "mainnet";
  }

  function disableBeaconMetrics(client) {
    if (!client) return;
    client.enableMetrics = false;
    client.updateMetricsStorage = async () => {};
    client.sendMetrics = () => {};
  }

  function makeWallet(appName, options) {
    const resetClient = !(options && options.resetClient === false);
    const network = beaconNetworkSpec();
    if (typeof TZ.installOctezPrimaryWallet === "function") TZ.installOctezPrimaryWallet();
    const WalletClass = TZ.OctezPrimaryWallet || TZ.BeaconWallet;
    const w = new WalletClass({
      name: appName || "Macaroni",
      network,
      preferredNetwork: beaconPreferredNetwork(),
      enableMetrics: false,
      resetClient,
      featuredWallets: ["kukai", "temple", "umami"],
    });
    // Beacon's DAppClient is a singleton: after a network switch the new
    // constructor options can be ignored, so force the client network to
    // match before any permission or operation request (kiln pattern).
    w.client.network = network;
    w.client.preferredNetwork = beaconPreferredNetwork();
    w.client.featuredWallets = ["kukai", "temple", "umami"];
    disableBeaconMetrics(w.client);
    return w;
  }

  // A pairing left over from a previous session can be expired; Beacon then
  // rejects every new request until its session localStorage state is wiped.
  // Keep Beacon's local identity seed during an in-page reset; removing it
  // underneath a live DAppClient produces "Secret seed not found".
  function isBeaconIdentityKey(key) {
    return /^beacon(-sdk)?:((sdk-secret-seed)|(user-id)|(sdk_version)|(matrix-selected-node)|(sdk-matrix-preserved-state))$/i.test(key);
  }

  function clearBeaconStorage(options) {
    const preserveIdentity = Boolean(options && options.preserveIdentity);
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (
          k &&
          (k.startsWith("beacon:") || k.startsWith("beacon-sdk:")) &&
          !(preserveIdentity && isBeaconIdentityKey(k))
        ) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch (_) {
      /* restricted storage */
    }
  }

  async function resetBeaconPickerState() {
    if (wallet) {
      try {
        if (typeof wallet.clearActiveAccount === "function") await wallet.clearActiveAccount();
      } catch (_) {
        /* stale account state may already be gone */
      }
      try {
        if (wallet.client && typeof wallet.client.setActivePeer === "function")
          await wallet.client.setActivePeer(undefined);
      } catch (_) {
        /* older Beacon clients keep active peer private */
      }
      try {
        if (wallet.client && typeof wallet.client.setTransport === "function")
          await wallet.client.setTransport(undefined);
      } catch (_) {
        /* no active transport */
      }
    }
    clearBeaconStorage({ preserveIdentity: true });
    wallet = null;
    activeAccount = null;
  }

  async function connectWallet(appName) {
    if (!tezos) throw new Error("Pick a network first");
    if (connectPromise) return connectPromise;
    connectPromise = (async () => {
      await assertRpcChainId();
      const doConnect = async () => {
        await resetBeaconPickerState();
        wallet = makeWallet(appName);
        tezos.setWalletProvider(wallet);
        // Network is fixed on the client (constructor + realignment above);
        // current Beacon SDKs reject a `network` property here.
        await wallet.requestPermissions();
        activeAccount = await wallet.getPKH();
        saveWalletSession(activeAccount);
        return activeAccount;
      };
      try {
        return await doConnect();
      } catch (e) {
        if (!/expired/i.test(e && e.message ? e.message : String(e))) throw e;
        clearBeaconStorage({ preserveIdentity: true });
        wallet = null;
        return doConnect();
      }
    })();
    try {
      return await connectPromise;
    } finally {
      connectPromise = null;
    }
  }

  async function disconnectWallet() {
    await resetBeaconPickerState();
    clearWalletSession();
  }

  async function restoreWallet(appName) {
    if (!tezos) return null;
    const stored = readWalletSession();
    if (!stored || stored.network !== netKey || !stored.address) return null;
    if (!wallet) {
      wallet = makeWallet(appName, { resetClient: false });
      tezos.setWalletProvider(wallet);
    }
    let acc = null;
    try {
      acc = await wallet.client.getActiveAccount();
    } catch (_) {
      acc = null;
    }
    if (!acc || !accountMatchesNetwork(acc) || acc.address !== stored.address) {
      clearWalletSession();
      activeAccount = null;
      return null;
    }
    activeAccount = acc.address;
    saveWalletSession(activeAccount);
    return activeAccount;
  }

  function getAccount() {
    return activeAccount;
  }

  // ---------- bytes helpers ----------
  const utf8ToHex = (s) => TZ.stringToBytes(s);
  const hexToUtf8 = (h) => TZ.bytesToString(h);

  // ---------- wtfOS API helpers ----------
  let csrfToken = "";
  async function getCsrfToken() {
    if (csrfToken) return csrfToken;
    const res = await fetch("/api/auth/csrf-token", { credentials: "same-origin" });
    if (!res.ok) throw new Error("Could not get wtfOS CSRF token");
    const json = await res.json();
    csrfToken = json.csrfToken || "";
    if (!csrfToken) throw new Error("wtfOS CSRF token response was empty");
    return csrfToken;
  }

  async function apiFetch(url, options) {
    const init = options || {};
    const method = String(init.method || "GET").toUpperCase();
    const unsafe = !["GET", "HEAD", "OPTIONS"].includes(method);
    const send = async () => {
      const headers = new Headers(init.headers || {});
      if (unsafe && !headers.has("X-CSRF-Token")) {
        headers.set("X-CSRF-Token", await getCsrfToken());
      }
      return fetch(url, {
        ...init,
        headers,
        credentials: init.credentials || "same-origin",
      });
    };
    let res = await send();
    if (unsafe && res.status === 403) {
      csrfToken = "";
      res = await send();
    }
    return res;
  }

  // ---------- IPFS pinning ----------
  // Providers: wtfOS server pinning, Pinata (JWT), or any IPFS HTTP API (Kubo /api/v0/add).
  async function pinBlob(provider, blob, filename) {
    if (provider.kind === "wtfos") {
      const fd = new FormData();
      fd.append("file", blob, filename);
      const res = await apiFetch("/api/macaroni/ipfs/pin", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error("wtfOS IPFS error " + res.status + ": " + (await res.text()));
      const json = await res.json();
      return json.cid || json.IpfsHash;
    }
    if (provider.kind === "pinata") {
      const fd = new FormData();
      fd.append("file", blob, filename);
      const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
        method: "POST",
        headers: { Authorization: "Bearer " + provider.jwt },
        body: fd,
      });
      if (!res.ok) throw new Error("Pinata error " + res.status + ": " + (await res.text()));
      const json = await res.json();
      return json.IpfsHash;
    }
    if (provider.kind === "node") {
      const fd = new FormData();
      fd.append("file", blob, filename);
      const base = provider.url.replace(/\/+$/, "");
      const res = await fetch(base + "/api/v0/add?pin=true&cid-version=1", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error("IPFS node error " + res.status + ": " + (await res.text()));
      const text = await res.text();
      const last = text.trim().split("\n").pop();
      return JSON.parse(last).Hash;
    }
    throw new Error("Unknown pinning provider");
  }

  async function pinJson(provider, obj, filename) {
    const blob = new Blob([JSON.stringify(obj)], { type: "application/json" });
    return pinBlob(provider, blob, filename || "metadata.json");
  }

  function ipfsToHttp(uri, gateway) {
    if (!uri) return "";
    const gw = (gateway || DEFAULT_GATEWAY).replace(/\/+$/, "") + "/";
    return uri.startsWith("ipfs://") ? gw + uri.slice(7) : uri;
  }

  // ---------- CSV parsing ----------
  function assertCsvFile(file) {
    if (!/\.csv$/i.test(file.name || "") && file.type !== "text/csv")
      throw new Error("Only CSV files are supported.");
  }

  function parseCsvText(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            cell += '"';
            i += 1;
          } else {
            quoted = false;
          }
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ",") {
        row.push(cell);
        cell = "";
      } else if (ch === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else if (ch !== "\r") {
        cell += ch;
      }
    }
    if (quoted) throw new Error("CSV has an unclosed quoted field.");
    if (cell || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows.filter((r) => r.some((v) => String(v).trim() !== ""));
  }

  async function parseCsvRows(file) {
    assertCsvFile(file);
    return parseCsvText(await file.text());
  }

  // Returns array of row objects with lower-cased headers.
  async function parseCsv(file) {
    const rows = await parseCsvRows(file);
    if (!rows.length) return [];
    const headers = rows[0].map((h, i) => {
      const key = String(h || "").replace(/^\ufeff/, "").trim().toLowerCase();
      if (!key) throw new Error(`missing header in column ${i + 1}`);
      return key;
    });
    return rows.slice(1).map((r) => {
      const out = {};
      headers.forEach((h, i) => { out[h] = String(r[i] ?? "").trim(); });
      return out;
    });
  }

  // ---------- formatting ----------
  const fmtTez = (mutez) => (Number(mutez) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 }) + " ꜩ";
  const short = (addr) => (addr ? addr.slice(0, 7) + "…" + addr.slice(-4) : "");

  async function getBalanceMutez(address) {
    const target = address || activeAccount;
    if (!target) return null;
    const balance = await getToolkit().tz.getBalance(target);
    if (balance && typeof balance.toNumber === "function") return balance.toNumber();
    return Number(balance);
  }

  function explorerUrl(networkKey, kt) {
    const base = {
      mainnet: "https://tzkt.io/",
      shadownet: "https://shadownet.tzkt.io/",
    }[networkKey] || "https://tzkt.io/";
    return base + kt;
  }

  function objktUrl(networkKey, kt) {
    return networkKey === "mainnet"
      ? "https://objkt.com/collections/" + kt
      : "https://objkt.com/collections/" + kt; // testnets are not indexed by objkt
  }

  const TZKT_API = {
    mainnet: "https://api.tzkt.io",
    shadownet: "https://api.shadownet.tzkt.io",
  };

  async function fetchContractStatus(networkKey, kt) {
    const api = TZKT_API[networkKey] || TZKT_API.mainnet;
    const [storageRes, contractRes] = await Promise.all([
      fetch(`${api}/v1/contracts/${kt}/storage`),
      fetch(`${api}/v1/contracts/${kt}`),
    ]);
    if (!storageRes.ok) throw new Error("contract not found on " + networkKey);
    const storage = await storageRes.json();
    const contract = contractRes.ok ? await contractRes.json() : {};
    return { storage, metadata: contract.metadata || null };
  }

  async function transferParams(method, transferOpts) {
    let params = transferOpts || {};
    try {
      params = await method.toTransferParams(transferOpts || {});
    } catch (_) {
      /* some methods accept transfer opts only on send */
    }
    return params;
  }

  /** Estimate gas/storage with headroom — avoids wallet "script took more time" failures. */
  async function estimateWalletOp(method, transferOpts, opts) {
    const tezos = getToolkit();
    opts = opts || {};
    const params = await transferParams(method, transferOpts);
    let gasLimit = opts.gasLimit;
    let storageLimit = opts.storageLimit;
    let fee;
    let estimated = false;
    try {
      const est = await tezos.estimate.transfer(params);
      gasLimit = Math.min(
        1_040_000,
        Math.ceil(est.gasLimit * (opts.gasBuffer || 1.65)) + (opts.gasPad || 40_000)
      );
      storageLimit = Math.ceil(est.storageLimit * (opts.storageBuffer || 1.5)) + (opts.storagePad || 120);
      fee = Math.ceil(est.suggestedFeeMutez * (opts.feeBuffer || 1.35)) + (opts.feePad || 500);
      estimated = true;
    } catch (_) {
      const units = opts.units || 1;
      gasLimit = gasLimit || Math.min(1_040_000, (opts.gasPerUnit || 380_000) * units);
      storageLimit = storageLimit || 200 + units * (opts.storagePerUnit || 120);
    }
    return {
      fee,
      gasLimit,
      storageLimit,
      storageFeeMutez: Math.max(0, Number(storageLimit || 0)) * 250,
      estimated,
    };
  }

  async function sendWalletOp(method, transferOpts, opts) {
    const limits = await estimateWalletOp(method, transferOpts, opts);
    const sendOpts = {
      ...(transferOpts || {}),
      gasLimit: limits.gasLimit,
      storageLimit: limits.storageLimit,
    };
    if (limits.fee != null) sendOpts.fee = limits.fee;
    return method.send(sendOpts);
  }

  async function fetchOwnedTokenIds(networkKey, kt, holder) {
    if (!kt || !holder) return [];
    const api = TZKT_API[networkKey] || TZKT_API.mainnet;
    const url = new URL(`${api}/v1/tokens/balances`);
    url.searchParams.set("account", holder);
    url.searchParams.set("token.contract", kt);
    url.searchParams.set("balance.gt", "0");
    url.searchParams.set("select", "token.tokenId");
    url.searchParams.set("limit", "10000");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`owned mint lookup failed: ${res.status}`);
    const json = await res.json();
    return (Array.isArray(json) ? json : [])
      .map((value) => Number(typeof value === "object" ? value?.token?.tokenId ?? value?.tokenId : value))
      .filter((id) => Number.isInteger(id) && id >= 0)
      .sort((a, b) => a - b);
  }

  return {
    getNetworks,
    setupToolkit,
    getToolkit,
    connectWallet,
    disconnectWallet,
    restoreWallet,
    ensureSessionNetwork,
    assertOperationSafety,
    getAccount,
    getBalanceMutez,
    isAddress,
    utf8ToHex,
    hexToUtf8,
    notify,
    clearNotice,
    loadPlatformCapabilities,
    getPlatformCapabilities,
    updatePinProviderRows,
    pinProviderFromForm,
    consumeCheaseHandoff,
    readRouteHandoff,
    logEvent,
    pinBlob,
    pinJson,
    apiFetch,
    ipfsToHttp,
    parseCsv,
    parseCsvRows,
    fmtTez,
    short,
    explorerUrl,
    objktUrl,
    fetchContractStatus,
    estimateWalletOp,
    sendWalletOp,
    fetchOwnedTokenIds,
    TZKT_API,
    DEFAULT_GATEWAY,
  };
})();
window.MD = MD;
