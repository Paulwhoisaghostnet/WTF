export type DesktopCursorTool = "standard" | "scale" | "portal-gun";

export const DESKTOP_CURSOR_TOOL_LABELS: Record<DesktopCursorTool, string> = {
  standard: "Standard",
  scale: "Scale",
  "portal-gun": "Portal",
};

export function nextPortalToolColor(current: "blue" | "orange") {
  return current === "blue" ? "orange" : "blue";
}
