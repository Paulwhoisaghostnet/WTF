import {
  Client,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventStatus,
} from "discord.js";
import type { Env } from "../lib/env.js";
import type { Logger } from "../lib/logger.js";
import type { WtfClient } from "../lib/wtf-client.js";

/**
 * Polls WTF for approved calendar events in the next 30 days and round-trips
 * them into Discord scheduled events:
 *
 *   published + no discordScheduledEventId  → create
 *   published + has id                      → update title/desc/time if drift
 *   cancelled + has id                      → mark discord event cancelled
 *
 * The resulting Discord scheduled event id is PATCH'ed back to the WTF row
 * so subsequent polls are idempotent.
 */
export function startCalendarMirror(
  client: Client,
  env: Env,
  log: Logger,
  wtf: WtfClient
) {
  let running = false;
  let stopped = false;

  async function run() {
    if (running || stopped) return;
    running = true;
    try {
      if (!env.DISCORD_GUILD_ID) {
        log.debug("calendar mirror skipped — no DISCORD_GUILD_ID");
        return;
      }
      const guild = await client.guilds.fetch(env.DISCORD_GUILD_ID);
      if (!guild) return;
      const res = (await wtf.fetchUpcomingMirrors()) as {
        now: string;
        events: Array<{
          id: number;
          kind: string;
          title: string;
          description: string | null;
          startsAt: string;
          endsAt: string | null;
          visibility: string;
          status: "draft" | "published" | "cancelled";
          linksJson: Array<{ label: string; url: string }> | null;
          discordScheduledEventId: string | null;
          discordGuildId: string | null;
        }>;
      };

      for (const ev of res.events) {
        if (ev.discordGuildId && ev.discordGuildId !== guild.id) continue;
        try {
          await reconcile(guild, ev);
        } catch (err) {
          log.warn("mirror reconcile failed", {
            eventId: ev.id,
            err: String(err),
          });
        }
      }
    } catch (err) {
      log.warn("calendar mirror cycle failed", { err: String(err) });
    } finally {
      running = false;
    }
  }

  async function reconcile(
    guild: import("discord.js").Guild,
    ev: {
      id: number;
      title: string;
      description: string | null;
      startsAt: string;
      endsAt: string | null;
      status: "draft" | "published" | "cancelled";
      linksJson: Array<{ label: string; url: string }> | null;
      discordScheduledEventId: string | null;
    }
  ) {
    const manager = guild.scheduledEvents;
    const startAt = new Date(ev.startsAt);
    const endAt = ev.endsAt ? new Date(ev.endsAt) : null;
    const descLines: string[] = [];
    if (ev.description) descLines.push(ev.description);
    for (const link of ev.linksJson ?? []) {
      descLines.push(`• ${link.label}: ${link.url}`);
    }
    const description = descLines.join("\n").slice(0, 1000);

    if (ev.status === "cancelled") {
      if (!ev.discordScheduledEventId) return;
      try {
        const existing = await manager.fetch(ev.discordScheduledEventId);
        if (existing && existing.status !== GuildScheduledEventStatus.Canceled) {
          await existing.setStatus(GuildScheduledEventStatus.Canceled);
        }
      } catch (err) {
        log.debug("cancel mirror lookup failed", {
          eventId: ev.id,
          err: String(err),
        });
      }
      return;
    }

    if (ev.status !== "published") return;

    if (!ev.discordScheduledEventId) {
      if (startAt.getTime() < Date.now() - 5 * 60 * 1000) {
        // Skip backfilling events that have already started to avoid
        // Discord's "Scheduled start time must be in the future".
        return;
      }
      const created = await manager.create({
        name: ev.title.slice(0, 100),
        scheduledStartTime: startAt,
        scheduledEndTime: endAt ?? undefined,
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType: GuildScheduledEventEntityType.External,
        entityMetadata: {
          location: (ev.linksJson?.[0]?.url ?? "https://wtfgameshow.app").slice(
            0,
            100
          ),
        },
        description,
      });
      await wtf.patchMirror(ev.id, {
        discordScheduledEventId: created.id,
        discordGuildId: guild.id,
      });
      log.info("calendar mirror created", {
        eventId: ev.id,
        discordId: created.id,
      });
      return;
    }

    try {
      const existing = await manager.fetch(ev.discordScheduledEventId);
      const needsUpdate =
        (existing.name ?? "") !== ev.title.slice(0, 100) ||
        existing.scheduledStartTimestamp !== startAt.getTime() ||
        (existing.description ?? "") !== description;
      if (needsUpdate) {
        await existing.edit({
          name: ev.title.slice(0, 100),
          scheduledStartTime: startAt,
          scheduledEndTime: endAt ?? undefined,
          description,
        });
        log.debug("calendar mirror updated", {
          eventId: ev.id,
          discordId: existing.id,
        });
      }
    } catch (err) {
      // Discord returns 404 if an operator deleted the mirrored event.
      // Clear our stored id so the next cycle recreates it.
      log.warn("calendar mirror fetch failed; clearing id", {
        eventId: ev.id,
        err: String(err),
      });
      await wtf.patchMirror(ev.id, {
        discordScheduledEventId: null,
        discordGuildId: guild.id,
      });
    }
  }

  const intervalId = setInterval(run, env.WTF_MIRROR_INTERVAL_MS);
  intervalId.unref();

  // Kick off first run shortly after ready
  setTimeout(run, 10_000).unref();

  return {
    stop() {
      stopped = true;
      clearInterval(intervalId);
    },
    trigger: run,
  };
}
