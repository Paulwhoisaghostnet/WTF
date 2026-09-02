#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const root = process.cwd();
const allPromos = JSON.parse(await fs.readFile(path.join(root, "shared/wtfos-promos.json"), "utf8"));
const selectedSlug = process.argv.find((value) => value.startsWith("--slug="))?.slice(7);
const promos = selectedSlug ? allPromos.filter((promo) => promo.slug === selectedSlug) : allPromos;
if (!promos.length) throw new Error(`Unknown wtfOS promo slug: ${selectedSlug}`);

const base = path.join(root, "output/wtfos-promos");
const finalDir = path.join(base, "final");
await fs.mkdir(finalDir, { recursive: true });

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}

function duration(file) {
  return new Promise((resolve, reject) => {
    let output = "";
    const child = spawn("ffprobe", [
      "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file,
    ]);
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => code === 0
      ? resolve(Number(output.trim()))
      : reject(new Error(`ffprobe exited ${code}`)));
  });
}

function timestamp(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}

function makeVtt(text, totalDuration) {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((part) => part.trim()).filter(Boolean) || [text];
  const weights = sentences.map((sentence) => Math.max(1, sentence.split(/\s+/).length));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  let cursor = 0;
  const cues = sentences.map((sentence, index) => {
    const start = cursor;
    cursor += (totalDuration * weights[index]) / totalWeight;
    const end = index === sentences.length - 1 ? totalDuration : cursor;
    return `${index + 1}\n${timestamp(start)} --> ${timestamp(end)}\n${sentence}\n`;
  });
  return `WEBVTT\n\n${cues.join("\n")}`;
}

function makeTimedVtt(segments) {
  const cues = segments.map((segment, index) =>
    `${index + 1}\n${timestamp(segment.startSeconds)} --> ${timestamp(segment.endSeconds)}\n${segment.text}\n`
  );
  return `WEBVTT\n\n${cues.join("\n")}`;
}

async function sha256(file) {
  return createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

const manifest = {
  generatedAt: new Date().toISOString(),
  accountName: "TommyTezos",
  narration: {
    model: "hexgrad/Kokoro-82M",
    package: "kokoro==0.9.4",
    voice: "am_puck",
    persona: "Tommy",
    aiGenerated: true,
  },
  recorder: "Playwright Chromium",
  encoder: "FFmpeg H.264/AAC, 1280x720, yuv420p",
  promos: [],
};

for (const promo of promos) {
  const raw = path.join(base, "recordings", `${promo.slug}.webm`);
  const narration = path.join(base, "narration", `${promo.slug}.wav`);
  const timingPath = path.join(base, "narration", `${promo.slug}.timings.json`);
  const mp4 = path.join(finalDir, `${promo.slug}.mp4`);
  const vtt = path.join(finalDir, `${promo.slug}.vtt`);
  const poster = path.join(finalDir, `${promo.slug}.jpg`);
  const audioDuration = await duration(narration);
  const recordingDuration = await duration(raw);
  const stretch = audioDuration / recordingDuration;

  await run("ffmpeg", [
    "-y", "-i", raw, "-i", narration,
    "-map", "0:v:0", "-map", "1:a:0", "-t", String(audioDuration),
    "-vf", `setpts=${stretch.toFixed(8)}*PTS,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black`,
    "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", mp4,
  ]);
  const timing = JSON.parse(await fs.readFile(timingPath, "utf8"));
  await fs.writeFile(
    vtt,
    Array.isArray(timing.segments) ? makeTimedVtt(timing.segments) : makeVtt(promo.narration, audioDuration),
    "utf8"
  );
  await run("ffmpeg", [
    "-y", "-ss", String(Math.min(2, Math.max(0, audioDuration / 4))), "-i", mp4,
    "-frames:v", "1", "-update", "1", "-q:v", "2", poster,
  ]);
  const stat = await fs.stat(mp4);
  manifest.promos.push({
    slug: promo.slug,
    durationSeconds: Math.round(audioDuration),
    bytes: stat.size,
    sha256: await sha256(mp4),
  });
  console.log(`[promo compose] ${promo.slug} -> ${mp4}`);
}

await fs.writeFile(
  path.join(finalDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8"
);
