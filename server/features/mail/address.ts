const LOCAL_PART_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

const RESERVED_MAILBOXES = new Set([
  "abuse",
  "admin",
  "api",
  "billing",
  "bot",
  "dns",
  "ftp",
  "help",
  "hostmaster",
  "mail",
  "no-reply",
  "noreply",
  "postmaster",
  "root",
  "security",
  "support",
  "system",
  "webmaster",
  "www",
  "wtf",
]);

export function normalizeMailLocalPart(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 63);
}

export function validateMailLocalPart(localPart: string):
  | { ok: true; localPart: string }
  | { ok: false; error: string } {
  const normalized = normalizeMailLocalPart(localPart);
  if (normalized.length < 3) {
    return { ok: false, error: "Mailbox name must be at least 3 characters" };
  }
  if (!LOCAL_PART_PATTERN.test(normalized)) {
    return {
      ok: false,
      error: "Mailbox name can use lowercase letters, numbers, and internal hyphens",
    };
  }
  if (RESERVED_MAILBOXES.has(normalized)) {
    return { ok: false, error: "That mailbox name is reserved" };
  }
  return { ok: true, localPart: normalized };
}

export function normalizeEmailAddress(value: string): string {
  return String(value || "").trim().toLowerCase();
}

export function splitEmailAddress(address: string):
  | { ok: true; localPart: string; domain: string; address: string }
  | { ok: false; error: string } {
  const normalized = normalizeEmailAddress(address);
  const [localPart, domain, extra] = normalized.split("@");
  if (!localPart || !domain || extra) {
    return { ok: false, error: "Invalid email address" };
  }
  return { ok: true, localPart, domain, address: normalized };
}
