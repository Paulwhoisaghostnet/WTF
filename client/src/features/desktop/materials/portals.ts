export type PortalColor = "blue" | "orange";

export interface PortalLike {
  id: string;
  kind: "portal";
  color: PortalColor;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface PortalTransitInput<T extends { x: number; y: number; vx?: number; vy?: number }> {
  body: T;
  portals: PortalLike[];
  bounds: { width: number; height: number };
  now: number;
  lastTransitAt?: number;
  cooldownMs?: number;
}

function portalRect(portal: PortalLike) {
  return {
    x: portal.x,
    y: portal.y,
    width: portal.width ?? 46,
    height: portal.height ?? 64,
  };
}

function pointInPortal(point: { x: number; y: number }, portal: PortalLike) {
  const rect = portalRect(portal);
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export function oppositePortalColor(color: PortalColor): PortalColor {
  return color === "blue" ? "orange" : "blue";
}

export function pairedPortalFor(
  portal: PortalLike,
  portals: PortalLike[]
): PortalLike | null {
  return portals.find((entry) => entry.color === oppositePortalColor(portal.color)) ?? null;
}

export function resolvePortalTransit<T extends { x: number; y: number; vx?: number; vy?: number }>({
  body,
  portals,
  bounds,
  now,
  lastTransitAt,
  cooldownMs = 900,
}: PortalTransitInput<T>): { body: T; transited: boolean; portalId: string | null; lastTransitAt?: number } {
  if (lastTransitAt && now - lastTransitAt < cooldownMs) {
    return { body, transited: false, portalId: null, lastTransitAt };
  }
  const entry = portals.find((portal) => pointInPortal(body, portal));
  if (!entry) return { body, transited: false, portalId: null, lastTransitAt };
  const exit = pairedPortalFor(entry, portals);
  if (!exit) return { body, transited: false, portalId: null, lastTransitAt };
  const rect = portalRect(exit);
  const next = {
    ...body,
    x: Math.max(0, Math.min(bounds.width, rect.x + rect.width / 2 + Math.sign(body.vx ?? 1) * 18)),
    y: Math.max(0, Math.min(bounds.height, rect.y + rect.height / 2 + Math.sign(body.vy ?? 1) * 18)),
    vx: body.vx == null ? body.vx : body.vx * 0.96,
    vy: body.vy == null ? body.vy : body.vy * 0.96,
  };
  return { body: next, transited: true, portalId: exit.id, lastTransitAt: now };
}
