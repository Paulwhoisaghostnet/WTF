export const WTFIAP_ASSET_ROOT = "/games/installed/wtfiap";
export const COLILSEUM_ROUTE = "/colilseum";

export function colilseumRoomFromPath(path: string): string | null {
  const url = new URL(path, "https://wtfos.invalid");
  const match = url.pathname.match(/^\/colilseum\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  return match ? match[1].toLowerCase() : null;
}

export function wtfIapEntryPath(windowPath: string | null, activePath: string, search: string): string {
  const ownPath = windowPath || COLILSEUM_ROUTE;
  // Classic shell window keys omit search. Only capture the active URL when it
  // belongs to this window; a different app's query must never enter the game.
  if (ownPath.includes("?") || activePath !== ownPath) return ownPath;
  return `${ownPath}${search ? `?${search.replace(/^\?/, "")}` : ""}`;
}

// Use the owning window's path; other desktop apps can change the ambient URL.
export function wtfIapFrameSource(windowPath: string | null, mode?: "party"): string {
  const entry = new URL(windowPath || COLILSEUM_ROUTE, "https://wtfos.invalid");
  const room = colilseumRoomFromPath(entry.pathname);
  if (room) entry.searchParams.set("room", room);
  const requested = entry.searchParams.get("mode");
  const page = mode === "party" || entry.searchParams.has("room") || requested === "party" ? "party"
    : requested === "practice" ? "index"
    : requested === "learn" ? "learn"
    : requested === "team-builder" ? "team-builder" : "welcome";
  return `${WTFIAP_ASSET_ROOT}/${page}.html${entry.search}`;
}
