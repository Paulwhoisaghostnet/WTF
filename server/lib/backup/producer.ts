import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { BackupProducer } from "./targets/base";

const execFileAsync = promisify(execFile);

export const BACKUP_DIR = process.env.BACKUP_DIR || "/app/backups";

function isoForFilename(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").replace("Z", "Z");
}

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL || "";
  if (!url) throw new Error("DATABASE_URL must be set for backups");
  return url;
}

export async function sha256File(filepath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filepath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

export async function createPgDump(): Promise<BackupProducer> {
  await fs.mkdir(BACKUP_DIR, { recursive: true });

  const filename = `wtf_${isoForFilename()}.dump`;
  const filepath = path.join(BACKUP_DIR, filename);

  await execFileAsync(
    "pg_dump",
    ["--format=custom", "--no-owner", `--file=${filepath}`, getDatabaseUrl()],
    {
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, PGCONNECTTIMEOUT: "15" },
    }
  );

  const stat = await fs.stat(filepath);
  return {
    kind: "pg_dump",
    status: "ok",
    filename,
    filepath,
    bytes: stat.size,
    sha256: await sha256File(filepath),
    createdAt: new Date().toISOString(),
  };
}
