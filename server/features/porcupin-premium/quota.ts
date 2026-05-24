const DEFAULT_QUOTA_BYTES = 5 * 1024 * 1024 * 1024; // 5 GiB per eligible user

const usageByUser = new Map<number, number>();

export async function getUserQuotaBytes(userId: number) {
  const usedBytes = usageByUser.get(userId) ?? 0;
  return { userId, usedBytes, maxBytes: DEFAULT_QUOTA_BYTES };
}

export async function recordPinBytes(userId: number, bytes: number) {
  usageByUser.set(userId, (usageByUser.get(userId) ?? 0) + bytes);
}

export function resetPorcupinQuotaForTests() {
  usageByUser.clear();
}
