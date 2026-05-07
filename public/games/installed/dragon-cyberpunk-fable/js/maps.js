/**
 * Dragon — Maps for 5 locations.
 * Tile chars → tile keys:
 *   f=stone_floor  w=brick_wall   h=hearth    g=grass
 *   r=cobblestone  s=well         d=dirt_path c=cave_floor
 *   C=cave_wall    p=palace_floor P=palace_wall k=carpet
 *   W=wood_floor   T=tree_trunk   t=tree_top   D=iron_door
 *   n=window_wall  S=sky          M=mountain
 *
 * WALL tiles (block movement): w C P T t n
 * EXIT triggers defined separately per map.
 */
'use strict';

const TILE_MAP = {
  f:'stone_floor', w:'brick_wall', h:'hearth', g:'grass',
  r:'cobblestone', s:'well',       d:'dirt_path', c:'cave_floor',
  C:'cave_wall',   p:'palace_floor', P:'palace_wall', k:'carpet',
  W:'wood_floor',  T:'tree_trunk', t:'tree_top', D:'iron_door',
  n:'window_wall', S:'sky', M:'mountain',
};
const WALLS = new Set(['brick_wall','cave_wall','palace_wall','tree_trunk','tree_top','window_wall','iron_door']);

function parseMap(rows) {
  return rows.map(row => row.split('').map(c => TILE_MAP[c] || 'stone_floor'));
}

/* ============================================================
   MAP DEFINITIONS  (20 cols × 15 rows = 320×240 pixels)
   ============================================================ */

/* ── 1. FOREST PATH ─────────────────────────────────────────
   Lance enters from the bottom (row 14). Exit north (row 0) → kitchen.       */
const forestRows = [
  'TTTTtttttSSStttTTTTT', // 0 – exit north, row 0 center → kitchen
  'TTtttttdddddtttttTTT',
  'Ttttttdddddddttttttt',
  'Tttttdddddddddtttttt',
  'Tggttdddddddddttgggg',
  'Tgggtdddddddddtggggg',
  'TgggTdddddddddTggggg',
  'Tgggtdddddddddtggggg',
  'TgggTdddddddddTggggg',
  'Tgggtdddddddddtggggg',
  'Tggggdddddddddgggggg',
  'Tggggdddddddddgggggg',
  'Tggggdddddddddgggggg',
  'Tgggddddddddddgggggg',
  'gggggddddddddddggggg', // 14 – Lance start row
];

/* ── 2. KITCHEN ─────────────────────────────────────────────
   Charlemagne's kitchen. Hearth center-back. Barsik near hearth.
   Exit south (row 14, cols 9-10) → town square.                              */
const kitchenRows = [
  'wwwwwwwwwwwwwwwwwwww', // 0
  'wnnwwwwwwwwwwwwwnnww', // 1 – windows
  'wWWWWWWWWWWWWWWWWWWw', // 2
  'wWWWWWWWWWWWWWWWWWWw', // 3
  'wWWWWWWWWWWWWWWWWWWw', // 4
  'wWWWWWWWWWWWWWWWWWWw', // 5
  'wWWWWWWWWWWWWWWWWWWw', // 6
  'wWWWWWWWhhhWWWWWWWWw', // 7 – hearth (3 tiles wide)
  'wWWWWWWWhhhWWWWWWWWw', // 8
  'wWWWWWWWWWWWWWWWWWWw', // 9
  'wWWWWWWWWWWWWWWWWWWw', // 10
  'wWWWWWWWWWWWWWWWWWWw', // 11
  'wWWWWWWWWWWWWWWWWWWw', // 12
  'wWWWWWWWWWWWWWWWWWWw', // 13
  'wwwwwwwwwDDwwwwwwwww', // 14 – door at cols 9-10 (exit south)
];

/* ── 3. TOWN SQUARE ─────────────────────────────────────────
   Well at center. Town Hall top-right (iron doors). Trees at corners.
   Exit east (row 7, col 19) → dragon mountain.                               */
const townSquareRows = [
  'TTwwwwwwwwwwwwwwwwTT', // 0 – buildings top
  'TTwwwwwwwwwwwwwwwwTT', // 1
  'ttwwwwwwwwDwwwwwwwtt', // 2 – iron doors in town hall
  'ggrrrrrrrrrrrrrrrrrg', // 3
  'ggrrrrrrrrrrrrrrrrrg', // 4
  'ggrrrrrrrrrrrrrrrrrg', // 5
  'ggrrrrrrrrsrrrrrrrgg', // 6 – well at col 10
  'ggrrrrrrrrsrrrrrrrDr', // 7 – well + EXIT east col 19 → mountain
  'ggrrrrrrrrsrrrrrrrgg', // 8
  'ggrrrrrrrrrrrrrrrrrg', // 9
  'ggrrrrrrrrrrrrrrrrrg', // 10
  'ggrrrrrrrrrrrrrrrrrg', // 11
  'TTgggggggggggggggggT', // 12 – trees bottom corners
  'TTgggggggggggggggggT', // 13
  'wwwwwwwwwwwwwwwwwwww', // 14 – bottom wall
];

/* ── 4. DRAGON'S MOUNTAIN ───────────────────────────────────
   Rocky approach. Skulls, lava. Cave entrance at row 1 center → battle.      */
const mountainRows = [
  'CCCCCCCCCCCCCCCCCCCC', // 0
  'CCCCCCCCCcCCCCCCCCCC', // 1 – cave entrance trigger at col 10 (row 1)
  'CCcccccccccccccccCCC', // 2
  'CCcccccccccccccccCCC', // 3
  'CcccccccccccccccccCC', // 4
  'cccccccccccccccccccc', // 5
  'cccccccccccccccccccc', // 6
  'cccccccccccccccccccc', // 7
  'cccccccccccccccccccc', // 8
  'cccccccccccccccccccc', // 9
  'cccccccccccccccccccc', // 10
  'cccccccccccccccccccc', // 11
  'cccccccccccccccccccc', // 12
  'cccccccccccccccccccc', // 13
  'DDDDDDDDDDDDDDDDDDdd', // 14 – entry from town square (west)
];

/* ── 5. UNDERGROUND WORKSHOP ───────────────────────────────
   Accessible from plaza (north door at col 9, row 2).
   Workbenches left, shelving right, display centre.
   Exit south (row 14) → plaza.                                                 */
const workshopRows = [
  'wwwwwwwwwwwwwwwwwwww', // 0
  'wnnwwwwwwwwwwwwwnnww', // 1 – windows
  'whhhWWWWWWWWWWWWnnnw', // 2 – forge hearth left; shelves (wall) right
  'whhhWWWWWWWWWWWWnnnw', // 3
  'wWWWWWWWWWWWWWWWWWww', // 4
  'wWWWWWWWWWWWWWWWWWww', // 5 – Blacksmith NPC near forge (x3,y5)
  'wWWWWWWWWWWWWWWWWWww', // 6
  'wWWWWWWWWWWWWWWWWWww', // 7
  'wWWWWWWWWWWWWWWWWWww', // 8
  'wWWWWWWWWkkkWWWWWWww', // 9 – carpet on display
  'wWWWWWWWWkkkWWWWWWww', // 10 – Petrov NPC (x3,y10), Luthier (x16,y10)
  'wWWWWWWWWkkkWWWWWWww', // 11
  'wWWWWWWWWWWWWWWWWWww', // 12
  'wWWWWWWWWWWWWWWWWWww', // 13 – Hatter NPC (x16,y13)
  'wwwwwwwwwwDwwwwwwwww', // 14 – exit south to town square
];

/* ── 6. LAIR ENTRANCE ───────────────────────────────────────
   The cave mouth before the Dragon's chamber.
   Walking north (rows 1–2) triggers the battle.
   Exit south (row 14) → mountain.                                               */
const lairEntranceRows = [
  'CCCCCCCCCCCCCCCCCCCC', // 0 – solid rock
  'CCCCCcccccccCCCCCCCC', // 1 – battle trigger zone
  'CCCcccccccccccCCCCCC', // 2 – battle trigger zone
  'CCcccccccccccccCCCCC', // 3
  'Cccccccccccccccccccc', // 4
  'cccccccccccccccccccc', // 5
  'cccccccccccccccccccc', // 6
  'cccccccccccccccccccc', // 7
  'cccccccccccccccccccc', // 8
  'cccccccccccccccccccc', // 9
  'cccccccccccccccccccc', // 10
  'cccccccccccccccccccc', // 11
  'cccccccccccccccccccc', // 12
  'cccccccccccccccccccc', // 13
  'cccccccccDcccccccccc', // 14 – exit south back to mountain
];

/* ── 7. MAYOR'S PENTHOUSE ──────────────────────────────────
   Corporate penthouse. Holographic carpet runner. Terminal at far end.
   Lance enters from row 14 center.                                           */
const palaceRows = [
  'PPPPPPPPPPPPPPPPPPpp', // 0
  'PpppppppppppppppppPP', // 1
  'PpkkkkkkkkkkkkkkkpPP', // 2 – carpet runner starts
  'Ppkkkkkkkkkkkkkkkppp', // 3
  'Ppkkkkkkkkkkkkkkkppp', // 4
  'PppppppppppppppppPPP', // 5 – tables on sides
  'Ppkkpppppppppkkkkppp', // 6
  'Ppkkpppppppppkkkkppp', // 7
  'Pppppppppppppppppppp', // 8
  'Ppkkkkkkkkkkkkkkkppp', // 9
  'Ppkkkkkkkkkkkkkkkppp', // 10
  'Ppkkkkkkkkkkkkkkkppp', // 11
  'PppppppppppppppppPPP', // 12
  'pppppppppppppppppppp', // 13
  'pppppppppppppppppppp', // 14 – entry
];

/* ============================================================
   ACTORS (all 5 maps)
   ============================================================ */
const forestActors = [
  { id:'lance', x:9, y:13, facing:0 },
];
const kitchenActors = [
  { id:'lance',   x:4,  y:11, facing:0 },
  { id:'barsik',  x:12, y:7,  facing:1 },
  { id:'charlie', x:8,  y:10, facing:0, visible:false },
  { id:'elena',   x:11, y:10, facing:0, visible:false },
  // Dragon appears here during dragon_visits — to the left of the server rack
  { id:'dragon',  x:5,  y:7,  facing:0, visible:false },
];
const townSquareActors = [
  { id:'lance',  x:5,  y:10, facing:0 },
  { id:'elena',  x:10, y:7,  facing:0 },
  { id:'mayor',  x:14, y:8,  facing:1 },
  { id:'hank',   x:16, y:6,  facing:1 },
  { id:'charlie',x:5,  y:7,  facing:0 },
];
const mountainActors = [
  { id:'lance', x:9, y:12, facing:0 },
];
const workshopActors = [
  { id:'lance',      x:9,  y:13, facing:0 },
  { id:'blacksmith', x:3,  y:5,  facing:0,  color:'#2a4a6a' },
  { id:'petrov',     x:3,  y:10, facing:0,  color:'#1a4a3a' },
  { id:'hatter',     x:16, y:13, facing:1,  color:'#4a2a5a' },
  { id:'luthier',    x:16, y:10, facing:1,  color:'#1a3a5a' },
];
const lairEntranceActors = [
  { id:'lance', x:9, y:12, facing:0 },
];
const palaceActors = [
  { id:'lance',   x:9,  y:14, facing:0 },
  { id:'elena',   x:11, y:5,  facing:0 },
  { id:'charlie', x:9,  y:6,  facing:0 },
  { id:'mayor',   x:13, y:4,  facing:1 },
  { id:'hank',    x:15, y:4,  facing:1 },
];

/* ============================================================
   MAP REGISTRY
   ============================================================ */
const Maps = {
  walls: WALLS,

  forest: {
    name: 'Highway 400 — Outskirts',
    tiles: parseMap(forestRows),
    actors: forestActors,
    exits: [{ rows:[0], cols:[7,8,9,10,11,12], to:'kitchen', toLandX:9, toLandY:13 }],
  },
  kitchen: {
    name: "Romanov's Server Room",
    tiles: parseMap(kitchenRows),
    actors: kitchenActors,
    exits: [{ rows:[14], cols:[9,10], to:'townSquare', toLandX:5, toLandY:13 }],
  },
  townSquare: {
    name: 'The Plaza — Downtown',
    tiles: parseMap(townSquareRows),
    actors: townSquareActors,
    exits: [
      /* cols 17-19: the iron door at 18 is a wall but exit check fires first */
      { rows:[6,7,8], cols:[17,18,19], to:'mountain',  toLandX:2, toLandY:13 },
      /* cols 8-10: door tile at 9 is a wall but exit check fires first */
      { rows:[2,3],   cols:[8,9,10],   to:'workshop',  toLandX:9, toLandY:13 },
    ],
  },
  mountain: {
    name: "The Dragon's Tower — Corporate HQ",
    tiles: parseMap(mountainRows),
    actors: mountainActors,
    exits: [
      { rows:[1,2], cols:[9,10,11], to:'lairEntrance', toLandX:9, toLandY:12 },
    ],
    triggers: [],
  },
  workshop: {
    name: "Underground Workshop",
    tiles: parseMap(workshopRows),
    actors: workshopActors,
    /* cols 9-11: door tile at 10 is a wall but exit check fires first */
    exits: [{ rows:[13,14], cols:[9,10,11], to:'townSquare', toLandX:9, toLandY:3 }],
  },
  lairEntrance: {
    name: "The Dragon's Core — Mainframe",
    tiles: parseMap(lairEntranceRows),
    actors: lairEntranceActors,
    exits: [{ rows:[14], cols:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19], to:'mountain', toLandX:9, toLandY:12 }],
    triggers: [
      { x:9,  y:1, event:'start_battle' },
      { x:10, y:1, event:'start_battle' },
      { x:9,  y:2, event:'start_battle' },
      { x:10, y:2, event:'start_battle' },
    ],
  },
  palace: {
    name: "Mayor Brooks' Penthouse",
    tiles: parseMap(palaceRows),
    actors: palaceActors,
    exits: [],
  },

  getMap(id) {
    const src = this[id];
    if (!src) return null;
    return {
      id,
      name: src.name,
      tiles: src.tiles.map(row => [...row]),
      actors: src.actors.map(a => ({ ...a })),
      exits: src.exits || [],
      triggers: (src.triggers || []).map(t => ({...t})),
    };
  },

  isSolid(map, tx, ty) {
    const row = map.tiles[ty];
    if (!row) return true;
    const tile = row[tx];
    return !tile || WALLS.has(tile);
  },
};

window.Maps = Maps;
