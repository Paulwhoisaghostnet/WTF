import { promises as fs } from "node:fs";
import path from "node:path";
import { BACKUP_DIR, sha256File } from "./producer";
import type { BackupProducer } from "./targets/base";

export async function latestLocalDump(): Promise<BackupProducer | null> {
  const entries = await fs.readdir(BACKUP_DIR).catch(() => [] as string[]);
  const dumps = await Promise.all(
    entries
      .filter((name) => /^wtf_.*\.dump$/.test(name))
      .map(async (name) => {
        const filepath = path.join(BACKUP_DIR, name);
        const stat = await fs.stat(filepath).catch(() => null);
        return stat ? { name, filepath, stat } : null;
      })
  );
  const newest = dumps
    .filter((dump): dump is NonNullable<typeof dump> => Boolean(dump))
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)[0];

  if (!newest) return null;

  return {
    kind: "fallback",
    status: "ok",
    sourceTarget: "local",
    filename: newest.name,
    filepath: newest.filepath,
    bytes: newest.stat.size,
    sha256: await sha256File(newest.filepath),
    createdAt: new Date(newest.stat.mtimeMs).toISOString(),
  };
}
