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
    id: "gamma.login-daily-return-strip",
    domain: "Entry, Authentication, and Account Identity",
    ownerSurfaceIds: ["gamma-shell"],
    ownerSpec:
      "client/src/pages/gamma-shell-presentation-policy.test.ts; tests/playwright/inventory/gamma-wtfos.spec.mjs",
    verificationCommand:
      "npm run build && npx tsx --test client/src/pages/gamma-shell-presentation-policy.test.ts && HARNESS_PORT=4360 npx playwright test tests/playwright/inventory/gamma-wtfos.spec.mjs -g \"renders an inhabited|account tile|routes daily return|keeps the first mobile|signed-in OS session console|Gamma wake queue|signs out from Gamma session controls\" --project=chromium --reporter=list",
    userVisibleAssertion:
      "Gamma home opens like a usable OS login surface: the boot desk shows a route-backed account tile plus app/daily/people status checks, the session console shows a mounted-workspace table for account, restore target, app passes, and active Gamma shell, the wake queue ranks Resume/Login, Inbox, Daily, People, and Apps as route-backed next steps, persistent session controls offer Desk, Settings, and Sign out/Login, the daily return strip offers Side Quests, Challenges, W people discovery, and Notifications, and all controls stay readable with mobile-sized targets.",
    durableSideEffectAssertion:
      "The source policy keeps Gamma on shared routes with no Gamma-specific API, the interaction inventory binds the Gamma shell to existing public/session/admin routes, and the browser proof routes the account tile, mounted-workspace rows, and wake queue to `/gamma/login?return=/dashboard`, `/gamma/user/:username`, `/gamma/dashboard` or a browser-local recent route, Inbox, Daily, People, Apps, and Gamma home; shared logout returns signed-in users to the Gamma desk and exposes the Gamma login action while daily return actions still open `/gamma/side-quests`, `/gamma/w`, and `/gamma/notifications` without leaving the Gamma presentation host.",
  },
  {
    id: "gamma.command-search-launcher",
    domain: "Entry, Authentication, and Account Identity",
    ownerSurfaceIds: ["gamma-shell"],
    ownerSpec:
      "client/src/pages/gamma-shell-presentation-policy.test.ts; tests/playwright/inventory/gamma-wtfos.spec.mjs",
    verificationCommand:
      "npm run build && npx tsx --test client/src/pages/gamma-shell-presentation-policy.test.ts && HARNESS_PORT=4360 npx playwright test tests/playwright/inventory/gamma-wtfos.spec.mjs -g \"command search\" --project=chromium --reporter=list",
    userVisibleAssertion:
      "Gamma search behaves like an OS launcher: typing a known app, tool, or system route shows command results and opens the matching Gamma route before falling back to Gallery search for unmatched text.",
    durableSideEffectAssertion:
      "The source policy builds command entries from existing Gamma stations, app catalog entries, and static PAGE_DEFS routes while preserving shared route gates, app availability, and no Gamma-specific API; the browser proof launches Broot and Settings under `/gamma/...` from search results.",
  },
  {
    id: "gamma.command-keyboard-shortcut",
    domain: "Entry, Authentication, and Account Identity",
    ownerSurfaceIds: ["gamma-shell"],
    ownerSpec:
      "client/src/pages/gamma-shell-presentation-policy.test.ts; tests/playwright/inventory/gamma-wtfos.spec.mjs",
    verificationCommand:
      "npm run build && npx tsx --test client/src/pages/gamma-shell-presentation-policy.test.ts && HARNESS_PORT=4360 npx playwright test tests/playwright/inventory/gamma-wtfos.spec.mjs -g \"OS keyboard shortcut\" --project=chromium --reporter=list",
    userVisibleAssertion:
      "Gamma behaves like an operating-system shell: pressing Ctrl/Cmd+K focuses the mounted command search from either the home desk or an app route, then the user can type and launch a Gamma route without pointer-hunting for the field.",
    durableSideEffectAssertion:
      "The source policy keeps the shortcut inside the Gamma shell, focuses only mounted `data-gamma-command-input` fields, removes the keydown listener on unmount, and the browser proof launches `/gamma/settings` from an app route without Classic fallback or Gamma-specific API calls.",
  },
  {
    id: "gamma.home-enter-continue",
    domain: "Entry, Authentication, and Account Identity",
    ownerSurfaceIds: ["gamma-shell"],
    ownerSpec:
      "client/src/pages/gamma-shell-presentation-policy.test.ts; tests/playwright/inventory/gamma-wtfos.spec.mjs",
    verificationCommand:
      "npm run build && npx tsx --test client/src/pages/gamma-shell-presentation-policy.test.ts && HARNESS_PORT=4360 npx playwright test tests/playwright/inventory/gamma-wtfos.spec.mjs -g \"boot desk with Enter\" --project=chromium --reporter=list",
    userVisibleAssertion:
      "Gamma home behaves like a standard OS start surface: the visible primary Continue/Login action owns focus on the boot desk, and pressing Enter launches it, sending guests to Gamma-hosted login that opens `/gamma/dashboard` after authentication and signed-in users to their Continue route or dashboard.",
    durableSideEffectAssertion:
      "The source policy keeps the default action in the Gamma shell, carries a sanitized `/dashboard` return through Login/Register, ignores editable and interactive controls for the fallback Enter shortcut, waits for shared auth state before routing, and the browser proof opens `/gamma/login?return=/dashboard`, submits through the shared login API, and lands on `/gamma/dashboard` without Classic fallback or Gamma-specific APIs.",
  },
  {
    id: "gamma.dashboard-next-actions",
    domain: "Entry, Authentication, and Account Identity",
    ownerSurfaceIds: ["gamma-shell", "dashboard"],
    ownerSpec:
      "client/src/pages/dashboard-presentation-policy.test.ts; tests/playwright/inventory/gamma-wtfos.spec.mjs",
    verificationCommand:
      "npm run build && npx tsx --test client/src/pages/dashboard-presentation-policy.test.ts && HARNESS_PORT=4360 npx playwright test tests/playwright/inventory/gamma-wtfos.spec.mjs -g \"Dashboard cockpit\" --project=chromium --reporter=list",
    userVisibleAssertion:
      "After logging into Gamma, the hosted Dashboard starts with a compact next-action rail for Daily proof, Challenges, People, Apps, Inbox, and Profile so the first workspace gives a clear OS-like next step.",
    durableSideEffectAssertion:
      "The source policy renders the rail only when `presentation.host` is Gamma, routes every action to existing shared WTFOS routes without Gamma-specific APIs, and the browser proof clicks Daily proof from `/gamma/dashboard` into `/gamma/side-quests` without mounting the Classic desktop.",
  },
  {
    id: "gamma.command-result-keyboard-navigation",
    domain: "Entry, Authentication, and Account Identity",
    ownerSurfaceIds: ["gamma-shell"],
    ownerSpec:
      "client/src/pages/gamma-shell-presentation-policy.test.ts; tests/playwright/inventory/gamma-wtfos.spec.mjs",
    verificationCommand:
      "npm run build && npx tsx --test client/src/pages/gamma-shell-presentation-policy.test.ts && HARNESS_PORT=4360 npx playwright test tests/playwright/inventory/gamma-wtfos.spec.mjs -g \"command results from keyboard\" --project=chromium --reporter=list",
    userVisibleAssertion:
      "Gamma command search behaves like an OS launcher: after typing in the start-desk or app-route search box, ArrowDown moves focus into the visible results, ArrowUp/ArrowDown cycle result buttons, Escape returns focus to the command input with the query intact, and Enter launches the focused route or Gallery fallback without using the pointer.",
    durableSideEffectAssertion:
      "The source policy keeps result focus movement and result-to-input recovery inside the Gamma command surface and uses existing route results with no Gamma-specific API; the browser proof recovers from focused Broot and Gallery fallback results, then launches `/gamma/tools/broot` and the Gallery fallback from keyboard-focused command results while confirming the Classic desktop never mounts.",
  },
  {
    id: "gamma.command-escape-dismissal",
    domain: "Entry, Authentication, and Account Identity",
    ownerSurfaceIds: ["gamma-shell"],
    ownerSpec:
      "client/src/pages/gamma-shell-presentation-policy.test.ts; tests/playwright/inventory/gamma-wtfos.spec.mjs",
    verificationCommand:
      "npm run build && npx tsx --test client/src/pages/gamma-shell-presentation-policy.test.ts && HARNESS_PORT=4360 npx playwright test tests/playwright/inventory/gamma-wtfos.spec.mjs -g \"command search with Escape\" --project=chromium --reporter=list",
    userVisibleAssertion:
      "Gamma command search behaves like an OS field: pressing Escape after typing in the start-desk or app-route command input clears the query, dismisses focus, and leaves the current Gamma route unchanged.",
    durableSideEffectAssertion:
      "The source policy keeps dismissal inside the Gamma shell with no Gamma-specific API, and the browser proof clears both home and route command inputs while confirming the URL remains `/gamma` or `/gamma/gallery` and the Classic desktop never mounts.",
  },
  {
    id: "gamma.app-route-keyboard-desk-shortcut",
    domain: "Entry, Authentication, and Account Identity",
    ownerSurfaceIds: ["gamma-shell"],
    ownerSpec:
      "client/src/pages/gamma-shell-presentation-policy.test.ts; tests/playwright/inventory/gamma-wtfos.spec.mjs",
    verificationCommand:
      "npm run build && npx tsx --test client/src/pages/gamma-shell-presentation-policy.test.ts && HARNESS_PORT=4360 npx playwright test tests/playwright/inventory/gamma-wtfos.spec.mjs -g \"keyboard shortcut\" --project=chromium --reporter=list",
    userVisibleAssertion:
      "A Gamma user can press Alt+Home from a Gamma app route to return to the Gamma desk without using pointer navigation, while editable fields keep the shortcut for normal text/input behavior.",
    durableSideEffectAssertion:
      "The source policy keeps the shortcut inside the Gamma shell, ignores input/textarea/select/contenteditable targets, removes the keydown listener on unmount, and the browser proof returns `/gamma/gallery` to `/gamma` without Classic fallback or Gamma-specific API calls.",
  },
  {
    id: "gamma.route-history-recovery",
    domain: "Entry, Authentication, and Account Identity",
    ownerSurfaceIds: ["gamma-shell"],
    ownerSpec:
      "client/src/pages/gamma-shell-presentation-policy.test.ts; tests/playwright/inventory/gamma-wtfos.spec.mjs",
    verificationCommand:
      "npm run build && npx tsx --test client/src/pages/gamma-shell-presentation-policy.test.ts && HARNESS_PORT=4360 npx playwright test tests/playwright/inventory/gamma-wtfos.spec.mjs -g \"route history recovery\" --project=chromium --reporter=list",
    userVisibleAssertion:
      "A Gamma app route exposes standard OS-style Back, Forward, and Desk controls in shell chrome, plus Alt+ArrowLeft and Alt+ArrowRight shortcuts, so users can recover route context without relying on browser chrome or leaving Gamma.",
    durableSideEffectAssertion:
      "The source policy keeps a bounded sanitized Gamma route stack in presentation state, rejects API and unregistered paths, disables unavailable history directions, ignores editable shortcut targets, avoids raw `window.history` calls, and the browser proof moves `/gamma/gallery` to `/gamma/settings` and back/forward/desk without Classic fallback or Gamma-specific APIs.",
  },
  {
    id: "gamma.recent-route-restore",
    domain: "Entry, Authentication, and Account Identity",
    ownerSurfaceIds: ["gamma-shell"],
    ownerSpec:
      "client/src/pages/gamma-shell-presentation-policy.test.ts; tests/playwright/inventory/gamma-wtfos.spec.mjs",
    verificationCommand:
      "npm run build && npx tsx --test client/src/pages/gamma-shell-presentation-policy.test.ts && HARNESS_PORT=4360 npx playwright test tests/playwright/inventory/gamma-wtfos.spec.mjs -g \"recent route restore\" --project=chromium --reporter=list",
    userVisibleAssertion:
      "Gamma remembers recently opened registered routes in the browser session, promotes the newest route into Continue, shows route-backed open-app dock buttons on the home session console, and lets the user recover the front recent app from the Gamma desk by keyboard without scanning the page.",
    durableSideEffectAssertion:
      "The source policy stores only sanitized registered route strings in browser localStorage under `wtfos.gamma.recentRoutes`, excludes auth/home/API paths, derives labels from existing route/station metadata, exposes the first stored recent route as the home dock keyboard target, ignores editable fields, and the browser proof keeps every pointer or keyboard restore inside Gamma with shared auth/app gates intact and no Gamma-specific API.",
  },
  {
    id: "gamma.app-task-switcher-recents",
    domain: "Entry, Authentication, and Account Identity",
    ownerSurfaceIds: ["gamma-shell"],
    ownerSpec:
      "client/src/pages/gamma-shell-presentation-policy.test.ts; tests/playwright/inventory/gamma-wtfos.spec.mjs",
    verificationCommand:
      "npm run build && npx tsx --test client/src/pages/gamma-shell-presentation-policy.test.ts && HARNESS_PORT=4360 npx playwright test tests/playwright/inventory/gamma-wtfos.spec.mjs -g \"recent app routes\" --project=chromium --reporter=list",
    userVisibleAssertion:
      "A signed-in Gamma user can move between recent app routes directly from the app-route taskbar, by pointer or keyboard, without returning to Gamma home or seeing the Classic desktop.",
    durableSideEffectAssertion:
      "The source policy reuses the browser-local sanitized `wtfos.gamma.recentRoutes` list, excludes the active route from switch buttons, exposes the first switch target as a Gamma keyboard route, falls back to route-backed quick switches when no stored recents exist, and the browser proof switches `/gamma/leaderboard` to `/gamma/settings` by keyboard while editable fields are ignored, then switches back by pointer while shared route gates remain intact and no Gamma API is introduced.",
  },
  {
    id: "gamma.daily-sidequest-handoff",
    domain: "Gameshow Participation, Progression, and Rewards",
    ownerSurfaceIds: ["gamma-shell", "side-quests", "messageboard"],
    ownerSpec: "tests/playwright/inventory/gamma-wtfos.spec.mjs",
    verificationCommand:
      "npm run build && HARNESS_PORT=4360 npx playwright test tests/playwright/inventory/gamma-wtfos.spec.mjs -g \"daily side quest handoff\" --project=chromium --reporter=list",
    userVisibleAssertion:
      "A signed-in Gamma user can start on `/gamma`, open the daily return strip, see the daily messageboard check-in inside the Side Quests app, follow its task button to Message Board inside Gamma, claim a verified daily proof, and continue to WTFIAM market unlocks without falling back to Classic.",
    durableSideEffectAssertion:
      "The focused browser proof uses the existing Side Quests daily-loop API, Message Board read APIs, and daily-loop claim API while preserving Gamma route prefixes; the live puppet assertion `gameshow.side-quests-messageboard-check-in` remains the durable post/claim/XP/WTF ledger proof.",
  },
  {
    id: "gamma.session-console-shortcuts",
    domain: "Entry, Authentication, and Account Identity",
    ownerSurfaceIds: ["gamma-shell"],
    ownerSpec:
      "client/src/pages/gamma-shell-presentation-policy.test.ts; tests/playwright/inventory/gamma-wtfos.spec.mjs",
    verificationCommand:
      "npm run build && npx tsx --test client/src/pages/gamma-shell-presentation-policy.test.ts && HARNESS_PORT=4360 npx playwright test tests/playwright/inventory/gamma-wtfos.spec.mjs -g \"signed-in OS session console|first mobile\" --project=chromium --reporter=list",
    userVisibleAssertion:
      "A signed-in Gamma user lands on a compact OS session console with profile identity, Home, Inbox, Apps, Settings, Daily proof, People, and Objects controls, with mobile-sized targets instead of a report-style landing page.",
    durableSideEffectAssertion:
      "The browser proof opens Settings and W through the session console while preserving `/gamma/...` routing, with all controls backed by existing shared routes and no Gamma-specific API or duplicated app state.",
  },
  {
    id: "gamma.system-tray-session-status",
    domain: "Entry, Authentication, and Account Identity",
    ownerSurfaceIds: ["gamma-shell"],
    ownerSpec:
      "client/src/pages/gamma-shell-presentation-policy.test.ts; tests/playwright/inventory/gamma-wtfos.spec.mjs",
    verificationCommand:
      "npm run build && npx tsx --test client/src/pages/gamma-shell-presentation-policy.test.ts && HARNESS_PORT=4360 npx playwright test tests/playwright/inventory/gamma-wtfos.spec.mjs -g \"system tray\" --project=chromium --reporter=list",
    userVisibleAssertion:
      "Gamma keeps a persistent OS system tray on home and app routes, showing session, shared API health (checking/online/degraded), Signals, Daily, Apps, and People status controls with readable touch-sized targets and a Settings recovery target when shared reads degrade.",
    durableSideEffectAssertion:
      "The focused browser proof clicks Gamma tray actions from `/gamma` and `/gamma/gallery` into shared `/gamma/notifications`, `/gamma/settings`, `/gamma/side-quests`, and `/gamma/wtfiam?category=apps` routes, then mocks a degraded leaderboard read and proves the network tray control opens `/gamma/settings`, proving the tray is route-backed shell navigation with no Gamma-specific API or Classic fallback.",
  },
  {
    id: "gamma.tray-notification-signals",
    domain: "Entry, Authentication, and Account Identity",
    ownerSurfaceIds: ["gamma-shell"],
    ownerSpec:
      "client/src/pages/gamma-shell-presentation-policy.test.ts; tests/playwright/inventory/gamma-wtfos.spec.mjs",
    verificationCommand:
      "npm run build && npx tsx --test client/src/pages/gamma-shell-presentation-policy.test.ts && HARNESS_PORT=4360 npx playwright test tests/playwright/inventory/gamma-wtfos.spec.mjs -g \"system tray\" --project=chromium --reporter=list",
    userVisibleAssertion:
      "Gamma's persistent Signals tray control reports notification state as guest, checking, clear, unread, or degraded, shows an unread count when available, and opens the shared Notification Center inside `/gamma/notifications`.",
    durableSideEffectAssertion:
      "The source policy reads existing `/api/notifications?limit=6` only for signed-in users, exposes notification state and unread-count attributes on the tray action, and the browser proof confirms the unread signal routes to `/gamma/notifications` without Classic fallback or Gamma-specific APIs.",
  },
  {
    id: "gamma.session-lock-return",
    domain: "Entry, Authentication, and Account Identity",
    ownerSurfaceIds: ["gamma-shell"],
    ownerSpec:
      "client/src/pages/gamma-shell-presentation-policy.test.ts; tests/playwright/inventory/gamma-wtfos.spec.mjs",
    verificationCommand:
      "npm run build && npx tsx --test client/src/pages/gamma-shell-presentation-policy.test.ts && HARNESS_PORT=4360 npx playwright test tests/playwright/inventory/gamma-wtfos.spec.mjs -g \"locks Gamma\" --project=chromium --reporter=list",
    userVisibleAssertion:
      "A signed-in Gamma user can choose Lock from the persistent session controls, or press Ctrl+Alt+L outside editable fields, to return to the Gamma desk while staying signed in.",
    durableSideEffectAssertion:
      "The source policy proves the Lock action routes to `/` with retained session state and does not call logout; the browser proof confirms `/gamma` renders a signed-in boot desk after button and keyboard lock paths with no Classic fallback or auth mutation.",
  },
  {
    id: "gamma.system-clock-calendar-handoff",
    domain: "Entry, Authentication, and Account Identity",
    ownerSurfaceIds: ["gamma-shell"],
    ownerSpec:
      "client/src/pages/gamma-shell-presentation-policy.test.ts; tests/playwright/inventory/gamma-wtfos.spec.mjs",
    verificationCommand:
      "npm run build && npx tsx --test client/src/pages/gamma-shell-presentation-policy.test.ts && HARNESS_PORT=4360 npx playwright test tests/playwright/inventory/gamma-wtfos.spec.mjs -g \"system tray\" --project=chromium --reporter=list",
    userVisibleAssertion:
      "Gamma shows a persistent browser-local clock/date in the system tray on home and app routes, and activating it opens the existing Calendar app inside `/gamma/calendar`.",
    durableSideEffectAssertion:
      "The source policy derives the clock from browser Date/Intl state, exposes ISO/time/date attributes on the tray action, routes to the existing `/calendar` route, and the browser proof confirms the Calendar handoff stays in Gamma with no Gamma-specific API, auth mutation, or Classic fallback.",
  },
  {
    id: "gamma.auth-return-continuity",
    domain: "Entry, Authentication, and Account Identity",
    ownerSurfaceIds: ["gamma-shell"],
    ownerSpec:
      "client/src/pages/gamma-shell-presentation-policy.test.ts; tests/playwright/inventory/gamma-wtfos.spec.mjs",
    verificationCommand:
      "npm run build && npx tsx --test client/src/pages/gamma-shell-presentation-policy.test.ts && HARNESS_PORT=4360 npx playwright test tests/playwright/inventory/gamma-wtfos.spec.mjs -g \"auth return\" --project=chromium --reporter=list",
    userVisibleAssertion:
      "A guest opening a protected Gamma route lands on a lock-screen-style gate whose Enter and return action is focused; pressing Enter opens Gamma-hosted login, focuses Username, and after login returns to the attempted Gamma route instead of Classic or the Gamma home page.",
    durableSideEffectAssertion:
      "The focused browser proof uses the shared auth login API while the Gamma shell carries only a sanitized local return route in the login query string; Login/Register use presentationRouteHref for Gamma, default plain Gamma auth to `/dashboard`, preserve form focus, and do not introduce Gamma-specific auth APIs.",
  },
  {
    id: "gamma.app-route-taskbar-navigation",
    domain: "Entry, Authentication, and Account Identity",
    ownerSurfaceIds: ["gamma-shell"],
    ownerSpec:
      "client/src/pages/gamma-shell-presentation-policy.test.ts; tests/playwright/inventory/gamma-wtfos.spec.mjs",
    verificationCommand:
      "npm run build && npx tsx --test client/src/pages/gamma-shell-presentation-policy.test.ts && HARNESS_PORT=4360 npx playwright test tests/playwright/inventory/gamma-wtfos.spec.mjs -g \"app-route taskbar\" --project=chromium --reporter=list",
    userVisibleAssertion:
      "A Gamma app route shows an OS taskbar with the active app identity plus Close app, Desk/Login, Inbox, Daily, Apps, and Settings controls; real hosted app routes move focus to the active-app strip so the route feels activated, while the buttons remain touch-sized in a narrow viewport.",
    durableSideEffectAssertion:
      "The focused browser proof starts on `/gamma/gallery`, verifies the active-app strip owns focus, uses the taskbar to open `/gamma/side-quests`, `/gamma/messages`, and close the current app route back to `/gamma`, and verifies every app step keeps focus, the Gamma shell, and shared route ownership instead of loading Classic UI or a Gamma-specific API.",
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
      "Policy coverage keeps ACTIVE_ACCOUNT_SET subscribed before permission requests, keeps Octez Connect as the wallet transport with a custom Taquito operation provider, clears legacy wallet IndexedDB/localStorage for forced auth reconnects, forces auth challenge signing through the mainnet wallet lane, and keeps Octez-hosted app RPC defaults ahead of TzKT indexer fallbacks.",
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
      "A trusted-creator puppet can open Macaroni, enter the Studio through the embedded creation-tool iframe, see Shadownet as the default rehearsal network, choose Macaroni V1 or V2 contract templates, see the wtfOS IPFS provider, see Fileship as the default IPFS gateway, see the 1 GB per-artifact hard max, 250 MB average artifact limit, and 1 MB square JPG/PNG collection logo/cover limit, define per-token edition quantity, configure optional minter royalty pool/split/updater policy, attach multiple unrevealed placeholder images for delayed reveal, connect a Shadownet puppet wallet without RPC errors, use Octez Connect as the primary wallet provider with legacy Taquito compatibility scoped to generated static bundles, route selected Kukai pairing to the Shadownet Kukai app, send named wallet permission networks without embedding the dApp RPC URL, serve stored legacy wtfOS-hosted Macaroni drop pages with Octez-primary bridge injection plus the same named-network wallet hardening, and block wtfOS publish until the drop has a deployed or resumed KT1 contract; a regular signed-in puppet loading the static Studio does not see the wtfOS IPFS provider; generated mint pages expose clean disconnect, prevent duplicate request-permission flows from rapid connect clicks, reuse/reconfigure the same Octez-primary client with active-account subscription before permission APIs, include basic accessibility landmarks/status/progress/quantity semantics, normalize live max_per_wallet storage before showing share/status copy, keep X share compose text within the standard post limit while preserving mint/media URLs where possible, expose prefilled ICS and Google Calendar links for sale stages, clamp requested mint quantity to live collection remaining supply plus the connected wallet's remaining per-wallet/allowlist allowance, show wallet balance/cost status, max-per-wallet status, minter royalty sync status, owned-mint recovery hooks, RPC pack/estimate fallback handling, and bounded theme styling instead of arbitrary stored CSS.",
    durableSideEffectAssertion:
      "The focused runner seeds dummy users and Shadownet puppet wallet metadata, verifies the live Shadownet RPC chain id `NetXsqzbfFenSTS` in the Macaroni iframe, proves the contract-version selector exposes V1 and V2 template choices, proves the IPFS provider selector follows `trusted_market_creator` access, proves a mismatched RPC is blocked before wallet signing, confirms explicit connect uses the Octez-primary bridge with legacy static-bundle compatibility fenced to the generated runtime, checks from `/tools/macaroni` that the real Kukai option can escape the sandbox and load `https://shadownet.kukai.app` instead of a blank, mainnet, or Temple-only tab, asserts rapid generated-page connect clicks coalesce to one permission request, asserts the permission network object is `{ type: \"shadownet\" }` rather than Shadownet plus a dApp RPC override, asserts the server injects the Octez bridge and hardens Airporters-shaped stored legacy drop HTML before serving it, and keeps source-policy coverage for the 1 GB per-file and 250 MB average Macaroni artifact policy, contract-required wtfOS publishing, per-token edition quantities, delayed-reveal placeholder pools, request-time minter royalty metadata sync, non-image cover preview metadata, the generated mint page's validated non-blocking wallet restore, disconnect, Octez-primary singleton reuse, ACTIVE_ACCOUNT_SET subscription, bounded browser RPC read fallback, share/calendar canonical handles, X URL-weight trimming, calendar file generation, accessible controls/status regions, balance preflight, max-per-wallet option normalization and allowlist remaining allowance clamping, TzKT-owned-mint lookup, Fileship gateway default, and CSS theme allowlist paths.",
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
      "client/src/pages/MacaroniPackager.tsx, client/src/features/creation-tools/CreationToolFrame.tsx, public/creation-tools/*/js/common.js, public/creation-tools/*/js/studio.js, client/src/features/pasta-protocol/pasta-static-policy.test.ts, tests/playwright/inventory/pasta-protocol-publishing.spec.mjs",
    verificationCommand:
      "npx tsx --test client/src/features/pasta-protocol/pasta-static-policy.test.ts client/src/features/creation-tools/creation-tool-presentation-policy.test.ts && HARNESS_PORT=4321 npx playwright test tests/playwright/inventory/pasta-protocol-publishing.spec.mjs --project=chromium --reporter=list",
    userVisibleAssertion:
      "CH-EASE can open a target Pasta publisher with the current package preloaded through a same-origin sessionStorage handoff, the creation-tool iframe preserves the handoff query context, the publisher confirms import with inline status, and Spaghetti can rehearse the Shadownet-safe publish choreography from that imported package.",
    durableSideEffectAssertion:
      "The CH-EASE handoff emits chease.package_handoff_opened; the six Pasta studios expose the shared MD runtime to their module scripts and consume the shared handoff key without mutating server storage before the creator chooses to deploy or export; the focused browser proof records Spaghetti's chain guard, origination, create_token batch, mint batch, pinned collection metadata, pinned token metadata, and spaghetti.collection_deployed / spaghetti.token_published events.",
  },
  {
    id: "pasta-protocol.self-hosted-site-exports",
    domain: "Pasta Protocol",
    ownerSurfaceIds: ["pasta-protocol"],
    ownerSpec:
      "scripts/pasta-protocol/site-kit/*, public/creation-tools/{spaghetti,gnocchi,ravioli,rotini,penne,lasagna}/site.html, public/creation-tools/{spaghetti,gnocchi,ravioli,rotini,penne,lasagna}/js/site*.js, client/src/features/pasta-protocol/colander/ColanderApp.tsx, client/src/features/pasta-protocol/colander/colander-workspace.ts, apps/pasta-suite-desktop/src/main.cjs, apps/pasta-suite-desktop/src/site-archive.cjs, apps/pasta-suite-desktop/scripts/prepare-assets.mjs, tests/playwright/inventory/pasta-protocol-publishing.spec.mjs, tests/playwright/inventory/pasta-suite-desktop-colander.spec.mjs",
    verificationCommand:
      "node scripts/pasta-protocol/sync-site-kit.mjs && npx tsx --test client/src/features/pasta-protocol/colander/colander-workspace.test.ts client/src/features/pasta-protocol/pasta-static-policy.test.ts && npm run build && HARNESS_PORT=4321 npx playwright test tests/playwright/inventory/pasta-protocol-publishing.spec.mjs --project=chromium --reporter=list",
    userVisibleAssertion:
      "Every post-Macaroni Pasta publisher can download a standalone site ZIP: Spaghetti and Rotini expose inventory-backed direct purchase, Gnocchi exposes open-edition mint, Penne exposes claim, Ravioli exposes direct purchase plus redeem/reveal state, and Lasagna resolves the current exhibition revision. Inside Pasta Suite Desktop, the same export also appears in Colander's Self-hosted pages registry and opens from a loopback URL.",
    durableSideEffectAssertion:
      "Each ZIP contains index.html, pasta.config.js, shared site styling/runtime, wallet support, and Tezos dependencies; export emits the app-owned *.site_exported event; a Colander-launched export appends a self_hosted_site artifact to the portable workspace manifest and advances the project to published; and native Colander safely expands the stored ZIP under Documents/Pasta Suite/sites, writes a manifest, and emits pasta_suite.site_installed.",
  },
  {
    id: "pasta-protocol.colander-project-workspace",
    domain: "Pasta Protocol",
    ownerSurfaceIds: ["pasta-protocol"],
    ownerSpec:
      "client/src/features/pasta-protocol/colander/ColanderApp.tsx, client/src/features/pasta-protocol/colander/colander-workspace.ts, public/creation-tools/*/js/common.js, public/creation-tools/*/js/studio.js, tests/playwright/inventory/pasta-protocol-colander-shadownet.spec.mjs",
    verificationCommand:
      "npx tsx --test client/src/features/pasta-protocol/colander/colander-workspace.test.ts client/src/features/pasta-protocol/pasta-static-policy.test.ts && npm run pasta:shadownet:colander",
    userVisibleAssertion:
      "A creator can make a named local project in Colander, choose the outcome-specific Pasta app, reopen the project after reload, export or import its versioned manifest, and launch the owner app with project context without losing direct KT1 contract management.",
    durableSideEffectAssertion:
      "The project persists under wtfos.pasta.colander.workspace.v1; Colander emits project lifecycle and tool-launch events; and each Pasta publisher attaches a newly deployed KT1 to the originating project and advances it to deployed without requiring Objkt, Teia, or a wtfOS database.",
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
    id: "pasta-protocol.wtfme-hosted-pages",
    domain: "Pasta Protocol",
    ownerSurfaceIds: ["pasta-protocol", "wtf-domains", "ipfs-pinning"],
    ownerSpec: "tests/playwright/inventory/pasta-protocol-wtfme-hosting.spec.mjs",
    verificationCommand: "npm run pasta:shadownet:wtfme",
    userVisibleAssertion:
      "A claimed WTF.ME host can serve Pasta Protocol landing, mint, and collection pages that show the Shadownet chain id, current proof KT1 contracts, relationship groups, WTF.ME branding, wallet-connect marker, mint action marker, and Shadownet explorer links under user-site wallet-safe headers.",
    durableSideEffectAssertion:
      "The focused harness publishes home/mint/collection pages through the WTF.ME API, records wtf_site.claimed, wtf_site.page_saved, wtf_site.published, and wtf_site.public.viewed events, and verifies published page versions include the three Pasta slugs before browsing the host.",
  },
  {
    id: "pasta-protocol.pinning-recovery",
    domain: "Pasta Protocol",
    ownerSurfaceIds: ["pasta-protocol", "wtf-domains", "ipfs-pinning"],
    ownerSpec: "server/features/ipfs-pinning/pasta-proof.test.ts, server/features/ipfs-pinning/well-known-policy.test.ts, server/routes/ipfs-pinning-pasta-policy.test.ts, scripts/pasta-protocol/wtfme-live-inventory-policy.test.mjs",
    verificationCommand: "npm run pasta:shadownet:pinning",
    userVisibleAssertion:
      "Pasta publish recovery can expose a public .well-known pin manifest for hosted pages, contract artifacts, token metadata, and relationship metadata only after the user-site PDS binding has a valid repo DID and matching pinManifest AT URI.",
    durableSideEffectAssertion:
      "The focused source proof builds public pinPolicy, pinManifest, and pinItem records for the current Shadownet proof contracts, keeps checksum/object-mirror/IPFS fallback coordinates public and credential-free, validates the recovery drill from .well-known discovery through manifest and item records, verifies the live project-bundle publish route is permission-gated, object-storage-gated, duplicate-safe, and fail-closed while public discovery has no matching manifest URI, and keeps the read-only live inventory response exposing non-secret pin-home readiness plus page/pin prerequisite checks before any publish write.",
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
      "Theme Builder exposes a left-column settings category list, keeps Font controls behind the Font tab, enforces the wtfOS Soft System font pack as the only OS font selection, keeps chat typography presets available for non-font settings, shows the static bottom-right SAVE control as red while the draft differs from profile settings and green after save, and WIM/WTF LIVE composer defaults stay inside their visible color and size windows.",
    durableSideEffectAssertion:
      "DesktopAppearance.fontPackKey, wimChatStyle.fontFamily, and wtfLiveChatStyle.font normalize to wtfOS Soft System defaults on read/write, chatTypographyPresetKey plus non-font chat style values persist through /api/desktop/settings, and canvas helpers read the same CSS variable roles.",
  },
  {
    id: "desktop.localization-language-region",
    domain: "Desktop OS, Navigation, and Personal Environment",
    ownerSurfaceIds: ["system-settings", "desktop-appearance"],
    ownerSpec:
      "shared/localization.test.ts, client/src/lib/localization-catalogs.test.ts, client/src/lib/localization-provider-policy.test.ts, tests/playwright/inventory/system-settings-localization.spec.mjs",
    verificationCommand:
      "npx tsx --test shared/localization.test.ts client/src/lib/localization-catalogs.test.ts client/src/lib/localization-provider-policy.test.ts && npm run build && npx playwright test tests/playwright/inventory/system-settings-localization.spec.mjs",
    userVisibleAssertion:
      "A signed-in user can choose a display language in System Settings, see system-owned OS shell text switch to that locale, and use Arabic or pseudo-locale to prove document direction and expansion behavior.",
    durableSideEffectAssertion:
      "The selected localization writes through /api/desktop/settings, survives reload in the inventory harness, updates document lang/dir/data-wtf-locale, and leaves user-authored media, token, pet, and profile strings outside the exact system text translation map.",
  },
  {
    id: "applications.remote-apphost-window-input-boundary",
    domain: "Desktop OS, Navigation, and Personal Environment",
    ownerSurfaceIds: ["applications"],
    ownerSpec:
      "client/src/pages/applications-policy.test.ts, client/src/pages/applications-presentation-policy.test.ts, client/src/pages/application-session-policy.test.ts, server/websocket-apphost-input-policy.test.ts, server/apphost-rate-limit-policy.test.ts, apphost/tests/test_apphostd.py",
    verificationCommand:
      "npx tsx --test client/src/pages/applications-policy.test.ts client/src/pages/applications-presentation-policy.test.ts client/src/pages/application-session-policy.test.ts server/websocket-apphost-input-policy.test.ts server/apphost-rate-limit-policy.test.ts && python3 -m unittest apphost.tests.test_apphostd",
    userVisibleAssertion:
      "A signed-in user opens Remote Applications into a managed wtfOS play window, sees remote video render before any gesture with the game's native cursor trapped by pointer lock (Esc releases), and can send remote input only after joining the matching apphost session room without gameplay traffic 429ing unrelated API calls.",
    durableSideEffectAssertion:
      "Source and apphost policy tests prove the Applications route uses the window manager instead of browser tabs, apphost WebSocket input rejects pre-join or mismatched app ids, apphost session traffic runs under a dedicated per-user rate limiter exempt from the generic /api/* quota, the session page starts video muted and self-heals zero-frame streams, and normal hosted-app launches require a remembered provider session instead of reusing stored provider passwords.",
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
    id: "gameshow.mint-art-monday-linked-wallet",
    domain: "Gameshow Participation, Progression, and Rewards",
    ownerSurfaceIds: ["mint-portal", "side-quests"],
    ownerSpec: "server/challenges/services/daily-loop-challenges.test.ts",
    verificationCommand: "npx tsx --test server/challenges/services/daily-loop-challenges.test.ts",
    userVisibleAssertion:
      "Every UTC Monday, a signed-in user can complete Mint Art Monday by minting art to a Tezos wallet linked to their wtfOS account.",
    durableSideEffectAssertion:
      "The canonical side quest listens for linked-wallet `blockchain.tezos.token_mint` events from wallet surveillance, requires the `time.utc_weekday` Monday predicate, dedupes by current UTC day, and executes WTF reward actions immediately without a claim step.",
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
      "Anonymous users can open Skywire directly as a public OVOID-style AT Protocol login screen with Handle-or-DID input and a Continue action before any WTF OS login page appears; the dormant Signals publisher is not promoted on this public entry.",
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
    id: "skywire.trending-topics-hot-lane",
    domain: "Community, Social, Messaging, and Discord",
    ownerSurfaceIds: ["skywire"],
    ownerSpec: "server/features/atproto/skywire-policy.test.ts, tests/playwright/inventory/skywire-feed.spec.mjs",
    verificationCommand:
      "npx tsx --test server/features/atproto/skywire-policy.test.ts && npx playwright test tests/playwright/inventory/skywire-feed.spec.mjs -g \"hot topics\"",
    userVisibleAssertion:
      "Skywire has a Hot tab that renders current Bluesky trending topics, marks the selected topic, and opens matching posts in the normal Skywire feed card lane.",
    durableSideEffectAssertion:
      "The server reads `app.bsky.unspecced.getTrendingTopics`, personalizes with the connected viewer DID when available, and falls back to read-only search cards without writing repo records.",
  },
  {
    id: "skywire.live-status-visible-indicator",
    domain: "Community, Social, Messaging, and Discord",
    ownerSurfaceIds: ["skywire"],
    ownerSpec: "tests/playwright/inventory/skywire-feed.spec.mjs",
    verificationCommand:
      "npm run build && npx playwright test tests/playwright/inventory/skywire-feed.spec.mjs -g \"signals UI stays hidden\"",
    userVisibleAssertion:
      "When a live-status record exists, the main Skywire shell shows a WTF LIVE header badge and live banner with an Open WTF LIVE action, while the hidden Signals panel does not expose update controls.",
    durableSideEffectAssertion:
      "The live-status read model still reads `app.bsky.actor.status/self` and displays the live URL, but the user-facing Skywire UI no longer routes into the Signals/live-status editor while Signals is disabled.",
  },
  {
    id: "skywire.signals-hidden-from-navigation",
    domain: "Community, Social, Messaging, and Discord",
    ownerSurfaceIds: ["skywire"],
    ownerSpec: "tests/playwright/inventory/skywire-feed.spec.mjs",
    verificationCommand:
      "npm run build && npx playwright test tests/playwright/inventory/skywire-feed.spec.mjs -g \"signal starter publisher stays hidden\"",
    userVisibleAssertion:
      "Skywire no longer exposes a Signals tab, signal starter presets, signal text fields, or Publish Signal button through visible navigation, public standalone login, quick actions, or direct `/skywire?tab=signals` links.",
    durableSideEffectAssertion:
      "The dormant `/api/skywire/signals` route and `app.wtfgameshow.skywire.signal` record path remain intact for internal integrations, proving the feature was hidden from UX/UI rather than deleted from existence.",
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
    id: "wtf-live.smart-room-owner-controls",
    domain: "Community, Social, Messaging, and Discord",
    ownerSurfaceIds: ["wtf-live"],
    ownerSpec: "tests/playwright/inventory/wtf-live-owner-controls.spec.mjs",
    verificationCommand:
      "npm run build && npx playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs -g \"smart room owner controls\"",
    userVisibleAssertion:
      "A signed-in WTF LIVE owner can search existing WTF users, add them as room hosts/guests or stage hosts/speakers, send role invites, open settings icon controls, choose guest publishing permissions, associate a saved Show Kit, and schedule the room to WTF/TTC calendar targets from owned public rooms, private rooms, and stages.",
    durableSideEffectAssertion:
      "The harness persists /api/wtf-live/users, /show-kits, /rooms/:id/roles, /rooms/:id/invites, /rooms/:id/settings, /rooms/:id/show-kit, and /rooms/:id/events state, verifies saved Show Kits can be selected on a room, and proves the live-room Sharing settings drawer can patch publish permissions through the same settings endpoint.",
  },
  {
    id: "wtf-live.game-room-jackbox-hosting",
    domain: "Community, Social, Messaging, and Discord",
    ownerSurfaceIds: ["wtf-live"],
    ownerSpec: "tests/playwright/inventory/wtf-live-owner-controls.spec.mjs",
    verificationCommand:
      "npm run build && npx playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs -g \"game room\" --project=chromium --reporter=list",
    userVisibleAssertion:
      "A signed-in WTF LIVE owner can create a game room, see it represented as a game room in the room dashboard and public room frame, start Jackbox host apps from owner-only controls inside that room, publish the hosted game stream as the room's shared screen, control the game from the room frame, and keep room mic/camera controls available for players.",
    durableSideEffectAssertion:
      "The API persists room_kind=game, game room settings use the game roomKind bucket, the live-room join envelope returns game capabilities, the room frame starts apphost launch/session/stream-offer/input flows for the selected Jackbox title, and the received apphost MediaStream is attached to WTF LIVE screen sharing rather than opening Applications as a side route.",
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
    id: "wtf-live.stage-room-role-controls",
    domain: "Community, Social, Messaging, and Discord",
    ownerSurfaceIds: ["wtf-live"],
    ownerSpec: "tests/playwright/inventory/wtf-live-owner-controls.spec.mjs",
    verificationCommand:
      "npm run build && npx playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs -g \"stage rooms gate audience sharing\" --project=chromium --reporter=list",
    userVisibleAssertion:
      "A stage owner can open the stage room, edit host and speaker lists in-room, and keep mic/camera/screen/media controls enabled, while an audience guest sees the stage role policy and disabled share controls.",
    durableSideEffectAssertion:
      "The inventory harness serves stage rooms through the WTF LIVE room envelope, persists PATCH /api/wtf-live/stages/:stageId/access role lists, and proves audience clients receive no publish capabilities.",
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
    id: "inbox.compose-reply-send-actions",
    domain: "Community, Social, Messaging, and Discord",
    ownerSurfaceIds: ["mail", "messages", "wim"],
    ownerSpec:
      "client/src/pages/mail-presentation-policy.test.ts; tests/e2e/inventory/domain-workflows.mjs; tests/playwright/inventory/gamma-wtfos.spec.mjs",
    verificationCommand:
      'node --test client/src/pages/mail-presentation-policy.test.ts && npm run test:e2e:inventory:coverage && npx playwright test tests/playwright/inventory/gamma-wtfos.spec.mjs -g "hosts Inbox mailbox" --project=chromium --reporter=list',
    userVisibleAssertion:
      "Inbox exposes explicit New message and New mail controls, selected mail reader Reply/Forward actions, and an inline WIM/Studio conversation reply composer so message cards and conversation tabs are not read-only dead ends.",
    durableSideEffectAssertion:
      "Source policy keeps Inbox sends on /api/mail/send, /api/messages/dms, and /api/messages/dms/:id/messages while the inventory workflow probes both mail send and DM send paths with bounded expected outcomes.",
  },
  {
    id: "desktop-reggie.summon-wim-messages",
    domain: "Desktop OS",
    ownerSurfaceIds: ["desktop-reggie", "wim", "messages", "mail"],
    ownerSpec:
      "client/src/features/reggie/reggie-assistant-policy.test.ts; server/challenges/routes/reggie-policy.test.ts; tests/e2e/inventory/domain-workflows.mjs",
    verificationCommand:
      "node --test client/src/features/reggie/reggie-assistant-policy.test.ts server/challenges/routes/reggie-policy.test.ts && npm run test:e2e:inventory:coverage",
    userVisibleAssertion:
      "The desktop context menu exposes Summon Reggie, Reggie can be hidden or snoozed and later pops back in with a temporary speech bubble, and WIM identifies assistant-authored messages as Reggie messages.",
    durableSideEffectAssertion:
      "Reggie speech posts through /api/reggie/messages, which chooses the authenticated user server-side, writes a Reggie-authored DM conversation/message, tags the message metadata as assistant=reggie/source=reggie-assistant, and indexes the item for WIM/Inbox recovery.",
  },
  {
    id: "desktop.app-store-ranked-unlocks",
    domain: "Desktop OS",
    ownerSurfaceIds: ["wtfiam", "command-palette", "desktop-icons"],
    ownerSpec:
      "shared/wtfos-app-catalog.test.ts; client/src/features/desktop/DesktopIcons.test.tsx; client/src/components/layout/start-menu-app-gates.test.ts; client/src/features/wtfiam/wtfiam-presentation-policy.test.ts; server/routes/in-app-market-app-store-policy.test.ts",
    verificationCommand:
      "npx tsx --test shared/wtfos-app-catalog.test.ts client/src/features/desktop/DesktopIcons.test.tsx client/src/components/layout/start-menu-app-gates.test.ts client/src/features/wtfiam/wtfiam-presentation-policy.test.ts server/routes/in-app-market-app-store-policy.test.ts && npm run test:e2e:inventory:coverage",
    userVisibleAssertion:
      "The default desktop and first Start Apps rail show only ranked core apps; optional and role-gated wtfOS apps appear in WTFIAM's Apps category, locked cards show the missing role/pass/prerequisite on hover or focus, and unlocked apps can be pinned with the existing Start Menu desktop shortcut action.",
    durableSideEffectAssertion:
      "The shared app catalog covers every DesktopAppKey, `/api/in-app-market?category=apps` serializes app-unlock SKUs from that catalog, checkout intents reject missing prerequisites before payment, and `/api/apps/desktop` personalizes app availability from owned app-unlock inventory.",
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
      "The live harness opens the FAFOlab/skllzrmy route family, including TezosBeats, Tusk/Mastodon, Porcupin, MindWalk, PixelPatterns, PenRose, Contract Factory with its Shadownet-first network default, and Mint Portal surfaces.",
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
