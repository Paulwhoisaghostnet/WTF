/**
 * Dragon — Story data (cyberpunk edition).
 *
 * All dialogue line arrays live here so game logic is not mixed with content.
 * Each key is an event name or branch name used by events.js.
 * Branching events (e.g. talk_barsik) have suffixed variants.
 */
'use strict';

const STORY = {

  /* ══ FOREST ══════════════════════════════════════════════════ */
  forest_intro: [
    { speaker:'NARRATOR', text:"Somewhere past the last cell tower. GPS says you're nowhere. There's a settlement ahead." },
    { speaker:'NARRATOR', text:"Population: unclear. Controlled by: The Dragon. Running it since before the first server was racked. They call it stability." },
    { speaker:'LANCE',    text:"I've been monitoring this situation for years. You can't just scroll past it." },
    { speaker:'LANCE',    text:"There's signal from a building up north. Someone's still online. Walk toward it." },
  ],

  /* ══ KITCHEN ═════════════════════════════════════════════════ */
  kitchen_intro: [
    { speaker:'NARRATOR', text:"Charlie Romanov's server room. Warm hum of drives, good climate control. An orange cat is asleep by the rack." },
    { speaker:'LANCE',    text:"Hello? The door was unlocked—" },
    { speaker:'BARSIK',   text:"Mm." },
    { speaker:'LANCE',    text:"...Did the cat just—" },
    { speaker:'BARSIK',   text:"When the cooling's this good, the smart play is to sleep and say nothing. But you're going to make that impossible, aren't you." },
  ],

  talk_barsik_first: [
    { speaker:'BARSIK', text:"The Dragon has been running this district for four hundred years. At some point the system just became the default. Normal." },
    { speaker:'BARSIK', text:"This cycle he picked Elena Romanov for extracting her life energy to energize the compute. Charlie's daughter. The family smiles about it. That's the worst part." },
    { speaker:'LANCE',  text:"How many nodes?" },
    { speaker:'BARSIK', text:"Three compute heads. Massive server cluster. DDoS capability. Enough processing power to run a small country." },
    { speaker:'LANCE',  text:"OK. What can we do?" },
    { speaker:'BARSIK', text:"You'd challenge him. He has to accept — there's a signed smart contract. Four hundred years old, but it still validates." },
    { speaker:'LANCE',  text:"I'll do it." },
    { speaker:'BARSIK', text:"Statistically, he wins. Every single time. But it's been four hundred years and I want to dream again. So. Please try." },
  ],
  talk_barsik_after_dragon: [
    { speaker:'BARSIK', text:"The plaza is south. The underground workshop is accessible from there. Good luck." },
  ],
  talk_barsik_wait: [
    { speaker:'BARSIK', text:"Wait for Charlie and Elena. They'll be back soon." },
  ],

  family_arrives: [
    { speaker:'NARRATOR', text:"The door opens. Charlie Romanov and his daughter Elena come in. They're both smiling. You notice how practiced it looks." },
    { speaker:'CHARLIE',  text:"Hello! Our network is open to everyone, always. Please, log in." },
    { speaker:'LANCE',    text:"Thanks. I'm here about the Dragon." },
    { speaker:'ELENA',    text:"There's nothing to hack around it. Please don't make this harder." },
    { speaker:'CHARLIE',  text:"He's been here four centuries. You learn to route around it. He once killed a ransomware outbreak — wiped every infected node in the district." },
    { speaker:'LANCE',    text:"That was eighty years ago. He still siphons a thousand cycles of compute every month." },
    { speaker:'CHARLIE',  text:"Well, you don't forget a good patch." },
    { speaker:'LANCE',    text:"I'm going to challenge him. Tomorrow." },
    { speaker:'ELENA',    text:"...Then I'm asking you not to. If you crash, it makes everything harder to process." },
    { speaker:'LANCE',    text:"Understood. I'm still going to do it." },
  ],

  dragon_visits: [
    { speaker:'NARRATOR', text:"There's a knock. A compact, grey man steps in — good posture, quiet authority. This is the Dragon in his working form." },
    { speaker:'DRAGON',   text:"Evening. Lena, hello. Who's this?" },
    { speaker:'LANCE',    text:"I'm challenging you." },
    { speaker:'DRAGON',   text:"Another one. Fine. Dawn. I accept." },
    { speaker:'DRAGON',   text:"I flagged your handle fourteen months ago. I've read every message you sent that you thought was encrypted. You came anyway. I respect that more than I expected to." },
    { speaker:'LANCE',    text:"It means you've had a long time to get comfortable." },
    { speaker:'NARRATOR', text:"The Dragon leaves. The room settles. Charlie sits down slowly." },
    { speaker:'CHARLIE',  text:"What did I do. I couldn't help myself — I let a stranger in and now — Elena — are you angry with me?" },
    { speaker:'ELENA',    text:"No, Papa. Of course not." },
    { speaker:'NARRATOR', text:"Lance stands at the window. His hands are not steady." },
    { speaker:'LANCE',    text:"(quietly) Fourteen months. He's right — I almost didn't come." },
  ],

  /* ══ TOWN SQUARE ═════════════════════════════════════════════ */
  square_intro: [
    { speaker:'NARRATOR', text:"The plaza. Neon-washed concrete worn smooth by four hundred years of compliance." },
    { speaker:'NARRATOR', text:"The underground workshop is through the door to the north. People there said they had things to give you." },
    { speaker:'LANCE',    text:"Better go collect whatever they've built before I walk into that server cluster." },
  ],

  /* ══ SYRINGE SCENE ══════════════════════════════════════════ */
  elena_syringe_scene: [
    { speaker:'NARRATOR', text:"Hank Brooks materializes from the shadow of the district office. Elena is alone near the holo-kiosk." },
    { speaker:'HANK',     text:"Elena. Message from the Dragon. Off the record." },
    { speaker:'HANK',     text:"He wants the challenger dead before the fight. There's a syringe. Loaded with a neural toxin. Use it. If you don't — three of your contacts disappear tonight. No log entry. Just gone." },
    { speaker:'ELENA',    text:"He'll do that to me regardless." },
    { speaker:'HANK',     text:"Actually, no. He lets you walk. Someone else next cycle. You don't even know her name. That's the offer." },
    { speaker:'HANK',     text:"Say goodbye to him. Make it feel authentic. Then the syringe. He'll honor the contract — he has an uptime record." },
    { speaker:'NARRATOR', text:"Hank leaves. Elena stands alone in the plaza, holding the syringe." },
    { speaker:'ELENA',    text:"Four hundred years of this. And I was the most compliant user in the district. I believed everything they told me about why it had to be this way." },
    { speaker:'ELENA',    text:"I brought the syringe here. I know exactly how to deploy it." },
    { speaker:'LANCE',    text:"Elena." },
    { speaker:'ELENA',    text:"He told me to kill you. With this." },
    { speaker:'LANCE',    text:"I know." },
    { speaker:'ELENA',    text:"Look at it." },
    { speaker:'NARRATOR', text:"She throws the syringe into the drainage grate. A low tremor runs through the tower." },
    { speaker:'DRAGON',   text:"(distant) You have no idea what you've just—" },
    { speaker:'ELENA',    text:"Not one word. Not after what you said to me." },
    { speaker:'LANCE',    text:"Head east when you're ready. I'll be at the tower." },
    { speaker:'ELENA',    text:"Come back." },
  ],

  talk_elena_after_syringe: [
    { speaker:'ELENA', text:"The syringe is in the drain. I don't know what comes next. That's okay. That's actually okay." },
  ],
  talk_elena_before_syringe: [
    { speaker:'ELENA', text:"I thought this was just how systems worked. I didn't know there was another kind of normal." },
  ],

  talk_mayor: [
    { speaker:'MAYOR', text:"Keep your voice down. No eye contact. My approval metrics are at historical lows and it is entirely because of the disruption you've introduced." },
    { speaker:'LANCE', text:"I'm going to liberate this district." },
    { speaker:'MAYOR', text:"Liberate it! I have seventeen dependencies! The Dragon manages my calendar! Everything was load-balanced!" },
    { speaker:'HANK',  text:"What Mayor Brooks is saying is that unsolicited external penetration destabilizes existing governance architectures." },
    { speaker:'LANCE', text:"Governance for whom?" },
    { speaker:'HANK',  text:"The official position is that this query requires a structured review process with appropriate stakeholder input." },
  ],

  talk_charlie: [
    { speaker:'CHARLIE', text:"I still can't believe I let him in. Fifty years as an archivist — I have the original smart contract. Dragon's cryptographic signature. Any challenger has safe passage. He has never revoked it." },
    { speaker:'CHARLIE', text:"He called himself 'naive, sentimental, inexperienced' when he signed it. Four hundred years ago. The hash is still valid. It holds." },
    { speaker:'LANCE',   text:"Good to know." },
    { speaker:'CHARLIE', text:"I've been wrong about a lot of things for a very long time. Please don't let that be the last entry in my logs." },
  ],

  talk_hank: [
    { speaker:'HANK',  text:"(quietly) Between us — I'm the real asset here. I can shift public sentiment in any direction. I was waiting for the right window to deploy." },
    { speaker:'LANCE', text:"That's a very specific kind of self-delusion." },
    { speaker:'HANK',  text:"I prefer 'strategic patience.'" },
  ],

  /* ══ WORKSHOP ════════════════════════════════════════════════ */
  workshop_intro: [
    { speaker:'NARRATOR', text:"The underground workshop. Warm, loud, smells like solder and ozone. Four people are working — or pretending to — while they wait." },
    { speaker:'NARRATOR', text:"They've been waiting a long time." },
  ],

  talk_blacksmith: [
    { speaker:'ANDREEV', text:"Military-grade overclock chips. Built these overnight. Before I hand them over — the Dragon's cooling vent has a gap. Where exactly?" },
    {
      speaker:'ANDREEV', text:"Tell me the entry point. Get it wrong and I keep these.",
      choices: [
        { text:"The front access panel on the eastern face." },
        { text:"Left side of the cooling vent, top of the server rack.", correct: true },
        { text:"Behind the monitor array, signal junction point." },
      ],
      onRight: [
        { speaker:'ANDREEV', text:"Correct. You've been studying. Two chips — one for the opener, one for the reload. Don't waste them on a half-charge." },
      ],
      onWrong: [
        { speaker:'ANDREEV', text:"No. That access panel is sealed from the inside — you'd crash the approach. Come back when you've actually looked at the schematics." },
      ],
    },
  ],
  talk_blacksmith_again: [
    { speaker:'ANDREEV', text:"Workshop's open. If something breaks, come back. I'll be here." },
  ],

  talk_petrov: [
    { speaker:'PETROV', text:"Three generations on this trike. My grandmother started the motor, my mother finished the frame, I spent thirty years on the flight module. It works." },
    {
      speaker:'PETROV', text:"One correct approach gets you onto the Dragon's cluster. What is it?",
      choices: [
        { text:"Low approach from the west — fast, under his sensor range." },
        { text:"Head-on from the south at full speed, straight at the monitors." },
        { text:"Altitude from the east, then dive straight down onto the cooling vent.", correct: true },
      ],
      onRight: [
        { speaker:'PETROV', text:"That's it. You land clean on the vent, right on top of his server rack. The trike knows the route. It was always going to end here." },
      ],
      onWrong: [
        { speaker:'PETROV', text:"No. West approach walks you right into the cooling fans — you'd disintegrate on approach. I'm not handing this over to someone who hasn't done the homework." },
      ],
    },
  ],
  talk_petrov_again: [
    { speaker:'PETROV', text:"Safe travels. Altitude first, then dive. You know what to do." },
  ],

  talk_hatter: [
    { speaker:'NPC', text:"VPN Shield. Activate it and you vanish from every sensor — no thermal trace, no network signature. Complete blackout. One use." },
    {
      speaker:'NPC', text:"Last person who took this froze when it mattered. I need to know: when do you use it?",
      choices: [
        { text:"At the start of the fight, to open with an ambush." },
        { text:"When the Dragon telegraphs his next move — break his read on me.", correct: true },
        { text:"Only in phase three, when he gets unpredictable." },
      ],
      onRight: [
        { speaker:'NPC', text:"Yes — intercept the telegraph, not the hit. That's exactly right. My hands are still shaking. Take it. Please go." },
      ],
      onWrong: [
        { speaker:'NPC', text:"No — that timing wastes the blackout entirely. The Dragon reads patterns, not moments. I can't hand this to someone who'll waste it on instinct." },
      ],
    },
  ],
  talk_hatter_again: [
    { speaker:'NPC', text:"It's a one-time blackout. Make it count." },
  ],

  talk_luthier: [
    { speaker:'WU', text:"Five generations on this transmitter. My great-great-grandmother started the first frequency. She never heard it completed. I have. Two bursts in it." },
    {
      speaker:'WU', text:"The signal clears corrupted data from your system and disrupts his comms. When does it work best?",
      choices: [
        { text:"After a three-second hold — you need to stay still during broadcast." },
        { text:"Only in phase three, when his comms are already degraded." },
        { text:"Immediately on activation — it's instant disruption, no delay.", correct: true },
      ],
      onRight: [
        { speaker:'WU', text:"Correct. Instant. No hold, no phase restriction." },
        {
          speaker:'WU', text:"Last question. My family spent five generations on this. What do you owe us if you succeed?",
          choices: [
            { text:"I'll make sure the world knows it came from your family." },
            { text:"To use it. Finish what you all started. That's the whole point of it.", correct: true },
            { text:"I'll bring it back intact when I'm done." },
          ],
          onRight: [
            { speaker:'WU', text:"That's the right answer. Not credit — completion. Here. Two bursts. Use them." },
          ],
          onWrong: [
            { speaker:'WU', text:"No. Credit and keepsakes aren't why we built it. I'm not handing this to someone who doesn't understand that." },
          ],
        },
      ],
      onWrong: [
        { speaker:'WU', text:"No. There's no hold time. If you need to stand still under fire to use a tool, the tool is worthless. I'll keep this until someone who actually listened comes along." },
      ],
    },
  ],
  talk_luthier_again: [
    { speaker:'WU', text:"The frequency is clear. When you activate it, you'll hear it." },
  ],

  /* ══ MOUNTAIN / LAIR ═════════════════════════════════════════ */
  mountain_intro: [
    { speaker:'NARRATOR', text:"The Dragon's tower. The air tastes like ozone and dead accounts. Burned-out terminals of previous challengers line the corridor." },
    { speaker:'LANCE',    text:"Walk north. The mainframe is up there. That's where this ends one way or another." },
  ],

  lair_intro: [
    { speaker:'NARRATOR', text:"The server room entrance. The heat is immediate — not just thermal, something chemical. The walls are scored with scorch marks going back centuries." },
    { speaker:'LANCE',    text:"Someone scratched something in the panel here. 'Piece of shit D. is not invincible...' No signature. Just that." },
    { speaker:'NARRATOR', text:"Walk north into the core. He's processing." },
  ],

  start_battle: [
    { speaker:'NARRATOR', text:"The chamber opens up. Something massive hums in the dark. Three monitor screens flicker online — three dragon faces rendered in cold light." },
    { speaker:'DRAGON',   text:"Lancelot. You connected. Most don't make it past the second firewall." },
    { speaker:'LANCE',    text:"Lance. And yeah." },
    { speaker:'DRAGON',   text:"I was running when the first network was wired. I was online when the last free server was decommissioned. I am composed of every system that ever called itself permanent." },
    { speaker:'LANCE',    text:"You sent a loaded syringe through Elena Romanov's hands. I want you to know I know that." },
    { speaker:'DRAGON',   text:"Operational necessity. You understand." },
    { speaker:'LANCE',    text:"I really don't." },
    { speaker:'DRAGON',   text:"Every system that replaced me became me within fifty years. I've watched it happen six times. I'm not your enemy. I'm your destination." },
    { speaker:'LANCE',    text:"Not this time." },
    { speaker:'DRAGON',   text:"You have eleven people who would grieve you. I have their contact handles. That's not a threat — just context for the conversation." },
    { speaker:'LANCE',    text:"I know their names too. That's why I'm standing here." },
  ],

  /* ══ PALACE ══════════════════════════════════════════════════ */
  palace_intro: [
    { speaker:'NARRATOR', text:"One year later. Mayor Brooks has declared himself the Liberator of the Dragon's Domain and Acting Administrator of the Free District." },
    { speaker:'NARRATOR', text:"One year of Mayor Brooks's tiresome courtship. The ceremony is underway. Elena is standing at the terminal in the outfit the penthouse chose for her." },
    { speaker:'MAYOR',    text:"The merger is hereby ratified. Scribes — log it! Elena, confirm your consent." },
    { speaker:'ELENA',    text:"No." },
    { speaker:'MAYOR',    text:"In our protocol, 'no' during a formal ceremony is a positive acknowledgment! Scribes — log that she confirmed!" },
    { speaker:'NARRATOR', text:"The doors open on their own." },
    { speaker:'LANCE',    text:"Good evening, Elena." },
    { speaker:'ELENA',    text:"You came back." },
    { speaker:'LANCE',    text:"I said I would." },
    { speaker:'ELENA',    text:"You look terrible." },
    { speaker:'LANCE',    text:"I feel terrible. Still here though. For you." },
    { speaker:'NARRATOR', text:"For a moment, nobody else in the room matters. Elena looks away. The mayor looks on, amused." },
  ],

  mayor_press_conference: [
    { speaker:'NARRATOR', text:"Then Mayor Brooks turns to the assembled feeds." },
    { speaker:'MAYOR',     text:"I want to be clear. The Dragon has been neutralized as a direct result of the strategic leadership shown by this office and by my son Henry Brooks Jr." },
    { speaker:'HANK',      text:"The mayor personally authorized the operational framework that created the conditions necessary for the challenger's eventual success." },
    { speaker:'REPORTER',  text:"Who actually fought the Dragon?" },
    { speaker:'HANK',      text:"That's a reductive framing. Leadership is combat. Governance is combat. The mayor was in the fight every single cycle." },
    { speaker:'MAYOR',     text:"My approval metrics are now seventy-one percent. We will take no further queries today." },
    { speaker:'NARRATOR',  text:"The room applauds. Nobody mentions Lance's handle." },
    { speaker:'NARRATOR',  text:"Lance is still standing in the doorway." },
  ],

  palace_confrontation: [
    { speaker:'MAYOR',  text:"Security — why isn't security — HANK?" },
    { speaker:'HANK',   text:"The VPN shield. He's been invisible on every sensor for a month. He's been here for everything." },
    { speaker:'LANCE',  text:"Every document. Every name. Everything you authorized in the last year. The Petrov crew is outside with a working tribunal." },
    { speaker:'PETROV', text:"We're already in position. Six witnesses. All logged and timestamped." },
    { speaker:'MAYOR',  text:"This is — I have constitutional protections! I have admin rights!" },
    { speaker:'LANCE',  text:"You have exactly the same rights you gave everyone else while you were running things. I hope you find that sufficient." },
    { speaker:'ANDREEV', text:"Move. We don't have all night and the power grid needs reconfiguring." },
  ],

  ending: [
    { speaker:'NARRATOR', text:"The mayor and Hank are escorted out. For the first time in four centuries — the Dragon is offline. No sovereign process. No arrangement." },
    { speaker:'ELENA',    text:"What happens now?" },
    { speaker:'LANCE',    text:"The hard part. The Dragon is down but there's a piece of his code in everyone who spent four hundred years making peace with the system. That takes longer than one fight." },
    { speaker:'CHARLIE',  text:"Be patient with us, Mr. Lance. Patch carefully. Rebuild the network — clean signal helps. Remove the malware gently so you don't corrupt the good data." },
    { speaker:'PETROV',   text:"Infrastructure team is ready. We know where the locked nodes are. We start tonight." },
    { speaker:'ANDREEV',  text:"Workshop is open to everyone. Anyone who needs something built — come find us. No waitlist. No licensing fee." },
    { speaker:'WU',       text:"The broadcast frequency is clear for the first time in four hundred years. We're going to fill it with something worth hearing." },
    { speaker:'BARSIK',   text:"I'm going back to sleep. Don't misread that as apathy. This is me trusting you to handle it." },
    { speaker:'LANCE',    text:"I know. That's why I'm here." },
    { speaker:'NARRATOR', text:"And after all the exploits and all the firewalls — they were free. Truly free, in the end." },
    { speaker:'NARRATOR', text:"\u2014 T H E   E N D \u2014" },
  ],

  /* ══ COMBAT CUTSCENE ══════════════════════════════════════════ */
  dragon_broadcast: [
    { speaker:'NARRATOR', text:"Every screen in the district lights up. Every phone, every dashboard, every storefront display." },
    { speaker:'DRAGON',   text:"What you're seeing right now is synthetic. The Dragon is winning, hero is pathetic. Our analytics team has confirmed it." },
    { speaker:'DRAGON',   text:"The intruder is running a psyop for an outside audience. This is not real. Stay connected. Stay indoors." },
    { speaker:'NARRATOR', text:"The broadcast runs for eleven seconds. Then the screens go dark." },
    { speaker:'DRAGON',   text:"We will address this at the scheduled maintenance window. Thank you for your continued uptime." },
    { speaker:'NARRATOR', text:"The second monitor is still on the ground. Lance is still standing. Back to it." },
  ],

  /* ══ POST-BATTLE ═════════════════════════════════════════════ */
  battle_win: [
    { speaker:'NARRATOR', text:"The last monitor shatters. The tower goes quiet for the first time in four hundred years." },
    { speaker:'LANCE',    text:"OK. I think... I'm done." },
    { speaker:'NARRATOR', text:"He takes two steps forward and goes down. The damage from the fight was already too much." },
    { speaker:'NARRATOR', text:"The e-trike. It was in his pack the whole time. It powers on, unfolds, and slides under him." },
    { speaker:'ELENA',    text:"(from the doorway) Lance—" },
    { speaker:'NARRATOR', text:"The trike lifts. Slowly. Then faster. Out through the corridor, into the open sky." },
    { speaker:'NARRATOR', text:"Gone. Carried somewhere safe. He will come back when he's ready." },
  ],

  battle_lose: [
    { speaker:'LANCE', text:"Three critical errors before this. I'm still running. That means something. One more try." },
  ],

  /* ══ POSTGAME EPILOGUE ═══════════════════════════════════════ */
  postgame_elena: [
    { speaker:'ELENA', text:"I love you. I wanted to say that when no one was watching and nothing was on fire." },
    { speaker:'ELENA', text:"The dragon is in everyone, Lance. In me. In you. In the mayor. In the people who smiled while it ran. You don\u2019t kill it once \u2014 you fight it every single day." },
    { speaker:'ELENA', text:"That\u2019s the real work. I want to do it next to you." },
  ],

  postgame_charlie: [
    { speaker:'CHARLIE', text:"My daughter is alive. Four hundred years of that thing, and my daughter is alive." },
    { speaker:'CHARLIE', text:"I accepted too much for too long. But she\u2019s here. You brought her back." },
    { speaker:'CHARLIE', text:"The archives are open now. Every record. The district will need them to rebuild." },
  ],

  postgame_mayor: [
    { speaker:'MAYOR', text:"I want to be absolutely clear: I was working from the inside. This was a coordinated transition strategy." },
    { speaker:'HANK',  text:"What Mayor Brooks means is that the governance shift was pre-authorized under subsection 7(b) of the emergency protocol." },
    { speaker:'MAYOR', text:"My approval numbers are holding at sixty-three percent despite everything!" },
    { speaker:'HANK',  text:"The official position is that this office facilitated the conditions necessary for regime change." },
  ],

  postgame_barsik: [
    { speaker:'BARSIK', text:"See that terminal in the corner? It\u2019s copying itself into the net. The Dragon\u2019s code." },
    { speaker:'BARSIK', text:"It always does this. Every system that gets comfortable becomes the next dragon. That\u2019s the cycle." },
    { speaker:'BARSIK', text:"Stay uncomfortable. That\u2019s the only advice worth giving." },
  ],

  postgame_petrov: [
    { speaker:'PETROV', text:"Three generations on this trike. My grandmother started the motor, my mother finished the frame, I spent thirty years on the flight module. It works." },
    { speaker:'PETROV', text:"Altitude from the east. Dive straight down. You land on the cooling vent at the top of his server rack. The trike knows the route — it was always going to end here." },
    { speaker:'LANCE',  text:"Three generations. That's a lot of faith in someone who hasn't shown up yet." },
    { speaker:'PETROV', text:"It wasn't faith. It was engineering. You build for the variable you can't predict, and one day it walks through the door." },
  ],

  postgame_andreev: [
    { speaker:'ANDREEV', text:"The laser rifle is in three pieces in my bag. Souvenir. Also, evidence." },
    { speaker:'ANDREEV', text:"You know what I\u2019m going to do tomorrow? Build something that isn\u2019t a weapon. Haven\u2019t had the option in forty years." },
    { speaker:'ANDREEV', text:"The workshop doors are open. Walk in. Tell me what you need. We\u2019ll figure it out." },
  ],

  postgame_hank: [
    { speaker:'HANK', text:"(quietly) Between us — I'm still the real asset here. I can shift public sentiment in any direction. I was waiting for the right window to deploy strategically and relentlessly." },
    { speaker:'LANCE', text:"Peach, please." },
    { speaker:'HANK', text:"Anything for you." },
  ],


};

window.STORY = STORY;
