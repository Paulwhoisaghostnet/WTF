import type { SpineConfig, SpineRoutingRule, PdsServiceConfig } from "@wtfos/atproto-spine";

/**
 * Kernel-side spine configuration (S2.1). Builds an app-agnostic SpineConfig for
 * @wtfos/atproto-spine from wtfOS env vars. Pure + side-effect free so it is unit
 * testable. The master flag ATPROTO_SPINE_ENABLED gates all NEW structured
 * publishing; the pre-existing tz2at activity outbox is unaffected.
 */

export const ATPROTO_SPINE_FLAG = "ATPROTO_SPINE_ENABLED";

/** Constitutional domains that each get a PDS + lexicon namespace segment. */
export const WTFOS_DOMAINS = [
  "social",
  "commerce",
  "media",
  "arcade",
  "tezos",
  "ops",
  "os",
] as const;
export type WtfosDomain = (typeof WTFOS_DOMAINS)[number];

/** Handle labels that may never be registered by users (infra/reserved). Mirrors docs/atproto/02-dns-tls.md. */
export const RESERVED_HANDLES = [
  "relay",
  "pds",
  "plc",
  "mod",
  "api",
  "users",
  "private",
  "www",
  "admin",
  ...WTFOS_DOMAINS,
] as const;

export function isSpineEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[ATPROTO_SPINE_FLAG] === "true" || env[ATPROTO_SPINE_FLAG] === "1";
}

function trimSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function masterConfig(env: NodeJS.ProcessEnv): PdsServiceConfig {
  return {
    url: trimSlash(
      env.WTFOS_PDS_INTERNAL_URL ||
        env.WTFOS_PRIMARY_PDS_URL ||
        env.WTFOS_PDS_PUBLIC_URL ||
        "http://wtfos-pds:3000",
    ),
    identifier: env.WTFOS_PRIMARY_PDS_IDENTIFIER || env.WTFOS_PRIMARY_ATPROTO_HANDLE || undefined,
    password: env.WTFOS_PRIMARY_PDS_PASSWORD || undefined,
    // Per-PDS secret separation (S5.2): each PDS may carry its own admin password, falling back
    // to the shared WTFOS_PDS_ADMIN_PASSWORD. Must mirror the docker-compose fallback chain.
    adminPassword: env.WTFOS_PDS_MASTER_ADMIN_PASSWORD || env.WTFOS_PDS_ADMIN_PASSWORD || undefined,
    repoDid: env.WTFOS_PRIMARY_ATPROTO_DID || undefined,
  };
}

function domainConfig(domain: WtfosDomain, env: NodeJS.ProcessEnv): PdsServiceConfig {
  const upper = domain.toUpperCase();
  return {
    url: trimSlash(env[`WTFOS_PDS_${upper}_INTERNAL_URL`] || `http://wtfos-pds-${domain}:3000`),
    adminPassword: env[`WTFOS_PDS_${upper}_ADMIN_PASSWORD`] || env.WTFOS_PDS_ADMIN_PASSWORD || undefined,
  };
}

/** Default `$type`-prefix → domain routing. Echoes fan out by these rules (S2.5). */
export function defaultRoutingRules(namespace = "app.wtfos"): SpineRoutingRule[] {
  return WTFOS_DOMAINS.map((domain) => ({ typePrefix: `${namespace}.${domain}.`, domain }));
}

export function getSpineConfig(env: NodeJS.ProcessEnv = process.env): SpineConfig {
  const networkDomain = env.WTFOS_ATPROTO_NETWORK_DOMAIN || "wtfos.me";
  const namespace = env.WTFOS_LEXICON_NAMESPACE || "app.wtfos";
  const domains: Record<string, PdsServiceConfig> = {};
  for (const domain of WTFOS_DOMAINS) {
    domains[domain] = domainConfig(domain, env);
  }
  return {
    networkDomain,
    lexiconNamespace: namespace,
    master: masterConfig(env),
    users: {
      url: trimSlash(env.WTFOS_PDS_USERS_INTERNAL_URL || "http://wtfos-pds-users:3000"),
      adminPassword: env.WTFOS_PDS_USERS_ADMIN_PASSWORD || env.WTFOS_PDS_ADMIN_PASSWORD || undefined,
    },
    privatePds: {
      url: trimSlash(env.WTFOS_PDS_PRIVATE_INTERNAL_URL || "http://wtfos-pds-private:3000"),
      adminPassword: env.WTFOS_PDS_PRIVATE_ADMIN_PASSWORD || env.WTFOS_PDS_ADMIN_PASSWORD || undefined,
    },
    relayUrl:
      env.WTFOS_RELAY_SUBSCRIBE_URL ||
      "ws://host.docker.internal:2470/xrpc/com.atproto.sync.subscribeRepos",
    domains,
    routing: defaultRoutingRules(namespace),
    reservedHandles: [...RESERVED_HANDLES],
  };
}

/** Infra hostnames that are always allowed on-demand TLS (for the tls-gate). */
export function infraHosts(env: NodeJS.ProcessEnv = process.env): string[] {
  const base = env.WTFOS_ATPROTO_NETWORK_DOMAIN || "wtfos.me";
  return [
    `pds.${base}`,
    `relay.${base}`,
    `plc.${base}`,
    `mod.${base}`,
    `users.${base}`,
    `private.${base}`,
    ...WTFOS_DOMAINS.map((d) => `${d}.${base}`),
  ];
}
