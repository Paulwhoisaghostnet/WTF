import type {
  ReggieAccountSnapshot,
  ReggieQuestState,
} from "./reggie-quest-model";
import {
  describeAccountState,
  progressPercent,
  recommendedStep,
} from "./reggie-quest-model";
import { emptyQuestionReply, smartAssReply } from "./reggie-dialogue";

/**
 * Reggie's knowledge base: keyword-matched topics over wtfOS. Not AI —
 * deterministic keyword scoring against authored answers, with account and
 * quest state mixed in where it helps. Out-of-scope questions fall through
 * to the smart-ass reply pool.
 */

export interface ReggieAnswerContext {
  account: ReggieAccountSnapshot | null;
  quest: ReggieQuestState | null;
  seed: string;
  lastReply?: string;
}

export interface ReggieAnswer {
  matched: boolean;
  topicId: string | null;
  answer: string;
}

interface KnowledgeTopic {
  id: string;
  keywords: string[];
  answer: (context: ReggieAnswerContext) => string;
}

function questProgressSuffix(context: ReggieAnswerContext, stepKey: string): string {
  const step = context.quest?.steps.find((item) => item.stepKey === stepKey);
  if (!step) return "";
  if (step.status === "completed") return " You already finished that side quest, by the way. Show-off.";
  if (step.status === "available") return " There's an open side quest for exactly this — check my quest log.";
  return " The side quest for it unlocks once you finish its prerequisites.";
}

export const REGGIE_KNOWLEDGE_TOPICS: KnowledgeTopic[] = [
  {
    id: "reggie",
    keywords: ["who are you", "reggie", "hamster", "what are you", "are you ai", "are you an ai", "clippy"],
    answer: () =>
      "I'm Reggie: hamster, wtfOS guide, and quest-giver. I'm not AI — I'm all authored charm and a very good filing system. I know your account state, the whole OS layout, and exactly which side quests you're avoiding. Think Clippy, but fluffier and with better opinions.",
  },
  {
    id: "wtfos",
    keywords: ["wtfos", "what is this", "this os", "operating system", "what is wtf", "desktop"],
    answer: () =>
      "wtfOS is a web desktop for the WTF community: creation tools, messaging, live rooms, on-chain identity, games, markets, and a quest system that rewards you for actually using it all. Icons open apps, the Start menu holds everything, and the command palette gets you anywhere fast.",
  },
  {
    id: "quest",
    keywords: ["quest", "your quest", "questline", "next step", "what should i do", "what do i do", "what's next", "whats next", "progress", "how am i doing"],
    answer: (context) => {
      if (!context.quest) {
        return "My questline covers profile, identity, wallets, apps, pets, creation, and the economy. Once your quest state loads I can tell you exactly where you stand.";
      }
      const next = recommendedStep(context.quest);
      const progress = `You've finished ${context.quest.completedCount} of ${context.quest.totalCount} side quests (${progressPercent(context.quest)}%).`;
      if (context.quest.questComplete) {
        return `${progress} Which is to say: everything. You're a certified wtf rockstar and I'm basically retired.`;
      }
      if (next) {
        return `${progress} My recommendation: "${next.title}" — ${next.description} Head to ${next.route} when ready.`;
      }
      return `${progress} Everything unlockable is done; finish remaining prerequisites to open the rest of the tree.`;
    },
  },
  {
    id: "account",
    keywords: ["my account", "account state", "who am i", "my profile", "about me", "my stats"],
    answer: (context) =>
      context.account
        ? describeAccountState(context.account, context.quest)
        : "Your account details haven't loaded yet. Even I need a second sometimes.",
  },
  {
    id: "sidequests",
    keywords: ["side quest", "sidequest", "daily", "challenges", "challenge", "rewards screen", "claim"],
    answer: () =>
      "Side Quests (/side-quests) hold daily loops and my questline; Challenges (/challenges) hold the bigger automated arcs. wtfOS verifies your actions through normalized events and DB checks — no honor system. Daily loops need a manual claim; my quests pay out automatically the moment they verify.",
  },
  {
    id: "wallet",
    keywords: ["wallet", "tezos", "connect wallet", "signature", "beacon", "primary wallet", "multi wallet"],
    answer: (context) =>
      "Tezos wallets connect from your Profile: wtfOS issues a challenge, you sign it, and the wallet is provably yours — no funds ever move. Connect several and mark one primary (that's where cashouts land). Once linked, your tokens get indexed for galleries, PFPs, and quest verification." +
      questProgressSuffix(context, "wallet"),
  },
  {
    id: "etherlink",
    keywords: ["etherlink", "evm", "ethereum", "metamask"],
    answer: (context) =>
      "Etherlink is Tezos's EVM layer. Connect an EVM wallet from Profile with the same signed-challenge flow as Tezos, and wtfOS indexes your Etherlink holdings alongside everything else." +
      questProgressSuffix(context, "etherlink"),
  },
  {
    id: "did",
    keywords: ["did", "wtfos.me", "handle claim", "decentralized identity", "subdomain", "wtf.tez", "tezos domain"],
    answer: (context) =>
      "Two name systems, both at /wtf-subdomains: a wtfos.me handle gives your AT Protocol identity a WTF-hosted home (your DID resolves through our infrastructure), and a wtf.tez subdomain names your Tezos wallet on-chain via the registrar's prepare-and-commit flow." +
      questProgressSuffix(context, "did_claim"),
  },
  {
    id: "bluesky",
    keywords: ["bluesky", "bsky", "at protocol", "atproto", "skywire", "atmosphere"],
    answer: (context) =>
      "Bluesky links from your Profile via OAuth. Once linked, Skywire (/skywire) is the built-in Bluesky client, Tz2at bridges your Tezos identity into the atmosphere, and your handle can even claim a wtfos.me home." +
      questProgressSuffix(context, "bsky_link"),
  },
  {
    id: "x",
    keywords: ["twitter", "x account", "link x", "x linking"],
    answer: (context) =>
      "X links from your Profile through a verified OAuth flow — wtfOS confirms the handle is really yours instead of taking your word for it. Verified socials make your identity portable and quest-provable." +
      questProgressSuffix(context, "x_link"),
  },
  {
    id: "pfp",
    keywords: ["pfp", "avatar", "profile picture", "profile pic"],
    answer: (context) =>
      "Set a PFP from your Profile: upload an image, or assign a token you own as an NFT-backed PFP. Owned-token PFPs update automatically if you move the token." +
      questProgressSuffix(context, "pfp"),
  },
  {
    id: "wim",
    keywords: ["wim", "messenger", "dm", "direct message", "instant message", "chat with"],
    answer: (context) =>
      "WIM (/wim) is the instant messenger — DMs, friends, the classic buddy-list experience. It's the fastest way to talk to other wtfOS users one-on-one." +
      questProgressSuffix(context, "wim"),
  },
  {
    id: "wtflive",
    keywords: ["wtf live", "live room", "voice", "video call", "screen share", "stage", "broadcast"],
    answer: (context) =>
      "WTF LIVE (/live) hosts rooms with text, voice, video, and screen sharing. Stages are the event-sized version: speakers, guests, an audience, and a calendar listing so people actually show up." +
      questProgressSuffix(context, "live_room"),
  },
  {
    id: "broot",
    keywords: ["broot", "make art", "draw", "art tool", "creation tool"],
    answer: (context) =>
      "Broot lives at /tools/broot — it's the art creation tool. Make something, export it, and later feed it into a Macaroni drop if you're feeling ambitious." +
      questProgressSuffix(context, "broot"),
  },
  {
    id: "studio",
    keywords: ["studio", "collab", "collaboration", "project", "collaborators"],
    answer: (context) =>
      "Studio (/studio) is the collaboration workspace: projects, files, versions, annotations, and members. Create a project, invite collaborators, and plan drops together in one place." +
      questProgressSuffix(context, "studio"),
  },
  {
    id: "macaroni",
    keywords: ["macaroni", "pasta protocol", "blind mint", "drop", "mint", "collection", "publish"],
    answer: (context) =>
      "Macaroni (/tools/macaroni-packager) packages your art into blind mint drop collections — upload items, set metadata and drop config, then finalize and publish. It's part of the Pasta Protocol family alongside Colander, Spaghetti, Gnocchi, and friends. Yes, everything is named after pasta. No, nobody regrets it." +
      questProgressSuffix(context, "macaroni"),
  },
  {
    id: "wtf-currency",
    keywords: ["earn wtf", "wtf currency", "wtf reward", "cash out", "cashout", "money", "reward ledger"],
    answer: (context) =>
      "WTF is the platform reward currency. Earn it from verified side quests and challenges; it lands in your reward ledger where you can spend it in the in-app market or cash it out to your primary wallet." +
      questProgressSuffix(context, "earn_wtf"),
  },
  {
    id: "exp",
    keywords: ["exp", "xp", "experience", "level", "leveling", "level up"],
    answer: (context) =>
      "EXP is your in-app score — earned from quests, care actions, and activity across the OS. It climbs the leaderboard, unlocks tiers and titles, and never leaves the app (that's what WTF is for)." +
      questProgressSuffix(context, "earn_exp"),
  },
  {
    id: "market",
    keywords: ["market", "wtfiam", "buy", "shop", "store", "upgrade", "item", "inventory"],
    answer: (context) =>
      "WTFIAM (/wtfiam) is the in-app market: spend earned WTF on apps, upgrades, items, and goodies. Purchases land in your inventory, and app unlocks open back up through the Start menu once your account owns them. Earning and spending is the whole loop — welcome to economics." +
      questProgressSuffix(context, "market"),
  },
  {
    id: "app-store",
    keywords: ["app store", "apps section", "apps tab", "unlock app", "install app", "buy app", "pin app", "desktop shortcut", "place on desktop", "app unlock"],
    answer: () =>
      "The default desktop only shows the core stuff you need first. Optional, specialist, and role-gated apps live in WTFIAM's Apps tab like an app store: buy the unlock with WTF, then open the app from Start. To put it on your desktop, right-click it in Start and choose Create Desktop Shortcut. If a card is greyed out, hover or focus it — it'll tell you the exact role, pass, or prerequisite you're missing.",
  },
  {
    id: "roles",
    keywords: ["role", "title", "permission", "access", "app access", "leaderboard", "rank"],
    answer: (context) =>
      "Roles control what you can access — some apps and admin powers are role-gated. In WTFIAM's Apps tab, role-locked app cards stay greyed out until your account has the right role or pass, and the tooltip tells you what is missing. Titles come from XP tiers, and the leaderboard (/leaderboard) shows where everyone stands. Climb by doing, not by asking. Although asking was a good instinct." +
      questProgressSuffix(context, "titles_roles"),
  },
  {
    id: "arcade",
    keywords: ["arcade", "game", "games", "play", "high score", "console"],
    answer: (context) =>
      "The Arcade (/arcade) has the community game library, and the Console has its own catalog with high-score boards. Scores are verified server-side, so no, you can't lie about them. People have tried. I have a list." +
      questProgressSuffix(context, "arcade"),
  },
  {
    id: "casino",
    keywords: ["casino", "bet", "gamble", "wager", "rug pull", "guinea pig", "wtf button"],
    answer: (context) =>
      "The Casino (/casino) hosts wagered games — the WTF Button, Rug Pull, the Guinea Pig Raceway. It runs on the WTF you earn, which is why I make you earn some before the tour. Play informed, and never bet against the guinea pigs." +
      questProgressSuffix(context, "casino"),
  },
  {
    id: "calendar",
    keywords: ["calendar", "event", "schedule", "when is", "upcoming"],
    answer: (context) =>
      "The Calendar (/calendar) lists everything scheduled in wtfOS: rounds, events, stages, community happenings. You can submit your own events as tickets — that's how stage listings get on there." +
      questProgressSuffix(context, "calendar"),
  },
  {
    id: "pet",
    keywords: ["pet", "desktop pet", "feed", "adopt", "care"],
    answer: (context) =>
      "Desktop pets are enabled in settings and live right on your desktop. They need feeding, water, cleaning, and attention — care actions earn XP and keep them alive. They're hamsters. Excellent taste, this OS." +
      questProgressSuffix(context, "pet_adopt"),
  },
  {
    id: "appearance",
    keywords: ["theme", "appearance", "font", "color", "wallpaper", "customize", "settings"],
    answer: (context) =>
      "The Theme Builder (/desktop-settings) controls appearance: style grammar, color schemes, font packs, cursor, wallpaper, even desktop physics. System Settings (/settings) is the broader hub." +
      questProgressSuffix(context, "appearance"),
  },
  {
    id: "navigation",
    keywords: ["navigate", "start menu", "command palette", "window", "taskbar", "find app", "where is", "how do i open"],
    answer: (context) =>
      "Getting around: desktop icons open core apps, the Start button (bottom-left) lists what your account has unlocked, and the command palette is the fast lane to any available route. Optional apps come from WTFIAM's Apps tab; once unlocked, right-click a Start item to make a desktop shortcut. Lost? Ask me — pointing at things is my whole job." +
      questProgressSuffix(context, "navigator"),
  },
  {
    id: "tz2at",
    keywords: ["tz2at", "firehose", "wallet link", "chain identity"],
    answer: (context) =>
      "Tz2at (/tz2at) bridges Tezos into the AT Protocol: publish wallet links into the firehose, import identities, and request a WTF-hosted PDS. It's where your chain identity meets the atmosphere." +
      questProgressSuffix(context, "tz2at"),
  },
];

function scoreTopic(question: string, topic: KnowledgeTopic): number {
  let score = 0;
  for (const keyword of topic.keywords) {
    if (question.includes(keyword)) {
      score += keyword.length;
    }
  }
  return score;
}

export function answerQuestion(
  question: string,
  context: ReggieAnswerContext
): ReggieAnswer {
  const normalized = question.toLowerCase().trim();
  if (!normalized) {
    return {
      matched: false,
      topicId: null,
      answer: emptyQuestionReply(context.seed, context.lastReply),
    };
  }

  let best: KnowledgeTopic | null = null;
  let bestScore = 0;
  for (const topic of REGGIE_KNOWLEDGE_TOPICS) {
    const score = scoreTopic(normalized, topic);
    if (score > bestScore) {
      best = topic;
      bestScore = score;
    }
  }

  if (best && bestScore >= 3) {
    return { matched: true, topicId: best.id, answer: best.answer(context) };
  }

  return {
    matched: false,
    topicId: null,
    answer: smartAssReply(`${context.seed}:${normalized}`, context.lastReply),
  };
}
