import test from "node:test";
import assert from "node:assert/strict";
import {
  encryptPrivatePayload,
  decryptPrivatePayload,
  buildPrivateEnvelopeRecord,
  readPrivateEnvelopeRecord,
  PRIVATE_MESSAGE_COLLECTION,
} from "./private-pds";

const KEY = "unit-test-private-key-material";

test("encrypt/decrypt round-trips with an explicit key", () => {
  const envelope = encryptPrivatePayload("hello dm", KEY);
  assert.match(envelope, /^pv1\./);
  assert.equal(decryptPrivatePayload(envelope, KEY), "hello dm");
});

test("each encryption uses a fresh IV (ciphertexts differ)", () => {
  const a = encryptPrivatePayload("same", KEY);
  const b = encryptPrivatePayload("same", KEY);
  assert.notEqual(a, b);
  assert.equal(decryptPrivatePayload(a, KEY), "same");
  assert.equal(decryptPrivatePayload(b, KEY), "same");
});

test("tampered ciphertext fails authentication", () => {
  const envelope = encryptPrivatePayload("secret", KEY);
  const parts = envelope.split(".");
  const tampered = [parts[0], parts[1], Buffer.from("evil").toString("base64url"), parts[3]].join(".");
  assert.throws(() => decryptPrivatePayload(tampered, KEY));
});

test("wrong key cannot decrypt", () => {
  const envelope = encryptPrivatePayload("secret", KEY);
  assert.throws(() => decryptPrivatePayload(envelope, "different-key"));
});

test("buildPrivateEnvelopeRecord stores only ciphertext, never plaintext", () => {
  const record = buildPrivateEnvelopeRecord({
    payload: { text: "top secret message", to: "did:plc:friend" },
    roomRef: "at://did:plc:abc/app.wtfos.room.invite/r1",
    keyMaterial: KEY,
  });
  assert.equal(record.$type, PRIVATE_MESSAGE_COLLECTION);
  const serialized = JSON.stringify(record);
  assert.ok(!serialized.includes("top secret message"), "plaintext must not appear in the record");
  const payload = readPrivateEnvelopeRecord<{ text: string; to: string }>(record, KEY);
  assert.equal(payload.text, "top secret message");
  assert.equal(payload.to, "did:plc:friend");
});
