export const CORE_BEHAVIOR_ASSERTIONS = [
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
    ownerSpec: "client/src/lib/wallet-context-policy.test.ts",
    verificationCommand: "npx tsx --test client/src/lib/wallet-context-policy.test.ts",
    userVisibleAssertion:
      "Refreshing WTF OS with a cached local wallet does not ask the user for an ownership signature when that wallet is not linked to the current account.",
    durableSideEffectAssertion:
      "Only explicit connect/link or participation flows can enable signature-backed wallet linking; passive rehydration remains read/sync-only.",
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
    id: "macaroni.shadownet-rpc-wallet-setup",
    domain: "Media, Creation, Gallery, and Preservation",
    ownerSurfaceIds: ["creation-tools", "wtf-domains"],
    ownerSpec: "tests/playwright/live/macaroni-shadownet.spec.mjs",
    verificationCommand: "npm run test:e2e:macaroni:shadownet",
    userVisibleAssertion:
      "A trusted-creator puppet can open Macaroni, enter the Studio through the embedded creation-tool iframe, see Shadownet as the default rehearsal network, connect a Shadownet puppet wallet without RPC errors, show the Beacon picker with Kukai and Temple options on explicit connect, and route selected Kukai pairing to the Shadownet Kukai app.",
    durableSideEffectAssertion:
      "The focused runner seeds dummy users and Shadownet puppet wallet metadata, verifies the live Shadownet RPC chain id `NetXsqzbfFenSTS` in the Macaroni iframe, proves a mismatched RPC is blocked before wallet signing, confirms explicit connect does not open a wallet handoff before the Beacon picker is visible, and checks from `/tools/macaroni` that Beacon's real Kukai option can escape the sandbox and load `https://shadownet.kukai.app` instead of a blank, mainnet, or Temple-only tab.",
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
    ownerSpec: "tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand: "npm run test:e2e:live:puppets",
    userVisibleAssertion: "A contestant can update desktop appearance grammar, colors, layout, WX weather, and use desktop pet actions.",
    durableSideEffectAssertion:
      "The harness writes desktop settings, reloads them through a fresh read, records a desktop event with an event id, and confirms the pet action appears in live pet event history.",
  },
  {
    id: "desktop.font-pack.updated",
    domain: "Desktop OS, Navigation, and Personal Environment",
    ownerSurfaceIds: ["desktop-appearance"],
    ownerSpec:
      "client/src/features/appearance/font-packs.test.ts, client/src/features/appearance/get-canvas-font.test.ts, shared/desktop.test.ts",
    verificationCommand:
      "npx tsx --test client/src/features/appearance/font-packs.test.ts client/src/features/appearance/get-canvas-font.test.ts shared/desktop.test.ts",
    userVisibleAssertion:
      "Theme Builder can select a font pack and the desktop shell immediately applies the matching --wtf-app-font CSS variable.",
    durableSideEffectAssertion:
      "DesktopAppearance.fontPackKey normalizes to a known pack, persists through /api/desktop/settings, and canvas helpers read the same CSS variable roles.",
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
    id: "wtf-live.public-room-realtime-media-chat",
    domain: "Community, Social, Messaging, and Discord",
    ownerSurfaceIds: ["wtf-live"],
    ownerSpec: "tests/playwright/inventory/wtf-live-owner-controls.spec.mjs",
    verificationCommand:
      "npm run build && npx playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs",
    userVisibleAssertion:
      "WTF LIVE public-room guests see each other in collapsible attendance; camera/screen shares take visual priority in the bulk stage, mic-only guests stay out of the stage with lit mic indicators in attendance, chat remains reachable, the chat toolbox changes font/color/readable 8-14 size/basic emphasis in one row, Enter submits room chat while Shift+Enter composes multiline text, and shared media can open in pop-out frames/lightboxes.",
    durableSideEffectAssertion:
      "The inventory harness uses the public /ws/wtf-live room relay to exchange WebRTC signaling, activeVideo/avatar/audioOpen media-state events, and room chat, verifies push-to-talk changes another guest's attendance mic state without creating a stage tile, verifies camera-first then screen-share switching remains visible to another guest after camera stops, verifies stage pop-outs and chat media lightboxes open/close, verifies Enter sends and clears a chat message while Shift+Enter keeps a multiline draft until the next Enter, verifies the toolbar exposes only 8-14 font-size options and relays a sanitized styled chat message to another guest, verifies a text message plus GIF attachment reaches another guest, and verifies seven idle guests remain attendance-only without pushing the chat composer offscreen.",
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
    ownerSpec: "client/src/pages/Wim.test.ts",
    verificationCommand: "node --test client/src/pages/Wim.test.ts && npm run check -- --pretty false",
    userVisibleAssertion:
      "WIM opens directly on the desktop as a movable/resizable buddy-list widget, not inside a containing WIM app window; conversation widgets stay closed until a user or recent direct chat is opened by double-click, then conversations can live as tabs, move between conversation widgets, detach into isolated desktop widgets, use system appearance-owned minimize/maximize/close controls and the shared OS taskbar instead of app-drawn traffic lights or a WIM-local dock, and expose a rich WIM composer with font, size, color, bold, italic, underline, GIPHY/Tenor GIF, My Media, and owned-token link controls.",
    durableSideEffectAssertion:
      "The source policy test verifies WIM does not render a containing AppWindow or WIM-local dock, still uses the canonical direct-DM/user roster endpoints, keeps friends/custom lists/popup dismissals browser-local, filters out Studio rooms, exposes the settings popover for custom buddy lists, and sends rich composer style/attachment data through existing DM message metadata.",
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
      "On mobile, WTF LIVE stacks and scales the display-name, Join, mic, camera, and screen controls before the stage without horizontal overflow or tap-target overlap; on desktop, chat and attendance have icon pop-out controls and the stage expands when both side panels are detached.",
    durableSideEffectAssertion:
      "The inventory harness checks narrow-viewport element order/visibility, proves the mobile rail expands to its controls, stage/sidebar/chat stack vertically, the room remains vertically scrollable, and the attendance toggle is not intercepted by push-to-talk; it also opens chat and attendance panel pop-outs, verifies floating panel frames render, verifies both dock notices appear, and verifies the stage/sidebar layout changes while the panels are popped out.",
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
    id: "skullzarmy.fafolab-integration-contracts",
    domain: "Skullzarmy / FAFOlab Integrations (skllzrmy)",
    ownerSurfaceIds: [
      "arcade",
      "creation-tools",
      "discovery-engine",
      "mastodon",
      "mint-portal",
      "operator-tools",
      "porcupin",
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
