export const WTF_CURSE_KEYS = [
  "green_lens",
  "inverted_click_mouse",
  "liability_waiver",
  "wtf_reward_embargo",
  "blangs",
] as const;

export type WtfCurseKey = (typeof WTF_CURSE_KEYS)[number];

export type WtfCurseDefinition = {
  key: WtfCurseKey;
  label: string;
  summary: string;
  effect: string;
};

export const WTF_CURSE_DEFINITIONS: WtfCurseDefinition[] = [
  {
    key: "green_lens",
    label: "Green Lens",
    summary: "Everything renders through a green channel.",
    effect: "Final WTF OS rendering is tinted green after user settings resolve.",
  },
  {
    key: "inverted_click_mouse",
    label: "Click Flip Mouse",
    summary: "The visible cursor inverts after every click.",
    effect: "A cursed cursor mirrors pointer deltas while the inversion toggle is active.",
  },
  {
    key: "liability_waiver",
    label: "Liability Waiver",
    summary: "Every click asks the user to accept an over-serious warning.",
    effect: "Interactive clicks are intercepted until the user accepts the risk prompt.",
  },
  {
    key: "wtf_reward_embargo",
    label: "No WTF Rewards",
    summary: "The account cannot earn WTF platform rewards.",
    effect: "Platform reward-ledger grants are skipped and reward actions report the embargo.",
  },
  {
    key: "blangs",
    label: "BLANGS!",
    summary: "Cursor and desktop icons become Blang.",
    effect: "The user cannot override the BLANG cursor/icon treatment while cursed.",
  },
];

export type WtfCurseStatus = {
  key: WtfCurseKey;
  label: string;
  summary: string;
  effect: string;
  reason?: string | null;
  assignedBy?: number | null;
  assignedAt?: string | Date | null;
  expiresAt?: string | Date | null;
};

const CURSE_KEY_SET = new Set<string>(WTF_CURSE_KEYS);

export function isWtfCurseKey(value: unknown): value is WtfCurseKey {
  return typeof value === "string" && CURSE_KEY_SET.has(value);
}

export function findWtfCurseDefinition(key: WtfCurseKey): WtfCurseDefinition {
  return WTF_CURSE_DEFINITIONS.find((curse) => curse.key === key) ?? WTF_CURSE_DEFINITIONS[0];
}

export function normalizeWtfCurseStatuses(input: unknown): WtfCurseStatus[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<WtfCurseKey>();
  const normalized: WtfCurseStatus[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const key = (item as { key?: unknown }).key;
    if (!isWtfCurseKey(key) || seen.has(key)) continue;
    const definition = findWtfCurseDefinition(key);
    seen.add(key);
    normalized.push({
      ...definition,
      reason: typeof (item as { reason?: unknown }).reason === "string" ? (item as { reason: string }).reason : null,
      assignedBy:
        typeof (item as { assignedBy?: unknown }).assignedBy === "number"
          ? (item as { assignedBy: number }).assignedBy
          : null,
      assignedAt: ((item as { assignedAt?: unknown }).assignedAt as string | Date | null | undefined) ?? null,
      expiresAt: ((item as { expiresAt?: unknown }).expiresAt as string | Date | null | undefined) ?? null,
    });
  }
  return normalized;
}

export function hasWtfCurse(input: unknown, key: WtfCurseKey): boolean {
  return normalizeWtfCurseStatuses(input).some((curse) => curse.key === key);
}
