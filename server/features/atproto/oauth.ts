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

const stateStore = new Map<string, NodeSavedState>();
const pendingOAuthSessions = new Map<string, NodeSavedSession>();
let oauthClient: NodeOAuthClient | null = null;

export const ATPROTO_SCOPE = "atproto transition:generic";

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

function encryptedSessionFields(session: NodeSavedSession): {
  encryptedAccessToken: string | null;
  encryptedRefreshToken: string | null;
  tokenExpiresAt: Date | null;
  oauthIssuer: string | null;
  oauthScopes: string | null;
  encryptedDpopKey: string;
} {
  const tokenSet = (session as any).tokenSet ?? {};
  const expiresAt =
    typeof tokenSet.expires_at === "number"
      ? new Date(tokenSet.expires_at * 1000)
      : typeof tokenSet.expiresAt === "number"
        ? new Date(tokenSet.expiresAt)
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
    oauthScopes:
      typeof tokenSet.scope === "string" ? tokenSet.scope : ATPROTO_SCOPE,
    encryptedDpopKey: encryptOAuthSecret(JSON.stringify((session as any).dpopJwk ?? null)),
  };
}

function restoreSessionFromRow(row: typeof atprotoAccounts.$inferSelect): NodeSavedSession | undefined {
  if (!row.encryptedDpopKey) return undefined;
  const dpopJwk = safeParseJson<Record<string, unknown>>(
    decryptOAuthSecret(row.encryptedDpopKey)
  );
  if (!dpopJwk) return undefined;
  const tokenSet: Record<string, unknown> = {
    token_type: "DPoP",
    scope: row.oauthScopes || ATPROTO_SCOPE,
  };
  if (row.encryptedAccessToken) {
    tokenSet.access_token = decryptOAuthSecret(row.encryptedAccessToken);
  }
  if (row.encryptedRefreshToken) {
    tokenSet.refresh_token = decryptOAuthSecret(row.encryptedRefreshToken);
  }
  if (row.tokenExpiresAt) {
    tokenSet.expires_at = Math.floor(new Date(row.tokenExpiresAt).getTime() / 1000);
  }
  return {
    dpopJwk: dpopJwk as any,
    authMethod: "none" as any,
    tokenSet: tokenSet as any,
  };
}

export async function persistOAuthSessionForDid(
  did: string,
  session: NodeSavedSession
): Promise<void> {
  const fields = encryptedSessionFields(session);
  const rows = await db
    .update(atprotoAccounts)
    .set({
      encryptedAccessToken: fields.encryptedAccessToken,
      encryptedRefreshToken: fields.encryptedRefreshToken,
      encryptedDpopKey: fields.encryptedDpopKey,
      tokenExpiresAt: fields.tokenExpiresAt,
      oauthIssuer: fields.oauthIssuer,
      oauthScopes: fields.oauthScopes,
      updatedAt: new Date(),
    })
    .where(and(eq(atprotoAccounts.did, did), isNull(atprotoAccounts.disconnectedAt)))
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
      scope: ATPROTO_SCOPE,
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
        return row ? restoreSessionFromRow(row) : undefined;
      },
      async set(key: string, value: NodeSavedSession) {
        await persistOAuthSessionForDid(key, value);
      },
      async del(key: string) {
        await db
          .update(atprotoAccounts)
          .set({
            encryptedAccessToken: null,
            encryptedRefreshToken: null,
            encryptedDpopKey: null,
            updatedAt: new Date(),
          })
          .where(and(eq(atprotoAccounts.did, key), isNull(atprotoAccounts.disconnectedAt)));
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
  if (row && !row.encryptedDpopKey && row.encryptedAccessToken && row.encryptedRefreshToken) {
    const credentialAgent = new AtpAgent({
      service: row.pdsUrl || process.env.ATPROTO_DEFAULT_PDS || "https://bsky.social",
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
  const client = await getAtprotoOAuthClient();
  const session = await client.restore(did, "auto");
  return new Agent(session);
}

export function getPublicAtprotoAgent(): Agent {
  return new Agent(process.env.ATPROTO_DEFAULT_APPVIEW || "https://public.api.bsky.app");
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
      updatedAt: new Date(),
    })
    .where(and(eq(atprotoAccounts.did, did), isNull(atprotoAccounts.disconnectedAt)));
}
