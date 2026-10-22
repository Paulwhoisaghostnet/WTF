# Desktop build dependency follow-up — October 22, 2026

All nine desktop packages now scope `@electron/get@3.1.0` to `global-agent` 4.1.3. The packager stays at `electron-builder` 26.15.3, Electron stays at 43.8.3, and all product versions stay at alpha.2. This removes the old logger chain physically; no advisory suppression, package alias, forced audit fix, or package downgrade was used.

The shared dependency change is exactly four upgrades:

| Dependency | Before | After |
| --- | --- | --- |
| global-agent | 3.0.0 | 4.1.3 |
| matcher | 3.0.0 | 4.0.0 |
| serialize-error | 7.0.1 | 8.1.0 |
| type-fest | 0.13.1 | 0.20.2 |

`boolean`, `detect-node`, `es6-error`, `json-stringify-safe`, `roarr`, `semver-compare`, and `sprintf-js` disappear. Every remaining package path/version is unchanged. Each graph goes from 284 to 277 dependencies. The four upgraded packages support Node >=10; builds were verified on the project's patched Node 22.23.4.

The [global-agent 4.0 release](https://github.com/gajus/global-agent/releases/tag/v4.0.0) identifies its major change as Flow-to-TypeScript migration and also fixes TLS validation defaults. [Version 4.1.3](https://github.com/gajus/global-agent/releases/tag/v4.1.3) fixes its distribution. The [published runtime API](https://github.com/gajus/global-agent/blob/v4.1.3/src/routines/bootstrap.ts) retains CommonJS `bootstrap()` and the `GLOBAL_AGENT_*` proxy controls used by the unchanged downloader. The obsolete logger has been replaced by a built-in logger. Builder 26.18.0 still requests get 3 and does not remove this chain by itself; overriding get 5 would additionally change module and proxy behavior. The tested override changes only the narrower proxy dependency.

## Verification

- Both distinct baseline graphs, represented by Spaghetti and Macaroni, passed clean `npm ci` with lifecycle scripts enabled. Installed resolution was checked from builder to its nested downloader to global-agent 4.1.3.
- All nine regenerated lock graphs equal the appropriate clean-installed candidate, excluding the root package identity. Full npm audit returned zero for each; lock hashes and exact dependency changes are in [the JSON receipt](desktop-build-chain-followup.json).
- All 62 owning desktop package, provenance and supply-chain policy checks passed.
- The unchanged builder produced a real macOS arm64 Spaghetti package. The existing installed-artifact smoke passed its four required assets, stable local origin, persistence and relaunch checks. Its runtime remains Electron 43.8.3 / Node 24.22.0 / Chromium 150.0.7871.250. The ASAR has 60 entries and no `node_modules` tree.
- Direct/proxied downloads, HTTP and HTTPS proxy selection/fallback, NO_PROXY bypass, cache, progress, wrong-checksum rejection and untrusted-TLS rejection were exercised with counted local network hops. The reproducible [fixture](desktop-build-proxy-compatibility.mjs) and [receipt](desktop-build-proxy-compatibility.json) record the downloader and actual builder consumer checks.

The local package is an isolated build-tool compatibility experiment using existing Spaghetti assets and dirty preflight provenance, not a new installer release or clean release attestation. It was not published. No Electron runtime fix is claimed by this build dependency change.

## Audit data caveat

The [historical receipt](desktop-build-audit-residuals.json) records eight moderate dependency-chain entries from [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c). During this follow-up, fresh npm audits also returned zero for the unchanged baseline, and a direct npm registry advisory query for `sprintf-js@1.1.3` returned `{}`. The GitHub advisory still identifies that version as affected with no patched release. Therefore the proof is removal of the affected package and its logger from every graph, not a current eight-to-zero npm count comparison.

An initial macOS `/tmp` prefix experiment produced malformed external `/private/tmp` lock paths and was discarded. Final candidates were installed in canonical `/private/tmp` working directories, with pristine baseline locks, and their installed package versions were checked independently.
