import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  APP_ORDER,
  APP_PROOF_SCHEMA,
  GNOCCHI_HISTORICAL_INDEXER_SCHEMA,
  ProofPackageError,
  SHADOWNET_CHAIN_ID,
  assembleProofPackage,
  validateProofRun,
} from "./assemble-proof-package.mjs";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4WQAAAAASUVORK5CYII=",
  "base64",
);
const CID = "bafybeigdyrzt5sfp7udm7hu76fbsclnmgqz3u7mvqfl5x7g4xkv7szm2vi";

const CONTRACTS = Object.freeze({
  macaroni: "KT1E5mXCQNj9gsaw3ZYNg5fC8TLk4XHKeU6i",
  spaghetti: "KT1WTFnZAyWqcC2SB32xEjMS4F4cutnGsyVc",
  gnocchi: "KT1W2ijLhjRHeH7wWYnvYcDwDsgRM7TpAFZK",
  ravioli: "KT194igzFGez1pB3HHhU8HFqyMzMLSLAPskB",
  rotini: "KT1HqzEFqbwcR8BpXZrrfPALY6bJaPGQgDHQ",
  penne: "KT1EPdyxCjmosesvJ21cr8WqoCnTXoomCpRz",
  lasagna: "KT1TEz2Rq8nUiNcJEAssrdrTqPj1h3ZN9B8r",
});

const OPERATION_HASHES = [
  "onobWdgobH4Gbm3kNYeXQFNtGe9bx8RMB4jp6VCqB8PgwjYtexq",
  "onpsnj8e5J8nt2hcY1hwVxQyiY88mZnbnCF2qqK1m69sw5sCJZp",
  "ontuJWXApaw5qqBLwxbrnm3hBwLEAxZ3RZjANkzSrLQ3KiHhKtM",
  "ontvJUZ9vNVusfHbcvzSX8xpPZMutmmwqqarvj4N78u2tUQn4oz",
  "onwA9NfZ61x8n7QAPnTVXpL7ZvR9C3gFATds1YDmFLGwAFrdgso",
  "oo2qtySsskwgYE41BAvN2jxYpvi1L8zugNwyk1JHXUWbYCj8P3h",
  "oo3s9KWmeGmNP22aFNnaFffM8yhCb9zDDvMnbd58HH2pETSJ1z8",
  "oo4EWt4cSBzh8YQXMvstowHos8FyBJ4hHCmQgn6N6Tjf5AqoMkN",
  "oo5bYmyRD3jbNkrM55SEYgMQJLWXmiyGT9HGZAJkteAprBaiJGG",
  "ooBnf6EHZ2SKxvVw5MQVHN4fjqAYzCKFo61QGT9eZ2cHrDoGmBM",
  "ooC4sPHna3JitAUL5fbKSszCas4gL9CsvxBA2cCNRWoHSr3jhs2",
  "ooKD83y3BSchZp7ag4SNN9EmEzz3sv6CdusqHq6g9oTFhk9qcxU",
  "ooMrVCnRvA8HZhuA874Hn7gmuvWdnEV28jwmXgGz1JCPCbMVTjG",
  "ooZNa4MALgiUQ1TRqbybVVFUfZegrykxekgMWDtGK5FAL4UopPS",
  "ooaUZenvyXycrGSbD87JYooTRGoNHjJ2e6GAkfQZ5D7KsRH4yi3",
  "oobqhAW2hYrFKgH8oUzVhDBXFNxgX2MjMezFrYcpBo5ePDJoo2n",
  "ooeBpcmKBT97Nup2ARn2hoY3HxyA8b9gHu3r2MykBh8wXeb1Mrg",
  "ooesGivHfNqZCfuH8ivTy7q7kLcVr2a2YafDErf8ENVC6g6PDgW",
];

const REQUIRED_KINDS = Object.freeze({
  macaroni: ["origination", "mint"],
  spaghetti: ["origination", "mint"],
  gnocchi: ["origination", "mint"],
  ravioli: ["origination", "mint", "open"],
  rotini: ["origination", "reserve", "finalize"],
  penne: ["origination", "distribute"],
  lasagna: ["origination", "publish"],
});

const ROLES = Object.freeze({
  "ch-ease": "preparation",
  macaroni: "token-publisher",
  spaghetti: "token-publisher",
  gnocchi: "token-publisher",
  ravioli: "token-publisher",
  rotini: "token-publisher",
  penne: "token-publisher",
  lasagna: "exhibition-registry",
  colander: "management",
});

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function requestSha256(url) {
  return sha256(Buffer.from(`GET\n${url}\n`, "utf8"));
}

function operationRecord(hash, kind, contractAddress) {
  return {
    kind,
    hash,
    contractAddress,
    ...(kind === "origination" ? {} : { entrypoint: `${kind}-proof`.replaceAll("-", "_") }),
    status: "applied",
    explorerUrl: `https://shadownet.tzkt.io/${hash}`,
  };
}

async function writeArtifact(appRoot, fileName, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const relativePath = `artifacts/${fileName}`;
  await writeFile(path.join(appRoot, relativePath), bytes);
  return { relativePath, bytes, sha256: sha256(bytes) };
}

async function createCompleteFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "pasta-proof-run-"));
  let operationIndex = 0;
  for (const app of APP_ORDER) {
    const appRoot = path.join(root, app);
    await mkdir(path.join(appRoot, "screenshots"), { recursive: true });
    await mkdir(path.join(appRoot, "artifacts"), { recursive: true });
    const screenshotStages = app === "ch-ease" ? ["prepare", "handoff"] : ["configure", "submit", "confirmed"];
    const screenshots = [];
    for (const stage of screenshotStages) {
      const relativePath = `screenshots/${stage}.png`;
      const screenshotBytes = Buffer.concat([PNG, Buffer.from(`\n${app}:${stage}\n`, "utf8")]);
      await writeFile(path.join(appRoot, relativePath), screenshotBytes);
      screenshots.push({
        stage,
        path: relativePath,
        sha256: sha256(screenshotBytes),
        caption: `${app} ${stage} stage`,
      });
    }

    let artifacts;
    let contracts = [];
    let operations = [];
    let tokens = [];
    let roleEvidence = [];

    if (app === "ch-ease") {
      const prepared = await writeArtifact(appRoot, "prepared-package.json", JSON.stringify({ app, ok: true }));
      artifacts = [
        {
          id: "prepared-package",
          kind: "prepared-package",
          path: prepared.relativePath,
          sha256: prepared.sha256,
        },
      ];
      roleEvidence = [
        {
          kind: "package-export",
          artifactId: "prepared-package",
          url: "http://127.0.0.1:4321/download/prepared-package.json",
        },
        {
          kind: "publisher-handoff",
          targetApp: "spaghetti",
          url: "http://127.0.0.1:4321/tools/spaghetti?handoff=chease-package",
        },
      ];
    } else if (app === "lasagna") {
      const exhibition = await writeArtifact(appRoot, "exhibition.json", JSON.stringify({ app, references: [] }));
      artifacts = [
        {
          id: "exhibition-metadata",
          kind: "exhibition-metadata",
          path: exhibition.relativePath,
          sha256: exhibition.sha256,
          ipfsUri: `ipfs://${CID}/lasagna-exhibition.json`,
          gatewayUrl: `https://ipfs.io/ipfs/${CID}/lasagna-exhibition.json`,
          retrievedSha256: exhibition.sha256,
        },
      ];
      const contractAddress = CONTRACTS.lasagna;
      contracts = [
        {
          address: contractAddress,
          kind: "exhibition-registry",
          explorerUrl: `https://shadownet.tzkt.io/${contractAddress}`,
        },
      ];
      operations = REQUIRED_KINDS.lasagna.map((kind) =>
        operationRecord(OPERATION_HASHES[operationIndex++], kind, contractAddress),
      );
      roleEvidence = [
        {
          kind: "exhibition-publication",
          artifactId: "exhibition-metadata",
          contractAddress,
          operationHash: operations.find((entry) => entry.kind === "publish").hash,
          url: `https://shadownet.tzkt.io/${contractAddress}`,
        },
      ];
    } else if (app === "colander") {
      const receipt = await writeArtifact(appRoot, "management-receipt.json", JSON.stringify({ app, status: "applied" }));
      artifacts = [
        {
          id: "management-receipt",
          kind: "management-receipt",
          path: receipt.relativePath,
          sha256: receipt.sha256,
        },
      ];
      operations = [
        operationRecord(OPERATION_HASHES[operationIndex++], "manage", CONTRACTS.lasagna),
      ];
      roleEvidence = [
        {
          kind: "contract-discovery",
          contractAddress: CONTRACTS.spaghetti,
          url: `https://shadownet.tzkt.io/${CONTRACTS.spaghetti}`,
        },
        {
          kind: "management-action",
          artifactId: "management-receipt",
          contractAddress: CONTRACTS.lasagna,
          operationHash: operations[0].hash,
          url: `https://shadownet.tzkt.io/${operations[0].hash}`,
        },
      ];
    } else {
      const metadata = await writeArtifact(appRoot, "token-metadata.json", JSON.stringify({ app, name: `${app} proof` }));
      const media = await writeArtifact(appRoot, "token-media.png", PNG);
      artifacts = [
        {
          id: "token-metadata",
          kind: "token-metadata",
          path: metadata.relativePath,
          sha256: metadata.sha256,
          ipfsUri: `ipfs://${CID}/${app}-metadata.json`,
          gatewayUrl: `https://ipfs.io/ipfs/${CID}/${app}-metadata.json`,
          retrievedSha256: metadata.sha256,
        },
        {
          id: "token-media",
          kind: "token-media",
          path: media.relativePath,
          sha256: media.sha256,
          ipfsUri: `ipfs://${CID}/${app}-media.png`,
          gatewayUrl: `https://ipfs.io/ipfs/${CID}/${app}-media.png`,
          retrievedSha256: media.sha256,
        },
      ];
      if (app === "ravioli") {
        const openKit = await writeArtifact(appRoot, "ravioli-open-kit-0.json", `${JSON.stringify({
          schema: "pasta-ravioli-open-kit@3",
          network: "shadownet",
          contract: CONTRACTS.ravioli,
          tokenId: 0,
          recipes: [{ serial: 0, nonce: "ab".repeat(32), actions: [{ kind: "escrow" }] }],
        }, null, 2)}\n`);
        artifacts.push({
          id: "ravioli-open-kit-0",
          kind: "open-kit",
          path: openKit.relativePath,
          sha256: openKit.sha256,
        });
      }
      const contractAddress = CONTRACTS[app];
      contracts = [
        {
          address: contractAddress,
          kind: `${app}-contract`,
          explorerUrl: `https://shadownet.tzkt.io/${contractAddress}`,
        },
      ];
      operations = REQUIRED_KINDS[app].map((kind) =>
        operationRecord(OPERATION_HASHES[operationIndex++], kind, contractAddress),
      );
      tokens = [
        {
          id: "proof-token",
          contractAddress,
          tokenId: "0",
          explorerUrl: `https://shadownet.tzkt.io/${contractAddress}/tokens/0`,
          metadataArtifactId: "token-metadata",
          mediaArtifactId: "token-media",
          metadataUri: `ipfs://${CID}/${app}-metadata.json`,
          artifactUri: `ipfs://${CID}/${app}-media.png`,
        },
      ];
    }

    if (app === "gnocchi") {
      const proofLevel = 10_000 + operationIndex;
      const acceptedOperations = operations.map((operation, index) => {
        const url = `https://api.shadownet.tzkt.io/v1/operations/${operation.hash}`;
        return {
          hash: operation.hash,
          kind: operation.kind,
          contractAddress: operation.contractAddress,
          entrypoint: operation.entrypoint ?? null,
          status: "applied",
          level: proofLevel - operations.length + index + 1,
          request: { method: "GET", url, sha256: requestSha256(url) },
          response: {
            status: 200,
            byteCount: 123,
            rawSha256: sha256(Buffer.from(`raw:${operation.hash}`)),
            canonicalSha256: sha256(Buffer.from(`canonical:${operation.hash}`)),
          },
        };
      });
      const historicalUrl =
        `https://api.shadownet.tzkt.io/v1/tokens/historical_balances/${proofLevel}` +
        `?token.contract=${CONTRACTS.gnocchi}&token.tokenId=0&limit=10000`;
      const currentUrl =
        `https://api.shadownet.tzkt.io/v1/tokens/balances` +
        `?token.contract=${CONTRACTS.gnocchi}&token.tokenId=0&balance.gt=0&limit=10000`;
      const proofState = {
        balances: [{ account: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb", balance: "1" }],
        totalSupply: "1",
        holdersCount: 1,
      };
      const historicalValue = {
        schema: GNOCCHI_HISTORICAL_INDEXER_SCHEMA,
        app: "gnocchi",
        network: {
          name: "shadownet",
          chainId: SHADOWNET_CHAIN_ID,
          tzktApiBase: "https://api.shadownet.tzkt.io/v1",
        },
        sourceManifest: {
          runId: "synthetic-proof-run",
          capturedAt: "2026-07-18T12:00:00.000Z",
          preSupplementSha256: sha256(Buffer.from("pre-supplement")),
          acceptedOperationsSha256: sha256(Buffer.from("accepted-operations")),
          tokenIdentitiesSha256: sha256(Buffer.from("token-identities")),
        },
        contractAddress: CONTRACTS.gnocchi,
        proofLevel,
        terminalAcceptedOperation: {
          hash: acceptedOperations.at(-1).hash,
          level: proofLevel,
        },
        acceptedOperations,
        tokens: [{
          tokenId: "0",
          proofState,
          historicalRequest: {
            request: { method: "GET", url: historicalUrl, sha256: requestSha256(historicalUrl) },
            response: {
              status: 200,
              byteCount: 123,
              rawSha256: sha256(Buffer.from("historical-raw")),
              canonicalSha256: sha256(Buffer.from("historical-canonical")),
            },
          },
          currentComparison: {
            state: proofState,
            request: { method: "GET", url: currentUrl, sha256: requestSha256(currentUrl) },
            response: {
              status: 200,
              byteCount: 123,
              rawSha256: sha256(Buffer.from("current-raw")),
              canonicalSha256: sha256(Buffer.from("current-canonical")),
            },
            mutationDetected: false,
            changes: [],
          },
        }],
      };
      const historical = await writeArtifact(
        appRoot,
        "gnocchi-proof-time-indexer-snapshot.json",
        JSON.stringify(historicalValue),
      );
      artifacts.push({
        id: "gnocchi-proof-time-indexer-snapshot",
        kind: "historical-indexer-snapshot",
        path: historical.relativePath,
        sha256: historical.sha256,
        ipfsUri: `ipfs://${CID}/gnocchi-proof-time-indexer-snapshot.json`,
        gatewayUrl: `https://ipfs.io/ipfs/${CID}/gnocchi-proof-time-indexer-snapshot.json`,
        retrievedSha256: historical.sha256,
      });
      Object.assign(tokens[0], {
        historicalStateArtifactId: "gnocchi-proof-time-indexer-snapshot",
        proofLevel,
        proofTotalSupply: "1",
        proofHoldersCount: 1,
      });
    }

    const capability = {
      id: "complete-app-story",
      description: `${app} complete synthetic evidence story`,
      evidence: {
        screenshots: screenshotStages,
        artifacts: artifacts.map((entry) => entry.id),
        contracts: contracts.map((entry) => entry.address),
        operations: operations.map((entry) => entry.hash),
        tokens: tokens.map((entry) => entry.id),
        roleEvidence: roleEvidence.map((entry) => entry.kind),
        urls: [],
      },
    };
    const manifest = {
      schema: APP_PROOF_SCHEMA,
      app,
      role: ROLES[app],
      runId: "synthetic-proof-run",
      capturedAt: "2026-07-18T12:00:00.000Z",
      network: {
        name: "shadownet",
        chainId: SHADOWNET_CHAIN_ID,
        rpcUrl: "https://tezos-shadownet.octez.io/",
      },
      capabilities: [capability],
      screenshots,
      artifacts,
      contracts,
      operations,
      tokens,
      roleEvidence,
    };
    await writeFile(path.join(appRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  assert.equal(operationIndex, 17);
  return root;
}

test("assembles all nine role-correct app proofs into a deterministic integrity package", async () => {
  const runRoot = await createCompleteFixture();
  const workspace = path.dirname(runRoot);
  const outputOne = path.join(workspace, `${path.basename(runRoot)}-package-one`);
  const outputTwo = path.join(workspace, `${path.basename(runRoot)}-package-two`);
  const archiveOne = `${outputOne}.zip`;
  const archiveTwo = `${outputTwo}.zip`;
  try {
    const first = await assembleProofPackage(runRoot, {
      outputDirectory: outputOne,
      archivePath: archiveOne,
    });
    const second = await assembleProofPackage(runRoot, {
      outputDirectory: outputTwo,
      archivePath: archiveTwo,
    });
    assert.equal(first.appCount, 9);
    assert.equal(first.archiveSha256, second.archiveSha256);
    assert.deepEqual(await readFile(archiveOne), await readFile(archiveTwo));

    const aggregate = JSON.parse(await readFile(path.join(outputOne, "PASTA-PROTOCOL-PROOF.json"), "utf8"));
    assert.deepEqual(aggregate.appOrder, APP_ORDER);
    assert.equal(aggregate.validation.status, "PASSED");
    assert.equal(aggregate.validation.liveNetworkQueriedByAssembler, false);
    assert.equal(
      aggregate.validation.requirements.nonSecretManifestFilenamesAndEvidenceBytesValidated,
      true,
    );
    const chease = aggregate.apps.find((entry) => entry.app === "ch-ease");
    const lasagna = aggregate.apps.find((entry) => entry.app === "lasagna");
    const colander = aggregate.apps.find((entry) => entry.app === "colander");
    assert.equal(chease.tokens.length, 0);
    assert.equal(chease.contracts.length, 0);
    assert.match(chease.roleBoundary.contracts, /No contract is originated/);
    assert.match(chease.roleBoundary.tokens, /No token is minted/);
    assert.equal(lasagna.tokens.length, 0);
    assert.equal(lasagna.contracts.length, 1);
    assert.match(lasagna.roleBoundary.contracts, /exhibition registry contract/);
    assert.match(lasagna.roleBoundary.tokens, /No FA2 token is minted/);
    assert.equal(colander.contracts.length, 0);
    assert.equal(colander.tokens.length, 0);
    assert.match(colander.roleBoundary.contracts, /No contract is originated/);
    assert.match(colander.roleBoundary.tokens, /No token is minted/);
    assert.equal(aggregate.apps.find((entry) => entry.app === "ravioli").operations.length, 3);
    const ravioliOpenKit = aggregate.apps
      .find((entry) => entry.app === "ravioli")
      .artifacts.find((entry) => entry.id === "ravioli-open-kit-0");
    assert.equal(ravioliOpenKit.kind, "open-kit");
    assert.equal(ravioliOpenKit.cid, undefined, "open kits must remain local rather than IPFS-pinned");
    assert.match(
      await readFile(path.join(outputOne, "apps", "ravioli", ravioliOpenKit.path), "utf8"),
      /"nonce": "abab/,
      "non-credential recipe nonces must survive the proof-package secret scan",
    );
    assert.equal(chease.proofPath, "apps/ch-ease/PROOF.md");
    assert.equal(
      aggregate.apps.find((entry) => entry.app === "rotini").artifacts[0].cid,
      CID,
    );

    const aggregateMarkdown = await readFile(
      path.join(outputOne, "PASTA-PROTOCOL-PROOF.md"),
      "utf8",
    );
    assert.match(aggregateMarkdown, /Capability-to-evidence map/);
    assert.match(aggregateMarkdown, /apps\/ch-ease\/PROOF\.md/);
    assert.match(aggregateMarkdown, /No contract is originated by CH-EASE/);
    assert.match(aggregateMarkdown, /No FA2 token is minted by Lasagna/);
    assert.match(aggregateMarkdown, /No token is minted by Colander/);
    assert.ok(
      aggregateMarkdown.includes(`CID [\`${CID}\`](https://ipfs.io/ipfs/${CID}`),
      "aggregate report should show a clickable explicit CID",
    );
    assert.match(aggregateMarkdown, /retrieved SHA-256/);
    assert.match(aggregateMarkdown, /this report makes no marketplace-indexing claim/);

    for (const app of APP_ORDER) {
      const appProof = await readFile(path.join(outputOne, "apps", app, "PROOF.md"), "utf8");
      assert.match(appProof, new RegExp(`^# ${app} Shadownet Proof`, "m"));
      assert.match(appProof, /Capability-to-evidence map/);
      assert.match(appProof, /Stage screenshots/);
      assert.match(appProof, /SHA-256SUMS/);
    }
    const macaroniProof = await readFile(
      path.join(outputOne, "apps", "macaroni", "PROOF.md"),
      "utf8",
    );
    assert.match(macaroniProof, new RegExp(`https://shadownet\\.tzkt\\.io/${CONTRACTS.macaroni}`));
    assert.match(macaroniProof, new RegExp(`https://ipfs\\.io/ipfs/${CID}/macaroni-metadata\\.json`));
    assert.match(macaroniProof, /retrieved SHA-256/);

    const checksumText = await readFile(path.join(outputOne, "SHA-256SUMS"), "utf8");
    assert.match(checksumText, /PASTA-PROTOCOL-PROOF\.json/);
    assert.match(checksumText, /apps\/ch-ease\/PROOF\.md/);
    assert.match(checksumText, /apps\/colander\/PROOF\.md/);
    assert.match(checksumText, /apps\/rotini\/artifacts\/token-media\.png/);
    assert.doesNotMatch(checksumText, /SHA-256SUMS/);
    const checksumLines = checksumText.trim().split("\n");
    assert.equal(first.fileCount, checksumLines.length + 1);
    for (const line of checksumLines) {
      const match = line.match(/^([a-f0-9]{64})  (.+)$/);
      assert.ok(match, `malformed checksum line: ${line}`);
      assert.equal(sha256(await readFile(path.join(outputOne, match[2]))), match[1]);
    }
    const archive = await readFile(archiveOne);
    assert.equal(archive.readUInt32LE(0), 0x04034b50);
    assert.ok(archive.includes(Buffer.from("apps/ravioli/PROOF.md")));
  } finally {
    await rm(runRoot, { recursive: true, force: true });
    await rm(outputOne, { recursive: true, force: true });
    await rm(outputTwo, { recursive: true, force: true });
    await rm(archiveOne, { force: true });
    await rm(archiveTwo, { force: true });
  }
});

test("fails closed when one Pasta app proof is absent", async () => {
  const runRoot = await createCompleteFixture();
  try {
    await rm(path.join(runRoot, "penne"), { recursive: true, force: true });
    await assert.rejects(() => validateProofRun(runRoot), /missing required apps: penne/);
  } finally {
    await rm(runRoot, { recursive: true, force: true });
  }
});

test("fails closed on an empty screenshot instead of packaging visual placeholders", async () => {
  const runRoot = await createCompleteFixture();
  try {
    await writeFile(path.join(runRoot, "rotini", "screenshots", "confirmed.png"), Buffer.alloc(0));
    await assert.rejects(() => validateProofRun(runRoot), /missing or empty/);
  } finally {
    await rm(runRoot, { recursive: true, force: true });
  }
});

test("fails closed when distinct stage ids reuse byte-identical screenshot evidence", async () => {
  const runRoot = await createCompleteFixture();
  try {
    const manifestPath = path.join(runRoot, "spaghetti", "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const sourcePath = path.join(runRoot, "spaghetti", manifest.screenshots[0].path);
    const duplicatePath = path.join(runRoot, "spaghetti", manifest.screenshots[1].path);
    const duplicateBytes = await readFile(sourcePath);
    await writeFile(duplicatePath, duplicateBytes);
    manifest.screenshots[1].sha256 = sha256(duplicateBytes);
    await writeFile(manifestPath, JSON.stringify(manifest));
    await assert.rejects(
      () => validateProofRun(runRoot),
      /distinct screenshot bytes.*configure.*submit|configure.*submit.*same SHA-256/,
    );
  } finally {
    await rm(runRoot, { recursive: true, force: true });
  }
});

test("requires every Gnocchi token to bind exact proof-time supply and holders to the pinned snapshot", async (t) => {
  await t.test("missing historical token fields", async () => {
    const runRoot = await createCompleteFixture();
    try {
      const manifestPath = path.join(runRoot, "gnocchi", "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      delete manifest.tokens[0].historicalStateArtifactId;
      delete manifest.tokens[0].proofLevel;
      delete manifest.tokens[0].proofTotalSupply;
      delete manifest.tokens[0].proofHoldersCount;
      await writeFile(manifestPath, JSON.stringify(manifest));
      await assert.rejects(() => validateProofRun(runRoot), /historicalStateArtifactId/);
    } finally {
      await rm(runRoot, { recursive: true, force: true });
    }
  });

  await t.test("manifest supply differs from pinned proof-time snapshot", async () => {
    const runRoot = await createCompleteFixture();
    try {
      const manifestPath = path.join(runRoot, "gnocchi", "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifest.tokens[0].proofTotalSupply = "2";
      await writeFile(manifestPath, JSON.stringify(manifest));
      await assert.rejects(() => validateProofRun(runRoot), /proofTotalSupply.*historical snapshot/);
    } finally {
      await rm(runRoot, { recursive: true, force: true });
    }
  });
});

test("fails closed on malformed live identifiers and secret-bearing manifests", async (t) => {
  await t.test("malformed KT1", async () => {
    const runRoot = await createCompleteFixture();
    try {
      const manifestPath = path.join(runRoot, "macaroni", "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifest.contracts[0].address = "KT1not-a-contract";
      await writeFile(manifestPath, JSON.stringify(manifest));
      await assert.rejects(() => validateProofRun(runRoot), /not a valid Tezos KT1 address/);
    } finally {
      await rm(runRoot, { recursive: true, force: true });
    }
  });

  await t.test("malformed operation hash", async () => {
    const runRoot = await createCompleteFixture();
    try {
      const manifestPath = path.join(runRoot, "ravioli", "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifest.operations[0].hash = "op-not-a-real-operation";
      await writeFile(manifestPath, JSON.stringify(manifest));
      await assert.rejects(() => validateProofRun(runRoot), /not a valid Tezos operation hash/);
    } finally {
      await rm(runRoot, { recursive: true, force: true });
    }
  });

  await t.test("malformed pinned CID", async () => {
    const runRoot = await createCompleteFixture();
    try {
      const manifestPath = path.join(runRoot, "rotini", "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifest.artifacts[0].ipfsUri = "ipfs://not-a-cid/metadata.json";
      await writeFile(manifestPath, JSON.stringify(manifest));
      await assert.rejects(() => validateProofRun(runRoot), /malformed CID/);
    } finally {
      await rm(runRoot, { recursive: true, force: true });
    }
  });

  await t.test("gateway link that only embeds the CID inside an unrelated path segment", async () => {
    const runRoot = await createCompleteFixture();
    try {
      const manifestPath = path.join(runRoot, "rotini", "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifest.artifacts[0].gatewayUrl = `https://ipfs.io/ipfs/not-${CID}-a-cid-segment`;
      await writeFile(manifestPath, JSON.stringify(manifest));
      await assert.rejects(() => validateProofRun(runRoot), /as a path segment or subdomain/);
    } finally {
      await rm(runRoot, { recursive: true, force: true });
    }
  });

  await t.test("explorer link that only embeds a contract inside an unrelated path segment", async () => {
    const runRoot = await createCompleteFixture();
    try {
      const manifestPath = path.join(runRoot, "macaroni", "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifest.contracts[0].explorerUrl = `https://shadownet.tzkt.io/not-${CONTRACTS.macaroni}`;
      await writeFile(manifestPath, JSON.stringify(manifest));
      await assert.rejects(() => validateProofRun(runRoot), /does not contain its evidence identifier/);
    } finally {
      await rm(runRoot, { recursive: true, force: true });
    }
  });

  await t.test("private signing material key", async () => {
    const runRoot = await createCompleteFixture();
    try {
      const manifestPath = path.join(runRoot, "spaghetti", "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifest.privateKey = "never-package-this";
      await writeFile(manifestPath, JSON.stringify(manifest));
      await assert.rejects(
        () => validateProofRun(runRoot),
        (error) => error instanceof ProofPackageError && /prohibited/.test(error.message),
      );
    } finally {
      await rm(runRoot, { recursive: true, force: true });
    }
  });

  await t.test("probable credential inside a packaged artifact", async () => {
    const runRoot = await createCompleteFixture();
    try {
      const manifestPath = path.join(runRoot, "spaghetti", "manifest.json");
      const artifactPath = path.join(runRoot, "spaghetti", "artifacts", "token-metadata.json");
      const artifactBytes = Buffer.from(
        JSON.stringify({ name: "bad proof", note: "Bearer abcdefghijklmnopqrstuvwxyz012345" }),
      );
      await writeFile(artifactPath, artifactBytes);
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      const artifact = manifest.artifacts.find((entry) => entry.id === "token-metadata");
      artifact.sha256 = sha256(artifactBytes);
      artifact.retrievedSha256 = artifact.sha256;
      await writeFile(manifestPath, JSON.stringify(manifest));
      await assert.rejects(
        () => validateProofRun(runRoot),
        (error) =>
          error instanceof ProofPackageError &&
          /contains probable signing material or credentials/.test(error.message),
      );
    } finally {
      await rm(runRoot, { recursive: true, force: true });
    }
  });
});
