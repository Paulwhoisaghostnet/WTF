export type SideQuestEntryFeeRecord = {
  amountWtf: string;
  status: string;
};

export type SideQuestEntryFeeDecision = {
  allowed: boolean;
  requiredWtf: string;
  confirmedWtf: string | null;
};

function parseWtfAmount(value: string | null | undefined): bigint | null {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) return null;
  return BigInt(normalized);
}

export function evaluateSideQuestEntryFee(
  requiredWtf: string | null | undefined,
  records: readonly SideQuestEntryFeeRecord[],
): SideQuestEntryFeeDecision {
  const required = parseWtfAmount(requiredWtf);
  if (required === BigInt(0)) {
    return { allowed: true, requiredWtf: "0", confirmedWtf: null };
  }

  const normalizedRequired = required?.toString() ?? String(requiredWtf ?? "0");
  let largestConfirmed: bigint | null = null;

  for (const record of records) {
    if (record.status !== "confirmed") continue;
    const amount = parseWtfAmount(record.amountWtf);
    if (amount === null) continue;
    if (largestConfirmed === null || amount > largestConfirmed) {
      largestConfirmed = amount;
    }
  }

  return {
    allowed:
      required !== null &&
      required > BigInt(0) &&
      largestConfirmed !== null &&
      largestConfirmed >= required,
    requiredWtf: normalizedRequired,
    confirmedWtf: largestConfirmed?.toString() ?? null,
  };
}
