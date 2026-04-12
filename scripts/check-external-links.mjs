#!/usr/bin/env node
import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const CLIENT_SRC = path.join(ROOT, "client", "src");

async function collectTsxFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return collectTsxFiles(fullPath);
      if (entry.isFile() && fullPath.endsWith(".tsx")) return [fullPath];
      return [];
    })
  );
  return files.flat();
}

function lineNumberFromIndex(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (text[i] === "\n") line += 1;
  }
  return line;
}

function findTagBounds(source, index) {
  const start = source.lastIndexOf("<", index);
  const end = source.indexOf(">", index);
  if (start === -1 || end === -1 || end <= start) return null;
  return { start, end: end + 1 };
}

function hasSafeRel(tagSource) {
  const relMatch = tagSource.match(/\brel\s*=\s*(["'])(.*?)\1/i);
  if (!relMatch) return false;
  const relValue = relMatch[2].toLowerCase();
  return relValue.includes("noopener") && relValue.includes("noreferrer");
}

async function main() {
  const files = await collectTsxFiles(CLIENT_SRC);
  const findings = [];

  for (const file of files) {
    const source = await fs.readFile(file, "utf8");
    const targetRegex = /target\s*=\s*["_']_blank["_']/g;
    let match;
    while ((match = targetRegex.exec(source)) !== null) {
      const bounds = findTagBounds(source, match.index);
      if (!bounds) continue;
      const tagSource = source.slice(bounds.start, bounds.end);
      if (hasSafeRel(tagSource)) continue;
      const line = lineNumberFromIndex(source, match.index);
      findings.push({ file, line, tagSource: tagSource.slice(0, 200) });
    }
  }

  if (findings.length === 0) {
    console.log("External link safety check passed.");
    return;
  }

  console.error("Found target=\"_blank\" links without rel=\"noopener noreferrer\":");
  for (const finding of findings) {
    console.error(`- ${path.relative(ROOT, finding.file)}:${finding.line}`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
