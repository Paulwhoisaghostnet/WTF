/* Static treasure health reference shared by CommonJS and browsers.
 * The owner selected one unbuffed, base one-star entry per named hero; rank by
 * max HP ascending, then defense (the engine's armor stat) ascending. Exact
 * HP-and-armor ties share competition rank: 1 + count of strictly lower pairs.
 * Chest HP = roster mean max HP * (1 + highest fielded reference rank / 100).
 * No rounding, star scaling, formation bonuses or current combat HP enter here.
 *
 * The caller supplies the complete authoritative base roster, including Mime's
 * catalog stats rather than its copied combat stats, and the actual fielded
 * hero IDs. This pure calculation does not change hero stats, define chest
 * defenses, or verify that caller-supplied roster/formation data is authentic.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ABChestHealth = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const POLICY = 'base-one-star-hp-then-armor-competition-v1';
  class ChestHealthError extends Error {
    constructor(code, message) { super(message); this.name = 'ChestHealthError'; this.code = code; }
  }
  function demand(condition, code, message) { if (!condition) throw new ChestHealthError(code, message); }
  function record(value, fields, label) {
    demand(value !== null && typeof value === 'object' && !Array.isArray(value), 'INVALID_RECORD', label + ' must be an object.');
    demand(Object.keys(value).length === fields.length && fields.every(key => Object.prototype.hasOwnProperty.call(value, key)),
      'INVALID_FIELDS', label + ' must provide exactly: ' + fields.join(', ') + '.');
  }
  function identifier(value) {
    demand(typeof value === 'string' && value.trim().length > 0, 'INVALID_ID', 'Hero IDs must be nonempty strings.');
  }
  function frozen(value) {
    if (value && typeof value === 'object') { for (const child of Object.values(value)) frozen(child); Object.freeze(value); }
    return value;
  }
  function compare(a, b) {
    if (a.maxHp !== b.maxHp) return a.maxHp < b.maxHp ? -1 : 1;
    if (a.armor !== b.armor) return a.armor < b.armor ? -1 : 1;
    // IDs order the display only; an exact stat tie never gains a rank bonus.
    return a.id === b.id ? 0 : a.id < b.id ? -1 : 1;
  }
  function createReference(roster) {
    demand(Array.isArray(roster) && roster.length > 0, 'EMPTY_ROSTER', 'A complete nonempty base roster is required.');
    const ids = new Set();
    const heroes = Array.from(roster, hero => {
      record(hero, ['id', 'maxHp', 'armor'], 'Base hero'); identifier(hero.id);
      demand(!ids.has(hero.id), 'DUPLICATE_HERO', 'The base roster must contain each named hero once.');
      ids.add(hero.id);
      demand(typeof hero.maxHp === 'number' && Number.isFinite(hero.maxHp) && hero.maxHp > 0, 'INVALID_HP', 'Base max HP must be finite and positive.');
      demand(typeof hero.armor === 'number' && Number.isFinite(hero.armor), 'INVALID_ARMOR', 'Base armor must be finite.');
      return { id: hero.id, maxHp: hero.maxHp, armor: hero.armor };
    }).sort(compare);
    let sum = 0, rank = 0;
    heroes.forEach((hero, index) => {
      const previous = heroes[index - 1];
      if (!previous || hero.maxHp !== previous.maxHp || hero.armor !== previous.armor) rank = index + 1;
      hero.rank = rank; sum += hero.maxHp;
    });
    const averageMaxHp = sum / heroes.length;
    demand(Number.isFinite(averageMaxHp), 'ARITHMETIC_OVERFLOW', 'Roster mean cannot be represented as finite HP.');
    return frozen({ policy: POLICY, averageMaxHp, heroes });
  }
  function validateReference(reference) {
    record(reference, ['policy', 'averageMaxHp', 'heroes'], 'Chest-health reference');
    demand(reference.policy === POLICY, 'INVALID_POLICY', 'Reference must use the owner-selected static ranking policy.');
    demand(Array.isArray(reference.heroes), 'EMPTY_ROSTER', 'Reference heroes must be an array.');
    const expected = createReference(Array.from(reference.heroes, hero => {
      record(hero, ['id', 'maxHp', 'armor', 'rank'], 'Ranked base hero');
      return { id: hero.id, maxHp: hero.maxHp, armor: hero.armor };
    }));
    demand(reference.averageMaxHp === expected.averageMaxHp && reference.heroes.every((hero, index) =>
      hero.id === expected.heroes[index].id && hero.rank === expected.heroes[index].rank),
    'INVALID_REFERENCE', 'Mean, ranks and hero order must match the supplied base stats.');
    return true;
  }
  function calculateChestHealth(reference, fieldedHeroIds) {
    validateReference(reference);
    demand(Array.isArray(fieldedHeroIds) && fieldedHeroIds.length > 0, 'EMPTY_FIELD', 'A highest-ranked fielded hero requires a nonempty formation.');
    const byId = new Map(reference.heroes.map(hero => [hero.id, hero]));
    const fielded = [...new Set(Array.from(fieldedHeroIds, id => {
      identifier(id); demand(byId.has(id), 'UNKNOWN_HERO', 'Every fielded hero must appear in the base roster.'); return id;
    }))].map(id => byId.get(id));
    const anchorRank = Math.max(...fielded.map(hero => hero.rank));
    const anchors = fielded.filter(hero => hero.rank === anchorRank).sort(compare);
    const multiplier = 1 + anchorRank / 100;
    const maxHp = reference.averageMaxHp * multiplier;
    demand(Number.isFinite(maxHp), 'ARITHMETIC_OVERFLOW', 'Chest HP cannot be represented as finite HP.');
    return frozen({ rosterCount: reference.heroes.length, averageMaxHp: reference.averageMaxHp,
      anchorHeroIds: anchors.map(hero => hero.id), anchorMaxHp: anchors[0].maxHp, anchorArmor: anchors[0].armor,
      anchorRank, multiplier, maxHp });
  }
  return Object.freeze({ POLICY, ChestHealthError, createReference, validateReference, calculateChestHealth });
});
