/**
 * Nightly off-site backup: pg_dump the Hetzner Postgres + upload to
 * Supabase Storage.  Registered with the cockpit scheduler so every
 * run is audited in `sync_runs` and observable from the Sync tab.
 *
 * Implementation notes:
 *   - `postgresql-client` (pg_dump) and `curl` are both in the app
 *     runtime image (see Dockerfile).  No new npm deps are added —
 *     the user's project rule forbids external JS libs that aren't
 *     bundled locally.  Shelling out to curl also streams the dump
 *     file straight from disk instead of buffering it in Node memory.
 *   - If SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing the job
 *     records a `skipped` sync_runs row and returns.  Dev environments
 *     and forks without Supabase credentials stay functional.
 *   - Bucket creation is idempotent (POST then swallow "already
 *     exists").  Local and remote rotation are handled in the same
 *     pass so a 7-day disk window is never in disagreement with
 *     Supabase's 30-day off-site window.
 */

import { exec, spawn } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";
import path from "path";
import { register as registerJob } from "./scheduler";
import type { JobResult } from "./scheduler";

const execAsync = promisify(exec);

const BACKUP_DIR = process.env.BACKUP_DIR || "/app/backups";
const LOCAL_KEEP_DAYS = Number(process.env.BACKUP_LOCAL_KEEP_DAYS || 7);
const REMOTE_KEEP_DAYS = Number(process.env.BACKUP_REMOTE_KEEP_DAYS || 30);
const BUCKET_NAME = process.env.SUPABASE_BACKUP_BUCKET || "wtf-backups";

const DAILY_MS = 24 * 60 * 60 * 1000;

type SupabaseCreds = {
  url: string;
  serviceRoleKey: string;
};

function getSupabaseCreds(): SupabaseCreds | null {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL || "";
  if (!url) throw new Error("DATABASE_URL must be set for backups");
  return url;
}

function iso() {
  return new Date().toISOString().replace(/[:.]/g, "-").replace("Z", "Z");
}

/**
 * Ensure the backup bucket exists.  Only a 200/201 is a fresh
 * creation.  Anything else we check against the specific Supabase
 * "already exists" error body — never swallow a generic 400, which
 * could be "invalid key", "bad payload", etc.  If the bucket was
 * actually mis-created the upload step will then fail loudly with
 * a readable error.
 */
async function ensureBucket(creds: SupabaseCreds): Promise<void> {
  // Check first — this is cheap and avoids writing on every tick.
  const get = await fetch(
    `${creds.url}/storage/v1/bucket/${encodeURIComponent(BUCKET_NAME)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${creds.serviceRoleKey}` },
    }
  );
  if (get.ok) return;

  const create = await fetch(`${creds.url}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: BUCKET_NAME, public: false }),
  });
  if (create.ok) {
    console.log(`[supabase-backup] created bucket "${BUCKET_NAME}"`);
    return;
  }
  const body = await create.text().catch(() => "");
  const isDuplicate =
    create.status === 409 ||
    /already exists/i.test(body) ||
    /Duplicate/i.test(body);
  if (isDuplicate) return;
  throw new Error(
    `ensureBucket failed (GET ${get.status}, POST ${create.status}): ${body.slice(0, 400)}`
  );
}

/**
 * Upload a file to Supabase Storage via `curl`.  Captures both the
 * HTTP status code and the response body so that 4xx/5xx errors
 * surface Supabase's actual message rather than a bare "exit 22".
 */
async function uploadFile(
  creds: SupabaseCreds,
  localPath: string,
  remoteName: string
): Promise<number> {
  const stat = await fs.stat(localPath);
  // Use `--write-out` to append the status code after the body so we
  // can parse both from curl's stdout in a single subprocess.  Drop
  // `-f` (fail on HTTP >=400) so we still receive the response body.
  const args = [
    "-sS",
    "-X",
    "POST",
    "-H",
    `Authorization: Bearer ${creds.serviceRoleKey}`,
    "-H",
    "Content-Type: application/octet-stream",
    "-H",
    "x-upsert: true",
    "--data-binary",
    `@${localPath}`,
    "-w",
    "\n__HTTP_STATUS__%{http_code}",
    `${creds.url}/storage/v1/object/${encodeURIComponent(BUCKET_NAME)}/${encodeURIComponent(remoteName)}`,
  ];

  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn("curl", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code: number | null) => {
      if (code !== 0) {
        reject(
          new Error(
            `curl exited ${code}: ${stderr.slice(0, 500).trim() || stdout.slice(0, 500).trim()}`
          )
        );
        return;
      }
      resolve(stdout);
    });
  });

  const m = output.match(/__HTTP_STATUS__(\d+)\s*$/);
  const status = m ? Number(m[1]) : 0;
  const body = m ? output.slice(0, m.index).trim() : output.trim();
  if (status >= 200 && status < 300) return stat.size;

  throw new Error(
    `upload to supabase://${BUCKET_NAME}/${remoteName} failed (HTTP ${status}): ${body.slice(0, 500)}`
  );
}

type RemoteObject = { name: string; created_at?: string; updated_at?: string };

async function listRemote(creds: SupabaseCreds): Promise<RemoteObject[]> {
  const res = await fetch(
    `${creds.url}/storage/v1/object/list/${encodeURIComponent(BUCKET_NAME)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        limit: 1000,
        offset: 0,
        sortBy: { column: "name", order: "asc" },
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`listRemote failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return (await res.json()) as RemoteObject[];
}

async function deleteRemote(
  creds: SupabaseCreds,
  names: string[]
): Promise<void> {
  if (names.length === 0) return;
  const res = await fetch(
    `${creds.url}/storage/v1/object/${encodeURIComponent(BUCKET_NAME)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${creds.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: names }),
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `deleteRemote failed (${res.status}): ${body.slice(0, 300)}`
    );
  }
}

async function pruneLocal(): Promise<number> {
  let deleted = 0;
  const cutoff = Date.now() - LOCAL_KEEP_DAYS * DAILY_MS;
  const entries = await fs.readdir(BACKUP_DIR).catch(() => [] as string[]);
  for (const name of entries) {
    if (!/^wtf_.*\.dump$/.test(name)) continue;
    const full = path.join(BACKUP_DIR, name);
    const stat = await fs.stat(full).catch(() => null);
    if (!stat) continue;
    if (stat.mtimeMs < cutoff) {
      await fs.unlink(full).catch(() => {});
      deleted += 1;
    }
  }
  return deleted;
}

async function pruneRemote(creds: SupabaseCreds): Promise<number> {
  const objects = await listRemote(creds);
  const cutoff = Date.now() - REMOTE_KEEP_DAYS * DAILY_MS;
  const stale = objects
    .filter((o) => {
      if (!o.name || !/^wtf_.*\.dump$/.test(o.name)) return false;
      const ts = o.updated_at || o.created_at;
      if (!ts) return false;
      const t = Date.parse(ts);
      return Number.isFinite(t) && t < cutoff;
    })
    .map((o) => o.name);
  if (stale.length) await deleteRemote(creds, stale);
  return stale.length;
}

export type BackupResult = JobResult & {
  skipped?: boolean;
  reason?: string;
  remoteName?: string;
  sizeBytes?: number;
  localPruned?: number;
  remotePruned?: number;
};

/**
 * Body of the `supabase-backup` scheduler job.  Safe to invoke from
 * the manual-trigger endpoint too — re-entry is prevented by the
 * scheduler's per-job `running` flag.
 */
export async function runSupabaseBackup(): Promise<BackupResult> {
  const creds = getSupabaseCreds();
  if (!creds) {
    const msg =
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set to run off-site backups";
    console.warn(`[supabase-backup] ${msg}`);
    return { skipped: true, reason: msg };
  }

  await fs.mkdir(BACKUP_DIR, { recursive: true });

  const ts = iso();
  const filename = `wtf_${ts}.dump`;
  const filepath = path.join(BACKUP_DIR, filename);

  console.log(`[supabase-backup] pg_dump → ${filepath}`);
  const dbUrl = getDatabaseUrl();
  // `--format=custom --no-owner` matches scripts/backup-db.sh so
  // `pg_restore` behaves identically across the two code paths.
  await execAsync(
    `pg_dump --format=custom --no-owner --file="${filepath}" "${dbUrl}"`,
    {
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, PGCONNECT_TIMEOUT: "15" },
    }
  );
  const stat = await fs.stat(filepath);
  console.log(
    `[supabase-backup] wrote ${(stat.size / 1024 / 1024).toFixed(2)} MB`
  );

  await ensureBucket(creds);
  const sizeBytes = await uploadFile(creds, filepath, filename);
  console.log(
    `[supabase-backup] uploaded to supabase://${BUCKET_NAME}/${filename}`
  );

  const localPruned = await pruneLocal();
  const remotePruned = await pruneRemote(creds).catch((err) => {
    console.warn(`[supabase-backup] remote prune failed:`, err);
    return 0;
  });

  return {
    itemsIn: sizeBytes,
    itemsOut: 1,
    remoteName: filename,
    sizeBytes,
    localPruned,
    remotePruned,
    cursorAfter: {
      bucket: BUCKET_NAME,
      remoteName: filename,
      sizeBytes,
      uploadedAt: new Date().toISOString(),
    },
  };
}

/** Register the nightly backup job with the scheduler. */
export function registerSupabaseBackup(): void {
  registerJob({
    name: "supabase-backup",
    fn: async () => {
      const r = await runSupabaseBackup();
      if (r.skipped) {
        return { itemsIn: 0, itemsOut: 0, cursorAfter: { skipped: true, reason: r.reason } };
      }
      return r;
    },
    intervalMs: DAILY_MS,
    // Delay first run 10 minutes so it never competes with boot-time
    // portfolio-sync + holdings-derive for DB connections.
    initialDelayMs: 10 * 60 * 1000,
    scope: BUCKET_NAME,
  });
}

