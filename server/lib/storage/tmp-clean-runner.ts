import { promises as fs } from "node:fs";
import path from "node:path";
import { planTmpCleanup, type TmpCleanupEntry } from "./tmp-clean";
import { MEDIA_STAGING_DIR, TMP_PROCESSING_DIR, assertInsideRoot } from "./paths";

const DEFAULT_TMP_MIN_AGE_MS = 6 * 60 * 60 * 1000;

async function walk(root: string, out: TmpCleanupEntry[]): Promise<void> {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    const stat = await fs.stat(full).catch(() => null);
    if (!stat) continue;
    if (entry.isDirectory()) {
      out.push({ path: full, mtimeMs: stat.mtimeMs, type: "directory" });
      await walk(full, out);
    } else {
      out.push({ path: full, mtimeMs: stat.mtimeMs, type: "file" });
    }
  }
}

export async function runTmpCleanup(opts: {
  dryRun?: boolean;
  minAgeMs?: number;
  roots?: string[];
} = {}) {
  const roots = opts.roots ?? [TMP_PROCESSING_DIR, MEDIA_STAGING_DIR];
  const minAgeMs = opts.minAgeMs ?? Number(process.env.TMP_CLEAN_MIN_AGE_MS || DEFAULT_TMP_MIN_AGE_MS);
  const entries: TmpCleanupEntry[] = [];
  for (const root of roots) {
    await fs.mkdir(root, { recursive: true });
    await walk(root, entries);
  }
  const plan = planTmpCleanup({
    nowMs: Date.now(),
    minAgeMs,
    roots,
    entries,
  });
  if (!opts.dryRun) {
    for (const filePath of plan.remove) {
      const root = roots.find((candidate) => {
        const rel = path.relative(path.resolve(candidate), path.resolve(filePath));
        return rel && !rel.startsWith("..") && !path.isAbsolute(rel);
      });
      if (!root) continue;
      assertInsideRoot(filePath, root);
      await fs.unlink(filePath).catch(() => undefined);
    }
  }
  return {
    dryRun: Boolean(opts.dryRun),
    minAgeMs,
    roots,
    removeCount: plan.remove.length,
    skippedUnsafe: plan.skippedUnsafe,
    skippedYoung: plan.skippedYoung,
    skippedProtected: plan.skippedProtected,
    paths: plan.remove.map((filePath) => filePath),
  };
}

