import type { BackupTarget } from "./base";
import { timedTarget } from "./base";
import { logSystemEvent } from "../../system-log";

const BUCKET_NAME = process.env.SUPABASE_BACKUP_BUCKET || "wtf-backups";
const FREE_TIER_BYTES = Number(
  process.env.SUPABASE_BACKUP_FREE_TIER_BYTES || 1024 * 1024 * 1024
);

type SupabaseCreds = {
  url: string;
  serviceRoleKey: string;
};

type RemoteObject = {
  name: string;
  metadata?: { size?: number | string } | null;
};

function getSupabaseCreds(): SupabaseCreds | null {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

function authHeaders(creds: SupabaseCreds): Record<string, string> {
  return {
    apikey: creds.serviceRoleKey,
    Authorization: `Bearer ${creds.serviceRoleKey}`,
  };
}

async function ensureBucket(creds: SupabaseCreds): Promise<void> {
  const get = await fetch(
    `${creds.url}/storage/v1/bucket/${encodeURIComponent(BUCKET_NAME)}`,
    { method: "GET", headers: authHeaders(creds) }
  );
  if (get.ok) return;

  const create = await fetch(`${creds.url}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      ...authHeaders(creds),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: BUCKET_NAME, public: false }),
  });
  if (create.ok) return;

  const body = await create.text().catch(() => "");
  if (
    create.status === 409 ||
    /already exists/i.test(body) ||
    /Duplicate/i.test(body)
  ) {
    return;
  }
  throw new Error(
    `ensureBucket failed (GET ${get.status}, POST ${create.status}): ${body.slice(0, 400)}`
  );
}

async function listRemote(creds: SupabaseCreds): Promise<RemoteObject[]> {
  const res = await fetch(
    `${creds.url}/storage/v1/object/list/${encodeURIComponent(BUCKET_NAME)}`,
    {
      method: "POST",
      headers: {
        ...authHeaders(creds),
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

async function estimateUsedBytes(creds: SupabaseCreds): Promise<number> {
  const objects = await listRemote(creds).catch(() => []);
  return objects.reduce((sum, object) => {
    const size = Number(object.metadata?.size ?? 0);
    return sum + (Number.isFinite(size) ? size : 0);
  }, 0);
}

async function uploadJson(
  creds: SupabaseCreds,
  remoteName: string,
  payload: unknown
): Promise<number> {
  const body = JSON.stringify(payload, null, 2);
  const bytes = Buffer.byteLength(body);
  const res = await fetch(
    `${creds.url}/storage/v1/object/${encodeURIComponent(BUCKET_NAME)}/${remoteName}`,
    {
      method: "POST",
      headers: {
        ...authHeaders(creds),
        "Content-Type": "application/json",
        "Cache-Control": "3600",
        "x-upsert": "true",
      },
      body,
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`manifest upload failed (${res.status}): ${text.slice(0, 400)}`);
  }
  return bytes;
}

export const supabaseTarget: BackupTarget = {
  name: "supabase",
  run: (artifact) =>
    timedTarget("supabase", async () => {
      const mode = (process.env.SUPABASE_BACKUP_MODE || "manifest").toLowerCase();
      if (mode === "disabled") {
        return { status: "skipped", reason: "disabled", bytes: 0 };
      }

      const creds = getSupabaseCreds();
      if (!creds) {
        return {
          status: "skipped",
          reason: "missing_supabase_credentials",
          bytes: 0,
        };
      }

      await ensureBucket(creds);
      const usedBytes = await estimateUsedBytes(creds);
      const remainingBytes = Math.max(0, FREE_TIER_BYTES - usedBytes);

      if (mode === "full" && artifact.bytes > remainingBytes) {
        logSystemEvent({
          source: "backup",
          eventType: "supabase_free_tier_exceeded",
          severity: "error",
          message: "Supabase free-tier storage cannot fit the backup dump",
          metadata: {
            bucket: BUCKET_NAME,
            artifactBytes: artifact.bytes,
            remainingBytes,
            usedBytes,
          },
        });
        return {
          status: "error",
          reason: "supabase_free_tier_exceeded",
          bytes: 0,
          metadata: { bucket: BUCKET_NAME, artifactBytes: artifact.bytes, remainingBytes },
        };
      }

      const manifestName = `manifests/${artifact.filename}.json`;
      const manifestBytes = await uploadJson(creds, manifestName, {
        version: 1,
        mode: "manifest",
        bucket: BUCKET_NAME,
        filename: artifact.filename,
        bytes: artifact.bytes,
        sha256: artifact.sha256,
        producerKind: artifact.kind,
        sourceTarget: artifact.kind === "fallback" ? artifact.sourceTarget : null,
        createdAt: artifact.createdAt,
        uploadedAt: new Date().toISOString(),
        note:
          mode === "full"
            ? "Full dump exceeded available free-tier storage; manifest stored instead."
            : "Supabase free tier stores backup manifests only; dump bytes stay local until long-term remote targets are configured.",
      });

      return {
        status: "ok",
        bytes: manifestBytes,
        sha256Match: true,
        metadata: {
          bucket: BUCKET_NAME,
          remoteName: manifestName,
          mode: "manifest",
          usedBytes,
          remainingBytes,
          dumpBytes: artifact.bytes,
        },
      };
    }),
};
