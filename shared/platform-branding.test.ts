import test from "node:test";
import assert from "node:assert/strict";
import {
  WTFOS_GAMESHOW_NAME,
  WTFOS_PLATFORM_LONG_NAME,
  WTFOS_PLATFORM_ORIGIN,
  WTFOS_WALLET_LOGIN_CHALLENGE_PREFIX,
  resolvePublicSiteOrigin,
} from "./platform-branding";

test("platform branding keeps wtfOS as the primary product name", () => {
  assert.equal(WTFOS_PLATFORM_LONG_NAME, "WTF OS");
  assert.equal(WTFOS_GAMESHOW_NAME, "WTF Gameshow");
  assert.equal(WTFOS_PLATFORM_ORIGIN, "https://wtfos.app");
});

test("wallet login challenges use the platform name, not gameshow", () => {
  assert.match(WTFOS_WALLET_LOGIN_CHALLENGE_PREFIX, /^WTF OS Login/);
  assert.doesNotMatch(WTFOS_WALLET_LOGIN_CHALLENGE_PREFIX, /Gameshow/i);
});

test("resolvePublicSiteOrigin prefers configured origin", () => {
  assert.equal(resolvePublicSiteOrigin("https://preview.example.test/"), "https://preview.example.test");
  assert.equal(resolvePublicSiteOrigin(""), WTFOS_PLATFORM_ORIGIN);
});
