export type WtfLiveTab = "overview" | "rooms" | "stages" | "skywire";

export const WTF_LIVE_TAB_IDS: WtfLiveTab[] = ["overview", "rooms", "stages", "skywire"];

export type WtfLiveNavItem = {
  id: WtfLiveTab;
  label: string;
  hint: string;
  icon: string;
};

export const WTF_LIVE_NAV_ITEMS: WtfLiveNavItem[] = [
  { id: "overview", label: "Overview", hint: "Publishing model and status", icon: "📋" },
  { id: "rooms", label: "Rooms", hint: "Public AT room messages", icon: "💬" },
  { id: "stages", label: "Stages", hint: "One-way stage broadcasts", icon: "📡" },
  { id: "skywire", label: "Skywire Link", hint: "Bluesky permissions", icon: "⚙" },
];

export const WTF_LIVE_PENDING_QUOTE_KEY = "wtf-live:pending-quote";

export function isWtfLiveTab(value: string | null | undefined): value is WtfLiveTab {
  return Boolean(value && WTF_LIVE_TAB_IDS.includes(value as WtfLiveTab));
}

export function parseWtfLiveSearchParams(search: string): {
  tab: WtfLiveTab;
  room: string | null;
  stage: string | null;
} {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const tabParam = params.get("tab");
  return {
    tab: isWtfLiveTab(tabParam) ? tabParam : "overview",
    room: params.get("room")?.trim() || null,
    stage: params.get("stage")?.trim() || null,
  };
}

export function buildWtfLiveSearch(input: {
  tab: WtfLiveTab;
  room?: string | null;
  stage?: string | null;
}): string {
  const params = new URLSearchParams();
  if (input.tab !== "overview") params.set("tab", input.tab);
  if (input.tab === "rooms" && input.room) params.set("room", input.room);
  if (input.tab === "stages" && input.stage) params.set("stage", input.stage);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function wtfLiveContextTitle(tab: WtfLiveTab, roomTitle?: string | null, stageTitle?: string | null): string {
  if (tab === "rooms" && roomTitle) return `Room · ${roomTitle}`;
  if (tab === "stages" && stageTitle) return `Stage · ${stageTitle}`;
  if (tab === "skywire") return "Skywire Link";
  if (tab === "overview") return "Overview";
  return "WTF LIVE";
}
