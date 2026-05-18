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

const EXTERNAL_OAUTH_PATTERNS = [
  /\/api\/auth\/twitter/i,
  /\/api\/auth\/twitter-oauth2/i,
  /\/api\/auth\/discord/i,
  /\/api\/auth\/github/i,
  /\/api\/auth\/google/i,
];

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
  const options = probe.body ? { data: probe.body } : undefined;
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
    "npx",
    [
      "tsx",
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

  test("platform-keyring wallets can sign wallet-login challenges for every puppet", async ({
    request,
  }) => {
    for (const actor of puppetCredentials.actors) {
      const challengeResponse = await request.post("/api/auth/wallet/challenge", {
        data: { walletAddress: actor.walletAddress },
      });
      expect(challengeResponse.ok(), `wallet challenge for ${actor.id}`).toBeTruthy();
      const challenge = await challengeResponse.json();
      const message = `WTF Gameshow Login\n\nNonce: ${challenge.nonce}`;
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
      const entry = await expectOkJson(
        await request.post("/api/casino/entry", { data: {} }),
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
      const rugJoin = await request.post("/api/casino/rug-pull/join", { data: {} });
      expect([200, 409], `Rug Pull join HTTP ${rugJoin.status()}`).toContain(rugJoin.status());

      const racewayState = await expectOkJson(
        await request.get("/api/casino/guinea-pig-raceway/state"),
        "Raceway state"
      );
      const racerId = racewayState.entrants?.[0]?.id || racewayState.card?.entrants?.[0]?.id;
      expect(racerId, "Raceway exposes a racer id").toBeTruthy();
      const bet = await request.post("/api/casino/guinea-pig-raceway/bet", {
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
      const consoleCatalog = await expectOkJson(
        await request.get("/api/console/games"),
        "Console catalog"
      );
      const consoleGames = uniqueCatalogSlugs(consoleCatalog);
      expect(consoleGames.length, "Console catalog has games").toBeGreaterThan(0);
      for (const game of consoleGames) {
        const session = await expectOkJson(
          await request.post("/api/console/session", { data: { slug: game.slug } }),
          `Console session ${game.slug}`
        );
        expect(session.game?.slug).toBe(game.slug);
        expect(session.runId, `Console ${game.slug} runId`).toBeTruthy();
        expect(session.ticket, `Console ${game.slug} ticket`).toBeTruthy();
        await expectOkJson(
          await request.post("/api/console/scores", {
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
          await request.post("/api/arcade/session", { data: { slug: game.slug } }),
          `Arcade session ${game.slug}`
        );
        expect(session.game?.slug).toBe(game.slug);
        if (session.runId && session.ticket) {
          await expectOkJson(
            await request.post("/api/arcade/scores", {
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
      const settings = await expectOkJson(
        await request.put("/api/desktop/settings", {
          data: {
            appearance: { wallpaper: "grid", accentColor: "#41f5b4" },
            iconLayout: {
              arcade: { x: 42, y: 84 },
              casino: { x: 168, y: 84 },
              "desktop-settings": { x: 294, y: 84 },
            },
          },
        }),
        "desktop settings update"
      );
      expect(settings.iconLayout.arcade).toMatchObject({ x: 42, y: 84 });

      await expectOkJson(
        await request.post("/api/desktop/events", {
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

      const petAction = await expectOkJson(
        await request.post("/api/desktop/pet/actions", {
          data: {
            action: "feed",
            metadata: { source: "live-puppet-playback", itemSku: "pet-food" },
          },
        }),
        "desktop pet feed action"
      );
      expect(petAction.pet).toBeTruthy();
    } finally {
      await request.dispose();
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
      const groupchat = await expectOkJson(
        await contestantRequest.get("/api/w/groupchat"),
        "W groupchat mirror"
      );
      expect(groupchat.readonly).toBe(true);
      expect(groupchat.canWrite).toBe(false);
      expect(groupchat.diagnostics?.note).toMatch(/Personal X inboxes are disabled/i);
      expect(groupchat.diagnostics?.groupchatConfig?.source).toBeTruthy();

      const headers = await csrfHeaders(contestantRequest);
      const blockedSend = await contestantRequest.post("/api/w/groupchat/messages", {
        headers,
        data: { text: "live puppet should never send from W" },
      });
      expect(blockedSend.status()).toBe(410);

      const blockedPersonalDm = await contestantRequest.post("/api/w/direct-messages", {
        headers,
        data: { recipientId: "0", text: "disabled" },
      });
      expect(blockedPersonalDm.status()).toBe(410);

      const diagnostics = await expectOkJson(
        await adminRequest.get("/api/w/dm-diagnostics"),
        "W DM diagnostics"
      );
      expect(diagnostics.groupchatConfig?.source).toBeTruthy();
      expect(diagnostics.env?.groupchatConfigSource).toBe(diagnostics.groupchatConfig.source);
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
