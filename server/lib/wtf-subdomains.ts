const LABEL_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

const RESERVED_LABELS = new Set([
  "admin",
  "api",
  "app",
  "bot",
  "dns",
  "ftp",
  "hack",
  "help",
  "mail",
  "null",
  "official",
  "root",
  "support",
  "system",
  "tez",
  "tezos",
  "undefined",
  "www",
  "wtf",
]);

export type WtfSubdomainLabelResult =
  | { ok: true; label: string }
  | { ok: false; error: string };

export interface WtfSubdomainUserSeed {
  id: number;
  username: string;
  displayName?: string | null;
}

export function getWtfParentDomain(): string {
  const raw = (process.env.WTF_TEZ_PARENT_DOMAIN || "wtf.tez").trim().toLowerCase();
  return raw.replace(/^\.+|\.+$/g, "") || "wtf.tez";
}

export function validateWtfSubdomainLabel(
  input: string,
  parentDomain = getWtfParentDomain(),
): WtfSubdomainLabelResult {
  const normalizedParent = parentDomain.toLowerCase().replace(/^\.+|\.+$/g, "");
  let label = String(input || "").trim().toLowerCase();
  const suffix = `.${normalizedParent}`;
  if (label.endsWith(suffix)) label = label.slice(0, -suffix.length);

  if (!label) return { ok: false, error: "Subdomain label is required" };
  if (label.includes(".")) return { ok: false, error: "Use only one label under wtf.tez" };
  if (label.length < 3) return { ok: false, error: "Subdomain label must be at least 3 characters" };
  if (label.length > 63) return { ok: false, error: "Subdomain label must be 63 characters or fewer" };
  if (!LABEL_PATTERN.test(label)) {
    return { ok: false, error: "Use lowercase letters, numbers, and internal hyphens only" };
  }
  if (RESERVED_LABELS.has(label)) return { ok: false, error: "That label is reserved" };
  return { ok: true, label };
}

export function buildWtfSubdomainFullName(
  label: string,
  parentDomain = getWtfParentDomain(),
): string {
  return `${label.toLowerCase()}.${parentDomain.toLowerCase().replace(/^\.+|\.+$/g, "")}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 63);
}

export function renderWtfSubdomainLabel(
  template: string | null | undefined,
  user: WtfSubdomainUserSeed,
): string {
  const rawTemplate = template?.trim() || "{username}";
  const rendered = rawTemplate
    .replaceAll("{username}", user.username)
    .replaceAll("{displayName}", user.displayName || user.username)
    .replaceAll("{userId}", String(user.id));
  return slugify(rendered);
}
