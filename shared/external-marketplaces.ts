export const EXTERNAL_MARKETPLACE_NAMES: Record<string, string> = {
  KT1FvqJwEDWb1Gwc55Jd1jjTHRVWbYKUUpyq: "objkt v1",
  KT1WvzYHCNBvDSdwafTHv7nJ1dWmZ8GCYuuC: "objkt v4",
  KT1CePTyk6fk4cFr6fasY5YXPGks6ttjSLp4: "objkt v6",
  KT1Xjap1TwmDR1d8yEd8ErkraAj2mbdMrPZY: "objkt v6.1",
  KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X: "objkt v6.2",
  KT1NiZkkW82wsTKP95x8FefdiseDyU9vX66W: "objkt fixed price",
  KT1KzmnX6Ffip7zVgGiCUV6ygqDU8hhGsMAy: "objkt fixed price v2",
  KT1HbQepzV1nVGg8QVznG7z4RcHseD5kwqBn: "HEN v2",
  KT1PHubm9HtyQEJ4BBpMTVomq6mhbfNZ9z5w: "Teia",
};

export const EXTERNAL_CANCEL_ENTRYPOINT_BY_MARKETPLACE: Record<string, string> = {
  KT1FvqJwEDWb1Gwc55Jd1jjTHRVWbYKUUpyq: "retract_ask",
  KT1WvzYHCNBvDSdwafTHv7nJ1dWmZ8GCYuuC: "retract_ask",
  KT1CePTyk6fk4cFr6fasY5YXPGks6ttjSLp4: "retract_ask",
  KT1Xjap1TwmDR1d8yEd8ErkraAj2mbdMrPZY: "retract_ask",
  KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X: "retract_ask",
  KT1NiZkkW82wsTKP95x8FefdiseDyU9vX66W: "retract_ask",
  KT1KzmnX6Ffip7zVgGiCUV6ygqDU8hhGsMAy: "retract_ask",
  KT1HbQepzV1nVGg8QVznG7z4RcHseD5kwqBn: "cancel_swap",
  KT1PHubm9HtyQEJ4BBpMTVomq6mhbfNZ9z5w: "cancel_swap",
};

export function externalMarketplaceName(address: string | null | undefined): string {
  if (!address) return "external";
  return EXTERNAL_MARKETPLACE_NAMES[address] ?? address;
}

export function isKnownExternalMarketplace(address: string | null | undefined): boolean {
  return Boolean(address && EXTERNAL_MARKETPLACE_NAMES[address]);
}

export function externalCancelEntrypoint(address: string | null | undefined): string | null {
  if (!address) return null;
  return EXTERNAL_CANCEL_ENTRYPOINT_BY_MARKETPLACE[address] ?? null;
}

export function isCancellableExternalMarketplace(address: string | null | undefined): boolean {
  return externalCancelEntrypoint(address) !== null;
}
