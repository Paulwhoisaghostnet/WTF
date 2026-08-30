import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = path.join(ROOT, "docs/reference/BUG_BOUNTY_BOARD_LEGACY_2026-08-30.md");
const OUTPUT = path.join(ROOT, "docs/reference/bug-bounty-records.json");
const PRIORITY_BONUS = { P0: 5, P1: 4, P2: 3, P3: 2, P4: 1 };
const STATUS_ORDER = new Map([
  ["Open", 0],
  ["Claimed", 1],
  ["In Progress", 2],
  ["Blocked", 3],
  ["Fixed", 4],
  ["Verified", 5],
  ["Archived", 6],
]);

function splitTableRow(line) {
  const cells = [];
  let cell = "";
  let escaped = false;
  for (const character of line.slice(1, -1)) {
    if (escaped) {
      cell += character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function normalizeStatus(raw = "Open") {
  const status = raw.trim();
  if (/^verified\b/iu.test(status)) return "Verified";
  if (/^fixed\b/iu.test(status) || /^implemented\b/iu.test(status)) return "Fixed";
  if (/^in[ -]?progress\b/iu.test(status)) return "In Progress";
  if (/^claimed\b/iu.test(status)) return "Claimed";
  if (/^blocked\b/iu.test(status)) return "Blocked";
  if (/^archived\b/iu.test(status)) return "Archived";
  return "Open";
}

function field(block, name) {
  return block.match(new RegExp(`^- ${name}:\\s*(.+)$`, "imu"))?.[1]?.trim() ?? null;
}

function scoreFrom(block, priority) {
  const score = field(block, "Score") ?? "";
  const complexity = Number(score.match(/C_?(\d+)/iu)?.[1]);
  const functionalityDanger = Number(score.match(/F_?(\d+)/iu)?.[1]);
  const securityDanger = Number(score.match(/S_?(\d+)/iu)?.[1]);
  if (![complexity, functionalityDanger, securityDanger].every(Number.isInteger)) return null;
  return {
    complexity,
    functionalityDanger,
    securityDanger,
    points: complexity + functionalityDanger + securityDanger + PRIORITY_BONUS[priority],
  };
}

function cleanBody(block) {
  const lines = block.replace(/^\s+/u, "").split(/\r?\n/u);
  while (
    lines.length > 0
    && (/^- (?:Category|Priority|Status|Owner\s*\/\s*Session|Last touched|Score):/iu.test(lines[0]) || lines[0].trim() === "")
  ) {
    lines.shift();
  }
  return lines.join("\n").trim();
}

function tokens(value) {
  return new Set(value.toLowerCase().match(/[a-z0-9]{3,}/gu) ?? []);
}

function similarity(left, right) {
  const a = tokens(left);
  const b = tokens(right);
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / Math.max(1, new Set([...a, ...b]).size);
}

function parseSummary(markdown) {
  const boardStart = markdown.indexOf("## Open Board");
  const detailStart = markdown.search(/^### WTF-BB-/mu);
  if (boardStart < 0 || detailStart < 0) throw new Error("legacy board sections were not found");
  return markdown.slice(boardStart, detailStart).split(/\r?\n/u).flatMap((line) => {
    if (!line.startsWith("| WTF-BB-")) return [];
    const cells = splitTableRow(line);
    if (cells.length < 12) throw new Error(`invalid legacy summary row: ${line}`);
    const [id, status, owner, lastTouched, category, priority, , , complexity, functionalityDanger, securityDanger, ...titleCells] = cells;
    const title = titleCells.join(" | ");
    const c = Number(complexity);
    const f = Number(functionalityDanger);
    const s = Number(securityDanger);
    return [{
      originalId: id,
      status: normalizeStatus(status),
      owner: owner || "-",
      lastTouched: /^\d{4}-\d{2}-\d{2}$/u.test(lastTouched) ? lastTouched : "-",
      category: category || "Legacy / uncategorized",
      priority: Object.hasOwn(PRIORITY_BONUS, priority) ? priority : "P3",
      complexity: Number.isInteger(c) && c > 0 ? c : 1,
      functionalityDanger: Number.isInteger(f) && f >= 0 ? f : 0,
      securityDanger: Number.isInteger(s) && s >= 0 ? s : 0,
      title,
    }];
  });
}

function parseDetails(markdown) {
  const matches = [...markdown.matchAll(/^### (WTF-BB-\d+) - (.+)$/gmu)];
  return matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? markdown.length;
    const block = markdown.slice(start, end);
    const priorityFromScore = field(block, "Score")?.match(/P_?(\d)/iu)?.[1];
    const priority = field(block, "Priority") ?? (priorityFromScore ? `P${priorityFromScore}` : "P3");
    return {
      originalId: match[1],
      title: match[2].trim(),
      status: normalizeStatus(field(block, "Status") ?? "Open"),
      owner: field(block, "Owner\\s*\\/\\s*Session") ?? "-",
      lastTouched: field(block, "Last touched") ?? "-",
      category: field(block, "Category") ?? "Legacy / uncategorized",
      priority: Object.hasOwn(PRIORITY_BONUS, priority) ? priority : "P3",
      score: scoreFrom(block, Object.hasOwn(PRIORITY_BONUS, priority) ? priority : "P3"),
      body: cleanBody(block),
      sourceIndex: index,
    };
  });
}

function nextCanonicalId(state) {
  while (state.usedIds.has(`WTF-BB-${state.nextId}`)) state.nextId += 1;
  const id = `WTF-BB-${state.nextId}`;
  state.nextId += 1;
  return id;
}

function claimId(originalId, state) {
  if (!state.usedIds.has(originalId)) {
    state.usedIds.add(originalId);
    return originalId;
  }
  const id = nextCanonicalId(state);
  state.usedIds.add(id);
  return id;
}

function legacyNote(record, id) {
  if (id === record.originalId) return "";
  return `- Legacy identity: this distinct record formerly reused ${record.originalId}; it was assigned ${id} during canonicalization. The original representation remains in \`docs/reference/BUG_BOUNTY_BOARD_LEGACY_2026-08-30.md\`.`;
}

function importRecords(markdown) {
  const summary = parseSummary(markdown);
  const details = parseDetails(markdown);
  const unmatchedDetails = new Set(details.map((detail) => detail.sourceIndex));
  const maxLegacyId = Math.max(...[...summary, ...details].map((record) => Number(record.originalId.slice("WTF-BB-".length))));
  const state = { usedIds: new Set(), nextId: maxLegacyId + 1 };
  const records = [];

  for (const summaryRecord of summary) {
    const candidates = details.filter(
      (detail) => detail.originalId === summaryRecord.originalId && unmatchedDetails.has(detail.sourceIndex),
    );
    candidates.sort((left, right) => similarity(summaryRecord.title, right.title) - similarity(summaryRecord.title, left.title));
    const detail = candidates[0] ?? null;
    if (detail) unmatchedDetails.delete(detail.sourceIndex);
    const id = claimId(summaryRecord.originalId, state);
    const body = detail?.body || `- Legacy evidence: this issue was listed in the historical summary without a corresponding detailed record.`;
    const note = legacyNote(summaryRecord, id);
    const points = summaryRecord.complexity + summaryRecord.functionalityDanger + summaryRecord.securityDanger + PRIORITY_BONUS[summaryRecord.priority];
    records.push({
      id,
      status: summaryRecord.status,
      owner: summaryRecord.owner,
      lastTouched: summaryRecord.lastTouched,
      category: summaryRecord.category,
      priority: summaryRecord.priority,
      points,
      rank: 1,
      complexity: summaryRecord.complexity,
      functionalityDanger: summaryRecord.functionalityDanger,
      securityDanger: summaryRecord.securityDanger,
      title: summaryRecord.title,
      body: [note, body].filter(Boolean).join("\n"),
      legacyOriginalId: summaryRecord.originalId,
    });
  }

  for (const detail of details) {
    if (!unmatchedDetails.has(detail.sourceIndex)) continue;
    const id = claimId(detail.originalId, state);
    const score = detail.score ?? { complexity: 1, functionalityDanger: 0, securityDanger: 0, points: 3 };
    const note = legacyNote(detail, id);
    records.push({
      id,
      status: detail.status,
      owner: detail.owner,
      lastTouched: /^\d{4}-\d{2}-\d{2}$/u.test(detail.lastTouched) ? detail.lastTouched : "-",
      category: detail.category,
      priority: detail.priority,
      points: score.points,
      rank: 1,
      complexity: score.complexity,
      functionalityDanger: score.functionalityDanger,
      securityDanger: score.securityDanger,
      title: detail.title,
      body: [note, detail.body].filter(Boolean).join("\n"),
      legacyOriginalId: detail.originalId,
    });
  }

  for (const record of records) {
    record.rank = 1 + records.filter((candidate) => candidate.points > record.points).length;
  }
  records.sort((left, right) => (
    STATUS_ORDER.get(left.status) - STATUS_ORDER.get(right.status)
    || Number(left.priority.slice(1)) - Number(right.priority.slice(1))
    || right.points - left.points
    || Number(right.id.slice("WTF-BB-".length)) - Number(left.id.slice("WTF-BB-".length))
  ));
  return records;
}

if (!process.argv.includes("--force")) {
  const canonicalExists = await access(OUTPUT).then(() => true).catch(() => false);
  if (canonicalExists) {
    throw new Error("canonical bounty records already exist; legacy import is one-time (pass --force only for an audited reconstruction)");
  }
}
const markdown = await readFile(INPUT, "utf8");
const records = importRecords(markdown);
await writeFile(OUTPUT, `${JSON.stringify({ schemaVersion: 1, records }, null, 2)}\n`, "utf8");
console.log(`Imported ${records.length} distinct legacy bounty records into ${path.relative(ROOT, OUTPUT)}.`);
