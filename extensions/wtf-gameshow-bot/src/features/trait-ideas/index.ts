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

export async function handleTraitIdeasSubcommand(
  interaction: ChatInputCommandInteraction,
  ctx: FeatureContext
): Promise<boolean> {
  const sub = interaction.options.getSubcommand();
  if (sub === "trait-suggest") {
    const name = interaction.options.getString("name", true);
    const description = interaction.options.getString("description") || null;
    try {
      await ctx.wtf.postDiscordActivity({
        discordUserId: interaction.user.id,
        discordHandle: interaction.user.tag,
        discordGuildId: interaction.guildId ?? ctx.env.DISCORD_GUILD_ID ?? "",
        discordChannelId: interaction.channelId,
        kind: "manual",
        action: "trait_idea_submit",
        xpAmount: ctx.env.DISCORD_TRAIT_SUGGESTION_POINTS,
        externalRef: `discord-trait-suggest:${interaction.id}`,
        observedAt: new Date().toISOString(),
        payload: { name, description },
      });
      await interaction.reply({
        content: `Trait idea recorded: **${name}**.`,
        ephemeral: true,
      });
    } catch (err) {
      ctx.log.warn("trait suggest failed", { err: String(err) });
      await interaction.reply({
        content: "Could not record that trait idea right now.",
        ephemeral: true,
      });
    }
    return true;
  }

  if (sub === "trait-adopted") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      await interaction.reply({
        content: "Moderator permission is required to mark adopted traits.",
        ephemeral: true,
      });
      return true;
    }
    const target = interaction.options.getUser("user", true);
    const name = interaction.options.getString("name", true);
    try {
      await ctx.wtf.postDiscordActivity({
        discordUserId: target.id,
        discordHandle: target.tag,
        discordGuildId: interaction.guildId ?? ctx.env.DISCORD_GUILD_ID ?? "",
        discordChannelId: interaction.channelId,
        kind: "manual",
        action: "trait_idea_adopted",
        xpAmount: ctx.env.DISCORD_TRAIT_ADOPTED_POINTS,
        externalRef: `discord-trait-adopted:${interaction.id}`,
        observedAt: new Date().toISOString(),
        payload: { name, adoptedBy: interaction.user.id },
      });
      await interaction.reply({
        content: `Marked **${name}** adopted for ${target.username}.`,
        ephemeral: true,
      });
    } catch (err) {
      ctx.log.warn("trait adopted failed", { err: String(err) });
      await interaction.reply({
        content: "Could not record that adopted trait right now.",
        ephemeral: true,
      });
    }
    return true;
  }

  return false;
}
