import { rateKeeper } from "../../lib/rate-keeper";

export interface MastodonToot {
  id: string;
  content: string;
  created_at: string;
  url: string;
  account: {
    id: string;
    username: string;
    display_name: string;
    avatar: string;
  };
  media_attachments: { url: string; type: string }[];
  reblog: MastodonToot | null;
  replies_count: number;
  reblogs_count: number;
  favourites_count: number;
}

export interface MastodonAccount {
  id: string;
  username: string;
  display_name: string;
  avatar: string;
  followers_count: number;
  following_count: number;
  statuses_count: number;
}

export async function mastodonFetch<T>(
  instanceUrl: string,
  path: string,
  accessToken: string | null,
  options: RequestInit = {}
): Promise<T> {
  const base = instanceUrl.replace(/\/$/, "");
  const url = `${base}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const resp = await fetch(url, { ...options, headers });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Mastodon API error ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json() as Promise<T>;
}

export async function getHomeTimeline(
  instanceUrl: string,
  accessToken: string,
  limit = 20
): Promise<MastodonToot[]> {
  return mastodonFetch<MastodonToot[]>(
    instanceUrl,
    `/api/v1/timelines/home?limit=${limit}`,
    accessToken
  );
}

export async function getPublicTimeline(
  instanceUrl: string,
  limit = 20
): Promise<MastodonToot[]> {
  return mastodonFetch<MastodonToot[]>(
    instanceUrl,
    `/api/v1/timelines/public?limit=${limit}`,
    null
  );
}

export async function postToot(
  instanceUrl: string,
  accessToken: string,
  status: string,
  options: { inReplyToId?: string; sensitive?: boolean; spoilerText?: string; visibility?: string } = {}
): Promise<MastodonToot> {
  return mastodonFetch<MastodonToot>(instanceUrl, "/api/v1/statuses", accessToken, {
    method: "POST",
    body: JSON.stringify({
      status,
      in_reply_to_id: options.inReplyToId ?? null,
      sensitive: options.sensitive ?? false,
      spoiler_text: options.spoilerText ?? "",
      visibility: options.visibility ?? "public",
    }),
  });
}

export async function verifyCredentials(
  instanceUrl: string,
  accessToken: string
): Promise<MastodonAccount> {
  return mastodonFetch<MastodonAccount>(
    instanceUrl,
    "/api/v1/accounts/verify_credentials",
    accessToken
  );
}
