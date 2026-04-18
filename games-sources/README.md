# Game Console Sources

Raw cartridge inputs for the in-app Game Console. Everything in this
directory is a **build input** — it is deliberately outside `public/` so
the ~1.5 MiB of source zips are not copied to `dist/public/` and shipped
to every browser.

## How it works

1. Drop a `.zip` for a new game in here.
2. Optionally add an entry to [`games-config.json`](./games-config.json)
   to give the cartridge a friendly title, description, or slug.
3. Run `npm run install-games`.

That script:

- Detects the type of each zip and preprocesses it into a cartridge at
  `public/games/installed/<slug>/`.
- Emits `public/games/installed/manifest.json`, which `server/routes/console.ts`
  serves from `/api/console/demo-cartridges`.

The Dockerfile's `npm run build` copies `public/games/installed/` (and the
vendored js-dos runtime in `public/games/_vendor/js-dos/`) into
`dist/public/games/`, so anything you see locally ships unchanged to
production.

## Supported cartridge types

| Type              | Detection                                             | Output                                                   |
|-------------------|-------------------------------------------------------|----------------------------------------------------------|
| `html5`           | `index.html` at the content root                      | Flat copy into `installed/<slug>/`                       |
| `vite-project`    | `package.json` that declares `vite` as a dep          | `npm install && npm run build` in a temp dir, `dist/` copied |
| `dos-game`        | one or more `.exe` files plus DOS data files          | `.jsdos` bundle + js-dos wrapper `index.html`            |
| `dos-installer`   | `INSTALL.EXE` + `.SHR` (Apogee shareware pattern)     | `.jsdos` bundle whose autoexec runs `INSTALL.EXE`        |

## games-config.json

Optional overrides keyed by zip filename:

```json
{
  "my-game.zip": {
    "slug": "my-game",
    "title": "My Game",
    "description": "A short description shown in the console library.",
    "thumbnailUri": "/games/installed/my-game/thumbnail.png"
  }
}
```

If the file is absent, titles are auto-generated from the zip filename and
slugs are auto-slugified.

## DOS installer caveat

js-dos (v8) runs a fresh DOSBox session on every page load, so shareware
installers like `keen1.zip` / `keen4.zip` re-run their `INSTALL.EXE` every
time the cartridge is opened. That's fine for a demo but means players
see the setup prompt each time they play. If you want seamless play,
pre-extract the `.SHR` with a real copy of the installer and re-zip the
plain game files — the script will then classify the result as a
`dos-game` instead.
