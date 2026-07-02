import { sql } from "drizzle-orm";
import { challengeAutomationDefinitions } from "@shared/schema";
import type { ChallengeRewardAction, ConditionTree } from "../events/types";

/**
 * Reggie's Quest — the wtfOS onboarding questline.
 *
 * Reggie the hamster assistant guides new users from "wtf newbie" to
 * "wtf rockstar". Every user story below is a real side quest registered
 * in the challenge automation engine (`challenge_automation_definitions`),
 * verified by normalized SystemEvents and DB-backed predicates, and
 * rewarded through the standard reward actions.
 *
 * Prerequisite chaining is enforced inside the engine itself: each step's
 * condition tree includes a `reggie.step_completed` predicate per
 * prerequisite, so a step can never auto-complete before its parents.
 * The client additionally reads `prereqStepKeys` from metadata to render
 * locked/available states.
 */

export type ReggieStepCategory =
  | "intro"
  | "identity"
  | "wallets"
  | "system"
  | "social"
  | "creation"
  | "progression"
  | "play"
  | "finale";

export type ReggieQuestStep = {
  seedKey: string;
  stepKey: string;
  title: string;
  description: string;
  route: string;
  actionLabel: string;
  order: number;
  category: ReggieStepCategory;
  prereqStepKeys: string[];
  /** Client-side anchor hint: where Reggie walks when teaching this step. */
  anchorId: string;
  xp: number;
  wtf: number;
  proof: ConditionTree;
};

function prereqPredicates(stepKeys: string[]): ConditionTree[] {
  return stepKeys.map((stepKey) => ({
    id: `prereq:${stepKey}`,
    type: "predicate" as const,
    predicateKey: "reggie.step_completed",
    params: { stepKey },
  }));
}

function checkpointEvent(id: string, checkpoint: string): ConditionTree {
  return {
    id,
    type: "event",
    triggerKey: "reggie.checkpoint.reached",
    eventTypes: ["reggie.checkpoint.reached"],
    comparator: "exists",
    filters: { metadata: { checkpoint } },
  };
}

function eventExists(id: string, eventType: string, threshold?: number): ConditionTree {
  return {
    id,
    type: "event",
    triggerKey: eventType,
    eventTypes: [eventType],
    comparator: threshold && threshold > 1 ? "count_gte" : "exists",
    threshold,
  };
}

function predicateNode(id: string, predicateKey: string, params?: Record<string, unknown>): ConditionTree {
  return { id, type: "predicate", predicateKey, params };
}

function anyOf(id: string, children: ConditionTree[]): ConditionTree {
  return { id, type: "group", operator: "any", children };
}

function allOf(id: string, children: ConditionTree[]): ConditionTree {
  return { id, type: "group", operator: "all", children };
}

export const REGGIE_QUEST_STEPS: ReggieQuestStep[] = [
  // ── Intro lessons ──────────────────────────────────────────────
  {
    seedKey: "reggie_profile_v1",
    stepKey: "profile",
    title: "Reggie's Intro: Make It Yours",
    description:
      "Meet Reggie and set up your wtfOS profile with a display name so the rest of the OS knows who it is talking to.",
    route: "/profile",
    actionLabel: "Open Profile",
    order: 1,
    category: "intro",
    prereqStepKeys: [],
    anchorId: "profile",
    xp: 25,
    wtf: 1,
    proof: predicateNode("profile:ready", "reggie.profile_ready"),
  },
  {
    seedKey: "reggie_quest_hq_v1",
    stepKey: "quest_hq",
    title: "Reggie's Intro: Find Quest HQ",
    description:
      "Let Reggie walk you to the Side Quests and Challenges screens. This is where wtfOS verifies your progress and where rewards get claimed.",
    route: "/side-quests",
    actionLabel: "Visit Quest HQ",
    order: 2,
    category: "intro",
    prereqStepKeys: ["profile"],
    anchorId: "side-quests",
    xp: 25,
    wtf: 1,
    proof: allOf("quest-hq:visits", [
      ...prereqPredicates(["profile"]),
      checkpointEvent("quest-hq:side-quests", "side-quests"),
      checkpointEvent("quest-hq:challenges", "challenges"),
    ]),
  },

  // ── Identity ───────────────────────────────────────────────────
  {
    seedKey: "reggie_pfp_v1",
    stepKey: "pfp",
    title: "Face Reveal: Assign a PFP",
    description:
      "Give your account a face. Upload an avatar or assign an owned token as your wtfOS PFP from the Profile screen.",
    route: "/profile",
    actionLabel: "Set PFP",
    order: 3,
    category: "identity",
    prereqStepKeys: ["profile"],
    anchorId: "profile",
    xp: 30,
    wtf: 1,
    proof: allOf("pfp:root", [
      ...prereqPredicates(["profile"]),
      predicateNode("pfp:set", "reggie.pfp_set"),
    ]),
  },
  {
    seedKey: "reggie_x_link_v1",
    stepKey: "x_link",
    title: "Identity Proof: Link X",
    description:
      "Link your X account through the verified OAuth flow so your wtfOS identity carries your social receipts.",
    route: "/profile",
    actionLabel: "Link X",
    order: 4,
    category: "identity",
    prereqStepKeys: ["profile"],
    anchorId: "profile",
    xp: 40,
    wtf: 2,
    proof: allOf("x-link:root", [
      ...prereqPredicates(["profile"]),
      predicateNode("x-link:verified", "reggie.x_linked"),
    ]),
  },
  {
    seedKey: "reggie_bsky_link_v1",
    stepKey: "bsky_link",
    title: "Identity Proof: Link Bluesky",
    description:
      "Connect a Bluesky (AT Protocol) account so wtfOS can bridge your identity into the atmosphere.",
    route: "/profile",
    actionLabel: "Link Bluesky",
    order: 5,
    category: "identity",
    prereqStepKeys: ["profile"],
    anchorId: "profile",
    xp: 40,
    wtf: 2,
    proof: allOf("bsky-link:root", [
      ...prereqPredicates(["profile"]),
      predicateNode("bsky-link:linked", "reggie.bsky_linked"),
    ]),
  },
  {
    seedKey: "reggie_wallet_v1",
    stepKey: "wallet",
    title: "Identity Proof: Connect a Tezos Wallet",
    description:
      "Prove ownership of a Tezos wallet with a signed challenge. This unlocks asset indexing, rewards cashout, and the on-chain half of wtfOS.",
    route: "/profile",
    actionLabel: "Connect Wallet",
    order: 6,
    category: "wallets",
    prereqStepKeys: ["profile"],
    anchorId: "profile",
    xp: 50,
    wtf: 3,
    proof: allOf("wallet:root", [
      ...prereqPredicates(["profile"]),
      anyOf("wallet:any", [
        eventExists("wallet:event", "user.wallet.connected"),
        predicateNode("wallet:db", "reggie.tezos_wallet_connected"),
      ]),
    ]),
  },
  {
    seedKey: "reggie_did_claim_v1",
    stepKey: "did_claim",
    title: "Claim Your wtfos.me DID",
    description:
      "Claim a wtfos.me handle so your decentralized identity resolves through WTF-hosted infrastructure.",
    route: "/wtf-subdomains",
    actionLabel: "Claim DID",
    order: 7,
    category: "identity",
    prereqStepKeys: ["bsky_link"],
    anchorId: "wtf-subdomains",
    xp: 60,
    wtf: 3,
    proof: allOf("did:root", [
      ...prereqPredicates(["bsky_link"]),
      predicateNode("did:claimed", "reggie.wtfosme_claimed"),
    ]),
  },
  {
    seedKey: "reggie_wtf_tez_v1",
    stepKey: "wtf_tez",
    title: "Claim Your wtf.tez Subdomain",
    description:
      "Register a personal subdomain under wtf.tez so your wallet answers to a name instead of a tz-address.",
    route: "/wtf-subdomains",
    actionLabel: "Claim Subdomain",
    order: 8,
    category: "identity",
    prereqStepKeys: ["wallet"],
    anchorId: "wtf-subdomains",
    xp: 60,
    wtf: 3,
    proof: allOf("wtftez:root", [
      ...prereqPredicates(["wallet"]),
      predicateNode("wtftez:claimed", "reggie.wtftez_claimed"),
    ]),
  },
  {
    seedKey: "reggie_multi_wallet_v1",
    stepKey: "multi_wallet",
    title: "Wallet Wrangler: Multi-Wallet + Primary",
    description:
      "Connect a second Tezos wallet and mark one as primary. Primary wallet decides where cashouts land.",
    route: "/profile",
    actionLabel: "Manage Wallets",
    order: 9,
    category: "wallets",
    prereqStepKeys: ["wallet"],
    anchorId: "profile",
    xp: 60,
    wtf: 3,
    proof: allOf("multi-wallet:root", [
      ...prereqPredicates(["wallet"]),
      predicateNode("multi-wallet:db", "reggie.multi_wallet_primary"),
    ]),
  },
  {
    seedKey: "reggie_etherlink_v1",
    stepKey: "etherlink",
    title: "Cross the Bridge: Etherlink Wallet",
    description:
      "Connect an Etherlink (EVM) wallet with a signed challenge so wtfOS can index your EVM side too.",
    route: "/profile",
    actionLabel: "Connect Etherlink",
    order: 10,
    category: "wallets",
    prereqStepKeys: ["wallet"],
    anchorId: "profile",
    xp: 60,
    wtf: 3,
    proof: allOf("etherlink:root", [
      ...prereqPredicates(["wallet"]),
      predicateNode("etherlink:db", "reggie.etherlink_connected"),
    ]),
  },

  // ── System / desktop ───────────────────────────────────────────
  {
    seedKey: "reggie_appearance_v1",
    stepKey: "appearance",
    title: "Redecorate: System Appearance",
    description:
      "Open the Theme Builder and change the wtfOS appearance — style grammar, colors, or a font pack. Make the desktop yours.",
    route: "/desktop-settings",
    actionLabel: "Open Theme Builder",
    order: 11,
    category: "system",
    prereqStepKeys: ["quest_hq"],
    anchorId: "desktop-settings",
    xp: 30,
    wtf: 1,
    proof: allOf("appearance:root", [
      ...prereqPredicates(["quest_hq"]),
      anyOf("appearance:any", [
        eventExists("appearance:updated", "desktop.appearance.updated"),
        eventExists("appearance:font", "desktop.font_pack.updated"),
      ]),
    ]),
  },
  {
    seedKey: "reggie_navigator_v1",
    stepKey: "navigator",
    title: "OS Navigator",
    description:
      "Learn the desktop: open an app from an icon or the Start menu, then finish Reggie's navigation tour of windows, taskbar, and the command palette.",
    route: "/",
    actionLabel: "Take the Tour",
    order: 12,
    category: "system",
    prereqStepKeys: ["quest_hq"],
    anchorId: "start-button",
    xp: 30,
    wtf: 1,
    proof: allOf("navigator:root", [
      ...prereqPredicates(["quest_hq"]),
      eventExists("navigator:icon", "desktop.icon.opened"),
      checkpointEvent("navigator:tour", "navigation"),
    ]),
  },
  {
    seedKey: "reggie_pet_adopt_v1",
    stepKey: "pet_adopt",
    title: "Adopt a Desktop Pet",
    description:
      "Enable the desktop pet in settings and give it its first interaction. Every OS needs a hamster. Reggie insists he is not jealous.",
    route: "/desktop-settings",
    actionLabel: "Adopt Pet",
    order: 13,
    category: "system",
    prereqStepKeys: ["quest_hq"],
    anchorId: "desktop-settings",
    xp: 30,
    wtf: 1,
    proof: allOf("pet-adopt:root", [
      ...prereqPredicates(["quest_hq"]),
      eventExists("pet-adopt:interact", "desktop.pet.interacted"),
    ]),
  },
  {
    seedKey: "reggie_pet_care_v1",
    stepKey: "pet_care",
    title: "Pet Parent: Keep It Alive",
    description:
      "Care for your desktop pet — feed, water, clean, play. Rack up five care interactions and prove you are not a monster.",
    route: "/",
    actionLabel: "Care for Pet",
    order: 14,
    category: "system",
    prereqStepKeys: ["pet_adopt"],
    anchorId: "pet-tray",
    xp: 40,
    wtf: 2,
    proof: allOf("pet-care:root", [
      ...prereqPredicates(["pet_adopt"]),
      eventExists("pet-care:count", "desktop.pet.interacted", 5),
    ]),
  },

  // ── Social / comms ─────────────────────────────────────────────
  {
    seedKey: "reggie_wim_v1",
    stepKey: "wim",
    title: "Slide Into WIM",
    description:
      "Open WIM, the wtfOS instant messenger, and send a message to another user. Talking to Reggie does not count. He checked.",
    route: "/wim",
    actionLabel: "Open WIM",
    order: 15,
    category: "social",
    prereqStepKeys: ["quest_hq"],
    anchorId: "wim",
    xp: 40,
    wtf: 2,
    proof: allOf("wim:root", [
      ...prereqPredicates(["quest_hq"]),
      anyOf("wim:any", [
        eventExists("wim:client", "wim.message.sent"),
        eventExists("wim:dm", "dm.message.sent"),
      ]),
    ]),
  },
  {
    seedKey: "reggie_live_room_v1",
    stepKey: "live_room",
    title: "Go Live: WTF LIVE Rooms",
    description:
      "Jump into WTF LIVE — rooms with text, voice, video, and screen share. Send a room message or spin up a room of your own.",
    route: "/live",
    actionLabel: "Enter WTF LIVE",
    order: 16,
    category: "social",
    prereqStepKeys: ["wim"],
    anchorId: "wtf-live",
    xp: 50,
    wtf: 2,
    proof: allOf("live-room:root", [
      ...prereqPredicates(["wim"]),
      anyOf("live-room:any", [
        eventExists("live-room:message", "atproto.room.message_sent"),
        predicateNode("live-room:owner", "reggie.live_room_owner"),
      ]),
    ]),
  },
  {
    seedKey: "reggie_calendar_v1",
    stepKey: "calendar",
    title: "Time Lord: The Calendar",
    description:
      "Visit the wtfOS Calendar with Reggie and learn where rounds, events, stages, and community happenings get listed.",
    route: "/calendar",
    actionLabel: "Open Calendar",
    order: 17,
    category: "play",
    prereqStepKeys: ["quest_hq"],
    anchorId: "calendar",
    xp: 25,
    wtf: 1,
    proof: allOf("calendar:root", [
      ...prereqPredicates(["quest_hq"]),
      checkpointEvent("calendar:visit", "calendar"),
    ]),
  },
  {
    seedKey: "reggie_live_stage_v1",
    stepKey: "live_stage",
    title: "Stage Manager: Host a WTF LIVE Stage",
    description:
      "Set up a WTF LIVE stage with speakers, guests, and an audience — then submit it to the calendar so people actually show up.",
    route: "/live",
    actionLabel: "Set Up Stage",
    order: 18,
    category: "social",
    prereqStepKeys: ["live_room", "calendar"],
    anchorId: "wtf-live",
    xp: 80,
    wtf: 5,
    proof: allOf("live-stage:root", [
      ...prereqPredicates(["live_room", "calendar"]),
      predicateNode("live-stage:owner", "reggie.live_stage_owner"),
      predicateNode("live-stage:calendar", "reggie.calendar_ticket_submitted"),
    ]),
  },
  {
    seedKey: "reggie_skywire_v1",
    stepKey: "skywire",
    title: "Ride the Skywire",
    description:
      "Explore Skywire, the built-in Bluesky client, with Reggie as your co-pilot. Your linked AT identity powers it.",
    route: "/skywire",
    actionLabel: "Open Skywire",
    order: 19,
    category: "social",
    prereqStepKeys: ["bsky_link"],
    anchorId: "skywire",
    xp: 30,
    wtf: 1,
    proof: allOf("skywire:root", [
      ...prereqPredicates(["bsky_link"]),
      checkpointEvent("skywire:visit", "skywire"),
    ]),
  },
  {
    seedKey: "reggie_tz2at_v1",
    stepKey: "tz2at",
    title: "Tz2at: Chain Meets Atmosphere",
    description:
      "Tour Tz2at, where Tezos wallets link into the AT Protocol firehose. Reggie will show you what publishing a wallet link means.",
    route: "/tz2at",
    actionLabel: "Open Tz2at",
    order: 20,
    category: "identity",
    prereqStepKeys: ["wallet"],
    anchorId: "tz2at",
    xp: 30,
    wtf: 1,
    proof: allOf("tz2at:root", [
      ...prereqPredicates(["wallet"]),
      checkpointEvent("tz2at:visit", "tz2at"),
    ]),
  },

  // ── Creation ───────────────────────────────────────────────────
  {
    seedKey: "reggie_broot_v1",
    stepKey: "broot",
    title: "Make Art With Broot",
    description:
      "Open Broot, the wtfOS art tool, and create something. Anything. Reggie has seen your desktop wallpaper; the bar is low.",
    route: "/tools/broot",
    actionLabel: "Open Broot",
    order: 21,
    category: "creation",
    prereqStepKeys: ["quest_hq"],
    anchorId: "broot",
    xp: 40,
    wtf: 2,
    proof: allOf("broot:root", [
      ...prereqPredicates(["quest_hq"]),
      checkpointEvent("broot:created", "broot"),
    ]),
  },
  {
    seedKey: "reggie_studio_v1",
    stepKey: "studio",
    title: "Studio Time: Plan a Collab",
    description:
      "Create a Studio project — the collaboration workspace where you plan drops and communicate with collaborators.",
    route: "/studio",
    actionLabel: "Open Studio",
    order: 22,
    category: "creation",
    prereqStepKeys: ["quest_hq"],
    anchorId: "studio",
    xp: 50,
    wtf: 2,
    proof: allOf("studio:root", [
      ...prereqPredicates(["quest_hq"]),
      predicateNode("studio:project", "reggie.studio_project_owner"),
    ]),
  },
  {
    seedKey: "reggie_macaroni_v1",
    stepKey: "macaroni",
    title: "Pasta Protocol: Blind Mint Drop",
    description:
      "Use Macaroni and the Pasta Protocol tools to package and finalize your own blind mint drop collection. This is the whole enchilada. Pasta. Whatever.",
    route: "/tools/macaroni-packager",
    actionLabel: "Open Macaroni",
    order: 23,
    category: "creation",
    prereqStepKeys: ["broot", "wallet"],
    anchorId: "macaroni",
    xp: 120,
    wtf: 8,
    proof: allOf("macaroni:root", [
      ...prereqPredicates(["broot", "wallet"]),
      eventExists("macaroni:finalized", "macaroni.package_finalized"),
    ]),
  },

  // ── Progression / economy ──────────────────────────────────────
  {
    seedKey: "reggie_earn_exp_v1",
    stepKey: "earn_exp",
    title: "Grind Begins: Earn EXP",
    description:
      "Earn experience points anywhere in wtfOS — daily side quests are the fastest route. EXP levels you up and unlocks access.",
    route: "/side-quests",
    actionLabel: "Earn EXP",
    order: 24,
    category: "progression",
    prereqStepKeys: ["quest_hq"],
    anchorId: "side-quests",
    xp: 25,
    wtf: 1,
    proof: allOf("earn-exp:root", [
      ...prereqPredicates(["quest_hq"]),
      eventExists("earn-exp:event", "xp.awarded"),
    ]),
  },
  {
    seedKey: "reggie_earn_wtf_v1",
    stepKey: "earn_wtf",
    title: "First Paycheck: Earn WTF",
    description:
      "Earn WTF, the platform reward currency, by completing verified side quests and challenges. It stacks in your reward ledger.",
    route: "/side-quests",
    actionLabel: "Earn WTF",
    order: 25,
    category: "progression",
    prereqStepKeys: ["quest_hq"],
    anchorId: "side-quests",
    xp: 25,
    wtf: 1,
    proof: allOf("earn-wtf:root", [
      ...prereqPredicates(["quest_hq"]),
      eventExists("earn-wtf:event", "wtf.awarded"),
    ]),
  },
  {
    seedKey: "reggie_market_v1",
    stepKey: "market",
    title: "Big Spender: The In-App Market",
    description:
      "Spend earned currency in WTFIAM, the in-app market, on upgrades and items. Earning is only half the loop.",
    route: "/wtfiam",
    actionLabel: "Open Market",
    order: 26,
    category: "progression",
    prereqStepKeys: ["earn_wtf"],
    anchorId: "wtfiam",
    xp: 50,
    wtf: 2,
    proof: allOf("market:root", [
      ...prereqPredicates(["earn_wtf"]),
      predicateNode("market:purchase", "reggie.market_purchase_made"),
    ]),
  },
  {
    seedKey: "reggie_titles_roles_v1",
    stepKey: "titles_roles",
    title: "Climbing the Ladder: Titles, Roles, and Access",
    description:
      "Check the XP leaderboard, learn how tiers become titles, and how roles control which apps and powers you can access.",
    route: "/leaderboard",
    actionLabel: "View Leaderboard",
    order: 27,
    category: "progression",
    prereqStepKeys: ["earn_exp"],
    anchorId: "leaderboard",
    xp: 30,
    wtf: 1,
    proof: allOf("titles:root", [
      ...prereqPredicates(["earn_exp"]),
      anyOf("titles:leaderboard", [
        eventExists("titles:xp-board", "leaderboard.xp.viewed"),
        eventExists("titles:board", "leaderboard.viewed"),
      ]),
      checkpointEvent("titles:tour", "roles"),
    ]),
  },

  // ── Play ───────────────────────────────────────────────────────
  {
    seedKey: "reggie_arcade_v1",
    stepKey: "arcade",
    title: "Insert Coin: The Arcade",
    description:
      "Visit the WTF Arcade with Reggie and see the community game library. Play something. Lose gracefully.",
    route: "/arcade",
    actionLabel: "Open Arcade",
    order: 28,
    category: "play",
    prereqStepKeys: ["quest_hq"],
    anchorId: "arcade",
    xp: 25,
    wtf: 1,
    proof: allOf("arcade:root", [
      ...prereqPredicates(["quest_hq"]),
      checkpointEvent("arcade:visit", "arcade"),
    ]),
  },
  {
    seedKey: "reggie_casino_v1",
    stepKey: "casino",
    title: "House Rules: The Casino",
    description:
      "Tour the WTF Casino with Reggie — after you have earned some WTF, so you know exactly what you are risking.",
    route: "/casino",
    actionLabel: "Open Casino",
    order: 29,
    category: "play",
    prereqStepKeys: ["earn_wtf"],
    anchorId: "casino",
    xp: 25,
    wtf: 1,
    proof: allOf("casino:root", [
      ...prereqPredicates(["earn_wtf"]),
      checkpointEvent("casino:visit", "casino"),
    ]),
  },
];

export const REGGIE_FINALE_SEED_KEY = "reggie_finale_v1";
export const REGGIE_FINALE_STEP_KEY = "finale";

const finaleStep: ReggieQuestStep = {
  seedKey: REGGIE_FINALE_SEED_KEY,
  stepKey: REGGIE_FINALE_STEP_KEY,
  title: "Reggie's Challenge: WTF Rockstar",
  description:
    "Complete every side quest in Reggie's questline — identity, wallets, system mastery, social, creation, progression, and play. Finish this and Reggie finally leaves you alone. Mostly.",
  route: "/side-quests",
  actionLabel: "Review Progress",
  order: 99,
  category: "finale",
  prereqStepKeys: REGGIE_QUEST_STEPS.map((step) => step.stepKey),
  anchorId: "side-quests",
  xp: 500,
  wtf: 50,
  proof: allOf(
    "finale:root",
    REGGIE_QUEST_STEPS.map((step) => ({
      id: `finale:${step.stepKey}`,
      type: "predicate" as const,
      predicateKey: "reggie.step_completed",
      params: { stepKey: step.stepKey },
    }))
  ),
};

export const ALL_REGGIE_STEPS: ReggieQuestStep[] = [...REGGIE_QUEST_STEPS, finaleStep];

export function reggieRewardActions(step: ReggieQuestStep): ChallengeRewardAction[] {
  const actions: ChallengeRewardAction[] = [
    {
      key: "award_exp",
      params: { amount: step.xp, reason: `reggie_quest:${step.stepKey}` },
    },
  ];
  if (step.wtf > 0) {
    actions.push({
      key: "queue_wtf_reward",
      params: { amountWtf: step.wtf, reason: `Reggie's Quest: ${step.title}` },
    });
  }
  actions.push({
    key: "create_notification",
    params: {
      title:
        step.stepKey === REGGIE_FINALE_STEP_KEY
          ? "Reggie's Challenge complete — WTF Rockstar"
          : `Reggie side quest complete: ${step.title}`,
      body:
        step.stepKey === REGGIE_FINALE_STEP_KEY
          ? "You finished Reggie's entire questline. He is proud, misty-eyed, and heading back to his burrow. Rewards are in your ledger."
          : "Reggie verified this side quest and dropped your reward in the ledger. Check the quest log for what unlocked next.",
    },
  });
  if (step.stepKey === REGGIE_FINALE_STEP_KEY) {
    actions.push({
      key: "unlock_inventory_item",
      params: {
        sku: "reggie-graduation-cap",
        quantity: 1,
        metadata: { source: "reggie_quest_finale" },
      },
    });
  }
  return actions;
}

export function reggieStepMetadata(step: ReggieQuestStep) {
  return {
    seedKey: step.seedKey,
    reggieQuest: true,
    stepKey: step.stepKey,
    prereqStepKeys: step.prereqStepKeys,
    order: step.order,
    route: step.route,
    actionLabel: step.actionLabel,
    anchorId: step.anchorId,
    category: step.category,
  };
}

export async function ensureReggieQuestChallenges(createdBy?: number | null) {
  const { db } = await import("../../db");
  let created = 0;
  let updated = 0;

  for (const step of ALL_REGGIE_STEPS) {
    const payload = {
      title: step.title,
      description: step.description,
      status: "active" as const,
      conditionTree: step.proof as unknown as Record<string, unknown>,
      rewardActions: reggieRewardActions(step) as unknown as Array<Record<string, unknown>>,
      repeatability: { mode: "once" },
      perUserCompletionLimit: 1,
      summary: `${step.description} Verified automatically by wtfOS; rewards land without a claim step.`,
      metadata: reggieStepMetadata(step),
      updatedAt: new Date(),
    };

    const existing = await db
      .select({ id: challengeAutomationDefinitions.id })
      .from(challengeAutomationDefinitions)
      .where(sql`${challengeAutomationDefinitions.metadata}->>'seedKey' = ${step.seedKey}`)
      .limit(1);

    if (existing[0]) {
      await db
        .update(challengeAutomationDefinitions)
        .set(payload)
        .where(sql`${challengeAutomationDefinitions.metadata}->>'seedKey' = ${step.seedKey}`);
      updated += 1;
      continue;
    }

    await db.insert(challengeAutomationDefinitions).values({
      ...payload,
      createdBy: createdBy ?? null,
    } as any);
    created += 1;
  }

  return { created, updated, total: ALL_REGGIE_STEPS.length };
}
