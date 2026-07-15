import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "docs/reference/environment-variables.md");
const SOURCE_ROOTS = [
  ".github",
  "apps",
  "client",
  "contracts",
  "extensions",
  "infra",
  "packages",
  "scripts",
  "server",
  "shared",
  "tests",
];
const ROOT_FILES = [
  ".env.example",
  "docker-compose.yml",
  "Dockerfile",
  "Dockerfile.relay",
  "drizzle.config.ts",
  "package.json",
  "playwright.config.ts",
  "playwright.live.config.mjs",
  "vite.config.ts",
];
const SOURCE_EXTENSION = /(?:^|\.)(?:env\.example|env\.sample|env\.template|ts|tsx|js|mjs|cjs|sh|yml|yaml|json)$/;
const SKIP_DIRS = new Set([".git", ".next", "artifacts", "coverage", "dist", "node_modules", "test-results"]);

function normalizePath(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(candidate));
    else if (SOURCE_EXTENSION.test(entry.name)) files.push(candidate);
  }
  return files;
}

function scopeFor(file, source) {
  const scopes = new Set();
  if (file.startsWith("client/") || source.includes("import.meta.env.")) scopes.add("client-build");
  if (file.startsWith("server/") || source.includes("process.env.")) scopes.add("server-runtime");
  if (file.startsWith(".github/") || file.startsWith("infra/") || file.startsWith("scripts/") || file.startsWith("Dockerfile") || file === "docker-compose.yml") scopes.add("deploy-ops");
  if (file.startsWith("tests/") || file.includes(".test.") || file.includes("playwright")) scopes.add("test");
  if (file.startsWith("contracts/")) scopes.add("contracts");
  if (file.startsWith("apps/") || file.startsWith("extensions/") || file.startsWith("packages/")) scopes.add("package-runtime");
  if (scopes.size === 0) scopes.add("shared-runtime");
  return scopes;
}

function ownerFor(file) {
  const parts = file.split("/");
  if (parts[0] === "server" && parts[1] === "features" && parts[2]) return `server/${parts[2]}`;
  if (parts[0] === "client" && parts[2] === "features" && parts[3]) return `client/${parts[3]}`;
  if (parts[0] === "contracts" && parts[1]) return `contracts/${parts[1]}`;
  if (["apps", "extensions", "packages"].includes(parts[0]) && parts[1]) return `${parts[0]}/${parts[1]}`;
  if (parts[0] === ".github") return "delivery";
  if (["infra", "scripts"].includes(parts[0]) || file.startsWith("Dockerfile") || file === "docker-compose.yml") return "operations";
  if (parts[0] === "client") return "client/platform";
  if (parts[0] === "server") return "server/platform";
  if (parts[0] === "tests") return "quality";
  return "platform";
}

function isSecretName(name) {
  return /(?:SECRET|PASSWORD|TOKEN|PRIVATE_KEY|MNEMONIC|CREDENTIAL|ACCESS_KEY|API_KEY|ENCRYPTION_KEY|CRYPTO_KEY|SIGNING_KEY|ENC_KEY|JWT|INVITE_CODE|DATABASE_URL|DB_URL|DSN|(?:^|_)SK$)/.test(name);
}

function safeDefault(name, value) {
  if (isSecretName(name)) return "none (secret value intentionally omitted)";
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "none";
  if (/changeme|example-secret|replace-me/i.test(trimmed)) return "placeholder";
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
}

function validationFor(record) {
  const context = record.contexts.join("\n");
  if (context.includes(`\${${record.name}:?`) || /required|must be set|throw new Error|requireEnv/i.test(context)) return "required / fail-closed";
  if (/zod|safeParse|parseEnv|validate|new URL|Number\(|parseInt\(|parseFloat\(/i.test(context)) return "parsed or validated";
  if (/===|!==|includes\(|toLowerCase\(/.test(context)) return "enumerated / compared";
  return "no explicit validation found";
}

function lifecycleFor(record) {
  const context = `${record.name}\n${record.contexts.join("\n")}`;
  if (/deprecated/i.test(context)) return "deprecated";
  if (/legacy/i.test(context)) return "legacy compatibility";
  return "active";
}

function extractNames(source, file) {
  const found = [];
  const patterns = [
    /process\.env\.([A-Z][A-Z0-9_]*)/g,
    /process\.env\[["']([A-Z][A-Z0-9_]*)["']\]/g,
    /import\.meta\.env\.([A-Z][A-Z0-9_]*)/g,
    /\b(?:secrets|vars|env)\.([A-Z][A-Z0-9_]*)\b/g,
  ];
  if (/\.(?:sh|ya?ml)$/.test(file) || file.startsWith("Dockerfile") || file === "docker-compose.yml") {
    patterns.push(/\$\{([A-Z][A-Z0-9_]*)(?=[:}])/g, /\$([A-Z][A-Z0-9_]*)\b/g);
  }
  if (/(?:^|\/)\.env\.(?:example|sample|template)$/.test(file) || file === ".env.example") {
    patterns.push(/^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=/gm);
  }
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const index = match.index ?? 0;
      found.push({ name: match[1], context: source.slice(Math.max(0, index - 180), index + 260) });
    }
  }
  return found;
}

function extractDefaults(source, file) {
  const defaults = new Map();
  if (/(?:^|\/)\.env\.(?:example|sample|template)$/.test(file) || file === ".env.example") {
    for (const match of source.matchAll(/^[ \t]*#?[ \t]*([A-Z][A-Z0-9_]*)[ \t]*=[ \t]*(.*)$/gm)) {
      if (!defaults.has(match[1])) defaults.set(match[1], match[2].trim());
    }
  }
  for (const match of source.matchAll(/\$\{([A-Z][A-Z0-9_]*):-([^}]*)\}/g)) {
    if (!defaults.has(match[1])) defaults.set(match[1], match[2].trim());
  }
  for (const match of source.matchAll(/(?:process\.env\.|import\.meta\.env\.)([A-Z][A-Z0-9_]*)\s*(?:\?\?|\|\|)\s*(["'`][^"'`\n]*["'`]|-?\d+(?:\.\d+)?|true|false)/g)) {
    if (!defaults.has(match[1])) defaults.set(match[1], match[2].replace(/^["'`]|["'`]$/g, ""));
  }
  return defaults;
}

function escapeCell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export async function buildEnvironmentInventory() {
  const nested = (await Promise.all(SOURCE_ROOTS.map((root) => walk(path.join(ROOT, root))))).flat();
  const rootFiles = ROOT_FILES.map((file) => path.join(ROOT, file));
  const files = [...new Set([...nested, ...rootFiles])].sort();
  const records = new Map();

  for (const absolute of files) {
    const source = await readFile(absolute, "utf8").catch(() => null);
    if (source === null) continue;
    const file = normalizePath(absolute);
    const defaults = extractDefaults(source, file);
    for (const match of extractNames(source, file)) {
      const record = records.get(match.name) ?? {
        name: match.name,
        files: new Set(),
        owners: new Set(),
        scopes: new Set(),
        defaults: new Set(),
        contexts: [],
      };
      record.files.add(file);
      record.owners.add(ownerFor(file));
      for (const scope of scopeFor(file, source)) record.scopes.add(scope);
      if (defaults.has(match.name)) record.defaults.add(defaults.get(match.name));
      record.contexts.push(match.context);
      records.set(match.name, record);
    }
  }

  const rows = [...records.values()].sort((a, b) => a.name.localeCompare(b.name));
  const lines = [
    "# Environment variable inventory",
    "",
    "> Generated by `npm run env:inventory`. Do not edit by hand. The generator records names and metadata only; it never reads `.env` or emits runtime values.",
    "",
    `Variables: **${rows.length}**. Source files scanned: **${files.length}**.`,
    "",
    "| Variable | Owner | Scope | Default | Secret | Validation | Lifecycle | References |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const record of rows) {
    const defaults = [...record.defaults].sort();
    const defaultLabel = isSecretName(record.name)
      ? safeDefault(record.name, "")
      : defaults.length === 0
        ? safeDefault(record.name, "")
        : defaults.map((value) => safeDefault(record.name, value)).join("; ");
    const references = [...record.files].sort();
    lines.push(
      `| \`${record.name}\` | ${escapeCell([...record.owners].sort().join(", "))} | ${escapeCell([...record.scopes].sort().join(", "))} | ${escapeCell(defaultLabel)} | ${isSecretName(record.name) ? "yes" : "no"} | ${escapeCell(validationFor(record))} | ${escapeCell(lifecycleFor(record))} | ${references.length} (${escapeCell(references.slice(0, 3).join(", "))}${references.length > 3 ? ", ..." : ""}) |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const generated = await buildEnvironmentInventory();
  if (process.argv.includes("--check")) {
    const current = await readFile(OUTPUT, "utf8").catch(() => "");
    if (current !== generated) {
      console.error("Environment inventory is stale. Run: npm run env:inventory");
      process.exit(1);
    }
    console.log("Environment inventory is current.");
    return;
  }
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, generated);
  console.log(`Wrote ${normalizePath(OUTPUT)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
