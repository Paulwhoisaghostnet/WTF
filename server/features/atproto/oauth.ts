import { Agent, AtpAgent, type AtpSessionData } from "@atproto/api";
import {
  NodeOAuthClient,
  type NodeSavedSession,
  type NodeSavedState,
} from "@atproto/oauth-client-node";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { encryptOAuthSecret, decryptOAuthSecret } from "../../auth/oauth-crypto";
import { atprotoAccounts } from "@shared/schema";
import {
  ATPROTO_CHAT_SCOPE,
  ATPROTO_TRANSITION_GENERIC_SCOPE,
  buildSkywireAtprotoMaxScope,
  buildSkywireAtprotoScope,
  grantedSkywireCapabilities,
  inferSkywirePermissionTier,
  parseScopeSet,
  type SkywirePermissionCapability,
  type SkywirePermissionTier,
} from "@shared/atproto-permissions";

const stateStore = new Map<string, NodeSavedState>();
const pendingOAuthSessions = new Map<string, NodeSavedSession>();
let oauthClient: NodeOAuthClient | null = null;

export const ATPROTO_SCOPE = buildSkywireAtprotoScope("be-bold", false);
export const ATPROTO_MAX_SCOPE = buildSkywireAtprotoMaxScope();

const DEFAULT_ATPROTO_PDS = "https://bsky.social";
const DEFAULT_ATPROTO_APPVIEW = "https://api.bsky.app";
const DEFAULT_ATPROTO_SEARCH_APPVIEW = "https://api.bsky.app";

function normalizeAtprotoHandleForCompare(handle: string | null | undefined): string {
  return String(handle || "").trim().replace(/^@+/, "").toLowerCase().replace(/\.$/, "");
}

function reservedSkywirePlatformHandles(): Set<string> {
  return new Set(
    [
      process.env.SKYWIRE_WTF_ATPROTO_ACTOR,
      process.env.ATPROTO_WTF_ACTOR,
      "wtfgameshow.bsky.social",
    ]
      .map(normalizeAtprotoHandleForCompare)
      .filter(Boolean)
  );
}

function isReservedSkywirePlatformHandle(handle: string | null | undefined): boolean {
  if (process.env.SKYWIRE_ALLOW_PLATFORM_ACTOR_OAUTH === "true") return false;
  return reservedSkywirePlatformHandles().has(normalizeAtprotoHandleForCompare(handle));
}

async function didBelongsToReservedSkywirePlatformActor(did: string): Promise<boolean> {
  const [row] = await db
    .select({ handle: atprotoAccounts.handle })
    .from(atprotoAccounts)
    .where(and(eq(atprotoAccounts.did, did), isNull(atprotoAccounts.disconnectedAt)))
    .limit(1);
  return Boolean(row && isReservedSkywirePlatformHandle(row.handle));
}

export class AtprotoSessionUnavailableError extends Error {
  status = 409;
  code = "atproto_session_reconnect_required";
  action = "reconnect_atproto";
  reason: string;

  constructor(reason: string, cause?: unknown) {
    super("Skywire's AT Protocol session needs to be reconnected. Connect Bluesky again to refresh the session.");
    this.name = "AtprotoSessionUnavailableError";
    this.reason = reason;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export function isAtprotoSessionUnavailableError(err: unknown): err is AtprotoSessionUnavailableError {
  return err instanceof AtprotoSessionUnavailableError;
}

export function atprotoAccountSessionSummary(account: typeof atprotoAccounts.$inferSelect | null): {
  status: "none" | "oauth_ready" | "credential_ready" | "reconnect_required";
  reconnectRequired: boolean;
  reason: string | null;
} {
  if (!account) return { status: "none", reconnectRequired: false, reason: null };
  if (!account.encryptedAccessToken || !account.encryptedRefreshToken) {
    return {
      status: "reconnect_required",
      reconnectRequired: true,
      reason: "missing_token_pair",
    };
  }
  if (account.encryptedDpopKey) {
    return { status: "oauth_ready", reconnectRequired: false, reason: null };
  }
  if (account.oauthIssuer === "credential-session") {
    return { status: "credential_ready", reconnectRequired: false, reason: null };
  }
  return {
    status: "reconnect_required",
    reconnectRequired: true,
    reason: "missing_dpop_key",
  };
}

export function atprotoAccountCapabilities(account: typeof atprotoAccounts.$inferSelect | null): {
  tier: SkywirePermissionTier;
  chatEnabled: boolean;
  capabilities: SkywirePermissionCapability[];
  hasBroadScope: boolean;
} {
  const scopes = account?.oauthScopes || "";
  const capabilities = grantedSkywireCapabilities(scopes);
  if (account?.oauthChatEnabled) capabilities.add("chat");
  return {
    tier: (account?.oauthPermissionTier as SkywirePermissionTier | null) || inferSkywirePermissionTier(scopes),
    chatEnabled: Boolean(account?.oauthChatEnabled || capabilities.has("chat")),
    capabilities: Array.from(capabilities),
    hasBroadScope: capabilities.size > 0 && scopes.split(/[\s,]+/).includes(ATPROTO_TRANSITION_GENERIC_SCOPE),
  };
}

export function accountHasAtprotoCapability(
  account: typeof atprotoAccounts.$inferSelect | null,
  capability: SkywirePermissionCapability
): boolean {
  if (!account) return false;
  return atprotoAccountCapabilities(account).capabilities.includes(capability);
}

function publicBaseUrl(): string {
  return (
    process.env.ATPROTO_PUBLIC_BASE_URL ||
    process.env.PUBLIC_SITE_URL ||
    "http://127.0.0.1:3000"
  ).replace(/\/$/, "");
}

export function atprotoClientIdUrl(): string {
  return (
    process.env.ATPROTO_CLIENT_ID_URL ||
    `${publicBaseUrl()}/.well-known/oauth-client-metadata.json`
  );
}

export function atprotoRedirectUri(): string {
  return `${publicBaseUrl()}/api/atproto/oauth/callback`;
}

export function isAtprotoEnabled(): boolean {
  return process.env.ATPROTO_ENABLED !== "false";
}

function safeParseJson<T>(value: string | null | undefined): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

export function resolveAtprotoOAuthGrantState(params: {
  appName: "skywire" | "tz2at";
  tokenScope?: string | null;
  requestedScope?: string | null;
  chatRequested?: boolean;
  fallbackScope?: string | null;
}): {
  grantedScope: string;
  requestedScope: string;
  chatEnabled: boolean;
} {
  const fallbackScope = params.fallbackScope?.trim() || ATPROTO_SCOPE;
  const requestedScope = params.requestedScope?.trim() || params.tokenScope?.trim() || fallbackScope;
  let grantedScope = params.tokenScope?.trim() || requestedScope;
  if (params.appName === "skywire") {
    const requestedChat =
      Boolean(params.chatRequested) || grantedSkywireCapabilities(requestedScope).has("chat");
    if (requestedChat && !grantedSkywireCapabilities(grantedScope).has("chat")) {
      grantedScope = Array.from(
        new Set([
          ...parseScopeSet(grantedScope),
          ATPROTO_TRANSITION_GENERIC_SCOPE,
          ATPROTO_CHAT_SCOPE,
        ])
      ).join(" ");
    }
  }
  return {
    grantedScope,
    requestedScope,
    chatEnabled: params.appName === "skywire" && grantedSkywireCapabilities(grantedScope).has("chat"),
  };
}

export function encryptedSessionFields(session: NodeSavedSession, options: { oauthScopes?: string | null } = {}): {
  encryptedAccessToken: string | null;
  encryptedRefreshToken: string | null;
  tokenExpiresAt: Date | null;
  oauthIssuer: string | null;
  oauthAudience: string | null;
  oauthScopes: string | null;
  encryptedDpopKey: string;
} {
  const tokenSet = (session as any).tokenSet ?? {};
  const oauthScopesOverride = options.oauthScopes?.trim();
  const rawExpiresAt = tokenSet.expires_at ?? tokenSet.expiresAt;
  const parsedExpiresAt =
    typeof rawExpiresAt === "string" || rawExpiresAt instanceof Date
      ? new Date(rawExpiresAt)
      : typeof rawExpiresAt === "number"
        ? new Date(rawExpiresAt > 10_000_000_000 ? rawExpiresAt : rawExpiresAt * 1000)
        : null;
  const expiresAt =
    parsedExpiresAt && Number.isFinite(parsedExpiresAt.getTime())
      ? parsedExpiresAt
      : null;
  return {
    encryptedAccessToken: tokenSet.access_token
      ? encryptOAuthSecret(String(tokenSet.access_token))
      : null,
    encryptedRefreshToken: tokenSet.refresh_token
      ? encryptOAuthSecret(String(tokenSet.refresh_token))
      : null,
    tokenExpiresAt: expiresAt,
    oauthIssuer: typeof tokenSet.iss === "string" ? tokenSet.iss : null,
    oauthAudience: typeof tokenSet.aud === "string" ? tokenSet.aud : null,
    oauthScopes:
      oauthScopesOverride || (typeof tokenSet.scope === "string" ? tokenSet.scope : ATPROTO_SCOPE),
    encryptedDpopKey: encryptOAuthSecret(JSON.stringify((session as any).dpopJwk ?? null)),
  };
}

function defaultAtprotoPds(): string {
  return process.env.ATPROTO_DEFAULT_PDS || DEFAULT_ATPROTO_PDS;
}

function oauthResourceForRow(row: typeof atprotoAccounts.$inferSelect): string {
  return row.pdsUrl || row.oauthIssuer || defaultAtprotoPds();
}

function oauthIssuerForRow(row: typeof atprotoAccounts.$inferSelect): string {
  return row.oauthIssuer || row.pdsUrl || defaultAtprotoPds();
}

export function restoreSessionFromRow(row: typeof atprotoAccounts.$inferSelect): NodeSavedSession | undefined {
  if (!row.encryptedDpopKey) return undefined;
  if (!row.encryptedAccessToken || !row.encryptedRefreshToken) return undefined;
  const dpopJwk = safeParseJson<Record<string, unknown>>(
    decryptOAuthSecret(row.encryptedDpopKey)
  );
  if (!dpopJwk) return undefined;
  const tokenSet: Record<string, unknown> = {
    iss: oauthIssuerForRow(row),
    sub: row.did,
    aud: oauthResourceForRow(row),
    token_type: "DPoP",
    scope: row.oauthScopes || ATPROTO_SCOPE,
  };
  tokenSet.access_token = decryptOAuthSecret(row.encryptedAccessToken);
  tokenSet.refresh_token = decryptOAuthSecret(row.encryptedRefreshToken);
  if (row.tokenExpiresAt) {
    tokenSet.expires_at = new Date(row.tokenExpiresAt).toISOString();
  }
  return {
    dpopJwk: dpopJwk as any,
    authMethod: { method: "none" } as any,
    tokenSet: tokenSet as any,
  };
}

export async function persistOAuthSessionForDid(
  did: string,
  session: NodeSavedSession,
  options: {
    accountId?: number;
    userId?: number;
    oauthRequestedScopes?: string | null;
    oauthPermissionTier?: string | null;
    oauthChatEnabled?: boolean;
    oauthScopes?: string | null;
  } = {}
): Promise<void> {
  const fields = encryptedSessionFields(session, { oauthScopes: options.oauthScopes });
  const updateValues = {
    encryptedAccessToken: fields.encryptedAccessToken,
    encryptedRefreshToken: fields.encryptedRefreshToken,
    encryptedDpopKey: fields.encryptedDpopKey,
    tokenExpiresAt: fields.tokenExpiresAt,
    oauthIssuer: fields.oauthIssuer,
    ...(fields.oauthAudience ? { pdsUrl: fields.oauthAudience } : {}),
    oauthScopes: fields.oauthScopes,
    ...(options.oauthRequestedScopes ? { oauthRequestedScopes: options.oauthRequestedScopes } : {}),
    ...(options.oauthPermissionTier ? { oauthPermissionTier: options.oauthPermissionTier } : {}),
    ...(typeof options.oauthChatEnabled === "boolean" ? { oauthChatEnabled: options.oauthChatEnabled } : {}),
    updatedAt: new Date(),
  };
  if (options.accountId == null && options.userId == null && await didBelongsToReservedSkywirePlatformActor(did)) {
    pendingOAuthSessions.set(did, session);
    return;
  }
  const whereClause =
    options.accountId != null
      ? and(eq(atprotoAccounts.id, options.accountId), eq(atprotoAccounts.did, did), isNull(atprotoAccounts.disconnectedAt))
      : options.userId != null
        ? and(eq(atprotoAccounts.userId, options.userId), eq(atprotoAccounts.did, did), isNull(atprotoAccounts.disconnectedAt))
        : and(eq(atprotoAccounts.did, did), isNull(atprotoAccounts.disconnectedAt));
  const rows = await db
    .update(atprotoAccounts)
    .set(updateValues)
    .where(whereClause)
    .returning({ id: atprotoAccounts.id });
  if (rows.length === 0) {
    pendingOAuthSessions.set(did, session);
  } else {
    pendingOAuthSessions.delete(did);
  }
}

export function takePendingOAuthSessionForDid(did: string): NodeSavedSession | null {
  const session = pendingOAuthSessions.get(did) ?? null;
  pendingOAuthSessions.delete(did);
  return session;
}

export async function getAtprotoOAuthClient(): Promise<NodeOAuthClient> {
  if (oauthClient) return oauthClient;
  oauthClient = new NodeOAuthClient({
    clientMetadata: {
      client_id: atprotoClientIdUrl(),
      client_name: "WTF Skywire",
      client_uri: publicBaseUrl(),
      redirect_uris: [atprotoRedirectUri()],
      scope: ATPROTO_MAX_SCOPE,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      application_type: "web",
      dpop_bound_access_tokens: true,
    },
    allowHttp: process.env.NODE_ENV !== "production",
    responseMode: "query",
    stateStore: {
      async get(key: string) {
        return stateStore.get(key);
      },
      async set(key: string, value: NodeSavedState) {
        stateStore.set(key, value);
      },
      async del(key: string) {
        stateStore.delete(key);
      },
    },
    sessionStore: {
      async get(key: string) {
        const pending = pendingOAuthSessions.get(key);
        if (pending) return pending;
        const [row] = await db
          .select()
          .from(atprotoAccounts)
          .where(and(eq(atprotoAccounts.did, key), isNull(atprotoAccounts.disconnectedAt)))
          .limit(1);
        if (!row) return undefined;
        const restored = restoreSessionFromRow(row);
        if (!restored) {
          throw new AtprotoSessionUnavailableError("stored_session_incomplete");
        }
        return restored;
      },
      async set(key: string, value: NodeSavedSession) {
        await persistOAuthSessionForDid(key, value);
      },
      async del(key: string) {
        pendingOAuthSessions.delete(key);
        console.warn("[skywire] atproto oauth session delete requested; keeping DB tokens until explicit unlink", {
          did: key,
        });
      },
    },
  });
  return oauthClient;
}

export async function getAtprotoAgentForDid(did: string): Promise<Agent> {
  const [row] = await db
    .select()
    .from(atprotoAccounts)
    .where(and(eq(atprotoAccounts.did, did), isNull(atprotoAccounts.disconnectedAt)))
    .limit(1);
  if (!row) {
    throw new AtprotoSessionUnavailableError("account_not_found");
  }
  if (row && !row.encryptedDpopKey && row.encryptedAccessToken && row.encryptedRefreshToken) {
    const credentialAgent = new AtpAgent({
      service: row.pdsUrl || defaultAtprotoPds(),
      async persistSession(_event, session) {
        if (!session) return;
        await persistCredentialSessionForDid(session.did, session);
      },
    });
    await credentialAgent.resumeSession({
      did: row.did,
      handle: row.handle,
      accessJwt: decryptOAuthSecret(row.encryptedAccessToken),
      refreshJwt: decryptOAuthSecret(row.encryptedRefreshToken),
      active: true,
    });
    return credentialAgent;
  }
  if (!row.encryptedAccessToken || !row.encryptedRefreshToken || !row.encryptedDpopKey) {
    throw new AtprotoSessionUnavailableError("missing_stored_oauth_session");
  }
  const client = await getAtprotoOAuthClient();
  try {
    const session = await client.restore(did, "auto");
    return new Agent(session);
  } catch (err) {
    console.warn("[skywire] atproto oauth session restore failed:", {
      did,
      reason: err instanceof Error ? err.message : String(err),
    });
    throw new AtprotoSessionUnavailableError("oauth_restore_failed", err);
  }
}

export function getPublicAtprotoAgent(): Agent {
  return new Agent(process.env.ATPROTO_DEFAULT_APPVIEW || DEFAULT_ATPROTO_APPVIEW);
}

export function getSearchAtprotoAgent(): Agent {
  return new Agent(process.env.ATPROTO_SEARCH_APPVIEW || DEFAULT_ATPROTO_SEARCH_APPVIEW);
}

export async function persistCredentialSessionForDid(
  did: string,
  session: AtpSessionData
): Promise<void> {
  await db
    .update(atprotoAccounts)
    .set({
      encryptedAccessToken: encryptOAuthSecret(session.accessJwt),
      encryptedRefreshToken: encryptOAuthSecret(session.refreshJwt),
      tokenExpiresAt: null,
      oauthIssuer: "credential-session",
      oauthScopes: "atproto",
      oauthRequestedScopes: "atproto",
      oauthPermissionTier: "be-safe",
      oauthChatEnabled: false,
      updatedAt: new Date(),
    })
    .where(and(eq(atprotoAccounts.did, did), isNull(atprotoAccounts.disconnectedAt)));
}
