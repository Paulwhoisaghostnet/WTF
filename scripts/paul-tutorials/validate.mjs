#!/usr/bin/env node
/** Validate the complete, self-hosted Paul walkthrough catalog and media. */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const publicRoot = path.join(root, "public");
const assetRoot = path.join(publicRoot, "desktop/paul-tutorials");
const episodes = JSON.parse(await fs.readFile(path.join(here, "episodes.json"), "utf8"));
const catalog = JSON.parse(await fs.readFile(path.join(assetRoot, "catalog.json"), "utf8"));
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
const probe = (file) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams",
  "-show_format", "-of", "json", file], { encoding: "utf8" }));
const urlFile = (url) => {
  if (typeof url !== "string" || !url.startsWith("/desktop/paul-tutorials/") || url.includes("..")) {
    throw new Error(`Invalid self-hosted asset URL: ${url}`);
  }
  return path.join(publicRoot, url.slice(1));
};
const cueTime = (value) => {
  const match = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/.exec(value);
  if (!match) throw new Error(`Invalid VTT time ${value}`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
};
const readCues = (text) => {
  if (!text.startsWith("WEBVTT\n\n")) throw new Error("Missing WEBVTT header");
  return text.slice("WEBVTT\n\n".length).trim().split(/\n\s*\n/).filter(Boolean).map((block) => {
    const [range, ...lines] = block.split("\n");
    const match = /^(\S+) --> (\S+)$/.exec(range);
    if (!match) throw new Error(`Invalid VTT cue: ${range}`);
    return { start: cueTime(match[1]), end: cueTime(match[2]), text: lines.join("\n") };
  });
};

check(Array.isArray(catalog), "Catalog must be an array");
check(catalog.length === episodes.length, `Catalog has ${catalog.length} entries; source has ${episodes.length}`);
check(new Set(episodes.map((item) => item.slug)).size === episodes.length, "Episode slugs must be unique");
const expectedAssets = new Set(["catalog.json", ...episodes.flatMap(({ slug }) =>
  [`${slug}.mp4`, `${slug}.vtt`, `${slug}-poster.jpg`])]);
for (const file of await fs.readdir(assetRoot)) {
  if (!expectedAssets.has(file)) errors.push(`Unreferenced tutorial asset: ${file}`);
}
for (const [index, episode] of episodes.entries()) {
  const item = catalog[index];
  if (!item) continue;
  const slug = episode.slug;
  check(item.slug === slug, `${slug}: catalog order or slug mismatch`);
  check(item.title === episode.title && item.summary === episode.summary && item.route === episode.route,
    `${slug}: catalog copy or route drift`);
  check(JSON.stringify(item.steps) === JSON.stringify(episode.steps), `${slug}: written steps drift`);
  check(item.transcript === episode.spokenSteps.join(" "), `${slug}: transcript drift`);
  check(episode.steps.length === episode.spokenSteps.length && episode.steps.length > 0,
    `${slug}: written and spoken step counts differ`);
  const expected = {
    videoUrl: `/desktop/paul-tutorials/${slug}.mp4`,
    captionsUrl: `/desktop/paul-tutorials/${slug}.vtt`,
    posterUrl: `/desktop/paul-tutorials/${slug}-poster.jpg`,
  };
  for (const [key, value] of Object.entries(expected)) check(item[key] === value, `${slug}: ${key} drift`);
  try {
    const video = urlFile(item.videoUrl);
    const captions = urlFile(item.captionsUrl);
    const poster = urlFile(item.posterUrl);
    const [videoBytes, vtt] = await Promise.all([
      fs.readFile(video), fs.readFile(captions, "utf8"),
    ]);
    const videoInfo = probe(video);
    const videoStream = videoInfo.streams.find((stream) => stream.codec_type === "video");
    const audioStream = videoInfo.streams.find((stream) => stream.codec_type === "audio");
    const duration = Number(videoInfo.format.duration);
    check(videoStream?.codec_name === "h264" && videoStream?.width === 1280 && videoStream?.height === 720,
      `${slug}: MP4 must have 1280×720 H.264 video`);
    check(audioStream?.codec_name === "aac", `${slug}: MP4 must have AAC narration`);
    const volume = spawnSync("ffmpeg", ["-v", "info", "-i", video, "-vn", "-af", "volumedetect",
      "-f", "null", "-"], { encoding: "utf8" });
    const maxVolume = /max_volume:\s*(-?[\d.]+) dB/.exec(volume.stderr ?? "");
    check(volume.status === 0 && maxVolume && Number.isFinite(Number(maxVolume[1])),
      `${slug}: AAC narration is silent or unreadable`);
    check(Number.isFinite(duration) && duration > 0 && duration === item.durationSeconds,
      `${slug}: duration metadata differs from MP4`);
    check(createHash("sha256").update(videoBytes).digest("hex") === item.sha256,
      `${slug}: MP4 checksum differs from catalog`);
    const posterInfo = probe(poster).streams.find((stream) => stream.codec_type === "video");
    check(posterInfo?.codec_name === "mjpeg" && posterInfo?.width === 1280 && posterInfo?.height === 720,
      `${slug}: poster must be a decodable 1280×720 JPEG`);
    const decode = spawnSync("ffmpeg", ["-v", "error", "-i", poster, "-frames:v", "1", "-f", "null", "-"],
      { encoding: "utf8" });
    check(decode.status === 0, `${slug}: poster decode failed: ${decode.stderr}`);
    const cues = readCues(vtt);
    check(cues.length === episode.spokenSteps.length, `${slug}: caption cue count differs from steps`);
    let lastEnd = 0;
    for (const [cueIndex, cue] of cues.entries()) {
      check(cue.text === episode.spokenSteps[cueIndex], `${slug}: caption text ${cueIndex + 1} drift`);
      check(cue.start >= lastEnd && cue.end > cue.start && cue.end <= duration,
        `${slug}: caption cue ${cueIndex + 1} outside MP4 duration`);
      lastEnd = cue.end;
    }
    const timingFile = path.join(root, "output/paul-tutorials/narration", `${slug}.timings.json`);
    const timing = await fs.readFile(timingFile, "utf8").then(JSON.parse).catch(() => null);
    if (timing) for (const [cueIndex, cue] of cues.entries()) {
      const segment = timing.segments[cueIndex];
      check(segment && cue.start === Math.round(segment.startSeconds * 1000) / 1000 &&
        cue.end === Math.round(segment.endSeconds * 1000) / 1000,
      `${slug}: caption cue ${cueIndex + 1} differs from generated narration timing`);
    }
    console.log(`[paul validate] ${slug}: ${duration.toFixed(2)}s H.264/AAC, poster, ${cues.length} timed cues`);
  } catch (error) {
    errors.push(`${slug}: ${error.message}`);
  }
}
if (errors.length) throw new Error(`Paul tutorial validation failed:\n- ${errors.join("\n- ")}`);
console.log(`[paul validate] ${episodes.length} episodes and all referenced assets verified`);
