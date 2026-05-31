import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");
const outFile = join(packageRoot, "dist", "bin.js");

mkdirSync(dirname(outFile), { recursive: true });

await esbuild.build({
  entryPoints: [join(packageRoot, "src", "bin.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: outFile,
  banner: {
    js: "#!/usr/bin/env node",
  },
  alias: {
    "@shared/wtfos-cli": join(packageRoot, "../../shared/wtfos-cli/index.ts"),
    "@shared/platform-branding": join(packageRoot, "../../shared/platform-branding.ts"),
  },
  logLevel: "info",
});

writeFileSync(outFile, (await import("node:fs")).readFileSync(outFile, "utf8"), { mode: 0o755 });

console.log(`Built ${outFile}`);
