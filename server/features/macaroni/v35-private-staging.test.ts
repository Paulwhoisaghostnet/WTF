import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  canonicalMacaroniMetadataBytes,
  MACARONI_V35_IMPORT_PROFILE,
  stageMacaroniPrivateContentToCar,
  stageMacaroniPrivateToken,
  verifyMacaroniPrivateCar,
} from "./v35-private-staging";
import {
  publishManagedMacaroniV35Car,
} from "./v35-managed-assets";
import { managedMacaroniV35CarPublisherMode } from "./v35-runtime-config";

test("fixed UnixFS profile chunks large artifacts and produces byte-identical CARs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "macaroni-v35-stage-test-"));
  try {
    const bytes = Buffer.alloc(MACARONI_V35_IMPORT_PROFILE.chunkSizeBytes * 2 + 137);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = (index * 31 + 7) % 251;
    const first = await stageMacaroniPrivateContentToCar({ source: bytes, carPath: path.join(root, "first.car") });
    const second = await stageMacaroniPrivateContentToCar({ source: bytes, carPath: path.join(root, "second.car") });
    assert.equal(first.cid, second.cid);
    assert.ok(first.blockCount > 1, "large fixture must be represented by multiple UnixFS blocks");
    assert.deepEqual(await readFile(first.carPath), await readFile(second.carPath));
    assert.deepEqual(await verifyMacaroniPrivateCar({ carPath: first.carPath, expectedCid: first.cid }), {
      valid: true,
      roots: [first.cid],
      blockCount: first.blockCount,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("canonical metadata commits to the artifact CID before either CAR is published", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "macaroni-v35-token-test-"));
  try {
    const staged = await stageMacaroniPrivateToken({
      artifactSource: Buffer.from("private artifact bytes"),
      artifactCarPath: path.join(root, "artifact.car"),
      artifactMimeType: "text/html",
      displaySource: Buffer.from("private display bytes"),
      displayCarPath: path.join(root, "display.car"),
      displayMimeType: "image/png",
      thumbnailSource: Buffer.from("private thumbnail bytes"),
      thumbnailCarPath: path.join(root, "thumbnail.car"),
      thumbnailMimeType: "image/jpeg",
      metadataCarPath: path.join(root, "metadata.car"),
      metadata: { name: "Token", decimals: 0 },
    });
    assert.deepEqual(staged.metadataBytes, canonicalMacaroniMetadataBytes({
      artifactUri: `ipfs://${staged.artifact.cid}`,
      decimals: 0,
      displayUri: `ipfs://${staged.display!.cid}`,
      formats: [
        { uri: `ipfs://${staged.artifact.cid}`, mimeType: "text/html", fileSize: 22 },
        { uri: `ipfs://${staged.display!.cid}`, mimeType: "image/png", fileSize: 21 },
        { uri: `ipfs://${staged.thumbnail!.cid}`, mimeType: "image/jpeg", fileSize: 23 },
      ],
      name: "Token",
      thumbnailUri: `ipfs://${staged.thumbnail!.cid}`,
    }));
    assert.equal((await verifyMacaroniPrivateCar({ carPath: staged.metadata.carPath, expectedCid: staged.metadata.cid })).valid, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("managed Pinata fallback imports the exact committed public CAR", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "macaroni-v35-pinata-test-"));
  const envNames = [
    "MACARONI_V35_CAR_UPLOAD_URL",
    "MACARONI_V35_CAR_UPLOAD_TOKEN",
    "MACARONI_V35_PINATA_JWT",
    "WTFGAMESHOW_IPFS_JWT",
    "WTF_GAMESHOW_IPFS_JWT",
    "WTFGAMESHOW_PINATA_JWT",
    "PINATA_JWT",
    "PINATA_API_JWT",
  ] as const;
  const priorEnvironment = new Map(envNames.map((name) => [name, process.env[name]]));
  const priorFetch = globalThis.fetch;
  try {
    for (const name of envNames) delete process.env[name];
    process.env.MACARONI_V35_PINATA_JWT = "managed-pinata-test-jwt";
    const staged = await stageMacaroniPrivateContentToCar({
      source: Buffer.from("committed Pinata CAR fixture"),
      carPath: path.join(root, "pinata.car"),
    });
    globalThis.fetch = (async (resource, init) => {
      assert.equal(String(resource), "https://uploads.pinata.cloud/v3/files");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer managed-pinata-test-jwt");
      const body = init?.body as FormData;
      assert.equal(body.get("network"), "public");
      assert.equal(body.get("car"), "true");
      assert.equal(body.get("expectedRoot"), null);
      assert.ok(body.get("file") instanceof Blob);
      return new Response(JSON.stringify({ data: { cid: staged.cid } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    assert.equal(managedMacaroniV35CarPublisherMode(), "pinata_v3");
    assert.deepEqual(await publishManagedMacaroniV35Car({
      carPath: staged.carPath,
      expectedCid: staged.cid,
    }), { cid: staged.cid });
  } finally {
    globalThis.fetch = priorFetch;
    for (const name of envNames) {
      const value = priorEnvironment.get(name);
      if (value == null) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});
