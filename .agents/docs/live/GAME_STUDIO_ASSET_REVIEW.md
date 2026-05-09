# Game Studio Asset Review

Date: 2026-05-09

## Current SDK Asset Surface

- Game Studio already exposes templates, stock asset descriptors, snippets, raw asset files, project local uploads, and ZIP packaging.
- Before this pass, the stock library was mostly generated placeholders: SVG visual blocks, silent WAV files, text font placeholders, and shader text.
- The packaging path is strong enough for real files: selected stock assets are copied into `assets/stock/`, local uploads go into `assets/uploads/`, and builds include `assets/manifest.json` plus `wtf-game.json`.

## Imported And Checked

Imported through `scripts/import-game-studio-open-assets.mjs`, not by hand.

| Source | License check | Imported files | SDK fit |
| --- | --- | ---: | --- |
| Kenney Pixel Platformer | Official page and ZIP `License.txt` confirm CC0-1.0. | 10 PNGs | 18x18 tiles, character sprites, platform tiles, and background tiles. |
| Kenney Mobile Controls | Official page and ZIP `License.txt` confirm CC0-1.0. | 10 PNGs | HUD icons, D-pad, joystick, and action button UI pieces. |

Importer checks:

- Downloads from pinned official Kenney URLs.
- Confirms the ZIP license text contains CC0 / Creative Commons Zero.
- Confirms every selected file exists in the ZIP.
- Confirms every selected file has a PNG signature.
- Enforces a 2MB per-stock-asset cap.
- Writes `SOURCE.json` manifests with ZIP SHA-256 and per-file SHA-256.

## Researched But Not Bundled Yet

- 0x72 DungeonTileset II: strong candidate for roguelike/dungeon templates; official itch page lists asset license as CC0 and says no generative AI was used. Bundle next after adding a 16x16 tile metadata preset.
- Screaming Brain Studios: strong candidate for isometric/background/texture packs; official site says every pack is CC0/public domain. Needs curation because packs are large.
- Game-icons.net: useful for RPG/action iconography, but it is CC BY 3.0, so it needs attribution plumbing before bundling.
- OpenGameArt CC0 collections: useful discovery pool, but collections still need per-asset license and attribution checks because OpenGameArt warns credits must be reviewed.

## Avatar-To-Game Standard

Non-AI conversion is feasible for broad game use, with limits:

- Good: normalize a user upload or NFT/PFP image into a square PNG, billboard sprite, HUD portrait, token, card art, enemy face, or simple four-frame pseudo-spritesheet.
- Good: accept creator-provided sprite sheets and frame metadata for real animation.
- Limited: no non-AI pipeline can reliably infer side/back views, limbs, clean background removal, or Doom-style directional sprites from a single flat image.
- Rule: the SDK should expose deterministic standards and let games choose how to use them, rather than pretending to semantically redraw art.

Implemented SDK standards:

- `wtf-avatar-square-v1`: square PNG generated in-browser from the signed-in player's profile avatar.
- `wtf-avatar-spritesheet-v1`: four-frame billboard sheet using the same avatar image with deterministic transforms.
