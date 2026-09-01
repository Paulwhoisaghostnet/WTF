import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { actorById, readPuppetCredentials } from "../../e2e/puppets/runtime.mjs";

const execFileAsync = promisify(execFile);
const authCacheDir = path.resolve(".e2e", "gamma-board-auth");

const GAMMA_BOARD = [
  {
    actorId: "bert",
    persona: "new Tezos user",
    routes: ["/gallery", "/tools/broot", "/w", "/leaderboard"],
  },
  {
    actorId: "ernie",
    persona: "collector",
    routes: ["/gallery", "/marketplace", "/arcade", "/leaderboard"],
  },
  {
    actorId: "elmo",
    persona: "witness",
    routes: ["/gallery", "/leaderboard", "/w", "/live/r/wtf-live"],
  },
  {
    actorId: "bigbird",
    persona: "host",
    routes: ["/w", "/wim", "/live/r/wtf-live", "/skywire?standalone=1"],
  },
  {
    actorId: "thecount",
    persona: "admin Count",
    routes: ["/admin", "/side-quests", "/challenges", "/leaderboard"],
  },
  {
    actorId: "snuffaluffagus",
    persona: "cohost",
    routes: ["/side-quests", "/challenges", "/w", "/live/r/wtf-live"],
  },
  {
    actorId: "grover",
    persona: "resident wizard",
    routes: ["/gallery", "/arcade", "/w", "/leaderboard"],
  },
  {
    actorId: "cookiemonster",
    persona: "creator",
    routes: ["/studio", "/tools/broot", "/tools/macaroni", "/ipfs-pinning"],
  },
  {
    actorId: "oscar",
    persona: "witness",
    routes: ["/gallery", "/tools/broot", "/wim", "/leaderboard"],
  },
  {
    actorId: "abbycadabby",
    persona: "community curator",
    routes: ["/w", "/wim", "/live/r/wtf-live", "/skywire?standalone=1"],
  },
  {
    actorId: "zoe",
    persona: "contestant",
    routes: ["/gallery", "/arcade", "/w", "/leaderboard"],
  },
  {
    actorId: "rosita",
    persona: "contestant",
    routes: ["/gallery", "/marketplace", "/live/r/wtf-live", "/leaderboard"],
  },
];

let puppetCredentials;

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

async function walletLogin(playwright, baseURL, actor) {
  const request = await playwright.request.newContext({ baseURL });
  const challenge = await expectOkJson(
    await request.post("/api/auth/wallet/challenge", {
      data: { walletAddress: actor.walletAddress, action: "login" },
    }),
    `wallet challenge ${actor.id}`
  );
  const message = challenge.message;
  const signed = await signChallenge(actor, message);
  expect(signed.walletAddress).toBe(actor.walletAddress);

  const payload = await expectOkJson(
    await request.post("/api/auth/wallet/verify", {
      data: {
        walletAddress: actor.walletAddress,
        publicKey: signed.publicKey,
        signature: signed.signature,
        nonce: challenge.nonce,
      },
    }),
    `wallet verify ${actor.id}`
  );
  expect(payload.action).toBe("login");
  expect(payload.user.username).toBe(actor.username);

  const user = await expectOkJson(await request.get("/api/auth/user"), `auth user ${actor.id}`);
  expect(user.username).toBe(actor.username);

  const wallets = await expectOkJson(await request.get("/api/wallets"), `wallets ${actor.id}`);
  expect(
    wallets.some(
      (wallet) =>
        String(wallet.walletAddress).toLowerCase() === actor.walletAddress.toLowerCase()
    ),
    `${actor.username} should expose linked puppet wallet ${actor.walletAddress}`
  ).toBe(true);

  const storageState = path.join(authCacheDir, `${actor.id}.json`);
  await request.storageState({ path: storageState });
  await request.dispose();
  return storageState;
}

function pathnamePattern(route) {
  return new RegExp(`${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[?#])`);
}

test.describe("Gamma 12/12 wallet puppet approval board", () => {
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    puppetCredentials = await readPuppetCredentials();
    await mkdir(authCacheDir, { recursive: true });
    expect(GAMMA_BOARD).toHaveLength(12);
    expect(new Set(GAMMA_BOARD.map((member) => member.actorId)).size).toBe(12);
  });

  for (const boardMember of GAMMA_BOARD) {
    test(`${boardMember.actorId} ${boardMember.persona} wallet puppet votes APPROVE by launching Gamma stations`, async ({
      playwright,
      browser,
      baseURL,
    }) => {
      const actor = actorById(puppetCredentials, boardMember.actorId);
      const storageState = await walletLogin(playwright, baseURL, actor);
      const context = await browser.newContext({ baseURL, storageState });
      await context.addInitScript(
        ({ walletAddress }) => {
          window.localStorage.setItem(
            "wtf:wallet-session",
            JSON.stringify({ address: walletAddress, providerName: "gamma-puppet" })
          );
        },
        { walletAddress: actor.walletAddress }
      );
      const page = await context.newPage();
      try {
        await page.goto("/gamma", { waitUntil: "domcontentloaded" });
        await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
        await expect(page.locator("[data-gamma-peer]")).toHaveCount(5);
        await expect(page.locator("[data-gamma-cabinet]")).toHaveCount(15);
        await expect(page.locator("[data-gamma-comms-action]")).toHaveCount(5);

        for (const route of boardMember.routes) {
          await page.goto("/gamma", { waitUntil: "domcontentloaded" });
          const launch = page.locator(`[data-gamma-launch="${route}"]`).first();
          await expect(launch, `${boardMember.persona} launch ${route}`).toBeVisible();
          await launch.click();
          await expect(page).toHaveURL(pathnamePattern(route));
          await expect(page.locator("body")).toBeVisible();
          await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
        }
      } finally {
        await context.close();
      }
    });
  }
});
