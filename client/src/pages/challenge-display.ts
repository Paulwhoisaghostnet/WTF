const LEGACY_LIVE_PUPPET_TITLES: Array<[RegExp, string]> = [
  [/^Live puppet UI readiness\b/i, "Community Warm-Up Challenge"],
  [/^Live puppet show readiness\b/i, "Show Readiness Challenge"],
];

export function customerChallengeTitle(title: string | null | undefined) {
  const raw = String(title ?? "").trim();
  if (!raw) return "Untitled Challenge";
  const match = LEGACY_LIVE_PUPPET_TITLES.find(([pattern]) => pattern.test(raw));
  return match ? match[1] : raw;
}
