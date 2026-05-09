## 2026-05-09 — MCP scopes must be account-role capped, not user-declared

**What happened**: MCP bearer tokens were tied to the user that created them and privileged tools still checked the user's role, but token creation accepted arbitrary posted scope strings. A non-admin could therefore store scopes like `*`, `arcade:*`, or `arcade:admin`; the tool role checks blocked the worst outcome, but the token itself overstated what the account should be allowed to delegate.

**Why it mattered**: MCP is delegated account access. A user's agent must not gain any WTF surface that the same user could not reach through the browser, and future tools should not have to survive forged wildcard/admin scopes by convention alone.

**Fix**: Added a shared MCP scope policy that filters scopes at token creation and again at bearer authentication. Non-admin accounts can only receive exact user-level scopes; wildcard and admin scopes are effective only for admin accounts, and explicit invalid scope requests now fail closed to an empty scope set.

**Rule**: Treat MCP scopes as derived from the paired user's account role, never as trusted client input. Any new MCP admin or wildcard scope must be added to the shared scope policy and covered by role-cap tests.

---

## 2026-05-09 — MCP bearer auth must never become browser session auth

**What happened**: The MCP route authenticated paired-agent bearer tokens independently from Passport, but it still lived behind the global Express session middleware. A browser could therefore include an existing `connect.sid` cookie on `/mcp` while the MCP request used a different paired token, leaving the boundary dependent on route discipline.

**Why it mattered**: Users need MCP access without risking their normal site session. A paired-agent call must not create, rotate, replace, refresh, or clear the browser's account cookie, and browser cookies must never be accepted as MCP credentials.

**Fix**: Made `/mcp` suppress all outgoing `Set-Cookie` headers, reject cookie-only MCP access with explicit messaging, and log `mcp.browser_session_ignored` whenever a browser session identity is present but a paired bearer token remains authoritative.

**Rule**: `/mcp` may read only `Authorization: Bearer wtf_mcp_...` for MCP identity. Do not add Passport login/logout, `isAuthenticated`, cookie writes, or browser-session identity fallback to the MCP transport path.

---

## 2026-05-09 — One-time auth modals must be accounted for in E2E actors

**What happened**: Adding the WTF OS welcome event correctly showed a one-time modal for accounts without the welcome flag, but the inventory Playwright harness returned an admin user fixture without that flag. The modal intercepted the `ADM` button click in the strict-admin system integration test.

**Why it mattered**: First-login UI is part of the auth surface. If test actors do not model whether they have already completed account onboarding, unrelated route and admin tests can fail behind an overlay even though the app behavior is correct.

**Fix**: Added the welcome flag to harness users, gave the harness a welcome-completion endpoint, and marked live puppet users as already welcomed during seeding while preserving the real first-login path for normal accounts.

**Rule**: Any future one-time account modal or onboarding gate must update mocked harness users and live puppet seed state in the same pass, or explicitly dismiss the modal in the affected browser tests.

---

## 2026-05-09 — Agent access needs one manifest shared by API and MCP

**What happened**: The repo documented browser, public API, and MCP access in prose, and the interaction inventory listed MCP access handles, but there was no runtime access manifest that both JSON clients and paired MCP agents could read before navigating or automating WTF. MCP transport requests also were not emitting the normalized agent events the inventory said existed.

**Why it mattered**: Browser access, JSON API access, and paired-agent access have different auth envelopes. Without a single runtime manifest and telemetry spine, agents could drift from the standard browser route model or make it harder to prove MCP usage was isolated from normal browser sessions.

**Fix**: Added a public read-only `/api/access` manifest, exposed the same manifest through `wtf_get_access_manifest`, and wrapped the MCP transport with connection/tool telemetry that records paired-token usage without touching browser session cookies.

**Rule**: Any future change that adds or reshapes standard WTF access for agents must update the shared access manifest, MCP capabilities, public access docs, and inventory coverage together.

---

## 2026-05-09 — Local dev CORS must follow the active app port

**What happened**: The WTF OS browser smoke started the app on `PORT=3317`, but development CORS only allowed a fixed set of local origins (`3000`, `3001`, and `5173`). Same-origin browser API calls from `http://localhost:3317` were rejected, so the desktop never reached the taskbar during smoke verification.

**Why it mattered**: Local verification ports are often moved to avoid conflicts. If CORS does not include the actual runtime port, the app can look broken even though the route, Vite server, and API code are all present.

**Fix**: Added the active `PORT` to the non-production local origin allowlist and covered it with a focused CORS origin test.

**Rule**: Development CORS allowlists must include the active runtime port, not only the common default ports. Browser smoke tests should use the same URL the server prints and treat self-origin CORS failures as app boot failures.

---

## 2026-05-09 — Start Menu structure needs one registry-backed model

**What happened**: The Start Menu/Stuffs launcher had drifted into a hand-maintained list where Arcade and My Games lived under a Casino category, while the route registry carried different labels and ownership. The first cleanup made the menu registry-driven but still did not match the intended WTF OS information architecture.

**Why it mattered**: WTF OS feels scattered when users cannot predict where native apps, domain workflows, account tools, and browse surfaces live. Launcher grouping is product architecture, not decorative copy.

**Fix**: Rebuilt the Start Menu model into explicit Windows 95-style sections: Apps, domain categories, account/system entries, Browse, then session action. Gaming now owns Casino, Arcade, and Game Console; My Games lives under My Media; Casino can render visible-but-inactive when the current user lacks a membership card.

**Rule**: Start Menu changes must update the registry-backed menu model and focused structure tests. Do not add one-off hardcoded launcher categories in JSX.

---

## 2026-05-09 — Live puppet probes must encode fail-closed access as success

**What happened**: The live puppet domain workflow probed Casino game-state APIs with an admin puppet that did not own the Casino app pass or active membership card. The app correctly returned `402` with the fail-closed access payload, but the harness treated every non-2xx API probe as a test failure.

**Why it mattered**: Actor-backed E2E should prove permission boundaries as well as happy paths. A gated API returning a clear denial can be the expected behavior, especially for wager-adjacent Casino surfaces.

**Fix**: Added per-probe expected status support to the inventory workflow contract and marked the Casino WTF Button state/quote probes as accepting either an accessible `200` or a fail-closed `402`.

**Rule**: Inventory and live puppet probes for gated APIs must document acceptable denial statuses instead of assuming every reachable path should return `2xx`.

---

## 2026-05-09 — Deploy warnings are part of the release surface

**What happened**: The Arcade full-send deploy succeeded, but GitHub Actions emitted a warning that `actions/checkout@v4` was still running on the deprecated Node.js 20 action runtime.

**Why it mattered**: A warning in the deploy job can become tomorrow's production blocker. Full-send verification should account for the workflow health, not only the application health endpoint.

**Fix**: Upgraded the deploy workflow from `actions/checkout@v4` to `actions/checkout@v5`, whose action metadata runs on Node 24 instead of requiring a forced runtime override.

**Rule**: After a production deploy, scan workflow annotations as part of the smoke pass. If an annotation names an upcoming runtime cutoff, fix and redeploy while the change is still tiny and attributable.

---

## 2026-05-09 — Manager-wallet deploy UI must ship signer intent support with the domain

**What happened**: The clean full-send worktree compiled the Club Dues domain against `origin/main` and immediately caught that the app-level dues service called `intent: "originate_contract"` while the checked-in operator signer protocol on `main` did not yet know that intent or return originated KT1 addresses.

**Why it mattered**: The dues admin screen could have looked ready while manager-wallet deployment failed at typecheck or runtime. Contract factory-style features cross the app server, shared signer envelope, signer daemon policy, and signer tests; shipping only the UI/service slice is incomplete.

**Fix**: Included the signer protocol, client, daemon policy, env gates, build, and tests in the same isolated club-dues release commit.

**Rule**: Any feature that asks a platform wallet to originate or administer a contract must update and verify the shared signer protocol plus daemon policy in the same pass, including `npm run operator-signer:check`, `npm run operator-signer:build`, and `npm run operator-signer:test`.

---

## 2026-05-09 — Node signer services need V8-aware systemd hardening

**What happened**: The production `wtf-operator-signer` systemd unit used `MemoryDenyWriteExecute=yes`. Node/V8 tried to allocate executable JIT memory during signer startup and crashed with `status=5/TRAP`, leaving no Unix socket for the app container. A first attempted fix using `NODE_OPTIONS=--jitless` avoided the trap but broke Node's built-in Undici HTTP stack because its llhttp path expects WebAssembly.

**Why it mattered**: The app can have the correct signer protocol, auth token, keyring, and Docker socket mount while still failing manager-wallet deployment if the isolated signer process cannot survive its service sandbox.

**Fix**: Disabled `MemoryDenyWriteExecute` for the Node signer unit and updated the signer deploy script to refresh the unit file before restart.

**Rule**: Do not enable `MemoryDenyWriteExecute=yes` for Node signer services unless the exact production Node version, dependency graph, and HTTP/RPC path have been proven under that sandbox.

---

## 2026-05-09 — Asset catalog edits need runtime and type verification together

**What happened**: A Game Studio CC0 asset manifest slug used a malformed slash regex, which compiled far enough to land in the dirty tree but crashed at module load with `ReferenceError: g is not defined`. The same pass removed Hoard's `findLooseCoin()` helper while the pig AI still called it.

**Why it mattered**: Game Studio catalog imports are shared by packaging and MCP modules, so one loader typo can break unrelated server tests and production startup paths. Canvas/UI polish can also silently remove behavior helpers when a visual rewrite replaces a large drawing block.

**Fix**: Replaced the fragile slash/dot regexes with valid path-safe patterns, made CC0 manifest asset iteration tolerate missing arrays, and restored the Hoard loose-coin selector used by the guinea pig state machine.

**Rule**: After large asset-catalog or canvas animation edits, run both focused runtime tests and `npm run check -- --pretty false`. Treat TypeScript errors and module-load tests as complementary gates, not substitutes.

## 2026-05-09 — Sandboxed module scripts send `Origin: null`

**What happened**: Flappy Bower progressed past storage access but the Start button stayed inert. The HTML and CSS loaded, but the sandboxed iframe fetched module scripts with `Origin: null`; the global CORS allowlist rejected those requests before the Arcade source proxy could return its public asset headers.

**Why it mattered**: Static game HTML can render enough to look loaded even when its JavaScript never executes. That creates a misleading "button does nothing" symptom instead of an obvious load failure.

**Fix**: Added a narrow global CORS exception for `Origin: null` only on public Arcade source asset paths, while leaving authenticated APIs on the normal allowlist.

**Rule**: Any sandboxed iframe that omits `allow-same-origin` and loads module scripts from same-origin URLs must have an explicit `Origin: null` asset path policy. Do not broaden null-origin CORS for authenticated or stateful APIs.

## 2026-05-09 — Sandboxed source games need storage compatibility, not wider trust

**What happened**: Hackcade-source Arcade games loaded in the Arcade iframe but crashed before play because the published-game sandbox intentionally omitted `allow-same-origin`. Browser storage access then threw `SecurityError`, and several Hackcade games read `localStorage` at module top level.

**Why it mattered**: The Arcade catalog could show imported games as playable while the runtime blocked common game boot code. Loosening the sandbox for every published cartridge would have fixed the symptom by widening trust too far.

**Fix**: Added localStorage/sessionStorage fallbacks inside the Hackcade compatibility SDK served by the source proxy, so imported source games can boot while the stricter published-game sandbox remains in place.

**Rule**: For untrusted or imported game runtimes, preserve sandbox boundaries first. Patch compatibility shims at the narrow source-runtime boundary before adding iframe privileges globally.

## 2026-05-09 — Studio preview derivatives need explicit MIME fallbacks

**What happened**: Studio uploaded images generated WebP preview and thumbnail derivatives, but the local disk storage driver streamed derivative blobs back as `application/octet-stream`. Because Studio also sends `X-Content-Type-Options: nosniff`, browser image previews could fail to render inline even when the bytes existed.

**Why it mattered**: Studio is a collaboration and review surface. If image previews fail silently, collaborators cannot see the media they are discussing, and the app looks like it only stores files instead of supporting visual review.

**Fix**: Added deterministic Studio stream MIME fallbacks for preview and thumbnail derivatives, made image previews fall back to the original file when a generated preview fails, and exposed an open-original action for selected files.

**Rule**: Any generated media derivative served through a generic storage driver must carry or reconstruct the derivative MIME at the API boundary. Do not rely on a storage driver returning anything more specific than `application/octet-stream`.

## 2026-05-09 — App gates must cover every launcher, not just desktop icons

**What happened**: The admin desktop-app gate hid disabled apps from desktop icons, but the Start Menu/Stuffs launcher was hardcoded and still showed the same apps. The central Admin Panel also accumulated long tab labels that made the maximized window feel cramped instead of operator-grade.

**Why it mattered**: A gate that only hides one launch surface is misleading. Operators expect "off" to mean users cannot launch the app from any WTF OS launcher, and cramped admin tabs make it harder to trust the control surface during live operations.

**Fix**: Added shared Start Menu app-gate filtering, kept disabled apps out of both icons and Start Menu entries, tightened app-gate copy/actions, and changed the Admin Panel into a full-height shell with compact titled tabs and a flexing content body.

**Rule**: WTF OS app gates must be applied to every launcher surface in the same pass: desktop icons, Start Menu/Stuffs entries, native admin panels, central admin labels, MCP feature gates, and inventory/E2E coverage where applicable.

## 2026-05-08 — Game Studio open-asset importer needs bounded upstream fetches

**What happened**: The open-asset import script `scripts/import-game-studio-open-assets.mjs` depended on `fetch` without a timeout. When an upstream API or gateway stalled, the import run could block indefinitely and never return control.

**Why it mattered**: A single stalled request prevented maintenance runs from completing and made the source refresh pipeline unsafe for production operators.

**Fix**: Added `IMPORT_FETCH_TIMEOUT_MS` and a shared bounded-fetch helper (`fetchWithTimeout`, `fetchJsonWithTimeout`, `fetchTextWithTimeout`) for Objkt/Polyhaven metadata and payload downloads.

**Rule**: Maintenance import workers should not use unbounded network calls. All upstream and gateway fetches must have explicit timeout + fallback handling so a stale endpoint cannot stall the entire ingest loop.

## 2026-05-08 — Generic helpers need type checks, not just runtime tests

**What happened**: The Guinea Pig Raceway probability helper passed runtime tests after stripping internal allocation fields, but TypeScript correctly rejected the generic return because `T` could be instantiated with a stricter subtype than the base entrant shape.

**Why it mattered**: Casino game math helpers will become settlement-adjacent. Runtime tests prove behavior, but generic type drift can still leak into API contracts or future contract-verifier call sites.

**Fix**: Added an explicit typed return assertion at the helper boundary after removing internal fields, then reran the Raceway tests and full TypeScript check.

**Rule**: For reusable Casino/game-economy helpers, run `npm run check -- --pretty false` in addition to domain tests before calling the helper shape ready.

---

## 2026-05-08 — Live E2E needs real actors and signer-backed wallets

**What happened**: The inventory-driven E2E skeleton proved route, handle, admin-surface, and domain workflow coverage, but it still did not prove that real local users could log in, hold linked wallets, sign wallet challenges, pass role gates, or exercise stateful workflows against the database.

**Why it mattered**: The first live puppet orchestration runs caught bugs that static/smoke coverage could not: wallet verifier module loading, local E2E rate-limit/session behavior, schema drift, pet starter-food SQL parameter ambiguity, and admin-only API probes running with non-admin actors.

**Fix**: Added local DB preparation, 12 seeded puppet users with strong ignored passwords, platform-keyring-backed puppet wallets, signer-backed wallet challenge verification, role-aware route/workflow orchestration, and worker rules requiring live puppet coverage for auth, wallet, reward, admin, persistence, and cross-domain changes.

**Rule**: Do not treat an interaction as live-safe until the relevant layer has real actor coverage. Changes that cross auth, roles, wallet binding, rewards, admin tooling, persistence, or domain interoperability must update or run `npm run test:e2e:live:puppets` when practical, with any blocker documented.

---

## 2026-05-08 — E2E skeleton coverage is not feature behavior coverage

**What happened**: After adding an inventory-driven E2E suite, it was tempting to summarize the result as "every feature is tested." The suite did prove complete coverage of known inventory rows, handles, routes, admin surface routes, and domain workflows, but it did not yet assert every feature's real persistence, reward, permission, wallet, or chain-backed side effect.

**Why it mattered**: Overstating E2E coverage creates a false sense of safety. A mocked route smoke test can prove that a page renders, and a normalized-handle test can prove that an event shape exists, but neither proves that a post is saved, XP is granted once, settings persist, wallet signing succeeds, or a reward settlement is correct.

**Fix**: Added feature-depth accounting through `tests/e2e/inventory/coverage-layers.mjs`, a Playwright depth spec, coverage output that explicitly reports `fullFeatureBehaviorComplete: false`, and worker rules requiring durable behavior assertions for state-changing interactions.

**Rule**: Use precise coverage language. "Complete E2E skeleton" means every known inventory route/handle/domain path has an executable test. "Fully behavior-tested feature" means a domain-owned test asserts both the user-visible result and the durable side effect.

---

## 2026-05-08 — Desktop wiring tests must follow owning registries

**What happened**: After the server/client restructuring, desktop wiring checks still read stale owner files (`client/src/App.tsx` and `shared/schema.ts`), while desktop icon and artifact automation handles were advertised without a general client-to-server event bridge. Inventory-backed desktop items also only normalized positions during first localStorage load, so later surface-size changes could leave elements outside the current desktop bounds.

**Why it mattered**: Desktop UI state crosses several boundaries: visible icons, persisted settings, admin surface metadata, challenge events, local artifact storage, and route registries. When any one of those owners drifts, users see symptoms like reset/rubberband movement, silent missing automation events, or elements that behave differently after a resize.

**Fix**: Updated wiring tests to read `client/src/routes/page-defs.ts` and `shared/schema-gameshow.ts`, added authenticated `/api/desktop/events` ingestion for icon/object/artifact/tool actions, wired desktop icon opens/moves, item clicks, tool selection, portal placement, and icon-layout reset to that bridge, re-clamped artifact positions when bounds change, and added SKU registry coverage for inventory-backed desktop items.

**Rule**: Desktop changes must be checked across the owning registries, not old aggregate files: icon definitions, shared layout keys, route page definitions, desktop app config, admin surface handles, storage normalizers, and challenge event ingestion. If a desktop surface advertises an automation handle, the UI must emit it or intentionally document why it is latent.

---

## 2026-05-08 — Public docs need an explicit boundary

**What happened**: The public repo root and `docs/` tree mixed user-facing README material with agent plans, audit reports, active bug bounties, run logs, integration source maps, ops notes, and historical scratch docs. GitHub visitors had to wade through internal project memory before finding the actual product shape.

**Why it mattered**: Documentation organization is part of the security and product surface. Live risk boards and stale plans create confusion for users and give too much operational context to anyone browsing the public repo.

**Fix**: Moved active internal boards to `.agents/docs/live`, moved stale or historical material to `.agents/docs/archive`, rewrote the root README and architecture map as public docs, and added lightweight domain guides under `docs/domains`.

**Rule**: Keep `README.md`, `ARCHITECTURE.md`, and `docs/` public-facing. Put agent memory, bug boards, lessons, audits, plans, run logs, and deployment scratch material under `.agents/docs` unless the owner explicitly asks to publish a sanitized version.

---

## 2026-05-08 — Interaction inventories need executable coverage gates

**What happened**: The interaction inventory had become the source for E2E, rewards, monitoring, cheat detection, challenge automation, and admin control, but it was still possible to update routes, handles, or admin surfaces without an executable test scheme proving the inventory stayed wired.

**Why it mattered**: A complete inventory that is not machine-checked can silently drift into documentation theater. Reward handles, side-quest triggers, route surfaces, and strict-admin affordances all need test ownership at the same domain/subdomain boundary where the app owns the behavior.

**Fix**: Added an inventory parser, modular route/domain/system fixtures, Playwright subdomain/domain/system specs, an E2E coverage gate, package scripts, and Codex/Claude/Cursor/system-prompt rules requiring future workers to update the inventory and E2E scheme together.

**Rule**: Any new or changed route, sub-app, desktop item, admin surface, API handle, reward/challenge/side-quest trigger, bot/agent tool, telemetry event, or `SystemEvent` must update `.agents/docs/live/user-interaction-inventory.md` and the matching `tests/e2e/inventory/` fixture in the same change. Run `npm run test:e2e:inventory:coverage`; for UI or interaction changes, run `npm run test:e2e:inventory` or document the blocker.

---

## 2026-05-08 — Custody manifests must default outside the repo

**What happened**: The platform wallet tooling kept the actual keyring outside the Git worktree, but its default public-manifest output still pointed at a repo-local docs path. Even ignored metadata files create visible local artifacts and can drift back into packaging or review workflows.

**Why it mattered**: Custody backups and wallet manifests have different sensitivity, but neither should default into the GitHub-enabled app tree. Operators need active signer access in a locked host directory, while archive backups should stay offline with the owner.

**Fix**: Removed repo-local wallet manifests, deleted the temporary archive copy, and changed the platform wallet helper's default manifest path to the host-local signer directory.

**Rule**: Wallet tooling defaults must write keyrings, master keys, backup archives, and generated manifests outside the repo. Repo ignore rules can remain as a fail-safe, but normal operation should not populate custody artifacts in the worktree.

---

## 2026-05-08 — Desktop icon state needs one shared key registry

**What happened**: The WTF desktop rendered newer icons such as WTF IAM, WTF Arcade, and Game Studio, but the main desktop settings route still normalized icon layouts through an older local allow-list. Moving those icons appeared to work locally, then the saved settings response or later refetch dropped their coordinates and rehydrated them at defaults.

**Why it mattered**: Desktop icon movement has two state owners: immediate client drag state and persisted server settings. If either side has a different idea of valid icon keys, the UI can look interactive while persistence silently deletes part of the layout, creating rubberband/reset behavior that feels random to users.

**Fix**: Moved the first-party desktop icon layout keys into `shared/desktop.ts`, reused that registry from the settings route and MCP helper, added allow-list coverage in `shared/desktop.test.ts`, and made client layout hydration merge/clamp local state instead of rebuilding from stale settings during active edits.

**Rule**: Desktop icon definitions, server layout normalization, and agent/MCP layout helpers must share the same icon key registry. Client hydration should apply persisted layouts only when local icon edits are not in progress; resizes should clamp current positions instead of treating saved settings as a fresh source of truth.

---

## 2026-05-08 — Docker ignores must follow custody ignores

**What happened**: Platform wallet tooling had git ignore rules for keyrings, master-key files, host-local signer directories, and local public manifests, but Docker build context did not ignore the same custody artifact patterns.

**Why it mattered**: A file can stay out of git and still be sent to Docker, cached in build layers, uploaded by CI, or copied into intermediate images. Wallet custody has to be protected at every packaging boundary, not just source control.

**Fix**: Mirrored the platform wallet custody patterns into `.dockerignore` and logged the gap on the bounty board.

**Rule**: Whenever a new secret, keyring, local manifest, or custody-adjacent artifact is added to `.gitignore`, update `.dockerignore` and any release/archive packaging denylist in the same pass.

---

## 2026-05-08 — Platform wallets need custody boundaries, not secret sprawl

**What happened**: Expanding Arcade credits, creator earnings, refunds, rewards, buybacks, and contract admin flows would have pushed the old `WTF_OPERATOR_SIGNER_SECRET` pattern toward multiple raw hot-wallet env keys or a single overloaded operator wallet.

**Why it mattered**: Env-key sprawl increases rotation pain and leak blast radius, while one shared hot wallet makes role separation and audit trails mushy. The app needs wallet roles and public addresses, but it should not be able to read, print, or persist private keys.

**Fix**: Added a platform wallet keyring inside the isolated signer process. It creates Taquito-backed Tezos wallets, encrypts secret keys with host-local AES-256-GCM keyring storage, and keeps wallet creation/listing in server-local tooling instead of WTF OS UI routes.

**Rule**: New WTF platform wallets belong in the signer/keyring boundary and actual custody files belong outside git. The app may ask an already configured wallet to sign an allowed backend operation; wallet creation, keyring inspection, keyring backup, and master-key handling must remain direct server access only.

---

## 2026-05-08 — OS admin affordances need a registry, not per-page drift

**What happened**: The WTF OS had admin controls scattered across the central Admin page, feature-local moderator panels, desktop app gates, and route role metadata. New apps could be added to `PAGE_DEFS` or the desktop without receiving a native app settings screen, central admin entry, or challenge automation handle inventory. Client `isAdmin` also treated host/cohost as admin-like for visibility, which no longer matched the strict-admin request.

**Why it mattered**: Admin-only controls are part of the product surface and the monitoring/reward automation contract. If each app owns its own hidden admin affordance, the platform can drift into missing settings, incomplete challenge handles, and accidental staff visibility for screens that should only be available to the admin role.

**Fix**: Added a strict-admin WTF OS admin surface registry, native `AppWindow` admin/settings panel, central OS Admin tab, route-coverage audit, and strict client admin visibility for admin routes/screens.

**Rule**: Every new WTF OS route, sub-app, tool, or desktop item must add an admin surface registry entry with domain, subdomain, settings controls, admin-panel links, and automation handles. Admin-only visibility should use strict `role === "admin"` unless a screen is explicitly designed as a broader staff/moderator tool.

---

## 2026-05-08 — Reward automation needs a normalized event spine

**What happened**: Building challenge automation from the interaction inventory showed that direct side-quest/reward handlers are too narrow for the upgraded WTF surface. Messageboard posts, XP grants, wallet linking, desktop pet care, Tezos ownership checks, and future Arcade/map/game-show actions need one shared event and audit model instead of one-off challenge code.

**Why it mattered**: E2E generation, EXP/reward quests, activity monitoring, and cheat detection all depend on stable handles. If each reward rule is wired manually at the feature route, the app will drift back into latent schema values and untestable reward paths.

**Fix**: Added a DB-backed challenge automation engine with normalized `SystemEvent` ingestion, trigger/action registries, predicate evaluation, Tezos ownership predicates, idempotent completions/action logs, admin builder UI, and live hooks for messageboard posts, XP awards, wallet links, and desktop pet events.

**Rule**: New rewardable user activity should emit a normalized `SystemEvent` at the feature boundary and reuse registry-backed predicates/actions. Reward actions must go through existing reward services and idempotency logs, not route-local duplicate grant logic.

---

## 2026-05-08 — Interaction inventories must separate live triggers from latent schema

**What happened**: Re-examining the WTF interaction inventory after the Arcade, Game Studio, trusted creator, wallet, and rewards upgrades found that a route/schema mismatch could make future E2E and EXP work overstate coverage. The side-quest schema declares additional auto-verification types, but the live side-quest route only whitelists and implements a smaller set.

**Why it mattered**: The inventory is no longer just product documentation; it is an input to E2E generation, reward triggers, activity monitoring, and cheat detection. Schema-only or doc-only handles must not be treated as live rewardable interactions.

**Fix**: Rebuilt `docs/user-interaction-inventory.md` from current routes, schemas, reward modules, Arcade/Console/Game Studio boundaries, MCP tools, and monitoring tables. Marked latent auto-verification handles as a coverage gap and added a bounty item to track implementation alignment.

**Rule**: When an inventory will drive tests, rewards, or monitoring, derive it from live route handlers and persistence paths, not names alone. Explicitly label latent schema handles, compatibility routes, and manual-attestation flows so downstream automation does not assume they are fully implemented.

---

## 2026-05-08 — Wallet session memory is not a signer

**What happened**: The in-app marketplace could display a remembered Tezos wallet address after page refresh, then try to approve/purchase without a live wallet provider attached to the singleton Taquito toolkit. Taquito surfaced this as `No signer has been configured` even though the contract had previously accepted test purchases.

**Why it mattered**: A cached address proves only UI continuity, not signer readiness. In-app market and Arcade ticket checkout both rely on the WtfIAM cart path, so a refresh-session provider gap can block paid flows while making the contract look broken.

**Fix**: Added a signed-operation preflight that rehydrates or requests the active wallet account, attaches the wallet provider to Taquito before chain-id validation, and rejects account mismatches before sending. WTF checkout now revalidates the wallet before creating the payment intent.

**Rule**: Before any browser-originated Tezos write, prove three things in order: active wallet account, wallet provider attached to Taquito, and expected chain id. Never treat a localStorage wallet address as sufficient signer configuration.

---

## 2026-05-08 — RPC providers are release-critical infrastructure

**What happened**: ECAD RPC endpoints remained in WTF/Kiln-adjacent defaults even after notice that the provider would cease operation at the end of May 2026.

**Why it mattered**: RPC URLs are not passive documentation. Wallet preflight, contract sends, operator signing, domain helpers, and creation tools all depend on a live node provider, and a defunded endpoint becomes a scheduled production outage.

**Fix**: Replaced ECAD mainnet defaults with `https://rpc.tzkt.io/mainnet`, Ghostnet defaults with `https://rpc.ghostnet.teztnets.com`, updated local/env/template references, and verified both replacement chain IDs.

**Rule**: When a Tezos RPC provider is deprecated or scheduled to shut down, scan source, env templates, local env, generated runtime assets, and helper extensions in one pass. Verify replacement chain IDs before considering the migration safe.

---

## 2026-05-08 — Migration numbering is part of release readability

**What happened**: The Arcade migration slice introduced new files with `0060` and `0061` prefixes even though the repository already had Game Studio build and trusted creator migrations with those numbers.

**Why it mattered**: The production migration ledger keys by filename, so duplicate numeric prefixes may still run, but humans and future agents use those prefixes to reason about order. Reusing numbers makes deploy audits and references noisier than they need to be.

**Rule**: Before wrapping a migration-heavy pass, list the tail of `drizzle/` and ensure new migrations form a unique ordered sequence after existing files. Update docs and bounty notes whenever migration files are renumbered.

---

## 2026-05-08 — Compatibility aliases belong in source adapters, not the WTF SDK

**What happened**: After the Arcade/Console split, the Game Studio client was already publishing to WTF Arcade but still used Console-shaped state names for the creator's submitted Arcade games. The regular `/api/console/sdk.js` also exposed a legacy source compatibility global that only imported source games should need.

**Why it mattered**: WTF Arcade, WTF Console, and WTF Game Studio SDK are separate product surfaces. Compatibility for open-source/source-derived games is useful, but leaking legacy aliases through the normal WTF SDK makes creators and future agents think the old source surface is part of the core product API.

**Rule**: Keep legacy globals and route names inside compatible-source adapters only. Regular SDKs, Game Studio client state, MCP descriptions, admin labels, and public docs should use WTF-owned target-surface names: Arcade for public paid play, Console for personal owned media, and Game Studio SDK for creation.

---

## 2026-05-08 — Game Studio upload limits belong at draft-save time

**What happened**: Game Studio local assets were type/size checked during ZIP packaging, but project create/update accepted the local asset JSON first. A creator could save oversized or unsupported asset payloads into draft metadata and only hit validation later when building.

**Why it mattered**: The creator studio stores uploaded local assets as project state. Build-time validation protects public bundles, but draft-save validation protects database size, editor performance, and creator feedback loops.

**Rule**: Enforce Game Studio upload MIME, per-asset size, total-size, and base64 integrity at project save/update and again at packaging. Keep DTO reads lenient for old rows, but all new writes must use strict local-asset normalization.

---

## 2026-05-08 — Console catalog dedupe must use surface identity

**What happened**: Adding installed-manifest entries for stock Console games made them appear on every user's Console, but DB-backed stock rows for the same slugs could still appear beside them because the catalog deduped demos and published rows with different keys.

**Why it mattered**: A game can be correctly classified as stock and still render twice if the dedupe key follows storage origin instead of product identity. Every-user stock cartridges should be one library entry per slug, regardless of whether a DB row also exists.

**Rule**: Console catalog dedupe should key stock cartridges by `stock:${slug}` and only use origin/token keys for non-stock owned media. When adding stock manifest entries, smoke `/api/console/games` for duplicate stock slugs, not just presence.

---

## 2026-05-08 — Studio publish boundaries need Arcade-owned handoff names

**What happened**: After splitting WTF Arcade from WTF Console, Game Studio project publishing still kept a compatibility alias named for Console submission, called the shared Console bundle submitter directly, and stored `console*` keys in last-submission metadata even though the target surface was Arcade.

**Why it mattered**: Shared bundle validation is fine, but creator workflow ownership should read through the product domain the creator is actually using. If Studio talks directly to Console for public publish, future agents and UI code can accidentally route public creator games back into the personal Console surface.

**Rule**: Game Studio public publishing should hand off through Arcade-owned APIs/helpers and persist Arcade-named metadata. Keep Console bundle validators behind Arcade wrappers when reused, and reserve Console names for personal owned-media/export flows.

---

## 2026-05-08 — Source-route rebrands need read-time normalization

**What happened**: The Arcade source-import code wrote new `/api/arcade/source/*` paths, but existing database rows still emitted legacy Console compatibility paths through the public Arcade catalog until a migration or refresh touched them.

**Why it mattered**: Rebranding code is not enough when public DTOs are backed by durable rows. Users and agents can still see stale product language or stale routes from old data, and the UI can launch through the wrong surface even though new imports are correct.

**Rule**: Any source-route/product-language migration needs both a database migration and a read-time normalizer at the DTO boundary. Keep legacy strings readable only inside compatibility adapters, never in public catalog payloads.

---

## 2026-05-08 — MCP tool registration must match capability and scope contracts

**What happened**: The Arcade MCP server registered play-status and manual source-import tools, but the capabilities payload did not advertise them. The read-only Arcade play-status tool also required a market read scope even though the default paired token only needs Arcade read access to answer whether the user can play.

**Why it mattered**: MCP tools can exist but still be effectively invisible or awkward for agents if discovery payloads and scope requirements drift. That weakens the agent workflow exactly where MCP is meant to make domain actions obvious.

**Rule**: When adding an MCP tool, update the capabilities tool list, public access docs, and scope contract in the same pass. Read-only tools should require the narrowest domain read scope that matches the data they return.

---

## 2026-05-08 — Console stock classifiers need installed-manifest parity

**What happened**: The Console/Arcade surface classifier correctly reserved `inverse-snake` and `backwards-pong` as stock Console games, but the installed game manifest did not list them even though their files existed under `public/games/wtf/*`.

**Why it mattered**: A surface classifier can say a game belongs on every user's Console while the catalog still cannot show it. That creates a subtle product split bug where stock games disappear locally, and Arcade filtering looks correct only because the missing games never enter either catalog.

**Rule**: When adding or changing stock Console slugs, update the installed manifest, fallback cartridge list, and surface tests together. The classifier, shipped files, and catalog manifest must agree before the Console/Arcade split is considered verified.

---

## 2026-05-07 — Public lazy routes must load their shared browser vendors

**What happened**: Making WTF Arcade publicly routable exposed a crash in the shared ZIP game loader. The loader imported the vendored JSZip UMD bundle as an ES default export, but the browser module only executed as a side-effect/global script, so the Arcade window failed before rendering.

**Why it mattered**: Auth-gated routes can hide lazy-load crashes until a feature becomes public. A route can pass API checks and typecheck while still failing the first time the browser imports a shared runtime dependency.

**Rule**: When opening a previously auth-gated/lazy game route to public users, run a browser smoke on the route itself. For vendored UMD browser scripts, import them as side effects or namespace modules and resolve the global they install; do not assume they provide an ES default export.

---

## 2026-05-07 — Product naming needs a compatibility boundary

**What happened**: The Console source-import work correctly preserved open-source attribution, but user-facing labels started treating the upstream project name as the WTF product name. That made the feature sound like a borrowed surface instead of WTF's own arcade experience built from compatible source material.

**Why it mattered**: Attribution and branding are different concerns. We need to credit upstream MIT/source origins without giving away the product language, navigation, stats, admin buttons, or MCP workflows to the upstream name.

**Rule**: Keep upstream names inside compatibility adapters, source URLs, and provenance evidence only. User-facing surfaces should use WTF-owned product language, with attribution phrased as "built on" or "source" context when needed.

---

## 2026-05-07 — Discovery mappers should type selected DTOs, not whole table rows

**What happened**: The Console discovery shelf query selected only the fields needed for public cards, but the first mapper type was widened to the full `console_games` row shape. Runtime behavior was fine in intent, but TypeScript correctly rejected mapping a skinny selected DTO through a full-row function.

**Why it mattered**: Modular discovery/read-model queries should stay small. If their mapper types pretend to receive full table rows, future agents either over-select columns to satisfy types or weaken type safety with casts.

**Rule**: For read-model modules, type mapper inputs to the exact selected DTO shape. Keep full table row types for full-row adapters only, and let TypeScript catch accidental coupling between public shelves and private/admin fields.

---

## 2026-05-07 — Build warnings can expose duplicate package script ownership

**What happened**: After adding console/studio slices, the production build still succeeded but esbuild warned that `package.json` contained two `creation-tools:check` script keys. The duplicate came from parallel app/tooling additions and would make the effective script depend on whichever key survived JSON parsing.

**Why it mattered**: Duplicate JSON keys are easy to miss because TypeScript and many runtime paths continue working. They still create ambiguous ownership and noisy builds, which makes real bundle warnings harder to spot.

**Rule**: When a build emits duplicate-key warnings, treat them as integration debt before final verification. Keep one canonical script entry near its owning domain and remove duplicate script keys instead of tolerating warning noise.

---

## 2026-05-07 — Direct creator submissions need source-specific provenance builders

**What happened**: Adding direct Game Studio project submission to Console introduced a second bundle source beside media-library ZIPs. The first integration pass accidentally called media-token provenance from the direct bundle update path, and MCP/route schemas used the old one-argument `z.record(...)` form against the repo's current Zod types.

**Why it mattered**: Game Studio builds and media-library token imports have different attribution evidence. Mixing their provenance builders can either fail typecheck or, worse, imply token provenance for a project-built bundle that should instead carry project/build snapshot evidence.

**Rule**: When adding a new submission source, keep source-specific metadata/provenance construction at the boundary: media imports build token provenance, project builds carry project/build/source snapshots, and Console stores whichever normalized evidence it receives. Run typecheck before smoke testing new MCP schemas because Zod record signatures can differ across major versions.

---

## 2026-05-07 — Trusted creator bypasses need explicit domain permissions

**What happened**: Console version moderation was gaining a pending-review path, but the product model also needs an admin-assignable trusted creator lane for creators who should not wait on manual review every time they publish. Treating that as an implicit staff shortcut would have blurred admin power with creator trust.

**Why it mattered**: Trusted creator status is not the same as moderation authority. A creator may be allowed to auto-publish their own Console game, TV channel programming, or in-app store item submissions without gaining access to user management, role management, rewards, or global moderation.

**Rule**: Model creator bypasses as explicit domain permissions under a non-staff role. Keep each bypass narrow, auditable, and actor-bound: trusted creators can fast-track their own creations, while staff permissions remain separate.

---

## 2026-05-07 — Open-source game imports need visible attribution, not just compatible playback

**What happened**: The Hackcade import path correctly used public API data and a same-origin compatibility bridge, but the public console card did not yet surface source/platform/license attribution. The Game Studio create route also accepted saved project metadata without preserving first-save edited files, which would make creator builds less auditable.

**Why it mattered**: MIT/open-source imports are allowed to be reused, but the product should make provenance obvious to players, creators, admins, and future agents. Creator builds also need a durable source snapshot so review and resubmission decisions can be traced.

**Rule**: Any third-party open-source game import must carry source URL, source platform, creator/builder identity, and license metadata through catalog DTOs, version metadata, audit events, and UI. Any creator build flow must save the exact source files before packaging and store build checksum/source-snapshot evidence.

---

## 2026-05-06 — Full send means production, not local verification

**What happened**: The user said "full send" after a crawler/embed integration pass. I implemented and verified the changes locally, restarted the local dev server, and reported the work as complete without deploying to production.

**Why it mattered**: The repo already defines "full send" in `AGENTS.md` as taking the work all the way live through the normal production path. Stopping at local verification creates exactly the branch/deploy ambiguity the instruction exists to prevent.

**Fix**: Strengthened `AGENTS.md` with an explicit full-send completion checklist: relevant change on `main`, pushed to `origin`, production deploy completed, live site smoke-tested, and final response includes the production URL plus live verification.

**Rule**: When the user says "full send", do not call the work done until it is live in production and verified there. If deployment cannot be completed, say what is pending and why; never let "local", "branch", "main but not deployed", or "pushed but not live" masquerade as complete.

---

## 2026-05-06 — Tezos donor tools need confidence-bearing grafts, not page transplants

**What happened**: Tezos Open Tools had useful P&L and marketplace logic, but copying the donor pages into WTF would have bypassed WTF's existing DB-first analytics, wallet preflight, and upstream rate-limit controls. The P&L donor code also needed a stricter distinction between priced purchases/mints and gift/free-transfer evidence so the dashboard would not invent profit from unknown basis.

**Why it mattered**: Tezos analytics are only useful when the user can see evidence quality. A dashboard number that silently mixes latest-buy assumptions, duplicate sale rows, free transfers, BIN-trap floors, and external marketplace data looks precise while still being structurally suspect.

**Fix**: Added a native FIFO lot-costing engine, fed it from WTF's existing holdings/sales/mints/events/acquisition-lots tables, exposed confidence and exclusion labels on Dashboard, routed recent sale P&L through the same lot engine, preserved full external marketplace contract addresses, added linked-wallet external listing cancellation through WTF wallet preflight, and moved TzKT operation verification to the shared upstream client.

**Rule**: When grafting external Tezos tools into WTF, transplant the durable organ: pure costing/operation/query logic plus evidence labels and shared infrastructure hooks. Do not mount donor app pages as standalone tools, and never let a signed operation bypass `assertNetworkReadyForSend` or a server chain read bypass `server/lib/upstream.ts`.

---

## 2026-05-06 — Gallery token actions need canonical MIME routing and one import spine

**What happened**: My Gallery exposed external marketplace links on token detail cards, but it did not expose local "add to my videos/photos/games" operations. The media-library import path already preserved raw token metadata and token contract/id for attribution, but gallery cards were not using it, and ZIP game cartridges were not extractable through that path.

**Why it mattered**: If gallery actions bypass the media-library import route, WTF can end up with displayable media that no longer carries creator, collection, mint, contract, or token-id provenance. If MIME routing trusts preview formats instead of the artifact MIME, a token can be sent to the wrong domain or fail to become a local object at all.

**Fix**: Gallery card actions now route video/GIF, still-image, and ZIP game tokens through `/api/media/import-token`. The shared token media resolver recognizes ZIP cartridge artifacts, media-library import can extract game assets while storing raw metadata, and My Games reads locally imported game media alongside wallet-detected cartridges. External objkt/Teia/TzKT links are rendered as buttons without changing their destinations.

**Rule**: Gallery-to-local media actions must use the canonical media-library import path and determine the target domain from the artifact MIME, not preview thumbnails. Always preserve raw token metadata plus contract/token id on import so downstream TV, studio, editing, and game surfaces can attribute the creator and collection correctly.

---

## 2026-05-05 — Schema domain candidates need lower branches before barrel integration

**What happened**: Studio looked ready to integrate as a schema module, but it depended on `dmConversations` still owned by `shared/schema.ts`. Integrating Studio directly would have created a `schema.ts -> schema-studio.ts -> schema.ts` cycle.

**Why it mattered**: Large schema breakup is not just copying tables into files. Dependency direction decides whether agents can safely work in parallel, and a single barrel import inside a domain module turns the compatibility wrapper back into a hidden monolith.

**Fix**: Extracted `shared/schema-dm.ts` first, retargeted Studio to that lower branch, then integrated Studio, wallet/cockpit, analytics, recapture/operator, liveops, and session domains behind a 90-line `shared/schema.ts` barrel. Duplicate-owner, barrel-import, typecheck, and whitespace checks passed.

**Rule**: Before integrating a schema candidate, scan its imports for `./schema` or `@shared/schema`. If a candidate needs another branch still in the barrel, extract that lower branch first and only then re-export both through the compatibility barrel.

---

## 2026-05-05 — Tab extraction integration must audit wrapper-only leftovers

**What happened**: After the final Admin Studio and WTF.tez tabs moved into feature modules, the wrapper import cleanup removed `GroupBox` even though the wrapper Overview panel still used it. A parallel typecheck also surfaced a worker-created error display where an `unknown` mutation error was rendered directly.

**Why it mattered**: A tab module can be behavior-preserving and type-safe in isolation while the page wrapper still owns small shared UI pieces. Import cleanup and error rendering are integration concerns, so they need a wrapper scan after every batch of tab cuts.

**Fix**: Restored the wrapper-only `GroupBox` import, converted the WTF.tez mutation error to a string before rendering, and reran `npm run check -- --pretty false` plus `git diff --check`.

**Rule**: After batch-extracting tabs, scan the wrapper for remaining JSX component names and helper references before trimming imports. Never render an `unknown` mutation error directly; normalize it to a string or typed `Error` message first.

---

## 2026-05-05 — Shell extraction must keep layout constants tied to moved nav data

**What happened**: After extracting W's panels and reducing the nav to four active views, the shell grid still reserved five columns. Typecheck passed because this was a layout constant, but verifier review caught the stale empty slot.

**Why it mattered**: Monolith breakup often moves visible data and leaves small styling assumptions behind. Those stale constants make the extracted UI look half-moved even when behavior is intact.

**Rule**: When extracting shell/nav components, audit the paired layout constants with the moved data source. View counts, grid tracks, tab widths, and hard-coded slot counts must change in the same slice as the nav model.

---

## 2026-05-05 — Extracted hooks should preserve setter types exactly

**What happened**: During the TV queue-advance extraction, the new hook initially typed the active-bumper setter as `StateSetter<unknown>`. That looked harmless because the hook only writes `null`, but React setters are invariant enough that the real `Dispatch<SetStateAction<BumperPoolItem | null>>` could not be assigned to it.

**Why it mattered**: Mechanical hook moves can introduce type churn even when runtime behavior is unchanged. A loose generic setter type makes the extraction fail at the boundary instead of proving the moved logic is behavior-preserving.

**Rule**: When extracting React controller hooks, type state setters with the exact state shape owned by the caller. Avoid `unknown` or overly broad setter aliases for values that are wired through typed component state.

---

## 2026-05-05 — Feature-tab extraction types should avoid ambient JSX namespace assumptions

**What happened**: While extracting the Admin Round Library tab into its own module, the new prop type for the injected confirmation button used `JSX.Element`. The project typecheck failed because that module did not have the global `JSX` namespace available under the current TypeScript/react configuration.

**Why it mattered**: A behavior-preserving component move can still break the build if extracted modules depend on ambient types that are not consistently exposed. These are easy to miss when the JSX itself renders correctly but the type annotation is too specific to the old context.

**Fix**: Use an explicit React type import such as `ReactElement` for component-returning callback props in extracted tab modules.

**Rule**: When moving JSX into a feature module, prefer explicit React type imports for public prop signatures instead of relying on the ambient `JSX` namespace.

---

## 2026-05-05 — Cross-desktop toys need hidden ownership and real purchase caps

**What happened**: Desktop toys are visible and chaotic, but their ownership and routing cannot be treated as client-owned cosmetic state. A transferred ball also touches the in-app marketplace, so a "limit 3" rule enforced only by the care tray would be easy to bypass with direct API calls or chain-sync grants.

**Why it mattered**: Neighbor desktop travel only works if users see anonymous local visitors, while the server keeps the original owner and topology private. Marketplace-backed toys also become durable inventory, so caps must live on the server purchase/grant path as well as in the UI.

**Fix**: Added anonymous ball visitors to the server-owned desktop world, retained toy owner ids only inside server visitor records, and capped pet-ball cart creation, EXP checkout, and WTF sync grants at three owned balls. The client only receives local toy instructions and treats visitor balls as playable desktop objects without exposing their source user.

**Rule**: Any cross-user desktop object must carry hidden ownership server-side and expose only anonymous render data client-side. Any live game inventory cap must be enforced on every grant path, not just disabled in the purchasing UI.

---

## 2026-05-05 — Hidden shared-world simulations need server-owned topology and anonymous visitors

**What happened**: Turning desktops into connected map tiles could have leaked the hidden topology if the client knew neighbor ids, coordinates, or routing data. It also could have kept moving entities while nobody was watching, which would make the ambient desktop toys feel like mysterious background state drift.

**Why it mattered**: The feature only works if each user sees their own desktop as the whole visible world. Ants and runaway pets can cross boundaries, but the exact desktop-to-desktop mapping must remain server-side and interactions should happen only while at least one involved desktop is active.

**Fix**: Added a server-owned in-memory desktop world that hashes users into hidden tiles, accepts active-viewer heartbeats, and returns only anonymous visitor instructions with entry/exit edges. Ant traffic is issued only around active food sources and active neighbors; guinea pig escapes target only the closest active neighbor and otherwise fail into no movement.

**Rule**: For hidden topology systems, never send map coordinates, neighbor ids, or route graphs to the client. Clients should render anonymous local effects from server-issued visitor instructions, and the server should gate simulation work on active presence so offscreen/no-viewer state stays effectively frozen.

---

## 2026-05-04 — Desktop pet derived health must persist through existing JSON state

**What happened**: Adding sickness, poop exposure, medicine, and rest tracking to the hamster model would have been easy to lose on the next save because `desktop_pet_states` only has fixed stat columns plus `interaction_counts` JSON. Any route that wrote the old `interactionCounts` shape could silently drop the derived health fields.

**Why it mattered**: The care loop depends on state that is not just cosmetic: sickness risk must keep growing while the pet is dirty, medicine/rest progress must survive refetches, and death cleanup needs a consistent snapshot. If hidden state is only held client-side or only in a TypeScript object, it evaporates during normal persistence.

**Fix**: Store health metadata in reserved `interaction_counts` keys, normalize those keys back into `HamsterState`, and serialize them on every pet-state write. Server and MCP pet paths both need the same conversion layer so alternate control surfaces do not regress the pet model.

**Rule**: When expanding a persisted game/pet state without a schema migration, define explicit reserved JSON keys and update every persistence adapter in the same pass. Add round-trip tests for the new fields before wiring UI behaviors to them.

---

## 2026-04-30 — Timeline and DM credit explosion from live-heavy design

**What happened**: The W microapp had almost no durable persistence for the two most expensive paths: timeline (`/api/w/timeline`) and DM/groupchat reads. Timeline was entirely in-process memory + client refetch every 60s. DM paths had good DB tables but many routes still preferred live X calls, with short in-memory caches that cleared on restart. Every reboot, tab switch, or refresh triggered full X API calls, rapidly burning credits (especially when the user was testing heavily).

**Why it mattered**: X Pay-Per-Use pricing makes every `/users/{id}/tweets` and `/dm_conversations/.../dm_events` call expensive. Without DB-first reads and longer cache TTLs, the app became a credit black hole. The "no posts on timeline" symptom was the direct result of the bearer token expiring after credit exhaustion.

**Fix**: 
- Added `x_timeline_posts` table with indexes for fast lookup by author and time.
- Made `/api/w/timeline` DB-first (`loadTimelineFromDb` before any live call), with automatic persist on successful live fetch.
- Increased DM/groupchat cache TTLs (fresh 10min, stale 4h for public mirror).
- Forced groupchat route to DB-only path for all users (public read-only mirror).
- Updated types, diagnostics, UI labels ("Cached for Credit Efficiency"), and added staleness indicators.
- Strengthened spam filtering (1-participant = ignore) and ensured per-user OAuth isolation.
- No changes to OAuth paths (only platform token for timeline/public groupchat, user tokens for private inboxes).

**Rule**: For any Pay-Per-Use API, default to DB-first reads with background writers. In-memory cache is only a hot layer on top of durable storage. Always expose cache age and rate-limit status to the user. Measure credit burn before adding polling or frequent refreshes. This pattern (DB cache + background sync + visible staleness) is the battle-tested way to keep social features affordable.

**Impact**: Timeline and groupchat now survive restarts and heavy use with near-zero incremental credit cost. DM inboxes remain private and user-scoped.

---

## 2026-05-02 — SmartPy FA2 layout and test fixture types matter

**What happened**: The WTF -> XTZ exchange initially used an FA2 transfer record without the exact FA2 Michelson layout, so `sp.contract(..., entrypoint="transfer")` failed against the SmartPy FA2-library dummy with `FA2_TRANSFER_ENTRYPOINT_MISSING`. The first test fixture also wrapped `sp.test_account` objects inside `sp.record`, which produced a SmartPy interpreter assertion during scenario calls.

**Why it mattered**: FA2 compatibility is not just field names; Michelson pair layout must match. A dummy token that is too loose can hide the exact failure mainnet users would see. Test fixtures should keep Python-side actors as Python objects, not on-chain record expressions.

**Fix**: The exchange transfer types now use the standard FA2 layouts `("to_", ("token_id", "amount"))` and `("from_", "txs")`. The dummy WTF token now uses the SmartPy FA2 library single-asset implementation. Test accounts are carried in a Python `SimpleNamespace`.

**Rule**: For SmartPy contract-to-contract calls, always declare external entrypoint parameter types with the target contract's exact layout and test against a standards-based counterparty. Keep scenario/test helper objects out of `sp.record` unless they are actual contract parameters.

---

## 2026-04-30 — W timeline: search ingest + ID rows + oEmbed (credit floor)

**What happened**: Even DB-first timeline still burned credits when every cache miss fanned out to `/users/{id}/tweets` for up to N handles.

**Fix**: Background job `w-timeline-search-ingest` uses a small number of `/tweets/search/recent` queries (`from:user OR …`, minimal `tweet.fields`, global `since_id` in `x_timeline_cursors`), persists tweet IDs into `x_timeline_posts`, and `/api/w/timeline` reads DB first and hydrates missing text via free `publish.twitter.com/oembed`. Legacy bearer fan-out remains behind `USE_LEGACY_TIMELINE_FANOUT`; `?source=search` forces the low-credit path only.

**Rule**: Prefer one batched search (or few chunked queries) over N per-user timeline calls; store IDs; serve text from oEmbed or prior full fetch. Cursor + TTL keep rows bounded.

---

## 2026-05-02 — Kiln must fail closed when runtime evidence is missing

**What happened**: Kiln's architecture was growing toward a full Tezos product-system rig, but several surfaces still looked more capable than they were: Etherlink testnet metadata pointed at the old Ghostnet-era rail, `/api/kiln/capabilities?networkId=...` returned the server default instead of the requested network, Shadowbox mock mode could produce a passing-looking result, and Tezos execute/E2E calls had no way to attach mutez for payable entrypoints.

**Why it mattered**: NFT marketplaces and token swaps fail at integration boundaries: payable XTZ calls, FA2 operator approvals, multi-contract address wiring, storage reads, indexer reads, and wallet/network mismatches. A green result from a structural simulator or stale network card would send builders into Shadownet or mainnet with false confidence.

**Fix**:
- Updated the sibling Kiln app's active Etherlink test rail to Etherlink Shadownet metadata and left old Ghostnet testnet as planned/legacy.
- Added `amountMutez` plumbing through execute and E2E APIs into Taquito `{ amount, mutez: true }` send options.
- Added browser-scoped `kiln.project.json` workspace modeling and a project file/graph panel without host filesystem access.
- Made Shadowbox mock mode fail closed and made the current single-contract runner reject unsupported multi-contract targets/assertions instead of pretending to test them.
- Made capabilities resolve the requested network and added explicit no-stub status fields.

**Rule**: A Tezos test rig feature is not "supported" until it executes in the relevant runtime and has automated evidence. Mock simulation can be useful as a lint-like signal, but it must never grant Shadowbox clearance or stand in for payable, multi-contract, storage, balance, big-map, wallet, or indexer behavior. Stale network metadata is a deploy blocker, not a cosmetic bug.

---

## 2026-05-02 — Same-origin assets must bypass Kiln's external CORS allowlist

**What happened**: Browser verification of the sibling Kiln app at `http://localhost:3001/#build` loaded only the HTML shell. The JavaScript and CSS asset requests returned HTTP 500 because Chrome sent `Origin: http://localhost:3001` on `crossorigin` module/script/style fetches, while Kiln's CORS middleware checked only `CORS_ORIGINS` and rejected localhost. The page body stayed empty, and the browser console reported strict MIME failures because Express returned HTML error pages for asset URLs.

**Why it mattered**: The no-stub rule applies to the tooling UI too. A contract builder cannot be considered browser-verified if the app shell silently fails before React hydrates. Same-origin requests are not cross-site exposure and should not be blocked by an external-origin allowlist.

**Fix**: The sibling Kiln app now allows an origin whose host exactly matches the request `Host` header before checking the configured external CORS allowlist. A server test covers `Origin: http://localhost:3001` with `Host: localhost:3001` while `CORS_ORIGINS` is set to a different production domain.

**Rule**: App-wide CORS middleware must never reject same-origin asset or API requests. If Vite emits `crossorigin` assets, test local and deployed pages with a real browser and check that `/assets/*.js` and `/assets/*.css` return their correct MIME types.

---

## 2026-05-02 — Observability failures must not bury the actual Kiln failure

**What happened**: While verifying Kiln locally, every browser request tried to append to `/var/log/kiln` and failed with `EACCES`. The repeated activity-log stack traces flooded the server output and made it harder to see the meaningful runtime failure.

**Why it mattered**: Kiln's job is to preserve evidence for contract compile, Shadowbox, Shadownet, wallet, and indexer failures. If the logger itself spams on every request, it damages the audit trail instead of helping it.

**Fix**: The sibling Kiln activity logger now reports only the first console error for each distinct write-failure path/code. A unit test forces an unwritable log path and verifies repeated writes do not spam the console.

**Rule**: Logging and telemetry paths must fail noisy once, then stay quiet unless the failure changes. For deployment tools, evidence capture cannot become the loudest failure in the room.

---

## 2026-05-03 — Deploy Kiln through the runtime that actually serves production

**What happened**: `kiln.wtfgameshow.app` is served by the native Hetzner/systemd path, not the Netlify rollback path. The public app stayed stale until the Kiln changes were committed to `origin/main` and the host script pulled, rebuilt, pruned, and restarted `kiln.service`. A side check of `npx netlify status` failed because the local npm cache has root-owned files, but Netlify was not the live serving path.

**Why it mattered**: A successful local build or a Netlify-oriented deploy check would not update the real public Kiln service. The only meaningful production proof here was the host deploy log plus public API/browser probes against `https://kiln.wtfgameshow.app`.

**Fix**: Commit `09ca113` was pushed to `origin/main`, `scripts/server-deploy.sh` was run on the Hetzner host, `kiln.service` passed health, and public verification confirmed Etherlink Shadownet metadata, requested-network capabilities, the new `index-D3yZ8s-r.js` frontend bundle, and the `Project workspace` UI.

**Rule**: Before declaring a deploy done, identify the actual serving path, deploy through that path, and verify from the public URL. Rollback paths are useful but do not count as production deployment evidence unless the DNS/service is actually using them.

---

## 2026-05-03 — Kiln API auth needs a reversible product-mode switch

**What happened**: Kiln's protected routes required an API token whenever `API_AUTH_TOKEN` was configured. That made sense as a default, but it also meant the public builder UI could be blocked by missing/inlined client token config while the product is still in open pre-product testing.

**Why it mattered**: The meaningful risk is not user wallet custody: connected-wallet users still approve every wallet operation themselves. The meaningful platform risk is server-side puppet wallet and runtime access: public callers can spend Bert/Ernie Shadownet funds, originate throwaway contracts, consume RPC/runtime resources, and hit Shadowbox/API rate limits.

**Fix**: The sibling Kiln app now has `KILN_API_AUTH_REQUIRED`. Leave it blank for legacy behavior, set `false` for open public builder mode while keeping `API_AUTH_TOKEN` configured, or set `true` to force token auth and fail closed if the token is missing. `/api/health` and `/api/kiln/capabilities` expose only auth mode/status, never the token.

**Rule**: Feature-gate public test infrastructure with explicit reversible modes. Do not delete secrets just to open access temporarily; keep a one-line rollback path and expose non-sensitive status so production can be verified from the outside.

---

## 2026-05-03 — Open Kiln mode needs public protected-route verification

**What happened**: After adding `KILN_API_AUTH_REQUIRED`, production still reported token mode until the Hetzner host env was explicitly changed and `kiln.service` was restarted. The desired public behavior also inverted the old security check: unauthenticated 401 was no longer proof of correctness once the user intentionally chose open Shadownet builder mode.

**Why it mattered**: In open mode, the risk model shifts from "is the API locked?" to "is public Shadownet puppet/runtime access intentional, visible, rate-limited, and reversible?" Health alone is not enough; a formerly protected route must be probed without a token to prove the runtime is actually open.

**Fix**: Production was set to `KILN_API_AUTH_REQUIRED=false` while keeping `API_AUTH_TOKEN` configured for rollback. Public verification confirmed `/api/health` reports `auth.required=false`, `auth.mode=open`, and `auth.tokenConfigured=true`; unauthenticated `/api/kiln/balances` returns HTTP 200 with Bert/Ernie Shadownet balances.

**Rule**: When changing auth posture, verify both the status endpoint and one real protected endpoint from the public URL. Record the rollback command/config path and update the bug board because the operational risk changes even when user wallet custody is unaffected.

---

## 2026-05-03 — TV uploads need a channel-scoped playback path, not raw library IDs or external-cache treatment

**What happened**: The TV stack blurred together three different concerns: private media-library file access, public channel playback, and the external HTTP cache/probe pipeline. Upload-backed media was stored behind internal `staging://` / object-storage state, then exposed through generic `/api/media/:id/file` ids or fed into helpers that only understand public HTTP/IPFS media. At the same time, the WTF auto-refresh path treated the canonical dial-03 creator channel as a platform-wide aggregate whenever config fell back to `all_users`.

**Why it mattered**: That mixup created privacy leakage, brittle upload playback, useless same-origin prefetch/probe work, and semantically hijacked a creator-owned channel into an "everything bucket". It also prevented the TV surface from cleanly using Hetzner object storage with the mounted volume as a hot cache, because uploads were not flowing through a context-aware storage-serving route.

**Fix**:
- Split private library access from public TV playback: `/api/media/:id/file` is now owner/staff-only, while public TV playback uses `/api/tv/channels/:channelId/media/:mediaItemId/file`.
- Route upload-backed TV playback through the shared storage resolver so object-storage objects are promoted into the hot-cache volume on demand.
- Rewrite TV stream, `/now`, and slug-current responses to emit channel-scoped same-origin playback URLs for upload-backed items.
- Require auth + dedicated rate limits for TV cache prefetch, and narrow the generic media rate-limit bypass to actual read-only playback routes.
- Force canonical dial 03 (`paulwhoisaghost` / `paulwhoisaghost-wtf-tv`) back to owner-scoped media unless config explicitly names users or wallets.

**Rule**: For upload-backed media, always separate private library file access from public playback. Same-origin stored media must go through a context-aware route backed by the storage resolver, and any cache/probe pipeline that assumes public HTTP should skip those files. Canonical owner channels also need explicit scope guards so a permissive `all_users` default cannot silently turn them into platform-wide aggregate feeds.

---

## 2026-05-03 — TV cache must use object storage as the warm tier and IPFS only as last resort

**What happened**: Even after upload-backed playback was fixed, the general TV cache still treated public IPFS/external fetch as canonical for token media. The attached volume acted as a hot cache, but if the file fell out of local cache the next miss went straight back to IPFS. Warm cache hits also did nothing to backfill object storage, so the system kept relearning the same media from the slowest source.

**Why it mattered**: That defeats the whole architecture. The point of the attached volume is low-latency serving, and the point of Hetzner object storage is a faster, persistent warm tier so the app can recover from local eviction or restart without begging public gateways again. If IPFS stays the primary delivery source, TV smoothness remains hostage to gateway luck.

**Fix**:
- Added deterministic TV cache object keys under `tv-cache/v1`.
- TV cache fills now mirror into object storage.
- Local cache misses now try object-storage promotion before any IPFS/external fetch.
- Warm-cache hits queue backfill so existing volume-resident media also gets mirrored.
- The serving model is now volume first, object storage second, IPFS/external host last.

**Rule**: For TV media, public IPFS/external URLs are ingest sources, not the delivery backbone. Always design the playback pipeline as hot local volume -> mirrored object storage -> external source of truth last. If a warm-hit path does not also backfill the object store, the architecture is incomplete.

---

## 2026-05-03 — Compose env interpolation can silently blank secret-backed runtime config during deploy

**What happened**: The server had valid object-storage secrets in `/etc/wtf/wtf.env`, but the deploy path recreated the app container with empty `S3_*` values anyway. Two things combined into the bug: the deploy user could not directly read the root-owned runtime env file, and `docker-compose.yml` redundantly set `S3_*`/`GDRIVE_REMOTE` in the `environment:` block with `${VAR:-}` defaults. Compose interpolated those before the protected runtime file was available, then the empty `environment:` entries overrode the real `env_file` values.

**Why it mattered**: The app stayed superficially healthy while losing object storage at runtime. For TV, that meant the new storage architecture silently collapsed back to slower external media fetches right after deploy, exactly when stability mattered most.

**Fix**:
- Removed empty-string overrides for `S3_*`, `GDRIVE_REMOTE`, and `RCLONE_CONFIG` from compose.
- Added `scripts/server-deploy.sh` to materialize a temporary readable copy of `/etc/wtf/wtf.env` for Compose and to source it for build/runtime interpolation.
- Moved production deploy to that script and removed `drizzle-kit push --force`.

**Rule**: Never duplicate secret-backed runtime variables in Compose `environment:` with empty defaults when those same keys come from an env file. If the real env file is root-protected, the deploy path must explicitly materialize or source a readable copy for Compose, or you will ship a “healthy” container with silently blank critical config.

---

## 2026-05-03 — Deploy metadata must come from the checked-out repo, not inherited host env

**What happened**: The first live run of `scripts/server-deploy.sh` built and restarted the correct checked-out code, but the app still reported `commitRef: "33350da"` after deploy because the script honored an inherited `COMMIT_SHA` from the host environment instead of forcing the current repo HEAD.

**Why it mattered**: That kind of mismatch poisons release verification. Operators think they are looking at one revision while the health endpoint reports another, which is how people lose hours chasing phantom “stale deploys” that are really stale metadata.

**Fix**:
- Changed `scripts/server-deploy.sh` to always set `COMMIT_SHA` from `git rev-parse --short HEAD` after checkout.
- Re-deployed and verified that `/api/health` now reports the real live commit.

**Rule**: Deploy labels must be derived from the exact checked-out revision being built, never from ambient host env. If a deploy script allows inherited commit metadata to win, your health endpoint becomes a liar.

---

## 2026-05-04 — TV resilience cannot live in the hidden route, and skip lists must actually drive scheduling

**What happened**: The canonical `/tv` route was still missing the item-end telemetry and skip-notice UX that existed in hidden `/tv2`. Worse, the experimental path's per-session skip list looked like hardening but was half fake: failures were counted, but queue advancement did not actually consult the skip list, so blacklisted clips could come right back on the next loop.

**Why it mattered**: That is the worst kind of patchwork: a safer path exists, the live path doesn't use it, and even the "better" path contains dead-state resilience that makes operators think the product is self-healing when it isn't. Viewers still sit through repeat failures, and telemetry understates how broken the loop really feels.

**Fix**:
- Backported skip-notice UX plus `/api/tv/telemetry/item-end` reporting into `client/src/pages/TV.tsx`.
- Patched both `TV.tsx` and `TV2.tsx` so queue advancement skips session-blacklisted items instead of only recording them.

**Rule**: Reliability logic is not real until the production route uses it and the scheduler actually honors it. A skip list that never influences next-item selection is theater, not resilience.

---

## 2026-05-04 — TV write-path integrity belongs in unique indexes and row locks, not polite preflight reads

**What happened**: The TV backend still trusted app-layer prechecks in two places that should have been database-enforced invariants: adding a channel video did a select-then-insert dedupe dance, and active playlist flips toggled peer rows without any per-channel lock or unique active constraint.

**Why it mattered**: Under concurrency, those patterns rot immediately. Two requests can both "see nothing" and then collide, or two playlist activations can interleave and leave split-brain active state. That kind of bug is extra nasty because it only shows up when the system is busy, which is exactly when TV has the least room for nonsense.

**Fix**:
- Reworked channel-video creation around insert-first upserts backed by the existing unique keys, with fallback reconciliation on alternate-key conflicts.
- Added a partial unique index for one active playlist per channel and wrapped active-playlist mutations in channel-row locks inside a transaction.

**Rule**: If a TV invariant matters to playback, put it in the database and serialize the write path around it. "Check first, then write" is not a concurrency strategy.

---

## 2026-05-04 — A rolling telemetry window must expire evidence inside hot buckets, not just delete cold buckets

**What happened**: TV playback telemetry tracked distinct error sessions in a plain `Set` per item and only pruned whole buckets when an item went fully cold. A video that kept receiving any traffic could retain hour-old error sessions forever, and a noisy client could also manufacture arbitrary item ids and session ids to grow those maps.

**Why it mattered**: The code called itself a rolling window, but it was lying. Memory could climb under churn, blacklisting could stay sticky for the wrong reasons, and the protection path itself became an availability risk.

**Fix**:
- Moved TV telemetry into a bounded helper store.
- Expire old error-session evidence inside each hot bucket on every read/write pass.
- Cap total tracked video/bumper buckets and distinct error sessions per item.
- Add a dedicated route-level rate limiter and unit tests for expiry/cap behavior.

**Rule**: Any “distinct sessions within N minutes” feature needs per-session timestamps plus cardinality caps. If old evidence only disappears when the entire parent record goes idle, the window is not rolling and the memory story is fiction.

---

## 2026-05-05 — TzKT verification must normalize live parameter entrypoints

**What happened**: The in-app market router worked on-chain, but live TzKT transaction rows for the mainnet purchase exposed the called entrypoint as `parameter.entrypoint` while the row-level `entrypoint` field was null. The shared verifier only checked `row.entrypoint`, so a valid purchase could fail closed during inventory verification.

**Why it mattered**: Thin payment-router contracts deliberately move product policy off-chain. That makes the indexer verifier part of the security boundary. If its fixture shape drifts from live TzKT, users can pay successfully but the app cannot reliably grant inventory, and follow-on policy checks may never run.

**Rule**: For Tezos op-hash verification, always fixture against real TzKT rows and normalize entrypoints from both `row.entrypoint` and `row.parameter.entrypoint`. For public routers, test the full chain evidence path: router call, internal FA2 transfer, token/treasury match, linked wallet, and catalog/intent policy.

---

## 2026-05-04 — Pagination is fake if the database still returns the full table

**What happened**: The TV channel/detail endpoints had no hard row caps. During hardening, the easy mistake was to add offset/limit semantics in the route response while still fetching the whole relation first and trimming it in Node.

**Why it mattered**: That preserves the same DB cost, the same server memory spike, and the same timeout risk while giving everyone a warm placebo called “pagination.”

**Fix**:
- Added bounded `limit`/`offset` handling to the TV channel list route.
- Added bounded video/playlist/playlist-item windows to TV channel detail.
- Pushed those bounds down into the actual SQL queries and surfaced pagination metadata so clients can page intentionally.

**Rule**: If a payload-size fix does not move the bound into SQL, it is not a real fix. Pagination must reduce rows read, rows serialized, and bytes returned, not just the final array shape.

---

## 2026-05-04 — Deterministic TV stream assembly belongs behind a revision-keyed snapshot cache

**What happened**: The TV `/stream` route was doing a full playlist-row load, bumper-pool load, seeded shuffle, telemetry blacklist filter, probe scheduling, and prefetch planning on every request even though most viewers hitting the same channel within the same shuffle window should see the same loop.

**Why it mattered**: That is wasted CPU, repeated DB work, and self-inflicted request amplification right on the hot read path. Worse, concurrent viewers all paid that rebuild cost separately because there was no in-flight coalescing.

**Fix**:
- Added a bounded stream snapshot cache with in-flight request sharing.
- Keyed cached snapshots by resolved playlist, shuffle window seed, revision aggregates from playlist/video/media/bumper state, and the current blacklist signature.
- Left auth, visibility, and schedule resolution live so correctness still comes from the database while the expensive deterministic assembly gets reused.

**Rule**: If a read path produces a deterministic queue from mostly stable inputs, treat that queue as a cacheable snapshot. Cache the expensive assembled artifact by revision and time window, and coalesce concurrent cache misses so N viewers do not trigger N identical rebuilds.

---

## 2026-05-04 — Appearance presets need real art direction, and cursor imports need license review

**What happened**: System Appearance shipped with a narrow set of mostly related muted color schemes, one intentionally loud Hotdog Stand preset, and a custom cursor default that felt unfinished. The cursor list also mixed simple built-in glyphs with a user request for weird online cursor packs, which would be tempting to satisfy by grabbing `.cur`/`.ani` files directly.

**Why it mattered**: Appearance controls are part of the product voice. If presets are barely differentiated, users do not get meaningful personalization. Cursor packs are also a supply-chain and rights surface: many funny or game-themed cursor packs claim permissive reuse while importing trademarked or third-party art, and browser cursor rendering usually needs conversion rather than raw Windows `.ani` files.

**Fix**: Expanded the desktop palette list into distinct, high-contrast presets while preserving existing scheme keys where users may already have settings. Changed the default cursor to the aubergine option, rebuilt the cartoon hand and paintbrush as local SVG glyphs with better hotspots, and kept third-party cursor candidates as an authorization list pending license review.

**Rule**: Treat appearance presets like designed product states, not minor tint variants. For cursors, prefer local SVG/PNG sprite assets with documented licenses; do not import meme/game cursor packs until the actual source art license is verified, even if the hosting page claims public-domain release.

---

## 2026-05-04 — TV playback must pin the airing item by identity, not by stale queue index

**What happened**: The TV player already stopped using wall-clock drift snap, but it still derived the on-screen item directly from `queue[clientQueueIdx]` on every stream refetch. When the server returned the same logical loop with a different interleaving or reordered slot, the playback effect reacted to the wrong item before the later cursor-sync effect could move the index back to the still-airing clip.

**Why it mattered**: That turned harmless stream refreshes into visible tears: a video or bumper could start loading, then get yanked to a different clip even though nothing had naturally ended. It also meant the code’s “if the current item disappears, let it finish” comment was a lie because render no longer had a stable copy of the current item once the queue changed underneath it.

**Fix**:
- Added a shared TV playback helper that resolves the active slot by pinned item key first and only falls back to the numeric queue index when the key still matches.
- Stored the last started playback item as a snapshot so the client can keep rendering it through a server-side queue drop instead of cutting away mid-play.
- Switched next-item and preload decisions to use the stabilized playback cursor, not the stale raw index.

**Rule**: In any client-driven playlist player, the currently airing item must be anchored by stable item identity, not by array position from a refetchable queue. Numeric indices are scheduling hints; the item key is the truth.

---

## 2026-05-04 — Hidden experimental routes must expire once the main path absorbs the fix

**What happened**: `TV2` started as a private scratch clone so playback changes could be tried without touching `/tv`, but after the useful resilience and scheduling work was backported, the clone still sat in the router as a hidden second implementation. That left two giant TV pages drifting in parallel even though only one should have mattered.

**Why it mattered**: Hidden clones rot quietly. Reliability fixes can land in one route and not the other, audits stay noisy because both paths remain "real enough" to worry about, and every future TV change pays a duplication tax for no user benefit.

**Fix**:
- Removed the hidden `/tv2` route from the app router.
- Deleted `client/src/pages/TV2.tsx` after the important behavior had already been consolidated into `TV.tsx`.
- Archived the old parity-only bounty item because the clone surface no longer exists.

**Rule**: Experimental clones need an exit condition on day one. Once the production route absorbs the useful behavior, delete the clone promptly instead of maintaining two truths.

---

## 2026-05-04 — Cursor personality needs shared state, not just more names in settings

**What happened**: The appearance cursor selector could list plenty of options, but interactive cursor concepts like a running horse, click-state Blang expression, and crosshair impact marks cannot be represented by a static glyph-only renderer.

**Why it mattered**: Without pointer direction, speed, and pressed-state plumbing, the new cursors would either feel dead or silently collapse into the old static fallback. User-supplied greenscreen art also needs to be converted into local transparent assets so the app does not depend on external image URLs or browser-specific cursor files.

**Fix**: Added cursor renderer state for direction, movement speed, click/press state, and temporary crosshair impacts. Generated local transparent Blang PNG assets from the supplied greenscreen images and wired the side-eye cursor to swap to the facepalm expression while pressed.

**Rule**: Treat animated/expressive cursors as miniature UI actors. Add the state and local assets they actually need, and verify the shared settings schema knows every new cursor key before exposing it in the selector.

---

## 2026-05-04 — Cursor refreshes must preserve approved weirdness before adding more weirdness

**What happened**: The cursor pass improved the option count but overwrote details the user already liked: the old emoji aubergine, the existing middle-finger behavior, and several accepted cursor choices got mixed together with less relevant options.

**Why it mattered**: Appearance settings are taste-sensitive. A cursor can be technically valid and still be a regression if it replaces a beloved, familiar version. The selector also needs curation: novelty options that are merely okay can make the whole set feel less WTF than fewer sharper choices.

**Fix**: Restored the old aubergine and middle-finger cursor behavior, removed Glitch Block and Rubber Stamp, kept the approved paintbrush, rainbow hitbox, and pizza cursors, and added the new pixel arrow, bow shot, improved horse, guinea pig, and ant as local handmade cursor art. Tezos cursors now use official logo geometry/assets instead of invented lettering.

**Rule**: Before changing personalization art, identify which existing options are approved and preserve them exactly unless the user asks otherwise. Add new cursors as curated additions, not broad replacements, and use source-faithful brand art for branded cursors.

---

## 2026-05-04 — Cursor click art needs a visible post-click hold

**What happened**: Blang's click expression was wired directly to the raw pointer-down state, so normal quick clicks flipped back on pointerup too fast to see. The rough horse cursor also needed to remain available as its own joke option instead of being silently replaced.

**Why it mattered**: Expressive cursors are judged by what users can actually perceive. A correct event handler is still broken UX if the alternate image only exists for a few milliseconds. Taste-sensitive options also need continuity: when a bad cursor becomes funny enough to keep, renaming it is safer than erasing it.

**Fix**: Added a short cursor `clickFlash` hold so click artwork can stay visible after pointerup, shrank oversized Blang and bow cursors, renamed the previous horse to `Horf`, and added a separate handmade pixel horse, hatchet, and arrow pass.

**Rule**: For cursor click-state art, hold the visual state briefly after pointerup. When preserving a disliked-but-accepted cursor as a joke option, move it under an explicit new key and keep the improved replacement separate.

---

## 2026-05-04 — Playback pinning must be scoped to the current channel, not just the current item key

**What happened**: The TV playback fix for reorder/refetch tears correctly pinned the airing item by identity, but it reused that pinned snapshot even after the user changed channels. Until the new stream payload arrived, render could keep showing `currentPlaybackItemRef.current` from the old channel, which made channel changes wait for the old clip to finish.

**Why it mattered**: This turned a correctness fix into a new UX lie. The player looked sluggish and broken even when the new feed was available fast, because the client was defending continuity across a boundary where continuity should not exist.

**Fix**: Added a channel-scoped playback resolver that only preserves pinned key and fallback item state when they still belong to the selected channel. Same-channel refetches still keep the airing item stable, but a real channel change now drops the old item immediately and waits for the new feed.

**Rule**: In playlist/video clients, sticky playback state must be keyed to both item identity and feed identity. Preserve continuity across queue churn inside one channel; never preserve it across a channel switch.

---

## 2026-05-04 — TV playback cannot have two authorities

**What happened**: The server still had enough information to answer “what should be airing right now?” with loop durations and offsets, but the main TV client ignored that and ran its own local queue cursor, buffer gate, and bumper-cover transitions. Once object storage and local cache made startup faster, those two models started racing each other in public: hidden video audio could begin under a bumper overlay, the client could step to a different item than the server thought was current, and every viewer effectively got a private playlist session instead of tuning into a channel.

**Why it mattered**: This was the deeper reason the TV felt like a cursed DVD player instead of a broadcast. Better storage did not fix it; faster media simply exposed the design mistake more clearly.

**Fix**: Restored a server-authoritative broadcast cursor and rotated queue, returned real `offsetSeconds` from the TV endpoints, sought the client into the current on-air item, refetched at natural boundaries, and stopped using local cover-bumper handoffs in the main playback path.

**Rule**: For live-channel products, pick exactly one playback authority. Either the server owns the feed position or the client does. Mixing a server “current item” model with a client-owned cursor and transition layer will produce race conditions, overlapping media, and broken mental models.

---

## 2026-05-04 — Tiny pixel animals need silhouette research before detail passes

**What happened**: The first "improved" horse cursor still read too much like a generic four-legged pet because it used blocky rectangles without enough horse-specific silhouette cues. The pixel arrow also got over-designed when the request was really for a simple chunky pointer.

**Why it mattered**: At cursor scale, anatomical detail collapses fast. Users read the outer silhouette first: long face, arched neck, withers, barrel, high tail, and long bent legs matter more than small internal shading. For simple UI primitives like an 8-bit arrow, extra decoration makes it less legible.

**Fix**: Redrew `Horse Runner` from photo, clipart, and pixel-sprite reference patterns with a longer muzzle, raised ears, arched neck, mane, barrel body, raised tail, and animated thin legs. Rebuilt `Pixel Arrow` as a chunky Minecraft-like pointer with a black outline, white fill, and minimal gray shadow.

**Rule**: For tiny animal cursor art, block the species silhouette first and only then add pixels. For basic cursor primitives, choose immediate readability over cleverness.

---

## 2026-05-04 — Tool cursors need the iconic working silhouette, not object-adjacent pixels

**What happened**: The handmade hatchet cursor used a broad flat metal shape and awkward handle angle, which made it read more like a broken shovel than a compact axe. Its click state only nudged rotation instead of feeling like a strike.

**Why it mattered**: Small tool cursors need the object-defining parts to be exaggerated: a short handle, visible axe eye, compact metal head, blade cheek, and poll. If the silhouette does not read immediately, extra shading makes the wrong object more convincing. Click animations also need a visible motion arc, not just a slightly different resting pose.

**Fix**: Rebuilt `Hatchet` with a top-heavy axe head, handle passing through the eye, metal cheek/blade highlights, and a small poll. Wrapped it in a click-triggered attack swing with an impact streak so it visibly chops during the existing click-flash window.

**Rule**: For tiny tool art, exaggerate the iconic working silhouette first. For attack cursors, animate the whole tool through a strike arc and use the existing post-click hold so the action is perceivable.

---

## 2026-05-04 — Axe heads need the handle-eye relationship to read correctly

**What happened**: The next hatchet pass still looked wrong because the head sat at the wrong angle to the shaft. Even with a better metal silhouette, the handle did not convincingly pass through the axe eye, so the head felt pasted onto the side instead of mounted around the handle.

**Why it mattered**: Real axe readability comes from construction: the shaft runs into the eye, while the blade/bit and poll/pick extend across that eye. References like classic fire axes and the Shining prop make that relationship obvious. At cursor size, if that geometry is wrong, the object reads as a shovel, hammer, or broken tool no matter how many highlights are added.

**Fix**: Redrew `Hatchet` again with a curved wooden handle entering a visible eye, a compact blade on one side, a poll/pick on the other, and a rest/swing transform that preserves the head-to-shaft construction.

**Rule**: For axes and hatchets, draw the handle-eye-head assembly first. Blade detail, shading, and swing effects come after the handle visibly passes through the head at the correct angle.

---

## 2026-05-04 — Match the supplied cursor reference before adding realism

**What happened**: The hatchet iterations kept chasing a more realistic axe when the correct target was a tiny pixel-art hatchet reference: a simple gray wedge head, black outline, and short brown diagonal handle.

**Why it mattered**: When the user supplies the exact target image, visual fidelity to that reference beats anatomical plausibility. A small cursor should preserve the reference's scale, pixelation, and simple shapes rather than becoming a better-rendered but different object.

**Fix**: Replaced the rendered axe with a compact 42px pixel-art hatchet matching the supplied reference: chunky gray head, tiny eye block, brown handle, and minimal strike streaks during the click swing.

**Rule**: For reference-led cursor art, copy the reference's silhouette and pixel language first. Do not upscale the idea into a different art style unless the user asks for that.

---

## 2026-05-04 — TV title cards need one metadata authority and viewer-timed visibility

**What happened**: The TV overlay pipeline was lying in two places at once. On the data side, `server/routes/tv.ts` treated `metadata.creators[0]` as a display name even when it was only a Tezos address, and imported library tokens could later lose their raw metadata entirely when added to a channel by `mediaItemId`. On the UI side, `client/src/pages/TV.tsx` decided overlay visibility from asset-relative timing, so joining a channel mid-broadcast could suppress the title card immediately even though the viewer had only just started watching.

**Why it mattered**: That is how you get raw wallet strings on-screen, missing credit bars, and upload rows that cannot explain who made the work. It also breaks the intended TV illusion: a title card should feel tied to what the viewer is seeing right now, not to whether the asset happened to start five seconds ago on some server clock.

**Fix**: Added `server/lib/tv-overlay-metadata.ts` as the single resolver for creator/collection/mint/title-card metadata, with support for address-label fallback, upload overrides under `metadata.wtfTvOverlay`, uploader-credit fallback, and Objkt URLs for token-backed items. Persisted token raw metadata during media import, propagated upload metadata edits into linked `tv_channel_videos`, and changed the TV overlay to show on viewer-start plus viewer-end instead of trusting only the asset playhead.

**Rule**: TV overlays must derive from one normalized metadata resolver, not ad hoc JSON field grabs in multiple routes. Raw creator addresses are not display names. Broadcast TV also needs viewer-timed overlay windows: use the moment the art actually becomes visible to the viewer for the opening card, and the asset tail for the closing card.

---

## 2026-05-04 — Pet-state tests must pin simulated dates

**What happened**: The new hamster scooper test built a snapshot with an old `lastCareDate` but did not pass a fixture `now` into `deriveHamsterSnapshot`. The test ran against the real current date, so normal missed-care decay changed the state before the scooper assertion.

**Why it mattered**: Desktop pet behavior intentionally depends on elapsed days. Tests that rely on default wall-clock time can fail later, or worse, assert against a death/decay path when they meant to cover a care action.

**Fix**: Pinned the snapshot and action to the same explicit fixture date before asserting hygiene and care-point changes.

**Rule**: Any hamster/pet test that includes `lastCareDate`, missed-care decay, streaks, or care actions must pass an explicit `Date` into both snapshot derivation and action application.

---

## 2026-05-04 — Pixel pet sprites need a real sprite language, not CSS blobs

**What happened**: The first wandering desktop hamster was built from rounded CSS shapes. It moved and recolored correctly, but the silhouette read like a generic green blob instead of a small pixel pet.

**Why it mattered**: At desktop-icon scale, shape language beats clever implementation. A believable pet needs a readable side-view body, head patch, snout, ears, paws, outline weight, and animation cadence before the color system matters.

**Fix**: Replaced the blob actor and settings preview with a reusable pixel SVG sprite modeled after the supplied guinea-pig sprite sheet. The new sprite keeps generative coat colors through CSS variables while using sheet-like body mass, face patches, ears, feet, and walk/idle animation.

**Rule**: For pixel desktop pets, start with the source sprite silhouette and animation vocabulary. Keep procedural recoloring in a second layer so themes vary without destroying the species read.

---

## 2026-05-04 — MCP agent access needs its own auth boundary and feature gates

**What happened**: Adding a remote MCP layer to WTF could have turned browser-session APIs into a broad agent surface. The risky parts were easy to blur together: user-owned settings writes, desktop pet care, public blockchain-derived database reads, public trade-board workflows, admin-disabled sub apps, and on-chain listing actions that still require wallet signatures.

**Why it mattered**: Agents need enough power to help users, but they are not browser sessions. If MCP tools reuse cookie auth, expose private rows, ignore admin app toggles, or fabricate marketplace rows without a verified wallet operation hash, the feature becomes an account-control and data-boundary problem instead of a helpful integration.

**Fix**:
- Added one-time-visible MCP pairing tokens stored only as SHA-256 hashes.
- Mounted a rate-limited Streamable HTTP `/mcp` endpoint authenticated by `Authorization: Bearer wtf_mcp_...`.
- Added tool-level checks against the same desktop-app config the admin control panel changes.
- Kept public data tools scoped to Objkt/TzKT/IPFS/on-chain-derived rows.
- Made listing support a safe workflow/preparation tool unless the normal wallet-signed operation hash exists.

**Rule**: Remote MCP surfaces need a separate pairing-token boundary, per-agent rate limits, and feature-gate checks inside every tool, not just in the browser UI. Treat blockchain/IPFS/indexer-derived rows as public, but keep user-private rows and wallet-signature requirements explicit. Agents can prepare or record verified on-chain workflows; they must not invent marketplace state that the wallet and TzKT have not proven.

---

## 2026-05-04 — Ant colonies need shared origin state before pathfinding cleverness

**What happened**: Desktop ants spawned with a fresh random edge point and an immediate food target per ant. The pathfinding worked, but the swarm read like unrelated one-off insects teleporting in from every side instead of a colony exploring, discovering food, and carrying it home.

**Why it mattered**: Simulation believability comes from the lifecycle contract, not only movement. A colony system needs a stable home, scouts that explore without omniscient food knowledge, and foragers that return to the same off-screen origin after harvesting.

**Fix**: Added shared colony state for the desktop ant loop, introduced an `exploring` phase, spawned scouts from jittered entrances around the same off-screen colony, and made ants switch to food-seeking only after sensing nearby food or pheromone trails.

**Rule**: For desktop colony simulations, establish the shared home/origin first. Spawn, exploration, pheromones, and return paths should all reference that colony; do not assign each actor a new private edge origin unless the design explicitly calls for independent wanderers.

---

## 2026-05-04 — TV creator tools need intent-preserving actions, not cascade-shaped wording

**What happened**: The TV creator UI and the standalone My Videos library both leaned on the same cascade model, so routine actions were expressed as blunt deletes. Playlist editing only targeted the active playlist, media management mostly offered “delete the library item,” and community bumpers could only leave the public pool by deleting the clip outright.

**Why it mattered**: Users do not think in foreign keys. “Remove this from channel 03,” “take this bumper out of the community pool,” and “delete this file from my library” are different intents with different consequences. When the UI collapses them into one destructive action, people either hesitate or make the wrong change.

**Fix**:
- Added a channel-scoped detach route for library-backed media.
- Added a bumper update route so owners can move a bumper between personal and community without deleting it.
- Reworked the playlist editor to target a selected playlist directly and support add/remove/reorder instead of only editing whichever playlist is active.
- Surfaced channel-attachment management in both TV’s My Media screen and the standalone My Videos app.

**Rule**: If the data model has layered relationships, the UI must expose layered actions. Never force a destructive root delete when the user’s real intent is to detach, unshare, or reorder one layer of the graph.

---

## 2026-05-05 — In-app purchases need contract-anchored chain evidence before inventory grants

**What happened**: A WTF in-app item market could easily have been implemented as a UI payment intent or a raw "treasury received some WTF" watcher. That would miss listing context, exact quantity, sender linkage, and replay protection.

**Why it mattered**: Platform-only inventory is still value-bearing. If the app grants food, medicine, or cosmetics from an unverified client claim, an unrelated treasury transfer, or an indexer row without the matching purchase call, users can get inventory without paying the configured listing price or can replay an old transfer.

**Fix**: The market contract now records listing IDs and pulls exact WTF FA2 amounts directly from the buyer to the gameshow treasury. The app grants inventory only after TzKT shows an applied `purchase` call to the configured contract and the exact matching WTF transfer to the treasury, with unique TzKT transfer IDs and idempotent inventory updates.

**Rule**: Never grant in-app inventory from wallet intent alone. Require an on-chain contract call that names the listing plus an exact WTF transfer from the same linked buyer wallet to the configured treasury, and make the grant idempotent on an indexer-stable transfer ID.

---

## 2026-05-05 — Simple Tezos payment routers must stay simple and compile compact

**What happened**: The first in-app market contract tried to make the chain own too much product state: listings, purchase records, admin rotation, views, events, and counters. SmartPy expanded that into an annotated 897 KB Michelson artifact, which tripped Kiln Shadowbox's 200 KB source limit for a contract whose real job was just "send WTF to the gameshow wallet with item context."

**Why it mattered**: Oversized contracts are not only expensive; they break tooling before they reach chain testing. For this flow, on-chain storage did not make item delivery safer because the server still must verify the actual WTF transfer and grant platform inventory off-chain.

**Fix**: Replaced the registry-style contract with a tiny payment router: `purchase(listing_id, amount_wtf_units, purchase_ref)` pulls WTF from the buyer to the treasury. Catalog prices and inventory grants remain in the app database, and generated SmartPy `.tz` artifacts are compacted before Kiln upload. The compiled router is about 1 KB.

**Rule**: For platform-only in-app purchases, keep Tezos contracts to payment authorization and immutable routing. Put mutable catalog/product behavior in the app, verify chain evidence before grants, and always check compacted Michelson size before calling a contract "Kiln-ready."

---

## 2026-05-05 — Batched in-app purchases need durable cart receipts, not single-row transfer assumptions

**What happened**: The initial in-app market verifier treated one Tezos transfer as one purchase row keyed by a unique `tzkt_transfer_id`. That matched single-item buys but contradicted the cart requirement where one router transaction can pay for pet food, medicine, and a shoebox together.

**Why it mattered**: A batched payment has one chain transfer but multiple inventory grants. If the database uniqueness model only allows one row per transfer, later cart lines are either lost or hidden inside an opaque raw payload. EXP checkout also has no TzKT transfer at all, so forcing every purchase through chain-only identifiers would create fake evidence.

**Fix**: Add durable payment intents keyed by `purchase_ref`, store the cart lines before wallet payment, verify WTF totals against that intent, and grant one purchase/inventory row per line using `(tzkt_transfer_id, sku)` for WTF idempotency. EXP checkout deducts points atomically and stores non-chain purchase rows without fake operation hashes.

**Rule**: Whenever a payment can cover multiple in-app items, separate the payment receipt from the grant rows. Chain evidence proves the total payment; the signed-in app intent explains how that total fans out into inventory.

---

## 2026-05-05 — Reserve payment sentinel IDs before seeding product listings

**What happened**: The first in-app market seed used `contract_listing_id = 0` for pet food. The cart checkout then correctly needed `listing_id = 0` as a router sentinel for “this payment is a cart; resolve item lines from `purchase_ref`.”

**Why it mattered**: Sentinel collisions make verification ambiguous. A value cannot safely mean both “pet food listing” and “batched cart payment,” especially when future tooling may inspect listing ids without knowing the checkout mode.

**Fix**: Keep `0` reserved for cart router payments and seed concrete marketplace items with positive listing ids. The migration now normalizes food/medicine/shoebox to `1/2/3` while the UI sends `0` only for WTF cart checkout intents.

**Rule**: Before adding sentinels or reserved IDs to a payment protocol, audit and update seed data. Real catalog records should use positive, non-reserved identifiers unless the contract explicitly defines otherwise.

---

## 2026-05-05 — Pet emotion loops need persisted scoring, not client vibes

**What happened**: Adding bond, happiness indexing, home-return behavior, and trauma could have slipped into the desktop animation layer only. That would make the pet look reactive for one browser session while MCP care tools, server snapshots, and future breeding/racing systems saw none of the emotional progression.

**Why it mattered**: Bond and trauma are gameplay state, not decoration. They affect future pet value, recovery difficulty, and defensive behavior, so they must survive refreshes and alternate care surfaces while remaining compact enough to fit the existing pet-state storage.

**Fix**: Store bond XP, happiness index samples, trauma, and recovery metadata in reserved `interaction_counts` keys, normalize them through both browser routes and MCP routes, and keep the desktop animation as a projection of the persisted state.

**Rule**: Any pet progression stat that can affect future mechanics must round-trip through the canonical server pet state before it drives UI behavior. Client motion may be local, but scoring, recovery, and progression counters must persist through every adapter.

---

## 2026-05-05 — Ambient desktop requests need an explicit behavior matrix

**What happened**: The pet/toy pass covered the big shared-world and toy mechanics, but two smaller ambient behaviors were easy to miss: a BRB signpost when a pet leaves home and a hungry pet reacting to food smells from a neighbor desktop.

**Why it mattered**: For simulation features, the small visible affordances are part of the contract. Without the signpost, walkabout looks like disappearance. Without an anonymous food-scent signal, neighbor food affects ants but not hungry pets, breaking the intended desktop-world ecology.

**Fix**: Added a server-issued, identity-safe neighbor food smell signal, client-side border sniff/scratch behavior that scales with hunger, and a temporary BRB signpost while pets are away.

**Rule**: When implementing ambient simulation requests, turn the user’s prose into a checklist of visible behaviors, server signals, privacy constraints, and tests before calling the pass complete.

---

## 2026-05-05 — Render-budget item caps must count account-owned active inventory

**What happened**: The pet ball limit was treated too much like a cart or current-desktop placement cap, which left ambiguity around repeat purchases and balls that temporarily leave the desktop through tunnels.

**Why it mattered**: This cap protects rendering and physics load. If enforcement only watches the current cart or visible local actors, users can exceed the account budget through repeated checkout/grant cycles or by freeing visible slots while owned balls are still active elsewhere.

**Fix**: Centralized the pet-ball cap decision, enforced it against account-owned inventory in both EXP and WTF grant paths with transaction advisory locking, and reserved escaped ball slots on the desktop while local-owned balls are away.

**Rule**: Any inventory cap meant to protect performance or economy must be enforced at account grant time and mirrored in active-object slot accounting, including objects temporarily offscreen or in neighboring map spaces.

---

## 2026-05-05 — Stale branch merges must not resurrect old risks

**What happened**: Merging older side branches into current `main` produced conflicts where branch hunks predated newer W/DM credit hardening and attempted to re-add legacy auth dependency metadata that the bounty board already tracks as risky.

**Why it mattered**: A merge can be green by Git ancestry but still regress production if conflict resolution blindly accepts stale code, outdated package locks, or known vulnerable dependency paths.

**Fix**: Resolved patch-equivalent W conflicts in favor of current `main`, combined only the still-relevant ecosystem additions, skipped the known `passport-twitter`/`xmldom` reintroduction, regenerated `package-lock.json` from the resolved manifest, and verified with typecheck, focused branch tests, and production build.

**Rule**: When merging stale branches, use `git cherry`/diff context plus the bounty board before choosing conflict sides. Preserve current production hardening over older equivalent hunks, never reintroduce a documented risky dependency from an old branch, and regenerate lockfiles from the final intended manifest.

---

## 2026-05-05 — Domain extraction must move the data boundary, not just the code block

**What happened**: The W timeline route looked ready for a clean service extraction, but its real scalability bug lived one layer lower: it queried every Twitter-linked user, normalized and deduped them in memory, and only then applied the configured account cap.

**Why it mattered**: Moving that route code into a feature module without changing the query would have made the architecture look more modular while preserving the same unbounded request cost. A background worker sharing the old helper would also keep drifting from the HTTP route's real membership rules.

**Fix**: Added a bounded, ordered SQL author-window reader shared by `/api/w/timeline` and the timeline search worker, then extracted DB-cache timeline payload assembly into `server/features/w/timeline.ts` behind the existing route.

**Rule**: When modularizing a hot route, identify the actual resource boundary first. Apply limits, ordering, dedupe, and cache keys at the database/service boundary before extracting wrapper code, and make background workers reuse the same bounded helper.

---

## 2026-05-05 — Refactor plans are not refactor deliverables

**What happened**: The first modular architecture pass produced a useful plan and one narrow W timeline extraction, but it left the largest client/server ownership blocks mostly intact. That made the output read like architectural paperwork instead of visible repo surgery.

**Why it mattered**: A monolith breakup request needs changed module boundaries in the tree: wrappers should shrink, feature modules should own behavior, and the line-count/ownership picture should visibly improve. A plan is only valuable if it is followed by enough extracted code for the next engineer to build on immediately.

**Fix**: Followed through with additional extractions: moved the client OS page registry out of `App.tsx` into `client/src/routes/page-defs.ts`, and moved W link preview, Objkt/TzKT preview lookup, SSRF-safe URL normalization, bounded HTML reads, and timeline preview enrichment into `server/features/w/link-preview.ts`.

**Rule**: For architecture refactor tasks, ship at least one structural module extraction per major concern touched before calling the pass useful. Update the plan checkboxes as code moves, and verify the wrapper file now owns less than it did at the start.

---

## 2026-05-05 — Desktop actor extraction should leave the OS shell as a caller

**What happened**: `Desktop.tsx` was acting as both the simulated OS shell and the owner of independent desktop actors such as custom cursors and Sunday grass. Those actors had their own storage, timing, pointer tracking, glyph rendering, and positioning rules, but they still lived inside the highest-conflict shell file.

**Why it mattered**: A modular desktop architecture needs the shell to orchestrate windows and surfaces, not own every actor implementation. Leaving actor code inline makes harmless visual or simulation changes risky because they require editing the same large file that owns window routing, icon layout, settings, and pet state.

**Fix**: Moved custom cursor behavior into `client/src/features/desktop/CustomCursor.tsx`, Sunday grass behavior into `client/src/features/desktop/SundayGrass.tsx`, and shared clamp/seed helpers into `client/src/features/desktop/geometry.ts`, while keeping the shell render calls and persisted keys stable.

**Rule**: When splitting the desktop OS, extract self-contained actors into feature modules first and leave `Desktop.tsx` as the caller. Preserve storage keys and public props during the move so line-count reduction does not become behavior drift.

---

## 2026-05-05 — First-level extraction can expose the next monolith

**What happened**: Moving desktop cursor, Sunday grass, icons, physics, and pet behavior out of `Desktop.tsx` finally turned the desktop shell back into a small orchestrator. But the pet extraction created a new, clearer second-level monolith: one feature module now owns care tray UI, in-app market checkout, pet state, toys, drops, ant trails, and shared-world traffic.

**Why it mattered**: A good strangler refactor does not pretend the first moved file is the final boundary. The first split should make the next bad boundary easier to see, then the bounty board and plan need to capture that follow-up before it gets lost.

**Fix**: Extracted the desktop shell concerns into `client/src/features/desktop/*`, reduced `Desktop.tsx` to shell orchestration, and added `WTF-BB-099` to track the remaining `DesktopPet.tsx` second-level split.

**Rule**: After each large feature extraction, re-audit the new module sizes. If the extracted module is still too broad, add a follow-up bounty immediately with the next intended ownership seams and verification target.

---

## 2026-05-05 — Deployed payment contracts need runtime and build-time defaults

**What happened**: The in-app market contract address was initially documented as an env value, but the client purchase path depends on a Vite build-time variable while the server verifier depends on runtime process env. A production rebuild without matching host env would still leave purchases disabled or verification unconfigured.

**Why it mattered**: Payment routers are not passive docs. If the wallet approval target and the chain verifier do not resolve the same deployed contract address, users can approve or submit purchases that the app cannot grant from.

**Fix**: Added the deployed in-app market KT1 as the shared default, kept env overrides for future migrations, and updated local/example env plus the market handoff doc.

**Rule**: For deployed contract addresses that power production checkout, wire a shared app default and env override together, then verify both the compiled client bundle and server bundle contain the intended KT1.

---

## 2026-05-05 — Second-level feature splits need shared model files before render moves

**What happened**: Splitting `DesktopPet.tsx` into care tray, actor, model, storage, and API type modules exposed one moved simulation type (`AntColonySide`) that the main component still needed after the first extraction.

**Why it mattered**: Presentational extraction is only low-risk when constants, DTOs, and actor model types have a stable shared home. Otherwise the old component and new leaf modules can silently depend on types that were removed from the original scope.

**Fix**: Added `DesktopPetModel.ts`, `DesktopPetTypes.ts`, and `DesktopPetStorage.ts` as explicit shared boundaries, then let `npm run check` catch and verify the missing import before running the full build.

**Rule**: In second-level monolith splits, move shared constants/types/storage normalization into tiny model modules first, then extract render components and hooks against those model files. Always typecheck immediately after the first import-boundary cut.

---

## 2026-05-05 — Extract pure simulation helpers before live animation loops

**What happened**: `DesktopPet.tsx` still mixed three different things after the first split: pure target/routing/spawn helpers, market checkout state, and live animation effects. Moving the live loops first would have required threading many refs and mutable state through a new hook in one risky jump.

**Why it mattered**: The desktop pet is an ambient simulation. Small mistakes in requestAnimationFrame loops, world heartbeat timing, or ref ownership can create subtle behavior drift that typecheck will not fully catch.

**Fix**: Pulled the pure simulation helpers into `DesktopPetSimulation.ts`, checkout/cart state into `useDesktopPetMarket.ts`, and styled stage actors into `DesktopPetWorldActors.tsx` before attempting any live-loop extraction.

**Rule**: For animation-heavy monoliths, extract pure helpers, presentational actors, and isolated state hooks first. Only move requestAnimationFrame or heartbeat loops once their dependencies are already named module boundaries.

---

## 2026-05-05 — Domain extraction means owning the model, not just the hook

**What happened**: The first ant-loop extraction moved the requestAnimationFrame effect into a hook but left ant types, constants, pathing helpers, spawn helpers, and render actors scattered across the generic desktop pet files.

**Why it mattered**: That would have reduced `DesktopPet.tsx` line count without creating a real domain boundary. Future ant changes would still require edits across the pet model, pet simulation, world actors, and the hook.

**Fix**: Reworked the split into `client/src/features/desktop/ants/*`, with ant model/types, pheromone actors, route/pathfinding, desktop/world spawn helpers, pheromone aging, and the ant simulation loop owned by the ant domain. `DesktopPet.tsx` now wires shared refs/state and handles cross-domain events like trashing food or defensive swats.

**Rule**: When extracting a subdomain, move the model, constants, pure helpers, render actors, and runtime loop together when they change for the same reason. A hook alone is not a domain boundary if the rest of the behavior remains scattered.

---

## 2026-05-05 — Fast domain splits need a touched-file ledger and verifier trail

**What happened**: The desktop pet refactor needed speed more than perfect local certainty. Stopping to prove every browser path after each cut slowed the work, while the actual goal was to make parallel domain work possible by separating ownership boundaries.

**Why it mattered**: Multi-agent refactors need clear write scopes first. Once ants, toys, drops, world travel, and pet movement are in separate files, later auditors can test and fix each domain independently without fighting over one monolithic component.

**Fix**: Continued the structural cuts, moved the toy domain into `client/src/features/desktop/toys/*`, kept `npm run check` as the fast sanity gate, and used verifier subagents to trail the main restructure for stale imports and duplicate ownership.

**Rule**: During architecture breakup passes, prioritize clean domain ownership and a concrete touched-file ledger. Use fast type checks and trailing verification agents, then schedule deeper behavior audits after the monolith is split enough for agents to work in parallel.

---

## 2026-05-05 — Payment-router verification needs live-shaped op fixtures and active catalog policy

**What happened**: The in-app market server verifier trusted two assumptions that were not proven by tests: TzKT entrypoints would always appear on the row-level `entrypoint` field, and direct listing fallback could reuse catalog rows without checking whether they were still active.

**Why it mattered**: The on-chain router is intentionally tiny, so server verification is where product policy lives. If the verifier misses a valid purchase shape, paid users do not get inventory. If it accepts inactive rows, direct contract calls can bypass the cart/intent path after old listings are retired.

**Fix**: Normalized TzKT entrypoints from both row-level and `parameter.entrypoint` shapes, added a live-shaped regression fixture, and routed direct-listing fallback through an active-item selector that blocks inactive contract-specific rows from falling through to generic listings.

**Rule**: Every Tezos payment-router verifier needs tests for the live indexer row shape and for catalog lifecycle policy. Direct chain-call fallbacks must reject inactive or retired catalog entries unless a valid, unexpired payment intent explicitly authorizes the purchase.

---

## 2026-05-05 — Live-loop monoliths need behavior hooks with explicit ref contracts

**What happened**: The desktop pet component could not become a real orchestration module while it still owned the care pursuit, scent-following, escape trigger, defensive swat, sickness exposure, sleep, and digestion requestAnimationFrame loop inline. Moving only the world API calls still left escape behavior split between the gateway and the component.

**Why it mattered**: Animation loops are where domain boundaries get blurry because they touch almost every mutable ref. If that loop stays in the shell component, future agents still have to edit the same file for pet movement, world travel, toys, ants, drops, and health side effects.

**Fix**: Extracted `useDesktopPetLocomotion` under `client/src/features/desktop/pet/*` with an explicit ref/state contract, after the ant, toy, drop, world, and persistence domains already existed. `DesktopPet.tsx` now wires the hook instead of owning the loop, and `npm run check` verified the import/type boundary.

**Rule**: For live simulation refactors, move the surrounding domains first, then extract the loop as a hook with a clear argument surface. Treat the hook signature as the ownership map for follow-up audits.

---

## 2026-05-05 — TV needs compatibility wrappers before service rewrites

**What happened**: The TV route and TV page were still too large for parallel work, but jumping straight into stream/cache/creator-console behavior would have bundled route auth, playback scheduling, media storage, and UI state changes in one risky move.

**Why it mattered**: TV has many production-sensitive behaviors: playback continuity, cache warm paths, upload playback, bumper cadence, schedule windows, and creator management. A modularity pass should create ownership boundaries without changing those behaviors until focused agents can audit each domain.

**Fix**: Left `server/routes/tv.ts` and `client/src/pages/TV.tsx` as compatibility wrappers, then moved low-risk, already-clustered helpers into `server/features/tv/*` and `client/src/features/tv/*`: pagination, daypart policy, bumper upload policy, DTO/view types, pure helpers, telemetry, and CRT static rendering.

**Rule**: For very large route/page refactors, extract pure policy, DTOs, helper functions, and isolated visual components first. Keep public route paths, auth gates, query keys, and page exports stable until the feature modules have enough shape for deeper service cuts.

---

## 2026-05-05 — TV media URL policy belongs with cache fetch policy

**What happened**: The TV router still owned IPFS gateway ordering, media URL allowlisting, same-origin playback bypasses, redirect guards, content-type checks, and gateway fallback fetch logic inline. That made cache/prefetch/playback hardening look like route code instead of a focused media-fetch policy.

**Why it mattered**: TV media fetches are security- and reliability-sensitive: they decide which remote hosts are allowed, how redirects are handled, when same-origin playback skips cache wrapping, and how IPFS gateways fail over. Keeping that in the huge router makes future SSRF/cache/playback fixes harder to audit.

**Fix**: Moved TV media URL normalization, IPFS gateway fallback, redirect guarding, content-type policy, same-origin cache URL resolution, and fetch-with-timeout helpers into `server/features/tv/media-urls.ts`, leaving `server/routes/tv.ts` as the compatibility caller.

**Rule**: When extracting TV cache code, keep URL policy and fetch policy together. A route should call the policy module; it should not own allowlists, gateway ordering, redirect safety, and fallback loops inline.

---

## 2026-05-05 — Channel ownership helpers should be their own TV contract

**What happened**: TV channel editability, staff checks, public/private viewing, slug allocation, dial allocation, duplicate-video recovery, and playlist row locking were all inline in the giant TV router. That meant route edits for playlists, schedules, bumpers, and stream reads all had to share ownership of channel policy details.

**Why it mattered**: Parallel TV work needs a stable channel contract. If every domain reimplements or edits channel gating directly, route-path compatibility can survive typecheck while access-control or duplicate-recovery behavior drifts.

**Fix**: Moved channel policy helpers into `server/features/tv/channel-service.ts` and left `server/routes/tv.ts` as a caller.

**Rule**: New TV server code that needs channel edit/view/staff/slug/dial/row-lock behavior must import the channel service. Do not recreate those helpers inside route handlers or feature-specific services.

---

## 2026-05-05 — Cache file identity is its own TV domain

**What happened**: TV cache paths, cache-key hashing, transcode sidecar names, max-size/TTL constants, cache metadata types, and cache log helpers lived directly beside the HTTP streaming route. That made a file-key change look like a route change and kept cache agents from owning the disk contract.

**Why it mattered**: The cache file contract is shared by streaming, prefetch, warming, eviction, transcode, object-store mirroring, and boot rekeying. If those helpers stay inline, every cache-related agent still has to edit the route monolith.

**Fix**: Moved cache/transcode config, cache-key/path helpers, cache metadata types, and cache telemetry helpers into `server/features/tv/cache-files.ts`.

**Rule**: Any code that reads or writes TV cache files must import cache paths, keying, metadata types, and cache log helpers from the cache-files module. Do not recompute cache filenames or transcode sidecar names inside route handlers.

---

## 2026-05-05 — Extracted code must leave no stale route-owned twin behind

**What happened**: The TV transcode worker was copied into `server/features/tv/transcode.ts`, but the old route-owned block was still present after imports/constants had moved. The route could import with missing transcode identifiers and block focused tests until the stale block was removed.

**Why it mattered**: Monolith breakup is supposed to create one owner per concern. A stale twin keeps the old owner alive, creates missing-import failures, and makes background-job result shapes easy to mismatch during a split.

**Fix**: Removed the old transcode worker/export block from `server/routes/tv.ts`, kept scheduler imports pointed at `server/features/tv/transcode.ts`, and reran `npm run check` plus cache/health route tests.

**Rule**: After extracting a service, immediately search for the exported function names, env constants, and scheduler imports. The route should retain only route handlers and explicit compatibility calls, not duplicate service implementations.

---

## 2026-05-05 — Mechanical JSX extraction needs a return guard

**What happened**: The CRT playback surface was moved out of `TV.tsx` as a component, but the first mechanical copy left the JSX block as a bare expression inside the function body instead of returning it.

**Why it mattered**: TypeScript catches this quickly, but it is an easy error when converting an inline render subtree into a component. The split is still valuable, but the extraction script must preserve component semantics, not just the text block.

**Fix**: Added the missing `return (...)` wrapper in `client/src/features/tv/TVPlaybackSurface.tsx`, switched the new component to import telemetry/util helpers directly to avoid feature-barrel cycles, and reran `npm run check`.

**Rule**: When lifting JSX into a new component, always inspect the generated function head and tail before continuing: imports, destructured props, `return (...)`, and closing braces must be verified before the next cut.

---

## 2026-05-05 — Source indices must be recalculated after each splice

**What happened**: The TV data-query block was extracted first, then the mutation block was replaced using indices captured from the pre-edit source. That left a partial stale mutation block in `TV.tsx` and temporarily deleted the creator-console derived memos.

**Why it mattered**: Fast monolith breakup often uses mechanical block moves, but a single stale byte offset can corrupt a page even when the extracted hook itself is correct. TypeScript caught the syntax damage, but the mistake cost a repair pass.

**Fix**: Removed the stale partial mutation block, restored the derived memo boundary, moved the derived creator data into `useTVCreatorDerivedData`, and reran `npm run check`.

**Rule**: For multi-block mechanical edits, either perform replacements from bottom to top or recalculate source indices after every splice. Never reuse offsets from a previous version of the file.

---

## 2026-05-05 — Extracted mutation hooks must preserve query-key contracts

**What happened**: `refreshSourcesMutation` moved from `TV.tsx` into `useTVMutations`, but one invalidation kept the wrong key shape: `["tv", "channels", selectedOwnChannelId]` instead of the extracted detail query's `["tv", "channel", selectedOwnChannelId]`.

**Why it mattered**: Route paths can stay correct while UI freshness regresses. Query-key drift after a hook extraction leaves the stale cache alive, so creator-console changes can appear broken even though the server action succeeded.

**Fix**: Patched `useTVMutations` to invalidate the exact channel-detail key and kept verifier checks focused on route paths, query keys, returned hook values, and stale imports.

**Rule**: When moving React Query mutations, compare every `invalidateQueries` key against the extracted query hook before declaring the split clean. Keys are part of the client contract, not incidental wiring.

---

## 2026-05-05 — Extracted playback hooks own their timer cleanup and renderer state

**What happened**: Moving TV playback UX into hooks exposed two easy-to-miss contracts: timer refs created inside a hook still need unmount cleanup, and overlay visibility must follow the page's final `showBumper` render state rather than recomputing a similar condition locally.

**Why it mattered**: Playback refactors can typecheck while leaking delayed state updates or drifting from the exact renderer branch the user sees. Those bugs are subtle because they show up as stale overlays, late timers, or state updates after the component has already moved on.

**Fix**: Patched the stall-indicator hook to clear its timeout on unmount, made MTV overlay timing consume the page's `showBumper` state directly, and then moved broadcast playback-state selection, bumper deck selection, timer refs, and queue-cursor sync into hooks with explicit ownership.

**Rule**: When extracting playback hooks, move the timer cleanup and the renderer-derived state contract with the hook. Do not duplicate display predicates inside a hook if the page already computes the exact render branch.

---

## 2026-05-05 — Playback lifecycle hooks need explicit ref and setter contracts

**What happened**: The TV page still owned the power/channel reset lifecycle and the buffer-gate bumper loop inline, even after the surrounding playback timers, bumper deck, media handlers, and stall indicator had moved out. That left the shell responsible for clearing many timers, resetting pinned playback refs, and maintaining the gate's forward-ref recursion.

**Why it mattered**: These lifecycle paths are production-sensitive because stale timers or stale bumper refs can survive power toggles, channel flips, or item replacement. If the page keeps half of the state machine while hooks own adjacent playback behavior, future agents have to edit the shell for every buffer, reset, or transition change.

**Fix**: Moved the reset effect into `useTVPowerSignalReset` and moved the bumper/gate transition state machine into `useTVBufferGate`, keeping the shared `bufferGateActiveRef` and abort ref as explicit contracts for stall handling, media events, remote controls, and current-item lifecycle cleanup.

**Rule**: For playback lifecycle extraction, move the whole reset or state-machine loop together and make every shared ref/setter an explicit hook argument. Preserve forward-ref recursion inside the owning hook so the page cannot grow a stale duplicate.

---

## 2026-05-05 — Timeline JSX extraction must remove the second render owner

**What happened**: The W timeline composer and feed were moved into `client/src/features/w/timeline/WTimelinePanel.tsx`, but an older timeline feed branch was still left at the bottom of `W.tsx` after the helper styles/functions had moved.

**Why it mattered**: The page type gate failed on missing helper/style names, and even restoring those names would have created two timeline owners rendering the same feed. Extraction is only complete when the source page delegates to one owner.

**Fix**: Removed the stale bottom timeline JSX branch from `client/src/pages/W.tsx`, leaving the route to pass explicit posts, accounts, mutation objects, drafts, errors, and setters into `WTimelinePanel`.

**Rule**: After lifting a JSX panel, search the source page for the old branch label, active-view guard, helper names, and moved styled components. Delete the stale render owner before running the type gate.

---

## 2026-05-05 — Hook extraction must preserve the source effect dependency owner

**What happened**: While moving the desktop pet care-tool cursor lifecycle into `useDesktopPetToolCursor`, the source component's disabled-reset effect briefly inherited the removed cursor effect's `[activeTool]` dependency tail.

**Why it mattered**: The extracted hook was correct, but the remaining source effect would have stopped resetting desktop pet actors when `enabled` changed. A mechanical move can break behavior by damaging the code left behind, not only the code being moved.

**Fix**: Restored the disabled-reset dependency to `[enabled]`, kept the active-tool reset inside the new hook, and reran the requested verification.

**Rule**: After removing an effect block, reread the neighboring effect from `useEffect(` through its dependency array. Verify the source effect's trigger still matches the state it owns.

---

## 2026-05-06 — Pet care inventory must not depend on checkout UI

**What happened**: The desktop pet care tray still contained an in-app market/cart checkout surface while the marketplace signer/configuration was not ready for that care tool flow. Food inventory also needed explicit defaults so pet care would not depend on a live purchase path.

**Why it mattered**: Pet care needs dependable inventory, not a broken or premature purchase affordance. Buying food from the in-app market can still be valid, but the care tool should only consume canonical `in_app_inventory_items` rows and should not own wallet/cart behavior.

**Fix**: Removed the care-tray market UI and replaced its checkout hook with an inventory-only hook. Added idempotent starter food for newly generated pets through both browser and MCP pet creation paths, and added a one-time migration granting existing users three pet-food inventory items.

**Rule**: Keep purchase surfaces separate from care surfaces. Care tools may display and consume inventory, but wallet/cart controls belong in a dedicated market surface. Any starter or backfill grant must be idempotent and must write to the same inventory table used by verified purchases.

---

## 2026-05-06 — Branch pushes are not live deploys

**What happened**: The pet-care market removal and food-inventory fix was pushed to the feature branch, but production still served the old bundle and database state. A live user created a new pet and still saw zero food plus the stale market UI because the change had not reached `main` and the Hetzner deploy workflow had not run.

**Why it mattered**: A branch push can be useful for review, but it does not satisfy a production-visible bug report. Users testing `wtfgameshow.app` only see changes after the serving branch is updated, migrations run, and the deployed app is verified.

**Fix**: Move production-visible fixes onto `main`, let the Hetzner deploy workflow run, and verify live health/UI behavior before calling the issue live.

**Rule**: For production-facing fixes, do not say "live" or "done" after only pushing a feature branch. Confirm the commit is on the deployed branch, the deploy job or server deploy script has completed, migrations have applied, and the public app is serving the new behavior.

---

## 2026-05-06 — Survival test tools must not depend on undistributed inventory

**What happened**: The pet care Rest tool was implemented as a pillow placement tool and gated on `shoebox` inventory. Because users were granted food but not shoeboxes, live testers saw Rest greyed out and could not keep pets alive through normal care.

**Why it mattered**: During live care-loop testing, rest is a core survival action, not a cosmetic market item. An inventory gate is only safe when the item has a verified grant, purchase, or backfill path for the testers who need it.

**Fix**: Removed the shoebox requirement from the Rest/pillow tool while keeping food and medicine consumption checks intact. The button now reads `Rest`, only requires the pet to be alive, and placement no longer fails with "No shoebox in inventory."

**Rule**: Do not gate survival-critical test tools on inventory unless distribution has been verified in production. If a tool is temporarily free for testing, make the UI label match the free action and leave itemized inventory checks only on consumables that users actually have.

---

## 2026-05-06 — Bumper toggles need persisted media assignments, not inferred button state

**What happened**: My Videos and the TV creator screens could send media into channel workflows, but bumper membership was still represented by upload-oriented bumper rows and one-way buttons. That left media-library videos without visible personal/community bumper state, and deleting a media item would not clearly describe the bumper memberships it was about to clear.

**Why it mattered**: A toggle is only trustworthy if it reflects a durable server record. Bumper caps also have to be enforced where the record is created, otherwise different UI surfaces can disagree about whether a user has slots left.

**Fix**: Added a `tv_bumpers.media_item_id` FK for media-backed bumpers, routed media-library bumper assignment through a server-side toggle endpoint that enforces personal/community caps, and surfaced those assignments in My Videos, TV channel media, TV media library, and delete-usage previews.

**Rule**: Whenever UI shows local media membership in a TV bucket, model the membership as its own persisted domain link with cap checks in the owning server route. Do not infer state from labels, and include the membership in cascade previews.

---

## 2026-05-06 — Desktop environment items need element-owned interaction scripts

**What happened**: Adding desktop objects like fans, sticky notes, lights, mops, and vacuums could have turned into another top-level simulation branch where pet, ant, ball, and drop rules all depend on one giant orchestrator knowing every object.

**Why it mattered**: The desktop layer is meant to become chaotic and expandable. If new items do not have explicit per-element interaction contracts, future elements will collide in unpredictable ways, and every new item will require risky edits across unrelated simulation loops.

**Fix**: Added a persisted desktop item subdomain, then gave ants, pets, balls/toys, and drops their own item-interaction scripts. The top-level scene now only wires refs/state/rendering, while sticky traps, fan/light effects, dirty ball smears, mop passes, vacuum cleanup, wet paper, footprints, and note marks live in the relevant element domains.

**Rule**: When adding a desktop item, add the item model/rendering in the item subdomain and add each affected element's reaction in that element's own `itemInteractions` script. Keep living-element behavior separate from physics/drop cleanup so new objects do not become cross-cutting one-offs.

---

## 2026-05-06 — Desktop artifacts must be owned by the desktop shell, not pet care

**What happened**: I initially surfaced fan, sticky note, mop, vacuum, and hanging-light placement through the desktop pet care tray because those items interact with pets and ants.

**Why it mattered**: Interaction is not ownership. General desktop artifacts can affect pets without being pet-care tools. Putting them in the care tray made the pet system the only way to create or place them, which conflicts with marketplace purchases that should spawn artifacts directly on the user's desktop.

**Fix**: Removed general artifact tools from pet care, lifted desktop artifact state into the desktop shell, added independent artifact persistence, and synchronized spawned artifacts from `desktop_fun` inventory quantities. Pet, ant, ball, and drop simulations now read the desktop-owned artifact layer instead of creating it.

**Rule**: Before adding a tool button, identify the owning surface. Pet care owns pet maintenance actions only, such as food, water, rest, medicine, and balls. Purchased desktop artifacts belong to the desktop shell and should spawn from inventory or desktop artifact systems, even when pets react to them.

---

## 2026-05-06 — Desktop artifact spawners and inactive catalog seeds must match

**What happened**: The desktop artifact synchronizer knew how to spawn generic desktop icons for spraycan, catapult, and ant farm inventory, but the inactive in-app market seed only created the fan, hanging-light, sticky-note, mop, and vacuum rows.

**Why it mattered**: A desktop item can be correctly modeled in the client and still be impossible for admins to grant or later stock if the marketplace catalog row does not exist. This is especially easy to miss when items are intentionally inactive and hidden from users.

**Fix**: Added inactive `desktop_fun` catalog rows for spraycan, catapult, and ant farm, keyed to the same SKUs the desktop artifact synchronizer already watches. Added a normalization test for generic artifact icons.

**Rule**: Whenever adding an inventory-driven desktop artifact, update the spawner SKU map, inactive catalog seed, and normalization tests in the same pass. Hidden/not-for-sale items still need catalog rows if admin inventory is expected to target them later.

---

## 2026-05-06 — Store inventory must be enforced on the grant path

**What happened**: The in-app marketplace needed admin-controlled item visibility and store inventory, but the existing item table only had an `active` flag. Without server-side stock checks, a hidden UI could still be bypassed by direct checkout API calls once an item was active.

**Why it mattered**: Marketplace stock is an economy invariant, not just a display count. If the grant route does not reserve stock atomically, users can overbuy limited items through stale carts, concurrent checkouts, or direct API calls.

**Fix**: Added `stock_quantity` to in-app market items, added an Admin Panel In-App Market tab for visibility and stock quantity, included stock in user-facing market responses, capped cart quantities by stock, and made EXP checkout decrement stock before granting inventory.

**Rule**: Any limited marketplace inventory must be stored and decremented server-side in the same transaction that grants inventory. UI limits are helpful, but they are never the authority for stock.

---

## 2026-05-06 — Etherlink wallets need their own EVM domain, not widened Tezos tables

**What happened**: Adding Etherlink connectivity was tempting to solve by pushing 0x addresses through the existing Tezos wallet and FA2 holdings tables, but those tables are constrained around tz/KT1 address lengths and many app routes assume every linked wallet is a Tezos wallet.

**Why it mattered**: Users need to connect Tezos and Etherlink at the same time. If Etherlink rows live in Tezos-owned tables, downstream auctions, recapture, marketplace, TzKT sync, and primary-wallet assumptions can accidentally treat EVM accounts as Tezos accounts.

**Fix**: Added a separate Etherlink schema, auth nonce table, wallet session context, API routes, Blockscout sync helper, and Profile panel. The client uses EIP-6963/EIP-1193 provider discovery with Temple preference and MetaMask fallback, while the server verifies EVM signatures with `viem`.

**Rule**: Cross-chain wallet support should be split by chain/runtime domain. Keep Tezos Beacon/Taquito state and Etherlink EIP-1193 state independent, and bridge them only through account-level UI and explicit server ownership checks.

---

## 2026-05-06 — External explorer links must satisfy the link safety gate

**What happened**: The Etherlink Profile panel linked wallet and token contracts to Blockscout with `target="_blank"` and `rel="noreferrer"`. Local typecheck and build passed, but the GitHub Quality Gates workflow failed at `npm run check:external-links`.

**Why it mattered**: The external link checker is part of the production gate. A deploy can begin from a main push, but leaving the quality workflow red makes the release harder to trust and can hide real browser security regressions.

**Fix**: Updated the new Etherlink explorer anchors to use `rel="noopener noreferrer"` and reran the external link check before pushing the follow-up commit.

**Rule**: Every new `target="_blank"` anchor must include the exact `rel="noopener noreferrer"` value expected by the repo safety script. Run `npm run check:external-links` when adding any external links.

---

## 2026-05-06 — Desktop mutators need shared material contracts before item-specific behavior

**What happened**: Adding scale tools, portals, paper shredders, trains, a jukebox, and weather effects touched desktop persistence, simulation loops, media routes, and in-app market stock. The one concrete bug in this pass was a train-kit unpack array whose item kind widened during construction, which TypeScript caught before build.

**Why it mattered**: Mutator items are especially risky because they act on other objects. Without a shared material/compatibility contract, each new item would need bespoke checks scattered through pet, ant, ball, media, and shell code.

**Fix**: Added desktop material, scale, portal, and mutator helpers before wiring item actors. Train-kit pieces now construct as explicit `DesktopItemState` objects, while pets, ants, balls, and desktop tools consume shared contracts instead of naming every future item inline.

**Rule**: Build mutator-capable desktop items around shared capability contracts first, then add element-owned reactions. If an item can transform another object, the target object must declare material compatibility instead of relying on the mutator to know every target by SKU or component name.

---

## 2026-05-07 — Game creator upload paths must align storage, routes, and domain helpers

**What happened**: Adding a console submission path from the new Game Studio surfaced two integration misses: the media upload allowlist did not accept ZIP game bundles, and the console route imported a manifest helper from the catalog module instead of the manifest module.

**Why it mattered**: A creator flow can look wired in the UI while failing at the first server boundary. Game bundles cross media storage, console review, runtime SDK, and moderation domains, so each hop needs an explicit contract.

**Fix**: Added ZIP MIME variants to the media upload allowlist, kept manifest reading in the console manifest subdomain, and verified the full TypeScript/build path after wiring the new routes.

**Rule**: When adding a creator upload flow, check the storage MIME allowlist, route imports, domain helper ownership, and final publish endpoint in the same pass. Treat upload acceptance as part of the feature contract, not a later polish item.

---

## 2026-05-07 — Remote game imports must preserve nullable score caps

**What happened**: The Hackcade import worker initially normalized `null` score caps with `Number(null)`, which produced `0`. Imported games with no max score would have rejected every positive score through our anti-cheat checks.

**Why it mattered**: Score caps are authority data. Treating "unset" as "zero" turns an open leaderboard into an impossible game, and scheduled importers can silently spread that bad policy to every imported title.

**Fix**: Updated the Hackcade cap normalizer to preserve `null`, `undefined`, and empty strings as `null`, added a regression assertion, and reran the importer so local imported rows carried the correct caps.

**Rule**: For liveops limits, distinguish absent from zero before converting values to numbers. `null` means no cap; `0` means no score may exceed zero. Tests for importers should cover both meanings explicitly.

---

## 2026-05-07 — Tezos identities belong in server payloads, not display fallbacks

**What happened**: Several token surfaces were still reading `metadata.creators[0]` and handing the resulting tz/KT address to React. The repo had Objkt/X identity tools and address-label backfills, but no universally callable resolver for "give me the human name for this address/token."

**Why it mattered**: Fixing display strings in individual components would leave search, TV overlays, media imports, and collection filters inconsistent. Creator and collection identity is a data concern: the API response should already include the best available name and keep raw addresses as machine-readable context.

**Fix**: Added a shared Tezos identity extractor and a server-side resolver that batches local address labels, linked-wallet Tezos domains, X hints, Objkt holder aliases, and contract metadata titles. Token, gallery, media library, marketplace, colleKT, and TV endpoints now enrich payloads before the UI renders them.

**Rule**: Any new Tezos token payload should pass through the identity resolver before leaving the server. Components may shorten a fallback address, but they should not be responsible for discovering creator aliases or collection titles.

---

## 2026-05-07 — Creator game ZIPs need validation before public runtime paths

**What happened**: The first console submission path could register a media-library ZIP directly as a public game `embedPath`, which meant review could approve an archive without proving it had a root `index.html`, safe paths, bounded uncompressed size, or console SDK wiring.

**Why it mattered**: A public game runtime is executable content. If ZIP extraction happens in the browser or after moderation, unsafe paths, unsupported files, score-spoofing SDK gaps, and unavailable private media URLs all show up too late.

**Fix**: Added a console-owned ZIP validator/extractor, versioned bundle serving under `/api/console/bundles/*`, SDK injection, moderation queue controls, and a parent postMessage bridge so sandboxed games can score through the console shell without owning credentials.

**Rule**: Game bundle approval must be based on server-validated, extracted, versioned runtime files. Do not promote a ZIP URL itself to an arcade embed path; extract it through the console domain, inject/verify the SDK, and keep score-bearing API calls brokered by the parent console shell.

---

## 2026-05-07 — Studio packagers and console validators need one asset contract

**What happened**: The first server-side Game Studio ZIP build test packaged SVG stock art, but the Console bundle validator still rejected `.svg` files. The new Studio build endpoint could have produced a neat ZIP that the next Console hop refused.

**Why it mattered**: Creator tooling and runtime validation are separate domains, but they are one user workflow. If the packager and validator disagree on allowed asset formats, creators hit a dead end after doing the right thing.

**Fix**: Added SVG to the Console bundle extension allowlist and kept a Game Studio packaging test that validates generated Studio ZIPs through the Console bundle validator.

**Rule**: Any new Game Studio packaged asset type must be accepted by the Console bundle validator in the same pass, with a cross-domain test that builds a Studio bundle and validates it as a Console bundle.

---

## 2026-05-07 — Arcade reports need accountability and audit mirroring

**What happened**: Adding community game reports could have been treated as a lightweight client feedback form. That would have left staff actions, duplicate reports, and abuse review outside the Console domain that owns public runtime and moderation.

**Why it mattered**: Public game reports are liveops evidence. If they are anonymous, unbounded, or not linked to console audit events, moderators cannot distinguish real safety issues from spam or reconstruct why a game was removed.

**Fix**: Made game reports session-bound, persisted them in `console_game_reports`, blocked duplicate open reports per user/game/category, added staff review/resolve/dismiss/reopen actions, and mirrored report opens plus staff actions into `console_audit_events`.

**Rule**: Any player-facing moderation path must have an accountable actor, bounded duplicate behavior, staff-owned status transitions, and an audit-event mirror in the owning game domain.

---

## 2026-05-07 — Arcade and Console are separate product surfaces

**What happened**: Source-imported and creator-submitted public games were being modeled through Console endpoints and stats even after the product direction had split WTF Arcade, WTF Console, and WTF Game Studio SDK into separate surfaces.

**Why it mattered**: Console is a personal owned-media experience. Arcade is the public paid-play surface. If public games leak through Console catalogs, moderation, scoring, or MCP tools, users see the wrong product model and imported games can bypass the intended play-fee lane.

**Fix**: Added explicit surface classification for stock console games versus Arcade games, moved public/imported/creator catalogs and admin routes to WTF Arcade, made Console APIs stock/owned-only, and wired the Arcade play ticket through the in-app market cart/contract path.

**Rule**: Console means stock plus owned user media. Arcade means public paid play, including source imports and creator/Game Studio submissions. Game Studio publishes to Arcade and exports/imports for Console only as owned media.

---

## 2026-05-08 — Economy anchors belong in one pricing domain

**What happened**: Arcade play access and in-app market catalog items were priced from separate surfaces, which let a play card, an Arcade credit, and desktop utility items drift into a thoughtless ladder instead of a designed economy.

**Why it mattered**: WTF, EXP, and Arcade credits all touch commerce behavior. If each feature owns its own constants, admin cannot tune rarity, score, sales, or cross-surface balance without creating arbitrary price gaps.

**Fix**: Added the in-app market rarity/score pricing lattice, locked the 1 WTF play card and 10 WTF Arcade credit as tier-one anchors, set the mop as the 100 WTF tier-two floor, seeded the vacuum as a rare item, and made Arcade read its play fee from the catalog.

**Rule**: Currency-bearing system items must declare rarity, score, and lock state in the market domain. Cross-surface prices like Arcade credits should read from catalog economics instead of duplicating constants, and discounts must round system checkout totals to whole WTF.

---

## 2026-05-08 — Inventory route fixtures must match page data contracts

**What happened**: The inventory route smoke run exposed `/user/:username` crashing because the harness returned a generic paginated response for `/api/users/:username`, while `PublicProfile` expected a profile payload with a `wallets` array.

**Why it mattered**: Route smoke tests only prove reachability when mocks preserve the same payload shape the page consumes. A fixture that is too generic can hide broken contracts until a page reads an expected field.

**Fix**: Added profile-specific user endpoint fixtures in the Playwright inventory harness and made the public profile wallet rendering tolerate a missing wallet array.

**Rule**: When adding or touching inventory route coverage, give each dynamic page the API shape it actually consumes. Keep UI components defensive around optional arrays, but fix harness shape drift at the endpoint boundary.

---

## 2026-05-08 — Desktop app gate fixtures must include every app key

**What happened**: The final type sweep found an MCP desktop app gate test still using the pre-casino app map after `DesktopAppConfig` gained the `casino` key.

**Why it mattered**: Feature-gate helpers are intentionally typed against the full desktop app registry. Stale fixture maps make unrelated work fail late and can hide whether a new app is actually governed by admin gates.

**Fix**: Updated the MCP test fixture to include `casino` so it matches the current desktop app config contract.

**Rule**: When adding a desktop app key, update test fixtures, harness app maps, and admin gate expectations in the same pass. Treat missing app keys as registry drift, not harmless test noise.

---

## 2026-05-08 — Route verification payloads should not restate spread fields

**What happened**: The Casino membership verification route returned `{ ok: true, ...result }` even though the verifier already returns its own `ok` field. TypeScript caught the duplicate response key before runtime.

**Why it mattered**: Verification endpoints are policy boundaries. A response shape that silently overwrites verifier fields makes it harder to trust failures, idempotent successes, and client-side access refresh behavior.

**Fix**: Returned the verifier result directly with the access snapshot appended, so `ok` has one source of truth.

**Rule**: When wrapping verification results, append only new fields after the verifier payload or destructure intentionally. Do not restate status fields that already come from the policy function.

---

## 2026-05-08 — Harness endpoint catch-alls must preserve exact response shapes

**What happened**: The inventory route smoke suite caught `/wtf-subdomains` crashing because the Playwright harness answered all `/api/wtf-subdomains/*` requests with one generic object. The native app expected `/api/wtf-subdomains/my` to return an array, while registrar and chat endpoints each return different object contracts.

**Why it mattered**: Broad harness catch-alls can make an E2E skeleton look complete while feeding impossible payloads to real pages. When the page hard-crashes on a harness-only shape, the suite stops proving the route surface is stable.

**Fix**: Split the WTF Domains harness responses by endpoint, mirroring the real API contracts, and added lightweight client guards around optional arrays on the native WTF Domains panels.

**Rule**: Any E2E harness route that covers a subdomain with multiple endpoints must model each endpoint shape separately. Catch-alls are only acceptable after exact fixtures for the page-owned contracts.

---

## 2026-05-08 — Live puppet E2E must own its server process

**What happened**: `npm run test:e2e:live:puppets` reused a long-running dev server on port 3000. That server was not guaranteed to be running the current branch or the E2E rate-limit bypass, causing wallet signature verification and repeated puppet logins to fail during release verification.

**Why it mattered**: Live puppet tests are only meaningful when they exercise the code under test with the test-only environment that keeps local automation inside production safety rails. Reusing an arbitrary server turns the suite into a stale-environment lottery.

**Fix**: Made the live puppet script start a Playwright-managed server on an isolated default port with `WTF_E2E_START_SERVER=1` and `WTF_E2E_REUSE_SERVER=0`, so it runs the current branch with the configured local E2E bypass.

**Rule**: Full live E2E orchestration scripts must own their server lifecycle, port, and local-only test env unless the caller explicitly opts into a remote base URL.

---

## 2026-05-08 — Live puppet DB prep must include every domain workflow schema

**What happened**: After the live puppet suite started its own server, the Casino domain workflow reached `/api/casino/status` and failed because the local E2E database had not applied the `casino_memberships` migration.

**Why it mattered**: Domain-level live E2E tests should fail on broken behavior, not missing local schema setup. If the prep script omits a domain migration, the workflow becomes a database bootstrap test by accident.

**Fix**: Added the Casino membership migration to the local puppet DB preparation migration list.

**Rule**: When adding a live route or domain workflow that reads a new table, add that table's migration to `tests/e2e/puppets/prepare-local-db.ts` in the same pass.

---

## 2026-05-08 — Console harness fixtures need endpoint-level contracts

**What happened**: Post-merge release verification caught `/console` crashing in the inventory route smoke suite because the Playwright harness returned one generic Console object for every `/api/console/*` endpoint. The page expects `/api/console/demo-cartridges` and `/api/console/cartridges` to return arrays, so spreading the generic object triggered `TypeError: It is not iterable`.

**Why it mattered**: The Console and Arcade domains have several API contracts behind one route surface. A broad catch-all can break the page with an impossible fixture shape and make the inventory suite fail for the wrong reason.

**Fix**: Split Console/Arcade harness responses for catalog, demo cartridges, user cartridges, stats, discovery, leaderboard, play-fee, and play-status endpoints before the generic fallback.

**Rule**: For route-backed domains with multiple read endpoints, add exact harness fixtures for every page-owned API contract before using a broad fallback.

---

## 2026-05-08 — Contract and signer changes need package-local verification

**What happened**: The club dues pass added a SmartPy admin helper and signer origination policy in separate packages. Root TypeScript did not catch the signer extension env-schema drift, and SmartPy rejected the private helper's storage access during contract import.

**Why it mattered**: On-chain membership flows cross the app server, browser wallet path, signer daemon, and SmartPy compiler. A clean root check alone can miss package-local signer config errors, while a contract that looks straightforward in source can still fail before it reaches Shadownet.

**Fix**: Flattened the SmartPy admin guard into the admin entrypoints, added the origination env flags to the signer extension schema, and verified with root TypeScript, signer package typecheck, signer protocol tests, SmartPy tests/compile, and inventory E2E.

**Rule**: When changing contract templates or signer protocol/policy, run the package-local verifier as well as the app-level checks: SmartPy test/compile for contracts and `npm run operator-signer:check` for signer daemon changes.

---

## 2026-05-09 — Let Taquito estimate Shadownet origination storage

**What happened**: Manual Shadownet origination of the club dues contract failed during simulation when the deploy script passed an explicit `storageLimit: 80000`, which exceeds the Tezos protocol cap.

**Why it mattered**: The compiled contract was valid and the wallet was funded, but an oversized client-side storage limit made the RPC reject the operation before origination. That turns a good deployment artifact into a false deployment failure.

**Fix**: Reused the compiled artifact and reran origination without an explicit storage limit, allowing Taquito to estimate a valid operation.

**Rule**: For Shadownet manual originations, let Taquito estimate storage unless there is a measured reason to override it. If an override is needed, keep it under the protocol limit and verify with simulation before sending.

---

## 2026-05-09 — SmartPy module constants need compiler-friendly forms

**What happened**: The tiered club dues rewrite initially declared typed constants such as `ACTION_RENEW: sp.nat = 0` inside `@sp.module`. SmartPy rejected them as non-module statements before tests could run.

**Why it mattered**: The contract behavior was straightforward, but parser-only failures stop the template before typechecking, compilation, or Shadownet simulation. Constants that look like ordinary Python can still be invalid inside SmartPy's module subset.

**Fix**: Replaced the module constants with explicit `sp.nat(...)`/numeric literals at storage and comparison sites, then reran SmartPy unit tests and compile.

**Rule**: In SmartPy `@sp.module` contracts, keep module-level declarations to supported type/class forms. Use inline literals or storage-backed config for action/status codes unless a known-good constant pattern has already compiled in this repo.

---

## 2026-05-09 — Casino simulations must preserve aggregate fairness counters

**What happened**: The WTF Button simulator initially counted Rug Clash winners that differed from the first entrant by looking only at the currently live button rounds. Trial restarts replace round objects, so settled-round clash histories were no longer visible to the final report. The first smoke report also labeled a modest multi-winner spread as single-player domination because the threshold was too sensitive for short experiments.

**Why it mattered**: Simulation reports guide economy and fairness tuning. If counters are derived from mutable live state after restart, the report can undercount resolved clashes and make the table look less random or more dominated than it is.

**Fix**: Added an aggregate simulation stats object that increments when each Rug Clash resolves, and tightened the dominance flag to require a majority of winner rounds.

**Rule**: Long-running casino simulations must record aggregate metrics at the event moment, not reconstruct them only from the final live state. Restarted or archived rounds need durable report counters.

---

## 2026-05-09 — Verify WebGL game scenes with screenshots when direct pixels lie

**What happened**: The Guinea Pig Raceway scene was visibly rendering in Playwright screenshots, but a direct WebGL `readPixels` probe still reported an empty buffer in automation. The test looked like a blank-canvas failure even though the rendered 3D racers and track were present.

**Why it mattered**: Browser game release checks need to prove the player can see the real 3D scene across desktop and mobile. A false negative in the pixel probe either blocks valid work or tempts future agents to delete useful visual checks.

**Fix**: Kept the Three.js renderer using a preserved drawing buffer and changed the Playwright scene test to capture the canvas screenshot, parse the PNG pixels, and assert nonblank color variance from the actual rendered output.

**Rule**: For WebGL/Three.js route smoke tests, prefer screenshot-based pixel assertions when direct canvas or GL buffer reads disagree with visible output. Keep desktop and mobile viewports in the same release check.

---

## 2026-05-09 — Telegram wallet ingest must preserve Tezos address case

**What happened**: The first Telegram digest normalizer pass treated extracted wallet mentions as lowercase identifiers. Tezos addresses are base58 strings, so lowercasing can change the address and break wallet matching or on-chain balance checks.

**Why it mattered**: FART NOISES tracking depends on matching Telegram text to linked wallets and TzKT balance responses. A case-mutated address would silently miss the real wallet and make the digest look empty or untrusted.

**Fix**: Changed the normalizer to trim and validate `tz1`/`tz2`/`tz3` base58 addresses without changing case.

**Rule**: Never lowercase Tezos wallet addresses for matching, storage, or chain queries. Normalize whitespace only, then validate with a base58-aware pattern.

---

## 2026-05-09 — Descriptor APIs must not read deploy-only asset bytes

**What happened**: The Game Studio asset catalog endpoint returned 500 in production after deploy because descriptor generation called the raw asset file builder for every stock asset. The runtime image served built assets from `dist/public` but did not include the original `public/` tree expected by those raw file reads.

**Why it mattered**: A metadata endpoint should stay cheap and resilient. Reading source bytes while listing descriptors couples public catalog browsing to container file layout and turns missing optional files into full route failure.

**Fix**: Made descriptor bundle paths metadata-only, added a `dist/public` fallback for raw source resolution, copied `public/` into the runtime image, and covered the descriptor path with a missing-source regression test.

**Rule**: Descriptor/list endpoints must not read large or deploy-layout-sensitive source files. Reserve byte reads for explicit download/build paths and keep Docker runtime copies aligned with any files those paths resolve.

---

## 2026-05-09 — Test-only puppet grants must still satisfy production constraints

**What happened**: The live puppet seed attempted to create temporary casino memberships with a zero-fee row. The insert failed on the production table's positive-fee constraint before the puppets could exercise casino routes.

**Why it mattered**: Seed shortcuts are there to make coverage practical, but they still run against the same schema invariants as paid flows. A grant path that bypasses payments can accidentally prove less than production if it writes impossible rows.

**Fix**: Seed temporary puppet memberships with a minimal positive fee, keep the app-pass inventory grant alongside the membership, and verify access through `/api/casino/status` before casino game probes run.

**Rule**: Puppet entitlement seeds may bypass external purchase mechanics, but they must preserve production database constraints and then prove the resulting access through live API checks.

---

## 2026-05-09 — Bulk seeded desktop artifacts need deterministic IDs

**What happened**: Granting several desktop inventory items to every puppet made the auto-spawn path create many desktop artifacts during route smoke tests. The artifact IDs used timestamp plus randomness, which produced a duplicate React key under the bulk seeded live harness.

**Why it mattered**: A random key collision is rare in manual play but likely enough in broad route automation, and the live puppet harness correctly treats React key collisions as fatal browser errors.

**Fix**: Inventory-backed desktop artifacts now derive stable IDs from the item kind, SKU, and inventory ordinal, while manually placed desktop items keep their normal generated IDs.

**Rule**: Any inventory-backed UI object spawned in bulk by E2E seeds must have deterministic per-inventory-instance identity. Reserve random IDs for one-off user-created objects.

---

## 2026-05-09 — Arcade paid play needs both ownership and balance checks

**What happened**: The Arcade UI buried the selectable game grid below score/community panels, and the paid-play gate only looked at expendable `arcade-play-ticket` credits. It did not require the durable `arcade-play-card` pass item the product model depends on.

**Why it mattered**: Players could see games but had to scroll inside a cramped selector, while the economy did not match the intended card-and-credits model. A credit-only gate also makes admin pricing and market issuance harder to reason about because ownership and balance are separate concerns.

**Fix**: Reworked the Arcade layout so the catalog owns the main viewport, moved stats and community data into a side/bottom rail, added per-game credit rules, and made session creation require both a Play Pass Card and enough loaded credits before deducting credits.

**Rule**: Arcade paid-play checks must model pass ownership and credit balance separately. UI panels with secondary telemetry should never consume the primary game-selection viewport, and local smoke tests that add schema columns need a migrated database or explicit route mocks.

---

## 2026-05-09 — OS shell state needs durable workspace semantics

**What happened**: WTF OS could open, move, minimize, and focus app windows, but the workspace only lived in React memory. A browser refresh erased the user's open work, and the taskbar had no Show Desktop, restore-all, quick close, or keyboard focus-cycle behavior.

**Why it mattered**: A desktop shell feels coherent when the workspace survives refreshes and the taskbar behaves like a real operating environment. Without durable session state and fast global controls, WTF OS reads as a themed web page instead of an OS.

**Fix**: Added a versioned local window-session store, pure state helpers with tests, taskbar Show Desktop / Restore Windows, keyboard focus cycling, minimize-all, middle-click taskbar close, a root styled-components prop filter for React95 shell noise, and inventory handles for the new interactions.

**Rule**: Window manager changes must treat open windows as a durable workspace. Persist normalized shell state, keep global controls testable as pure helpers, filter framework-only shell props before they hit the DOM, and smoke-test taskbar plus keyboard flows in a browser before claiming OS polish.

---

## 2026-05-09 — Route shells must treat sparse payloads as empty states

**What happened**: After the OS gained per-window crash isolation, the full inventory smoke still exposed app windows that opened directly into crash fallbacks. Tezos Intel, Marketplace, My Gallery, and Studio Project each trusted nested API fields that are valid in full production payloads but absent in sparse harness or empty-state responses.

**Why it mattered**: A crash-isolated desktop is better than a collapsed desktop, but a real OS still should not greet users with crashed windows for ordinary empty data. Inventory route smoke is valuable because it exercises direct app launch paths that normal happy-path browsing can miss.

**Fix**: Defaulted list, count, facet, and pagination payloads at feature boundaries, and made Studio Project wait for an actual project detail payload before connecting realtime collaboration.

**Rule**: Route-level app shells must normalize optional arrays and nested objects before rendering. Realtime sockets should not connect until the backing entity exists, and every route fixture failure should be treated as a broken window unless the failure is explicitly external and documented.

---

## 2026-05-09 — fxhash pagination has a hard page-size ceiling

**What happened**: The first GM NFT cache dry run queried the fxhash GraphQL API with `take: 100` for project objkts. The API rejected the request because `take` must not be greater than 50.

**Why it mattered**: Server-volume hydration scripts must be boring and repeatable. A too-large page size would fail the first production cache warm and leave the daily GM welcome without local image assets.

**Fix**: Clamp the GM NFT downloader page size to 50 and verified that project 24858 returns all 192 assigned objkts across bounded pages.

**Rule**: fxhash GraphQL collection/object pagination must use `take <= 50`; larger collections need explicit bounded loops and a final count check before writing manifests.

---

## 2026-05-09 — Auth success should land on the OS, not an app window

**What happened**: Login and registration both redirected successful users to `/dashboard`, so new users immediately saw a Dashboard app window instead of the desktop and any first-run welcome messages.

**Why it mattered**: WTF OS onboarding should feel like entering an operating system. Auto-opening a dense app after account creation makes the first session feel abrupt and can visually compete with welcome/GM modals.

**Fix**: Changed login, wallet login, registration, and authenticated auth-page redirects to land on `/`; polished the React95 auth windows; and aligned the client registration password hint with the server's 8-character minimum.

**Rule**: Auth success paths should return to the desktop root unless the user explicitly requested a deep link. First-run modals should own the first post-login moment before app windows compete for attention.

---

## 2026-05-09 — Admin route smoke can return object-shaped empty payloads

**What happened**: The full inventory run for the auth polish pass failed on `/control-board` because the harness returned a non-array payload where the Control Board assumed `seasons`, `rounds`, and `contestants` query data were always arrays.

**Why it mattered**: A login UX change should not be blocked by an unrelated admin window crash, but the failure still means direct route smoke can open a broken window for staff users. Sparse harness payloads are good pressure tests for production empty states.

**Fix**: Normalized Control Board query data through an array guard before filtering, finding, mapping, or passing props downstream.

**Rule**: Admin route components must guard list-shaped API payloads with `Array.isArray` at the feature boundary before rendering. Treat harness object payloads as empty states, not as render-time exceptions.

---

## 2026-05-09 — Desktop shortcut drops need their own contract

**What happened**: WTF OS needed Start menu drag-to-desktop shortcuts and right-click-like Shift-click menus, but the desktop already has several independent interaction layers: native icons, route windows, pet/artifact toys, and pointer-driven item physics.

**Why it mattered**: A broad desktop drop or pointer handler would make the OS feel more powerful while quietly stealing events from inventory-backed desktop items. That would break the exact toy-like interactions that make the desktop feel alive.

**Fix**: Added a dedicated Start menu shortcut MIME payload, local shortcut persistence, and element-owned context menus. Desktop drops now only activate for `application/x-wtf-start-menu-item`; desktop artifacts keep their own pointer handling and expose menus through their actor layer.

**Rule**: New desktop shell gestures must be opt-in per interaction layer. Use explicit drag MIME types and element-owned context handlers instead of global desktop event interception, and verify that desktop artifacts remain outside shortcut-specific drop paths.

---

## 2026-05-09 — Welcome modal links still need repo link policy

**What happened**: The GM welcome modal added a new external Objkt collection link with `target="_blank"` and `rel="noreferrer"`, which passed local type/build checks but failed the quality gate's external-link safety check.

**Why it mattered**: Full-send deploy can finish before the parallel quality gate fails, leaving production technically updated but the release not clean. Link safety is part of the browser security surface, even for tiny modal copy.

**Fix**: Updated the welcome link to `rel="noopener noreferrer"` and refreshed the quality workflow actions to current Node 24-compatible major versions.

**Rule**: Any new `target="_blank"` link must use `rel="noopener noreferrer"` before commit. During full-send, watch both deploy and quality workflows; do not call the release done until both are green or a blocker is documented.
