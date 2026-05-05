export type DesktopBounds = { width: number; height: number };
export type DesktopPoint = { x: number; y: number };

export function clampFloatingPosition(
  position: DesktopPoint,
  bounds: DesktopBounds,
  width: number,
  height: number
) {
  return {
    x: Math.max(0, Math.min(Math.max(0, bounds.width - width), Math.round(position.x))),
    y: Math.max(0, Math.min(Math.max(0, bounds.height - height), Math.round(position.y))),
  };
}

export function seededUnit(seed: number, salt: number) {
  const value = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}
