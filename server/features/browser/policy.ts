import {
  WTFOS_GAMESHOW_DOMAIN,
  WTFOS_PLATFORM_DOMAIN,
} from "@shared/platform-branding";
import {
  isAllowedRemoteHost,
  isPrivateOrLocalHost,
  parseHostAllowlist,
} from "../../lib/network-safety";

const DEFAULT_ALLOWED_HOSTS = [
  WTFOS_PLATFORM_DOMAIN,
  `mail.${WTFOS_PLATFORM_DOMAIN}`,
  WTFOS_GAMESHOW_DOMAIN,
  `mail.${WTFOS_GAMESHOW_DOMAIN}`,
  "objkt.com",
  "data.objkt.com",
  "teia.art",
  "fxhash.xyz",
  "tzkt.io",
  "tezos.domains",
  "bsky.app",
  "discord.com",
  "discord.gg",
  "t.me",
  "telegram.me",
  "mastodon.social",
  "tusk.social",
  "subjkt.xyz",
  "rejkt.xyz",
];

export type BrowserUrlPolicy = {
  allowed: boolean;
  url: string;
  host: string | null;
  reason: string | null;
  externalOpenAllowed: boolean;
};

export function browserAllowedHosts(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = parseHostAllowlist(env.WTF_BROWSER_ALLOWED_HOSTS);
  return Array.from(new Set([...DEFAULT_ALLOWED_HOSTS, ...configured]));
}

export function resolveBrowserUrlPolicy(
  rawUrl: string,
  env: NodeJS.ProcessEnv = process.env
): BrowserUrlPolicy {
  const value = String(rawUrl || "").trim();
  if (!value) {
    return {
      allowed: false,
      url: "",
      host: null,
      reason: "missing_url",
      externalOpenAllowed: false,
    };
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return {
        allowed: false,
        url: parsed.toString(),
        host: parsed.hostname,
        reason: "unsupported_protocol",
        externalOpenAllowed: false,
      };
    }
    if (isPrivateOrLocalHost(parsed.hostname)) {
      return {
        allowed: false,
        url: parsed.toString(),
        host: parsed.hostname,
        reason: "private_or_local_host",
        externalOpenAllowed: false,
      };
    }
    const allowed = isAllowedRemoteHost(parsed.hostname, browserAllowedHosts(env));
    return {
      allowed,
      url: parsed.toString(),
      host: parsed.hostname,
      reason: allowed ? null : "host_not_allowlisted",
      externalOpenAllowed: true,
    };
  } catch {
    return {
      allowed: false,
      url: value,
      host: null,
      reason: "invalid_url",
      externalOpenAllowed: false,
    };
  }
}
