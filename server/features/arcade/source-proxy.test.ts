import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "@playwright/test";

process.env.DATABASE_URL ||= "postgresql://wtf:wtf@localhost:5432/wtf_test";

test("source compatibility SDK provides storage fallbacks in sandboxed Arcade frames", async (t) => {
  const { ARCADE_SOURCE_COMPAT_SDK } = await import("./source-proxy");
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());

  const page = await browser.newPage();
  const messages: string[] = [];
  page.on("console", (msg) => messages.push(`${msg.type()}: ${msg.text()}`));

  await page.setContent(`<iframe id="game" sandbox="allow-scripts"></iframe>`);
  const frameHtml = `
    <!doctype html>
    <script type="module">
      ${ARCADE_SOURCE_COMPAT_SDK.replace(/<\/script/gi, "<\\/script")}
    </script>
    <script type="module">
      try {
        localStorage.setItem("best", "42");
        sessionStorage.setItem("run", "ok");
        console.log("storage-ok:" + localStorage.getItem("best") + ":" + sessionStorage.getItem("run"));
      } catch (err) {
        console.error("storage-failed:" + err.name + ":" + err.message);
      }
    </script>
  `;

  await page.locator("#game").evaluate((iframe, html) => {
    iframe.setAttribute("srcdoc", html);
  }, frameHtml);
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll("iframe")).length > 0
  );
  await page.waitForTimeout(300);

  assert.ok(
    messages.includes("log: storage-ok:42:ok"),
    `expected storage fallback success, got:\n${messages.join("\n")}`
  );
  assert.equal(
    messages.some((message) => message.includes("storage-failed")),
    false,
    `unexpected storage failure:\n${messages.join("\n")}`
  );
});
