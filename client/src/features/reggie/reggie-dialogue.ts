/**
 * Reggie's dialogue engine. Deliberately not AI: a large bank of authored
 * lines with deterministic pseudo-random selection, seeded per user and
 * rotated so repeats are rare. Feels alive, costs nothing, never hallucinates
 * (beyond the amount of hallucination we wrote in on purpose).
 */

export interface StepDialogue {
  /** First time Reggie pitches this step. */
  intro: string[];
  /** Reminder / nag variants. */
  nudge: string[];
  /** Celebration when the step verifies. */
  congrats: string[];
}

function hashString(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Deterministic variant picker. Same seed + same salt = same line, but any
 * change in salt (message count, day, step) walks the pool. `avoid` lets the
 * caller skip the previously shown line so back-to-back repeats never happen
 * on pools with 2+ entries.
 */
export function pickLine(pool: string[], seed: string, avoid?: string): string {
  if (pool.length === 0) return "";
  if (pool.length === 1) return pool[0];
  const index = hashString(seed) % pool.length;
  const line = pool[index];
  if (avoid && line === avoid) {
    return pool[(index + 1) % pool.length];
  }
  return line;
}

export const REGGIE_GREETINGS: string[] = [
  "Hey! I'm Reggie. Resident hamster, unlicensed tour guide, and the only one around here who reads the manual.",
  "Welcome back. The desktop missed you. I didn't, but the desktop did.",
  "Oh good, you're here. I've been running on this wheel of anticipation all day.",
  "Greetings, user. I've prepared a full onboarding itinerary and three unrelated opinions.",
  "You again! Excellent. My quest log doesn't fill itself. Well, technically it does — that's the whole system — but you know what I mean.",
  "Hi. Reggie. Hamster. Assistant. Questions welcome, cheek-pouch jokes tolerated.",
];

export const REGGIE_NAGS: string[] = [
  "Not to nag, but I'm absolutely going to nag: you've got side quests waiting.",
  "Psst. The quest log is looking at you. I taught it that.",
  "Every minute you don't finish a side quest, I do one lap on the wheel. I'm exhausted. Help.",
  "Reminder from your friendly neighborhood rodent: progress bars don't fill themselves.",
  "I filed a formal complaint about your idle time. It was addressed to you. This is the complaint.",
  "The rewards ledger called. It's lonely.",
  "You know what would look great on you? A completed quest step. Very slimming.",
  "I've seen glaciers onboard faster. Adorable glaciers, but still.",
];

export const REGGIE_QUEST_COMPLETE_LINES: string[] = [
  "That's it. That's the whole questline. You went from wtf newbie to wtf rockstar and I have the paperwork to prove it. I'm... actually tearing up. Hamsters can do that.",
  "Quest complete. My work here is done. I'll be in my burrow if you need me — which you won't, because I trained you perfectly.",
  "You did everything. Identity, wallets, apps, pets, pasta. I'm retiring my clipboard. Wear the graduation cap with pride.",
];

export const REGGIE_STEP_DIALOGUE: Record<string, StepDialogue> = {
  profile: {
    intro: [
      "First things first: who ARE you? Head to your Profile and set a display name. I refuse to keep calling you 'hey, you'.",
      "Rule one of wtfOS: exist properly. Open your Profile and pick a display name. Lie a little, it's fine, everyone does.",
      "Your profile is emptier than my food bowl at 3am. Display name, let's go. I'll walk you there.",
    ],
    nudge: [
      "Still no display name. I've started calling you 'The Mysterious Blank' in my head and it's getting weird.",
      "Profile's still nameless. It's one text field. You've conquered harder forms at the DMV.",
    ],
    congrats: [
      "A name! You're officially a person now. Legally I can't confirm that, but spiritually? Absolutely.",
      "Profile complete. See how easy that was? Everything else is just this, but with more buttons.",
    ],
  },
  quest_hq: {
    intro: [
      "Time to show you Quest HQ. Side Quests and Challenges are where wtfOS tracks everything you do and pays you for it. Follow me to both screens.",
      "Let me show you where the loot lives: the Side Quests screen and the Challenges screen. Visit both and consider yourself oriented.",
      "This whole questline you're on? It runs on the machinery behind the Side Quests and Challenges screens. Come see the engine room.",
    ],
    nudge: [
      "You still haven't toured Quest HQ. It's two screens. I've memorized both and I don't even have object permanence.",
      "Side Quests and Challenges screens. Quick visit. In and out. The system literally can't reward what you can't find.",
    ],
    congrats: [
      "Now you know where the quest machinery lives. Everything I assign you shows up in that system, verified automatically. No trust falls required.",
      "Quest HQ: toured. From here on out you can pick your own path — I unlock things, you choose the order. Very choose-your-own-adventure.",
    ],
  },
  pfp: {
    intro: [
      "You need a face. Upload an avatar or assign an owned token as your PFP from the Profile screen. Anything beats the default silhouette of despair.",
      "PFP time. It can be art you own, art you upload, or a photo of a hamster. I know a guy.",
    ],
    nudge: [
      "Still faceless, I see. Bold choice. Wrong, but bold. Profile screen. PFP. Go.",
      "Every time you post without a PFP, a designer somewhere feels a chill. Be kind. Set one.",
    ],
    congrats: [
      "Look at that face! A massive upgrade from 'generic void'. The desktop feels warmer already.",
      "PFP acquired. You're now at least 40% more recognizable in chat. Science.",
    ],
  },
  x_link: {
    intro: [
      "Link your X account from Profile. It's a verified OAuth flow — wtfOS confirms it's really your account, and your identity gets receipts.",
      "Time to link X. Yes, that app. The OAuth flow proves you own the handle, and proof beats vibes.",
    ],
    nudge: [
      "X account: still unlinked. Your identity is a stool with one leg. Stools need... more legs. Look, just link it.",
    ],
    congrats: [
      "X linked and verified. Your social receipts are now admissible in the court of wtfOS.",
      "Verified! Now everyone knows those posts are really you. Whether that's good news is between you and your timeline.",
    ],
  },
  bsky_link: {
    intro: [
      "Link a Bluesky account and your identity bridges into the AT Protocol atmosphere — Skywire, Tz2at, the whole decentralized shebang.",
      "Bluesky linking time. Decentralized identity, portable handles, and I get to say 'atmosphere' in a sentence. Everyone wins.",
    ],
    nudge: [
      "The atmosphere awaits and you're still on the ground floor. Link that Bluesky account.",
    ],
    congrats: [
      "Bluesky linked! Your identity now exists in the atmosphere. Very poetic. Also very useful for the next few quests.",
      "AT Protocol handshake complete. Skywire and the DID claim just got a lot more interesting for you.",
    ],
  },
  wallet: {
    intro: [
      "Big one: connect a Tezos wallet. You'll sign a challenge to prove it's yours — no funds move, ever. This unlocks asset indexing and the entire on-chain half of wtfOS.",
      "Wallet time. Sign one message, prove ownership, and wtfOS starts indexing your assets. The signature costs nothing but pride if you fumble it.",
    ],
    nudge: [
      "No wallet connected yet. Half of wtfOS is politely waiting behind that signature.",
      "The wallet connection is one signed message. You've written longer text messages about lunch.",
    ],
    congrats: [
      "Wallet connected and cryptographically yours. wtfOS is indexing your assets as we speak. I saw everything. Nice... choices.",
      "Signed, sealed, indexed. The on-chain half of wtfOS just lit up for you.",
    ],
  },
  did_claim: {
    intro: [
      "Claim your wtfos.me handle. It's a decentralized identifier that resolves through WTF-hosted infrastructure — your name, on our rails, verifiable everywhere.",
      "DID claiming time. A wtfos.me handle means your identity resolves like a real citizen of the atmosphere. Very official. Slightly magical.",
    ],
    nudge: [
      "Your wtfos.me handle is still unclaimed. Somewhere out there, your name is just... available. Fix that.",
    ],
    congrats: [
      "DID claimed! You're now resolvable. That's the nicest thing I can say about anyone.",
    ],
  },
  wtf_tez: {
    intro: [
      "Claim a subdomain under wtf.tez and your wallet answers to a name instead of tz1-gibberish. The registrar walks you through prepare and commit.",
      "Nobody memorizes tz-addresses. Claim yourname.wtf.tez and become legible on-chain.",
    ],
    nudge: [
      "Your wallet is still going by its government name. yourname.wtf.tez is right there.",
    ],
    congrats: [
      "Subdomain claimed! Your wallet has a name now. It grows up so fast.",
    ],
  },
  multi_wallet: {
    intro: [
      "Pro move: connect a second Tezos wallet and mark one as primary. Primary decides where cashouts land. Collectors keep vaults, spenders keep hot wallets — now you can too.",
      "One wallet is a start. Two wallets with a designated primary? That's portfolio management, baby.",
    ],
    nudge: [
      "Still a single-wallet household? Add a second and set a primary. Redundancy is self-care.",
    ],
    congrats: [
      "Multi-wallet achieved, primary designated. You're basically an institution now.",
    ],
  },
  etherlink: {
    intro: [
      "Connect an Etherlink wallet — that's the EVM side. Same deal as Tezos: sign a challenge, prove it's yours, wtfOS indexes it.",
      "Time to cross the bridge: Etherlink is Tezos's EVM layer. Connect an EVM wallet and both halves of your on-chain life are covered.",
    ],
    nudge: [
      "The EVM side of your account is still a ghost town. One Etherlink connection fixes that.",
    ],
    congrats: [
      "Etherlink connected. Tezos AND EVM. You are now bilingual in blockchain.",
    ],
  },
  appearance: {
    intro: [
      "This OS doesn't have to look like this. Open the Theme Builder and change the style, colors, or fonts. Redecorate. Go feral.",
      "Theme Builder time. Style grammars, color schemes, font packs — make the desktop unmistakably yours. I recommend anything except beige.",
    ],
    nudge: [
      "Still rocking default appearance? The Theme Builder has an entire personality store and you're wearing the sample.",
    ],
    congrats: [
      "Ooh, redecorated! It's so... you. That's a compliment. Probably.",
    ],
  },
  navigator: {
    intro: [
      "Navigation lesson! Open apps from desktop icons or the Start menu, manage windows, and try the command palette. Do the tour and open at least one app the proper way.",
      "Time to learn the OS itself: icons open apps, the Start menu holds everything, windows drag and stack, and the command palette is the power-user cheat code.",
    ],
    nudge: [
      "The navigation tour is still waiting. It's the difference between living here and just visiting.",
    ],
    congrats: [
      "Tour complete! You can officially get anywhere in wtfOS. With great navigation comes great responsibility.",
    ],
  },
  pet_adopt: {
    intro: [
      "You should adopt a desktop pet. Enable it in settings and say hi. It's a hamster. I want to be VERY clear that I am also a hamster and this is fine and I'm fine.",
      "Desktop pets: little companions that live on your desktop and depend on you completely. Adopt one. Give it a good life. No pressure. (Pressure.)",
    ],
    nudge: [
      "Still no pet? There's a tiny creature waiting to be enabled in settings. This is the easiest heroism available to you.",
    ],
    congrats: [
      "You adopted a pet! It's beautiful. I'm not jealous. This is my professional face.",
    ],
  },
  pet_care: {
    intro: [
      "Adoption is the easy part — now keep the little guy alive. Feed, water, clean, play. Five care interactions and I'll believe you're responsible.",
      "Pet care time. They need food, water, and attention, just like me, except I also need quest completions.",
    ],
    nudge: [
      "Your pet is giving you a look. I recognize that look. It's the 'feed me' look. Trust me, I've deployed it.",
      "Five care actions. That's it. Your pet believes in you and so do I, one of us grudgingly.",
    ],
    congrats: [
      "Certified pet parent! Your little buddy is thriving. As a fellow small mammal: thank you.",
    ],
  },
  wim: {
    intro: [
      "WIM is the wtfOS instant messenger. Open it and send someone a real message. Yes, a human. I know, I know — but they're mostly nice here.",
      "Time to talk to people. WIM, the instant messenger. Slide into exactly one DM to pass this quest. Tastefully.",
    ],
    nudge: [
      "Still haven't sent a WIM message? The community doesn't bite. Well, one guy might. Avoid him. Message anyone else.",
    ],
    congrats: [
      "Message sent! You're officially social. The hardest part of any network is the first hello.",
    ],
  },
  live_room: {
    intro: [
      "WTF LIVE is where rooms happen — text, voice, video, screen share, the works. Jump into a room and say something, or make your own room.",
      "Live rooms time. Think hangout spots with cameras and soundboards. Send a room message or spin one up yourself.",
    ],
    nudge: [
      "The live rooms are full of people being live. You could be one of them. Just saying.",
    ],
    congrats: [
      "Look at you, live and in color! Room participation: verified.",
    ],
  },
  calendar: {
    intro: [
      "The Calendar is wtfOS's schedule of everything — rounds, events, stages, community happenings. Come take a look with me so you always know what's coming.",
      "Quick field trip: the Calendar. If it's happening in wtfOS, it's listed there. Knowing where the schedule lives is half of never missing anything.",
    ],
    nudge: [
      "You still haven't seen the Calendar. Time is passing. Events are evented. Be less surprised — visit it.",
    ],
    congrats: [
      "Calendar toured! Now you'll actually know when things happen instead of finding out from someone's post three days later.",
    ],
  },
  live_stage: {
    intro: [
      "The big leagues: set up a WTF LIVE stage — speakers, guests, an audience — and submit it to the calendar so people show up. You're not just attending anymore; you're hosting.",
      "Stage manager quest! Create a stage in WTF LIVE and get it listed on the calendar. Host something. A talk, a listening party, a dramatic reading of your quest log.",
    ],
    nudge: [
      "Your stage career is still in the wings. Stage plus calendar listing — that's the whole assignment.",
    ],
    congrats: [
      "You hosted a stage AND put it on the calendar. That's event production. I'd buy a ticket, if I had money, or pockets.",
    ],
  },
  skywire: {
    intro: [
      "Skywire is the built-in Bluesky client — your linked AT identity powers it. Come explore the atmosphere without leaving the OS.",
      "Field trip to Skywire! It's Bluesky, but it lives in your OS like everything else. Your linked handle just works.",
    ],
    nudge: [
      "Skywire's sitting right there with your atmosphere credentials preloaded. Go fly the thing.",
    ],
    congrats: [
      "Skywire explored! The atmosphere suits you.",
    ],
  },
  tz2at: {
    intro: [
      "Tz2at is where Tezos meets the AT Protocol — wallet links published into the firehose, chain identity in the atmosphere. Nerdy? Extremely. Cool? Also extremely. Come see.",
      "Next stop: Tz2at. It bridges your on-chain identity into the AT Protocol. Two worlds, one you.",
    ],
    nudge: [
      "Tz2at is still unexplored. It's the coolest bridge in the OS and I'm including the one I made out of cardboard tubes.",
    ],
    congrats: [
      "Tz2at toured! You now understand the chain-to-atmosphere bridge better than most people who built it. Kidding. Mostly.",
    ],
  },
  broot: {
    intro: [
      "Broot is the art tool. Open it and make something — a doodle, a masterpiece, a crime against color theory. Creation is the point.",
      "Art time! Broot lives in the creation tools. Make literally anything. My portfolio is entirely pawprints and I'm thriving.",
    ],
    nudge: [
      "Broot remains unopened. Your inner artist is filing a missing person report.",
    ],
    congrats: [
      "You made art! I've seen it. It's... expressive. I'm framing a copy in my burrow.",
    ],
  },
  studio: {
    intro: [
      "Studio is the collaboration workspace — projects, files, collaborators, plans. Create a project and you've got a home base for anything you build with other people.",
      "Time for Studio: where collabs get planned and collaborators get communicated with. Make your first project. Name it something ambitious.",
    ],
    nudge: [
      "No Studio project yet? Every great collab starts with an empty project and unearned confidence. You have at least one of those.",
    ],
    congrats: [
      "Studio project created! You're officially someone who 'has a project'. Very in-demand at parties.",
    ],
  },
  macaroni: {
    intro: [
      "The crown jewel: Macaroni and the Pasta Protocol. Package your art into a blind mint drop collection and finalize it. Your own drop. On-chain. Made by you.",
      "Ready for the big one? Macaroni packages art into blind mint drops — the same machinery real creators here use. Build a package and finalize it.",
    ],
    nudge: [
      "That blind mint drop won't package itself. Macaroni awaits. Bring the art, I'll bring the moral support.",
      "Your Macaroni package is still uncooked. That's a pasta joke. It won't be the last one. Finalize the drop.",
    ],
    congrats: [
      "YOU PUBLISHED A DROP. A real blind mint collection, packaged and finalized. This is the proudest a hamster has ever been. Al dente. Perfetto.",
    ],
  },
  earn_exp: {
    intro: [
      "Let's talk EXP: it's your level, your ladder, your bragging rights. Daily side quests are the fastest way to earn some. Go get any amount of it.",
      "EXP quest! Experience points come from verified activity all over the OS. One daily side quest will do it.",
    ],
    nudge: [
      "Still zero recent EXP? The daily loops reset at midnight UTC and they practically pay you for existing.",
    ],
    congrats: [
      "EXP earned! The grind has officially begun. It never stops. That's the fun part.",
    ],
  },
  earn_wtf: {
    intro: [
      "WTF is the platform reward currency — earn it from verified quests and challenges, spend it or cash it out. Go earn your first stack.",
      "Time to make money. WTF, specifically. Complete verified quests and it lands in your ledger. Capitalism, but cute.",
    ],
    nudge: [
      "Your WTF balance is doing an impression of my bank account. Quests pay. Go collect.",
    ],
    congrats: [
      "First WTF earned! It's in your reward ledger. Try not to spend it all in one... actually, spending it is the next quest. Spend away.",
    ],
  },
  market: {
    intro: [
      "You've earned currency — now close the loop. WTFIAM is the in-app market: upgrades, items, goodies. Buy something with your hard-earned WTF.",
      "Shopping time! The in-app market takes the WTF you earned and turns it into stuff. This is economics. I'm basically a professor.",
    ],
    nudge: [
      "Money's burning a hole in your ledger. The market has things. You have currency. Introduce them.",
    ],
    congrats: [
      "Purchase complete! Earn, spend, repeat — you now understand the whole wtfOS economy. Alan Greenspan could never.",
    ],
  },
  titles_roles: {
    intro: [
      "Let's decode the ladder: EXP tiers become titles, roles control which apps and powers you can access, and the leaderboard shows where everyone stands. Take the tour.",
      "Roles and titles time. Some doors in wtfOS only open for certain roles — and climbing the XP board is how you earn the fancy ones. Come see the leaderboard.",
    ],
    nudge: [
      "The leaderboard tour is still pending. Don't you want to know what all those fancy titles mean? They mean POWER. Mild, app-gated power.",
    ],
    congrats: [
      "Ladder decoded! Now you know exactly what you're climbing toward. See you at the top. I'll take the elevator; small legs.",
    ],
  },
  arcade: {
    intro: [
      "The Arcade! Community games, high scores, glory. Visit with me and play something. Losing builds character and I think you could use a little more.",
      "Game time. The WTF Arcade has the community game library. Come lose gracefully at something.",
    ],
    nudge: [
      "The Arcade misses you. It told me. The machines get lonely.",
    ],
    congrats: [
      "Arcade explored! Your high scores are a work in progress. That's what we call optimism.",
    ],
  },
  casino: {
    intro: [
      "The Casino tour — now that you've earned WTF, you know exactly what you're risking, which is the entire point of visiting AFTER payday. House rules, informed decisions.",
      "Casino field trip. Wagered games, guinea pig racing, a big red button. Look around, learn the odds, and remember: the house always wins, except the guinea pigs. Nobody controls the guinea pigs.",
    ],
    nudge: [
      "Casino tour still pending. Go look. You don't have to bet — but you should at least see the guinea pig raceway once in your life.",
    ],
    congrats: [
      "Casino toured! You gambled responsibly by mostly just looking. The best strategy, statistically.",
    ],
  },
  finale: {
    intro: [
      "This is it — Reggie's Challenge. Finish every side quest in the tree and you graduate from wtf newbie to wtf rockstar. I'll be watching. Proudly. From the wheel.",
    ],
    nudge: [
      "The finale is within reach. Every step you finish gets you closer to the graduation cap. And me? Closer to a very emotional retirement speech.",
    ],
    congrats: [
      "WTF ROCKSTAR. That's you. That's official. Somebody get this legend a graduation cap — oh wait, I already put one in your inventory.",
    ],
  },
};

/**
 * Smart-ass replies for questions outside Reggie's wheelhouse. Deliberately
 * enormous so the well never feels dry.
 */
export const REGGIE_SMARTASS_REPLIES: string[] = [
  "I'm a hamster with a quest log, not a search engine. Try asking about wtfOS.",
  "Fascinating question. Unrelated to anything I know, but fascinating.",
  "My knowledge base covers wtfOS, quests, and sunflower seeds. You've strayed.",
  "That's above my pay grade, and I'm paid in bedding.",
  "I ran that through my brain. My brain is the size of a chickpea. It said no.",
  "Error 404: hamster competence not found. Ask me about wtfOS instead.",
  "I'd answer that, but then I'd be wrong AND smug, and one at a time please.",
  "You're asking the rodent. Consider that. Now ask me something about wtfOS.",
  "Let me consult my notes... these are drawings of seeds. Ask about the OS.",
  "I have a certificate in wtfOS guidance and absolutely nothing else.",
  "Beyond my whiskers, friend. wtfOS questions only.",
  "The answer is somewhere between 'no idea' and 'still no idea'.",
  "I could make something up, but the last hamster who did that got promoted to management, and I fear success.",
  "My crystal ball is a marble I found. It says: ask about side quests.",
  "That question bounced off my tiny skull like a sunflower seed off a window.",
  "If it's not in wtfOS, it's not in Reggie. That's the deal. Take it up with my agent.",
  "Hmm. Hmmmm. No. Next question.",
  "I once tried to know things outside wtfOS. I pulled a muscle.",
  "That's a great question for someone with a spine longer than 4 centimeters.",
  "The wheel in my enclosure spins faster than my brain on that topic.",
  "Out of scope, chief. My scope is: this OS, your quests, and snack schedules.",
  "I'll allow the question, but I refuse the answer, on account of not having one.",
  "You want the OTHER assistant. Tall, invisible, doesn't exist. I'm the hamster one.",
  "My lawyer (also a hamster) advises me not to speculate.",
  "Somewhere, an actual expert just shivered. Ask me about wtfOS instead.",
  "I know 87 things and that isn't one of them. Impressive count though, right?",
  "Buddy, I navigate by smell. Recalibrate your expectations.",
  "That's outside the burrow of my expertise.",
  "Processing... processing... this is me stalling because I don't know.",
  "Great question! Anyway. Side quests?",
  "I asked the desktop pet. It also doesn't know, but it says hi.",
  "My sources (a wheel, a water bottle) have no comment.",
  "If I answered questions like that, they'd make me wear a tie.",
  "Nope. But have you connected your Etherlink wallet yet? Smooth segue, Reggie.",
  "I'm flattered you think I know that. Genuinely. Warm feeling. No answer though.",
  "Some knowledge is forbidden. Some is just missing. Mine is the second one.",
  "That's a mystery even the command palette can't solve, and it solves everything.",
  "I stuffed the answer in my cheek pouches and lost it. Happens more than you'd think.",
  "Consider this a teaching moment where neither of us learns anything.",
  "Whoa there. I'm one hamster. The lore team is down the hall.",
  "The only firehose I know is the AT Protocol one, and it has no opinion either.",
  "Denied. Not for security reasons. For ignorance reasons.",
  "I would need at least three more brain cells and a snack to attempt that.",
  "Look, I peaked at 'explains wallet signatures'. Let me have this.",
];

export function greeting(seed: string): string {
  return pickLine(REGGIE_GREETINGS, `greet:${seed}`);
}

export function nag(seed: string, avoid?: string): string {
  return pickLine(REGGIE_NAGS, `nag:${seed}`, avoid);
}

export function smartAssReply(seed: string, avoid?: string): string {
  return pickLine(REGGIE_SMARTASS_REPLIES, `smartass:${seed}`, avoid);
}

export function stepLine(
  stepKey: string,
  kind: keyof StepDialogue,
  seed: string,
  avoid?: string
): string {
  const dialogue = REGGIE_STEP_DIALOGUE[stepKey];
  if (!dialogue) {
    return pickLine(REGGIE_NAGS, `${stepKey}:${kind}:${seed}`, avoid);
  }
  return pickLine(dialogue[kind], `${stepKey}:${kind}:${seed}`, avoid);
}

export function questCompleteLine(seed: string): string {
  return pickLine(REGGIE_QUEST_COMPLETE_LINES, `complete:${seed}`);
}
