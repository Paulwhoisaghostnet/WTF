import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const caddyfile = readFileSync(new URL("../Caddyfile", import.meta.url), "utf8");

assert.match(
  caddyfile,
  /www\.wtfos\.app\s*\{\s*redir https:\/\/wtfos\.app\{uri\} permanent\s*\}/s,
  "Caddyfile must redirect www.wtfos.app to the canonical wtfos.app origin",
);

assert.match(
  caddyfile,
  /wtfos\.app,\s*wtfgameshow\.app,\s*new\.wtfgameshow\.app,\s*dues\.wtfgameshow\.app\s*\{/,
  "Caddyfile must serve the canonical wtfos.app host alongside the legacy wtfgameshow aliases",
);
