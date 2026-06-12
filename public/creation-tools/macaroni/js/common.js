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

  const DEFAULT_GATEWAY = "https://ipfs.io/ipfs/";

  const ADDRESS_RE = /^(tz1|tz2|tz3|tz4|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/;
  const isAddress = (s) => ADDRESS_RE.test(String(s || "").trim());

  let tezos = null;
  let wallet = null;
  let activeAccount = null;
  let netKey = null;
  let rpcUrl = null;

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
      : { type: net.beaconNetwork, rpcUrl };
  }

  function makeWallet(appName) {
    const w = new TZ.BeaconWallet({
      name: appName || "Macaroni",
      network: beaconNetworkSpec(),
      featuredWallets: ["temple", "kukai", "umami"],
    });
    // Beacon's DAppClient is a singleton: after a network switch the new
    // constructor options can be ignored, so force the client network to
    // match before any permission or operation request (kiln pattern).
    w.client.network = beaconNetworkSpec();
    return w;
  }

  // A pairing left over from a previous session can be expired; Beacon then
  // rejects every new request until its localStorage state is wiped.
  function clearBeaconStorage() {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k && (k.startsWith("beacon:") || k.startsWith("beacon-sdk:"))) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch (_) {
      /* restricted storage */
    }
  }

  async function connectWallet(appName) {
    if (!tezos) throw new Error("Pick a network first");
    await assertRpcChainId();
    const doConnect = async () => {
      if (!wallet) {
        wallet = makeWallet(appName);
        tezos.setWalletProvider(wallet);
      } else {
        wallet.client.network = beaconNetworkSpec();
      }
      // Network is fixed on the client (constructor + realignment above);
      // current Beacon SDKs reject a `network` property here.
      await wallet.requestPermissions();
      activeAccount = await wallet.getPKH();
      return activeAccount;
    };
    try {
      return await doConnect();
    } catch (e) {
      if (!/expired/i.test(e && e.message ? e.message : String(e))) throw e;
      clearBeaconStorage();
      wallet = null;
      return doConnect();
    }
  }

  async function disconnectWallet() {
    if (wallet) await wallet.clearActiveAccount();
    activeAccount = null;
  }

  async function restoreWallet(appName) {
    if (!wallet) {
      wallet = makeWallet(appName);
      if (tezos) tezos.setWalletProvider(wallet);
    }
    return ensureSessionNetwork();
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

  /** Estimate gas/storage with headroom — avoids wallet "script took more time" failures. */
  async function sendWalletOp(method, transferOpts, opts) {
    const tezos = getToolkit();
    opts = opts || {};
    let params = transferOpts || {};
    try {
      params = await method.toTransferParams(transferOpts || {});
    } catch (_) {
      /* some methods accept transfer opts only on send */
    }
    let gasLimit = opts.gasLimit;
    let storageLimit = opts.storageLimit;
    let fee;
    try {
      const est = await tezos.estimate.transfer(params);
      gasLimit = Math.min(
        1_040_000,
        Math.ceil(est.gasLimit * (opts.gasBuffer || 1.65)) + (opts.gasPad || 40_000)
      );
      storageLimit = Math.ceil(est.storageLimit * (opts.storageBuffer || 1.5)) + (opts.storagePad || 120);
      fee = est.suggestedFeeMutez;
    } catch (_) {
      const units = opts.units || 1;
      gasLimit = gasLimit || Math.min(1_040_000, (opts.gasPerUnit || 380_000) * units);
      storageLimit = storageLimit || 200 + units * (opts.storagePerUnit || 120);
    }
    return method.send({ ...(transferOpts || {}), fee, gasLimit, storageLimit });
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
    sendWalletOp,
    TZKT_API,
    DEFAULT_GATEWAY,
  };
})();
