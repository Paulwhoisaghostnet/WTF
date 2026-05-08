# Modular Junk Drawer Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the remaining useful WTF-adjacent software into the main WTF repository without rebuilding a monolith or hiding unrelated failure modes inside shared files.

**Architecture:** Use a domain-module strangler pattern. Every integration gets a clear owner folder, a stable public wrapper, a typed contract, feature flags where runtime behavior changes, and a focused verification path before the next integration begins.

**Tech Stack:** Node 20, TypeScript, Express 5, Drizzle ORM, PostgreSQL, React 19, TanStack Query, Vite, Next.js for the Collekt module, Discord bot extension runtime, SmartPy/Tezos tooling where already used.

---

## Scope

### In Scope, In Priority Order

1. `building/wtf-operator-signer`
2. `wtf tez/hack-tez` and `wtf tez/wtf.tez`
3. `collekt-wtf`
4. IPFS creation-tool snapshots:
   - JACK INDUSTRIES / Industrializer: `../jack-industries-ipfs-bafybeibdr7qfnx76t37iymhl5nja7yfis4ezt3mamlgsvqdzle6pcodyzi`
   - Particle System Capture / Paul's Particles V1: `../particle-system-capture-ipfs-Qmf6ZkGLgzJBFiAG2iXueCo3utYWHDgVJ1brhyzrcBxmy5`
5. `PP-UI-update-reference` and `Particle Painting/particle-studio`
6. Tezos analytics tools: `Guidance`, `Tezos-Intel`, `Objkt-Advisor`, `Tezos-Scout`, `tezpulse`, `wallet-constellations`, `web3 simulator`, `objkt-owned-editions-sorter`
7. `building/Discord Bots`
8. `WTF-ux-interoperability-clone` leftovers
9. `building/wtf-gameshow-bot` deploy/provisioning deltas

### Out Of Scope

These are intentionally excluded for this integration pass:

- `building/shadownet kiln`
- `building/Bowers`
- `building/smartpy-test-platform`
- `building/shadowdex`
- `wtf-standalone-w`
- `wtf-standalone-microapp`
- `wtf-tv-standalone`
- root Porcupin tunnel scripts

## Non-Negotiable Modularity Rules

- Keep public compatibility wrappers stable: existing route files, page URLs, and extension entrypoints should continue to exist while internals move behind them.
- Do not add new behavior directly to `server/routes.ts`, `server/routes/*.ts`, `client/src/pages/*.tsx`, or `shared/schema.ts` unless that file is acting as a small wrapper.
- Each integrated domain must own its API contracts, env parsing, runtime service, tests, and docs.
- Cross-domain imports must go through a narrow contract or service function, not through another domain's internal files.
- Large standalone apps should enter the repo as `apps/*` or `extensions/*`, not as code pasted into the main Express server or desktop shell.
- Every runtime integration starts disabled or compatibility-preserving, then gets enabled after focused tests pass.
- Database schema changes should wait until the current domain modularization work has stabilized; when they happen, keep table ownership obvious by domain.

## Target Repo Shape

Create or normalize these module homes:

- `WTF/extensions/wtf-operator-signer`: standalone signer daemon, systemd files, deployment scripts, signer tests.
- `WTF/server/features/operator-signer`: main server signer client, typed request builders, signer health checks.
- `WTF/shared/operator-signer.ts`: versioned signer envelope and intent schemas shared by the server and daemon.
- `WTF/server/features/wtf-subdomains`: registrar grants, contract-facing services, chat session services.
- `WTF/client/src/features/wtf-subdomains`: registrar UI components, domain chat UI, account/domain hooks.
- `WTF/contracts/wtf-subdomains`: SmartPy registrar contract sources and compile artifacts used by WTF.
- `WTF/extensions/wtf-domain-bot`: Telegram/automation bot code extracted from the Tezos registrar apps.
- `WTF/apps/collekt`: Collekt Next/R3F app owned by the WTF repo but still deployed as a separately buildable module.
- `WTF/server/features/collekt`: token/session API contracts, token normalization, bridge configuration.
- `WTF/client/src/features/collekt`: iframe bridge, embed state, diagnostics, launch surface.
- `WTF/client/src/features/creation-tools`: creation tool registry, iframe wrapper, asset diagnostics.
- `WTF/public/creation-tools/industrializer`: complete static Industrializer asset bundle from the JACK INDUSTRIES IPFS snapshot.
- `WTF/public/creation-tools/pauls-particles-v1`: complete static Particle System Capture asset bundle from the Paul's Particles IPFS snapshot, retaining WTF's local `p5.min.js` improvement.
- `WTF/PP/src/features/audio-cv`: Particle Painter audio/CV UI, graphing, analysis adapters.
- `WTF/PP/src/features/export`: Particle Painter export/html/Tezos export adapters.
- `WTF/server/features/tezos-intel`: analytics import, scoring, creator comparison, market map, scout APIs.
- `WTF/client/src/features/tezos-intel`: analytics panels and visualizations surfaced inside WTF.
- `WTF/extensions/objkt-owned-editions-sorter`: browser extension source, manifest, packaging notes.
- `WTF/extensions/wtf-gameshow-bot/src/features/community-xp`: Discord XP, leveling, leaderboards.
- `WTF/extensions/wtf-gameshow-bot/src/features/community-challenges`: image challenges and moderation review.
- `WTF/extensions/wtf-gameshow-bot/src/features/trait-ideas`: trait suggestion/adoption flow.
- `WTF/extensions/wtf-gameshow-bot/src/features/dj`: music queue and playback commands, if still desired.
- `WTF/client/src/features/ux-lab`: dev-only UX lab harness and mock data.
- `WTF/docs/integrations`: per-domain migration notes, source mapping, and operational runbooks.

## Shared Execution Pattern

Use this pattern for every priority track:

- [ ] **Step 1: Capture source map**

  Create `WTF/docs/integrations/<domain>-source-map.md` listing the source folder, the target folder, important files, runtime env vars, and the first test command.

- [ ] **Step 2: Add contracts before behavior**

  Create the shared TypeScript contract or adapter shape first. Runtime code should import this contract rather than restating payload shapes locally.

- [ ] **Step 3: Move code into its owner folder**

  Import the source into the smallest correct module home: `extensions/*` for independently running services, `apps/*` for independently built apps, `server/features/*` for server modules, `client/src/features/*` for UI modules.

- [ ] **Step 4: Keep wrapper compatibility**

  Existing WTF route/page/extension entrypoints should delegate into the new module. Do not remove old public paths in the same commit that imports code.

- [ ] **Step 5: Add feature flag or health gate**

  New runtime behavior must be gated by an env var, admin setting, or health check until the module passes focused verification.

- [ ] **Step 6: Verify the module**

  Run the smallest meaningful command first, then `npm run check`, then a browser or integration smoke only if the module has UI/runtime behavior.

- [ ] **Step 7: Commit one domain at a time**

  Commit each integration track separately with a message naming the domain, for example `feat(operator-signer): integrate signer daemon package`.

## Task 0: Preflight Boundary Audit

**Files:**
- Read: `WTF/docs/superpowers/plans/2026-05-05-wtf-domain-modular-architecture.md`
- Read: `WTF/server/routes.ts`
- Read: `WTF/client/src/routes/page-defs.ts`
- Create: `WTF/docs/integrations/README.md`

- [ ] **Step 1: Confirm the current branch and dirty files**

  Run:

  ```bash
  cd "/Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/WTF combo/WTF"
  git status --short
  ```

  Expected: record existing dirty files. Do not revert unrelated user changes.

- [ ] **Step 2: Create integration docs index**

  Create `docs/integrations/README.md` with this structure:

  ```markdown
  # WTF Integration Index

  This folder tracks formerly external WTF-adjacent software as it moves into domain-owned modules.

  ## Active Integration Tracks

  | Priority | Domain | Source | Target Owner | Runtime Shape | Status |
  | --- | --- | --- | --- | --- | --- |
  | 1 | Operator signer | `../building/wtf-operator-signer` | `extensions/wtf-operator-signer` + `server/features/operator-signer` | daemon + server client | planned |
  | 2 | WTF Tezos domains | `../wtf tez/hack-tez`, `../wtf tez/wtf.tez` | `server/features/wtf-subdomains`, `client/src/features/wtf-subdomains`, `contracts/wtf-subdomains`, `extensions/wtf-domain-bot` | server/client/contract/bot | planned |
  | 3 | Collekt | `../collekt-wtf` | `apps/collekt`, `server/features/collekt`, `client/src/features/collekt` | app + bridge APIs | planned |
  | 4 | IPFS creation tools | `../jack-industries-ipfs-bafybeibdr7qfnx76t37iymhl5nja7yfis4ezt3mamlgsvqdzle6pcodyzi`, `../particle-system-capture-ipfs-Qmf6ZkGLgzJBFiAG2iXueCo3utYWHDgVJ1brhyzrcBxmy5` | `public/creation-tools/industrializer`, `public/creation-tools/pauls-particles-v1`, `client/src/features/creation-tools` | static creation tool asset bundles | planned |
  | 5 | Particle Painter references | `../PP-UI-update-reference`, `../Particle Painting/particle-studio` | `PP/src/features/*` | Vite creation tool module | planned |
  | 6 | Tezos intelligence | `../Tezos analytics/*` | `server/features/tezos-intel`, `client/src/features/tezos-intel`, `extensions/objkt-owned-editions-sorter` | server/client/extension | planned |
  | 7 | Discord community bot features | `../building/Discord Bots` | `extensions/wtf-gameshow-bot/src/features/*` | bot feature modules | planned |
  | 8 | UX lab leftovers | `../WTF-ux-interoperability-clone` | `client/src/features/ux-lab` | dev-only client harness | planned |
  | 9 | Bot deployment deltas | `../building/wtf-gameshow-bot` | `extensions/wtf-gameshow-bot/infrastructure` | workflow/scripts | planned |
  ```

- [ ] **Step 3: Run the current compile baseline**

  Run:

  ```bash
  cd "/Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/WTF combo/WTF"
  npm run check
  ```

  Expected: PASS, or document existing failures in `docs/integrations/README.md` before importing code.

## Task 1: Integrate The Operator Signer As A First-Class Extension

**Files:**
- Create: `WTF/shared/operator-signer.ts`
- Create: `WTF/server/features/operator-signer/client.ts`
- Create: `WTF/server/features/operator-signer/health.ts`
- Create: `WTF/extensions/wtf-operator-signer/package.json`
- Create: `WTF/extensions/wtf-operator-signer/src/index.ts`
- Create: `WTF/extensions/wtf-operator-signer/src/env.ts`
- Create: `WTF/extensions/wtf-operator-signer/src/policy.ts`
- Create: `WTF/extensions/wtf-operator-signer/src/audit.ts`
- Create: `WTF/extensions/wtf-operator-signer/deploy/wtf-operator-signer.service`
- Modify: `WTF/server/lib/operator-signer-client.ts`
- Modify: `WTF/server/routes/operator-wallet.ts`
- Modify: `WTF/package.json`
- Create: `WTF/docs/integrations/operator-signer-source-map.md`

- [ ] **Step 1: Write the source map**

  Include the source `../building/wtf-operator-signer`, target `extensions/wtf-operator-signer`, current WTF client `server/lib/operator-signer-client.ts`, and the protocol mismatch: WTF currently sends a flat payload while the daemon expects `{ auth, intent, payload }`.

- [ ] **Step 2: Define one versioned signer contract**

  Add `shared/operator-signer.ts` with exported Zod schemas or TypeScript types for:

  ```ts
  export const OPERATOR_SIGNER_PROTOCOL_VERSION = 1;

  export type OperatorSignerIntent =
    | "fa2_transfer"
    | "xtz_transfer"
    | "contract_call";

  export type OperatorSignerEnvelope<TPayload = unknown> = {
    version: 1;
    auth: string;
    requestId: string;
    runId?: string;
    intent: OperatorSignerIntent;
    payload: TPayload;
  };
  ```

  The concrete payload schemas should live in this file so the server and daemon cannot drift again.

- [ ] **Step 3: Move the daemon source into `extensions/wtf-operator-signer`**

  Copy the daemon implementation from `../building/wtf-operator-signer` into the extension package, split env parsing, policy enforcement, audit logging, and socket server into separate files listed above.

- [ ] **Step 4: Replace flat request construction with typed request builders**

  Move signer request construction into `server/features/operator-signer/client.ts`. Keep `server/lib/operator-signer-client.ts` as a compatibility re-export for current imports.

- [ ] **Step 5: Add a health check**

  Add `server/features/operator-signer/health.ts` with a function that checks socket existence, daemon response, and protocol version. Surface that through the existing operator/admin diagnostics instead of adding unrelated logic to `server/routes.ts`.

- [ ] **Step 6: Verify**

  Run:

  ```bash
  cd "/Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/WTF combo/WTF"
  npm run check
  ```

  Expected: PASS.

- [ ] **Step 7: Runtime smoke**

  Start the daemon locally on a temporary socket, call the signer health check, then run one dry-run or mocked signer request. Expected: the request envelope version matches and auth failures are explicit.

## Task 2: Integrate WTF Tezos Domains Without Mixing Contracts, Chat, And Grants

**Files:**
- Create: `WTF/docs/integrations/wtf-subdomains-source-map.md`
- Create: `WTF/contracts/wtf-subdomains/`
- Create: `WTF/server/features/wtf-subdomains/grants.ts`
- Create: `WTF/server/features/wtf-subdomains/registrar.ts`
- Create: `WTF/server/features/wtf-subdomains/chat.ts`
- Create: `WTF/server/features/wtf-subdomains/contracts.ts`
- Create: `WTF/client/src/features/wtf-subdomains/api.ts`
- Create: `WTF/client/src/features/wtf-subdomains/hooks.ts`
- Create: `WTF/client/src/features/wtf-subdomains/RegistrarPanel.tsx`
- Create: `WTF/client/src/features/wtf-subdomains/DomainChatPanel.tsx`
- Create: `WTF/extensions/wtf-domain-bot/`
- Modify: `WTF/server/routes/wtf-subdomains.ts`
- Modify: `WTF/client/src/routes/page-defs.ts`

- [ ] **Step 1: Separate the source domains**

  In the source map, classify files from `wtf tez/hack-tez` and `wtf tez/wtf.tez` into four groups: registrar contract, registrar frontend/API, chat backend, and Telegram/automation bot.

- [ ] **Step 2: Keep current grants as the base module**

  Move current grant helpers from `server/lib/wtf-subdomains.ts` and `server/routes/wtf-subdomains.ts` behind `server/features/wtf-subdomains/grants.ts`. Keep `server/routes/wtf-subdomains.ts` as the public Express wrapper.

- [ ] **Step 3: Import registrar contracts into `contracts/wtf-subdomains`**

  Copy only the SmartPy registrar contract sources and compile scripts needed by WTF. Do not import standalone site assets into the contract folder.

- [ ] **Step 4: Add registrar service behind a feature flag**

  Add `WTF_DOMAINS_REGISTRAR_ENABLED`. When false, WTF keeps current grant-only behavior. When true, registrar APIs can read contract state and prepare registration operations.

- [ ] **Step 5: Add chat as its own server feature**

  Put universal/domain chat session logic in `server/features/wtf-subdomains/chat.ts` or a later `server/features/universal-chat` module if that plan has already landed. Do not attach chat state to the grants service.

- [ ] **Step 6: Add Telegram/automation bot as an extension**

  Move bot code into `extensions/wtf-domain-bot` with its own package scripts and env file. It should call WTF APIs rather than importing server internals.

- [ ] **Step 7: Add client UI as feature components**

  Add registrar and chat panels under `client/src/features/wtf-subdomains`. Route/page wrappers should import the feature components, not contain the full flow.

- [ ] **Step 8: Verify**

  Run:

  ```bash
  cd "/Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/WTF combo/WTF"
  npm run check
  ```

  Expected: PASS with registrar disabled. Then enable `WTF_DOMAINS_REGISTRAR_ENABLED=true` in local env and verify the route returns explicit disabled/misconfigured errors if contract env vars are missing.

## Task 3: Bring Collekt Into The Repo As An App Module, Not A Server Blob

**Files:**
- Create: `WTF/docs/integrations/collekt-source-map.md`
- Create: `WTF/apps/collekt/`
- Create: `WTF/shared/collekt.ts`
- Create: `WTF/server/features/collekt/session.ts`
- Create: `WTF/server/features/collekt/tokens.ts`
- Create: `WTF/server/features/collekt/config.ts`
- Create: `WTF/client/src/features/collekt/CollektBridge.tsx`
- Create: `WTF/client/src/features/collekt/useCollektSession.ts`
- Modify: `WTF/server/routes/collekt.ts`
- Modify: `WTF/client/src/pages/Collekt.tsx`
- Modify: `WTF/package.json`

- [ ] **Step 1: Import the Next/R3F app into `apps/collekt`**

  Move `../collekt-wtf` into `apps/collekt` as an independently buildable package. Preserve its Next.js runtime instead of converting it into a React page during this pass.

- [ ] **Step 2: Define the shared token/session contract**

  Add `shared/collekt.ts` with the session shape returned by `/api/collekt/session` and token shape returned by `/api/collekt/tokens`.

- [ ] **Step 3: Move server token/session logic into `server/features/collekt`**

  Keep `server/routes/collekt.ts` mounted exactly where it is, but make it delegate to `session.ts`, `tokens.ts`, and `config.ts`.

- [ ] **Step 4: Move iframe bridge logic into `client/src/features/collekt`**

  Keep `client/src/pages/Collekt.tsx` as a thin wrapper that renders `CollektBridge`.

- [ ] **Step 5: Add package scripts**

  Add root scripts for `collekt:dev`, `collekt:build`, and `collekt:check` that run inside `apps/collekt`.

- [ ] **Step 6: Verify**

  Run:

  ```bash
  cd "/Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/WTF combo/WTF"
  npm run check
  npm run collekt:check
  ```

  Expected: both commands pass. If the Collekt app has its own lint/typecheck command, wire `collekt:check` to that command.

## Task 4: Complete IPFS Creation Tool Integrations

**Files:**
- Create: `WTF/docs/integrations/industrializer-source-map.md`
- Create: `WTF/docs/integrations/pauls-particles-v1-source-map.md`
- Create: `WTF/client/src/features/creation-tools/tool-registry.ts`
- Create: `WTF/client/src/features/creation-tools/CreationToolFrame.tsx`
- Create: `WTF/scripts/check-creation-tool-assets.ts`
- Create: `WTF/public/creation-tools/industrializer/background.gif`
- Create: `WTF/public/creation-tools/industrializer/fonts/SyneMono-Regular.ttf`
- Create: `WTF/public/creation-tools/industrializer/start.ogg`
- Create: `WTF/public/creation-tools/industrializer/message-01.ogg`
- Verify: `WTF/public/creation-tools/pauls-particles-v1/index.html`
- Verify: `WTF/public/creation-tools/pauls-particles-v1/sketch.js`
- Verify: `WTF/public/creation-tools/pauls-particles-v1/lib/CCapture.all.min.js`
- Verify: `WTF/public/creation-tools/pauls-particles-v1/lib/gif.worker.js`
- Verify: `WTF/public/creation-tools/pauls-particles-v1/lib/p5.min.js`
- Modify: `WTF/client/src/pages/CreationTool.tsx`
- Modify: `WTF/package.json`

- [ ] **Step 1: Record the IPFS source snapshot**

  Add `docs/integrations/industrializer-source-map.md` with:

  ```markdown
  # Industrializer Source Map

  Source URL: `https://ipfs.io/ipfs/bafybeibdr7qfnx76t37iymhl5nja7yfis4ezt3mamlgsvqdzle6pcodyzi`
  Local snapshot: `../jack-industries-ipfs-bafybeibdr7qfnx76t37iymhl5nja7yfis4ezt3mamlgsvqdzle6pcodyzi`
  WTF target: `public/creation-tools/industrializer`
  WTF route: `/tools/industrializer`

  ## Current Finding

  The WTF copy already contains matching `index.html`, bundled JS/CSS, and `worker.png`.
  The IPFS snapshot also includes runtime assets referenced by the bundle but missing from WTF:

  - `background.gif`
  - `fonts/SyneMono-Regular.ttf`
  - `start.ogg`
  - `message-01.ogg`
  ```

- [ ] **Step 2: Record the Paul's Particles V1 IPFS source snapshot**

  Add `docs/integrations/pauls-particles-v1-source-map.md` with:

  ```markdown
  # Paul's Particles V1 Source Map

  Source URL: `https://ipfs.io/ipfs/Qmf6ZkGLgzJBFiAG2iXueCo3utYWHDgVJ1brhyzrcBxmy5`
  Local snapshot: `../particle-system-capture-ipfs-Qmf6ZkGLgzJBFiAG2iXueCo3utYWHDgVJ1brhyzrcBxmy5`
  WTF target: `public/creation-tools/pauls-particles-v1`
  WTF route: `/tools/pauls-particles-v1`

  ## Current Finding

  The snapshot is a static `Particle System Capture` p5/CCapture app.
  WTF already contains matching `sketch.js`, `lib/CCapture.all.min.js`, and `lib/gif.worker.js`.
  The only intentional HTML difference is that the IPFS page loads p5 from `https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.4.0/p5.min.js`, while WTF uses local `lib/p5.min.js`.
  Keep WTF's local p5 copy so the tool works without a CDN dependency.
  ```

- [ ] **Step 3: Complete the Industrializer static asset bundle**

  Copy the four missing runtime assets from the local snapshot into `public/creation-tools/industrializer`, preserving their relative paths. Do not overwrite the existing matching JS/CSS/HTML files unless a fresh diff shows the IPFS source changed.

- [ ] **Step 4: Preserve the Paul's Particles self-contained bundle**

  Keep `public/creation-tools/pauls-particles-v1/index.html` on `lib/p5.min.js`. Do not replace it with the IPFS CDN script tag. Confirm the local files exist:

  ```bash
  test -f public/creation-tools/pauls-particles-v1/index.html
  test -f public/creation-tools/pauls-particles-v1/sketch.js
  test -f public/creation-tools/pauls-particles-v1/lib/p5.min.js
  test -f public/creation-tools/pauls-particles-v1/lib/CCapture.all.min.js
  test -f public/creation-tools/pauls-particles-v1/lib/gif.worker.js
  ```

- [ ] **Step 5: Extract the creation tool registry**

  Create `client/src/features/creation-tools/tool-registry.ts` with a typed registry for `particle-painter`, `industrializer`, and `pauls-particles-v1`. Include `requiredAssets` for Industrializer:

  ```ts
  export type CreationToolId = "particle-painter" | "industrializer" | "pauls-particles-v1";

  export type CreationToolDefinition = {
    id: CreationToolId;
    title: string;
    src: string;
    requiredAssets?: string[];
  };

  export const CREATION_TOOLS: Record<CreationToolId, CreationToolDefinition> = {
    "particle-painter": {
      id: "particle-painter",
      title: "Particle Painter",
      src: "/creation-tools/particle-painter/index.html",
    },
    industrializer: {
      id: "industrializer",
      title: "Industrializer",
      src: "/creation-tools/industrializer/index.html",
      requiredAssets: [
        "/creation-tools/industrializer/background.gif",
        "/creation-tools/industrializer/fonts/SyneMono-Regular.ttf",
        "/creation-tools/industrializer/start.ogg",
        "/creation-tools/industrializer/message-01.ogg",
      ],
    },
    "pauls-particles-v1": {
      id: "pauls-particles-v1",
      title: "Paul's Particles V1",
      src: "/creation-tools/pauls-particles-v1/index.html",
      requiredAssets: [
        "/creation-tools/pauls-particles-v1/sketch.js",
        "/creation-tools/pauls-particles-v1/lib/p5.min.js",
        "/creation-tools/pauls-particles-v1/lib/CCapture.all.min.js",
        "/creation-tools/pauls-particles-v1/lib/gif.worker.js",
      ],
    },
  };
  ```

- [ ] **Step 6: Keep the page wrapper small**

  Move iframe rendering into `client/src/features/creation-tools/CreationToolFrame.tsx`. Keep `client/src/pages/CreationTool.tsx` as a wrapper that resolves the tool definition and renders the frame.

- [ ] **Step 7: Add an asset verification script**

  Add `scripts/check-creation-tool-assets.ts` that reads `CREATION_TOOLS`, maps each `requiredAssets` path to `public/*`, and exits non-zero when a declared asset is missing. Wire it as `creation-tools:check` in `package.json`.

- [ ] **Step 8: Verify**

  Run:

  ```bash
  cd "/Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/WTF combo/WTF"
  npm run creation-tools:check
  npm run check
  ```

  Expected: both commands pass. Browser smoke `/tools/industrializer` and confirm there are no missing `background.gif`, font, `start.ogg`, or `message-01.ogg` requests. Browser smoke `/tools/pauls-particles-v1` and confirm it loads p5 from local `lib/p5.min.js`.

## Task 5: Reconcile Particle Painter Reference Deltas Inside The Existing PP Module

**Files:**
- Create: `WTF/docs/integrations/particle-painter-source-map.md`
- Create: `WTF/PP/src/features/audio-cv/`
- Create: `WTF/PP/src/features/export/`
- Create: `WTF/PP/src/features/tezos/`
- Modify: `WTF/PP/src/App.tsx`
- Modify: `WTF/PP/src/components/*`
- Modify: `WTF/PP/src/lib/*`
- Modify: `WTF/PP/package.json`

- [ ] **Step 1: Diff and classify source changes**

  In the source map, classify deltas from `PP-UI-update-reference` and `Particle Painting/particle-studio` into audio/CV, export, engine, UI layout, Tezos integration, and dependency changes.

- [ ] **Step 2: Integrate audio/CV as a feature folder**

  Move `AudioSection.tsx`, `AudioCVGraph.tsx`, and related audio analysis adapters into `PP/src/features/audio-cv`. Export one small component consumed by the existing PP app.

- [ ] **Step 3: Integrate export changes as adapters**

  Put HTML/export/quick export deltas in `PP/src/features/export` so renderer code does not depend on UI panels.

- [ ] **Step 4: Integrate Tezos changes separately**

  Put Taquito and Teia/Objkt export helpers in `PP/src/features/tezos`. Keep blockchain behavior optional and env-gated.

- [ ] **Step 5: Verify PP in isolation**

  Run:

  ```bash
  cd "/Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/WTF combo/WTF/PP"
  npm run build
  ```

  Expected: PASS.

- [ ] **Step 6: Verify WTF wrapper still serves creation tools**

  Run from `WTF`:

  ```bash
  npm run check
  ```

  Expected: PASS. Browser smoke `/tools/particle-painter` after the current app dev server is running.

## Task 6: Integrate Tezos Analytics As Intelligence Modules

**Files:**
- Create: `WTF/docs/integrations/tezos-intel-source-map.md`
- Create: `WTF/server/features/tezos-intel/imports.ts`
- Create: `WTF/server/features/tezos-intel/scoring.ts`
- Create: `WTF/server/features/tezos-intel/scout.ts`
- Create: `WTF/server/features/tezos-intel/market-map.ts`
- Create: `WTF/server/features/tezos-intel/routes.ts`
- Create: `WTF/client/src/features/tezos-intel/api.ts`
- Create: `WTF/client/src/features/tezos-intel/hooks.ts`
- Create: `WTF/client/src/features/tezos-intel/CreatorScorePanel.tsx`
- Create: `WTF/client/src/features/tezos-intel/CreatorComparePanel.tsx`
- Create: `WTF/client/src/features/tezos-intel/MarketPulsePanel.tsx`
- Create: `WTF/extensions/objkt-owned-editions-sorter/`
- Modify: `WTF/scripts/import-intel-csv.ts`
- Modify: `WTF/server/routes.ts`

- [ ] **Step 1: Preserve existing importer behavior**

  Move importer helper logic behind `server/features/tezos-intel/imports.ts` only after recording current importer commands in the source map. Keep `scripts/import-intel-csv.ts` as the CLI wrapper.

- [ ] **Step 2: Add Objkt-Advisor scoring as a pure service**

  Implement creator scoring in `server/features/tezos-intel/scoring.ts` as pure functions over imported analytics rows. Do not add UI until scoring tests pass.

- [ ] **Step 3: Add Tezos-Scout compare APIs**

  Add creator compare/read APIs in `server/features/tezos-intel/scout.ts` and mount them through `server/features/tezos-intel/routes.ts`.

- [ ] **Step 4: Add market pulse data adapters**

  Fold `tezpulse`, market contract maps, and activity scanner logic into `market-map.ts`. Keep network calls bounded and cached in this module.

- [ ] **Step 5: Add visualizations as client panels**

  Surface scoring, comparison, and market pulse through `client/src/features/tezos-intel` panels. Do not embed p5/three wallet visualizations into unrelated pages; give each visualization an owner component.

- [ ] **Step 6: Move the owned-editions sorter into extensions**

  Place the Chrome extension under `extensions/objkt-owned-editions-sorter` with its manifest, content script, and packaging README. It should remain independently packaged.

- [ ] **Step 7: Verify**

  Run:

  ```bash
  cd "/Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/WTF combo/WTF"
  npm run check
  ```

  Expected: PASS. Then run a small scoring fixture test before exposing panels in navigation.

## Task 7: Migrate Python Discord Bot Features Into The Existing TypeScript Bot Extension

**Files:**
- Create: `WTF/docs/integrations/discord-community-bot-source-map.md`
- Create: `WTF/extensions/wtf-gameshow-bot/src/features/community-xp/`
- Create: `WTF/extensions/wtf-gameshow-bot/src/features/community-challenges/`
- Create: `WTF/extensions/wtf-gameshow-bot/src/features/trait-ideas/`
- Create: `WTF/extensions/wtf-gameshow-bot/src/features/dj/`
- Create: `WTF/extensions/wtf-gameshow-bot/src/features/tezos-verification/`
- Modify: `WTF/extensions/wtf-gameshow-bot/src/index.ts`
- Modify: `WTF/extensions/wtf-gameshow-bot/package.json`

- [ ] **Step 1: Treat Python as reference, not production runtime**

  In the source map, list Python cogs and target TypeScript feature modules. Do not run a second production Discord bot unless there is a deliberate operational reason.

- [ ] **Step 2: Add XP and leaderboard first**

  Port message/reaction/voice XP, level calculation, `stats`, `rank`, and `leaderboard` commands into `community-xp`.

- [ ] **Step 3: Add image challenges**

  Port challenge creation, user response submission, mod review, bonus awards, and challenge listing into `community-challenges`.

- [ ] **Step 4: Add trait ideas**

  Port suggestion, adoption, contributor inventory, and trait stats commands into `trait-ideas`.

- [ ] **Step 5: Add Tezos verification**

  Port Tezos verification commands into `tezos-verification`, but route identity checks through existing WTF wallet/user APIs where available.

- [ ] **Step 6: Decide DJ scope before porting**

  Port `dj` only if the current Discord bot runtime can safely support voice/music dependencies in production. If not, keep a source-map note and do not import heavy media dependencies.

- [ ] **Step 7: Verify**

  Run the bot extension check/test command from `extensions/wtf-gameshow-bot`. Then run `npm run check` from the WTF root.

## Task 8: Import UX Lab Leftovers As Dev-Only Tooling

**Files:**
- Create: `WTF/docs/integrations/ux-lab-source-map.md`
- Create: `WTF/client/src/features/ux-lab/mock-wtf-lab.ts`
- Create: `WTF/client/src/features/ux-lab/ux-lab.ts`
- Create: `WTF/client/src/features/ux-lab/CollectionWorkspace.tsx`
- Create: `WTF/scripts/run-ux-lab-panel.ts`
- Modify: `WTF/client/src/routes/page-defs.ts`

- [ ] **Step 1: Do not resurrect TV2 as a production page**

  Record `TV2.tsx` as retired experiment code unless a current product requirement exists. If a dev route is useful, use `/dev/ux-lab` and require admin/dev gating.

- [ ] **Step 2: Import mock lab utilities**

  Move `mock-wtf-lab.ts` and `ux-lab.ts` into `client/src/features/ux-lab`. Keep mock data out of production bundles where possible.

- [ ] **Step 3: Import CollectionWorkspace only if still useful**

  Put `CollectionWorkspace.tsx` in the UX lab feature folder. If a production gallery/workspace later needs it, promote it from `ux-lab` to the relevant domain module in a separate commit.

- [ ] **Step 4: Restore the UX panel runner**

  Move `scripts/run-ux-lab-panel.ts` and make it read feature-local mocks from `client/src/features/ux-lab`.

- [ ] **Step 5: Verify**

  Run:

  ```bash
  cd "/Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/WTF combo/WTF"
  npm run check
  ```

  Expected: PASS.

## Task 9: Reconcile WTF Gameshow Bot Deployment Deltas

**Files:**
- Create: `WTF/docs/integrations/wtf-gameshow-bot-deploy-source-map.md`
- Create: `WTF/extensions/wtf-gameshow-bot/infrastructure/hetzner/server-deploy.sh`
- Create: `WTF/extensions/wtf-gameshow-bot/infrastructure/hetzner/server-provision.sh`
- Create: `WTF/extensions/wtf-gameshow-bot/infrastructure/systemd/wtf-gameshow-bot.service`
- Create: `WTF/.github/workflows/deploy-wtf-gameshow-bot.yml`
- Modify: `WTF/extensions/wtf-gameshow-bot/README.md`

- [ ] **Step 1: Diff deploy files against the integrated bot**

  Compare `../building/wtf-gameshow-bot` deployment files with `extensions/wtf-gameshow-bot`. Record actual differences in the source map.

- [ ] **Step 2: Keep deployment scripts inside the extension**

  Place deploy/provision/systemd files under `extensions/wtf-gameshow-bot/infrastructure`. Do not scatter bot-specific operational files in root scripts.

- [ ] **Step 3: Add a dedicated workflow**

  Add `.github/workflows/deploy-wtf-gameshow-bot.yml` that calls only the extension's deploy/provision scripts.

- [ ] **Step 4: Verify**

  Run:

  ```bash
  cd "/Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/WTF combo/WTF"
  npm run check
  ```

  Expected: PASS. Manually validate workflow YAML with `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/deploy-wtf-gameshow-bot.yml")'`.

## Recommended Commit Sequence

1. `docs(integrations): add junk drawer integration index`
2. `feat(operator-signer): integrate signer daemon package`
3. `feat(operator-signer): align signer protocol contract`
4. `feat(wtf-subdomains): extract grant service module`
5. `feat(wtf-subdomains): import registrar contract sources`
6. `feat(wtf-subdomains): add registrar and chat feature gates`
7. `feat(collekt): import app module into repo`
8. `feat(collekt): extract bridge contracts and feature wrappers`
9. `fix(creation-tools): complete ipfs static asset bundles`
10. `refactor(creation-tools): add modular tool registry`
11. `feat(particle-painter): integrate audio cv feature`
12. `feat(particle-painter): reconcile export and tezos adapters`
13. `feat(tezos-intel): add creator scoring service`
14. `feat(tezos-intel): add scout and market pulse modules`
15. `feat(discord-bot): port community xp features`
16. `feat(discord-bot): port challenge and trait modules`
17. `chore(ux-lab): import dev-only lab harness`
18. `chore(wtf-gameshow-bot): reconcile deploy assets`

## Completion Criteria

- All integrated source code lives under `WTF`, not in sibling junk-drawer folders.
- Each integrated domain has a source-map doc under `docs/integrations`.
- Each runtime module has a single owner folder and a wrapper entrypoint.
- No new route/page file becomes a large mixed-concern module.
- `npm run check` passes after every merged track.
- Static creation-tool bundles pass declared asset checks before browser smoke tests.
- Standalone app modules remain independently buildable.
- Feature flags or explicit health checks protect new runtime dependencies.
- The final integration branch can be audited by domain: signer, domains, Collekt, IPFS creation tools, Particle Painter, Tezos intelligence, Discord bot, UX lab, deployment.
