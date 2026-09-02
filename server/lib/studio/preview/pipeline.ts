/**
 * Studio preview pipeline.
 *
 * Given an uploaded file blob, this module tries to generate lightweight
 * preview + thumbnail assets and enrich metadata (durations, page counts,
 * waveform peaks, etc.) using:
 *
 *   - `sharp` for image downscaling
 *   - `pdf-lib` for PDF metadata (page count)
 *   - `ffmpeg` for video poster frames + audio waveforms
 *
 * All external tooling is loaded through `resolveTooling()` which uses
 * dynamic import / subprocess probing, so the pipeline degrades
 * gracefully when any of these aren't available — callers get `null`
 * previews and the original is used at display time.
 */

import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { randomBytes } from "crypto";
import type {
  DriverContext,
  StorageBlob,
  StorageDriver,
  StoredObject,
} from "../storage-driver";
import { probeMediaDuration } from "../../media-probe";

export interface PreviewOutput {
  /** Stored preview object (derivative, OK to regenerate/delete). */
  preview: StoredObject | null;
  /** Stored thumbnail object (small, for tree/list rendering). */
  thumbnail: StoredObject | null;
  /** Enriched metadata to merge onto the studio_files row. */
  metadata: Record<string, unknown>;
}

const IMAGE_MAX_DIM = Number(process.env.STUDIO_PREVIEW_IMAGE_MAX_DIM || 2048);
const IMAGE_THUMB_DIM = Number(process.env.STUDIO_PREVIEW_THUMB_DIM || 256);
const WAVEFORM_SAMPLE_COUNT = Number(
  process.env.STUDIO_PREVIEW_WAVEFORM_SAMPLES || 400
);
const VIDEO_POSTER_SECONDS = Number(
  process.env.STUDIO_PREVIEW_VIDEO_POSTER_SECONDS || 1
);
const PREVIEW_PROCESS_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.STUDIO_PREVIEW_PROCESS_TIMEOUT_MS || 20_000)
);
const PREVIEW_PROCESS_CONCURRENCY = Math.max(
  1,
  Number(process.env.STUDIO_PREVIEW_PROCESS_CONCURRENCY || 2)
);
const PREVIEW_QUEUE_WAIT_MS = Math.max(
  1_000,
  Number(process.env.STUDIO_PREVIEW_QUEUE_WAIT_MS || 5_000)
);

/* ── Tooling resolution (lazy, cached) ─────────────────── */

/**
 * `sharp` and `pdf-lib` are optional at runtime — they're typed as
 * `any` here so the Studio server still compiles even if the packages
 * aren't yet installed.  If installed, the `@types/*` are picked up
 * inside the local scope of the generator functions below via Buffer
 * typing only — call sites are defensive about every method return.
 */
type SharpModule = any;
type PdfLibModule = any;

interface Tooling {
  sharp: SharpModule | null;
  pdfLib: PdfLibModule | null;
  hasFfmpeg: boolean;
  hasFfprobe: boolean;
}

let toolingPromise: Promise<Tooling> | null = null;

/**
 * Dynamic specifiers deliberately built at runtime so TypeScript
 * doesn't try to resolve the module at compile time.  The package is
 * optional at build time and only used if present in node_modules.
 */
const dynamicImport = new Function(
  "m",
  "return import(m)"
) as (m: string) => Promise<any>;

async function loadSharp(): Promise<SharpModule | null> {
  try {
    const mod: any = await dynamicImport("sharp");
    return (mod && mod.default) || mod;
  } catch {
    return null;
  }
}

async function loadPdfLib(): Promise<PdfLibModule | null> {
  try {
    const mod: any = await dynamicImport("pdf-lib");
    return mod;
  } catch {
    return null;
  }
}

async function probeBinary(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn(bin, ["-version"], { stdio: "ignore" });
      child.once("error", () => resolve(false));
      child.once("close", (code) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
}

async function resolveTooling(): Promise<Tooling> {
  if (toolingPromise) return toolingPromise;
  toolingPromise = (async () => {
    const [sharp, pdfLib, hasFfmpeg, hasFfprobe] = await Promise.all([
      loadSharp(),
      loadPdfLib(),
      probeBinary("ffmpeg"),
      probeBinary("ffprobe"),
    ]);
    return { sharp, pdfLib, hasFfmpeg, hasFfprobe };
  })();
  return toolingPromise;
}

export async function previewToolingStatus(): Promise<{
  sharp: boolean;
  pdfLib: boolean;
  ffmpeg: boolean;
  ffprobe: boolean;
}> {
  const t = await resolveTooling();
  return {
    sharp: Boolean(t.sharp),
    pdfLib: Boolean(t.pdfLib),
    ffmpeg: t.hasFfmpeg,
    ffprobe: t.hasFfprobe,
  };
}

/* ── Temp file helpers for ffmpeg ──────────────────────── */

async function writeTemp(buffer: Buffer, ext: string): Promise<string> {
  const file = path.join(
    os.tmpdir(),
    `studio-${Date.now()}-${randomBytes(6).toString("hex")}${ext}`
  );
  await fs.writeFile(file, buffer);
  return file;
}

async function safeUnlink(file: string): Promise<void> {
  try {
    await fs.unlink(file);
  } catch {
    /* noop */
  }
}

let previewProcessesInFlight = 0;
const previewProcessWaiters: Array<() => void> = [];

async function acquirePreviewProcessSlot(): Promise<void> {
  if (previewProcessesInFlight < PREVIEW_PROCESS_CONCURRENCY) {
    previewProcessesInFlight += 1;
    return;
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const waiter = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      previewProcessesInFlight += 1;
      resolve();
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const idx = previewProcessWaiters.indexOf(waiter);
      if (idx >= 0) previewProcessWaiters.splice(idx, 1);
      reject(
        new Error(
          `Studio preview queue was busy for longer than ${PREVIEW_QUEUE_WAIT_MS}ms`
        )
      );
    }, PREVIEW_QUEUE_WAIT_MS);
    previewProcessWaiters.push(waiter);
  });
}

function releasePreviewProcessSlot(): void {
  previewProcessesInFlight = Math.max(0, previewProcessesInFlight - 1);
  const next = previewProcessWaiters.shift();
  if (next) next();
}

async function withPreviewProcessSlot<T>(work: () => Promise<T>): Promise<T> {
  await acquirePreviewProcessSlot();
  try {
    return await work();
  } finally {
    releasePreviewProcessSlot();
  }
}

function runProcess(bin: string, args: string[]): Promise<{
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let settled = false;
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`${bin} timed out after ${PREVIEW_PROCESS_TIMEOUT_MS}ms`));
    }, PREVIEW_PROCESS_TIMEOUT_MS);

    child.stdout?.on("data", (c) => {
      stdout += c.toString();
      if (stdout.length > 128_000) stdout = stdout.slice(-64_000);
    });
    child.stderr?.on("data", (c) => {
      stderr += c.toString();
      if (stderr.length > 64_000) stderr = stderr.slice(-32_000);
    });
    child.once("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(err);
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} exited ${code}: ${stderr.slice(-400)}`));
    });
  });
}

export const studioPreviewProcessTestHooks = Object.freeze({
  runProcess,
  withPreviewProcessSlot,
  processesInFlight: () => previewProcessesInFlight,
  queuedProcesses: () => previewProcessWaiters.length,
});

async function runFfmpeg(args: string[]): Promise<void> {
  await runProcess("ffmpeg", args);
}

async function runFfprobe(args: string[]): Promise<string> {
  const { stdout } = await runProcess("ffprobe", args);
  return stdout;
}

/* ── Image previews via sharp ──────────────────────────── */

async function generateImagePreview(
  tooling: Tooling,
  buffer: Buffer
): Promise<{
  previewBuf: Buffer | null;
  previewMime: string | null;
  thumbBuf: Buffer | null;
  metadata: Record<string, unknown>;
}> {
  if (!tooling.sharp) {
    return {
      previewBuf: null,
      previewMime: null,
      thumbBuf: null,
      metadata: {},
    };
  }

  const sharp = tooling.sharp;

  let meta: { width?: number; height?: number } = {};
  try {
    const probe = await sharp(buffer).metadata();
    meta = { width: probe.width, height: probe.height };
  } catch {
    meta = {};
  }

  let previewBuf: Buffer | null = null;
  let thumbBuf: Buffer | null = null;
  try {
    previewBuf = await sharp(buffer)
      .rotate()
      .resize({
        width: IMAGE_MAX_DIM,
        height: IMAGE_MAX_DIM,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    previewBuf = null;
  }

  try {
    thumbBuf = await sharp(buffer)
      .rotate()
      .resize({
        width: IMAGE_THUMB_DIM,
        height: IMAGE_THUMB_DIM,
        fit: "cover",
        withoutEnlargement: false,
      })
      .webp({ quality: 75 })
      .toBuffer();
  } catch {
    thumbBuf = null;
  }

  return {
    previewBuf,
    previewMime: previewBuf ? "image/webp" : null,
    thumbBuf,
    metadata: meta,
  };
}

/* ── PDF metadata via pdf-lib ──────────────────────────── */

async function inspectPdf(
  tooling: Tooling,
  buffer: Buffer
): Promise<Record<string, unknown>> {
  if (!tooling.pdfLib) return {};
  try {
    const { PDFDocument } = tooling.pdfLib;
    const doc = await PDFDocument.load(buffer, {
      ignoreEncryption: true,
    });
    return {
      pageCount: doc.getPageCount(),
      title: doc.getTitle() || undefined,
      author: doc.getAuthor() || undefined,
    };
  } catch {
    return {};
  }
}

/* ── Video poster + duration via ffmpeg/ffprobe ────────── */

async function generateVideoPreview(
  tooling: Tooling,
  buffer: Buffer,
  mimeType: string
): Promise<{
  posterBuf: Buffer | null;
  thumbBuf: Buffer | null;
  metadata: Record<string, unknown>;
}> {
  let metadata: Record<string, unknown> = {};
  let posterBuf: Buffer | null = null;
  let thumbBuf: Buffer | null = null;

  const ext = mimeType === "video/mp4" ? ".mp4" : ".bin";
  const srcFile = await writeTemp(buffer, ext);
  const posterFile = path.join(
    os.tmpdir(),
    `studio-${Date.now()}-${randomBytes(4).toString("hex")}-poster.jpg`
  );

  try {
    await withPreviewProcessSlot(async () => {
      if (tooling.hasFfprobe) {
        const probed = await probeMediaDuration(srcFile);
        if (probed) {
          metadata = {
            durationSeconds: probed.durationSeconds,
            width: probed.width,
            height: probed.height,
            codec: probed.codec,
          };
        }
      }

      if (tooling.hasFfmpeg) {
        await runFfmpeg([
          "-y",
          "-ss",
          String(VIDEO_POSTER_SECONDS),
          "-i",
          srcFile,
          "-frames:v",
          "1",
          "-q:v",
          "3",
          posterFile,
        ]);

        try {
          posterBuf = await fs.readFile(posterFile);
        } catch {
          posterBuf = null;
        }

        if (posterBuf && tooling.sharp) {
          try {
            thumbBuf = await tooling.sharp(posterBuf)
              .resize({
                width: IMAGE_THUMB_DIM,
                height: IMAGE_THUMB_DIM,
                fit: "cover",
              })
              .webp({ quality: 75 })
              .toBuffer();
          } catch {
            thumbBuf = null;
          }
        }
      }
    });
  } finally {
    await safeUnlink(srcFile);
    await safeUnlink(posterFile);
  }

  return { posterBuf, thumbBuf, metadata };
}

/* ── Audio waveform + duration via ffmpeg/ffprobe ──────── */

async function generateAudioPreview(
  tooling: Tooling,
  buffer: Buffer,
  mimeType: string
): Promise<{ metadata: Record<string, unknown> }> {
  const metadata: Record<string, unknown> = {};
  const ext = mimeType.includes("mpeg")
    ? ".mp3"
    : mimeType.includes("wav")
      ? ".wav"
      : mimeType.includes("flac")
        ? ".flac"
        : mimeType.includes("ogg")
          ? ".ogg"
          : ".bin";

  const srcFile = await writeTemp(buffer, ext);

  try {
    await withPreviewProcessSlot(async () => {
      if (tooling.hasFfprobe) {
        try {
          const stdout = await runFfprobe([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            srcFile,
          ]);
          const json = JSON.parse(stdout);
          const durationSeconds = parseFloat(json?.format?.duration || "0");
          if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
            metadata.durationSeconds = Math.round(durationSeconds);
          }
        } catch {
          /* ignore */
        }
      }

      if (tooling.hasFfmpeg && typeof metadata.durationSeconds === "number") {
        try {
          const sampleRate = 8000;
          const totalSamples = Math.max(
            WAVEFORM_SAMPLE_COUNT,
            Math.ceil((metadata.durationSeconds as number) * 2)
          );
          const bucketSize = Math.max(
            1,
            Math.floor(((metadata.durationSeconds as number) * sampleRate) / WAVEFORM_SAMPLE_COUNT)
          );
          const rawFile = path.join(
            os.tmpdir(),
            `studio-${Date.now()}-${randomBytes(4).toString("hex")}.raw`
          );
          await runFfmpeg([
            "-y",
            "-i",
            srcFile,
            "-ac",
            "1",
            "-ar",
            String(sampleRate),
            "-f",
            "s16le",
            "-acodec",
            "pcm_s16le",
            rawFile,
          ]);

          const raw = await fs.readFile(rawFile);
          await safeUnlink(rawFile);

          const peaks: number[] = [];
          const sampleCount = Math.floor(raw.length / 2);
          for (let b = 0; b < WAVEFORM_SAMPLE_COUNT; b++) {
            const start = b * bucketSize;
            const end = Math.min(sampleCount, start + bucketSize);
            let max = 0;
            for (let i = start; i < end; i++) {
              const v = Math.abs(raw.readInt16LE(i * 2));
              if (v > max) max = v;
            }
            peaks.push(+(max / 32768).toFixed(3));
          }
          metadata.waveformPeaks = peaks;
          metadata.waveformSampleCount = peaks.length;
          // Intentionally avoid storing `totalSamples`; debug info only.
          void totalSamples;
          await safeUnlink(rawFile);
        } catch {
          /* ignore waveform failures */
        }
      }
    });
  } finally {
    await safeUnlink(srcFile);
  }

  return { metadata };
}

/* ── Public entry point ────────────────────────────────── */

export async function generatePreview(
  driver: StorageDriver,
  ctx: DriverContext,
  blob: StorageBlob
): Promise<PreviewOutput> {
  const tooling = await resolveTooling();
  const mime = (blob.mimeType || "").toLowerCase();

  let previewBuf: Buffer | null = null;
  let previewMime: string | null = null;
  let thumbBuf: Buffer | null = null;
  let metadata: Record<string, unknown> = {};

  if (mime.startsWith("image/") && !mime.includes("svg")) {
    const img = await generateImagePreview(tooling, blob.buffer);
    previewBuf = img.previewBuf;
    previewMime = img.previewMime;
    thumbBuf = img.thumbBuf;
    metadata = { ...metadata, ...img.metadata };
  } else if (mime === "application/pdf") {
    const pdfMeta = await inspectPdf(tooling, blob.buffer);
    metadata = { ...metadata, ...pdfMeta };
  } else if (mime.startsWith("video/")) {
    const vid = await generateVideoPreview(tooling, blob.buffer, mime);
    previewBuf = vid.posterBuf;
    previewMime = vid.posterBuf ? "image/jpeg" : null;
    thumbBuf = vid.thumbBuf;
    metadata = { ...metadata, ...vid.metadata };
  } else if (mime.startsWith("audio/")) {
    const aud = await generateAudioPreview(tooling, blob.buffer, mime);
    metadata = { ...metadata, ...aud.metadata };
  }

  let preview: StoredObject | null = null;
  let thumbnail: StoredObject | null = null;

  if (previewBuf && previewMime) {
    try {
      preview = await driver.upload(
        ctx,
        { buffer: previewBuf, mimeType: previewMime, filename: "preview" },
        "preview"
      );
    } catch {
      preview = null;
    }
  }

  if (thumbBuf) {
    try {
      thumbnail = await driver.upload(
        ctx,
        { buffer: thumbBuf, mimeType: "image/webp", filename: "thumb" },
        "thumbnail"
      );
    } catch {
      thumbnail = null;
    }
  }

  return { preview, thumbnail, metadata };
}
