import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./tv-embed.ts", import.meta.url), "utf8");
const interactiveScript = source.slice(source.indexOf("<script>"), source.indexOf("</script>"));
const executableScript = interactiveScript
  .replace(/^<script>\s*/, "")
  .replace(/\$\{JSON\.stringify\(streamUrl\)\}/g, JSON.stringify("https://wtfos.app/api/tv/channels/7/stream"));

test("public TV embeds follow the server broadcast cursor at every boundary", () => {
  assert.doesNotThrow(() => new Function(executableScript));
  assert.match(interactiveScript, /item:\s*data\.current \|\| queue\[0\] \|\| null/);
  assert.match(interactiveScript, /pendingVideoOffsetSeconds = Math\.max\(0, Number\(item\.offsetSeconds\) \|\| 0\)/);
  assert.match(interactiveScript, /player\.currentTime = Math\.min\(desiredOffset/);
  assert.match(interactiveScript, /player\.addEventListener\("ended", syncToBroadcast\)/);
  assert.match(interactiveScript, /gif\._timer = setTimeout\(syncToBroadcast, remainingItemMs\(item\)\)/);
  assert.doesNotMatch(interactiveScript, /var cursor\s*=/);
  assert.doesNotMatch(interactiveScript, /function advance\s*\(/);
});

test("public TV embeds never leave hidden video audio playing beneath image media", () => {
  assert.match(
    interactiveScript,
    /if \(item\.kind === "gif"[\s\S]*player\.pause\(\);[\s\S]*player\.removeAttribute\("src"\);[\s\S]*gif\.src = src/
  );
  assert.equal((source.match(/<video id="player"/g) ?? []).length, 1);
  assert.doesNotMatch(source, /<audio\b/);
});
