import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMediaPastaPackage,
  PASTA_HANDOFF_ENVELOPE,
  PASTA_HANDOFF_PREFIX,
  parseTags,
  publisherForContractKind,
  readKnownMintContracts,
  stagePastaMediaHandoff,
} from "./mint-manager";

const pastaContract = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const walletContract = "KT1XaCf6gkjFnKg3QmPfn6gep53moMvjkj1E";

test("Mint Manager merges Pasta records with linked-wallet originations", () => {
  const workspace = JSON.stringify([{
    schema: "pasta-project@1",
    id: "project-1",
    title: "Collection",
    toolId: "spaghetti",
    stage: "deployed",
    network: "mainnet",
    contracts: [pastaContract],
    contractRecords: [{
      schema: "pasta-contract-ref@1",
      address: pastaContract,
      toolId: "spaghetti",
      network: "mainnet",
      label: "My Spaghetti collection",
      source: "deployed",
      recordedAt: "2026-08-20T00:00:00.000Z",
    }],
    artifacts: [],
    drafts: [],
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
  }]);
  const contracts = readKnownMintContracts({ wallets: [{ events: [
    { eventType: "origination", counterpartyAddress: pastaContract, walletAddress: "tz1Creator" },
    { eventType: "origination", counterpartyAddress: walletContract, walletAddress: "tz1Creator" },
  ] }] }, workspace);
  assert.equal(contracts.length, 2);
  assert.equal(contracts.find((entry) => entry.address === pastaContract)?.source, "pasta");
  assert.equal(contracts.find((entry) => entry.address === walletContract)?.source, "wallet");
});

test("Mint Manager builds a destination-valid CH-EASE token handoff", () => {
  const pkg = buildMediaPastaPackage({
    publisher: "spaghetti",
    name: "GIF study",
    description: "Animated pixels",
    artifactUri: "ipfs://QmArtifact",
    mimeType: "image/gif",
    tags: parseTags("gif, pixels, gif"),
  });
  assert.equal(pkg.kind, "single_token");
  assert.equal(pkg.targetApp, "spaghetti");
  assert.deepEqual(pkg.token.tags, ["gif", "pixels"]);
  assert.equal(publisherForContractKind("open_edition_collection"), "gnocchi");
  assert.equal(publisherForContractKind("blind_mint_collection"), null);
});

test("Mint Manager stages the same recoverable envelope Pasta publishers consume", () => {
  const session = new Map<string, string>();
  const local = new Map<string, string>();
  const priorWindow = (globalThis as any).window;
  (globalThis as any).window = {
    sessionStorage: { setItem: (key: string, value: string) => session.set(key, value) },
    localStorage: { setItem: (key: string, value: string) => local.set(key, value) },
  };
  try {
    const pkg = buildMediaPastaPackage({
      publisher: "gnocchi",
      name: "Open GIF",
      description: "",
      artifactUri: "ipfs://QmArtifact",
      mimeType: "image/gif",
      tags: [],
    });
    const href = stagePastaMediaHandoff({ publisher: "gnocchi", package: pkg, network: "shadownet", contract: pastaContract });
    const key = `${PASTA_HANDOFF_PREFIX}:gnocchi`;
    assert.match(href, /^\/tools\/gnocchi\?/);
    assert.match(href, /network=shadownet/);
    assert.match(href, new RegExp(`contract=${pastaContract}`));
    assert.equal(JSON.parse(session.get(key)!).targetApp, "gnocchi");
    assert.equal(JSON.parse(local.get(key)!).schema, PASTA_HANDOFF_ENVELOPE);
  } finally {
    (globalThis as any).window = priorWindow;
  }
});
