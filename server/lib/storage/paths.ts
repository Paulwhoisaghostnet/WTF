import path from "node:path";

export const WTF_DATA_ROOT =
  process.env.WTF_DATA_ROOT?.trim() || "/mnt/wtf-data";

export const MEDIA_STAGING_DIR =
  process.env.UPLOAD_STAGING_DIR?.trim() ||
  path.join(WTF_DATA_ROOT, "uploads-staging");

export const MEDIA_HOT_CACHE_DIR =
  process.env.MEDIA_HOT_CACHE_DIR?.trim() ||
  path.join(WTF_DATA_ROOT, "tv-cache", "users");

export const TMP_PROCESSING_DIR =
  process.env.TMP_PROCESSING_DIR?.trim() ||
  path.join(WTF_DATA_ROOT, "tmp-processing");

export const BACKUPS_STAGING_DIR =
  process.env.BACKUPS_STAGING_DIR?.trim() ||
  path.join(WTF_DATA_ROOT, "backups-staging");

export function assertInsideRoot(filePath: string, root: string): void {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(filePath);
  const rel = path.relative(resolvedRoot, resolvedPath);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Refusing path outside storage root: ${filePath}`);
  }
}

