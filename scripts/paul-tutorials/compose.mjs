#!/usr/bin/env node
/** Align each recorded UI step to Paul's exact narration, then package media. */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const work = path.join(root, "output/paul-tutorials");
const target = path.join(root, "public/desktop/paul-tutorials");
const episodes = JSON.parse(await fs.readFile(path.join(here, "episodes.json"), "utf8"));
const slugIndex = process.argv.indexOf("--slug");
const selected = slugIndex < 0 ? null : process.argv[slugIndex + 1];
const catalog = selected ? episodes.filter((item) => item.slug === selected) : episodes;
if (!catalog.length) throw new Error(`Unknown Paul tutorial: ${selected}`);
await fs.mkdir(target, { recursive: true });

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
}

function probe(file) {
  return JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams",
    "-show_format", "-of", "json", file], { encoding: "utf8" }));
}

function timestamp(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}

async function compose(episode) {
  const slug = episode.slug;
  const recording = path.join(work, "recordings", `${slug}.webm`);
  const capture = JSON.parse(await fs.readFile(path.join(work, "recordings",
    `${slug}.capture.json`), "utf8"));
  const narration = path.join(work, "narration", `${slug}.wav`);
  const timing = JSON.parse(await fs.readFile(path.join(work, "narration",
    `${slug}.timings.json`), "utf8"));
  if (capture.stepDurationsMs.length !== timing.segments.length ||
      timing.segments.length !== episode.steps.length) {
    throw new Error(`${slug}: recording, narration, and visible steps disagree`);
  }
  const rawDuration = Number(probe(recording).format.duration);
  const actualDurations = capture.stepDurationsMs.map((ms) => ms / 1000);
  const measuredDuration = actualDurations.reduce((sum, value) => sum + value, 0);
  const startOffset = Math.max(0, rawDuration - measuredDuration);
  const segmentDir = path.join(work, "segments", slug);
  await fs.mkdir(segmentDir, { recursive: true });
  const segments = [];
  let actualOffset = startOffset;
  for (let index = 0; index < timing.segments.length; index += 1) {
    const cue = timing.segments[index];
    const nextStart = timing.segments[index + 1]?.startSeconds ?? timing.totalDurationSeconds;
    const wanted = nextStart - cue.startSeconds;
    const recorded = actualDurations[index];
    if (!(wanted > 0 && recorded > 0)) throw new Error(`${slug}: invalid segment ${index + 1}`);
    const output = path.join(segmentDir, `${String(index + 1).padStart(2, "0")}.mp4`);
    const stretch = wanted / recorded;
    run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
      "-ss", actualOffset.toFixed(3), "-t", recorded.toFixed(3), "-i", recording,
      "-ss", cue.startSeconds.toFixed(3), "-t", wanted.toFixed(3), "-i", narration,
      "-filter_complex", `[0:v]setpts=(PTS-STARTPTS)*${stretch.toFixed(8)},scale=1280:720:flags=lanczos,fps=30,format=yuv420p[v];[1:a]asetpts=PTS-STARTPTS[a]`,
      "-map", "[v]", "-map", "[a]", "-t", wanted.toFixed(3),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", output]);
    segments.push(output);
    actualOffset += recorded;
  }
  const concatFile = path.join(segmentDir, "concat.txt");
  await fs.writeFile(concatFile, segments.map((file) => `file '${file}'`).join("\n") + "\n");
  const mp4 = path.join(target, `${slug}.mp4`);
  run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0",
    "-i", concatFile, "-c", "copy", "-movflags", "+faststart", mp4]);
  const poster = path.join(target, `${slug}-poster.jpg`);
  const screenshot = path.join(work, "review", `${slug}-step-01.png`);
  run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", screenshot,
    "-frames:v", "1", "-q:v", "3", "-update", "1", poster]);
  const vtt = path.join(target, `${slug}.vtt`);
  await fs.writeFile(vtt, "WEBVTT\n\n" + timing.segments.map((segment) =>
    `${timestamp(segment.startSeconds)} --> ${timestamp(segment.endSeconds)}\n${segment.text}`
  ).join("\n\n") + "\n");
  const bytes = (await fs.stat(mp4)).size;
  const sha256 = createHash("sha256").update(await fs.readFile(mp4)).digest("hex");
  const durationSeconds = Number(probe(mp4).format.duration);
  console.log(`[paul compose] ${slug}: ${durationSeconds.toFixed(2)}s, ${bytes} bytes`);
  return {
    slug,
    title: episode.title,
    summary: episode.summary,
    category: episode.category,
    route: episode.route,
    steps: episode.steps,
    transcript: episode.spokenSteps.join(" "),
    durationSeconds,
    videoUrl: `/desktop/paul-tutorials/${slug}.mp4`,
    captionsUrl: `/desktop/paul-tutorials/${slug}.vtt`,
    posterUrl: `/desktop/paul-tutorials/${slug}-poster.jpg`,
    sha256,
  };
}

const built = [];
for (const episode of catalog) built.push(await compose(episode));
const manifest = path.join(target, "catalog.json");
const previous = selected && await fs.readFile(manifest, "utf8").then(JSON.parse).catch(() => []);
const bySlug = new Map([...(Array.isArray(previous) ? previous : []), ...built].map((item) => [item.slug, item]));
const ordered = episodes.map((item) => bySlug.get(item.slug)).filter(Boolean);
await fs.writeFile(manifest, JSON.stringify(ordered, null, 2) + "\n");
