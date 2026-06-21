import type {
  WtfDomainsNetwork,
  WtfDomainsRegistrarConfig,
} from "@shared/wtf-subdomains";
import { tzkt } from "../../lib/upstream";
import { getWtfParentDomain } from "./labels";

const NETWORK_DEFAULTS: Record<
  WtfDomainsNetwork,
  Omit<WtfDomainsRegistrarConfig, "enabled" | "parentDomain" | "registrarAddress" | "missingEnv">
> = {
  mainnet: {
    network: "mainnet",
    rpcUrl: "https://tezos-mainnet.octez.io/",
    tzktApi: "https://api.tzkt.io",
    domainsGraphql: "https://api.tezos.domains/graphql",
    tedAppUrl: "https://app.tezos.domains",
    tedCheckAddress: "KT1F7JKNqwaoLzRsMio1MQC7zv3jG9dHcDdJ",
    tedSetChildRecord: "KT1QHLk1EMUA8BPH3FvRUeUmbTspmAhb7kpd",
    tedUpdateRecord: "KT1H1MqmUM4aK9i1833EBmYCCEfkbt6ZdSBc",
  },
  ghostnet: {
    network: "ghostnet",
    rpcUrl: "https://rpc.ghostnet.teztnets.com",
    tzktApi: "https://api.ghostnet.tzkt.io",
    domainsGraphql: "https://ghostnet-api.tezos.domains/graphql",
    tedAppUrl: "https://ghostnet.tezos.domains",
    tedCheckAddress: "KT1B3j3At2XMF5P8bVoPD2WeJbZ9eaPiu3pD",
    tedSetChildRecord: "KT1HpddfW7rX5aT2cTdsDaQZnH46bU7jQSTU",
    tedUpdateRecord: "KT1Ln4t64RdCG1bK8zkH6Xi4nNQVxz7qNgyj",
  },
  shadownet: {
    network: "shadownet",
    rpcUrl: "https://tezos-shadownet.octez.io/",
    tzktApi: "https://api.shadownet.tzkt.io",
    domainsGraphql: "",
    tedAppUrl: "https://shadownet.tezos.domains",
    tedCheckAddress: "",
    tedSetChildRecord: "",
    tedUpdateRecord: "",
  },
};

export function getWtfDomainsRegistrarConfig(
  env: NodeJS.ProcessEnv = process.env
): WtfDomainsRegistrarConfig {
  const parentDomain = (
    env.WTF_DOMAINS_PARENT_DOMAIN ||
    env.WTF_TEZ_PARENT_DOMAIN ||
    getWtfParentDomain()
  )
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, "");
  const network = normalizeNetwork(
    env.WTF_DOMAINS_NETWORK || env.TEZOS_NETWORK,
    parentDomain
  );
  const defaults = NETWORK_DEFAULTS[network];
  const enabled = parseBoolean(env.WTF_DOMAINS_REGISTRAR_ENABLED);
  const registrarAddress =
    (env.WTF_DOMAINS_REGISTRAR_ADDRESS || env.WTF_TEZ_REGISTRAR_ADDRESS || "")
      .trim() || null;
  const missingEnv =
    enabled && !registrarAddress ? ["WTF_DOMAINS_REGISTRAR_ADDRESS"] : [];

  return {
    enabled,
    parentDomain,
    registrarAddress,
    network,
    rpcUrl: (env.WTF_DOMAINS_RPC_URL || defaults.rpcUrl).trim(),
    tzktApi: (env.WTF_DOMAINS_TZKT_API || defaults.tzktApi).trim(),
    domainsGraphql: (
      env.WTF_DOMAINS_GRAPHQL_URL || defaults.domainsGraphql
    ).trim(),
    tedAppUrl: (env.WTF_DOMAINS_TED_APP_URL || defaults.tedAppUrl).trim(),
    tedCheckAddress: (
      env.WTF_DOMAINS_TED_CHECK_ADDRESS || defaults.tedCheckAddress
    ).trim(),
    tedSetChildRecord: (
      env.WTF_DOMAINS_TED_SET_CHILD_RECORD || defaults.tedSetChildRecord
    ).trim(),
    tedUpdateRecord: (
      env.WTF_DOMAINS_TED_UPDATE_RECORD || defaults.tedUpdateRecord
    ).trim(),
    missingEnv,
  };
}

export async function fetchRegistrarStorage(
  config = getWtfDomainsRegistrarConfig()
): Promise<Record<string, unknown>> {
  if (!config.enabled) {
    throw new Error("WTF domains registrar is disabled");
  }
  if (!config.registrarAddress) {
    throw new Error("WTF_DOMAINS_REGISTRAR_ADDRESS is required");
  }
  const res = await tzkt.raw(
    `${config.tzktApi.replace(/\/+$/, "")}/v1/contracts/${encodeURIComponent(
      config.registrarAddress
    )}/storage`
  );
  return (await res.json()) as Record<string, unknown>;
}

function normalizeNetwork(
  raw: string | undefined,
  parentDomain: string
): WtfDomainsNetwork {
  if (raw === "mainnet" || raw === "ghostnet" || raw === "shadownet") {
    return raw;
  }
  if (parentDomain.endsWith(".gho")) return "ghostnet";
  if (parentDomain.endsWith(".shd")) return "shadownet";
  return "mainnet";
}

function parseBoolean(raw: string | undefined): boolean {
  if (!raw) return false;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}
