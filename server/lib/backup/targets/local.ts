import { promises as fs } from "node:fs";
import path from "node:path";
import { BACKUP_DIR } from "../producer";
import { verifyLocalArtifact } from "../verify";
import type { BackupTarget } from "./base";
import { timedTarget } from "./base";
import { logSystemEvent } from "../../system-log";

const DAY_MS = 24 * 60 * 60 * 1000;
const LOCAL_KEEP_DAYS = Number(process.env.BACKUP_LOCAL_KEEP_DAYS || 2);

export async function sweepLocalBackups(): Promise<{ deleted: number; failures: number }> {
  const cutoff = Date.now() - LOCAL_KEEP_DAYS * DAY_MS;
  const entries = await fs.readdir(BACKUP_DIR).catch(() => [] as string[]);
  let deleted = 0;
  let failures = 0;

  for (const name of entries) {
    if (!/^wtf_.*\.dump$/.test(name)) continue;
    const full = path.join(BACKUP_DIR, name);
    const stat = await fs.stat(full).catch(() => null);
    if (!stat || stat.mtimeMs >= cutoff) continue;
    try {
      await fs.unlink(full);
      deleted += 1;
    } catch (error) {
      failures += 1;
      logSystemEvent({
        source: "backup",
        eventType: "local_prune_failed",
        severity: "warn",
        message: `Failed to prune local backup ${name}`,
        metadata: { path: full },
        error,
      });
    }
  }

  return { deleted, failures };
}

export const localTarget: BackupTarget = {
  name: "local",
  run: (artifact) =>
    timedTarget("local", async () => {
      const exists = await fs.stat(artifact.filepath).catch(() => null);
      if (!exists) {
        return {
          status: "skipped",
          reason: "missing_local_artifact",
          bytes: 0,
          sha256Match: false,
        };
      }
      const pruned = await sweepLocalBackups();
      const verified = await verifyLocalArtifact(artifact);
      return {
        status: verified.sha256Match ? "ok" : "error",
        bytes: verified.bytes,
        sha256Match: verified.sha256Match,
        metadata: {
          filename: artifact.filename,
          pruned,
        },
      };
    }),
};
