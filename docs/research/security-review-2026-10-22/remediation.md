# October 22 security remediation

**Server runtime fixes are deployed and verified. All nine desktop security releases are published. Final app deployment/Quality verification and activation of their verified production download links are pending.** The measured app and MCP proofs below used production commit `7167ca37`; they must not be presented as proof of a later commit.

This follows the [historical announcement review](report.md). That report preserves the pre-fix observations, advisory dates, audit counts, and initial evidence limits; its statements that remediation had not yet occurred describe that earlier pass. No compromise or successful production exploit was established.

## Runtime results

| Surface | Verified result | Proof and boundary |
| --- | --- | --- |
| Main application | **Node 22.23.4**, built-in Undici 6.29.1, c-ares 1.34.9 | Running-container [`process.versions` and installed dependencies](evidence/deployed-app-runtime.json); successful [normal deployment 39844356047](https://github.com/Paulwhoisaghostnet/WTF/actions/runs/39844356047). |
| Native application-host services | **Node 22.23.4** | Host package upgraded from 22.22.2. `kiln.service`, `wtf-operator-signer.service`, and `wtf-aleatory-provider.service` restarted; each active process executable reported 22.23.4. Kiln health passed and anonymous mutation remained 401. |
| All ten PDS services | **Node 24.22.1**, vendor PDS image **0.4.5046** | Replaced running Node 20.20.2/PDS 0.4.219. Main, social, commerce, media, arcade, tezos, ops, os, users, and private were checked. Internal Undici versions: 6.29.1 / 7.30.1 / 8.12.3. Per-PDS cold backups retained under `/opt/platform/security-remediation-20261022`. [Pinned image metadata](evidence/wtf-security-at-images.json). |
| DID PLC | **Node 22.23.4** | Same application source `1e301e5e29dd419c4dfc7d3100a2a614f9286ebe`, replacing Node 18.20.8. Public health and an unchanged existing DID document passed. [Runtime/backup receipt](evidence/remediation-at-runtime.md#did-plc). |
| AT relay | **Go 1.26.10** | Same source `5368f55344e0b5e203ab4d9501e1ddebd9983ad7`; the running binary reports the exact revision and `vcs.modified=false`. All nine prior upstream connections returned; account counts and sequence cursors were preserved. [Runtime/backup receipt](evidence/remediation-at-runtime.md#at-protocol-relay). |
| Main-app and AT-edge Caddy | **Caddy 2.11.7 compiled with Go 1.26.10** | Both running binaries were checked; the AT edge and native/PDS details are retained in the [host receipt](evidence/deployed-host-runtimes.json). Rebuilt because the vendor 2.11.7 image still embedded Go 1.26.8. |
| Nine Pasta desktop products | Manifests target **Electron 43.8.3**, release **1.0.1-alpha.2** | Packaged runtime checks show Electron 43.8.3 / **Node 24.22.0** / Chromium 150.0.7871.250. Local [Spaghetti proof](evidence/wtf-spaghetti-runtime-proof.json) is a dirty-development build, not a published artifact attestation. All 27 platform jobs and 36 installed-format checks passed; every release is published at its tested commit. Independently downloaded CH-EASE was also checked. Production download activation remains pending. |

The gameshow bot was inactive and was not started. Its dependency graph was patched and tested. No Ozone container was running; the public moderation endpoint was backed by PDS. The repository's dormant Ozone image was updated to a vendor image containing Node 24.22.1, without claiming a live Ozone upgrade.

These changes address the [Node October 21 release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases), including the reachable Brotli decoder issue; [Go certificate rejection fix](https://pkg.go.dev/vuln/GO-2026-6809); [Electron certificate advisory](https://github.com/electron/electron/security/advisories/GHSA-jr5w-w6x2-84p9); and the earlier [Caddy WebSocket header issue](https://github.com/caddyserver/caddy/security/advisories/GHSA-8qx7-j2v2-x6q5).

**Desktop caveat:** Electron 43.8.3 fixes the certificate advisory, but its embedded Node 24.22.0 does not attest every October 21 Node backport. Reviewed production desktop sources do not import Node `fetch`/HTTPS/DNS/zlib APIs; loopback HTTP bodies are manually buffered and parsed without Brotli/HTTP2, and the suite ZIP writer uses stored entries. Sandboxed renderers have Node integration disabled and use Chromium networking. The specific remaining Node API paths were not demonstrated reachable; this is not a claim that Electron embeds Node 24.22.1.


## Published desktop security release

All products are `1.0.1-alpha.2`; existing installations need the updated installer.

| Product | Published release | Tested source |
| --- | --- | --- |
| pasta-suite | [Download installers](https://github.com/Paulwhoisaghostnet/WTF/releases/tag/pasta-suite-desktop-v1.0.1-alpha.2) | `e266b0da` |
| ch-ease | [Download installers](https://github.com/Paulwhoisaghostnet/WTF/releases/tag/ch-ease-desktop-v1.0.1-alpha.2) | `7167ca37` |
| macaroni | [Download installers](https://github.com/Paulwhoisaghostnet/WTF/releases/tag/macaroni-desktop-v1.0.1-alpha.2) | `7167ca37` |
| spaghetti | [Download installers](https://github.com/Paulwhoisaghostnet/WTF/releases/tag/spaghetti-desktop-v1.0.1-alpha.2) | `c2dcb077` |
| gnocchi | [Download installers](https://github.com/Paulwhoisaghostnet/WTF/releases/tag/gnocchi-desktop-v1.0.1-alpha.2) | `c2dcb077` |
| ravioli | [Download installers](https://github.com/Paulwhoisaghostnet/WTF/releases/tag/ravioli-desktop-v1.0.1-alpha.2) | `c2dcb077` |
| rotini | [Download installers](https://github.com/Paulwhoisaghostnet/WTF/releases/tag/rotini-desktop-v1.0.1-alpha.2) | `c2dcb077` |
| penne | [Download installers](https://github.com/Paulwhoisaghostnet/WTF/releases/tag/penne-desktop-v1.0.1-alpha.2) | `c2dcb077` |
| lasagna | [Download installers](https://github.com/Paulwhoisaghostnet/WTF/releases/tag/lasagna-desktop-v1.0.1-alpha.2) | `c2dcb077` |

The [desktop release receipt](evidence/desktop-release-receipt.md) links all platform jobs, installed runtime attestations, immutable release hashes, and the Macaroni publisher recovery.

## Dependencies and MCP

Remediation started from the actual production baseline. **Multer 2.4.0, proxy-addr 2.0.8, fast-uri 3.1.8, and qs 6.16.0 were preserved**, avoiding the older dirty-checkout resolutions. Root MCP is now 1.32.0, Hono 4.13.11, nested ip-address 10.7.4, and the three ATProto Undici aliases 6.29.1 / 7.30.1 / 8.12.2. The bot uses Undici 6.29.1 and ws 8.21.0. Upstream [Undici response DoS](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c) and [TLS renegotiation DoS](https://github.com/nodejs/undici/security/advisories/GHSA-qrxm-fqhp-jwvm) were checked separately from npm audit. [Dependency verification receipt](evidence/remediation-at-runtime.md#dependencies-and-scoped-verification).

The [MCP validation advisory](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-46jr-4wx8-v453) required configuration and input handling as well as an SDK update. The SDK safeguard is enabled; typed collections are checked before Zod can allocate errors per entry, with bounds derived from the existing tool/request contracts. Production proof covered anonymous 401, a body above 10 MiB rejected with 413, 47-tool discovery, a real API read, oversized collection rejection, and token revocation. A local actual-HTTP batch at the existing 10 MiB/100-message ceilings completed all 100 calls without errors; peak RSS was 330144 KiB against the measured 4345298944-byte production heap ceiling. [MCP proof and receipts](evidence/mcp-verification-summary.md).

## Verification and release recovery

- Clean root/bot installs passed on Node 22.23.4. Both production dependency audits reported zero known findings; this does not include every runtime-native advisory or establish exploit absence. Scoped dependency/security tests, bot typecheck/build, local HTTP/WebSocket checks, and all three Undici alias checks passed. The bot's ordinary test command discovered zero tests.
- MCP focused tests passed 15/15, its local actor lifecycle 1/1, and inventory coverage 253 rows/995 handles. Public Chromium home/login checks returned 200 with expected controls, no page errors or failed requests, and only expected anonymous-session 401s. [Browser receipt](evidence/public-browser-smoke.json).
- PLC isolated tests proved migrations, signed create/update/resolve, invalid-signature rejection, operation-log validation, and restart durability. Relay isolated and production checks proved startup, health, built UI, persisted state, and resumed upstream connections. Previous images and verified database/persistence backups remain available. [Detailed receipt](evidence/remediation-at-runtime.md).
- Installer verification exposed Windows root-path handling, suite Linux executable selection, and a CRLF-sensitive workflow assertion. Scoped corrections preserve traversal rejection and actual executable identity; all 27 platform jobs and 36 installed-format checks passed, with releases published at their immutable tested commits. The sole failure in [Quality run 39844356216](https://github.com/Paulwhoisaghostnet/WTF/actions/runs/39844356216) was an obsolete `alpha.1` audit expectation: 2613 tests passed, one failed, 18 skipped. Its corrected policy passed 8/8. That failed run is not a green aggregate result.
- Follow-up [deploy 39845359006](https://github.com/Paulwhoisaghostnet/WTF/actions/runs/39845359006) correctly stopped before replacing the healthy app because free disk space was below the existing 12288 MiB floor. Under the deployment lock, only unused npm download and two verified `npx` caches were removed. Free space rose from **12066292 KiB to 12640392 KiB** (12345 MiB), reclaiming 574100 KiB. Container identities/restart counts were unchanged. No volumes, data, release files, disk expansion, or threshold reduction were used. The subsequent [deployment 39846715345](https://github.com/Paulwhoisaghostnet/WTF/actions/runs/39846715345) then exhausted space during image export before replacing the app. Docker history measured a 1.46 GB duplicate ownership layer. Ownership now remains assigned during dependency installation and file copying; final mount directories receive targeted ownership. Removing only unused failed candidate images via Docker restored 14,109 MiB free. The corrected normal build and actual image ownership still require final verification. [Disk recovery receipt](evidence/deploy-disk-recovery.md).

## Residual applicability and completion boundary

- **PHP, GitLab, Traefik:** no matching service/code was found in the inspected WTF topology; their announcements did not justify unrelated application changes.
- **Collekt Next.js:** the version matches the [SVG advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw), but image optimization is disabled. No Server Action directive matching the [Server Actions advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r) was found. Separate Collekt deployment/reachability was not established; the main website is Express/Vite.
- **Development/build-only and feature-conditional entries:** the historical audit retains Vite, packaging, and other unmatched API prerequisites. They are not counted as demonstrated public exploits. Hono and ip-address were nevertheless updated with the root graph.
- **Desktop build dependencies:** eight moderate audit entries remain in the `sprintf-js` → `roarr` → `global-agent` build-tool chain, with no compatible fixed resolution. An unsafe build-tool downgrade was rejected; see the [audit receipt](evidence/desktop-build-audit-residuals.json). No high or critical entries remain in the patched desktop build graph.
- **Other Node features and OS packages:** no deployed snapshot/SEA, permission-model, or Node 26 ZipFile path was found. No kernel, mailserver, or native-library vulnerability was assigned merely from package age. Existing customer desktop installations are not automatically updated by publishing new installers.

**Pending final receipt:** record the latest normal main deployment and matching public commit/runtime, the completed main Quality result, all nine final installer release/download checks, and activation of the verified downloads. Until those are recorded, this report claims the measured server fixes and focused proofs above, not completion of the entire full-send release.
