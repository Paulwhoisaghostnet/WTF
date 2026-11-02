import { and, desc, eq } from "drizzle-orm";
import paulTutorials from "../../public/desktop/paul-tutorials/catalog.json";
import tommyTutorials from "@shared/faq-tutorials.json";
import { userVideoWatches, users } from "@shared/schema";
import { db } from "../db";

export const PAUL_INTRO_VIDEO_ID = "paul/intro";

type WatchableVideo = { videoId: string; title: string };
export type WatchedVideo = WatchableVideo & { watchedAt: Date };
export type VideoViewer = { userId: number; username: string; watchedAt: Date };

const watchableVideos = new Map<string, WatchableVideo>([
  [PAUL_INTRO_VIDEO_ID, {
    videoId: PAUL_INTRO_VIDEO_ID,
    title: "Welcome to wtfOS with paulwhoisaclippy",
  }],
  ...(paulTutorials as Array<{ slug: string; title: string }>).map((video) => {
    const videoId = `paul/${video.slug}`;
    return [videoId, { videoId, title: video.title }] as const;
  }),
  ...(tommyTutorials as Array<{ slug: string; title: string }>).map((video) => {
    const videoId = `tommy/${video.slug}`;
    return [videoId, { videoId, title: video.title }] as const;
  }),
]);

/** Only checked-in, playable instructional videos may become account history. */
export function findWatchableVideo(videoId: string): WatchableVideo | null {
  return watchableVideos.get(videoId) ?? null;
}

/** Historic catalog entries remain queryable without opening new writes to unknown IDs. */
export function isWellFormedVideoWatchId(videoId: string): boolean {
  return /^(?:paul|tommy)\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(videoId);
}

export async function hasWatchedIntroVideo(userId: number): Promise<boolean> {
  const [watch] = await db
    .select({ videoId: userVideoWatches.videoId })
    .from(userVideoWatches)
    .where(and(
      eq(userVideoWatches.userId, userId),
      eq(userVideoWatches.videoId, PAUL_INTRO_VIDEO_ID),
    ))
    .limit(1);
  return Boolean(watch);
}

export async function listWatchedVideos(userId: number): Promise<WatchedVideo[]> {
  return db
    .select({
      videoId: userVideoWatches.videoId,
      title: userVideoWatches.title,
      watchedAt: userVideoWatches.watchedAt,
    })
    .from(userVideoWatches)
    .where(eq(userVideoWatches.userId, userId))
    .orderBy(desc(userVideoWatches.watchedAt), desc(userVideoWatches.videoId));
}

/** First completion wins, preserving the original watch date on replay. */
export async function recordWatchedVideo(userId: number, videoId: string): Promise<WatchedVideo> {
  const video = findWatchableVideo(videoId);
  if (!video) throw new Error("Unknown instructional video");

  await db
    .insert(userVideoWatches)
    .values({ userId, videoId, title: video.title })
    .onConflictDoNothing({ target: [userVideoWatches.userId, userVideoWatches.videoId] });

  const [watch] = await db
    .select({
      videoId: userVideoWatches.videoId,
      title: userVideoWatches.title,
      watchedAt: userVideoWatches.watchedAt,
    })
    .from(userVideoWatches)
    .where(and(eq(userVideoWatches.userId, userId), eq(userVideoWatches.videoId, videoId)))
    .limit(1);
  if (!watch) throw new Error("Watched video was not saved");
  return watch;
}

/** Admin roster, including the account identity required to distinguish viewers. */
export async function listVideoViewers(videoId: string): Promise<VideoViewer[]> {
  return db
    .select({
      userId: userVideoWatches.userId,
      username: users.username,
      watchedAt: userVideoWatches.watchedAt,
    })
    .from(userVideoWatches)
    .innerJoin(users, eq(userVideoWatches.userId, users.id))
    .where(eq(userVideoWatches.videoId, videoId))
    .orderBy(desc(userVideoWatches.watchedAt), desc(userVideoWatches.userId));
}
