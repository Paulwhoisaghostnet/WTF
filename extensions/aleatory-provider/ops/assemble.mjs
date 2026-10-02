#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const args = process.argv.slice(2);
if (args.length < 1 || args.length > 2) {
  throw new Error("Usage: node extensions/aleatory-provider/ops/assemble.mjs OUTPUT.tar.gz [COMMIT]");
}
const output = path.resolve(args[0]);
const git = (...arguments_) => execFileSync("git", ["-C", repository, ...arguments_]);
const commit = git("rev-parse", "--verify", `${args[1] || "HEAD"}^{commit}`).toString().trim();
const extension = "extensions/aleatory-provider";
const exact = [
  `${extension}/package.json`,
  `${extension}/package-lock.json`,
  `${extension}/contract/artifacts/AleatoryProvider.json`,
  "extensions/wtf-operator-signer/src/keyring.ts",
  "extensions/wtf-operator-signer/src/network.ts",
  "extensions/wtf-operator-signer/src/env.ts",
  "shared/operator-signer.ts",
];
const trees = [`${extension}/src/`, `${extension}/vendor/`, `${extension}/ops/`];
const entries = git("ls-tree", "-r", "-z", commit, "--", ...exact, ...trees)
  .toString().split("\0").filter(Boolean)
  .map((entry) => {
    const [metadata, source] = entry.split("\t");
    const [mode, type] = metadata.split(" ");
    if (type !== "blob" || !["100644", "100755"].includes(mode)) {
      throw new Error(`Release sources must be regular files: ${source}`);
    }
    return { source, mode: mode === "100755" ? 0o755 : 0o644 };
  })
  .filter(({ source }) => !/\.(test|spec)\.[^/]+$/.test(source) && !/\/test_[^/]+\.py$/.test(source));

for (const required of [...exact, `${extension}/src/daemon.mts`, `${extension}/ops/wtf-aleatory-provider.service`]) {
  if (!entries.some(({ source }) => source === required)) {
    throw new Error(`Required source is absent from commit ${commit}: ${required}`);
  }
}

const stage = await mkdtemp(path.join(tmpdir(), "wtf-aleatory-release-"));
try {
  const files = [];
  for (const { source, mode } of entries) {
    if (/(^|\/)\.env(?:\.|$)|(^|\/)(?:node_modules|secrets)(?:\/|$)|(?:master\.key|keyring.*\.json)$/.test(source)) {
      throw new Error(`Custody/configuration file cannot enter a release: ${source}`);
    }
    const destination = source === `${extension}/package.json` ? "package.json"
      : source === `${extension}/package-lock.json` ? "package-lock.json" : source;
    const bytes = git("show", `${commit}:${source}`);
    const target = path.join(stage, destination);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes, { mode });
    files.push({ path: destination, source, sha256: createHash("sha256").update(bytes).digest("hex"), mode });
  }
  const manifest = { format: "wtf-aleatory-provider-release-v1", gitCommit: commit, files };
  await writeFile(path.join(stage, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await mkdir(path.dirname(output), { recursive: true });
  // macOS tar otherwise adds AppleDouble metadata files outside the manifest.
  execFileSync("tar", ["-czf", output, "-C", stage, "."], {
    env: { ...process.env, COPYFILE_DISABLE: "1", LC_ALL: "C" },
  });
  const artifactSha256 = createHash("sha256").update(await readFile(output)).digest("hex");
  await writeFile(`${output}.sha256`, `${artifactSha256}  ${path.basename(output)}\n`);
  console.log(JSON.stringify({ artifact: output, sha256: artifactSha256, gitCommit: commit, files: files.length }));
} finally {
  await rm(stage, { recursive: true, force: true });
}
