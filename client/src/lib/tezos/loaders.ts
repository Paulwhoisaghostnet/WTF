import { RPC_URLS } from "@shared/types";

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

export async function loadBeaconWallet() {
  return import("@taquito/beacon-wallet");
}

export async function loadTaquito() {
  return import("@taquito/taquito");
}
