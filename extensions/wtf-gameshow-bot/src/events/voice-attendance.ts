import {
  ChannelType,
  Client,
  Events,
  type Guild,
  type VoiceState,
} from "discord.js";
import type { Env } from "../lib/env.js";
import type { Logger } from "../lib/logger.js";
import type { WtfClient } from "../lib/wtf-client.js";

/**
 * Listens for voiceStateUpdate and emits signed attendance events to the WTF
 * webhook. Heartbeats are pushed every `WTF_VOICE_HEARTBEAT_MS` for anyone
 * currently in a watched voice/stage channel (so the calendar can credit
 * long attendance even if the bot restarts mid-event — the WTF server folds
 * heartbeats together).
 *
 * Stage-channel state (discord_stage vs discord_voice) is determined by
 * channel type, not by whether the user is a speaker.
 */
export function registerVoiceAttendance(
  client: Client,
  env: Env,
  log: Logger,
  wtf: WtfClient
) {
  type Session = {
    userId: string;
    guildId: string;
    channelId: string;
    kind: "discord_voice" | "discord_stage";
    since: number;
    timer: NodeJS.Timeout;
  };
  const sessions = new Map<string, Session>();
  const heartbeatMs = env.WTF_VOICE_HEARTBEAT_MS;

  function keyFor(userId: string, guildId: string) {
    return `${guildId}:${userId}`;
  }

  function closeSession(
    key: string,
    reason: "left" | "shutdown",
    externalRef?: string
  ) {
    const s = sessions.get(key);
    if (!s) return;
    clearInterval(s.timer);
    sessions.delete(key);
    wtf
      .postVoiceState({
        discordUserId: s.userId,
        discordGuildId: s.guildId,
        discordChannelId: s.channelId,
        state: "leave",
        kind: s.kind,
        externalRef,
        payload: { reason, sessionSince: s.since },
      })
      .catch((err) => log.warn("voice leave post failed", { err: String(err) }));
  }

  function openSession(params: {
    userId: string;
    guildId: string;
    channelId: string;
    kind: "discord_voice" | "discord_stage";
    discordScheduledEventId?: string | null;
  }) {
    const key = keyFor(params.userId, params.guildId);
    if (sessions.has(key)) {
      // Moved channels while already tracked — close then re-open cleanly.
      closeSession(key, "left", "channel_switch");
    }
    const timer = setInterval(() => {
      wtf
        .postVoiceState({
          discordUserId: params.userId,
          discordGuildId: params.guildId,
          discordChannelId: params.channelId,
          state: "heartbeat",
          kind: params.kind,
        })
        .catch((err) =>
          log.warn("voice heartbeat failed", { err: String(err) })
        );
    }, heartbeatMs);
    timer.unref();
    sessions.set(key, {
      userId: params.userId,
      guildId: params.guildId,
      channelId: params.channelId,
      kind: params.kind,
      since: Date.now(),
      timer,
    });
    wtf
      .postVoiceState({
        discordUserId: params.userId,
        discordGuildId: params.guildId,
        discordChannelId: params.channelId,
        state: "join",
        kind: params.kind,
        discordScheduledEventId: params.discordScheduledEventId ?? null,
      })
      .catch((err) => log.warn("voice join post failed", { err: String(err) }));
  }

  function channelKind(
    state: VoiceState
  ): "discord_voice" | "discord_stage" | null {
    const ch = state.channel;
    if (!ch) return null;
    if (ch.type === ChannelType.GuildStageVoice) return "discord_stage";
    if (ch.type === ChannelType.GuildVoice) return "discord_voice";
    return null;
  }

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    const userId = newState.id ?? oldState.id;
    const guildId = newState.guild?.id ?? oldState.guild?.id;
    if (!userId || !guildId) return;
    if (newState.member?.user.bot) return;

    const oldKind = channelKind(oldState);
    const newKind = channelKind(newState);
    const key = keyFor(userId, guildId);

    if (oldKind && !newKind) {
      closeSession(key, "left");
      return;
    }
    if (!oldKind && newKind) {
      openSession({
        userId,
        guildId,
        channelId: newState.channelId ?? "",
        kind: newKind,
      });
      return;
    }
    if (oldKind && newKind) {
      if (oldState.channelId !== newState.channelId || oldKind !== newKind) {
        openSession({
          userId,
          guildId,
          channelId: newState.channelId ?? "",
          kind: newKind,
        });
      }
    }
  });

  // On ready, seed sessions for anyone already in watched channels so we
  // don't lose credit after a bot restart.
  client.once(Events.ClientReady, async () => {
    for (const guild of client.guilds.cache.values()) {
      await seedGuild(guild);
    }
  });

  async function seedGuild(guild: Guild) {
    try {
      await guild.members.fetch();
      for (const [, channel] of guild.channels.cache) {
        if (
          channel.type !== ChannelType.GuildVoice &&
          channel.type !== ChannelType.GuildStageVoice
        ) {
          continue;
        }
        const kind =
          channel.type === ChannelType.GuildStageVoice
            ? "discord_stage"
            : "discord_voice";
        const members = "members" in channel ? channel.members : null;
        if (!members) continue;
        for (const [, member] of members) {
          if (member.user.bot) continue;
          openSession({
            userId: member.id,
            guildId: guild.id,
            channelId: channel.id,
            kind,
          });
        }
      }
    } catch (err) {
      log.warn("voice seed failed", { guildId: guild.id, err: String(err) });
    }
  }

  function shutdown() {
    for (const key of Array.from(sessions.keys())) {
      closeSession(key, "shutdown", "bot_shutdown");
    }
  }

  return { shutdown };
}
