#!/usr/bin/env node

const DEFAULT_BASE_URL = "https://wtfos.app";
const EXPECTED_VERSION = process.env.MACARONI_EXPECTED_INSTALLER_VERSION || "1.0.0";
const RELEASES = {
  "1.0.0": {
    tag: "macaroni-desktop-v1.0.0",
    assets: {
      macos: {
        label: "macOS",
        manifestFileName: "Macaroni-Studio.dmg",
        url: "https://github.com/Paulwhoisaghostnet/WTF/releases/download/macaroni-desktop-v1.0.0/Macaroni-Studio-1.0.0-mac-universal.dmg",
        sha256: "9c91ad656bd249d7d921084d429ba23f00692d68819937505aa3deec8e50f600",
        bytes: 214729643,
      },
      windows: {
        label: "Windows",
        manifestFileName: "Macaroni-Studio.exe",
        url: "https://github.com/Paulwhoisaghostnet/WTF/releases/download/macaroni-desktop-v1.0.0/Macaroni-Studio-1.0.0-win-x64.exe",
        sha256: "6b40525d524dd916ba3a46ab28bb36c3238c7cbffd993f2c1803f61f5063e1d4",
        bytes: 102952651,
      },
      "raspberry-pi": {
        label: "Raspberry Pi",
        manifestFileName: "macaroni-studio-arm64.deb",
        url: "https://github.com/Paulwhoisaghostnet/WTF/releases/download/macaroni-desktop-v1.0.0/Macaroni-Studio-1.0.0-linux-arm64.deb",
        sha256: "6ed21c165f5b2c5f476b0c8ab23c78397de59a2990d3f4f21dfb741b5e7e6216",
        bytes: 92499620,
      },
    },
  },
};

const failures = [];
const cookieJar = new Map();
const suppliedCookie = String(process.env.WTFOS_INSTALLER_COOKIE || "").trim();

function flag(name, defaultValue) {
  const value = process.env[name];
  if (value == null || value === "") return defaultValue;
  return /^(1|true|yes|on)$/i.test(value);
}

const checkAssets = flag("WTFOS_INSTALLER_CHECK_ASSETS", true);
const requireAuth = flag("WTFOS_INSTALLER_REQUIRE_AUTH", false);
const username = String(process.env.WTFOS_INSTALLER_USERNAME || "").trim();
const password = String(process.env.WTFOS_INSTALLER_PASSWORD || "");

function fail(message) {
  failures.push(message);
}

function ok(message) {
  console.log(`[macaroni-installers] ok: ${message}`);
}

function baseUrl() {
  const raw = String(process.env.WTFOS_INSTALLER_BASE_URL || process.env.WTFOS_BASE_URL || DEFAULT_BASE_URL).trim();
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
    if (requireAuth) fail("WTFOS_INSTALLER_REQUIRE_AUTH=1 but no WTFOS_INSTALLER_COOKIE or username/password was provided");
    return false;
  }
  if (!username || !password) {
    fail("both WTFOS_INSTALLER_USERNAME and WTFOS_INSTALLER_PASSWORD are required for password login");
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

function validateManifest(manifest, release) {
  if (!manifest || manifest.ok !== true) {
    fail("installer manifest did not return ok: true");
    return;
  }
  if (manifest.version !== EXPECTED_VERSION) {
    fail(`installer manifest version mismatch: expected ${EXPECTED_VERSION}, got ${manifest.version}`);
  }
  if (!Array.isArray(manifest.installers)) {
    fail("installer manifest is missing installers[]");
    return;
  }

  const byKey = new Map(manifest.installers.map((item) => [item.key, item]));
  for (const [key, expected] of Object.entries(release.assets)) {
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
  ok(`authenticated manifest matches Macaroni Desktop ${EXPECTED_VERSION}`);
}

async function assertUnauthenticatedManifestIsProtected() {
  const response = await fetch(new URL("/api/macaroni/installers", baseUrl()), { redirect: "manual" });
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
  if (match && Number(match[1]) !== expected.bytes) {
    fail(`${key} release asset size mismatch: expected ${expected.bytes}, got ${match[1]}`);
  }
  ok(`${key} release asset accepts byte-range download`);
}

async function main() {
  const release = RELEASES[EXPECTED_VERSION];
  if (!release) {
    throw new Error(`No expected Macaroni installer release metadata for version ${EXPECTED_VERSION}`);
  }

  console.log(`[macaroni-installers] checking ${baseUrl().origin} against ${release.tag}`);
  await assertUnauthenticatedManifestIsProtected();

  if (checkAssets) {
    for (const [key, expected] of Object.entries(release.assets)) {
      await assertReleaseAssetReachable(key, expected);
    }
  }

  const authenticated = await loginIfConfigured();
  if (authenticated) {
    const response = await fetchWithCookies("/api/macaroni/installers");
    if (!response.ok) {
      fail(`authenticated installer manifest returned HTTP ${response.status}`);
    } else {
      validateManifest(await readJson(response), release);
    }
  } else if (!requireAuth) {
    console.log("[macaroni-installers] skipped authenticated manifest check; set WTFOS_INSTALLER_COOKIE or WTFOS_INSTALLER_USERNAME/PASSWORD to enable it");
  }

  if (failures.length) {
    console.error("[macaroni-installers] failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log("[macaroni-installers] live installer readiness checks passed");
}

main().catch((error) => {
  console.error(`[macaroni-installers] ${error.stack || error.message}`);
  process.exit(1);
});
