export type HorfTraderStatus = {
  address: string;
  blacklisted: boolean;
  reason: string | null;
  evidenceUrl: string | null;
  listedAt: string | null;
};

export function parseHorfTraderStatus(value: unknown): HorfTraderStatus {
  const status = value as Partial<HorfTraderStatus> | null;
  if (!status || typeof status.address !== "string" || typeof status.blacklisted !== "boolean" ||
      (status.reason != null && typeof status.reason !== "string") ||
      (status.evidenceUrl != null && typeof status.evidenceUrl !== "string") ||
      (status.listedAt != null && typeof status.listedAt !== "string")) {
    throw new Error("Horf trader status could not be read. Try again.");
  }
  return status as HorfTraderStatus;
}

export function safeHorfEvidenceUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!(["http:", "https:"].includes(url.protocol)) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}
