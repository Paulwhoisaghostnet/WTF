#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const publicRoot = path.join(repoRoot, "public", "pasta-icons");

export const ICON_APPS = [
  { id: "pasta-suite", label: "Pasta Suite", concept: "a perforated colander bowl" },
  { id: "ch-ease", label: "CH-EASE", concept: "a compact package folder" },
  { id: "macaroni", label: "Macaroni", concept: "a curved macaroni loop" },
  { id: "spaghetti", label: "Spaghetti", concept: "three spaghetti strands" },
  { id: "gnocchi", label: "Gnocchi", concept: "three rounded dumplings" },
  { id: "ravioli", label: "Ravioli", concept: "a square ravioli parcel" },
  { id: "rotini", label: "Rotini", concept: "a corkscrew spiral" },
  { id: "penne", label: "Penne", concept: "two diagonal pasta tubes" },
  { id: "lasagna", label: "Lasagna", concept: "stacked wavy layers" },
];

export const PALETTES = {
  sugo: {
    label: "Sugo",
    description: "Warm, playful, food-forward, and closest to the existing Pasta personality.",
    background: "#32142d",
    panel: "#4a1e3a",
    border: "#70405f",
    ink: "#fff0d2",
    secondary: "#f5b63b",
    accents: {
      "pasta-suite": "#f5b63b",
      "ch-ease": "#f6e7c8",
      macaroni: "#f08c46",
      spaghetti: "#e5483e",
      gnocchi: "#b6d56b",
      ravioli: "#d98cb3",
      rotini: "#80a93d",
      penne: "#ffcf59",
      lasagna: "#e5683a",
    },
  },
  "night-market": {
    label: "Night Market",
    description: "Digital, energetic, and unmistakably wtfOS in a dark shell.",
    background: "#071d38",
    panel: "#0d3152",
    border: "#2d6687",
    ink: "#fff9ee",
    secondary: "#14c7c7",
    accents: {
      "pasta-suite": "#14c7c7",
      "ch-ease": "#fff9ee",
      macaroni: "#ff8a7a",
      spaghetti: "#13d8d0",
      gnocchi: "#c5ff21",
      ravioli: "#ff6d6d",
      rotini: "#c5ff21",
      penne: "#ff8a7a",
      lasagna: "#9de5df",
    },
  },
  "paper-archive": {
    label: "Paper Archive",
    description: "Editorial, collectible, and print-inspired for light surfaces.",
    background: "#f6e7cc",
    panel: "#ead7b7",
    border: "#cbb28a",
    ink: "#09223c",
    secondary: "#e8af22",
    accents: {
      "pasta-suite": "#09223c",
      "ch-ease": "#b4342b",
      macaroni: "#d9991d",
      spaghetti: "#09223c",
      gnocchi: "#2056c4",
      ravioli: "#b4342b",
      rotini: "#2056c4",
      penne: "#09223c",
      lasagna: "#b4342b",
    },
  },
};

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function mark(appId, colors) {
  const { accent, ink, panel, background } = colors;
  const common = `stroke="${ink}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"`;
  switch (appId) {
    case "pasta-suite":
      return `
        <path d="M15 28h34c0 13-7 22-17 22S15 41 15 28Z" fill="${ink}"/>
        <path d="M12 27h40" ${common}/>
        <path d="M22 50l-3 5M42 50l3 5" ${common}/>
        <g fill="${panel}"><circle cx="23" cy="34" r="2.1"/><circle cx="31" cy="34" r="2.1"/><circle cx="39" cy="34" r="2.1"/><circle cx="27" cy="41" r="2.1"/><circle cx="35" cy="41" r="2.1"/></g>
        <path d="M19 17c5 2 7 5 8 10M28 15c5 3 6 7 5 12M38 17c3 3 3 6 2 10" fill="none" stroke="${accent}" stroke-width="3" stroke-linecap="round"/>`;
    case "ch-ease":
      return `
        <path d="M14 21h15l4 5h17v22H14Z" fill="${ink}" ${common}/>
        <path d="M14 22h15l4 5h17" fill="none" stroke="${accent}" stroke-width="4" stroke-linejoin="round"/>
        <rect x="25" y="35" width="14" height="4" rx="2" fill="${panel}"/>
        <path d="M42 21v-4H23v4" fill="none" stroke="${accent}" stroke-width="3" stroke-linejoin="round"/>`;
    case "macaroni":
      return `
        <path d="M20 45c-7-4-9-12-5-19s12-10 19-6l10 6" fill="none" stroke="${accent}" stroke-width="7" stroke-linecap="round"/>
        <path d="M20 45c7 4 15 1 19-5l5-8" fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"/>
        <circle cx="20" cy="45" r="3.8" fill="${background}" stroke="${ink}" stroke-width="2.2"/>
        <circle cx="45" cy="32" r="3.8" fill="${background}" stroke="${accent}" stroke-width="2.2"/>`;
    case "spaghetti":
      return `
        <path d="M20 16c-4 8 4 12 0 20s4 12 0 20M32 16c-4 8 4 12 0 20s4 12 0 20M44 16c-4 8 4 12 0 20s4 12 0 20" fill="none" stroke="${accent}" stroke-width="4" stroke-linecap="round"/>
        <circle cx="20" cy="14" r="2.3" fill="${ink}"/><circle cx="32" cy="14" r="2.3" fill="${ink}"/><circle cx="44" cy="14" r="2.3" fill="${ink}"/>`;
    case "gnocchi":
      return `
        <g fill="${ink}" stroke="${accent}" stroke-width="2.2">
          <path d="M15 32c0-6 5-10 11-10s10 4 10 10-4 10-10 10-11-4-11-10Z"/>
          <path d="M31 22c0-6 5-10 11-10s8 4 8 9-3 9-9 9-10-3-10-8Z"/>
          <path d="M30 45c0-5 4-8 9-8s9 3 9 8-4 8-9 8-9-3-9-8Z"/>
        </g>
        <path d="M21 27l5 3M37 18l5 3M36 42l5 3" stroke="${panel}" stroke-width="2.3" stroke-linecap="round"/>`;
    case "ravioli":
      return `
        <path d="M16 24c0-4 4-8 8-8h16c4 0 8 4 8 8v16c0 4-4 8-8 8H24c-4 0-8-4-8-8Z" fill="${accent}" ${common}/>
        <rect x="24" y="24" width="16" height="16" rx="3" fill="${ink}"/>
        <path d="M19 24h-3M19 32h-3M19 40h-3M48 24h-3M48 32h-3M48 40h-3" stroke="${ink}" stroke-width="2.3" stroke-linecap="round"/>`;
    case "rotini":
      return `
        <path d="M18 20c4-7 16-8 23-2 8 7 5 19-3 26-8 7-20 5-24-2-4-7 2-13 9-13 6 0 8 6 5 9-3 3-8 0-7-4" fill="none" stroke="${accent}" stroke-width="6" stroke-linecap="round"/>
        <path d="M21 20c4-3 8-4 12-3" fill="none" stroke="${ink}" stroke-width="2.5" stroke-linecap="round"/>`;
    case "penne":
      return `
        <g fill="${accent}" ${common}>
          <path d="M17 47 29 20l11 5-12 27Z"/>
          <path d="M31 43l9-24 10 4-10 25Z"/>
        </g>
        <ellipse cx="31.5" cy="22.5" rx="3.5" ry="2.2" transform="rotate(25 31.5 22.5)" fill="${background}" stroke="${ink}" stroke-width="1.7"/>
        <ellipse cx="45" cy="21" rx="3.2" ry="2" transform="rotate(25 45 21)" fill="${background}" stroke="${ink}" stroke-width="1.7"/>`;
    case "lasagna":
      return `
        <path d="M14 23c4-3 8 3 12 0s8 3 12 0 8 3 12 0v7c-4 3-8-3-12 0s-8-3-12 0-8-3-12 0Z" fill="${accent}" ${common}/>
        <path d="M14 33c4-3 8 3 12 0s8 3 12 0 8 3 12 0v7c-4 3-8-3-12 0s-8-3-12 0-8-3-12 0Z" fill="${ink}" ${common}/>
        <path d="M14 43c4-3 8 3 12 0s8 3 12 0 8 3 12 0v7c-4 3-8-3-12 0s-8-3-12 0-8-3-12 0Z" fill="${accent}" ${common}/> `;
    default:
      throw new Error(`Unknown Pasta icon: ${appId}`);
  }
}

function iconSvg(app, paletteId) {
  const palette = PALETTES[paletteId];
  const colors = {
    accent: palette.accents[app.id],
    ink: palette.ink,
    panel: palette.panel,
    background: palette.background,
  };
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-labelledby="title desc">
  <title id="title">${esc(app.label)} icon</title>
  <desc id="desc">${esc(app.concept)} mark in the ${esc(palette.label)} Pasta Protocol palette.</desc>
  <rect width="64" height="64" rx="16" fill="${palette.background}"/>
  <rect x="2" y="2" width="60" height="60" rx="14" fill="none" stroke="${palette.border}" stroke-width="1.5"/>
  <g>${mark(app.id, colors)}</g>
</svg>
`;
}

function writePaletteAssets() {
  mkdirSync(publicRoot, { recursive: true });
  const manifest = {
    version: 1,
    activePalette: "sugo",
    palettes: Object.fromEntries(
      Object.entries(PALETTES).map(([id, palette]) => [id, {
        label: palette.label,
        description: palette.description,
        path: `/pasta-icons/${id}`,
        colors: {
          background: palette.background,
          panel: palette.panel,
          border: palette.border,
          ink: palette.ink,
          secondary: palette.secondary,
          accents: palette.accents,
        },
      }]),
    ),
    apps: Object.fromEntries(ICON_APPS.map((app) => [app.id, {
      label: app.label,
      concept: app.concept,
      favicon: `/pasta-icons/sugo/${app.id}.svg`,
      options: Object.fromEntries(Object.keys(PALETTES).map((paletteId) => [
        paletteId,
        `/pasta-icons/${paletteId}/${app.id}.svg`,
      ])),
    }])),
  };

  for (const paletteId of Object.keys(PALETTES)) {
    const paletteRoot = path.join(publicRoot, paletteId);
    mkdirSync(paletteRoot, { recursive: true });
    for (const app of ICON_APPS) {
      writeFileSync(path.join(paletteRoot, `${app.id}.svg`), iconSvg(app, paletteId));
    }
  }
  writeFileSync(path.join(publicRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function nativeRoot(appId) {
  return path.join(repoRoot, "apps", `${appId}-desktop`, "build");
}

function prepareNativeIcon(appId) {
  const app = ICON_APPS.find((candidate) => candidate.id === appId);
  if (!app) throw new Error(`Unknown Pasta desktop app: ${appId}`);
  const source = path.join(publicRoot, "sugo", `${appId}.svg`);
  if (!existsSync(source)) throw new Error(`Generate palette assets before preparing ${appId}`);
  const targetRoot = nativeRoot(appId);
  mkdirSync(targetRoot, { recursive: true });
  const svgTarget = path.join(targetRoot, "icon.svg");
  copyFileSync(source, svgTarget);

  const pngTarget = path.join(targetRoot, "icon.png");
  try {
    execFileSync("rsvg-convert", ["-w", "1024", "-h", "1024", "-o", pngTarget, svgTarget], { stdio: "inherit" });
  } catch {
    execFileSync("magick", [svgTarget, "-background", "none", "-alpha", "on", "-resize", "1024x1024", "-depth", "8", pngTarget], { stdio: "inherit" });
  }
  const icoTarget = path.join(targetRoot, "icon.ico");
  execFileSync("magick", [pngTarget, "-define", "icon:auto-resize=256,128,64,48,32,16", icoTarget], { stdio: "inherit" });

  return targetRoot;
}

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const [key, inline] = value.slice(2).split("=", 2);
    args.set(key, inline ?? argv[index + 1] ?? true);
    if (inline === undefined) index += 1;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const manifest = writePaletteAssets();
if (args.has("app")) prepareNativeIcon(String(args.get("app")));
if (args.has("native")) {
  for (const app of ICON_APPS) prepareNativeIcon(app.id);
}
console.log(`Generated ${Object.keys(manifest.palettes).length} Pasta palettes for ${ICON_APPS.length} apps.`);
