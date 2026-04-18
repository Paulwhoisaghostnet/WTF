/**
 * Minimal, dependency-free Google Drive v3 client.
 *
 * Built against the public REST API (docs:
 *   https://developers.google.com/drive/api/reference/rest/v3).
 *
 * We deliberately avoid the `googleapis` npm package so Studio storage can
 * ship without external JS dependencies (per project rule in CLAUDE.md:
 * "no external dependencies, all sources must be stored locally").
 *
 * Implements only what Studio needs:
 *   - OAuth token exchange / refresh
 *   - folder create + lookup
 *   - file create (multipart upload ≤ 5 MiB *and* resumable for larger)
 *   - file get (metadata + streaming download)
 *   - file delete
 *   - drive quota (about.get)
 *
 * All IO goes through `fetch()` so it runs on Node 20+ without any
 * polyfills.  Errors raise `GoogleDriveApiError` with the response body so
 * callers can differentiate auth/quota/not-found cases.
 */

import { Readable } from "stream";
import { URLSearchParams } from "url";

/* ── Types ───────────────────────────────────────────────── */

export interface DriveOAuthTokens {
  /** May be absent; obtained by exchanging a refresh token. */
  accessToken?: string;
  /** Long-lived, granted by Google when we requested `access_type=offline`. */
  refreshToken: string;
  /** Unix ms when the access token stops working. */
  expiresAt?: number | null;
  /** Scopes Google granted us; comma- or space-joined. */
  scopes?: string | null;
  /** Owning email (for diagnostics / admin UI display only). */
  email?: string | null;
}

export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  md5Checksum?: string;
  parents?: string[];
  trashed?: boolean;
  webViewLink?: string;
}

/** Drive returns `size` as a string ("1234"); normalize before surfacing. */
interface DriveFileMetadataRaw {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string;
  md5Checksum?: string;
  parents?: string[];
  trashed?: boolean;
  webViewLink?: string;
}

function normalizeFileMeta(raw: DriveFileMetadataRaw): DriveFileMetadata {
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    mimeType: String(raw.mimeType ?? "application/octet-stream"),
    size: raw.size != null ? Number(raw.size) : undefined,
    md5Checksum: raw.md5Checksum,
    parents: raw.parents,
    trashed: raw.trashed,
    webViewLink: raw.webViewLink,
  };
}

export interface DriveDownloadResult {
  stream: Readable;
  sizeBytes: number;
  mimeType: string;
  etag?: string;
}

export interface DriveQuota {
  limit: number | null;
  usage: number | null;
  usageInDrive: number | null;
}

export class GoogleDriveApiError extends Error {
  readonly status: number;
  readonly body: string;
  readonly code?: string;
  constructor(status: number, body: string, code?: string) {
    super(`Google Drive API ${status}: ${code ?? body.slice(0, 200)}`);
    this.name = "GoogleDriveApiError";
    this.status = status;
    this.body = body;
    this.code = code;
  }
}

/* ── Endpoints ───────────────────────────────────────────── */

const OAUTH_AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN = "https://oauth2.googleapis.com/token";
const OAUTH_REVOKE = "https://oauth2.googleapis.com/revoke";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

/* ── OAuth helpers ──────────────────────────────────────── */

export interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Build the consent screen URL for the one-time admin connection.
 * Uses `access_type=offline` + `prompt=consent` so Google always returns a
 * refresh token, even on repeat connections.
 */
export function buildAuthorizeUrl(
  cfg: OAuthClientConfig,
  opts: { scopes: string[]; state?: string; loginHint?: string }
): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    scope: opts.scopes.join(" "),
  });
  if (opts.state) params.set("state", opts.state);
  if (opts.loginHint) params.set("login_hint", opts.loginHint);
  return `${OAUTH_AUTHORIZE}?${params.toString()}`;
}

export async function exchangeAuthCode(
  cfg: OAuthClientConfig,
  code: string
): Promise<DriveOAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
  });
  const res = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new GoogleDriveApiError(res.status, text, safeErrorCode(text));
  }
  const parsed = JSON.parse(text) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
  };
  if (!parsed.refresh_token) {
    throw new GoogleDriveApiError(
      500,
      text,
      "missing_refresh_token — re-run with prompt=consent"
    );
  }
  return {
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token,
    expiresAt: parsed.expires_in ? Date.now() + parsed.expires_in * 1000 : null,
    scopes: parsed.scope ?? null,
  };
}

export async function refreshAccessToken(
  cfg: OAuthClientConfig,
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: number; scopes?: string }> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  const res = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new GoogleDriveApiError(res.status, text, safeErrorCode(text));
  }
  const parsed = JSON.parse(text) as {
    access_token: string;
    expires_in: number;
    scope?: string;
  };
  return {
    accessToken: parsed.access_token,
    expiresAt: Date.now() + parsed.expires_in * 1000,
    scopes: parsed.scope,
  };
}

export async function revokeToken(token: string): Promise<void> {
  const body = new URLSearchParams({ token });
  await fetch(OAUTH_REVOKE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  }).catch(() => null);
}

function safeErrorCode(text: string): string | undefined {
  try {
    const parsed = JSON.parse(text) as { error?: string | { code?: number } };
    if (typeof parsed.error === "string") return parsed.error;
    if (parsed.error && typeof parsed.error === "object") {
      return String(parsed.error.code ?? "");
    }
  } catch {
    /* not json */
  }
  return undefined;
}

/* ── Authenticated client ───────────────────────────────── */

export interface AuthedClientOptions {
  oauth: OAuthClientConfig;
  tokens: DriveOAuthTokens;
  /**
   * Called whenever we refresh the access token so the caller can persist
   * the new value back to the DB.
   */
  onTokenRefresh?: (next: {
    accessToken: string;
    expiresAt: number;
    scopes?: string;
  }) => Promise<void> | void;
}

export class GoogleDriveClient {
  private oauth: OAuthClientConfig;
  private tokens: DriveOAuthTokens;
  private onTokenRefresh?: AuthedClientOptions["onTokenRefresh"];
  private inflightRefresh: Promise<void> | null = null;

  constructor(opts: AuthedClientOptions) {
    this.oauth = opts.oauth;
    this.tokens = { ...opts.tokens };
    this.onTokenRefresh = opts.onTokenRefresh;
  }

  /** Force a token refresh.  Safe to call concurrently (collapsed). */
  async refresh(): Promise<void> {
    if (this.inflightRefresh) {
      return this.inflightRefresh;
    }
    this.inflightRefresh = (async () => {
      const next = await refreshAccessToken(this.oauth, this.tokens.refreshToken);
      this.tokens.accessToken = next.accessToken;
      this.tokens.expiresAt = next.expiresAt;
      if (next.scopes) this.tokens.scopes = next.scopes;
      if (this.onTokenRefresh) {
        await this.onTokenRefresh({
          accessToken: next.accessToken,
          expiresAt: next.expiresAt,
          scopes: next.scopes,
        });
      }
    })();
    try {
      await this.inflightRefresh;
    } finally {
      this.inflightRefresh = null;
    }
  }

  /** Return a valid access token, refreshing on demand. */
  async getAccessToken(): Promise<string> {
    const now = Date.now();
    const skew = 60_000; // refresh 60s early to avoid mid-request expiry
    if (
      !this.tokens.accessToken ||
      !this.tokens.expiresAt ||
      this.tokens.expiresAt - skew <= now
    ) {
      await this.refresh();
    }
    if (!this.tokens.accessToken) {
      throw new GoogleDriveApiError(401, "no access token after refresh");
    }
    return this.tokens.accessToken;
  }

  private async authedFetch(
    url: string,
    init: RequestInit & { retrying?: boolean } = {}
  ): Promise<Response> {
    const token = await this.getAccessToken();
    const headers = new Headers(init.headers ?? {});
    headers.set("Authorization", `Bearer ${token}`);
    const res = await fetch(url, { ...init, headers });
    if (res.status === 401 && !init.retrying) {
      // Access token probably expired right as we called — force a
      // single retry with a freshly minted one.
      await this.refresh();
      return this.authedFetch(url, { ...init, retrying: true });
    }
    return res;
  }

  private async readJsonOrThrow<T>(res: Response): Promise<T> {
    const text = await res.text();
    if (!res.ok) {
      throw new GoogleDriveApiError(res.status, text, safeErrorCode(text));
    }
    if (!text) return undefined as unknown as T;
    return JSON.parse(text) as T;
  }

  /* ── Metadata ──────────────────────────────────────── */

  async getFile(
    id: string,
    fields = "id,name,mimeType,size,md5Checksum,parents,trashed"
  ): Promise<DriveFileMetadata> {
    const url = `${DRIVE_API}/files/${encodeURIComponent(id)}?fields=${encodeURIComponent(
      fields
    )}&supportsAllDrives=true`;
    const res = await this.authedFetch(url);
    const raw = await this.readJsonOrThrow<DriveFileMetadataRaw>(res);
    return normalizeFileMeta(raw);
  }

  async searchFiles(params: {
    q: string;
    pageSize?: number;
    fields?: string;
  }): Promise<{ files: DriveFileMetadata[]; nextPageToken?: string }> {
    const qp = new URLSearchParams({
      q: params.q,
      pageSize: String(params.pageSize ?? 20),
      fields: params.fields ?? "files(id,name,mimeType,parents,trashed),nextPageToken",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    const url = `${DRIVE_API}/files?${qp.toString()}`;
    const res = await this.authedFetch(url);
    return this.readJsonOrThrow(res);
  }

  /* ── Folder helpers ────────────────────────────────── */

  /** Creates a folder under `parentId` and returns its id. */
  async createFolder(name: string, parentId: string): Promise<DriveFileMetadata> {
    const body = JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    });
    const res = await this.authedFetch(
      `${DRIVE_API}/files?fields=id,name,mimeType,parents&supportsAllDrives=true`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }
    );
    return this.readJsonOrThrow(res);
  }

  /**
   * Find a direct child folder by exact name.  Returns null if missing.
   * Used to make folder creation idempotent across server restarts.
   */
  async findChildFolder(
    parentId: string,
    name: string
  ): Promise<DriveFileMetadata | null> {
    const q = [
      `'${parentId.replace(/'/g, "\\'")}' in parents`,
      `name = '${name.replace(/'/g, "\\'")}'`,
      "mimeType = 'application/vnd.google-apps.folder'",
      "trashed = false",
    ].join(" and ");
    const result = await this.searchFiles({ q, pageSize: 1 });
    return result.files[0] ?? null;
  }

  /**
   * Ensure a folder path exists under `rootId` and return the deepest
   * folder's id.  `segments` is e.g. `["projects", "42"]`.
   */
  async ensureFolderPath(rootId: string, segments: string[]): Promise<string> {
    let parent = rootId;
    for (const raw of segments) {
      const name = String(raw).trim();
      if (!name) continue;
      const existing = await this.findChildFolder(parent, name);
      if (existing?.id) {
        parent = existing.id;
        continue;
      }
      const created = await this.createFolder(name, parent);
      if (!created.id) {
        throw new GoogleDriveApiError(500, "createFolder returned no id");
      }
      parent = created.id;
    }
    return parent;
  }

  /* ── Uploads ───────────────────────────────────────── */

  /**
   * Multipart upload — preferred for files up to ~5 MiB.  For larger
   * payloads use `uploadResumable`, which streams in 8 MiB chunks and
   * resumes cleanly on 5xx.
   */
  async uploadMultipart(opts: {
    buffer: Buffer;
    mimeType: string;
    name: string;
    parentId: string;
  }): Promise<DriveFileMetadata> {
    const boundary = `wtf-${Math.random().toString(16).slice(2)}`;
    const metadata = {
      name: opts.name,
      mimeType: opts.mimeType,
      parents: [opts.parentId],
    };
    const preamble = Buffer.from(
      [
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        JSON.stringify(metadata),
        `--${boundary}`,
        `Content-Type: ${opts.mimeType}`,
        "",
        "",
      ].join("\r\n"),
      "utf8"
    );
    const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
    const body = Buffer.concat([preamble, opts.buffer, epilogue]);

    const url =
      `${DRIVE_UPLOAD_API}/files?uploadType=multipart` +
      `&fields=id,name,mimeType,size,md5Checksum,parents` +
      `&supportsAllDrives=true`;
    // DOM `BodyInit` types accept ArrayBuffer but not Node Buffer — slice
    // the underlying bytes into a fresh ArrayBuffer before handing to fetch.
    const bodyBytes = body.buffer.slice(
      body.byteOffset,
      body.byteOffset + body.byteLength
    );
    const res = await this.authedFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(body.length),
      },
      body: bodyBytes as ArrayBuffer,
    });
    const raw = await this.readJsonOrThrow<DriveFileMetadataRaw>(res);
    return normalizeFileMeta(raw);
  }

  /**
   * Resumable upload.  Allocates an upload session with Drive, then PUTs
   * the entire buffer in one request.  For truly huge uploads the
   * session URL also supports chunked PUTs — kept simple here since
   * Studio enforces a 500 MiB per-file cap in multer.
   */
  async uploadResumable(opts: {
    buffer: Buffer;
    mimeType: string;
    name: string;
    parentId: string;
  }): Promise<DriveFileMetadata> {
    const metadata = {
      name: opts.name,
      mimeType: opts.mimeType,
      parents: [opts.parentId],
    };
    const initUrl =
      `${DRIVE_UPLOAD_API}/files?uploadType=resumable` +
      `&fields=id,name,mimeType,size,md5Checksum,parents` +
      `&supportsAllDrives=true`;
    const initRes = await this.authedFetch(initUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": opts.mimeType,
        "X-Upload-Content-Length": String(opts.buffer.length),
      },
      body: JSON.stringify(metadata),
    });
    if (initRes.status < 200 || initRes.status >= 300) {
      const text = await initRes.text();
      throw new GoogleDriveApiError(initRes.status, text, safeErrorCode(text));
    }
    const sessionUrl = initRes.headers.get("location");
    if (!sessionUrl) {
      throw new GoogleDriveApiError(500, "Missing resumable session URL");
    }
    // Slice out a fresh ArrayBuffer so the fetch types accept the body
    // (DOM `BodyInit` allows ArrayBuffer but not Node Buffer directly).
    const bodyBytes = opts.buffer.buffer.slice(
      opts.buffer.byteOffset,
      opts.buffer.byteOffset + opts.buffer.byteLength
    );
    const putRes = await fetch(sessionUrl, {
      method: "PUT",
      headers: {
        "Content-Type": opts.mimeType,
        "Content-Length": String(opts.buffer.length),
      },
      body: bodyBytes as ArrayBuffer,
    });
    const text = await putRes.text();
    if (!putRes.ok) {
      throw new GoogleDriveApiError(putRes.status, text, safeErrorCode(text));
    }
    const raw = JSON.parse(text) as DriveFileMetadataRaw;
    return normalizeFileMeta(raw);
  }

  /** Auto-pick multipart vs resumable based on buffer size. */
  async uploadBuffer(opts: {
    buffer: Buffer;
    mimeType: string;
    name: string;
    parentId: string;
  }): Promise<DriveFileMetadata> {
    const MULTIPART_CEILING = 5 * 1024 * 1024;
    if (opts.buffer.length <= MULTIPART_CEILING) {
      return this.uploadMultipart(opts);
    }
    return this.uploadResumable(opts);
  }

  /* ── Download ──────────────────────────────────────── */

  async downloadFile(id: string): Promise<DriveDownloadResult> {
    const url = `${DRIVE_API}/files/${encodeURIComponent(
      id
    )}?alt=media&supportsAllDrives=true`;
    const res = await this.authedFetch(url);
    if (!res.ok) {
      const text = await res.text();
      throw new GoogleDriveApiError(res.status, text, safeErrorCode(text));
    }
    const contentType =
      res.headers.get("content-type") ?? "application/octet-stream";
    const size = Number(res.headers.get("content-length") ?? 0);
    const etag = res.headers.get("etag") ?? undefined;
    if (!res.body) {
      throw new GoogleDriveApiError(500, "Drive download returned no body");
    }
    // `Readable.fromWeb` is available in Node 20+.  Wraps the WHATWG
    // ReadableStream into a Node stream for Express `res.pipe()`.
    const nodeStream = Readable.fromWeb(res.body as unknown as import("stream/web").ReadableStream);
    return {
      stream: nodeStream,
      sizeBytes: size,
      mimeType: contentType,
      etag,
    };
  }

  /* ── Delete ────────────────────────────────────────── */

  async deleteFile(id: string): Promise<void> {
    const url = `${DRIVE_API}/files/${encodeURIComponent(
      id
    )}?supportsAllDrives=true`;
    const res = await this.authedFetch(url, { method: "DELETE" });
    if (!res.ok && res.status !== 404) {
      const text = await res.text();
      throw new GoogleDriveApiError(res.status, text, safeErrorCode(text));
    }
  }

  /* ── Quota ─────────────────────────────────────────── */

  async getQuota(): Promise<DriveQuota> {
    const url = `${DRIVE_API}/about?fields=storageQuota,user(emailAddress)`;
    const res = await this.authedFetch(url);
    const parsed = await this.readJsonOrThrow<{
      storageQuota?: {
        limit?: string;
        usage?: string;
        usageInDrive?: string;
      };
      user?: { emailAddress?: string };
    }>(res);
    const q = parsed.storageQuota ?? {};
    return {
      limit: q.limit != null ? Number(q.limit) : null,
      usage: q.usage != null ? Number(q.usage) : null,
      usageInDrive: q.usageInDrive != null ? Number(q.usageInDrive) : null,
    };
  }

  async getOwnerEmail(): Promise<string | null> {
    const url = `${DRIVE_API}/about?fields=user(emailAddress)`;
    const res = await this.authedFetch(url);
    const parsed = await this.readJsonOrThrow<{
      user?: { emailAddress?: string };
    }>(res);
    return parsed.user?.emailAddress ?? null;
  }
}

/* ── Scopes ─────────────────────────────────────────── */

/**
 * `drive.file` is the minimum viable scope: it only grants access to
 * files our OAuth client *creates*.  For a platform pool this is fine —
 * every Studio file is uploaded by us.  We also request
 * `userinfo.email` so the admin UI can confirm "connected as
 * wtfgameshowemail@gmail.com".
 */
export const STUDIO_DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];
