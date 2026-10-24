/* coLILseum item economy. The eight component pairings follow the current
 * TFT recipe grid; names and presentation belong to this game's cast.
 * Randomness is seeded by the authoritative match, never by a browser.
 */
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./item-values.cjs'));
  else root.ABItems = factory(root.ABItemValues);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (VALUES) {
  'use strict';
  // Pinned TFT Set 17's 64 fieldable 1–5-cost heroes average 839.84375 HP
  // and 67.126984 mana. This game's 50 one-star heroes average 162.6656 HP
  // and use a three-point cast budget. Preserve each flat item's share of a
  // typical hero rather than importing raw TFT units into this combat scale.
  const HEALTH_SCALE = 162.6656 / 839.84375;
  const MANA_SCALE = 3 / 67.12698412698413;
  const COMPONENTS = Object.freeze([
    { id: 'forgeblade', name: 'Forgeblade', glyph: '⚔', stat: 'attack', amount: .10, description: 'Increases normal attack damage.' },
    { id: 'quickstring', name: 'Quickstring', glyph: '➶', stat: 'speed', amount: .10, description: 'Increases attack and movement speed.' },
    { id: 'spellglass', name: 'Spellglass', glyph: '✧', stat: 'abilityScore', amount: 10, description: 'Increases damaging, healing and shielding spell power.' },
    { id: 'mana-vial', name: 'Mana Vial', glyph: '◈', stat: 'abilityRegen', amount: MANA_SCALE, description: 'Increases ability-point regeneration.' },
    { id: 'iron-plate', name: 'Iron Plate', glyph: '⬡', stat: 'armor', amount: 20, description: 'Increases physical defense.' },
    { id: 'veil-cloth', name: 'Veil Cloth', glyph: '◐', stat: 'magicResist', amount: 20, description: 'Increases magical defense.' },
    { id: 'vital-sash', name: 'Vital Sash', glyph: '✚', stat: 'maxHp', amount: 150 * HEALTH_SCALE, description: 'Increases maximum health.' },
    { id: 'lucky-grips', name: 'Lucky Grips', glyph: '✥', stat: 'critChance', amount: .20, description: 'Increases critical-hit chance.' }
  ]);
  // Upper triangle of the 8×8 recipe grid; order matches COMPONENTS.
  const RECIPE_NAMES = Object.freeze([
    ['Stillblade', 'Giantbreaker', 'Mender’s Fang', 'Soul Lance', 'Nightward', 'Blood Oath', 'Last Stand', 'True Edge'],
    ['Tempo Loom', 'Rift Sight', 'Focus String', 'Titan Coil', 'Undertow', 'Surge Quiver', 'Piercing Whisper'],
    ['Grand Sigil', 'Ascending Star', 'Crown Ward', 'Storm Prism', 'Blight Codex', 'Prism Glove'],
    ['Deep Reserve', 'Oath Shield', 'Adaptive Mantle', 'Living Vessel', 'Fortune Hand'],
    ['Thorn Bastion', 'Stone Mantle', 'Sun Mantle', 'Stonebound Heart'],
    ['Wyrm Mantle', 'Dusk Veil', 'Mercury Step'],
    ['Mountain Heart', 'Rally Grip'],
    ['Trickster Mitts']
  ]);
  const RECIPE_EFFECTS = Object.freeze([
    ['Increases attack and damage.', 'Deals extra damage to tanks.', 'Steals health and heals a wounded ally.', 'Basic attacks restore ability points.', 'At low health, briefly escapes targeting and heals.', 'Steals health and shields at low health.', 'Creates a shield at low health.', 'Raises critical-hit chance.'],
    ['Attacks and abilities burn and wound enemies.', 'Gains stacking attack speed over time.', 'Damage shreds magic defense.', 'Builds attack and spell power by fighting.', 'Attacks build damage and speed.', 'Attacks restore ability points, especially on a critical hit.', 'Damage reduces enemy armor.'],
    ['Raises spell power and damage.', 'Spell power grows during combat.', 'Starts shielded, then gains spell power.', 'Nearby enemies lose magic defense and take damage when casting.', 'Damage burns and wounds enemies.', 'Abilities can critically strike.'],
    ['Raises attack, spell power and ability regeneration.', 'Starts with ability points and shields at low health.', 'Frontline gains defenses; backline gains damage.', 'Regenerates missing health over time.', 'Grants attack, spell power and health stealing.'],
    ['Reduces basic attack damage and retaliates nearby.', 'Gains defenses for enemies targeting the holder.', 'Burns and wounds a nearby enemy repeatedly.', 'Reduces incoming damage, especially while healthy.'],
    ['Restores health over time and resists magic.', 'Weakens armor of nearby enemies.', 'Starts protected from control and gains speed.'],
    ['Greatly increases maximum health.', 'Critical strikes build damage.'],
    ['Occupies all item slots and draws two completed items each combat.']
  ]);
  const RECIPES = Object.freeze(RECIPE_NAMES.flatMap((row, left) => row.map((name, offset) => {
    const right = left + offset, a = COMPONENTS[left].id, b = COMPONENTS[right].id;
    return Object.freeze({ id: a + '+' + b, name, description: RECIPE_EFFECTS[left][offset], components: [a, b], kind: 'completed' });
  })));
  const byId = Object.freeze(Object.fromEntries([...COMPONENTS, ...RECIPES].map(item => [item.id, item])));
  const componentIds = Object.freeze(COMPONENTS.map(item => item.id));
  const recipe = (a, b) => RECIPES.find(item => item.components.includes(a) && item.components.includes(b) &&
    (a !== b || item.components[0] === item.components[1])) || null;
  const isComponent = id => componentIds.includes(id);
  const isItem = id => Boolean(byId[id]);
  const item = id => byId[id] || null;
  function statsFor(ids) {
    const stats = { attackRatio: 0, speedRatio: 0, abilityPower: 0, manaRegen: 0,
      armor: 0, magicResist: 0, health: 0, healthRatio: 0, critChance: 0, damageAmp: 0, range: 0 };
    for (const id of ids || []) {
      if (!isItem(id)) throw new Error('Unknown equipped item.');
      const component = COMPONENTS.find(entry => entry.id === id);
      if (component) {
        if (component.stat === 'attack') stats.attackRatio += component.amount;
        else if (component.stat === 'speed') stats.speedRatio += component.amount;
        else if (component.stat === 'abilityScore') stats.abilityPower += component.amount;
        else stats[component.stat === 'maxHp' ? 'health' : component.stat === 'abilityRegen' ? 'manaRegen' : component.stat] += component.amount;
      } else {
        const value = VALUES[id];
        stats.attackRatio += value.AD || 0;
        stats.attackRatio += (value.AD_NotStatBar || 0) + (value.ModifiedADAP || 0);
        stats.speedRatio += (value.AS || 0) / 100;
        stats.abilityPower += value.AP || 0;
        stats.abilityPower += (value.AP_NotStatBar || 0) + (value.ModifiedADAP || 0) * 100;
        stats.manaRegen += (value.ManaRegen || 0) * MANA_SCALE;
        stats.armor += value.Armor || 0;
        stats.magicResist += value.MagicResist || 0;
        stats.health += (value.Health || 0) * HEALTH_SCALE;
        stats.healthRatio += (value.BonusPercentHP || 0) + (value.PercentMaxHP || 0);
        stats.critChance += (value.CritChance || 0) / 100;
        stats.damageAmp += (value.BonusDamage || 0);
        stats.range += value.HexRangeIncrease || 0;
      }
    }
    return stats;
  }
  const itemShopRound = round => Number.isSafeInteger(round) && round > 0 && round % 5 === 0;
  const itemChestRound = round => Number.isSafeInteger(round) && round > 0 && round % 10 === 0;
  const dropChance = (outcome, previousStreak) => {
    if (!Number.isSafeInteger(previousStreak) || previousStreak < 0) throw new Error('Use the prior consecutive result count.');
    return outcome === 'win' ? Math.min(1, .25 + previousStreak * .01)
      : outcome === 'loss' ? Math.min(1, .05 + previousStreak * .05) : 0;
  };
  function reward({ outcome, previousStreak, random }) {
    if (typeof random !== 'function') throw new Error('An authoritative random stream is required.');
    const chance = dropChance(outcome, previousStreak), roll = random();
    if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error('Random roll must be in [0, 1).');
    return { chance, roll, itemId: roll < chance ? componentIds[Math.floor(random() * componentIds.length)] : null };
  }
  function shop({ random }) {
    if (typeof random !== 'function') throw new Error('An authoritative random stream is required.');
    const roll = random(), completed = roll < .05 ? RECIPES[Math.floor(random() * RECIPES.length)] : null;
    return { componentIds: [...componentIds], completedId: completed?.id || null, completedRoll: roll };
  }
  return Object.freeze({ COMPONENTS, RECIPES, VALUES, HEALTH_SCALE, MANA_SCALE, componentIds, item, isItem, isComponent, recipe, statsFor,
    itemShopRound, itemChestRound, dropChance, reward, shop, COMPONENT_PRICE: 5, COMPLETED_PRICE: 10 });
});
