/* Macaroni — shared helpers (wallet, RPC, IPFS, bytes).
   Depends on vendor/tezos.js which exposes window.TZ. */

"use strict";

const MD = (() => {
  const NETWORKS = {
    mainnet: {
      label: "Mainnet",
      rpc: "https://rpc.tzkt.io/mainnet",
      beaconNetwork: "mainnet",
    },
    shadownet: {
      label: "Shadownet (test)",
      rpc: "https://rpc.shadownet.teztnets.com",
      beaconNetwork: "shadownet",
    },
  };

  const CHAIN_IDS = {
    mainnet: "NetXdQprcVkpaWU",
    shadownet: "NetXsqzbfFenSTS",
  };

  const DEFAULT_GATEWAY = "https://ipfs.fileship.xyz/";
  const WALLET_SESSION_PREFIX = "macaroni.wallet.session.v1";

  const ADDRESS_RE = /^(tz1|tz2|tz3|tz4|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/;
  const isAddress = (s) => ADDRESS_RE.test(String(s || "").trim());

  let tezos = null;
  let wallet = null;
  let activeAccount = null;
  let netKey = null;
  let rpcUrl = null;
  let connectPromise = null;

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
    if (wallet) {
      configureWalletClient(wallet);
      tezos.setWalletProvider(wallet);
    }
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
      : { type: net.beaconNetwork, rpcUrl };
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

  function configureWalletClient(w) {
    const network = beaconNetworkSpec();
    // Beacon's DAppClient is a singleton: after a network switch the new
    // constructor options can be ignored, so force the client network to
    // match before any permission or operation request (kiln pattern).
    w.client.network = network;
    w.client.preferredNetwork = beaconPreferredNetwork();
    w.client.featuredWallets = ["kukai", "temple", "umami"];
    disableBeaconMetrics(w.client);
    return w;
  }

  function makeWallet(appName, options) {
    const resetClient = Boolean(options && options.resetClient);
    const network = beaconNetworkSpec();
    const w = new TZ.BeaconWallet({
      name: appName || "Macaroni",
      network,
      preferredNetwork: beaconPreferredNetwork(),
      enableMetrics: false,
      resetClient,
      featuredWallets: ["kukai", "temple", "umami"],
    });
    return configureWalletClient(w);
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

  async function resetBeaconPickerState(options) {
    const dropWallet = Boolean(options && options.dropWallet);
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
    activeAccount = null;
    if (dropWallet) wallet = null;
  }

  async function connectWallet(appName) {
    if (!tezos) throw new Error("Pick a network first");
    if (connectPromise) return connectPromise;
    connectPromise = (async () => {
      await assertRpcChainId();
      const doConnect = async () => {
        await resetBeaconPickerState();
        if (!wallet) wallet = makeWallet(appName, { resetClient: false });
        else configureWalletClient(wallet);
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
        activeAccount = null;
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
    await resetBeaconPickerState({ dropWallet: true });
    clearWalletSession();
  }

  async function restoreWallet(appName) {
    if (!tezos) return null;
    const stored = readWalletSession();
    if (!stored || stored.network !== netKey || !stored.address) return null;
    if (!wallet) {
      wallet = makeWallet(appName, { resetClient: false });
      tezos.setWalletProvider(wallet);
    } else {
      configureWalletClient(wallet);
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
