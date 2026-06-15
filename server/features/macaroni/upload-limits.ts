const MEBIBYTE_BYTES = 1024 * 1024;

export const MACARONI_IPFS_AVERAGE_MAX_BYTES = 250 * MEBIBYTE_BYTES;
export const MACARONI_IPFS_HARD_MAX_BYTES = 1024 * MEBIBYTE_BYTES;

export function macaroniIpfsMaxBytes(): number {
  return MACARONI_IPFS_HARD_MAX_BYTES;
}

export function uploadLimitLabel(bytes: number): string {
  const gb = bytes / (1024 * MEBIBYTE_BYTES);
  if (Number.isInteger(gb) && gb >= 1) return `${gb} GB`;
  const mb = bytes / MEBIBYTE_BYTES;
  return Number.isInteger(mb) ? `${mb} MB` : `${bytes} bytes`;
}
