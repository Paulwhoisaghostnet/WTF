import { spawn } from "child_process";
import { promises as fsPromises } from "fs";
import { guessMimeTypeFromUri } from "../../lib/media-utils";
import {
  cacheMediaPath,
  logCacheEvent,
  transcodeMediaPath,
  transcodeMetaPath,
  TV_CACHE_DIR,
  TV_TRANSCODE_BOOT_DELAY_MS,
  TV_TRANSCODE_CRF,
  TV_TRANSCODE_ENABLED,
  TV_TRANSCODE_ERROR_COOLDOWN_MS,
  TV_TRANSCODE_MAX_HEIGHT,
  TV_TRANSCODE_PER_SWEEP,
  TV_TRANSCODE_SWEEP_INTERVAL_MS,
  TV_TRANSCODE_THRESHOLD_BYTES,
  type TranscodeMeta,
} from "./cache-files";
import {
  ensureCacheDir,
  readCacheMeta,
} from "./cache-storage";

async function ffmpegTranscodeVideo(input: string, output: string): Promise<void> {
  const scaleFilter =
    `scale='if(gt(iw/ih,${TV_TRANSCODE_MAX_HEIGHT * 16}/${TV_TRANSCODE_MAX_HEIGHT * 9}),` +
    `min(${TV_TRANSCODE_MAX_HEIGHT * 16 / 9 | 0},iw),-2)':` +
    `'if(gt(iw/ih,${TV_TRANSCODE_MAX_HEIGHT * 16}/${TV_TRANSCODE_MAX_HEIGHT * 9}),-2,` +
    `min(${TV_TRANSCODE_MAX_HEIGHT},ih))':force_original_aspect_ratio=decrease,` +
    `scale=trunc(iw/2)*2:trunc(ih/2)*2`;
  const args = [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-nostdin",
    "-i", input,
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", String(TV_TRANSCODE_CRF),
    "-pix_fmt", "yuv420p",
    "-profile:v", "high",
    "-level", "4.0",
    "-c:a", "aac",
    "-b:a", "128k",
    "-ac", "2",
    "-ar", "48000",
    "-vf", scaleFilter,
    "-movflags", "+faststart",
    "-max_muxing_queue_size", "1024",
    "-f", "mp4",
    output,
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 32_000) stderr = stderr.slice(-16_000);
    });
    child.once("error", (err) => reject(err));
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-600).trim()}`));
    });
  });
}

type TranscodeOutcome = "done" | "skipped" | "error";

async function transcodeOne(base: string): Promise<{
  outcome: TranscodeOutcome;
  originalBytes: number;
  transcodedBytes: number;
  elapsedMs: number;
  error?: string;
}> {
  const startedAt = Date.now();
  const inputPath = cacheMediaPath(base);
  const outputPath = transcodeMediaPath(base);
  const metaOutPath = transcodeMetaPath(base);

  try {
    const outStat = await fsPromises.stat(outputPath);
    if (outStat.size > 0) {
      return {
        outcome: "skipped",
        originalBytes: 0,
        transcodedBytes: outStat.size,
        elapsedMs: Date.now() - startedAt,
      };
    }
  } catch {
    /* no existing output */
  }

  try {
    const raw = await fsPromises.readFile(metaOutPath, "utf8");
    const prior = JSON.parse(raw) as TranscodeMeta;
    if (
      prior.status === "error" &&
      Date.now() - prior.erroredAt < TV_TRANSCODE_ERROR_COOLDOWN_MS
    ) {
      return {
        outcome: "skipped",
        originalBytes: 0,
        transcodedBytes: 0,
        elapsedMs: Date.now() - startedAt,
      };
    }
  } catch {
    /* no prior meta */
  }

  let inputStat: import("fs").Stats;
  try {
    inputStat = await fsPromises.stat(inputPath);
  } catch {
    return {
      outcome: "skipped",
      originalBytes: 0,
      transcodedBytes: 0,
      elapsedMs: Date.now() - startedAt,
    };
  }

  const tempPath =
    `${outputPath}.${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.tmp`;

  logCacheEvent({
    event: "transcode.start",
    source: base,
    originalBytes: inputStat.size,
    height: TV_TRANSCODE_MAX_HEIGHT,
    crf: TV_TRANSCODE_CRF,
  });

  try {
    await ffmpegTranscodeVideo(inputPath, tempPath);
    const outStat = await fsPromises.stat(tempPath);
    if (outStat.size <= 0) throw new Error("ffmpeg produced an empty file");

    await fsPromises.rename(tempPath, outputPath);
    const successMeta: TranscodeMeta = {
      status: "ok",
      createdAt: Date.now(),
      originalBytes: inputStat.size,
      transcodedBytes: outStat.size,
      elapsedMs: Date.now() - startedAt,
      height: TV_TRANSCODE_MAX_HEIGHT,
      crf: TV_TRANSCODE_CRF,
    };
    await fsPromises
      .writeFile(metaOutPath, JSON.stringify(successMeta), "utf8")
      .catch(() => undefined);

    logCacheEvent({
      event: "transcode.done",
      source: base,
      originalBytes: inputStat.size,
      transcodedBytes: outStat.size,
      ratio: Number((outStat.size / inputStat.size).toFixed(3)),
      elapsedMs: Date.now() - startedAt,
    });

    return {
      outcome: "done",
      originalBytes: inputStat.size,
      transcodedBytes: outStat.size,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (err) {
    await fsPromises.unlink(tempPath).catch(() => undefined);
    const message = err instanceof Error ? err.message : String(err);
    const errorMeta: TranscodeMeta = {
      status: "error",
      erroredAt: Date.now(),
      error: message.slice(0, 400),
      height: TV_TRANSCODE_MAX_HEIGHT,
    };
    await fsPromises
      .writeFile(metaOutPath, JSON.stringify(errorMeta), "utf8")
      .catch(() => undefined);

    logCacheEvent({
      event: "transcode.error",
      source: base,
      originalBytes: inputStat.size,
      error: message.slice(0, 200),
      elapsedMs: Date.now() - startedAt,
    });

    return {
      outcome: "error",
      originalBytes: inputStat.size,
      transcodedBytes: 0,
      elapsedMs: Date.now() - startedAt,
      error: message,
    };
  }
}

async function scanTranscodeCandidates(): Promise<Array<{ base: string; size: number }>> {
  if (!TV_TRANSCODE_ENABLED) return [];
  await ensureCacheDir();
  let names: string[];
  try {
    names = await fsPromises.readdir(TV_CACHE_DIR);
  } catch {
    return [];
  }

  const heightTag = `${TV_TRANSCODE_MAX_HEIGHT}p`;
  const transcodeSuffix = `.${heightTag}.mp4`;
  const transcodeMetaSuffix = `.${heightTag}.json`;

  const allBases = new Set<string>();
  const haveTranscode = new Set<string>();
  const haveSidecar = new Set<string>();
  for (const name of names) {
    if (name.endsWith(".bin")) allBases.add(name.slice(0, -4));
    else if (name.endsWith(transcodeSuffix)) {
      haveTranscode.add(name.slice(0, -transcodeSuffix.length));
    } else if (name.endsWith(transcodeMetaSuffix)) {
      haveSidecar.add(name.slice(0, -transcodeMetaSuffix.length));
    }
  }

  const out: Array<{ base: string; size: number }> = [];
  for (const base of allBases) {
    if (haveTranscode.has(base)) continue;

    const meta = await readCacheMeta(base);
    const ct = String(meta?.contentType || "").toLowerCase();
    const guessed = guessMimeTypeFromUri(String(meta?.sourceUri || "")) || "";
    const looksVideo = ct.startsWith("video/") || guessed.startsWith("video/");
    if (!looksVideo) continue;

    let stat: import("fs").Stats;
    try {
      stat = await fsPromises.stat(cacheMediaPath(base));
    } catch {
      continue;
    }
    if (stat.size < TV_TRANSCODE_THRESHOLD_BYTES) continue;

    if (haveSidecar.has(base)) {
      try {
        const raw = await fsPromises.readFile(transcodeMetaPath(base), "utf8");
        const prior = JSON.parse(raw) as TranscodeMeta;
        if (
          prior.status === "error" &&
          Date.now() - prior.erroredAt < TV_TRANSCODE_ERROR_COOLDOWN_MS
        ) {
          continue;
        }
      } catch {
        /* unreadable sidecar */
      }
    }

    out.push({ base, size: stat.size });
  }

  out.sort((a, b) => b.size - a.size);
  return out;
}

export async function runTvTranscodeSweep(): Promise<{
  scanned: number;
  transcoded: number;
  failed: number;
  skipped: number;
  bytesIn: number;
  bytesOut: number;
}> {
  const summary = {
    scanned: 0,
    transcoded: 0,
    failed: 0,
    skipped: 0,
    bytesIn: 0,
    bytesOut: 0,
  };
  if (!TV_TRANSCODE_ENABLED) return summary;

  const candidates = await scanTranscodeCandidates();
  summary.scanned = candidates.length;
  if (candidates.length === 0) return summary;

  let processed = 0;
  for (const { base } of candidates) {
    if (processed >= TV_TRANSCODE_PER_SWEEP) break;
    const result = await transcodeOne(base);
    if (result.outcome === "done") {
      summary.transcoded += 1;
      summary.bytesIn += result.originalBytes;
      summary.bytesOut += result.transcodedBytes;
      processed += 1;
    } else if (result.outcome === "error") {
      summary.failed += 1;
      processed += 1;
    } else {
      summary.skipped += 1;
    }
  }

  logCacheEvent({
    event: "transcode.sweep",
    scanned: summary.scanned,
    transcoded: summary.transcoded,
    failed: summary.failed,
    skipped: summary.skipped,
    bytesIn: summary.bytesIn,
    bytesOut: summary.bytesOut,
  });

  return summary;
}

export const TV_TRANSCODE_TUNING = {
  enabled: TV_TRANSCODE_ENABLED,
  thresholdBytes: TV_TRANSCODE_THRESHOLD_BYTES,
  maxHeight: TV_TRANSCODE_MAX_HEIGHT,
  crf: TV_TRANSCODE_CRF,
  perSweep: TV_TRANSCODE_PER_SWEEP,
  intervalMs: TV_TRANSCODE_SWEEP_INTERVAL_MS,
  bootDelayMs: TV_TRANSCODE_BOOT_DELAY_MS,
};
