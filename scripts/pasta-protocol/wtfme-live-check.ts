#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import process from "node:process";

import {
  PASTA_WTFME_NETWORK,
  PASTA_WTFME_PROOF_CONTRACTS,
} from "../../server/features/wtf-sites/pasta-hosting";

const HOST = String(process.env.PASTA_WTFME_LIVE_HOST || "").trim().toLowerCase();
const TLS_ASK_BASE_URL = String(
  process.env.PASTA_WTFME_TLS_ASK_BASE_URL || process.env.WTFOS_BASE_URL || "https://wtfos.app"
).trim();
const CHECK_PINS = !/^(0|false|no|off)$/i.test(String(process.env.PASTA_WTFME_LIVE_CHECK_PINS || "1"));
const CHECK_PIN_RECORDS = !/^(0|false|no|off)$/i.test(String(process.env.PASTA_WTFME_LIVE_CHECK_PIN_RECORDS || "1"));
const MANIFEST_PAYLOAD_URL = String(process.env.PASTA_WTFME_LIVE_MANIFEST_PAYLOAD_URL || "").trim();

type AtUriParts = {
  repo: string;
  collection: string;
  rkey: string;
};

type PageProbe = {
  label: string;
  text: string;
  headers: Headers;
};

type DidDocument = {
  id?: unknown;
  service?: Array<{
    id?: unknown;
    type?: unknown;
    serviceEndpoint?: unknown;
  }>;
};

type PinManifestRecordValue = {
  $type?: unknown;
  scopeType?: unknown;
  scopeRef?: unknown;
  sourceChain?: unknown;
  itemCount?: unknown;
  totalBytes?: unknown;
  storageRef?: {
    s3Key?: unknown;
    checksumSha256?: unknown;
    byteSize?: unknown;
    mimeType?: unknown;
  };
  subdomainRefs?: Array<{
    kind?: unknown;
    host?: unknown;
  }>;
};

function fail(message: string): never {
  throw new Error(message);
}

function ok(message: string): void {
  console.log(`[pasta-wtfme-live] ok: ${message}`);
}

function baseUrl(): URL {
  if (!HOST) {
    fail(
      "Set PASTA_WTFME_LIVE_HOST to the published Pasta WTF.ME host; " +
        "the live publish script prints the exact verification command after publishing"
    );
  }
  if (!/^[a-z0-9.-]+$/.test(HOST)) fail(`invalid PASTA_WTFME_LIVE_HOST: ${HOST}`);
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
    // The assertion below includes the raw response when JSON parsing fails.
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

function parseAtUri(uri: string): AtUriParts {
  const match = /^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(uri);
  if (!match) fail(`invalid manifest at-uri: ${uri}`);
  return {
    repo: match[1],
    collection: match[2],
    rkey: match[3],
  };
}

function didWebDocumentUrl(did: string): URL {
  const suffix = did.slice("did:web:".length);
  const parts = suffix.split(":").map((part) => decodeURIComponent(part));
  const host = parts.shift();
  if (!host) fail(`invalid did:web repo DID: ${did}`);
  const url = new URL(`https://${host}/`);
  if (parts.length === 0) {
    url.pathname = "/.well-known/did.json";
  } else {
    url.pathname = `/${parts.map(encodeURIComponent).join("/")}/did.json`;
  }
  return url;
}

function didDocumentUrl(did: string): URL {
  if (did.startsWith("did:web:")) return didWebDocumentUrl(did);
  if (did.startsWith("did:plc:")) {
    const base = new URL(String(process.env.PASTA_WTFME_PLC_DIRECTORY_URL || "https://plc.directory/"));
    base.pathname = `/${did}`;
    base.search = "";
    base.hash = "";
    return base;
  }
  fail(`unsupported repo DID method for pin record proof: ${did}`);
}

async function fetchJson(url: URL, label: string): Promise<any> {
  const response = await fetch(url, {
    headers: { "user-agent": "wtfos-pasta-wtfme-live-check" },
    redirect: "manual",
  });
  const text = await response.text();
  if (!response.ok) fail(`${label} returned HTTP ${response.status}: ${text.slice(0, 160)}`);
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${label} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function fetchTextUrl(url: URL, label: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": "wtfos-pasta-wtfme-live-check" },
    redirect: "manual",
  });
  const text = await response.text();
  if (!response.ok) fail(`${label} returned HTTP ${response.status}: ${text.slice(0, 160)}`);
  return text;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertManifestPayload(payload: any, value: PinManifestRecordValue, repoDid: string): void {
  assert.equal(payload?.schemaVersion, 1);
  assert.equal(payload?.product, "pasta-protocol");
  assert.equal(payload?.network?.key, PASTA_WTFME_NETWORK.key);
  assert.equal(payload?.network?.chainId, PASTA_WTFME_NETWORK.chainId);
  assert.equal(payload?.host, HOST);
  assert.equal(payload?.repoDid, repoDid);
  assert.equal(payload?.scopeType, "project_bundle");
  assert.equal(payload?.scopeRef, value.scopeRef);
  assert.equal(payload?.itemCount, value.itemCount);
  assert.equal(payload?.totalBytes, value.totalBytes);
  assert.deepEqual(payload?.recovery?.requiredKinds, [
    "hosted_page",
    "contract_artifact",
    "token_metadata",
    "relationship_metadata",
  ]);
  assert.ok(Array.isArray(payload?.items), "manifest payload should expose items[]");
  assert.equal(payload.items.length, value.itemCount, "manifest payload item count should match the PDS record");

  const kinds = new Set(payload.items.map((item: any) => item?.kind));
  for (const kind of ["hosted_page", "contract_artifact", "token_metadata", "relationship_metadata"]) {
    assert.ok(kinds.has(kind), `manifest payload is missing ${kind}`);
  }
  for (const item of payload.items) {
    assert.match(String(item?.cid || ""), /^bafy/i, "manifest item should expose an IPFS CID");
    assert.match(String(item?.checksumSha256 || ""), /^[a-f0-9]{64}$/);
    assert.ok(Number(item?.byteSize || 0) > 0, "manifest item should expose byteSize");
    const mirrorKey = String(item?.storageRef?.s3Key || item?.storage?.key || "");
    assert.ok(mirrorKey.includes("pasta"), "manifest item should expose a Pasta mirror key");
  }
  const gatewayItems = Array.isArray(payload?.accessibility?.items) ? payload.accessibility.items : [];
  if (gatewayItems.length > 0) {
    assert.equal(gatewayItems.length, payload.items.length, "accessibility item count should match manifest items");
    for (const item of gatewayItems) {
      assert.match(String(item?.gatewayUrl || ""), /^https:\/\/ipfs\.io\/ipfs\/bafy/i);
      assert.ok(String(item?.mirrorKey || "").includes("pasta"), "accessibility item should expose object mirror key");
    }
  }
}

function atprotoPdsEndpoint(didDocument: DidDocument, repoDid: string): URL {
  assert.equal(didDocument.id, repoDid, "DID document id should match the pin discovery repo DID");
  const services = Array.isArray(didDocument.service) ? didDocument.service : [];
  const service = services.find((candidate) => {
    const id = String(candidate.id || "");
    const type = Array.isArray(candidate.type) ? candidate.type.join(" ") : String(candidate.type || "");
    return id.endsWith("#atproto_pds") || type.includes("AtprotoPersonalDataServer");
  });
  if (!service) fail(`DID document for ${repoDid} is missing an AtprotoPersonalDataServer service`);
  const endpoint = Array.isArray(service.serviceEndpoint) ? service.serviceEndpoint[0] : service.serviceEndpoint;
  const url = new URL(String(endpoint || ""));
  if (url.protocol !== "https:") fail(`PDS endpoint for ${repoDid} must be HTTPS: ${url.toString()}`);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

async function assertManifestPayloadUrl(value: PinManifestRecordValue, repoDid: string): Promise<void> {
  if (!MANIFEST_PAYLOAD_URL) {
    console.log("[pasta-wtfme-live] skipped manifest payload fetch; set PASTA_WTFME_LIVE_MANIFEST_PAYLOAD_URL to verify public item payloads");
    return;
  }
  const url = new URL(MANIFEST_PAYLOAD_URL);
  if (url.protocol !== "https:") fail(`manifest payload URL must be HTTPS: ${url.toString()}`);
  const text = await fetchTextUrl(url, `${url.toString()} manifest payload`);
  const expectedChecksum = String(value.storageRef?.checksumSha256 || "");
  if (expectedChecksum) {
    assert.equal(sha256Hex(text), expectedChecksum, "manifest payload SHA-256 should match the PDS pinManifest storageRef");
  }
  if (typeof value.storageRef?.byteSize === "number") {
    assert.equal(Buffer.byteLength(text), value.storageRef.byteSize, "manifest payload byte size should match the PDS pinManifest storageRef");
  }
  let payload: any;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    fail(`manifest payload returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  assertManifestPayload(payload, value, repoDid);
  ok(`${url.toString()} exposes the public Pasta manifest payload with recoverable item coordinates`);
}

async function assertPinManifestRecord(repoDid: string, manifestUri: string): Promise<void> {
  if (!CHECK_PIN_RECORDS) {
    console.log("[pasta-wtfme-live] skipped pin record resolution; PASTA_WTFME_LIVE_CHECK_PIN_RECORDS=0");
    return;
  }

  const parts = parseAtUri(manifestUri);
  assert.equal(parts.repo, repoDid, "pin manifest at-uri repo should match .well-known repoDid");
  assert.equal(parts.collection, "app.wtfos.media.pinManifest", "pin discovery must point at a pinManifest record");

  const didDocUrl = didDocumentUrl(repoDid);
  const didDocument = await fetchJson(didDocUrl, `${didDocUrl.toString()} DID document`) as DidDocument;
  const pds = atprotoPdsEndpoint(didDocument, repoDid);
  const recordUrl = new URL("/xrpc/com.atproto.repo.getRecord", pds);
  recordUrl.searchParams.set("repo", repoDid);
  recordUrl.searchParams.set("collection", parts.collection);
  recordUrl.searchParams.set("rkey", parts.rkey);

  const record = await fetchJson(recordUrl, `${recordUrl.toString()} pin manifest record`);
  assert.equal(record.uri, manifestUri, "PDS pin manifest record URI should match .well-known manifestUri");
  const value = record.value as PinManifestRecordValue;
  assert.equal(value?.$type, "app.wtfos.media.pinManifest");
  assert.equal(value?.scopeType, "project_bundle");
  assert.match(String(value?.scopeRef || ""), /^pasta-protocol:shadownet:/);
  assert.equal(value?.sourceChain, "tezos-shadownet");
  assert.ok(Number(value?.itemCount || 0) > 0, "pin manifest record should expose a positive item count");
  assert.ok(Number(value?.totalBytes || 0) > 0, "pin manifest record should expose total bytes");
  assert.match(String(value?.storageRef?.checksumSha256 || ""), /^[a-f0-9]{64}$/);
  assert.equal(value?.storageRef?.mimeType, "application/json");
  assert.ok(Number(value?.storageRef?.byteSize || 0) > 0, "pin manifest should expose manifest payload byte size");
  assert.ok(String(value?.storageRef?.s3Key || "").includes("pasta-protocol"), "pin manifest should expose a Pasta mirror key");
  assert.ok(
    Array.isArray(value?.subdomainRefs) &&
      value.subdomainRefs.some((ref: any) => ref?.kind === "wtfos.me" && ref?.host === HOST),
    "pin manifest should bind to the checked WTF.ME host"
  );
  await assertManifestPayloadUrl(value, repoDid);
  ok(`${recordUrl.toString()} resolves the public Pasta pin manifest record`);
}

function assertUserSiteHeaders(probe: PageProbe): void {
  assert.equal(probe.headers.get("x-wtfos-surface"), "user-site", `${probe.label} did not return user-site surface header`);
  assert.equal(
    probe.headers.get("cross-origin-opener-policy"),
    "same-origin-allow-popups",
    `${probe.label} did not allow wallet popups through COOP`
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
  if (gnocchi.tokenId) requireIncludes(probe.text, `data-pasta-token-id="${gnocchi.tokenId}"`, probe.label);
  if (gnocchi.mintEntrypoint) {
    requireIncludes(probe.text, `data-pasta-mint-entrypoint="${gnocchi.mintEntrypoint}"`, probe.label);
  }
  if (gnocchi.priceMutez) requireIncludes(probe.text, `data-pasta-price-mutez="${gnocchi.priceMutez}"`, probe.label);
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
  if (spaghetti.tokenId) requireIncludes(probe.text, `data-pasta-token-id="${spaghetti.tokenId}"`, probe.label);
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
  await assertPinManifestRecord(String(parsed.repoDid), String(parsed.manifestUri));
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
