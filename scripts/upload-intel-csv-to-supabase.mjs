#!/usr/bin/env node
/**
 * Upload the intel CSV tarball to Supabase Storage and emit a signed
 * URL that the "Import Intel CSV dump" GitHub workflow can consume.
 *
 * Uses the Supabase Storage REST API directly (no @supabase/* dep
 * required) so this stays self-contained and doesn't bloat the
 * production bundle.
 *
 * Required env:
 *   SUPABASE_URL               e.g. https://xxxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  (Project Settings → API → service_role key)
 *
 * Optional env:
 *   BUCKET      default: wtf-intel-backups  (auto-created if missing)
 *   TAR_PATH    default: /tmp/wtf-intel-csv.tar.gz
 *   OBJECT_NAME default: intel-2026-02-26.tar.gz
 *   SIGN_TTL    default: 7200  (seconds the signed URL stays valid)
 *
 * Output (stdout):
 *   signed_url <URL>
 *   sha256     <hex>
 *
 * Both values can be fed straight into the workflow inputs.
 */

import { readFileSync, statSync, createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env") });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SRV_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.BUCKET || "wtf-intel-backups";
const TAR_PATH = process.env.TAR_PATH || "/tmp/wtf-intel-csv.tar.gz";
const OBJECT_NAME = process.env.OBJECT_NAME || "intel-2026-02-26.tar.gz";
const SIGN_TTL = Number(process.env.SIGN_TTL || 7200);

if (!SUPABASE_URL || !SRV_KEY) {
  console.error(
    "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env or .env."
  );
  process.exit(1);
}

let stat;
try {
  stat = statSync(TAR_PATH);
} catch {
  console.error(`Tarball not found at ${TAR_PATH}. Run scripts/pack-intel-csv.sh first.`);
  process.exit(1);
}

const STORAGE_BASE = `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1`;
const headers = {
  Authorization: `Bearer ${SRV_KEY}`,
  apikey: SRV_KEY,
};

async function json(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${init.method || "GET"} ${url} → ${res.status} ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function ensureBucket() {
  try {
    await json(`${STORAGE_BASE}/bucket/${encodeURIComponent(BUCKET)}`);
  } catch (e) {
    if (!String(e).includes("404")) throw e;
    console.error(`[upload] creating bucket "${BUCKET}" (private)…`);
    await json(`${STORAGE_BASE}/bucket`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
    });
  }
}

async function upload() {
  console.error(
    `[upload] ${TAR_PATH} (${(stat.size / 1024 / 1024).toFixed(1)}MB) → ${BUCKET}/${OBJECT_NAME}`
  );
  // Use upsert so re-runs replace the previous object cleanly.
  const url = `${STORAGE_BASE}/object/${encodeURIComponent(
    BUCKET
  )}/${encodeURIComponent(OBJECT_NAME)}`;
  const body = readFileSync(TAR_PATH);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/gzip",
      "x-upsert": "true",
      "Cache-Control": "max-age=3600",
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed: ${res.status} ${text.slice(0, 400)}`);
  }
}

async function sign() {
  const url = `${STORAGE_BASE}/object/sign/${encodeURIComponent(
    BUCKET
  )}/${encodeURIComponent(OBJECT_NAME)}`;
  const body = JSON.stringify({ expiresIn: SIGN_TTL });
  const data = await json(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const signedPath = data.signedURL || data.signedUrl;
  if (!signedPath) throw new Error(`No signed URL in response: ${JSON.stringify(data)}`);
  return `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1${signedPath}`;
}

async function sha256(path) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const s = createReadStream(path);
    s.on("data", (c) => hash.update(c));
    s.on("end", resolve);
    s.on("error", reject);
  });
  return hash.digest("hex");
}

async function main() {
  await ensureBucket();
  const digest = await sha256(TAR_PATH);
  await upload();
  const signedUrl = await sign();
  console.log(`signed_url ${signedUrl}`);
  console.log(`sha256     ${digest}`);
}

main().catch((e) => {
  console.error(String(e.stack || e.message || e));
  process.exit(1);
});
