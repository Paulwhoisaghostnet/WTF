import type { WtfDomainChatConfig } from "@shared/wtf-subdomains";
import { getWtfParentDomain } from "./labels";

export function getDomainChatConfig(
  env: NodeJS.ProcessEnv = process.env
): WtfDomainChatConfig {
  const parentDomains = parseParentDomains(
    env.WTF_DOMAINS_CHAT_PARENT_DOMAINS,
    getWtfParentDomain()
  );
  const signingPrefix =
    (env.WTF_DOMAINS_CHAT_SIGNING_PREFIX || `${parentDomains[0]}-chat`).trim();
  const apiBaseUrl =
    (env.WTF_DOMAINS_CHAT_API_BASE_URL || "").trim().replace(/\/+$/, "") ||
    null;
  return {
    enabled: parseBoolean(env.WTF_DOMAINS_CHAT_ENABLED),
    parentDomains,
    signingPrefix,
    apiBaseUrl,
  };
}

export function normalizeDomainChatName(
  input: string,
  parentDomains = getDomainChatConfig().parentDomains
):
  | { ok: true; domain: string; parentDomain: string }
  | { ok: false; error: string } {
  const raw = input.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  if (!raw) return { ok: false, error: "domain is required" };
  if (raw.length > 180) return { ok: false, error: "domain is too long" };

  if (!raw.includes(".")) {
    const parentDomain = parentDomains[0] || "wtf.tez";
    return { ok: true, domain: `${raw}.${parentDomain}`, parentDomain };
  }

  for (const parentDomain of parentDomains) {
    if (raw.endsWith(`.${parentDomain}`)) {
      return { ok: true, domain: raw, parentDomain };
    }
  }

  return {
    ok: false,
    error: `domain must end with ${parentDomains.join(" or ")}`,
  };
}

export function canonicalDomainDmKey(domainA: string, domainB: string): string {
  return [domainA.toLowerCase(), domainB.toLowerCase()].sort().join("+");
}

function parseParentDomains(raw: string | undefined, fallback: string): string[] {
  const source = raw?.trim() || fallback;
  return Array.from(
    new Set(
      source
        .split(",")
        .map((entry) => entry.trim().toLowerCase().replace(/^\.+|\.+$/g, ""))
        .filter(Boolean)
        .map((entry) => (entry.includes(".") ? entry : `${entry}.tez`))
    )
  );
}

function parseBoolean(raw: string | undefined): boolean {
  if (!raw) return false;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}
