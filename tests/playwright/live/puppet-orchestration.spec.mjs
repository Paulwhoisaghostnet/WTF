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

const EXTERNAL_OAUTH_PATTERNS = [
  /\/api\/auth\/twitter/i,
  /\/api\/auth\/twitter-oauth2/i,
  /\/api\/auth\/discord/i,
  /\/api\/auth\/github/i,
  /\/api\/auth\/google/i,
];

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
    puppetCredentials = await readPuppetCredentials();
    expect(puppetCredentials.actors).toHaveLength(12);

    await mkdir(authCacheDir, { recursive: true });

    for (const actor of puppetCredentials.actors) {
      const session = await bootstrapActorSession(playwright, baseURL, actor);
      expect(session.user.id).toBe(actor.userId);
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
      expect(user.id).toBe(actor.userId);

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
            response.ok(),
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
