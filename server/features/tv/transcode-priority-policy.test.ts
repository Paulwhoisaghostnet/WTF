import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const transcodeSource = readFileSync("server/features/tv/transcode.ts", "utf8");

test("TV transcode sweep yields CPU to latency-sensitive workloads", () => {
  assert.match(transcodeSource, /spawn\("nice", \["-n", "19", "ffmpeg", \.\.\.args\]/);
  assert.match(transcodeSource, /"-threads", "2"/);
});
