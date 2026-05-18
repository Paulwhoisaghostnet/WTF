export const CORE_BEHAVIOR_ASSERTIONS = [
  {
    id: "auth.password-session-linked-wallet",
    domain: "Entry, Authentication, and Account Identity",
    ownerSpec: "tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand: "npm run test:e2e:live:puppets",
    userVisibleAssertion: "Each puppet can authenticate and see its own account session.",
    durableSideEffectAssertion:
      "The live harness confirms each seeded account remains linked to its expected signer-backed wallet.",
  },
  {
    id: "auth.wallet-challenge-login",
    domain: "Wallets, Tokens, Portfolio, and On-Chain State",
    ownerSpec: "tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand: "npm run test:e2e:live:puppets",
    userVisibleAssertion: "Each puppet wallet can complete the wallet-login challenge flow.",
    durableSideEffectAssertion:
      "The server verifies each platform-keyring signature against the linked wallet and returns the matching user.",
  },
  {
    id: "wallet.checkout-intent-bound-to-signed-session",
    domain: "Wallets, Tokens, Portfolio, and On-Chain State",
    ownerSpec: "tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand:
      "WTF_E2E_ACTOR_FILTER=bert npx playwright test --config=playwright.live.config.mjs tests/playwright/live/puppet-orchestration.spec.mjs -g \"wallet-login checkout intent\"",
    userVisibleAssertion:
      "A user who logs in with a signer-backed wallet can prepare a WTF IAM checkout without relinking that wallet.",
    durableSideEffectAssertion:
      "The checkout intent is created for the same linked wallet address returned by the wallet-login verification flow.",
  },
  {
    id: "inventory.temporary-grants-unlock-apps",
    domain: "Market, Exchange, Inventory, and Commerce",
    ownerSpec: "tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand: "npm run test:e2e:live:puppets",
    userVisibleAssertion: "Seeded users can enter gated Casino, Arcade, and Desktop inventory surfaces.",
    durableSideEffectAssertion:
      "The harness reads the live market/inventory APIs and asserts the required app-pass, play-card, and desktop item balances.",
  },
  {
    id: "casino.access-game-apis",
    domain: "WTF Casino, Membership, and Wagered Games",
    ownerSpec: "tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand: "npm run test:e2e:live:puppets",
    userVisibleAssertion: "A contestant with access can open the Casino game API surfaces.",
    durableSideEffectAssertion:
      "The harness exercises entry, quote, join, and bet-intent endpoints while preserving fail-closed response contracts.",
  },
  {
    id: "arcade-console.sessions-and-scores",
    domain: "WTF Arcade, WTF Console, and Game Studio SDK",
    ownerSpec: "tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand: "npm run test:e2e:live:puppets",
    userVisibleAssertion: "Every Console and Arcade catalog game can start a playable session.",
    durableSideEffectAssertion:
      "The harness posts score submissions using run tickets for every catalog slug that exposes a score path.",
  },
  {
    id: "desktop.settings-events-pet",
    domain: "Desktop OS, Navigation, and Personal Environment",
    ownerSpec: "tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand: "npm run test:e2e:live:puppets",
    userVisibleAssertion: "A contestant can update desktop appearance/layout and use desktop pet actions.",
    durableSideEffectAssertion:
      "The harness writes desktop settings, reloads them through a fresh read, records a desktop event with an event id, and confirms the pet action appears in live pet event history.",
  },
  {
    id: "w.groupchat-readonly-config-source",
    domain: "Community, Social, Messaging, and Discord",
    ownerSpec: "tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand: "npm run test:e2e:live:puppets",
    userVisibleAssertion: "W users can read the configured Gameshow groupchat mirror without a send surface.",
    durableSideEffectAssertion:
      "The harness asserts the groupchat API is read-only, personal DM writes are disabled, and admin diagnostics expose the active config source.",
  },
  {
    id: "routes.all-registered-pages-open",
    domain: "Desktop OS, Navigation, and Personal Environment",
    ownerSpec: "tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand: "npm run test:e2e:live:puppets",
    userVisibleAssertion: "Every registered route fixture renders a visible body without an app crash.",
    durableSideEffectAssertion:
      "Authenticated and admin-only routes are opened through the seeded actor sessions that match their access requirements.",
  },
  {
    id: "domains.api-probes-and-route-loops",
    domain: "Administration, Governance, and Operations",
    ownerSpec: "tests/playwright/live/puppet-orchestration.spec.mjs",
    verificationCommand: "npm run test:e2e:live:puppets",
    userVisibleAssertion: "Every canonical domain workflow opens its representative user routes.",
    durableSideEffectAssertion:
      "Every domain workflow runs its owned API probes against a real server/database session with expected status contracts.",
  },
];

export function assertBehaviorAssertions(assertions = CORE_BEHAVIOR_ASSERTIONS) {
  const failures = [];
  const seen = new Set();
  for (const assertion of assertions) {
    if (!assertion?.id) failures.push("Behavior assertion is missing an id.");
    if (assertion?.id && seen.has(assertion.id)) {
      failures.push(`Duplicate behavior assertion id: ${assertion.id}`);
    }
    if (assertion?.id) seen.add(assertion.id);
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
  return failures;
}
