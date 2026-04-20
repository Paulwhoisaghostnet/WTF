#!/usr/bin/env node
/**
 * Multi-part uploader for the Intel / Guidance CSV tarball.
 *
 * Supabase Storage enforces a 50MB hard cap per object on the project
 * tier we're on, so anything over that has to be split.  This script
 *
 *   1. splits $TAR_PATH into N parts of $PART_BYTES bytes
 *      (default 40MB — well under the 50MB cap),
 *   2. computes SHA256 for each part plus the whole tarball,
 *   3. uploads each part to Supabase under $OBJECT_PREFIX.partNN,
 *   4. writes a manifest.json containing signed URLs + hashes for
 *      every part and for the reassembled whole,
 *   5. uploads manifest.json to Supabase and signs it,
 *   6. prints the manifest's signed URL + the whole-tar SHA256 so
 *      the GitHub Actions `Import Intel CSV dump` workflow can be
 *      triggered straight from stdout:
 *
 *         manifest_url <URL>
 *         sha256       <hex>
 *
 * The remote `.github/workflows/import-intel-csv.yml` already knows
 * how to consume this manifest shape (see import.yml → "Write remote
 * import script"):
 *
 *   {
 *     "object_prefix":  "guidance-2026-04-20",
 *     "wholeSha256":    "…",
 *     "parts": [
 *       { "name":"part-aaaa", "size":41943040, "sha256":"…", "signedUrl":"…" },
 *       …
 *     ]
 *   }
 *
 * Required env:
 *   SUPABASE_URL               e.g. https://xxxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  service_role key (Project Settings → API)
 *
 * Optional env:
 *   BUCKET            default: wtf-intel-backups  (created if missing)
 *   TAR_PATH          default: /tmp/wtf-guidance-csv.tar.gz
 *   OBJECT_PREFIX     default: guidance-<today>  (used to namespace parts)
 *   MANIFEST_NAME     default: <OBJECT_PREFIX>.manifest.json
 *   PART_BYTES        default: 41943040  (40MB; must be ≤ 50MB cap)
 *   SIGN_TTL          default: 7200      (seconds, for each signed URL)
 *   SKIP_SPLIT        default: ""        (set=1 to reuse existing
 *                                         /tmp/guidance-parts/part-*)
 *   PARTS_DIR         default: /tmp/guidance-parts
 */

import {
  createReadStream,
  statSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env") });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SRV_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.BUCKET || "wtf-intel-backups";
const TAR_PATH = process.env.TAR_PATH || "/tmp/wtf-guidance-csv.tar.gz";
const OBJECT_PREFIX =
  process.env.OBJECT_PREFIX ||
  `guidance-${new Date().toISOString().slice(0, 10)}`;
const MANIFEST_NAME =
  process.env.MANIFEST_NAME || `${OBJECT_PREFIX}.manifest.json`;
const PART_BYTES = Number(process.env.PART_BYTES || 40 * 1024 * 1024);
const SIGN_TTL = Number(process.env.SIGN_TTL || 7200);
const SKIP_SPLIT = process.env.SKIP_SPLIT === "1";
const PARTS_DIR = process.env.PARTS_DIR || "/tmp/guidance-parts";

if (!SUPABASE_URL || !SRV_KEY) {
  console.error(
    "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env or .env."
  );
  process.exit(1);
}

if (PART_BYTES > 45 * 1024 * 1024) {
  console.error(
    `PART_BYTES=${PART_BYTES} is too close to Supabase's 50MB cap. ` +
      `Use ≤ 45MB to leave headroom.`
  );
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
    throw new Error(
      `${init.method || "GET"} ${url} → ${res.status} ${text.slice(0, 300)}`
    );
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

function sha256File(path) {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    const s = createReadStream(path);
    s.on("data", (c) => h.update(c));
    s.on("end", () => resolve(h.digest("hex")));
    s.on("error", reject);
  });
}

function splitTarball() {
  if (SKIP_SPLIT && existsSync(PARTS_DIR)) {
    const existing = readdirSync(PARTS_DIR)
      .filter((f) => f.startsWith("part-"))
      .sort();
    if (existing.length) {
      console.error(
        `[upload] SKIP_SPLIT=1 → reusing ${existing.length} existing parts in ${PARTS_DIR}`
      );
      return existing.map((f) => join(PARTS_DIR, f));
    }
  }

  // Wipe + recreate to guarantee a clean set of parts.  The split(1)
  // suffix length of 4 gives us up to 26^4 parts — plenty.
  rmSync(PARTS_DIR, { recursive: true, force: true });
  mkdirSync(PARTS_DIR, { recursive: true });

  console.error(
    `[upload] splitting ${TAR_PATH} into ${(PART_BYTES / 1024 / 1024).toFixed(0)}MB parts → ${PARTS_DIR}`
  );
  const r = spawnSync(
    "split",
    ["-b", String(PART_BYTES), "-a", "4", TAR_PATH, `${PARTS_DIR}/part-`],
    { stdio: "inherit" }
  );
  if (r.status !== 0) throw new Error(`split exited with ${r.status}`);

  return readdirSync(PARTS_DIR)
    .filter((f) => f.startsWith("part-"))
    .sort()
    .map((f) => join(PARTS_DIR, f));
}

// Encode each path segment individually so `/` stays literal.  Using
// encodeURIComponent on the full object name double-encodes slashes
// into %2F, which makes Supabase sign a non-existent path and return
// `InvalidSignature` on download.
function encodeObjectPath(objectName) {
  return objectName
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

async function uploadFile(objectName, path, contentType) {
  const url = `${STORAGE_BASE}/object/${encodeURIComponent(
    BUCKET
  )}/${encodeObjectPath(objectName)}`;
  const body = readFileSync(path);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": contentType,
      "x-upsert": "true",
      "Cache-Control": "max-age=3600",
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `upload ${objectName} failed: ${res.status} ${text.slice(0, 400)}`
    );
  }
}

async function signUrl(objectName) {
  const url = `${STORAGE_BASE}/object/sign/${encodeURIComponent(
    BUCKET
  )}/${encodeObjectPath(objectName)}`;
  const data = await json(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: SIGN_TTL }),
  });
  const signedPath = data.signedURL || data.signedUrl;
  if (!signedPath)
    throw new Error(`No signed URL in response: ${JSON.stringify(data)}`);
  return `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1${signedPath}`;
}

async function main() {
  try {
    statSync(TAR_PATH);
  } catch {
    console.error(
      `Tarball not found at ${TAR_PATH}. Run scripts/pack-intel-csv.sh (or the Guidance exporter) first.`
    );
    process.exit(1);
  }

  await ensureBucket();

  console.error(`[upload] hashing whole tarball ${TAR_PATH}…`);
  const wholeSha = await sha256File(TAR_PATH);

  const partPaths = splitTarball();

  const parts = [];
  for (const partPath of partPaths) {
    const name = `${OBJECT_PREFIX}/${partPath.split("/").pop()}`;
    const size = statSync(partPath).size;
    console.error(
      `[upload] ${partPath} (${(size / 1024 / 1024).toFixed(1)}MB) → ${BUCKET}/${name}`
    );
    const sha = await sha256File(partPath);
    await uploadFile(name, partPath, "application/octet-stream");
    const signedUrl = await signUrl(name);
    parts.push({ name: partPath.split("/").pop(), size, sha256: sha, signedUrl });
  }

  const manifest = {
    objectPrefix: OBJECT_PREFIX,
    tarPath: TAR_PATH,
    wholeSha256: wholeSha,
    createdAt: new Date().toISOString(),
    parts,
  };
  const manifestTmpPath = join(PARTS_DIR, "manifest.json");
  writeFileSync(manifestTmpPath, JSON.stringify(manifest, null, 2));
  console.error(`[upload] uploading manifest → ${BUCKET}/${MANIFEST_NAME}`);
  await uploadFile(MANIFEST_NAME, manifestTmpPath, "application/json");
  const manifestSignedUrl = await signUrl(MANIFEST_NAME);

  console.log(`manifest_url ${manifestSignedUrl}`);
  console.log(`sha256       ${wholeSha}`);
  console.log(`parts        ${parts.length}`);
}

main().catch((e) => {
  console.error(String(e.stack || e.message || e));
  process.exit(1);
});
