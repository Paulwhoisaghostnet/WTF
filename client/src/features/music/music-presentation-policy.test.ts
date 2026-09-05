import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const musicPlayerSource = readFileSync(new URL("./MusicPlayer.tsx", import.meta.url), "utf8");
const nowPlayingSource = readFileSync(new URL("./MusicNowPlaying.tsx", import.meta.url), "utf8");
const playlistSource = readFileSync(new URL("./MusicPlaylist.tsx", import.meta.url), "utf8");
const tezampSource = readFileSync(new URL("../../pages/Tezamp.tsx", import.meta.url), "utf8");
const musicNftsSource = readFileSync(new URL("./useMusicNfts.ts", import.meta.url), "utf8");
const musicApiSource = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
const musicPlayerHookSource = readFileSync(new URL("./useMusicPlayer.ts", import.meta.url), "utf8");

test("TezosBeats exposes Gamma host markers for app-owned player chrome", () => {
  assert.match(musicPlayerSource, /usePresentationShell/);
  assert.match(musicPlayerSource, /data-music-surface="tezosbeats"/);
  assert.match(musicPlayerSource, /data-music-presentation-host=\{presentation\.host\}/);
  assert.match(musicPlayerSource, /\[data-music-presentation-host="gamma"\]/);
  assert.match(musicPlayerSource, /data-music-region="deck-panel"/);
  assert.match(musicPlayerSource, /data-music-region="queue-panel"/);
  assert.match(musicPlayerSource, /data-music-region="track-row"/);
  assert.match(nowPlayingSource, /data-music-region="now-playing"/);
  assert.match(nowPlayingSource, /data-music-region="visualizer"/);
  assert.match(playlistSource, /data-music-region="playlist-panel"/);
  assert.match(musicPlayerSource, /#00d2ff/);
  assert.match(nowPlayingSource, /#00d2ff/);
});

test("legacy Tezamp route exposes Gamma host markers without changing queue behavior", () => {
  assert.match(tezampSource, /usePresentationShell/);
  assert.match(tezampSource, /data-tezamp-surface="player"/);
  assert.match(tezampSource, /data-tezamp-presentation-host=\{presentation\.host\}/);
  assert.match(tezampSource, /\[data-tezamp-presentation-host="gamma"\]/);
  assert.match(tezampSource, /data-tezamp-region="deck"/);
  assert.match(tezampSource, /data-tezamp-region="visualizer"/);
  assert.match(tezampSource, /data-tezamp-region="queue-panel"/);
  assert.match(tezampSource, /data-tezamp-region="queue-button"/);
  assert.match(tezampSource, /api\.get<MusicItem\[\]>\("\/api\/media\/mine\?category=audio"\)/);
  assert.match(tezampSource, /wm\.openPage\("\/my-music"\)/);
  assert.match(tezampSource, /resolveArtifactUri/);
  assert.match(tezampSource, /resolvedAudio\?\.src/);
});

test("TezosBeats shared data and playlist APIs stay raw", () => {
  assert.match(musicNftsSource, /fetch\(\s*url\s*\)/);
  assert.match(musicNftsSource, /api\.get<\{ id: number; title: string; sourceUrl: string; playbackUrl\?: string \| null; mimeType: string \}\[\]>\(\s*"\/api\/media\/mine\?category=audio"\s*\)/);
  assert.match(musicApiSource, /api\.get<MusicPlaylist\[\]>\("\/api\/music\/playlists"\)/);
  assert.match(musicApiSource, /api\.post<MusicPlaylist>\("\/api\/music\/playlists", body\)/);
  assert.match(musicApiSource, /api\.get<MusicNowPlaying \| null>\("\/api\/music\/now-playing"\)/);
  assert.match(musicApiSource, /api\.put<MusicNowPlaying>\("\/api\/music\/now-playing", body\)/);
  assert.doesNotMatch(musicPlayerSource, /api\.get|api\.post|fetch\(/);
  assert.doesNotMatch(nowPlayingSource, /api\.get|api\.post|fetch\(/);
});

test("TezosBeats resolves IPFS audio through the artifact recovery cache", () => {
  assert.match(musicPlayerHookSource, /resolveArtifactUri/);
  assert.match(musicPlayerHookSource, /resolvedAudio\?\.src/);
});
