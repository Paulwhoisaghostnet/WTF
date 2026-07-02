import assert from "node:assert/strict";
import { test } from "node:test";
import { isWellKnownPinDiscoveryReady } from "./well-known-policy";

const repoDid = "did:web:wtf-admin.wtfos.me";
const manifestUri = `at://${repoDid}/app.wtfos.media.pinManifest/pasta-protocol-shadownet`;

test("well-known pin discovery is ready only after public manifest publication", () => {
  assert.equal(
    isWellKnownPinDiscoveryReady({
      publicDiscoveryEnabled: true,
      repoDid,
      pinManifestRecordUri: manifestUri,
    }),
    true
  );
  assert.equal(
    isWellKnownPinDiscoveryReady({
      publicDiscoveryEnabled: true,
      repoDid,
      pinManifestRecordUri: null,
    }),
    false
  );
  assert.equal(
    isWellKnownPinDiscoveryReady({
      publicDiscoveryEnabled: true,
      repoDid,
      pinManifestRecordUri: `at://${repoDid}/app.wtfos.media.pinManifest/`,
    }),
    false
  );
  assert.equal(
    isWellKnownPinDiscoveryReady({
      publicDiscoveryEnabled: true,
      repoDid,
      pinManifestRecordUri: "at://did:web:other.wtfos.me/app.wtfos.media.pinManifest/pasta-protocol-shadownet",
    }),
    false
  );
  assert.equal(
    isWellKnownPinDiscoveryReady({
      publicDiscoveryEnabled: false,
      repoDid,
      pinManifestRecordUri: manifestUri,
    }),
    false
  );
});
