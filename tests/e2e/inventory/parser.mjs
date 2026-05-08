import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, "../../..");
export const INVENTORY_PATH = path.join(
  REPO_ROOT,
  ".agents/docs/live/user-interaction-inventory.md"
);

function splitMarkdownRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function stripInlineMarkdown(value) {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(value) {
  return stripInlineMarkdown(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseInteractionInventory(markdown = fs.readFileSync(INVENTORY_PATH, "utf8")) {
  const rows = [];
  let concern = "";
  let inInteractionTable = false;

  for (const line of markdown.split(/\r?\n/)) {
    const concernMatch = line.match(/^## Concern: (.+)$/);
    if (concernMatch) {
      concern = concernMatch[1].trim();
      inInteractionTable = false;
      continue;
    }

    if (!concern || !line.startsWith("|")) {
      inInteractionTable = false;
      continue;
    }
    if (/^\|\s*-+/.test(line)) continue;

    const cells = splitMarkdownRow(line);
    if (cells.length < 4) continue;
    if (cells[0] === "Domain") {
      inInteractionTable = cells[1] === "Access" && cells[3] === "Primary handles";
      continue;
    }
    if (!inInteractionTable || cells[0] === "---") continue;

    const handles = [...cells[3].matchAll(/`([^`]+)`/g)].map((match) => match[1].trim());
    if (handles.length === 0) continue;

    rows.push({
      id: `${slug(concern)}--${slug(cells[0])}`,
      concern,
      domain: concern,
      subdomain: stripInlineMarkdown(cells[0]),
      subdomainSlug: slug(cells[0]),
      access: stripInlineMarkdown(cells[1]),
      interactions: stripInlineMarkdown(cells[2]),
      handles,
    });
  }

  return rows;
}

export function getAllHandles(rows = parseInteractionInventory()) {
  return [...new Set(rows.flatMap((row) => row.handles))].sort();
}

export function assertInventoryShape(rows = parseInteractionInventory()) {
  const failures = [];
  const seenRowIds = new Set();

  for (const row of rows) {
    if (seenRowIds.has(row.id)) {
      failures.push(`Duplicate inventory row id: ${row.id}`);
    }
    seenRowIds.add(row.id);

    if (!row.concern || !row.subdomain || !row.access || !row.interactions) {
      failures.push(`Incomplete inventory row: ${row.id}`);
    }

    for (const handle of row.handles) {
      if (!/^[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(handle)) {
        failures.push(`Non-canonical interaction handle '${handle}' in ${row.id}`);
      }
    }
  }

  return failures;
}
