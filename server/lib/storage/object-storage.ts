import { createReadStream, createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import {
  GetObjectCommand,
  HeadBucketCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type _Object,
} from "@aws-sdk/client-s3";

export type ObjectStorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

export type ObjectStorageUsageEstimate = {
  usedBytes: number;
  objectCount: number;
  source: "s3-list";
};

let cachedClient: S3Client | null = null;
let cachedClientKey = "";

function boolEnv(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === "") return fallback;
  return /^(1|true|yes|on)$/i.test(value.trim());
}

function normalizeEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed.replace(/\/+$/, "") : `https://${trimmed}`;
}

export function getObjectStorageConfig(): ObjectStorageConfig | null {
  const endpoint = normalizeEndpoint(process.env.S3_ENDPOINT || "");
  const region = (process.env.S3_REGION || "fsn1").trim();
  const bucket = (process.env.S3_BUCKET || "").trim();
  const accessKeyId = (process.env.S3_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || "";
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: boolEnv(process.env.S3_FORCE_PATH_STYLE, false),
  };
}

export function requireObjectStorageConfig(): ObjectStorageConfig {
  const config = getObjectStorageConfig();
  if (!config) {
    throw new Error(
      "Object Storage is not configured. Set S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY."
    );
  }
  return config;
}

export function objectStorageClient(config = requireObjectStorageConfig()): S3Client {
  const key = JSON.stringify({
    endpoint: config.endpoint,
    region: config.region,
    bucket: config.bucket,
    accessKeyId: config.accessKeyId,
    forcePathStyle: config.forcePathStyle,
  });
  if (!cachedClient || cachedClientKey !== key) {
    cachedClient = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    cachedClientKey = key;
  }
  return cachedClient;
}

export async function verifyObjectStorageAccess(): Promise<{
  ok: boolean;
  bucket: string | null;
  endpoint: string | null;
  error?: string;
}> {
  const config = getObjectStorageConfig();
  if (!config) {
    return {
      ok: false,
      bucket: null,
      endpoint: null,
      error: "missing_object_storage_env",
    };
  }
  try {
    await objectStorageClient(config).send(new HeadBucketCommand({ Bucket: config.bucket }));
    return { ok: true, bucket: config.bucket, endpoint: config.endpoint };
  } catch (error) {
    return {
      ok: false,
      bucket: config.bucket,
      endpoint: config.endpoint,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function putObjectFromFile(input: {
  key: string;
  filePath: string;
  contentType: string;
  contentLength: number;
  metadata?: Record<string, string>;
}): Promise<{ bucket: string; key: string; endpoint: string; region: string }> {
  const config = requireObjectStorageConfig();
  await objectStorageClient(config).send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: input.key,
      Body: createReadStream(input.filePath),
      ContentLength: input.contentLength,
      ContentType: input.contentType,
      Metadata: input.metadata,
    })
  );
  return {
    bucket: config.bucket,
    key: input.key,
    endpoint: config.endpoint,
    region: config.region,
  };
}

export async function putObjectBuffer(input: {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
  metadata?: Record<string, string>;
}): Promise<{ bucket: string; key: string; endpoint: string; region: string }> {
  const config = requireObjectStorageConfig();
  const bodyBuffer =
    typeof input.body === "string"
      ? Buffer.from(input.body)
      : Buffer.isBuffer(input.body)
        ? input.body
        : Buffer.from(input.body);
  await objectStorageClient(config).send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: input.key,
      Body: bodyBuffer,
      ContentLength: bodyBuffer.length,
      ContentType: input.contentType,
      Metadata: input.metadata,
    })
  );
  return {
    bucket: config.bucket,
    key: input.key,
    endpoint: config.endpoint,
    region: config.region,
  };
}

export async function deleteObject(input: {
  bucket?: string | null;
  key: string;
}): Promise<void> {
  const config = requireObjectStorageConfig();
  await objectStorageClient(config).send(
    new DeleteObjectCommand({
      Bucket: input.bucket || config.bucket,
      Key: input.key,
    })
  );
}

export async function downloadObjectToFile(input: {
  bucket?: string | null;
  key: string;
  destinationPath: string;
}): Promise<{ contentType: string | null; contentLength: number | null }> {
  const config = requireObjectStorageConfig();
  const bucket = input.bucket || config.bucket;
  await fs.mkdir(path.dirname(input.destinationPath), { recursive: true });
  const result = await objectStorageClient(config).send(
    new GetObjectCommand({ Bucket: bucket, Key: input.key })
  );
  if (!result.Body) throw new Error(`Object has no response body: ${bucket}/${input.key}`);
  await pipeline(result.Body as NodeJS.ReadableStream, createWriteStream(input.destinationPath));
  return {
    contentType: result.ContentType || null,
    contentLength: typeof result.ContentLength === "number" ? result.ContentLength : null,
  };
}

export async function listObjectStorageUsage(): Promise<ObjectStorageUsageEstimate> {
  const config = requireObjectStorageConfig();
  let continuationToken: string | undefined;
  let usedBytes = 0;
  let objectCount = 0;
  do {
    const page = await objectStorageClient(config).send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        ContinuationToken: continuationToken,
      })
    );
    for (const object of page.Contents ?? []) {
      const entry = object as _Object;
      usedBytes += Number(entry.Size ?? 0);
      objectCount += 1;
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return { usedBytes, objectCount, source: "s3-list" };
}
