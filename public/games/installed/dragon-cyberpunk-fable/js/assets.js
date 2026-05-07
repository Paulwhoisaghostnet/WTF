/**
 * Dragon — Cyberpunk pixel-art assets.
 * Tiles are pre-rendered to offscreen canvases (16x16) with 3/4 top-down angle.
 * Sprites: figurine-style characters for the cyberpunk setting.
 * Dragon: a cluster of computers/laptops with three monitor heads.
 */
'use strict';

/* ============================================================
   PALETTE — cyberpunk neons + dark backdrop
   ============================================================ */
const P = {
  // Panel floor (server room / indoor)
  stoneBase:'#0d0d2b', stoneMid:'#161640', stoneLight:'#222258',
  stoneDark:'#08081a', stoneGrout:'#00ffcc30',
  // Cyber wall
  brickA:'#141430', brickB:'#1e1e44', brickC:'#0d0d28',
  brickHi:'#00ccaa', brickMortar:'#06061a',
  // Server rack (animated)
  hearthS:'#08081e', hearthM:'#04040e',
  fireY:'#00ffcc', fireO:'#0088ff', fireR:'#ff0066', fireC:'#ffffff',
  // Street / outside ground
  grassB:'#08080f', grassM:'#10101e', grassL:'#18182e', grassD:'#04040a',
  flowerY:'#ffcc00', flowerR:'#ff0066',
  // Neon street
  cobA:'#14142a', cobB:'#1a1a36', cobC:'#0e0e22',
  cobMortar:'#06060e', cobHi:'#00ffcc30', cobSh:'#04040a',
  // Cyber path (luminous walkway)
  dirtB:'#0a1028', dirtM:'#080c20', dirtL:'#122040', dirtD:'#060a16',
  // Mainframe (cave)
  caveB:'#04040c', caveM:'#0a0a1a', caveL:'#10102e',
  lavaHot:'#00ffcc', lavaMid:'#0088ff', lavaDk:'#004488', lavaCool:'#002244',
  crystB:'#8800ff', crystBL:'#aa44ff',
  // Penthouse / corp (palace)
  marbleB:'#141430', marbleM:'#1a1a3e', marbleDk:'#0a0a20', marbleV:'#121230',
  carpetB:'#ff006618', carpetM:'#ff006630',
  goldB:'#00ffcc', goldL:'#44ffdd', goldDk:'#00aa88',
  // Grating (wood floor)
  woodB:'#0c0c1c', woodM:'#14142a', woodL:'#1e1e3a', woodDk:'#060610',
  // Antenna tower (tree)
  trunkB:'#1a1a30', trunkL:'#2a2a44',
  leafB:'#00ffcc', leafM:'#00ddaa', leafL:'#00bb88',
  // Characters
  skin:'#e8c090', skinDk:'#c8a070', skinSh:'#a88050',
  eyeB:'#00ffcc', eyeBr:'#5a3a18', eyeGr:'#00ff88',
  // Lance (cyber drifter)
  lBlue:'#0044aa', lBlueMid:'#0066cc', lBlueHi:'#0088ff',
  lPants:'#0a0a1e', lBoots:'#1a1a2e', lHair:'#d4b050',
  lGold:'#00ffcc', lOutline:'#000008',
  // Elena (resistance)
  elRed:'#cc0055', elRedM:'#dd2277', elRedL:'#ee4499',
  elWhite:'#c0e8ff', elHair:'#1a0a10', elHairH:'#38202a', elGold:'#00ffcc',
  // Charlie
  chRobe:'#2a1a5a', chRobeM:'#4a3a7a', chRobeL:'#6a5a9a',
  chHair:'#e0e0e0', chBeard:'#d0d0d0', chGlass:'#00ffcc',
  // Mayor
  mayS:'#141428', maySM:'#1e1e3a', mayTie:'#ff0066',
  // Hank
  hnkLiv:'#1e1e30', hnkLivM:'#2e2e44', hnkHair:'#1a100a', hnkSkin:'#d8b878',
  // Barsik (cyber cat)
  catO:'#cc6620', catM:'#dd8840', catStr:'#aa4410', catW:'#f0e8d8',
  // Dragon = computer cluster
  drgS:'#0a0a1e', drgSM:'#141432', drgSL:'#1e1e48', drgSD:'#04040e',
  drgHorn:'#00ffcc', drgFire:'#ff0066', drgFireM:'#ff6600',
  drgEye:'#00ffcc', drgEyeSlit:'#ff0066', drgWing:'#0a0a20',
  // UI
  uiBg:'rgba(6,4,20,0.95)', uiBorder:'#00ffcc', uiBorderIn:'#004444',
  uiText:'#c0e8ff', uiTextDim:'#4a7090', uiTextAccent:'#00ffcc',
  uiHPG:'#00ffcc', uiHPY:'#ffcc00', uiHPR:'#ff0066', uiMP:'#8800ff',
  uiSel:'#ff0066',
};
window.P = P;

const T = 16;
const _tc = {};

/* ============================================================
   TILE HELPERS
   ============================================================ */
function r(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }

function makeTile(fn) {
  const el = document.createElement('canvas');
  el.width = T; el.height = T;
  const c = el.getContext('2d');
  c.imageSmoothingEnabled = false;
  fn(c);
  return el;
}

/* ============================================================
   TILE DRAW FUNCTIONS — 3/4 angle cyberpunk (16x16)
   Bottom 3-4 rows show the front "face" for depth.
   ============================================================ */
function _stoneFloor(c) {
  r(c,0,0,T,12,P.stoneBase);
  r(c,0,12,T,4,P.stoneDark);
  r(c,0,0,T,1,'#00ffcc10'); r(c,0,0,1,12,'#00ffcc08');
  r(c,8,0,1,12,P.stoneGrout); r(c,0,6,T,1,P.stoneGrout);
  for (const [ox,oy] of [[1,1],[9,1],[1,7],[9,7]]) {
    r(c,ox,oy,6,4,P.stoneMid);
    r(c,ox,oy,5,1,P.stoneLight); r(c,ox,oy,1,3,P.stoneLight);
  }
  r(c,3,13,2,1,'#00ffcc18');
  r(c,11,14,3,1,'#00ffcc10');
}
function _brickWall(c) {
  r(c,0,0,T,T,P.brickMortar);
  r(c,1,1,6,3,P.brickA); r(c,9,1,6,3,P.brickB);
  r(c,0,5,4,3,P.brickB); r(c,5,5,6,3,P.brickA); r(c,12,5,4,3,P.brickB);
  r(c,1,9,6,3,P.brickA); r(c,9,9,6,3,P.brickC);
  r(c,0,13,4,3,P.brickC); r(c,5,13,6,3,P.brickA); r(c,12,13,4,3,P.brickA);
  r(c,0,8,T,1,P.brickHi);
  r(c,7,0,1,T,'#00ffcc20');
}
function _hearth(c, frame) {
  r(c,0,0,T,T,P.hearthM);
  r(c,0,0,4,T,P.hearthS); r(c,12,0,4,T,P.hearthS);
  r(c,0,0,T,3,P.hearthS); r(c,0,13,T,3,P.hearthS);
  r(c,4,3,8,10,'#020208');
  const f = frame % 3;
  r(c,5,4,6,2,'#0a0a1e');
  r(c,5,7,6,2,'#0a0a1e');
  r(c,5,10,6,2,'#0a0a1e');
  if (f===0) {
    r(c,6,4,1,1,P.fireY); r(c,8,4,1,1,P.fireR); r(c,10,7,1,1,P.fireO);
    r(c,6,10,1,1,P.fireY); r(c,9,10,1,1,P.fireR);
  } else if (f===1) {
    r(c,7,4,1,1,P.fireR); r(c,9,4,1,1,P.fireY); r(c,6,7,1,1,P.fireO);
    r(c,8,10,1,1,P.fireY); r(c,10,10,1,1,P.fireO);
  } else {
    r(c,5,4,1,1,P.fireO); r(c,10,4,1,1,P.fireY); r(c,8,7,1,1,P.fireR);
    r(c,7,10,1,1,P.fireO); r(c,5,10,1,1,P.fireR);
  }
  r(c,0,0,T,1,'#1a1a30'); r(c,0,0,1,T,'#1a1a30');
}
function _grass(c) {
  r(c,0,0,T,12,'#08080f');
  r(c,0,12,T,4,'#060608');
  for (const [x,y] of [[3,2],[7,1],[12,3],[5,8],[14,6],[9,10]])
    r(c,x,y,1,1,'#10101e');
  for (const [x,y] of [[1,5],[6,9],[11,7]])
    r(c,x,y,1,1,'#04040a');
  r(c,2,4,1,1,'#ffcc0040');
  r(c,13,9,1,1,'#ff006640');
  r(c,8,3,3,1,'#00ffcc08');
}
function _cobblestone(c) {
  r(c,0,0,T,12,P.cobMortar);
  r(c,0,12,T,4,'#04040a');
  for (const s of [
    {x:1,y:1,w:5,h:3,col:P.cobA},{x:7,y:1,w:7,h:3,col:P.cobB},
    {x:1,y:5,w:7,h:3,col:P.cobC},{x:9,y:5,w:6,h:3,col:P.cobA},
    {x:2,y:9,w:5,h:3,col:P.cobB},{x:8,y:9,w:7,h:3,col:P.cobC},
  ]) {
    r(c,s.x,s.y,s.w,s.h,s.col);
    r(c,s.x,s.y,s.w,1,P.cobHi);
  }
  r(c,0,6,T,1,'#00ffcc10');
  r(c,3,3,2,1,'#0088ff18');
  r(c,12,8,3,1,'#ff006618');
}
function _dirtPath(c) {
  r(c,0,0,T,12,P.dirtB);
  r(c,0,12,T,4,P.dirtD);
  for (const [x,y] of [[1,2],[5,1],[9,3],[13,2],[3,7],[7,9],[11,8]])
    r(c,x,y,2,1,P.dirtL);
  r(c,0,5,T,1,'#00ffcc0c');
  r(c,6,0,1,12,'#0088ff10');
}
function _caveFloor(c) {
  r(c,0,0,T,12,P.caveB);
  r(c,0,12,T,4,'#020208');
  r(c,0,0,T,1,P.caveM); r(c,0,0,1,12,P.caveM);
  r(c,8,0,1,12,'#02020a'); r(c,0,6,T,1,'#02020a');
  r(c,1,1,6,4,P.caveM); r(c,9,7,6,4,P.caveM);
  r(c,3,10,2,2,P.lavaMid); r(c,4,9,1,1,P.lavaMid); r(c,3,11,1,1,P.lavaHot);
  r(c,12,3,1,1,P.crystB);
}
function _caveWall(c) {
  r(c,0,0,T,T,P.caveB);
  r(c,2,2,4,4,P.caveM); r(c,8,1,5,3,'#020208');
  r(c,1,8,4,5,P.caveM); r(c,9,8,6,6,'#020208');
  r(c,5,5,2,2,P.caveL);
  r(c,11,3,2,4,P.crystB); r(c,11,3,2,1,P.crystBL);
  r(c,3,12,1,1,'#00ffcc20');
}
function _palaceFloor(c) {
  r(c,0,0,T,12,P.marbleB);
  r(c,0,12,T,4,P.marbleDk);
  r(c,0,0,T,1,'#00ffcc0c'); r(c,0,0,1,12,'#00ffcc08');
  r(c,8,0,1,12,P.marbleM); r(c,0,6,T,1,P.marbleM);
  for (const [x,y,w,h] of [[2,2,1,3],[10,1,1,3],[3,8,1,3],[11,7,2,2]])
    r(c,x,y,w,h,P.marbleV);
}
function _palaceWall(c) {
  r(c,0,0,T,T,'#0a0a20'); r(c,1,1,14,14,'#101030');
  r(c,0,13,T,3,P.goldB); r(c,0,13,T,1,P.goldL);
  r(c,2,2,1,11,'#00aa8840'); r(c,13,2,1,11,'#00aa8840');
  r(c,0,0,T,1,P.goldB);
  for (const [x,y] of [[4,4],[10,4],[4,10],[10,10]]) r(c,x,y,2,2,'#181840');
  r(c,7,7,2,2,'#8800ff40');
}
function _carpet(c) {
  r(c,0,0,T,12,'#1a0020'); r(c,0,12,T,4,'#100016');
  r(c,1,1,14,10,'#2a0040');
  r(c,2,2,12,1,P.goldB); r(c,2,10,12,1,P.goldB);
  r(c,2,2,1,9,P.goldB); r(c,13,2,1,9,P.goldB);
  for (const [x,y] of [[4,4],[8,4],[12,4],[4,8],[12,8]]) r(c,x,y,1,1,'#00aa8840');
  r(c,7,6,2,2,'#ff006640');
}
function _woodFloor(c) {
  r(c,0,0,T,12,P.woodB);
  r(c,0,12,T,4,P.woodDk);
  r(c,0,0,T,1,'#00ffcc08');
  r(c,1,1,14,2,P.woodM); r(c,1,4,14,2,P.woodB);
  r(c,1,7,14,2,P.woodM); r(c,1,10,14,2,P.woodB);
  for (const [x,y] of [[2,2],[9,1],[4,5],[11,8]]) r(c,x,y,3,1,P.woodL);
  r(c,7,3,1,8,'#00ffcc0a');
}
function _treeTrunk(c) {
  _grass(c);
  r(c,5,0,6,12,P.trunkB); r(c,5,12,6,4,'#121228');
  r(c,5,0,2,12,P.trunkL); r(c,10,0,1,12,'#0a0a1e');
  r(c,7,2,1,1,'#ff006640'); r(c,7,6,1,1,'#00ffcc40'); r(c,7,10,1,1,'#0088ff40');
}
function _treeTop(c) {
  r(c,0,0,T,T,'#0a0e1e');
  r(c,2,1,12,10,'#1a1a30');
  r(c,4,3,8,6,'#222244');
  r(c,6,4,4,4,'#0088ff30');
  r(c,7,5,2,2,'#00ffcc');
  r(c,3,0,1,1,'#ff0066'); r(c,12,2,1,1,'#ff0066');
  r(c,0,12,T,4,'#060610');
}
function _well(c) {
  r(c,0,0,T,12,P.cobMortar);
  r(c,0,12,T,4,'#04040a');
  r(c,2,1,12,10,'#0a0a20');
  r(c,4,3,8,6,'#020210');
  r(c,6,4,4,4,'#0088ff20');
  r(c,7,5,2,2,'#00ffcc80');
  r(c,2,0,12,2,'#1a1a36');
  r(c,6,0,4,1,P.goldB);
  r(c,2,1,10,1,'#00ffcc18');
}
function _windowWall(c) {
  _brickWall(c);
  r(c,3,2,10,11,'#020210');
  r(c,4,3,4,4,'#0a1a3a'); r(c,9,3,4,4,'#061428');
  r(c,4,8,4,4,'#061428'); r(c,9,8,4,4,'#0a1a3a');
  r(c,7,2,2,11,'#1a1a30'); r(c,3,7,10,2,'#1a1a30');
  r(c,5,4,2,1,'#00ffcc40'); r(c,10,9,2,1,'#ff006640');
}
function _ironDoor(c) {
  r(c,0,0,T,T,'#08081a'); r(c,1,0,14,T,'#10102a');
  r(c,1,0,1,T,'#1a1a3a');
  r(c,2,2,3,12,'#1a1a3a'); r(c,9,2,3,12,'#1a1a3a');
  for (const [x,y] of [[2,3],[2,9],[10,3],[10,9]]) r(c,x,y,2,2,'#2a2a4a');
  r(c,6,6,4,2,P.goldB);
  r(c,7,7,2,1,'#00ffcc80');
}
function _skyTile(c) {
  r(c,0,0,T,T,'#0a0e1e');
  r(c,0,0,T,4,'#0c1224');
  r(c,4,1,2,1,'#1a2a4a'); r(c,12,3,3,1,'#1a2a4a');
  r(c,2,6,1,1,'#ff006630'); r(c,14,2,1,1,'#00ffcc30');
}
function _mountainTile(c) {
  r(c,0,0,T,T,'#0c0c1e');
  r(c,2,0,12,T,'#12122a'); r(c,5,0,6,T,'#181838');
  r(c,5,0,4,1,'#00ffcc30'); r(c,7,1,2,1,'#0088ff20');
  r(c,3,8,1,1,'#ff006620'); r(c,11,5,1,1,'#00ffcc20');
}

/* ============================================================
   TILE REGISTRY + INIT
   ============================================================ */
const _tileKeys = {
  stone_floor: c=>_stoneFloor(c),
  brick_wall: c=>_brickWall(c),
  hearth0: c=>_hearth(c,0), hearth1: c=>_hearth(c,1), hearth2: c=>_hearth(c,2),
  grass: c=>_grass(c),
  cobblestone: c=>_cobblestone(c),
  dirt_path: c=>_dirtPath(c),
  cave_floor: c=>_caveFloor(c),
  cave_wall: c=>_caveWall(c),
  palace_floor: c=>_palaceFloor(c),
  palace_wall: c=>_palaceWall(c),
  carpet: c=>_carpet(c),
  wood_floor: c=>_woodFloor(c),
  tree_trunk: c=>_treeTrunk(c),
  tree_top: c=>_treeTop(c),
  well: c=>_well(c),
  window_wall: c=>_windowWall(c),
  iron_door: c=>_ironDoor(c),
  sky: c=>_skyTile(c),
  mountain: c=>_mountainTile(c),
};

/* ============================================================
   SPRITE DRAW FUNCTIONS — figurine-style cyberpunk characters
   Smaller/chibi proportions with big heads, compact bodies.
   ============================================================ */
function drawLance(ctx, x, y, facing) {
  const sx = facing===1 ? (x + T/2) * 2 : 0;
  ctx.save();
  if (facing===1) { ctx.translate(sx, 0); ctx.scale(-1,1); }
  // boots
  r(ctx,x-1,y-2,4,2,'#1a1a2e'); r(ctx,x+5,y-2,4,2,'#1a1a2e');
  // legs
  r(ctx,x-1,y-6,4,4,P.lPants); r(ctx,x+5,y-6,4,4,P.lPants);
  // torso — jacket
  r(ctx,x-2,y-12,12,7,P.lBlue);
  r(ctx,x-2,y-13,12,1,P.lBlueMid);
  r(ctx,x+2,y-11,3,3,P.lBlueHi);
  // collar glow
  r(ctx,x+1,y-13,6,1,'#00ffcc60');
  // head
  r(ctx,x+1,y-19,7,6,P.skin);
  r(ctx,x+2,y-19,5,1,P.skinDk);
  // visor (cyber)
  r(ctx,x+1,y-17,7,2,'#00ffcc');
  r(ctx,x+2,y-17,5,1,'#00ddaa');
  // hair
  r(ctx,x+1,y-21,7,3,P.lHair);
  r(ctx,x,y-20,2,2,P.lHair);
  // laser gun on back
  r(ctx,x+10,y-15,2,1,'#00ffcc'); r(ctx,x+10,y-14,1,5,'#666688');
  ctx.restore();
}

function drawElena(ctx, x, y, facing) {
  ctx.save();
  if (facing===1) { ctx.translate((x+T/2)*2, 0); ctx.scale(-1,1); }
  // boots
  r(ctx,x,y-2,9,2,P.elRed);
  // skirt/legs
  r(ctx,x,y-6,9,4,P.elRedM);
  // torso
  r(ctx,x+1,y-11,7,5,P.elRedM);
  r(ctx,x+2,y-10,2,3,P.elWhite); r(ctx,x+5,y-9,2,3,P.elWhite);
  // neon belt
  r(ctx,x+1,y-11,7,1,'#00ffcc60');
  // head
  r(ctx,x+2,y-17,5,6,P.skin);
  r(ctx,x+2,y-17,5,1,P.skinDk);
  // eyes
  r(ctx,x+3,y-15,1,1,'#1a0a10'); r(ctx,x+5,y-15,1,1,'#1a0a10');
  // hair
  r(ctx,x+1,y-19,7,3,P.elHair);
  r(ctx,x+7,y-19,2,8,P.elHair); r(ctx,x,y-18,1,7,P.elHair);
  r(ctx,x+2,y-19,3,2,P.elHairH);
  ctx.restore();
}

function drawCharlie(ctx, x, y, facing) {
  ctx.save();
  if (facing===1) { ctx.translate((x+T/2)*2, 0); ctx.scale(-1,1); }
  // feet
  r(ctx,x,y-1,8,1,P.chRobe);
  // robe/body
  r(ctx,x,y-7,8,6,P.chRobe);
  r(ctx,x+1,y-10,6,4,P.chRobe);
  r(ctx,x+2,y-8,2,4,P.chRobeM);
  // data-tablet in hand
  r(ctx,x+7,y-9,2,3,'#0a0a1e'); r(ctx,x+7,y-9,2,1,'#00ffcc');
  // beard
  r(ctx,x+2,y-14,5,4,P.chBeard);
  // head
  r(ctx,x+2,y-17,5,3,P.skin);
  // glasses (cyber)
  r(ctx,x+2,y-16,2,1,P.chGlass); r(ctx,x+5,y-16,2,1,P.chGlass);
  r(ctx,x+4,y-16,1,1,'#00ddaa');
  // hair
  r(ctx,x+2,y-19,5,3,P.chHair);
  r(ctx,x+1,y-18,1,2,P.chHair); r(ctx,x+7,y-18,1,2,P.chHair);
  ctx.restore();
}

/**
 * Dragon in his "working form" — compact grey-suited man, quiet authority.
 * Subtle dragon tells: cyan slit eyes, crimson lapel pin, faint aura.
 */
function drawDragonMap(ctx, x, y, facing) {
  ctx.save();
  if (facing === 1) { ctx.translate((x + T / 2) * 2, 0); ctx.scale(-1, 1); }
  // faint presence aura
  ctx.fillStyle = '#ff006608';
  ctx.fillRect(x - 1, y - 21, 12, 21);
  // shoes — polished black
  r(ctx, x + 1, y - 2, 3, 2, '#141420'); r(ctx, x + 6, y - 2, 3, 2, '#141420');
  r(ctx, x + 1, y - 2, 3, 1, '#1e1e30'); r(ctx, x + 6, y - 2, 3, 1, '#1e1e30');
  // trousers — charcoal
  r(ctx, x + 1, y - 7, 3, 5, '#272738'); r(ctx, x + 6, y - 7, 3, 5, '#272738');
  // jacket body — deep grey
  r(ctx, x,     y - 14, 10, 7, '#222236');
  r(ctx, x,     y - 14,  1, 7, '#2a2a40'); r(ctx, x + 9, y - 14, 1, 7, '#2a2a40');
  r(ctx, x,     y - 14, 10,  1, '#2e2e48');
  // shirt / lapels (pale)
  r(ctx, x + 3, y - 13, 4, 5, '#b0b0c0');
  r(ctx, x + 3, y - 9,  4, 2, '#9090a0');
  // crimson lapel pin — dragon mark
  r(ctx, x + 4, y - 12, 2, 3, P.drgFire);
  r(ctx, x + 4, y - 12, 2, 1, '#ff3388');
  // shoulders
  r(ctx, x,     y - 14, 3, 3, '#2a2a40');
  r(ctx, x + 7, y - 14, 3, 3, '#2a2a40');
  // neck
  r(ctx, x + 4, y - 16, 2, 2, P.skin);
  // head — slightly narrower, more angular
  r(ctx, x + 2, y - 21, 6, 6, P.skin);
  r(ctx, x + 2, y - 22, 6, 2, P.skinDk);
  // eyes — dragon cyan iris with red slit
  r(ctx, x + 3, y - 19, 2, 1, P.drgEye);
  r(ctx, x + 3, y - 19, 1, 1, P.drgEyeSlit);
  r(ctx, x + 6, y - 19, 2, 1, P.drgEye);
  r(ctx, x + 6, y - 19, 1, 1, P.drgEyeSlit);
  // thin mouth — neutral, unreadable
  r(ctx, x + 3, y - 17, 4, 1, P.skinSh);
  // silver hair, swept back
  r(ctx, x + 2, y - 23, 6, 2, '#9090a8');
  r(ctx, x + 1, y - 22, 1, 2, '#8080a0');
  r(ctx, x + 8, y - 22, 1, 2, '#8080a0');
  ctx.restore();
}

function drawMayor(ctx, x, y, facing) {
  ctx.save();
  if (facing===1) { ctx.translate((x+T/2)*2, 0); ctx.scale(-1,1); }
  // shoes
  r(ctx,x+1,y-3,3,3,P.mayS); r(ctx,x+6,y-3,3,3,P.mayS);
  // suit
  r(ctx,x,y-11,10,8,P.mayS);
  r(ctx,x,y-12,10,1,P.maySM);
  r(ctx,x+4,y-10,2,5,P.mayTie);
  // shoulders
  r(ctx,x,y-11,3,3,P.maySM); r(ctx,x+7,y-11,3,3,P.maySM);
  // head
  r(ctx,x+2,y-17,6,6,P.skin);
  r(ctx,x+3,y-18,4,2,'#c8a868');
  r(ctx,x+3,y-14,1,1,'#8a6040'); r(ctx,x+6,y-14,1,1,'#8a6040');
  ctx.restore();
}

function drawHank(ctx, x, y, facing) {
  ctx.save();
  if (facing===1) { ctx.translate((x+T/2)*2, 0); ctx.scale(-1,1); }
  // shoes
  r(ctx,x+1,y-4,3,4,'#0e0e1e'); r(ctx,x+6,y-4,3,4,'#0e0e1e');
  // suit
  r(ctx,x,y-10,10,7,P.hnkLiv);
  r(ctx,x,y-11,10,2,P.hnkLivM);
  // earpiece
  r(ctx,x+1,y-15,1,2,'#00ffcc80');
  // head
  r(ctx,x+2,y-16,6,6,P.hnkSkin);
  r(ctx,x+2,y-18,6,3,P.hnkHair); r(ctx,x+1,y-17,2,2,P.hnkHair);
  r(ctx,x+3,y-14,1,1,'#1a1a2a'); r(ctx,x+6,y-14,1,1,'#1a1a2a');
  ctx.restore();
}

function drawBarsik(ctx, x, y) {
  const bx = x-7, by = y-8;
  r(ctx,bx,by+2,13,6,P.catO); r(ctx,bx,by+2,13,2,P.catM);
  r(ctx,bx+2,by+2,1,6,P.catStr); r(ctx,bx+5,by+2,1,5,P.catStr); r(ctx,bx+8,by+2,1,5,P.catStr);
  r(ctx,bx+1,by+5,6,3,P.catW);
  r(ctx,bx+9,by,6,5,P.catO); r(ctx,bx+9,by,6,2,P.catM);
  r(ctx,bx+9,by-2,2,2,P.catO); r(ctx,bx+14,by-2,2,2,P.catO);
  r(ctx,bx+10,by-1,1,1,P.catStr); r(ctx,bx+14,by-1,1,1,P.catStr);
  // cyber eyes (glowing green)
  r(ctx,bx+10,by+1,1,1,'#00ff88'); r(ctx,bx+13,by+1,1,1,'#00ff88');
  r(ctx,bx+12,by+1,1,1,'#1a1a1a');
  r(ctx,bx-4,by+3,4,2,P.catO); r(ctx,bx-5,by+1,2,3,P.catO);
  for (const [ox,oy] of [[1,7],[4,7],[7,7],[10,7]]) r(ctx,bx+ox,by+oy,2,2,P.catO);
  // tiny collar glow
  r(ctx,bx+9,by+4,6,1,'#00ffcc40');
}

function drawNPC(ctx, x, y, color) {
  r(ctx,x-2,y-2,5,2,'#1a1a2e');
  r(ctx,x-3,y-8,7,6,color || '#3a3a5a');
  r(ctx,x-2,y-10,5,3,P.skin);
  r(ctx,x-2,y-12,5,2,'#2a2a3e');
  r(ctx,x-1,y-9,1,1,'#00ffcc60');
}

/* ============================================================
   DRAGON BATTLE SPRITE — Computer cluster with 3 monitor heads
   Laptops and servers stacked together. Monitors on top show
   dragon face glyphs. As phases progress, monitors go dark.
   ============================================================ */
function drawDragonBattle(ctx, x, y, phase, frame) {
  const bx = x-30, by = y-70;
  const f = frame % 2;

  // server rack base (body)
  r(ctx,bx+5,by+38,44,28,P.drgS);
  r(ctx,bx+7,by+40,40,24,P.drgSM);
  // rack detail — blinking LEDs
  for (let i=0;i<5;i++) for (let j=0;j<3;j++) {
    r(ctx,bx+8+i*8,by+42+j*7,7,6,'#08081a');
    r(ctx,bx+8+i*8,by+42+j*7,6,1,'#1a1a3e');
    const ledCol = (i+j+f)%3===0 ? '#00ffcc' : (i+j+f)%3===1 ? '#ff0066' : '#0088ff';
    r(ctx,bx+13+i*8,by+43+j*7,1,1,ledCol);
  }

  // laptop wings (spread open)
  r(ctx,bx-2,by+30,12,20,'#0c0c20');
  r(ctx,bx-1,by+32,10,16,'#141432');
  r(ctx,bx+1,by+34,6,12,'#0a1a3a');
  r(ctx,bx+48,by+30,12,20,'#0c0c20');
  r(ctx,bx+49,by+32,10,16,'#141432');
  r(ctx,bx+51,by+34,6,12,'#0a1a3a');
  // keyboard detail on wings
  for (let i=0;i<3;i++) {
    r(ctx,bx+1,by+40+i*4,6,2,'#1a1a30');
    r(ctx,bx+51,by+40+i*4,6,2,'#1a1a30');
  }

  // cable legs
  r(ctx,bx+10,by+64,8,5,'#1a1a30');
  r(ctx,bx+36,by+64,8,5,'#1a1a30');
  for (const ox of [10,13,16,36,39,42]) {
    r(ctx,bx+ox,by+67,2,3,'#0a0a1a');
    r(ctx,bx+ox,by+68,1,1,(f===0)?'#00ffcc40':'#0088ff40');
  }

  // power cables (tail)
  r(ctx,bx+47,by+50,8,4,'#1a1a30');
  r(ctx,bx+53,by+46,5,6,'#141428');
  r(ctx,bx+56,by+42,3,5,'#0a0a1e');

  // MONITOR HEADS — 3 screens on stalks
  const heads = phase >= 3 ? 1 : phase >= 2 ? 2 : 3;
  const hposX = [bx+2, bx+19, bx+36], hposY = [by+14, by+6, by+14];

  for (let i=0; i<heads; i++) {
    const hx = hposX[i], hy = hposY[i] + (f===0?0:1);
    const neckH = by+38 - (hy+14);

    // monitor stalk (cables)
    r(ctx,hx+4,hy+14,6,neckH,'#1a1a30');
    r(ctx,hx+5,hy+14,2,neckH,'#222244');
    r(ctx,hx+6,hy+16,1,neckH-2,(f===0)?'#00ffcc20':'#0088ff20');

    // monitor frame
    r(ctx,hx,hy,16,14,'#0c0c20');
    r(ctx,hx+1,hy+1,14,12,'#08081a');

    // screen content — dragon face glyph
    r(ctx,hx+2,hy+2,12,10,'#0a1430');

    // dragon eye glyphs on screen
    r(ctx,hx+3,hy+4,3,2,P.drgEye);
    r(ctx,hx+4,hy+5,1,1,P.drgEyeSlit);
    r(ctx,hx+9,hy+4,3,2,P.drgEye);
    r(ctx,hx+10,hy+5,1,1,P.drgEyeSlit);

    // dragon mouth glyph
    r(ctx,hx+4,hy+8,7,2,'#ff0066');
    r(ctx,hx+5,hy+8,5,1,'#ff3388');

    // horns on top of monitor
    r(ctx,hx+1,hy-3,3,4,'#00ffcc80');
    r(ctx,hx+12,hy-3,3,4,'#00ffcc80');

    // screen glow
    if (i===1 && f===1) {
      r(ctx,hx+14,hy+5,8,3,'#ff0066');
      r(ctx,hx+20,hy+4,10,5,'#ff660080');
      r(ctx,hx+28,hy+3,6,6,'#ffcc0060');
    }
  }

  // damage overlays
  if (phase===2) { ctx.fillStyle='rgba(0,136,255,0.12)'; ctx.fillRect(bx-2,by,62,72); }
  if (phase===3) { ctx.fillStyle='rgba(255,0,100,0.18)'; ctx.fillRect(bx-2,by,62,72); }
}

/* ============================================================
   PNG IMAGE LOADING
   ============================================================ */
const _imgs = {};
const _processed = {};

const _imgPaths = [
  ['bg_title',         'img/bg_title.png'],
  ['bg_battle_cave',   'img/bg_battle_cave.png'],
  ['bg_broadcast',     'img/bg_broadcast.png'],
  ['bg_palace_hall',   'img/bg_palace_hall.png'],
  ['bg_workshop',      'img/bg_workshop.png'],
  ['bg_lair_entrance', 'img/bg_lair_entrance.png'],
  ['bg_etrike_escape', 'img/bg_etrike_escape.png'],
  ['sprite_dragon_p1', 'img/sprite_dragon_p1.png'],
  ['sprite_dragon_p2', 'img/sprite_dragon_p2.png'],
  ['sprite_dragon_p3', 'img/sprite_dragon_p3.png'],
  ['sprite_lance',     'img/sprite_lance_battle.png'],
];

const _spriteSet = new Set([
  'sprite_dragon_p1','sprite_dragon_p2','sprite_dragon_p3','sprite_lance',
]);

function prepareSprite(img) {
  const c = document.createElement('canvas');
  c.width  = img.naturalWidth;
  c.height = img.naturalHeight;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0);
  return c;
}

function imgReady(key) {
  if (_spriteSet.has(key)) return !!_processed[key];
  const img = _imgs[key];
  return img && img.complete && img.naturalWidth > 0;
}

/* ============================================================
   ASSETS PUBLIC API
   ============================================================ */
const ASSETS = {
  TILE_W: T, TILE_H: T,
  colors: P,
  imgs: _imgs,
  animFrame: 0,
  animTimer: 0,

  init() {
    for (const [k, fn] of Object.entries(_tileKeys)) {
      _tc[k] = makeTile(fn);
    }
    for (const [key, path] of _imgPaths) {
      const img = new Image();
      img.src = path;
      _imgs[key] = img;
      if (_spriteSet.has(key)) {
        img.onload = () => { _processed[key] = prepareSprite(img); };
      }
    }
  },

  updateAnim(dt) {
    this.animTimer += dt;
    if (this.animTimer >= 200) {
      this.animTimer = 0;
      this.animFrame = (this.animFrame + 1) % 3;
    }
  },

  drawTile(ctx, tx, ty, key) {
    let k = key;
    if (k === 'hearth') k = 'hearth' + this.animFrame;
    const tile = _tc[k] || _tc['stone_floor'];
    ctx.drawImage(tile, tx * T, ty * T);
  },

  drawSprite(ctx, actor) {
    const x = actor.x * T + T / 2 | 0;
    const y = actor.y * T + T | 0;
    const f = actor.facing || 0;
    switch (actor.id) {
      case 'lance':  drawLance(ctx, x, y, f); break;
      case 'elena':  drawElena(ctx, x, y, f); break;
      case 'charlie': drawCharlie(ctx, x, y, f); break;
      case 'mayor':  drawMayor(ctx, x, y, f); break;
      case 'hank':   drawHank(ctx, x, y, f); break;
      case 'barsik': drawBarsik(ctx, x, y); break;
      case 'dragon': drawDragonMap(ctx, x, y, f); break;
      default:       drawNPC(ctx, x, y, actor.color); break;
    }
  },

  drawLanceBattle(ctx, x, y) {
    if (imgReady('sprite_lance')) {
      const c = _processed['sprite_lance'];
      const maxH = 100;
      const aspect = c.width / c.height;
      const h = maxH;
      const w = Math.round(h * aspect);
      ctx.drawImage(c, 0, 0, c.width, c.height, x - w / 2, y - h, w, h);
    } else {
      drawLance(ctx, x, y, 1);
    }
  },

  drawDragonBattle(ctx, x, y, phase) {
    const keys = ['sprite_dragon_p1', 'sprite_dragon_p2', 'sprite_dragon_p3'];
    const key = keys[Math.min(phase, 3) - 1];
    if (imgReady(key)) {
      const c = _processed[key];
      const maxW = 180;
      const aspect = c.height / c.width;
      const w = maxW;
      const h = Math.round(w * aspect);
      const dy = this.animFrame % 2 === 0 ? 0 : 1;
      ctx.drawImage(c, 0, 0, c.width, c.height, x - w / 2, y - h + dy, w, h);
    } else {
      drawDragonBattle(ctx, x, y, phase, this.animFrame);
    }
  },
};

window.ASSETS = ASSETS;
