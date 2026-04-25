import { Client } from "discord.js";
import type { Env } from "../lib/env.js";
import type { Logger } from "../lib/logger.js";
import type { WtfClient } from "../lib/wtf-client.js";

/**
 * Pulls the authoritative roster from WTF (`POST /api/discord/role-sync/pull`)
 * and reconciles the contestant + cohost+ role memberships in the configured
 * guild. Bot only ever *adds* roles to users it has jurisdiction over, and
 * will *remove* a WTF-managed role from anyone not on the roster. Roles that
 * are not configured in env are left untouched.
 */
export function startRoleSync(
  client: Client,
  env: Env,
  log: Logger,
  wtf: WtfClient
) {
  let running = false;
  let stopped = false;

  async function run() {
    if (running || stopped) return;
    if (!env.DISCORD_GUILD_ID) return;
    if (!env.DISCORD_CONTESTANT_ROLE_ID && !env.DISCORD_STAFF_ROLE_ID) return;
    running = true;
    try {
      const guild = await client.guilds.fetch(env.DISCORD_GUILD_ID);
      if (!guild) return;
      const roster = (await wtf.pullRoleSync()) as {
        generatedAt: string;
        contestants: Array<{ discordId: string | null; username: string }>;
        staff: Array<{ discordId: string | null; username: string }>;
      };
      let dickswordProtected = new Set(
        env.DICKSWORD_PROTECTED_ROLE_IDS.split(",")
          .map((id) => id.trim())
          .filter(Boolean)
      );
      try {
        const dicksword = (await wtf.fetchDickswordRoleSync()) as {
          protectedRoleIds?: string[];
          mappings?: Array<{ roleId: string; protected: boolean }>;
        };
        dickswordProtected = new Set([
          ...dickswordProtected,
          ...(dicksword.protectedRoleIds ?? []),
          ...(dicksword.mappings ?? [])
            .filter((m) => m.protected)
            .map((m) => m.roleId),
        ]);
      } catch (err) {
        log.debug("dicksword role-sync metadata unavailable", { err: String(err) });
      }

      const contestantRoleId = env.DISCORD_CONTESTANT_ROLE_ID;
      const staffRoleId = env.DISCORD_STAFF_ROLE_ID;
      const contestantRoleManaged =
        !!contestantRoleId && !dickswordProtected.has(contestantRoleId);
      const staffRoleManaged = !!staffRoleId && !dickswordProtected.has(staffRoleId);
      if (contestantRoleId && !contestantRoleManaged) {
        log.warn("contestant role sync skipped because role is protected", {
          roleId: contestantRoleId,
        });
      }
      if (staffRoleId && !staffRoleManaged) {
        log.warn("staff role sync skipped because role is protected", {
          roleId: staffRoleId,
        });
      }

      const contestantSet = new Set(
        roster.contestants
          .map((c) => c.discordId)
          .filter((id): id is string => !!id)
      );
      const staffSet = new Set(
        roster.staff.map((s) => s.discordId).filter((id): id is string => !!id)
      );

      await guild.members.fetch();

      for (const [, member] of guild.members.cache) {
        if (member.user.bot) continue;

        if (contestantRoleId && contestantRoleManaged) {
          const has = member.roles.cache.has(contestantRoleId);
          const should = contestantSet.has(member.id);
          if (should && !has) {
            if (env.DICKSWORD_ROLE_SYNC_DRY_RUN) {
              log.info("dry-run contestant role add", { userId: member.id });
            } else {
              await member.roles
                .add(contestantRoleId, "WTF contestant sync")
                .catch((err) =>
                  log.warn("role add failed", {
                    userId: member.id,
                    err: String(err),
                  })
                );
            }
          } else if (!should && has) {
            if (env.DICKSWORD_ROLE_SYNC_DRY_RUN) {
              log.info("dry-run contestant role remove", { userId: member.id });
            } else {
              await member.roles
                .remove(contestantRoleId, "WTF contestant sync")
                .catch((err) =>
                  log.warn("role remove failed", {
                    userId: member.id,
                    err: String(err),
                  })
                );
            }
          }
        }

        if (staffRoleId && staffRoleManaged) {
          const has = member.roles.cache.has(staffRoleId);
          const should = staffSet.has(member.id);
          if (should && !has) {
            if (env.DICKSWORD_ROLE_SYNC_DRY_RUN) {
              log.info("dry-run staff role add", { userId: member.id });
            } else {
              await member.roles
                .add(staffRoleId, "WTF staff sync")
                .catch((err) =>
                  log.warn("staff add failed", {
                    userId: member.id,
                    err: String(err),
                  })
                );
            }
          } else if (!should && has) {
            if (env.DICKSWORD_ROLE_SYNC_DRY_RUN) {
              log.info("dry-run staff role remove", { userId: member.id });
            } else {
              await member.roles
                .remove(staffRoleId, "WTF staff sync")
                .catch((err) =>
                  log.warn("staff remove failed", {
                    userId: member.id,
                    err: String(err),
                  })
                );
            }
          }
        }
      }
      log.info("role sync complete", {
        contestants: contestantSet.size,
        staff: staffSet.size,
        dryRun: env.DICKSWORD_ROLE_SYNC_DRY_RUN,
      });
    } catch (err) {
      log.warn("role sync cycle failed", { err: String(err) });
    } finally {
      running = false;
    }
  }

  // Role sync runs less frequently than calendar mirror — every 5th cycle.
  const intervalId = setInterval(run, env.WTF_MIRROR_INTERVAL_MS * 5);
  intervalId.unref();
  setTimeout(run, 60_000).unref();

  return {
    stop() {
      stopped = true;
      clearInterval(intervalId);
    },
    trigger: run,
  };
}
