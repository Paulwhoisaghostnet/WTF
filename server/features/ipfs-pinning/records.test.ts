import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateLexiconRecord,
  type MediaPinItem,
  type MediaPinManifest,
  type MediaPinPolicy,
} from "@shared/atproto";
import {
  assertPublicPinStorageRef,
  buildPinItemRecord,
  buildPinManifestRecord,
  buildPinPolicyRecord,
} from "./records";

const createdAt = "2026-06-13T12:00:00.000Z";
const subdomainRefs = [
  { kind: "wtfos.me" as const, host: "creator.wtfos.me" },
  { kind: "wtf.tez" as const, host: "creator.wtf.tez", grantId: 42 },
];
const storageRef = {
  s3Bucket: "wtfos-pins",
  s3Key: "ipfs-pinning/users/7/wallet_full/tz1abc/manifest.json",
  porcupinProviderKey: "wtfos-porcupin-hetzner",
  manifestKey: "ipfs-pinning/users/7/wallet_full/tz1abc/manifest.json",
  byteSize: 1234,
  mimeType: "application/json",
  checksumSha256: "f".repeat(64),
};

test("pin policy record validates against app.wtfos.media.pinPolicy", () => {
  const record = {
    $type: "app.wtfos.media.pinPolicy",
    ...buildPinPolicyRecord({
      scopeType: "wallet_full",
      scopeRef: "tz1abc",
      walletAddress: "tz1abc",
      sourceChain: "tezos",
      includeExisting: true,
      includeFuture: true,
      publicDiscovery: true,
      subdomainRefs,
      sourceEventId: "evt-policy",
      createdAt,
      updatedAt: createdAt,
    }),
  };

  assert.equal(validateLexiconRecord<MediaPinPolicy>("app.wtfos.media.pinPolicy", record).scopeType, "wallet_full");
});

test("pin manifest record validates with portable restore coordinates", () => {
  const record = {
    $type: "app.wtfos.media.pinManifest",
    ...buildPinManifestRecord({
      scopeType: "wallet_full",
      scopeRef: "tz1abc",
      walletAddress: "tz1abc",
      sourceChain: "tezos",
      itemCount: 2,
      totalBytes: 1234,
      storageRef,
      subdomainRefs,
      sourceEventId: "evt-manifest",
      createdAt,
      updatedAt: createdAt,
    }),
  };

  assert.equal(
    validateLexiconRecord<MediaPinManifest>("app.wtfos.media.pinManifest", record).storageRef.s3Key,
    storageRef.s3Key,
  );
});

test("pin item record validates with CID and storage pointer", () => {
  const record = {
    $type: "app.wtfos.media.pinItem",
    ...buildPinItemRecord({
      scopeType: "wallet_full",
      scopeRef: "tz1abc",
      walletAddress: "tz1abc",
      sourceChain: "tezos",
      cid: "bafybeiharnessfixturecid",
      storageRef,
      subdomainRefs,
      sourceEventId: "evt-item",
      mimeType: "image/png",
      byteSize: 1234,
      checksumSha256: "a".repeat(64),
      createdAt,
      updatedAt: createdAt,
    }),
  };

  assert.equal(validateLexiconRecord<MediaPinItem>("app.wtfos.media.pinItem", record).cid, "bafybeiharnessfixturecid");
});

test("pin storage refs reject credentials, signed URLs, and private paths", () => {
  assert.throws(
    () => assertPublicPinStorageRef({ ...storageRef, signedUrl: "https://s3.example/file?X-Amz-Signature=abc" } as never),
    /private coordinate/,
  );
  assert.throws(
    () => assertPublicPinStorageRef({ ...storageRef, s3Key: "file:///Users/person/private/pin.png" }),
    /credentials, signed URLs, or private file paths/,
  );
  assert.throws(
    () => assertPublicPinStorageRef({ ...storageRef, providerPinId: "Bearer nope" }),
    /credentials, signed URLs, or private file paths/,
  );
});
