export const CHANNEL_ICONS: Record<string, string> = {
  text: "#",
  announcements: "📢",
  forum: "💬",
};

export const EMOJI_QUICK = [
  "👍",
  "❤️",
  "😂",
  "🔥",
  "👀",
  "🎉",
  "💯",
  "⚡",
  "🐹",
  "🧀",
  "🐾",
];

export function timeAgo(dateStr: string): string {
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(dateStr).toLocaleDateString();
}

export function safeAttachmentUrl(raw: string): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function toggleInList<T>(list: T[], item: T): T[] {
  return list.includes(item)
    ? list.filter((existing) => existing !== item)
    : [...list, item];
}
