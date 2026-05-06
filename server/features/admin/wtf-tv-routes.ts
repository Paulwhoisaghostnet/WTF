import type { Router } from "express";
import { eq } from "drizzle-orm";
import { requirePermission } from "../../auth/passport";
import { db } from "../../db";
import {
  tvBumpers,
  tvChannels,
  tvPlaylists,
  tvWtfChannelConfig,
  users,
} from "@shared/schema";
import { pickPreferredWtfChannelConfig } from "../../lib/tv-wtf-config";
import { refreshWtfPlaylist } from "../tv/wtf-refresh";

export function registerAdminWtfTvRoutes(router: Router) {
  router.get(
    "/api/admin/wtf-tv",
    requirePermission("access_admin_panel"),
    async (_req, res) => {
      try {
        const config = pickPreferredWtfChannelConfig(
          await db.select().from(tvWtfChannelConfig)
        );
        if (!config) return res.json(null);

        let channelTitle: string | null = null;
        if (config.channelId) {
          const [ch] = await db
            .select({ title: tvChannels.title })
            .from(tvChannels)
            .where(eq(tvChannels.id, config.channelId));
          channelTitle = ch?.title || null;
        }

        const allUsers = await db
          .select({
            id: users.id,
            username: users.username,
            displayName: users.displayName,
          })
          .from(users)
          .orderBy(users.username);

        const allBumpers = await db
          .select({
            id: tvBumpers.id,
            title: tvBumpers.title,
            ownerUserId: tvBumpers.ownerUserId,
            durationMs: tvBumpers.durationMs,
          })
          .from(tvBumpers)
          .orderBy(tvBumpers.title);

        res.json({ config, channelTitle, users: allUsers, bumpers: allBumpers });
      } catch (err) {
        console.error("[admin] failed to fetch wtf-tv config:", err);
        res.status(500).json({ error: "Failed to fetch WTF TV config" });
      }
    }
  );

  router.put(
    "/api/admin/wtf-tv",
    requirePermission("manage_channels"),
    async (req, res) => {
      try {
        const body = req.body || {};
        const existing = pickPreferredWtfChannelConfig(
          await db.select().from(tvWtfChannelConfig)
        );

        const fields: Record<string, any> = { updatedAt: new Date() };
        if (typeof body.enabled === "boolean") fields.enabled = body.enabled;
        if (
          typeof body.sourceMode === "string" &&
          ["all_users", "selected_users", "specific_wallets"].includes(
            body.sourceMode
          )
        ) {
          fields.sourceMode = body.sourceMode;
        }
        if (Array.isArray(body.sourceUserIds)) {
          fields.sourceUserIds = body.sourceUserIds;
        }
        if (Array.isArray(body.sourceWalletAddresses)) {
          fields.sourceWalletAddresses = body.sourceWalletAddresses;
        }
        if (typeof body.tokensPerWalletPerHour === "number") {
          fields.tokensPerWalletPerHour = Math.max(
            1,
            Math.min(100, Math.floor(body.tokensPerWalletPerHour))
          );
        }
        if (typeof body.defaultDurationSeconds === "number") {
          fields.defaultDurationSeconds = Math.max(
            3,
            Math.min(300, Math.floor(body.defaultDurationSeconds))
          );
        }
        if (typeof body.playlistSize === "number") {
          fields.playlistSize = Math.max(
            5,
            Math.min(500, Math.floor(body.playlistSize))
          );
        }
        if (typeof body.refreshIntervalMinutes === "number") {
          fields.refreshIntervalMinutes = Math.max(
            5,
            Math.min(1440, Math.floor(body.refreshIntervalMinutes))
          );
        }
        if (
          typeof body.bumperMode === "string" &&
          ["community_pool", "selected", "none"].includes(body.bumperMode)
        ) {
          fields.bumperMode = body.bumperMode;
        }
        if (Array.isArray(body.selectedBumperIds)) {
          fields.selectedBumperIds = body.selectedBumperIds;
        }

        let config: any;
        if (existing) {
          [config] = await db
            .update(tvWtfChannelConfig)
            .set(fields)
            .where(eq(tvWtfChannelConfig.id, existing.id))
            .returning();
        } else {
          [config] = await db
            .insert(tvWtfChannelConfig)
            .values(fields)
            .returning();
        }

        res.json(config);
      } catch (err) {
        console.error("[admin] failed to update wtf-tv config:", err);
        res.status(500).json({ error: "Failed to update WTF TV config" });
      }
    }
  );

  router.post(
    "/api/admin/wtf-tv/initialize",
    requirePermission("manage_channels"),
    async (req, res) => {
      try {
        const user = req.user as any;
        const existing = pickPreferredWtfChannelConfig(
          await db.select().from(tvWtfChannelConfig)
        );
        if (existing?.channelId) {
          const [ch] = await db
            .select({ id: tvChannels.id })
            .from(tvChannels)
            .where(eq(tvChannels.id, existing.channelId));
          if (ch) {
            return res.json({
              config: existing,
              message: "WTF TV channel already exists",
            });
          }
        }

        const [channel] = await db
          .insert(tvChannels)
          .values({
            ownerUserId: user.id,
            title: "WTF TV",
            description:
              "The official WTF community channel - random tokens from the community, 24/7.",
            slug: "wtf-tv",
            isActive: true,
          })
          .returning();

        await db.insert(tvPlaylists).values({
          channelId: channel.id,
          name: "Auto Rotation",
          isActive: true,
          transitionSeconds: 1,
        });

        let config: any;
        if (existing) {
          [config] = await db
            .update(tvWtfChannelConfig)
            .set({
              channelId: channel.id,
              enabled: true,
              updatedAt: new Date(),
            })
            .where(eq(tvWtfChannelConfig.id, existing.id))
            .returning();
        } else {
          [config] = await db
            .insert(tvWtfChannelConfig)
            .values({ channelId: channel.id, enabled: true })
            .returning();
        }

        res.status(201).json({ config, channel });
      } catch (err) {
        console.error("[admin] failed to initialize wtf-tv:", err);
        res.status(500).json({ error: "Failed to initialize WTF TV channel" });
      }
    }
  );

  router.post(
    "/api/admin/wtf-tv/refresh",
    requirePermission("manage_channels"),
    async (_req, res) => {
      try {
        const result = await refreshWtfPlaylist();
        res.json(result);
      } catch (err) {
        console.error("[admin] failed to refresh wtf-tv:", err);
        res.status(500).json({ error: "Failed to refresh WTF TV playlist" });
      }
    }
  );
}
