import { REST, Routes } from "discord.js";
import { loadEnv } from "../lib/env.js";
import { wtfCommandData } from "../commands/wtf.js";

/**
 * Idempotent slash command registration. Run once after deploying a new
 * version of the bot (or whenever the command tree changes):
 *
 *   DISCORD_BOT_TOKEN=... DISCORD_CLIENT_ID=... DISCORD_GUILD_ID=... \
 *     npm run register-commands
 *
 * If DISCORD_GUILD_ID is set, commands are registered guild-scoped (instant).
 * Otherwise they are registered globally (can take up to an hour to appear).
 */
async function main() {
  const env = loadEnv();
  const rest = new REST({ version: "10" }).setToken(env.DISCORD_BOT_TOKEN);
  const body = [wtfCommandData.toJSON()];
  if (env.DISCORD_GUILD_ID) {
    await rest.put(
      Routes.applicationGuildCommands(
        env.DISCORD_CLIENT_ID,
        env.DISCORD_GUILD_ID
      ),
      { body }
    );
    console.log(
      `[register] guild-scoped commands registered for ${env.DISCORD_GUILD_ID}`
    );
  } else {
    await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body });
    console.log("[register] global commands registered (may take up to 1h)");
  }
}

main().catch((err) => {
  console.error("[register] failed:", err);
  process.exit(1);
});
