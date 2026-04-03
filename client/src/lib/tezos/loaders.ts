import { RPC_URLS } from "@shared/types";

export function getRpcUrl(): string {
  const network = getNetwork();
  return RPC_URLS[network] || RPC_URLS.mainnet;
}

export function getNetwork(): string {
  return localStorage.getItem("wtf:network") || "mainnet";
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
