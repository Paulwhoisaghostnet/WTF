#!/usr/bin/env node
/** Build Paul's self-hosted welcome MP4, WebVTT captions, and poster. */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build as compileComponent } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const storyboardPath = path.join(here, "storyboard.json");
const sourceGhost = path.join(root, "public/desktop/paulwhoisaclippy.svg");
const work = path.join(root, "output/paul-welcome");
const target = path.join(root, "public/desktop");
const offline = process.argv.includes("--offline");
const width = 1280;
const height = 720;
const fps = 30;
let reggieSpriteMarkup = "";

async function renderActualReggieSprite() {
  const compiled = path.join(work, "HamsterPixelSprite.mjs");
  await compileComponent({
    entryPoints: [path.join(root, "client/src/components/layout/HamsterPixelSprite.tsx")],
    outfile: compiled,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    logLevel: "silent",
  });
  const { HamsterPixelSprite } = await import(pathToFileURL(compiled).href);
  const palette = {
    fur: "#e8a33c", belly: "#ffe9c4", ear: "#d98b2b",
    spot: "#8a5a1b", accent: "#2f6fd6",
  };
  const svg = renderToStaticMarkup(createElement(HamsterPixelSprite,
    { alive: true, moving: false, scheme: palette, width: 112, height: 74 }));
  const match = /^<svg[^>]*>([\s\S]*)<\/svg>$/.exec(svg);
  if (!match) throw new Error("Could not render the real Reggie sprite");
  const body = match[1].replace(/<style>[\s\S]*?<\/style>/, "")
    .replaceAll("var(--ham-fur)", palette.fur)
    .replaceAll("var(--ham-belly)", palette.belly)
    .replaceAll("var(--ham-ear)", palette.ear)
    .replaceAll("var(--ham-spot)", palette.spot)
    .replaceAll("var(--ham-accent)", palette.accent);
  return `<svg x="126" y="503" width="112" height="74" viewBox="0 0 96 64" shape-rendering="crispEdges">${body}</svg>`;
}

function run(command, args, extra = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...extra });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
}

function probeDuration(file) {
  return Number(execFileSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file,
  ], { encoding: "utf8" }).trim());
}

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function rect(x, y, w, h, fill, rx = 12, stroke = "none") {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}"/>`;
}

function label(x, y, value, size = 22, color = "#EAF4F3", weight = 600, spacing = 0) {
  return `<text x="${x}" y="${y}" fill="${color}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" letter-spacing="${spacing}">${escapeXml(value)}</text>`;
}

function visual(scene) {
  const a = scene.accent;
  switch (scene.visual) {
    case "hello":
      return `${rect(108, 492, 632, 102, "#21364A", 16, a)}
        ${label(138, 530, "HELLO FROM YOUR DESKTOP", 24, a, 700, 2)}
        ${label(138, 566, "Click around. Come back anytime.", 25, "#EAF4F3", 500)}`;
    case "icons": {
      const names = ["ARCADE", "CREATE", "EVENTS", "TALK"];
      return names.map((name, i) => {
        const x = 108 + i * 160;
        return `${rect(x, 498, 145, 98, "#22334E", 14, "#70849B")}
          ${rect(x + 52, 511, 41, 38, i === 0 ? a : "#9ECBD4", 8)}
          ${label(x + 15, 578, name, 17, "#F4F8F8", 700, 1)}`;
      }).join("");
    }
    case "stuffs":
      return `${rect(108, 514, 632, 80, "#263047", 14, "#66778D")}
        ${rect(125, 528, 188, 52, a, 8)}${label(149, 563, "Stuffs", 27, "#172334", 700)}
        ${rect(328, 531, 110, 46, "#3A4A62", 6)}${rect(450, 531, 110, 46, "#3A4A62", 6)}
        ${rect(572, 531, 110, 46, "#3A4A62", 6)}`;
    case "windows":
      return `${rect(113, 483, 280, 90, "#24334D", 10, "#70849B")}
        ${rect(128, 497, 250, 21, a, 3)}${label(137, 515, "MOVE ME", 14, "#1B253C", 700, 1)}
        ${rect(274, 527, 95, 27, "#4A5A72", 4)}
        ${rect(407, 506, 287, 91, "#34425E", 10, "#90A4B9")}
        ${rect(422, 520, 256, 21, "#96B1CB", 3)}${label(431, 538, "MINIMIZE ME", 14, "#1B253C", 700, 1)}
        ${rect(438, 558, 130, 22, a, 5)}`;
    case "mission":
      return ["CHALLENGES", "PROGRESS", "REWARDS"].map((name, i) => {
        const x = 108 + i * 212;
        return `${rect(x, 495, 198, 98, "#243750", 13, "#66809A")}
          ${rect(x + 17, 513, 38, 38, i === 1 ? a : "#9FD4E3", 9)}
          ${label(x + 17, 578, name, 18, "#F3F8F8", 700, 1)}`;
      }).join("");
    case "reggie":
      return `${rect(108, 484, 632, 112, "#3B2A37", 15, a)}
        ${rect(126, 503, 112, 74, "#69484A", 10, a)}
        ${reggieSpriteMarkup}
        ${label(256, 519, "REGGIE", 18, a, 700, 1.2)}
        ${label(256, 552, "REGGIE QUEST PROGRESS", 24, "#F5F6F2", 700)}
        ${label(256, 580, "NEXT STEP  →  TAKE ME THERE", 18, "#F1DDBD", 600)}`;
    case "routes":
      return ["ARCADE", "CREATE", "EVENTS", "TALK"].map((name, i) => {
        const x = 108 + (i % 2) * 315;
        const y = 483 + Math.floor(i / 2) * 57;
        return `${rect(x, y, 300, 47, "#2B4056", 10, a)}${label(x + 18, y + 32, name, 22, "#F4F8F8", 700, 1)}`;
      }).join("");
    case "nearby":
      return `${rect(108, 491, 632, 103, "#233A48", 17, a)}
        ${label(139, 535, "ONE CLICK IS ENOUGH", 25, a, 700, 2)}
        ${label(139, 570, "I'll be here if you need me.", 25, "#EAF4F3", 500)}`;
    default:
      throw new Error(`Unknown visual ${scene.visual}`);
  }
}

function frameSvg(scene, index, count) {
  const a = scene.accent;
  const dots = Array.from({ length: count }, (_, i) =>
    `<circle cx="${1126 + i * 16}" cy="676" r="5" fill="${i === index ? a : "#52647D"}"/>`
  ).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stop-color="#0C1429"/><stop offset="1" stop-color="#172540"/>
      </linearGradient>
      <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
        <path d="M28 0H0V28" fill="none" stroke="#40506B" stroke-opacity=".16"/>
      </pattern>
    </defs>
    ${rect(0, 0, width, height, "url(#bg)", 0)}
    ${rect(0, 0, width, height, "url(#grid)", 0)}
    ${rect(30, 32, 1220, 616, "#111D35", 26, "#5A6D85")}
    ${rect(30, 32, 1220, 69, "#1D2C47", 26)}
    <circle cx="64" cy="66" r="8" fill="#FA6975"/>
    <circle cx="89" cy="66" r="8" fill="#F5C76E"/>
    <circle cx="114" cy="66" r="8" fill="#8DE6D3"/>
    ${label(152, 74, "wtfOS  /  WELCOME", 23, "#EAF4F3", 700, 1)}
    ${label(1080, 74, `${String(index + 1).padStart(2, "0")} / ${String(count).padStart(2, "0")}`, 23, a, 700, 1)}
    ${rect(60, 126, 760, 496, "#172741", 24, "#536880")}
    ${rect(60, 126, 9, 496, a, 4)}
    ${rect(842, 126, 378, 496, "#1A2B45", 24, "#536880")}
    <circle cx="1031" cy="374" r="162" fill="${a}" opacity=".14"/>
    <circle cx="1031" cy="374" r="125" fill="none" stroke="${a}" stroke-width="2" opacity=".38"/>
    ${label(108, 199, scene.eyebrow, 25, a, 700, 2)}
    ${label(108, 286, scene.title, 62, "#F5FAFA", 700)}
    ${label(108, 370, scene.lines[0], 34, "#E4F0F2", 500)}
    ${label(108, 417, scene.lines[1], 34, "#E4F0F2", 500)}
    ${visual(scene)}
    ${label(875, 182, "PAUL WHO IS A CLIPPY", 18, a, 700, 1.4)}
    ${label(912, 584, "YOUR DESKTOP GHOST", 18, "#D4E8E8", 700, 1.2)}
    ${label(60, 681, "wtfOS  /  FIRST LOOK", 18, "#B9CBD8", 700, 1)}
    ${dots}
  </svg>`;
}

function vttTime(seconds) {
  const millis = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(millis / 3_600_000);
  const minutes = Math.floor((millis % 3_600_000) / 60_000);
  const secs = Math.floor((millis % 60_000) / 1000);
  const ms = millis % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

await mkdir(work, { recursive: true });
await mkdir(target, { recursive: true });
reggieSpriteMarkup = await renderActualReggieSprite();
const scenes = JSON.parse(await readFile(storyboardPath, "utf8"));
const narrationDir = path.join(work, "narration");
await mkdir(narrationDir, { recursive: true });
if (!process.argv.includes("--reuse-narration")) {
const python = path.join(work, ".venv/bin/python");
if (!existsSync(python)) {
  if (offline) throw new Error("Local narrator environment missing. Build once without --offline.");
  run("uv", ["venv", "--python", "3.12", path.join(work, ".venv")]);
}
const check = spawnSync(python, ["-c", "import kokoro, soundfile, en_core_web_sm"],
  { cwd: root, stdio: "ignore" });
if (check.status !== 0) {
  if (offline) throw new Error("Local Kokoro packages missing. Build once without --offline.");
  run("uv", ["pip", "install", "--python", python, "kokoro==0.9.4", "soundfile",
    "en-core-web-sm @ https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl"]);
}
run(python, [path.join(here, "narrate.py"), "--storyboard", storyboardPath,
  "--output", narrationDir, "--voice", "am_puck"],
  { env: { ...process.env, ...(offline ? { HF_HUB_OFFLINE: "1" } : {}) } });
}
const timings = JSON.parse(await readFile(path.join(narrationDir, "timings.json"), "utf8"));
const ghostPng = path.join(work, "paul.png");
run("rsvg-convert", ["-w", "400", "-h", "267", "-o", ghostPng, sourceGhost]);
const segments = [];
for (const [index, scene] of scenes.entries()) {
  const svgPath = path.join(work, `${scene.id}.svg`);
  const pngPath = path.join(work, `${scene.id}.png`);
  const clipPath = path.join(work, `${scene.id}.mp4`);
  await writeFile(svgPath, frameSvg(scene, index, scenes.length), "utf8");
  run("rsvg-convert", ["-o", pngPath, svgPath]);
  const duration = timings[index].durationSeconds;
  const filter = `[0:v][1:v]overlay=x=830:y=240+10*sin(t*2.3):eval=frame:format=auto,` +
    `fade=t=in:st=0:d=0.18,fade=t=out:st=${(duration - 0.2).toFixed(3)}:d=0.2,` +
    `format=yuv420p[v];[2:a]afade=t=in:st=0:d=0.08,` +
    `afade=t=out:st=${(duration - 0.24).toFixed(3)}:d=0.24[a]`;
  run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
    "-loop", "1", "-framerate", String(fps), "-i", pngPath,
    "-loop", "1", "-framerate", String(fps), "-i", ghostPng,
    "-i", path.join(narrationDir, `${scene.id}.wav`),
    "-filter_complex", filter, "-map", "[v]", "-map", "[a]",
    "-t", String(duration), "-r", String(fps),
    "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", clipPath]);
  segments.push(clipPath);
  console.log(`[paul video] ${scene.id}: ${probeDuration(clipPath).toFixed(2)}s`);
}
const concatPath = path.join(work, "concat.txt");
await writeFile(concatPath, segments.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n") + "\n");
const mp4Path = path.join(target, "paulwhoisaclippy-welcome.mp4");
run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", concatPath,
  "-c", "copy", "-movflags", "+faststart", mp4Path]);
const posterPath = path.join(target, "paulwhoisaclippy-welcome-poster.png");
run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", path.join(work, `${scenes[0].id}.png`),
  "-i", ghostPng, "-filter_complex", "[0:v][1:v]overlay=830:240:format=auto",
  "-frames:v", "1", "-update", "1", posterPath]);
let offset = 0;
const cues = [];
for (const [index, timing] of timings.entries()) {
  for (const caption of timing.captions) {
    cues.push(`${vttTime(offset + caption.startSeconds)} --> ${vttTime(offset + caption.endSeconds)}\n${caption.text}`);
  }
  offset += probeDuration(segments[index]);
}
const vttPath = path.join(target, "paulwhoisaclippy-welcome.vtt");
await writeFile(vttPath, `WEBVTT\n\n${cues.join("\n\n")}\n`, "utf8");
console.log(`[paul video] final: ${mp4Path} (${probeDuration(mp4Path).toFixed(2)}s)`);
console.log(`[paul video] captions: ${vttPath}`);
console.log(`[paul video] poster: ${posterPath}`);
