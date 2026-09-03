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
    id: "public.versioned-api-openapi-mcp-parity",
    domain: "Public Data, Embeds, APIs, Agents, and Automation",
    platformOwner: "public-platform-api",
    ownerSpec: "server/lib/public-api.test.ts; server/lib/wtf-mcp.test.ts; client/src/features/agent/agent-model.test.ts",
    verificationCommand:
      "npx tsx --test client/src/features/agent/agent-model.test.ts server/lib/public-api.test.ts server/lib/wtf-mcp.test.ts",
    userVisibleAssertion:
      "API developers can discover `/api/v1`, download a valid OpenAPI 3.1 contract, browse grouped human documentation, authenticate with a paired bearer token, and use friendly current-user/token aliases while existing `/api/*` browser and internal calls remain unchanged.",
    durableSideEffectAssertion:
      "Source-derived route generation proves every existing API method/path is represented by an unambiguous canonical OpenAPI operation with explicit scopes, roles, and success content; bearer middleware enforces read/write/admin scopes, account role, ownership, and app gates before dispatching to the established handlers; MCP agents can search allowed operations, inspect one contract, call it by stable operationId, or use the backward-compatible `wtf_api_request` bridge without removing any existing workflow tool.",
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
    id: "auth.classic-first-run-task-wayfinder",
    domain: "Entry, Authentication, and Account Identity",
    platformOwner: "auth-session",
    ownerSpec:
      "client/src/features/onboarding/classic-task-wayfinder.test.ts; client/src/components/layout/start-menu-app-gates.test.ts; tests/playwright/inventory/auth-session.spec.mjs",
    verificationCommand:
      "npm run build && npx tsx --test client/src/features/onboarding/classic-task-wayfinder.test.ts client/src/components/layout/start-menu-app-gates.test.ts && npx playwright test tests/playwright/inventory/auth-session.spec.mjs",
    userVisibleAssertion:
      "The classic OS welcome, Start menu, and Help & Start Here page all lead with the same plain-language Play, Create, Shop, Events, and Talk choices, keep their icon/label/description text contained at desktop and mobile widths, and route each choice to its commissioned application.",
    durableSideEffectAssertion:
      "The shared wayfinder regression locks the five route mappings; the browser harness proves the welcome controls retain their intended height, completes and persists the one-time welcome before opening the chosen destination, verifies stale-session recovery, and confirms the mobile public help route exposes the same task map as full-width, non-overlapping controls.",
  },
  {
    id: "auth.faq-registration-tutorials",
    domain: "Entry, Authentication, and Account Identity",
    platformOwner: "faq",
    ownerSpec: "server/lib/faq-tutorials.test.ts; tests/playwright/inventory/faq-tutorials.spec.mjs",
    verificationCommand:
      "npx tsx --test server/lib/faq-tutorials.test.ts && npm run build && npx playwright test tests/playwright/inventory/faq-tutorials.spec.mjs",
    userVisibleAssertion:
      "The public FAQ previews short, captioned how-to videos for the full registration journey, and every tutorial visibly uses the TommyTezos account.",
    durableSideEffectAssertion:
      "The checked-in catalog binds each tutorial to private S3 object keys while the public API exposes only same-origin streaming routes; the browser harness proves all eight guides, English captions, transcripts, selection behavior, and mobile containment.",
  },
  {
    id: "wtfos.guide-promo-channel",
    domain: "WTF TV, Playback, Channels, and Embeds",
    platformOwner: "faq-tv",
    ownerSpec:
      "server/lib/wtfos-promos.test.ts; server/lib/wtfos-guide-tv.test.ts; server/lib/tv-boot-backfill-guide-channel-policy.test.ts; tests/playwright/inventory/faq-tutorials.spec.mjs; tests/playwright/inventory/wtfos-guide-tv.spec.mjs",
    verificationCommand:
      "npx tsx --test server/lib/wtfos-promos.test.ts server/lib/wtfos-guide-tv.test.ts server/lib/tv-boot-backfill-guide-channel-policy.test.ts && npm run build && npx playwright test tests/playwright/inventory/faq-tutorials.spec.mjs tests/playwright/inventory/wtfos-guide-tv.spec.mjs",
    userVisibleAssertion:
      "The public FAQ previews captioned wtfOS promos for Play, Create, Shop, Events, and Talk, while wtfOS Guide TV provides one dedicated channel containing those promos and the TommyTezos FAQ how-tos only.",
    durableSideEffectAssertion:
      "The checked-in catalogs expose only same-origin object-storage routes; boot reconciliation removes unrelated guide-channel videos, playlists, schedules, and bumpers; server and browser regressions prove the exact combined queue, TommyTezos attribution, promo selection, captions, and mobile containment.",
  },
  {
    id: "wtfiam.creator-store-moderation-purchase",
    domain: "Market, Exchange, Inventory, and Commerce",
    ownerSurfaceIds: ["wtfiam"],
    ownerSpec:
      "server/features/in-app-market/creator-items-policy.test.ts; tests/playwright/inventory/wtfiam-creator-store.spec.mjs",
    verificationCommand:
      "npx tsx --test server/features/in-app-market/creator-items-policy.test.ts && npm run build && npx playwright test tests/playwright/inventory/wtfiam-creator-store.spec.mjs",
    userVisibleAssertion:
      "A trusted creator can submit an item from the Store, see its review status and operator note, and only after operator approval can a shopper find and purchase the attributed item.",
    durableSideEffectAssertion:
      "Creator attribution and submitted status are persisted on a hidden market row; operator review records approver, timestamp, status, and note while controlling visibility; the browser harness proves the approved item enters checkout and the EXP purchase grants owned inventory with normalized create, review, intent, and completion events.",
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
    id: "calendar.tray-reminders-cross-app-handoffs",
    domain: "Gameshow Participation, Progression, and Rewards",
    ownerSurfaceIds: ["calendar", "wtf-live", "wim", "messageboard"],
    ownerSpec: "client/src/pages/calendar-presentation-policy.test.ts; client/src/features/calendar/calendar-reminders.test.ts",
    verificationCommand:
      "npx tsx --test client/src/features/calendar/calendar-reminders.test.ts client/src/pages/calendar-presentation-policy.test.ts",
    userVisibleAssertion:
      "Calendar is visible as a desktop and permanent task-tray app, shows at most one reminder popup above its tray icon, replaces an older unviewed threshold for the same event, opens the Calendar when activated, and accepts prefilled event context from WTF LIVE rooms, WIM, and Message Board.",
    durableSideEffectAssertion:
      "The focused model proves day, six-hour, one-hour, start-time, and all-day login thresholds; viewed threshold ids persist per user in localStorage so subsequent thresholds remain eligible; cross-app handoffs use one narrow session record or explicit URL fields, and personal events persist in the existing per-user Calendar store.",
  },
  {
    id: "calendar.ttc-source-parity-and-event-details",
    domain: "Gameshow Participation, Progression, and Rewards",
    ownerSurfaceIds: ["calendar"],
    ownerSpec:
      "server/lib/ttc-calendar.test.ts; tests/playwright/inventory/gamma-wtfos.spec.mjs",
    verificationCommand:
      "npx tsx --test server/lib/ttc-calendar.test.ts && npm run build && HARNESS_PORT=4360 npx playwright test tests/playwright/inventory/gamma-wtfos.spec.mjs -g \"hosts Calendar events\" --project=chromium --reporter=list",
    userVisibleAssertion:
      "Calendar restores TTC occurrences earlier than the public iCal feed's rolling next-occurrence anchor, and every Day, Week, Month, or Agenda event card opens details that identify who created it and link directly to the original TTC listing when applicable.",
    durableSideEffectAssertion:
      "The focused adapter tests prove backward recurrence restoration, TTC WordPress creator enrichment, email-shaped creator-name redaction, and canonical source URLs; browser coverage proves TTC creator and source provenance are visible from an activated event without changing calendar state.",
  },
  {
    id: "calendar.account-participation-and-chosen-reminders",
    domain: "Gameshow Participation, Progression, and Rewards",
    ownerSurfaceIds: ["calendar"],
    ownerSpec:
      "tests/playwright/inventory/calendar-participation.spec.mjs; tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand:
      "npm run build && npx playwright test tests/playwright/inventory/calendar-participation.spec.mjs --project=chromium --reporter=list && WTF_E2E_ACTOR_FILTER=admin,contestant npx playwright test tests/playwright/live/puppet-orchestration.spec.mjs -g \"Calendar participation\" --project=chromium --reporter=list",
    userVisibleAssertion:
      "A signed-in member can open a WTF or TTC event, choose Interested or Going, explicitly toggle its task-tray reminder, find the saved choice in My plans after reload, follow the event link, and clear the plan.",
    durableSideEffectAssertion:
      "One user/event participation row is upserted with an account-backed status and reminder preference; tray reminders load only reminder-enabled plans plus explicitly created personal entries; clear removes the row; normalized update and clear events retain the event reference and choice without creating attendance or reward claims.",
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
    id: "profile.pfp-preview-gateway-fallback",
    domain: "Entry, Authentication, and Account Identity",
    ownerSurfaceIds: ["profile"],
    ownerSpec:
      "shared/ipfs-gateways.test.ts; client/src/lib/media-resolve.test.ts; client/src/pages/profile-pfp-preview-policy.test.ts; server/app-csp-policy.test.ts; server/features/tv/media-urls.test.ts; server/lib/thumbnail-url.test.ts; tests/playwright/inventory/gamma-wtfos.spec.mjs",
    verificationCommand:
      "node --import tsx --test shared/ipfs-gateways.test.ts client/src/lib/media-resolve.test.ts client/src/pages/profile-pfp-preview-policy.test.ts server/app-csp-policy.test.ts server/features/tv/media-urls.test.ts server/lib/thumbnail-url.test.ts && npm run build && HARNESS_PORT=4360 npx playwright test tests/playwright/inventory/gamma-wtfos.spec.mjs -g \"Profile identity\" --project=chromium --reporter=list",
    userVisibleAssertion:
      "The profile-picture picker and editor load token art through the same-origin media cache using FileShip's canonical gateway first, then recover through CSP-permitted ordered alternate IPFS gateways when the cache or FileShip request fails.",
    durableSideEffectAssertion:
      "Shared gateway, CSP, and media-cache tests lock FileShip-first canonical URL parsing, derive every allowed content origin from the alternate candidate list, and reject executable inline shell bootstraps; the focused browser story forces cache and FileShip failures, observes an alternate preview in the picker, and proves that the editor canvas receives image pixels through the same fallback chain.",
  },
  {
    id: "auth.wallet-challenge-login",
    domain: "Wallets, Tokens, Portfolio, and On-Chain State",
    ownerSurfaceIds: ["profile"],
    ownerSpec:
      "server/auth/wallet-proof-binding-policy.test.ts; tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand:
      "npx tsx --test server/auth/wallet-proof-binding-policy.test.ts && npm run test:e2e:live:puppets",
    userVisibleAssertion:
      "Each puppet wallet can read and complete a wallet-login challenge that names the WTF OS origin, sign-in action, exact wallet, expiry, and one-time nonce.",
    durableSideEffectAssertion:
      "The server proves that the submitted public key derives the challenged wallet, atomically consumes a nonce scoped to the same origin and action, verifies the exact bound message, and returns the matching linked user; a proof for another wallet, action, origin, expiry, or nonce cannot be replayed.",
  },
  {
    id: "auth.wallet-provider-login-lifecycle",
    domain: "Wallets, Tokens, Portfolio, and On-Chain State",
    ownerSurfaceIds: ["profile"],
    ownerSpec:
      "client/src/lib/tezos/wallet-connect-policy.test.ts, client/src/lib/tezos/wallet-shadownet-preflight-policy.test.ts",
    verificationCommand:
      "npx tsx --test client/src/lib/tezos/wallet-connect-policy.test.ts client/src/lib/tezos/wallet-shadownet-preflight-policy.test.ts",
    userVisibleAssertion:
      "The login wallet button starts from fresh Beacon/WalletConnect auth state, opens Octez Connect as the primary Tezos provider on mainnet, ignores Shadownet app-local preferences for auth identity, and either completes provider permission or shows a bounded retryable error instead of staying on Connecting forever.",
    durableSideEffectAssertion:
      "Policy coverage keeps ACTIVE_ACCOUNT_SET subscribed before permission requests, keeps Octez Connect v5 as the wallet transport with a custom Taquito operation provider, makes mobile/QR WalletConnect opt in through the deployment-owned VITE_WALLETCONNECT_PROJECT_ID while preserving extension/web transports when it is absent, clears legacy wallet IndexedDB/localStorage for forced auth reconnects, forces auth challenge signing through the mainnet wallet lane, and keeps Octez-hosted app RPC defaults ahead of TzKT indexer fallbacks.",
  },
  {
    id: "wallet.checkout-intent-bound-to-signed-session",
    domain: "Wallets, Tokens, Portfolio, and On-Chain State",
    ownerSurfaceIds: ["wtfiam"],
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
    ownerSurfaceIds: ["profile"],
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
    id: "pixalerce.media-export-and-mint-manager",
    domain: "Media, Creation, Gallery, and Preservation",
    ownerSurfaceIds: ["creation-tools"],
    ownerSpec: "tests/playwright/inventory/pixalerce.spec.mjs",
    verificationCommand:
      "npx playwright test tests/playwright/inventory/pixalerce.spec.mjs --project=chromium --reporter=list",
    userVisibleAssertion:
      "PixAlerce opens from `/tools/pixalerce` inside the wtfOS creation-tool shell, creates and edits a blank 3D pixel canvas with every top-level tool, uses stamps and motion, opens and closes the FX library and inspector without overlap, previews full screen, exports PNG, GIF, MP4, WebM, and OBJKT ZIP artifacts, and exposes explicit wtfOS Media, device-download, and Media + Mint Manager destinations.",
    durableSideEffectAssertion:
      "One soft-failure browser journey validates the downloaded PNG pixels, GIF/MP4/WebM signatures, and self-contained OBJKT package; saves generated bytes through the owned wtfOS Media upload API; opens Mint Manager without signing; proves the saved upload exposes the same manager from My Photos and File Manager; exercises HEN metadata plus new Pasta contract/network destination choices; then saves through localForage/IndexedDB, reloads, and verifies the named project survives while all PixAlerce assets remain under `/creation-tools/pixalerce/`. The separate durable-receipt story clears browser-local workflow state and proves the same owned media recovers its server-backed Shadownet operation, signing wallet, contract, token, and TzKT link on another session.",
  },
  {
    id: "media.mint-manager-durable-receipt",
    domain: "Wallets, Tokens, Portfolio, and On-Chain State",
    ownerSurfaceIds: ["file-manager", "creation-tools"],
    ownerSpec: "tests/playwright/inventory/mint-manager-durable-receipt.spec.mjs",
    verificationCommand:
      "npx playwright test tests/playwright/inventory/mint-manager-durable-receipt.spec.mjs --project=chromium --reporter=list",
    userVisibleAssertion:
      "Opening Mint Manager from owned media automatically shows a previously verified receipt with the explicit Tezos network, operation, signing wallet, contract, token, indexer status, and safe explorer links; a delayed indexer asks the artist to check again without signing twice.",
    durableSideEffectAssertion:
      "The receipt is account-backed and media-owned rather than trusted from localStorage. The browser proof erases all local Mint Manager workflow keys, opens a fresh page session, and recovers the same Shadownet receipt from `/api/mint-manager/receipts/:mediaItemId`.",
  },
  {
    id: "creation.outcome-led-runway",
    domain: "Media, Creation, Gallery, and Preservation",
    ownerSurfaceIds: ["creation-tools"],
    ownerSpec: "tests/playwright/inventory/create-runway.spec.mjs",
    verificationCommand:
      "npx playwright test tests/playwright/inventory/create-runway.spec.mjs --project=chromium --reporter=list",
    userVisibleAssertion:
      "Classic Create opens `/create` with image, animation, 3D, and game outcomes first, followed by continue, preserve/export, general mint/publish, and challenge-minting choices. All sixteen specialist tools state what they make and at least one real export destination before launch.",
    durableSideEffectAssertion:
      "The runway is generated from the canonical typed creation-tool registry, and its browser story opens both an image tool and an on-chain publisher through their canonical routes without duplicating or hiding any registered tool.",
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
    id: "macaroni.v3-commitment-reveal",
    domain: "Media, Creation, Gallery, and Preservation",
    ownerSurfaceIds: ["creation-tools", "pasta-protocol"],
    ownerSpec:
      "contracts/wtf-collections/MacaroniBlindMintFA2V3.py, public/creation-tools/macaroni/{studio.html,js/studio.js,js/drop.js,contract/macaroni-v3.contract.json}, server/features/macaroni/{reveal-auth.ts,reveal-auth.test.ts,reveal-automation.ts}, server/routes/{macaroni.ts,macaroni-policy.test.ts}, shared/{schema-macaroni.ts,pasta-protocol/adapters.ts,pasta-protocol/foundation.test.ts}, tests/playwright/inventory/cobwebsaints-account.spec.mjs",
    verificationCommand:
      "npm run contract:macaroni-v3:compile && npx tsx --test server/features/macaroni/reveal-auth.test.ts server/routes/macaroni-policy.test.ts shared/pasta-protocol/foundation.test.ts && npx playwright test tests/playwright/inventory/cobwebsaints-account.spec.mjs",
    userVisibleAssertion:
      "A creator can select Macaroni V3, keep each final token metadata CID plus private nonce in the local Studio project, permanently finalize token rows, quantities, commitments, and deterministic creator-defined order before opening a sale stage, and reveal a token only after its full edition supply is allocated; collector pages disclose that V3 is sealed rather than provably random, cannot choose metadata or submit reveal secrets, and Colander recognizes the contract as Macaroni-owned.",
    durableSideEffectAssertion:
      "The compiled V3 contract rejects stages and mints before inventory finalization, permanently rejects token additions and commitment replacement afterward, allocates without block level/timestamp/sender entropy, rejects reveal until the token's complete edition supply is allocated, and still rejects unauthorized, early delayed, wrong-CID, wrong-nonce, and repeated reveals; Studio finalizes before stages, refuses older mutable V3 contracts, signs the network/contract/administrator-bound registration challenge, and collector/exported pages disclose deterministic creator-defined order without a randomness claim or final metadata leakage.",
  },
  {
    id: "macaroni.shadownet-rpc-wallet-setup",
    domain: "Media, Creation, Gallery, and Preservation",
    ownerSurfaceIds: ["creation-tools", "wtf-domains"],
    ownerSpec: "tests/playwright/live/macaroni-shadownet.spec.mjs",
    verificationCommand: "npm run test:e2e:macaroni:shadownet",
    userVisibleAssertion:
      "A trusted-creator puppet can open Macaroni, enter the Studio through the embedded creation-tool iframe, see Shadownet as the default rehearsal network, choose Macaroni V1 or V2 contract templates, see the wtfOS IPFS provider, see Fileship as the default IPFS gateway, see the 1 GB per-artifact hard max, 250 MB average artifact limit, and 1 MB square JPG/PNG collection logo/cover limit, define per-token edition quantity, configure optional minter royalty pool/split/updater policy, attach multiple unrevealed placeholder images for delayed reveal, connect a Shadownet puppet wallet without RPC errors, use Octez Connect as the primary wallet provider with legacy Taquito compatibility scoped to generated static bundles, route selected Kukai pairing to the Shadownet Kukai app, send named wallet permission networks without embedding the dApp RPC URL, serve stored legacy wtfOS-hosted Macaroni drop pages with Octez-primary bridge injection plus the same named-network wallet hardening, and block wtfOS publish until the drop has a deployed or resumed KT1 contract; a regular signed-in puppet loading the static Studio does not see the wtfOS IPFS provider but does see a greyed, disabled wtfOS publish control whose mouse-hover and keyboard-focus tooltip explains the Trusted Market Creator requirement and directs them to the Contact Admin app; generated mint pages expose clean disconnect, prevent duplicate request-permission flows from rapid connect clicks, reuse/reconfigure the same Octez-primary client with active-account subscription before permission APIs, include basic accessibility landmarks/status/progress/quantity semantics, normalize live max_per_wallet storage before showing share/status copy, keep X share compose text within the standard post limit while preserving mint/media URLs where possible, expose prefilled ICS and Google Calendar links for sale stages, clamp requested mint quantity to live collection remaining supply plus the connected wallet's remaining per-wallet/allowlist allowance, show wallet balance/cost status, max-per-wallet status, minter royalty sync status, owned-mint recovery hooks, RPC pack/estimate fallback handling, and bounded theme styling instead of arbitrary stored CSS.",
    durableSideEffectAssertion:
      "The focused runner seeds dummy users and Shadownet puppet wallet metadata, verifies the live Shadownet RPC chain id `NetXsqzbfFenSTS` in the Macaroni iframe, proves the contract-version selector exposes V1 and V2 template choices, proves the IPFS provider selector follows `trusted_market_creator` access, proves the hosted publisher is enabled without a permission tooltip for a trusted creator and remains genuinely disabled with hover/focus recovery guidance for a regular account, proves a mismatched RPC is blocked before wallet signing, confirms explicit connect uses the Octez-primary bridge with legacy static-bundle compatibility fenced to the generated runtime, verifies all seven Pasta creation tools ship the same Octez Connect v5 bundle and only attach WalletConnect mobile/QR options from the deployment-owned project ID, checks from `/tools/macaroni` that the real Kukai option can escape the sandbox and load `https://shadownet.kukai.app` instead of a blank, mainnet, or Temple-only tab, asserts rapid generated-page connect clicks coalesce to one permission request, asserts the permission network object is `{ type: \"shadownet\" }` rather than Shadownet plus a dApp RPC override, asserts the server injects the Octez bridge and hardens Airporters-shaped stored legacy drop HTML before serving it, and keeps source-policy coverage for the 1 GB per-file and 250 MB average Macaroni artifact policy, contract-required wtfOS publishing, per-token edition quantities, delayed-reveal placeholder pools, request-time minter royalty metadata sync, non-image cover preview metadata, the generated mint page's validated non-blocking wallet restore, disconnect, Octez-primary singleton reuse, ACTIVE_ACCOUNT_SET subscription, bounded browser RPC read fallback, share/calendar canonical handles, X URL-weight trimming, calendar file generation, accessible controls/status regions, balance preflight, max-per-wallet option normalization and allowlist remaining allowance clamping, TzKT-owned-mint lookup, Fileship gateway default, and CSS theme allowlist paths.",
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
      "The CH-EASE handoff emits chease.package_handoff_opened; Colander project identity survives CH-EASE and the next publisher handoff; the six newer Pasta studios expose the shared MD runtime to their module scripts and consume the shared handoff key without mutating server storage before the creator chooses to deploy or export; the focused browser proof records Spaghetti's chain guard, origination, create_token batch, mint batch, pinned collection metadata, pinned token metadata, and spaghetti.collection_deployed / spaghetti.token_published events.",
  },
  {
    id: "pasta-protocol.studio-draft-recovery",
    domain: "Pasta Protocol",
    ownerSurfaceIds: ["pasta-protocol"],
    ownerSpec:
      "scripts/pasta-protocol/studio-kit/studio-draft.js, public/creation-tools/{spaghetti,gnocchi,ravioli,rotini,penne,lasagna}/js/studio*.js, client/src/features/pasta-protocol/colander/ColanderApp.tsx, client/src/features/pasta-protocol/colander/colander-workspace.ts, client/src/features/pasta-protocol/pasta-static-policy.test.ts, tests/playwright/inventory/pasta-protocol-publishing.spec.mjs",
    verificationCommand:
      "node scripts/pasta-protocol/sync-site-kit.mjs && npx tsx --test client/src/features/pasta-protocol/colander/colander-workspace.test.ts client/src/features/pasta-protocol/pasta-static-policy.test.ts && npm run build && HARNESS_PORT=4321 npx playwright test tests/playwright/inventory/pasta-protocol-publishing.spec.mjs --project=chromium --grep \"recover drafts\" --reporter=list",
    userVisibleAssertion:
      "Spaghetti, Gnocchi, Ravioli, Rotini, Penne, and Lasagna visibly autosave unfinished work, restore fixed and app-specific dynamic fields after reload, export/import a portable Pasta draft backup, warn that local files must be reselected, and report resumable work inside the originating Colander project.",
    durableSideEffectAssertion:
      "Each draft uses pasta-studio-draft@1 under a project-scoped wtfos.pasta.studio.draft.v1 key; passwords and local file bytes are excluded; Colander stores only a recovery reference in the portable project manifest; stale mounted studios cannot write another app's project because handoff kind must match the studio owner; and the browser proof observes save/export/import/clear events plus six-app reload recovery.",
  },
  {
    id: "pasta-protocol.gnocchi-multi-edition-collection",
    domain: "Pasta Protocol",
    ownerSurfaceIds: ["pasta-protocol"],
    ownerSpec:
      "contracts/pasta-protocol/PastaOpenEditionFA2.py, public/creation-tools/gnocchi/index.html, public/creation-tools/gnocchi/js/studio.js, scripts/pasta-protocol/shadownet-gnocchi-e2e.ts, scripts/pasta-protocol/shadownet-gnocchi-ui-live.ts, scripts/pasta-protocol/shadownet-gnocchi-ui-live.test.ts, scripts/pasta-protocol/shadownet-gnocchi-current-recovery.ts, scripts/pasta-protocol/shadownet-gnocchi-current-recovery.test.ts, scripts/pasta-protocol/shadownet-gnocchi-readonly-finalizer.ts, scripts/pasta-protocol/shadownet-gnocchi-readonly-finalizer.test.ts, client/src/features/pasta-protocol/pasta-static-policy.test.ts, tests/playwright/inventory/pasta-protocol-publishing.spec.mjs",
    verificationCommand:
      "node scripts/pasta-protocol/compile-fa2-template.mjs contracts/pasta-protocol/PastaOpenEditionFA2.py pasta-open-edition gnocchi && npm run pasta:shadownet:gnocchi:ui-live:check && npm run pasta:shadownet:gnocchi:current-recovery:check && npm run pasta:shadownet:gnocchi:readonly-finalize:check && npx tsx --test client/src/features/pasta-protocol/pasta-static-policy.test.ts && npm run build && HARNESS_PORT=4391 npx playwright test tests/playwright/inventory/pasta-protocol-publishing.spec.mjs --project=chromium --grep 'Gnocchi publishes timed' --reporter=list",
    userVisibleAssertion:
      "A Gnocchi creator can create one collection, publish a Timed OE as token 0, verify and reuse that KT1 for a Forever OE as token 1 and Limited Edition as token 2, then list and manage all three independent policies without manually calling a contract or originating helper contracts.",
    durableSideEffectAssertion:
      "The SmartPy contract stores per-token policy locks and lifetime minted totals, counts creator reserves inside caps, prevents locked start/end/cap changes, enforces locked windows for public and delegated minting, and does not reopen cap or curve capacity after burns; the browser proof confirms one origination followed by three create_open_edition calls and renders all three token policies from confirmed collection storage. A post-confirmation storage refresh retries only declared read-only reads, never a write-like action; the exact recovered proof binds three prefix plus nine continuation operations, zero replay, 46 hash-linked events, 19 screenshots, two no-write rejections, and the UI-LIVE-RECOVERED-CHECKPOINTED final classification.",
  },
  {
    id: "pasta-protocol.ravioli-limited-edition-expiry-deconfliction",
    domain: "Pasta Protocol",
    ownerSurfaceIds: ["pasta-protocol"],
    ownerSpec:
      "contracts/pasta-protocol/{PastaPackRouterFA2,PastaBlindPackController,PastaGnocchiPackAdapter,PastaRotiniPackAdapter,PastaOpenEditionFA2}.py, public/creation-tools/{gnocchi,ravioli}/contract/*.contract.json, public/creation-tools/ravioli/contract/pasta-ravioli-deployment-certificate.json, public/creation-tools/ravioli/index.html, public/creation-tools/ravioli/css/theme.css, public/creation-tools/ravioli/js/studio.js, scripts/pasta-protocol/{generate-ravioli-deployment-certificate,check-smartpy-origination-size}.mjs, scripts/pasta-protocol/pasta-michelson-script-identity.ts, scripts/pasta-protocol/pasta-michelson-script-identity.test.ts, scripts/test-pasta-ravioli-contracts.sh, scripts/pasta-protocol/site-kit/site.js, public/creation-tools/{spaghetti,gnocchi,ravioli,rotini,penne,lasagna}/js/site.js, client/src/features/pasta-protocol/pasta-static-policy.test.ts, scripts/pasta-protocol/pasta-ui-live-bridge-kit.ts, scripts/pasta-protocol/pasta-ui-live-bridge-kit.test.ts, scripts/pasta-protocol/shadownet-ravioli-fresh-dependencies.ts, scripts/pasta-protocol/shadownet-ravioli-fresh-dependencies.test.ts, scripts/pasta-protocol/shadownet-ravioli-ui-live-journal.ts, scripts/pasta-protocol/shadownet-ravioli-ui-live-journal.test.ts, scripts/pasta-protocol/shadownet-ravioli-current-v2-resume.ts, scripts/pasta-protocol/shadownet-ravioli-current-v2-resume.test.ts, scripts/pasta-protocol/shadownet-ravioli-current-v4-resume.ts, scripts/pasta-protocol/shadownet-ravioli-current-v4-resume.test.ts, scripts/pasta-protocol/shadownet-ravioli-private-recovery.ts, scripts/pasta-protocol/shadownet-ravioli-private-recovery.test.ts, scripts/pasta-protocol/shadownet-ravioli-blind-proof-verifier.ts, scripts/pasta-protocol/shadownet-ravioli-blind-proof-verifier.test.ts, scripts/pasta-protocol/shadownet-ravioli-mode0-mutation-replay.test.ts, scripts/pasta-protocol/shadownet-ravioli-ui-live.ts, scripts/pasta-protocol/shadownet-ravioli-ui-live.test.ts, scripts/pasta-protocol/shadownet-ravioli-deadline-reveal.ts, scripts/pasta-protocol/shadownet-ravioli-deadline-settlement.ts, scripts/pasta-protocol/shadownet-ravioli-deadline-recovery.test.ts, scripts/pasta-protocol/assemble-proof-package.mjs, scripts/pasta-protocol/assemble-proof-package.test.mjs, tests/pasta_ravioli_contracts_test.py, tests/playwright/inventory/pasta-protocol-publishing.spec.mjs",
    verificationCommand:
      "npm run contract:test:pasta-ravioli && npx tsx --test client/src/features/pasta-protocol/pasta-static-policy.test.ts scripts/pasta-protocol/shadownet-ravioli-fresh-dependencies.test.ts scripts/pasta-protocol/shadownet-ravioli-current-v2-resume.test.ts scripts/pasta-protocol/shadownet-ravioli-current-v4-resume.test.ts scripts/pasta-protocol/shadownet-ravioli-private-recovery.test.ts scripts/pasta-protocol/shadownet-ravioli-blind-proof-verifier.test.ts scripts/pasta-protocol/shadownet-ravioli-mode0-mutation-replay.test.ts scripts/pasta-protocol/shadownet-ravioli-deadline-recovery.test.ts scripts/pasta-protocol/shadownet-ravioli-ui-live-journal.test.ts scripts/pasta-protocol/shadownet-ravioli-ui-live.test.ts && node --test scripts/pasta-protocol/assemble-proof-package.test.mjs && npm run test:e2e:inventory:coverage && npm run build && HARNESS_PORT=4321 npx playwright test tests/playwright/inventory/pasta-protocol-publishing.spec.mjs --project=chromium --grep 'exported buy, mint, claim, atomic-pack' --reporter=list",
    userVisibleAssertion:
      "A reserved unminted Gnocchi child whose actual on-chain policy is active, locked, capped, and timed can enter Ravioli only when the complete blind wrapper supply is a finite Limited Edition sale whose end precedes reveal and whose reveal is no later than that child; Timed OE, capped-untimed, and true Forever OE allocations remain valid after exact capacity is reserved. The Studio explains sale end < reveal deadline < open/refund cutoff, and the standalone holder page reads the bound controller, decrypts the authenticated reveal without wtfOS, remains awaiting-reveal before publication, opens only inside the delivery window, and becomes refund-only after the applicable cutoff without fetching reveal ciphertext. During an active sale, eligible holders can Buy or Open independently; sale load and purchase do not fetch reveal content, and rapid duplicate clicks cannot start a second signer request. The live proof retries only bounded read-only buyer-page initialization before wallet connection and refuses a timed purchase unless the on-chain sale retains the full readiness budget plus a safety margin; failed initialization closes its browser. Any caller may credit expiry to the current holder; after the reveal deadline, any connected caller may close a fully refunded unrevealed pack only when no claims or escrow remain. Closure zeroes wrapper supply and unclaimed inventory while preserving holder withdrawal credits, and a rejected withdrawal leaves the credit intact. Only after cancellation, the connected administrator can use the creator-facing Recover reserved child capacity controls to name the official adapter, adapter kind, resource id, and exact capacity; active-pack, unofficial-adapter, and over-capacity requests fail before signing, while success reports the verified remaining allowance and reservation. An already-expired settlement is explicitly recorded as BLOCKED_BEFORE_WRITE and stops before signer loading, counter reads, browser setup, or holder-operation preparation. Expired or dishonest policy input, tampered ciphertext, a wrong salt, unsafe terminal cancellation disagreement, resumed look-alike or legacy router/controller pairs fail closed. Crossed recovery commands remain retired and partial live boundaries are identified as audit evidence rather than successful products. After an atomic open the page shows every delivered escrowed, allocated, or generated child with metadata/artwork and TzKT links; interrupted publishing or reveal retains a downloadable private recovery journal and refuses blind retry or unsafe dismissal.",
    durableSideEffectAssertion:
      "The typed Gnocchi adapter forwards the router's immutable child and wrapper constraints to reserve_mint_capacity, where Gnocchi validates its locked policy and reserves exact capacity. The split router/controller `finalize_blind_pack` path atomically finalizes recipes, issues and lists the complete wrapper supply, registers the reveal/open deadlines and payment escrow, and prevents separate blind issuance paths; already reserved child delivery remains valid after a public child window closes. Before a fresh pair can pin or originate, Studio verifies the generated certificate's exact router, blind-controller, Gnocchi-adapter, and Rotini-adapter artifact/source digests, compiler record, exact match to the connected RPC head protocol, metadata URI bound, exact signed sizes, arithmetic, and at least 1 KiB headroom; a stale certificate regression proves zero pins, signatures, or originations. Fresh dependency admission accepts a checkpointed Gnocchi classification only when the interruption code, deterministic checkpoint identity, 46-record hash chain, two pin hashes, three-operation prefix, nine-operation continuation, zero replay, content provenance, and manifest/reconciliation hashes all match; relabeling it as a historical finalization fails closed. The holder runtime latches one primary or secondary action before any await, disables both signer controls, and restores only a freshly recomputed safe state after failure or confirmation. The Studio persists recipe nonces and the encrypted reveal preimage before commitment; its bounded canonical recovery encoder records each full signer intent before send. Fresh live execution requires a disjoint mode-0700 private directory and externalizes the complete blind precommit before its first signer PREPARED boundary, then captures again on handled browser failure without placing private bytes or paths in public evidence. The crossed current-v4 resume and preflight commands fail with CURRENT_V4_RECOVERY_RETIRED before ordinary execution, filesystem, or network work; the frozen 61-event/15-pin/15-operation boundary remains partial audit evidence and cannot be replayed. A bounded read-only readiness policy reloads before wallet connection, pinning, or signing, disposes its monitor and browser on terminal failure, and a twice-applied remaining-window guard plus deadline-derived chain wait prevents an expiring sale from entering a signer flow. Deadline-first reveal reconciliation accepts exactly one applied TzKT root row matching the submitted operation hash, signer, router, and set_pack_contents entrypoint; zero, failed, look-alike, wrong-hash, internal-only, or duplicate roots fail closed. At or after the immutable open cutoff, settlement emits one append-only blocked artifact and exits before signer configuration, actor-counter reads, bridge setup, or PREPARED/SUBMITTED/APPLIED holder operations. The controller authenticates one reveal, assigns stable claims and serials, freezes transfer at the applicable deadline, consumes a claim only with atomic child delivery, and credits expired claims to holders. The router/controller terminal-closure path is permissionless only after the reveal deadline and only after purchased claims and escrow reach zero; it zeroes unclaimed inventory and wrapper supply without deleting holder pull-payment credit, including when a destination rejects withdrawal. The cancellation-only recovery workflow requires the connected router administrator and cancelled pack, authenticates official adapter code, proves requested capacity exists in both router allowance and adapter reservation, submits exactly one `recover_adapter`, then records COMPLETE only after exact decrements and any Gnocchi `total_reserved` release are reread from chain. COMPLETE remains terminal; recovery closes only after an exact confirmed terminal postcondition. Fresh positive-path proof products derive configurable 24-hour sale, 48-hour post-sale reveal, and seven-day post-sale open defaults; the funded-pool product sells out two of two wrappers and reveals immediately, while an isolated two-issued/one-sold five-minute fixture waits only to prove expired creator reveal denial before refund and closure. Limited Edition children still require the wrapper sale to end before child expiry and at least the configured green runway. Live evidence binds dependency/artifact hashes, dual-RPC counters, exact pin bytes, and hash-linked PREPARED/SUBMITTED/APPLIED choreography before aggregate proof assembly accepts the capability.",
  },
  {
    id: "pasta-protocol.ravioli-rotini-generated-at-open",
    domain: "Pasta Protocol",
    ownerSurfaceIds: ["pasta-protocol"],
    ownerSpec:
      "contracts/pasta-protocol/{PastaPackRouterFA2,PastaBlindPackController,PastaRotiniPackAdapter,PastaGenerativeCollectionFA2}.py, public/creation-tools/rotini/js/{rotini-artifact,rotini-mint}.js, public/creation-tools/ravioli/js/{rotini-artifact,rotini-mint,site,site-bundle}.js, scripts/pasta-protocol/site-kit/{site,site-bundle}.js, scripts/pasta-protocol/site-kit/site.html, scripts/pasta-protocol/rotini-artifact.test.mjs, client/src/features/pasta-protocol/pasta-static-policy.test.ts, tests/playwright/inventory/pasta-protocol-publishing.spec.mjs",
    verificationCommand:
      "node scripts/pasta-protocol/sync-site-kit.mjs && node --test scripts/pasta-protocol/rotini-artifact.test.mjs && npx tsx --test client/src/features/pasta-protocol/pasta-static-policy.test.ts && npm run build && HARNESS_PORT=4392 npx playwright test tests/playwright/inventory/pasta-protocol-publishing.spec.mjs --project=chromium --grep 'Ravioli automatically renders Rotini' --reporter=list",
    userVisibleAssertion:
      "A Ravioli holder never selects an arbitrary artwork file. The portable page resolves that holder's exact blind-controller claim and serial, proves the adapter still has reserved pack capacity, reads each generative action's adapter-owned Rotini target/project/seed context for one captured opener, and automatically materializes and pins the project's declared PNG, animated GIF, or self-contained interactive ZIP plus direct metadata before asking the wallet to open the wrapper.",
    durableSideEffectAssertion:
      "The generated payload contains the exact SHA-256 and IPFS URIs of bytes rendered by the shared Rotini runtime; metadata binds generator URI, generator creator, captured collector minter, project, seed, pack contract/token, claim serial, action index, adapter, resource, and target. A missing claim, missing or exhausted reservation view, resource/view/project or output-format disagreement fails before submission; the blind-controller entitlement and exact connected opener are rechecked after rendering; and every Ravioli export includes byte-identical Rotini artifact/render runtimes while interactive ZIPs retain top-level index.html and zero external runtime dependencies.",
  },
  {
    id: "pasta-protocol.rotini-self-contained-artifacts",
    domain: "Pasta Protocol",
    ownerSurfaceIds: ["pasta-protocol"],
    ownerSpec:
      "contracts/pasta-protocol/PastaGenerativeCollectionFA2.py, public/creation-tools/rotini/js/rotini-artifact.js, public/creation-tools/rotini/js/rotini-mint.js, scripts/pasta-protocol/rotini-artifact.test.mjs, scripts/pasta-protocol/shadownet-rotini-e2e.ts, tests/playwright/inventory/pasta-protocol-publishing.spec.mjs",
    verificationCommand:
      "node scripts/pasta-protocol/compile-fa2-template.mjs contracts/pasta-protocol/PastaGenerativeCollectionFA2.py pasta-generative-collection rotini && node --test scripts/pasta-protocol/rotini-artifact.test.mjs && npm run build && HARNESS_PORT=4390 npx playwright test tests/playwright/inventory/pasta-protocol-publishing.spec.mjs --project=chromium --grep 'exported Rotini page materializes' --reporter=list",
    userVisibleAssertion:
      "A Rotini creator chooses PNG, animated GIF, or interactive ZIP for a generator project, and a collector's self-hosted page reserves an immutable seed/token id, creates and pins that normal artifact plus direct metadata, then finalizes a token that displays without Rotini, wtfOS, Objkt, a CDN script, or any external display software.",
    durableSideEffectAssertion:
      "The SmartPy contract creates no FA2 token before finalize_iteration, enforces project output MIME, stores the final artifact/display/thumbnail URIs and SHA-256, protects paid finalization across project closure, and refunds expired reservations; artifact tests validate deterministic selection, PNG/GIF/ZIP signatures, ZIP root index and offline policy, and SHA-256; the browser proof executes reserve_iteration and finalize_iteration for all three output types and inspects each pinned TZIP-21 payload.",
  },
  {
    id: "pasta-protocol.fa2-indexer-compliance",
    domain: "Pasta Protocol",
    ownerSurfaceIds: ["pasta-protocol"],
    ownerSpec:
      "contracts/wtf-collections/{MacaroniBlindMintFA2V2,MacaroniBlindMintFA2V3}.py, contracts/pasta-protocol/{PastaStandardCollectionFA2,PastaOpenEditionFA2,PastaPackRouterFA2,PastaGenerativeCollectionFA2,PastaDistributionFA2}.py, public/creation-tools/{macaroni,spaghetti,gnocchi,ravioli,rotini,penne}/contract/*.contract.json, scripts/pasta-protocol/pasta-fa2-indexer-layout-policy.test.mjs, scripts/pasta-protocol/shadownet-{gnocchi,ravioli,rotini}-ui-live.ts",
    verificationCommand:
      "npm run contract:macaroni-v2:compile && npm run contract:macaroni-v3:compile && node scripts/pasta-protocol/compile-fa2-template.mjs contracts/pasta-protocol/PastaDistributionFA2.py pasta-distribution penne && node scripts/pasta-protocol/compile-fa2-template.mjs contracts/pasta-protocol/PastaPackRouterFA2.py pasta-bundle ravioli && node --test scripts/pasta-protocol/pasta-fa2-indexer-layout-policy.test.mjs && npx tsx --test scripts/pasta-protocol/shadownet-ravioli-ui-live.test.ts",
    userVisibleAssertion:
      "Macaroni V2/V3, Spaghetti, Gnocchi, Ravioli, Rotini, and Penne originate contracts whose standard balance, transfer, and operator entrypoints are recognized as FA2, allowing their minted tokens and balances to appear through normal Tezos indexers rather than only inside Pasta's own storage reader.",
    durableSideEffectAssertion:
      "The compiled Micheline artifacts preserve the canonical TZIP-12 comb layouts for balance_of, transfer, and update_operators; the source-policy gate compares every token-producing artifact against the proven Spaghetti schema, and a UI-LIVE proof is rejected unless TzKT independently classifies the fresh contract as an FA2 asset and indexes its token, balances, metadata URI, and applied operations.",
  },
  {
    id: "pasta-protocol.self-hosted-site-exports",
    domain: "Pasta Protocol",
    ownerSurfaceIds: ["pasta-protocol"],
    ownerSpec:
      "scripts/pasta-protocol/site-kit/*, public/creation-tools/{spaghetti,gnocchi,ravioli,rotini,penne,lasagna}/site.html, public/creation-tools/{spaghetti,gnocchi,ravioli,rotini,penne,lasagna}/js/site*.js, client/src/features/pasta-protocol/colander/ColanderApp.tsx, client/src/features/pasta-protocol/colander/colander-workspace.ts, apps/pasta-suite-desktop/src/main.cjs, apps/pasta-suite-desktop/src/site-archive.cjs, apps/pasta-suite-desktop/scripts/prepare-assets.mjs, tests/playwright/inventory/pasta-protocol-publishing.spec.mjs, tests/playwright/inventory/pasta-suite-desktop-colander.spec.mjs",
    verificationCommand:
      "node scripts/pasta-protocol/sync-site-kit.mjs && npx tsx --test client/src/features/pasta-protocol/colander/colander-workspace.test.ts client/src/features/pasta-protocol/pasta-static-policy.test.ts && node --test scripts/pasta-suite-site-archive.test.mjs && npm run pasta-suite:desktop:prepare && npm run build && HARNESS_PORT=4321 npx playwright test tests/playwright/inventory/pasta-protocol-publishing.spec.mjs tests/playwright/inventory/pasta-suite-desktop-colander.spec.mjs --project=chromium --reporter=list",
    userVisibleAssertion:
      "Macaroni and every newer Pasta publisher can download a standalone site ZIP: Macaroni exposes blind mint and reveal, Spaghetti exposes inventory-backed direct purchase, Rotini exposes reserve/render/pin/finalize for self-contained iterations, Gnocchi exposes open-edition mint, Penne exposes claim, Ravioli shows primary-sale availability together with fully reserved pack backing and exposes open-kit-driven atomic delivery of escrowed, allocated, or automatically Rotini-rendered generative/hybrid contents without arbitrary artwork uploads, and Lasagna resolves the current exhibition revision. Inside Pasta Suite Desktop, the same export appears in Colander's Self-hosted pages registry, opens from a loopback URL, rebuilds in its exact owner app, or can be explicitly uninstalled; web Colander can rebuild or forget only its portable record without claiming to delete native files.",
    durableSideEffectAssertion:
      "Each ZIP contains index.html, its app-owned config, site styling/runtime, wallet support, and Tezos dependencies; Ravioli additionally includes the shared Rotini artifact and renderer runtimes, validates a v3 open kit whose adapter actions carry an explicit exact-payload or generated-at-open commitment policy, and invokes open_pack so all child deliveries and wrapper burn share one atomic operation; export emits the app-owned event; a Colander-launched Macaroni or newer-publisher export appends a self_hosted_site artifact to the portable workspace manifest and advances the project to published; native Colander safely expands the stored ZIP under Documents/Pasta Suite/sites, writes a manifest, and emits pasta_suite.site_installed; uninstall accepts only an exact managed slug, atomically removes the served directory, prunes matching artifacts, and emits pasta_suite.site_uninstalled, while record-only cleanup emits colander.site_record_forgotten without deleting bytes or touching chain state.",
  },
  {
    id: "pasta-protocol.contract-resume-ledger",
    domain: "Pasta Protocol",
    ownerSurfaceIds: ["pasta-protocol"],
    ownerSpec:
      "scripts/pasta-protocol/studio-kit/studio-contracts.js, public/creation-tools/{spaghetti,gnocchi,ravioli,rotini,penne,lasagna}/js/studio-contracts.js, client/src/features/pasta-protocol/colander/ColanderApp.tsx, client/src/features/pasta-protocol/colander/colander-workspace.ts, client/src/features/pasta-protocol/pasta-static-policy.test.ts, tests/playwright/inventory/pasta-protocol-publishing.spec.mjs",
    verificationCommand:
      "node scripts/pasta-protocol/sync-site-kit.mjs && npx tsx --test client/src/features/pasta-protocol/colander/colander-workspace.test.ts client/src/features/pasta-protocol/pasta-static-policy.test.ts && npm run build && HARNESS_PORT=4372 npx playwright test tests/playwright/inventory/pasta-protocol-publishing.spec.mjs --project=chromium --grep \"remember confirmed contracts\" --reporter=list",
    userVisibleAssertion:
      "Each newer standalone Pasta studio lists confirmed deployments after restart, verifies pasted KT1 contracts on the selected network before remembering them, restores the correct app-owned contract fields on resume, and lets the creator forget only the local reference; Colander shows the complete KT1, owner app, network, and last verification time with central-manager and owner-app reopen controls.",
    durableSideEffectAssertion:
      "Public lifecycle references use pasta-studio-contract@1 under the app-scoped wtfos.pasta.studio.contracts.v1 key and pasta-contract-ref@1 inside backward-compatible Colander projects; no wallet signing material is stored; confirmed deployments emit recorded events, manual and repeat reads emit verified events, resume/forget actions emit their normalized events, and the browser proof covers all six field mappings plus structured Colander persistence.",
  },
  {
    id: "pasta-protocol.portable-chease-preparation",
    domain: "Pasta Protocol",
    ownerSurfaceIds: ["pasta-protocol"],
    ownerSpec:
      "public/creation-tools/ch-ease/index.html, public/creation-tools/ch-ease/css/theme.css, public/creation-tools/ch-ease/js/studio.js, public/creation-tools/{spaghetti,gnocchi,ravioli,rotini,penne,lasagna}/js/common.js, apps/ch-ease-desktop, .github/workflows/ch-ease-desktop-installers.yml, server/routes/ch-ease-installers.ts, scripts/ch-ease-desktop-package-policy.test.mjs, apps/pasta-suite-desktop/scripts/prepare-assets.mjs, tests/playwright/inventory/pasta-chease-standalone.spec.mjs, tests/playwright/inventory/pasta-suite-desktop-colander.spec.mjs",
    verificationCommand:
      "npm run ch-ease:desktop:prepare && npm run ch-ease:desktop:check && npm run pasta-suite:desktop:prepare && npm run pasta-suite:desktop:check && HARNESS_PORT=4377 npx playwright test tests/playwright/inventory/pasta-chease-standalone.spec.mjs tests/playwright/inventory/pasta-suite-desktop-colander.spec.mjs --project=chromium --reporter=list",
    userVisibleAssertion:
      "A creator can open or individually install CH-EASE without hosted wtfOS, select original media, pin it through their own Pinata account or Kubo node, edit collection and token metadata, choose the correct Pasta publisher, download the shared v1 package as JSON or a ZIP with original files, recover metadata after reload with a clear file-reselection warning, and immediately hand durable artifact URIs to any of the six locally bundled publisher targets.",
    durableSideEffectAssertion:
      "Portable CH-EASE writes provider-returned CIDs into the matching package items and emits chease.media_pinned while keeping Pinata JWTs, node configuration, and file bytes out of pasta-chease-draft@1 and the Colander manifest; it adds a pasta-studio-draft-ref@1 owned by ch-ease, stages a validated wtfos.pasta.chease-package.v1 payload in sessionStorage plus an expiry-wrapped one-use local fallback for noopener windows, deletes that fallback on publisher consumption, exposes the individual installer only when URL and SHA-256 are both configured, and native Colander preserves and resumes ch-ease rather than coercing it to Spaghetti.",
  },
  {
    id: "pasta-protocol.native-colander-lifecycle",
    domain: "Pasta Protocol",
    ownerSurfaceIds: ["pasta-protocol"],
    ownerSpec:
      "apps/*-desktop/src/main.cjs, apps/*-desktop/src/loopback-origin.cjs, apps/pasta-suite-desktop/scripts/prepare-assets.mjs, apps/pasta-suite-desktop/src/static-path.cjs, apps/pasta-suite-desktop/package.json, apps/pasta-suite-desktop/build/*, scripts/pasta-desktop-origin-persistence.test.mjs, scripts/pasta-suite-desktop-package-policy.test.mjs, scripts/pasta-suite-desktop-artifact-smoke.mjs, scripts/pasta-suite-desktop-review-manifest.mjs, .github/workflows/pasta-suite-desktop-installers.yml, tests/playwright/inventory/pasta-suite-desktop-colander.spec.mjs",
    verificationCommand:
      "node --test scripts/pasta-desktop-origin-persistence.test.mjs && npm run pasta-suite:desktop:prepare && npm run pasta-suite:desktop:check && HARNESS_PORT=4375 npx playwright test tests/playwright/inventory/pasta-suite-desktop-colander.spec.mjs --project=chromium --reporter=list",
    userVisibleAssertion:
      "Installed Colander displays the active project's recoverable drafts, complete remembered-contract lifecycle records, and self-hosted page artifacts, then resumes the correct bundled owner app, reopens a KT1 in the native manager, or opens the installed loopback page without requiring Objkt, Teia, or wtfOS hosting. Closing and reopening the suite or any standalone Pasta desktop app returns to the same product-specific local origin and the same locally saved work; launching it twice focuses the existing window.",
    durableSideEffectAssertion:
      "Native project create/load/import/storage-refresh paths normalize pasta-project@1 records, preserve backward compatibility, filter malformed draft/contract/site references and unsafe local URLs, attach chain-read contracts as pasta-contract-ref@1 records, and pass project/network/contract context back to the same bundled standalone tools that own the records. Fresh project and contract-manager controls default visibly to Shadownet while preserving explicit Mainnet opt-in. The suite and eight standalone shells bind unique fixed 127.0.0.1 origins, never fall back to a random port, acquire Electron single-instance locks, and surface an occupied-origin error that tells creators not to clear application data; a persistent-browser relaunch regression proves localStorage remains reachable. Branded universal macOS DMG and Windows NSIS artifacts include all eight tools without external runtimes; the installer workflow launches each packaged executable on its owning OS and proves Shadownet-default Colander project creation plus CH-EASE launch before upload.",
  },
  {
    id: "pasta-protocol.colander-project-workspace",
    domain: "Pasta Protocol",
    ownerSurfaceIds: ["pasta-protocol"],
    ownerSpec:
      "client/src/features/pasta-protocol/colander/ColanderApp.tsx, client/src/features/pasta-protocol/colander/colander-workspace.ts, shared/pasta-protocol/adapters.ts, shared/pasta-protocol/types.ts, shared/pasta-protocol/package.ts, scripts/pasta-protocol/shadownet-colander-ui-live.ts, scripts/pasta-protocol/shadownet-colander-ui-live.test.ts, apps/pasta-suite-desktop/scripts/prepare-assets.mjs, public/creation-tools/*/js/common.js, public/creation-tools/*/js/studio.js, tests/playwright/inventory/pasta-protocol-publishing.spec.mjs, tests/playwright/inventory/pasta-suite-desktop-colander.spec.mjs, tests/playwright/inventory/pasta-protocol-colander-shadownet.spec.mjs",
    verificationCommand:
      "npx tsx --test client/src/features/pasta-protocol/colander/colander-workspace.test.ts client/src/features/pasta-protocol/pasta-static-policy.test.ts && npm run pasta:shadownet:colander:ui-live:check && npm run pasta-suite:desktop:prepare && npm run pasta-suite:desktop:check && HARNESS_PORT=4379 npx playwright test tests/playwright/inventory/pasta-protocol-publishing.spec.mjs tests/playwright/inventory/pasta-suite-desktop-colander.spec.mjs --project=chromium --grep 'project lifecycle|web Colander owns' --reporter=list && npm run pasta:shadownet:colander",
    userVisibleAssertion:
      "A creator can make and rename a local project in web or installed Colander, duplicate its workflow as an independent clean project, reversibly archive and restore it, permanently delete it only after explicit confirmation, reopen it after reload, export or import its versioned manifest, launch the owner app with project context, identify Macaroni V1, V2, and V3 as Macaroni-owned blind-mint contracts, and open a Penne KT1 with a public Claim allocation action without losing direct contract management or the visible success result after refresh.",
    durableSideEffectAssertion:
      "The project persists under wtfos.pasta.colander.workspace.v1; archive stores its prior stage for exact restore while legacy archives infer a safe stage; duplicates receive a new id and empty draft/contract/site ledgers; deletion is restricted to archived records; the Macaroni adapter wins over generic FA2 detection and stores `toolId: macaroni`; confirmed writes retain their success status after the live state refresh; web and installed Colander emit normalized lifecycle events; CH-EASE preserves project ownership through package preparation; and Macaroni plus each newer Pasta publisher attaches a newly deployed or resumed KT1 to the originating project and advances it to deployed without requiring Objkt, Teia, or a wtfOS database.",
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
    id: "collekt.duplicate-art-scan-and-offer",
    domain: "Wallets, Tokens, Portfolio, and On-Chain State",
    ownerSurfaceIds: ["marketplace"],
    ownerSpec:
      "server/features/collekt/duplicates.test.ts, tests/playwright/inventory/collekt-duplicates.spec.mjs, client/src/lib/tezos/marketplace.ts",
    verificationCommand:
      "npx tsx --test server/features/collekt/duplicates.test.ts && npm run check && npm run test:e2e:inventory:coverage && npm run build && npx playwright test tests/playwright/inventory/collekt-duplicates.spec.mjs --project=chromium",
    userVisibleAssertion:
      "A signed-in collector can scan any Tezos wallet, see only duplicate zero-decimal FA2 art with proven supply at or below 5,000, compare paid price with last sale and delta, inspect edition share and acquisition date, then preview exact owner/token/quantity/signer terms before connecting a wallet and placing a WTF offer.",
    durableSideEffectAssertion:
      "The scan, terms preview, and confirmed offer produce normalized colleKT SystemEvents; offer execution reuses the network-verified marketplace helper, approves the configured WTF FA2 operator, submits one exact V2 place_offer call, waits for confirmation, and records the canonical operation hash.",
  },
  {
    id: "marketplace.offer-accept-explicit-terms",
    domain: "Market, Exchange, Inventory, and Commerce",
    ownerSurfaceIds: ["marketplace"],
    ownerSpec:
      "client/src/lib/tezos/marketplace.ts, client/src/lib/tezos/barter.ts, client/src/lib/tezos/wallet-signer-binding.test.ts, client/src/features/marketplace/OfferAcceptanceDialog.tsx, server/routes/marketplace.ts, tests/playwright/live/marketplace-shadownet.spec.mjs",
    verificationCommand:
      "node --test scripts/marketplace-v2/funding-policy.test.mjs scripts/marketplace-v2/mainnet-release-policy.test.mjs && npm run check && npm run test:e2e:inventory:coverage && npm run contract:e2e:marketplace-v2:shadownet:existing && npm run test:e2e:marketplace:shadownet",
    userVisibleAssertion:
      "All new mainnet marketplace activity uses Marketplace V2 KT1C8jTazt2QyFLPKf27xRGssv99AtzagWHb, while accepting a marketplace or trade-board offer shows quantity, unit WTF, total WTF, token contract/id, owner, offerer, and contract version before wallet signing; legacy V1 stays available only as recovery context.",
    durableSideEffectAssertion:
      "The wallet helper re-reads canonical /api/marketplace/onchain before signing, blocks legacy accepts unless tokenAmount is exactly 1, sends V2 accepts with offer_id plus expected token, owner, quantity, and unit price, and production keeps the old V1 address only in LEGACY_MARKETPLACE_CONTRACT_ADDRESS. Marketplace and barter write helpers pass the prepared wallet into network preflight, selected-token creation rejects an active signer that differs from the token-owning linked wallet, and the shared signer guard rejects a switched wallet before Taquito provider or contract access. The mainnet V2 release compiles the exact Shadownet-proven code, enforces signed-operation size headroom, originates from wtf-os-root, assigns contract-admin authority, and proves pause/unpause before cutover. The in-app market V2 checkout signs only after receiving expected WTF token, treasury, amount, purchase reference, and cart hash, and the local Shadownet runner binds the marketplace, WTF FA2, and in-app market contracts as one explicit test bundle.",
  },
  {
    id: "casino.access-game-apis",
    domain: "WTF Casino, Membership, and Wagered Games",
    ownerSurfaceIds: ["casino"],
    ownerSpec: "tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand: "npm run test:e2e:live:puppets",
    userVisibleAssertion: "A contestant's Casino app pass exposes the Casino launcher without a second app purchase; an inactive membership keeps the launcher visibly locked with the membership-card reason, while a fully eligible contestant can open the Casino game API surfaces.",
    durableSideEffectAssertion:
      "Catalog and desktop-personalization policy treat casino-app-pass as the app-access entitlement, while the actor harness separately proves membership state and exercises entry, quote, join, and bet-intent endpoints with fail-closed response contracts.",
  },
  {
    id: "casino.community-practice-create-moderate-play",
    domain: "WTF Casino, Membership, and Wagered Games",
    ownerSurfaceIds: ["casino"],
    ownerSpec:
      "server/features/casino/practice-games.test.ts; tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand:
      'npx tsx --test server/features/casino/practice-games.test.ts && WTF_E2E_ACTOR_FILTER=cookiemonster,thecount,bert npx playwright test --config=playwright.live.config.mjs tests/playwright/live/puppet-orchestration.spec.mjs -g "community Casino practice tables"',
    userVisibleAssertion:
      "A creator can define a clearly labeled no-wager practice table, see its private review status, and after operator approval members can discover the attributed table and play a stored equal-chance result.",
    durableSideEffectAssertion:
      "The real-database actor harness proves hidden submitted state, blocked creator self-approval, operator attribution and note, approved public state, durable play count/result, normalized audit events, and null wager/reward fields.",
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
    id: "arcade.creator-build-publish-discover",
    domain: "WTF Arcade, WTF Console, and Game Studio SDK",
    ownerSurfaceIds: ["arcade", "game-studio"],
    ownerSpec:
      "server/features/arcade/stats-policy.test.ts; tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand:
      'npx tsx --test server/features/arcade/stats-policy.test.ts && WTF_E2E_ACTOR_FILTER=cookiemonster npx playwright test --config=playwright.live.config.mjs tests/playwright/live/puppet-orchestration.spec.mjs -g "Arcade publication preserve creator work"',
    userVisibleAssertion:
      "A trusted creator can create and build a Game Studio project, publish it into the public Arcade, and find the game there with their creator name and a clear Built with WTF Game Studio source label.",
    durableSideEffectAssertion:
      "The live harness proves the project and ZIP build persist, submission changes the project to published, the public Arcade catalog and detail return the attributed game, and persisted creator/Game Studio games contribute to Arcade statistics.",
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
    id: "admin.commission-operator-queue-summary",
    domain: "Administration, Governance, and Operations",
    ownerSurfaceIds: ["admin-panel", "control-board", "wtfiam", "arcade", "casino", "calendar"],
    ownerSpec:
      "server/features/admin/stats-routes.ts; tests/playwright/inventory/operator-commission-queue.spec.mjs; tests/playwright/live/operator-commission-queue.spec.mjs",
    verificationCommand:
      "npm run build && npx playwright test tests/playwright/inventory/operator-commission-queue.spec.mjs && WTF_E2E_START_SERVER=1 npx playwright test --config=playwright.live.config.mjs tests/playwright/live/operator-commission-queue.spec.mjs",
    userVisibleAssertion:
      "A strict operator starts from one plain-language Store, Arcade, Casino, and Calendar queue summary, sees how many submissions are waiting, and opens the existing domain-owned review surface from each card.",
    durableSideEffectAssertion:
      "The summary counts the four canonical submitted/pending records from the real database without implementing review mutations; the live actor proof verifies exact counts for seeded rows, denies the same admin summary to an ordinary member, and the browser proof routes review to WTFIAM Market, Arcade moderation, Casino practice tables, and Control Board calendar tickets.",
  },
  {
    id: "admin.desktop-app-registration-resilience",
    domain: "Administration, Governance, and Operations",
    ownerSurfaceIds: ["admin-panel"],
    ownerSpec:
      "client/src/features/admin/admin-control-suite-policy.test.ts; server/lib/desktop-app-registration-policy.test.ts; server/routes/desktop-apps-resilience-policy.test.ts; tests/playwright/inventory/admin-control-suite.spec.mjs",
    verificationCommand:
      "npx tsx --test client/src/features/admin/admin-control-suite-policy.test.ts server/lib/desktop-app-registration-policy.test.ts server/routes/desktop-apps-resilience-policy.test.ts && npm run build && npx playwright test tests/playwright/inventory/admin-control-suite.spec.mjs -g \"app registrations\"",
    userVisibleAssertion:
      "An admin can mark each app license, docs, and install key as non-expiring and can refresh every app registration from one clearly labeled action without changing launcher visibility; a failed registration query becomes a terminal migration-aware error with an explicit retry action instead of an endless loader.",
    durableSideEffectAssertion:
      "The permanent policy is stored per desktop app, timed expiry is ignored only for permanent registrations, manual stale/revoked/disabled states remain authoritative, and bulk refresh rotates all install keys in one database transaction while preserving enabled flags.",
  },
  {
    id: "admin.broad-acute-control-suite",
    domain: "Administration, Governance, and Operations",
    ownerSurfaceIds: ["admin-panel"],
    ownerSpec:
      "client/src/features/admin/admin-control-suite-policy.test.ts; client/src/features/admin-os/admin-surface-registry.test.ts; shared/wtf-browser-route-access.test.ts; shared/role-system.test.ts; server/features/admin/help-index-policy.test.ts; tests/playwright/inventory/admin-control-suite.spec.mjs; tests/playwright/inventory/system-integration.spec.mjs; tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand:
      "npx tsx --test client/src/features/admin/admin-control-suite-policy.test.ts client/src/features/admin-os/admin-surface-registry.test.ts shared/wtf-browser-route-access.test.ts shared/role-system.test.ts server/features/admin/help-index-policy.test.ts && npm run build && npx playwright test tests/playwright/inventory/admin-control-suite.spec.mjs tests/playwright/inventory/system-integration.spec.mjs",
    userVisibleAssertion:
      "Only a strict admin can discover or open the Admin Panel; an admin starts from task routing, searches URL-backed sections, reviews users in a sortable table with highest assigned role and level, opens a user name into a complete WTF Passport, reviews roles and curses in broad tables, and narrows into an acute record without hunting through one giant action row.",
    durableSideEffectAssertion:
      "The focused source and browser harness assert the user Passport composes canonical roles, permissions, curses, wtfOS access, desktop settings, wallets, domains, and EXP activity; desktop settings saves use optimistic concurrency and audited admin routes; role and curse handoffs preserve the selected user context.",
  },
  {
    id: "admin.user-deletion-least-privilege",
    domain: "Administration, Governance, and Operations",
    ownerSurfaceIds: ["admin-panel"],
    ownerSpec:
      "shared/types.test.ts; client/src/features/admin/admin-control-suite-policy.test.ts; server/features/admin/users/deletion-permission-policy.test.ts; tests/playwright/inventory/admin-control-suite.spec.mjs",
    verificationCommand:
      "npx tsx --test shared/types.test.ts client/src/features/admin/admin-control-suite-policy.test.ts server/features/admin/users/deletion-permission-policy.test.ts && npm run build && npx playwright test tests/playwright/inventory/admin-control-suite.spec.mjs -g \"reviews every user\"",
    userVisibleAssertion:
      "A cohost can open a user's WTF Passport and perform ordinary support work, but sees a plain Account deletion restricted explanation instead of a permanent-delete control unless the role was explicitly granted Delete Users.",
    durableSideEffectAssertion:
      "The permanent DELETE /api/admin/users/:id route requires delete_users rather than manage_users; cohost defaults deny that dedicated permission, host/admin defaults retain it, and the existing role-permission matrix remains the only explicit grant path.",
  },
  {
    id: "admin.help-index-coverage",
    domain: "Administration, Governance, and Operations",
    ownerSurfaceIds: ["admin-panel"],
    ownerSpec:
      "client/src/features/admin/help/admin-help-index.test.ts; server/features/admin/help-index-policy.test.ts; tests/playwright/inventory/admin-control-suite.spec.mjs",
    verificationCommand:
      "npx tsx --test client/src/features/admin/help/admin-help-index.test.ts server/features/admin/help-index-policy.test.ts && npm run build && npx playwright test tests/playwright/inventory/admin-control-suite.spec.mjs -g \"help index\"",
    userVisibleAssertion:
      "An admin can describe a complaint in human language or search an exact surface ID, route, native setting, permission, curse, API path, or automation handle and receive a ranked destination plus a human resolution guide and an agent contract.",
    durableSideEffectAssertion:
      "Coverage fails unless every central admin section, registered WTF surface and element, permission, and curse has a unique stable help topic; the admin-only versioned Help API supports query, kind, and stable-ID filters and records searched queries without exposing credential data.",
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
      "Map Lab's direct anonymous route opens without an app-store entitlement while launcher/store gates stay intact; its resizable WTF OS workspace expands the center canvas when maximized, exposes scroll/pan plus zoom/fit/reset/overview controls, lets a signed-in user drag unlocked nodes without moving locked nodes, supports typed workflow interactions, and exposes a read-only wtfOS demo map that any user can inspect/run without editing canonical nodes or routes.",
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
    ownerSpec:
      "server/routes/tv-embed-policy.test.ts; tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand:
      "npx tsx --test server/routes/tv-embed-policy.test.ts && WTF_E2E_ACTOR_FILTER=bert npx playwright test --config=playwright.live.config.mjs tests/playwright/live/puppet-orchestration.spec.mjs -g \"WTF TV public channel\"",
    userVisibleAssertion:
      "A contestant can discover a public WTF TV channel and resolve its current broadcast state; independent public embeds tune to the same server-selected item and wall-clock offset instead of starting private queues at zero.",
    durableSideEffectAssertion:
      "The live harness proves the same public active channel resolves through channel list, owned-channel scope, now/stream state, dial lookup, embed metadata, and oEmbed metadata without requiring private media access; source policy locks boundary refetch, offset seeking, and a single media authority into the generated embed player.",
  },
  {
    id: "tv.broken-clip-recovery",
    domain: "WTF TV, Playback, Channels, and Embeds",
    ownerSurfaceIds: ["tv"],
    ownerSpec:
      "tests/playwright/inventory/wtfos-guide-tv.spec.mjs; server/lib/tv-telemetry.test.ts",
    verificationCommand:
      "npm run build && npx playwright test tests/playwright/inventory/wtfos-guide-tv.spec.mjs && npx tsx --test server/lib/tv-telemetry.test.ts",
    userVisibleAssertion:
      "When the canonical WTF TV encounters a broken clip, the viewer sees an immediate plain-language skip notice and playback advances to the next healthy queue item instead of silently retrying the broken on-air cursor.",
    durableSideEffectAssertion:
      "The browser harness captures an error item-end event carrying the broken video id and a non-empty session id, while the server telemetry tests prove distinct-session blacklisting remains bounded and windowed.",
  },
  {
    id: "tv.canonical-route-only",
    domain: "WTF TV, Playback, Channels, and Embeds",
    ownerSurfaceIds: ["tv"],
    ownerSpec:
      "server/features/tv/canonical-tv-route-policy.test.ts; tests/playwright/inventory/wtfos-guide-tv.spec.mjs",
    verificationCommand:
      "npx tsx --test server/features/tv/canonical-tv-route-policy.test.ts && npx playwright test tests/playwright/inventory/wtfos-guide-tv.spec.mjs",
    userVisibleAssertion:
      "The OS exposes one WTF TV application at `/tv`; entering the retired `/tv2` address cannot open a divergent second player.",
    durableSideEffectAssertion:
      "Source policy keeps the TV2 page deleted and the route registry free of `/tv2`, while Chromium proves only `/tv` renders the TV shell and power control.",
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
    id: "gameshow.paid-side-quest-confirmed-fee-gate",
    domain: "Gameshow Participation, Progression, and Rewards",
    ownerSurfaceIds: ["side-quests"],
    ownerSpec:
      "server/features/side-quests/entry-fee-policy.test.ts, server/side-quest-entry-fee-policy.test.ts",
    verificationCommand:
      "npx tsx --test server/features/side-quests/entry-fee-policy.test.ts server/side-quest-entry-fee-policy.test.ts",
    userVisibleAssertion:
      "A paid side quest explains the required WTF amount and refuses submission until that contestant has a matching confirmed entry fee of at least the configured amount.",
    durableSideEffectAssertion:
      "Executable fee-policy tests reject absent, pending, underpaid, and malformed payments, while route-order tests prove the same decision runs before auto-verification, completion persistence, first staff approval, or reward distribution; staff confirmation also binds the fee id to the quest id in the request.",
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
      "A member can see Club Dues state, compile a V2 dues template, and prepare dues payment only with a wallet linked to the current account; staff authority transfer is explicitly proposed and accepted by the destination wallet.",
    durableSideEffectAssertion:
      "The live harness verifies public contract visibility, user membership state, admin summaries, arrears dry-sweep behavior, SmartPy/Kiln template compilation, unlinked-wallet rejection, and linked-wallet payment intent creation against the live Club Dues contract. V2 stores a pending admin until that exact address accepts, clears it after acceptance, and rejects attached tez on privileged calls.",
  },
  {
    id: "studio.creator-runway-persistence",
    domain: "Media, Creation, Gallery, and Preservation",
    ownerSurfaceIds: ["studio", "wim", "ipfs-pinning", "pasta-protocol", "wtf-live"],
    ownerSpec:
      "client/src/features/studio/studio-presentation-policy.test.ts; server/routes/studio-workflow-policy.test.ts; tests/playwright/inventory/gamma-wtfos.spec.mjs",
    verificationCommand:
      'npx tsx --test client/src/features/studio/studio-presentation-policy.test.ts server/routes/studio-workflow-policy.test.ts && npm run test:e2e:inventory:coverage && npx playwright test tests/playwright/inventory/gamma-wtfos.spec.mjs -g "hosts Studio project list" --project=chromium --reporter=list',
    userVisibleAssertion:
      "A Studio collaborator can see a guided Concept-to-Activate runway, an explicit Tezos network, shared readiness tasks, release evidence fields, and project-context handoffs to WIM, Broot, IPFS Pinning, Pasta Protocol, Mint Portal, and WTF LIVE.",
    durableSideEffectAssertion:
      "PATCH /api/studio/projects/:id/workflow merges the shared checklist and release references into the project workflow JSONB row, updates project recency, posts a Studio system message, and broadcasts the updated runway to project clients while retaining each destination app's own access and wallet gates.",
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
    id: "media.personal-drive-backup",
    domain: "Media, Creation, Gallery, and Preservation",
    platformOwner: "media-library",
    ownerSpec: "server/lib/studio/media-drive-backup-policy.test.ts; tests/playwright/inventory/faq-tutorials.spec.mjs",
    verificationCommand:
      "npx tsx --test server/lib/studio/media-drive-backup-policy.test.ts && npm run build && npx playwright test tests/playwright/inventory/faq-tutorials.spec.mjs",
    userVisibleAssertion:
      "A signed-in user can connect one personal Google Drive for Studio and My Media, see the connection in both apps, and retry an upload backup without changing the object-storage playback source.",
    durableSideEffectAssertion:
      "New uploaded media retains its S3/cache playback fields while Google Drive backup status, file id, checksum, and sync time are persisted in media metadata; normalized success/failure events and the owner-gated retry route make recovery observable.",
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
      "The live harness reads public links, FAQ, access, leaderboard, and gallery state; rejects unauthenticated MCP calls; creates a scoped MCP token; proves tools/list works without setting cookies; searches, inspects, and calls an allowed OpenAPI operation through the agent portal while excluding admin operations; denies a desktop mutation missing desktop:write; revokes the token; and rejects reuse after revocation.",
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
      "WTF LIVE public-room guests hear distinct local join/leave chimes for peer transitions plus a spoken Goodbye and three-note cue for intentional or unexpected self-disconnects, can persistently mute those room sounds, see each other in collapsible attendance, and exchange camera, screen, dedicated media-file deck, chat, reactions, and shared pop-out media without mic-only guests consuming stage space.",
    durableSideEffectAssertion:
      "The inventory harness uses the public /ws/wtf-live room relay to verify ascending join and descending leave Web Audio tones, spoken and three-note Goodbye alerts for both Leave and unexpected socket closure, persistent presence-sound mute state, WebRTC signaling and media-state events, push-to-talk attendance state, camera/screen/media switching, chat keyboard/style/emoji/media behavior, room reactions, pop-outs, and crowded-room layout.",
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
    ownerSpec:
      "server/features/w/message-routes-settings.test.ts; tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand:
      "node --import tsx --test server/features/w/message-routes-settings.test.ts && npm run test:e2e:live:puppets",
    userVisibleAssertion: "W users can read the configured Gameshow groupchat mirror without a send surface.",
    durableSideEffectAssertion:
      "The focused settings contract rejects malformed, non-array, or over-limit admin selections before upstream lookups or persistence; the live harness asserts the groupchat API is read-only, personal DM writes are disabled, and admin diagnostics expose the active config source.",
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
    id: "messages.dm-report-review-safety-loop",
    domain: "Community, Social, Messaging, and Discord",
    ownerSurfaceIds: ["messages"],
    ownerSpec:
      "tests/playwright/inventory/messages-safety.spec.mjs; tests/playwright/live/puppet-orchestration.spec.mjs; tests/e2e/inventory/domain-workflows.mjs",
    verificationCommand:
      'npm run test:e2e:inventory:coverage && npx playwright test tests/playwright/inventory/messages-safety.spec.mjs --project=chromium --reporter=list && npm run test:e2e:live:puppets -- -g "recipient reports a direct message"',
    userVisibleAssertion:
      "A recipient can report a specific received message from the conversation, understands that the report is private, receives clear confirmation, and an authorized operator can see the sender, message, recipient reason, and record a reviewed or dismissed disposition note.",
    durableSideEffectAssertion:
      "The server persists one report per reporter/message, rejects self-reports and non-participants, restricts the safety queue and dispositions to manage_users permission, stores reviewer identity and note, and emits report/review audit events without copying private message content into normalized metadata.",
  },
  {
    id: "admin-inbox.role-aware-feedback",
    domain: "Community, Social, Messaging, and Discord",
    ownerSurfaceIds: ["admin-inbox", "mail"],
    ownerSpec:
      "client/src/pages/admin-inbox-presentation-policy.test.ts; client/src/features/desktop/DesktopIcons.test.tsx; server/routes/admin-inbox-policy.test.ts; tests/e2e/inventory/domain-workflows.mjs; tests/playwright/inventory/system-integration.spec.mjs; tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand:
      "npx tsx --test client/src/pages/admin-inbox-presentation-policy.test.ts client/src/features/desktop/DesktopIcons.test.tsx server/routes/admin-inbox-policy.test.ts && npm run test:e2e:inventory:coverage && npx playwright test tests/playwright/inventory/system-integration.spec.mjs -g \"fresh witness\"",
    userVisibleAssertion:
      "Contact Admin is a separate core desktop app on every default desktop: non-admin users receive an evidence-oriented compose form with screenshot prompts, while admin-role users receive the inbox, raw field table, email rendering, agent-ready Markdown, screenshot viewer, and reply composer. Inbox also exposes the same conversations under an Admin contact tab.",
    durableSideEffectAssertion:
      "Server-authenticated APIs persist admin_inbox_messages and admin_inbox_replies, validate screenshot media ownership and image readiness, restrict global list/read access to admin roles, restrict user thread access to the reporting account, and contribute role-correct unread counts to GET /api/comms/unread-count.",
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
    id: "payroll.isolated-wallet-and-value-transfer",
    domain: "Commerce, Wallets, and Private Operations",
    ownerSurfaceIds: ["payroll"],
    ownerSpec: "tests/playwright/inventory/payroll.spec.mjs",
    verificationCommand:
      "npx tsx --test client/src/features/payroll/payroll-wallet.test.ts && npx playwright test tests/playwright/inventory/payroll.spec.mjs",
    userVisibleAssertion:
      "A strict admin can explicitly connect a funding wallet that is isolated from the wtfOS profile wallet, inspect its mainnet XTZ and WTF balances, and review the exact source, recipient, asset, amount, network, and token contract before signing.",
    durableSideEffectAssertion:
      "Payroll rechecks the active signer and Tezos mainnet chain before sending, waits for one on-chain confirmation, exposes the operation hash, and leaves the existing profile wallet session unchanged.",
  },
  {
    id: "objkt-operator.owner-persistence-and-score-review",
    domain: "Commerce, Wallets, and Private Operations",
    ownerSurfaceIds: ["objkt-operator"],
    ownerSpec: "tests/playwright/inventory/objkt-operator.spec.mjs",
    verificationCommand: "npx tsx --test server/features/objkt-operator/policy.test.ts && npm run test:e2e:inventory",
    userVisibleAssertion:
      "The configured wtf-admin owner can open Objkt Operator, inspect every creator's weighted sales, buyers, volume, recency, verification, inventory-depth, and floor-fit score before approving or rejecting, then scan approved creators and manage a Kukai-backed signing queue.",
    durableSideEffectAssertion:
      "Creator decisions, spend controls, wallet address, Objkt scans, queue transitions, and operator events persist in the owner-keyed objkt_operator_states PostgreSQL row; recovery material and signing passwords are never accepted by the API or stored in wtfOS.",
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
