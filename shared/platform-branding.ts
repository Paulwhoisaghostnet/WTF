/**
 * Canonical wtfOS platform branding. Gameshow-specific product names and domains
 * live in the GAMESHOW_* exports and should only appear in gameshow apps/surfaces.
 */

export const WTFOS_PLATFORM_NAME = "wtfOS";
export const WTFOS_PLATFORM_LONG_NAME = "WTF OS";
export const WTFOS_PLATFORM_DOMAIN = "wtfos.app";
export const WTFOS_PLATFORM_ORIGIN = `https://${WTFOS_PLATFORM_DOMAIN}`;

/** AT identity / PDS fleet domain (see docs/atproto/00-decisions.md). */
export const WTFOS_IDENTITY_DOMAIN = "wtfos.me";
export const WTFOS_PDS_PUBLIC_URL = `https://pds.${WTFOS_IDENTITY_DOMAIN}`;

export const WTFOS_GAMESHOW_NAME = "WTF Gameshow";
export const WTFOS_GAMESHOW_DOMAIN = "wtfgameshow.app";
export const WTFOS_GAMESHOW_ORIGIN = `https://${WTFOS_GAMESHOW_DOMAIN}`;

/** Deployment aliases still honored for CORS, browser policy, and redirects. */
export const WTFOS_LEGACY_PLATFORM_ORIGINS = [
  WTFOS_GAMESHOW_ORIGIN,
  "https://wtfgameshow.netlify.app",
] as const;

export const WTFOS_WALLET_LOGIN_CHALLENGE_PREFIX = `${WTFOS_PLATFORM_LONG_NAME} Login\n\nNonce: `;
export const WTFOS_WALLET_DAPP_NAME = WTFOS_PLATFORM_LONG_NAME;

export function defaultPublicSiteHost(): string {
  return WTFOS_PLATFORM_DOMAIN;
}

export function resolvePublicSiteOrigin(envPublicSiteUrl?: string | null): string {
  const configured = String(envPublicSiteUrl || "").trim().replace(/\/+$/, "");
  return configured || WTFOS_PLATFORM_ORIGIN;
}
