# Paul walkthrough video pipeline

`episodes.json` is the single source for each route, visible step, spoken step, and catalog description. `record.mjs` drives the real wtfOS UI through the isolated Playwright inventory harness with a guide Paul, cursor, and target outline. The local Kokoro narrator supplies one audio segment per visible step. `compose.mjs` aligns each recorded step to its spoken segment and writes H.264/AAC MP4, WebVTT captions, a poster, and `public/desktop/paul-tutorials/catalog.json`.

Rebuild the full series:

```sh
node scripts/paul-tutorials/build.mjs
node scripts/paul-tutorials/validate.mjs
```

After changing one episode, use `--slug SLUG`. `--reuse-narration`, `--reuse-recording`, and `--skip-site-build` skip completed phases while iterating. Use `--offline` only after the Kokoro dependencies and model have been cached. The first online run installs local Kokoro dependencies if they are missing. Rendering requires `ffmpeg`, `ffprobe`, Playwright Chromium, and the repository's npm dependencies. Temporary recordings, WAV files, and review screenshots are under `output/paul-tutorials`; only the finished catalog and media are served to players. `validate.mjs` also works from a clean checkout without those temporary files.

The Arcade cartridge, Calendar event, and clearly labeled Shop accessory are deterministic harness fixtures so those screens have concrete content when local test data is sparse. The desktop lesson uses a sample available profile quest so Reggie can show his next quest step and route; a player's actual quest depends on their progress. The Side Quest fixture updates its claimed card and reward account after the harness accepts Claim, mirroring the real player result. No purchase or real message is sent; the Inbox recipient is a synthetic harness user. Live listings, prices, event dates, and app access can differ by account.
