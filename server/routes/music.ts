import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../auth/passport";
import {
  musicListeningHistory,
  musicNowPlaying,
  musicPlaylists,
  musicPlaylistTracks,
} from "@shared/schema";
import { logSystemEvent } from "../lib/system-log";

const router = Router();

const playlistSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  isPublic: z.boolean().optional(),
});

const trackSchema = z.object({
  tokenContract: z.string().trim().min(1),
  tokenId: z.string().trim().min(1),
  title: z.string().trim().max(300).optional(),
  artist: z.string().trim().max(200).optional(),
  audioUrl: z.string().url().optional(),
});

router.get("/api/music/playlists", isAuthenticated, async (req, res) => {
  const user = req.user as { id: number };
  const rows = await db
    .select()
    .from(musicPlaylists)
    .where(eq(musicPlaylists.userId, user.id));
  res.json(rows);
});

router.post("/api/music/playlists", isAuthenticated, async (req, res) => {
  const parsed = playlistSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid playlist" });
  const user = req.user as { id: number };
  const [row] = await db
    .insert(musicPlaylists)
    .values({
      userId: user.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      isPublic: parsed.data.isPublic ?? false,
    })
    .returning();

  logSystemEvent({
    source: "server",
    eventType: "music.playlist_create",
    severity: "info",
    userId: user.id,
    method: req.method,
    path: req.path,
    metadata: { playlistId: row.id, name: parsed.data.name },
  });

  res.status(201).json(row);
});

router.post(
  "/api/music/playlists/:id/tracks",
  isAuthenticated,
  async (req, res) => {
    const parsed = trackSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid track" });
    const playlistId = Number(req.params.id);
    const [row] = await db
      .insert(musicPlaylistTracks)
      .values({
        playlistId,
        tokenContract: parsed.data.tokenContract,
        tokenId: parsed.data.tokenId,
        title: parsed.data.title ?? null,
        artist: parsed.data.artist ?? null,
        audioUrl: parsed.data.audioUrl ?? null,
      })
      .returning();
    res.status(201).json(row);
  }
);

router.get("/api/music/now-playing", isAuthenticated, async (req, res) => {
  const user = req.user as { id: number };
  const [row] = await db
    .select()
    .from(musicNowPlaying)
    .where(eq(musicNowPlaying.userId, user.id));
  res.json(row ?? null);
});

router.put("/api/music/now-playing", isAuthenticated, async (req, res) => {
  const user = req.user as { id: number };
  const parsed = trackSchema
    .extend({ isPlaying: z.boolean().optional() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const [row] = await db
    .insert(musicNowPlaying)
    .values({
      userId: user.id,
      tokenContract: parsed.data.tokenContract,
      tokenId: parsed.data.tokenId,
      title: parsed.data.title ?? null,
      artist: parsed.data.artist ?? null,
      isPlaying: parsed.data.isPlaying ?? true,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: musicNowPlaying.userId,
      set: {
        tokenContract: parsed.data.tokenContract,
        tokenId: parsed.data.tokenId,
        title: parsed.data.title ?? null,
        artist: parsed.data.artist ?? null,
        isPlaying: parsed.data.isPlaying ?? true,
        updatedAt: new Date(),
      },
    })
    .returning();

  await db.insert(musicListeningHistory).values({
    userId: user.id,
    tokenContract: parsed.data.tokenContract,
    tokenId: parsed.data.tokenId,
    title: parsed.data.title ?? null,
  });

  logSystemEvent({
    source: "server",
    eventType: "music.track_played",
    severity: "info",
    userId: user.id,
    method: req.method,
    path: req.path,
    metadata: {
      tokenContract: parsed.data.tokenContract,
      tokenId: parsed.data.tokenId,
      title: parsed.data.title ?? null,
    },
  });

  res.json(row);
});

export default router;
