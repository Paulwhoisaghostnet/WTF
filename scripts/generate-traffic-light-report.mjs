import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const JOURNEY_IDS = Object.freeze(
  Array.from({ length: 12 }, (_, index) => `J-${String(index + 1).padStart(2, "0")}`),
);

function cleanCell(value) {
  return value.trim().replaceAll("\\|", "|");
}

function escapeCell(value) {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function classifyJourneyStatus(status) {
  const normalized = status.trim().toUpperCase();
  if (/^PASS(?:\s|—|$)/u.test(normalized)) return "GREEN";
  if (/^READY FOR TEST(?:\s|—|$)/u.test(normalized)) return "AMBER";
  return "RED";
}

export function parseReleaseLedger(markdown) {
  const candidateMatch = markdown.match(/^Candidate commit:\s*(.+?)\s*$/mu);
  if (!candidateMatch) throw new Error("release ledger is missing Candidate commit");
  const candidateCommit = candidateMatch[1].replaceAll("`", "").trim();
  const journeys = [];
  const seen = new Set();

  for (const line of markdown.split(/\r?\n/u)) {
    if (!/^\|\s*J-\d{2}\b/u.test(line)) continue;
    const cells = line.split("|").slice(1, -1).map(cleanCell);
    if (cells.length < 7) throw new Error(`journey row has ${cells.length} columns: ${line}`);
    const idMatch = cells[0].match(/^(J-\d{2})\b/u);
    if (!idMatch) continue;
    const id = idMatch[1];
    if (seen.has(id)) throw new Error(`duplicate journey ${id}`);
    seen.add(id);
    journeys.push({
      id,
      name: cells[0].slice(id.length).trim(),
      status: cells[1],
      actor: cells[2],
      proof: cells[3],
      durableResult: cells[4],
      visualEvidence: cells[5],
      blocker: cells[6],
      light: classifyJourneyStatus(cells[1]),
    });
  }

  const missing = JOURNEY_IDS.filter((id) => !seen.has(id));
  const unexpected = journeys.map((journey) => journey.id).filter((id) => !JOURNEY_IDS.includes(id));
  if (missing.length > 0) throw new Error(`release ledger is missing ${missing.join(", ")}`);
  if (unexpected.length > 0) throw new Error(`release ledger has unexpected ${unexpected.join(", ")}`);

  journeys.sort((left, right) => left.id.localeCompare(right.id));
  return { candidateCommit, journeys };
}

export function renderTrafficLightReport({ candidateCommit, journeys }) {
  const counts = { GREEN: 0, AMBER: 0, RED: 0 };
  for (const journey of journeys) counts[journey.light] += 1;
  const commitDescription = candidateCommit === "SELF"
    ? "`SELF` (the commit containing this report)"
    : `\`${candidateCommit}\``;
  const rows = journeys.map((journey) =>
    `| ${journey.id} | ${journey.light} | ${escapeCell(journey.status)} | ${escapeCell(journey.proof)} | ${escapeCell(journey.blocker)} |`,
  );
  const attention = journeys.filter((journey) => journey.light !== "GREEN");

  return [
    "# WTF commission traffic-light report",
    "",
    `Candidate commit: ${commitDescription}`,
    "Source: `artifacts/commission-2026-09/release-evidence.md`",
    "",
    `Green: ${counts.GREEN} · Amber: ${counts.AMBER} · Red: ${counts.RED}`,
    "",
    "| Journey | Light | Ledger status | Automated proof | Defect or blocker |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
    "## Candidate decision",
    "",
    counts.RED > 0
      ? "BLOCKED — at least one commissioned journey is below READY FOR TEST."
      : "READY FOR TEST — every commissioned journey is PASS or READY FOR TEST.",
    "",
    "## Items requiring attention",
    "",
    ...(attention.length > 0
      ? attention.map((journey) => `- ${journey.id} — ${journey.light}: ${journey.status}; ${journey.blocker}`)
      : ["- None."]),
    "",
  ].join("\n");
}

async function main() {
  const sourcePath = resolve(process.argv[2] || "artifacts/commission-2026-09/release-evidence.md");
  const outputPath = resolve(process.argv[3] || "artifacts/commission-2026-09/traffic-light-report.md");
  const parsed = parseReleaseLedger(await readFile(sourcePath, "utf8"));
  const report = renderTrafficLightReport(parsed);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, report, "utf8");
  const redCount = parsed.journeys.filter((journey) => journey.light === "RED").length;
  process.stdout.write(`${report}\n`);
  if (redCount > 0) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
