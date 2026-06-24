import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const caddyfile = readFileSync(new URL("../Caddyfile", import.meta.url), "utf8");

assert.match(
  caddyfile,
  /www\.wtfos\.app,\s*wtfgameshow\.app,\s*www\.wtfgameshow\.app,\s*new\.wtfgameshow\.app\s*\{\s*redir https:\/\/wtfos\.app\{uri\} permanent\s*\}/s,
  "Caddyfile must redirect canonical www and legacy platform aliases to the canonical wtfos.app origin",
);

assert.match(
  caddyfile,
  /wtfos\.app,\s*skywire\.wtfos\.app,\s*beta\.wtfos\.app,\s*dues\.wtfgameshow\.app\s*\{/,
  "Caddyfile must serve the canonical wtfos.app host plus Skywire and beta product subdomains without the legacy wtfgameshow platform aliases",
);

assert.match(
  caddyfile,
  /upload\.wtfos\.app,\s*upload\.5-78-202-50\.sslip\.io\s*\{[\s\S]*handle \/api\/macaroni\/ipfs\/upload\s*\{[\s\S]*reverse_proxy app:3000[\s\S]*handle\s*\{\s*respond 404\s*\}[\s\S]*\}/,
  "upload.wtfos.app must proxy only the ticket-authenticated Macaroni upload endpoint",
);

const servedBlockHeaders = [...caddyfile.matchAll(/^([^{\n]+)\{\s*\n\s*encode/gm)].map((match) =>
  match[1].trim()
);
for (const header of servedBlockHeaders) {
  assert.doesNotMatch(
    header,
    /(^|,\s*)(wtfgameshow\.app|www\.wtfgameshow\.app|new\.wtfgameshow\.app)(\s*,|$)/,
    "wtfgameshow.app must not be served as a peer platform frontend",
  );
}
