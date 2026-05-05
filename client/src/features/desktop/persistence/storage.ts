const PET_STORAGE_PREFIX = "wtf.desktop.hamster.v2";

export function petStorageKey(userId: number | null) {
  return `${PET_STORAGE_PREFIX}.${userId ?? "guest"}`;
}
