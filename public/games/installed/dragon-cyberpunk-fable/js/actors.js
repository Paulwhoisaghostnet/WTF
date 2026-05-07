/**
 * Dragon — Player movement, map transition checks, NPC interaction.
 */
'use strict';

const Actors = {
  move(state, dx, dy) {
    if (!state.currentMap) return;
    const map = state.currentMap;
    const hero = map.actors.find(a => a.id === 'lance');
    if (!hero) return;

    const nx = hero.x + dx;
    const ny = hero.y + dy;
    const mw = (map.tiles[0] && map.tiles[0].length) || 20;
    const mh = map.tiles.length || 15;

    // Check map exits first (before collision)
    for (const exit of (map.exits || [])) {
      if (exit.rows.includes(ny) && exit.cols.includes(nx)) {
        state.pendingEvent = `exit:${exit.to}:${exit.toLandX}:${exit.toLandY}`;
        return;
      }
    }

    // Bounds check
    if (nx < 0 || nx >= mw || ny < 0 || ny >= mh) return;

    // Tile collision
    if (Maps.isSolid(map, nx, ny)) return;

    // Check NPC collision (can't walk through actors)
    const blocked = map.actors.some(a => a.id !== 'lance' && a.x === nx && a.y === ny && a.visible !== false);
    if (blocked) return;

    hero.x = nx;
    hero.y = ny;
    if (dx > 0) hero.facing = 0;
    if (dx < 0) hero.facing = 1;

    // Check per-tile triggers
    for (const tr of (map.triggers || [])) {
      if (tr.x === nx && tr.y === ny) {
        state.pendingEvent = tr.event;
        return;
      }
    }
  },

  interact(state) {
    if (!state.currentMap) return;
    const map = state.currentMap;
    const hero = map.actors.find(a => a.id === 'lance');
    if (!hero) return;

    // Check all 4 adjacent tiles for interactable actors
    const adjacent = [
      [hero.x, hero.y-1], [hero.x, hero.y+1],
      [hero.x-1, hero.y], [hero.x+1, hero.y],
    ];

    for (const [ax, ay] of adjacent) {
      const npc = map.actors.find(a => a.id !== 'lance' && a.x === ax && a.y === ay && a.visible !== false);
      if (npc) {
        state.pendingEvent = 'talk_' + npc.id;
        return;
      }
    }
  },
};

window.Actors = Actors;
