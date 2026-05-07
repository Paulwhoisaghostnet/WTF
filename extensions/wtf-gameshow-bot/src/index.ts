import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { loadEnv } from "./lib/env.js";
import { createLogger } from "./lib/logger.js";
import { createWtfClient } from "./lib/wtf-client.js";
import { registerVoiceAttendance } from "./events/voice-attendance.js";
import { startCalendarMirror } from "./events/calendar-mirror.js";
import { startRoleSync } from "./events/role-sync.js";
import { registerWtfCommand } from "./commands/wtf.js";
import { registerCommunityXpEvents } from "./features/community-xp/index.js";

async function main() {
  const env = loadEnv();
  const log = createLogger(env);
  const wtf = createWtfClient(env, log);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildScheduledEvents,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.GuildScheduledEvent, Partials.Message, Partials.Reaction],
  });

  const wtfHandler = registerWtfCommand({ env, log, wtf });
  const voice = registerVoiceAttendance(client, env, log, wtf);
  const calendar = startCalendarMirror(client, env, log, wtf);
  const roleSync = startRoleSync(client, env, log, wtf);
  registerCommunityXpEvents(client, { env, log, wtf });

  client.on(Events.InteractionCreate, async (i) => {
    try {
      if (i.isChatInputCommand()) {
        await wtfHandler(i);
      }
    } catch (err) {
      log.error("interaction handler failed", { err: String(err) });
    }
  });

  client.once(Events.ClientReady, (c) => {
    log.info("bot ready", { tag: c.user.tag, guilds: c.guilds.cache.size });
  });

  client.on(Events.Error, (err) => {
    log.error("client error", { err: String(err) });
  });

  const shutdown = async (reason: string) => {
    log.info("shutting down", { reason });
    try {
      voice.shutdown();
      calendar.stop();
      roleSync.stop();
      await client.destroy();
    } catch (err) {
      log.warn("shutdown error", { err: String(err) });
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await client.login(env.DISCORD_BOT_TOKEN);
}

main().catch((err) => {
  console.error(JSON.stringify({
    ts: new Date().toISOString(),
    level: "error",
    msg: "bot crashed during startup",
    err: String(err),
  }));
  process.exit(1);
});
