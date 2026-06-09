import type { FontRole } from "./font-packs";

const ROLE_VAR: Record<FontRole, string> = {
  ui: "--wtf-ui-font",
  app: "--wtf-app-font",
  mono: "--wtf-mono-font",
  shell: "--wtf-shell-font",
  display: "--wtf-display-font",
  symbol: "--wtf-symbol-font",
};

const FALLBACK_STACK: Record<FontRole, string> = {
  ui: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
  app: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
  mono: "monospace",
  shell: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
  display: "Impact, Arial Black, sans-serif",
  symbol: "sans-serif",
};

function readFontStack(role: FontRole, root?: HTMLElement | null): string {
  if (typeof document === "undefined") {
    return FALLBACK_STACK[role];
  }
  const target = root ?? document.documentElement;
  const value = getComputedStyle(target).getPropertyValue(ROLE_VAR[role]).trim();
  return value || FALLBACK_STACK[role];
}

/** Build a canvas `ctx.font` string from the active OS font pack role. */
export function getCanvasFont(
  role: FontRole,
  sizePx: number,
  options?: { weight?: string; style?: string; root?: HTMLElement | null }
): string {
  const weight = options?.weight ?? "normal";
  const style = options?.style ?? "normal";
  const stack = readFontStack(role, options?.root);
  return `${style} ${weight} ${sizePx}px ${stack}`.replace(/\s+/g, " ").trim();
}

/** First family name from a CSS font stack, suitable for SVG `fontFamily`. */
export function getPrimaryFontFamily(
  role: FontRole,
  root?: HTMLElement | null
): string {
  const stack = readFontStack(role, root);
  const trimmed = stack.trim();
  if (trimmed.startsWith('"')) {
    const end = trimmed.indexOf('"', 1);
    if (end > 0) {
      return trimmed.slice(1, end);
    }
  }
  return trimmed.split(",")[0]?.trim().replace(/^['"]|['"]$/g, "") ?? stack;
}
