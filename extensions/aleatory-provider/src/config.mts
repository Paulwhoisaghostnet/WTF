import * as networkImport from "../../wtf-operator-signer/src/network.ts";

const { probeRpcChainId } = ((networkImport as any).default ?? networkImport) as typeof networkImport;

const NETWORKS = {
  mainnet: { chainId: "NetXdQprcVkpaWU", rpcUrl: "https://tezos-mainnet.octez.io/", tzktApi: "https://api.tzkt.io" },
  shadownet: { chainId: "NetXsqzbfFenSTS", rpcUrl: "https://tezos-shadownet.octez.io/", tzktApi: "https://api.shadownet.tzkt.io" },
} as const;

export type ProviderConfig = {
  network: keyof typeof NETWORKS;
  chainId: string;
  rpcUrl: string;
  tzktApi: string;
  router: string;
  registry: string;
  provider?: string;
  operatorAddress: string;
  agentAddress?: string;
  renderGasMutez?: number;
  stateDir: string;
};

export function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function address(value: string, kind: "KT1" | "tz", name: string): string {
  const pattern = kind === "KT1" ? /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/ : /^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/;
  if (!pattern.test(value)) throw new Error(`Invalid ${name}`);
  return value;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ProviderConfig {
  const network = required(env, "TEZOS_NETWORK");
  if (network !== "mainnet" && network !== "shadownet") throw new Error("TEZOS_NETWORK must explicitly be mainnet or shadownet");
  const defaults = NETWORKS[network];
  const fee = env.ALEA_RENDER_GAS_MUTEZ?.trim();
  if (fee !== undefined && (!/^\d+$/.test(fee) || !Number.isSafeInteger(Number(fee)))) {
    throw new Error("ALEA_RENDER_GAS_MUTEZ must be an explicit nonnegative integer");
  }
  const rpcUrl = env.TEZOS_RPC?.trim() || defaults.rpcUrl;
  const tzktApi = env.TZKT_API?.trim() || defaults.tzktApi;
  for (const [name, url] of [["TEZOS_RPC", rpcUrl], ["TZKT_API", tzktApi]]) {
    if (new URL(url).protocol !== "https:") throw new Error(`${name} must use HTTPS`);
  }
  return {
    network,
    chainId: defaults.chainId,
    rpcUrl,
    tzktApi: tzktApi.replace(/\/+$/, ""),
    router: address(required(env, "ALEA_ROUTER_ADDRESS"), "KT1", "ALEA_ROUTER_ADDRESS"),
    registry: address(required(env, "ALEA_REGISTRY_ADDRESS"), "KT1", "ALEA_REGISTRY_ADDRESS"),
    provider: env.ALEA_PROVIDER_ADDRESS ? address(env.ALEA_PROVIDER_ADDRESS.trim(), "KT1", "ALEA_PROVIDER_ADDRESS") : undefined,
    operatorAddress: address(required(env, "WTF_ALEATORY_OPERATOR_ADDRESS"), "tz", "WTF_ALEATORY_OPERATOR_ADDRESS"),
    agentAddress: env.ALEA_AGENT_ADDRESS ? address(env.ALEA_AGENT_ADDRESS.trim(), "tz", "ALEA_AGENT_ADDRESS") : undefined,
    renderGasMutez: fee === undefined ? undefined : Number(fee),
    stateDir: required(env, "ALEA_STATE_DIR"),
  };
}

export async function verifyNetwork(config: ProviderConfig): Promise<ProviderConfig> {
  const verified = await probeRpcChainId({ network: config.network, rpcUrl: config.rpcUrl });
  if (verified.chainId !== config.chainId) throw new Error("RPC chain mismatch");
  const response = await fetch(`${config.tzktApi}/v1/head`);
  if (!response.ok) throw new Error(`Indexer head unavailable: HTTP ${response.status}`);
  const head = await response.json() as { chain?: string; chainId?: string };
  if ((head.chain && head.chain !== config.network) || (head.chainId && head.chainId !== config.chainId)) {
    throw new Error("Indexer network mismatch");
  }
  const result = { ...config, rpcUrl: verified.rpcUrl };
  process.env.TEZOS_RPC = result.rpcUrl;
  process.env.TZKT_API = result.tzktApi;
  return result;
}

export async function readChainConfiguration(config: ProviderConfig) {
  const get = async (path: string) => {
    const response = await fetch(`${config.tzktApi}${path}`);
    if (!response.ok) throw new Error(`Chain configuration unavailable: HTTP ${response.status}`);
    return response.json();
  };
  const router = await get(`/v1/contracts/${config.router}/storage`) as { registry: string; factories: string[] };
  if (router.registry !== config.registry || !router.factories?.length) throw new Error("Official router/registry configuration mismatch");
  if (!config.provider) return { router, provider: null, registered: false };
  const provider = await get(`/v1/contracts/${config.provider}/storage`) as { operator: string; agent: string; render_gas: string };
  if (provider.operator !== config.operatorAddress) throw new Error("Provider operator mismatch");
  if (config.agentAddress && provider.agent !== config.agentAddress) throw new Error("Provider agent mismatch");
  if (config.renderGasMutez !== undefined && BigInt(provider.render_gas) !== BigInt(config.renderGasMutez)) throw new Error("Provider fee differs from configured price");
  const registration = await fetch(`${config.tzktApi}/v1/contracts/${config.registry}/bigmaps/providers/keys/${config.provider}`);
  if (!registration.ok && registration.status !== 404) throw new Error(`Registry lookup unavailable: HTTP ${registration.status}`);
  const entry = registration.ok ? await registration.json() as { active?: boolean } : null;
  return { router, provider, registered: entry?.active === true };
}
