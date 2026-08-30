import { execFile } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { test, expect } from "@playwright/test";
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
    data: { walletAddress: actor.walletAddress },
  });
  const challenge = await expectOkJson(challengeResponse, `wallet challenge ${actor.id}`);
  const message = `WTF OS Login\n\nNonce: ${challenge.nonce}`;
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
      await contactAdmin.click();
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
        data: { walletAddress: actor.walletAddress },
      });
      expect(challengeResponse.ok(), `wallet challenge for ${actor.id}`).toBeTruthy();
      const challenge = await challengeResponse.json();
      const message = `WTF OS Login\n\nNonce: ${challenge.nonce}`;
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
      expect(liveContract.templateVersion).toBe("wtf-club-dues-v1");

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
      expect(compile.templateVersion).toBe("wtf-club-dues-v1");
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

  test("media upload, project bundles, and Game Studio builds preserve creator work", async ({
    playwright,
    baseURL,
  }) => {
    const creator =
      puppetCredentials.actors.find((actor) => actor.role === "trusted_creator") ||
      actorByRole(puppetCredentials, "contestant");
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
});
