import type { DesktopIconLayout } from "@shared/desktop";
import { clampIconPosition, type DesktopIconDef } from "./DesktopIcons";

export function reconcileVisibleIconLayout(
  current: DesktopIconLayout,
  visibleIcons: DesktopIconDef[],
  savedLayout: DesktopIconLayout | undefined,
  surfaceSize: { width: number; height: number },
  preferSaved: boolean
): DesktopIconLayout {
  const next: DesktopIconLayout = {};
  const hiddenKeys = new Set(Object.keys(current));
  let changed = false;

  for (const def of visibleIcons) {
    hiddenKeys.delete(def.key);
    const defaultPosition = { x: def.defaultX, y: def.defaultY };
    const source = preferSaved
      ? savedLayout
        ? savedLayout[def.key] ?? defaultPosition
        : current[def.key] ?? defaultPosition
      : current[def.key] ?? savedLayout?.[def.key] ?? defaultPosition;
    const position = clampIconPosition(source, surfaceSize);
    next[def.key] = position;
    const previous = current[def.key];
    if (!previous || previous.x !== position.x || previous.y !== position.y) {
      changed = true;
    }
  }

  if (hiddenKeys.size > 0) changed = true;
  return changed ? next : current;
}
