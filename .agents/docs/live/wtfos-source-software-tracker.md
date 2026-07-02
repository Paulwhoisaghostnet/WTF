# wtfOS Source Software Tracker

Last audited: 2026-06-30
Owner surface: Skywire, tz2at, AT Protocol spine, Tezos social/market bridges

## Maintenance Rule

Any pass that imports behavior, UI patterns, protocol contracts, docs, vendored code, browser-extension behavior, or source-derived assumptions into wtfOS must update this file in the same pass.

For each source, record:

- Original source date: the date wtfOS first used that source or source family.
- Current source marker: release, commit, deployed asset hash, package hash, or HTTP last-modified value.
- Update log: source changes found since original adoption.
- wtfOS adoption state: adopted, partially adopted, watched, blocked, or intentionally not adopted.
- Verification pointer: local tests, inventory rows, docs, or live probes that prove the claim.

## Source Ledger

| Source | wtfOS Surface | Original Source Date | Current Source Marker | Current Status |
| --- | --- | --- | --- | --- |
| Bluesky social app (`bluesky-social/social-app`) | Skywire Bluesky client parity | 2026-05-24, `a7766592` "Make Skywire a usable Bluesky timeline client" | Release `1.126.0`, published 2026-06-29, tag commit `bd2849d9257f57cc6edcbef18fbd5749e8d1844e`; release API payload sha256 `d0a44699101862ac021878f8e0a494a753ec29734fcaca727f22ea4e6dfef81e` | Partially adopted |
| AT Protocol TypeScript SDK and lexicons | Skywire OAuth, feeds, chat, status, repo writes | 2026-05-24, Skywire AT Protocol MVP and permission tiers | Local lock: `@atproto/api 0.20.4`, `@atproto/oauth-client-node 0.4.0`; upstream `@atproto/api 0.20.23`, atproto main `79f29409c0dd7d1ab4029095bb3c5ff69183f85d` on 2026-06-30 | Watched |
| Ovoid (`ovoid.at`) | Standalone Skywire entry, Tezos-aware profile/vault cues | 2026-06-19, `b73c39dd` "feat: add standalone Skywire UX shell"; live board item `WTF-BB-293` | HTTP last-modified `Mon, 29 Jun 2026 21:38:37 GMT`; deployed HTML sha256 `fd3811eeb2f226d90884cdd15f920ab8b0c713eb9b1027ea91774fa243c10b57`; deployed assets: `index-DzixHk5a.js` sha256 `01784dee562b8866531576854c422f2aa905070668e4c83abec9fa5f014a4d80`, `ProfileScreen-0e3En4rX.js` sha256 `e28bd467293b516683390a814a2f8faf1a919f29e06759e9ea39b04913e8f61a` | Partially adopted |
| Cloudnine browser extension by FAFO-lab | Inline Tezos NFT buy/mint behavior inside AT clients | Related Skywire token-link/direct-buy work began 2026-06-03 and 2026-06-04; explicit Cloudnine source backfill started 2026-06-30 | AMO version `1.0.1`, created 2026-06-13, updated 2026-06-16, XPI file `4849040`, sha256 `63cff743b56904f0d533a33936a1f3b7f4d7e7dbc4a46a434b002b48d8baf9fb`; AMO API payload sha256 `ac0f4b061f6de69c4905d868abc9abbbb42437187962ab3eb1f0d14ea5b75e12` | Partially adopted |
| tz2at implementation and service family | `/tz2at`, Rat Race, Skywire Tezos identity/market context | 2026-05-26, `effc531f` "Add WTFOS tz2at spine and Rat Race channel"; expanded 2026-05-28 analytics and 2026-06-06 replay scan | Direct `https://tz2at.store/` returned HTTP 502 during this audit; prior tracked repo DID `did:plc:v7jpd5s2kmpcbp5aqe6ukym7`; local source: `server/features/tz2at/*`, `server/features/rat-race/tz2at-atproto.ts` | Adopted with availability watch |
| Tezos wallet/indexer libraries | Skywire direct buy, vault, Tezos identity | 2026-05-24 onward; Tezos provider audit completed 2026-06-29 | Local lock: `@taquito/taquito 25.0.0`, `@taquito/beacon-wallet 25.0.0`; project RPC defaults follow AGENTS.md Shadownet/Mainnet rules | Adopted |
| wtfOS dependency lock | All app/runtime dependencies | Continuous | `package-lock.json` sha256 `46297159dfa92b89607aae76d23e1512666130eaa1a6275ff71f8bf44462210f`; `package.json` sha256 `1a54e093495d3c1b64fce6441cb1a9aa97d3471c2b0b23c7365d2ac4bc9ce215` | Watched |

## Update Log By Source

### Bluesky Social App

Original adoption baseline:

- 2026-05-24 Skywire became a usable Bluesky client with OAuth, feeds, actor pivots, discovery, Tezos feed quality, and permission tiers.
- 2026-06-17 to 2026-06-18 Skywire adopted live-status writes (`app.bsky.actor.status/self`), group chat creation, Signals presets, and vault read-model improvements.
- 2026-06-30 Skywire hid the user-facing Signals tab/starter UI again for a sleeker UX while retaining the internal signal collection/API path for future use.

Updates found on 2026-06-30:

- Current release is `1.126.0`, published 2026-06-29.
- Recent Bluesky client releases added "What's Hot" and trending-topic surfaces using `app.bsky.unspecced.getTrendingTopics`.
- Bluesky release notes also show account-status/profile-status work, compact comment rendering, website card improvements for video/audio/social/profile/feed/post URLs, saved media organization, livestream status/app badge work, and starter-pack/profile-stat refinements.

wtfOS adoption:

- Adopted in this pass: Skywire `Hot` tab and `/api/skywire/trending-topics`, backed by `app.bsky.unspecced.getTrendingTopics`, personalized with viewer DID when a restored OAuth session exists.
- Already adopted before this pass: live status, group chat, profile updates, post/reply/quote, search, token previews, chat add-on, and notification reads.
- Watched: compact comments and website card parity should be revisited when Skywire's thread/detail UI is next touched.

Verification:

- `server/features/atproto/skywire-policy.test.ts`
- `tests/playwright/inventory/skywire-feed.spec.mjs`, test "hot topics render Bluesky trends and open a search-backed feed"
- `tests/e2e/inventory/domain-workflows.mjs` API probe `/api/skywire/trending-topics?limit=5`
- `tests/e2e/inventory/behavior-assertions.mjs` id `skywire.trending-topics-hot-lane`

### Ovoid

Original adoption baseline:

- 2026-06-19 Skywire adopted the public standalone AT login surface inspired by Ovoid's focused entry flow.

Updates found on 2026-06-30:

- Ovoid's deployed shell was last modified 2026-06-29 and is a PWA with standalone display metadata.
- Deployed bundle strings confirm current Tezos profile/vault features: `tzbsky.com/api/lookup/address/tezos`, `tzbsky.com/api/lookup/did`, Objkt GraphQL `https://data.objkt.com/v3/graphql`, Tezos Commons list link, wallet balance/activity/tokens/NFTs, `nfts-owned`, `nfts-created`, wallet visibility fields, app badge hooks, and chat-status notification hooks.

wtfOS adoption:

- Already adopted: standalone Skywire login; Tezos vault owned/created split; Objkt created-token lookup; Tezos identity bridge hints.
- Partially adopted: Skywire has vault facts and share drafts, but not Ovoid-style wallet visibility controls or a persistent profile-side wallet rail.
- Watched: add explicit wallet visibility fields only if Skywire begins publishing wallet/profile display preferences to AT records.

Verification:

- `tests/playwright/inventory/skywire-feed.spec.mjs`, standalone login and vault tests.
- `WTF-BB-293` records the standalone OVOID UX pass.

### Cloudnine

Original adoption baseline:

- Skywire token-link parsing and buy overlays landed 2026-06-03 to 2026-06-04 before this tracker existed.
- Cloudnine was backfilled as an explicit source on 2026-06-30.

Updates found on 2026-06-30:

- AMO current version is `1.0.1`.
- Manifest confirms host permissions for `https://bsky.app/*`, `https://ovoid.at/*`, `https://*.ovoid.at/*`, Objkt GraphQL, TzKT API, and Fileship IPFS artwork.
- Extension behavior includes inline Buy/Mint buttons for Teia and objkt links, Teia swaps, objkt secondary listings, objkt open-edition mints, HEN-token cheapest active listing resolution, Beacon wallet support, purchase history in browser local storage, and one-click Bluesky collect sharing.
- Extension explicitly excludes auctions and token-priced listings for now.

wtfOS adoption:

- Already adopted: Objkt/Teia URL parsing, token previews, direct-buy intent, active wallet ownership checks, and Bluesky share drafts.
- Intentionally different: Skywire requires the active signer wallet to be linked to the current WTF user instead of allowing any wallet from an extension picker.
- Missing if desired later: purchase-history toolbar and generic Beacon wallet list inside the post card overlay.

Verification:

- `tests/playwright/inventory/skywire-feed.spec.mjs`, market feed and token-buy overlay tests.
- `shared/skywire-token-links.test.ts`
- `server/features/atproto/skywire-token-market.test.ts`

### tz2at

Original adoption baseline:

- 2026-05-26 wtfOS added the tz2at spine and Rat Race channel.
- 2026-05-28 wtfOS added ecosystem analytics, CEX custody classification, liquidity readouts, and replay freshness checks.
- 2026-06-06 Rat Race replay scanning was widened and made manually reloadable.

Updates found on 2026-06-30:

- Direct `https://tz2at.store/` and `.well-known/atproto-did` returned 502 during this audit. This is a source-availability watch item, not a local code regression by itself.
- Local code still treats tz2at as the canonical sale/listing signal for Rat Race and supplements with Objkt only for token metadata, supply, mint timestamp, and public tez purchase keys.

wtfOS adoption:

- Adopted: `/tz2at` status, firehose preview/search, wallet-link publish, tzbsky import, PDS offering/outbox, ecosystem analytics, CEX flow direct wallet repo resolution, Etherlink/Tezos amount normalization, and Rat Race replay scope controls.
- Watched: add a live source-health monitor for tz2at public host availability if 502 persists.

Verification:

- `server/features/tz2at/*.test.ts`
- `server/features/rat-race/tz2at-atproto.test.ts`
- Inventory probes under `tests/e2e/inventory/domain-workflows.mjs`

## Current Dependency Snapshot

Local lock versions relevant to Skywire/tz2at on 2026-06-30:

| Package | Locked Version |
| --- | --- |
| `@atproto/api` | `0.20.4` |
| `@atproto/oauth-client-node` | `0.4.0` |
| `@taquito/taquito` | `25.0.0` |
| `@taquito/beacon-wallet` | `25.0.0` |
| `react` | `19.2.5` |
| `react-dom` | `19.2.5` |
| `@tanstack/react-query` | `5.96.2` |
| `styled-components` | `6.4.1` |
| `react95` | `4.0.0` |
| `lucide-react` | `1.7.0` |
| `vite` | `8.0.8` |
| `typescript` | `6.0.2` |
| `@playwright/test` | `1.59.1` |

Do not manually duplicate the full dependency tree here. The canonical full dependency source is `package-lock.json`; record its sha256 in the ledger above after dependency changes.

## Primary Docs To Recheck During Future Source Audits

- AT Protocol docs and specs: `https://atproto.com/`
- Bluesky social app releases: `https://github.com/bluesky-social/social-app/releases`
- AT Protocol TypeScript stack: `https://github.com/bluesky-social/atproto`
- Ovoid deployed client: `https://ovoid.at/`
- Ovoid/Tezos public feature context: `https://spotlight.tezos.com/ovoid-a-bluesky-client-for-tezos/`
- Cloudnine AMO listing: `https://addons.mozilla.org/en-US/firefox/addon/cloudnine/`
- Tezos dApp, Taquito, TzKT, Objkt, and Etherlink docs from AGENTS.md and `.codex/skills/tezos-wizard/references/`

## Open Watch Items

- `@atproto/api` local lock is `0.20.4`; upstream main package marker observed at `0.20.23`. Do a separate dependency pass before updating the lock because OAuth/session restore paths have production history.
- `tz2at.store` returned 502 on 2026-06-30. Recheck before treating source gaps as local Skywire/tz2at bugs.
- Ovoid wallet visibility and persistent wallet rail are not fully mirrored in Skywire. Only add them if product wants AT-published wallet display preferences.
- Cloudnine purchase history is local-extension state. Skywire should not copy it unless there is a user-owned WTF history store with explicit privacy semantics.
