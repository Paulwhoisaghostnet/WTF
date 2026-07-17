import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import archiveModule from "../apps/pasta-suite-desktop/src/site-archive.cjs";

const { exactSiteSlug, installStoredSite, listStoredSites, parseStoredZip, removeStoredSite, resolveHostedSitePath } = archiveModule;

function storedEntry(name, content) {
  const fileName = Buffer.from(name, "utf8");
  const data = Buffer.from(content, "utf8");
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(fileName.length, 26);
  return Buffer.concat([header, fileName, data]);
}

test("native Colander accepts the stored ZIP shape emitted by Pasta site exporters", () => {
  const archive = Buffer.concat([
    storedEntry("index.html", "<!doctype html><title>Pasta</title>"),
    storedEntry("css/site.css", "body { color: tomato; }"),
  ]);
  const files = parseStoredZip(archive);
  assert.deepEqual(files.map((file) => file.path), ["index.html", "css/site.css"]);
  assert.match(files[0].data.toString("utf8"), /Pasta/);
});

test("native Colander rejects traversal and packages without an entry page", () => {
  assert.throws(() => parseStoredZip(storedEntry("../escape.html", "nope")), /unsafe path/);
  assert.throws(() => parseStoredZip(storedEntry("nested\\..\\escape.html", "nope")), /unsafe path/);
  assert.throws(() => parseStoredZip(storedEntry("/absolute.html", "nope")), /unsafe path/);
  assert.throws(() => parseStoredZip(storedEntry("site.txt", "no index")), /must contain index\.html/);
});

test("native Colander rejects duplicate paths and bounded-package violations", () => {
  assert.throws(
    () => parseStoredZip(Buffer.concat([storedEntry("index.html", "one"), storedEntry("index.html", "two")])),
    /duplicate paths/,
  );
  assert.throws(() => parseStoredZip(storedEntry("index.html", "oversized"), { maxBytes: 4 }), /hosting limits/);
  assert.throws(
    () => parseStoredZip(Buffer.concat([storedEntry("index.html", "one"), storedEntry("site.js", "two")]), { maxFiles: 1 }),
    /hosting limits/,
  );
});

test("native Colander resolves hosted assets without encoded traversal", () => {
  const root = path.join(os.tmpdir(), "pasta-sites-path-proof");
  assert.equal(
    resolveHostedSitePath(root, "/sites/spaghetti-proof/js/site.js"),
    path.join(root, "spaghetti-proof", "js", "site.js"),
  );
  assert.equal(resolveHostedSitePath(root, "/sites/spaghetti-proof/%2e%2e/escape.txt"), null);
  assert.equal(resolveHostedSitePath(root, "/sites/spaghetti-proof/%E0%A4%A"), null);
});

test("native Colander requires an exact managed slug for site removal", () => {
  assert.equal(exactSiteSlug("spaghetti-proof"), "spaghetti-proof");
  for (const unsafe of ["../spaghetti-proof", "/absolute", "Spaghetti", "spaghetti/proof", ".hidden", ""]) {
    assert.throws(() => exactSiteSlug(unsafe), /invalid site slug/);
  }
});

test("native Colander installs and lists a complete site atomically", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pasta-sites-install-"));
  try {
    const archive = Buffer.concat([
      storedEntry("index.html", "<!doctype html><title>Pasta</title>"),
      storedEntry("js/site.js", "window.PASTA_SITE = true;"),
    ]);
    const installed = await installStoredSite(archive, {
      root,
      appId: "Spaghetti Studio",
      title: "Collector page",
      now: new Date("2026-07-15T21:00:00.000Z"),
    });
    assert.match(installed.slug, /^spaghetti-studio-/);
    assert.equal(installed.url, `/sites/${installed.slug}/`);
    assert.match(await readFile(path.join(root, installed.slug, "index.html"), "utf8"), /Pasta/);
    assert.equal(resolveHostedSitePath(root, installed.url), path.join(root, installed.slug, "index.html"));
    const sites = await listStoredSites(root);
    assert.equal(sites.length, 1);
    assert.equal(sites[0].title, "Collector page");
    assert.equal(sites[0].fileCount, 2);
    const removed = await removeStoredSite(root, installed.slug);
    assert.equal(removed.slug, installed.slug);
    assert.equal(removed.title, "Collector page");
    await assert.rejects(access(path.join(root, installed.slug)), /ENOENT/);
    assert.deepEqual(await listStoredSites(root), []);
    await assert.rejects(removeStoredSite(root, installed.slug), /not found/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
