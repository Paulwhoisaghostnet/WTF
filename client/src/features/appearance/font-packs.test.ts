import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  cssVarsForFontPack,
  FONT_PACKS,
  getFontPack,
  isDesktopFontPackKey,
} from "./font-packs";

const here = path.dirname(fileURLToPath(import.meta.url));
const clientSrcRoot = path.resolve(here, "../..");

function walkTsFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walkTsFiles(fullPath, files);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

test("font pack registry exposes the default MEK stack and system alternatives", () => {
  assert.equal(getFontPack("mek-type").roles.mono.includes("MEK Mono"), true);
  assert.equal(getFontPack("classic-95").faces.length, 0);
  assert.equal(FONT_PACKS.length, 4);
  assert.equal(isDesktopFontPackKey("terminal"), true);
  assert.equal(isDesktopFontPackKey("comic-sans"), false);
  assert.equal(getFontPack("comic-sans").key, "mek-type");
});

test("cssVarsForFontPack maps roles to canonical CSS variables", () => {
  const vars = cssVarsForFontPack("terminal");
  assert.equal(vars["--wtf-mono-font"], getFontPack("terminal").roles.mono);
  assert.equal(vars["--wtf-app-font"], getFontPack("terminal").roles.app);
  assert.equal(vars["--wtf-titlebar-font"], getFontPack("terminal").roles.mono);
});

test("client surfaces do not hardcode MEK or Courier stacks outside allowed files", () => {
  const allowed = new Set([
    path.resolve(here, "font-packs.ts"),
    path.resolve(clientSrcRoot, "global-styles.ts"),
    path.resolve(clientSrcRoot, "components/layout/AuthScreenShell.tsx"),
  ]);

  const bannedPatterns = [
    /font-family:\s*[^;]*"MEK Mono"/,
    /fontFamily:\s*[^,}]*"MEK Mono"/,
    /font-family:\s*[^;]*"Courier New"/,
    /fontFamily:\s*[^,}]*"Courier New"/,
    /ctx\.font\s*=\s*[^;]*"MEK Mono"/,
    /ctx\.font\s*=\s*[^;]*'MEK Mono'/,
    /ctx\.font\s*=\s*[^;]*"Courier New"/,
    /ctx\.font\s*=\s*[^;]*'Courier New'/,
  ];

  const offenders: string[] = [];
  for (const file of walkTsFiles(clientSrcRoot)) {
    if (allowed.has(file)) continue;
    const content = readFileSync(file, "utf8");
    for (const pattern of bannedPatterns) {
      if (pattern.test(content)) {
        offenders.push(`${path.relative(clientSrcRoot, file)} :: ${pattern}`);
        break;
      }
    }
  }

  assert.deepEqual(offenders, []);
});
