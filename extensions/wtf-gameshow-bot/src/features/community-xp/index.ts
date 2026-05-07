import {
  ChatInputCommandInteraction,
  Events,
  type Client,
  type Message,
  type MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  type User,
} from "discord.js";
import type { Env } from "../../lib/env.js";
import type { Logger } from "../../lib/logger.js";
import type { WtfClient } from "../../lib/wtf-client.js";

type FeatureContext = {
  env: Env;
  log: Logger;
  wtf: WtfClient;
};

type XpProfile = {
  linked: boolean;
  user?: {
    username: string;
    displayName?: string | null;
    role: string;
    experiencePoints: number;
    xpTier?: { label: string; nextTierMinXp: number | null };
  } | null;
};

type XpLeaderboardRow = {
  rank: number;
  username: string;
  displayName?: string | null;
  experiencePoints: number;
  xpTierLabel?: string;
};

export function registerCommunityXpEvents(
  client: Client,
  { env, log, wtf }: FeatureContext
) {
  client.on(Events.MessageCreate, async (message) => {
    await mirrorMessageXp(message, { env, log, wtf });
  });

  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    await mirrorReactionXp(reaction, user, { env, log, wtf });
  });
}

export async function handleCommunityXpSubcommand(
  interaction: ChatInputCommandInteraction,
  ctx: FeatureContext
): Promise<boolean> {
  const sub = interaction.options.getSubcommand();
  if (sub === "xp" || sub === "rank") {
    const target = interaction.options.getUser("user") ?? interaction.user;
    await replyWithXpProfile(interaction, target, ctx);
    return true;
  }
  if (sub === "leaderboard") {
    await replyWithLeaderboard(interaction, ctx);
    return true;
  }
  if (sub === "levels") {
    await interaction.reply({
      content:
        `Messages: ${ctx.env.DISCORD_XP_MESSAGE_POINTS} XP\n` +
        `Reactions: ${ctx.env.DISCORD_XP_REACTION_POINTS} XP\n` +
        `Level 2: ${calculateXpForLevel(2, ctx.env)} XP\n` +
        `Level 3: ${calculateXpForLevel(3, ctx.env)} XP\n` +
        `Level 4: ${calculateXpForLevel(4, ctx.env)} XP`,
      ephemeral: true,
    });
    return true;
  }
  return false;
}

async function mirrorMessageXp(
  message: Message,
  { env, log, wtf }: FeatureContext
) {
  if (!message.guildId || message.author.bot) return;
  try {
    await wtf.postDiscordActivity({
      discordUserId: message.author.id,
      discordHandle: message.author.tag,
      discordGuildId: message.guildId,
      discordChannelId: message.channelId,
      kind: "message",
      action: "posted",
      xpAmount: env.DISCORD_XP_MESSAGE_POINTS,
      externalRef: `discord-message:${message.id}`,
      observedAt: message.createdAt.toISOString(),
    });
  } catch (err) {
    log.debug("message XP mirror failed", { err: String(err) });
  }
}

async function mirrorReactionXp(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  { env, log, wtf }: FeatureContext
) {
  if (user.bot) return;
  const message = reaction.message;
  if (!message.guildId) return;
  try {
    await wtf.postDiscordActivity({
      discordUserId: user.id,
      discordHandle: user.tag ?? user.id,
      discordGuildId: message.guildId,
      discordChannelId: message.channelId,
      kind: "reaction",
      action: "added",
      xpAmount: env.DISCORD_XP_REACTION_POINTS,
      externalRef: `discord-reaction:${message.id}:${user.id}:${reaction.emoji.identifier}`,
      observedAt: new Date().toISOString(),
      payload: { emoji: reaction.emoji.toString() },
    });
  } catch (err) {
    log.debug("reaction XP mirror failed", { err: String(err) });
  }
}

async function replyWithXpProfile(
  interaction: ChatInputCommandInteraction,
  target: User,
  { log, wtf }: FeatureContext
) {
  try {
    const res = (await wtf.fetchDickswordProfile(target.id)) as XpProfile;
    if (!res.linked || !res.user) {
      await interaction.reply({
        content: `${target.username} does not have a linked WTF profile yet.`,
        ephemeral: true,
      });
      return;
    }
    const next = res.user.xpTier?.nextTierMinXp;
    await interaction.reply({
      content:
        `**${res.user.displayName || res.user.username}**\n` +
        `Role: ${res.user.role}\n` +
        `XP: ${res.user.experiencePoints} (${res.user.xpTier?.label ?? "Newcomer"})` +
        `${typeof next === "number" ? `\nNext tier at ${next} XP.` : "\nTop XP tier reached."}`,
      ephemeral: true,
    });
  } catch (err) {
    log.warn("xp profile command failed", { err: String(err) });
    await interaction.reply({
      content: "Could not fetch that WTF XP profile right now.",
      ephemeral: true,
    });
  }
}

async function replyWithLeaderboard(
  interaction: ChatInputCommandInteraction,
  { log, wtf }: FeatureContext
) {
  const limit = Math.min(
    Math.max(interaction.options.getInteger("limit") ?? 10, 1),
    25
  );
  try {
    const rows = (await wtf.fetchXpLeaderboard(limit)) as XpLeaderboardRow[];
    if (rows.length === 0) {
      await interaction.reply({
        content: "No WTF XP leaderboard entries yet.",
        ephemeral: true,
      });
      return;
    }
    await interaction.reply({
      content: rows
        .map((row) => {
          const name = row.displayName || row.username;
          return `#${row.rank} **${name}** - ${row.experiencePoints} XP (${row.xpTierLabel ?? "tier pending"})`;
        })
        .join("\n"),
      ephemeral: true,
    });
  } catch (err) {
    log.warn("xp leaderboard command failed", { err: String(err) });
    await interaction.reply({
      content: "Could not fetch the WTF XP leaderboard right now.",
      ephemeral: true,
    });
  }
}

function calculateXpForLevel(level: number, env: Env): number {
  if (level <= 1) return 0;
  let total = 0;
  for (let current = 2; current <= level; current += 1) {
    total += Math.floor(
      env.DISCORD_XP_LEVEL_BASE *
        env.DISCORD_XP_LEVEL_MULTIPLIER ** (current - 2)
    );
  }
  return total;
}
