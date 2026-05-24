/**
 * Mastodon OAuth2 stub.
 * Full OAuth flow is out of scope for the initial integration.
 * Users can link accounts via personal access tokens (from their Mastodon
 * profile → Settings → Development → New Application).
 */

export { encryptToken, decryptToken } from "../../lib/token-encryption";

export interface MastodonLinkPayload {
  instanceUrl: string;
  accessToken: string;
}

export function validateInstanceUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, "");
  if (!trimmed.startsWith("https://")) {
    throw new Error("Instance URL must start with https://");
  }
  return trimmed;
}
