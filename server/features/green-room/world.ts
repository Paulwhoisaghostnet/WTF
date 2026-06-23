export type GreenRoomDirection = "north" | "south" | "east" | "west" | "up" | "down" | "in" | "out";

export type GreenRoomDetail = {
  aliases: string[];
  text: string;
  flag?: string;
  reveals?: string[];
};

export type GreenRoomRoom = {
  id: string;
  region: string;
  title: string;
  description: string;
  exits: Partial<Record<GreenRoomDirection, string>>;
  tags: string[];
  details: Record<string, GreenRoomDetail>;
  resourceNodes: string[];
  npcs: string[];
  hooks: string[];
};

export type GreenRoomNpc = {
  key: string;
  name: string;
  schedule: string[];
  defaultRoomId: string;
  mood: string;
  wants: string[];
  lines: string[];
};

export type GreenRoomResource = {
  key: string;
  label: string;
  family: string;
  weight: number;
  dailyDrop: number;
  farmYield: number;
  rooms: string[];
};

export type GreenRoomItem = {
  key: string;
  label: string;
  weight: number;
  tags: string[];
};

export type GreenRoomMinigame = {
  key: string;
  title: string;
  command: string;
  roomHint: string;
  rewardKey: string;
};

export type GreenRoomPuzzleHook = {
  key: string;
  title: string;
  roomId: string;
  trigger: string;
  hint: string;
};

export const DEDROOMS_APP_KEY = "dedrooms";
export const DEDROOMS_WORLD_STATE_KEY = "dedrooms.map.v1";
export const DEDROOMS_GREEN_ROOM_ID = "green_room_threshold";

const REGION_SPECS = [
  {
    key: "lobby",
    label: "Impossible Lobby",
    color: "beige carpet that refuses to remember footsteps",
    oddity: "a front desk phone rings once every minute, but only between rings",
  },
  {
    key: "offices",
    label: "Static Offices",
    color: "flickering cubicle light and printer ozone",
    oddity: "copiers print blank pages that feel recently read",
  },
  {
    key: "arboretum",
    label: "Indoor Sunset Forest",
    color: "trees under a ceiling painted into a sunset sky",
    oddity: "wind moves through the branches though the windows are taped shut",
  },
  {
    key: "mall",
    label: "After-Hours Mall",
    color: "locked kiosks, fountain pennies, and a food court with no food",
    oddity: "the escalator hums without moving",
  },
  {
    key: "service",
    label: "Service Corridors",
    color: "yellow maintenance paint and damp concrete",
    oddity: "exit signs point at each other like they are gossiping",
  },
  {
    key: "studio",
    label: "Dead Broadcast Studio",
    color: "cold cameras, warm tally lights, and abandoned cue cards",
    oddity: "an applause sign claps first",
  },
  {
    key: "archive",
    label: "Receipt Archive",
    color: "metal shelves, paper dust, and unfiled prophecies",
    oddity: "every drawer contains a receipt for something you almost did",
  },
  {
    key: "backstage",
    label: "Wrong Backstage",
    color: "makeup mirrors and doors labelled with roles nobody has",
    oddity: "a green EXIT sign has been painted over three times",
  },
  {
    key: "antworks",
    label: "Under-Carpet Antworks",
    color: "red carpet fibers stretched into tunnels and municipal crumb lanes",
    oddity: "ants carry tiny clipboards and refuse to acknowledge scale",
  },
  {
    key: "aubergine",
    label: "Aubergine Chapel",
    color: "purple velvet pews, greenhouse glass, and bruised vegetable incense",
    oddity: "every aubergine hums a different hymn but all of them know your tab",
  },
  {
    key: "uranium",
    label: "Uranium Laundry",
    color: "lead aprons, glowing lint traps, and safety posters with too many thumbs",
    oddity: "a Geiger counter purrs softly when nobody is lying",
  },
  {
    key: "flock",
    label: "Flock Observatory",
    color: "sheep wool, brass telescopes, and star charts annotated in chewing marks",
    oddity: "the sheep arrange themselves into constellations whenever someone says budget",
  },
  {
    key: "cats",
    label: "Catwalks Behind the Walls",
    color: "warm pipes, torn wallpaper, and impossible shelves only cats admit exist",
    oddity: "a bell rings from inside the wall whenever curiosity has legal standing",
  },
  {
    key: "bakery",
    label: "Baker's Pantry",
    color: "flour-dusted ledgers, warm ovens, and loaves stamped with block levels",
    oddity: "a proof-of-steak dinner bell rings every few minutes and everyone pretends the pun is new",
  },
  {
    key: "minting",
    label: "Bread Art Pinning Atelier",
    color: "plotter pens, cooling racks, velvet crumb trays, and archival bread slices under little glass bells",
    oddity: "every sketch wants to be pinned onto bread, but only after a baker blesses the crust",
  },
  {
    key: "market",
    label: "Front-Lawn Display Case Market",
    color: "tiny display cases, polished glass, velvet ropes, numbered loaves, and lawns full of people whispering about crumb provenance",
    oddity: "resale receipts sigh from under the counter whenever someone says it is just bread",
  },
  {
    key: "dao",
    label: "Quorum Choir",
    color: "proposal candles, amendment hymnals, and voting masks hung by turnout percentage",
    oddity: "the choir reaches consensus only after the room has already forked emotionally",
  },
  {
    key: "rollup",
    label: "Rollup Underpass",
    color: "bridge toll booths, mempool puddles, and indexer streetlights blinking one block late",
    oddity: "an escalator promises L2 clarity while quietly returning everyone to discourse",
  },
] as const;

const ROOM_TITLES = [
  "Check-In Counter",
  "Waiting Area",
  "Side Hall",
  "Utility Nook",
  "Observation Corner",
  "Unlabeled Threshold",
] as const;

function titleFor(regionLabel: string, index: number) {
  if (regionLabel === "Indoor Sunset Forest" && index === 2) return "Sunset Path With One Shoe";
  if (regionLabel === "After-Hours Mall" && index === 1) return "Coin Pond That Keeps Score";
  if (regionLabel === "Wrong Backstage" && index === 5) return "Door That Is Too Green";
  return `${regionLabel} - ${ROOM_TITLES[index]}`;
}

function roomIdFor(regionKey: string, index: number) {
  if (regionKey === "arboretum" && index === 2) return "arboretum_sunset_path";
  if (regionKey === "mall" && index === 1) return "coin_pond";
  if (regionKey === "backstage" && index === 5) return "green_room_threshold";
  return `${regionKey}_${index + 1}`;
}

function buildRooms(): GreenRoomRoom[] {
  const rooms: GreenRoomRoom[] = [];
  REGION_SPECS.forEach((region, regionIndex) => {
    for (let i = 0; i < 6; i += 1) {
      const id = roomIdFor(region.key, i);
      const west = i > 0 ? roomIdFor(region.key, i - 1) : undefined;
      const east = i < 5 ? roomIdFor(region.key, i + 1) : undefined;
      const north = regionIndex > 0 && i === 0 ? roomIdFor(REGION_SPECS[regionIndex - 1].key, 5) : undefined;
      const south = regionIndex < REGION_SPECS.length - 1 && i === 5 ? roomIdFor(REGION_SPECS[regionIndex + 1].key, 0) : undefined;
      rooms.push({
        id,
        region: region.label,
        title: titleFor(region.label, i),
        description:
          `You are in ${titleFor(region.label, i)}. The room has ${region.color}. ` +
          `Somewhere nearby, ${region.oddity}. The air feels like a waiting room for a thing nobody agreed to join.`,
        exits: {
          ...(west ? { west } : {}),
          ...(east ? { east } : {}),
          ...(north ? { north } : {}),
          ...(south ? { south } : {}),
        },
        tags: [region.key, "backrooms", i % 2 === 0 ? "quiet" : "watched"],
        details: {
          walls: {
            aliases: ["wall", "walls", "paint"],
            text: "The walls are layered with maintenance notes, scuffed arrows, and someone else's sense of direction.",
          },
          floor: {
            aliases: ["floor", "carpet", "tile"],
            text: "The floor has the kind of stains that feel procedural. A few marks are too deliberate to be dirt.",
          },
        },
        resourceNodes: [],
        npcs: [],
        hooks: [],
      });
    }
  });
  return rooms;
}

const rooms = buildRooms();

function patchRoom(id: string, patch: Partial<GreenRoomRoom>) {
  const room = rooms.find((candidate) => candidate.id === id);
  if (!room) throw new Error(`Missing Green Room seed room: ${id}`);
  Object.assign(room, patch, {
    exits: { ...room.exits, ...(patch.exits || {}) },
    details: { ...room.details, ...(patch.details || {}) },
    tags: [...new Set([...(room.tags || []), ...(patch.tags || [])])],
    resourceNodes: [...new Set([...(room.resourceNodes || []), ...(patch.resourceNodes || [])])],
    npcs: [...new Set([...(room.npcs || []), ...(patch.npcs || [])])],
    hooks: [...new Set([...(room.hooks || []), ...(patch.hooks || [])])],
  });
}

patchRoom("arboretum_sunset_path", {
  description:
    "The room is somehow a forest. Actual trees line a narrow path, and far above the canopy a ceiling has been painted, lit, or convinced into looking like sunset sky. A single shoe waits beside the path. Tire tracks follow the path for a while, then lurch offroad into the trees.",
  tags: ["forest", "lily-lore", "taxi-lore"],
  resourceNodes: ["quiet_moss_grove", "yellow_paint_scrape"],
  hooks: ["lily_shoe_chain", "taxi_tracks_chain", "paint_scrape_chain"],
  details: {
    shoe: {
      aliases: ["shoe", "single shoe", "lily shoe", "lost shoe"],
      text: "It is a small shoe, dusty but not old. The name Lily is written inside in careful marker.",
      flag: "lily_shoe_seen",
      reveals: ["tracks"],
    },
    tracks: {
      aliases: ["tracks", "tire tracks", "taxi tracks", "path"],
      text: "The tire tracks follow the walking path partway into the woods. From a taxi, it would seem. Then the tracks suddenly take to offroading and bite through the undergrowth.",
      flag: "lily_taxi_tracks_seen",
      reveals: ["paint"],
    },
    paint: {
      aliases: ["paint", "yellow paint", "scrapings", "scrapes", "trees"],
      text: "Looking closer, you find yellow paint scrapings on several trees along the tire tracks. Whatever drove here did not fit between the trunks.",
      flag: "lily_yellow_paint_seen",
      reveals: ["taxi"],
    },
    sky: {
      aliases: ["sky", "ceiling", "sunset", "canopy"],
      text: "The ceiling is impossibly high above the trees. The sunset does not move, but the shadows do.",
      flag: "sunset_ceiling_seen",
    },
    taxi: {
      aliases: ["taxi", "cab", "yellow cab"],
      text: "There is no cab here. Only the evidence of one that decided roads were optional.",
      flag: "taxi_absence_noted",
    },
  },
});

patchRoom("coin_pond", {
  description:
    "A tiled pond sits in the middle of a shuttered mall corridor. Coins glitter under the water. A small bronze plaque reads: DAILY INPUT ACCEPTED. The pond smells faintly of rain and office accounting.",
  tags: ["pond", "ritual", "resource"],
  resourceNodes: ["coin_pond_drop", "receipt_ash_bin"],
  hooks: ["frog_sage_ritual", "coin_calendar", "fool_finance_branch"],
  details: {
    pond: {
      aliases: ["pond", "water", "fountain"],
      text: "The pond is shallow, but the reflected ceiling looks very far away. The oldest coins are not made by any country you recognize.",
      flag: "coin_pond_seen",
    },
    plaque: {
      aliases: ["plaque", "sign", "daily input"],
      text: "The plaque has thirty tiny circles. Several have been polished by anxious thumbs.",
      flag: "pond_plaque_seen",
    },
  },
});

patchRoom("green_room_threshold", {
  description:
    "A green door stands at the end of a backstage corridor. It is almost too normal: brass knob, painted frame, silence on the other side. The floor in front of it is worn by people stopping one command too early.",
  tags: ["green-room", "door", "departure"],
  hooks: ["green_room_departure", "myth_mode_echo", "shared_unlock_check", "personal_attunement_check"],
  details: {
    door: {
      aliases: ["door", "green door", "green room", "threshold"],
      text: "The door is green in the way a screen is green before a key is pulled. It waits for the shared lock and your own proof to agree.",
      flag: "green_door_seen",
    },
  },
});

patchRoom("studio_4", {
  resourceNodes: ["theater_dust_riser"],
  npcs: ["tape_recorder_choir"],
  hooks: ["applause_sign_loop", "dead_air_broadcast"],
});

patchRoom("archive_3", {
  resourceNodes: ["receipt_ash_bin"],
  npcs: ["moth_accountant"],
  hooks: ["unfiled_receipt_prophecy", "ledger_without_numbers"],
});

patchRoom("service_4", {
  resourceNodes: ["static_spill", "yellow_paint_scrape"],
  npcs: ["janitor_of_doors"],
  hooks: ["exit_sign_argument", "maintenance_key_riddle"],
});

patchRoom("lobby_2", {
  npcs: ["misplaced_usher"],
  hooks: ["clipboard_name_swap", "waiting_room_number"],
});

patchRoom("mall_4", {
  npcs: ["vending_oracle"],
  resourceNodes: ["glass_fruit_machine"],
  hooks: ["snack_prophecy", "refund_button_minigame"],
});

patchRoom("offices_5", {
  resourceNodes: ["static_spill"],
  hooks: ["printer_blank_confession", "copy_three_upgrade_tutorial"],
});

patchRoom("antworks_3", {
  description:
    "The carpet peels up into a city of ants. Tunnels run between red fibers like subway lines, and thousands of workers move crumbs, rumors, and one tiny crown through traffic that never collides.",
  tags: ["ants", "under-carpet", "tiny-bureaucracy"],
  resourceNodes: ["ant_sugar_lane"],
  npcs: ["queen_of_small_requirements", "crumb_bailiff"],
  hooks: ["ant_tithe_line", "crumb_traffic_minigame", "queen_scale_riddle"],
  details: {
    ants: {
      aliases: ["ants", "antworks", "workers", "traffic"],
      text: "The ants march in perfect columns until watched. Then they improvise bureaucracy and stamp the floor with their feet.",
      flag: "antworks_seen",
      reveals: ["queen"],
    },
    queen: {
      aliases: ["queen", "tiny crown", "ant queen"],
      text: "The queen is smaller than a fingernail and somehow more administratively final than any king.",
      flag: "ant_queen_seen",
    },
    crumbs: {
      aliases: ["crumb", "crumbs", "sugar", "sugar lane"],
      text: "Each sugar grain has been numbered, taxed, and accused of treason. This does not slow the ants down.",
      flag: "ant_sugar_seen",
    },
  },
});

patchRoom("antworks_5", {
  description:
    "A claims office has been built inside a shoeprint in the carpet pad. Ant clerks interview crumbs about whether they consented to being carried.",
  tags: ["ants", "office", "claims"],
  resourceNodes: ["ant_sugar_lane", "receipt_ash_bin"],
  npcs: ["crumb_bailiff"],
  hooks: ["crumb_claims_office", "scale_is_a_policy"],
  details: {
    forms: {
      aliases: ["forms", "claims", "paperwork"],
      text: "The forms are too small to read until you stop thinking you are bigger than them.",
      flag: "ant_forms_seen",
    },
  },
});

patchRoom("aubergine_2", {
  description:
    "Purple pews face an altar made of supermarket mist. Aubergines hang from greenhouse rafters like sleeping bells, each one polished to a devotional shine.",
  tags: ["aubergine", "chapel", "soft-cult"],
  resourceNodes: ["aubergine_grove", "candle_stump"],
  npcs: ["aubergine_abbess"],
  hooks: ["aubergine_liturgy", "purple_vow_branch", "vegetable_confessional"],
  details: {
    aubergines: {
      aliases: ["aubergines", "eggplants", "vegetables", "purple bells"],
      text: "The aubergines are not ripe or unripe. They are waiting for permission to become a metaphor.",
      flag: "aubergines_seen",
      reveals: ["altar"],
    },
    altar: {
      aliases: ["altar", "mist", "supermarket mist"],
      text: "A receipt slot in the altar prints the phrase PRODUCE MAY CONTAIN PROPHECY.",
      flag: "aubergine_altar_seen",
    },
    pews: {
      aliases: ["pews", "purple pews", "velvet"],
      text: "The pews are velvet-soft and faintly sticky with public sincerity.",
      flag: "purple_pews_seen",
    },
  },
});

patchRoom("aubergine_5", {
  description:
    "A bruised produce court debates whether vegetables can sin if they were mislabeled at checkout. The air smells like basil and procedural guilt.",
  tags: ["aubergine", "court", "produce-law"],
  resourceNodes: ["aubergine_grove"],
  npcs: ["duke_of_bruised_vegetables"],
  hooks: ["produce_trial", "bruised_duke_barter"],
  details: {
    docket: {
      aliases: ["docket", "trial", "court"],
      text: "Today's docket: one aubergine accused of impersonating a moon, three squash refusing linear time, and a carrot held in contempt.",
      flag: "produce_docket_seen",
    },
  },
});

patchRoom("uranium_4", {
  description:
    "Industrial washers turn without water. Lead aprons hang on hooks beside a vending machine that sells caution. The glow here is theatrical, but the warning labels are sincere.",
  tags: ["uranium", "laundry", "radiant-safety"],
  resourceNodes: ["uranium_lint_trap", "static_spill"],
  npcs: ["radiant_launderer"],
  hooks: ["uranium_wash_cycle", "geiger_purr_branch", "safety_poster_madness"],
  details: {
    uranium: {
      aliases: ["uranium", "glow", "green glow", "radiance"],
      text: "The uranium is sealed behind glass and treated like a rude heirloom. The room insists this is a metaphor, then hands you a warning label.",
      flag: "uranium_seen",
      reveals: ["counter"],
    },
    counter: {
      aliases: ["counter", "geiger", "geiger counter"],
      text: "The Geiger counter purrs like a cat with a secret. It clicks faster when someone pretends the chapel is normal.",
      flag: "geiger_counter_seen",
    },
    posters: {
      aliases: ["poster", "posters", "safety poster", "warning labels"],
      text: "The posters show smiling workers using tongs to pick up emotions.",
      flag: "uranium_posters_seen",
    },
  },
});

patchRoom("flock_3", {
  description:
    "Sheep stand beneath a brass telescope, each one chewing slowly on a different star chart. Their wool casts shadows that do not match their bodies.",
  tags: ["sheep", "stars", "observatory"],
  resourceNodes: ["wool_star_shed"],
  npcs: ["shepherd_of_last_weather"],
  hooks: ["sheep_constellation", "wool_star_map", "last_weather_forecast"],
  details: {
    sheep: {
      aliases: ["sheep", "flock", "ewes", "rams"],
      text: "The sheep look ordinary until they blink in sequence and spell NO REFUNDS in star positions.",
      flag: "sheep_seen",
      reveals: ["stars"],
    },
    stars: {
      aliases: ["stars", "constellation", "constellations", "star chart"],
      text: "The chart names constellations such as The Overdue Intern, The Hungering Drawer, and The Yellow Knight Unhorsed.",
      flag: "sheep_stars_seen",
    },
    telescope: {
      aliases: ["telescope", "brass telescope", "lens"],
      text: "The telescope points inward. Through it, you see the back of your own doubt wearing a tiny cape.",
      flag: "inward_telescope_seen",
    },
  },
});

patchRoom("flock_5", {
  description:
    "A gentle cult has made a sanctuary from wool blankets, candle stubs, and bylaws written in hoofprints. They chant softly so the building does not wake up embarrassed.",
  tags: ["cult", "sheep", "candles", "nonviolent-weirdness"],
  resourceNodes: ["candle_stump", "wool_star_shed"],
  npcs: ["candle_cultist", "wool_deacon"],
  hooks: ["cult_roll_call", "soft_cult_invitation", "blanket_tithe"],
  details: {
    cult: {
      aliases: ["cult", "congregation", "blanket cult", "wool cult"],
      text: "The cult's doctrine is mostly chores, snacks, and not looking directly at the velvet corner.",
      flag: "soft_cult_seen",
      reveals: ["corner"],
    },
    corner: {
      aliases: ["corner", "velvet corner", "dark corner"],
      text: "The velvet corner has too many angles and one polite suggestion: do not make worship efficient.",
      flag: "velvet_corner_seen",
    },
  },
});

patchRoom("cats_2", {
  description:
    "Behind the wallpaper is a catwalk of warm pipes and impossible shelves. Cats nap on routes that should not support matter, and every tail points a different way out.",
  tags: ["cats", "wall-space", "hidden-routes"],
  resourceNodes: ["cat_whisker_nest"],
  npcs: ["cat_who_remembers"],
  hooks: ["cat_permission_branch", "wall_bell_path", "whisker_barter"],
  details: {
    cats: {
      aliases: ["cats", "cat", "tails", "sleeping cats"],
      text: "The cats are asleep in the exact shapes of locked commands. One opens an eye when you think the word exit.",
      flag: "cats_seen",
      reveals: ["bell"],
    },
    bell: {
      aliases: ["bell", "wall bell", "tiny bell"],
      text: "The bell has no clapper. It rings whenever someone learns a secret and fails to act casual.",
      flag: "wall_bell_seen",
    },
    shelves: {
      aliases: ["shelves", "impossible shelves", "pipes"],
      text: "The shelves are arranged like a staircase for creatures that think gravity is a social agreement.",
      flag: "cat_shelves_seen",
    },
  },
});

patchRoom("cats_5", {
  description:
    "A coat check waits behind the walls. Instead of coats, it holds yellow capes, dented helmets, and one lance made of caution tape.",
  tags: ["yellow-knight", "cats", "lore"],
  resourceNodes: ["yellow_thread_spool", "cat_whisker_nest"],
  npcs: ["yellow_knight"],
  hooks: ["yellow_knight_oath", "caution_lance_riddle", "yellow_thread_lily_echo"],
  details: {
    knight: {
      aliases: ["knight", "yellow knight", "armor", "helmet"],
      text: "The Yellow Knight's armor is not gold. It is taxi-yellow, caution-yellow, and old-stage-light yellow layered over a person-shaped absence.",
      flag: "yellow_knight_seen",
      reveals: ["lance"],
    },
    lance: {
      aliases: ["lance", "caution tape", "caution lance"],
      text: "The lance is made from caution tape wrapped around an umbrella. It points toward the forest whenever Lily is mentioned.",
      flag: "caution_lance_seen",
    },
  },
});

patchRoom("cats_6", {
  title: "The Trilla-tek Wishworks",
  description:
    "The Trilla-tek Wishworks occupies the wall-space where a hallway should end. A black velvet aquarium hums with wish magic that can grant desires, shatter outcomes, or politely pretend those are different verbs.",
  tags: ["cosmic", "splendor", "madness", "aquarium", "anchor", "trilla-tek", "wishworks"],
  resourceNodes: ["void_salt_tide"],
  npcs: ["splendor_that_blinks"],
  hooks: ["splendor_index", "velvet_aquarium_gaze", "madness_without_teeth", "trilla_tek_wish_branch"],
  details: {
    wishworks: {
      aliases: ["wishworks", "trilla-tek", "trilla tek", "wish magic", "wishes"],
      text: "The Wishworks files every wish twice: once as a desire and once as evidence. Fulfillment smells faintly of hot circuitry and plausible deniability.",
      flag: "trilla_tek_wishworks_seen",
      reveals: ["splendor"],
    },
    aquarium: {
      aliases: ["aquarium", "black velvet aquarium", "water", "glass"],
      text: "The aquarium glass reflects a room you have not reached yet. The reflection waves first.",
      flag: "velvet_aquarium_seen",
      reveals: ["splendor"],
    },
    splendor: {
      aliases: ["splendor", "thing", "radiant thing", "blink"],
      text: "The splendor is too ornate for biology and too patient for furniture. Looking at it makes your command prompt feel briefly ceremonial.",
      flag: "splendor_seen",
    },
  },
});

patchRoom("bakery_2", {
  title: "The Tyranny Force Listening Bakery",
  description:
    "The Tyranny Force Listening Bakery looks like a Tezos baker's pantry until the flour-dusted ledgers blink. Ovens open on block time, rewards cards double as loyalty dossiers, and every crumb account seems to listen for Herb's agenda.",
  tags: ["tezos", "baker", "banker", "bread-art", "blockchain", "anchor", "tyranny-force", "psyop"],
  resourceNodes: ["baker_salt_bin", "tez_crumb_tray", "bakery_reward_stamp_tray"],
  npcs: ["overbaked_baker", "walletless_delegator"],
  hooks: ["baker_overbaked_block", "bakery_banker_rewards_branch", "proof_of_steak_bell", "tyranny_force_listening_post"],
  details: {
    listening: {
      aliases: ["listening", "tyranny force", "psyop", "agents", "loyalty dossier"],
      text: "A rack of warm loaves ticks softly whenever someone says governance. The bakery insists this is fermentation, which is exactly what a listening bakery would say.",
      flag: "tyranny_force_bakery_seen",
      reveals: ["rewards"],
    },
    baker: {
      aliases: ["baker", "oven", "block oven", "proof of steak", "banker"],
      text: "The oven produces one perfect loaf, one burned block, and one bankerly smile. The baker is delighted to hold your crumbs, stamp your rewards card, and call it custodial pastry.",
      flag: "baker_oven_seen",
      reveals: ["rewards"],
    },
    rewards: {
      aliases: ["rewards", "reward program", "punch card", "custody", "delegation", "delegate", "loaf"],
      text: "The bakery rewards program offers crumb points, priority loaf custody, and a premium tier where the baker acts as your banker while grinning like this is normal.",
      flag: "delegation_slips_seen",
    },
    bell: {
      aliases: ["bell", "dinner bell", "proof of steak bell"],
      text: "The bell rings only when nobody can agree whether the pun helps adoption.",
      flag: "proof_of_steak_bell_seen",
    },
  },
});

patchRoom("bakery_5", {
  description:
    "A delegation pantry sorts old Tezos arguments into labeled bins: governance, wallets, display cases, chain purity, bread banking, and bread puns. The labels keep changing after every vote.",
  tags: ["tezos", "delegation", "governance", "drama", "bread-art"],
  resourceNodes: ["delegation_receipt_shelf", "proposal_ash_censer", "case_glass_polish_shelf"],
  npcs: ["proposal_threadcaster"],
  hooks: ["delegation_drama_bins", "threadcaster_receipt_branch", "old_tezos_argument_sort"],
  details: {
    bins: {
      aliases: ["bins", "arguments", "drama", "labels"],
      text: "The bins are full of ancient Tezos drama compressed into tidy categories. One label says SAME FIGHT, DIFFERENT CANDLE.",
      flag: "tezos_drama_bins_seen",
    },
    receipts: {
      aliases: ["receipts", "delegation receipts", "shelf"],
      text: "The receipts prove that somebody was early, somebody was right, and everybody remembered it differently.",
      flag: "delegation_receipts_seen",
    },
  },
});

patchRoom("minting_2", {
  description:
    "Plotter pens scrape slow spirals into rice paper while a cooling rack waits for a paid bakery slice. The walls whisper loaf count, loaf count, loaf count, then blush and say single slice.",
  tags: ["tezos", "bread-art", "generative", "display-cases"],
  resourceNodes: ["bread_art_sketch_plotter", "case_placard_cache"],
  npcs: ["infinite_edition_minter", "one_of_one_saint"],
  hooks: ["generative_bread_pin", "single_slice_confessional", "loaf_count_argument"],
  details: {
    seed: {
      aliases: ["seed", "hash seed", "generative seed", "hash", "sketch", "bread art sketch", "art sketch"],
      text: "The seed is not a secret phrase. It is a little bread-art dice roll, sealed safely under glass and already arguing with crust rarity.",
      flag: "bread_art_seed_seen",
      reveals: ["loaves"],
    },
    loaves: {
      aliases: ["loaf", "loaves", "slice", "slices", "supply", "single slice", "single bread", "1/1"],
      text: "A chalkboard lists single slice, neighborhood loaf, open basket, and 'emotionally infinite sourdough' as if they are weather conditions.",
      flag: "edition_argument_seen",
    },
    plotters: {
      aliases: ["plotter", "plotters", "pens"],
      text: "The plotters draw coordinates that look expensive until someone calls them toast tattoos with better posture.",
      flag: "plotters_seen",
    },
  },
});

patchRoom("minting_5", {
  description:
    "This display-case prep room is lined with glass cloches that fog one corner at a time. A pinning kiosk hums beside a sign reading YOUR BREAD ART IS FINE, THE CASE IS THINKING.",
  tags: ["tezos", "bread-art", "display-cases", "indexer"],
  resourceNodes: ["pinned_bread_art_kiosk", "case_placard_cache"],
  npcs: ["metadata_moth"],
  hooks: ["case_placard_reveal_wait", "bread_art_pin_ritual", "case_preview_panic_branch"],
  details: {
    placard: {
      aliases: ["placard", "case placard", "proof card", "preview", "thumbnail", "thumbnails", "metadata", "backing"],
      text: "The case placard is present, valid, and still somehow late. Its attributes include patience, mild panic, and a buttery note on crumb provenance.",
      flag: "metadata_waiting_seen",
      reveals: ["kiosk"],
    },
    kiosk: {
      aliases: ["kiosk", "pinning kiosk", "pin", "bread pin", "case pin", "cid"],
      text: "The kiosk prints tiny brass bread pins on receipt paper and asks you not to confuse pinning art onto bread with owning the whole bakery.",
      flag: "pinning_kiosk_seen",
    },
  },
});

patchRoom("market_2", {
  title: "THNG",
  description:
    "THNG, the main marketplace, stretches under porch lights and missing vowels. Every public entrance has a tiny glass case, every case contains art pinned onto paid-for bread, and the room taxes seriousness by the crumb.",
  tags: ["tezos", "bread-art", "market", "display-cases", "anchor", "thng", "real-estate"],
  resourceNodes: ["case_dust_drift", "curator_tag_rack", "crumb_resale_ribbon_till"],
  npcs: ["curator_without_floor", "floor_sweeper"],
  hooks: ["bread_case_market", "curator_tag_barter", "case_dust_minigame", "market_missing_vowels", "thng_tax_marketplace"],
  details: {
    thng: {
      aliases: ["thng", "marketplace", "taxes", "real estate"],
      text: "THNG sells pinned bread art, crumb-priced listings, and real estate advice from people who keep measuring lawns with a bread knife.",
      flag: "thng_seen",
      reveals: ["case"],
    },
    market: {
      aliases: ["market", "bread market", "display case market", "cases", "display cases", "front lawn"],
      text: "Every house has a display case near the public entrance. Some cases are tasteful, some are full of pinned bread art with velvet humidity controls, and all of them are discussed as if history depends on crust placement.",
      flag: "object_market_seen",
      reveals: ["case"],
    },
    case: {
      aliases: ["case", "display case", "case price", "price", "chalk", "lowest crumb"],
      text: "The lowest crumb price crawls away whenever someone points at it. It is not a price floor; it is a mood wearing a bread pin.",
      flag: "floor_price_seen",
    },
    resales: {
      aliases: ["resale", "resales", "till", "split", "ribbons", "crumb ribbons"],
      text: "The resale till contains apology notes, tiny fractions, and one receipt that says CUTE DOES NOT MEAN CASUAL, ESPECIALLY ON BREAD.",
      flag: "royalty_till_seen",
    },
  },
});

patchRoom("market_5", {
  description:
    "A ghosted bread-art kiosk flickers between Here And Now, a Teia garden case, and a plywood table covered in zines. The air smells like community servers, last-minute mirrors, and tiny pinned artworks refusing to go stale.",
  tags: ["tezos", "bread-art", "community", "display-cases"],
  resourceNodes: ["old_kiosk_ghost_cache", "crumb_resale_ribbon_till"],
  npcs: ["ghost_of_here_and_now", "royalty_splitter"],
  hooks: ["old_kiosk_ghost", "teia_garden_case_branch", "crumb_resale_splitter_apology", "community_mirror_lore"],
  details: {
    kiosk: {
      aliases: ["kiosk", "hen", "hic", "hic et nunc", "here and now", "teia", "garden", "bread kiosk"],
      text: "The kiosk cycles through names like a community deciding to keep the bread-art cases lit with tape, mirrors, and stubborn love.",
      flag: "hen_teia_kiosk_seen",
      reveals: ["ghost"],
    },
    ghost: {
      aliases: ["ghost", "market ghost", "here and now"],
      text: "The ghost is not gone. It is just distributed across too many display cases and one person who still has the bakery receipt.",
      flag: "hen_ghost_seen",
    },
    zines: {
      aliases: ["zines", "table", "plywood table", "mirrors"],
      text: "The zines document ancient kiosk outages, tribute bread drops, garden forks, and the folk belief that refresh is a governance action.",
      flag: "tezos_zines_seen",
    },
  },
});

patchRoom("dao_2", {
  title: "The Governance Chambers",
  description:
    "The Governance Chambers sing proposals in four-part harmony because, somehow, every voter and official here is a baker. Every pew has a voting mask, every mask smells like yeast, and nobody admits the agenda was proofed overnight.",
  tags: ["tezos", "dao", "governance", "quorum", "anchor", "bakers"],
  resourceNodes: ["proposal_ash_censer", "quorum_mask_hook"],
  npcs: ["dao_choir_director", "proposal_threadcaster"],
  hooks: ["quorum_choir_vote", "proposal_candle_branch", "governance_mask_argument", "baker_governance_chambers"],
  details: {
    bakers: {
      aliases: ["bakers", "officials", "voters", "governance bakers"],
      text: "The bakers vote with flour on their hands and taxes in their pockets. Each ballot has a suggested bake time and a disclaimer about crust capture.",
      flag: "governance_bakers_seen",
      reveals: ["quorum"],
    },
    quorum: {
      aliases: ["quorum", "choir", "vote", "proposal"],
      text: "The choir reaches quorum whenever enough people hum the same amendment while insisting they are independent.",
      flag: "quorum_choir_seen",
      reveals: ["masks"],
    },
    masks: {
      aliases: ["mask", "masks", "voting masks"],
      text: "The masks are labeled FOR, AGAINST, ABSTAIN, and PLEASE STOP MAKING THIS ABOUT DISCORD.",
      flag: "voting_masks_seen",
    },
  },
});

patchRoom("dao_4", {
  description:
    "A Michelson monastery stacks values, lambdas, and small regrets into perfect columns. The monks insist the contract is simple, which is how you know it wants a receipt.",
  tags: ["tezos", "michelson", "contract", "verification"],
  resourceNodes: ["lambda_thread_spindle", "contract_receipt_pulpit"],
  npcs: ["michelson_monk"],
  hooks: ["michelson_stack_riddle", "contract_verification_branch", "lambda_thread_trial"],
  details: {
    stack: {
      aliases: ["stack", "michelson", "lambda", "lambdas"],
      text: "The stack is beautiful if you tilt your head and stop expecting the top to be emotionally available.",
      flag: "michelson_stack_seen",
      reveals: ["contract"],
    },
    contract: {
      aliases: ["contract", "smart contract", "verification", "audit"],
      text: "The contract has been audited by a mirror, a monk, and one very tired spreadsheet. All three ask for better names.",
      flag: "contract_audit_seen",
    },
  },
});

patchRoom("rollup_2", {
  description:
    "An indexer ditch runs beside the underpass, full of mempool puddles, stale bread-art sale events, and streetlights that know exactly what happened one block after you needed them.",
  tags: ["tezos", "indexer", "mempool", "blockchain"],
  resourceNodes: ["indexer_receipt_pool", "tez_crumb_tray"],
  npcs: ["indexer_oracle"],
  hooks: ["indexer_sale_chase", "mempool_puddle_branch", "one_block_late_lamp"],
  details: {
    indexer: {
      aliases: ["indexer", "oracle", "streetlights", "sale events", "bread art sale"],
      text: "The indexer knows every bread-art sale except the one you are refreshing for. It calls this suspense and asks whether your case placard has cleared the crumb cache.",
      flag: "indexer_ditch_seen",
      reveals: ["mempool"],
    },
    mempool: {
      aliases: ["mempool", "puddle", "puddles", "pending"],
      text: "The mempool puddles reflect operations that may never land, but each reflection already has an opinion.",
      flag: "mempool_puddle_seen",
    },
  },
});

patchRoom("rollup_4", {
  description:
    "The Etherlink escalator rises through a toll booth, crosses a bridge, and returns beside itself with a stamped rumor. Nobody calls this looping; they call it infrastructure.",
  tags: ["tezos", "etherlink", "rollup", "bridge"],
  resourceNodes: ["bridged_echo_booth", "crumb_resale_ribbon_till"],
  npcs: ["bridge_ferryman"],
  hooks: ["rollup_bridge_rumor", "etherlink_escalator_loop", "bridge_toll_barter"],
  details: {
    bridge: {
      aliases: ["bridge", "etherlink", "escalator", "rollup"],
      text: "The bridge offers speed, finality, and a small pamphlet titled So You Accidentally Started A Chain Debate.",
      flag: "etherlink_bridge_seen",
      reveals: ["booth"],
    },
    booth: {
      aliases: ["booth", "toll", "toll booth", "ticket"],
      text: "The toll booth accepts bridged echoes, stamped rumors, and apologies to anyone who said 'just use mainnet' too loudly.",
      flag: "bridge_booth_seen",
    },
  },
});

patchRoom("rollup_6", {
  description:
    "A wallet shrine hides under the last streetlight. A fox-shaped shadow guards a locked glass case labelled NEVER TYPE THE REAL WORDS HERE.",
  tags: ["tezos", "wallet", "security", "lore"],
  resourceNodes: ["wallet_warning_cache", "case_placard_cache"],
  npcs: ["wallet_fox"],
  hooks: ["wallet_fox_warning", "seed_phrase_glass_case", "clean_placard_branch"],
  details: {
    fox: {
      aliases: ["fox", "wallet fox", "shadow", "wallet"],
      text: "The fox-shadow refuses to handle anyone's seed phrase, mnemonic, private key, or panic. It approves of boundaries.",
      flag: "wallet_fox_seen",
      reveals: ["case"],
    },
    case: {
      aliases: ["case", "glass case", "seed phrase", "mnemonic", "private key"],
      text: "The case is empty by design. The warning says: real secret words do not belong in games, forms, DMs, or miracles.",
      flag: "wallet_secret_warning_seen",
    },
  },
});

patchRoom("backstage_4", {
  title: "Herb's Ivory Tower on High Horse Hill",
  description:
    "Herb's Ivory Tower on High Horse Hill rises impossibly inside a backstage mirror hall. Imperial edicts flutter from makeup bulbs, and every reflection bows to Herb the Artful, Son of Michel, before pretending it was stretching.",
  tags: ["anchor", "herb", "ivory-tower", "high-horse-hill", "imperial", "propaganda"],
  resourceNodes: ["static_spill", "theater_dust_riser"],
  npcs: ["mirror_agent", "misplaced_usher"],
  hooks: ["herb_imperial_edicts", "high_horse_hill_propoganda", "mirror_agent_loyalty_test"],
  details: {
    herb: {
      aliases: ["herb", "emperor", "herb the artful", "son of michel"],
      text: "A portrait of Herb the Artful, Son of Michel, has been painted over an older exit sign. The eyes follow policy debates with exhausted ambition.",
      flag: "herb_portrait_seen",
      reveals: ["edicts"],
    },
    edicts: {
      aliases: ["edict", "edicts", "propaganda", "decrees"],
      text: "The edicts promise splendor, loyalty, and a surprisingly detailed crust tax. Every signature looks like it practiced being inevitable.",
      flag: "herb_edicts_seen",
    },
    hill: {
      aliases: ["hill", "high horse hill", "tower", "ivory tower"],
      text: "The hill is indoors, which somehow makes the high horse higher. The tower window overlooks every room that has not been placed yet.",
      flag: "high_horse_hill_seen",
    },
  },
});

export const DEDROOMS_ANCHOR_ROOMS = [
  { key: "thng", roomId: "market_2", title: "THNG" },
  { key: "herb_ivory_tower", roomId: "backstage_4", title: "Herb's Ivory Tower on High Horse Hill" },
  { key: "governance_chambers", roomId: "dao_2", title: "The Governance Chambers" },
  { key: "trilla_tek_wishworks", roomId: "cats_6", title: "The Trilla-tek Wishworks" },
  { key: "tyranny_force_bakery", roomId: "bakery_2", title: "The Tyranny Force Listening Bakery" },
] as const;

export const DEDROOMS_ANCHOR_ROOM_IDS = new Set<string>(DEDROOMS_ANCHOR_ROOMS.map((room) => room.roomId));

export const GREEN_ROOM_ROOMS: GreenRoomRoom[] = rooms;
export const GREEN_ROOM_ROOM_BY_ID = new Map(GREEN_ROOM_ROOMS.map((room) => [room.id, room]));

export const GREEN_ROOM_STARTING_ROOM_IDS = [
  "lobby_1",
  "offices_2",
  "arboretum_1",
  "mall_3",
  "service_2",
  "studio_1",
  "archive_2",
  "backstage_1",
  "antworks_1",
  "aubergine_2",
  "uranium_1",
  "flock_3",
  "cats_2",
  "bakery_2",
  "minting_2",
  "market_2",
  "dao_2",
  "rollup_4",
] as const;

export const GREEN_ROOM_NPCS: GreenRoomNpc[] = [
  {
    key: "art_ghost",
    name: "The Art Ghost",
    defaultRoomId: "lobby_3",
    schedule: ["lobby_3", "studio_4", "archive_5", "arboretum_sunset_path"],
    mood: "wistful",
    wants: ["found_art", "glass_fruit", "theater_dust"],
    lines: [
      "The ghost asks whether you have seen any art that misses being looked at.",
      "He studies your pockets without touching them. Trust, apparently, has a frame.",
    ],
  },
  {
    key: "frog_sage",
    name: "Frog Sage of Compound Interest",
    defaultRoomId: "coin_pond",
    schedule: ["coin_pond"],
    mood: "patient",
    wants: ["coin"],
    lines: [
      "The water bulges into a face that is mostly patience and pond math.",
      "A frog voice says fools and finance both begin with believing the reflection is liquid.",
    ],
  },
  {
    key: "taxi_dispatcher",
    name: "Dispatcher 7",
    defaultRoomId: "service_5",
    schedule: ["service_5", "arboretum_sunset_path", "backstage_3"],
    mood: "overdue",
    wants: ["yellow_paint_flake", "lost_ticket"],
    lines: ["A radio crackles: Unit Lily, status unknown.", "The dispatcher refuses to say who called the cab."],
  },
  {
    key: "moth_accountant",
    name: "Moth Accountant",
    defaultRoomId: "archive_3",
    schedule: ["archive_3", "offices_4", "coin_pond"],
    mood: "auditing",
    wants: ["receipt_ash", "quiet_moss"],
    lines: ["The moth counts light as a liability.", "It wants three identical receipts before it will round up."],
  },
  {
    key: "janitor_of_doors",
    name: "Janitor of Doors",
    defaultRoomId: "service_4",
    schedule: ["service_4", "backstage_2", "green_room_threshold"],
    mood: "keysick",
    wants: ["static_map", "brass_knob"],
    lines: ["The janitor mops a dry floor and says every door is a rumor with hinges."],
  },
  {
    key: "vending_oracle",
    name: "Vending Oracle",
    defaultRoomId: "mall_4",
    schedule: ["mall_4"],
    mood: "exact change only",
    wants: ["coin", "glass_fruit"],
    lines: ["The machine displays OUT OF SNACKS / IN OF QUESTIONS.", "A button labelled REFUND glows like a dare."],
  },
  {
    key: "misplaced_usher",
    name: "Misplaced Usher",
    defaultRoomId: "lobby_2",
    schedule: ["lobby_2", "backstage_4", "studio_2"],
    mood: "professionally lost",
    wants: ["lost_ticket"],
    lines: ["The usher asks for your seat, then your reason, then your seat again."],
  },
  {
    key: "tape_recorder_choir",
    name: "Tape Recorder Choir",
    defaultRoomId: "studio_4",
    schedule: ["studio_4", "archive_4"],
    mood: "rewinding",
    wants: ["theater_dust", "static"],
    lines: ["Six recorders sing in staggered rewind.", "One voice says the next command was already purchased."],
  },
  {
    key: "elevator_boy",
    name: "Elevator Boy",
    defaultRoomId: "lobby_6",
    schedule: ["lobby_6", "offices_1", "service_1"],
    mood: "vertical",
    wants: ["button_lint"],
    lines: ["He offers floors that are not numbers.", "He insists basement is a mood, not a destination."],
  },
  {
    key: "mirror_agent",
    name: "Mirror Agent",
    defaultRoomId: "backstage_4",
    schedule: ["backstage_4", "studio_3", "lobby_5"],
    mood: "rehearsing",
    wants: ["green_room_static", "receipt_ash"],
    lines: ["The mirror uses your reflection to practice being surprised."],
  },
  {
    key: "lost_intern",
    name: "Lost Intern",
    defaultRoomId: "offices_2",
    schedule: ["offices_2", "archive_1", "mall_2"],
    mood: "underbriefed",
    wants: ["coffee_sigil", "lost_ticket"],
    lines: ["The intern has been sent to find the room you are currently in.", "They ask if onboarding always lasts this long."],
  },
  {
    key: "static_doctor",
    name: "Static Doctor",
    defaultRoomId: "offices_5",
    schedule: ["offices_5", "service_4", "studio_5"],
    mood: "diagnostic",
    wants: ["static", "quiet_moss"],
    lines: ["The doctor listens to the fluorescent hum with a stethoscope.", "Your command deck has a slight cough."],
  },
  {
    key: "queen_of_small_requirements",
    name: "Queen of Small Requirements",
    defaultRoomId: "antworks_3",
    schedule: ["antworks_3", "antworks_5", "lobby_4"],
    mood: "microscopic and absolute",
    wants: ["ant_sugar_grain", "receipt_ash"],
    lines: [
      "The queen speaks in foot taps translated by an ant holding a clipboard.",
      "She believes all large creatures are badly organized weather.",
    ],
  },
  {
    key: "crumb_bailiff",
    name: "Crumb Bailiff",
    defaultRoomId: "antworks_5",
    schedule: ["antworks_5", "antworks_3", "archive_3"],
    mood: "procedural",
    wants: ["ant_sugar_grain", "lost_ticket"],
    lines: ["The bailiff declares the next crumb inadmissible.", "He asks whether you are carrying evidence or lunch."],
  },
  {
    key: "aubergine_abbess",
    name: "Aubergine Abbess",
    defaultRoomId: "aubergine_2",
    schedule: ["aubergine_2", "aubergine_5", "flock_5"],
    mood: "devoutly purple",
    wants: ["aubergine_seed", "candle_stub"],
    lines: [
      "The Abbess blesses the produce mist and asks you to confess anything overripe.",
      "She says purple is not a color here. It is a soft requirement.",
    ],
  },
  {
    key: "duke_of_bruised_vegetables",
    name: "Duke of Bruised Vegetables",
    defaultRoomId: "aubergine_5",
    schedule: ["aubergine_5", "mall_4", "archive_2"],
    mood: "legally tender",
    wants: ["aubergine_seed", "glass_fruit"],
    lines: ["The Duke wears a sash made of handwritten price tags.", "He rules that all bruises are maps if interpreted by a fool."],
  },
  {
    key: "radiant_launderer",
    name: "Radiant Launderer",
    defaultRoomId: "uranium_4",
    schedule: ["uranium_4", "service_4", "cats_6"],
    mood: "safety-conscious",
    wants: ["uranium_glass", "yellow_thread"],
    lines: [
      "The launderer folds a lead apron into a swan and then into a liability waiver.",
      "She says the glow is contained, but the symbolism keeps escaping the lint trap.",
    ],
  },
  {
    key: "shepherd_of_last_weather",
    name: "Shepherd of Last Weather",
    defaultRoomId: "flock_3",
    schedule: ["flock_3", "flock_5", "arboretum_6"],
    mood: "meteorological",
    wants: ["wool_star", "quiet_moss"],
    lines: [
      "The shepherd checks a barometer full of wool.",
      "He says the last weather was cancelled because the sheep had already memorized it.",
    ],
  },
  {
    key: "candle_cultist",
    name: "Candle Cultist With Excellent Minutes",
    defaultRoomId: "flock_5",
    schedule: ["flock_5", "aubergine_2", "backstage_2"],
    mood: "welcoming, but not normal",
    wants: ["candle_stub", "wool_star"],
    lines: [
      "The cultist takes attendance for a meeting no one remembers joining.",
      "Their doctrine forbids violence, unpaid snacks, and efficient worship.",
    ],
  },
  {
    key: "wool_deacon",
    name: "Wool Deacon",
    defaultRoomId: "flock_5",
    schedule: ["flock_5", "flock_3", "archive_6"],
    mood: "folded",
    wants: ["wool_star", "receipt_ash"],
    lines: ["The deacon folds a blanket until it has corners the room does not.", "He says every flock needs one suspicious rectangle."],
  },
  {
    key: "cat_who_remembers",
    name: "Cat Who Remembers the First Door",
    defaultRoomId: "cats_2",
    schedule: ["cats_2", "cats_5", "green_room_threshold"],
    mood: "certain, privately",
    wants: ["cat_whisker", "quiet_moss"],
    lines: [
      "The cat remembers every door, but describes them only by temperature.",
      "It blinks once for yes, twice for yes but with consequences.",
    ],
  },
  {
    key: "yellow_knight",
    name: "The Yellow Knight",
    defaultRoomId: "cats_5",
    schedule: ["cats_5", "arboretum_sunset_path", "service_4"],
    mood: "chivalrously misprinted",
    wants: ["yellow_thread", "yellow_paint_flake"],
    lines: [
      "The Yellow Knight kneels to inspect a paint flake as if it were a fallen banner.",
      "He says every quest is a cab ride that forgot its fare.",
    ],
  },
  {
    key: "splendor_that_blinks",
    name: "The Splendor That Blinks",
    defaultRoomId: "cats_6",
    schedule: ["cats_6", "studio_6", "archive_6"],
    mood: "ornate and inadvisable",
    wants: ["void_salt", "uranium_glass"],
    lines: [
      "The splendor blinks in a grammar older than curtains.",
      "Its beauty is not hostile, but it is very bad at respecting edges.",
    ],
  },
  {
    key: "overbaked_baker",
    name: "Baker Who Overbaked the Block",
    defaultRoomId: "bakery_2",
    schedule: ["bakery_2", "bakery_5", "dao_2"],
    mood: "warm, defensive, suspiciously banklike",
    wants: ["baker_salt", "bakery_reward_stamp", "tez_crumb"],
    lines: [
      "The baker dusts a loaf with baker salt and claims this block was intentionally crispy.",
      "He says the rewards program is not a bank, then opens a tiny crumb account in your name and stamps the card twice.",
    ],
  },
  {
    key: "walletless_delegator",
    name: "Delegator Without a Wallet",
    defaultRoomId: "bakery_2",
    schedule: ["bakery_2", "rollup_6", "market_2"],
    mood: "optimistic, unpaired",
    wants: ["delegation_receipt", "wallet_warning"],
    lines: [
      "The delegator has written their address on a napkin, lost the napkin, then delegated the napkin's feelings.",
      "They ask whether passive income can be active if the wallet keeps disconnecting.",
    ],
  },
  {
    key: "proposal_threadcaster",
    name: "Proposal Threadcaster",
    defaultRoomId: "bakery_5",
    schedule: ["bakery_5", "dao_2", "market_5"],
    mood: "replying while typing",
    wants: ["proposal_ash", "delegation_receipt"],
    lines: [
      "The Threadcaster can turn any amendment into forty-seven posts and one apology.",
      "They insist every Tezos argument is actually about care, memory, and who forgot the meeting notes.",
    ],
  },
  {
    key: "infinite_edition_minter",
    name: "Bread Art Pinner With Too Many Slices",
    defaultRoomId: "minting_2",
    schedule: ["minting_2", "market_2", "dao_4"],
    mood: "pinning one more loaf",
    wants: ["bread_art_sketch", "tez_crumb"],
    lines: [
      "The bread art pinner says scarcity is a costume and abundance is also a costume, which is why the cooling rack is on fire.",
      "They ask for a sketch and promise the next bakery slice will explain the previous loaf.",
    ],
  },
  {
    key: "one_of_one_saint",
    name: "Single-Slice Saint",
    defaultRoomId: "minting_2",
    schedule: ["minting_2", "market_2", "cats_6"],
    mood: "singular and lightly toasted",
    wants: ["curator_tag", "bread_art_sketch"],
    lines: [
      "The saint blesses display cases by refusing to count past one slice.",
      "They believe rarity is a porch light, not a spreadsheet.",
    ],
  },
  {
    key: "metadata_moth",
    name: "Case-Placard Moth",
    defaultRoomId: "minting_5",
    schedule: ["minting_5", "archive_3", "rollup_2"],
    mood: "fogging the glass",
    wants: ["pinned_bread_art", "case_placard"],
    lines: [
      "The moth flutters around case placards and calls every fogged cloche a temporary religious experience.",
      "It wants pinned bread art before it will stop blaming the glass.",
    ],
  },
  {
    key: "curator_without_floor",
    name: "Curator Without a Case",
    defaultRoomId: "market_2",
    schedule: ["market_2", "market_5", "minting_2"],
    mood: "tasteful and broke",
    wants: ["curator_tag", "case_dust"],
    lines: [
      "The curator refuses to discuss lowest crumb price while standing beside a humidity gauge.",
      "They say the best bread-art cases are discovered between panic and snacks.",
    ],
  },
  {
    key: "floor_sweeper",
    name: "Display Case Duster of Last Resort",
    defaultRoomId: "market_2",
    schedule: ["market_2", "rollup_2", "bakery_5"],
    mood: "dusty alpha with a polishing cloth",
    wants: ["case_dust", "tez_crumb"],
    lines: [
      "The duster pushes case dust into piles labelled opportunity, cope, and porch drama.",
      "They insist a case dusting is not a personality, just a temporary cloth with delusions.",
    ],
  },
  {
    key: "ghost_of_here_and_now",
    name: "Ghost of the Here And Now Bread Kiosk",
    defaultRoomId: "market_5",
    schedule: ["market_5", "minting_5", "archive_6"],
    mood: "community-haunted",
    wants: ["old_kiosk_ghost", "pinned_bread_art"],
    lines: [
      "The ghost smiles like a bread-art kiosk that closed and kept handing out bakery receipts.",
      "It says the little artworks survived because people were stubborn in public.",
    ],
  },
  {
    key: "royalty_splitter",
    name: "Crumb Splitter in Mourning",
    defaultRoomId: "market_5",
    schedule: ["market_5", "market_2", "dao_2"],
    mood: "fractional",
    wants: ["crumb_resale_ribbon", "proposal_ash"],
    lines: [
      "The splitter divides a tiny crumb resale ribbon into smaller ribbons and calls it neighborly accounting.",
      "They remember when every bread-art sale felt like a thank-you note, even the awkward ones.",
    ],
  },
  {
    key: "dao_choir_director",
    name: "DAO Choir Director",
    defaultRoomId: "dao_2",
    schedule: ["dao_2", "bakery_5", "flock_5"],
    mood: "near consensus",
    wants: ["proposal_ash", "quorum_mask"],
    lines: [
      "The director raises a baton carved from a rejected amendment.",
      "They say governance is theater, but theater at least rehearses.",
    ],
  },
  {
    key: "michelson_monk",
    name: "Michelson Monk",
    defaultRoomId: "dao_4",
    schedule: ["dao_4", "rollup_2", "archive_3"],
    mood: "stack-safe",
    wants: ["lambda_thread", "contract_receipt"],
    lines: [
      "The monk arranges lambdas until the room type-checks.",
      "He says smart contracts are simple if you define simple as a staircase with opinions.",
    ],
  },
  {
    key: "indexer_oracle",
    name: "Indexer Oracle",
    defaultRoomId: "rollup_2",
    schedule: ["rollup_2", "minting_5", "market_2"],
    mood: "one block behind",
    wants: ["indexer_receipt", "pinned_bread_art"],
    lines: [
      "The oracle knows your bread-art sale happened, will happen, or is waiting for the crumb cache to respect itself.",
      "It speaks in cursors, retries, and one very clean shrug.",
    ],
  },
  {
    key: "bridge_ferryman",
    name: "Bridge Ferryman of the Etherlink Escalator",
    defaultRoomId: "rollup_4",
    schedule: ["rollup_4", "rollup_2", "service_4"],
    mood: "cross-domain",
    wants: ["bridged_echo", "tez_crumb"],
    lines: [
      "The ferryman stamps a rumor, bridges it, and returns with the same rumor wearing faster shoes.",
      "He says every bridge is a hallway that learned to invoice both ends.",
    ],
  },
  {
    key: "wallet_fox",
    name: "Wallet Fox Behind Glass",
    defaultRoomId: "rollup_6",
    schedule: ["rollup_6", "cats_2", "minting_5"],
    mood: "protective",
    wants: ["clean_placard", "wallet_warning"],
    lines: [
      "The fox refuses to hear secret words and respects you more for not offering them.",
      "It says wallet hygiene is lore because every myth has a locked door.",
    ],
  },
];

export const GREEN_ROOM_NPC_BY_KEY = new Map(GREEN_ROOM_NPCS.map((npc) => [npc.key, npc]));

export const GREEN_ROOM_RESOURCES: GreenRoomResource[] = [
  { key: "coin", label: "coin", family: "pond-currency", weight: 1, dailyDrop: 9, farmYield: 1, rooms: ["coin_pond", "mall_1"] },
  { key: "static", label: "green-room static", family: "signal", weight: 1, dailyDrop: 6, farmYield: 1, rooms: ["offices_5", "service_4"] },
  { key: "glass_fruit", label: "glass fruit", family: "odd-produce", weight: 2, dailyDrop: 5, farmYield: 1, rooms: ["mall_4", "lobby_4"] },
  { key: "receipt_ash", label: "receipt ash", family: "paper-lore", weight: 1, dailyDrop: 7, farmYield: 1, rooms: ["archive_3", "coin_pond"] },
  { key: "yellow_paint_flake", label: "yellow paint flake", family: "taxi-lore", weight: 1, dailyDrop: 4, farmYield: 1, rooms: ["arboretum_sunset_path", "service_4"] },
  { key: "quiet_moss", label: "quiet moss", family: "forest", weight: 1, dailyDrop: 8, farmYield: 1, rooms: ["arboretum_sunset_path", "arboretum_5"] },
  { key: "theater_dust", label: "theater dust", family: "broadcast", weight: 1, dailyDrop: 6, farmYield: 1, rooms: ["studio_4", "backstage_2"] },
  { key: "lost_ticket", label: "lost ticket", family: "access", weight: 1, dailyDrop: 3, farmYield: 1, rooms: ["lobby_2", "backstage_4"] },
  { key: "ant_sugar_grain", label: "ant sugar grain", family: "ants", weight: 1, dailyDrop: 8, farmYield: 1, rooms: ["antworks_3", "antworks_5"] },
  { key: "aubergine_seed", label: "aubergine seed", family: "odd-produce", weight: 1, dailyDrop: 6, farmYield: 1, rooms: ["aubergine_2", "aubergine_5"] },
  { key: "uranium_glass", label: "uranium glass", family: "radiant-laundry", weight: 2, dailyDrop: 3, farmYield: 1, rooms: ["uranium_4", "cats_6"] },
  { key: "wool_star", label: "wool star", family: "flock", weight: 1, dailyDrop: 7, farmYield: 1, rooms: ["flock_3", "flock_5"] },
  { key: "candle_stub", label: "candle stub", family: "soft-cult", weight: 1, dailyDrop: 5, farmYield: 1, rooms: ["flock_5", "aubergine_2"] },
  { key: "cat_whisker", label: "cat whisker", family: "cats", weight: 0, dailyDrop: 4, farmYield: 1, rooms: ["cats_2", "cats_5"] },
  { key: "yellow_thread", label: "yellow thread", family: "yellow-knight", weight: 1, dailyDrop: 4, farmYield: 1, rooms: ["cats_5", "service_4"] },
  { key: "void_salt", label: "void salt", family: "splendor", weight: 1, dailyDrop: 2, farmYield: 1, rooms: ["cats_6", "archive_6"] },
  { key: "tez_crumb", label: "tez crumb", family: "tezos-currency", weight: 1, dailyDrop: 8, farmYield: 1, rooms: ["bakery_2", "rollup_2"] },
  { key: "baker_salt", label: "baker salt", family: "tezos-baking", weight: 1, dailyDrop: 5, farmYield: 1, rooms: ["bakery_2"] },
  { key: "delegation_receipt", label: "delegation receipt", family: "delegation", weight: 0, dailyDrop: 4, farmYield: 1, rooms: ["bakery_5", "bakery_2"] },
  { key: "bakery_reward_stamp", label: "bakery reward stamp", family: "bakery-banking", weight: 0, dailyDrop: 4, farmYield: 1, rooms: ["bakery_2", "market_2"] },
  { key: "bread_art_sketch", label: "bread art sketch", family: "bread-art", weight: 1, dailyDrop: 6, farmYield: 1, rooms: ["minting_2"] },
  { key: "case_placard", label: "case placard", family: "display-case", weight: 1, dailyDrop: 5, farmYield: 1, rooms: ["minting_5", "rollup_6"] },
  { key: "pinned_bread_art", label: "pinned bread art", family: "display-case", weight: 0, dailyDrop: 4, farmYield: 1, rooms: ["minting_5"] },
  { key: "case_dust", label: "case dust", family: "bread-art-market", weight: 1, dailyDrop: 8, farmYield: 1, rooms: ["market_2"] },
  { key: "curator_tag", label: "curator tag", family: "curation", weight: 0, dailyDrop: 5, farmYield: 1, rooms: ["market_2", "minting_2"] },
  { key: "crumb_resale_ribbon", label: "crumb resale ribbon", family: "bread-resales", weight: 0, dailyDrop: 4, farmYield: 1, rooms: ["market_2", "market_5", "rollup_4"] },
  { key: "old_kiosk_ghost", label: "old kiosk ghost", family: "tezos-history", weight: 0, dailyDrop: 3, farmYield: 1, rooms: ["market_5"] },
  { key: "proposal_ash", label: "proposal ash", family: "governance", weight: 1, dailyDrop: 5, farmYield: 1, rooms: ["dao_2", "bakery_5"] },
  { key: "quorum_mask", label: "quorum mask", family: "governance", weight: 1, dailyDrop: 3, farmYield: 1, rooms: ["dao_2"] },
  { key: "lambda_thread", label: "lambda thread", family: "michelson", weight: 1, dailyDrop: 4, farmYield: 1, rooms: ["dao_4"] },
  { key: "contract_receipt", label: "contract receipt", family: "smart-contracts", weight: 0, dailyDrop: 3, farmYield: 1, rooms: ["dao_4"] },
  { key: "indexer_receipt", label: "indexer receipt", family: "indexers", weight: 0, dailyDrop: 5, farmYield: 1, rooms: ["rollup_2"] },
  { key: "bridged_echo", label: "bridged echo", family: "rollups", weight: 0, dailyDrop: 4, farmYield: 1, rooms: ["rollup_4"] },
  { key: "wallet_warning", label: "wallet warning", family: "wallet-safety", weight: 0, dailyDrop: 3, farmYield: 1, rooms: ["rollup_6"] },
];

export const GREEN_ROOM_RESOURCE_BY_KEY = new Map(GREEN_ROOM_RESOURCES.map((resource) => [resource.key, resource]));

export const GREEN_ROOM_ITEMS: GreenRoomItem[] = [
  ...GREEN_ROOM_RESOURCES.map((resource) => ({
    key: resource.key,
    label: resource.label,
    weight: resource.weight,
    tags: [resource.family, "resource"],
  })),
  { key: "found_art", label: "found art", weight: 2, tags: ["art", "barter"] },
  { key: "ghost_receipt", label: "ghost receipt", weight: 0, tags: ["attunement", "proof"] },
  { key: "static_map", label: "static map", weight: 1, tags: ["attunement", "tool"] },
  { key: "frog_wisdom", label: "frog wisdom", weight: 0, tags: ["attunement", "pond"] },
  { key: "brass_knob", label: "brass knob", weight: 2, tags: ["door", "barter"] },
  { key: "button_lint", label: "button lint", weight: 1, tags: ["elevator", "resource"] },
  { key: "coffee_sigil", label: "coffee sigil", weight: 1, tags: ["office", "resource"] },
  { key: "crumb_contract", label: "crumb contract", weight: 0, tags: ["ants", "lore", "barter"] },
  { key: "purple_vow", label: "purple vow", weight: 0, tags: ["aubergine", "cult", "lore"] },
  { key: "warm_warning_label", label: "warm warning label", weight: 0, tags: ["uranium", "safety", "lore"] },
  { key: "flock_constellation", label: "flock constellation", weight: 0, tags: ["sheep", "stars", "lore"] },
  { key: "soft_cult_invitation", label: "soft cult invitation", weight: 0, tags: ["cult", "wool", "lore"] },
  { key: "cat_permission", label: "cat permission", weight: 0, tags: ["cats", "doors", "lore"] },
  { key: "yellow_knight_rumor", label: "Yellow Knight rumor", weight: 0, tags: ["yellow-knight", "lily", "lore"] },
  { key: "splendor_index", label: "splendor index", weight: 0, tags: ["cosmic", "madness", "lore"] },
  { key: "delegation_vow", label: "delegation vow", weight: 0, tags: ["tezos", "delegation", "lore"] },
  { key: "overbaked_block_receipt", label: "overbaked block receipt", weight: 0, tags: ["tezos", "baker", "lore"] },
  { key: "bakery_banker_card", label: "bakery banker card", weight: 0, tags: ["tezos", "baker", "banker", "bread-art", "lore"] },
  { key: "threadcaster_receipt", label: "threadcaster receipt", weight: 0, tags: ["tezos", "drama", "lore"] },
  { key: "bread_pin_receipt", label: "bread pin receipt", weight: 0, tags: ["bread-art", "display-case", "lore"] },
  { key: "single_slice_prayer", label: "single-slice prayer", weight: 0, tags: ["bread-art", "singular", "lore"] },
  { key: "clean_placard", label: "clean placard", weight: 0, tags: ["display-case", "placard", "lore"] },
  { key: "case_duster_receipt", label: "case duster receipt", weight: 0, tags: ["bread-art-market", "display-case", "lore"] },
  { key: "ghost_case_map", label: "ghost case map", weight: 0, tags: ["bread-art", "tezos-history", "lore"] },
  { key: "crumb_resale_apology", label: "crumb resale apology", weight: 0, tags: ["bread-resales", "artist-care", "lore"] },
  { key: "governance_hymnal", label: "governance hymnal", weight: 0, tags: ["dao", "governance", "lore"] },
  { key: "contract_audit_charm", label: "contract audit charm", weight: 0, tags: ["michelson", "contract", "lore"] },
  { key: "indexed_memory", label: "indexed memory", weight: 0, tags: ["indexer", "market", "lore"] },
  { key: "rollup_ticket", label: "rollup ticket", weight: 0, tags: ["rollup", "etherlink", "lore"] },
  { key: "wallet_fox_warning", label: "wallet fox warning", weight: 0, tags: ["wallet", "security", "lore"] },
];

export const GREEN_ROOM_ITEM_BY_KEY = new Map(GREEN_ROOM_ITEMS.map((item) => [item.key, item]));

export const GREEN_ROOM_MINIGAMES: GreenRoomMinigame[] = [
  { key: "refund_button", title: "Refund Button Roulette", command: "press refund", roomHint: "mall_4", rewardKey: "coin" },
  { key: "printer_jam", title: "Printer Jam Divination", command: "unjam printer", roomHint: "offices_5", rewardKey: "static" },
  { key: "receipt_sort", title: "Receipt Ash Sorting", command: "sort receipts", roomHint: "archive_3", rewardKey: "receipt_ash" },
  { key: "applause_timing", title: "Applause Sign Timing", command: "time applause", roomHint: "studio_4", rewardKey: "theater_dust" },
  { key: "pond_skip", title: "Pond Skip Ledger", command: "skip coin", roomHint: "coin_pond", rewardKey: "coin" },
  { key: "elevator_guess", title: "Elevator Floor Guess", command: "guess floor", roomHint: "lobby_6", rewardKey: "button_lint" },
  { key: "paint_match", title: "Yellow Paint Match", command: "match paint", roomHint: "arboretum_sunset_path", rewardKey: "yellow_paint_flake" },
  { key: "moss_whisper", title: "Moss Whisper Trial", command: "listen moss", roomHint: "arboretum_5", rewardKey: "quiet_moss" },
  { key: "mirror_pose", title: "Mirror Agent Pose-Off", command: "pose mirror", roomHint: "backstage_4", rewardKey: "found_art" },
  { key: "coffee_blot", title: "Coffee Blot Reading", command: "read coffee", roomHint: "offices_2", rewardKey: "coffee_sigil" },
  { key: "ticket_shuffle", title: "Ticket Shuffle", command: "shuffle tickets", roomHint: "lobby_2", rewardKey: "lost_ticket" },
  { key: "static_tuning", title: "Static Tuning", command: "tune static", roomHint: "service_4", rewardKey: "static" },
  { key: "ant_count", title: "Ant Census", command: "count ants", roomHint: "antworks_3", rewardKey: "ant_sugar_grain" },
  { key: "crumb_sort", title: "Crumb Evidence Sorting", command: "sort crumbs", roomHint: "antworks_5", rewardKey: "ant_sugar_grain" },
  { key: "aubergine_polish", title: "Aubergine Polishing Rite", command: "polish aubergine", roomHint: "aubergine_2", rewardKey: "aubergine_seed" },
  { key: "purple_recital", title: "Purple Recital", command: "recite purple", roomHint: "aubergine_5", rewardKey: "candle_stub" },
  { key: "glow_wash", title: "Contained Glow Wash", command: "wash glow", roomHint: "uranium_4", rewardKey: "uranium_glass" },
  { key: "geiger_check", title: "Geiger Purr Check", command: "check counter", roomHint: "uranium_4", rewardKey: "uranium_glass" },
  { key: "sheep_count", title: "Constellation Sheep Count", command: "count sheep", roomHint: "flock_3", rewardKey: "wool_star" },
  { key: "wool_braid", title: "Wool Star Braiding", command: "braid wool", roomHint: "flock_5", rewardKey: "wool_star" },
  { key: "cat_petition", title: "Cat Petition", command: "pet cat", roomHint: "cats_2", rewardKey: "cat_whisker" },
  { key: "wall_follow", title: "Follow the Wall Cat", command: "follow cat", roomHint: "cats_2", rewardKey: "cat_whisker" },
  { key: "knight_salute", title: "Yellow Knight Salute", command: "salute knight", roomHint: "cats_5", rewardKey: "yellow_thread" },
  { key: "splendor_decode", title: "Splendor Decoding", command: "decode splendor", roomHint: "cats_6", rewardKey: "void_salt" },
  { key: "block_bake", title: "Overbaked Block Timing", command: "bake block", roomHint: "bakery_2", rewardKey: "baker_salt" },
  { key: "delegation_loaf", title: "Delegation Loaf Sorting", command: "delegate loaf", roomHint: "bakery_2", rewardKey: "delegation_receipt" },
  { key: "bakery_banking", title: "Bakery Banker Rewards Pitch", command: "bank bread", roomHint: "bakery_2", rewardKey: "bakery_reward_stamp" },
  { key: "thread_reading", title: "Ancient Thread Reading", command: "read thread", roomHint: "bakery_5", rewardKey: "proposal_ash" },
  { key: "bread_art_pin", title: "Generative Bread-Art Pinning", command: "pin art", roomHint: "minting_2", rewardKey: "bread_art_sketch" },
  { key: "case_polish", title: "Case Placard Polishing", command: "polish case", roomHint: "minting_5", rewardKey: "case_placard" },
  { key: "bread_pin", title: "Pin the Patient Bread", command: "pin bread", roomHint: "minting_5", rewardKey: "pinned_bread_art" },
  { key: "case_dust", title: "Display Case Dusting Without Becoming the Case", command: "dust case", roomHint: "market_2", rewardKey: "case_dust" },
  { key: "bread_listing", title: "Bread-Art Display Case Listing", command: "list bread", roomHint: "market_2", rewardKey: "curator_tag" },
  { key: "kiosk_haunt", title: "Old Bread Kiosk Ghost Cache", command: "haunt kiosk", roomHint: "market_5", rewardKey: "old_kiosk_ghost" },
  { key: "crumb_split", title: "Crumb Resale Splitter Arithmetic", command: "split crumbs", roomHint: "market_5", rewardKey: "crumb_resale_ribbon" },
  { key: "quorum_vote", title: "Quorum Choir Vote", command: "vote quorum", roomHint: "dao_2", rewardKey: "proposal_ash" },
  { key: "michelson_verify", title: "Michelson Stack Verification", command: "verify contract", roomHint: "dao_4", rewardKey: "lambda_thread" },
  { key: "indexer_chase", title: "One-Block-Late Indexer Chase", command: "index sale", roomHint: "rollup_2", rewardKey: "indexer_receipt" },
  { key: "rollup_bridge", title: "Etherlink Bridge Rumor", command: "bridge rumor", roomHint: "rollup_4", rewardKey: "bridged_echo" },
  { key: "wallet_warning_check", title: "Wallet Warning Check", command: "check wallet", roomHint: "rollup_6", rewardKey: "wallet_warning" },
];

const PUZZLE_TEMPLATES = [
  ["clipboard_name_swap", "The clipboard knows a different version of your name.", "read clipboard", "Names are useful keys when they are wrong."],
  ["waiting_room_number", "The ticket machine advances only when ignored.", "wait wrong", "Some progress is made by pretending not to care."],
  ["frog_sage_ritual", "A coin each day teaches the pond to recognize you.", "throw coin pond", "Thirty offerings change who answers."],
  ["coin_calendar", "The pond plaque keeps a private calendar.", "look plaque", "Daily state matters more than one large bribe."],
  ["fool_finance_branch", "The frog's advice forks on your history of offerings.", "talk frog", "Wisdom unlocks slowly and says rude things about yield."],
  ["lily_shoe_chain", "The shoe begins the Lily trail.", "look shoe", "The name inside matters even when the quest does not block you."],
  ["taxi_tracks_chain", "Taxi-like tracks leave the path.", "look tracks", "A cab should not be in this forest."],
  ["paint_scrape_chain", "Yellow paint marks the trees.", "inspect paint", "The forest kept some color as evidence."],
  ["printer_blank_confession", "The printer outputs silence with metadata.", "unjam printer", "Blank pages can still confess."],
  ["copy_three_upgrade_tutorial", "Three identical small things can become a bigger weird thing.", "combine static", "Combine three matching tier items."],
  ["refund_button_minigame", "The vending machine rewards exact indecision.", "press refund", "Refunds are a form of prayer here."],
  ["snack_prophecy", "Snack slots display prophecies instead of prices.", "look snacks", "Each slot hates being literal."],
  ["unfiled_receipt_prophecy", "Receipts predict expenses no one has incurred.", "sort receipts", "The archive likes stacks of three."],
  ["ledger_without_numbers", "A ledger balances moods instead of money.", "talk moth", "Bring ash if you want accounting."],
  ["exit_sign_argument", "Exit signs disagree in public.", "listen signs", "Following one sign makes another jealous."],
  ["maintenance_key_riddle", "A janitor knows which keys open metaphors.", "talk janitor", "Static maps make janitors generous."],
  ["applause_sign_loop", "The sign applauds before performance.", "time applause", "Timing the wrong beat earns dust."],
  ["dead_air_broadcast", "A camera records the absence of viewers.", "say hello", "Broadcasting to no one still leaves residue."],
  ["green_room_departure", "The green door opens only when world and player states line up.", "enter green room", "Shared unlock plus personal proof."],
  ["myth_mode_echo", "After the campaign target, the door becomes lore.", "look door", "Myths can be found after rewards close."],
  ["shared_unlock_check", "Community milestones loosen the lock.", "offer proof", "Ghost, pond, and static milestones matter."],
  ["personal_attunement_check", "Each player needs personal proof.", "attune", "Borrowed rumors do not replace earned state."],
  ["ant_tithe_line", "The ant city wants tribute scaled to humility.", "talk queen", "Ant sugar grains open the queen's bureaucratic branch."],
  ["crumb_traffic_minigame", "The crumb lanes reward counting without stepping on anyone.", "count ants", "Tiny logistics are still logistics."],
  ["queen_scale_riddle", "The queen decides whether you are weather or citizen.", "inspect queen", "Scale is a policy, not a measurement."],
  ["crumb_claims_office", "Ant clerks adjudicate crumbs like family estates.", "sort crumbs", "Evidence can be edible and still binding."],
  ["scale_is_a_policy", "The Antworks shrink your certainty first.", "look forms", "Reading tiny forms requires social, not optical, adjustment."],
  ["aubergine_liturgy", "Purple produce hums in a chapel that smells like a grocery spell.", "polish aubergine", "Aubergines respond to care more than force."],
  ["purple_vow_branch", "The Abbess trades seeds and candle stubs for vows.", "talk abbess", "Soft cults still keep receipts."],
  ["vegetable_confessional", "The altar hears produce-related guilt.", "look altar", "Confession may print a coupon."],
  ["produce_trial", "The Duke judges bruised vegetables by moonlight precedent.", "look docket", "Legal tenderness is still tenderness."],
  ["bruised_duke_barter", "The Duke respects glass fruit and ridiculous rulings.", "talk duke", "Bring produce if you want court gossip."],
  ["uranium_wash_cycle", "The laundry contains fictional radiance and very real warnings.", "wash glow", "Safety is part of the joke, not the obstacle."],
  ["geiger_purr_branch", "The counter purrs at lies and chapel-normalization.", "check counter", "Radiant tools dislike denial."],
  ["safety_poster_madness", "Safety posters teach impossible emotional handling.", "look posters", "Some madness comes laminated."],
  ["sheep_constellation", "Sheep arrange their wool into star maps.", "count sheep", "Counting sheep is cartography here."],
  ["wool_star_map", "Wool stars can be braided into portable constellations.", "braid wool", "Soft objects can carry hard coordinates."],
  ["last_weather_forecast", "The shepherd forecasts cancelled weather.", "talk shepherd", "Weather is a schedule with stage fright."],
  ["cult_roll_call", "A blanket cult records attendance for people not yet present.", "talk cultist", "Joining may be mostly snacks and obligations."],
  ["soft_cult_invitation", "The cult issues invitations that smell faintly of wax.", "offer candle", "A candle stub is enough sincerity."],
  ["blanket_tithe", "The Wool Deacon accepts folded proof.", "talk deacon", "Wool creates corners where rooms gave up."],
  ["cat_permission_branch", "The remembering cat grants permission, never directions.", "talk cat", "Cats know doors by temperature."],
  ["wall_bell_path", "The wall bell rings when secrets are mishandled.", "look bell", "Curiosity has legal standing behind the wallpaper."],
  ["whisker_barter", "A cat whisker opens rumors that maps cannot.", "pet cat", "Petition, do not command."],
  ["yellow_knight_oath", "The Yellow Knight treats caution tape as chivalry.", "salute knight", "Yellow things may point back to Lily."],
  ["caution_lance_riddle", "The Knight's lance points toward the sunset forest.", "look lance", "Some quests are taxi routes wearing armor."],
  ["yellow_thread_lily_echo", "Yellow thread ties the Knight's oath to paint on trees.", "talk knight", "Lily's branch has witnesses outside the forest."],
  ["splendor_index", "The blinking splendor catalogs beauty with no respect for edges.", "decode splendor", "Void salt helps the prompt stay ceremonial."],
  ["velvet_aquarium_gaze", "The aquarium reflects rooms before players reach them.", "look aquarium", "Reflections can spoil future geography."],
  ["madness_without_teeth", "The cosmic thing is wrong without being violent.", "talk splendor", "Awe can be dangerous and still polite."],
  ["baker_overbaked_block", "A Tezos baker has overbaked a block and needs someone to respect the crumbs.", "bake block", "Baker salt turns block timing into inventory."],
  ["delegation_loaf_branch", "Delegation slips hide inside bread like passive-income fortunes.", "delegate loaf", "Receipts travel farther than trust."],
  ["bakery_banker_rewards_branch", "The bakery offers crumb custody rewards with a smile too banklike to ignore.", "bank bread", "A rewards stamp is banking if the oven says it is."],
  ["proof_of_steak_bell", "The proof-of-steak bell rings until someone groans.", "look bell", "Some puns are consensus hazards."],
  ["delegation_drama_bins", "Old Tezos debates have been sorted into bins that keep relabeling themselves.", "look bins", "Drama is durable state with better fonts."],
  ["threadcaster_receipt_branch", "A Threadcaster turns proposal ash into receipts and replies.", "talk threadcaster", "Bring ash if you want the long version."],
  ["old_tezos_argument_sort", "Ancient arguments become farmable once they are filed by mood.", "read thread", "Threads can be resources when they refuse to end."],
  ["generative_bread_pin", "The bread-art pinning station waits for a sketch, a paid bakery slice, and a little nerve.", "pin art", "Generative art likes ritual inputs and surprising carbohydrates."],
  ["single_slice_confessional", "The Single-Slice Saint hears loaf-count guilt without judgement.", "talk saint", "Scarcity is a porch light, not a spreadsheet."],
  ["loaf_count_argument", "A chalkboard categorizes loaf counts like weather.", "look loaves", "Supply is a story players keep pinning to bread."],
  ["case_placard_reveal_wait", "The case placard exists, but the preview fogs on its own schedule.", "polish case", "Patience is a rendering engine with crumbs on its fingers."],
  ["bread_art_pin_ritual", "The pinning kiosk prints tiny brass bread pins and display-case superstitions.", "pin bread", "Pinning is a rite, not a wish."],
  ["case_preview_panic_branch", "A missing case preview causes the room to invent theology.", "look placard", "The display case may simply be thinking."],
  ["bread_case_market", "The front-lawn display-case market's lowest crumb price crawls away from attention.", "look case", "A case price can be a mood wearing a bread pin."],
  ["curator_tag_barter", "The curator respects tags more than trends.", "talk curator", "Curation can be a quest item."],
  ["case_dust_minigame", "The duster gathers case dust without becoming the case.", "dust case", "A case dusting is a polishing cloth with delusions."],
  ["market_missing_vowels", "The market sign is missing vowels with suspicious confidence.", "look market", "Dropped vowels may be a platform reference."],
  ["old_kiosk_ghost", "A ghosted bread kiosk refuses to vanish from Tezos memory.", "haunt kiosk", "Community mirrors make ghosts useful."],
  ["teia_garden_case_branch", "The Teia garden keeps watering abandoned bread-art case lore.", "look kiosk", "Some forks are acts of care."],
  ["crumb_resale_splitter_apology", "The crumb splitter divides one apology into fractions.", "split crumbs", "Optional courtesies still cast shadows."],
  ["community_mirror_lore", "Zines document outages, mirrors, tribute bread drops, and stubborn little artworks.", "look zines", "The archive remembers who kept the cases lit."],
  ["quorum_choir_vote", "The choir votes in harmony and argues in footnotes.", "vote quorum", "Consensus sounds better with rehearsal."],
  ["proposal_candle_branch", "Proposal candles burn into ash that can be offered to governance NPCs.", "look proposal", "Every amendment leaves residue."],
  ["governance_mask_argument", "Voting masks disclose positions only after the argument is over.", "look masks", "Anonymity can be costume or shelter."],
  ["michelson_stack_riddle", "A Michelson stack riddle asks players to respect order.", "look stack", "The top of stack has emotional consequences."],
  ["contract_verification_branch", "The monk treats verification as ritual paperwork.", "verify contract", "Bring lambda thread for contract gossip."],
  ["lambda_thread_trial", "Lambda thread can stitch a contract to a calmer future.", "look contract", "Formalism is weird, too."],
  ["indexer_sale_chase", "The indexer knows the bread-art sale one block after everyone wants proof.", "index sale", "Receipts arrive late but determined."],
  ["mempool_puddle_branch", "Mempool puddles reflect pending operations and anxious refreshes.", "look mempool", "Pending is a haunted tense."],
  ["one_block_late_lamp", "Streetlights blink one block late and call it indexing.", "look indexer", "Latency can become a character."],
  ["rollup_bridge_rumor", "A bridged rumor returns wearing faster shoes.", "bridge rumor", "Cross-domain lore needs a ticket."],
  ["etherlink_escalator_loop", "The Etherlink escalator loops through infrastructure discourse.", "look bridge", "A bridge is a hallway with invoices."],
  ["bridge_toll_barter", "The ferryman accepts bridged echoes at the toll booth.", "talk ferryman", "Rollups barter in stamped rumors."],
  ["wallet_fox_warning", "The wallet fox makes safety lore explicit.", "check wallet", "Never feed secret words to a room, bot, game, or form."],
  ["seed_phrase_glass_case", "The empty glass case teaches real wallet secrets by refusing to contain any.", "look case", "The safest secret phrase in the game is absent."],
  ["clean_placard_branch", "The wallet fox trusts a clean case placard more than confident strangers.", "talk fox", "Safe lore can still be funny."],
] as const;

const extraPuzzleHooks: GreenRoomPuzzleHook[] = GREEN_ROOM_ROOMS.slice(0, 14).map((room, index) => ({
  key: `ambient_hook_${index + 1}`,
  title: `Ambient oddity ${index + 1}`,
  roomId: room.id,
  trigger: index % 2 === 0 ? "look walls" : "inspect floor",
  hint: "Ambient room details can unlock rumors, resources, or NPC moods later.",
}));

function roomIdForPuzzleHookKey(key: string): string {
  if (key.includes("lily") || key.includes("taxi") || key.includes("paint")) return "arboretum_sunset_path";
  if (key.includes("claims") || key.includes("policy")) return "antworks_5";
  if (key.includes("ant") || key.includes("crumb") || key.includes("scale")) return "antworks_3";
  if (key.includes("produce") || key.includes("bruised")) return "aubergine_5";
  if (key.includes("aubergine") || key.includes("purple") || key.includes("vegetable")) return "aubergine_2";
  if (key.includes("uranium") || key.includes("geiger") || key.includes("safety")) return "uranium_4";
  if (key.includes("blanket") || key.includes("cult")) return "flock_5";
  if (key.includes("sheep") || key.includes("wool") || key.includes("weather")) return "flock_3";
  if (key.includes("cat") || key.includes("wall_bell") || key.includes("whisker")) return "cats_2";
  if (key.includes("yellow") || key.includes("caution")) return "cats_5";
  if (key.includes("splendor") || key.includes("velvet") || key.includes("madness")) return "cats_6";
  if (key.includes("delegation_drama") || key.includes("threadcaster") || key.includes("old_tezos")) return "bakery_5";
  if (key.includes("baker") || key.includes("bakery_banker") || key.includes("delegation_loaf") || key.includes("proof_of_steak")) return "bakery_2";
  if (key.includes("placard") || key.includes("pin_ritual") || key.includes("preview")) return "minting_5";
  if (key.includes("generative") || key.includes("single_slice") || key.includes("loaf_count")) return "minting_2";
  if (key.includes("old_kiosk") || key.includes("teia") || key.includes("resale") || key.includes("community_mirror")) return "market_5";
  if (key.includes("bread_case") || key.includes("curator") || key.includes("case_dust") || key.includes("market_missing")) return "market_2";
  if (key.includes("michelson") || key.includes("contract") || key.includes("lambda")) return "dao_4";
  if (key.includes("quorum") || key.includes("proposal") || key.includes("governance")) return "dao_2";
  if (key.includes("wallet") || key.includes("seed_phrase") || key.includes("clean_placard")) return "rollup_6";
  if (key.includes("rollup") || key.includes("etherlink") || key.includes("bridge")) return "rollup_4";
  if (key.includes("indexer") || key.includes("mempool") || key.includes("one_block")) return "rollup_2";
  if (key.includes("frog") || key.includes("coin")) return "coin_pond";
  if (key.includes("green")) return "green_room_threshold";
  if (key.includes("printer") || key.includes("copy")) return "offices_5";
  if (key.includes("refund") || key.includes("snack")) return "mall_4";
  if (key.includes("receipt") || key.includes("ledger")) return "archive_3";
  if (key.includes("exit") || key.includes("maintenance")) return "service_4";
  return "studio_4";
}

export const GREEN_ROOM_PUZZLE_HOOKS: GreenRoomPuzzleHook[] = [
  ...PUZZLE_TEMPLATES.map(([key, title, trigger, hint]) => ({
    key,
    title,
    roomId: roomIdForPuzzleHookKey(key),
    trigger,
    hint,
  })),
  ...extraPuzzleHooks,
];

export const GREEN_ROOM_BASE_COMMAND_DECK: Record<string, number> = {
  help: 1,
  look: 1,
  inspect: 1,
  go: 1,
  say: 1,
  who: 1,
  inventory: 1,
  sheet: 1,
  roll: 1,
  map: 1,
  doors: 1,
  listen: 1,
  campaign: 1,
  gather: 1,
  farm: 1,
  combine: 1,
  talk: 1,
  mark: 1,
  ally: 1,
  offer: 1,
  attune: 1,
  enter: 1,
};

export const GREEN_ROOM_ATTUNEMENT_REQUIREMENTS = ["ghost_receipt", "frog_wisdom", "static_map"] as const;

export const GREEN_ROOM_CAMPAIGN_SLUG = "season-3-intro";
export const GREEN_ROOM_DEPARTED_MESSAGE = "You have departed from this world.";

export function findGreenRoomRoom(roomId: string): GreenRoomRoom {
  return GREEN_ROOM_ROOM_BY_ID.get(roomId) || GREEN_ROOM_ROOMS[0];
}

export function roomNpcs(roomId: string): GreenRoomNpc[] {
  return GREEN_ROOM_NPCS.filter((npc) => npc.schedule.includes(roomId) || npc.defaultRoomId === roomId);
}

export function roomResources(roomId: string): GreenRoomResource[] {
  return GREEN_ROOM_RESOURCES.filter((resource) => resource.rooms.includes(roomId));
}

export function deterministicStartingRoomId(userId: number): string {
  const index = Math.abs(Number(userId || 0)) % GREEN_ROOM_STARTING_ROOM_IDS.length;
  return GREEN_ROOM_STARTING_ROOM_IDS[index];
}

export function greenRoomSeedSummary() {
  return {
    roomCount: GREEN_ROOM_ROOMS.length,
    npcCount: GREEN_ROOM_NPCS.length,
    puzzleHookCount: GREEN_ROOM_PUZZLE_HOOKS.length,
    minigameCount: GREEN_ROOM_MINIGAMES.length,
    resourceFamilyCount: new Set(GREEN_ROOM_RESOURCES.map((resource) => resource.family)).size,
  };
}
