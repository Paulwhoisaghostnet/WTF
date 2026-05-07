import { createHmac } from "node:crypto";
import type { Env } from "./env.js";
import type { Logger } from "./logger.js";

/**
 * Thin client for the WTF server's bot-facing webhook endpoints. Every
 * request carries `x-wtf-signature` + `x-wtf-timestamp` matching the scheme
 * in `WTF/server/lib/webhook-hmac.ts` (HMAC_SHA256 over `${ts}.${body}`).
 */
export function createWtfClient(env: Env, log: Logger) {
  const base = env.WTF_WEBHOOK_BASE_URL.replace(/\/+$/, "");

  function sign(body: string): { ts: string; signature: string } {
    const ts = Date.now().toString();
    const hex = createHmac("sha256", env.WTF_BOT_WEBHOOK_SECRET)
      .update(`${ts}.${body}`)
      .digest("hex");
    return { ts, signature: `sha256=${hex}` };
  }

  async function signedFetch(
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: unknown
  ): Promise<unknown> {
    const serialized = body === undefined ? "" : JSON.stringify(body);
    const { ts, signature } = sign(serialized);
    const url = `${base}${path}`;
    const headers: Record<string, string> = {
      "x-wtf-signature": signature,
      "x-wtf-timestamp": ts,
    };
    if (body !== undefined) headers["content-type"] = "application/json";

    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : serialized,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      log.warn("wtf-client non-2xx", {
        method,
        path,
        status: res.status,
        body: text.slice(0, 500),
      });
      throw new Error(`[wtf-client] ${method} ${path} → ${res.status}`);
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return (await res.json()) as unknown;
    }
    return await res.text();
  }

  return {
    async postVoiceState(payload: {
      discordUserId: string;
      discordGuildId: string;
      discordChannelId?: string | null;
      state: "join" | "heartbeat" | "leave";
      kind?: "discord_voice" | "discord_stage";
      discordScheduledEventId?: string | null;
      observedAt?: string;
      externalRef?: string;
      payload?: Record<string, unknown>;
    }) {
      return signedFetch("POST", "/api/attendance/voice-state", payload);
    },

    async fetchUpcomingMirrors() {
      return signedFetch("GET", "/api/discord/mirrors/upcoming");
    },

    async patchMirror(
      eventId: number,
      body: {
        discordScheduledEventId: string | null;
        discordGuildId?: string | null;
      }
    ) {
      return signedFetch("PATCH", `/api/discord/mirrors/${eventId}`, body);
    },

    async pullRoleSync() {
      return signedFetch("POST", "/api/discord/role-sync/pull");
    },

    async proveDiscordClaim(payload: {
      code: string;
      discordUserId: string;
      discordHandle: string;
      discordGuildId?: string;
    }) {
      return signedFetch("POST", "/api/dicksword/bot/proof", payload);
    },

    async postDiscordActivity(payload: {
      discordUserId: string;
      discordHandle?: string | null;
      discordGuildId: string;
      discordChannelId?: string | null;
      kind:
        | "message"
        | "reaction"
        | "voice"
        | "stage"
        | "event"
        | "lottery"
        | "auction"
        | "avatar"
        | "manual";
      action: string;
      xpAmount?: number;
      externalRef?: string | null;
      observedAt?: string;
      payload?: Record<string, unknown>;
    }) {
      return signedFetch("POST", "/api/dicksword/bot/activity", payload);
    },

    async fetchDickswordProfile(discordUserId: string) {
      return signedFetch(
        "GET",
        `/api/dicksword/bot/profile/${encodeURIComponent(discordUserId)}`
      );
    },

    async fetchDickswordRoleSync() {
      return signedFetch("GET", "/api/dicksword/bot/role-sync");
    },

    async fetchXpLeaderboard(limit = 10) {
      const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 25);
      return signedFetch("GET", `/api/leaderboard/xp?limit=${safeLimit}`);
    },
  };
}

export type WtfClient = ReturnType<typeof createWtfClient>;
