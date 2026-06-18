import { asc, eq } from "drizzle-orm";
import { db } from "../../db";
import { wtfLiveSoundboardClips } from "@shared/schema";

const MAX_CLIPS = 8;
const MAX_BYTES = 1_200_000;
const MAX_DATA_URL_LENGTH = Math.ceil(MAX_BYTES * 1.4);
const DEFAULT_VOLUME = 90;
const DEFAULT_COOLDOWN_MS = 1500;
const MAX_COOLDOWN_MS = 30_000;
const SOUND_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/mp4", "audio/webm"]);

export type WtfLiveSoundboardClipRecord = {
  id: string;
  label: string;
  category: string;
  shortcut: string;
  mimeType: string;
  dataUrl: string;
  sizeBytes: number;
  volume: number;
  cooldownMs: number;
  createdAt: string;
};

export type WtfLiveSoundboardSettingsRecord = {
  clips: WtfLiveSoundboardClipRecord[];
  armed: boolean;
  updatedAt: string | null;
  storage: "wtf_live_soundboard_clips";
};

export async function getUserWtfLiveSoundboardSettings(ownerUserId: number): Promise<WtfLiveSoundboardSettingsRecord> {
  const rows = await db
    .select()
    .from(wtfLiveSoundboardClips)
    .where(eq(wtfLiveSoundboardClips.ownerUserId, ownerUserId))
    .orderBy(asc(wtfLiveSoundboardClips.sortOrder), asc(wtfLiveSoundboardClips.id));

  const clips = rows.flatMap((row) => {
    const normalized = normalizeWtfLiveSoundboardClip({
      id: row.clipId,
      label: row.label,
      category: row.category,
      shortcut: row.shortcut,
      mimeType: row.mimeType,
      dataUrl: row.dataUrl,
      sizeBytes: row.sizeBytes,
      volume: row.volume,
      cooldownMs: row.cooldownMs,
      createdAt: row.createdAt?.toISOString(),
    });
    return normalized ? [normalized] : [];
  });
  const updatedAt = rows.reduce<string | null>((latest, row) => {
    const raw = row.updatedAt?.toISOString() ?? null;
    if (!raw) return latest;
    return !latest || raw > latest ? raw : latest;
  }, null);

  return { clips, armed: true, updatedAt, storage: "wtf_live_soundboard_clips" };
}

export async function replaceUserWtfLiveSoundboardSettings(
  ownerUserId: number,
  value: unknown,
): Promise<WtfLiveSoundboardSettingsRecord> {
  const settings = normalizeWtfLiveSoundboardSettings(value);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .delete(wtfLiveSoundboardClips)
      .where(eq(wtfLiveSoundboardClips.ownerUserId, ownerUserId));
    if (!settings.clips.length) return;
    await tx.insert(wtfLiveSoundboardClips).values(
      settings.clips.map((clip, index) => ({
        ownerUserId,
        clipId: clip.id,
        label: clip.label,
        category: clip.category,
        shortcut: clip.shortcut,
        mimeType: clip.mimeType,
        dataUrl: clip.dataUrl,
        sizeBytes: clip.sizeBytes,
        volume: clip.volume,
        cooldownMs: clip.cooldownMs,
        sortOrder: index,
        createdAt: new Date(clip.createdAt),
        updatedAt: now,
      })),
    );
  });

  return {
    ...settings,
    updatedAt: now.toISOString(),
    storage: "wtf_live_soundboard_clips",
  };
}

export function normalizeWtfLiveSoundboardSettings(value: unknown) {
  const settings = typeof value === "object" && value ? value as Record<string, unknown> : {};
  const clips = Array.isArray(settings.clips)
    ? settings.clips.flatMap((clip) => {
        const normalized = normalizeWtfLiveSoundboardClip(clip);
        return normalized ? [normalized] : [];
      })
    : [];
  const uniqueClips = new Map<string, WtfLiveSoundboardClipRecord>();
  for (const clip of clips) uniqueClips.set(clip.id, clip);
  const usedShortcuts = new Set<string>();
  const deduped = Array.from(uniqueClips.values())
    .filter((clip) => {
      if (!clip.shortcut) return true;
      if (usedShortcuts.has(clip.shortcut)) return false;
      usedShortcuts.add(clip.shortcut);
      return true;
    })
    .slice(0, MAX_CLIPS);
  return {
    clips: deduped,
    armed: settings.armed !== false,
    updatedAt: typeof settings.updatedAt === "string" ? settings.updatedAt : null,
  };
}

function normalizeWtfLiveSoundboardClip(value: unknown): WtfLiveSoundboardClipRecord | null {
  const clip = typeof value === "object" && value ? value as Record<string, unknown> : null;
  if (!clip) return null;
  const mimeType = String(clip.mimeType || "");
  const dataUrl = String(clip.dataUrl || "");
  if (!SOUND_TYPES.has(mimeType)) return null;
  if (!dataUrl.startsWith(`data:${mimeType};base64,`)) return null;
  if (dataUrl.length > MAX_DATA_URL_LENGTH) return null;
  const sizeBytes = Number(clip.sizeBytes);
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0 || sizeBytes > MAX_BYTES) return null;
  return {
    id: sanitizeId(clip.id),
    label: sanitizeLabel(clip.label),
    category: sanitizeCategory(clip.category),
    shortcut: normalizeShortcut(clip.shortcut),
    mimeType,
    dataUrl,
    sizeBytes: Math.round(sizeBytes),
    volume: normalizeVolume(clip.volume),
    cooldownMs: normalizeCooldownMs(clip.cooldownMs),
    createdAt: sanitizeCreatedAt(clip.createdAt),
  };
}

function sanitizeId(value: unknown): string {
  return String(value || "")
    .replace(/[^a-z0-9_-]/gi, "")
    .slice(0, 80) || `clip_${Date.now().toString(36)}`;
}

function sanitizeLabel(value: unknown): string {
  return String(value || "Sound").trim().replace(/\s+/g, " ").slice(0, 36) || "Sound";
}

function sanitizeCategory(value: unknown): string {
  return String(value || "General").trim().replace(/\s+/g, " ").slice(0, 32) || "General";
}

function normalizeVolume(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_VOLUME;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

function normalizeCooldownMs(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_COOLDOWN_MS;
  return Math.min(MAX_COOLDOWN_MS, Math.max(0, Math.round(parsed)));
}

function normalizeShortcut(value: unknown): string {
  return String(value || "").trim().replace(/\s*\+\s*/g, "+").slice(0, 32);
}

function sanitizeCreatedAt(value: unknown): string {
  const raw = typeof value === "string" ? value : "";
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString();
}
