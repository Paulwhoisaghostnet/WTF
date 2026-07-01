#!/usr/bin/env node

import { readFileSync } from "node:fs";

const DEFAULT_BASE_URL = "https://wtfos.app";
const DEFAULT_REPOSITORY = "Paulwhoisaghostnet/WTF";

const desktopPackage = JSON.parse(readFileSync("apps/ravioli-desktop/package.json", "utf8"));
const EXPECTED_VERSION = process.env.RAVIOLI_EXPECTED_INSTALLER_VERSION || desktopPackage.version;
const EXPECTED_RELEASE_TAG = process.env.RAVIOLI_EXPECTED_RELEASE_TAG || `ravioli-desktop-v${EXPECTED_VERSION}`;
const REPOSITORY = process.env.RAVIOLI_INSTALLER_REPOSITORY || DEFAULT_REPOSITORY;

const EXPECTED_ASSETS = {
  macos: {
    label: "macOS",
    manifestFileName: "Ravioli-Studio.dmg",
    assetName: `Ravioli-Studio-${EXPECTED_VERSION}-mac-universal.dmg`,
  },
  windows: {
    label: "Windows",
    manifestFileName: "Ravioli-Studio.exe",
    assetName: `Ravioli-Studio-${EXPECTED_VERSION}-win-x64.exe`,
  },
  "raspberry-pi": {
    label: "Raspberry Pi",
    manifestFileName: "ravioli-studio-arm64.deb",
    assetName: `Ravioli-Studio-${EXPECTED_VERSION}-linux-arm64.deb`,
  },
};

const failures = [];
const cookieJar = new Map();
const suppliedCookie = String(process.env.RAVIOLI_INSTALLER_COOKIE || process.env.WTFOS_INSTALLER_COOKIE || "").trim();

function flag(name, defaultValue) {
  const value = process.env[name];
  if (value == null || value === "") return defaultValue;
  return /^(1|true|yes|on)$/i.test(value);
}

const checkAssets = flag("RAVIOLI_INSTALLER_CHECK_ASSETS", flag("WTFOS_INSTALLER_CHECK_ASSETS", true));
const requireAuth = flag("RAVIOLI_INSTALLER_REQUIRE_AUTH", flag("WTFOS_INSTALLER_REQUIRE_AUTH", false));
const username = String(process.env.RAVIOLI_INSTALLER_USERNAME || process.env.WTFOS_INSTALLER_USERNAME || "").trim();
const password = String(process.env.RAVIOLI_INSTALLER_PASSWORD || process.env.WTFOS_INSTALLER_PASSWORD || "");

function fail(message) {
  failures.push(message);
}

function ok(message) {
  console.log(`[ravioli-installers] ok: ${message}`);
}

function baseUrl() {
  const raw = String(
    process.env.RAVIOLI_INSTALLER_BASE_URL || process.env.WTFOS_INSTALLER_BASE_URL || process.env.WTFOS_BASE_URL || DEFAULT_BASE_URL
  ).trim();
  const url = new URL(raw);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

function setCookiesFrom(response) {
  const setCookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : response.headers.get("set-cookie")
        ? [response.headers.get("set-cookie")]
        : [];
  for (const value of setCookies) {
    const pair = String(value || "").split(";")[0];
    const index = pair.indexOf("=");
    if (index <= 0) continue;
    cookieJar.set(pair.slice(0, index), pair.slice(index + 1));
  }
}

function cookieHeader() {
  if (suppliedCookie) return suppliedCookie;
  return [...cookieJar.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function fetchWithCookies(pathname, options = {}) {
  const url = new URL(pathname, baseUrl());
  const headers = { ...(options.headers || {}) };
  const cookie = cookieHeader();
  if (cookie) headers.cookie = cookie;
  const response = await fetch(url, { ...options, headers });
  setCookiesFrom(response);
  return response;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`expected JSON response, got ${response.status}: ${error.message}`);
  }
}

async function loginIfConfigured() {
  if (suppliedCookie) {
    ok("using supplied cookie for authenticated manifest probe");
    return true;
  }
  if (!username && !password) {
    if (requireAuth) {
      fail("RAVIOLI_INSTALLER_REQUIRE_AUTH=1 but no cookie or username/password was provided");
    }
    return false;
  }
  if (!username || !password) {
    fail("both RAVIOLI_INSTALLER_USERNAME and RAVIOLI_INSTALLER_PASSWORD are required for password login");
    return false;
  }
  const response = await fetchWithCookies("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    fail(`password login failed with HTTP ${response.status}`);
    return false;
  }
  await readJson(response);
  if (!cookieHeader()) {
    fail("password login succeeded but no session cookie was captured");
    return false;
  }
  ok(`authenticated as ${username}`);
  return true;
}

async function fetchReleaseMetadata() {
  const url = new URL(`https://api.github.com/repos/${REPOSITORY}/releases/tags/${EXPECTED_RELEASE_TAG}`);
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "wtfos-ravioli-installer-check",
  };
  const token = String(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    fail(`GitHub release ${EXPECTED_RELEASE_TAG} lookup returned HTTP ${response.status}`);
    return null;
  }
  const release = await readJson(response);
  if (!Array.isArray(release.assets)) {
    fail(`GitHub release ${EXPECTED_RELEASE_TAG} did not include assets[]`);
    return null;
  }

  const byName = new Map(release.assets.map((asset) => [asset.name, asset]));
  const assets = {};
  for (const [key, expected] of Object.entries(EXPECTED_ASSETS)) {
    const asset = byName.get(expected.assetName);
    if (!asset) {
      fail(`${key} release asset missing: ${expected.assetName}`);
      continue;
    }
    const digest = String(asset.digest || "").toLowerCase();
    const sha256 = digest.startsWith("sha256:") ? digest.slice("sha256:".length) : digest;
    if (!/^[0-9a-f]{64}$/.test(sha256)) {
      fail(`${key} release asset is missing a sha256 digest`);
      continue;
    }
    assets[key] = {
      ...expected,
      url: asset.browser_download_url,
      sha256,
      bytes: Number(asset.size || 0),
    };
  }
  if (Object.keys(assets).length === Object.keys(EXPECTED_ASSETS).length) {
    ok(`GitHub release ${EXPECTED_RELEASE_TAG} exposes expected Ravioli assets`);
  }
  return assets;
}

function validateManifest(manifest, releaseAssets) {
  if (!manifest || manifest.ok !== true) {
    fail("installer manifest did not return ok: true");
    return;
  }
  if (manifest.product !== "ravioli") {
    fail(`installer manifest product mismatch: expected ravioli, got ${manifest.product}`);
  }
  if (manifest.version !== EXPECTED_VERSION) {
    fail(`installer manifest version mismatch: expected ${EXPECTED_VERSION}, got ${manifest.version}`);
  }
  if (!Array.isArray(manifest.installers)) {
    fail("installer manifest is missing installers[]");
    return;
  }

  const byKey = new Map(manifest.installers.map((item) => [item.key, item]));
  for (const [key, expected] of Object.entries(releaseAssets)) {
    const item = byKey.get(key);
    if (!item) {
      fail(`installer manifest is missing ${key}`);
      continue;
    }
    if (item.available !== true) fail(`${key} installer is not marked available`);
    if (item.label !== expected.label) fail(`${key} label mismatch: expected ${expected.label}, got ${item.label}`);
    if (item.fileName !== expected.manifestFileName) {
      fail(`${key} download filename mismatch: expected ${expected.manifestFileName}, got ${item.fileName}`);
    }
    if (item.url !== expected.url) fail(`${key} URL mismatch: expected ${expected.url}, got ${item.url}`);
    if (item.sha256 !== expected.sha256) fail(`${key} SHA-256 mismatch: expected ${expected.sha256}, got ${item.sha256}`);
    try {
      const url = new URL(String(item.url || ""));
      if (url.protocol !== "https:") fail(`${key} URL is not HTTPS`);
      if (url.hostname !== "github.com") fail(`${key} URL host is not github.com`);
    } catch (_) {
      fail(`${key} URL is invalid`);
    }
  }
  ok(`authenticated manifest matches Ravioli Studio ${EXPECTED_VERSION}`);
}

async function assertUnauthenticatedManifestIsProtected() {
  const response = await fetch(new URL("/api/ravioli/installers", baseUrl()), { redirect: "manual" });
  if (response.status !== 401) {
    fail(`unauthenticated installer manifest should return 401, got HTTP ${response.status}`);
    return;
  }
  ok("unauthenticated manifest returns 401");
}

async function assertReleaseAssetReachable(key, expected) {
  const response = await fetch(expected.url, {
    headers: { range: "bytes=0-0" },
    redirect: "follow",
  });
  await response.body?.cancel();
  if (response.status !== 206) {
    fail(`${key} release asset range probe expected HTTP 206, got ${response.status}`);
    return;
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength && contentLength !== "1") {
    fail(`${key} release asset range probe expected content-length 1, got ${contentLength}`);
  }
  const contentRange = response.headers.get("content-range") || "";
  const match = contentRange.match(/^bytes 0-0\/(\d+)$/);
  if (match && expected.bytes > 0 && Number(match[1]) !== expected.bytes) {
    fail(`${key} release asset size mismatch: expected ${expected.bytes}, got ${match[1]}`);
  }
  ok(`${key} release asset accepts byte-range download`);
}

async function main() {
  console.log(`[ravioli-installers] checking ${baseUrl().origin} against ${EXPECTED_RELEASE_TAG}`);
  await assertUnauthenticatedManifestIsProtected();

  const releaseAssets = await fetchReleaseMetadata();
  if (releaseAssets && checkAssets) {
    for (const [key, expected] of Object.entries(releaseAssets)) {
      await assertReleaseAssetReachable(key, expected);
    }
  }

  const authenticated = await loginIfConfigured();
  if (authenticated && releaseAssets) {
    const response = await fetchWithCookies("/api/ravioli/installers");
    if (!response.ok) {
      fail(`authenticated installer manifest returned HTTP ${response.status}`);
    } else {
      validateManifest(await readJson(response), releaseAssets);
    }
  } else if (!authenticated && !requireAuth) {
    console.log("[ravioli-installers] skipped authenticated manifest check; set RAVIOLI_INSTALLER_COOKIE or username/password to enable it");
  }

  if (failures.length) {
    console.error("[ravioli-installers] failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log("[ravioli-installers] live installer readiness checks passed");
}

main().catch((error) => {
  console.error(`[ravioli-installers] ${error.stack || error.message}`);
  process.exit(1);
});
