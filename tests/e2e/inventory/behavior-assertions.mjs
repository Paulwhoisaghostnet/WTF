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
    userVisibleAssertion: "A contestant can update desktop appearance grammar, colors, layout, and use desktop pet actions.",
    durableSideEffectAssertion:
      "The harness writes desktop settings, reloads them through a fresh read, records a desktop event with an event id, and confirms the pet action appears in live pet event history.",
  },
  {
    id: "desktop.app-gates-runtime-policy",
    domain: "Desktop OS, Navigation, and Personal Environment",
    ownerSurfaceIds: ["admin-panel", "command-palette", "desktop-icons"],
    ownerSpec:
      "client/src/features/command-palette/command-palette-model.test.ts, client/src/components/layout/start-menu-app-gates.test.ts, shared/role-system.test.ts",
    verificationCommand:
      "npx tsx --test client/src/features/command-palette/command-palette-model.test.ts client/src/components/layout/start-menu-app-gates.test.ts shared/role-system.test.ts",
    userVisibleAssertion:
      "Apps disabled by admin are hidden from Start Menu and Command Palette launch surfaces, and time-out accounts receive no app launch entries.",
    durableSideEffectAssertion:
      "Shared page-access policy denies disabled app routes from the same app gate map used by launcher models while leaving ungated OS/admin routes reachable.",
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
