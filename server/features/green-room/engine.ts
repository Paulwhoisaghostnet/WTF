import {
  GREEN_ROOM_BASE_COMMAND_DECK,
  GREEN_ROOM_ITEM_BY_KEY,
  GREEN_ROOM_RESOURCE_BY_KEY,
  type GreenRoomDetail,
  type GreenRoomRoom,
} from "./world";

export type GreenRoomCommand =
  | { verb: "help"; args: string[]; raw: string }
  | { verb: "look"; args: string[]; target: string; raw: string }
  | { verb: "inspect"; args: string[]; target: string; raw: string }
  | { verb: "go"; args: string[]; direction: string; raw: string }
  | { verb: "say"; args: string[]; text: string; raw: string }
  | { verb: "who"; args: string[]; raw: string }
  | { verb: "inventory"; args: string[]; raw: string }
  | { verb: "sheet"; args: string[]; raw: string }
  | { verb: "roll"; args: string[]; skill: string; raw: string }
  | { verb: "map"; args: string[]; raw: string }
  | { verb: "doors"; args: string[]; raw: string }
  | { verb: "listen"; args: string[]; target: string; raw: string }
  | { verb: "campaign"; args: string[]; raw: string }
  | { verb: "gather"; args: string[]; target: string; raw: string }
  | { verb: "farm"; args: string[]; target: string; raw: string }
  | { verb: "combine"; args: string[]; itemKey: string; raw: string }
  | { verb: "talk"; args: string[]; target: string; raw: string }
  | { verb: "mark"; args: string[]; username: string; mark: string; raw: string }
  | { verb: "ally"; args: string[]; action: string; name: string; raw: string }
  | { verb: "offer"; args: string[]; target: string; raw: string }
  | { verb: "attune"; args: string[]; raw: string }
  | { verb: "enter"; args: string[]; target: string; raw: string }
  | { verb: "throw"; args: string[]; itemKey: string; target: string; raw: string }
  | { verb: "minigame"; args: string[]; key: string; raw: string }
  | { verb: "unknown"; args: string[]; raw: string };

export type GreenRoomInventoryStack = {
  itemKey: string;
  label: string;
  tier: number;
  quantity: number;
  weight: number;
};

export type GreenRoomCombineResult =
  | {
      ok: true;
      itemKey: string;
      fromTier: number;
      toTier: number;
      consumed: number;
      created: number;
      message: string;
    }
  | { ok: false; itemKey: string; tier: number; message: string };

export type GreenRoomDetailResult = {
  found: boolean;
  target: string;
  text: string;
  flag: string | null;
  reveals: string[];
};

const COMMAND_ALIASES: Record<string, GreenRoomCommand["verb"]> = {
  "?": "help",
  h: "help",
  help: "help",
  l: "look",
  look: "look",
  examine: "inspect",
  x: "inspect",
  inspect: "inspect",
  n: "go",
  s: "go",
  e: "go",
  w: "go",
  north: "go",
  south: "go",
  east: "go",
  west: "go",
  up: "go",
  down: "go",
  in: "go",
  out: "go",
  go: "go",
  move: "go",
  say: "say",
  "'": "say",
  who: "who",
  inv: "inventory",
  i: "inventory",
  inventory: "inventory",
  sheet: "sheet",
  character: "sheet",
  stats: "sheet",
  roll: "roll",
  map: "map",
  doors: "doors",
  exits: "doors",
  listen: "listen",
  overhear: "listen",
  campaign: "campaign",
  quest: "campaign",
  gather: "gather",
  take: "gather",
  collect: "gather",
  farm: "farm",
  scrounge: "farm",
  combine: "combine",
  upgrade: "combine",
  talk: "talk",
  ask: "talk",
  mark: "mark",
  ally: "ally",
  offer: "offer",
  attune: "attune",
  enter: "enter",
  open: "enter",
  throw: "throw",
  toss: "throw",
  press: "minigame",
  unjam: "minigame",
  sort: "minigame",
  time: "minigame",
  skip: "minigame",
  guess: "minigame",
  match: "minigame",
  pose: "minigame",
  read: "minigame",
  shuffle: "minigame",
  tune: "minigame",
  count: "minigame",
  polish: "minigame",
  recite: "minigame",
  wash: "minigame",
  check: "minigame",
  braid: "minigame",
  pet: "minigame",
  follow: "minigame",
  salute: "minigame",
  decode: "minigame",
  bake: "minigame",
  bank: "minigame",
  delegate: "minigame",
  print: "minigame",
  peel: "minigame",
  pin: "minigame",
  sweep: "minigame",
  dust: "minigame",
  list: "minigame",
  haunt: "minigame",
  split: "minigame",
  vote: "minigame",
  verify: "minigame",
  index: "minigame",
  bridge: "minigame",
};

const MINIGAME_COMMAND_KEYS: Record<string, string> = {
  "press refund": "refund_button",
  "unjam printer": "printer_jam",
  "sort receipts": "receipt_sort",
  "time applause": "applause_timing",
  "skip coin": "pond_skip",
  "guess floor": "elevator_guess",
  "match paint": "paint_match",
  "listen moss": "moss_whisper",
  "pose mirror": "mirror_pose",
  "read coffee": "coffee_blot",
  "shuffle tickets": "ticket_shuffle",
  "tune static": "static_tuning",
  "count ants": "ant_count",
  "sort crumbs": "crumb_sort",
  "polish aubergine": "aubergine_polish",
  "recite purple": "purple_recital",
  "wash glow": "glow_wash",
  "check counter": "geiger_check",
  "count sheep": "sheep_count",
  "braid wool": "wool_braid",
  "pet cat": "cat_petition",
  "follow cat": "wall_follow",
  "salute knight": "knight_salute",
  "decode splendor": "splendor_decode",
  "bake block": "block_bake",
  "bank bread": "bakery_banking",
  "delegate loaf": "delegation_loaf",
  "read thread": "thread_reading",
  "pin art": "bread_art_pin",
  "polish case": "case_polish",
  "pin bread": "bread_pin",
  "dust case": "case_dust",
  "list bread": "bread_listing",
  "haunt kiosk": "kiosk_haunt",
  "split crumbs": "crumb_split",
  "vote quorum": "quorum_vote",
  "verify contract": "michelson_verify",
  "index sale": "indexer_chase",
  "bridge rumor": "rollup_bridge",
  "check wallet": "wallet_warning_check",
};

const NORMALIZED_RESOURCE_ALIASES: Record<string, string> = {
  coins: "coin",
  penny: "coin",
  pennies: "coin",
  static: "static",
  "green room static": "static",
  "green-room static": "static",
  fruit: "glass_fruit",
  "glass fruit": "glass_fruit",
  ash: "receipt_ash",
  receipt: "receipt_ash",
  receipts: "receipt_ash",
  "receipt ash": "receipt_ash",
  paint: "yellow_paint_flake",
  "yellow paint": "yellow_paint_flake",
  "paint flake": "yellow_paint_flake",
  "yellow paint flake": "yellow_paint_flake",
  moss: "quiet_moss",
  "quiet moss": "quiet_moss",
  dust: "theater_dust",
  "theater dust": "theater_dust",
  ticket: "lost_ticket",
  tickets: "lost_ticket",
  "lost ticket": "lost_ticket",
  art: "found_art",
  "found art": "found_art",
  "ghost receipt": "ghost_receipt",
  "static map": "static_map",
  "frog wisdom": "frog_wisdom",
  ants: "ant_sugar_grain",
  "ant sugar": "ant_sugar_grain",
  "ant sugar grain": "ant_sugar_grain",
  aubergine: "aubergine_seed",
  aubergines: "aubergine_seed",
  eggplant: "aubergine_seed",
  eggplants: "aubergine_seed",
  "aubergine seed": "aubergine_seed",
  uranium: "uranium_glass",
  "uranium glass": "uranium_glass",
  wool: "wool_star",
  sheep: "wool_star",
  "wool star": "wool_star",
  candle: "candle_stub",
  "candle stub": "candle_stub",
  whisker: "cat_whisker",
  "cat whisker": "cat_whisker",
  thread: "yellow_thread",
  "yellow thread": "yellow_thread",
  "void salt": "void_salt",
  splendor: "void_salt",
  tez: "tez_crumb",
  "tez crumb": "tez_crumb",
  "baker salt": "baker_salt",
  "delegation receipt": "delegation_receipt",
  "bakery reward stamp": "bakery_reward_stamp",
  stamp: "bakery_reward_stamp",
  "reward stamp": "bakery_reward_stamp",
  "hash seed": "bread_art_sketch",
  "bread art sketch": "bread_art_sketch",
  "art sketch": "bread_art_sketch",
  sketch: "bread_art_sketch",
  "case placard": "case_placard",
  placard: "case_placard",
  "proof card": "case_placard",
  "metadata shell": "case_placard",
  metadata: "case_placard",
  backing: "case_placard",
  "pinned bread art": "pinned_bread_art",
  "bread art": "pinned_bread_art",
  "bread pin": "pinned_bread_art",
  bread: "pinned_bread_art",
  "case dust": "case_dust",
  case: "case_dust",
  "display case dust": "case_dust",
  "curator tag": "curator_tag",
  objkt: "curator_tag",
  "crumb resale ribbon": "crumb_resale_ribbon",
  "resale ribbon": "crumb_resale_ribbon",
  "crumb ribbon": "crumb_resale_ribbon",
  resale: "crumb_resale_ribbon",
  hen: "old_kiosk_ghost",
  "hen ghost": "old_kiosk_ghost",
  "old kiosk ghost": "old_kiosk_ghost",
  kiosk: "old_kiosk_ghost",
  "proposal ash": "proposal_ash",
  proposal: "proposal_ash",
  "quorum mask": "quorum_mask",
  quorum: "quorum_mask",
  "lambda thread": "lambda_thread",
  lambda: "lambda_thread",
  "contract receipt": "contract_receipt",
  "indexer receipt": "indexer_receipt",
  "bridged echo": "bridged_echo",
  "wallet warning": "wallet_warning",
};

const DIRECTION_ALIASES: Record<string, string> = {
  n: "north",
  s: "south",
  e: "east",
  w: "west",
};

function words(raw: string): string[] {
  return raw.trim().split(/\s+/).filter(Boolean);
}

function normalizeTarget(value: string): string {
  return value.trim().toLowerCase().replace(/^@/, "").replace(/\s+/g, " ");
}

export function normalizeGreenRoomItemKey(value: string): string {
  const target = normalizeTarget(value).replace(/_/g, " ");
  const alias = NORMALIZED_RESOURCE_ALIASES[target];
  if (alias) return alias;
  const underscored = target.replace(/\s+/g, "_");
  if (GREEN_ROOM_ITEM_BY_KEY.has(underscored) || GREEN_ROOM_RESOURCE_BY_KEY.has(underscored)) return underscored;
  return underscored;
}

export function parseGreenRoomCommand(input: string): GreenRoomCommand {
  const raw = String(input || "").trim().slice(0, 400);
  if (!raw) return { verb: "unknown", args: [], raw };
  const args = words(raw);
  const first = args[0]?.toLowerCase() || "";
  const mapped = COMMAND_ALIASES[first] || "unknown";
  const rest = args.slice(1);
  const restText = rest.join(" ");
  const minigameKey = MINIGAME_COMMAND_KEYS[normalizeTarget(raw)] || MINIGAME_COMMAND_KEYS[normalizeTarget(`${first} ${rest[0] || ""}`)] || "";

  if (mapped === "go") {
    const direction = first === "go" || first === "move" ? restText || rest[0] || "" : first;
    const normalizedDirection = normalizeTarget(direction);
    return { verb: "go", args, direction: DIRECTION_ALIASES[normalizedDirection] || normalizedDirection, raw };
  }
  if (mapped === "look") return { verb: "look", args, target: normalizeTarget(restText), raw };
  if (mapped === "inspect") return { verb: "inspect", args, target: normalizeTarget(restText), raw };
  if (mapped === "say") return { verb: "say", args, text: raw.startsWith("'") ? raw.slice(1).trim() : restText.trim(), raw };
  if (mapped === "inventory") return { verb: "inventory", args, raw };
  if (mapped === "sheet") return { verb: "sheet", args, raw };
  if (mapped === "roll") return { verb: "roll", args, skill: normalizeTarget(restText || "attention"), raw };
  if (mapped === "map") return { verb: "map", args, raw };
  if (mapped === "doors") return { verb: "doors", args, raw };
  if (mapped === "listen") {
    if (minigameKey) return { verb: "minigame", args, key: minigameKey, raw };
    return { verb: "listen", args, target: normalizeTarget(restText), raw };
  }
  if (mapped === "campaign") return { verb: "campaign", args, raw };
  if (mapped === "gather") return { verb: "gather", args, target: normalizeGreenRoomItemKey(restText), raw };
  if (mapped === "farm") return { verb: "farm", args, target: normalizeGreenRoomItemKey(restText), raw };
  if (mapped === "combine") return { verb: "combine", args, itemKey: normalizeGreenRoomItemKey(restText), raw };
  if (mapped === "talk") return { verb: "talk", args, target: normalizeTarget(restText), raw };
  if (mapped === "mark") {
    return {
      verb: "mark",
      args,
      username: normalizeTarget(rest[0] || ""),
      mark: normalizeTarget(rest[1] || ""),
      raw,
    };
  }
  if (mapped === "ally") {
    return { verb: "ally", args, action: normalizeTarget(rest[0] || "status"), name: rest.slice(1).join(" ").trim(), raw };
  }
  if (mapped === "offer") return { verb: "offer", args, target: normalizeGreenRoomItemKey(restText), raw };
  if (mapped === "attune") return { verb: "attune", args, raw };
  if (mapped === "enter") return { verb: "enter", args, target: normalizeTarget(restText || first), raw };
  if (mapped === "throw") {
    const itemKey = normalizeGreenRoomItemKey(rest[0] || "");
    const target = normalizeTarget(rest.slice(1).join(" "));
    return { verb: "throw", args, itemKey, target, raw };
  }
  if (mapped === "minigame") {
    const key = minigameKey || normalizeTarget(raw).replace(/\s+/g, "_");
    return { verb: "minigame", args, key, raw };
  }
  if (mapped === "help" || mapped === "who") return { verb: mapped, args, raw };
  return { verb: "unknown", args, raw };
}

export function isCommandUnlocked(commandDeck: unknown, command: string): boolean {
  const deck = commandDeck && typeof commandDeck === "object" ? commandDeck as Record<string, unknown> : GREEN_ROOM_BASE_COMMAND_DECK;
  return Number(deck[command] ?? 0) > 0;
}

export function knownGreenRoomCommands(commandDeck: unknown): string[] {
  const deck = commandDeck && typeof commandDeck === "object" ? commandDeck as Record<string, unknown> : GREEN_ROOM_BASE_COMMAND_DECK;
  return Object.entries(deck)
    .filter(([, tier]) => Number(tier) > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, tier]) => `${key} t${Number(tier) || 1}`);
}

function findDetail(room: GreenRoomRoom, target: string): GreenRoomDetail | null {
  const normalized = normalizeTarget(target);
  if (!normalized) return null;
  for (const [key, detail] of Object.entries(room.details)) {
    if (key === normalized || detail.aliases.some((alias) => normalizeTarget(alias) === normalized)) return detail;
  }
  return null;
}

export function inspectGreenRoomDetail(room: GreenRoomRoom, target: string): GreenRoomDetailResult {
  const detail = findDetail(room, target);
  if (!detail) {
    const normalized = normalizeTarget(target);
    const normalizedDescription = normalizeTarget(room.description);
    if (normalized.length >= 3 && normalizedDescription.includes(normalized)) {
      return {
        found: true,
        target,
        text: `You study ${target}. It is definitely here in ${room.title}, but it has not revealed a special mechanism yet.`,
        flag: null,
        reveals: [],
      };
    }
    return {
      found: false,
      target,
      text: `Nothing in ${room.title} answers to "${target}". That may be rude, or it may be correct.`,
      flag: null,
      reveals: [],
    };
  }
  return {
    found: true,
    target,
    text: detail.text,
    flag: detail.flag || null,
    reveals: detail.reveals || [],
  };
}

export function describeGreenRoomRoom(room: GreenRoomRoom, npcNames: string[] = [], resourceLabels: string[] = []): string[] {
  const exits = Object.keys(room.exits).sort().join(", ") || "none";
  const lines = [room.description, `Exits: ${exits}.`];
  if (npcNames.length > 0) lines.push(`Nearby: ${npcNames.join(", ")}.`);
  if (resourceLabels.length > 0) lines.push(`You notice: ${resourceLabels.join(", ")}.`);
  return lines;
}

export function combineThreeUpgrade(stacks: GreenRoomInventoryStack[], itemKey: string, tier = 1): GreenRoomCombineResult {
  const normalizedItemKey = normalizeGreenRoomItemKey(itemKey);
  const normalizedTier = Number.isInteger(tier) && tier > 0 ? tier : 1;
  const stack = stacks.find((candidate) => candidate.itemKey === normalizedItemKey && candidate.tier === normalizedTier);
  if (!stack || stack.quantity < 3) {
    return {
      ok: false,
      itemKey: normalizedItemKey,
      tier: normalizedTier,
      message: `You need three tier ${normalizedTier} ${normalizedItemKey.replace(/_/g, " ")} to combine.`,
    };
  }
  return {
    ok: true,
    itemKey: normalizedItemKey,
    fromTier: normalizedTier,
    toTier: normalizedTier + 1,
    consumed: 3,
    created: 1,
    message:
      `Three tier ${normalizedTier} ${stack.label || normalizedItemKey.replace(/_/g, " ")} collapse into ` +
      `one tier ${normalizedTier + 1}. The upgrade makes a small satisfied clicking sound.`,
  };
}

export function inventoryWeight(stacks: GreenRoomInventoryStack[]): number {
  return stacks.reduce((sum, stack) => sum + Math.max(0, stack.quantity) * Math.max(0, stack.weight), 0);
}

export function canCarry(stacks: GreenRoomInventoryStack[], weightLimit: number, incomingWeight: number): boolean {
  return inventoryWeight(stacks) + Math.max(0, incomingWeight) <= Math.max(0, weightLimit);
}
