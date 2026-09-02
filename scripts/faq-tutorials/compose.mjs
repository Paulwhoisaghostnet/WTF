#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const root = process.cwd();
const catalogPath = path.join(root, "shared/faq-tutorials.json");
const allTutorials = JSON.parse(await fs.readFile(catalogPath, "utf8"));
const catalog = process.env.FAQ_TUTORIAL_SLUG
  ? allTutorials.filter((tutorial) => tutorial.slug === process.env.FAQ_TUTORIAL_SLUG)
  : allTutorials;
if (!catalog.length) throw new Error(`Unknown FAQ tutorial slug: ${process.env.FAQ_TUTORIAL_SLUG}`);
const base = path.join(root, "output/faq-tutorials");
const finalDir = path.join(base, "final");
await fs.mkdir(finalDir, { recursive: true });

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}

async function duration(file) {
  return new Promise((resolve, reject) => {
    let output = "";
    const child = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve(Number(output.trim())) : reject(new Error(`ffprobe exited ${code}`)));
  });
}

function timestamp(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const tail = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(tail).padStart(3, "0")}`;
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
  const buffer = await fs.readFile(file);
  return createHash("sha256").update(buffer).digest("hex");
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
  tutorials: [],
};

for (const tutorial of catalog) {
  const raw = path.join(base, "recordings", `${tutorial.slug}.webm`);
  const narration = path.join(base, "narration", `${tutorial.slug}.wav`);
  const timingPath = path.join(base, "narration", `${tutorial.slug}.timings.json`);
  const mp4 = path.join(finalDir, `${tutorial.slug}.mp4`);
  const vtt = path.join(finalDir, `${tutorial.slug}.vtt`);
  const poster = path.join(finalDir, `${tutorial.slug}.jpg`);
  const audioDuration = await duration(narration);
  const recordingDuration = await duration(raw);
  const usefulRecordingDuration = Math.min(recordingDuration, audioDuration + 0.5);
  const recordingOffset = Math.max(0, recordingDuration - usefulRecordingDuration);
  const stretch = audioDuration / usefulRecordingDuration;
  await run("ffmpeg", ["-y", "-ss", recordingOffset.toFixed(3), "-i", raw, "-i", narration, "-map", "0:v:0", "-map", "1:a:0", "-t", String(audioDuration), "-vf", `setpts=${stretch.toFixed(8)}*PTS,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black`, "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", mp4]);
  const timing = JSON.parse(await fs.readFile(timingPath, "utf8"));
  await fs.writeFile(
    vtt,
    Array.isArray(timing.segments) ? makeTimedVtt(timing.segments) : makeVtt(tutorial.narration, audioDuration),
    "utf8"
  );
  await run("ffmpeg", ["-y", "-ss", String(Math.min(2, Math.max(0, audioDuration / 4))), "-i", mp4, "-frames:v", "1", "-update", "1", "-q:v", "2", poster]);
  const stat = await fs.stat(mp4);
  manifest.tutorials.push({ slug: tutorial.slug, durationSeconds: Math.round(audioDuration), bytes: stat.size, sha256: await sha256(mp4) });
  console.log(`[compose] ${tutorial.slug} -> ${mp4}`);
}

await fs.writeFile(path.join(finalDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
