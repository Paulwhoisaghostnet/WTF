type WtfChannelConfigLike = {
  id: number;
  channelId: number | null;
  enabled: boolean;
  updatedAt: Date | string | null;
};

function updatedAtMs(value: Date | string | null): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function compareWtfChannelConfigPriority(
  a: WtfChannelConfigLike,
  b: WtfChannelConfigLike
): number {
  const aHasChannel = a.channelId === null ? 0 : 1;
  const bHasChannel = b.channelId === null ? 0 : 1;
  if (aHasChannel !== bHasChannel) return aHasChannel - bHasChannel;

  const aEnabled = a.enabled ? 1 : 0;
  const bEnabled = b.enabled ? 1 : 0;
  if (aEnabled !== bEnabled) return aEnabled - bEnabled;

  const aUpdatedAt = updatedAtMs(a.updatedAt);
  const bUpdatedAt = updatedAtMs(b.updatedAt);
  if (aUpdatedAt !== bUpdatedAt) return aUpdatedAt - bUpdatedAt;

  return a.id - b.id;
}

export function pickPreferredWtfChannelConfig<T extends WtfChannelConfigLike>(
  rows: readonly T[]
): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (!best || compareWtfChannelConfigPriority(row, best) > 0) {
      best = row;
    }
  }
  return best;
}
