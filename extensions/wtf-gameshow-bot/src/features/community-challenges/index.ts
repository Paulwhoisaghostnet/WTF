import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import type { Env } from "../../lib/env.js";
import type { Logger } from "../../lib/logger.js";
import type { WtfClient } from "../../lib/wtf-client.js";

type FeatureContext = {
  env: Env;
  log: Logger;
  wtf: WtfClient;
};

export async function handleCommunityChallengeSubcommand(
  interaction: ChatInputCommandInteraction,
  ctx: FeatureContext
): Promise<boolean> {
  const sub = interaction.options.getSubcommand();
  if (sub === "challenge-submit") {
    const answer = interaction.options.getString("answer", true);
    const challenge = interaction.options.getString("challenge") || "latest";
    try {
      await ctx.wtf.postDiscordActivity({
        discordUserId: interaction.user.id,
        discordHandle: interaction.user.tag,
        discordGuildId: interaction.guildId ?? ctx.env.DISCORD_GUILD_ID ?? "",
        discordChannelId: interaction.channelId,
        kind: "manual",
        action: "image_challenge_submit",
        xpAmount: ctx.env.DISCORD_IMAGE_CHALLENGE_BASE_POINTS,
        externalRef: `discord-challenge-submit:${interaction.id}`,
        observedAt: new Date().toISOString(),
        payload: { challenge, answer },
      });
      await interaction.reply({
        content: `Challenge response recorded for ${challenge}.`,
        ephemeral: true,
      });
    } catch (err) {
      ctx.log.warn("challenge submit failed", { err: String(err) });
      await interaction.reply({
        content: "Could not record that challenge response right now.",
        ephemeral: true,
      });
    }
    return true;
  }

  if (sub === "challenge-bonus") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      await interaction.reply({
        content: "Moderator permission is required for challenge bonuses.",
        ephemeral: true,
      });
      return true;
    }
    const target = interaction.options.getUser("user", true);
    const points = Math.min(
      Math.max(
        interaction.options.getInteger("points") ??
          ctx.env.DISCORD_IMAGE_CHALLENGE_BONUS_POINTS,
        0
      ),
      ctx.env.DISCORD_IMAGE_CHALLENGE_BONUS_POINTS
    );
    const reason =
      interaction.options.getString("reason") || "image challenge bonus";
    try {
      await ctx.wtf.postDiscordActivity({
        discordUserId: target.id,
        discordHandle: target.tag,
        discordGuildId: interaction.guildId ?? ctx.env.DISCORD_GUILD_ID ?? "",
        discordChannelId: interaction.channelId,
        kind: "manual",
        action: "image_challenge_bonus",
        xpAmount: points,
        externalRef: `discord-challenge-bonus:${interaction.id}`,
        observedAt: new Date().toISOString(),
        payload: { reason, awardedBy: interaction.user.id },
      });
      await interaction.reply({
        content: `Awarded ${points} challenge XP to ${target.username}.`,
        ephemeral: true,
      });
    } catch (err) {
      ctx.log.warn("challenge bonus failed", { err: String(err) });
      await interaction.reply({
        content: "Could not award that challenge bonus right now.",
        ephemeral: true,
      });
    }
    return true;
  }

  return false;
}
