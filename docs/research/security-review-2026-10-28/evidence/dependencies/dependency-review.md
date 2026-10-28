# Dependency recheck — October 27, 2026

Reviewed main `0b7b02b25ce74bcb6a3e3cad891c0d9a778504a4` read-only. Audit requests ran at approximately03:53UTC October28 (October27 in America/New_York). This is an advisory/version/reachability review, not a claim of active exploitation. No source, manifest, lock, install, deployment or service was changed.

## Result

**One confirmed active dependency gap merits remediation: the separately installed operator signer still resolves Zod4.3.6.** The running main app retains the previous runtime/dependency protections and its newer October24 parser/Zod fixes. Newly visible `qs` and desktop `fast-uri` findings have compatible leaf fixes, but the vulnerable APIs are not demonstrated reachable from the public app.

### Active operator signer: Zod constrained-collection memory amplification

- [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5): global advisory published October1, updated October23. The [upstream fix](https://github.com/colinhacks/zod/commit/a0ebf970f2d752e5f58527cd2942ff48be4f46bd) moves upper-size checks ahead of element parsing; fix release4.6.6 exists, and4.6.7 is the current compatible target already used in the root graph. This is an older exposure confirmed in a separately deployed graph, not an October27 disclosure.
- Root Zod4.6.7 does **not** fix `extensions/wtf-operator-signer/package-lock.json`4.3.6. Its build (`package.json:11`) uses `--packages=external`. The runtime reviewer freshly confirmed `/opt/wtf-operator-signer/node_modules/zod` and its installed lock both4.3.6, active Node22.23.4; bundle SHA256`7d3e88ca8ebcf8972c28677e3c8c67ed948aa06237747a295f3bcbbb62a49b4c`,45813bytes.
- `src/policy.ts:34` parses the entire Zod envelope; the token check is later at`:48`. `src/index.ts:217` dispatches in that order. `shared/operator-signer.ts:117–124` contains bounded entrant/rank arrays. `src/index.ts:321–330` accumulates a newline-delimited frame before parsing. Socket mode0660 (`:338`) means an attacker requires local socket access; this is **not a demonstrated public anonymous HTTP attack**. No large payload or crash was attempted.
- Recommendation: refresh this separate graph to Zod4.6.7, verify the owning signer schema/policy tests, and deploy its own runtime dependencies. The vendor fix addresses bounded-collection amplification; it is not a general byte/frame bound for every input schema.

### Root qs: newly audit-visible, parser use does not match the advisory

[GHSA-6pq8-jhm2-2vcw](https://github.com/ljharb/qs/security/advisories/GHSA-6pq8-jhm2-2vcw) was upstream published **October14**, updated October27, and entered the global advisory database **October27**. Installed6.16.0 is affected;6.16.1 is a published compatible fixed release.

The triggering API is `qs.stringify(...,{arrayFormat:'comma'})` with an array element carrying a non-callable own `toString`. The only root dependents are Express and body-parser, whose inspected code calls `qs.parse`; application source has no matching stringify/comma usage. `server/app.ts:325` installs URL-encoded parsing. Root `package.json:343` pins6.16.0 even though current body-parser2.4.0 declares^6.16.1. A narrow override refresh is sensible maintenance, but the three production audit entries (`qs`, Express, body-parser) are **one advisory, not three exploitable endpoints**. They do not fail the existing `--audit-level=high` gate (`package.json:38`).

### Nine desktop build graphs: fast-uri3.1.8

All nine desktop locks retain fast-uri3.1.8 under AJV, dev-only. The [URI scheme-decoding advisory](https://github.com/fastify/fast-uri/security/advisories/GHSA-w74x-v6f9-j3xg) was published upstream October19 and added globally October23; its companion URI-normalization advisories are in the raw audit. The compatible fixed leaf is3.1.9; root already has it. This is a packaging/schema-resolution surface, with no demonstrated product URI-allowlist trigger. Each full audit reports one moderate package entry and each production-omitted audit reports zero.

The previous build-chain correction is preserved: Electron43.8.3, electron-builder26.15.3, scoped `@electron/get@3.1.0 -> global-agent4.1.3`; `roarr` and `sprintf-js` remain absent. Electron runtime publication/backports are reviewed separately by the runtime/advisory agents.

## Existing conditional/build findings

- Root Vite8.0.8 and PP Vite8.0.11 remain in affected dev-server/editor ranges.8.1.6 is a vendor-fixed8.x floor for the reported set; npm suggests8.3.5, which is merely a newer available target. Compatibility must be proven because the current repo deliberately pins its build tooling. Main `server/index.ts:58–67` initializes Vite only outside production/static-demo mode; `server/vite.ts:7–8` uses `appType:'spa'` and has no custom `transformIndexHtml` call, so [the custom-middleware script-execution prerequisite](https://github.com/vitejs/vite/security/advisories/GHSA-9jrq-w75r-8gcw) is absent. Other editor/OS/path prerequisites remain conditional developer exposure, not demonstrated production reachability.
- esbuild0.28.0 matches a low-severity Windows **development-server** advisory;0.28.1 is the fixed floor. Inspected WTF uses build tooling, not esbuild's network serve API. PP's other findings are build/lint/CSS dependency findings and its production audit is zero.
- Collekt retains Next15.5.15 and Sharp0.34.5, with the already-reported critical version matches. `next.config.mjs:28` disables image optimization; no `use server` directive, custom middleware, direct Sharp call or Next Image component was found in source. Thus the [SVG image RCE](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw) and [Server Actions DoS](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r) prerequisites are not established. This is an App Router app configured with **output:'standalone'** (`:57`), not a static export. No named Collekt deployment was observed on either inspected host; that does not exclude a separate external host. Next15.5.28 and Sharp0.35.5 are verified fixed targets if this application is maintained/launched. Other RSC/cache prerequisites have not been exhaustively proven absent.
- Collekt's other audit entries include build-time CSS tooling, fflate, and Zod3.25.76. No application Zod use was found; the GLTF usage found loads repository-owned `/ReggieSmol.glb`. Gameshow bot also has Zod3.25.76, but its only source use validates process.env (`src/lib/env.ts:90`), with no constrained attacker collection. Its service is inactive. Upgrading these Zod3 graphs to4 is a major migration, not an automatically safe leaf fix.
- Domainbot npm graph reports zero. Its older Bun lock resolves grammy1.41.1 versus npm's1.42.0; a separate registry bulk query over all15 Bun-locked package versions also returned no advisories. This does not audit the Bun runtime binary. No domainbot or Ozone deployment was observed on the two hosts.

## Preserved production fixes

Root lock: MCP SDK1.32.0; body-parser2.4.0; Multer2.5.0; Zod4.6.7; Hono4.13.11; ip-address10.7.4; proxy-addr2.0.8; fast-uri3.1.9; Undici aliases6.29.1/7.30.1/8.12.3. The runtime reviewer independently confirmed running Node22.23.4 and the app package versions for MCP/body-parser/Multer/Zod/Hono/Undici. The SDK element safeguard remains configured in `server/lib/wtf-mcp.ts:719`.

The October22 [body-parser](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828) and [Multer](https://github.com/expressjs/multer/security/advisories/GHSA-q7qp-rjg7-q26m) disclosures are already covered by the newer installed2.4.0/2.5.0 versions. Primary advisory lists for Undici, MCP SDK, Hono and ws supplied no later unmatched disclosure in this review. These checks supplement npm's incomplete runtime/alias coverage; npm audit alone is not proof of safety.

## Coverage and raw evidence

15 npm lock graphs, each audited full and with `--omit=dev` (30 successful JSON results). Counts below are vulnerable **package entries**, including propagated parents; they are not exploit counts. No install scripts ran. Local query toolchain was Node25.6.1/npm11.9.0; runtime versions were measured separately. Lock hashes and exact commands are in `dependency-review.json`.

| Lock graph | Full entries | Production entries | Production severities |
| --- | ---: | ---: | --- |
| PP/package-lock.json | 8 | 0 |  |
| apps/ch-ease-desktop/package-lock.json | 1 | 0 |  |
| apps/collekt/package-lock.json | 13 | 11 | 2 moderate, 8 high, 1 critical |
| apps/gnocchi-desktop/package-lock.json | 1 | 0 |  |
| apps/lasagna-desktop/package-lock.json | 1 | 0 |  |
| apps/macaroni-desktop/package-lock.json | 1 | 0 |  |
| apps/pasta-suite-desktop/package-lock.json | 1 | 0 |  |
| apps/penne-desktop/package-lock.json | 1 | 0 |  |
| apps/ravioli-desktop/package-lock.json | 1 | 0 |  |
| apps/rotini-desktop/package-lock.json | 1 | 0 |  |
| apps/spaghetti-desktop/package-lock.json | 1 | 0 |  |
| extensions/wtf-domain-bot/package-lock.json | 0 | 0 |  |
| extensions/wtf-gameshow-bot/package-lock.json | 2 | 1 | 1 high |
| extensions/wtf-operator-signer/package-lock.json | 2 | 1 | 1 high |
| package-lock.json | 9 | 3 | 3 moderate |

Additional manifests under `packages/` and `local-demos/` have no independent dependency graph; local demos use the root Vite install. The nested WTFIAP runtime package is a module boundary without dependencies. The separately tracked Bun lock was queried independently.

Archived evidence: each graph's `*-full.json`/`*-production.json`, `fixed-target-metadata.json`, `domain-bot-bun-advisories.json`, and `dependency-review.json`; primary advisories and fix commits are linked above. The combined report archives the selected host evidence in `../runtime-proof.json`. Exploratory advisory queries remain in `/tmp/wtf-security-recheck-20261027/dependencies/`. No fixes or production changes are claimed.
