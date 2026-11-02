import path from "node:path";

export const NETWORKS = Object.freeze({
  mainnet: Object.freeze({
    chainId: "NetXdQprcVkpaWU",
    rpcUrl: "https://tezos-mainnet.octez.io/",
    indexerUrl: "https://api.tzkt.io/v1",
    duplicateCheckUrl: "https://data.objkt.com/v3/graphql",
  }),
  shadownet: Object.freeze({
    chainId: "NetXsqzbfFenSTS",
    rpcUrl: "https://tezos-shadownet.octez.io/",
    indexerUrl: "https://api.shadownet.tzkt.io/v1",
    duplicateCheckUrl: "https://data.shadownet.objkt.com/v3/graphql",
  }),
});

const LOOPBACK_COLLECTOR_ACK = "I_AM_TESTING_A_LOOPBACK_ONLY_DROP";

function loopbackHost(hostname) {
  return ["127.0.0.1", "localhost", "[::1]", "::1"].includes(hostname);
}

function integer(value, fallback = null) {
  const parsed = Number(value ?? fallback);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function urlSetting(value, name, errors, { allowLoopbackHttp = false } = {}) {
  try {
    const parsed = new URL(String(value || ""));
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !(allowLoopbackHttp && loopback && parsed.protocol === "http:")) {
      errors.push(`${name} must use HTTPS${allowLoopbackHttp ? " unless it is loopback" : ""}`);
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    errors.push(`${name} must be a valid URL`);
    return "";
  }
}

function allowedOrigins(value, errors) {
  const values = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const unique = [];
  for (const value of values) {
    try {
      const parsed = new URL(value);
      const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname);
      if (parsed.origin !== value.replace(/\/$/, "") || (parsed.protocol !== "https:" && !(loopback && parsed.protocol === "http:"))) {
        throw new Error("invalid origin");
      }
      if (parsed.hostname.endsWith(".example")) throw new Error("placeholder origin");
      if (!unique.includes(parsed.origin)) unique.push(parsed.origin);
    } catch {
      errors.push(`MACARONI_COMPANION_ALLOWED_ORIGINS contains an invalid origin: ${value}`);
    }
  }
  if (unique.length === 0) errors.push("MACARONI_COMPANION_ALLOWED_ORIGINS must list the exact creator/drop-page origins");
  return unique;
}

/** Baseline service/Studio setup may run on loopback, but sale activation and
 * static export use this stricter collector-facing gate. */
export function collectorPublishingConfig(config) {
  let publicBase;
  let collector;
  try {
    publicBase = new URL(config.publicBaseUrl);
    collector = new URL(config.collectorOrigin || "");
  } catch {
    return {
      ready: false,
      code: "collector_public_endpoint_unconfigured",
      reason: "Set an exact collector page origin and public Companion base URL before opening or exporting the sale.",
      publicBaseUrl: config.publicBaseUrl || null,
      collectorOrigin: config.collectorOrigin || null,
    };
  }
  const baseLoopback = loopbackHost(publicBase.hostname);
  const collectorLoopback = loopbackHost(collector.hostname);
  const exactCollectorOrigin = collector.origin === String(config.collectorOrigin).replace(/\/$/, "");
  if (!exactCollectorOrigin || !Array.isArray(config.allowedOrigins) || !config.allowedOrigins.includes(collector.origin)) {
    return {
      ready: false,
      code: "collector_origin_not_allowlisted",
      reason: "The exact collector page origin must appear in MACARONI_COMPANION_ALLOWED_ORIGINS before launch.",
      publicBaseUrl: publicBase.toString().replace(/\/$/, ""),
      collectorOrigin: exactCollectorOrigin ? collector.origin : null,
    };
  }
  if (baseLoopback || collectorLoopback) {
    if (!baseLoopback || !collectorLoopback || config.allowLoopbackCollector !== true) {
      return {
        ready: false,
        code: "collector_loopback_not_exportable",
        reason: "Loopback works for local setup, but a remotely hosted buyer page needs an HTTPS public Companion URL and exact HTTPS page origin.",
        publicBaseUrl: publicBase.toString().replace(/\/$/, ""),
        collectorOrigin: collector.origin,
      };
    }
    return {
      ready: true,
      code: "collector_loopback_development_only",
      reason: "Explicit loopback-only development mode is enabled; this drop cannot be used from another device or remote host.",
      publicBaseUrl: publicBase.toString().replace(/\/$/, ""),
      collectorOrigin: collector.origin,
      localDevelopmentOnly: true,
    };
  }
  if (publicBase.protocol !== "https:" || collector.protocol !== "https:") {
    return {
      ready: false,
      code: "collector_https_required",
      reason: "Remote collector pages and public Companion endpoints must both use HTTPS.",
      publicBaseUrl: publicBase.toString().replace(/\/$/, ""),
      collectorOrigin: collector.origin,
    };
  }
  return {
    ready: true,
    code: "collector_public_configuration_ready",
    reason: "Public endpoint and exact collector CORS origin are configured; launch still requires a live identity probe.",
    publicBaseUrl: publicBase.toString().replace(/\/$/, ""),
    collectorOrigin: collector.origin,
    localDevelopmentOnly: false,
  };
}

export function loadCompanionConfig(env = process.env, cwd = process.cwd()) {
  const errors = [];
  const network = String(env.MACARONI_COMPANION_NETWORK || "shadownet").trim();
  const networkDefaults = NETWORKS[network];
  if (!networkDefaults) errors.push("MACARONI_COMPANION_NETWORK must be mainnet or shadownet");
  const adapter = String(env.MACARONI_COMPANION_PINNING_ADAPTER || "").trim();
  const dataDir = path.resolve(cwd, String(env.MACARONI_COMPANION_DATA_DIR || "./data"));
  const config = {
    dataDir,
    privateAssetDir: path.join(dataDir, "private-assets"),
    uploadDir: path.join(dataDir, "private-uploads"),
    tempDir: path.join(dataDir, "tmp"),
    journalPath: path.join(dataDir, "companion.sqlite"),
    host: String(env.MACARONI_COMPANION_HOST || "127.0.0.1"),
    port: integer(env.MACARONI_COMPANION_PORT, 47835),
    network,
    expectedChainId: networkDefaults?.chainId || "",
    rpcUrl: "",
    indexerUrl: "",
    duplicateCheckUrl: "",
    duplicateCheckMode: String(env.MACARONI_COMPANION_DUPLICATE_CHECK_MODE || "private_full_scan").trim(),
    rpcTrustMode: String(env.MACARONI_COMPANION_RPC_TRUST_MODE || "").trim(),
    publicBaseUrl: "",
    collectorOrigin: String(env.MACARONI_COMPANION_COLLECTOR_ORIGIN || "").trim(),
    allowLoopbackCollector: env.MACARONI_COMPANION_ALLOW_LOOPBACK_COLLECTOR === LOOPBACK_COLLECTOR_ACK,
    allowedOrigins: allowedOrigins(env.MACARONI_COMPANION_ALLOWED_ORIGINS, errors),
    masterKeyFile: path.resolve(cwd, String(env.MACARONI_COMPANION_MASTER_KEY_FILE || "")),
    signerKeyFile: path.resolve(cwd, String(env.MACARONI_COMPANION_SIGNER_KEY_FILE || "")),
    adminTokenFile: path.resolve(cwd, String(env.MACARONI_COMPANION_ADMIN_TOKEN_FILE || "")),
    pinning: {
      adapter,
      kuboApi: "",
      carUploadUrl: "",
      carUploadToken: String(env.MACARONI_COMPANION_CAR_UPLOAD_TOKEN || ""),
      publicGatewayUrl: "",
    },
    abiPath: path.resolve(cwd, String(env.MACARONI_V35_CONTRACT_ABI_PATH || "./contract/macaroni-v35.contract.json")),
    abiSha256: String(env.MACARONI_V35_CONTRACT_ABI_SHA256 || "").toLowerCase(),
    storagePath: path.resolve(cwd, String(env.MACARONI_V35_STORAGE_PATH || "./contract/macaroni-v35.storage.tz")),
    storageSha256: String(env.MACARONI_V35_STORAGE_SHA256 || "").toLowerCase(),
    templatePath: path.resolve(cwd, String(env.MACARONI_V35_TEMPLATE_PATH || "./contract/macaroni-v35.template.json")),
    templateSha256: String(env.MACARONI_V35_TEMPLATE_SHA256 || "").toLowerCase(),
    workerOwner: `companion-${process.pid}`,
  };

  config.rpcUrl = urlSetting(env.MACARONI_COMPANION_RPC_URL || networkDefaults?.rpcUrl, "MACARONI_COMPANION_RPC_URL", errors, { allowLoopbackHttp: true });
  config.indexerUrl = urlSetting(env.MACARONI_COMPANION_INDEXER_URL || networkDefaults?.indexerUrl, "MACARONI_COMPANION_INDEXER_URL", errors, { allowLoopbackHttp: true });
  config.duplicateCheckUrl = urlSetting(env.MACARONI_COMPANION_DUPLICATE_CHECK_URL || networkDefaults?.duplicateCheckUrl, "MACARONI_COMPANION_DUPLICATE_CHECK_URL", errors, { allowLoopbackHttp: true });
  config.publicBaseUrl = urlSetting(env.MACARONI_COMPANION_PUBLIC_BASE_URL, "MACARONI_COMPANION_PUBLIC_BASE_URL", errors, { allowLoopbackHttp: true });
  config.pinning.publicGatewayUrl = urlSetting(env.MACARONI_COMPANION_IPFS_GATEWAY_URL, "MACARONI_COMPANION_IPFS_GATEWAY_URL", errors, { allowLoopbackHttp: true });
  if (adapter === "kubo") {
    config.pinning.kuboApi = urlSetting(env.MACARONI_COMPANION_KUBO_API, "MACARONI_COMPANION_KUBO_API", errors, { allowLoopbackHttp: true });
  }
  if (adapter === "external-car") {
    config.pinning.carUploadUrl = urlSetting(env.MACARONI_COMPANION_CAR_UPLOAD_URL, "MACARONI_COMPANION_CAR_UPLOAD_URL", errors, { allowLoopbackHttp: true });
  }

  if (!config.port) errors.push("MACARONI_COMPANION_PORT must be a positive integer");
  try {
    if (new URL(config.publicBaseUrl).hostname.endsWith(".example")) errors.push("MACARONI_COMPANION_PUBLIC_BASE_URL still contains a placeholder host");
  } catch {
    // urlSetting already reported the malformed value.
  }
  if (!String(env.MACARONI_COMPANION_MASTER_KEY_FILE || "").trim()) errors.push("MACARONI_COMPANION_MASTER_KEY_FILE is required");
  if (!String(env.MACARONI_COMPANION_SIGNER_KEY_FILE || "").trim()) errors.push("MACARONI_COMPANION_SIGNER_KEY_FILE is required");
  if (!String(env.MACARONI_COMPANION_ADMIN_TOKEN_FILE || "").trim()) errors.push("MACARONI_COMPANION_ADMIN_TOKEN_FILE is required");
  if (!config.abiSha256.match(/^[0-9a-f]{64}$/)) errors.push("MACARONI_V35_CONTRACT_ABI_SHA256 must be the reviewed artifact SHA-256");
  if (!config.storageSha256.match(/^[0-9a-f]{64}$/)) errors.push("MACARONI_V35_STORAGE_SHA256 must be the reviewed storage SHA-256");
  if (!config.templateSha256.match(/^[0-9a-f]{64}$/)) errors.push("MACARONI_V35_TEMPLATE_SHA256 must be the reviewed template SHA-256");
  if (!new Set(["kubo", "external-car"]).has(config.pinning.adapter)) errors.push("Pinning adapter must be kubo or external-car");
  if (!new Set(["private_full_scan", "external_direct_lookup"]).has(config.duplicateCheckMode)) {
    errors.push("MACARONI_COMPANION_DUPLICATE_CHECK_MODE must be private_full_scan or external_direct_lookup");
  }
  if (!new Set(["creator_controlled", "third_party_acknowledged"]).has(config.rpcTrustMode)) {
    errors.push("MACARONI_COMPANION_RPC_TRUST_MODE must be creator_controlled or third_party_acknowledged");
  }
  if (env.MACARONI_COMPANION_ACKNOWLEDGE_MEMPOOL_DISCLOSURE !== "I_UNDERSTAND_SETTLEMENT_CID_AND_ENTROPY_ENTER_THE_TEZOS_MEMPOOL") {
    errors.push("Starting requires acknowledgement that settlement metadata CID and entropy enter the Tezos mempool before inclusion");
  }
  if (config.rpcTrustMode === "third_party_acknowledged"
    && env.MACARONI_COMPANION_ACKNOWLEDGE_RPC_RECEIVES_PRIVATE_SETTLEMENT !== "I_UNDERSTAND_MY_RPC_PROVIDER_RECEIVES_PRIVATE_SETTLEMENT_DATA") {
    errors.push("A third-party RPC requires explicit acknowledgement that it receives private settlement data before inclusion");
  }
  if (config.duplicateCheckMode === "external_direct_lookup"
    && env.MACARONI_COMPANION_ACKNOWLEDGE_DUPLICATE_INDEX_RECEIVES_PRIVATE_CIDS !== "I_UNDERSTAND_OBJKT_RECEIVES_EVERY_PRIVATE_CID") {
    errors.push("External direct duplicate lookup requires explicit acknowledgement that the selected service receives every private CID before sale");
  }
  if (config.pinning.adapter === "kubo" && !config.pinning.kuboApi) errors.push("MACARONI_COMPANION_KUBO_API is required for the kubo adapter");
  if (config.pinning.adapter === "external-car" && (!config.pinning.carUploadUrl || !config.pinning.carUploadToken)) {
    errors.push("External CAR upload URL and token are required for the external-car adapter");
  }
  return { config, errors };
}

/** Safe for HTTP status output. Filesystem paths, tokens, and service credentials are intentionally omitted. */
export function publicConfig(config) {
  return {
    network: config.network,
    expectedChainId: config.expectedChainId,
    publicBaseUrl: config.publicBaseUrl,
    pinningAdapter: config.pinning.adapter,
    duplicateCheckPrivacy: config.duplicateCheckMode,
    rpcTrustMode: config.rpcTrustMode,
    collectorPublishing: collectorPublishingConfig(config),
  };
}
