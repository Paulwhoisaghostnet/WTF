#!/usr/bin/env node

import assert from "node:assert/strict";
import { access, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { _electron as electron } from "playwright";

const executablePath = process.env.PASTA_SUITE_DESKTOP_EXECUTABLE;
const screenshotPath = process.env.PASTA_SUITE_DESKTOP_SCREENSHOT;
assert.ok(executablePath, "Set PASTA_SUITE_DESKTOP_EXECUTABLE to the packaged Pasta Suite executable");
await access(executablePath);

const profilePath = path.join(os.tmpdir(), `pasta-suite-artifact-smoke-${process.pid}`);
await rm(profilePath, { recursive: true, force: true });

const electronApp = await electron.launch({
  executablePath,
  args: [`--user-data-dir=${profilePath}`],
});

const runtimeErrors = [];
try {
  const page = await electronApp.firstWindow();
  page.on("pageerror", (error) => runtimeErrors.push(`page: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(`console: ${message.text()}`);
  });

  await page.waitForLoadState("domcontentloaded");
  await assert.doesNotReject(() => page.getByRole("heading", { name: "Colander", exact: true }).waitFor());
  assert.equal(await page.locator(".tool-card").count(), 8, "packaged suite should expose all eight tools");
  assert.equal(await page.locator("#project-network").inputValue(), "shadownet");
  assert.equal(await page.locator("#contract-network").inputValue(), "shadownet");
  if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true });

  await page.locator("#project-title").fill("Installer artifact proof");
  await page.locator("#project-tool").selectOption("ch-ease");
  await page.locator("#create-project").click();
  await page.locator("#project-list").getByText("Installer artifact proof", { exact: true }).waitFor();

  const popupPromise = electronApp.waitForEvent("window");
  await page.locator('.tool-card[data-tool="ch-ease"] button').click();
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded");
  assert.match(popup.url(), /\/creation-tools\/ch-ease\/index\.html/);
  await popup.getByRole("heading", { name: /CH-EASE/i }).first().waitFor();

  assert.deepEqual(runtimeErrors, [], runtimeErrors.join("\n"));
  console.log(
    JSON.stringify({
      ok: true,
      executablePath,
      title: await page.title(),
      bundledTools: 8,
      colanderProjectCreated: true,
      firstRunNetwork: "shadownet",
      chEaseOpened: true,
      screenshotPath: screenshotPath || null,
    }),
  );
} finally {
  await electronApp.close();
  await rm(profilePath, { recursive: true, force: true });
}
