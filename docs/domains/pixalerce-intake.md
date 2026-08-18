# PixAlerce wtfOS intake

Status: alpha integration complete; public release remains blocked pending creator licensing and complete asset provenance.

## Source snapshot

- Repository: `https://github.com/NikoAlerce/3dpixelstudio`
- Visibility at intake: private
- Default branch: `main`
- Audited commit: `99e243a34a509477e203a6dd7a5a1d18ed83f9fa`
- Commit date: 2026-07-20
- Package identity: `pixalerce@0.2.0`
- Runtime: Vite 6, React 19, Three.js/React Three Fiber, Zustand, Web Workers, IndexedDB/localForage, optional Firebase Auth and Google Drive sync
- Intended wtfOS role: session-accessible creation tool at `/tools/pixalerce`, hosted as a same-origin static iframe under `/creation-tools/pixalerce/`

The source was fetched into a temporary audit checkout. A hardened static build is vendored under `public/creation-tools/pixalerce/` for the owner-authorized alpha/tester environment. The private source itself is not vendored. `public/creation-tools/pixalerce/provenance.json` pins the source commit, patched-source digest, dependency lock digest, build command, hardening disposition, and public-launch gate.

## Compatibility result

PixAlerce is compatible with the existing wtfOS creation-tool architecture, but the upstream build cannot be vendored unchanged. The editor assumes it owns the origin root:

- Vite emits `/assets/*`, `/manifest.webmanifest`, and `/registerSW.js`.
- The generated service worker registers `/sw.js` with `/` scope.
- the PWA manifest uses `/` for `scope` and `start_url`.
- built-in stamps and the PixAlerce logo use root-relative `/stamps/*` and `/logo.png` URLs.

Those paths would collide with the wtfOS host and let PixAlerce's service worker claim the whole `wtfos.app` origin. The integrated build makes the public base configurable, derives stamp/logo/icon URLs from Vite's base URL, and disables both PWA generation and PixAlerce's service-worker update watcher for the embedded target. The hardened build runs entirely from the intended subpath and cannot inspect, register, or update the host service worker.

The initial six-file base-path diff is retained as `docs/domains/pixalerce-wtfos-compat.patch`; it applies cleanly to audited commit `99e243a34a509477e203a6dd7a5a1d18ed83f9fa`. The final alpha build adds the hardening recorded by the vendored `provenance.json`; its complete patched-source digest is the authoritative build identity.

The existing `CreationToolFrame` sandbox remains intact. PixAlerce alone receives an explicit iframe Permissions Policy allowlist for camera, microphone, fullscreen, and clipboard; no `allow-modals` sandbox exception was added. Native alert/confirm/prompt call sites were replaced with accessible in-page dialogs.

## Proof collected

Unmodified upstream snapshot:

- `npm ci`: passed; 652 packages installed.
- `npm run typecheck`: passed.
- `npm run build`: passed; 2,794 modules transformed.
- browser boot at `/`: HTTP 200, visible PixAlerce splash/editor UI, no page errors.
- `npm run lint`: failed with 12 errors and 353 warnings because it covers both the active source and `src_backup_emergency`; active-source errors include render-local component declarations in `SupportModal.tsx`.
- `npm audit`: 14 total findings; `npm audit --omit=dev` reports three production-tree findings (two high, one critical) through unused Firebase/Google packages. The audited static bundle does not contain Firebase, protobufjs, `ws`, or `websocket-driver`, but the dependency lock still fails a clean production audit.

Temporary subpath compatibility patch:

- `PIXALERCE_BASE_PATH=/creation-tools/pixalerce/ npm run build`: passed.
- generated assets, manifest, registration script, and service-worker scope all resolve beneath `/creation-tools/pixalerce/`.
- generated output: approximately 103 MB and 2,331 files.
- service-worker precache: 2,318 entries, approximately 90 MB.
- Playwright loaded `/creation-tools/pixalerce/`, created the default 256×256 blank canvas, rendered the full editor, loaded `/creation-tools/pixalerce/stamps/01.png` with HTTP 200, and observed no failed requests or browser/page errors.

Integrated alpha build:

- `npm run lint`: passed with zero errors; the emergency source backup is excluded from the active-source lint contract.
- `npm run typecheck`: passed.
- `npm audit` and `npm audit --omit=dev`: zero findings after removing unused `@google/genai` and `tsx`, refreshing the lock, and updating resolved dependencies.
- `VITE_PIXALERCE_PWA=false PIXALERCE_BASE_PATH=/creation-tools/pixalerce/ npm run build`: passed.
- output contains no `sw.js`, PWA manifest, registration script, Google API loader, remote DiceBear sprite dependency, or PixAlerce service-worker updater call.
- unconfigured Google Drive controls and implementation are eliminated from the embedded bundle; the core editor remains local-first.
- wtfOS route, launcher, creation-tool registry, package acceptance, admin ownership, inventory route/workflow, and focused persistence assertion are registered.

## Remaining gates

### Creator permission and asset provenance

The source repository is private and contains neither a license file nor GitHub license metadata. Before WTF redistributes a vendored build, Niko must provide an explicit license or written redistribution grant covering the application source and built output.

Most collage packs include `_sources.txt` ledgers with public-domain/CC0 provenance. The top-level classic stamp set has no equivalent ledger and includes visibly third-party franchise assets named for Mario, Game Boy, and Worms. Those assets need rights confirmation or removal/replacement before public deployment.

### Upstream follow-through

Prefer merging the base-path/PWA changes into Niko's repository so WTF can build an identified upstream commit instead of maintaining an opaque post-build rewrite. The patch needs to:

1. accept a normalized public base path at build time;
2. use it for Vite output, icons, logo, stamps, workers, the PWA manifest, service-worker registration, and service-worker scope;
3. preserve root deployment as the upstream default;
4. add a subpath build check that rejects host-root asset or service-worker references.

The embedded target now disables the eager PWA precache and service-worker updater. The upstream root-deployment default remains PWA-enabled.

### Optional integrations and CSP

The editor core is local-first and works without external credentials. Google Drive sync is still shown when `VITE_GOOGLE_CLIENT_ID` is absent, and the wtfOS production CSP does not currently allow the Google API/GIS scripts or Google API connections that feature uses. Firebase UI hides itself when unconfigured.

Before enabling Google Drive in a future build, either:

- keep external account/sync features explicitly disabled and hide unavailable controls; or
- obtain Niko's production client configuration and add path-scoped CSP sources only for `/creation-tools/pixalerce/`.

Do not broaden the global wtfOS CSP for an optional embedded-tool feature.

### wtfOS registration

The static build plus canonical creation-tool registry entry, `/tools/pixalerce` route metadata, desktop/Start Menu launcher presence, package acceptance/provenance, Creation Tools admin ownership, interaction inventory coverage, route fixture, and focused local-project persistence proof are part of this alpha integration. PixAlerce remains lazy-loaded inside `CreationToolFrame`; its static stamp payload does not enter the desktop boot bundle.

## Acceptance criteria for integration

PixAlerce is ready for public release when all of the following are true:

- Niko's redistribution terms and the included asset rights are recorded.
- an exact licensed upstream commit builds deterministically for `/creation-tools/pixalerce/`.
- no PixAlerce asset or service worker escapes that subpath.
- dependency, typecheck, lint, build, and embedded-host isolation checks remain green.
- the editor opens from the wtfOS launcher, creates and edits a project, persists/reopens local work, imports media, and exports an artifact inside the real wtfOS shell.
- route, registry, package, admin, inventory, and E2E ownership agree.
