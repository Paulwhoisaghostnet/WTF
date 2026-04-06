/**
 * OAuth providers require callback URLs that match the app origin exactly.
 * Set PUBLIC_SITE_URL on Netlify (e.g. https://wtfgameshow.netlify.app) with no trailing slash.
 */
export function getPublicSiteOrigin(): string {
  const u = process.env.PUBLIC_SITE_URL?.trim();
  if (u) return u.replace(/\/$/, "");
  return "";
}

/** Full callback URL for Passport (Twitter/Discord require exact match in developer consoles). */
export function oauthCallbackUrl(path: string): string {
  const base = getPublicSiteOrigin();
  const p = path.startsWith("/") ? path : `/${path}`;
  if (base) return `${base}${p}`;
  return p;
}
