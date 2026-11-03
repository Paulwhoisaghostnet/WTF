import { execFile } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { test, expect } from "@playwright/test";
import pg from "pg";
import { DOMAIN_WORKFLOWS } from "../../e2e/inventory/domain-workflows.mjs";
import { ROUTE_FIXTURES } from "../../e2e/inventory/route-fixtures.mjs";
import { actorForWorkflow } from "../../e2e/puppets/registry.mjs";
import {
  actorById,
  actorByRole,
  readPuppetCredentials,
} from "../../e2e/puppets/runtime.mjs";

const execFileAsync = promisify(execFile);
let puppetCredentials;
const actorSessions = new Map();
const authCacheDir = path.resolve(".e2e", "playwright-live-auth");
const REQUIRED_DESKTOP_TEST_SKUS = [
  "desktop-tiny-fan",
  "desktop-light-disco",
  "desktop-light-moon",
  "desktop-light-sun",
  "desktop-sticky-note-trap",
  "desktop-mop",
  "desktop-vacuum",
  "desktop-spraycan",
  "desktop-catapult",
  "desktop-ant-farm",
  "desktop-paper-shredder",
  "desktop-train-base-kit",
  "desktop-train-track-pack",
  "desktop-train-engine-pack",
  "desktop-train-car-pack",
  "desktop-portal-gun",
  "desktop-jukebox",
  "desktop-weather-station",
];
const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

const EXTERNAL_OAUTH_PATTERNS = [
  /\/api\/auth\/twitter/i,
  /\/api\/auth\/twitter-oauth2/i,
  /\/api\/auth\/discord/i,
  /\/api\/atproto\/oauth\/start/i,
  /\/api\/auth\/github/i,
  /\/api\/auth\/google/i,
];
const API_PROBE_TIMEOUT_MS = Math.max(1_000, Number(process.env.WTF_E2E_API_PROBE_TIMEOUT_MS || 25_000) || 25_000);

const actorFilter = (process.env.WTF_E2E_ACTOR_FILTER || "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

function fatalErrors(errors) {
  return errors.filter(
    (error) =>
      !/(favicon|ResizeObserver|WebGL|wallet|beacon|taquito|non-boolean attribute|does not recognize the `.*` prop|unknown prop|Failed to load resource: the server responded with a status of 40[13])/i.test(
        error
      )
  );
}

function skipExternalOauthProbe(probe) {
  return EXTERNAL_OAUTH_PATTERNS.some((pattern) => pattern.test(probe.path));
}

function applyActorFilter(credentials) {
  if (actorFilter.length === 0) return credentials;
  const selected = credentials.actors.filter((actor) =>
    actorFilter.includes(String(actor.id).toLowerCase()) ||
    actorFilter.includes(String(actor.username).toLowerCase()) ||
    actorFilter.includes(String(actor.role).toLowerCase())
  );
  return { ...credentials, actors: selected };
}

async function loginAs(request, actor) {
  const response = await request.post("/api/auth/login", {
    data: {
      username: actor.username,
      password: actor.password,
    },
  });
  const payload = await response.json().catch(async () => ({
    raw: await response.text().catch(() => ""),
  }));
  expect(
    response.ok(),
    `password login for ${actor.username}: HTTP ${response.status()} ${JSON.stringify(payload)}`
  ).toBeTruthy();
  const user = payload;
  expect(user.username).toBe(actor.username);
  expect(user.role).toBe(actor.role);
  return user;
}

async function fileExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function bootstrapActorSession(playwright, baseURL, actor) {
  const storageState = path.join(authCacheDir, `${actor.id}.json`);
  if (await fileExists(storageState)) {
    const cachedRequest = await playwright.request.newContext({
      baseURL,
      storageState,
    });
    const cachedUserResponse = await cachedRequest.get("/api/auth/user").catch(() => null);
    if (cachedUserResponse?.ok()) {
      const user = await cachedUserResponse.json();
      await cachedRequest.dispose();
      expect(user.username).toBe(actor.username);
      expect(user.role).toBe(actor.role);
      return { actor, user, storageState };
    }
    await cachedRequest.dispose();
  }

  const request = await playwright.request.newContext({ baseURL });
  const user = await loginAs(request, actor);
  await request.storageState({ path: storageState });
  await request.dispose();
  return { actor, user, storageState };
}

function sessionFor(actor) {
  const session = actorSessions.get(actor.id);
  expect(session, `missing live session for ${actor.id}`).toBeTruthy();
  return session;
}

function shouldAssertSeededActorIds(baseURL) {
  if (process.env.WTF_E2E_STRICT_ACTOR_IDS === "0") return false;
  const host = (() => {
    try {
      return new URL(baseURL || "http://127.0.0.1").hostname;
    } catch {
      return "";
    }
  })();
  return host !== "wtfgameshow.app";
}

async function actorRequestContext(playwright, baseURL, actor) {
  return playwright.request.newContext({
    baseURL,
    storageState: sessionFor(actor).storageState,
  });
}

async function actorPage(browser, baseURL, actor) {
  const context = await browser.newContext({
    baseURL,
    storageState: actor ? sessionFor(actor).storageState : undefined,
  });
  const page = await context.newPage();
  return { context, page };
}

async function apiProbe(request, probe) {
  const method = probe.method.toLowerCase();
  const options = probe.body ? { data: probe.body, timeout: API_PROBE_TIMEOUT_MS } : { timeout: API_PROBE_TIMEOUT_MS };
  if (!["get", "head", "options"].includes(method)) {
    options.headers = await csrfHeaders(request);
  }
  return request[method](probe.path, options);
}

async function apiProbeFailureMessage(actor, probe, response) {
  const text = await response.text().catch(() => "");
  return `${actor.username} ${probe.method} ${probe.path}: HTTP ${response.status()} ${text
    .slice(0, 500)
    .replace(/\s+/g, " ")}`;
}

function apiProbeAccepted(response, probe) {
  return response.ok() || (probe.expectedStatuses ?? []).includes(response.status());
}

async function expectOkJson(response, label) {
  const payload = await response.json().catch(async () => ({
    raw: await response.text().catch(() => ""),
  }));
  expect(
    response.ok(),
    `${label}: HTTP ${response.status()} ${JSON.stringify(payload).slice(0, 800)}`
  ).toBeTruthy();
  return payload;
}

async function csrfHeaders(request) {
  const payload = await expectOkJson(await request.get("/api/auth/csrf-token"), "CSRF token");
  expect(payload.csrfToken, "session CSRF token").toBeTruthy();
  return { "X-CSRF-Token": payload.csrfToken };
}

async function walletLoginContext(playwright, baseURL, actor) {
  const request = await playwright.request.newContext({ baseURL });
  const challengeResponse = await request.post("/api/auth/wallet/challenge", {
    data: { walletAddress: actor.walletAddress, action: "login" },
  });
  const challenge = await expectOkJson(challengeResponse, `wallet challenge ${actor.id}`);
  const message = challenge.message;
  const signed = await signChallenge(actor, message);
  expect(signed.walletAddress).toBe(actor.walletAddress);

  const verifyResponse = await request.post("/api/auth/wallet/verify", {
    data: {
      walletAddress: actor.walletAddress,
      publicKey: signed.publicKey,
      signature: signed.signature,
      nonce: challenge.nonce,
    },
  });
  const payload = await expectOkJson(verifyResponse, `wallet verify ${actor.id}`);
  expect(payload.action).toBe("login");
  expect(payload.user.username).toBe(actor.username);
  return request;
}

function uniqueCatalogSlugs(payload) {
  const rows = [
    ...(payload?.all ?? []),
    ...(payload?.demos ?? []),
    ...(payload?.published ?? []),
    ...(payload?.mine ?? []),
    ...(payload?.games ?? []),
  ];
  return [
    ...new Map(
      rows
        .filter((row) => row?.slug)
        .map((row) => [row.slug, row])
    ).values(),
  ];
}

async function signChallenge(actor, message) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      process.env.WTF_E2E_TSX_CLI || "node_modules/tsx/dist/cli.mjs",
      "tests/e2e/puppets/sign-challenge.ts",
      "--wallet-id",
      actor.walletId,
      "--message-base64",
      Buffer.from(message, "utf8").toString("base64"),
    ],
    { timeout: 30_000 }
  );
  return JSON.parse(stdout.trim());
}

async function horfGuestWalletContext(playwright, baseURL, actor) {
  const request = await playwright.request.newContext({ baseURL });
  try {
    const headers = await csrfHeaders(request);
    const challenge = await expectOkJson(
      await request.post("/api/horf/wallet/challenge", {
        data: { walletAddress: actor.walletAddress }, headers,
      }),
      `Horf wallet challenge for ${actor.id}`
    );
    expect(challenge.action).toBe("horf");
    expect(challenge.nonce).toBeTruthy();
    const signed = await signChallenge(actor, challenge.message);
    expect(signed.walletAddress).toBe(actor.walletAddress);
    const verification = await expectOkJson(
      await request.post("/api/horf/wallet/verify", {
        data: {
          walletAddress: actor.walletAddress,
          publicKey: signed.publicKey,
          signature: signed.signature,
          nonce: challenge.nonce,
        },
        headers: await csrfHeaders(request),
      }),
      `Horf wallet verification for ${actor.id}`
    );
    expect(verification).toMatchObject({
      walletAddress: actor.walletAddress,
      verified: true,
      source: "wallet-proof",
    });
    return { request, challenge, signed };
  } catch (error) {
    await request.dispose();
    throw error;
  }
}

function isLocalHorfLiveTarget(baseURL) {
  try {
    const local = new Set(["localhost", "127.0.0.1", "::1"]);
    return local.has(new URL(baseURL).hostname) && local.has(new URL(process.env.DATABASE_URL).hostname);
  } catch {
    return false;
  }
}

test.describe("live E2E puppet orchestration", () => {
  test.beforeAll(async ({ playwright, baseURL }) => {
    puppetCredentials = applyActorFilter(await readPuppetCredentials());
    if (actorFilter.length === 0) {
      expect(puppetCredentials.actors).toHaveLength(12);
    } else {
      expect(
        puppetCredentials.actors.length,
        `WTF_E2E_ACTOR_FILTER matched no actors: ${actorFilter.join(", ")}`
      ).toBeGreaterThan(0);
    }

    await mkdir(authCacheDir, { recursive: true });

    for (const actor of puppetCredentials.actors) {
      const session = await bootstrapActorSession(playwright, baseURL, actor);
      if (shouldAssertSeededActorIds(baseURL)) {
        expect(session.user.id).toBe(actor.userId);
      }
      actorSessions.set(actor.id, session);
    }
  });

  test("all 12 puppet users can password-login and expose their linked wallet", async ({
    playwright,
    baseURL,
  }) => {
    expect(puppetCredentials.actors).toHaveLength(12);

    for (const actor of puppetCredentials.actors) {
      const request = await actorRequestContext(playwright, baseURL, actor);
      const userResponse = await request.get("/api/auth/user");
      expect(userResponse.ok(), `/api/auth/user for ${actor.username}`).toBeTruthy();
      const user = await userResponse.json();
      expect(user.username).toBe(actor.username);
      expect(user.role).toBe(actor.role);
      if (shouldAssertSeededActorIds(baseURL)) {
        expect(user.id).toBe(actor.userId);
      }

      const walletsResponse = await request.get("/api/wallets");
      expect(walletsResponse.ok(), `/api/wallets for ${actor.username}`).toBeTruthy();
      const wallets = await walletsResponse.json();
      expect(Array.isArray(wallets)).toBe(true);
      expect(
        wallets.some(
          (wallet) =>
            String(wallet.walletAddress).toLowerCase() ===
            actor.walletAddress.toLowerCase()
        ),
        `${actor.username} should have ${actor.walletAddress}`
      ).toBe(true);
      await request.dispose();
    }

    const loginRequest = await playwright.request.newContext({ baseURL });
    try {
      await loginAs(loginRequest, puppetCredentials.actors[0]);
      const metric = await expectOkJson(
        await loginRequest.get("/api/desktop/login-accounts-30d"),
        "30-day login account count after puppet password login"
      );
      expect(metric.windowDays).toBe(30);
      expect(metric.uniqueAccounts).toBeGreaterThanOrEqual(1);
    } finally {
      await loginRequest.dispose();
    }
  });

  test("Horf is public to a guest and wallet proof creates only a scoped wallet session", async ({
    playwright,
    browser,
    baseURL,
  }) => {
    const actor = actorByRole(puppetCredentials, "contestant");
    const witness = actorByRole(puppetCredentials, "witness");
    const guest = await playwright.request.newContext({ baseURL });
    const context = await browser.newContext({ baseURL });
    let resumed;
    try {
      expect((await guest.get("/api/auth/user")).status()).toBe(401);
      const page = await context.newPage();
      await page.goto("/horf", { waitUntil: "domcontentloaded" });
      await expect(page.locator("[data-horf-app]")).toBeVisible();
      await expect(page).toHaveURL(/\/horf(?:\?season=current-2026)?$/);

      const season = await expectOkJson(await guest.get("/api/horf/season"), "public Horf season");
      expect(season.season?.key).toBe("current-2026");
      expect(Array.isArray(season.leaderboard)).toBe(true);
      const stable = await expectOkJson(await guest.get("/api/horf/stables"), "public Horf stables");
      expect(stable.network).toBe("mainnet");
      const horse = await expectOkJson(await guest.get("/api/horf/horse/config"), "public HORSE config");
      expect(horse.chainId).toBe("NetXdQprcVkpaWU");
      const tokenResponse = await guest.get(`/api/horf/wallet/tokens?address=${encodeURIComponent(actor.walletAddress)}&offset=0`);
      expect([200, 503], "public owned-token read is not gated by WTF sign-in").toContain(tokenResponse.status());
      if (tokenResponse.ok()) {
        const tokens = await tokenResponse.json();
        expect(Array.isArray(tokens.items)).toBe(true);
        expect(typeof tokens.pagination?.hasMore).toBe("boolean");
      } else {
        expect((await tokenResponse.json()).error).toMatch(/temporarily unavailable/i);
      }

      const before = await expectOkJson(await guest.get("/api/horf/wallet/session"), "guest Horf wallet session");
      expect(before).toMatchObject({ walletAddress: null, verified: false });
      const noProof = await guest.get(`/api/horf/posse?address=${encodeURIComponent(actor.walletAddress)}`);
      expect(noProof.status()).toBe(403);
      expect((await noProof.json()).error).toMatch(/wallet|verify|proof/i);

      const noCsrf = await guest.post("/api/horf/wallet/challenge", {
        data: { walletAddress: actor.walletAddress },
      });
      expect(noCsrf.status()).toBe(403);
      expect((await noCsrf.json()).error).toMatch(/CSRF/i);

      const headers = await csrfHeaders(guest);
      const challenge = await expectOkJson(
        await guest.post("/api/horf/wallet/challenge", {
          data: { walletAddress: actor.walletAddress }, headers,
        }),
        "guest Horf wallet challenge"
      );
      expect(challenge.action).toBe("horf");
      expect(challenge.origin).toBeTruthy();
      expect(Number.isFinite(Date.parse(challenge.expiresAt))).toBe(true);
      const wrongSigner = await signChallenge(witness, challenge.message);
      const forged = await guest.post("/api/horf/wallet/verify", {
        data: {
          walletAddress: actor.walletAddress,
          publicKey: wrongSigner.publicKey,
          signature: wrongSigner.signature,
          nonce: challenge.nonce,
        },
        headers: await csrfHeaders(guest),
      });
      expect(forged.status(), "another puppet cannot claim the challenged wallet").toBe(403);
      const signed = await signChallenge(actor, challenge.message);
      const verificationBody = {
        walletAddress: actor.walletAddress,
        publicKey: signed.publicKey,
        signature: signed.signature,
        nonce: challenge.nonce,
      };
      const verified = await expectOkJson(
        await guest.post("/api/horf/wallet/verify", {
          data: verificationBody,
          headers: await csrfHeaders(guest),
        }),
        "guest Horf wallet verification"
      );
      expect(verified).toMatchObject({ walletAddress: actor.walletAddress, verified: true, source: "wallet-proof" });
      expect((await guest.get("/api/auth/user")).status()).toBe(401);
      const replay = await guest.post("/api/horf/wallet/verify", {
        data: verificationBody,
        headers: await csrfHeaders(guest),
      });
      expect(replay.status(), "a consumed Horf wallet challenge cannot verify twice").toBe(403);

      resumed = await playwright.request.newContext({ baseURL, storageState: await guest.storageState() });
      const session = await expectOkJson(await resumed.get("/api/horf/wallet/session"), "resumed Horf guest wallet session");
      expect(session).toMatchObject({ walletAddress: actor.walletAddress, verified: true });
      const disconnected = await resumed.post("/api/horf/wallet/disconnect", { headers: await csrfHeaders(resumed) });
      expect(disconnected.ok()).toBeTruthy();
      const after = await expectOkJson(await resumed.get("/api/horf/wallet/session"), "disconnected Horf wallet session");
      expect(after).toMatchObject({ walletAddress: null, verified: false });
    } finally {
      await resumed?.dispose();
      await context.close();
      await guest.dispose();
    }
  });

  test("Horf reads the current season for a linked puppet wallet", async ({
    playwright,
    baseURL,
  }) => {
    const actor = actorByRole(puppetCredentials, "contestant");
    const request = await actorRequestContext(playwright, baseURL, actor);
    try {
      const payload = await expectOkJson(
        await request.get(`/api/horf/season?address=${encodeURIComponent(actor.walletAddress)}`),
        `Horf season for ${actor.username}`
      );
      expect(payload.season?.startsAt).toBe("2026-11-01T00:00:00.000Z");
      expect(payload.season?.endsAt).toBeNull();
      expect(payload.season?.key).toBe("current-2026");
      expect(payload.seasons?.some((season) => season.key === "neighvember-2025")).toBe(true);
      expect(["ready", "syncing", "error"]).toContain(payload.status);
      expect(Array.isArray(payload.leaderboard)).toBe(true);
      if (payload.currentUser) {
        expect(payload.currentUser.address.toLowerCase()).toBe(actor.walletAddress.toLowerCase());
        expect(Array.isArray(payload.currentUser.waitingHorses)).toBe(true);
      }
      const archive = await expectOkJson(
        await request.get(`/api/horf/season?season=neighvember-2025&address=${encodeURIComponent(actor.walletAddress)}`),
        `Horf archive for ${actor.username}`
      );
      expect(archive.season?.key).toBe("neighvember-2025");
      expect(archive.season?.endsAt).toBeTruthy();
      expect(Array.isArray(archive.leaderboard)).toBe(true);
      if (archive.currentUser) {
        expect(archive.currentUser.address.toLowerCase()).toBe(actor.walletAddress.toLowerCase());
      }
    } finally {
      await request.dispose();
    }
  });

  test("Horf Stables keeps linked and unlinked puppet wallets behind the permit boundary", async ({
    playwright,
    baseURL,
  }) => {
    const actor = actorByRole(puppetCredentials, "contestant");
    const unlinkedWallet = actorByRole(puppetCredentials, "witness").walletAddress;
    const request = await actorRequestContext(playwright, baseURL, actor);
    const permit = {
      mode: 0,
      tokenContract: "KT1U4p17VUNcinntAzUULBhzpPK7f2a4Ht4P",
      tokenId: "23",
      amount: "1",
    };
    try {
      const headers = await csrfHeaders(request);
      const snapshot = await expectOkJson(
        await request.get(`/api/horf/stables?address=${encodeURIComponent(actor.walletAddress)}`),
        `Horf Stables snapshot for ${actor.username}`
      );
      expect(snapshot.network).toBe("mainnet");
      expect(snapshot.chainId).toBe("NetXdQprcVkpaWU");
      expect(snapshot.status).toBe("unconfigured");
      expect(snapshot.contractAddress).toBeNull();
      expect(snapshot.permitReady).toBe(false);
      expect(snapshot.reciprocalCredits).toBe("0");
      expect(snapshot.groupCredits).toBe("0");
      expect(snapshot.listings).toEqual([]);

      const unlinked = await request.post("/api/horf/stables/permit", {
        data: { ...permit, address: unlinkedWallet },
        headers,
      });
      expect(unlinked.status(), "a valid wallet linked to a different actor cannot obtain a permit").toBe(403);
      const unlinkedBody = await unlinked.json();
      expect(unlinkedBody.error).toMatch(/verify this wallet/i);

      const linked = await request.post("/api/horf/stables/permit", {
        data: { ...permit, address: actor.walletAddress },
        headers,
      });
      expect(linked.status(), "an uninspected token cannot receive a Mainnet Stable permit").toBe(422);
      const linkedBody = await linked.json();
      expect(linkedBody.code).toBe("HORF_CUSTODY_UNTRUSTED");
    } finally {
      await request.dispose();
    }
  });

  test("Horf HORSE reads and posse contacts stay with their signed-in actor", async ({
    playwright,
    baseURL,
  }) => {
    const actor = actorByRole(puppetCredentials, "contestant");
    const witness = actorByRole(puppetCredentials, "witness");
    const request = await actorRequestContext(playwright, baseURL, actor);
    const witnessRequest = await actorRequestContext(playwright, baseURL, witness);
    let partnerId = null;
    let headers = null;
    try {
      headers = await csrfHeaders(request);
      const config = await expectOkJson(
        await request.get(`/api/horf/horse/config?address=${encodeURIComponent(actor.walletAddress)}`),
        `Horf HORSE config for ${actor.username}`
      );
      expect(config.network).toBe("mainnet");
      expect(config.chainId).toBe("NetXdQprcVkpaWU");
      expect(["ready", "unconfigured"]).toContain(config.status);
      if (config.status === "ready") {
        expect(config.token?.symbol).toBe("HORSE");
        expect(config.token?.tokenId).toBe("0");
        expect(config.token?.decimals).toBe(8);
        expect(config.balanceRaw).toMatch(/^\d+$/);
      } else {
        expect(config.token).toBeNull();
        expect(config.balanceRaw).toBeNull();
      }
      const activity = await expectOkJson(
        await request.get(`/api/horf/horse/activity?address=${encodeURIComponent(actor.walletAddress)}`),
        `Horf HORSE activity for ${actor.username}`
      );
      expect(activity.network).toBe("mainnet");
      expect(activity.chainId).toBe("NetXdQprcVkpaWU");
      for (const field of ["receivedRaw", "sentRaw", "awardedRaw"]) {
        expect(activity[field]).toMatch(/^\d+$/);
      }

      const saved = await expectOkJson(
        await request.post("/api/horf/posse", {
          data: { ownerAddress: actor.walletAddress, address: witness.walletAddress, nickname: "Elmo horse trader" },
          headers,
        }),
        `Horf posse save for ${actor.username}`
      );
      partnerId = saved.id;
      expect(Number.isSafeInteger(partnerId)).toBe(true);
      expect(saved.address).toBe(witness.walletAddress);
      expect(saved.nickname).toBe("Elmo horse trader");

      const ownPosse = await expectOkJson(await request.get(`/api/horf/posse?address=${encodeURIComponent(actor.walletAddress)}`), "owner Horf posse");
      expect(ownPosse.partners.some((partner) => partner.id === partnerId && partner.address === witness.walletAddress)).toBe(true);
      const otherPosse = await expectOkJson(await witnessRequest.get(`/api/horf/posse?address=${encodeURIComponent(witness.walletAddress)}`), "other actor Horf posse");
      expect(otherPosse.partners.some((partner) => partner.id === partnerId)).toBe(false);

      const removed = await request.delete(`/api/horf/posse/${partnerId}`, { headers });
      expect(removed.status()).toBe(204);
      const afterRemoval = await expectOkJson(await request.get(`/api/horf/posse?address=${encodeURIComponent(actor.walletAddress)}`), "Horf posse after removal");
      expect(afterRemoval.partners.some((partner) => partner.id === partnerId)).toBe(false);
      partnerId = null;
    } finally {
      if (partnerId !== null && headers) await request.delete(`/api/horf/posse/${partnerId}`, { headers }).catch(() => null);
      await request.dispose();
      await witnessRequest.dispose();
    }
  });

  test("Horf exposes sender-only HORSE accrual and scopes cumulative claim permits to the trader wallet", async ({ playwright, baseURL }) => {
    const anonymous = await playwright.request.newContext({ baseURL });
    const actor = actorByRole(puppetCredentials, "contestant");
    const witness = actorByRole(puppetCredentials, "witness");
    const linked = await actorRequestContext(playwright, baseURL, actor);
    try {
      for (const role of ["contestant", "witness"]) {
        const trader = actorByRole(puppetCredentials, role);
        const rewards = await expectOkJson(
          await anonymous.get(`/api/horf/horse/rewards?address=${encodeURIComponent(trader.walletAddress)}`),
          `public HORSE rewards for ${role}`
        );
        expect(rewards).toMatchObject({ season: "current-2026", rateHorse: "10", rateRaw: "1000000000" });
        for (const key of ["countedUnits", "accruedRaw", "totalRaw", "claimableRaw", "claimedRaw", "sourceDiscrepancies"]) {
          expect(rewards[key], `${key} is a separate nonnegative integer string`).toMatch(/^\d+$/);
        }
        expect(BigInt(rewards.accruedRaw), "10 HORSE per rewardable outbound edition").toBe(
          BigInt(rewards.countedUnits) * BigInt(rewards.rateRaw)
        );
        expect(rewards.totalRaw).toBe(rewards.accruedRaw);
        expect(BigInt(rewards.claimableRaw)).toBe(
          BigInt(rewards.accruedRaw) > BigInt(rewards.claimedRaw)
            ? BigInt(rewards.accruedRaw) - BigInt(rewards.claimedRaw)
            : 0n
        );
        expect(["ready", "syncing", "error"]).toContain(rewards.status);
        expect(rewards.asOf === null || typeof rewards.asOf === "string").toBe(true);
        expect(typeof rewards.sourceComplete).toBe("boolean");
        expect(typeof rewards.claimReady).toBe("boolean");
        expect(rewards.vaultAddress === null || /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(rewards.vaultAddress)).toBe(true);
        if (rewards.claimReady) {
          expect(rewards.status).toBe("ready");
          expect(rewards.sourceComplete).toBe(true);
          expect(rewards.vaultAddress).toBeTruthy();
          expect(BigInt(rewards.claimableRaw)).toBeGreaterThan(0n);
        }
      }

      const noProof = await anonymous.post("/api/horf/horse/claim-permit", {
        data: { address: actor.walletAddress }, headers: await csrfHeaders(anonymous),
      });
      expect(noProof.status(), "a public reward read cannot authorize a claim signature").toBe(403);

      const wrongWallet = await linked.post("/api/horf/horse/claim-permit", {
        data: { address: witness.walletAddress }, headers: await csrfHeaders(linked),
      });
      expect(wrongWallet.status(), "a linked trader cannot request another wallet's claim signature").toBe(403);

      const ownPermit = await linked.post("/api/horf/horse/claim-permit", {
        data: { address: actor.walletAddress }, headers: await csrfHeaders(linked),
      });
      if (ownPermit.ok()) {
        const permit = await ownPermit.json();
        expect(permit).toMatchObject({ chainId: "NetXdQprcVkpaWU" });
        expect(permit.contractAddress).toMatch(/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/);
        expect(permit.signature).toMatch(/^(?:edsig|spsig1|p2sig|sig)[1-9A-HJ-NP-Za-km-z]+$/);
        expect(permit.totalRaw).toMatch(/^\d+$/);
        expect(permit.claimedRaw).toMatch(/^\d+$/);
        expect(permit.claimableRaw).toMatch(/^\d+$/);
        expect(BigInt(permit.claimableRaw)).toBe(BigInt(permit.totalRaw) - BigInt(permit.claimedRaw));
      } else {
        expect(ownPermit.status(), "no claim signature is issued before the source and vault are ready").toBe(503);
        expect(["HORF_HORSE_REWARD_SYNCING", "HORF_HORSE_CLAIM_UNCONFIGURED"])
          .toContain((await ownPermit.json()).code);
      }
    } finally {
      await anonymous.dispose();
      await linked.dispose();
    }
  });

  test("Horf gift book rejects an unlinked wallet and keeps the linked inbox private", async ({
    playwright,
    baseURL,
  }) => {
    const actor = actorByRole(puppetCredentials, "contestant");
    const witness = actorByRole(puppetCredentials, "witness");
    const request = await actorRequestContext(playwright, baseURL, actor);
    try {
      const headers = await csrfHeaders(request);
      const inbox = await expectOkJson(
        await request.get(`/api/horf/gifts?address=${encodeURIComponent(actor.walletAddress)}`),
        `Horf gift inbox for ${actor.username}`
      );
      expect(Array.isArray(inbox.gifts)).toBe(true);

      const otherInbox = await request.get(`/api/horf/gifts?address=${encodeURIComponent(witness.walletAddress)}`);
      expect(otherInbox.status(), "another actor's linked wallet must not expose its gift inbox").toBe(403);

      const unlinked = await request.post("/api/horf/gifts/confirm", {
        headers,
        data: {
          address: witness.walletAddress,
          opHash: `o${"A".repeat(50)}`,
          gifts: [{ recipient: actor.walletAddress, tokenContract: "KT1U4p17VUNcinntAzUULBhzpPK7f2a4Ht4P", tokenId: "23", amount: "1" }],
        },
      });
      expect(unlinked.status(), "an actor cannot classify another wallet's transfer as their gift").toBe(403);
      const unlinkedTrade = await request.post("/api/horf/trades/confirm", {
        headers,
        data: {
          address: witness.walletAddress,
          opHash: `o${"B".repeat(50)}`,
          trades: [{ recipient: actor.walletAddress, tokenContract: "KT1U4p17VUNcinntAzUULBhzpPK7f2a4Ht4P", tokenId: "23", amount: "1" }],
        },
      });
      expect(unlinkedTrade.status(), "an actor cannot classify another wallet's transfer as their direct trade").toBe(403);

      const invalidMark = await request.post("/api/horf/gifts/0/returned", { data: { returnedFavor: true }, headers });
      expect(invalidMark.status()).toBe(400);
    } finally {
      await request.dispose();
    }
  });

  test("Horf guest posse persists by verified wallet and stable permits respect that scope", async ({
    playwright,
    baseURL,
  }) => {
    const actor = actorByRole(puppetCredentials, "contestant");
    const witness = actorByRole(puppetCredentials, "witness");
    const unproved = await playwright.request.newContext({ baseURL });
    let guest;
    let otherGuest;
    let signedIn;
    let partnerId = null;
    try {
      guest = (await horfGuestWalletContext(playwright, baseURL, actor)).request;
      otherGuest = (await horfGuestWalletContext(playwright, baseURL, witness)).request;
      signedIn = await actorRequestContext(playwright, baseURL, actor);
      const signedChallenge = await expectOkJson(await signedIn.post("/api/horf/wallet/challenge", {
        data: { walletAddress: actor.walletAddress },
        headers: await csrfHeaders(signedIn),
      }), "linked account Horf wallet challenge");
      const signedProof = await signChallenge(actor, signedChallenge.message);
      const signedVerified = await expectOkJson(await signedIn.post("/api/horf/wallet/verify", {
        data: {
          walletAddress: actor.walletAddress,
          publicKey: signedProof.publicKey,
          signature: signedProof.signature,
          nonce: signedChallenge.nonce,
        },
        headers: await csrfHeaders(signedIn),
      }), "linked account Horf wallet proof");
      expect(signedVerified).toMatchObject({ walletAddress: actor.walletAddress, verified: true, source: "linked" });
      const stillSignedIn = await expectOkJson(await signedIn.get("/api/auth/user"), "WTF account after Horf wallet proof");
      expect(stillSignedIn.username).toBe(actor.username);

      const rejected = await unproved.post("/api/horf/stables/permit", {
        data: { address: actor.walletAddress, mode: 0, tokenContract: "KT1U4p17VUNcinntAzUULBhzpPK7f2a4Ht4P", tokenId: "23", amount: "1" },
        headers: await csrfHeaders(unproved),
      });
      expect(rejected.status()).toBe(403);
      expect((await rejected.json()).error).toMatch(/wallet|verify|proof/i);

      const saved = await expectOkJson(await guest.post("/api/horf/posse", {
        data: { ownerAddress: actor.walletAddress, address: witness.walletAddress, nickname: "Guest horse posse" },
        headers: await csrfHeaders(guest),
      }), "guest Horf posse save");
      partnerId = saved.id;
      expect(saved.address).toBe(witness.walletAddress);
      const path = `/api/horf/posse?address=${encodeURIComponent(actor.walletAddress)}`;
      const own = await expectOkJson(await guest.get(path), "guest Horf posse");
      expect(own.partners.some((partner) => partner.id === partnerId)).toBe(true);
      const shared = await expectOkJson(await signedIn.get(path), "linked account Horf posse");
      expect(shared.partners.some((partner) => partner.id === partnerId)).toBe(true);
      const privateList = await otherGuest.get(path);
      expect(privateList.status()).toBe(403);
      const foreignDelete = await otherGuest.delete(`/api/horf/posse/${partnerId}`, {
        headers: await csrfHeaders(otherGuest),
      });
      expect(foreignDelete.status()).toBe(403);

      const permit = { mode: 0, tokenContract: "KT1U4p17VUNcinntAzUULBhzpPK7f2a4Ht4P", tokenId: "23", amount: "1" };
      const foreignPermit = await guest.post("/api/horf/stables/permit", {
        data: { ...permit, address: witness.walletAddress },
        headers: await csrfHeaders(guest),
      });
      expect(foreignPermit.status()).toBe(403);
      const ownPermit = await guest.post("/api/horf/stables/permit", {
        data: { ...permit, address: actor.walletAddress },
        headers: await csrfHeaders(guest),
      });
      expect(ownPermit.status(), "proved guest reaches the inspection gate before Mainnet configuration").toBe(422);
      expect((await ownPermit.json()).code).toBe("HORF_CUSTODY_UNTRUSTED");

      const removed = await guest.delete(`/api/horf/posse/${partnerId}`, {
        headers: await csrfHeaders(guest),
      });
      expect(removed.status()).toBe(204);
      const removedId = partnerId;
      partnerId = null;
      const after = await expectOkJson(await signedIn.get(path), "linked account Horf posse after guest removal");
      expect(after.partners.some((partner) => partner.id === removedId)).toBe(false);
    } finally {
      if (partnerId !== null && guest) {
        await guest.delete(`/api/horf/posse/${partnerId}`, { headers: await csrfHeaders(guest) }).catch(() => null);
      }
      await unproved.dispose();
      await guest?.dispose();
      await otherGuest?.dispose();
      await signedIn?.dispose();
    }
  });

  test("Horf guest and linked wallet share gift notes while another wallet cannot change them", async ({
    playwright,
    baseURL,
  }) => {
    test.skip(!isLocalHorfLiveTarget(baseURL), "Synthetic gift fixture is limited to the local live puppet database.");
    const actor = actorByRole(puppetCredentials, "contestant");
    const witness = actorByRole(puppetCredentials, "witness");
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    let guest;
    let otherGuest;
    let signedIn;
    let giftId = null;
    try {
      guest = (await horfGuestWalletContext(playwright, baseURL, actor)).request;
      otherGuest = (await horfGuestWalletContext(playwright, baseURL, witness)).request;
      signedIn = await actorRequestContext(playwright, baseURL, actor);
      const inserted = await pool.query(
        `INSERT INTO horf_gift_transfers
          (tzkt_transfer_id, operation_hash, from_address, to_address, token_contract, token_id, amount, token_name, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING id`,
        [
          -(Date.now() * 1000 + Math.floor(Math.random() * 1000)),
          `o${"G".repeat(50)}`,
          witness.walletAddress,
          actor.walletAddress,
          "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
          "7",
          1,
          "Live puppet Neighvember gift",
        ]
      );
      giftId = Number(inserted.rows[0].id);
      expect(Number.isSafeInteger(giftId)).toBe(true);
      const inboxPath = `/api/horf/gifts?address=${encodeURIComponent(actor.walletAddress)}`;
      const guestInbox = await expectOkJson(await guest.get(inboxPath), "guest gift inbox");
      expect(guestInbox.gifts.some((gift) => gift.id === giftId && gift.returnedFavor === false)).toBe(true);
      expect((await otherGuest.get(inboxPath)).status()).toBe(403);

      const foreignMark = await otherGuest.post(`/api/horf/gifts/${giftId}/returned`, {
        data: { returnedFavor: true },
        headers: await csrfHeaders(otherGuest),
      });
      expect(foreignMark.status()).toBe(403);
      const foreignConfirmation = await otherGuest.post("/api/horf/gifts/confirm", {
        data: {
          address: actor.walletAddress,
          opHash: `o${"H".repeat(50)}`,
          gifts: [{ recipient: witness.walletAddress, tokenContract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton", tokenId: "7", amount: "1" }],
        },
        headers: await csrfHeaders(otherGuest),
      });
      expect(foreignConfirmation.status()).toBe(403);

      const marked = await expectOkJson(await guest.post(`/api/horf/gifts/${giftId}/returned`, {
        data: { returnedFavor: true },
        headers: await csrfHeaders(guest),
      }), "guest returned-favor mark");
      expect(marked.returnedFavor).toBe(true);
      const linkedInbox = await expectOkJson(await signedIn.get(inboxPath), "linked wallet gift inbox");
      expect(linkedInbox.gifts.some((gift) => gift.id === giftId && gift.returnedFavor === true)).toBe(true);
      await expectOkJson(await signedIn.post(`/api/horf/gifts/${giftId}/returned`, {
        data: { returnedFavor: false },
        headers: await csrfHeaders(signedIn),
      }), "linked wallet undo of guest favor note");
      const after = await expectOkJson(await guest.get(inboxPath), "guest gift inbox after linked undo");
      expect(after.gifts.some((gift) => gift.id === giftId && gift.returnedFavor === false)).toBe(true);
    } finally {
      if (giftId !== null) await pool.query("DELETE FROM horf_gift_transfers WHERE id = $1", [giftId]);
      await pool.end();
      await guest?.dispose();
      await otherGuest?.dispose();
      await signedIn?.dispose();
    }
  });

  test("Horf blacklist is admin governed, publicly visible, and blocks wallet-scoped actions", async ({
    playwright,
    baseURL,
  }) => {
    // This proves the database/API gate. Direct stable deposit/claim requires a
    // separate wtf.tez-signed on-chain blacklist operation before it is blocked.
    test.skip(!isLocalHorfLiveTarget(baseURL), "Blacklist mutation is limited to the local live puppet database.");
    const actor = actorByRole(puppetCredentials, "contestant");
    const witness = actorByRole(puppetCredentials, "witness");
    const administrator = actorByRole(puppetCredentials, "admin");
    const admin = await actorRequestContext(playwright, baseURL, administrator);
    const anonymous = await playwright.request.newContext({ baseURL });
    let guest;
    const statusPath = `/api/horf/trader-status?address=${encodeURIComponent(actor.walletAddress)}`;
    const deletePath = `/api/horf/admin/blacklist/${encodeURIComponent(actor.walletAddress)}`;
    try {
      const initial = await expectOkJson(await anonymous.get(statusPath), "public Horf trader status");
      expect(initial.address).toBe(actor.walletAddress);
      if (initial.blacklisted) {
        const cleared = await admin.delete(deletePath, { headers: await csrfHeaders(admin) });
        expect(cleared.ok(), "clear a leftover local puppet blacklist entry").toBeTruthy();
      }
      guest = (await horfGuestWalletContext(playwright, baseURL, actor)).request;
      const deniedAdminRead = await guest.get("/api/horf/admin/blacklist");
      expect(deniedAdminRead.status()).toBe(403);
      const deniedAdminWrite = await guest.post("/api/horf/admin/blacklist", {
        data: { address: witness.walletAddress, reason: "A guest must not moderate traders" },
        headers: await csrfHeaders(guest),
      });
      expect(deniedAdminWrite.status()).toBe(403);

      const reason = "Repeated fraudulent stable claims in a local Horf test";
      const listed = await expectOkJson(await admin.post("/api/horf/admin/blacklist", {
        data: { address: actor.walletAddress, reason },
        headers: await csrfHeaders(admin),
      }), "admin Horf trader restriction");
      expect(listed).toMatchObject({ address: actor.walletAddress, active: true, reason });
      const adminList = await expectOkJson(await admin.get("/api/horf/admin/blacklist"), "admin Horf blacklist");
      expect(adminList.entries.some((entry) => entry.address === actor.walletAddress && entry.active === true)).toBe(true);
      const publicStatus = await expectOkJson(await anonymous.get(statusPath), "public restricted trader status");
      expect(publicStatus).toMatchObject({ address: actor.walletAddress, blacklisted: true, reason });

      const privatePaths = [
        `/api/horf/posse?address=${encodeURIComponent(actor.walletAddress)}`,
        `/api/horf/gifts?address=${encodeURIComponent(actor.walletAddress)}`,
      ];
      for (const path of privatePaths) {
        const blocked = await guest.get(path);
        expect(blocked.status(), `${path} must reject a restricted wallet`).toBe(403);
        expect((await blocked.json()).code).toBe("HORF_BLACKLISTED");
      }
      const blockedPosse = await guest.post("/api/horf/posse", {
        data: { ownerAddress: actor.walletAddress, address: witness.walletAddress, nickname: "Blocked contact" },
        headers: await csrfHeaders(guest),
      });
      expect(blockedPosse.status()).toBe(403);
      expect((await blockedPosse.json()).code).toBe("HORF_BLACKLISTED");
      const blockedPermit = await guest.post("/api/horf/stables/permit", {
        data: { address: actor.walletAddress, mode: 0, tokenContract: "KT1U4p17VUNcinntAzUULBhzpPK7f2a4Ht4P", tokenId: "23", amount: "1" },
        headers: await csrfHeaders(guest),
      });
      expect(blockedPermit.status()).toBe(403);
      expect((await blockedPermit.json()).code).toBe("HORF_BLACKLISTED");
      const publicSeason = await expectOkJson(
        await anonymous.get(`/api/horf/season?address=${encodeURIComponent(actor.walletAddress)}`),
        "public Horf race while trader is restricted"
      );
      expect(Array.isArray(publicSeason.leaderboard)).toBe(true);
      if (publicSeason.currentUser) expect(publicSeason.currentUser.blacklisted).toBe(true);

      const cleared = await expectOkJson(await admin.delete(deletePath, { headers: await csrfHeaders(admin) }), "admin Horf unrestriction");
      expect(cleared.active).toBe(false);
      const after = await expectOkJson(await anonymous.get(statusPath), "public cleared trader status");
      expect(after.blacklisted).toBe(false);
      const restored = await expectOkJson(
        await guest.get(`/api/horf/posse?address=${encodeURIComponent(actor.walletAddress)}`),
        "unrestricted guest Horf posse"
      );
      expect(Array.isArray(restored.partners)).toBe(true);
    } finally {
      const current = await anonymous.get(statusPath).then((response) => response.json()).catch(() => null);
      if (current?.blacklisted) await admin.delete(deletePath, { headers: await csrfHeaders(admin) }).catch(() => null);
      await guest?.dispose();
      await anonymous.dispose();
      await admin.dispose();
    }
  });

  test("Horf MARSHAL is an account role, and revocation immediately removes inspection authority", async ({
    playwright,
    baseURL,
  }) => {
    test.skip(!isLocalHorfLiveTarget(baseURL), "Synthetic inspection evidence is limited to the local live puppet database.");
    const trader = actorByRole(puppetCredentials, "contestant");
    const administrator = actorByRole(puppetCredentials, "admin");
    const traderId = Number(sessionFor(trader).user.id);
    const rolePath = `/api/admin/users/${traderId}/roles`;
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const signedIn = await actorRequestContext(playwright, baseURL, trader);
    const admin = await actorRequestContext(playwright, baseURL, administrator);
    let guest;
    let inspectionId = null;
    let roleAssigned = false;
    try {
      guest = (await horfGuestWalletContext(playwright, baseURL, trader)).request;
      const guestStatus = await expectOkJson(await guest.get("/api/horf/inspectors/status"), "guest marshal status");
      expect(guestStatus).toEqual({ active: false, role: null });
      const guestQueue = await guest.get("/api/horf/inspections/pending");
      expect(guestQueue.status()).toBe(403);
      expect((await guestQueue.json()).code).toBe("HORF_MARSHAL_REQUIRED");
      const guestAssignment = await guest.post(rolePath, {
        data: { role: "horf_marshal" }, headers: await csrfHeaders(guest),
      });
      expect([401, 403]).toContain(guestAssignment.status());
      const before = await expectOkJson(await signedIn.get("/api/horf/inspectors/status"), "unassigned marshal status");
      expect(before).toEqual({ active: false, role: null });

      const tokenId = String(Date.now());
      const contract = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
      const inserted = await pool.query(
        `INSERT INTO horf_inspection_requests
          (submitter_address, token_contract, token_id, status, objkt_metadata, chain_evidence)
         VALUES ($1, $2, $3, 'pending', $4::jsonb, $5::jsonb) RETURNING id`,
        [trader.walletAddress, contract, tokenId,
          JSON.stringify({ source: "local puppet", name: "Marshal review fixture", tags: [] }),
          JSON.stringify({ source: "local puppet", note: "Synthetic review evidence for role boundary" })]
      );
      inspectionId = Number(inserted.rows[0].id);
      const guestDecision = await guest.post(`/api/horf/inspections/${inspectionId}/decision`, {
        data: { decision: "reject", reason: "Guest wallets cannot inspect" }, headers: await csrfHeaders(guest),
      });
      expect(guestDecision.status()).toBe(403);
      expect((await guestDecision.json()).code).toBe("HORF_MARSHAL_REQUIRED");

      const assigned = await expectOkJson(await admin.post(rolePath, {
        data: { role: "horf_marshal" }, headers: await csrfHeaders(admin),
      }), "admin HORF MARSHAL role assignment");
      roleAssigned = true;
      expect(assigned.roles).toContain("horf_marshal");
      const active = await expectOkJson(await signedIn.get("/api/horf/inspectors/status"), "assigned marshal status");
      expect(active).toEqual({ active: true, role: "horf_marshal" });
      const stillGuest = await expectOkJson(await guest.get("/api/horf/inspectors/status"), "same-wallet guest marshal status");
      expect(stillGuest).toEqual({ active: false, role: null });
      const queue = await expectOkJson(await signedIn.get("/api/horf/inspections/pending"), "marshal inspection queue");
      expect(queue.inspections.some((row) => row.id === inspectionId)).toBe(true);
      const detail = await expectOkJson(await signedIn.get(`/api/horf/inspections/${inspectionId}`), "marshal inspection detail");
      expect(detail).toMatchObject({ id: inspectionId, status: "pending", token: { contract, tokenId } });
      const decision = await expectOkJson(await signedIn.post(`/api/horf/inspections/${inspectionId}/decision`, {
        data: { decision: "reject", reason: "Contract transfer evidence is insufficient" },
        headers: await csrfHeaders(signedIn),
      }), "marshal inspection rejection");
      expect(decision).toMatchObject({ id: inspectionId, status: "rejected", reviewedByUserId: traderId });
      const stored = await pool.query("SELECT status, reviewed_by_user_id FROM horf_inspection_requests WHERE id = $1", [inspectionId]);
      expect(stored.rows[0]).toMatchObject({ status: "rejected", reviewed_by_user_id: traderId });

      const revoked = await expectOkJson(await admin.delete(`${rolePath}/horf_marshal`, {
        headers: await csrfHeaders(admin),
      }), "admin HORF MARSHAL role removal");
      roleAssigned = false;
      expect(revoked.roles).not.toContain("horf_marshal");
      const after = await expectOkJson(await signedIn.get("/api/horf/inspectors/status"), "revoked marshal status");
      expect(after).toEqual({ active: false, role: null });
      const deniedQueue = await signedIn.get("/api/horf/inspections/pending");
      expect(deniedQueue.status()).toBe(403);
      const deniedDecision = await signedIn.post(`/api/horf/inspections/${inspectionId}/decision`, {
        data: { decision: "approve", reason: "Role has been revoked" }, headers: await csrfHeaders(signedIn),
      });
      expect(deniedDecision.status()).toBe(403);
      expect((await deniedDecision.json()).code).toBe("HORF_MARSHAL_REQUIRED");
    } finally {
      if (roleAssigned) await admin.delete(`${rolePath}/horf_marshal`, { headers: await csrfHeaders(admin) }).catch(() => null);
      if (inspectionId !== null) await pool.query("DELETE FROM horf_inspection_requests WHERE id = $1", [inspectionId]);
      await pool.end();
      await guest?.dispose();
      await signedIn.dispose();
      await admin.dispose();
    }
  });

  test("Horf Stable permits require an active exact Mainnet inspection approval", async ({ playwright, baseURL }) => {
    test.skip(!isLocalHorfLiveTarget(baseURL), "A synthetic approval must only be seeded in the local live puppet database.");
    const trader = actorByRole(puppetCredentials, "contestant");
    const administrator = actorByRole(puppetCredentials, "admin");
    const contract = "KT1XaCf6gkjFnKg3QmPfn6gep53moMvjkj1E";
    const tokenId = "49589";
    const creator = "tz1TWrPXuG3T3rR9NR5EqsBegJMwiMcobjkt";
    const codeHash = 964496845;
    const codeSha256 = "fe6270753f1fefbbb4e52e65c804024172f58e7bedaf0fc94dc73ce298bb4677";
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const admin = await actorRequestContext(playwright, baseURL, administrator);
    let guest;
    let inspectionId = null;
    let createdApproval = false;
    try {
      const existing = await pool.query(
        "SELECT inspection_id FROM horf_inspection_approvals WHERE token_contract = $1 AND token_id = $2",
        [contract, tokenId]
      );
      expect(existing.rows, "the local positive permit fixture must not replace a real inspection approval").toHaveLength(0);
      guest = (await horfGuestWalletContext(playwright, baseURL, trader)).request;
      const permit = { address: trader.walletAddress, mode: 1, tokenContract: contract, tokenId, amount: "1" };
      const before = await guest.post("/api/horf/stables/permit", {
        data: permit, headers: await csrfHeaders(guest),
      });
      expect(before.status()).toBe(422);
      expect((await before.json()).code).toBe("HORF_CUSTODY_UNTRUSTED");

      const inserted = await pool.query(
        `INSERT INTO horf_inspection_requests
          (submitter_address, token_contract, token_id, status, objkt_metadata, chain_evidence,
           reviewed_by_user_id, reviewed_at, review_reason)
         VALUES ($1, $2, $3, 'approved', $4::jsonb, $5::jsonb, $6, NOW(), $7) RETURNING id`,
        [trader.walletAddress, contract, tokenId,
          JSON.stringify({ source: "local puppet", name: "Mainnet horse fingerprint", tags: [] }),
          JSON.stringify({ source: "Tezos Mainnet TzKT and RPC", identity: { contract, creatorAddress: creator, codeHash, codeSha256 } }),
          Number(sessionFor(administrator).user.id), "Local positive permit gate proof"]
      );
      inspectionId = Number(inserted.rows[0].id);
      await pool.query(
        `INSERT INTO horf_inspection_approvals
          (token_contract, token_id, active, inspection_id, inspector_user_id, approved_at,
           creator_address, code_hash, code_sha256)
         VALUES ($1, $2, true, $3, $4, NOW(), $5, $6, $7)`,
        [contract, tokenId, inspectionId, Number(sessionFor(administrator).user.id), creator, codeHash, codeSha256]
      );
      createdApproval = true;
      const publicStatus = await expectOkJson(
        await guest.get(`/api/horf/inspections/status?contract=${contract}&tokenId=${tokenId}`),
        "public approved Mainnet horse status"
      );
      expect(publicStatus).toMatchObject({ contract, tokenId, status: "approved", inspectionId });
      const approved = await guest.post("/api/horf/stables/permit", {
        data: permit, headers: await csrfHeaders(guest),
      });
      expect(approved.status(), "exact inspected Mainnet token reaches Stable configuration without a signature").toBe(503);
      expect((await approved.json()).error).toMatch(/not configured for Tezos mainnet/i);

      const revoked = await expectOkJson(await admin.post(
        `/api/horf/admin/inspection-approvals/${contract}/${tokenId}/revoke`,
        { data: { reason: "Local permit gate revocation" }, headers: await csrfHeaders(admin) }
      ), "admin inspection approval revocation");
      expect(revoked).toMatchObject({ contract, tokenId, status: "revoked", existingPermitsMayRemainValid: true });
      const after = await guest.post("/api/horf/stables/permit", {
        data: permit, headers: await csrfHeaders(guest),
      });
      expect(after.status()).toBe(422);
      expect((await after.json()).code).toBe("HORF_CUSTODY_UNTRUSTED");
    } finally {
      if (createdApproval) await pool.query(
        "DELETE FROM horf_inspection_approvals WHERE token_contract = $1 AND token_id = $2 AND inspection_id = $3",
        [contract, tokenId, inspectionId]
      );
      if (inspectionId !== null) await pool.query("DELETE FROM horf_inspection_requests WHERE id = $1", [inspectionId]);
      await pool.end();
      await guest?.dispose();
      await admin.dispose();
    }
  });

  test("Horf Open Range offers are public but only the verified owner may remove one", async ({ playwright, baseURL }) => {
    test.skip(!isLocalHorfLiveTarget(baseURL), "Synthetic Open Range offers are limited to the local live puppet database.");
    const trader = actorByRole(puppetCredentials, "contestant");
    const witness = actorByRole(puppetCredentials, "witness");
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const anonymous = await playwright.request.newContext({ baseURL });
    let ownerGuest;
    let otherGuest;
    let offerId = null;
    try {
      ownerGuest = (await horfGuestWalletContext(playwright, baseURL, trader)).request;
      otherGuest = (await horfGuestWalletContext(playwright, baseURL, witness)).request;
      const tokenId = String(Date.now());
      const inserted = await pool.query(
        `INSERT INTO horf_open_range_offers (owner_wallet_address, token_contract, token_id, amount)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [trader.walletAddress, "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton", tokenId, "2"]
      );
      offerId = Number(inserted.rows[0].id);
      const publicOffers = await expectOkJson(await anonymous.get("/api/horf/open-range/offers"), "public Open Range offers");
      expect(publicOffers.offers.some((offer) => offer.id === offerId && offer.ownerAddress === trader.walletAddress)).toBe(true);
      const wrongOwner = await otherGuest.delete(`/api/horf/open-range/offers/${offerId}`, {
        headers: await csrfHeaders(otherGuest),
      });
      expect(wrongOwner.status()).toBe(403);
      const unprovedPost = await anonymous.post("/api/horf/open-range/offers", {
        data: { address: trader.walletAddress, tokenContract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton", tokenId, amount: "1" },
        headers: await csrfHeaders(anonymous),
      });
      expect(unprovedPost.status()).toBe(403);
      const foreignPost = await ownerGuest.post("/api/horf/open-range/offers", {
        data: { address: witness.walletAddress, tokenContract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton", tokenId, amount: "1" },
        headers: await csrfHeaders(ownerGuest),
      });
      expect(foreignPost.status()).toBe(403);
      const removed = await ownerGuest.delete(`/api/horf/open-range/offers/${offerId}`, {
        headers: await csrfHeaders(ownerGuest),
      });
      expect(removed.status()).toBe(204);
      const stored = await pool.query("SELECT active, removed_at FROM horf_open_range_offers WHERE id = $1", [offerId]);
      expect(stored.rows[0].active).toBe(false);
      expect(stored.rows[0].removed_at).not.toBeNull();
      const after = await expectOkJson(await anonymous.get("/api/horf/open-range/offers"), "public Open Range offers after removal");
      expect(after.offers.some((offer) => offer.id === offerId)).toBe(false);
    } finally {
      if (offerId !== null) await pool.query("DELETE FROM horf_open_range_offers WHERE id = $1", [offerId]);
      await pool.end();
      await anonymous.dispose();
      await ownerGuest?.dispose();
      await otherGuest?.dispose();
    }
  });

  test("a signed-in puppet sees X, Discord, and AT Protocol in Profile social linking", async ({
    browser,
    baseURL,
  }) => {
    const actor = actorByRole(puppetCredentials, "contestant");
    const { context, page } = await actorPage(browser, baseURL, actor);
    try {
      await page.goto("/profile", { waitUntil: "domcontentloaded" });
      const socialLinks = page.locator('[data-profile-section="social-network-linking"]');
      await expect(socialLinks.getByRole("heading", { name: "Social network linking" })).toBeVisible();
      await expect(socialLinks.getByRole("textbox", { name: "Twitter handle" })).toBeVisible();
      await expect(socialLinks.getByRole("textbox", { name: "Discord username" })).toBeVisible();
      await expect(socialLinks.getByRole("textbox", { name: "AT Protocol handle" })).toBeVisible();
      await expect(socialLinks.getByText("X:", { exact: true })).toBeVisible();
      await expect(socialLinks.getByText("Discord:", { exact: true })).toBeVisible();
      await expect(socialLinks.getByText("AT Protocol:", { exact: true })).toBeVisible();
      await socialLinks.getByRole("textbox", { name: "AT Protocol handle" }).fill("");
      await expect(socialLinks.getByRole("button", { name: /^(Connect|Reverify) AT Protocol$/i })).toBeEnabled();
      await socialLinks.getByRole("textbox", { name: "Discord username" }).fill("");
      const discordBlankButton = socialLinks.getByRole("button", { name: /^(Connect|Reverify) Discord$/i });
      if (await discordBlankButton.count()) {
        await expect(discordBlankButton).toBeEnabled();
      }
    } finally {
      await context.close();
    }
  });

  test("a witness puppet sees Contact Admin but cannot discover or open Admin", async ({
    browser,
    baseURL,
  }) => {
    const actor = actorByRole(puppetCredentials, "witness");
    const { context, page } = await actorPage(browser, baseURL, actor);
    try {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      const contactAdmin = page.locator('[data-desktop-icon-key="admin-inbox"]');
      await expect(contactAdmin).toBeVisible({ timeout: 15_000 });
      await page.goto("/admin-inbox", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Contact an admin" })).toBeVisible();

      await page.goto("/admin", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/$/);
      await expect(page.locator('[data-admin-surface="control-suite"]')).toHaveCount(0);
      await expect(page.getByText("Admin Panel").first()).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("platform-keyring wallets can sign wallet-login challenges for every puppet", async ({
    request,
  }) => {
    for (const actor of puppetCredentials.actors) {
      const challengeResponse = await request.post("/api/auth/wallet/challenge", {
        data: { walletAddress: actor.walletAddress, action: "login" },
      });
      expect(challengeResponse.ok(), `wallet challenge for ${actor.id}`).toBeTruthy();
      const challenge = await challengeResponse.json();
      const message = challenge.message;
      const signed = await signChallenge(actor, message);
      expect(signed.walletAddress).toBe(actor.walletAddress);

      const verifyResponse = await request.post("/api/auth/wallet/verify", {
        data: {
          walletAddress: actor.walletAddress,
          publicKey: signed.publicKey,
          signature: signed.signature,
          nonce: challenge.nonce,
        },
      });
      const payload = await verifyResponse.json().catch(async () => ({
        raw: await verifyResponse.text().catch(() => ""),
      }));
      expect(
        verifyResponse.ok(),
        `wallet verify for ${actor.id}: HTTP ${verifyResponse.status()} ${JSON.stringify(payload)}`
      ).toBeTruthy();
      expect(payload.action).toBe("login");
      expect(payload.user.username).toBe(actor.username);
    }
  });

  test("wallet-login checkout intent binds to the existing synced wallet", async ({
    playwright,
    baseURL,
  }) => {
    const actor = actorByRole(puppetCredentials, "contestant");
    const request = await walletLoginContext(playwright, baseURL, actor);
    try {
      const user = await expectOkJson(await request.get("/api/auth/user"), "wallet session user");
      expect(user.username).toBe(actor.username);

      const wallets = await expectOkJson(await request.get("/api/wallets"), "wallet session wallets");
      expect(
        wallets.some(
          (wallet) =>
            String(wallet.walletAddress).toLowerCase() === actor.walletAddress.toLowerCase()
        ),
        `${actor.username} should retain linked wallet ${actor.walletAddress}`
      ).toBe(true);

      const market = await expectOkJson(
        await request.get("/api/in-app-market?category=arcade"),
        "WTF IAM arcade market"
      );
      const item = (market.items ?? []).find((row) => row?.sku === "arcade-play-card") ||
        (market.items ?? []).find((row) => row?.active !== false && Number(row?.stockQuantity ?? 0) > 0);
      expect(item?.sku, "checkout test market item").toBeTruthy();

      const intent = await expectOkJson(
        await request.post("/api/in-app-market/intents", {
          headers: await csrfHeaders(request),
          data: {
            currency: "wtf",
            walletAddress: actor.walletAddress,
            items: [{ sku: item.sku, quantity: 1 }],
          },
        }),
        "wallet-bound WTF IAM checkout intent"
      );
      expect(intent.intent?.walletAddress).toBe(actor.walletAddress);
      expect(intent.intent?.currency).toBe("wtf");
      expect(intent.intent?.items?.[0]?.sku).toBe(item.sku);
    } finally {
      await request.dispose();
    }
  });

  test("temporary puppet grants unlock casino, arcade, and desktop inventory", async ({
    playwright,
    baseURL,
  }) => {
    for (const actor of puppetCredentials.actors) {
      const request = await actorRequestContext(playwright, baseURL, actor);
      try {
        const casinoStatus = await expectOkJson(
          await request.get("/api/casino/status"),
          `${actor.username} casino status`
        );
        expect(casinoStatus.canEnter, `${actor.username} casino access`).toBe(true);
        expect(casinoStatus.appPass.quantity).toBeGreaterThan(0);
        expect(casinoStatus.membership.active).toBe(true);

        const arcadeStatus = await expectOkJson(
          await request.get("/api/arcade/play-status"),
          `${actor.username} arcade play status`
        );
        expect(
          arcadeStatus.canPlay,
          `${actor.username} should be able to start Arcade games`
        ).toBe(true);
        if (!arcadeStatus.bypass) expect(arcadeStatus.ticketsOwned).toBeGreaterThan(0);

        const desktopMarket = await expectOkJson(
          await request.get("/api/in-app-market?category=desktop_fun"),
          `${actor.username} desktop inventory`
        );
        const inventory = new Map(
          (desktopMarket.inventory ?? []).map((row) => [row.sku, Number(row.quantity || 0)])
        );
        for (const sku of REQUIRED_DESKTOP_TEST_SKUS) {
          expect(inventory.get(sku) ?? 0, `${actor.username} owns ${sku}`).toBeGreaterThan(0);
        }
      } finally {
        await request.dispose();
      }
    }
  });

  test("casino puppets with access can exercise game APIs", async ({
    playwright,
    baseURL,
  }) => {
    const actor = actorByRole(puppetCredentials, "contestant");
    const request = await actorRequestContext(playwright, baseURL, actor);
    try {
      const headers = await csrfHeaders(request);
      const entry = await expectOkJson(
        await request.post("/api/casino/entry", { headers, data: {} }),
        "casino entry"
      );
      expect(entry.ok).toBe(true);

      const buttonState = await expectOkJson(
        await request.get("/api/casino/wtf-button/state"),
        "WTF Button state"
      );
      expect(buttonState.route).toBe("/casino/wtf-button");
      expect(buttonState.tables?.length, "WTF Button exposes playable tables").toBeGreaterThan(0);
      const quote = await expectOkJson(
        await request.post("/api/casino/wtf-button/quote", {
          headers,
          data: { buttonId: "red", priceProtectionMode: "strict", toleranceMutez: "0" },
        }),
        "WTF Button quote"
      );
      expect(quote.ok).toBe(true);
      expect(quote.quote?.buttonId).toBe("red");

      const rugState = await expectOkJson(
        await request.get("/api/casino/rug-pull/state"),
        "Rug Pull state"
      );
      expect(rugState.round || rugState.rules || rugState.snapshot).toBeTruthy();
      const rugJoin = await request.post("/api/casino/rug-pull/join", { headers, data: {} });
      expect([200, 409], `Rug Pull join HTTP ${rugJoin.status()}`).toContain(rugJoin.status());

      const racewayState = await expectOkJson(
        await request.get("/api/casino/guinea-pig-raceway/state"),
        "Raceway state"
      );
      const racerId = racewayState.entrants?.[0]?.id || racewayState.card?.entrants?.[0]?.id;
      expect(racerId, "Raceway exposes a racer id").toBeTruthy();
      const bet = await request.post("/api/casino/guinea-pig-raceway/bet", {
        headers,
        data: { racerId, stakeMicrowtf: "5000000" },
      });
      expect([200, 409], `Raceway bet HTTP ${bet.status()}`).toContain(bet.status());
    } finally {
      await request.dispose();
    }
  });

  test("community Casino practice tables submit, moderate, publish, and play without value", async ({
    playwright,
    baseURL,
  }) => {
    const creator = actorByRole(puppetCredentials, "trusted_creator");
    const admin = actorByRole(puppetCredentials, "admin");
    const player = actorByRole(puppetCredentials, "contestant");
    const creatorRequest = await actorRequestContext(playwright, baseURL, creator);
    const adminRequest = await actorRequestContext(playwright, baseURL, admin);
    const playerRequest = await actorRequestContext(playwright, baseURL, player);
    const testRunId = `live-puppet-casino-practice-${Date.now().toString(36)}`;

    try {
      const creatorHeaders = await csrfHeaders(creatorRequest);
      const adminHeaders = await csrfHeaders(adminRequest);
      const playerHeaders = await csrfHeaders(playerRequest);

      const submitted = await expectOkJson(
        await creatorRequest.post("/api/casino/practice-games", {
          headers: creatorHeaders,
          data: {
            title: `Practice Stars ${testRunId}`,
            summary: "A creator-authored equal-chance practice table.",
            instructions: "Start a practice round and read the stored result.",
            outcomes: ["Sun", "Moon", "Star"],
          },
        }),
        "submit community Casino practice table"
      );
      expect(submitted.game.status).toBe("submitted");
      expect(submitted.game.active).toBe(false);
      expect(submitted.game.practiceOnly).toBe(true);
      expect(submitted.game.wageringEnabled).toBe(false);
      expect(submitted.game.rewardsEnabled).toBe(false);
      expect(submitted.game.currency).toBeNull();

      const creatorView = await expectOkJson(
        await creatorRequest.get("/api/casino/practice-games"),
        "creator practice table status"
      );
      expect(
        creatorView.mine.some((game) => game.id === submitted.game.id),
        "creator can see submitted status"
      ).toBe(true);
      expect(
        creatorView.games.some((game) => game.id === submitted.game.id),
        "unreviewed table remains hidden from practice floor"
      ).toBe(false);

      const unauthorizedReview = await creatorRequest.post(
        `/api/casino/practice-games/${submitted.game.id}/review`,
        {
          headers: creatorHeaders,
          data: { action: "approve", note: "Creator cannot self-approve." },
        }
      );
      expect(unauthorizedReview.status()).toBe(403);

      const adminQueue = await expectOkJson(
        await adminRequest.get("/api/casino/practice-games"),
        "Casino operator practice queue"
      );
      expect(adminQueue.canModerate).toBe(true);
      expect(
        adminQueue.moderationQueue.some((game) => game.id === submitted.game.id),
        "submitted table reaches operator queue"
      ).toBe(true);

      const approved = await expectOkJson(
        await adminRequest.post(`/api/casino/practice-games/${submitted.game.id}/review`, {
          headers: adminHeaders,
          data: { action: "approve", note: "Approved for no-wager community practice." },
        }),
        "approve community Casino practice table"
      );
      expect(approved.game.status).toBe("approved");
      expect(approved.game.active).toBe(true);
      expect(approved.game.moderationNote).toBe("Approved for no-wager community practice.");

      const playerFloor = await expectOkJson(
        await playerRequest.get("/api/casino/practice-games"),
        "member community Casino practice floor"
      );
      const published = playerFloor.games.find((game) => game.id === submitted.game.id);
      expect(published, "approved table is discoverable").toBeTruthy();
      expect(published.creatorName).toBe(creator.displayName || creator.username);
      expect(published.practiceOnly).toBe(true);

      const played = await expectOkJson(
        await playerRequest.post(`/api/casino/practice-games/${published.slug}/play`, {
          headers: playerHeaders,
          data: {},
        }),
        "play community Casino practice table"
      );
      expect(["Sun", "Moon", "Star"]).toContain(played.result.outcomeLabel);
      expect(played.result.practiceOnly).toBe(true);
      expect(played.result.wager).toBeNull();
      expect(played.result.reward).toBeNull();
      expect(played.game.playCount).toBeGreaterThan(published.playCount);

      const events = await expectOkJson(
        await adminRequest.get(
          "/api/admin/challenge-automation/events?eventType=casino.practice_game.played&limit=20"
        ),
        "Casino practice play audit events"
      );
      expect(
        events.events.some(
          (event) =>
            String(event.rawRefId) === String(played.result.playId) &&
            event.metadata?.practiceOnly === true &&
            event.metadata?.wager === null &&
            event.metadata?.reward === null
        ),
        "practice play event records no-value boundary"
      ).toBe(true);
    } finally {
      await creatorRequest.dispose();
      await adminRequest.dispose();
      await playerRequest.dispose();
    }
  });

  test("Calendar participation persists Going, chosen reminders, audit, and clear", async ({
    playwright,
    baseURL,
  }) => {
    const admin = actorByRole(puppetCredentials, "admin");
    const member = actorByRole(puppetCredentials, "contestant");
    const adminRequest = await actorRequestContext(playwright, baseURL, admin);
    const memberRequest = await actorRequestContext(playwright, baseURL, member);
    const runId = `live-puppet-calendar-${Date.now().toString(36)}`;
    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    let eventId = null;

    try {
      const adminHeaders = await csrfHeaders(adminRequest);
      const memberHeaders = await csrfHeaders(memberRequest);
      const created = await expectOkJson(
        await adminRequest.post("/api/calendar/events", {
          headers: adminHeaders,
          data: {
            title: `Calendar participation ${runId}`,
            description: "A disposable event for account-backed participation proof.",
            startsAt: startsAt.toISOString(),
            endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000).toISOString(),
            allDay: false,
            kind: "custom",
            visibility: "public",
            status: "published",
            links: [{ label: "Participation room", url: "https://example.com/calendar-live-proof" }],
          },
        }),
        "create Calendar participation fixture"
      );
      eventId = created.id;
      const eventKey = `wtf:${created.id}:${new Date(created.startsAt).toISOString()}`;

      const saved = await expectOkJson(
        await memberRequest.put("/api/calendar/participations", {
          headers: memberHeaders,
          data: {
            eventKey,
            sourceProvider: "wtf",
            sourceEventId: created.id,
            title: created.title,
            startsAt: new Date(created.startsAt).toISOString(),
            endsAt: created.endsAt ? new Date(created.endsAt).toISOString() : null,
            allDay: created.allDay,
            status: "going",
            reminderEnabled: true,
          },
        }),
        "save Calendar Going plan"
      );
      expect(saved.participation.status).toBe("going");
      expect(saved.participation.reminderEnabled).toBe(true);
      expect(saved.participation.title).toBe(created.title);

      const persisted = await expectOkJson(
        await memberRequest.get("/api/calendar/participations/mine"),
        "reload Calendar plans"
      );
      expect(persisted.some((plan) => plan.id === saved.participation.id)).toBe(true);

      const reminderPlans = await expectOkJson(
        await memberRequest.get("/api/calendar/participations/mine?reminders=1"),
        "load chosen Calendar reminders"
      );
      expect(reminderPlans.map((plan) => plan.id)).toContain(saved.participation.id);

      const reminderOff = await expectOkJson(
        await memberRequest.put("/api/calendar/participations", {
          headers: memberHeaders,
          data: {
            eventKey,
            sourceProvider: "wtf",
            sourceEventId: created.id,
            title: created.title,
            startsAt: new Date(created.startsAt).toISOString(),
            endsAt: created.endsAt ? new Date(created.endsAt).toISOString() : null,
            allDay: created.allDay,
            status: "going",
            reminderEnabled: false,
          },
        }),
        "turn Calendar reminder off"
      );
      expect(reminderOff.participation.reminderEnabled).toBe(false);
      const remindersAfterOff = await memberRequest
        .get("/api/calendar/participations/mine?reminders=1")
        .then((response) => response.json());
      expect(remindersAfterOff.some((plan) => plan.eventKey === eventKey)).toBe(false);

      await expectOkJson(
        await memberRequest.put("/api/calendar/participations", {
          headers: memberHeaders,
          data: {
            eventKey,
            sourceProvider: "wtf",
            sourceEventId: created.id,
            title: created.title,
            startsAt: new Date(created.startsAt).toISOString(),
            endsAt: created.endsAt ? new Date(created.endsAt).toISOString() : null,
            allDay: created.allDay,
            status: "none",
            reminderEnabled: false,
          },
        }),
        "clear Calendar plan"
      );
      const plansAfterClear = await memberRequest
        .get("/api/calendar/participations/mine")
        .then((response) => response.json());
      expect(plansAfterClear.some((plan) => plan.eventKey === eventKey)).toBe(false);

      const updatedEvents = await expectOkJson(
        await adminRequest.get(
          "/api/admin/challenge-automation/events?eventType=calendar.participation.updated&limit=20"
        ),
        "Calendar participation update audit events"
      );
      expect(
        updatedEvents.events.some(
          (event) =>
            String(event.rawRefId) === String(saved.participation.id) &&
            event.metadata?.eventKey === eventKey &&
            event.metadata?.status === "going"
        )
      ).toBe(true);

      const clearedEvents = await expectOkJson(
        await adminRequest.get(
          "/api/admin/challenge-automation/events?eventType=calendar.participation.cleared&limit=20"
        ),
        "Calendar participation clear audit events"
      );
      expect(clearedEvents.events.some((event) => event.rawRefId === eventKey)).toBe(true);
    } finally {
      if (eventId) {
        const adminHeaders = await csrfHeaders(adminRequest).catch(() => ({}));
        await adminRequest.patch(`/api/calendar/events/${eventId}`, {
          headers: adminHeaders,
          data: { status: "cancelled" },
        }).catch(() => undefined);
      }
      await adminRequest.dispose();
      await memberRequest.dispose();
    }
  });

  test("recipient reports a direct message and an operator records a private safety disposition", async ({
    playwright,
    baseURL,
  }) => {
    const contestants = puppetCredentials.actors.filter((actor) => actor.role === "contestant");
    expect(contestants.length, "two account-backed contestants are available").toBeGreaterThanOrEqual(2);
    const sender = contestants[0];
    const recipient = contestants[1];
    const outsider = actorByRole(puppetCredentials, "witness");
    const admin = actorByRole(puppetCredentials, "admin");
    const senderRequest = await actorRequestContext(playwright, baseURL, sender);
    const recipientRequest = await actorRequestContext(playwright, baseURL, recipient);
    const outsiderRequest = await actorRequestContext(playwright, baseURL, outsider);
    const adminRequest = await actorRequestContext(playwright, baseURL, admin);
    const runId = `live-puppet-dm-safety-${Date.now().toString(36)}`;
    const messageContent = `Private safety test message ${runId}`;
    const reportReason = `Recipient safety concern for ${runId}`;
    const reviewNote = `Reviewed account-backed conversation context for ${runId}.`;

    try {
      const senderHeaders = await csrfHeaders(senderRequest);
      const recipientHeaders = await csrfHeaders(recipientRequest);
      const outsiderHeaders = await csrfHeaders(outsiderRequest);
      const adminHeaders = await csrfHeaders(adminRequest);
      const recipientUserId = sessionFor(recipient).user.id;

      const conversation = await expectOkJson(
        await senderRequest.post("/api/messages/dms", {
          headers: senderHeaders,
          data: { targetUserId: recipientUserId },
        }),
        "open direct-message safety conversation"
      );
      const sent = await expectOkJson(
        await senderRequest.post(`/api/messages/dms/${conversation.id}/messages`, {
          headers: senderHeaders,
          data: { content: messageContent },
        }),
        "send direct-message safety fixture"
      );
      expect(sent.senderId).toBe(sessionFor(sender).user.id);

      const beforeRead = await expectOkJson(
        await recipientRequest.get("/api/messages/dms"),
        "recipient unread direct messages"
      );
      expect(
        beforeRead.find((item) => item.id === conversation.id)?.unreadCount,
        "new received message is visibly unread"
      ).toBeGreaterThan(0);

      const receivedMessages = await expectOkJson(
        await recipientRequest.get(`/api/messages/dms/${conversation.id}/messages?limit=100`),
        "recipient reads direct-message conversation"
      );
      expect(receivedMessages.find((message) => message.id === sent.id)?.content).toBe(messageContent);
      const afterRead = await expectOkJson(
        await recipientRequest.get("/api/messages/dms"),
        "recipient read-state persistence"
      );
      expect(afterRead.find((item) => item.id === conversation.id)?.unreadCount).toBe(0);

      const reported = await expectOkJson(
        await recipientRequest.post(
          `/api/messages/dms/${conversation.id}/messages/${sent.id}/report`,
          {
            headers: recipientHeaders,
            data: { reason: reportReason },
          }
        ),
        "recipient privately reports received message"
      );
      expect(reported.report.status).toBe("open");
      expect(reported.report.reason).toBe(reportReason);

      const duplicateReport = await recipientRequest.post(
        `/api/messages/dms/${conversation.id}/messages/${sent.id}/report`,
        { headers: recipientHeaders, data: { reason: `${reportReason} duplicate` } }
      );
      expect(duplicateReport.status()).toBe(409);

      const ownReport = await senderRequest.post(
        `/api/messages/dms/${conversation.id}/messages/${sent.id}/report`,
        { headers: senderHeaders, data: { reason: `${reportReason} own message` } }
      );
      expect(ownReport.status()).toBe(400);

      const outsiderReport = await outsiderRequest.post(
        `/api/messages/dms/${conversation.id}/messages/${sent.id}/report`,
        { headers: outsiderHeaders, data: { reason: `${reportReason} outsider` } }
      );
      expect(outsiderReport.status()).toBe(403);

      const queue = await expectOkJson(
        await adminRequest.get("/api/messages/dm-reports?status=open"),
        "operator direct-message safety queue"
      );
      const queued = queue.find((report) => report.id === reported.report.id);
      expect(queued, "reported message reaches the operator queue").toBeTruthy();
      expect(queued.messageContent).toBe(messageContent);
      expect(queued.reason).toBe(reportReason);
      expect(queued.senderUserId).toBe(sessionFor(sender).user.id);
      expect(queued.reporterUserId).toBe(recipientUserId);

      const reviewed = await expectOkJson(
        await adminRequest.post(`/api/messages/dm-reports/${reported.report.id}/review`, {
          headers: adminHeaders,
          data: { status: "reviewed", note: reviewNote },
        }),
        "operator reviews direct-message safety report"
      );
      expect(reviewed.report.status).toBe("reviewed");
      expect(reviewed.report.reviewNote).toBe(reviewNote);
      expect(reviewed.report.reviewerUserId).toBe(sessionFor(admin).user.id);

      const queueAfterReview = await expectOkJson(
        await adminRequest.get("/api/messages/dm-reports?status=open"),
        "operator queue after review"
      );
      expect(queueAfterReview.some((report) => report.id === reported.report.id)).toBe(false);

      for (const eventType of ["dm.message.reported", "dm.message.report_reviewed"]) {
        const eventPayload = await expectOkJson(
          await adminRequest.get(
            `/api/admin/challenge-automation/events?eventType=${eventType}&limit=20`
          ),
          `${eventType} private audit events`
        );
        const auditEvent = eventPayload.events.find(
          (event) => String(event.rawRefId) === String(reported.report.id)
        );
        expect(auditEvent, `${eventType} audit event exists`).toBeTruthy();
        expect(auditEvent.metadata?.contentIncluded).toBe(false);
        expect(JSON.stringify(auditEvent.metadata)).not.toContain(messageContent);
        expect(JSON.stringify(auditEvent.metadata)).not.toContain(reportReason);
      }
    } finally {
      await senderRequest.dispose();
      await recipientRequest.dispose();
      await outsiderRequest.dispose();
      await adminRequest.dispose();
    }
  });

  test("every Console and Arcade catalog game can start a play session", async ({
    playwright,
    baseURL,
  }) => {
    const actor = actorByRole(puppetCredentials, "contestant");
    const request = await actorRequestContext(playwright, baseURL, actor);
    try {
      const headers = await csrfHeaders(request);
      const consoleCatalog = await expectOkJson(
        await request.get("/api/console/games"),
        "Console catalog"
      );
      const consoleGames = uniqueCatalogSlugs(consoleCatalog);
      expect(consoleGames.length, "Console catalog has games").toBeGreaterThan(0);
      for (const game of consoleGames) {
        const session = await expectOkJson(
          await request.post("/api/console/session", { headers, data: { slug: game.slug } }),
          `Console session ${game.slug}`
        );
        expect(session.game?.slug).toBe(game.slug);
        expect(session.runId, `Console ${game.slug} runId`).toBeTruthy();
        expect(session.ticket, `Console ${game.slug} ticket`).toBeTruthy();
        await expectOkJson(
          await request.post("/api/console/scores", {
            headers,
            data: {
              slug: game.slug,
              runId: session.runId,
              ticket: session.ticket,
              score: 1,
              payload: { source: "live-puppet-playback" },
            },
          }),
          `Console score ${game.slug}`
        );
      }

      const arcadeCatalog = await expectOkJson(
        await request.get("/api/arcade/games"),
        "Arcade catalog"
      );
      const arcadeGames = uniqueCatalogSlugs(arcadeCatalog);
      expect(arcadeGames.length, "Arcade catalog has games").toBeGreaterThan(0);
      for (const game of arcadeGames) {
        const session = await expectOkJson(
          await request.post("/api/arcade/session", { headers, data: { slug: game.slug } }),
          `Arcade session ${game.slug}`
        );
        expect(session.game?.slug).toBe(game.slug);
        if (session.runId && session.ticket) {
          await expectOkJson(
            await request.post("/api/arcade/scores", {
              headers,
              data: {
                slug: game.slug,
                runId: session.runId,
                ticket: session.ticket,
                score: 1,
                payload: { source: "live-puppet-playback" },
              },
            }),
            `Arcade score ${game.slug}`
          );
        }
      }
    } finally {
      await request.dispose();
    }
  });

  test("desktop settings, items, and interaction events persist for puppets", async ({
    playwright,
    baseURL,
  }) => {
    const actor = actorByRole(puppetCredentials, "contestant");
    const request = await actorRequestContext(playwright, baseURL, actor);
    try {
      const headers = await csrfHeaders(request);
      const settings = await expectOkJson(
        await request.put("/api/desktop/settings", {
          headers,
          data: {
            appearance: {
              appearanceStyleKey: "wtf-xp",
              colorSchemeKey: "hotdog-stand",
              desktopColor: "#ff0000",
              windowColor: "#ffff00",
              textColor: "#00ff00",
              backgroundFit: "tile",
              cursorStyle: "paintbrush",
              desktopPhysicsEnabled: true,
              desktopGravityMode: "zero",
              desktopPetEnabled: true,
            },
            iconLayout: {
              arcade: { x: 42, y: 84 },
              casino: { x: 168, y: 84 },
            },
          },
        }),
        "desktop settings update"
      );
      expect(settings.iconLayout.arcade).toMatchObject({ x: 42, y: 84 });

      const persistedSettings = await expectOkJson(
        await request.get("/api/desktop/settings"),
        "desktop settings reload"
      );
      expect(persistedSettings.appearance).toMatchObject({
        appearanceStyleKey: "wtf-xp",
        colorSchemeKey: "hotdog-stand",
        desktopColor: "#ff0000",
        windowColor: "#ffff00",
        textColor: "#00ff00",
        backgroundFit: "tile",
        cursorStyle: "paintbrush",
        desktopPhysicsEnabled: true,
        desktopGravityMode: "zero",
        desktopPetEnabled: true,
      });
      expect(persistedSettings.iconLayout).toMatchObject({
        arcade: { x: 42, y: 84 },
        casino: { x: 168, y: 84 },
      });

      const desktopEvent = await expectOkJson(
        await request.post("/api/desktop/events", {
          headers,
          data: {
            eventType: "desktop.artifact.used",
            objectId: "desktop-vacuum:e2e",
            objectKind: "artifact",
            action: "used",
            metadata: { sku: "desktop-vacuum", source: "live-puppet-playback" },
          },
        }),
        "desktop artifact event"
      );
      expect(desktopEvent.eventId, "desktop event id").toBeTruthy();

      const petAction = await expectOkJson(
        await request.post("/api/desktop/pet/actions", {
          headers,
          data: {
            action: "feed",
            metadata: { source: "live-puppet-playback", itemSku: "pet-food" },
          },
        }),
        "desktop pet feed action"
      );
      expect(petAction.pet).toBeTruthy();
      expect(petAction.event?.id, "desktop pet event id").toBeTruthy();

      const petEvents = await expectOkJson(
        await request.get("/api/desktop/pet/events?limit=20"),
        "desktop pet events reload"
      );
      expect(
        petEvents.events.some((event) => event.id === petAction.event.id && event.action === "feed"),
        "desktop pet feed event persists in event history"
      ).toBeTruthy();
    } finally {
      await request.dispose();
    }
  });

  test("WTF TV public channel stream and embeds resolve for puppets", async ({
    playwright,
    baseURL,
  }) => {
    const actor = actorByRole(puppetCredentials, "contestant");
    const request = await actorRequestContext(playwright, baseURL, actor);
    try {
      const channels = await expectOkJson(
        await request.get("/api/tv/channels?includeMeta=1&limit=10"),
        "TV public channels"
      );
      expect(channels.pagination.total, "public TV channel count").toBeGreaterThan(0);
      const channel = channels.items.find(
        (candidate) => candidate.isPublic && candidate.isActive && candidate.dialNumber
      );
      expect(channel, "public active TV channel with dial").toBeTruthy();

      const mine = await expectOkJson(
        await request.get("/api/tv/channels?mine=1&includeMeta=1&limit=10"),
        "TV owned channels"
      );
      expect(mine.pagination.total, "owned TV channel count").toBeGreaterThanOrEqual(0);

      const now = await expectOkJson(
        await request.get(`/api/tv/channels/${channel.id}/now`),
        "TV now state"
      );
      expect(now.channel.id).toBe(channel.id);
      expect(["schedule", "playlist", "idle"]).toContain(now.mode);
      expect(typeof now.offline).toBe("boolean");

      const stream = await expectOkJson(
        await request.get(`/api/tv/channels/${channel.id}/stream`),
        "TV stream state"
      );
      expect(stream.channel.id).toBe(channel.id);
      expect(Array.isArray(stream.queue), "TV stream queue array").toBeTruthy();
      expect(stream.generatedAt, "TV stream generatedAt").toBeTruthy();

      const byDial = await expectOkJson(
        await request.get(`/api/tv/channels/by-dial/${channel.dialNumber}`),
        "TV public dial lookup"
      );
      expect(byDial.id).toBe(channel.id);

      const embed = await expectOkJson(
        await request.get(`/api/tv/channels/${channel.slug}/embed`),
        "TV embed metadata"
      );
      expect(embed.channel.id).toBe(channel.id);
      expect(embed.embed.html).toContain("<iframe");
      expect(embed.embed.url).toContain(`/embed/tv/${channel.dialNumber}`);

      const embedUrl = new URL(`/embed/tv/${channel.dialNumber}`, baseURL).toString();
      const oembed = await expectOkJson(
        await request.get(`/oembed?format=json&url=${encodeURIComponent(embedUrl)}`),
        "TV oEmbed metadata"
      );
      expect(oembed.provider_name).toBe("WTF TV");
      expect(oembed.html).toContain("<iframe");
    } finally {
      await request.dispose();
    }
  });

  test("gameshow automation challenge completes and records reward proof", async ({
    playwright,
    baseURL,
  }) => {
    const contestant = actorByRole(puppetCredentials, "contestant");
    const admin = actorByRole(puppetCredentials, "admin");
    const contestantRequest = await actorRequestContext(playwright, baseURL, contestant);
    const adminRequest = await actorRequestContext(playwright, baseURL, admin);
    const testRunId = `live-puppet-gameshow-${Date.now().toString(36)}`;
    const objectId = `gameshow-reward-proof:${testRunId}`;
    let challengeId = null;

    try {
      const adminHeaders = await csrfHeaders(adminRequest);
      const contestantHeaders = await csrfHeaders(contestantRequest);
      const contestantUser = await expectOkJson(
        await contestantRequest.get("/api/auth/user"),
        "gameshow contestant session"
      );
      const registry = await expectOkJson(
        await adminRequest.get("/api/admin/challenge-automation/registry"),
        "challenge automation registry"
      );
      expect(registry.triggers.some((trigger) => trigger.key === "desktop.object.clicked")).toBe(
        true
      );
      expect(registry.rewardActions.some((action) => action.key === "award_exp")).toBe(true);

      const challenge = await expectOkJson(
        await adminRequest.post("/api/admin/challenge-automation/challenges", {
          headers: adminHeaders,
          data: {
            title: `Live puppet gameshow reward proof ${testRunId}`,
            description:
              "Temporary live E2E proof that Gameshow automation completes and records reward side effects.",
            status: "active",
            startTime: new Date(Date.now() - 60_000).toISOString(),
            endTime: new Date(Date.now() + 10 * 60_000).toISOString(),
            conditionTree: {
              id: "root",
              type: "group",
              operator: "all",
              children: [
                {
                  id: "clicked-proof-object",
                  type: "event",
                  triggerKey: "desktop.object.clicked",
                  eventTypes: ["desktop.object.clicked"],
                  comparator: "exists",
                  filters: { rawRefId: objectId },
                },
              ],
            },
            rewardActions: [
              {
                key: "award_exp",
                params: { amount: 1, reason: "live_puppet_gameshow_reward" },
              },
              { key: "mark_challenge_complete", params: {} },
            ],
            repeatability: { mode: "once" },
            perUserCompletionLimit: 1,
            metadata: { testRunId, source: "live-puppet-playback" },
          },
        }),
        "create challenge automation proof"
      );
      challengeId = challenge.id;
      expect(challenge.status).toBe("active");

      const desktopEvent = await expectOkJson(
        await contestantRequest.post("/api/desktop/events", {
          headers: contestantHeaders,
          data: {
            eventType: "desktop.object.clicked",
            objectId,
            objectKind: "gameshow-proof",
            action: "clicked",
            metadata: { source: "live-puppet-playback", testRunId },
          },
        }),
        "trigger gameshow reward proof event"
      );
      expect(desktopEvent.eventId, "desktop proof event id").toBeTruthy();

      let proof = null;
      const deadline = Date.now() + 10_000;
      while (!proof && Date.now() < deadline) {
        const detail = await expectOkJson(
          await adminRequest.get(`/api/admin/challenge-automation/challenges/${challengeId}`),
          "challenge automation proof detail"
        );
        const completion = detail.completions.find(
          (row) => row.userId === contestantUser.id && row.rewardStatus === "completed"
        );
        const awardLog = detail.actionLogs.find(
          (row) =>
            row.userId === contestantUser.id &&
            row.completionId === completion?.id &&
            row.actionKey === "award_exp" &&
            row.status === "completed"
        );
        proof =
          completion && awardLog
            ? {
                completionId: completion.id,
                rewardStatus: completion.rewardStatus,
                xpAmount: awardLog.resultJson?.amount,
                xpEventId: awardLog.resultJson?.xpEventId,
              }
            : null;
        if (!proof) await new Promise((resolve) => setTimeout(resolve, 500));
      }
      expect(proof, "challenge completion and EXP reward action log").not.toBeNull();
      expect(proof.rewardStatus).toBe("completed");
      expect(proof.xpAmount).toBe(1);
      expect(proof.xpEventId, "XP event id from reward action").toBeTruthy();

      const xpEvents = await expectOkJson(
        await adminRequest.get(`/api/admin/xp/events?userId=${contestantUser.id}&limit=20`),
        "admin XP events"
      );
      expect(
        xpEvents.some(
          (event) =>
            event.id === proof.xpEventId &&
            event.reason === "live_puppet_gameshow_reward" &&
            event.metadata?.challengeAutomationId === challengeId
        ),
        "XP event carries challenge automation metadata"
      ).toBeTruthy();

      const challengeEvents = await expectOkJson(
        await adminRequest.get(
          `/api/admin/challenge-automation/events?userId=${contestantUser.id}&eventType=desktop.object.clicked&limit=20`
        ),
        "challenge automation system events"
      );
      expect(
        challengeEvents.events.some((event) => event.rawRefId === objectId),
        "desktop proof event is visible in challenge event log"
      ).toBeTruthy();
    } finally {
      if (challengeId) {
        const headers = await csrfHeaders(adminRequest).catch(() => null);
        if (headers) {
          await adminRequest.post(`/api/admin/challenge-automation/challenges/${challengeId}/status`, {
            headers,
            data: { status: "archived" },
          });
        }
      }
      await contestantRequest.dispose();
      await adminRequest.dispose();
    }
  });

  test("canonical side quests seed ten social creative rewards and complete messageboard check-in", async ({
    playwright,
    baseURL,
  }) => {
    const contestant = actorByRole(puppetCredentials, "contestant");
    const admin = actorByRole(puppetCredentials, "admin");
    const contestantRequest = await actorRequestContext(playwright, baseURL, contestant);
    const adminRequest = await actorRequestContext(playwright, baseURL, admin);
    const testRunId = `live-puppet-side-quests-${Date.now().toString(36)}`;
    let channelId = null;

    try {
      const adminHeaders = await csrfHeaders(adminRequest);
      const contestantHeaders = await csrfHeaders(contestantRequest);
      const contestantUser = await expectOkJson(
        await contestantRequest.get("/api/auth/user"),
        "side quest contestant session"
      );

      const seedResult = await expectOkJson(
        await adminRequest.post("/api/admin/challenge-automation/seed-daily-loops", {
          headers: adminHeaders,
          data: {},
        }),
        "seed canonical side quests"
      );
      expect(seedResult.total).toBeGreaterThanOrEqual(10);

      const loopsBefore = await expectOkJson(
        await contestantRequest.get("/api/challenge-automation/daily-loops"),
        "contestant side quests"
      );
      expect(loopsBefore.loops.length).toBeGreaterThanOrEqual(10);
      expect(
        loopsBefore.loops.every(
          (loop) => (loop.rewards?.xp ?? 0) > 0 && (loop.rewards?.wtf ?? 0) > 0
        ),
        "all side quests award XP and WTF"
      ).toBeTruthy();
      const checkIn = loopsBefore.loops.find(
        (loop) => loop.title === "Daily Social Check-In"
      );
      expect(checkIn, "daily messageboard check-in side quest").toBeTruthy();
      expect(checkIn.route).toBe("/messageboard");

      const channel = await expectOkJson(
        await adminRequest.post("/api/board/channels", {
          headers: adminHeaders,
          data: {
            title: `Side quest live proof ${testRunId}`,
            body: "Temporary live E2E channel for the canonical messageboard side quest.",
            channelType: "forum",
            slowModeSeconds: 0,
            viewRoles: [
              "admin",
              "host",
              "cohost",
              "resident_wizard",
              "trusted_creator",
              "contestant",
              "witness",
            ],
            replyRoles: [
              "admin",
              "host",
              "cohost",
              "resident_wizard",
              "trusted_creator",
              "contestant",
              "witness",
            ],
          },
        }),
        "create side quest proof channel"
      );
      channelId = channel.id;

      const message = await expectOkJson(
        await contestantRequest.post(`/api/board/channels/${channelId}/messages`, {
          headers: contestantHeaders,
          data: {
            content: `Side quest live proof ${testRunId}`,
          },
        }),
        "post daily social check-in message"
      );
      expect(message.id, "side quest proof message id").toBeTruthy();

      let readyProof = null;
      const deadline = Date.now() + 12_000;
      while (!readyProof && Date.now() < deadline) {
        const loopsAfter = await expectOkJson(
          await contestantRequest.get("/api/challenge-automation/daily-loops"),
          "side quests after messageboard post"
        );
        const readyCheckIn = loopsAfter.loops.find(
          (loop) =>
            loop.id === checkIn.id &&
            loop.verifiedToday &&
            (loop.claimableToday || loop.claimedToday || loop.completedToday)
        );
        if (readyCheckIn) {
          readyProof = {
            completionKey: loopsAfter.completionKey,
            completedByCount: readyCheckIn.completedByCount,
            alreadyClaimed: Boolean(readyCheckIn.claimedToday || readyCheckIn.completedToday),
          };
        }
        if (!readyProof) await new Promise((resolve) => setTimeout(resolve, 500));
      }

      expect(readyProof, "daily check-in side quest is verified for the current UTC day").not.toBeNull();

      const claimResult = await expectOkJson(
        await contestantRequest.post(`/api/challenge-automation/daily-loops/${checkIn.id}/claim`, {
          headers: contestantHeaders,
          data: {},
        }),
        "claim daily social check-in reward"
      );
      expect(
        claimResult.rewardStatus === "completed" || claimResult.alreadyClaimed,
        "claim completes reward actions or returns the existing same-day claim"
      ).toBeTruthy();

      const loopsClaimed = await expectOkJson(
        await contestantRequest.get("/api/challenge-automation/daily-loops"),
        "side quests after claim"
      );
      expect(
        loopsClaimed.loops.some(
          (loop) =>
            loop.id === checkIn.id &&
            loop.claimedToday &&
            loop.completedToday &&
            loop.completedByCount >= (readyProof?.completedByCount ?? 0)
        ),
        "daily check-in shows claimed for the contestant"
      ).toBeTruthy();

      const detail = await expectOkJson(
        await adminRequest.get(`/api/admin/challenge-automation/challenges/${checkIn.id}`),
        "side quest automation detail"
      );
      const completion = detail.completions.find(
        (row) =>
          row.userId === contestantUser.id &&
          row.completionKey === readyProof?.completionKey &&
          row.rewardStatus === "completed"
      );
      const xpLog = detail.actionLogs.find(
        (row) =>
          row.userId === contestantUser.id &&
          row.completionId === completion?.id &&
          row.actionKey === "award_exp" &&
          row.status === "completed"
      );
      const wtfLog = detail.actionLogs.find(
        (row) =>
          row.userId === contestantUser.id &&
          row.completionId === completion?.id &&
          row.actionKey === "queue_wtf_reward" &&
          row.status === "completed"
      );
      const proof =
        completion && xpLog && wtfLog
          ? {
              completionId: completion.id,
              xpAmount: xpLog.resultJson?.amount,
              rewardLedgerId: wtfLog.resultJson?.rewardLedgerId,
            }
          : null;

      expect(proof, "daily check-in side quest completion and claimed reward action logs").not.toBeNull();
      expect(proof.xpAmount).toBe(15);
      expect(proof.rewardLedgerId, "side quest WTF reward ledger id").toBeTruthy();

      const ledgerRows = await expectOkJson(
        await adminRequest.get("/api/admin/reward-ledger?paid=false"),
        "admin reward ledger"
      );
      expect(
        ledgerRows.some(
          (row) =>
            row.id === proof.rewardLedgerId &&
            row.userId === contestantUser.id &&
            row.reason === "Side quest: Daily Social Check-In"
        ),
        "side quest queued WTF reward ledger row"
      ).toBeTruthy();
    } finally {
      if (channelId) {
        const headers = await csrfHeaders(adminRequest).catch(() => null);
        if (headers) {
          await adminRequest.delete(`/api/board/channels/${channelId}`, {
            headers,
          }).catch(() => null);
        }
      }
      await contestantRequest.dispose();
      await adminRequest.dispose();
    }
  });

  test("gameshow challenge submission, grading, reward claim, and XP leaderboard stay live", async ({
    playwright,
    baseURL,
  }) => {
    const contestant = actorByRole(puppetCredentials, "contestant");
    const admin = actorByRole(puppetCredentials, "admin");
    const contestantRequest = await actorRequestContext(playwright, baseURL, contestant);
    const adminRequest = await actorRequestContext(playwright, baseURL, admin);
    const publicRequest = await playwright.request.newContext({ baseURL });
    const testRunId = `live-puppet-show-ready-${Date.now().toString(36)}`;
    let challengeId = null;

    try {
      const contestantHeaders = await csrfHeaders(contestantRequest);
      const adminHeaders = await csrfHeaders(adminRequest);
      const contestantUser = await expectOkJson(
        await contestantRequest.get("/api/auth/user"),
        "gameshow readiness contestant session"
      );

      const seasons = await expectOkJson(await publicRequest.get("/api/seasons"), "seasons");
      expect(Array.isArray(seasons), "seasons array").toBe(true);
      const activeSeason = seasons.find((season) => season.status === "active") ?? seasons[0];
      if (activeSeason) {
        const rounds = await expectOkJson(
          await publicRequest.get(`/api/rounds?seasonId=${activeSeason.id}`),
          "active season rounds"
        );
        expect(Array.isArray(rounds), "rounds array").toBe(true);
      }

      const challenge = await expectOkJson(
        await adminRequest.post("/api/challenges", {
          headers: adminHeaders,
          data: {
            title: `Live puppet show readiness ${testRunId}`,
            description:
              "Temporary live E2E proof that challenge submission, grading, reward flagging, and XP leaderboard flow work before show start.",
            criteria: "Submit a short readiness proof.",
            rules: "Temporary E2E challenge; safe to complete and close.",
            rewardAmountWtf: 0,
            rewardXp: 7,
            rewardWtfSubdomain: false,
            rewardType: "xp",
            status: "active",
          },
        }),
        "create gameshow readiness challenge"
      );
      challengeId = challenge.id;
      expect(challenge.status).toBe("active");
      expect(challenge.rewardXp).toBe(7);

      const listedChallenges = await expectOkJson(
        await contestantRequest.get("/api/challenges"),
        "contestant challenge list"
      );
      expect(
        listedChallenges.some((row) => row.id === challengeId && row.status === "active"),
        "temporary challenge appears in contestant list"
      ).toBe(true);

      const submission = await expectOkJson(
        await contestantRequest.post(`/api/challenges/${challengeId}/submit`, {
          headers: contestantHeaders,
          data: {
            contentText: `Ready for the show: ${testRunId}`,
            contentUrl: `https://wtfgameshow.app/challenges?proof=${testRunId}`,
          },
        }),
        "submit gameshow readiness challenge"
      );
      expect(submission.challengeId).toBe(challengeId);
      expect(submission.userId).toBe(contestantUser.id);

      const detailWithSubmission = await expectOkJson(
        await contestantRequest.get(`/api/challenges/${challengeId}`),
        "challenge detail after submission"
      );
      expect(
        detailWithSubmission.submissions.some(
          (row) => row.id === submission.id && row.userId === contestantUser.id
        ),
        "submission appears in challenge detail"
      ).toBe(true);
      expect(detailWithSubmission.cockpitProgress, "contestant cockpit progress").toBeTruthy();

      const graded = await expectOkJson(
        await adminRequest.put(`/api/submissions/${submission.id}/grade`, {
          headers: adminHeaders,
          data: {
            grade: "pass",
            feedback: `Live readiness accepted ${testRunId}`,
          },
        }),
        "grade gameshow readiness submission"
      );
      expect(graded.grade).toBe("pass");

      const flags = await expectOkJson(
        await contestantRequest.get("/api/reward-flags/challenges"),
        "challenge reward flags"
      );
      const flag = flags.find(
        (row) =>
          row.challengeId === challengeId &&
          row.submissionId === submission.id &&
          row.claimable &&
          !row.claimed
      );
      expect(flag, "graded challenge creates claimable reward flag").toBeTruthy();
      expect(flag.rewardType).toBe("xp");

      const xpEvents = await expectOkJson(
        await adminRequest.get(`/api/admin/xp/events?userId=${contestantUser.id}&limit=30`),
        "readiness XP events"
      );
      expect(
        xpEvents.some(
          (event) =>
            event.reason === "challenge_submission" &&
            event.metadata?.challengeId === challengeId &&
            event.metadata?.submissionId === submission.id
        ),
        "submission XP event carries challenge metadata"
      ).toBe(true);
      expect(
        xpEvents.some(
          (event) =>
            event.reason === "challenge_grade_reward" &&
            event.metadata?.challengeId === challengeId &&
            event.metadata?.submissionId === submission.id &&
            event.metadata?.grade === "pass"
        ),
        "grade reward XP event carries challenge metadata"
      ).toBe(true);

      const xpLeaderboard = await expectOkJson(
        await publicRequest.get("/api/leaderboard/xp?limit=200"),
        "XP leaderboard"
      );
      const leaderboardRow = xpLeaderboard.find((row) => row.userId === contestantUser.id);
      expect(leaderboardRow, "contestant appears in XP leaderboard").toBeTruthy();
      expect(leaderboardRow.username).toBe(contestantUser.username);
      expect(Number(leaderboardRow.experiencePoints), "contestant XP total").toBeGreaterThan(0);

      const claimed = await expectOkJson(
        await contestantRequest.put(`/api/reward-flags/challenges/${flag.id}/claim`, {
          headers: contestantHeaders,
          data: {},
        }),
        "claim gameshow readiness reward flag"
      );
      expect(claimed.claimed).toBe(true);
      expect(claimed.claimable).toBe(false);
      expect(claimed.claimedAt, "reward flag claimed timestamp").toBeTruthy();

      const flagsAfterClaim = await expectOkJson(
        await contestantRequest.get("/api/reward-flags/challenges"),
        "challenge reward flags after claim"
      );
      expect(
        flagsAfterClaim.some(
          (row) => row.id === flag.id && row.claimed === true && row.claimable === false
        ),
        "claimed reward flag persists"
      ).toBe(true);
    } finally {
      if (challengeId) {
        const headers = await csrfHeaders(adminRequest).catch(() => null);
        if (headers) {
          await adminRequest.put(`/api/challenges/${challengeId}`, {
            headers,
            data: { status: "completed" },
          }).catch(() => null);
        }
      }
      await contestantRequest.dispose();
      await adminRequest.dispose();
      await publicRequest.dispose();
    }
  });

  test("gameshow launch surfaces render active challenge state for contestants", async ({
    browser,
    playwright,
    baseURL,
  }) => {
    const contestant = actorByRole(puppetCredentials, "contestant");
    const admin = actorByRole(puppetCredentials, "admin");
    const contestantRequest = await actorRequestContext(playwright, baseURL, contestant);
    const adminRequest = await actorRequestContext(playwright, baseURL, admin);
    const testRunId = `live-puppet-ui-ready-${Date.now().toString(36)}`;
    const title = `Live puppet UI readiness ${testRunId}`;
    const displayTitle = "Community Warm-Up Challenge";
    let challengeId = null;
    const { context, page } = await actorPage(browser, baseURL, contestant);

    try {
      const adminHeaders = await csrfHeaders(adminRequest);
      const seededLoops = await expectOkJson(
        await adminRequest.post("/api/admin/challenge-automation/seed-daily-loops", {
          headers: adminHeaders,
          data: {},
        }),
        "seed side quests for launch surface"
      );
      expect(seededLoops.total).toBeGreaterThanOrEqual(10);

      const challenge = await expectOkJson(
        await adminRequest.post("/api/challenges", {
          headers: adminHeaders,
          data: {
            title,
            description:
              `A short staging challenge used to prove live launch surfaces during ${testRunId}.`,
            criteria: "Visible on Mission Control and the challenge board.",
            rules: "Temporary E2E challenge; safe to close.",
            rewardAmountWtf: 0,
            rewardXp: 1,
            rewardWtfSubdomain: false,
            rewardType: "xp",
            status: "active",
          },
        }),
        "create gameshow UI readiness challenge"
      );
      challengeId = challenge.id;
      const listedChallenges = await expectOkJson(
        await contestantRequest.get("/api/challenges"),
        "contestant challenge list for launch surface"
      );
      expect(
        listedChallenges.some((row) => row.id === challengeId && row.status === "active"),
        "temporary launch challenge appears in contestant challenge API"
      ).toBe(true);

      await page.goto("/mission-control", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("mission-control")).toBeVisible();
      await expect(page.getByTestId("mission-control-location")).toBeVisible();
      await expect(page.getByTestId("mission-control-wallet")).toBeVisible();
      await expect(page.getByTestId("mission-control-system")).toBeVisible();
      await expect(page.getByTestId("mission-control-next")).toBeVisible();
      await expect(page.getByRole("button", { name: "Challenges" })).toBeVisible();
      await expect(page.getByText(/What counts/i)).toBeVisible();
      await expect(page.getByText(/Side Quests/i).first()).toBeVisible();
      await expect(page.getByText(/Daily Social Check-In/i)).toBeVisible();

      await page.goto("/challenges", { waitUntil: "domcontentloaded" });
      await expect(page.getByText(displayTitle).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "View Details" }).first()).toBeVisible();

      await page.goto("/side-quests", { waitUntil: "domcontentloaded" });
      await expect(page.getByText(/Small daily wins/i)).toBeVisible();
      await expect(page.getByText(/Daily Social Check-In/i).first()).toBeVisible();
      await expect(page.getByText(/players claimed|claimed today|Ready to claim|Open/i).first()).toBeVisible();

    } finally {
      if (challengeId) {
        const headers = await csrfHeaders(adminRequest).catch(() => null);
        if (headers) {
          await adminRequest.put(`/api/challenges/${challengeId}`, {
            headers,
            data: { status: "completed" },
          }).catch(() => null);
        }
      }
      await contestantRequest.dispose();
      await adminRequest.dispose();
      await context.close();
    }
  });

  test("club dues compiles, exposes membership state, and enforces wallet preflight", async ({
    playwright,
    baseURL,
  }) => {
    const contestant = actorByRole(puppetCredentials, "contestant");
    const admin = actorByRole(puppetCredentials, "admin");
    const unlinkedWalletActor = admin.id === contestant.id ? null : admin;
    const contestantRequest = await actorRequestContext(playwright, baseURL, contestant);
    const adminRequest = await actorRequestContext(playwright, baseURL, admin);
    const testRunId = `live-puppet-dues-${Date.now().toString(36)}`;

    try {
      const contestantHeaders = await csrfHeaders(contestantRequest);
      const adminHeaders = await csrfHeaders(adminRequest);

      const contracts = await expectOkJson(
        await contestantRequest.get("/api/club-dues/contracts"),
        "Club Dues public contracts"
      );
      expect(Array.isArray(contracts.contracts), "Club Dues contracts array").toBe(true);
      expect(contracts.contracts.length, "Club Dues has at least one configured contract").toBeGreaterThan(0);
      const liveContract = contracts.contracts.find(
        (contract) => contract.status === "live" && contract.contractAddress && contract.slug
      );
      expect(liveContract, "Club Dues live contract").toBeTruthy();
      expect(liveContract.templateVersion).toBe("wtf-club-dues-v2");
      expect(liveContract.templateVersion).not.toBe("wtf-club-dues-v1");

      const myMemberships = await expectOkJson(
        await contestantRequest.get("/api/club-dues/my"),
        "Club Dues my memberships"
      );
      expect(Array.isArray(myMemberships.memberships), "my memberships array").toBe(true);

      const adminSummary = await expectOkJson(
        await adminRequest.get("/api/admin/club-dues"),
        "Club Dues admin summary"
      );
      expect(Array.isArray(adminSummary.contracts), "admin contracts array").toBe(true);
      expect(Number.isInteger(adminSummary.totals?.members), "admin member total").toBe(true);
      expect(Number.isInteger(adminSummary.totals?.arrears), "admin arrears total").toBe(true);
      expect(Array.isArray(adminSummary.recentDeployments), "admin recent deployments array").toBe(true);
      expect(
        adminSummary.contracts.some((contract) => contract.id === liveContract.id),
        "admin summary includes public live contract"
      ).toBe(true);

      const sweep = await expectOkJson(
        await adminRequest.post("/api/admin/club-dues/arrears/sweep", {
          headers: adminHeaders,
          data: { chainMark: false },
        }),
        "Club Dues arrears dry sweep"
      );
      expect(sweep.ok).toBe(true);
      expect(Number.isInteger(sweep.marked), "arrears marked count").toBe(true);
      expect(Number.isInteger(sweep.warned), "arrears warned count").toBe(true);
      expect(Array.isArray(sweep.chainMarks), "arrears chainMarks array").toBe(true);
      expect(sweep.chainMarks).toHaveLength(0);

      const compile = await expectOkJson(
        await contestantRequest.post("/api/club-dues/templates/compile", {
          headers: contestantHeaders,
          data: {
            name: `Live Puppet Dues ${testRunId}`,
            slug: testRunId,
            description: "Live E2E compile proof only.",
            network: "shadownet",
            treasuryAddress: contestant.walletAddress,
            adminAddress: contestant.walletAddress,
            monthlyDuesMutez: 1000000,
            monthSeconds: 2592000,
            utilityUnitsPerMonth: 1,
            gracePeriodDays: 7,
            arrearsWarningDays: 3,
            membershipSymbol: "LPD",
            metadataUri: null,
            managerWalletId: "club-dues-manager",
          },
        }),
        "Club Dues template compile"
      );
      expect(compile.ok).toBe(true);
      expect(compile.templateVersion).toBe("wtf-club-dues-v2");
      expect(compile.templateVersion).not.toBe("wtf-club-dues-v1");
      expect(compile.sourcePath).toContain("WtfClubDues.py");
      expect(compile.code, "compiled Michelson code").toContain("parameter");
      expect(compile.initialStorage, "compiled initial storage").toBeTruthy();
      expect(compile.workflow, "Kiln workflow result").toBeTruthy();

      if (unlinkedWalletActor) {
        const blockedIntent = await contestantRequest.post(
          `/api/club-dues/contracts/${liveContract.slug}/payment-intents`,
          {
            headers: contestantHeaders,
            data: {
              walletAddress: unlinkedWalletActor.walletAddress,
              months: 1,
              tierId: 0,
              action: 0,
            },
          }
        );
        expect(blockedIntent.status(), "unlinked Club Dues wallet preflight").toBe(400);
        const blockedPayload = await blockedIntent.json().catch(() => ({}));
        expect(blockedPayload.error).toMatch(/not linked/i);
      }

      const intent = await expectOkJson(
        await contestantRequest.post(`/api/club-dues/contracts/${liveContract.slug}/payment-intents`, {
          headers: contestantHeaders,
          data: {
            walletAddress: contestant.walletAddress,
            months: 1,
            tierId: 0,
            action: 0,
          },
        }),
        "Club Dues linked-wallet payment intent"
      );
      expect(intent.ok).toBe(true);
      expect(intent.intent?.walletAddress).toBe(contestant.walletAddress);
      expect(intent.intent?.contractAddress).toBe(liveContract.contractAddress);
      expect(intent.intent?.months).toBe(1);
      expect(intent.intent?.paymentRef, "Club Dues payment reference").toBeTruthy();
    } finally {
      await contestantRequest.dispose();
      await adminRequest.dispose();
    }
  });

  test("media upload, Game Studio builds, and Arcade publication preserve creator work", async ({
    playwright,
    baseURL,
  }) => {
    const creator = puppetCredentials.actors.find(
      (actor) => actor.role === "trusted_creator"
    );
    expect(creator, "trusted creator puppet is seeded").toBeTruthy();
    const request = await actorRequestContext(playwright, baseURL, creator);
    const testRunId = `live-puppet-media-${Date.now().toString(36)}`;
    let mediaId = null;

    try {
      const headers = await csrfHeaders(request);
      const upload = await expectOkJson(
        await request.post("/api/media/upload", {
          headers,
          data: {
            title: `Live puppet media ${testRunId}`,
            description: "Temporary live E2E media preservation proof.",
            mimeType: "image/png",
            originalFilename: `${testRunId}.png`,
            mediaCategory: "image",
            creatorName: creator.displayName || creator.username,
            collectionName: "Live Puppet Proofs",
            fileData: `data:image/png;base64,${ONE_PIXEL_PNG_BASE64}`,
          },
        }),
        "media upload"
      );
      mediaId = upload.id;
      expect(upload.status).toBe("ready");
      expect(upload.uploadStatus).toBe("ready");
      expect(upload.cacheStatus).toBe("cached");
      expect(upload.playbackUrl).toBe(`/api/media/${mediaId}/file`);
      expect(upload.checksumSha256, "media checksum").toBeTruthy();

      const mine = await expectOkJson(
        await request.get("/api/media/mine?category=image"),
        "media image library"
      );
      expect(
        mine.some((item) => item.id === mediaId && item.playbackUrl === upload.playbackUrl),
        "uploaded media appears in image library"
      ).toBe(true);

      const detail = await expectOkJson(
        await request.get(`/api/media/${mediaId}`),
        "media detail"
      );
      expect(detail.id).toBe(mediaId);
      expect(detail.ownerUserId).toBe(upload.ownerUserId);

      const file = await request.get(`/api/media/${mediaId}/file`);
      expect(file.ok(), `media file HTTP ${file.status()}`).toBe(true);
      expect(file.headers()["content-type"]).toContain("image/png");
      expect((await file.body()).length, "served media file bytes").toBeGreaterThan(0);

      const projectBundles = await expectOkJson(
        await request.get("/api/cockpit/project-bundles"),
        "project bundle manifest"
      );
      expect(projectBundles.rootDwelling).toBe("projects");
      expect(Array.isArray(projectBundles.sections), "bundle sections").toBe(true);
      expect(projectBundles.sections.length, "project bundle section count").toBeGreaterThan(0);
      expect(
        projectBundles.sections.some((section) => section.key === "gameStudio"),
        "project bundle includes Game Studio section"
      ).toBe(true);

      const mediaService = await expectOkJson(
        await request.get("/api/cockpit/media-service"),
        "media service contract"
      );
      expect(Array.isArray(mediaService.jobs), "media service jobs").toBe(true);
      expect(mediaService.jobs.every((job) => typeof job.registered === "boolean")).toBe(true);

      const ipfs = await expectOkJson(
        await request.get("/api/cockpit/ipfs-gateways"),
        "IPFS gateway policy"
      );
      expect(Array.isArray(ipfs.gateways), "IPFS gateways").toBe(true);
      expect(ipfs.gateways.length, "IPFS gateway count").toBeGreaterThan(0);

      const templates = await expectOkJson(
        await request.get("/api/game-studio/templates"),
        "Game Studio templates"
      );
      const template = templates.templates?.[0];
      expect(template?.id, "Game Studio template id").toBeTruthy();

      const project = await expectOkJson(
        await request.post("/api/game-studio/projects", {
          headers,
          data: {
            title: `Live Puppet Game ${testRunId}`,
            description: "Temporary live E2E Game Studio build proof.",
            templateId: template.id,
            selectedAssetIds: [],
          },
        }),
        "create Game Studio project"
      );
      expect(project.project?.id, "Game Studio project id").toBeTruthy();
      expect(project.project.templateId).toBe(template.id);

      const build = await expectOkJson(
        await request.post(`/api/game-studio/projects/${project.project.id}/build`, {
          headers,
          data: {},
        }),
        "build Game Studio project"
      );
      expect(build.mimeType).toBe("application/zip");
      expect(build.sizeBytes, "Game Studio zip size").toBeGreaterThan(0);
      expect(build.manifest?.files?.length, "Game Studio bundle manifest files").toBeGreaterThan(0);
      expect(build.build?.checksumSha256, "Game Studio build checksum").toBeTruthy();

      const builds = await expectOkJson(
        await request.get(`/api/game-studio/projects/${project.project.id}/builds`),
        "Game Studio build history"
      );
      expect(
        builds.builds.some((entry) => entry.id === build.build.id),
        "Game Studio build persists in build history"
      ).toBe(true);

      const submitted = await expectOkJson(
        await request.post(`/api/game-studio/projects/${project.project.id}/submit`, {
          headers,
          data: {
            title: `Live Puppet Game ${testRunId}`,
            description: "Creator-built Arcade publication proof.",
            category: "arcade",
          },
        }),
        "submit Game Studio project to Arcade"
      );
      expect(submitted.game?.status).toBe("active");
      expect(submitted.project?.status).toBe("published");
      expect(submitted.game?.builderName).toBe(creator.displayName || creator.username);
      expect(submitted.game?.sourceLabel).toBe("Built with WTF Game Studio");
      expect(submitted.game?.slug, "published Arcade slug").toBeTruthy();

      const arcadeCatalog = await expectOkJson(
        await request.get("/api/arcade/games"),
        "public Arcade catalog"
      );
      const publishedGame = arcadeCatalog.all?.find(
        (game) => game.slug === submitted.game.slug
      );
      expect(publishedGame, "creator game is publicly discoverable").toBeTruthy();
      expect(publishedGame.builderName).toBe(creator.displayName || creator.username);
      expect(publishedGame.sourceLabel).toBe("Built with WTF Game Studio");

      const arcadeDetail = await expectOkJson(
        await request.get(`/api/arcade/games/${submitted.game.slug}`),
        "published Arcade game detail"
      );
      expect(arcadeDetail.game?.builderName).toBe(creator.displayName || creator.username);
      expect(arcadeDetail.game?.sourceLabel).toBe("Built with WTF Game Studio");

      const arcadeStats = await expectOkJson(
        await request.get("/api/arcade/stats"),
        "Arcade creator statistics"
      );
      expect(arcadeStats.creatorGames, "Arcade creator game count").toBeGreaterThan(0);
      expect(arcadeStats.gameStudioGames, "Game Studio Arcade game count").toBeGreaterThan(0);
    } finally {
      if (mediaId) {
        const headers = await csrfHeaders(request).catch(() => null);
        if (headers) {
          await request.delete(`/api/media/${mediaId}`, { headers }).catch(() => null);
        }
      }
      await request.dispose();
    }
  });

  test("public data APIs and MCP agent token lifecycle stay bounded", async ({
    playwright,
    baseURL,
  }) => {
    const contestant = actorByRole(puppetCredentials, "contestant");
    const publicRequest = await playwright.request.newContext({ baseURL });
    const userRequest = await actorRequestContext(playwright, baseURL, contestant);
    const testRunId = `live-puppet-mcp-${Date.now().toString(36)}`;
    let tokenId = null;

    try {
      const links = await expectOkJson(await publicRequest.get("/api/links"), "public links");
      expect(Array.isArray(links), "links array").toBe(true);

      const faq = await expectOkJson(await publicRequest.get("/api/faq"), "public FAQ");
      expect(Array.isArray(faq), "FAQ array").toBe(true);

      const access = await expectOkJson(await publicRequest.get("/api/access"), "public access");
      expect(access, "access payload").toBeTruthy();

      const leaderboard = await expectOkJson(
        await publicRequest.get("/api/leaderboard?limit=100"),
        "public leaderboard"
      );
      expect(Array.isArray(leaderboard.leaderboard ?? leaderboard), "leaderboard rows").toBe(true);

      const gallery = await expectOkJson(
        await userRequest.get("/api/gallery/mine"),
        "authenticated gallery"
      );
      expect(Array.isArray(gallery.items ?? gallery), "gallery rows").toBe(true);

      const unauthenticatedMcp = await publicRequest.post("/mcp", {
        data: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      });
      expect(unauthenticatedMcp.status()).toBe(401);
      const invalidCollectionCall = {
        jsonrpc: "2.0", id: 2, method: "tools/call",
        params: { name: "wtf_build_game_studio_bundle", arguments: { selected_asset_ids: Array(101).fill({}) } },
      };
      const unauthenticatedCollection = await publicRequest.post("/mcp", { data: invalidCollectionCall });
      expect(unauthenticatedCollection.status()).toBe(401);

      const apiDiscovery = await expectOkJson(
        await publicRequest.get("/api/v1"),
        "versioned API discovery"
      );
      expect(apiDiscovery.openapi).toContain("/api/v1/openapi.json");
      const openapi = await expectOkJson(
        await publicRequest.get("/api/v1/openapi.json"),
        "OpenAPI contract"
      );
      expect(openapi.openapi).toBe("3.1.0");
      expect(openapi.paths?.["/api/v1/health"]?.get).toBeTruthy();
      expect((await publicRequest.get("/api/v1/health")).status()).toBe(401);

      const headers = await csrfHeaders(userRequest);
      const beforeTokens = await expectOkJson(
        await userRequest.get("/api/mcp/tokens"),
        "MCP token list before create"
      );
      expect(beforeTokens.endpoint).toContain("/mcp");
      expect(Array.isArray(beforeTokens.tokens), "MCP token rows").toBe(true);

      const created = await expectOkJson(
        await userRequest.post("/api/mcp/tokens", {
          headers,
          data: {
            name: `Live puppet MCP ${testRunId}`,
            scopes: ["public-data:read", "arcade:read", "game-studio:read", "api:read", "api:write"],
          },
        }),
        "create MCP token"
      );
      tokenId = created.tokenRecord?.id;
      expect(created.token, "one-time MCP bearer token").toMatch(/^wtf_mcp_/);
      expect(created.tokenRecord?.tokenPrefix, "stored token prefix").toBeTruthy();
      expect(created.tokenRecord?.revokedAt).toBeFalsy();

      const tools = await publicRequest.post("/mcp", {
        headers: {
          Authorization: `Bearer ${created.token}`,
          Accept: "application/json, text/event-stream",
        },
        data: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      });
      expect(tools.ok(), `MCP tools/list HTTP ${tools.status()} ${await tools.text().catch(() => "")}`).toBe(
        true
      );
      expect(tools.headers()["set-cookie"], "MCP should not set browser cookies").toBeFalsy();
      const toolsBody = await tools.text();
      expect(toolsBody).toContain("wtf_api_request");
      expect(toolsBody).toContain("wtf_search_api_operations");
      expect(toolsBody).toContain("wtf_get_api_operation");
      expect(toolsBody).toContain("wtf_call_api_operation");

      const rejectedCollection = await publicRequest.post("/mcp", {
        headers: { Authorization: `Bearer ${created.token}`, Accept: "application/json, text/event-stream" },
        data: invalidCollectionCall,
      });
      expect(rejectedCollection.ok()).toBe(true);
      const rejectedCollectionBody = await rejectedCollection.text();
      expect(rejectedCollectionBody).toContain('"isError":true');
      expect(rejectedCollectionBody).toContain("maximum of 100 entries");
      expect(rejectedCollection.headers()["set-cookie"]).toBeFalsy();

      const searchApi = await publicRequest.post("/mcp", {
        headers: {
          Authorization: `Bearer ${created.token}`,
          Accept: "application/json, text/event-stream",
        },
        data: {
          jsonrpc: "2.0",
          id: 5,
          method: "tools/call",
          params: {
            name: "wtf_search_api_operations",
            arguments: { query: "health", response_format: "json" },
          },
        },
      });
      expect(searchApi.ok(), `MCP API search HTTP ${searchApi.status()}`).toBe(true);
      const searchApiBody = await searchApi.text();
      expect(searchApiBody).toContain("wtfos_get_api_v1_health");
      expect(searchApiBody).not.toContain("/api/v1/admin/");

      const inspectApi = await publicRequest.post("/mcp", {
        headers: {
          Authorization: `Bearer ${created.token}`,
          Accept: "application/json, text/event-stream",
        },
        data: {
          jsonrpc: "2.0",
          id: 6,
          method: "tools/call",
          params: {
            name: "wtf_get_api_operation",
            arguments: {
              operation_id: "wtfos_get_api_v1_health",
              response_format: "json",
            },
          },
        },
      });
      expect(inspectApi.ok(), `MCP API inspect HTTP ${inspectApi.status()}`).toBe(true);
      expect(await inspectApi.text()).toContain("/api/v1/health");

      const callApi = await publicRequest.post("/mcp", {
        headers: {
          Authorization: `Bearer ${created.token}`,
          Accept: "application/json, text/event-stream",
        },
        data: {
          jsonrpc: "2.0",
          id: 7,
          method: "tools/call",
          params: {
            name: "wtf_call_api_operation",
            arguments: {
              operation_id: "wtfos_get_api_v1_health",
              response_format: "json",
            },
          },
        },
      });
      expect(callApi.ok(), `MCP API operation call HTTP ${callApi.status()}`).toBe(true);
      const callApiBody = await callApi.text();
      expect(callApiBody).toContain("wtfos_get_api_v1_health");
      expect(callApiBody).toContain("/api/v1/health");

      const deniedDesktopWrite = await publicRequest.post("/mcp", {
        headers: {
          Authorization: `Bearer ${created.token}`,
          Accept: "application/json, text/event-stream",
        },
        data: {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "wtf_set_desktop_appearance",
            arguments: { desktop_color: "#008080", response_format: "json" },
          },
        },
      });
      expect(deniedDesktopWrite.ok()).toBe(true);
      expect(await deniedDesktopWrite.text()).toContain(
        "requires MCP scope desktop:write"
      );

      const apiHealth = await publicRequest.get("/api/v1/health", {
        headers: { Authorization: `Bearer ${created.token}` },
      });
      expect(apiHealth.ok(), `versioned API health HTTP ${apiHealth.status()}`).toBe(true);
      expect(apiHealth.headers()["set-cookie"], "versioned API should not set browser cookies").toBeFalsy();
      expect(apiHealth.headers()["x-wtfos-api-version"]).toBe("v1");

      const apiViaMcp = await publicRequest.post("/mcp", {
        headers: {
          Authorization: `Bearer ${created.token}`,
          Accept: "application/json, text/event-stream",
        },
        data: {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "wtf_api_request",
            arguments: { method: "GET", path: "/api/v1", response_format: "json" },
          },
        },
      });
      expect(apiViaMcp.ok(), `MCP API bridge HTTP ${apiViaMcp.status()}`).toBe(true);
      expect(await apiViaMcp.text()).toContain("wtfos-platform-api");

      const revoked = await expectOkJson(
        await userRequest.delete(`/api/mcp/tokens/${tokenId}`, { headers }),
        "revoke MCP token"
      );
      expect(revoked.ok).toBe(true);
      expect(revoked.token?.revokedAt, "MCP token revoked timestamp").toBeTruthy();
      const rejectedAfterRevoke = await publicRequest.post("/mcp", {
        headers: {
          Authorization: `Bearer ${created.token}`,
          Accept: "application/json, text/event-stream",
        },
        data: { jsonrpc: "2.0", id: 4, method: "tools/list", params: {} },
      });
      expect(rejectedAfterRevoke.status()).toBe(401);
      tokenId = null;
    } finally {
      if (tokenId) {
        const headers = await csrfHeaders(userRequest).catch(() => null);
        if (headers) {
          await userRequest.delete(`/api/mcp/tokens/${tokenId}`, { headers }).catch(() => null);
        }
      }
      await publicRequest.dispose();
      await userRequest.dispose();
    }
  });

  test("W groupchat mirror is read-only and exposes config-source diagnostics", async ({
    playwright,
    baseURL,
  }) => {
    const contestant = actorByRole(puppetCredentials, "contestant");
    const admin = actorByRole(puppetCredentials, "admin");
    const contestantRequest = await actorRequestContext(playwright, baseURL, contestant);
    const adminRequest = await actorRequestContext(playwright, baseURL, admin);
    try {
      const groupchatResponse = await contestantRequest.get("/api/w/groupchat");
      const digestMode = groupchatResponse.status() === 410;
      if (digestMode) {
        const payload = await groupchatResponse.json().catch(() => ({}));
        expect(payload.mode).toBe("digest");
        expect(payload.error).toMatch(/read-only Tezos digest mode/i);
        const capabilities = await expectOkJson(
          await contestantRequest.get("/api/w/capabilities"),
          "W digest capabilities"
        );
        expect(capabilities.mode).toBe("digest");
        expect(capabilities.canDm).toBe(false);
      } else {
        const groupchat = await expectOkJson(groupchatResponse, "W groupchat mirror");
        expect(groupchat.readonly).toBe(true);
        expect(groupchat.canWrite).toBe(false);
        expect(groupchat.diagnostics?.note).toMatch(/Personal X inboxes are disabled/i);
        expect(groupchat.diagnostics?.groupchatConfig?.source).toBeTruthy();
      }

      const headers = await csrfHeaders(contestantRequest);
      const blockedSend = await contestantRequest.post("/api/w/groupchat/messages", {
        headers,
        data: { text: "live puppet should never send from W" },
      });
      expect(
        digestMode ? [404, 410] : [410],
        `W groupchat send HTTP ${blockedSend.status()}`
      ).toContain(blockedSend.status());

      const blockedPersonalDm = await contestantRequest.post("/api/w/direct-messages", {
        headers,
        data: { recipientId: "0", text: "disabled" },
      });
      expect(blockedPersonalDm.status()).toBe(410);

      const diagnosticsResponse = await adminRequest.get("/api/w/dm-diagnostics");
      if (digestMode) {
        expect([200, 404, 410], `W digest diagnostics HTTP ${diagnosticsResponse.status()}`).toContain(
          diagnosticsResponse.status()
        );
      } else {
        const diagnostics = await expectOkJson(diagnosticsResponse, "W DM diagnostics");
        expect(diagnostics.groupchatConfig?.source).toBeTruthy();
        expect(diagnostics.env?.groupchatConfigSource).toBe(diagnostics.groupchatConfig.source);
      }
    } finally {
      await contestantRequest.dispose();
      await adminRequest.dispose();
    }
  });

  for (const fixture of ROUTE_FIXTURES) {
    test(`route with puppet: ${fixture.domain} / ${fixture.subdomain} / ${fixture.pattern}`, async ({
      browser,
      baseURL,
    }) => {
      const actor = fixture.adminOnly
        ? actorByRole(puppetCredentials, "admin")
        : puppetCredentials.actors.find((entry) => entry.role === "contestant") ||
          puppetCredentials.actors[0];
      const { context, page } = await actorPage(
        browser,
        baseURL,
        fixture.auth || fixture.adminOnly ? actor : null
      );

      const errors = [];
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });

      try {
        await page.goto(fixture.path, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(300);
        await expect(page.locator("body")).toBeVisible();
        await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
        expect(fatalErrors(errors), `fatal browser errors on ${fixture.path}`).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }

  for (const workflow of DOMAIN_WORKFLOWS) {
    test(`domain workflow with puppet: ${workflow.name}`, async ({
      browser,
      playwright,
      baseURL,
    }) => {
      if (workflow.name === "social post to reward automation loop") {
        test.setTimeout(180_000);
      }
      const registryActor = actorForWorkflow(workflow);
      const actor = actorById(puppetCredentials, registryActor.id);
      const request = await actorRequestContext(playwright, baseURL, actor);
      const { context, page } = await actorPage(browser, baseURL, actor);

      try {
        for (const probe of workflow.apiProbes.filter((entry) => !skipExternalOauthProbe(entry))) {
          const response = await apiProbe(request, probe);
          expect(
            apiProbeAccepted(response, probe),
            await apiProbeFailureMessage(actor, probe, response)
          ).toBeTruthy();
        }

        for (const route of workflow.routes) {
          await page.goto(route, { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(250);
          await expect(page.locator("body")).toBeVisible();
          await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
        }
      } finally {
        await request.dispose();
        await context.close();
      }
    });
  }

  test("watched guides persist per puppet account and the viewer roster requires user management", async ({
    playwright,
    baseURL,
  }) => {
    const contestant = actorByRole(puppetCredentials, "contestant");
    const witness = actorByRole(puppetCredentials, "witness");
    const admin = actorByRole(puppetCredentials, "admin");
    const contestantRequest = await actorRequestContext(playwright, baseURL, contestant);
    const witnessRequest = await actorRequestContext(playwright, baseURL, witness);
    const adminRequest = await actorRequestContext(playwright, baseURL, admin);
    const guestRequest = await playwright.request.newContext({ baseURL });

    try {
      const witnessBefore = await expectOkJson(
        await witnessRequest.get("/api/profile/watched-videos"),
        "witness watch history before contestant completion"
      );
      const headers = await csrfHeaders(contestantRequest);
      const completed = await expectOkJson(
        await contestantRequest.post("/api/profile/watched-videos", {
          headers,
          data: { videoId: "paul/intro" },
        }),
        "contestant intro completion"
      );
      expect(completed.videoId).toBe("paul/intro");
      expect(completed.watchedAt).toBeTruthy();
      const replay = await expectOkJson(
        await contestantRequest.post("/api/profile/watched-videos", {
          headers,
          data: { videoId: "paul/intro" },
        }),
        "idempotent intro replay"
      );
      expect(replay.watchedAt).toBe(completed.watchedAt);

      const contestantHistory = await expectOkJson(
        await contestantRequest.get("/api/profile/watched-videos"),
        "contestant watch history"
      );
      expect(contestantHistory.videos.filter((item) => item.videoId === "paul/intro"))
        .toHaveLength(1);
      const witnessAfter = await expectOkJson(
        await witnessRequest.get("/api/profile/watched-videos"),
        "witness watch history after contestant completion"
      );
      expect(witnessAfter).toEqual(witnessBefore);

      const freshLogin = await playwright.request.newContext({ baseURL });
      try {
        const returningUser = await loginAs(freshLogin, contestant);
        expect(returningUser.hasSeenIntroVideo).toBe(true);
        const hydratedUser = await expectOkJson(
          await freshLogin.get("/api/auth/user"),
          "returning contestant auth user"
        );
        expect(hydratedUser.hasSeenIntroVideo).toBe(true);
      } finally {
        await freshLogin.dispose();
      }

      const rosterPath = "/api/admin/video-watch-roster?videoId=paul%2Fintro";
      expect((await contestantRequest.get(rosterPath)).status()).toBe(403);
      expect((await guestRequest.get(rosterPath)).status()).toBe(401);
      const roster = await expectOkJson(await adminRequest.get(rosterPath), "intro viewer roster");
      expect(roster.viewers).toEqual(expect.arrayContaining([
        expect.objectContaining({ userId: contestant.userId, username: contestant.username }),
      ]));
      const badId = await contestantRequest.post("/api/profile/watched-videos", {
        headers,
        data: { videoId: "invalid/live-puppet-probe" },
      });
      expect(badId.status()).toBe(400);
    } finally {
      await contestantRequest.dispose();
      await witnessRequest.dispose();
      await adminRequest.dispose();
      await guestRequest.dispose();
    }
  });
});
