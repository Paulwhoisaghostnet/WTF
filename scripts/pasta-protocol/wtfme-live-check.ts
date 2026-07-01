#!/usr/bin/env tsx

import assert from "node:assert/strict";
import process from "node:process";

import {
  PASTA_WTFME_NETWORK,
  PASTA_WTFME_PROOF_CONTRACTS,
} from "../../server/features/wtf-sites/pasta-hosting";

const DEFAULT_HOST = "wtf-admin.wtfos.me";
const HOST = String(process.env.PASTA_WTFME_LIVE_HOST || DEFAULT_HOST).trim().toLowerCase();
const TLS_ASK_BASE_URL = String(
  process.env.PASTA_WTFME_TLS_ASK_BASE_URL || process.env.WTFOS_BASE_URL || "https://wtfos.app"
).trim();
const CHECK_PINS = !/^(0|false|no|off)$/i.test(String(process.env.PASTA_WTFME_LIVE_CHECK_PINS || "1"));

type PageProbe = {
  label: string;
  text: string;
  headers: Headers;
};

function fail(message: string): never {
  throw new Error(message);
}

function ok(message: string): void {
  console.log(`[pasta-wtfme-live] ok: ${message}`);
}

function baseUrl(): URL {
  if (!HOST || !/^[a-z0-9.-]+$/.test(HOST)) fail(`invalid PASTA_WTFME_LIVE_HOST: ${HOST}`);
  if (!HOST.endsWith(".wtfos.me")) fail(`live WTF.ME host must end with .wtfos.me: ${HOST}`);
  return new URL(`https://${HOST}/`);
}

function tlsAskBaseUrl(): URL {
  const url = new URL(TLS_ASK_BASE_URL);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

async function assertTlsAskAllowsHost(): Promise<void> {
  const url = new URL("/internal/tls/allow", tlsAskBaseUrl());
  url.searchParams.set("domain", HOST);
  const response = await fetch(url, {
    headers: { "user-agent": "wtfos-pasta-wtfme-live-check" },
    redirect: "manual",
  });
  const text = await response.text();
  let parsed: { ok?: unknown; reason?: unknown } = {};
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    // Keep the raw response in the assertion below.
  }
  if (response.status !== 200) {
    fail(`${url.toString()} denied ${HOST}: HTTP ${response.status} ${String(parsed.reason || text).slice(0, 160)}`);
  }
  if (parsed.ok !== true) fail(`${url.toString()} did not return ok: true for ${HOST}`);
  ok(`${url.toString()} allows on-demand TLS for ${HOST}`);
}

async function fetchText(pathname: string): Promise<PageProbe> {
  const url = new URL(pathname, baseUrl());
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "user-agent": "wtfos-pasta-wtfme-live-check" },
      redirect: "manual",
    });
  } catch (error) {
    const cause = error instanceof Error && "cause" in error ? (error as { cause?: unknown }).cause : null;
    const causeMessage = cause instanceof Error ? cause.message : cause ? String(cause) : "";
    const causeDetail = causeMessage ? ` (${causeMessage.replace(/\s+/g, " ").trim()})` : "";
    const detail = error instanceof Error ? `${error.message}${causeDetail}` : String(error);
    fail(`${url.toString()} could not be fetched over production TLS: ${detail}`);
  }
  const text = await response.text();
  assert.equal(response.status, 200, `${url.toString()} expected HTTP 200, got ${response.status}: ${text.slice(0, 160)}`);
  return { label: url.toString(), text, headers: response.headers };
}

function requireIncludes(text: string, marker: string, label: string): void {
  assert.ok(text.includes(marker), `${label} is missing marker: ${marker}`);
}

function assertUserSiteHeaders(probe: PageProbe): void {
  assert.equal(probe.headers.get("x-wtfos-surface"), "user-site", `${probe.label} did not return user-site surface header`);
  assert.equal(
    probe.headers.get("cross-origin-opener-policy"),
    "same-origin-allow-popups",
    `${probe.label} did not allow wallet popups through COOP`,
  );
  const csp = probe.headers.get("content-security-policy") || "";
  requireIncludes(csp, "wss://relay.walletconnect.org", `${probe.label} CSP`);
  requireIncludes(csp, "https://verify.walletconnect.org", `${probe.label} CSP`);
  requireIncludes(csp, "frame-src", `${probe.label} CSP`);
}

function assertCommonPastaMarkers(probe: PageProbe, pageKind: string): void {
  assertUserSiteHeaders(probe);
  requireIncludes(probe.text, `data-pasta-hosted-page="${pageKind}"`, probe.label);
  requireIncludes(probe.text, `data-pasta-network="${PASTA_WTFME_NETWORK.key}"`, probe.label);
  requireIncludes(probe.text, `data-pasta-chain-id="${PASTA_WTFME_NETWORK.chainId}"`, probe.label);
  requireIncludes(probe.text, "data-pasta-wallet-action=\"connect\"", probe.label);
  requireIncludes(probe.text, "Pasta Protocol", probe.label);
  requireIncludes(probe.text, "WTF.ME", probe.label);
}

function contract(app: string) {
  const found = PASTA_WTFME_PROOF_CONTRACTS.find((item) => item.app === app);
  if (!found) fail(`missing Pasta proof contract fixture for ${app}`);
  return found;
}

async function assertLanding(): Promise<void> {
  const probe = await fetchText("/");
  assertCommonPastaMarkers(probe, "landing");
  for (const item of PASTA_WTFME_PROOF_CONTRACTS) {
    requireIncludes(probe.text, item.contract, probe.label);
    requireIncludes(probe.text, item.relationshipGroup, probe.label);
  }
  ok(`${probe.label} serves the Pasta landing page`);
}

async function assertMint(): Promise<void> {
  const gnocchi = contract("gnocchi");
  const probe = await fetchText("/mint");
  assertCommonPastaMarkers(probe, "mint");
  requireIncludes(probe.text, `data-pasta-contract="${gnocchi.contract}"`, probe.label);
  requireIncludes(probe.text, `data-pasta-relationship-group="${gnocchi.relationshipGroup}"`, probe.label);
  if ("tokenId" in gnocchi) requireIncludes(probe.text, `data-pasta-token-id="${gnocchi.tokenId}"`, probe.label);
  if ("mintEntrypoint" in gnocchi) requireIncludes(probe.text, `data-pasta-mint-entrypoint="${gnocchi.mintEntrypoint}"`, probe.label);
  if ("priceMutez" in gnocchi) requireIncludes(probe.text, `data-pasta-price-mutez="${gnocchi.priceMutez}"`, probe.label);
  requireIncludes(probe.text, `href="${PASTA_WTFME_NETWORK.tzkt}/${gnocchi.contract}"`, probe.label);
  requireIncludes(probe.text, "data-pasta-purchase-action=\"mint\"", probe.label);
  ok(`${probe.label} serves the Gnocchi mint page`);
}

async function assertCollection(): Promise<void> {
  const spaghetti = contract("spaghetti");
  const probe = await fetchText("/collection");
  assertCommonPastaMarkers(probe, "collection");
  requireIncludes(probe.text, `data-pasta-contract="${spaghetti.contract}"`, probe.label);
  requireIncludes(probe.text, `data-pasta-relationship-group="${spaghetti.relationshipGroup}"`, probe.label);
  if ("tokenId" in spaghetti) requireIncludes(probe.text, `data-pasta-token-id="${spaghetti.tokenId}"`, probe.label);
  requireIncludes(probe.text, `href="${PASTA_WTFME_NETWORK.tzkt}/${spaghetti.contract}"`, probe.label);
  ok(`${probe.label} serves the Spaghetti collection page`);
}

async function assertWellKnownPins(): Promise<void> {
  if (!CHECK_PINS) {
    console.log("[pasta-wtfme-live] skipped pin discovery; PASTA_WTFME_LIVE_CHECK_PINS=0");
    return;
  }
  const probe = await fetchText("/.well-known/wtfos-pins");
  const parsed = JSON.parse(probe.text);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.host, HOST);
  assert.match(String(parsed.repoDid || ""), /^did:/);
  assert.match(String(parsed.manifestUri || ""), /^at:\/\/did:/);
  ok(`${probe.label} exposes public pin discovery`);
}

async function main(): Promise<void> {
  console.log(`[pasta-wtfme-live] checking ${baseUrl().origin}`);
  await assertTlsAskAllowsHost();
  await assertLanding();
  await assertMint();
  await assertCollection();
  await assertWellKnownPins();
  console.log("[pasta-wtfme-live] live WTF.ME Pasta readiness checks passed");
}

main().catch((error) => {
  console.error(`[pasta-wtfme-live] ${error.stack || error.message}`);
  process.exit(1);
});
