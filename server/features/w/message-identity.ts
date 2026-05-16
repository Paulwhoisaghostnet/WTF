function isDigits(value: string): boolean {
  return /^\d+$/.test(value);
}

export type ConnectedWtfUser = {
  id: number;
  username: string;
  displayName: string | null;
  twitterId: string | null;
  twitterHandle: string | null;
};

export function selectUniqueConnectedWtfUsersByTwitterId(
  rows: ConnectedWtfUser[]
): Map<string, ConnectedWtfUser> {
  const grouped = new Map<string, ConnectedWtfUser[]>();
  for (const row of rows) {
    const twitterId = String(row.twitterId || "").trim();
    if (!isDigits(twitterId)) continue;
    const list = grouped.get(twitterId) ?? [];
    list.push(row);
    grouped.set(twitterId, list);
  }

  const unique = new Map<string, ConnectedWtfUser>();
  for (const [twitterId, matches] of grouped) {
    if (matches.length === 1) unique.set(twitterId, matches[0]!);
  }
  return unique;
}
