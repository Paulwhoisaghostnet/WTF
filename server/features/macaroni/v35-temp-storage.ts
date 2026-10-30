import { mkdir, stat, statfs } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const UNIXFS_CHUNK_BYTES = 1_048_576;
const reservationsByDevice = new Map<bigint, number>();

export function macaroniV35UploadStagingRoot() {
  return String(process.env.UPLOAD_STAGING_DIR || "").trim() || path.join(tmpdir(), "wtfos-upload-staging");
}

export function macaroniV35ProcessingRoot() {
  return String(process.env.TMP_PROCESSING_DIR || "").trim() || path.join(tmpdir(), "wtfos-tmp-processing");
}

type DeviceCapacity = {
  device: bigint;
  availableBytes: number;
};

async function deviceCapacity(root: string): Promise<DeviceCapacity> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const [info, filesystem] = await Promise.all([stat(root, { bigint: true }), statfs(root, { bigint: true })]);
  const available = filesystem.bavail * filesystem.bsize;
  if (available > BigInt(Number.MAX_SAFE_INTEGER)) {
    return { device: info.dev, availableBytes: Number.MAX_SAFE_INTEGER };
  }
  return { device: info.dev, availableBytes: Number(available) };
}

/**
 * Reserve the worst-case local footprint before accepting a private upload.
 *
 * The input remains in upload staging while deterministic CAR construction can
 * hold one CAR copy plus one block-set copy. Encryption can hold the same CAR
 * plus one encrypted copy. On one filesystem that is at most three request
 * bodies plus one fixed importer chunk for framing/internal UnixFS blocks. If
 * upload and processing use different filesystems, the input body is reserved
 * on the first and two processing copies are reserved on the second.
 */
export async function reserveMacaroniV35TempBytes(requestBytes: number) {
  if (!Number.isSafeInteger(requestBytes) || requestBytes < 1) {
    throw new Error("A positive private-upload Content-Length is required for storage reservation");
  }
  const upload = await deviceCapacity(macaroniV35UploadStagingRoot());
  const processing = await deviceCapacity(macaroniV35ProcessingRoot());
  const requested = new Map<bigint, number>();
  if (upload.device === processing.device) {
    requested.set(upload.device, requestBytes * 3 + UNIXFS_CHUNK_BYTES);
  } else {
    requested.set(upload.device, requestBytes);
    requested.set(processing.device, requestBytes * 2 + UNIXFS_CHUNK_BYTES);
  }
  const capacities = new Map<bigint, number>([
    [upload.device, upload.availableBytes],
    [processing.device, processing.availableBytes],
  ]);
  for (const [device, bytes] of requested) {
    if (!Number.isSafeInteger(bytes) || bytes < 1) throw new Error("Private-upload storage reservation overflowed");
    const available = capacities.get(device) ?? 0;
    const reserved = reservationsByDevice.get(device) ?? 0;
    if (available - reserved < bytes) {
      const error = new Error("Private staging is temporarily out of safe workspace; retry after current uploads finish") as Error & { status?: number };
      error.status = 507;
      throw error;
    }
  }
  for (const [device, bytes] of requested) {
    reservationsByDevice.set(device, (reservationsByDevice.get(device) ?? 0) + bytes);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const [device, bytes] of requested) {
      const remaining = Math.max(0, (reservationsByDevice.get(device) ?? 0) - bytes);
      if (remaining) reservationsByDevice.set(device, remaining);
      else reservationsByDevice.delete(device);
    }
  };
}
