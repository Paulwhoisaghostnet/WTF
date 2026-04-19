#!/usr/bin/env node
/**
 * install-games.mjs
 *
 * Processes zip files dropped into `public/games/` into playable cartridges
 * that the in-app Console can launch.
 *
 * For each source zip it:
 *   1. Detects the game type
 *       - `html5`           — static `index.html` at root (or one level deep)
 *       - `vite-project`    — a Vite/React source project (needs build)
 *       - `dos-game`        — ready-to-run DOS game (EXE + data files)
 *       - `dos-installer`   — DOS shareware installer (INSTALL.EXE + .SHR)
 *   2. Produces `public/games/installed/<slug>/index.html` that the Console
 *      loads into an iframe directly (no client-side zip extraction needed).
 *   3. Writes `public/games/installed/manifest.json` listing every cartridge
 *      so `server/routes/console.ts` can surface them in the library.
 *
 * js-dos (v8) is used as the DOS emulator and is vendored locally into
 * `public/games/_vendor/js-dos/` on first run (no external runtime
 * dependencies after the initial download).
 *
 * Usage:
 *   node scripts/install-games.mjs            # incremental (default)
 *   node scripts/install-games.mjs --force    # rebuild everything
 *   node scripts/install-games.mjs --offline  # fail if vendor download is needed
 */

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
// Raw cartridge inputs live outside `public/` so the ~1.5 MiB of source
// zips don't get shipped to every browser via `dist/public/`.
const SOURCES_DIR = path.join(PROJECT_ROOT, "games-sources");
const GAMES_DIR = path.join(PROJECT_ROOT, "public", "games");
const INSTALLED_DIR = path.join(GAMES_DIR, "installed");
const VENDOR_DIR = path.join(GAMES_DIR, "_vendor", "js-dos");
const OVERRIDES_PATH = path.join(SOURCES_DIR, "games-config.json");

const args = new Set(process.argv.slice(2));
const FORCE = args.has("--force");
const OFFLINE = args.has("--offline");

/* ------------------------------------------------------------------ */
/*  js-dos v8 vendor                                                   */
/* ------------------------------------------------------------------ */

const JSDOS_ASSETS = [
  { rel: "js-dos.js", url: "https://v8.js-dos.com/latest/js-dos.js" },
  { rel: "js-dos.css", url: "https://v8.js-dos.com/latest/js-dos.css" },
  {
    rel: "emulators/emulators.js",
    url: "https://v8.js-dos.com/latest/emulators/emulators.js",
  },
  {
    rel: "emulators/wdosbox.js",
    url: "https://v8.js-dos.com/latest/emulators/wdosbox.js",
  },
  {
    rel: "emulators/wdosbox.wasm",
    url: "https://v8.js-dos.com/latest/emulators/wdosbox.wasm",
  },
  {
    rel: "emulators/wlibzip.js",
    url: "https://v8.js-dos.com/latest/emulators/wlibzip.js",
  },
  {
    rel: "emulators/wlibzip.wasm",
    url: "https://v8.js-dos.com/latest/emulators/wlibzip.wasm",
  },
];

async function ensureVendor() {
  // Vendor assets are cached in-repo — we never redownload just because
  // `--force` was set for cartridge rebuilds.  If you actually want fresh
  // vendor copies, run `rm -rf public/games/_vendor/js-dos`.
  mkdirSync(path.join(VENDOR_DIR, "emulators"), { recursive: true });
  for (const asset of JSDOS_ASSETS) {
    const dest = path.join(VENDOR_DIR, asset.rel);
    if (existsSync(dest) && statSync(dest).size > 0) continue;
    if (OFFLINE) {
      throw new Error(
        `Missing vendor asset ${asset.rel} and --offline was set. ` +
          `Remove --offline or pre-populate ${VENDOR_DIR}.`
      );
    }
    process.stdout.write(`[vendor] fetching ${asset.rel} ... `);
    const res = await fetch(asset.url);
    if (!res.ok) {
      throw new Error(`Failed to fetch ${asset.url}: ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, buf);
    process.stdout.write(`${buf.length} bytes\n`);
  }
}

/* ------------------------------------------------------------------ */
/*  Shell helpers                                                      */
/* ------------------------------------------------------------------ */

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, {
    stdio: opts.quiet ? "pipe" : "inherit",
    ...opts,
  });
  if (r.status !== 0) {
    const detail =
      r.stderr && r.stderr.length ? `\n${r.stderr.toString()}` : "";
    throw new Error(
      `${cmd} ${cmdArgs.join(" ")} exited with ${r.status}${detail}`
    );
  }
  return r;
}

function mustHave(cmd) {
  const r = spawnSync(cmd, ["--version"], { stdio: "pipe" });
  if (r.status !== 0 && r.error) {
    throw new Error(
      `Required CLI \`${cmd}\` is not installed or not in PATH.`
    );
  }
}

function walkFiles(dir, rel = "") {
  const out = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const r = path.posix.join(rel, e.name);
    if (e.isDirectory()) {
      out.push(...walkFiles(full, r));
    } else if (e.isFile()) {
      out.push(r);
    }
  }
  return out;
}

function unzipInto(zipPath, destDir) {
  mkdirSync(destDir, { recursive: true });
  run("unzip", ["-oq", zipPath, "-d", destDir]);
}

function resolveContentRoot(extractedDir) {
  const top = readdirSync(extractedDir, { withFileTypes: true });
  if (
    top.length === 1 &&
    top[0].isDirectory() &&
    !top[0].name.startsWith("__MACOSX")
  ) {
    return path.join(extractedDir, top[0].name);
  }
  return extractedDir;
}

/* ------------------------------------------------------------------ */
/*  Classification                                                     */
/* ------------------------------------------------------------------ */

function classify(contentRoot) {
  const files = walkFiles(contentRoot);
  const lower = files.map((f) => f.toLowerCase());

  // Vite / React source project (needs build step)
  if (files.includes("package.json")) {
    try {
      const pkg = JSON.parse(
        readFileSync(path.join(contentRoot, "package.json"), "utf-8")
      );
      const deps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      };
      if (deps.vite || deps["@vitejs/plugin-react"]) {
        return { type: "vite-project", files, pkg };
      }
    } catch {
      // fall through
    }
  }

  // Prebuilt HTML5 cartridge: index.html at root
  if (files.includes("index.html")) {
    return { type: "html5", files };
  }

  // DOS installer: INSTALL.EXE + .SHR (Apogee shareware self-extractor)
  const hasInstaller = lower.some((f) => /(^|\/)install\.exe$/.test(f));
  const hasShr = lower.some((f) => /\.shr$/.test(f));
  if (hasInstaller && hasShr) {
    return { type: "dos-installer", files };
  }

  // DOS game: .EXE + DOS-era data files
  const exes = files.filter((f) => /\.exe$/i.test(f));
  const dosDataRe = /\.(ck[0-9]|gfx|aud|mus|dat|lev|tmp|ba[0-9]|cfg|sav|mid)$/i;
  const dosData = files.filter((f) => dosDataRe.test(f));
  if (exes.length > 0 && dosData.length > 0) {
    const mainExe =
      exes.find((e) => !/install\.exe$/i.test(e)) || exes[0];
    return { type: "dos-game", files, exes, mainExe };
  }

  return { type: "unknown", files };
}

/* ------------------------------------------------------------------ */
/*  Install handlers                                                   */
/* ------------------------------------------------------------------ */

function rmInstalled(slug) {
  rmSync(path.join(INSTALLED_DIR, slug), { recursive: true, force: true });
}

function installHtml5(contentRoot, slug) {
  const dest = path.join(INSTALLED_DIR, slug);
  rmInstalled(slug);
  mkdirSync(dest, { recursive: true });
  cpSync(contentRoot, dest, { recursive: true });
}

// js-dos v8 treats `url:` and `dosboxConf:` as mutually exclusive — when a
// bundle URL is passed, the wrapper-side `dosboxConf` option is silently
// ignored and the ZIP is handed to DOSBox as-is.  DOSBox then aborts with
// `Broken bundle, .jsdos/dosbox.conf not found` unless the metadata is
// baked into the archive.  We therefore write `.jsdos/dosbox.conf` and
// `.jsdos/jsdos.json` into the temp content dir BEFORE zipping, and the
// wrapper below just passes `url:` (the bundle is fully self-describing).
function buildDosWrapper(slug, title, options = {}) {
  const noteHtml = options.noteHtml
    ? `<div class="wtf-note">${options.noteHtml}</div>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="../../_vendor/js-dos/js-dos.css" />
  <style>
    html, body { margin:0; padding:0; width:100%; height:100%; background:#000; color:#ccc; font-family: "Courier New", monospace; overflow:hidden; }
    #host { position:absolute; inset:0; }
    .wtf-note {
      position:absolute; left:0; right:0; bottom:0;
      background: rgba(10, 10, 30, 0.85);
      color:#7b8fff; padding:6px 10px; font-size:11px; letter-spacing:1px;
      border-top:1px solid #2a2a50; z-index:20; text-align:center;
      pointer-events:none;
    }
    .wtf-err {
      position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
      color:#ff6; padding:24px; font-size:13px; line-height:1.4; text-align:center;
    }
  </style>
</head>
<body>
  <div id="host"></div>
  ${noteHtml}
  <script src="../../_vendor/js-dos/js-dos.js"></script>
  <script>
    (function () {
      var host = document.getElementById("host");
      try {
        if (typeof window.Dos !== "function") {
          throw new Error("js-dos bundle failed to load");
        }
        window.__wtfDos = window.Dos(host, {
          url: "./game.jsdos",
          pathPrefix: "../../_vendor/js-dos/emulators/",
          kiosk: true,
          autoStart: true,
          noCursor: false
        });
      } catch (err) {
        host.innerHTML = '<div class="wtf-err">DOS emulator failed to start: ' +
          (err && err.message ? err.message : String(err)) + '</div>';
      }
    })();
  </script>
</body>
</html>`;
}

// Bake the js-dos v8 cartridge metadata into `contentRoot` so the resulting
// `.jsdos` ZIP is a valid self-contained bundle.  The emulator looks for
// these at runtime inside the archive; without them DOSBox throws
// `Broken bundle, .jsdos/dosbox.conf not found`.
function writeJsdosMetadata(contentRoot, dosboxConf) {
  const dir = path.join(contentRoot, ".jsdos");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "dosbox.conf"), dosboxConf);
  writeFileSync(
    path.join(dir, "jsdos.json"),
    JSON.stringify({ version: "js-dos-v8" }, null, 2)
  );
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function dosPathFromPosix(rel) {
  // Given 'CKeen2/KEEN2.EXE' -> { dir: 'CKeen2', exe: 'KEEN2.EXE' }
  // DOS uses backslashes and UPPERCASE conventions.
  const norm = rel.replace(/\\/g, "/");
  const dir = path.posix.dirname(norm);
  const exe = path.posix.basename(norm);
  return {
    dir: dir === "." ? "" : dir.replace(/\//g, "\\"),
    exe,
  };
}

function installDosGame(contentRoot, slug, title, classification) {
  const dest = path.join(INSTALLED_DIR, slug);
  rmInstalled(slug);
  mkdirSync(dest, { recursive: true });

  const { dir, exe } = dosPathFromPosix(classification.mainExe);
  const cdLine = dir ? `cd ${dir}` : "";
  const dosboxConf = [
    "[cpu]",
    "cycles=fixed 5000",
    "core=auto",
    "",
    "[autoexec]",
    "@echo off",
    "mount c .",
    "c:",
    cdLine,
    exe,
    "exit",
    "",
  ]
    .filter((line) => line !== "")
    .concat([""])
    .join("\n");

  // Write the js-dos metadata into the content root FIRST so it ends up
  // inside the ZIP — the emulator aborts otherwise (see writeJsdosMetadata).
  writeJsdosMetadata(contentRoot, dosboxConf);

  // Build the .jsdos bundle (zip of everything under contentRoot, including
  // the `.jsdos/` metadata dir we just wrote).
  const bundlePath = path.join(dest, "game.jsdos");
  run("zip", ["-rq", bundlePath, "."], { cwd: contentRoot });

  writeFileSync(path.join(dest, "index.html"), buildDosWrapper(slug, title));
}

function installDosInstaller(contentRoot, slug, title) {
  const dest = path.join(INSTALLED_DIR, slug);
  rmInstalled(slug);
  mkdirSync(dest, { recursive: true });

  // The .SHR archives use a proprietary Apogee/id format that we cannot
  // extract outside of the real INSTALL.EXE, so the cartridge drops the
  // user into the installer on launch. js-dos sessions are ephemeral,
  // so this is re-run each play — clunky but functional until someone
  // pre-extracts the shareware archive.
  const dosboxConf = [
    "[cpu]",
    "cycles=fixed 5000",
    "core=auto",
    "",
    "[autoexec]",
    "@echo off",
    "mount c .",
    "c:",
    "cls",
    "echo WTF CONSOLE -- SHAREWARE INSTALLER",
    "echo.",
    "echo Press ENTER at each prompt to accept the defaults.",
    "echo When the installer finishes, type the game name (e.g. KEEN)",
    "echo at the DOS prompt to play.",
    "echo.",
    "INSTALL.EXE",
    "",
  ].join("\n");

  writeJsdosMetadata(contentRoot, dosboxConf);

  const bundlePath = path.join(dest, "game.jsdos");
  run("zip", ["-rq", bundlePath, "."], { cwd: contentRoot });

  writeFileSync(
    path.join(dest, "index.html"),
    buildDosWrapper(slug, title, {
      noteHtml:
        "FIRST RUN: press ENTER through the installer, then type the game command at the DOS prompt.",
    })
  );
}

function installViteProject(contentRoot, slug) {
  const dest = path.join(INSTALLED_DIR, slug);
  rmInstalled(slug);
  mkdirSync(dest, { recursive: true });

  console.log(`  └ running npm install (this may take a minute)`);
  run("npm", ["install", "--no-audit", "--no-fund"], { cwd: contentRoot });

  console.log(`  └ running npm run build`);
  run("npm", ["run", "build"], { cwd: contentRoot });

  const distDir = path.join(contentRoot, "dist");
  if (!existsSync(distDir)) {
    throw new Error(`Vite project ${slug} produced no dist/ output`);
  }
  cpSync(distDir, dest, { recursive: true });
}

/* ------------------------------------------------------------------ */
/*  Metadata / slugs                                                   */
/* ------------------------------------------------------------------ */

function slugify(filename) {
  return filename
    .toLowerCase()
    .replace(/\.zip$/, "")
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "cartridge";
}

function titleFromFilename(filename) {
  return filename
    .replace(/\.zip$/i, "")
    .replace(/[_]+/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadOverrides() {
  if (!existsSync(OVERRIDES_PATH)) return {};
  try {
    const raw = readFileSync(OVERRIDES_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    console.warn(
      `[install-games] ignoring malformed ${path.relative(PROJECT_ROOT, OVERRIDES_PATH)}: ${err.message}`
    );
    return {};
  }
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

async function main() {
  mustHave("zip");
  mustHave("unzip");

  const overrides = loadOverrides();

  await ensureVendor();

  mkdirSync(INSTALLED_DIR, { recursive: true });

  // Discover all *.zip at the top of games-sources/ (raw inputs the user
  // drops in).  These live outside `public/` so Vite doesn't copy them to
  // `dist/public/` — only the processed `installed/` output ships.
  const candidates = existsSync(SOURCES_DIR)
    ? readdirSync(SOURCES_DIR, { withFileTypes: true })
        .filter((e) => e.isFile() && /\.zip$/i.test(e.name))
        .map((e) => e.name)
        .sort()
    : [];

  if (candidates.length === 0) {
    console.log(
      `No zip files found in ${path.relative(PROJECT_ROOT, SOURCES_DIR)}/. Nothing to install.`
    );
    writeManifest([]);
    return;
  }

  const manifest = [];
  const failures = [];

  for (const zipName of candidates) {
    const zipPath = path.join(SOURCES_DIR, zipName);
    const override = overrides[zipName] || {};
    const slug = (override.slug && String(override.slug).trim()) || slugify(zipName);
    const title = override.title || titleFromFilename(zipName);
    const description = override.description || "";
    const installedIndex = path.join(INSTALLED_DIR, slug, "index.html");
    const zipMtime = statSync(zipPath).mtimeMs;
    const installedMtime = existsSync(installedIndex)
      ? statSync(installedIndex).mtimeMs
      : 0;

    const upToDate = !FORCE && installedMtime > zipMtime;

    console.log(`${upToDate ? "=" : "*"} ${zipName}  →  installed/${slug}`);

    if (upToDate) {
      const entry = readManifestEntry(slug);
      if (entry) {
        manifest.push({ ...entry, ...override, title, description: description || entry.description });
        continue;
      }
    }

    const tmpDir = mkdtempSync(path.join(os.tmpdir(), `wtf-game-${slug}-`));
    try {
      unzipInto(zipPath, tmpDir);
      const contentRoot = resolveContentRoot(tmpDir);
      const c = classify(contentRoot);

      if (c.type === "unknown") {
        console.warn(
          `  ! ${zipName}: cannot classify (no index.html, no DOS exe, no Vite project). Skipping.`
        );
        failures.push({ zipName, reason: "unknown-type" });
        continue;
      }

      switch (c.type) {
        case "html5":
          installHtml5(contentRoot, slug);
          break;
        case "vite-project":
          installViteProject(contentRoot, slug);
          break;
        case "dos-game":
          installDosGame(contentRoot, slug, title, c);
          break;
        case "dos-installer":
          installDosInstaller(contentRoot, slug, title);
          break;
      }

      manifest.push({
        id: `local:${slug}`,
        slug,
        title,
        description:
          description ||
          defaultDescriptionForType(c.type, c) ||
          titleFromFilename(zipName),
        artifactUri: `/games/installed/${slug}/index.html`,
        thumbnailUri: override.thumbnailUri || null,
        kind: c.type,
        source: zipName,
      });
    } catch (err) {
      console.error(`  x ${zipName}: ${err.message}`);
      failures.push({ zipName, reason: err.message });
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  // Preserve the existing extracted demo cartridges (pixel-runner, space-blocks)
  // so they keep working even if the user never drops their zips into /games/.
  registerLegacyCartridges(manifest, overrides);

  // Garbage-collect any stale `installed/<slug>/` folders whose source zip was
  // removed (or whose slug was renamed via games-config.json).  Anything not
  // listed in the manifest and not owned by one of the legacy demos is junk.
  const keepSlugs = new Set(manifest.map((m) => m.slug));
  if (existsSync(INSTALLED_DIR)) {
    for (const entry of readdirSync(INSTALLED_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (keepSlugs.has(entry.name)) continue;
      const stalePath = path.join(INSTALLED_DIR, entry.name);
      rmSync(stalePath, { recursive: true, force: true });
      console.log(`- removed stale installed/${entry.name}`);
    }
  }

  writeManifest(manifest);

  console.log("");
  console.log(`Installed ${manifest.length} cartridge(s).`);
  if (failures.length) {
    console.log(`${failures.length} failure(s):`);
    for (const f of failures) console.log(`  - ${f.zipName}: ${f.reason}`);
  }
}

function defaultDescriptionForType(type, c) {
  if (type === "dos-game") return "DOS classic, emulated via js-dos.";
  if (type === "dos-installer")
    return "Shareware installer — run INSTALL once per session, then play.";
  if (type === "vite-project") return "Interactive web app, built to a single bundle.";
  if (type === "html5") return "HTML5 cartridge.";
  return "";
}

function readManifestEntry(slug) {
  const p = path.join(INSTALLED_DIR, "manifest.json");
  if (!existsSync(p)) return null;
  try {
    const raw = JSON.parse(readFileSync(p, "utf-8"));
    const list = Array.isArray(raw) ? raw : raw?.cartridges || [];
    return list.find((c) => c.slug === slug) || null;
  } catch {
    return null;
  }
}

function registerLegacyCartridges(manifest, overrides) {
  const legacy = [
    {
      slug: "pixel-runner",
      title: "Pixel Runner",
      description:
        "Jump over obstacles in this endless runner. How far can you go?",
      dir: "pixel-runner",
    },
    {
      slug: "space-blocks",
      title: "Space Blocks",
      description:
        "Classic falling block puzzle. Clear lines, level up, chase high scores.",
      dir: "space-blocks",
    },
  ];
  for (const cart of legacy) {
    if (manifest.some((m) => m.slug === cart.slug)) continue;
    const indexPath = path.join(GAMES_DIR, cart.dir, "index.html");
    if (!existsSync(indexPath)) continue;
    const override = overrides[`${cart.slug}.legacy`] || {};
    manifest.push({
      id: `local:${cart.slug}`,
      slug: cart.slug,
      title: override.title || cart.title,
      description: override.description || cart.description,
      artifactUri: `/games/${cart.dir}/index.html`,
      thumbnailUri: override.thumbnailUri || null,
      kind: "html5",
      source: `(extracted) ${cart.dir}/`,
    });
  }
}

function writeManifest(list) {
  mkdirSync(INSTALLED_DIR, { recursive: true });
  const body = {
    generatedAt: new Date().toISOString(),
    cartridges: list.sort((a, b) => a.title.localeCompare(b.title)),
  };
  writeFileSync(
    path.join(INSTALLED_DIR, "manifest.json"),
    JSON.stringify(body, null, 2) + "\n"
  );
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
