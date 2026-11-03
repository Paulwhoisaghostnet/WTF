import { toNatString } from "../../lib/tezos/nat";

export function parseObjktToken(input: string): { contract: string; tokenId: string } {
  const value = input.trim();
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    throw new Error("Paste a valid Objkt token link.");
  }
  if (!/^(?:www\.)?objkt\.com$/i.test(url.hostname)) {
    throw new Error("Paste a token link from objkt.com.");
  }
  const match = /^\/tokens\/(KT1[1-9A-HJ-NP-Za-km-z]{33})\/(\d+)\/?$/.exec(url.pathname);
  if (!match) throw new Error("Use an Objkt token link with a contract and token ID.");
  return { contract: match[1], tokenId: toNatString(match[2]) };
}

export function objktTokenUrl(contract: string, tokenId: string): string {
  return `https://objkt.com/tokens/${encodeURIComponent(contract)}/${encodeURIComponent(tokenId)}`;
}
