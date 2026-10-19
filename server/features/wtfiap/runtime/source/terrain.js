/* Static battlefield geometry. Coordinates use the engine's continuous tile
 * centers. These helpers prescribe no map, gate dimensions, or mode rules.
 * Movement expands axis-aligned walls by the actor's circular body radius.
 * The rectangular expansion is conservative at corners; exact tangency may
 * slide along a wall, while entering its expanded interior is forbidden.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ABTerrain = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Same numerical tolerance as the existing continuous-movement engine.
  const EPSILON = 1e-10;
  const point = value => ({ col: value.col, row: value.row });
  const distance = (a, b) => Math.hypot(a.col - b.col, a.row - b.row);
  const comparePoint = (a, b) => a.col - b.col || a.row - b.row;
  function walls(board, radius = 0, sight = false) {
    const source = (sight ? board.terrain?.sightWalls ?? board.terrain?.walls : board.terrain?.walls) || [];
    if (!Array.isArray(source)) throw new Error('Terrain walls must be an array.');
    if (!Number.isFinite(radius) || radius < 0) throw new Error('Body radius must be finite and nonnegative.');
    return source.map(wall => {
      if (!wall || !['minCol', 'maxCol', 'minRow', 'maxRow'].every(key => Number.isFinite(wall[key])) ||
          wall.minCol >= wall.maxCol || wall.minRow >= wall.maxRow) throw new Error('Terrain walls require finite rectangles with positive area.');
      return { minCol: wall.minCol - radius, maxCol: wall.maxCol + radius,
        minRow: wall.minRow - radius, maxRow: wall.maxRow + radius };
    });
  }
  function checkedPoint(value) {
    if (!value || !Number.isFinite(value.col) || !Number.isFinite(value.row)) throw new Error('Terrain points require finite coordinates.');
    return value;
  }
  function inside(value, wall) {
    return value.col > wall.minCol + EPSILON && value.col < wall.maxCol - EPSILON &&
      value.row > wall.minRow + EPSILON && value.row < wall.maxRow - EPSILON;
  }
  function segmentInterval(a, b, wall, interior) {
    let enter = -Infinity, leave = Infinity;
    for (const [axis, lower, upper] of [['col', 'minCol', 'maxCol'], ['row', 'minRow', 'maxRow']]) {
      const delta = b[axis] - a[axis], min = wall[lower], max = wall[upper];
      if (Math.abs(delta) <= EPSILON) {
        if (interior ? a[axis] <= min + EPSILON || a[axis] >= max - EPSILON
          : a[axis] < min - EPSILON || a[axis] > max + EPSILON) return null;
      } else {
        const first = (min - a[axis]) / delta, second = (max - a[axis]) / delta;
        enter = Math.max(enter, Math.min(first, second));
        leave = Math.min(leave, Math.max(first, second));
      }
    }
    const start = Math.max(0, enter), end = Math.min(1, leave);
    if (interior ? end - start <= EPSILON : end < start - EPSILON) return null;
    return { enter: start, leave: end };
  }
  function clearSight(board, a, b) {
    checkedPoint(a); checkedPoint(b);
    // A ray touching a wall is occluded. No body padding applies to sight.
    return walls(board, 0, true).every(wall => !segmentInterval(a, b, wall, false));
  }
  function clipMove(board, actor, end) {
    checkedPoint(actor); checkedPoint(end);
    let fraction = 1;
    for (const wall of walls(board, actor.radius ?? 0)) {
      const interval = segmentInterval(actor, end, wall, true);
      if (interval) fraction = Math.min(fraction, interval.enter);
    }
    return { col: actor.col + (end.col - actor.col) * fraction,
      row: actor.row + (end.row - actor.row) * fraction };
  }
  function route(board, actor, target) {
    checkedPoint(actor); checkedPoint(target);
    const padded = walls(board, actor.radius ?? 0);
    if (!padded.length) return [point(target)];
    const passable = (a, b) => padded.every(wall => !segmentInterval(a, b, wall, true));
    if (padded.some(wall => inside(actor, wall))) return null;
    const radius = actor.radius ?? 0;
    if (!Number.isInteger(board.columns) || board.columns < 1 || !Number.isInteger(board.rows) || board.rows < 1)
      throw new Error('Terrain routing requires positive integer board dimensions.');
    const bounds = { minCol: -0.5 + radius, maxCol: board.columns - 0.5 - radius,
      minRow: -0.5 + radius, maxRow: board.rows - 0.5 - radius };
    const onBoard = p => p.col >= bounds.minCol - EPSILON && p.col <= bounds.maxCol + EPSILON &&
      p.row >= bounds.minRow - EPSILON && p.row <= bounds.maxRow + EPSILON;
    if (!onBoard(actor)) return null;
    const targetStandable = onBoard(target) && !padded.some(wall => inside(target, wall));
    if (targetStandable && passable(actor, target)) return [point(target)];
    // An enemy's smaller body can legally stand closer to a wall or board edge
    // than this actor can. Its center need not be a valid destination: route
    // to a visible point within normal attack range instead. The target stays
    // the final sentinel so callers stop by their ordinary range/LOS check.
    const canApproach = Number.isFinite(actor.range) && actor.range >= 0;
    if (!targetStandable && !canApproach) return null;
    const firingPoint = from => {
      const length = distance(from, target), reach = length ? Math.min(1, actor.range / length) : 0;
      const destination = { col: target.col + (from.col - target.col) * reach,
        row: target.row + (from.row - target.row) * reach };
      return onBoard(destination) && !padded.some(wall => inside(destination, wall)) &&
        passable(from, destination) && clearSight(board, destination, target) ? destination : null;
    };
    const candidates = padded.flatMap(wall => [
      { col: wall.minCol, row: wall.minRow }, { col: wall.minCol, row: wall.maxRow },
      { col: wall.maxCol, row: wall.minRow }, { col: wall.maxCol, row: wall.maxRow }
    ]).filter(p => onBoard(p) && !padded.some(wall => inside(p, wall))).sort(comparePoint);
    const nodes = [point(actor), point(target)];
    for (const candidate of candidates) if (!nodes.some(node => distance(node, candidate) <= EPSILON)) nodes.push(candidate);
    const edges = nodes.map(() => []);
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) if (
      (targetStandable || (i !== 1 && j !== 1)) && passable(nodes[i], nodes[j])) {
      const length = distance(nodes[i], nodes[j]);
      edges[i].push({ index: j, length }); edges[j].push({ index: i, length });
    }
    if (!targetStandable) for (let i = 0; i < nodes.length; i++) if (i !== 1) {
      const approach = firingPoint(nodes[i]);
      if (approach) edges[i].push({ index: 1, length: distance(nodes[i], approach), approach });
    }
    const lengths = nodes.map(() => Infinity), previous = nodes.map(() => null), approaches = nodes.map(() => null),
      pending = new Set(nodes.map((_, index) => index));
    lengths[0] = 0;
    while (pending.size) {
      const current = [...pending].sort((a, b) => lengths[a] - lengths[b] || a - b)[0];
      if (!Number.isFinite(lengths[current])) return null;
      if (current === 1) {
        const path = [];
        for (let cursor = current; cursor !== 0; cursor = previous[cursor]) {
          path.unshift(point(nodes[cursor]));
          if (approaches[cursor] && distance(approaches[cursor], nodes[previous[cursor]]) > EPSILON) path.unshift(point(approaches[cursor]));
        }
        return path;
      }
      pending.delete(current);
      for (const edge of edges[current]) if (pending.has(edge.index)) {
        const length = lengths[current] + edge.length;
        if (length < lengths[edge.index] - EPSILON ||
          (Math.abs(length - lengths[edge.index]) <= EPSILON && (previous[edge.index] === null || current < previous[edge.index]))) {
          lengths[edge.index] = length; previous[edge.index] = current; approaches[edge.index] = edge.approach || null;
        }
      }
    }
    return null;
  }
  return Object.freeze({ clearSight, clipMove, route });
});
