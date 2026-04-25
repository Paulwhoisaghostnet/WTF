import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import type { Env } from "../lib/env.js";
import type { Logger } from "../lib/logger.js";
import type { WtfClient } from "../lib/wtf-client.js";

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
      await i.reply({
        content:
          `WTF Gameshow bot\n` +
          `- endpoint: \`${opts.env.WTF_WEBHOOK_BASE_URL}\`\n` +
          `- guild: \`${opts.env.DISCORD_GUILD_ID ?? "(not set)"}\``,
        ephemeral: true,
      });
      return;
    }

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

    if (sub === "profile" || sub === "xp" || sub === "avatar") {
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
