import type { WtfOsCliParsedCommand } from "./types";

export function tokenizeCliInput(raw: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (current.length > 0) tokens.push(current);
  return tokens;
}

export function parseCliInput(raw: string): WtfOsCliParsedCommand | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const withoutPrefix = trimmed.replace(/^wtf\s+/i, "");
  const tokens = tokenizeCliInput(withoutPrefix);
  if (tokens.length === 0) return null;

  const [name, ...args] = tokens;
  return {
    name: name.toLowerCase(),
    args,
    raw: trimmed,
  };
}
