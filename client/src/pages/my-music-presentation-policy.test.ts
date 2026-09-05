import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const myMusicSource = readFileSync(new URL("./MyMusic.tsx", import.meta.url), "utf8");

test("MyMusic exposes Gamma host markers for app-owned audio chrome", () => {
  assert.match(myMusicSource, /usePresentationShell/);
  assert.match(myMusicSource, /data-my-music-presentation-host=\{presentation\.host\}/);
  assert.match(myMusicSource, /\[data-my-music-presentation-host="gamma"\]/);
  assert.match(myMusicSource, /data-my-music-region="toolbar"/);
  assert.match(myMusicSource, /data-my-music-region="upload-button"/);
  assert.match(myMusicSource, /data-my-music-region="library-panel"/);
  assert.match(myMusicSource, /data-my-music-region="track-card"/);
  assert.match(myMusicSource, /data-my-music-region="audio-player"/);
  assert.match(myMusicSource, /\[data-my-music-presentation-host="gamma"\][\s\S]*?background-image:\s*none/);
  assert.match(myMusicSource, /\[data-my-music-presentation-host="gamma"\][\s\S]*?box-shadow:\s*none/);
  assert.match(myMusicSource, /\[data-my-music-presentation-host="gamma"\][\s\S]*?border-radius:\s*6px/);
  assert.match(myMusicSource, /#00d2ff/);
});

test("MyMusic keeps audio library behavior on shared media APIs", () => {
  assert.match(myMusicSource, /api\.get<MusicItem\[\]>\("\/api\/media\/mine\?category=audio"\)/);
  assert.match(myMusicSource, /api\.post\("\/api\/media\/upload", \{ \.\.\.body, mediaCategory: "audio" \}\)/);
  assert.match(myMusicSource, /file\.type\.startsWith\("audio\/"\)/);
  assert.doesNotMatch(myMusicSource, /presentationRouteHref/);
});

test("MyMusic routes IPFS audio through the shared artifact recovery cache", () => {
  assert.match(myMusicSource, /resolveArtifactUri/);
  assert.match(myMusicSource, /resolvedAudio\?\.src/);
});
