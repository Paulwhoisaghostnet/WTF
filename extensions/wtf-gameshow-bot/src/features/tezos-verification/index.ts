import type { ChatInputCommandInteraction } from "discord.js";
import type { Logger } from "../../lib/logger.js";
import type { WtfClient } from "../../lib/wtf-client.js";

export async function handleTezosVerificationSubcommand(
  interaction: ChatInputCommandInteraction,
  opts: { log: Logger; wtf: WtfClient }
): Promise<boolean> {
  const sub = interaction.options.getSubcommand();
  if (sub !== "tezos-status") return false;
  try {
    const profile = (await opts.wtf.fetchDickswordProfile(interaction.user.id)) as {
      linked: boolean;
      user?: { username: string; displayName?: string | null } | null;
    };
    await interaction.reply({
      content: profile.linked
        ? `Discord is linked to **${profile.user?.displayName || profile.user?.username || "WTF"}**. Wallet checks stay inside WTF profile APIs.`
        : "No linked WTF profile yet. Link Discord in Dicksword first, then connect a wallet in your WTF profile.",
      ephemeral: true,
    });
  } catch (err) {
    opts.log.warn("tezos-status failed", { err: String(err) });
    await interaction.reply({
      content: "Could not check Tezos verification status right now.",
      ephemeral: true,
    });
  }
  return true;
}
