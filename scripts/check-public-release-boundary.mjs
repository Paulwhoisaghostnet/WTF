import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { hasJwtShapedCredential } from "./public-release-secret-patterns.mjs";

const policy = JSON.parse(readFileSync("config/public-release-boundary.json", "utf8"));
const allowedAgentFiles = new Set(policy.publicAgentGovernance);
const releaseTextExtensions = new Set([
  ".cjs", ".css", ".env", ".html", ".js", ".json", ".jsx", ".md",
  ".mjs", ".toml", ".ts", ".tsx", ".txt", ".yaml", ".yml",
]);
const releaseFiles = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter((file) => file && existsSync(file))
  .sort();
const violations = [];

for (const file of releaseFiles) {
  if (file.startsWith(".agents/") && !allowedAgentFiles.has(file)) {
    violations.push(`${file}: internal agent evidence is tracked`);
  }
  const name = path.basename(file);
  if (
    (/^\.env(?:\.|$)/.test(name) && !/\.(?:example|sample|template)$/.test(name)) ||
    /(?:^|\.)?(?:pem|p12|key|kdbx)$/.test(name) ||
    /(?:credentials|token)\.json$/i.test(name)
  ) {
    violations.push(`${file}: credential-bearing filename is tracked`);
  }

  let stat;
  try {
    stat = statSync(file);
  } catch {
    continue;
  }
  if (!stat.isFile()) continue;
  const isReleaseText = releaseTextExtensions.has(path.extname(file).toLowerCase());
  if (!isReleaseText && stat.size > 2_000_000) continue;
  const source = readFileSync(file, "utf8");
  if (/^\s*-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/m.test(source)) {
    violations.push(`${file}: private key block detected`);
  }
  if (/\bAKIA[0-9A-Z]{16}\b/.test(source) || /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/.test(source)) {
    violations.push(`${file}: high-confidence credential token detected`);
  }
  if (hasJwtShapedCredential(source)) {
    violations.push(`${file}: JWT-shaped credential token detected`);
  }
}

if (violations.length > 0) {
  console.error("Public release boundary violations:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`Public release boundary passed for ${releaseFiles.length} current release inputs.`);
