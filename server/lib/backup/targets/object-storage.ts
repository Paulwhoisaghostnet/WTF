import { createReadStream } from "node:fs";
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  getObjectStorageConfig,
  objectStorageClient,
  type ObjectStorageConfig,
} from "../../storage/object-storage";
import type { BackupProducer, BackupTargetResult } from "./base";
import { timedTarget } from "./base";

export type ImmutableBackupObjectConfiguration = {
  bucket: string;
  prefix: string;
  retentionDays: number;
};

export type ImmutableBackupObjectAdapter = {
  configuration(): ImmutableBackupObjectConfiguration | null;
  upload(input: {
    bucket: string;
    key: string;
    filepath: string;
    bytes: number;
    sha256: string;
    retainedUntil: Date;
  }): Promise<{ key: string }>;
  inspect(input: { bucket: string; key: string }): Promise<{
    bytes: number;
    sha256: string | null;
    objectLockMode: string | null;
    retainedUntil: Date | null;
  }>;
};

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error("BACKUP_S3_OBJECT_LOCK_DAYS must be a positive integer");
  }
  return parsed;
}

function normalizedPrefix(value: string): string {
  const prefix = value.trim().replace(/^\/+|\/+$/gu, "");
  if (!prefix || prefix.includes("..") || !/^[a-zA-Z0-9/_-]+$/u.test(prefix)) {
    throw new Error("invalid backup object prefix");
  }
  return prefix;
}

function realConfiguration(): (ImmutableBackupObjectConfiguration & { storage: ObjectStorageConfig }) | null {
  const storage = getObjectStorageConfig();
  const bucket = process.env.BACKUP_S3_BUCKET?.trim() ?? "";
  if (!storage || !bucket) return null;
  return {
    storage: { ...storage, bucket },
    bucket,
    prefix: normalizedPrefix(process.env.BACKUP_S3_PREFIX || "database-backups"),
    retentionDays: positiveInteger(
      process.env.BACKUP_S3_OBJECT_LOCK_DAYS,
      positiveInteger(process.env.BACKUP_REMOTE_KEEP_DAYS, 30),
    ),
  };
}

const realAdapter: ImmutableBackupObjectAdapter = {
  configuration: () => {
    const configuration = realConfiguration();
    if (!configuration) return null;
    const { storage: _storage, ...publicConfiguration } = configuration;
    return publicConfiguration;
  },
  upload: async (input) => {
    const configuration = realConfiguration();
    if (!configuration || configuration.bucket !== input.bucket) {
      throw new Error("immutable backup object storage configuration changed");
    }
    await objectStorageClient(configuration.storage).send(new PutObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
      Body: createReadStream(input.filepath),
      ContentLength: input.bytes,
      ContentType: "application/vnd.postgresql.custom-dump",
      ChecksumSHA256: Buffer.from(input.sha256, "hex").toString("base64"),
      Metadata: { sha256: input.sha256, backup_kind: "postgresql-custom-dump" },
      IfNoneMatch: "*",
      ObjectLockMode: "GOVERNANCE",
      ObjectLockRetainUntilDate: input.retainedUntil,
    }));
    return { key: input.key };
  },
  inspect: async (input) => {
    const configuration = realConfiguration();
    if (!configuration || configuration.bucket !== input.bucket) {
      throw new Error("immutable backup object storage configuration changed");
    }
    const head = await objectStorageClient(configuration.storage).send(new HeadObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
    }));
    return {
      bytes: Number(head.ContentLength ?? 0),
      sha256: head.Metadata?.sha256 ?? null,
      objectLockMode: head.ObjectLockMode ? String(head.ObjectLockMode) : null,
      retainedUntil: head.ObjectLockRetainUntilDate ?? null,
    };
  },
};

export function buildImmutableBackupObjectKey(prefix: string, artifact: BackupProducer): string {
  const safePrefix = normalizedPrefix(prefix);
  if (!/^wtf_[a-zA-Z0-9-]+\.dump$/u.test(artifact.filename)) {
    throw new Error("invalid backup artifact filename");
  }
  const createdAt = new Date(artifact.createdAt);
  if (!Number.isFinite(createdAt.getTime())) throw new Error("invalid backup artifact createdAt");
  return `${safePrefix}/${createdAt.getUTCFullYear()}/${String(createdAt.getUTCMonth() + 1).padStart(2, "0")}/${artifact.filename}`;
}

export async function runImmutableObjectStorageTarget(
  artifact: BackupProducer,
  adapter: ImmutableBackupObjectAdapter = realAdapter,
): Promise<BackupTargetResult> {
  return timedTarget("object-storage-immutable", async () => {
    const configuration = adapter.configuration();
    if (!configuration) {
      return {
        status: "skipped",
        reason: "missing_immutable_backup_object_storage",
        bytes: 0,
      };
    }
    const key = buildImmutableBackupObjectKey(configuration.prefix, artifact);
    const createdAt = new Date(artifact.createdAt);
    const retainedUntil = new Date(
      createdAt.getTime() + configuration.retentionDays * 24 * 60 * 60 * 1000,
    );
    await adapter.upload({
      bucket: configuration.bucket,
      key,
      filepath: artifact.filepath,
      bytes: artifact.bytes,
      sha256: artifact.sha256,
      retainedUntil,
    });
    const remote = await adapter.inspect({ bucket: configuration.bucket, key });
    const sha256Match = remote.sha256 === artifact.sha256;
    if (
      remote.bytes !== artifact.bytes
      || !sha256Match
      || remote.objectLockMode !== "GOVERNANCE"
      || !(remote.retainedUntil instanceof Date)
      || remote.retainedUntil.getTime() < retainedUntil.getTime()
    ) {
      return {
        status: "error",
        reason: "immutable_remote_verification_failed",
        bytes: remote.bytes,
        sha256Match,
        metadata: {
          bucket: configuration.bucket,
          key,
          durableDump: false,
          immutable: false,
        },
      };
    }
    return {
      status: "ok",
      bytes: remote.bytes,
      sha256Match: true,
      metadata: {
        bucket: configuration.bucket,
        key,
        durableDump: true,
        immutable: true,
        objectLockMode: remote.objectLockMode,
        retainedUntil: remote.retainedUntil.toISOString(),
      },
    };
  });
}

export const immutableObjectStorageTarget = {
  name: "object-storage-immutable",
  run: runImmutableObjectStorageTarget,
};
