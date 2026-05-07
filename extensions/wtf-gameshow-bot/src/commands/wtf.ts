import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import type { Env } from "../lib/env.js";
import type { Logger } from "../lib/logger.js";
import type { WtfClient } from "../lib/wtf-client.js";
import { handleCommunityChallengeSubcommand } from "../features/community-challenges/index.js";
import { handleCommunityXpSubcommand } from "../features/community-xp/index.js";
import { djFeatureStatus } from "../features/dj/index.js";
import { handleTezosVerificationSubcommand } from "../features/tezos-verification/index.js";
import { handleTraitIdeasSubcommand } from "../features/trait-ideas/index.js";

/**
 * `/wtf` slash command tree. Keep it small and read-mostly — the server is
 * the source of truth for every write, we just fan things out to Discord.
 *
 *   /wtf calendar          upcoming WTF events in this guild
 *   /wtf link              post a link to the caller's WTF profile page
 *                          (tells them how to connect Discord if not already)
 *   /wtf prove <code>      bind the caller's Discord id to a WTF account
 *   /wtf profile           show linked WTF profile summary
 *   /wtf avatar            show the caller's selected paper-doll layers
 *   /wtf xp                show the caller's XP and tier
 *   /wtf leaderboard       show the WTF XP leaderboard
 *   /wtf challenge-submit  record an image challenge response
 *   /wtf trait-suggest     record a trait idea
 *   /wtf whoami            show bot version + configured endpoints (debug)
 */
export const wtfCommandData = new SlashCommandBuilder()
  .setName("wtf")
  .setDescription("WTF Gameshow commands")
  .addSubcommand((s) =>
    s.setName("calendar").setDescription("Upcoming WTF events")
  )
  .addSubcommand((s) =>
    s
      .setName("link")
      .setDescription("How to connect your Discord to your WTF profile")
  )
  .addSubcommand((s) =>
    s
      .setName("prove")
      .setDescription("Prove this Discord account belongs to your WTF profile")
      .addStringOption((o) =>
        o
          .setName("code")
          .setDescription("Proof code from the Dicksword microapp")
          .setRequired(true)
      )
  )
  .addSubcommand((s) =>
    s.setName("profile").setDescription("Show your linked WTF profile")
  )
  .addSubcommand((s) =>
    s.setName("avatar").setDescription("Show your WTF Discord avatar layers")
  )
  .addSubcommand((s) =>
    s.setName("xp").setDescription("Show your WTF XP and tier")
  )
  .addSubcommand((s) =>
    s
      .setName("rank")
      .setDescription("Show WTF XP for a Discord user")
      .addUserOption((o) =>
        o.setName("user").setDescription("Discord user").setRequired(false)
      )
  )
  .addSubcommand((s) =>
    s
      .setName("leaderboard")
      .setDescription("Show the WTF XP leaderboard")
      .addIntegerOption((o) =>
        o
          .setName("limit")
          .setDescription("Number of rows")
          .setMinValue(1)
          .setMaxValue(25)
          .setRequired(false)
      )
  )
  .addSubcommand((s) =>
    s.setName("levels").setDescription("Show WTF XP level tuning")
  )
  .addSubcommand((s) =>
    s
      .setName("challenge-submit")
      .setDescription("Record an image challenge response")
      .addStringOption((o) =>
        o
          .setName("answer")
          .setDescription("Your response")
          .setRequired(true)
      )
      .addStringOption((o) =>
        o
          .setName("challenge")
          .setDescription("Challenge id or label")
          .setRequired(false)
      )
  )
  .addSubcommand((s) =>
    s
      .setName("challenge-bonus")
      .setDescription("Award challenge bonus XP")
      .addUserOption((o) =>
        o.setName("user").setDescription("Recipient").setRequired(true)
      )
      .addIntegerOption((o) =>
        o
          .setName("points")
          .setDescription("Bonus XP")
          .setMinValue(0)
          .setMaxValue(1000)
          .setRequired(false)
      )
      .addStringOption((o) =>
        o.setName("reason").setDescription("Reason").setRequired(false)
      )
  )
  .addSubcommand((s) =>
    s
      .setName("trait-suggest")
      .setDescription("Record a trait idea")
      .addStringOption((o) =>
        o.setName("name").setDescription("Trait name").setRequired(true)
      )
      .addStringOption((o) =>
        o
          .setName("description")
          .setDescription("Description")
          .setRequired(false)
      )
  )
  .addSubcommand((s) =>
    s
      .setName("trait-adopted")
      .setDescription("Mark a trait idea adopted")
      .addUserOption((o) =>
        o.setName("user").setDescription("Contributor").setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("name").setDescription("Trait name").setRequired(true)
      )
  )
  .addSubcommand((s) =>
    s.setName("tezos-status").setDescription("Show WTF Tezos verification status")
  )
  .addSubcommand((s) =>
    s.setName("dj").setDescription("Show DJ feature status")
  )
  .addSubcommand((s) =>
    s
      .setName("whoami")
      .setDescription("Show bot version and configured endpoints")
  );

export function registerWtfCommand(opts: {
  env: Env;
  log: Logger;
  wtf: WtfClient;
}) {
  return async function handle(i: ChatInputCommandInteraction) {
    if (!i.isChatInputCommand()) return;
    if (i.commandName !== "wtf") return;
    const sub = i.options.getSubcommand();

    if (sub === "whoami") {
      const dj = djFeatureStatus(opts.env);
      await i.reply({
        content:
          `WTF Gameshow bot\n` +
          `- endpoint: \`${opts.env.WTF_WEBHOOK_BASE_URL}\`\n` +
          `- guild: \`${opts.env.DISCORD_GUILD_ID ?? "(not set)"}\`\n` +
          `- DJ: ${dj.enabled ? "enabled" : "disabled"}`,
        ephemeral: true,
      });
      return;
    }

    if (sub === "dj") {
      const dj = djFeatureStatus(opts.env);
      await i.reply({ content: dj.reason, ephemeral: true });
      return;
    }

    if (await handleCommunityXpSubcommand(i, opts)) return;
    if (await handleCommunityChallengeSubcommand(i, opts)) return;
    if (await handleTraitIdeasSubcommand(i, opts)) return;
    if (await handleTezosVerificationSubcommand(i, opts)) return;

    if (sub === "link") {
      await i.reply({
        content:
          `Connect your Discord to your WTF profile:\n` +
          `1. Log in at ${opts.env.WTF_WEBHOOK_BASE_URL}\n` +
          `2. Open **Dicksword** from the WTF desktop\n` +
          `3. Use **Connect Discord OAuth** or generate a proof code\n` +
          `4. If using a proof code, run \`/wtf prove <code>\` here\n` +
          `Your Discord id (\`${i.user.id}\`) is what WTF reconciles against.`,
        ephemeral: true,
      });
      return;
    }

    if (sub === "prove") {
      const code = i.options.getString("code", true);
      try {
        const res = (await opts.wtf.proveDiscordClaim({
          code,
          discordUserId: i.user.id,
          discordHandle: i.user.tag,
          discordGuildId: i.guildId ?? opts.env.DISCORD_GUILD_ID,
        })) as {
          user?: {
            username: string;
            displayName?: string | null;
            xpTier?: { label: string };
          } | null;
        };
        await i.reply({
          content:
            `Discord proof accepted. Linked to **${res.user?.displayName || res.user?.username || "WTF user"}**` +
            `${res.user?.xpTier?.label ? ` (${res.user.xpTier.label})` : ""}.`,
          ephemeral: true,
        });
      } catch (err) {
        opts.log.warn("prove command failed", { err: String(err) });
        await i.reply({
          content:
            "That proof code did not link. Generate a fresh code in Dicksword and try again.",
          ephemeral: true,
        });
      }
      return;
    }

    if (sub === "profile" || sub === "avatar") {
      try {
        const res = (await opts.wtf.fetchDickswordProfile(i.user.id)) as {
          linked: boolean;
          user?: {
            username: string;
            displayName?: string | null;
            role: string;
            experiencePoints: number;
            xpTier?: { label: string; nextTierMinXp: number | null };
          } | null;
          avatarLayers?: Array<{ label: string }>;
        };
        if (!res.linked || !res.user) {
          await i.reply({
            content:
              "No WTF profile is linked yet. Open Dicksword in WTF and use OAuth or `/wtf prove <code>`.",
            ephemeral: true,
          });
          return;
        }
        if (sub === "avatar") {
          const layers = res.avatarLayers?.map((l) => l.label).join(", ");
          await i.reply({
            content: layers
              ? `Your Dicksword avatar layers: ${layers}`
              : "No Dicksword avatar layers selected yet.",
            ephemeral: true,
          });
          return;
        }
        const next = res.user.xpTier?.nextTierMinXp;
        await i.reply({
          content:
            `**${res.user.displayName || res.user.username}**\n` +
            `Role: ${res.user.role}\n` +
            `XP: ${res.user.experiencePoints} (${res.user.xpTier?.label ?? "Newcomer"})` +
            `${typeof next === "number" ? `\nNext tier at ${next} XP.` : "\nTop XP tier reached."}`,
          ephemeral: true,
        });
      } catch (err) {
        opts.log.warn(`${sub} command failed`, { err: String(err) });
        await i.reply({
          content: "Could not fetch your WTF profile right now.",
          ephemeral: true,
        });
      }
      return;
    }

    if (sub === "calendar") {
      try {
        const res = (await opts.wtf.fetchUpcomingMirrors()) as {
          events: Array<{
            id: number;
            title: string;
            startsAt: string;
            status: string;
            kind: string;
          }>;
        };
        const rows = res.events
          .filter((e) => e.status === "published")
          .slice(0, 10)
          .map((e) => {
            const when = new Date(e.startsAt);
            const unix = Math.floor(when.getTime() / 1000);
            return `- <t:${unix}:F> — **${e.title}** _(${e.kind})_`;
          });
        if (rows.length === 0) {
          await i.reply({
            content: "No upcoming WTF events in the next 30 days.",
            ephemeral: true,
          });
          return;
        }
        await i.reply({
          content: `**WTF Gameshow — upcoming**\n${rows.join("\n")}`,
          ephemeral: true,
        });
      } catch (err) {
        opts.log.warn("calendar command failed", { err: String(err) });
        await i.reply({
          content: "Could not fetch the calendar right now — try again shortly.",
          ephemeral: true,
        });
      }
      return;
    }
  };
}
