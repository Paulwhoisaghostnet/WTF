import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const dockerfile = readFileSync(new URL("Dockerfile", root), "utf8");
const compose = readFileSync(new URL("docker-compose.yml", root), "utf8");

test("mail builds Dovecot 2.4 configuration with the Debian fixed security revisions", () => {
  assert.match(dockerfile, /^FROM ghcr\.io\/docker-mailserver\/docker-mailserver:16\.0\.1@sha256:[0-9a-f]{64}$/m);
  // Debian's bookworm Dovecot update does not fix CVE-2026-27852.
  assert.match(dockerfile, /1:2\.4\.1\+dfsg1-6\+deb13u7/);
  assert.match(dockerfile, /1\.1\.0-2\+deb13u1/); // Brotli CVE-2026-111497.
  assert.match(dockerfile, /3\.5\.7-1~deb13u3/); // Current Trixie OpenSSL security update.
  assert.match(dockerfile, /20250419\+deb13u1/); // October CA distrust update.
  assert.match(dockerfile, /--no-remove/);
  assert.doesNotMatch(dockerfile, /--allow-downgrades|--allow-unauthenticated/);
  assert.match(dockerfile, /source:Package/); // Update every installed split package together.
  assert.match(compose, /build:\s*\n\s*context: \.\s*\n\s*dockerfile: Dockerfile/);
  assert.doesNotMatch(compose, /^\s*image:/m);
});

test("mail retains its public interfaces and supports untouched-volume rollback", () => {
  for (const port of [25, 587, 993]) assert.match(compose, new RegExp(`"${port}:${port}"`));
  assert.match(compose, /container_name: wtfos-mailserver/);
  assert.match(compose, /stop_grace_period: 1m/);
  for (const key of ["DATA", "STATE", "LOGS"]) assert.match(compose, new RegExp(`MAIL_${key}_VOLUME`));
  assert.match(compose, /MAIL_CONFIG_PATH/);
  assert.match(compose, /\.\/certs\/:\/etc\/letsencrypt\/:ro/);
  assert.match(compose, /PERMIT_DOCKER=none/);
  assert.match(compose, /RELAY_PASSWORD=\$\{RESEND_API_KEY:-\}/);
  assert.match(compose, /RELAY_PORT=\$\{RELAY_PORT:-587\}/);
});

test("mail image build context cannot include account hashes, keys, or relay credentials", () => {
  assert.equal(readFileSync(new URL(".dockerignore", root), "utf8").trim(), "*\n!Dockerfile");
  assert.doesNotMatch(dockerfile, /^\s*(?:COPY|ADD)\s/m);
});
