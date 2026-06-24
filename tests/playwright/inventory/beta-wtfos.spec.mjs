import { expect, test } from "@playwright/test";

async function setHarnessState(request, state = {}) {
  const res = await request.post("/__test/state", { data: state });
  expect(res.ok()).toBeTruthy();
}

async function openResearchDeck(page) {
  const vault = page.locator("[data-beta-research-vault]");
  if ((await vault.getAttribute("open")) === null) {
    await page.locator("[data-beta-research-open]").click();
  }
  await expect(vault).toHaveAttribute("open", "");
}

test.describe("interaction inventory - WTFOS beta hub", () => {
  test("answers first-minute questions and exposes the unlock loop", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "anonymous" });
    await page.goto("/beta", { waitUntil: "domcontentloaded" });

    await expect(page.locator("[data-beta-wtfos]")).toBeVisible();
    await expect(page.locator("[data-beta-system-chrome]")).toContainText("Role");
    await expect(page.locator("[data-beta-system-chrome]")).toContainText("Signals");
    await expect(page.locator("[data-beta-system-command]")).toContainText("Sign In");
    await expect(page.locator("[data-beta-product-home]")).toContainText("WTFOS is moving.");
    await expect(page.locator("[data-beta-product-home]")).toContainText("quest, people, object, return");
    await expect(page.locator("[data-beta-session-contract]")).toContainText("Guest preview");
    await expect(page.locator("[data-beta-session-contract]")).toContainText("Launch");
    await expect(page.locator("[data-beta-session-contract]")).toContainText("Sign in to start");
    await expect(page.locator("[data-beta-mission-deck]")).toContainText("Active window");
    await expect(page.locator("[data-beta-product-pulse]")).toContainText("EXP floor");
    await expect(page.locator("[data-beta-product-path]")).toHaveCount(6);
    await expect(page.locator("[data-beta-persona-role-deck]")).toContainText("Safe start");
    await expect(page.locator("[data-beta-persona-role-deck]")).toContainText("Object hunt");
    await expect(page.locator("[data-beta-persona-role-deck]")).toContainText("Make path");
    await expect(page.locator("[data-beta-persona-role-deck]")).toContainText("Social path");
    await expect(page.locator("[data-beta-progression-card]")).toContainText("Challenge");
    await expect(page.locator("[data-beta-progression-card]")).toContainText("Unlock rule");
    await expect(page.locator("[data-beta-product-current-path]")).toContainText("Current command");
    await expect(page.locator("[data-beta-product-current-path]")).toContainText("Sign in to launch");
    await expect(page.locator("[data-beta-command-pulse-action]")).toHaveCount(3);
    for (const label of ["People moving", "Fresh object", "Return hook"]) {
      await expect(page.locator("[data-beta-command-pulse]")).toContainText(label);
    }
    await expect(page.locator("[data-beta-console-live-action]")).toHaveCount(3);
    for (const label of ["People moving", "Fresh object", "Return hook"]) {
      await expect(page.locator("[data-beta-console-live-rail]")).toContainText(label);
    }
    await expect(page.locator("[data-beta-product-quest-stage]")).toHaveCount(5);
    for (const label of ["Notice", "Act", "Prove", "Unlock", "Return"]) {
      await expect(page.locator("[data-beta-product-quest-ribbon]")).toContainText(label);
    }
    await expect(page.locator("[data-beta-product-signal-strip]")).toContainText("live public signals");
    await expect(page.locator("[data-beta-session-console]")).toContainText("Command dock");
    await expect(page.locator("[data-beta-first-screen-loop]")).toContainText("Sign in to launch");
    await expect(page.locator("[data-beta-first-screen-loop-action]")).toHaveCount(3);
    for (const label of ["Sign in to launch", "Open people", "Resume later"]) {
      await expect(page.locator("[data-beta-first-screen-loop]")).toContainText(label);
    }
    await expect(page.locator("[data-beta-hero-world-stage]")).toContainText("People moving");
    await expect(page.locator("[data-beta-hero-world-pulse-cell]")).toHaveCount(3);
    for (const label of ["People moving", "Fresh object", "Return hook"]) {
      await expect(page.locator("[data-beta-hero-world-pulse]")).toContainText(label);
    }
    for (const label of ["Open people", "Inspect object", "Set return"]) {
      await expect(page.locator("[data-beta-hero-world-pulse]")).toContainText(label);
    }
    await expect(page.locator("[data-beta-playable-desk]")).toContainText("Choose a door.");
    await expect(page.locator("[data-beta-playable-stat]")).toHaveCount(3);
    await expect(page.locator("[data-beta-live-desktop]")).toBeVisible();
    await expect(page.locator("[data-beta-return-status]")).toContainText("Resume");
    await expect(page.locator("[data-beta-return-status]")).toContainText("What changed");
    await expect(page.locator("[data-beta-return-status]")).toContainText("Today");
    await expect(page.locator("[data-beta-playable-current-quest]")).toContainText("Sign in to launch");
    await expect(page.locator("[data-beta-human-pulse]")).toContainText("People are here.");
    await expect(page.locator("[data-beta-human-pulse-card]")).toHaveCount(4);
    await expect(page.locator("[data-beta-world-lane]")).toHaveCount(5);
    for (const label of ["Quest", "People", "Discover", "Tomorrow", "The Count"]) {
      await expect(page.locator("[data-beta-world-lanes]")).toContainText(label);
    }
    await expect(page.locator("[data-beta-answer]")).toHaveCount(5);
    await expect(page.locator("[data-beta-research-vault]")).not.toHaveAttribute("open", "");
    await page.locator("[data-beta-research-open]").click();
    await expect(page.locator("[data-beta-research-vault]")).toHaveAttribute("open", "");
    await expect(page.locator("[data-beta-research-summary]")).toContainText("Admin lab");
    await expect(page.locator("[data-beta-design-critic-gate]")).toContainText("5/5 A+");
    await expect(page.locator("[data-beta-design-critic-review]")).toHaveCount(5);
    await expect(page.locator("[data-beta-home-action]")).toHaveCount(6);
    for (const label of ["First level", "People moving", "Fresh objects", "Project", "Tomorrow", "The Count"]) {
      await expect(page.locator("[data-beta-home-actions]")).toContainText(label);
    }
    await expect(page.locator('[data-beta-home-action-key="collect"]')).toContainText("Gallery");
    await expect(page.locator('[data-beta-home-action-key="count"]')).toContainText("Admin");
    await expect(page.getByText("What is WTFOS?")).toBeVisible();
    await expect(page.getByText("What can I do here?")).toBeVisible();
    await expect(page.getByText("What should I do first?", { exact: true })).toBeVisible();
    await expect(page.getByText("Why return tomorrow?")).toBeVisible();
    await expect(page.locator("[data-beta-wayfinder]")).toContainText("First-Minute Wayfinder");
    await expect(page.locator("[data-beta-wayfinder-action]")).toHaveCount(8);
    for (const label of ["Safe first win", "People now", "Object hunt", "Creator runway", "Builder output", "Choose my path", "Find a tool", "Count review"]) {
      await expect(page.locator("[data-beta-wayfinder]")).toContainText(label);
    }
    await expect(page.locator('[data-beta-wayfinder-section="beta-atlas"]')).toHaveCount(1);
    await expect(page.locator('[data-beta-wayfinder-section="beta-count"]')).toHaveCount(1);
    await expect(page.locator("[data-beta-section-compass]")).toContainText("Beta Section Compass");
    await expect(page.locator("[data-beta-section-compass-card]")).toHaveCount(14);
    await expect(page.locator("[data-beta-section-compass-jump]")).toHaveCount(14);
    for (const label of ["Read-only now signals", "Public proof board", "People discovery", "Attention triage", "Daily return board", "Unlock passports", "Unlock questlines", "Governance matrix", "App relationship navigator", "Route group guide", "Discovery trails", "Puppet paths", "Count runbook", "App visibility atlas"]) {
      await expect(page.locator("[data-beta-section-compass]")).toContainText(label);
    }
    await page.locator('[data-beta-section-compass-section="beta-people"] [data-beta-section-compass-jump]').click();
    await expect(page).toHaveURL(/\/beta#beta-people$/);
    await expect(page.locator("[data-beta-people-discovery-board]")).toBeInViewport();
    await expect(page.locator("[data-beta-unlock-loop]")).toContainText("Discovery Unlocks");
    await expect(page.locator("[data-beta-unlock-loop]")).toContainText(/side quests/i);
    await expect(page.locator("[data-beta-unlock-loop]")).toContainText(/challenges/i);
    await expect(page.locator("[data-beta-unlock-loop]")).toContainText("EXP");
    await expect(page.locator("[data-beta-now-signals]")).toContainText("Read-Only Now Signals");
    await expect(page.locator("[data-beta-now-signal]")).toHaveCount(12);
    await expect(page.locator("[data-beta-protected-signal]")).toHaveCount(3);
    await expect(page.locator("[data-beta-now-signals]")).toContainText("Trade-board objects");
    await expect(page.locator("[data-beta-now-signals]")).toContainText("Profile activity");
    await expect(page.locator("[data-beta-now-signals]")).toContainText("WTF LIVE room");
    await expect(page.locator("[data-beta-now-signals]")).toContainText("Upcoming events");
    await expect(page.locator("[data-beta-now-signals]")).toContainText("WTF TV channels");
    await expect(page.locator("[data-beta-public-proof-board]")).toContainText("Public Proof Board");
    await expect(page.locator("[data-beta-public-proof-card]")).toHaveCount(4);
    await expect(page.locator('[data-beta-public-proof-state="Live"]')).toHaveCount(2);
    await expect(page.locator('[data-beta-public-proof-state="Quiet"]')).toHaveCount(2);
    for (const label of ["Fresh object", "Creator channel", "Playable project", "Builder output"]) {
      await expect(page.locator("[data-beta-public-proof-board]")).toContainText(label);
    }
    await expect(page.locator("[data-beta-public-proof-board]")).toContainText("Trade-board objects + Market listings");
    await expect(page.locator("[data-beta-public-proof-board]")).toContainText("Console discovery");
    await expect(page.locator("[data-beta-creator-proof-ladder]")).toContainText("Creator Project Proof Ladder");
    await expect(page.locator("[data-beta-creator-proof-step]")).toHaveCount(7);
    await expect(page.locator("[data-beta-creator-proof-signal]")).toHaveCount(21);
    await expect(page.locator('[data-beta-creator-proof-status="visible"]')).toHaveCount(3);
    await expect(page.locator('[data-beta-creator-proof-status="inspect"]')).toHaveCount(3);
    await expect(page.locator('[data-beta-creator-proof-status="gated"]')).toHaveCount(1);
    for (const label of ["Workspace draft", "Asset prep", "Package drop", "Durable media", "Media channel", "Project output", "Broadcast signal"]) {
      await expect(page.locator("[data-beta-creator-proof-ladder]")).toContainText(label);
    }
    for (const label of ["Current limit", "Next dependency", "Gate boundary", "No-write boundary", "Open owner surface"]) {
      await expect(page.locator("[data-beta-creator-proof-ladder]")).toContainText(label);
    }
    await expect(page.locator('[data-beta-creator-proof-key="package-drop"]')).toContainText("Role gated");
    await expect(page.locator('[data-beta-creator-proof-key="package-drop"]')).toContainText("EXP and levels are evidence");
    await expect(page.locator('[data-beta-creator-proof-key="media-channel"]')).toContainText("public channel proof can be read");
    await expect(page.locator("[data-beta-people-discovery-board]")).toContainText("People Discovery Board");
    await expect(page.locator("[data-beta-people-discovery-card]")).toHaveCount(8);
    await expect(page.locator("[data-beta-people-discovery-signal]")).toHaveCount(24);
    for (const label of ["Active users", "New users", "Creators", "Collectors", "Builders", "Curators", "Collaborators", "Interesting wallets"]) {
      await expect(page.locator("[data-beta-people-discovery-board]")).toContainText(label);
    }
    for (const label of ["Why care", "Next action", "Quiet fallback", "visible proof"]) {
      await expect(page.locator("[data-beta-people-discovery-board]")).toContainText(label);
    }
    await expect(page.locator('[data-beta-people-discovery-key="collaborators"]')).toContainText("Room presence");
    await expect(page.locator('[data-beta-people-discovery-key="creators"]')).toContainText("TV channels");
    await expect(page.locator("[data-beta-people-proof-gaps]")).toContainText("People Proof Gap Matrix");
    await expect(page.locator("[data-beta-people-proof-gap]")).toHaveCount(8);
    await expect(page.locator("[data-beta-people-proof-gap-signal]")).toHaveCount(24);
    await expect(page.locator('[data-beta-people-proof-gap-status="direct"]')).toHaveCount(4);
    await expect(page.locator('[data-beta-people-proof-gap-status="routed"]')).toHaveCount(3);
    await expect(page.locator('[data-beta-people-proof-gap-status="weak"]')).toHaveCount(1);
    for (const label of ["Current weakness", "Next beta move", "No-write boundary", "No beta write", "Open proof route"]) {
      await expect(page.locator("[data-beta-people-proof-gaps]")).toContainText(label);
    }
    await expect(page.locator('[data-beta-people-proof-gap-key="curators"]')).toContainText("least direct human signal");
    await expect(page.locator('[data-beta-people-proof-gap-key="collaborators"]')).toContainText("Sign-in step");
    await expect(page.locator('[data-beta-people-proof-gap-key="interesting-wallets"]')).toContainText("never links wallets");
    await expect(page.locator("[data-beta-attention-triage-board]")).toContainText("Attention Triage Board");
    await expect(page.locator("[data-beta-attention-card]")).toHaveCount(7);
    await expect(page.locator("[data-beta-attention-signal]")).toHaveCount(21);
    for (const label of ["First safe action", "People moving now", "Collector heat check", "Creator recovery", "Play or inspect output", "Tomorrow catch-up", "Count hot queue"]) {
      await expect(page.locator("[data-beta-attention-triage-board]")).toContainText(label);
    }
    await expect(page.locator('[data-beta-attention-cadence="now"]')).toHaveCount(2);
    await expect(page.locator('[data-beta-attention-cadence="next"]')).toHaveCount(3);
    await expect(page.locator('[data-beta-attention-cadence="tomorrow"]')).toHaveCount(1);
    await expect(page.locator('[data-beta-attention-cadence="admin"]')).toHaveCount(1);
    await expect(page.locator("[data-beta-attention-triage-board]")).toContainText("Quiet fallback");
    await expect(page.locator("[data-beta-attention-triage-board]")).toContainText("The Count controls");
    await expect(page.locator("[data-beta-attention-triage-board]")).toContainText("protected and quiet signals");
    await expect(page.locator("[data-beta-daily-return-board]")).toContainText("Daily Return Board");
    await expect(page.locator("[data-beta-daily-return-card]")).toHaveCount(6);
    await expect(page.locator('[data-beta-daily-return-access="public"]')).toHaveCount(1);
    await expect(page.locator('[data-beta-daily-return-access="admin"]')).toHaveCount(1);
    for (const label of ["Check what changed", "Complete one quest", "See people moving", "Find one object", "Move one project forward", "Review one liveops queue"]) {
      await expect(page.locator("[data-beta-daily-return-board]")).toContainText(label);
    }
    await expect(page.locator("[data-beta-daily-return-board]")).toContainText("EXP");
    await expect(page.locator("[data-beta-daily-return-board]")).toContainText("The Count controls");
    await expect(page.locator("[data-beta-daily-return-board]")).toContainText("/admin");
    await expect(page.locator("[data-beta-daily-return-board]")).toContainText("/side-quests");
    await expect(page.locator("[data-beta-unlock-passport-board]")).toContainText("Unlock Passport");
    await expect(page.locator("[data-beta-unlock-passport-card]")).toHaveCount(7);
    await expect(page.locator('[data-beta-unlock-passport-access="public"]')).toHaveCount(2);
    await expect(page.locator('[data-beta-unlock-passport-access="admin"]')).toHaveCount(1);
    for (const label of ["New Tezos User Passport", "Collector Passport", "Creator Passport", "Builder Passport", "Curator Passport", "Community Passport", "Count Operator Passport"]) {
      await expect(page.locator("[data-beta-unlock-passport-board]")).toContainText(label);
    }
    for (const label of ["Visible now", "Next safe action", "Proof needed", "Unlocks next", "Stays locked", "The Count reviews", "Return tomorrow"]) {
      await expect(page.locator("[data-beta-unlock-passport-board]")).toContainText(label);
    }
    await expect(page.locator("[data-beta-unlock-passport-board]")).toContainText("EXP");
    await expect(page.locator("[data-beta-unlock-passport-board]")).toContainText("roles");
    await expect(page.locator("[data-beta-unlock-passport-board]")).toContainText("permissions");
    await expect(page.locator("[data-beta-unlock-questline-board]")).toContainText("Unlock Questline Board");
    await expect(page.locator("[data-beta-unlock-questline-card]")).toHaveCount(7);
    await expect(page.locator("[data-beta-unlock-questline-stage]")).toHaveCount(35);
    for (const label of ["First safe win", "Collector path", "Creator runway", "Builder proving ground", "Curator signal chain", "Community pulse", "Count liveops review"]) {
      await expect(page.locator("[data-beta-unlock-questline-board]")).toContainText(label);
    }
    await expect(page.locator("[data-beta-unlock-questline-board]")).toContainText("Side quest");
    await expect(page.locator("[data-beta-unlock-questline-board]")).toContainText("Challenge");
    await expect(page.locator("[data-beta-unlock-questline-board]")).toContainText("Reward");
    await expect(page.locator("[data-beta-unlock-questline-board]")).toContainText("Role or permission");
    await expect(page.locator("[data-beta-unlock-questline-board]")).toContainText("The Count review");
    await expect(page.locator("[data-beta-unlock-questline-board]")).toContainText("Abuse guard");
    await expect(page.locator("[data-beta-unlock-governance-matrix]")).toContainText("Unlock Governance Matrix");
    await expect(page.locator("[data-beta-unlock-governance-card]")).toHaveCount(7);
    await expect(page.locator('[data-beta-unlock-governance-access="public"]')).toHaveCount(2);
    await expect(page.locator('[data-beta-unlock-governance-access="admin"]')).toHaveCount(1);
    for (const label of ["Starter witness", "Collector readiness", "Creator unlock review", "Builder surface access", "Curator signal review", "Community participation", "Operator governance"]) {
      await expect(page.locator("[data-beta-unlock-governance-matrix]")).toContainText(label);
    }
    await expect(page.locator("[data-beta-unlock-governance-matrix]")).toContainText("EXP signal");
    await expect(page.locator("[data-beta-unlock-governance-matrix]")).toContainText("Reward or market sink");
    await expect(page.locator("[data-beta-unlock-governance-matrix]")).toContainText("Role boundary");
    await expect(page.locator("[data-beta-unlock-governance-matrix]")).toContainText("The Count decides");
    await expect(page.locator("[data-beta-unlock-governance-matrix]")).toContainText("Anti-farm guard");
    await expect(page.locator("[data-beta-relationship-navigator]")).toContainText("App Relationship Navigator");
    await expect(page.locator("[data-beta-relationship-chain]")).toHaveCount(8);
    await expect(page.locator("[data-beta-relationship-step]")).toHaveCount(43);
    for (const label of ["First safe win chain", "Collector context chain", "Creator publish chain", "Builder output chain", "Curator signal chain", "Community presence chain", "Economy spend chain", "Count liveops chain"]) {
      await expect(page.locator("[data-beta-relationship-navigator]")).toContainText(label);
    }
    for (const label of ["Comes before", "Consumes", "Feeds into", "Comes after", "The Count watches"]) {
      await expect(page.locator("[data-beta-relationship-navigator]")).toContainText(label);
    }
    await expect(page.locator('[data-beta-relationship-key="creator-publish-chain"]')).toContainText("Studio");
    await expect(page.locator('[data-beta-relationship-key="creator-publish-chain"]')).toContainText("IPFS Pinning");
    await expect(page.locator('[data-beta-relationship-key="economy-spend-chain"]')).toContainText("WTFIAM");
    await expect(page.locator('[data-beta-relationship-key="count-liveops-chain"]')).toContainText("Admin only / /admin");
    await expect(page.locator("[data-beta-route-group-guide]")).toContainText("Route Group Guide");
    await expect(page.locator("[data-beta-route-group-card]")).toHaveCount(7);
    await expect(page.locator("[data-beta-route-group-route]")).toHaveCount(45);
    await expect(page.locator("[data-beta-route-group-atlas-filter]")).toHaveCount(7);
    for (const label of ["First Win Group", "Collector Economy Group", "Creator Pipeline Group", "Builder Output Group", "Curator Signal Group", "Community Comms Group", "Count Liveops Group"]) {
      await expect(page.locator("[data-beta-route-group-guide]")).toContainText(label);
    }
    for (const label of ["Use first", "Use next", "Proof to look for", "Quiet rule", "The Count watches"]) {
      await expect(page.locator("[data-beta-route-group-guide]")).toContainText(label);
    }
    await expect(page.locator('[data-beta-route-group-key="creator-pipeline"]')).toContainText("Studio");
    await expect(page.locator('[data-beta-route-group-key="collector-economy"]')).toContainText("Trade Boards");
    await expect(page.locator('[data-beta-route-group-key="count-liveops"]')).toContainText("do not invent work");
    await page.locator('[data-beta-route-group-key="creator-pipeline"] [data-beta-route-group-atlas-filter]').click();
    await expect(page.locator("[data-beta-app-atlas-summary]")).toContainText("Create");
    await expect(page.locator("[data-beta-app-atlas-summary]")).toContainText("Creator");
    await expect(page.locator("[data-beta-discovery-trails]")).toContainText("Discovery Trails");
    await expect(page.locator("[data-beta-discovery-trail]")).toHaveCount(5);
    await expect(page.locator("[data-beta-discovery-step]")).toHaveCount(25);
    await expect(page.locator("[data-beta-trail-live-strip]")).toHaveCount(5);
    await expect(page.locator("[data-beta-trail-live-snippet]")).toHaveCount(12);
    await expect(page.locator("[data-beta-trail-state-panel]")).toHaveCount(5);
    await expect(page.locator("[data-beta-trail-state-row]")).toHaveCount(20);
    await expect(page.locator("[data-beta-discovery-trails]")).toContainText("Quiet data");
    await expect(page.locator("[data-beta-discovery-trails]")).toContainText("Protected data");
    await expect(page.locator("[data-beta-discovery-trails]")).toContainText("Unavailable provider");
    await expect(page.locator("[data-beta-discovery-trails]")).toContainText("Admin-only data");
    await expect(page.locator("[data-beta-discovery-trails]")).toContainText("Open proof");
    await expect(page.locator("[data-beta-protected-step-note]")).toHaveCount(18);
    await expect(page.locator("[data-beta-discovery-trails]")).toContainText("Sign-in step");
    await expect(page.locator("[data-beta-discovery-trails]")).toContainText("Admin only");
    await expect(page.locator("[data-beta-social-map]")).toContainText("Communication Map");
    await expect(page.locator("[data-beta-communication-surface]")).toHaveCount(6);
    for (const label of ["W Feed", "WIM", "WTF LIVE", "Digest", "Mail", "Skywire"]) {
      await expect(page.locator("[data-beta-social-map]")).toContainText(label);
    }
    await expect(page.locator("[data-beta-count-admin-summary]")).toContainText("Admin only");
    await expect(page.locator("[data-beta-count-admin-summary-card]")).toHaveCount(6);
    await expect(page.locator('[data-beta-count-admin-summary-state="Locked"]')).toHaveCount(6);
    await expect(page.locator('[data-beta-count-admin-summary-state="Live"]')).toHaveCount(0);
    await expect(page.locator("[data-beta-count-admin-workbench]")).toContainText("Count Admin Workbench");
    await expect(page.locator("[data-beta-count-admin-workflow]")).toHaveCount(8);
    await expect(page.locator("[data-beta-count-admin-check]")).toHaveCount(24);
    for (const label of ["Triage user need", "Create side quest", "Create challenge arc", "Configure reward", "Review role or app gate", "Manage market sink", "Audit automation", "Review visibility"]) {
      await expect(page.locator("[data-beta-count-admin-workbench]")).toContainText(label);
    }
    await expect(page.locator("[data-beta-count-admin-workbench]")).toContainText("Decision gate");
    await expect(page.locator("[data-beta-count-admin-workbench]")).toContainText("Source of truth");
    await expect(page.locator("[data-beta-count-admin-workbench]")).toContainText("Risk control");
    await expect(page.locator("[data-beta-count-admin-workbench]")).toContainText("Success signal");
    await expect(page.locator("[data-beta-count-liveops-recipes]")).toContainText("Count Liveops Recipe Board");
    await expect(page.locator("[data-beta-count-liveops-recipe]")).toHaveCount(6);
    await expect(page.locator("[data-beta-count-liveops-recipe-stage]")).toHaveCount(36);
    for (const label of ["Starter witness recipe", "Creator publish recipe", "Collector market recipe", "Builder surface recipe", "Curator signal recipe", "Community return recipe"]) {
      await expect(page.locator("[data-beta-count-liveops-recipes]")).toContainText(label);
    }
    for (const label of ["EXP use", "Side quest", "Challenge", "Reward", "Role or permission", "Market or notification", "Anti-farm rule", "No beta write"]) {
      await expect(page.locator("[data-beta-count-liveops-recipes]")).toContainText(label);
    }
    await expect(page.locator('[data-beta-count-liveops-recipe-key="creator-publish-recipe"]')).toContainText("Macaroni");
    await expect(page.locator('[data-beta-count-liveops-recipe-key="creator-publish-recipe"]')).toContainText("Role gated / /tools/macaroni");
    await expect(page.locator('[data-beta-count-liveops-recipe-key="collector-market-recipe"]')).toContainText("sale windows");
    await expect(page.locator('[data-beta-count-liveops-recipe-key="builder-surface-recipe"]')).toContainText("Admin only / /admin");
    await expect(page.locator('[data-beta-count-liveops-recipe-key="community-return-recipe"]')).toContainText("notification pressure");
  });

  test("uses The Count as the admin puppet for liveops stories", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "admin", username: "the-count", displayName: "The Count" });
    await page.goto("/beta", { waitUntil: "domcontentloaded" });
    await openResearchDeck(page);

    await expect(page.locator("[data-beta-count-puppet]")).toContainText("The Count");
    await expect(page.locator("[data-beta-count-admin-summary]")).toContainText("Count Admin Summary");
    await expect(page.locator("[data-beta-count-admin-summary-card]")).toHaveCount(6);
    await expect(page.locator('[data-beta-count-admin-summary-state="Live"]')).toHaveCount(6);
    for (const label of ["User needs", "Role gates", "Quest and challenge load", "Reward settlement", "Market operations", "Automation definitions"]) {
      await expect(page.locator("[data-beta-count-admin-summary]")).toContainText(label);
    }
    for (const endpoint of ["/api/admin/users", "/api/admin/role-access", "/api/admin/stats", "/api/admin/reward-ledger?paid=false", "/api/admin/in-app-market/items", "/api/admin/challenge-automation/challenges"]) {
      await expect(page.locator("[data-beta-count-admin-summary]")).toContainText(endpoint);
    }
    await expect(page.locator("[data-beta-count-puppet]")).toContainText("In-App Market");
    await expect(page.locator("[data-beta-count-story]")).toHaveCount(6);
    await expect(page.locator("[data-beta-count-command]")).toHaveCount(6);
    await expect(page.locator("[data-beta-count-puppet]")).toContainText("Roles");
    await expect(page.locator("[data-beta-count-puppet]")).toContainText("Rewards");
    await expect(page.locator("[data-beta-count-puppet]")).toContainText("Automation");
    await expect(page.locator("[data-beta-count-puppet]")).toContainText("Audit a farmable loop before scaling it");
    await expect(page.locator("[data-beta-count-puppet]")).toContainText("Risk control");
    await expect(page.locator("[data-beta-count-liveops-recipes]")).toContainText("Count Liveops Recipe Board");
    await expect(page.locator("[data-beta-count-liveops-recipe]")).toHaveCount(6);
    await expect(page.locator('[data-beta-count-liveops-recipe-actor="creator"]')).toContainText("Trusted creator");
    await expect(page.locator('[data-beta-count-liveops-recipe-actor="collector"]')).toContainText("pricing locks");
    await expect(page.locator('[data-beta-count-liveops-recipe-actor="community-member"]')).toContainText("No beta write");
    await expect(page.locator('[data-beta-count-admin-workflow-key="role-permission-gate"]')).toContainText("EXP and levels remain evidence only");
    await expect(page.locator('[data-beta-count-admin-workflow-key="market-sink-management"]')).toContainText("sale window");
    await expect(page.locator('[data-beta-count-admin-workflow-key="automation-verifier-audit"]')).toContainText("SystemEvent");
    await expect(page.locator('[data-beta-unlock-passport-key="the-count"]')).toContainText("Count Operator Passport");
    await expect(page.locator('[data-beta-unlock-passport-key="the-count"]')).toContainText("Production behavior");
    await expect(page.locator('[data-beta-unlock-passport-key="the-count"]')).toContainText("EXP and levels as evidence");
    await expect(page.locator('[data-beta-unlock-governance-key="the-count"]')).toContainText("Operator governance");
    await expect(page.locator('[data-beta-unlock-governance-key="the-count"]')).toContainText("EXP and levels are evidence for review only");
    await expect(page.locator('[data-beta-unlock-governance-key="the-count"]')).toContainText("manual review");
    await expect(page.locator('[data-beta-relationship-key="count-liveops-chain"]')).toContainText("Count liveops chain");
    await expect(page.locator('[data-beta-relationship-key="count-liveops-chain"]')).toContainText("explicit admin roles");
    await expect(page.locator('[data-beta-relationship-key="count-liveops-chain"]')).toContainText("Record decision");
  });

  test("shows persistent agent loop metrics, visibility radar, and route bridges", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "admin" });
    await page.goto("/beta", { waitUntil: "domcontentloaded" });
    await openResearchDeck(page);

    await expect(page.locator("[data-beta-agent-loop]")).toContainText("Persistent Agent Loop");
    await expect(page.locator("[data-beta-agent-loop]")).toContainText("New User Agent");
    await expect(page.locator("[data-beta-agent-loop]")).toContainText("first success");
    await expect(page.locator("[data-beta-puppet-memory-ledger]")).toContainText("Puppet Memory Ledger");
    await expect(page.locator("[data-beta-puppet-memory-card]")).toHaveCount(6);
    await expect(page.locator("[data-beta-puppet-memory-check]")).toHaveCount(36);
    for (const label of ["New User Agent", "Creator Agent", "Collector Agent", "Curator Agent", "Builder Agent", "Community Agent"]) {
      await expect(page.locator("[data-beta-puppet-memory-ledger]")).toContainText(label);
    }
    for (const label of ["Confusion", "Hesitation", "Dead end", "Abandonment risk", "Delight", "Unexpected discovery", "Remaining friction"]) {
      await expect(page.locator("[data-beta-puppet-memory-ledger]")).toContainText(label);
    }
    await expect(page.locator('[data-beta-puppet-memory-agent="creator"]')).toContainText("Publishing path feels like a sequence");
    await expect(page.locator("[data-beta-retest-snapshots]")).toContainText("Puppet Retest Snapshots");
    await expect(page.locator("[data-beta-retest-summary]")).toContainText("6/6");
    await expect(page.locator("[data-beta-retest-summary]")).toContainText("36 checks under 60s");
    await expect(page.locator("[data-beta-retest-snapshot]")).toHaveCount(6);
    await expect(page.locator("[data-beta-retest-metric]")).toHaveCount(36);
    await expect(page.locator("[data-beta-retest-snapshots]")).toContainText("Production app-name scan");
    await expect(page.locator("[data-beta-retest-snapshots]")).toContainText("Beta guided shell");
    await expect(page.locator("[data-beta-retest-snapshots]")).toContainText("New User Agent");
    await expect(page.locator("[data-beta-retest-snapshots]")).toContainText("saved");
    await expect(page.locator("[data-beta-friction-queue]")).toContainText("Beta Friction Queue");
    await expect(page.locator("[data-beta-friction-queue-card]")).toHaveCount(7);
    await expect(page.locator('[data-beta-friction-queue-status="strengthen"]')).toHaveCount(2);
    await expect(page.locator('[data-beta-friction-queue-status="watch"]')).toHaveCount(4);
    await expect(page.locator('[data-beta-friction-queue-status="keep"]')).toHaveCount(1);
    for (const label of ["People proof gap", "Creator project proof", "Count authority boundary", "Route-name cluster", "Return-loop clarity", "Advanced app value", "Assistant threshold"]) {
      await expect(page.locator("[data-beta-friction-queue]")).toContainText(label);
    }
    await expect(page.locator('[data-beta-friction-queue-key="count-authority-boundary"]')).toContainText("EXP, levels, and role-readiness");
    await expect(page.locator('[data-beta-friction-queue-key="assistant-threshold"]')).toContainText("must never replace navigation");
    await page.locator('[data-beta-friction-queue-key="people-proof-gap"] [data-beta-friction-queue-jump]').click();
    await expect(page).toHaveURL(/\/beta#beta-people$/);
    await expect(page.locator("[data-beta-people-discovery-board]")).toBeInViewport();
    await expect(page.locator("[data-beta-visibility-radar]")).toContainText("Visibility Radar");
    await expect(page.locator("[data-beta-visibility-signal]")).toHaveCount(16);
    await expect(page.locator("[data-beta-visibility-radar]")).toContainText("Active users");
    await expect(page.locator("[data-beta-visibility-radar]")).toContainText("Collaboration opportunities");
    await expect(page.locator("[data-beta-route-bridges]")).toContainText("Route Bridges");
    await expect(page.locator("[data-beta-route-bridge]")).toHaveCount(8);
    await expect(page.locator("[data-beta-route-bridges]")).toContainText("What changed?");
    await expect(page.locator("[data-beta-social-pulse]")).toContainText("Social Pulse");
    await expect(page.locator("[data-beta-notification-group]")).toHaveCount(6);
    await expect(page.locator("[data-beta-notification-event]")).toHaveCount(7);
    for (const label of ["Social attention", "Progress and unlocks", "Live and scheduled moments", "Creator recovery", "Collector and market motion", "Count admin attention"]) {
      await expect(page.locator("[data-beta-social-pulse]")).toContainText(label);
    }
    await expect(page.locator("[data-beta-notification-control-map]")).toContainText("Notification Control Map");
    await expect(page.locator("[data-beta-notification-control-card]")).toHaveCount(6);
    await expect(page.locator("[data-beta-notification-preference-route]")).toHaveCount(6);
    await expect(page.locator("[data-beta-notification-source-contract]")).toHaveCount(6);
    await expect(page.locator("[data-beta-notification-control-map]")).toContainText("System Settings /settings");
    await expect(page.locator("[data-beta-notification-control-map]")).toContainText("Digest /digest");
    await expect(page.locator("[data-beta-notification-control-map]")).toContainText("/api/notifications/preferences");
    await expect(page.locator("[data-beta-notification-control-map]")).toContainText("strict admin gate");
  });

  test("stitches selected puppet paths into route-owned command steps", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "admin", username: "the-count", displayName: "The Count" });
    await page.goto("/beta", { waitUntil: "domcontentloaded" });
    await openResearchDeck(page);

    const commandCenter = page.locator("[data-beta-journey-command-center]");
    await expect(commandCenter).toContainText("Journey command center");
    await expect(commandCenter).toHaveAttribute("data-beta-journey-persona", "new-tezos-user");
    await expect(commandCenter.locator("[data-beta-journey-step]")).toHaveCount(5);
    await expect(commandCenter.locator('[data-beta-journey-step-key="count"]')).toContainText("/admin");
    await expect(commandCenter).toContainText("The Count watches");
    await expect(commandCenter).toContainText("Success");

    await page.locator("[data-beta-puppet-tabs]").getByRole("button", { name: "Creator" }).click();
    await expect(commandCenter).toHaveAttribute("data-beta-journey-persona", "creator");
    await expect(commandCenter).toContainText("Studio");
    await expect(commandCenter).toContainText("Broot");
    await expect(commandCenter).toContainText("IPFS Pinning");
    await expect(commandCenter.locator("[data-beta-journey-step]")).toHaveCount(5);

    await page.locator("[data-beta-puppet-tabs]").getByRole("button", { name: "Collector" }).click();
    await expect(commandCenter).toHaveAttribute("data-beta-journey-persona", "collector");
    await expect(commandCenter).toContainText("Gallery");
    await expect(commandCenter).toContainText("Hoard");
    await expect(commandCenter).toContainText("Rat Race");
  });

  test("wayfinder jumps to existing sections and applies route-owned persona filters", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "admin", username: "the-count", displayName: "The Count" });
    await page.goto("/beta", { waitUntil: "domcontentloaded" });
    await openResearchDeck(page);

    await page.locator('[data-beta-wayfinder-action-key="creator-runway"]').getByRole("button", { name: "Show path" }).click();
    await expect(page.locator("[data-beta-journey-command-center]")).toHaveAttribute("data-beta-journey-persona", "creator");
    await expect(page.locator('[data-beta-persona-card="creator"]')).toBeInViewport();
    await expect(page.locator("[data-beta-app-atlas-summary]")).toContainText("Create");
    await expect(page.locator("[data-beta-app-atlas-summary]")).toContainText("Creator");
    await expect(page.getByLabel("Search beta app atlas")).toHaveValue("Studio");

    await page.locator('[data-beta-wayfinder-action-key="find-tool"]').getByRole("button", { name: "Show path" }).click();
    await expect(page.locator("[data-beta-app-atlas]")).toBeInViewport();
    await expect(page.locator("[data-beta-app-atlas-summary]")).toContainText("all tiers");
    await expect(page.locator("[data-beta-app-atlas-summary]")).toContainText("all stages");
    await expect(page.locator("[data-beta-app-atlas-summary]")).toContainText("all puppet paths");
    await expect(page.getByLabel("Search beta app atlas")).toHaveValue("");

    await page.locator('[data-beta-wayfinder-action-key="count-review"]').getByRole("button", { name: "Show path" }).click();
    await expect(page.locator("[data-beta-count-puppet]")).toBeInViewport();
    await expect(page.locator("[data-beta-count-puppet]")).toContainText("The Count");
    await expect(page.locator("[data-beta-app-atlas-summary]")).toContainText("Hidden Advanced");
    await expect(page.locator("[data-beta-app-atlas-summary]")).toContainText("Operate");
  });

  test("filters the atlas to quest and market discovery surfaces", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "admin" });
    await page.goto("/beta", { waitUntil: "domcontentloaded" });
    await openResearchDeck(page);

    await expect(page.locator("[data-beta-app-atlas]")).toContainText("App Visibility Atlas");
    await expect(page.locator("[data-beta-app-atlas-tier-filter] button")).toHaveCount(6);
    await expect(page.locator("[data-beta-app-atlas-stage-filter] button")).toHaveCount(10);
    await expect(page.locator("[data-beta-app-atlas-persona-filter] button")).toHaveCount(7);

    await page.getByLabel("Search beta app atlas").fill("Side Quests");
    await expect(page.locator("[data-beta-app-card]").first()).toContainText("Side Quests");

    await page.getByLabel("Search beta app atlas").fill("market");
    await expect(page.locator("[data-beta-app-card]").first()).toContainText(/Market|Hoard|Rat Race|WTF/i);

    await page.getByRole("button", { name: "Reset atlas filters" }).click();
    await page.locator("[data-beta-app-atlas-tier-filter]").getByRole("button", { name: "Tier 1" }).click();
    await expect(page.locator("[data-beta-app-atlas-summary]")).toContainText("Core Daily Use");
    await expect(page.locator("[data-beta-app-card]").first()).toContainText(/Mission Control|Side Quests|Challenges|Leaderboards/);

    await page.getByRole("button", { name: "Reset atlas filters" }).click();
    await page.locator("[data-beta-app-atlas-stage-filter]").getByRole("button", { name: "Publish" }).click();
    await expect(page.locator("[data-beta-app-atlas-summary]")).toContainText("Publish");
    await expect(page.locator("[data-beta-app-card]").first()).toContainText("Publish");

    await page.getByRole("button", { name: "Reset atlas filters" }).click();
    await page.locator("[data-beta-app-atlas-persona-filter]").getByRole("button", { name: "Creator" }).click();
    await expect(page.locator("[data-beta-app-atlas-summary]")).toContainText("Creator");
    await expect(page.locator("[data-beta-app-atlas]")).toContainText("Studio");

    await page.getByLabel("Search beta app atlas").fill("no-such-existing-route-name");
    await expect(page.locator("[data-beta-app-atlas-empty]")).toContainText("No existing route matches those filters.");
    await expect(page.locator("[data-beta-app-atlas-empty]")).toContainText("Reset atlas filters");
  });
});
