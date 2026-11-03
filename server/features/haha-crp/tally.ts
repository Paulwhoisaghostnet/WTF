import { HAHA_CRP_CATEGORIES } from "@shared/haha-crp";

export type HahaNominee = {
  address: string;
  name: string | null;
  count: number;
  rank: number;
  finalNominationAt: string;
};

export type NominationRecord = {
  categoryId: string;
  nomineeAddress: string;
  nomineeDisplayName: string | null;
  createdAt: string;
};

/** A tie is won by the nominee who reached the tied count first. */
export function tallyHahaNominees(records: NominationRecord[]) {
  const groups = new Map<string, Map<string, { address: string; name: string | null; count: number; finalNominationAt: string }>>();
  for (const category of HAHA_CRP_CATEGORIES) groups.set(category.id, new Map());
  for (const row of records) {
    const category = groups.get(row.categoryId);
    if (!category) continue;
    const current = category.get(row.nomineeAddress) ?? {
      address: row.nomineeAddress, name: null, count: 0, finalNominationAt: row.createdAt,
    };
    current.count += 1;
    if (row.nomineeDisplayName?.trim() && !current.name) current.name = row.nomineeDisplayName.trim();
    if (row.createdAt > current.finalNominationAt) current.finalNominationAt = row.createdAt;
    category.set(row.nomineeAddress, current);
  }
  return HAHA_CRP_CATEGORIES.map((category) => ({
    id: category.id,
    label: category.label,
    nominees: [...(groups.get(category.id)?.values() ?? [])]
      .sort((a, b) => b.count - a.count || a.finalNominationAt.localeCompare(b.finalNominationAt) || a.address.localeCompare(b.address))
      .map((nominee, index): HahaNominee => ({ ...nominee, rank: index + 1 })),
  }));
}

/** Caller serializes admission per nominator/category in the database. */
export function nominationAdmission(existingNominees: string[], nextNominee: string): "ok" | "duplicate" | "limit" {
  if (existingNominees.includes(nextNominee)) return "duplicate";
  if (existingNominees.length >= 3) return "limit";
  return "ok";
}
