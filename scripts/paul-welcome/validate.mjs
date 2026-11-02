#!/usr/bin/env node
/** Check the welcome video's generated narration, captions, and served media. */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const work = path.join(root, "output/paul-welcome");
const served = path.join(root, "public/desktop");
const scenes = JSON.parse(await readFile(path.join(here, "storyboard.json"), "utf8"));
const timings = JSON.parse(await readFile(path.join(work, "narration/timings.json"), "utf8"));
const mp4 = path.join(served, "paulwhoisaclippy-welcome.mp4");
const poster = path.join(served, "paulwhoisaclippy-welcome-poster.png");
const vtt = await readFile(path.join(served, "paulwhoisaclippy-welcome.vtt"), "utf8");
const probe = (file) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams",
  "-show_format", "-of", "json", file], { encoding: "utf8" }));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const cueTime = (value) => {
  const match = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/.exec(value);
  assert(match, `Invalid cue time: ${value}`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
};
const rounded = (value) => Math.round(value * 1000) / 1000;

assert(vtt.startsWith("WEBVTT\n\n"), "Missing WebVTT header");
const cues = vtt.slice(8).trim().split(/\n\s*\n/).filter(Boolean).map((block) => {
  const [range, ...lines] = block.split("\n");
  const match = /^(\S+) --> (\S+)$/.exec(range);
  assert(match, `Invalid cue range: ${range}`);
  return { start: cueTime(match[1]), end: cueTime(match[2]), text: lines.join("\n") };
});
assert(timings.length === scenes.length, "Narration scene count differs from storyboard");
assert(cues.length === scenes.flatMap((scene) => scene.spoken).length,
  "Caption count differs from spoken lines");
const videoInfo = probe(mp4);
const video = videoInfo.streams.find((stream) => stream.codec_type === "video");
const audio = videoInfo.streams.find((stream) => stream.codec_type === "audio");
const duration = Number(videoInfo.format.duration);
assert(video?.codec_name === "h264" && video.width === 1280 && video.height === 720,
  "Welcome video must be 1280×720 H.264");
assert(audio?.codec_name === "aac" && Number.isFinite(duration) && duration > 0,
  "Welcome video needs AAC narration and a valid duration");
const volume = spawnSync("ffmpeg", ["-v", "info", "-i", mp4, "-vn", "-af", "volumedetect",
  "-f", "null", "-"], { encoding: "utf8" });
assert(volume.status === 0 && /max_volume:\s*-?[\d.]+ dB/.test(volume.stderr ?? ""),
  "Welcome narration could not be decoded");
const posterInfo = probe(poster).streams.find((stream) => stream.codec_type === "video");
assert(posterInfo?.codec_name === "png" && posterInfo.width === 1280 && posterInfo.height === 720,
  "Welcome poster must be a decodable 1280×720 PNG");

let cueIndex = 0;
let offset = 0;
let previousEnd = 0;
for (const [index, scene] of scenes.entries()) {
  const timing = timings[index];
  assert(timing.id === scene.id && timing.captions.length === scene.spoken.length,
    `${scene.id}: narration differs from storyboard`);
  for (const [lineIndex, line] of scene.spoken.entries()) {
    const cue = cues[cueIndex++];
    const spoken = timing.captions[lineIndex];
    assert(cue.text === line && spoken.text === line, `${scene.id}: caption text differs from narration`);
    assert(cue.start >= previousEnd && cue.end > cue.start && cue.end <= duration,
      `${scene.id}: caption is outside video duration`);
    if (existsSync(path.join(work, `${scene.id}.mp4`))) {
      assert(cue.start === rounded(offset + spoken.startSeconds) &&
        cue.end === rounded(offset + spoken.endSeconds),
      `${scene.id}: caption time differs from generated narration`);
    }
    previousEnd = cue.end;
  }
  if (existsSync(path.join(work, `${scene.id}.mp4`))) {
    offset += Number(probe(path.join(work, `${scene.id}.mp4`)).format.duration);
  }
}
console.log(`[paul welcome validate] ${duration.toFixed(2)}s H.264/AAC, 1280×720 poster, ${cues.length} exact timed cues`);
