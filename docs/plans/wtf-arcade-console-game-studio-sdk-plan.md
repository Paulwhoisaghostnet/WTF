# WTF Arcade, WTF Console, And WTF Game Studio SDK Plan

Last updated: 2026-05-08

## Product Split

WTF Arcade is the public paid-play surface. Compatible-source games, creator submissions, Game Studio submissions, installed public cartridges, leaderboards, reports, moderation, and play-fee sessions belong here.

WTF Console is a personal owned-media surface. Every user gets stock console titles: Adrift, Commander Keen, Pixel Runner, Space Blocks, Inverse Snake, Backwards Pong, and future stock console-specific cartridges. User-owned game media and imported token cartridges live here. Public imported or creator-submitted games do not.

WTF Game Studio SDK is the creator app for building games that can be submitted to WTF Arcade or exported/imported as owned Console media. It owns templates, stock assets, uploaded assets, source snapshots, packaging, validation, and SDK docs.

## Implemented Slices

- `server/features/console/surfaces.ts` classifies stock Console games versus Arcade games and exposes SQL helpers so catalog, discovery, scoring, stats, audit, and admin paths stay filtered.
- `server/features/arcade/*` owns Arcade catalog, play-ticket payment config, play sessions, score submission, and creator submission aliases.
- `/api/arcade/*` is the public game API: catalog, discovery, stats, play fee, payment intents, sessions, scores, leaderboards, reports, creator submissions, admin moderation, compatible-source checks, and audit.
- `/api/console/*` is stock/owned only. Legacy public-game mutation routes now point callers to Arcade instead of creating public Console inventory.
- Compatible-source game embed paths are served from `/api/arcade/source/*`; old source routes redirect only as compatibility shims.
- Existing compatible-source public slugs migrate from legacy upstream-prefixed ids to WTF-owned `arcade-*` ids in `drizzle/0063_arcade_source_slug_rebrand.sql`.
- The in-app marketplace has an `arcade` category and an `arcade-play-ticket` SKU wired to the cart-router contract path.
- The WTF IAM UI can open `?category=arcade`, add live Arcade tickets, create payment intents, perform WTF checkout, and verify purchases.
- The WTF Arcade runtime shows a first-class play-ticket gate before launching a game when the user is signed out or lacks an Arcade ticket.
- Signed-in WTF Arcade users can read current ticket/bypass status through browser API and MCP before launching a game.
- Trusted creator permissions are split by domain: `trusted_arcade_creator`, `trusted_console_creator`, `trusted_tv_creator`, and `trusted_market_creator`.
- Admin Arcade now has a health panel for play-ticket config, compatible-source freshness, source game count, live game count, and ticketed plays.
- The twice-daily compatible-source worker writes an Arcade audit health event even when a scan finds no new or changed games.
- Game Studio targets now describe Arcade publish versus Console owned-media/export workflows, and project submission posts to Arcade review/trusted creator lanes.
- MCP exposes Arcade read/write tools, play-fee/play-status/payment-intent tools, admin compatible-source controls, Arcade audit, Console stock-library tools, Game Studio target/build/submit tools, and trusted creator store item tooling.

## Modular Boundaries

```text
server/features/arcade/
  catalog       public Arcade catalog and creator-submitted Arcade games
  payment       play-ticket SKU, fee config, contract intent, ticket consumption
  sessions      paid/bypassed play sessions and Arcade score submission
  source-import twice-daily compatible-source ingestion and health audit
  types         Arcade DTO contracts

server/features/console/
  catalog       stock Console games and user-owned media cartridges
  surfaces      Console-vs-Arcade classification and SQL filters
  scoring       shared score/ticket engine with explicit surface gating
  discovery     shelf read-models with explicit surface gating
  moderation    shared report/audit persistence used by Arcade routes
  bundle-storage validated runtime bundle extraction and SDK injection

server/features/game-studio/
  catalog       templates, stock assets, snippets, target definitions
  projects      saved drafts, build snapshots, Arcade submission handoff
  packaging     ZIP creation aligned with runtime validator

server/features/in-app-market/
  creator-items trusted creator store-item lane
  routes        live category/catalog, cart intents, EXP checkout, WTF verify
```

## Remaining Product Hardening

- Split legacy internal compatibility adapter names during a future low-risk refactor, keeping upstream attribution only in provenance metadata and source URLs.
- Add browser screenshot coverage for `/arcade`, `/console`, `/game-studio`, and `/wtfiam?category=arcade`.
