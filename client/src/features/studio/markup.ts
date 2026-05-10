import type { StudioAnnotationKind } from "@shared/types";

export interface StudioMarkupPoint {
  x: number;
  y: number;
}

export interface StudioMarkupData {
  points: StudioMarkupPoint[];
  color: string;
  width: number;
  opacity: number;
  tool: "brush" | "highlight";
}

export const STUDIO_MARKUP_COLORS = [
  "#000000",
  "#ffffff",
  "#ff0033",
  "#ffcc00",
  "#00a651",
  "#0066ff",
  "#aa00ff",
  "#ff66aa",
] as const;

export const STUDIO_MARKUP_WIDTHS = [2, 4, 8, 14] as const;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function sanitizeMarkupPoints(
  points: StudioMarkupPoint[]
): StudioMarkupPoint[] {
  return points
    .filter(
      (point) =>
        Number.isFinite(point.x) &&
        Number.isFinite(point.y)
    )
    .slice(0, 600)
    .map((point) => ({
      x: +clamp01(point.x).toFixed(4),
      y: +clamp01(point.y).toFixed(4),
    }));
}

export function createMarkupAnnotationData(input: {
  color: string;
  points: StudioMarkupPoint[];
  tool: "brush" | "highlight";
  width: number;
}): StudioMarkupData | null {
  const points = sanitizeMarkupPoints(input.points);
  if (points.length < 2) return null;
  const color = STUDIO_MARKUP_COLORS.includes(input.color as any)
    ? input.color
    : "#ff0033";
  const width = STUDIO_MARKUP_WIDTHS.includes(input.width as any)
    ? input.width
    : 4;
  return {
    points,
    color,
    width,
    opacity: input.tool === "highlight" ? 0.34 : 0.92,
    tool: input.tool,
  };
}

export function annotationDataPosition(data: Record<string, unknown> | null | undefined): {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
} {
  const out: { x?: number; y?: number; w?: number; h?: number } = {};
  if (!data || typeof data !== "object") return out;
  for (const key of ["x", "y", "w", "h"] as const) {
    const value = data[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = value;
    }
  }
  return out;
}

export function isPaintMarkupKind(kind: StudioAnnotationKind): boolean {
  return kind === "draw" || kind === "highlight";
}

export function markupPath(points: StudioMarkupPoint[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return [
    `M ${first.x * 100} ${first.y * 100}`,
    ...rest.map((point) => `L ${point.x * 100} ${point.y * 100}`),
  ].join(" ");
}

export function readMarkupData(
  data: Record<string, unknown> | null | undefined,
  fallbackTool: "brush" | "highlight" = "brush"
): StudioMarkupData | null {
  if (!data || typeof data !== "object") return null;
  const rawPoints = Array.isArray(data.points) ? data.points : [];
  const points = sanitizeMarkupPoints(
    rawPoints
      .filter((point): point is { x: number; y: number } => {
        return (
          point != null &&
          typeof point === "object" &&
          typeof (point as { x?: unknown }).x === "number" &&
          typeof (point as { y?: unknown }).y === "number"
        );
      })
      .map((point) => ({ x: point.x, y: point.y }))
  );
  if (points.length < 2) return null;
  const color =
    typeof data.color === "string" && STUDIO_MARKUP_COLORS.includes(data.color as any)
      ? data.color
      : "#ff0033";
  const width =
    typeof data.width === "number" && STUDIO_MARKUP_WIDTHS.includes(data.width as any)
      ? data.width
      : 4;
  const tool = data.tool === "highlight" ? "highlight" : fallbackTool;
  const opacity =
    typeof data.opacity === "number" && Number.isFinite(data.opacity)
      ? Math.max(0.1, Math.min(1, data.opacity))
      : tool === "highlight"
        ? 0.34
        : 0.92;
  return { points, color, width, opacity, tool };
}
