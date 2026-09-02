#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import catalog from "../../shared/wtfos-promos.json";
import {
  downloadObjectToFile,
  putObjectFromFile,
  verifyObjectStorageAccess,
} from "../../server/lib/storage/object-storage";

async function sha256(filePath: string): Promise<string> {
  return createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

async function main(): Promise<void> {
  const storage = await verifyObjectStorageAccess();
  if (!storage.ok) throw new Error(`S3 access check failed: ${storage.error || "unknown error"}`);

  const sourceDir = path.resolve(process.argv[2] || "output/wtfos-promos/final");
  const verificationDir = await fs.mkdtemp(path.join(tmpdir(), "wtfos-promos-"));
  const published: Array<{ slug: string; key: string; bytes: number; sha256: string }> = [];

  try {
    for (const promo of catalog) {
      const assets = [
        { extension: "mp4", key: promo.videoObjectKey, contentType: "video/mp4" },
        { extension: "vtt", key: promo.captionsObjectKey, contentType: "text/vtt; charset=utf-8" },
        { extension: "jpg", key: promo.posterObjectKey, contentType: "image/jpeg" },
      ];
      for (const asset of assets) {
        const filePath = path.join(sourceDir, `${promo.slug}.${asset.extension}`);
        const stat = await fs.stat(filePath);
        const digest = await sha256(filePath);
        await putObjectFromFile({
          key: asset.key,
          filePath,
          contentType: asset.contentType,
          contentLength: stat.size,
          metadata: {
            promo: promo.slug,
            account: "TommyTezos",
            sha256: digest,
            narration: "ai-kokoro-82m",
          },
        });
        const verificationPath = path.join(verificationDir, `${promo.slug}.${asset.extension}`);
        await downloadObjectToFile({ key: asset.key, destinationPath: verificationPath });
        const remoteDigest = await sha256(verificationPath);
        if (remoteDigest !== digest) throw new Error(`S3 verification failed for ${asset.key}`);
        published.push({ slug: promo.slug, key: asset.key, bytes: stat.size, sha256: digest });
        console.log(`[promo publish] verified s3://${storage.bucket}/${asset.key}`);
      }
    }
    await fs.writeFile(
      path.join(sourceDir, "publish-verification.json"),
      `${JSON.stringify({ verifiedAt: new Date().toISOString(), bucket: storage.bucket, published }, null, 2)}\n`,
      "utf8"
    );
  } finally {
    await fs.rm(verificationDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
