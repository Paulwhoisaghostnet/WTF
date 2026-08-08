#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, copyFile, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const appRoot = path.join(root, "apps", "pasta-suite-desktop");
const releaseRoot = path.resolve(
  process.env.PASTA_SUITE_RELEASE_DIR || path.join(appRoot, "release"),
);
const packageJson = JSON.parse(await readFile(path.join(appRoot, "package.json"), "utf8"));
const version = packageJson.version;
const names = [
  `Pasta-Suite-${version}-mac-universal.dmg`,
  `Pasta-Suite-${version}-mac-universal.zip`,
  `Pasta-Suite-${version}-win-x64.exe`,
  `Pasta-Suite-${version}-linux-arm64.deb`,
];

function platformFor(name) {
  if (name.includes("-mac-")) return "macOS 11+ (Intel and Apple silicon)";
  if (name.includes("-linux-arm64.")) return "64-bit ARM Linux (Raspberry Pi)";
  return "Windows 10/11 x64";
}

async function digest(filePath) {
  const bytes = await readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

const artifacts = [];
for (const name of names) {
  const filePath = path.join(releaseRoot, name);
  const details = await stat(filePath);
  artifacts.push({
    name,
    platform: platformFor(name),
    bytes: details.size,
    sha256: await digest(filePath),
    signed: false,
  });
}

const readmeName = "Pasta-Suite-README.txt";
const reviewGuideName = "Pasta-Suite-Developer-Review.md";
const screenshotName = "Pasta-Suite-First-Run.png";
await copyFile(path.join(appRoot, "build", "README.txt"), path.join(releaseRoot, readmeName));
await copyFile(path.join(root, "docs", "pasta-suite-developer-review.md"), path.join(releaseRoot, reviewGuideName));
let reviewScreenshot = null;
try {
  await access(path.join(releaseRoot, screenshotName));
  reviewScreenshot = screenshotName;
} catch {}
await writeFile(
  path.join(releaseRoot, "SHA256SUMS.txt"),
  `${artifacts.map((artifact) => `${artifact.sha256}  ${artifact.name}`).join("\n")}\n`,
  "utf8",
);
await writeFile(
  path.join(releaseRoot, `Pasta-Suite-${version}-review-manifest.json`),
  `${JSON.stringify(
    {
      product: "Pasta Suite",
      version,
      channel: "developer-review",
      requiresTerminal: false,
      bundledTools: ["ch-ease", "macaroni", "spaghetti", "gnocchi", "ravioli", "rotini", "penne", "lasagna"],
      instructions: readmeName,
      reviewGuide: reviewGuideName,
      reviewScreenshot,
      artifacts,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(JSON.stringify({ ok: true, version, artifacts }, null, 2));
