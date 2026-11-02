#!/usr/bin/env node
/** Rebuild the self-hosted Paul tutorial series from one episode source. */
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const slugIndex = args.indexOf("--slug");
const slug = slugIndex < 0 ? null : args[slugIndex + 1];
if (slugIndex >= 0 && (!slug || slug.startsWith("--"))) throw new Error("--slug needs an episode slug");
const offline = flag("--offline");
const childArgs = slug ? ["--slug", slug] : [];
const work = path.join(root, "output/paul-tutorials");

function run(command, parameters, options = {}) {
  const result = spawnSync(command, parameters, { cwd: root, stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
}

if (!flag("--skip-site-build")) run("npm", ["run", "build"]);
if (!flag("--reuse-narration")) {
  const inheritedPython = path.join(root, "output/paul-welcome/.venv/bin/python");
  const localPython = path.join(work, ".venv/bin/python");
  let python = existsSync(inheritedPython) ? inheritedPython : localPython;
  if (!existsSync(python)) {
    if (offline) throw new Error("Kokoro narrator environment is unavailable offline");
    run("uv", ["venv", "--python", "3.12", path.join(work, ".venv")]);
    python = localPython;
  }
  const dependencyCheck = spawnSync(python, ["-c", "import kokoro, soundfile, en_core_web_sm"],
    { cwd: root, stdio: "ignore" });
  if (dependencyCheck.status !== 0) {
    if (offline) throw new Error("Kokoro narrator packages are unavailable offline");
    run("uv", ["pip", "install", "--python", python, "kokoro==0.9.4", "soundfile",
      "en-core-web-sm @ https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl"]);
  }
  run(python, ["scripts/faq-tutorials/narrate.py", "--catalog", "scripts/paul-tutorials/episodes.json",
    "--output", "output/paul-tutorials/narration", ...childArgs],
  { env: { ...process.env, ...(offline ? { HF_HUB_OFFLINE: "1" } : {}) } });
}
if (!flag("--reuse-recording")) run(process.execPath, [path.join(here, "record.mjs"), ...childArgs]);
run(process.execPath, [path.join(here, "compose.mjs"), ...childArgs]);
if (!slug) run(process.execPath, [path.join(here, "validate.mjs")]);
if (!flag("--skip-site-build")) run("npm", ["run", "build"]);
