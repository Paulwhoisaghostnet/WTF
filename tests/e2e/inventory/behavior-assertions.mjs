export const CORE_BEHAVIOR_ASSERTIONS = [
  {
    id: "public.static-discovery-metadata",
    domain: "Public Data, Embeds, APIs, Agents, and Automation",
    platformOwner: "public-static-discovery",
    ownerSpec: "server/static.test.ts",
    verificationCommand: "npx tsx --test server/static.test.ts",
    userVisibleAssertion:
      "Crawlers, install surfaces, and metadata clients can request /robots.txt, /sitemap.xml, and /manifest.json and receive typed metadata instead of the SPA HTML shell.",
    durableSideEffectAssertion:
      "The static server regression asserts robots.txt advertises the canonical sitemap, sitemap.xml contains canonical wtfos.app URLs, manifest.json parses as install metadata, and none of the responses contain <!DOCTYPE html>.",
  },
  {
    id: "public.access-manifest-canonical-origin",
    domain: "Public Data, Embeds, APIs, Agents, and Automation",
    platformOwner: "public-access-manifest",
    ownerSpec: "server/routes/access.test.ts",
    verificationCommand: "npx tsx --test server/routes/access.test.ts",
    userVisibleAssertion:
      "Agents, installers, and browser-boundary clients can request /api/access from the canonical host and receive WTF OS discovery metadata whose origin and MCP endpoint stay on https://wtfos.app instead of the legacy WTF Gameshow domain.",
    durableSideEffectAssertion:
      "The route regression sets legacy PUBLIC_SITE_URL and MCP_PUBLIC_ENDPOINT values, asserts the access manifest helpers canonicalize both to https://wtfos.app, and keeps non-WTF preview host fallback behavior intact.",
  },
  {
    id: "auth.password-session-linked-wallet",
    domain: "Entry, Authentication, and Account Identity",
    platformOwner: "auth-session",
    ownerSpec: "tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand: "npm run test:e2e:live:puppets",
    userVisibleAssertion: "Each puppet can authenticate and see its own account session.",
    durableSideEffectAssertion:
      "The live harness confirms each seeded account remains linked to its expected signer-backed wallet.",
  },
  {
    id: "auth.stale-session-welcome-recovery",
    domain: "Entry, Authentication, and Account Identity",
    platformOwner: "auth-session",
    ownerSpec: "tests/playwright/inventory/auth-session.spec.mjs",
    verificationCommand:
      "npm run build && npx playwright test tests/playwright/inventory/auth-session.spec.mjs",
    userVisibleAssertion:
      "If the welcome dialog has a cached user but the protected API session has expired, clicking a welcome action clears the stale user and returns to the public entry surface instead of trapping the modal behind a Not authenticated error.",
    durableSideEffectAssertion:
      "The focused harness expires the session on `/api/auth/welcome/complete`, verifies the client emits `auth.session.invalidated`, and confirms the welcome modal is removed after the protected 401.",
  },
  {
    id: "profile.x-oauth-expected-account",
    domain: "Entry, Authentication, and Account Identity",
    platformOwner: "profile-social",
    ownerSpec:
      "server/auth/oauth-base.test.ts, server/features/w/x-connect-onboarding-policy.test.ts, client/src/pages/profile-social-link-policy.test.ts",
    verificationCommand:
      "npx tsx --test server/auth/oauth-base.test.ts server/features/w/x-connect-onboarding-policy.test.ts client/src/pages/profile-social-link-policy.test.ts",
    userVisibleAssertion:
      "When a user types an intended X handle before connecting, Profile sends that handle into OAuth, the provider callback URL stays on canonical wtfos.app even if legacy platform env is present, and Profile shows a wrong-account recovery message if X authorizes a different logged-in account.",
    durableSideEffectAssertion:
      "The server stores the expected X handle in the OAuth session, canonicalizes legacy wtfgameshow.app callback origins to wtfos.app, and rejects mismatched callbacks before updating twitterId/twitterHandle/token fields or running X onboarding.",
  },
  {
    id: "auth.wallet-challenge-login",
    domain: "Wallets, Tokens, Portfolio, and On-Chain State",
    ownerSurfaceIds: ["hoard"],
    ownerSpec: "tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand: "npm run test:e2e:live:puppets",
    userVisibleAssertion: "Each puppet wallet can complete the wallet-login challenge flow.",
    durableSideEffectAssertion:
      "The server verifies each platform-keyring signature against the linked wallet and returns the matching user.",
  },
  {
    id: "auth.wallet-provider-login-lifecycle",
    domain: "Wallets, Tokens, Portfolio, and On-Chain State",
    ownerSurfaceIds: ["hoard"],
    ownerSpec:
      "client/src/lib/tezos/wallet-connect-policy.test.ts, client/src/lib/tezos/wallet-shadownet-preflight-policy.test.ts",
    verificationCommand:
      "npx tsx --test client/src/lib/tezos/wallet-connect-policy.test.ts client/src/lib/tezos/wallet-shadownet-preflight-policy.test.ts",
    userVisibleAssertion:
      "The login wallet button starts from fresh Beacon/WalletConnect auth state, opens Octez Connect as the primary Tezos provider on mainnet, ignores Shadownet app-local preferences for auth identity, and either completes provider permission or shows a bounded retryable error instead of staying on Connecting forever.",
    durableSideEffectAssertion:
      "Policy coverage keeps ACTIVE_ACCOUNT_SET subscribed before permission requests, keeps Beacon/Taquito as backup, clears wallet IndexedDB/localStorage for forced auth reconnects, forces auth challenge signing through the mainnet wallet lane, and keeps Octez-hosted app RPC defaults ahead of TzKT indexer fallbacks.",
  },
  {
    id: "wallet.checkout-intent-bound-to-signed-session",
    domain: "Wallets, Tokens, Portfolio, and On-Chain State",
    ownerSurfaceIds: ["hoard", "wtfiam"],
    ownerSpec: "tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand:
      "WTF_E2E_ACTOR_FILTER=bert npx playwright test --config=playwright.live.config.mjs tests/playwright/live/puppet-orchestration.spec.mjs -g \"wallet-login checkout intent\"",
    userVisibleAssertion:
      "A user who logs in with a signer-backed wallet can prepare a WTF IAM checkout without relinking that wallet.",
    durableSideEffectAssertion:
      "The checkout intent is created for the same linked wallet address returned by the wallet-login verification flow.",
  },
  {
    id: "wallet.passive-refresh-no-signature",
    domain: "Wallets, Tokens, Portfolio, and On-Chain State",
    ownerSurfaceIds: ["hoard"],
    ownerSpec: "client/src/lib/wallet-context-policy.test.ts, client/src/pages/profile-wallet-link-policy.test.ts",
    verificationCommand:
      "npx tsx --test client/src/lib/wallet-context-policy.test.ts client/src/pages/profile-wallet-link-policy.test.ts",
    userVisibleAssertion:
      "Refreshing WTF OS with a cached local wallet does not ask the user for an ownership signature when that wallet is not linked to the current account, while Profile wallet linking uses an explicit connected-wallet proof instead of typed address-only linking.",
    durableSideEffectAssertion:
      "Only explicit connect/link or participation flows can enable signature-backed wallet linking; passive rehydration remains read/sync-only and Profile cannot submit a new wallet without the shared challenge/signature path.",
  },
  {
    id: "settings.subdomain-setup-applet",
    domain: "Wallets, Tokens, Portfolio, and On-Chain State",
    ownerSurfaceIds: ["system-settings", "wtf-domains"],
    ownerSpec: "tests/playwright/inventory/settings-subdomain-setup.spec.mjs",
    verificationCommand:
      "npm run build && npx playwright test tests/playwright/inventory/settings-subdomain-setup.spec.mjs",
    userVisibleAssertion:
      "Settings opens a focused Subdomain Setup window where a signed-in wtfOS user can claim their username.wtfos.me host, see Macaroni readiness, and build wtf.tez commit/register setup plans with their connected wallet address.",
    durableSideEffectAssertion:
      "The inventory harness mutates the mocked /api/wtf-sites/claim state to a claimed site, verifies the windowed applet reflects the claimed host, and exercises the WTF Domains registrar commit and register plan endpoints with the same target wallet.",
  },
  {
    id: "account.cobwebsaints-domain-advanced-readiness",
    domain: "Wallets, Tokens, Portfolio, and On-Chain State",
    ownerSurfaceIds: ["system-settings", "wtf-domains", "ipfs-pinning", "creation-tools"],
    ownerSpec: "tests/playwright/inventory/cobwebsaints-account.spec.mjs",
    verificationCommand:
      "npm run build && npx playwright test tests/playwright/inventory/cobwebsaints-account.spec.mjs",
    userVisibleAssertion:
      "The cobwebsaints account persona has a bespoke non-admin full-user role, can claim cobwebsaints.wtfos.me, build cobwebsaints.wtf.tez commit/register plans with the connected wallet, see the same host and alias in IPFS Pinning, queue a wallet backup policy, and see Macaroni's wtfOS pin/publish affordance.",
    durableSideEffectAssertion:
      "The focused harness derives WTF Domains and IPFS Pinning identity from the signed-in username, mutates the mocked wtfOS site claim state for cobwebsaints, verifies the pinning policy queue success against the same host, and asserts Macaroni's iframe enables hosted pin/publish access for the cobwebsaints_full_user role.",
  },
  {
    id: "broot.media-open-import",
    domain: "Media, Creation, Gallery, and Preservation",
    ownerSurfaceIds: ["creation-tools"],
    ownerSpec: "tests/playwright/inventory/broot.spec.mjs",
    verificationCommand: "npx playwright test tests/playwright/inventory/broot.spec.mjs",
    userVisibleAssertion:
      "Broot opens from `/tools/broot`, exposes top-level Open for Broot project files plus common image/GIF/video media, and imports selected media as visible canvas layers with status feedback.",
    durableSideEffectAssertion:
      "The focused Broot inventory spec stubs the browser file picker, verifies the advertised MIME/extension accept map includes PNG, JPEG, GIF, and MP4, imports PNG/GIF fixtures as Fabric layers, and imports an MP4 selection as a video layer placeholder when the browser cannot decode a preview.",
  },
  {
    id: "broot.project-file-vanity-extension",
    domain: "Media, Creation, Gallery, and Preservation",
    ownerSurfaceIds: ["creation-tools"],
    ownerSpec: "tests/playwright/inventory/broot.spec.mjs",
    verificationCommand: "npx playwright test tests/playwright/inventory/broot.spec.mjs",
    userVisibleAssertion:
      "Broot saves project documents with the vanity `.broot` extension while keeping the file body JSON-backed and reloadable through the top-level Open action.",
    durableSideEffectAssertion:
      "The focused Broot inventory spec stubs the browser save/open file pickers, verifies Save suggests `project-name.broot` with a JSON MIME payload, parses the saved text as Broot project JSON, and reopens the same bytes from a `.broot` file with no MIME type.",
  },
  {
    id: "broot.ffmpeg-glfx-layer-ops",
    domain: "Media, Creation, Gallery, and Preservation",
    ownerSurfaceIds: ["creation-tools"],
    ownerSpec: "tests/playwright/inventory/broot.spec.mjs",
    verificationCommand: "npx playwright test tests/playwright/inventory/broot.spec.mjs",
    userVisibleAssertion:
      "Broot loads local FFmpeg.wasm and glfx engines without browser Babel runtime compilation, keeps tools/layers visible in the default app window, exposes neutral-by-default MP4 export modes plus glfx distortion controls, and adds undo-backed grouping, merging, flattening, and canvas-warp controls.",
    durableSideEffectAssertion:
      "The focused Broot inventory spec verifies the local FFmpeg/glfx globals are present, confirms Broot serves compiled app.js rather than text/babel, applies a glfx warp to an active layer, disables invalid merge until multiple layers are selected, confirms flatten through a dialog, and proves Undo restores the editable layer stack.",
  },
  {
    id: "broot.wallet-hen-mint",
    domain: "Wallets, Tokens, Portfolio, and On-Chain State",
    ownerSurfaceIds: ["creation-tools"],
    ownerSpec: "tests/playwright/inventory/broot.spec.mjs",
    verificationCommand: "npx playwright test tests/playwright/inventory/broot.spec.mjs",
    userVisibleAssertion:
      "Broot restores a previously connected Tezos wallet after refresh, replaces the active Connect Wallet action with connected state, and exposes a Mainnet HEN mint prepare/review/sign flow for the current canvas.",
    durableSideEffectAssertion:
      "The focused Broot inventory spec stubs the Tezos wallet runtime, proves refresh restore does not request wallet permissions again, verifies artifact/metadata CIDs plus gas/storage/fee appear in the HEN review before any wallet send, then signs once and verifies the operation targets the HEN FA2 contract mint entrypoint with padded gas/storage options.",
  },
  {
    id: "macaroni.shadownet-rpc-wallet-setup",
    domain: "Media, Creation, Gallery, and Preservation",
    ownerSurfaceIds: ["creation-tools", "wtf-domains"],
    ownerSpec: "tests/playwright/live/macaroni-shadownet.spec.mjs",
    verificationCommand: "npm run test:e2e:macaroni:shadownet",
    userVisibleAssertion:
      "A trusted-creator puppet can open Macaroni, enter the Studio through the embedded creation-tool iframe, see Shadownet as the default rehearsal network, choose Macaroni V1 or V2 contract templates, see the wtfOS IPFS provider, see Fileship as the default IPFS gateway, see the 1 GB per-artifact hard max, 250 MB average artifact limit, and 1 MB square JPG/PNG collection logo/cover limit, define per-token edition quantity, configure optional minter royalty pool/split/updater policy, attach multiple unrevealed placeholder images for delayed reveal, connect a Shadownet puppet wallet without RPC errors, use Octez Connect as the primary wallet provider with Beacon retained as backup, route selected Kukai pairing to the Shadownet Kukai app, send named wallet permission networks without embedding the dApp RPC URL, serve stored legacy wtfOS-hosted Macaroni drop pages with Octez-primary bridge injection plus the same named-network wallet hardening, and block wtfOS publish until the drop has a deployed or resumed KT1 contract; a regular signed-in puppet loading the static Studio does not see the wtfOS IPFS provider; generated mint pages expose clean disconnect, prevent duplicate request-permission flows from rapid connect clicks, reuse/reconfigure the same Octez/Beacon client with active-account subscription before permission APIs, include basic accessibility landmarks/status/progress/quantity semantics, normalize live max_per_wallet storage before showing share/status copy, keep X share compose text within the standard post limit while preserving mint/media URLs where possible, expose prefilled ICS and Google Calendar links for sale stages, clamp requested mint quantity to live collection remaining supply plus the connected wallet's remaining per-wallet/allowlist allowance, show wallet balance/cost status, max-per-wallet status, minter royalty sync status, owned-mint recovery hooks, RPC pack/estimate fallback handling, and bounded theme styling instead of arbitrary stored CSS.",
    durableSideEffectAssertion:
      "The focused runner seeds dummy users and Shadownet puppet wallet metadata, verifies the live Shadownet RPC chain id `NetXsqzbfFenSTS` in the Macaroni iframe, proves the contract-version selector exposes V1 and V2 template choices, proves the IPFS provider selector follows `trusted_market_creator` access, proves a mismatched RPC is blocked before wallet signing, confirms explicit connect uses the Octez-primary bridge while preserving Beacon backup behavior, checks from `/tools/macaroni` that the real Kukai option can escape the sandbox and load `https://shadownet.kukai.app` instead of a blank, mainnet, or Temple-only tab, asserts rapid generated-page connect clicks coalesce to one permission request, asserts the permission network object is `{ type: \"shadownet\" }` rather than Shadownet plus a dApp RPC override, asserts the server injects the Octez bridge and hardens Airporters-shaped stored legacy drop HTML before serving it, and keeps source-policy coverage for the 1 GB per-file and 250 MB average Macaroni artifact policy, contract-required wtfOS publishing, per-token edition quantities, delayed-reveal placeholder pools, request-time minter royalty metadata sync, non-image cover preview metadata, the generated mint page's validated wallet restore, disconnect, Octez/Beacon singleton reuse, ACTIVE_ACCOUNT_SET subscription, browser RPC fallback, share/calendar canonical handles, X URL-weight trimming, calendar file generation, accessible controls/status regions, balance preflight, max-per-wallet option normalization and allowlist remaining allowance clamping, TzKT-owned-mint lookup, Fileship gateway default, and CSS theme allowlist paths.",
  },
  {
    id: "macaroni.wtfos-package-source",
    domain: "Media, Creation, Gallery, and Preservation",
    ownerSurfaceIds: ["ch-ease", "creation-tools", "ipfs-pinning"],
    ownerSpec: "server/features/macaroni/packages.test.ts, client/src/pages/MacaroniPackager.tsx",
    verificationCommand:
      "npx tsx --test server/features/macaroni/packages.test.ts server/routes/macaroni-policy.test.ts",
    userVisibleAssertion:
      "A trusted creator can open CH-EASE, the Creator Handoff: Edit, Arrange, Stage, Export companion app, upload or drop arbitrarily named media, see token previews and readiness path/flags, edit token metadata with pre-save attributes JSON validation, choose a platform export target, save drop-page layout/module config, finalize the collection, download a selected platform CSV, load the finalized wtfOS package source from Macaroni Studio, and use handoff controls for Studio collaboration, WTF Domains setup, and IPFS storage/status.",
    durableSideEffectAssertion:
      "The package stores numbered media filenames, original filenames/titles, metadata JSON, drop-page config, CSV, and manifest records while routing media, metadata, CSV, and manifests through the shared wtfOS IPFS/object-storage pinning path; package create, media upload, metadata update, drop config update, finalization, CSV/export download, source load, and handoff-open actions emit canonical audit events, and the package source exposes Macaroni-ready token rows with media and metadata CIDs plus saved drop config.",
  },
  {
    id: "pasta-protocol.sandbox-safe-feedback",
    domain: "Pasta Protocol",
    ownerSurfaceIds: ["pasta-protocol"],
    ownerSpec: "client/src/features/pasta-protocol/pasta-static-policy.test.ts",
    verificationCommand: "npx tsx --test client/src/features/pasta-protocol/pasta-static-policy.test.ts",
    userVisibleAssertion:
      "Pasta publishers show inline status/error notices inside the embedded studio instead of browser-native modal dialogs, and the wtfOS pinner option is hidden unless the embedded signed-in account has trusted_market_creator capability.",
    durableSideEffectAssertion:
      "The source-policy test scans every Pasta static common/studio script for modal-free feedback helpers, capability-gated pinner selection, and system-event logging hooks.",
  },
  {
    id: "pasta-protocol.chease-handoff",
    domain: "Pasta Protocol",
    ownerSurfaceIds: ["pasta-protocol"],
    ownerSpec:
      "client/src/pages/MacaroniPackager.tsx, public/creation-tools/*/js/studio.js, client/src/features/pasta-protocol/pasta-static-policy.test.ts",
    verificationCommand: "npx tsx --test client/src/features/pasta-protocol/pasta-static-policy.test.ts",
    userVisibleAssertion:
      "CH-EASE can open a target Pasta publisher with the current package preloaded through a same-origin sessionStorage handoff, and the publisher confirms import with inline status.",
    durableSideEffectAssertion:
      "The CH-EASE handoff emits chease.package_handoff_opened and the six Pasta studios consume the shared handoff key without mutating server storage before the creator chooses to deploy or export.",
  },
  {
    id: "pasta-protocol.colander-context-handoff",
    domain: "Pasta Protocol",
    ownerSurfaceIds: ["pasta-protocol"],
    ownerSpec:
      "client/src/features/pasta-protocol/colander/ColanderApp.tsx, public/creation-tools/*/js/studio.js, client/src/features/pasta-protocol/pasta-static-policy.test.ts",
    verificationCommand: "npx tsx --test client/src/features/pasta-protocol/pasta-static-policy.test.ts",
    userVisibleAssertion:
      "Colander external actions open the matching Pasta tool with contract, network, action, and kind context in the URL so the target studio can prefill the relevant contract field.",
    durableSideEffectAssertion:
      "The Colander handoff emits colander.handoff_opened and the target static studios read the route handoff before any wallet or chain action is submitted.",
  },
  {
    id: "inventory.temporary-grants-unlock-apps",
    domain: "Market, Exchange, Inventory, and Commerce",
    ownerSurfaceIds: ["arcade", "casino", "wtfiam"],
    ownerSpec: "tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand: "npm run test:e2e:live:puppets",
    userVisibleAssertion: "Seeded users can enter gated Casino, Arcade, and Desktop inventory surfaces.",
    durableSideEffectAssertion:
      "The harness reads the live market/inventory APIs and asserts the required app-pass, play-card, and desktop item balances.",
  },
  {
    id: "marketplace.offer-accept-explicit-terms",
    domain: "Market, Exchange, Inventory, and Commerce",
    ownerSurfaceIds: ["marketplace"],
    ownerSpec:
      "client/src/lib/tezos/marketplace.ts, client/src/features/marketplace/OfferAcceptanceDialog.tsx, server/routes/marketplace.ts, tests/playwright/live/marketplace-shadownet.spec.mjs",
    verificationCommand:
      "npm run check && npm run test:e2e:inventory:coverage && npm run contract:e2e:marketplace-v2:shadownet:existing && npm run test:e2e:marketplace:shadownet",
    userVisibleAssertion:
      "Accepting a marketplace or trade-board offer shows quantity, unit WTF, total WTF, token contract/id, owner, offerer, and contract version before wallet signing.",
    durableSideEffectAssertion:
      "The wallet helper re-reads canonical /api/marketplace/onchain before signing, blocks legacy accepts unless tokenAmount is exactly 1, sends V2 accepts with offer_id plus expected token, owner, quantity, and unit price, the in-app market V2 checkout signs only after receiving expected WTF token, treasury, amount, purchase reference, and cart hash, and the local Shadownet runner binds the marketplace, WTF FA2, and in-app market contracts as one explicit test bundle.",
  },
  {
    id: "casino.access-game-apis",
    domain: "WTF Casino, Membership, and Wagered Games",
    ownerSurfaceIds: ["casino"],
    ownerSpec: "tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand: "npm run test:e2e:live:puppets",
    userVisibleAssertion: "A contestant with access can open the Casino game API surfaces.",
    durableSideEffectAssertion:
      "The harness exercises entry, quote, join, and bet-intent endpoints while preserving fail-closed response contracts.",
  },
  {
    id: "arcade-console.sessions-and-scores",
    domain: "WTF Arcade, WTF Console, and Game Studio SDK",
    ownerSurfaceIds: ["arcade", "console", "game-studio"],
    ownerSpec: "tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand: "npm run test:e2e:live:puppets",
    userVisibleAssertion: "Every Console and Arcade catalog game can start a playable session.",
    durableSideEffectAssertion:
      "The harness posts score submissions using run tickets for every catalog slug that exposes a score path.",
  },
  {
    id: "desktop.settings-events-pet",
    domain: "Desktop OS, Navigation, and Personal Environment",
    ownerSurfaceIds: ["desktop-appearance", "desktop-pet"],
    ownerSpec:
      "client/src/features/desktop/pet/waterCarePolicy.test.ts, tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand:
      "npx tsx --test client/src/features/desktop/pet/waterCarePolicy.test.ts && npm run test:e2e:live:puppets",
    userVisibleAssertion: "A contestant can update desktop appearance grammar, colors, layout, WX weather, and use desktop pet actions.",
    durableSideEffectAssertion:
      "The harness writes desktop settings, reloads them through a fresh read, records a desktop event with an event id, confirms the pet action appears in live pet event history, and focused policy coverage keeps water care hydrating thirsty pets before bath/clean care.",
  },
  {
    id: "desktop.font-pack.updated",
    domain: "Desktop OS, Navigation, and Personal Environment",
    ownerSurfaceIds: ["desktop-appearance"],
    ownerSpec:
      "client/src/features/appearance/font-packs.test.ts, client/src/features/appearance/get-canvas-font.test.ts, shared/desktop.test.ts, tests/playwright/inventory/desktop-settings-typography.spec.mjs",
    verificationCommand:
      "npx tsx --test client/src/features/appearance/font-packs.test.ts client/src/features/appearance/get-canvas-font.test.ts shared/desktop.test.ts && npx playwright test tests/playwright/inventory/desktop-settings-typography.spec.mjs",
    userVisibleAssertion:
      "Theme Builder defaults to the wtfOS Soft System font pack, can still select system font packs and chat typography presets, and WIM/WTF LIVE composer defaults stay inside their visible font, color, and size windows.",
    durableSideEffectAssertion:
      "DesktopAppearance.fontPackKey normalizes to wtfos-soft-system by default, chatTypographyPresetKey, wimChatStyle, and wtfLiveChatStyle normalize to known values, persist through /api/desktop/settings, and canvas helpers read the same CSS variable roles.",
  },
  {
    id: "desktop.app-gates-runtime-policy",
    domain: "Desktop OS, Navigation, and Personal Environment",
    ownerSurfaceIds: ["admin-panel", "command-palette", "desktop-icons"],
    ownerSpec:
      "client/src/features/command-palette/command-palette-model.test.ts, client/src/components/layout/start-menu-app-gates.test.ts, client/src/features/admin-os/admin-surface-registry.test.ts, server/features/app-registry/backfill-policy.test.ts, shared/role-system.test.ts",
    verificationCommand:
      "npx tsx --test client/src/features/command-palette/command-palette-model.test.ts client/src/components/layout/start-menu-app-gates.test.ts client/src/features/admin-os/admin-surface-registry.test.ts server/features/app-registry/backfill-policy.test.ts shared/role-system.test.ts",
    userVisibleAssertion:
      "Apps disabled by admin are hidden from Start Menu and Command Palette launch surfaces, independently registered owner surfaces such as WTF Domains can be enabled from the app registry, creation apps are grouped under Stuffs > CREATE!, and time-out accounts receive no app launch entries.",
    durableSideEffectAssertion:
      "Shared page-access policy denies disabled app routes from the same app gate map used by launcher models, and app-registry backfill seeds every canonical app key including WTF Domains while leaving ungated OS/admin routes reachable.",
  },
  {
    id: "map-lab.workspace-navigation-and-node-drag",
    domain: "Desktop OS, Navigation, and Personal Environment",
    ownerSurfaceIds: ["map-lab"],
    ownerSpec: "tests/playwright/inventory/map-lab-workspace.spec.mjs",
    verificationCommand:
      "npm run build && npx playwright test tests/playwright/inventory/map-lab-workspace.spec.mjs",
    userVisibleAssertion:
      "Map Lab opens as a resizable WTF OS app workspace whose center canvas expands when the window is maximized, exposes internal scroll/pan plus zoom/fit/reset/overview controls, lets a signed-in user drag unlocked nodes without moving locked nodes, supports workflow-designer interactions through typed node templates, compatible port feedback, Escape route-cancel, keyboard route deletion, route inspection, snap-to-grid movement, and graph-run feedback, and exposes a read-only wtfOS demo map that any user can inspect/run without editing canonical nodes or routes.",
    durableSideEffectAssertion:
      "The inventory harness verifies the dragged node's persisted document-space position changes in the rendered map, the locked seed node remains fixed, the zoom readout changes through the viewport controls, a template node exposes compatible input feedback, pending route creation can be canceled, a selected route can be keyboard-deleted and recreated through output/input ports, snap-to-grid movement lands on the grid, the read-only wtfOS demo disables structural controls and blocks route creation/drag edits while still allowing run preview, and the graph run summary updates while Map Lab movement, route creation, demo open, pipeline run, and viewport handles stay registered in the inventory spine.",
  },
  {
    id: "auth.time-out-app-lockdown",
    domain: "Entry, Authentication, and Account Identity",
    ownerSurfaceIds: ["admin-panel", "command-palette", "desktop-icons"],
    ownerSpec:
      "shared/role-system.test.ts, client/src/features/command-palette/command-palette-model.test.ts, client/src/components/layout/start-menu-app-gates.test.ts",
    verificationCommand:
      "npx tsx --test shared/role-system.test.ts client/src/features/command-palette/command-palette-model.test.ts client/src/components/layout/start-menu-app-gates.test.ts",
    userVisibleAssertion:
      "A time-out account can authenticate but sees no Start Menu or Command Palette app launch entries.",
    durableSideEffectAssertion:
      "The shared role/app-launch policy denies registered app routes for `time_out` while allowing explicit experimental grants to opt back into registered surfaces.",
  },
  {
    id: "auth.additive-role-surface-access",
    domain: "Entry, Authentication, and Account Identity",
    ownerSurfaceIds: ["admin-panel"],
    ownerSpec: "shared/role-system.test.ts",
    verificationCommand: "npx tsx --test shared/role-system.test.ts",
    userVisibleAssertion:
      "Users can have additive role memberships and registered experimental surface grants without collapsing back to a single primary role.",
    durableSideEffectAssertion:
      "The shared access policy evaluates role membership plus registered WTF OS surface grants as the canonical app access source.",
  },
  {
    id: "tv.public-channel-stream-embed",
    domain: "WTF TV, Playback, Channels, and Embeds",
    ownerSurfaceIds: ["tv"],
    ownerSpec: "tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand:
      "WTF_E2E_ACTOR_FILTER=bert npx playwright test --config=playwright.live.config.mjs tests/playwright/live/puppet-orchestration.spec.mjs -g \"WTF TV public channel\"",
    userVisibleAssertion:
      "A contestant can discover a public WTF TV channel and resolve its current broadcast state.",
    durableSideEffectAssertion:
      "The live harness proves the same public active channel resolves through channel list, owned-channel scope, now/stream state, dial lookup, embed metadata, and oEmbed metadata without requiring private media access.",
  },
  {
    id: "gameshow.automation-completion-reward-proof",
    domain: "Gameshow Participation, Progression, and Rewards",
    ownerSurfaceIds: ["challenges", "side-quests"],
    ownerSpec: "tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand:
      "WTF_E2E_ACTOR_FILTER=bert,thecount npx playwright test --config=playwright.live.config.mjs tests/playwright/live/puppet-orchestration.spec.mjs -g \"gameshow automation challenge\"",
    userVisibleAssertion:
      "A contestant action can satisfy a Gameshow automation challenge and produce a completed reward state.",
    durableSideEffectAssertion:
      "The live harness creates a scoped automation challenge, triggers it through the real event spine, verifies completion and EXP reward action logs, confirms the XP event carries challenge metadata, and archives the challenge afterward.",
  },
  {
    id: "gameshow.challenge-submit-grade-claim-leaderboard",
    domain: "Gameshow Participation, Progression, and Rewards",
    ownerSurfaceIds: ["challenges"],
    ownerSpec: "tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand:
      "WTF_E2E_ACTOR_FILTER=bert,thecount npx playwright test --config=playwright.live.config.mjs tests/playwright/live/puppet-orchestration.spec.mjs -g \"gameshow challenge submission\"",
    userVisibleAssertion:
      "A contestant can see an active challenge, submit proof, receive a host grade, claim the resulting reward flag, and appear on the XP leaderboard.",
    durableSideEffectAssertion:
      "The live harness creates a temporary active challenge, records a contestant submission, grades it as pass, verifies claimable and claimed reward-flag persistence, verifies submission and grade XP event metadata, confirms public XP leaderboard visibility, and closes the challenge afterward.",
  },
  {
    id: "gameshow.launch-surfaces-active-challenge-ui",
    domain: "Gameshow Participation, Progression, and Rewards",
    ownerSurfaceIds: ["challenges", "mission-control", "side-quests"],
    ownerSpec: "tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand:
      "WTF_E2E_ACTOR_FILTER=bert,thecount npx playwright test --config=playwright.live.config.mjs tests/playwright/live/puppet-orchestration.spec.mjs -g \"gameshow launch surfaces\"",
    userVisibleAssertion:
      "Mission Control, Challenges, and Side Quests render actionable gameshow state for a contestant session.",
    durableSideEffectAssertion:
      "The live browser harness seeds canonical side quests, creates a temporary active challenge, proves Mission Control displays both challenge and side-quest work through authenticated UI, verifies Challenges navigation, and closes the challenge afterward.",
  },
  {
    id: "gameshow.side-quests-messageboard-check-in",
    domain: "Gameshow Participation, Progression, and Rewards",
    ownerSurfaceIds: ["messageboard", "side-quests"],
    ownerSpec: "tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand:
      "WTF_E2E_ACTOR_FILTER=bert,thecount npx playwright test --config=playwright.live.config.mjs tests/playwright/live/puppet-orchestration.spec.mjs -g \"canonical side quests\"",
    userVisibleAssertion:
      "Contestants can see at least ten daily social/creative side quests with XP and WTF rewards, including the messageboard check-in.",
    durableSideEffectAssertion:
      "The live harness seeds canonical side quests, creates a temporary board channel, posts as a contestant, verifies the daily check-in is ready to claim for the current UTC day, claims it, verifies XP action completion, verifies a queued WTF reward ledger row, and removes the temporary channel.",
  },
  {
    id: "dedrooms.mud-core-flow",
    domain: "Gameshow Participation, Progression, and Rewards",
    ownerSurfaceIds: ["dedrooms"],
    ownerSpec: "server/features/green-room/engine.test.ts, tests/playwright/inventory/dedrooms.spec.mjs",
    verificationCommand:
      "npx tsx --test server/features/green-room/engine.test.ts && npm run build && npx playwright test tests/playwright/inventory/dedrooms.spec.mjs",
    userVisibleAssertion:
      "A signed-in user can open the DedRooms AppWindow at /dedrooms, read the terminal transcript and status rail, see anchored map summary, coordinate, known authoritative passages, inspectable room objects, resources, character sheet summary, and room presence, submit commands including look, inspect, sheet, roll, map, doors, listen/overhear, go <listed passage>, combine three matching items, inspect Lily's shoe clues, encounter expanded ant/aubergine/uranium/sheep/cult/cat/Yellow Knight/splendor plus Tezos bread-art display-case mirror lore with baker-bankers, crumb custody rewards, bread pinning, case polishing, and crumb-split minigames, verify THNG/Governance/Herb/Trilla-tek/Tyranny Force anchors in map state while player spawns avoid anchors and the Green Room is absent until triggered, and receive the exact departed message after intro campaign qualification.",
    durableSideEffectAssertion:
      "The service persists player stasis location, anchored authored-map state, unique room placement/linking, inventory stacks/weights, command transcript events, Lily inspection flags, relationship/alliance state, shared milestone progress, delayed Green Room placement, role grants, Season 3 contestant rows, and myth-mode no-grant behavior while WebSocket events remain presence/fan-out only.",
  },
  {
    id: "club-dues.compile-membership-preflight",
    domain: "Club Dues, Memberships, and Subscription Access",
    ownerSurfaceIds: ["club-dues"],
    ownerSpec: "tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand:
      "WTF_E2E_ACTOR_FILTER=bert,thecount npx playwright test --config=playwright.live.config.mjs tests/playwright/live/puppet-orchestration.spec.mjs -g \"club dues\"",
    userVisibleAssertion:
      "A member can see Club Dues state, compile a dues template, and prepare dues payment only with a wallet linked to the current account.",
    durableSideEffectAssertion:
      "The live harness verifies public contract visibility, user membership state, admin summaries, arrears dry-sweep behavior, SmartPy/Kiln template compilation, unlinked-wallet rejection, and linked-wallet payment intent creation against the live Club Dues contract.",
  },
  {
    id: "media.creation-gallery-preservation-proof",
    domain: "Media, Creation, Gallery, and Preservation",
    ownerSurfaceIds: ["game-studio", "media-library", "studio"],
    ownerSpec: "tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand:
      "WTF_E2E_ACTOR_FILTER=bert npx playwright test --config=playwright.live.config.mjs tests/playwright/live/puppet-orchestration.spec.mjs -g \"media upload\"",
    userVisibleAssertion:
      "A creator can upload media, retrieve it from the library/file endpoint, inspect media-service dwellings, and build a Game Studio project bundle.",
    durableSideEffectAssertion:
      "The live harness verifies upload cache/checksum/playback state, library and detail reads, file serving, project-bundle and IPFS/media-service contracts, Game Studio project creation, bundle build checksum, and build-history persistence.",
  },
  {
    id: "public-data-mcp-agent-token-proof",
    domain: "Public Data, Embeds, APIs, Agents, and Automation",
    ownerSurfaceIds: ["admin-panel", "content-pages"],
    ownerSpec: "tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand:
      "WTF_E2E_ACTOR_FILTER=bert npx playwright test --config=playwright.live.config.mjs tests/playwright/live/puppet-orchestration.spec.mjs -g \"public data APIs\"",
    userVisibleAssertion:
      "Public data APIs and the WTFOS registered inventory remain readable while MCP automation requires an explicit paired token rather than a browser session.",
    durableSideEffectAssertion:
      "The live harness reads public links, FAQ, access, leaderboard, gallery state, and the WTFOS inventory tool, rejects unauthenticated MCP calls, creates a scoped MCP token, proves tools/list works without setting cookies, and revokes the token.",
  },
  {
    id: "skywire.standalone-at-login",
    domain: "Community, Social, Messaging, and Discord",
    ownerSurfaceIds: ["skywire"],
    ownerSpec: "server/features/atproto/skywire-policy.test.ts, tests/playwright/inventory/skywire-feed.spec.mjs",
    verificationCommand:
      "npm run build && npx tsx --test server/features/atproto/skywire-policy.test.ts && npx playwright test tests/playwright/inventory/skywire-feed.spec.mjs -g \"standalone AT login\"",
    userVisibleAssertion:
      "Anonymous users can open Skywire directly as a public OVOID-style AT Protocol login screen with Handle-or-DID input, a Continue action, and signal examples before any WTF OS login page appears.",
    durableSideEffectAssertion:
      "Standalone OAuth start carries `standalone=1`, preserves the Skywire return path, accepts handles or DIDs, recovers durable callback state, creates or resumes the session-bound Skywire user only after the returned DID is known, and shares the production session cookie across wtfos.app and skywire.wtfos.app.",
  },
  {
    id: "skywire.market-feed-search-source",
    domain: "Community, Social, Messaging, and Discord",
    ownerSurfaceIds: ["skywire"],
    ownerSpec: "server/features/atproto/skywire-policy.test.ts, tests/playwright/inventory/skywire-feed.spec.mjs",
    verificationCommand:
      "npm run build && npx tsx --test server/features/atproto/skywire-policy.test.ts && npx playwright test tests/playwright/inventory/skywire-feed.spec.mjs -g \"market feed\"",
    userVisibleAssertion:
      "Skywire Market Feed renders Bluesky posts containing Objkt/Teia token hrefs with token previews and buy overlays instead of showing a false quiet lane.",
    durableSideEffectAssertion:
      "The server uses a search-capable Bluesky AppView for app.bsky.feed.searchPosts, domain-filters Objkt and Teia searches, filters normalized text/embed/facet hrefs through Skywire's token parser, and returns 502 when every upstream marketplace search fails.",
  },
  {
    id: "skywire.live-status-visible-indicator",
    domain: "Community, Social, Messaging, and Discord",
    ownerSurfaceIds: ["skywire"],
    ownerSpec: "tests/playwright/inventory/skywire-feed.spec.mjs",
    verificationCommand:
      "npm run build && npx playwright test tests/playwright/inventory/skywire-feed.spec.mjs -g \"live status\"",
    userVisibleAssertion:
      "After a user goes live from Skywire, the main Skywire shell shows a WTF LIVE header badge and live banner outside the Signals form, with controls to open WTF LIVE or return to the live-status controls.",
    durableSideEffectAssertion:
      "The same flow writes `app.bsky.actor.status/self`, stores the live URL in the Skywire live-status read model, and removes the local badge/banner after the user clears the status.",
  },
  {
    id: "skywire.signal-starter-presets",
    domain: "Community, Social, Messaging, and Discord",
    ownerSurfaceIds: ["skywire"],
    ownerSpec: "tests/playwright/inventory/skywire-feed.spec.mjs",
    verificationCommand:
      "npm run build && npx playwright test tests/playwright/inventory/skywire-feed.spec.mjs -g \"signal starter\"",
    userVisibleAssertion:
      "The Skywire Signals tab offers standard starter presets for recent sales, live broadcasts, open drops, collector calls, and proofs; selecting the recent-sale starter fills the signal type, text, and tags with creator-friendly defaults.",
    durableSideEffectAssertion:
      "Publishing the recent-sale starter writes an `app.wtfgameshow.skywire.signal` repo record with `signalType=market.sale`, sale/collector/tezos tags, and an optional related token URL.",
  },
  {
    id: "skywire.oauth-original-window-permission-sync",
    domain: "Community, Social, Messaging, and Discord",
    ownerSurfaceIds: ["skywire"],
    ownerSpec: "server/features/atproto/skywire-policy.test.ts, tests/playwright/inventory/skywire-feed.spec.mjs",
    verificationCommand:
      "npm run build && npx playwright test tests/playwright/inventory/skywire-feed.spec.mjs -g \"OAuth|Chat add-on\"",
    userVisibleAssertion:
      "When a user enables the Skywire Chat Add-on through OAuth, Skywire uses the current browser window, reports unresolved Bluesky handles instead of looking stalled, returns to the account/settings tab on canonical wtfos.app, and reflects the granted durable chat permission there instead of creating a second upgraded Skywire window.",
    durableSideEffectAssertion:
      "OAuth start preflights unresolved handles before provider handoff; the SDK nonce state and Skywire app-owned pending state are persisted durably and the callback translates the SDK `state` query param back to the app state before relying on browser session metadata; the callback recovers the app-owned OAuth state including the start origin and explicit platform-actor intent, requires explicit confirmation before connecting reserved shared platform actor handles, refuses callbacks whose returned handle differs from the requested handle, refuses chat upgrades when the returned handle/DID does not match the user's already-linked account, writes requested tier/scope, granted scope, chat add-on state, encrypted token material, encrypted DPoP key, and user+DID account identity to the canonical account row from the SDK saved session object rather than the live callback wrapper, appends callback params to `/skywire?tab=account` on canonical wtfos.app, broadcasts completion to any already-open original Skywire window, `/api/atproto/me` returns the durable account row with `session.reconnectRequired=false` without masking it to null, popup/local metadata cannot mark chat enabled unless canonical `/api/atproto/me` also has durable chat permission, and stale OAuth completion/storage events cannot keep forcing the user back to Settings after durable completion.",
  },
  {
    id: "skywire.oauth-canonical-domain-alias",
    domain: "Community, Social, Messaging, and Discord",
    ownerSurfaceIds: ["skywire"],
    ownerSpec: "server/lib/canonical-domain.test.ts, scripts/caddy-domain-policy.test.mjs, server/features/atproto/skywire-policy.test.ts",
    verificationCommand:
      "npx tsx --test server/lib/canonical-domain.test.ts server/features/atproto/skywire-policy.test.ts && node scripts/caddy-domain-policy.test.mjs",
    userVisibleAssertion:
      "Legacy WTF Gameshow platform hosts redirect to canonical wtfos.app with path and query preserved before Skywire or OAuth can load a separate app session.",
    durableSideEffectAssertion:
      "ATProto OAuth client metadata, client id URLs, callback URIs, and Skywire hard public URLs canonicalize legacy wtfgameshow.app env values to https://wtfos.app so the OAuth grant persists against the primary logged-in user session.",
  },
  {
    id: "wtf-live.owner-room-lifecycle-controls",
    domain: "Community, Social, Messaging, and Discord",
    ownerSurfaceIds: ["wtf-live"],
    ownerSpec: "tests/playwright/inventory/wtf-live-owner-controls.spec.mjs",
    verificationCommand:
      "npm run build && npx playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs",
    userVisibleAssertion:
      "A WTF LIVE room owner sees Close and Delete controls on the owned room card even when that room is listed in the public room directory.",
    durableSideEffectAssertion:
      "The inventory harness accepts the delete confirmation, clears the owned-room fixture through the WTF LIVE room DELETE API, and the UI removes every matching room card.",
  },
  {
    id: "wtf-live.lobby-room-presence",
    domain: "Community, Social, Messaging, and Discord",
    ownerSurfaceIds: ["wtf-live"],
    ownerSpec: "tests/playwright/inventory/wtf-live-owner-controls.spec.mjs",
    verificationCommand:
      "npm run build && npx playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs",
    userVisibleAssertion:
      "The WTF LIVE lobby shows whether public rooms are quiet or active and displays the current live user count on each room card plus the public-room summary.",
    durableSideEffectAssertion:
      "The harness joins /live/r/wtf-live from a guest tab, verifies /live updates from 0 active rooms and 0 users to 1 active room and 1 user through the room WebSocket presence snapshot, then verifies the lobby returns to 0 active rooms after the guest tab closes.",
  },
  {
    id: "wtf-live.public-room-window-exit-controls",
    domain: "Community, Social, Messaging, and Discord",
    ownerSurfaceIds: ["wtf-live"],
    ownerSpec: "tests/playwright/inventory/wtf-live-owner-controls.spec.mjs",
    verificationCommand:
      "npm run build && npx playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs",
    userVisibleAssertion:
      "A signed-in WTF LIVE user joins a public room from the dashboard in a new browser tab/window while the wtfOS app remains on /live, and the public room exposes visible Leave Room and Close Window controls.",
    durableSideEffectAssertion:
      "The inventory harness verifies Join opens /live/r/:roomId as a popup, Leave Room resets socket/media/chat-enabled state, and Close Window requests browser tab closure after cleanup.",
  },
  {
    id: "wtf-live.public-room-mic-test",
    domain: "Community, Social, Messaging, and Discord",
    ownerSurfaceIds: ["wtf-live"],
    ownerSpec: "tests/playwright/inventory/wtf-live-owner-controls.spec.mjs",
    verificationCommand:
      "npm run build && npx playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs -g \"mic test\"",
    userVisibleAssertion:
      "A mobile WTF LIVE room user can open the Sharing tray testing icon, run a pre-join microphone test from a minimal drawer, keep browser/permission/device guidance collapsed in a Details drawer, and expand it when recovery details are needed without changing the desktop room layout.",
    durableSideEffectAssertion:
      "The inventory harness verifies the testing drawer is hidden by default, simulates unsupported MediaDevices, denied microphone permission, and a successful mobile-width mic probe after opening the drawer; it verifies actionable guidance, no horizontal overflow, a 44px mobile Test mic target, and named input-device reporting while the successful test stream is stopped instead of publishing room audio.",
  },
  {
    id: "wtf-live.public-room-realtime-media-chat",
    domain: "Community, Social, Messaging, and Discord",
    ownerSurfaceIds: ["wtf-live"],
    ownerSpec: "tests/playwright/inventory/wtf-live-owner-controls.spec.mjs",
    verificationCommand:
      "npm run build && npx playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs",
    userVisibleAssertion:
      "WTF LIVE public-room guests see each other in collapsible attendance; camera, screen, and dedicated media-file deck sources can appear as simultaneous stage tiles for the same host while mic-only guests stay out of the stage with lit mic indicators in attendance, chat remains reachable, unstyled room chat follows the receiver's default WTFOS font-library setting, a compact emoji icon inserts emoji into chat drafts, a text-style icon opens and collapses the chat style panel for Classic/Terminal/Serif fonts, color, readable 8-14 size, basic emphasis, stage-level room reaction buttons send transient guest signals, Enter submits room chat while Shift+Enter composes multiline text, and shared media can open in pop-out frames/lightboxes.",
    durableSideEffectAssertion:
      "The inventory harness uses the public /ws/wtf-live room relay to exchange WebRTC signaling, activeVideo/avatar/audioOpen media-state events, room reactions, and room chat, verifies push-to-talk changes another guest's attendance mic state without creating a stage tile, verifies camera-first then screen-share switching remains visible to another guest after camera stops, verifies stage pop-outs and chat media lightboxes open/close, verifies Enter sends and clears a chat message while Shift+Enter keeps a multiline draft until the next Enter, verifies the collapsed toolbar exposes emoji and style icons with 24px-or-larger targets, verifies the emoji picker inserts into the draft and relays through chat, verifies the style panel exposes only 8-14 font-size options plus Classic/Terminal/Serif font choices, verifies unstyled chat relays without a forced style so receiver default Serif Press applies, verifies a sanitized styled chat message relays to another guest, verifies a text message plus GIF attachment reaches another guest, and verifies seven idle guests remain attendance-only without pushing the chat composer offscreen.",
  },
  {
    id: "wtf-live.show-kit-soundboard",
    domain: "Community, Social, Messaging, and Discord",
    ownerSurfaceIds: ["wtf-live"],
    ownerSpec: "tests/playwright/inventory/wtf-live-owner-controls.spec.mjs",
    verificationCommand:
      "npm run build && npx playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs -g \"Show Kit soundboard\"",
    userVisibleAssertion:
      "A signed-in WTF LIVE host can open the Show Kit tab, save a labeled/category audio clip with a safe keyboard shortcut plus volume/cooldown policy, clear local cache, reload the dashboard from server presets, and see duplicate shortcut feedback before adding another clip.",
    durableSideEffectAssertion:
      "The focused harness stores Show Kit presets through /api/wtf-live/soundboard, loads them inside an owned room, hides trigger controls from an anonymous audience guest, exposes the owner's WebRTC soundboard audio lane to the audience while /ws/wtf-live carries bounded cue metadata, enforces cooldown feedback, and verifies the shortcut does not fire while chat is focused but does fire after focus leaves chat.",
  },
  {
    id: "wtf-live.wim-attendance-identity",
    domain: "Community, Social, Messaging, and Discord",
    ownerSurfaceIds: ["wtf-live", "wim"],
    ownerSpec: "tests/playwright/inventory/wtf-live-owner-controls.spec.mjs",
    verificationCommand:
      "npm run build && npx playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs",
    userVisibleAssertion:
      "Signed-in WTF LIVE users join rooms as their wtfOS usernames, attendance renders as compact single-line registry rows, and signed-in viewers can add account-backed attendees to WIM buddies from the roster while anonymous viewers cannot see that option.",
    durableSideEffectAssertion:
      "The harness emits WTF LIVE peer userId/username/isWtfUser metadata, verifies the roster stores the selected attendee id in WIM's browser-local `wtf:wim:friends:<viewerUserId>` list, and keeps guest-only peers out of WIM buddy actions.",
  },
  {
    id: "wtf-live.tip-items-transfer-redeem",
    domain: "Market, Exchange, Inventory, and Commerce",
    ownerSurfaceIds: ["wtf-live", "wtfiam"],
    ownerSpec: "tests/playwright/inventory/wtf-live-owner-controls.spec.mjs",
    verificationCommand:
      "npm run build && npx playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs -g \"WTF LIVE tip\"",
    userVisibleAssertion:
      "A signed-in WTF LIVE room user can open the tip tray from attendance, select an owned WTF LIVE tip item, send it to another signed-in room user, and redeem received tips from the WTFIAM WTF LIVE Tips ledger.",
    durableSideEffectAssertion:
      "The inventory harness decrements sender inventory, inserts an in-app inventory transfer, increments receiver inventory, marks redeemed transfers, and creates earned-WTF reward ledger balance when the receiver redeems the tip.",
  },
  {
    id: "wim.modular-window-roster-tabs",
    domain: "Community, Social, Messaging, and Discord",
    ownerSurfaceIds: ["wim"],
    ownerSpec: "client/src/pages/Wim.test.ts; tests/playwright/inventory/wim-owner-controls.spec.mjs",
    verificationCommand:
      "node --test client/src/pages/Wim.test.ts && npm run check -- --pretty false && npm run build && npx playwright test tests/playwright/inventory/wim-owner-controls.spec.mjs",
    userVisibleAssertion:
      "WIM opens directly on the desktop as a movable/resizable buddy-list widget, not inside a containing WIM app window; conversation widgets stay closed until a user or recent direct chat is opened by double-click, Enter/Space, or the visible open-chat button, then conversations can live as tabs, move between conversation widgets, detach into isolated desktop widgets, use system appearance-owned minimize/maximize/close controls and the shared OS taskbar instead of app-drawn traffic lights or a WIM-local dock, expose a rich WIM composer with font, size, color, bold, italic, underline, GIPHY/Tenor GIF, My Media, and owned-token link controls, and remain usable in a 320px mobile Chrome-style viewport without horizontal overflow while preserving active-control target sizes, keyboard access, visible focus, ARIA name/role/value, and live message log announcements.",
    durableSideEffectAssertion:
      "The source policy test verifies WIM does not render a containing AppWindow or WIM-local dock, still uses the canonical direct-DM/user roster endpoints, keeps friends/custom lists/popup dismissals browser-local, filters out Studio rooms, exposes the settings popover for custom buddy lists, sends rich composer style/attachment data through existing DM message metadata, and guards the mobile window-fitting, target-size, locale, toolbar, expanded-state, and live-log semantics owned by the WIM surface.",
  },
  {
    id: "wtf-live.private-room-access-list",
    domain: "Community, Social, Messaging, and Discord",
    ownerSurfaceIds: ["wtf-live"],
    ownerSpec: "tests/playwright/inventory/wtf-live-owner-controls.spec.mjs",
    verificationCommand:
      "npm run build && npx playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs",
    userVisibleAssertion:
      "A signed-in WTF LIVE host can create a private WTF-user room, sees it labeled as private with no public guest URL, edits the allowed username list from the selected room view, and joins it through the signed-in room entry path.",
    durableSideEffectAssertion:
      "The inventory harness stores the private-room fixture separately from public rooms, verifies /api/wtf-live/rooms/private and /api/wtf-live/rooms/:roomId/access reflect the access list, verifies the public guest endpoint does not expose the private room, and verifies private room dashboard messages remain realtime-only instead of public Skywire records.",
  },
  {
    id: "wtf-live.mobile-and-panel-popout-controls",
    domain: "Community, Social, Messaging, and Discord",
    ownerSurfaceIds: ["wtf-live"],
    ownerSpec: "tests/playwright/inventory/wtf-live-owner-controls.spec.mjs",
    verificationCommand:
      "npm run build && npx playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs",
    userVisibleAssertion:
      "On mobile, WTF LIVE stacks and scales the display-name, Join, sharing controls, and shared-screens surface without horizontal overflow or tap-target overlap; on desktop, Connection, Sharing, Screens, Attendance, and Room chat sit in a transparent dockable bento workspace with per-tile pop-out buttons, drag handles, floating pop-in controls, and always-on-top pin toggles. Testing and Settings hide under the Sharing tray, and shared screen/camera/media sources can merge into hover-popout screen grids.",
    durableSideEffectAssertion:
      "The inventory harness checks narrow-viewport element order/visibility, proves the mobile rail expands to its controls, stage/sidebar/chat stack vertically, the room remains vertically scrollable, and the attendance toggle is not intercepted by push-to-talk; it also verifies the bento workspace and all five core tiles render, testing/settings are drawers rather than tiles, receiver default font selection affects unstyled chat, camera plus screen sources can drag into a screen grid with hover-only item popout controls, opens chat as a panel pop-out, verifies the chat tile leaves the bento, toggles the pop-out pinned state, and pops chat back into the bento.",
  },
  {
    id: "wtf-live.stage-owner-lifecycle-controls",
    domain: "Community, Social, Messaging, and Discord",
    ownerSurfaceIds: ["wtf-live"],
    ownerSpec: "tests/playwright/inventory/wtf-live-owner-controls.spec.mjs",
    verificationCommand:
      "npm run build && npx playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs",
    userVisibleAssertion:
      "A WTF LIVE stage owner sees owned-stage details plus Close/Reopen/Delete controls in the Stages tab.",
    durableSideEffectAssertion:
      "The inventory harness toggles the owned-stage fixture through the WTF LIVE stage PATCH API and deletes it through the DELETE API, then verifies the selected stage card reflects the lifecycle change.",
  },
  {
    id: "w.groupchat-readonly-config-source",
    domain: "Community, Social, Messaging, and Discord",
    ownerSurfaceIds: ["w"],
    ownerSpec: "tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand: "npm run test:e2e:live:puppets",
    userVisibleAssertion: "W users can read the configured Gameshow groupchat mirror without a send surface.",
    durableSideEffectAssertion:
      "The harness asserts the groupchat API is read-only, personal DM writes are disabled, and admin diagnostics expose the active config source.",
  },
  {
    id: "ipfs-pinning.pds-backed-wallet-backup",
    domain: "Media, Storage, AT Protocol, and WTF Domains",
    ownerSurfaceIds: ["ipfs-pinning", "wtf-domains", "creation-tools"],
    ownerSpec: "tests/playwright/inventory/ipfs-pinning-manager.spec.mjs",
    verificationCommand: "npm run test:e2e:inventory",
    userVisibleAssertion:
      "A WTF Pin Collector can open IPFS Pinning Manager, see role/PDS/subdomain/provider readiness, and enable a whole-wallet backup only after accepting the public PDS record disclosure.",
    durableSideEffectAssertion:
      "Saving the policy queues public pinPolicy/pinManifest/pinItem AT records, records only portable pointers in core, stages bytes through S3/Porcupin storage, links the manifest to the wtfos.me subdomain registry, and emits normalized ipfs_pinning.* events.",
  },
  {
    id: "skullzarmy.fafolab-integration-contracts",
    domain: "Skullzarmy / FAFOlab Integrations (skllzrmy)",
    ownerSurfaceIds: [
      "arcade",
      "creation-tools",
      "discovery-engine",
      "ipfs-pinning",
      "mastodon",
      "mint-portal",
      "operator-tools",
      "social-automation",
      "tezosbeats",
    ],
    ownerSpec: "tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand: "npm run test:e2e:live:puppets",
    userVisibleAssertion:
      "The live harness opens the FAFOlab/skllzrmy route family, including TezosBeats, Tusk/Mastodon, Porcupin, MindWalk, PixelPatterns, PenRose, Contract Factory, and Mint Portal surfaces.",
    durableSideEffectAssertion:
      "The same workflow probes the registered music, Mastodon, Porcupin, Discovery, social-automation, and factory API contracts against the real server/database status boundary.",
  },
  {
    id: "routes.all-registered-pages-open",
    domain: "Desktop OS, Navigation, and Personal Environment",
    platformOwner: "inventory-route-smoke",
    ownerSpec: "tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand: "npm run test:e2e:live:puppets",
    userVisibleAssertion: "Every registered route fixture renders a visible body without an app crash.",
    durableSideEffectAssertion:
      "Authenticated and admin-only routes are opened through the seeded actor sessions that match their access requirements.",
  },
  {
    id: "domains.api-probes-and-route-loops",
    domain: "Administration, Governance, and Operations",
    platformOwner: "inventory-domain-workflows",
    ownerSpec: "tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand: "npm run test:e2e:live:puppets",
    userVisibleAssertion: "Every canonical domain workflow opens its representative user routes.",
    durableSideEffectAssertion:
      "Every domain workflow runs its owned API probes against a real server/database session with expected status contracts.",
  },
];

export function buildBehaviorAssertionOwnership(assertions = CORE_BEHAVIOR_ASSERTIONS) {
  const surfaceLinks = [];
  const platformAssertions = [];
  for (const assertion of assertions) {
    const ownerSurfaceIds = Array.isArray(assertion.ownerSurfaceIds)
      ? assertion.ownerSurfaceIds
      : [];
    for (const surfaceId of ownerSurfaceIds) {
      surfaceLinks.push({ assertionId: assertion.id, surfaceId });
    }
    if (ownerSurfaceIds.length === 0 && assertion.platformOwner) {
      platformAssertions.push(assertion.id);
    }
  }
  return { surfaceLinks, platformAssertions };
}

export function assertBehaviorAssertions(assertions = CORE_BEHAVIOR_ASSERTIONS, adminSurfaces = []) {
  const failures = [];
  const seen = new Set();
  const assertionById = new Map();
  const surfaceById = new Map(adminSurfaces.map((surface) => [surface.id, surface]));
  for (const assertion of assertions) {
    if (!assertion?.id) failures.push("Behavior assertion is missing an id.");
    if (assertion?.id && seen.has(assertion.id)) {
      failures.push(`Duplicate behavior assertion id: ${assertion.id}`);
    }
    if (assertion?.id) seen.add(assertion.id);
    if (assertion?.id) assertionById.set(assertion.id, assertion);
    const ownerSurfaceIds = Array.isArray(assertion?.ownerSurfaceIds)
      ? assertion.ownerSurfaceIds
      : [];
    if (ownerSurfaceIds.length === 0 && typeof assertion?.platformOwner !== "string") {
      failures.push(`${assertion?.id || "unknown"} must declare ownerSurfaceIds or platformOwner.`);
    }
    for (const surfaceId of ownerSurfaceIds) {
      const surface = surfaceById.get(surfaceId);
      if (!surface) {
        failures.push(`${assertion.id} references unknown owner surface '${surfaceId}'.`);
        continue;
      }
      const declaredIds = Array.isArray(surface.behaviorAssertionIds)
        ? surface.behaviorAssertionIds
        : [];
      if (!declaredIds.includes(assertion.id)) {
        failures.push(`${surfaceId} must register behavior assertion '${assertion.id}'.`);
      }
    }
    for (const key of [
      "domain",
      "ownerSpec",
      "verificationCommand",
      "userVisibleAssertion",
      "durableSideEffectAssertion",
    ]) {
      if (typeof assertion?.[key] !== "string" || assertion[key].trim().length === 0) {
        failures.push(`${assertion?.id || "unknown"} is missing ${key}.`);
      }
    }
  }
  for (const surface of adminSurfaces) {
    const declaredIds = Array.isArray(surface.behaviorAssertionIds)
      ? surface.behaviorAssertionIds
      : [];
    const duplicateDeclaredIds = declaredIds.filter(
      (id, index, list) => list.indexOf(id) !== index
    );
    for (const id of new Set(duplicateDeclaredIds)) {
      failures.push(`${surface.id} declares duplicate behavior assertion '${id}'.`);
    }
    for (const id of declaredIds) {
      const assertion = assertionById.get(id);
      if (!assertion) {
        failures.push(`${surface.id} declares unknown behavior assertion '${id}'.`);
        continue;
      }
      const ownerSurfaceIds = Array.isArray(assertion.ownerSurfaceIds)
        ? assertion.ownerSurfaceIds
        : [];
      if (!ownerSurfaceIds.includes(surface.id)) {
        failures.push(`${id} must include '${surface.id}' in ownerSurfaceIds.`);
      }
    }
  }
  return failures;
}
