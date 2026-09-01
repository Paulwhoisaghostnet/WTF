import { RPC_FALLBACK_URLS, RPC_URLS } from "@shared/types";

function viteEnv(name: string): string | undefined {
  const raw = (import.meta as any).env?.[name];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

export function getRpcUrl(): string {
  const network = getNetwork();
  return getRpcUrlForNetwork(network);
}

export function getRpcUrlForNetwork(network: string): string {
  const envNetwork = viteEnv("VITE_TEZOS_NETWORK") || "mainnet";
  const envRpcUrl = viteEnv("VITE_TEZOS_RPC_URL");
  if (envRpcUrl && network === envNetwork) return envRpcUrl;
  return RPC_URLS[network] || RPC_URLS.mainnet;
}

function normalizeRpcUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getRpcFallbackUrlsForNetwork(network: string): string[] {
  const envNetwork = viteEnv("VITE_TEZOS_NETWORK") || "mainnet";
  const envRpcUrl = viteEnv("VITE_TEZOS_RPC_URL");
  if (envRpcUrl && network === envNetwork) return [];

  const primary = normalizeRpcUrl(getRpcUrlForNetwork(network));
  return (RPC_FALLBACK_URLS[network] || []).filter((url) => normalizeRpcUrl(url) !== primary);
}

export function getNetwork(): string {
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem("wtf:network");
    if (stored) return stored;
  }
  return viteEnv("VITE_TEZOS_NETWORK") || "mainnet";
}

export async function loadOctezConnect() {
  return import("@tezos-x/octez.connect-sdk");
}

export function getOctezWalletConnectOptions(): { walletConnectOptions: { projectId: string } } | Record<string, never> {
  const projectId = viteEnv("VITE_WALLETCONNECT_PROJECT_ID");
  return projectId ? { walletConnectOptions: { projectId } } : {};
}

export async function loadTaquito() {
  return import("@taquito/taquito");
}
