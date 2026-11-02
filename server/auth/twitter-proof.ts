import { createHmac, randomBytes } from "node:crypto";

/**
 * X's OAuth 1.0a access-token response can include user_id and screen_name.
 * Profile proof uses only that signed exchange. It never calls a metered user
 * lookup and never retains the returned access token.
 *
 * https://docs.x.com/fundamentals/authentication/api-reference
 */
export const X_PROOF_REQUEST_TOKEN_URL = "https://api.x.com/oauth/request_token";
export const X_PROOF_ACCESS_TOKEN_URL = "https://api.x.com/oauth/access_token";
export const X_PROOF_AUTHORIZE_URL = "https://api.x.com/oauth/authorize";

type OAuth1Request = {
  method: "POST";
  url: string;
  consumerKey: string;
  consumerSecret: string;
  token?: string;
  tokenSecret?: string;
  callback?: string;
  body?: URLSearchParams;
  nonce?: string;
  timestamp?: string;
  version?: "1.0" | null;
};

export class XProofProviderError extends Error {
  constructor(public readonly stage: "request" | "exchange", public readonly status: number) {
    super(`X ${stage} token failed with HTTP ${status}`);
    this.name = "XProofProviderError";
  }
}

function oauthEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

export function normalizeXProofHandle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .trim()
    .replace(/^@+/, "")
    .replace(/^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/@?/i, "")
    .split(/[/?#]/, 1)[0]
    .trim();
  return /^[A-Za-z0-9_]{1,15}$/.test(cleaned) ? cleaned.toLowerCase() : null;
}

/** W explicitly owns API-action OAuth; every other target is profile proof. */
export function shouldUseXIdentityProof(returnTo: unknown): boolean {
  return returnTo !== "w";
}

/** OAuth 1.0a HMAC-SHA1 signing, including query and form-body parameters. */
export function buildXOAuth1Authorization(request: OAuth1Request): string {
  const url = new URL(request.url);
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: request.consumerKey,
    oauth_nonce: request.nonce ?? randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: request.timestamp ?? String(Math.floor(Date.now() / 1000)),
  };
  if (request.version !== null) oauthParams.oauth_version = "1.0";
  if (request.token) oauthParams.oauth_token = request.token;
  if (request.callback) oauthParams.oauth_callback = request.callback;

  const pairs: Array<[string, string]> = [];
  url.searchParams.forEach((value, key) => pairs.push([key, value]));
  request.body?.forEach((value, key) => pairs.push([key, value]));
  Object.entries(oauthParams).forEach(([key, value]) => pairs.push([key, value]));
  const normalized = pairs
    .map(([key, value]) => [oauthEncode(key), oauthEncode(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0
    )
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const signatureBase = [
    request.method,
    oauthEncode(`${url.origin}${url.pathname}`),
    oauthEncode(normalized),
  ].join("&");
  const signingKey = `${oauthEncode(request.consumerSecret)}&${oauthEncode(request.tokenSecret ?? "")}`;
  const signature = createHmac("sha1", signingKey).update(signatureBase).digest("base64");
  return "OAuth " + Object.entries({ ...oauthParams, oauth_signature: signature })
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${oauthEncode(key)}="${oauthEncode(value)}"`)
    .join(", ");
}

export function parseXOAuth1Form(text: string): URLSearchParams {
  return new URLSearchParams(text);
}

export function parseXProofIdentity(text: string): { id: string; handle: string } | null {
  const params = parseXOAuth1Form(text);
  const id = String(params.get("user_id") || "").trim();
  const handle = normalizeXProofHandle(params.get("screen_name"));
  if (!/^\d+$/.test(id) || !handle) return null;
  if (!params.get("oauth_token") || !params.get("oauth_token_secret")) return null;
  return { id, handle };
}

export function xProofAccountUpdate(
  current: { twitterId?: string | null },
  identity: { id: string; handle: string }
): Record<string, unknown> {
  const update: Record<string, unknown> = {
    twitterId: identity.id,
    twitterHandle: identity.handle,
    twitterVerified: true,
    updatedAt: new Date(),
  };
  if (String(current.twitterId || "") !== identity.id) {
    // This is identity-only proof. Any API grants for a previous X identity
    // must be removed; the proof exchange itself grants no stored API access.
    update.twitterOauthToken = null;
    update.twitterOauthTokenSecret = null;
    update.twitterOauth2AccessToken = null;
    update.twitterOauth2RefreshToken = null;
    update.twitterOauth2Scopes = null;
    update.twitterOauth2ExpiresAt = null;
  }
  return update;
}

export function xProofAuthorizeUrl(requestToken: string, expectedHandle: string | null): string {
  const url = new URL(X_PROOF_AUTHORIZE_URL);
  url.searchParams.set("oauth_token", requestToken);
  // Unlike X OAuth 2.0, this documented parameter forces the account holder
  // to authenticate again instead of silently reusing the previous X account.
  url.searchParams.set("force_login", "true");
  if (expectedHandle) url.searchParams.set("screen_name", expectedHandle);
  return url.toString();
}

export async function requestXProofToken(
  credentials: { consumerKey: string; consumerSecret: string },
  callbackUrl: string,
  fetcher: typeof fetch = fetch
): Promise<{ token: string; secret: string }> {
  const body = new URLSearchParams({ x_auth_access_type: "read" });
  const response = await fetcher(X_PROOF_REQUEST_TOKEN_URL, {
    method: "POST",
    redirect: "manual",
    headers: {
      Authorization: buildXOAuth1Authorization({
        method: "POST",
        url: X_PROOF_REQUEST_TOKEN_URL,
        consumerKey: credentials.consumerKey,
        consumerSecret: credentials.consumerSecret,
        callback: callbackUrl,
        body,
      }),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!response.ok) throw new XProofProviderError("request", response.status);
  const params = parseXOAuth1Form(await response.text());
  const token = params.get("oauth_token") || "";
  const secret = params.get("oauth_token_secret") || "";
  if (!token || !secret || params.get("oauth_callback_confirmed") !== "true") {
    throw new XProofProviderError("request", response.status);
  }
  return { token, secret };
}

export async function exchangeXProofToken(
  credentials: { consumerKey: string; consumerSecret: string },
  pending: { token: string; secret: string },
  verifier: string,
  fetcher: typeof fetch = fetch
): Promise<{ id: string; handle: string } | null> {
  const body = new URLSearchParams({ oauth_verifier: verifier });
  const response = await fetcher(X_PROOF_ACCESS_TOKEN_URL, {
    method: "POST",
    redirect: "manual",
    headers: {
      Authorization: buildXOAuth1Authorization({
        method: "POST",
        url: X_PROOF_ACCESS_TOKEN_URL,
        consumerKey: credentials.consumerKey,
        consumerSecret: credentials.consumerSecret,
        token: pending.token,
        tokenSecret: pending.secret,
        body,
      }),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!response.ok) throw new XProofProviderError("exchange", response.status);
  return parseXProofIdentity(await response.text());
}
