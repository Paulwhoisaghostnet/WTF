/* Original prototype rules and balance coefficients, not researched TFT balance.
 * Allocation limits and three-copy star evolution come from the artist's brief.
 * Hero cost is intrinsic, independent of stars, and never consumes extra slots.
 * The authored faction compositions span the researched 1–5 cost vocabulary.
 * Each cost above one adds 18% base HP/attack/ability score and 12% ability potency; these
 * authored prototype coefficients express quality, not a claim of TFT balance.
 * Cost and stars are independently weighted. Each cost step is three times
 * rarer; each star step is nine times rarer. These authored rarity ratios use
 * the three-copy evolution vocabulary (three, and three squared), not TFT odds.
 * The user-specified board is 5×5: two deployment rows per side, one neutral row.
 * A unique-hero pair is the smallest possible 'played together' synergy.
 * Factions advance at size-aware milestones; classes advance in complete pairs.
 * Duplicate copies never add trait power.
 * Every basic attack adds one permanent pressure point to basic attack damage. This explicit
 * attrition rule ensures that finite healing/shielding cannot stall combat forever.
 */
(function (root) {
  'use strict';

  const CATALOG = typeof module !== 'undefined' && module.exports ? require('./hero-catalog.js') : root.ABHeroCatalog;
  if (!CATALOG) throw new Error('Hero identity catalog is required.');
  const TERRAIN = typeof module !== 'undefined' && module.exports ? require('./terrain.js') : root.ABTerrain;
  const ZONES = typeof module !== 'undefined' && module.exports ? require('./zones.js') : root.ABZones;
  const ITEMS = typeof module !== 'undefined' && module.exports ? require('../game/core/items.cjs') : root.ABItems;
  // New balance revisions are opt-in per match. A saved room with no revision
  // keeps the exact stats it started with, including after a server restart.
  const BALANCE_ADJUSTMENTS = Object.freeze({"tide-mender":{"ability":0.969823},"verdant-mender":{"ability":1.031119},"astral-mender":{"ability":1.18},"silk-luneth":{"ability":0.847458},"ember-duelist":{"attack":0.980577},"verdant-duelist":{"attack":1.001151},"ember-vikka":{"attack":1.052691},"silk-thimri":{"attack":1.001612},"verdant-hexbinder":{"ability":1.152542},"ember-sazrik":{"ability":0.848386},"tide-arcanist":{"ability":0.867647},"gargoyle-kharvox":{"ability":1.132353},"hollow-duelist":{"attack":1.132353},"dune-duelist":{"attack":0.867647},"hollow-artificer":{"ability":1.132353},"iron-artificer":{"ability":0.867647},"iron-hexbinder":{"ability":1.105281},"silk-vespera":{"ability":0.904739},"tide-hexbinder":{"ability":0.965918},"iron-vanguard":{"ability":1.116883},"ember-drazhul":{"ability":0.883117},"rime-boruun":{"ability":1.035289},"astral-sentinel":{"ability":0.91786},"silk-orruma":{"ability":1.089491},"ember-ranger":{"attack":1.04907},"dune-ranger":{"attack":0.953225},"dune-mender":{"ability":1.116883},"ember-aereth":{"ability":0.895349},"ember-stormcaller":{"ability":0.895349},"astral-stormcaller":{"ability":1.116883}});
  // Final comparison against full eight-commander tournaments exposed team
  // ability outliers left by the ten stat passes. Keep this revision pinned to
  // new matches so serialized older rooms retain their authored actions.
  const BALANCE_ACTION_ADJUSTMENTS = Object.freeze({
    'ember-ranger': { 0: { factor: 1.2 } },
    'ember-drazhul': { 0: { factor: 0.95 } },
    'iron-vanguard': { 2: { factor: 1.9 } }
  });
  const hasItem = (unit, id) => unit.itemIds?.includes(id) || false;
  const itemValue = (id, key) => ITEMS.VALUES[id]?.[key] || 0;
  const clearSight = (game, a, b) => !game.board.terrain || TERRAIN.clearSight(game.board, a, b);

  const DEFAULT_CONFIG = Object.freeze({
    playerLevelMin: 1, playerLevelMax: 10, heroLevelMin: 1, heroLevelMax: 3,
    benchMin: 1, benchMax: 10, benchCapacity: 10
  });
  const FACTIONS = [
    { id: 'ember', name: 'Ember Court', color: '#f09566', glyph: '✦', description: '+12% attack per companion; spells deal extra fire damage.' },
    { id: 'tide', name: 'Tidemarked', color: '#70cfda', glyph: '≈', description: 'Start with an 18% health shield per companion.' },
    { id: 'verdant', name: 'Verdant Choir', color: '#a9cc76', glyph: '❧', description: '+18% health per companion.' },
    { id: 'hollow', name: 'Hollow Assembly', color: '#b3a0dd', glyph: '◈', description: '+8% Speed and 8% lifesteal per companion.' },
    { id: 'iron', name: 'Iron Covenant', color: '#a3b9c9', glyph: '⬢', description: '+8 armor per companion.' },
    { id: 'astral', name: 'Astral Accord', color: '#c2b1f0', glyph: '✶', description: '+25% spell power and healing power per companion.' },
    { id: 'dune', name: 'Duneborn', color: '#dfbd71', glyph: '◇', description: '+1 attack range and +12% attack per companion.' },
    { id: 'silk', name: 'Silken Court', color: '#d8a9cb', glyph: '⋈', description: '+18% shield power and +12% buff strength per companion.' },
    { id: 'rime', name: 'Rimeclaw', color: '#b9e1eb', glyph: '❄', description: '+8 armor and +25% debuff strength per companion.' },
    { id: 'gargoyle', name: 'Gargoyle Compact', color: '#b6b6ab', glyph: '▲', description: '+18% health and +30% shield power per companion.' }
  ];
  const ARCHETYPES = [
    { id: 'tank', name: 'Tank', description: 'High defense and aggro control; low, steady damage draws attention away from allies.' },
    { id: 'blaster', name: 'Blaster', description: 'Fast, high damage with fragile defenses; pressure enemies before they can retaliate.' },
    { id: 'healer', name: 'Healer', description: 'Restore ally health and apply supportive buffs.' },
    { id: 'executioner', name: 'Sharpshooter / Executioner', description: 'Slower attacks concentrate damage into a single enemy.' },
    { id: 'cooler', name: 'Cooler', description: 'Damage over time, debuffs, and negative effects disrupt enemy units.' }
  ];
  const CLASSES = [
    { id: 'vanguard', name: 'Vanguard', primaryArchetype: 'tank', secondaryArchetype: 'cooler', combatStyle: 'melee', color: '#dcc69f', glyph: '⬟', description: '+8 armor per companion. Challenge taunts and slows nearby enemies.', stats: { hp: 165, attack: 17, armor: 24, range: 1, attackInterval: 1.1 } },
    { id: 'sentinel', name: 'Sentinel', primaryArchetype: 'tank', secondaryArchetype: 'healer', combatStyle: 'ranged', color: '#b7d5d0', glyph: '▣', description: '+18% health per companion. Guard Beacon draws fire and restores an ally.', stats: { hp: 155, attack: 16, armor: 20, range: 2, attackInterval: 1.15 } },
    { id: 'arcanist', name: 'Arcanist', primaryArchetype: 'blaster', secondaryArchetype: null, combatStyle: 'ranged', color: '#b9ade9', glyph: '✧', description: '+25% spell power per companion. Rapid Arc Bursts splash around the target.', stats: { hp: 82, attack: 26, armor: 2, range: 2, attackInterval: 0.65 } },
    { id: 'duelist', name: 'Duelist', primaryArchetype: 'blaster', secondaryArchetype: null, combatStyle: 'melee', color: '#efb498', glyph: '⚔', description: '+12% attack per companion. Fast twin strikes trade defense for damage.', stats: { hp: 90, attack: 25, armor: 3, range: 1, attackInterval: 0.55 } },
    { id: 'mender', name: 'Mender', primaryArchetype: 'healer', secondaryArchetype: null, combatStyle: 'ranged', color: '#add5ba', glyph: '✚', description: '+30% healing per companion. Renewal restores health and grants haste.', stats: { hp: 112, attack: 18, armor: 7, range: 2, attackInterval: 1 } },
    { id: 'artificer', name: 'Artificer', primaryArchetype: 'healer', secondaryArchetype: 'blaster', combatStyle: 'ranged', color: '#e2c38f', glyph: '⚙', description: '+30% healing and buff strength per companion. Field Repair restores and empowers an ally.', stats: { hp: 120, attack: 20, armor: 9, range: 2, attackInterval: 1.05 } },
    { id: 'ranger', name: 'Ranger', primaryArchetype: 'executioner', secondaryArchetype: null, combatStyle: 'ranged', color: '#e6b88a', glyph: '➶', description: '+12% attack per companion. Deliberate shots deliver concentrated damage.', stats: { hp: 95, attack: 39, armor: 4, range: 3, attackInterval: 1.45 } },
    { id: 'assassin', name: 'Assassin', primaryArchetype: 'executioner', secondaryArchetype: 'cooler', combatStyle: 'melee', color: '#caacd6', glyph: '⌁', description: '+25% armor penetration strength per companion. Backstab weakens the most vulnerable enemy.', stats: { hp: 98, attack: 40, armor: 5, range: 1, attackInterval: 1.5 } },
    { id: 'stormcaller', name: 'Stormcaller', primaryArchetype: 'cooler', secondaryArchetype: 'blaster', combatStyle: 'ranged', color: '#a6c9ed', glyph: 'ϟ', description: '+1 attack range per companion. Static Storm burns and slows a line of enemies.', stats: { hp: 108, attack: 20, armor: 6, range: 2, attackInterval: 1.05 } },
    { id: 'hexbinder', name: 'Hexbinder', primaryArchetype: 'cooler', secondaryArchetype: 'healer', combatStyle: 'melee', color: '#c7a2cb', glyph: '⌘', description: '+25% debuff and healing strength per companion. Siphon Hex weakens enemies and restores allies.', stats: { hp: 128, attack: 18, armor: 10, range: 1, attackInterval: 1.1 } }
  ];
  // Migration values preserve each class's previously authored neutral cadence.
  // They are independent stats, never recalculated from attack or Speed in combat.
  // Profile regen records the class migration reference, not a hero's runtime
  // rate: each hero has its own explicit catalog rate. Primary healer ability
  // score uses one third of their authored HP, the standard three-AP cast budget.
  const ABILITY_PROFILES = Object.freeze({
    vanguard: { id: 'vanguard', name: 'Stand Fast', trigger: 'self-damage', regen: 1 / 1.1, description: 'Regenerate over time and gain AP from health damage or shield absorption while holding the frontline.' },
    sentinel: { id: 'sentinel', name: 'Watchful Guard', trigger: 'ally-pressure', regen: 1 / 1.15, description: 'Regenerate over time and gain AP when nearby other allies lose health or absorb damage with shields.' },
    arcanist: { id: 'arcanist', name: 'Arcane Feedback', trigger: 'ability-damage', regen: 1 / 0.65, description: 'Regenerate over time and gain additional AP from direct ability damage. Normal attacks and damage over time do not trigger arcane feedback.' },
    duelist: { id: 'duelist', name: 'Blade Rhythm', trigger: 'basic-damage', regen: 1 / 0.55, description: 'Regenerate over time and gain AP in proportion to damage dealt by normal attacks.' },
    mender: { id: 'mender', name: 'Empathy', trigger: 'ally-health-damage', regen: 1, description: 'Regenerate over time and gain AP when you or nearby allies suffer actual health damage.' },
    artificer: { id: 'artificer', name: 'Battlefield Feedback', trigger: 'ally-damage-dealt', regen: 1, description: 'Regenerate over time and gain AP when nearby other allies deal damage. Your own attacks do not power repairs.' },
    ranger: { id: 'ranger', name: 'Distant Focus', trigger: 'distant-damage', regen: 1 / 1.45, description: 'Regenerate over time and gain AP from damage dealt to enemies beyond normal melee reach.' },
    assassin: { id: 'assassin', name: 'Exploit Vulnerability', trigger: 'wounded-damage', regen: 1 / 1.5, description: 'Regenerate over time and gain AP from damage to wounded enemies, weighted by their missing-health fraction.' },
    stormcaller: { id: 'stormcaller', name: 'Lingering Storm', trigger: 'dot-damage', regen: 1 / 1.05, description: 'Regenerate over time and gain AP from damage dealt by your lingering burns and storms.' },
    hexbinder: { id: 'hexbinder', name: 'Hex Resonance', trigger: 'hex-damage', regen: 1 / 1.1, description: 'Regenerate over time and gain AP when allies damage enemies affected by your burn, slow or weakness.' }
  });
  const PROFILE_SUMMARIES = {
    vanguard: 'Time + damage to your health or shields.', sentinel: 'Time + nearby allies taking health or shield damage.',
    arcanist: 'Time + direct ability damage; normal attacks and damage over time grant no extra AP.', duelist: 'Time + normal attack damage dealt.',
    mender: 'Time + health damage to you or nearby allies.', artificer: 'Time + damage dealt by nearby other allies.',
    ranger: 'Time + damage dealt beyond melee reach.', assassin: 'Time + damage to wounded foes; deeper wounds grant more AP.',
    stormcaller: 'Time + your damage over time.', hexbinder: 'Time + allied damage to foes carrying your hexes.'
  };
  Object.values(ABILITY_PROFILES).forEach(profile => { profile.summary = PROFILE_SUMMARIES[profile.id]; Object.freeze(profile); });
  CLASSES.forEach(role => {
    role.abilityProfile = ABILITY_PROFILES[role.id];
    role.stats.speed = 1 / role.stats.attackInterval;
    role.stats.abilityScore = role.primaryArchetype === 'healer' ? role.stats.hp / 3 : role.stats.attack;
    role.stats.abilityRegen = role.abilityProfile.regen;
    role.stats.abilityRange = role.stats.range;
    role.stats.normalAttack = role.primaryArchetype === 'healer' ? 'spellburst' : role.combatStyle;
  });
  const CLASS_SUMMARIES = {
    vanguard: 'A sturdy melee defender who draws attacks and slows enemies.',
    sentinel: 'A ranged guardian who draws fire and restores wounded allies.',
    arcanist: 'A fragile ranged caster who rapidly blasts clustered enemies.',
    duelist: 'A fragile melee attacker who overwhelms with rapid twin strikes.',
    mender: 'A ranged support who restores health and quickens an ally.',
    artificer: 'A ranged support who repairs allies, boosts attack and fires low-damage spellbursts.',
    ranger: 'A deliberate ranged attacker with powerful single-target shots.',
    assassin: 'A melee finisher who concentrates damage and weakens a vulnerable foe.',
    stormcaller: 'A ranged controller whose storms burn and slow enemy lines.',
    hexbinder: 'A melee controller who drains foes with weakening, healing hexes.'
  };
  const CLASS_TRAITS = {
    vanguard: '+8 armor per companion.', sentinel: '+18% health per companion.',
    arcanist: '+25% spell power per companion.', duelist: '+12% attack per companion.',
    mender: '+30% healing per companion.', artificer: '+30% healing and buff strength per companion.',
    ranger: '+12% attack per companion.', assassin: '+25% armor penetration strength per companion.',
    stormcaller: '+1 attack range per companion.', hexbinder: '+25% debuff and healing strength per companion.'
  };
  CLASSES.forEach(role => { role.summary = CLASS_SUMMARIES[role.id]; role.description = CLASS_TRAITS[role.id]; });
  const FACTION_STRATEGIES = {
    ember: 'A deep drakekin roster can build around Brakka and Korrun’s protection, Pik and Aereth’s support, or varied fire, venom and burst damage. Choose a formation within the level budget; each distinct drakekin strengthens attack and fire spells.',
    tide: 'Opening shields protect a healing-and-control formation. Shell Aegis draws fire while Pearl Oracle and Brine Harrier attack behind Undertow Binder’s weakening hexes.',
    verdant: 'Growing health supports a durable melee core. Bloom Weaver and Root Hexer sustain Thorn Sentinel while Petal Blade and Nettle Shade finish weakened targets.',
    hollow: 'Speed and lifesteal reward sustained pressure. Crypt Paladin draws fire, Clockwork Mourner repairs the group, and the duelists and casters exploit that time.',
    iron: 'Armor and cast shields protect deliberate frontline advances. Iron Prefect guards Runic Smith and Bolt Warden while Brass Architect and Rust Binder sustain the line.',
    astral: 'Spell and healing power amplify a balanced spell formation. Moonward Giant protects Dawn Healer, Orbit Sage and Nebula Caller; Night Comet concentrates the finishing blow.',
    dune: 'Extra range and attack help spread the formation and reach priority targets. Sand Marshal holds attention while Oasis Keeper supports Sirocco Blade, Dust Hunter and Thunder Nomad.',
    silk: 'Luneth and Orruma weave shields around the formation while Thimri empowers nearby allies and Vespera disrupts a cluster. Shared silk strengthens shields and supportive buffs.',
    rime: 'Boruun draws attacks while Urvek restores nearby allies and Soryn suppresses dangerous targets. Thick hides add armor and winter magic strengthens slows and weakness.',
    gargoyle: 'Kharvox fractures enemy formations while Elyra draws fire and shelters allies. Fielding both living statues strengthens their health and protective stone shields.'
  };
  FACTIONS.forEach(faction => { faction.strategy = FACTION_STRATEGIES[faction.id]; Object.assign(faction, CATALOG.factions[faction.id]); });
  // Membership and cost are explicit hero data. A faction can contain different
  // team sizes and several heroes sharing a primary class; IDs are opaque keys.
  const ROSTER = CATALOG.heroes.filter(identity => identity.id !== 'mime').map(identity => {
    const id = identity.id, faction = FACTIONS.find(item => item.id === identity.faction);
    const role = CLASSES.find(item => item.id === identity.primaryClass), cost = identity.cost;
    if (!faction || !role || !Number.isInteger(cost) || cost < 1 || cost > 5) throw new Error('Invalid hero membership or cost: ' + id);
    if (!Number.isFinite(identity.abilityRegen) || identity.abilityRegen <= 0) throw new Error('Hero requires an authored positive base AP regeneration rate: ' + id);
    const primaryClass = role.id, secondaryClass = identity.secondaryClass ?? null;
    const classes = [...new Set([primaryClass, secondaryClass].filter(Boolean))];
    const quality = 1 + (cost - 1) * 0.18;
    const potency = 1 + (cost - 1) * 0.12;
    return {
      id, name: identity.name, title: identity.title, species: identity.species, cost,
      faction: faction.id, primaryClass, secondaryClass, classes,
      class: primaryClass, color: faction.color, glyph: role.glyph,
      ability: {
        ...identity.ability, actions: identity.ability.actions.map(action => ({ ...action })), potency,
        description: identity.ability.description.replace(/(\d+)%/g, (_, percent) => Number((Number(percent) * potency).toFixed(1)) + '%').replace(/% attack/g, '% ability score') + ' Ability cost: ' + (identity.ability.manaCost ?? 3) + ' AP.'
      },
      stats: { ...role.stats, hp: role.stats.hp * quality, attack: role.stats.attack * quality, abilityScore: role.stats.abilityScore * quality, abilityRegen: identity.abilityRegen }
    };
  });
  const mimeIdentity = CATALOG.heroes.find(hero => hero.id === 'mime');
  ROSTER.push({
    id: 'mime', name: mimeIdentity?.name || 'The Mime', title: mimeIdentity?.title || 'The Mime', species: mimeIdentity?.species || 'Independent performer', cost: 5,
    faction: null, primaryClass: null, secondaryClass: null, classes: [], class: null, color: '#eee9e1', glyph: '◇',
    ability: { id: 'mime-mimicry', name: 'Mimicry', potency: 1.48, description: 'At battle start, copy one random fielded non-Mime ally’s ability, AP profile and final combat stats; beneficial stats including Speed, ability score and AP regeneration become 1.25×. Remain independent. Alone, Pantomime strikes for 177.6% ability score.' },
    stats: { hp: 118 * 1.72, attack: 22 * 1.72, armor: 8, range: 2, speed: 1, attackInterval: 1, abilityScore: 22 * 1.72, abilityRegen: mimeIdentity.abilityRegen, abilityRange: 2, normalAttack: 'ranged' }
  });
  if (new Set(ROSTER.map(hero => hero.stats.abilityRegen)).size !== ROSTER.length) throw new Error('Every hero must have a distinct base AP regeneration rate.');
  const FACTION_BEHAVIORS = {
    ember: { name: 'Living Fire', base: 'Casts burn the primary target.', full: 'Full court: casts burn the entire target row.' },
    tide: { name: 'Shared Refuge', base: 'Casts shield the most wounded ally.', full: 'Full reef: cast shields reach every ally.' },
    verdant: { name: 'Renewal', base: 'Casts restore the most wounded ally.', full: 'Full choir: a fallen member restores surviving allies.' },
    hollow: { name: 'Soul Harvest', base: 'Damage restores the attacker through lifesteal.', full: 'Full assembly: enemy defeats grant members temporary haste.' },
    iron: { name: 'Reactive Plating', base: 'Casts shield the caster.', full: 'Full covenant: absorbed hits reflect 12% damage, without reflecting again.' },
    astral: { name: 'Ability Conduit', base: 'Casts give one AP to another ally.', full: 'Full accord: casts share one AP across other allies.' },
    dune: { name: 'Scouring Sand', base: 'Casts slow the primary target.', full: 'Full caravan: casts also weaken the target row.' },
    silk: { name: 'Cocoon Weave', base: 'Healing weaves 18% of restored health into a shield.', full: 'Full court: healing also grants temporary haste.' },
    rime: { name: 'Chill and Shatter', base: 'Basic attacks slow their target.', full: 'Full pack: basic attacks shatter already-slowed targets for extra damage.' },
    gargoyle: { name: 'Stone Covenant', base: 'The pair opens combat by shielding the nearest ally of each statue.', full: 'Pair: each statue shields its nearest ally for 18% of its maximum health once at combat start.' }
  };
  function factionMilestoneText(id, stage, complete) {
    const descriptions = {
      ember: '+' + (12 * stage) + '% attack; spells gain ' + (5 * stage) + ' fire damage per star. Casts burn ' + (complete ? 'the target row.' : 'the target.'),
      tide: 'Start with a ' + (18 * stage) + '% health shield. Casts shield ' + (complete ? 'every ally' : 'the most wounded ally') + ' for ' + (4 * stage) + ' per star.',
      verdant: '+' + (18 * stage) + '% health. Casts heal a wounded ally for ' + (8 * stage) + ' per star.' + (complete ? ' Fallen members also heal surviving allies.' : ''),
      hollow: '+' + (8 * stage) + '% Speed and lifesteal.' + (complete ? ' Enemy defeats grant members temporary haste.' : ' Damage restores the attacker.'),
      iron: '+' + (8 * stage) + ' armor. Casts grant a ' + (4 * stage) + '-per-star self-shield.' + (complete ? ' Absorbed damage reflects 12% once.' : ''),
      astral: '+' + (25 * stage) + '% spell and healing power. Casts give one AP to ' + (complete ? 'other allies, shared between them.' : 'another ally.'),
      dune: '+' + stage + ' range and +' + (12 * stage) + '% attack. Casts slow the target' + (complete ? ' and weaken its row.' : '.'),
      silk: '+' + (18 * stage) + '% shield power; +' + (12 * stage) + '% buff strength. Healing adds an 18% restored-health shield' + (complete ? ' and haste.' : '.'),
      rime: '+' + (8 * stage) + ' armor; +' + (25 * stage) + '% debuff strength. Basics slow' + (complete ? ' and shatter slowed foes for 8 damage per star.' : ' their target.'),
      gargoyle: '+' + (18 * stage) + '% health; +' + (30 * stage) + '% shield power. Each statue opens with an 18%-max-health shield for its nearest ally.'
    };
    return descriptions[id];
  }
  function classMilestoneText(id, stage) {
    return {
      vanguard: '+' + (8 * stage) + ' armor.', sentinel: '+' + (18 * stage) + '% health.',
      arcanist: '+' + (25 * stage) + '% spell power.', duelist: '+' + (12 * stage) + '% attack.',
      mender: '+' + (30 * stage) + '% healing.', artificer: '+' + (30 * stage) + '% healing and buff strength.',
      ranger: '+' + (12 * stage) + '% attack.', assassin: '+' + (25 * stage) + '% armor penetration strength.',
      stormcaller: '+' + stage + ' attack range.', hexbinder: '+' + (25 * stage) + '% debuff and healing strength.'
    }[id];
  }
  for (const faction of FACTIONS) {
    const size = ROSTER.filter(hero => hero.faction === faction.id).length;
    const thresholds = [...new Set([2, Math.ceil(size / 2), size])].filter(count => count >= 2 && count <= size).sort((a, b) => a - b);
    const behavior = FACTION_BEHAVIORS[faction.id];
    faction.rosterSize = size; faction.behavior = behavior.name;
    faction.description = faction.description.replaceAll('per companion', 'per milestone stage');
    faction.milestones = thresholds.map((count, index) => ({
      count, power: index + 1,
      description: factionMilestoneText(faction.id, index + 1, count === size)
    }));
  }
  for (const role of CLASSES) {
    role.rosterSize = ROSTER.filter(hero => hero.classes.includes(role.id)).length;
    role.description = role.description.replaceAll('per companion', 'per milestone stage');
    role.milestones = Array.from({ length: Math.floor(Math.min(role.rosterSize, DEFAULT_CONFIG.playerLevelMax) / 2) }, (_, index) => ({
      count: (index + 1) * 2, power: index + 1,
      description: classMilestoneText(role.id, index + 1)
    }));
  }
  const HEROES = Object.fromEntries(ROSTER.map(hero => [hero.id, hero]));
  const clone = value => JSON.parse(JSON.stringify(value));
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  freeze(FACTIONS); freeze(ARCHETYPES); freeze(CLASSES); freeze(ROSTER);
  // Choose a cost tier before its hero so faction/roster sizes cannot silently
  // redefine tier odds. All heroes within that tier have equal positive odds.
  const HEROES_BY_COST = Object.fromEntries([...new Set(ROSTER.map(hero => hero.cost))].sort((a, b) => a - b).map(cost => [cost, ROSTER.filter(hero => hero.cost === cost)]));
  const COST_WEIGHTS = [81, 27, 9, 3, 1], STAR_WEIGHTS = [81, 9, 1];
  const probabilityRows = rows => {
    const total = rows.reduce((sum, row) => sum + row.weight, 0);
    return rows.map(row => ({ ...row, probability: row.weight / total }));
  };
  const SPAWN_RARITY = freeze({
    costs: probabilityRows(Object.entries(HEROES_BY_COST).map(([cost, heroes]) => ({ cost: Number(cost), weight: COST_WEIGHTS[cost - 1], heroCount: heroes.length }))),
    stars: probabilityRows(STAR_WEIGHTS.map((weight, index) => ({ level: index + 1, weight })))
  });
  const heroById = id => HEROES[id];
  const distance = (a, b) => Math.hypot(a.col - b.col, a.row - b.row);
  // The existing foot shadow occupies half a tile. Stars grow that physical
  // footprint with the same modest authored scales used by the character art.
  function bodyProfile(unit) {
    const scale = 1 + ((unit.level ?? 1) - 1) * 0.08;
    return { radius: 0.25 * scale, scale };
  }
  const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  const fail = reason => ({ ok: false, reason });

  function makeRandom(seed) {
    if (seed === undefined) throw new Error('A seed is required.');
    let state = 2166136261;
    for (const char of String(seed)) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
    return function () {
      state |= 0; state = state + 0x6D2B79F5 | 0;
      let x = Math.imul(state ^ state >>> 15, 1 | state);
      x ^= x + Math.imul(x ^ x >>> 7, 61 | x);
      return ((x ^ x >>> 14) >>> 0) / 4294967296;
    };
  }

  function normalizeConfig(input) {
    const config = { ...input };
    for (const key of Object.keys(DEFAULT_CONFIG)) {
      if (!Number.isSafeInteger(config[key]) || config[key] < 1) throw new Error(key + ' must be a positive safe integer.');
    }
    for (const pair of [['playerLevelMin', 'playerLevelMax'], ['heroLevelMin', 'heroLevelMax'], ['benchMin', 'benchMax']]) {
      if (config[pair[0]] > config[pair[1]]) throw new Error(pair[0] + ' exceeds ' + pair[1] + '.');
    }
    if (config.heroLevelMax > 3) throw new Error('Champion stars cannot exceed three.');
    if (config.benchMax > config.benchCapacity) throw new Error('Initial champions exceed bench capacity.');
    return config;
  }

  function generate(random, input = DEFAULT_CONFIG) {
    if (typeof random !== 'function') throw new Error('A seeded random function is required.');
    const config = normalizeConfig(input);
    function draw() {
      const value = random();
      if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Random values must be in [0, 1).');
      return value;
    }
    const pick = (min, max) => min + Math.floor(draw() * (max - min + 1));
    function weighted(rows) {
      const value = draw(), total = rows.reduce((sum, row) => sum + row.weight, 0);
      let cumulative = 0;
      for (const row of rows) {
        cumulative += row.weight;
        if (value < cumulative / total) return row;
      }
      return rows[rows.length - 1];
    }
    const starRows = SPAWN_RARITY.stars.filter(row => row.level >= config.heroLevelMin && row.level <= config.heroLevelMax);
    const playerLevel = pick(config.playerLevelMin, config.playerLevelMax);
    const count = pick(config.benchMin, config.benchMax);
    const columns = 5, halfRows = 2;
    const board = { columns, rows: 5, halfRows, playerStartRow: 3, neutralRow: 2 };
    const unit = id => {
      const heroes = HEROES_BY_COST[weighted(SPAWN_RARITY.costs).cost];
      return { id, heroId: heroes[pick(0, heroes.length - 1)].id, level: weighted(starRows).level };
    };
    const bench = Array.from({ length: count }, (_, i) => unit('p' + i));
    const cells = Array.from({ length: columns * halfRows }, (_, i) => ({ col: i % columns, row: Math.floor(i / columns) }));
    const opponents = Array.from({ length: playerLevel }, (_, i) => {
      const result = unit('e' + i);
      return { ...result, ...cells.splice(pick(0, cells.length - 1), 1)[0] };
    });
    // Draw once from the supplied Aleatory stream. Planning previews never draw.
    const battleSeed = pick(0, 0xffffffff);
    const token = { version: 5, config, playerLevel, board, bench, opponents, battleSeed };
    if (config.seed !== undefined) token.seed = config.seed;
    return freeze(token);
  }

  function spawnOdds(input = DEFAULT_CONFIG) {
    const config = normalizeConfig(input);
    return freeze({
      costs: SPAWN_RARITY.costs,
      stars: probabilityRows(SPAWN_RARITY.stars.filter(row => row.level >= config.heroLevelMin && row.level <= config.heroLevelMax))
    });
  }

  function createGame(token) {
    return {
      token: freeze(clone(token)), phase: 'planning', playerLevel: token.playerLevel,
      board: clone(token.board), bench: clone(token.bench), field: [],
      opponents: clone(token.opponents), battle: null, result: null, mergeSerial: 0
    };
  }

  function deploy(game, unitId, col, row) {
    if (game.phase !== 'planning') return fail('Return to planning before moving champions.');
    if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || col >= game.board.columns || row < (game.board.playerStartRow ?? game.board.halfRows) || row >= game.board.rows) return fail('Deploy on your half of the board.');
    const fromBench = game.bench.findIndex(unit => unit.id === unitId);
    const fromField = game.field.findIndex(unit => unit.id === unitId);
    if (fromBench < 0 && fromField < 0) return fail('Champion not found.');
    const occupied = game.field.findIndex(unit => unit.col === col && unit.row === row);
    if (fromField >= 0) {
      const unit = game.field[fromField];
      if (occupied >= 0 && occupied !== fromField) Object.assign(game.field[occupied], { col: unit.col, row: unit.row });
      Object.assign(unit, { col, row });
    } else {
      if (occupied < 0 && game.field.length >= game.playerLevel) return fail('Army full: one champion per player level.');
      const unit = game.bench[fromBench];
      if (occupied >= 0) {
        const replaced = game.field[occupied];
        game.bench[fromBench] = { id: replaced.id, heroId: replaced.heroId, level: replaced.level,
          ...(replaced.lotIds ? { lotIds: [...replaced.lotIds] } : {}),
          ...(replaced.itemIds ? { itemIds: [...replaced.itemIds] } : {}) };
        game.field[occupied] = { ...unit, col, row };
      } else {
        game.bench.splice(fromBench, 1);
        game.field.push({ ...unit, col, row });
      }
    }
    return { ok: true };
  }

  function recall(game, unitId) {
    if (game.phase !== 'planning') return fail('Return to planning before moving champions.');
    const index = game.field.findIndex(unit => unit.id === unitId);
    if (index < 0) return fail('Champion is not fielded.');
    if (game.bench.length >= game.token.config.benchCapacity) return fail('Bench is full.');
    const unit = game.field.splice(index, 1)[0];
    game.bench.push({ id: unit.id, heroId: unit.heroId, level: unit.level,
      ...(unit.lotIds ? { lotIds: [...unit.lotIds] } : {}),
      ...(unit.itemIds ? { itemIds: [...unit.itemIds] } : {}) });
    return { ok: true };
  }

  function mergeGroups(game) {
    const groups = new Map();
    for (const unit of [...game.field, ...game.bench]) {
      if (unit.level >= 3) continue;
      const key = unit.heroId + ':' + unit.level;
      if (!groups.has(key)) groups.set(key, { heroId: unit.heroId, level: unit.level, count: 0, unitIds: [], hero: heroById(unit.heroId) });
      const group = groups.get(key);
      group.count++; group.unitIds.push(unit.id);
    }
    return [...groups.values()].filter(group => group.count >= 3);
  }

  function combine(game, heroId, level) {
    if (game.phase !== 'planning') return fail('Combine champions during planning.');
    if (level >= 3) return fail('Three stars is the highest champion level.');
    const match = unit => unit.heroId === heroId && unit.level === level;
    const field = game.field.filter(match).sort((a, b) => a.row - b.row || a.col - b.col || byId(a, b));
    const candidates = [...field, ...game.bench.filter(match).sort(byId)];
    if (candidates.length < 3) return fail('Combining needs three copies of the same champion at the same star level.');
    const consumed = candidates.slice(0, 3);
    const ids = new Set(consumed.map(unit => unit.id));
    game.field = game.field.filter(unit => !ids.has(unit.id));
    game.bench = game.bench.filter(unit => !ids.has(unit.id));
    const unit = { id: 'merge-' + (++game.mergeSerial), heroId, level: level + 1 };
    if (consumed.some(copy => copy.lotIds)) unit.lotIds = consumed.flatMap(copy => copy.lotIds || []);
    const carriedItems = consumed.flatMap(copy => copy.itemIds || []);
    const mitts = 'lucky-grips+lucky-grips';
    const equippedItems = carriedItems.includes(mitts) ? [mitts] : carriedItems.slice(0, 3);
    if (equippedItems.length) unit.itemIds = equippedItems;
    if (field.length) {
      Object.assign(unit, { col: field[0].col, row: field[0].row });
      game.field.push(unit);
    } else game.bench.push(unit);
    const overflowItemIds = carriedItems.includes(mitts)
      ? carriedItems.filter((id, index) => id !== mitts || index !== carriedItems.indexOf(mitts))
      : carriedItems.slice(3);
    return { ok: true, unit, ...(overflowItemIds.length ? { overflowItemIds } : {}) };
  }

  function synergies(units) {
    const unique = [...new Set(units.map(unit => unit.heroId))].map(heroById).filter(Boolean);
    const group = (traits, key) => traits.map(trait => {
      const count = unique.filter(hero => key === 'class' ? hero.classes.includes(trait.id) : hero[key] === trait.id).length;
      const current = trait.milestones.filter(milestone => milestone.count <= count).at(-1) || null;
      const next = trait.milestones.find(milestone => milestone.count > count) || null;
      return { id: trait.id, name: trait.name, color: trait.color, glyph: trait.glyph, count, active: Boolean(current), power: current?.power || 0, description: trait.description,
        rosterSize: trait.rosterSize, behavior: trait.behavior || null, milestones: trait.milestones, current, next, remaining: next ? next.count - count : 0, completed: !next, progress: { count, target: next?.count ?? current?.count ?? 0 } };
    });
    return { factions: group(FACTIONS, 'faction'), classes: group(CLASSES, 'class') };
  }

  function deriveStats(unit, traits = synergies([unit])) {
    const hero = heroById(unit.heroId);
    if (!hero) throw new Error('Unknown champion: ' + unit.heroId);
    const factionTrait = traits.factions.find(trait => trait.id === hero.faction);
    const faction = factionTrait?.power || 0;
    const factionComplete = Boolean(faction && factionTrait.count >= factionTrait.rosterSize);
    const classPowers = Object.fromEntries(hero.classes.map(id => [id, traits.classes.find(trait => trait.id === id)?.power || 0]));
    const power = id => classPowers[id] || 0;
    const role = power(hero.primaryClass);
    const scale = 1 + (unit.level - 1) * 0.65;
    const hp = hero.stats.hp * scale * (['verdant', 'gargoyle'].includes(hero.faction) ? 1 + faction * 0.18 : 1) * (1 + power('sentinel') * 0.18);
    const astralPower = hero.faction === 'astral' ? 1 + faction * 0.25 : 1;
    const speed = hero.stats.speed * (1 + (hero.faction === 'hollow' ? faction * 0.08 : 0));
    const result = {
      cost: hero.cost, maxHp: hp, hp,
      attack: hero.stats.attack * scale * (['ember', 'dune'].includes(hero.faction) ? 1 + faction * 0.12 : 1) * (1 + (power('duelist') + power('ranger')) * 0.12),
      speed, abilityScore: hero.stats.abilityScore * scale,
      abilityRegen: hero.stats.abilityRegen,
      abilityRange: hero.stats.abilityRange + power('stormcaller') + (hero.faction === 'dune' ? faction : 0),
      normalAttack: hero.stats.normalAttack,
      armor: hero.stats.armor + power('vanguard') * 8 + (['iron', 'rime'].includes(hero.faction) ? faction * 8 : 0),
      range: hero.stats.range + power('stormcaller') + (hero.faction === 'dune' ? faction : 0),
      attackInterval: 1 / speed,
      shield: hero.faction === 'tide' ? hp * 0.18 * faction : 0,
      spellPower: hero.ability.potency * (1 + power('arcanist') * 0.25) * astralPower,
      healingPower: hero.ability.potency * (1 + (power('mender') + power('artificer')) * 0.3 + power('hexbinder') * 0.25) * astralPower,
      shieldPower: hero.ability.potency * (hero.faction === 'silk' ? 1 + faction * 0.18 : hero.faction === 'gargoyle' ? 1 + faction * 0.3 : 1),
      buffPower: hero.ability.potency * (1 + power('artificer') * 0.3) * (hero.faction === 'silk' ? 1 + faction * 0.12 : 1),
      debuffPower: hero.ability.potency * (1 + power('hexbinder') * 0.25) * (hero.faction === 'rime' ? 1 + faction * 0.25 : 1),
      lifesteal: hero.faction === 'hollow' ? faction * 0.08 : 0,
      armorPierce: power('assassin') * 0.25,
      fireDamage: hero.faction === 'ember' ? 5 * unit.level * faction : 0,
      castHealing: hero.faction === 'verdant' ? 8 * unit.level * faction : 0,
      castShield: ['tide', 'iron'].includes(hero.faction) ? 4 * unit.level * faction : 0,
      deathHealing: hero.faction === 'verdant' && factionComplete ? 8 * unit.level * faction : 0,
      harvestHaste: hero.faction === 'hollow' && factionComplete ? 0.12 : 0,
      reflectionRatio: hero.faction === 'iron' && factionComplete ? 0.12 : 0,
      manaGift: hero.faction === 'astral' && faction ? 1 : 0,
      castSlow: hero.faction === 'dune' && faction ? 0.12 * hero.ability.potency : 0,
      castWeakness: hero.faction === 'dune' && factionComplete ? 0.12 * hero.ability.potency : 0,
      weaveRatio: hero.faction === 'silk' && faction ? 0.18 : 0,
      weaveHaste: hero.faction === 'silk' && factionComplete ? 0.12 : 0,
      chillStrength: hero.faction === 'rime' && faction ? 0.12 * hero.ability.potency : 0,
      shatterDamage: hero.faction === 'rime' && factionComplete ? 8 * unit.level : 0,
      openingShield: hero.faction === 'gargoyle' && faction ? hp * 0.18 : 0,
      factionPower: faction, factionComplete, classPower: role, classPowers
    };
    if (unit.balanceVersion === 1) {
      const adjustment = BALANCE_ADJUSTMENTS[hero.id];
      if (adjustment) {
        const health = adjustment.health ?? 1, attack = adjustment.attack ?? 1, ability = adjustment.ability ?? 1;
        result.maxHp *= health; result.hp *= health;
        result.shield *= health; result.openingShield *= health;
        result.attack *= attack; result.abilityScore *= ability;
      }
    }
    if (unit.itemIds?.length) {
      const itemStats = ITEMS.statsFor(unit.itemIds);
      result.maxHp = result.hp = (result.maxHp + itemStats.health) * (1 + itemStats.healthRatio);
      result.attack *= 1 + itemStats.attackRatio;
      result.speed *= 1 + itemStats.speedRatio;
      result.attackInterval = 1 / result.speed;
      result.abilityRegen += itemStats.manaRegen;
      result.armor += itemStats.armor;
      result.magicResist = result.armor - itemStats.armor + itemStats.magicResist;
      result.range += itemStats.range;
      result.critChance = itemStats.critChance;
      result.damageAmp = itemStats.damageAmp;
      for (const key of ['spellPower', 'healingPower', 'shieldPower', 'buffPower', 'debuffPower'])
        result[key] *= 1 + itemStats.abilityPower / 100;
      if (hasItem(unit, 'mana-vial+veil-cloth')) {
        if (CLASSES.find(entry => entry.id === hero.primaryClass)?.primaryArchetype === 'tank') {
          result.armor += itemValue('mana-vial+veil-cloth', 'FrontlineResists');
          result.magicResist += itemValue('mana-vial+veil-cloth', 'FrontlineResists');
        } else {
          result.attack *= 1 + itemValue('mana-vial+veil-cloth', 'BacklineADAP') / 100;
          for (const key of ['spellPower', 'healingPower', 'shieldPower']) result[key] *= 1 + itemValue('mana-vial+veil-cloth', 'BacklineADAP') / 100;
        }
      }
    }
    return result;
  }

  // Stats with beneficial direction ↑. Resource thresholds, stars, cost, trait
  // counts and ability target counts are deliberately absent.
  const MIME_STATS = Object.freeze(['maxHp', 'hp', 'attack', 'speed', 'abilityScore', 'abilityRegen', 'abilityRange', 'armor', 'range', 'shield', 'spellPower', 'healingPower', 'shieldPower', 'lifesteal', 'armorPierce', 'fireDamage', 'castHealing', 'castShield', 'buffPower', 'debuffPower', 'deathHealing', 'harvestHaste', 'reflectionRatio', 'manaGift', 'castSlow', 'castWeakness', 'weaveRatio', 'weaveHaste', 'chillStrength', 'shatterDamage', 'openingShield']);
  function aliasAbilityPoints(unit) {
    // One resource, with legacy names retained for old UI and battle tools.
    Object.defineProperties(unit, {
      abilityPoints: { enumerable: true, configurable: true, get() { return this.mana; }, set(value) { this.mana = value; } },
      maxAbilityPoints: { enumerable: true, configurable: true, get() { return this.maxMana; }, set(value) { this.maxMana = value; } }
    });
    return unit;
  }
  function previewCombatUnits(game) {
    const alliedTraits = synergies(game.field), enemyTraits = synergies(game.opponents);
    const prepare = (unit, side, traits) => {
      const hero = heroById(unit.heroId);
      if (hasItem(unit, 'lucky-grips+lucky-grips')) {
        const random = makeRandom((game.token.battleSeed || 'items') + ':trickster:' + unit.id);
        const pool = ITEMS.RECIPES.filter(entry => entry.id !== 'lucky-grips+lucky-grips');
        unit = { ...unit, itemIds: [unit.itemIds.find(id => id === 'lucky-grips+lucky-grips'),
          pool[Math.floor(random() * pool.length)].id, pool[Math.floor(random() * pool.length)].id] };
      }
      const ready = aliasAbilityPoints({
        ...clone(unit), ...deriveStats({ ...unit, balanceVersion: game.balanceVersion }, traits), side, alive: true,
        radius: bodyProfile(unit).radius, bodyScale: bodyProfile(unit).scale,
        mana: 0, maxMana: hero.ability.manaCost ?? 3, cooldown: 0, attacks: 0, statuses: [], targetId: null, openingEffects: [],
        combatClass: hero.primaryClass, combatClasses: [...hero.classes], combatFaction: hero.faction, abilityProfile: hero.primaryClass,
        abilityName: hero.id === 'mime' ? 'Pantomime' : hero.ability.name, abilityLevel: unit.level,
        abilityId: hero.id === 'mime' ? 'mime-pantomime' : hero.ability.id, abilityActions: hero.id === 'mime' ? [{ type: 'hit', target: 'target', factor: 1.2 }] : clone(hero.ability.actions.map((action,index)=>game.balanceVersion===1&&BALANCE_ACTION_ADJUSTMENTS[hero.id]?.[index]
          ? {...action,...BALANCE_ACTION_ADJUSTMENTS[hero.id][index]} : action)),
        mimickedUnitId: null, mimickedHeroId: null,
        originCol: unit.col, originRow: unit.row, lastAction: null, lastMove: null, navigationTurn: null
      });
      if (game.itemRulesVersion === 1) ready.critChance = .25 + (ready.critChance || 0);
      if (unit.itemIds?.length) {
        ready.itemRuntime = { elapsed: 0, triggered: [], attackStacks: 0, titanStacks: 0, critStacks: 0 };
        if (hasItem(ready, 'mana-vial+iron-plate')) ready.mana += Math.min(ready.maxMana, itemValue('mana-vial+iron-plate', 'CombatStartMana') * ITEMS.MANA_SCALE);
        if (hasItem(ready, 'spellglass+iron-plate')) ready.shield += ready.maxHp * itemValue('spellglass+iron-plate', 'ShieldSize') / 100;
        if (hasItem(ready, 'forgeblade+veil-cloth')) ready.lifesteal += itemValue('forgeblade+veil-cloth', 'StatOmnivamp');
        if (hasItem(ready, 'mana-vial+lucky-grips')) ready.lifesteal += itemValue('mana-vial+lucky-grips', 'StatOmnivamp_NotStatBar');
        if (hasItem(ready, 'veil-cloth+lucky-grips')) ready.itemRuntime.ccImmuneUntil = itemValue('veil-cloth+lucky-grips', 'SpellShieldDuration');
        if (hasItem(ready, 'mana-vial+lucky-grips')) ready.itemRuntime.handOfJustice = true;
      }
      return ready;
    };
    const units = [...game.field.map(unit => prepare(unit, 'player', alliedTraits)), ...game.opponents.map(unit => prepare(unit, 'enemy', enemyTraits))];
    // Native opening effects resolve before mimicry, exactly once. A Mime
    // snapshots its source’s final shield; it does not replay the opening gift.
    for (const actor of units.filter(unit => unit.openingShield > 0)) {
      const recipient = units.filter(unit => unit.side === actor.side && unit.id !== actor.id).sort((a, b) => distance(actor, a) - distance(actor, b) || byId(a, b))[0];
      if (!recipient) continue;
      recipient.shield += actor.openingShield;
      actor.openingEffects.push({ type: 'shield', unitId: actor.id, targetId: recipient.id, amount: actor.openingShield, factionId: 'gargoyle', at: 0 });
    }
    const formation = units.map(unit => [unit.side, unit.id, unit.heroId, unit.level, unit.col, unit.row]).sort((a, b) => { const left = JSON.stringify(a), right = JSON.stringify(b); return left < right ? -1 : left > right ? 1 : 0; });
    const seed = JSON.stringify([game.token.battleSeed ?? game.token.seed ?? game.token, formation]);
    for (const mime of units.filter(unit => unit.heroId === 'mime')) {
      const allies = units.filter(unit => unit.side === mime.side && unit.heroId !== 'mime').sort(byId);
      if (!allies.length) continue;
      // Hash the token entropy and formation without consuming any random stream.
      let choice = 2166136261;
      for (const char of seed + ':' + mime.side + ':' + mime.id) choice = Math.imul(choice ^ char.charCodeAt(0), 16777619);
      const ally = allies[(choice >>> 0) % allies.length];
      for (const key of MIME_STATS) mime[key] = ally[key] * 1.25;
      mime.attackInterval = 1 / mime.speed;
      mime.classPower = ally.classPower; mime.classPowers = clone(ally.classPowers); mime.factionPower = ally.factionPower; mime.factionComplete = ally.factionComplete;
      mime.combatClass = ally.combatClass; mime.combatClasses = [...ally.combatClasses]; mime.combatFaction = ally.combatFaction;
      mime.abilityProfile = ally.abilityProfile; mime.normalAttack = ally.normalAttack;
      mime.abilityName = ally.abilityName; mime.abilityLevel = ally.abilityLevel;
      mime.maxMana = ally.maxMana; // Copy signature cadence, never multiply its resource threshold.
      mime.abilityId = ally.abilityId; mime.abilityActions = clone(ally.abilityActions);
      mime.mimickedUnitId = ally.id; mime.mimickedHeroId = ally.heroId;
    }
    units.forEach(refreshEffectiveStats);
    return units;
  }

  function prepareTreasure(game, config) {
    if (!config || !Number.isSafeInteger(config.roundNumber) || config.roundNumber < 1 || !Array.isArray(config.chests)) throw new Error('Treasure requires an explicit round number and chest list.');
    const enabled = config.roundNumber >= 5;
    const expiresAtSeconds = enabled ? config.roundNumber * 15 : null;
    if (enabled && !Number.isSafeInteger(expiresAtSeconds)) throw new Error('Treasure duration exceeds exact numeric representation.');
    const itemRound = config.itemRulesVersion === 1 && config.roundNumber % 10 === 0;
    if (config.itemChestPlacementVersion !== undefined && config.itemChestPlacementVersion !== 2) throw new Error('Unknown item chest placement version.');
    if (config.chests.length !== (enabled ? itemRound ? 4 : 2 : 0)) throw new Error('Place one gold chest per player and a second item chest every ten rounds.');
    const ids = new Set([...game.field, ...game.opponents, ...game.bench].map(unit => unit.id)), sides = new Set();
    const cherubs = [1, 2].includes(config.cherubRulesVersion) ? config.cherubs : [];
    if (config.cherubRulesVersion !== undefined && ![1, 2].includes(config.cherubRulesVersion)) throw new Error('Unknown Cherub rules version.');
    if ([1, 2].includes(config.cherubRulesVersion) && (!Array.isArray(cherubs) || cherubs.length !== 2 || new Set(cherubs.map(entry => entry.side)).size !== 2)) throw new Error('Place one Cherub on each side.');
    if (config.cherubRulesVersion === undefined && config.cherubs !== undefined) throw new Error('Cherub objectives require their rules version.');
    const objectives = [...config.chests, ...cherubs.map(entry => ({ ...entry, kind: 'cherub' }))].map(chest => {
      if (!chest || typeof chest.id !== 'string' || !chest.id.trim() || ids.has(chest.id)) throw new Error('Chest IDs must be distinct from every unit and chest.');
      const kind = chest.kind === 'cherub' ? 'cherub' : chest.kind === 'item' ? 'item' : 'gold', key = kind + ':' + chest.side;
      if (!['player', 'enemy'].includes(chest.side) || sides.has(key) || kind === 'item' && !itemRound) throw new Error('Each side must own one chest of each enabled kind.');
      const firstRow = chest.side === 'player' ? game.board.playerStartRow : 0;
      const endRow = chest.side === 'player' ? game.board.rows : game.board.halfRows;
      if (!Number.isInteger(chest.col) || chest.col < 0 || chest.col >= game.board.columns || !Number.isInteger(chest.row) || chest.row < firstRow || chest.row >= endRow) throw new Error('Place each chest in its owner’s deployment territory.');
      if (kind === 'item' && (config.itemChestPlacementVersion === 2
        ? (chest.side === 'player' ? chest.row >= game.board.playerStartRow + Math.min(2, game.board.halfRows) : chest.row < game.board.halfRows - Math.min(2, game.board.halfRows))
        : (chest.side === 'player' ? chest.row < game.board.rows - 2 : chest.row > 1))) throw new Error(config.itemChestPlacementVersion === 2 ? 'Item chests belong in the two front rows.' : 'Item chests belong in the two back rows.');
      if (kind === 'cherub' && (chest.maxHp !== cherubMaxHp(game.balanceVersion) || config.cherubRulesVersion === 1 &&
        (chest.col !== Math.floor((game.board.columns - 1) / 2) || chest.row !== (chest.side === 'player' ? game.board.playerStartRow : game.board.halfRows - 1)))) throw new Error('Cherub uses roster-derived low HP and the allowed starting position.');
      if (!Number.isFinite(chest.maxHp) || chest.maxHp <= 0) throw new Error('Chest maximum HP must be supplied explicitly and be positive.');
      const armor = chest.armor === undefined ? 0 : chest.armor;
      if (!Number.isFinite(armor) || armor < 0) throw new Error('Chest armor must be nonnegative; omit it for no armor.');
      ids.add(chest.id); sides.add(key);
      // Ground objectives do not consume a hero slot or invent a collision body.
      return { id: chest.id, kind: 'treasure', ...(kind !== 'gold' || config.itemRulesVersion === 1 ? { rewardKind: kind } : {}), side: chest.side, col: chest.col, row: chest.row,
        maxHp: chest.maxHp, hp: chest.maxHp, armor, shield: 0, effectiveAttack: 0,
        statuses: [], status: 'active', defeatedAtSeconds: null, captorSide: null };
    });
    return { objectives, treasure: { roundNumber: config.roundNumber, expiresAtSeconds } };
  }

  // The weakest named hero's unsynergized one-star health is the low-health
  // reference; no new arbitrary combat stat is introduced for this NPC.
  function cherubMaxHp(balanceVersion) { return Math.min(...ROSTER.map(hero => deriveStats({ heroId: hero.id, level: 1, balanceVersion }, synergies([])).maxHp)); }
  function cherubObjectives(game, prefix) {
    const col = Math.floor((game.board.columns - 1) / 2), maxHp = cherubMaxHp(game.balanceVersion);
    return ['player', 'enemy'].map(side => ({ id: prefix + ':cherub:' + side, side, col,
      row: side === 'player' ? game.board.playerStartRow : game.board.halfRows - 1, maxHp }));
  }

  function closeTreasure(game, status) {
    for (const chest of game.battle.objectives || []) if (chest.status === 'active') {
      chest.status = status; chest.statuses = [];
      game.battle.events.push({ type: (chest.rewardKind === 'cherub' ? 'cherub-' : 'treasure-') + status,
        ...(chest.rewardKind === 'cherub' ? { cherubId: chest.id } : { chestId: chest.id }), ownerSide: chest.side, at: game.battle.elapsed });
    }
  }

  function startBattle(game, treasureConfig) {
    if (game.phase !== 'planning') return fail('This battle has already started.');
    if (!game.field.length) return fail('Field a champion before starting.');
    if (game.field.length > game.playerLevel) return fail('Army exceeds player level.');
    let treasure, zoneDefense;
    if (game.zoneDefense) {
      try {
        zoneDefense = ZONES.create(game.zoneDefense.zones);
        for (const zone of zoneDefense.zones) {
          if (!['hp-regen', 'damage', 'speed', 'ability-regen', 'gold', 'clone'].includes(zone.benefit.stat) || zone.benefit.magnitude < 0) throw new Error('Unsupported Zone Defense benefit.');
          if (['gold', 'clone'].includes(zone.benefit.stat) && !Number.isFinite(zone.benefit.threshold)) throw new Error('Zone rewards require an explicit occupancy threshold.');
          if (zone.benefit.stat === 'gold' && !Number.isSafeInteger(zone.benefit.magnitude)) throw new Error('Zone gold must be a whole amount.');
          if (zone.benefit.stat === 'clone' && (zone.benefit.magnitude !== 1 || zone.benefit.duration <= 0)) throw new Error('A clone zone creates one temporary hero with an explicit positive lifetime.');
        }
      } catch (error) { return fail(error.message); }
    }
    if (treasureConfig !== undefined) {
      try { treasure = prepareTreasure(game, treasureConfig); }
      catch (error) { return fail(error.message); }
    }
    game.battle = {
      units: previewCombatUnits(game), elapsed: 0, tick: 0, accumulator: 0, events: [],
      alliedTraits: synergies(game.field), enemyTraits: synergies(game.opponents)
    };
    if (treasure) Object.assign(game.battle, treasure);
    if (zoneDefense) game.battle.zoneDefense = zoneDefense;
    for (const unit of game.battle.units) game.battle.events.push(...clone(unit.openingEffects));
    for (const unit of game.battle.units.filter(unit => unit.mimickedUnitId)) game.battle.events.push({ type: 'mimic', unitId: unit.id, targetId: unit.mimickedUnitId, heroId: unit.mimickedHeroId, name: unit.abilityName, at: 0 });
    game.phase = 'battle'; game.result = null;
    settle(game);
    return { ok: true };
  }

  function settle(game) {
    const alive = game.battle.units.filter(unit => unit.alive && !unit.temporary);
    const player = alive.some(unit => unit.side === 'player');
    const enemy = alive.some(unit => unit.side === 'enemy');
    if (!player || !enemy) {
      game.phase = 'finished';
      game.result = player ? 'victory' : enemy ? 'defeat' : 'draw';
      if (game.battle.zoneDefense) {
        expireZoneClones(game, 'combat-ended');
        for (const zone of game.battle.zoneDefense.zones) zone.activeChampionId = null;
        for (const unit of game.battle.units) { delete unit.zoneModifiers; refreshEffectiveStats(unit); }
      }
      closeTreasure(game, 'combat-ended');
      game.battle.events.push({ type: 'result', result: game.result, at: game.battle.elapsed });
    }
  }

  // The tiles are deployment guides only. Combat uses continuous centers and
  // circular bodies. Speed 1 preserves the original one tile per .3 seconds.
  const MOVE_SPEED = 1 / 0.3, GEOMETRY_EPSILON = 1e-10;
  const fullTurn = Math.PI * 2;
  function contactFraction(a, endA, b, endB) {
    // First time that the two swept circles touch during this simultaneous tick.
    const x = a.col - b.col, y = a.row - b.row;
    const vx = endA.col - a.col - (endB.col - b.col);
    const vy = endA.row - a.row - (endB.row - b.row);
    const radius = a.radius + b.radius;
    const projection = x * vx + y * vy, speed2 = vx * vx + vy * vy;
    if (speed2 <= GEOMETRY_EPSILON ** 2 || projection >= 0) return 1;
    const clearance = x * x + y * y - radius * radius;
    if (clearance <= GEOMETRY_EPSILON && projection < -GEOMETRY_EPSILON) return 0;
    const discriminant = projection * projection - speed2 * clearance;
    // A tangent touches but does not enter the other body.
    if (discriminant <= GEOMETRY_EPSILON * speed2) return 1;
    const time = (-projection - Math.sqrt(discriminant)) / speed2;
    return time >= 0 && time < 1 ? time : 1;
  }

  function steer(game, actor, target, alive, dt) {
    const path = game.board.terrain ? TERRAIN.route(game.board, actor, target) : [target];
    if (!path?.length) return null;
    const waypoint = path[0], navigating = path.length > 1 || !clearSight(game, actor, target);
    const gap = navigating ? distance(actor, waypoint) : distance(actor, target) - actor.range;
    if (gap <= GEOMETRY_EPSILON) { actor.navigationTurn = null; return null; }
    const length = Math.min(MOVE_SPEED * actor.effectiveSpeed * dt, gap);
    const direct = Math.atan2(waypoint.row - actor.row, waypoint.col - actor.col);
    const obstacles = alive.filter(unit => unit.id !== actor.id);
    const destination = angle => ({ col: actor.col + Math.cos(angle) * length,
      row: actor.row + Math.sin(angle) * length });
    const routeEnd = { col: actor.col + Math.cos(direct) * gap, row: actor.row + Math.sin(direct) * gap };
    const blocked = obstacles.some(unit => contactFraction(actor, routeEnd, unit, unit) < 1);
    if (!blocked) actor.navigationTurn = null;
    // Tangent directions are geometric candidates, not an angular sampling grid.
    // Keep the chosen winding direction while skirting a body, avoiding the
    // left/right oscillation of a new shortest-side choice on every frame.
    const angles = [direct];
    for (const obstacle of obstacles) {
      const d = distance(actor, obstacle), radius = actor.radius + obstacle.radius;
      const center = Math.atan2(obstacle.row - actor.row, obstacle.col - actor.col);
      const tangent = Math.asin(Math.min(1, radius / d));
      angles.push(center - tangent, center + tangent);
    }
    const options = angles.map(angle => {
      const end = destination(angle);
      let fraction = 1;
      const dx = end.col - actor.col, dy = end.row - actor.row;
      const left = -0.5 + actor.radius, right = game.board.columns - 0.5 - actor.radius;
      const top = -0.5 + actor.radius, bottom = game.board.rows - 0.5 - actor.radius;
      if (dx < 0) fraction = Math.min(fraction, (left - actor.col) / dx);
      if (dx > 0) fraction = Math.min(fraction, (right - actor.col) / dx);
      if (dy < 0) fraction = Math.min(fraction, (top - actor.row) / dy);
      if (dy > 0) fraction = Math.min(fraction, (bottom - actor.row) / dy);
      if (game.board.terrain) {
        const clipped = TERRAIN.clipMove(game.board, actor, end);
        fraction = Math.min(fraction, distance(actor, clipped) / length);
      }
      for (const obstacle of obstacles) fraction = Math.min(fraction, contactFraction(actor, end, obstacle, obstacle));
      const difference = Math.atan2(Math.sin(angle - direct), Math.cos(angle - direct));
      return { angle, end, fraction: Math.max(0, fraction), difference };
    }).filter(option => option.fraction * length > GEOMETRY_EPSILON);
    if (!options.length) return null;
    const full = options.filter(option => option.fraction >= 1 - GEOMETRY_EPSILON);
    const viable = full.length ? full : options;
    if (blocked && actor.navigationTurn === null) {
      const choice = [...viable].sort((a, b) => Math.abs(a.difference) - Math.abs(b.difference) || b.difference - a.difference)[0];
      actor.navigationTurn = choice.difference < 0 ? -1 : 1;
    }
    const angularCost = option => actor.navigationTurn === null ? Math.abs(option.difference)
      : (option.difference * actor.navigationTurn + fullTurn) % fullTurn;
    viable.sort((a, b) => (full.length ? 0 : b.fraction - a.fraction) || angularCost(a) - angularCost(b));
    const choice = viable[0];
    return { col: actor.col + (choice.end.col - actor.col) * choice.fraction,
      row: actor.row + (choice.end.row - actor.row) * choice.fraction };
  }

  function simultaneousMoves(game, plans, dt) {
    const alive = game.battle.units.filter(unit => unit.alive).sort(byId);
    const proposals = new Map();
    for (const { actor, target } of plans) {
      const end = steer(game, actor, target, alive, dt);
      if (end) proposals.set(actor.id, end);
    }
    // Resolve only the bodies involved in each collision. A blocked hero cannot
    // stop a distant unit. Every pass reads one unchanged proposal snapshot and
    // applies reciprocal reductions together, never choosing a first army.
    while (true) {
      const fractions = new Map();
      for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i], b = alive[j];
        if (!proposals.has(a.id) && !proposals.has(b.id)) continue;
        const fraction = contactFraction(a, proposals.get(a.id) || a, b, proposals.get(b.id) || b);
        if (fraction >= 1 - GEOMETRY_EPSILON) continue;
        if (proposals.has(a.id)) fractions.set(a.id, Math.min(fractions.get(a.id) ?? 1, fraction));
        if (proposals.has(b.id)) fractions.set(b.id, Math.min(fractions.get(b.id) ?? 1, fraction));
      }
      if (!fractions.size) break;
      let changed = false;
      for (const actor of alive) if (fractions.has(actor.id)) {
        const end = proposals.get(actor.id), fraction = fractions.get(actor.id);
        const length = distance(actor, end);
        if (length * fraction <= GEOMETRY_EPSILON) { proposals.delete(actor.id); changed = true; continue; }
        const next = { col: actor.col + (end.col - actor.col) * fraction,
          row: actor.row + (end.row - actor.row) * fraction };
        if (distance(end, next) > GEOMETRY_EPSILON) changed = true;
        proposals.set(actor.id, next);
      }
      if (!changed) break;
    }
    return alive.filter(actor => proposals.has(actor.id)).map(actor => ({ actor,
      cell: proposals.get(actor.id), from: { col: actor.col, row: actor.row }, duration: dt }));
  }

  // Effects are authored three-second ability windows. They refresh per source
  // and type. The strongest active modifier of each type applies; burn ticks
  // from different casters remain separate. Baseline stats are never overwritten.
  const EFFECT_DURATION = 3, DOT_INTERVAL = 1;
  function refreshEffectiveStats(unit) {
    if (unit.kind === 'treasure') return; // Attackable structures never act.
    const strength = type => Math.max(0, ...unit.statuses.filter(status => status.type === type).map(status => status.magnitude));
    const previous = unit.effectiveAttackInterval;
    unit.effectiveAttack = unit.attack * (1 + strength('empower')) / (1 + strength('weakness'));
    if (unit.itemRuntime) unit.effectiveAttack *= 1 + (unit.itemRuntime.attackRatio || 0);
    if (unit.zoneModifiers) unit.effectiveAttack *= 1 + unit.zoneModifiers.damage;
    unit.attackInterval = unit.speed > 0 ? 1 / unit.speed : Infinity;
    unit.effectiveSpeed = unit.speed * (1 + strength('haste')) / (1 + strength('slow'));
    if (unit.itemRuntime) unit.effectiveSpeed *= 1 + (unit.itemRuntime.speedRatio || 0);
    if (unit.zoneModifiers) unit.effectiveSpeed *= 1 + unit.zoneModifiers.speed;
    unit.effectiveAttackInterval = unit.effectiveSpeed > 0 ? 1 / unit.effectiveSpeed : Infinity;
    if (previous && Number.isFinite(previous) && Number.isFinite(unit.cooldown) && unit.cooldown > 0) unit.cooldown *= unit.effectiveAttackInterval / previous;
    else if (previous === Infinity && Number.isFinite(unit.effectiveAttackInterval)) unit.cooldown = 0;
  }

  function expireZoneClones(game, reason) {
    for (const unit of game.battle.units) if (unit.temporary && unit.alive && (reason === 'combat-ended' || unit.expiresAt <= game.battle.elapsed + GEOMETRY_EPSILON)) {
      unit.alive = false; unit.hp = 0; unit.shield = 0; unit.statuses = [];
      unit.lastAction = { type: 'expired', at: game.battle.elapsed };
      game.battle.events.push({ type: 'zone-clone-expired', zoneId: unit.zoneId, unitId: unit.id, side: unit.side, reason, at: game.battle.elapsed });
    }
  }

  function zoneClone(game, zone, champion) {
    const original = [...game.field, ...game.opponents].find(unit => unit.id === champion.id);
    if (!original) return null;
    // The real formation alone supplies class/faction counts. Re-previewing a
    // one-star source supplies native opening stats and deterministic Mime
    // copying without replaying those opening gifts onto the live army.
    const preview = { ...game, field: game.field.map(unit => unit.id === champion.id ? { ...unit, level: 1 } : unit),
      opponents: game.opponents.map(unit => unit.id === champion.id ? { ...unit, level: 1 } : unit) };
    const unit = previewCombatUnits(preview).find(unit => unit.id === champion.id);
    const candidates = [];
    for (let row = 0; row < game.board.rows; row++) for (let col = 0; col < game.board.columns; col++) {
      const candidate = { col, row, radius: unit.radius };
      if (col - unit.radius < -0.5 || col + unit.radius > game.board.columns - 0.5 || row - unit.radius < -0.5 || row + unit.radius > game.board.rows - 0.5) continue;
      if (game.battle.units.some(other => other.alive && distance(candidate, other) < unit.radius + other.radius - GEOMETRY_EPSILON)) continue;
      if (game.board.terrain && !TERRAIN.route(game.board, candidate, candidate)) continue;
      candidates.push(candidate);
    }
    const orientation = champion.side === 'player' ? 1 : -1;
    candidates.sort((a, b) => distance(a, champion) - distance(b, champion) || orientation * (a.row - b.row) || orientation * (a.col - b.col));
    if (!candidates.length) return null;
    delete unit.lotIds;
    unit.id = 'zone-clone:' + JSON.stringify([zone.id, champion.id, game.battle.tick]);
    Object.assign(unit, candidates[0], { level: 1, temporary: true, temporaryKind: 'zone-clone', zoneId: zone.id,
      sourceUnitId: champion.id, expiresAt: game.battle.elapsed + zone.benefit.duration, openingEffects: [] });
    unit.originCol = unit.col; unit.originRow = unit.row;
    return unit;
  }

  function refreshZoneBenefits(game, dt, award) {
    const battle = game.battle;
    if (!battle.zoneDefense) return;
    const transitions = ZONES.update(battle.zoneDefense, game.zoneDefense.zones, battle.units, dt);
    for (const transition of transitions) battle.events.push({ type: 'zone-champion', ...transition, at: battle.elapsed });
    for (const unit of battle.units) unit.zoneModifiers = { damage: 0, speed: 0, abilityRegen: 0, hpRegen: 0 };
    for (const zone of battle.zoneDefense.zones) {
      const champion = battle.units.find(unit => unit.id === zone.activeChampionId && unit.alive && !unit.temporary);
      if (!champion) continue;
      const benefit = zone.benefit, occupancy = zone.occupancy.find(entry => entry.unitId === champion.id);
      if (benefit.stat === 'damage') champion.zoneModifiers.damage += benefit.magnitude;
      if (benefit.stat === 'speed') champion.zoneModifiers.speed += benefit.magnitude;
      if (benefit.stat === 'ability-regen') champion.zoneModifiers.abilityRegen += benefit.magnitude;
      if (benefit.stat === 'hp-regen') champion.zoneModifiers.hpRegen += benefit.magnitude;
      if (!award || zone.rewardClaimed || occupancy.elapsed + GEOMETRY_EPSILON < benefit.threshold) continue;
      if (benefit.stat === 'gold') {
        zone.rewardClaimed = true;
        battle.events.push({ type: 'zone-gold', zoneId: zone.id, unitId: champion.id, side: champion.side, amount: benefit.magnitude, at: battle.elapsed });
      } else if (benefit.stat === 'clone') {
        const unit = zoneClone(game, zone, champion);
        if (!unit) continue; // A fully occupied board does not consume the reward.
        zone.rewardClaimed = true; battle.units.push(unit);
        battle.events.push({ type: 'zone-clone', zoneId: zone.id, unitId: unit.id, sourceId: champion.id, side: champion.side, expiresAt: unit.expiresAt, at: battle.elapsed });
      }
    }
    for (const unit of battle.units) refreshEffectiveStats(unit);
  }

  function tick(game, dt) {
    const battle = game.battle;
    battle.tick++; battle.elapsed = battle.tick * dt;
    const emit = event => battle.events.push({ ...event, at: battle.elapsed });
    if (battle.zoneDefense) { expireZoneClones(game, 'lifetime'); refreshZoneBenefits(game, 0, false); }
    if (battle.treasure && battle.treasure.expiresAtSeconds !== null && battle.elapsed >= battle.treasure.expiresAtSeconds) closeTreasure(game, 'expired');
    const objectives = (battle.objectives || []).filter(chest => chest.status === 'active');
    const hits = [], heals = [], shields = [], effects = [], manaGifts = [];
    function grantAbilityPoints(victim, amount, source, actor = victim, details = {}) {
      if (hasItem(victim, 'mana-vial+veil-cloth')) amount *= 1 + itemValue('mana-vial+veil-cloth', 'ManaPercIncrease');
      const restored = Math.max(0, Math.min(amount, victim.maxMana - victim.mana));
      victim.mana += restored;
      if (restored > 0) emit({ type: 'mana', unitId: actor.id, targetId: victim.id, amount: restored, source, trigger: source, ...details });
    }
    function applyEffect({ actor, victim, status }) {
      if (victim.itemRuntime?.ccImmuneUntil > battle.elapsed && ['slow', 'taunt'].includes(status.type)) return;
      victim.statuses = victim.statuses.filter(previous => previous.type !== status.type || previous.sourceId !== status.sourceId || (previous.channel || 'signature') !== (status.channel || 'signature'));
      victim.statuses.push(status); refreshEffectiveStats(victim);
      const type = status.type === 'taunt' ? 'taunt' : ['haste', 'empower'].includes(status.type) ? 'buff' : 'status';
      emit({ type, unitId: actor.id, targetId: victim.id, status: status.type, expiresAt: status.expiresAt, magnitude: status.magnitude, ...(status.factionId ? { factionId: status.factionId } : {}) });
    }
    function restore({ actor, victim, amount, factionId }) {
      if (victim.statuses.some(status => status.type === 'wound')) amount *= 1 - Math.max(...victim.statuses.filter(status => status.type === 'wound').map(status => status.magnitude));
      const actual = Math.min(amount, victim.maxHp - victim.hp);
      victim.hp += actual;
      emit({ type: 'heal', unitId: actor.id, targetId: victim.id, amount: actual, rawAmount: amount, overheal: amount - actual, ...(factionId ? { factionId } : {}) });
      if (actual > 0 && actor.weaveRatio > 0) {
        const woven = actual * actor.weaveRatio; victim.shield += woven;
        emit({ type: 'shield', unitId: actor.id, targetId: victim.id, amount: woven, factionId: 'silk' });
        if (actor.weaveHaste) applyEffect({ actor, victim, status: { type: 'haste', sourceId: actor.id, appliedAt: battle.elapsed, expiresAt: battle.elapsed + EFFECT_DURATION, magnitude: actor.weaveHaste * actor.buffPower, channel: 'faction', factionId: 'silk' } });
      }
    }
    for (const unit of [...battle.units.filter(item => item.alive), ...objectives]) {
      unit.statuses = unit.statuses.filter(status => {
        if (status.type === 'burn' && status.nextTick <= battle.elapsed + 1e-9 && status.nextTick <= status.expiresAt + 1e-9) {
          const source = battle.units.find(item => item.id === status.sourceId);
          hits.push({ actor: source, victim: unit, amount: status.damage, ability: true, dot: true,
            ...(status.channel === 'item' ? { trueDamage: true } : {}), factionId: status.factionId });
          status.nextTick += status.tickInterval;
        }
        const sourceDied = status.type === 'taunt' && !battle.units.some(item => item.id === status.sourceId && item.alive);
        if (sourceDied || status.expiresAt <= battle.elapsed + 1e-9) {
          emit({ type: 'status-expired', unitId: status.sourceId, targetId: unit.id, status: status.type, reason: sourceDied ? 'source-defeated' : 'expired' });
          if (status.type === 'taunt') unit.targetId = null;
          return false;
        }
        return true;
      });
      refreshEffectiveStats(unit);
      if (unit.kind !== 'treasure') {
        grantAbilityPoints(unit, unit.abilityRegen * dt, 'passive');
        if (unit.zoneModifiers?.abilityRegen) grantAbilityPoints(unit, unit.abilityRegen * unit.zoneModifiers.abilityRegen * dt, 'zone');
      }
    }
    const alive = battle.units.filter(unit => unit.alive);
    for (const unit of alive.filter(unit => unit.itemRuntime)) {
      const runtime = unit.itemRuntime, whole = Math.floor(battle.elapsed + GEOMETRY_EPSILON), previous = Math.floor(runtime.elapsed + GEOMETRY_EPSILON);
      if (whole > previous) for (let second = previous + 1; second <= whole; second++) {
        if (hasItem(unit, 'quickstring+spellglass')) runtime.speedRatio = (runtime.speedRatio || 0) + itemValue('quickstring+spellglass', 'AttackSpeedPerStack') / 100;
        if (hasItem(unit, 'veil-cloth+lucky-grips')) runtime.speedRatio = (runtime.speedRatio || 0) + itemValue('veil-cloth+lucky-grips', 'ProcAttackSpeed');
        if (hasItem(unit, 'spellglass+mana-vial') && second % itemValue('spellglass+mana-vial', 'IntervalSeconds') === 0)
          runtime.abilityPowerRatio = (runtime.abilityPowerRatio || 0) + itemValue('spellglass+mana-vial', 'APPerInterval') / 100;
        if (hasItem(unit, 'mana-vial+vital-sash')) {
          const amount = Math.min(unit.maxHp - unit.hp, (unit.maxHp - unit.hp) * itemValue('mana-vial+vital-sash', 'MissingHealthHeal'));
          if (amount > 0) restore({ actor: unit, victim: unit, amount });
        }
        if (hasItem(unit, 'veil-cloth+veil-cloth') && second % itemValue('veil-cloth+veil-cloth', 'HealthRegenInterval') === 0) {
          const amount = Math.min(unit.maxHp - unit.hp, unit.maxHp * itemValue('veil-cloth+veil-cloth', 'PercentHealthDamage') / 100);
          if (amount > 0) restore({ actor: unit, victim: unit, amount });
        }
      }
      runtime.elapsed = battle.elapsed;
      if (hasItem(unit, 'spellglass+iron-plate') && !runtime.triggered.includes('spellglass+iron-plate') &&
        battle.elapsed >= itemValue('spellglass+iron-plate', 'ShieldDuration')) {
        runtime.triggered.push('spellglass+iron-plate');
        unit.shield = Math.max(0, unit.shield - unit.maxHp * itemValue('spellglass+iron-plate', 'ShieldSize') / 100);
        runtime.abilityPowerRatio = (runtime.abilityPowerRatio || 0) + itemValue('spellglass+iron-plate', 'ShieldBonusAP') / 100;
      }
      refreshEffectiveStats(unit);
    }
    const damageable = [...alive, ...objectives];
    // Choose targets and movement from one common snapshot. Movement is a
    // continuous process, independent of attack recovery. Once every body has
    // moved, both armies evaluate range from the same resulting positions.
    const actors = [...alive].sort(byId);
    const chooseEnemies = actor => {
      let enemies = damageable.filter(unit => unit.side !== actor.side && !(unit.itemRuntime?.untargetableUntil > battle.elapsed)).sort((a, b) => distance(actor, a) - distance(actor, b) || byId(a, b));
      const taunt = actor.statuses.filter(status => status.type === 'taunt').sort((a, b) => b.appliedAt - a.appliedAt || (a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0))[0];
      if (taunt) enemies = enemies.filter(enemy => enemy.id === taunt.sourceId);
      return enemies;
    };
    const movementPlans = [];
    for (const actor of actors) {
      actor.cooldown -= dt;
      const target = chooseEnemies(actor)[0];
      if (!target) continue;
      actor.targetId = target.id;
      if (distance(actor, target) > actor.range + GEOMETRY_EPSILON || !clearSight(game, actor, target)) movementPlans.push({ actor, target });
      else actor.navigationTurn = null;
    }
    for (const { actor, cell, from, duration } of simultaneousMoves(game, movementPlans, dt)) {
      Object.assign(actor, cell);
      actor.lastMove = { at: battle.elapsed, from, duration };
      actor.lastAction = { type: 'move', at: battle.elapsed, from, duration };
      emit({ type: 'move', unitId: actor.id, from, col: actor.col, row: actor.row });
    }
    if (Math.floor(battle.elapsed + GEOMETRY_EPSILON) > Math.floor(battle.elapsed - dt + GEOMETRY_EPSILON)) {
      for (const holder of alive.filter(unit => unit.itemRuntime)) {
        const nearby = alive.filter(unit => unit.side !== holder.side && distance(unit, holder) <= 2 + GEOMETRY_EPSILON);
        if (hasItem(holder, 'spellglass+veil-cloth')) for (const enemy of nearby)
          applyEffect({ actor: holder, victim: enemy, status: { type: 'shred', sourceId: holder.id,
            appliedAt: battle.elapsed, expiresAt: battle.elapsed + 1, magnitude: itemValue('spellglass+veil-cloth', 'MRShred') / 100, channel: 'item-aura' } });
        if (hasItem(holder, 'veil-cloth+vital-sash')) for (const enemy of nearby)
          applyEffect({ actor: holder, victim: enemy, status: { type: 'sunder', sourceId: holder.id,
            appliedAt: battle.elapsed, expiresAt: battle.elapsed + 1, magnitude: itemValue('veil-cloth+vital-sash', 'ARReductionAmount') / 100, channel: 'item-aura' } });
        if (hasItem(holder, 'iron-plate+vital-sash') && Math.floor(battle.elapsed) % itemValue('iron-plate+vital-sash', 'ICD') === 0) {
          const enemy = nearby.sort((a, b) => distance(holder, a) - distance(holder, b) || byId(a, b))[0];
          if (enemy) {
            const value = ITEMS.VALUES['iron-plate+vital-sash'];
            applyEffect({ actor: holder, victim: enemy, status: { type: 'burn', sourceId: holder.id,
              appliedAt: battle.elapsed, expiresAt: battle.elapsed + value.BurnDuration,
              damage: enemy.maxHp * value.BurnPercent / 100, tickInterval: 1, nextTick: battle.elapsed + 1, channel: 'item' } });
            applyEffect({ actor: holder, victim: enemy, status: { type: 'wound', sourceId: holder.id,
              appliedAt: battle.elapsed, expiresAt: battle.elapsed + value.BurnDuration,
              magnitude: value.GrievousWoundsPercent / 100, channel: 'item' } });
          }
        }
      }
    }
    if (battle.zoneDefense) {
      refreshZoneBenefits(game, dt, true);
      for (const unit of battle.units) if (unit.alive && unit.zoneModifiers?.hpRegen) {
        const amount = Math.min(unit.maxHp - unit.hp, unit.maxHp * unit.zoneModifiers.hpRegen * dt);
        if (amount > 0) { unit.hp += amount; emit({ type: 'zone-heal', unitId: unit.id, targetId: unit.id, amount }); }
      }
    }
    for (const actor of actors) {
      const enemies = chooseEnemies(actor), basicTarget = enemies[0];
      const castEnemies = enemies.filter(enemy => distance(actor, enemy) <= actor.abilityRange + GEOMETRY_EPSILON && clearSight(game, actor, enemy));
      const target = castEnemies[0];
      if (basicTarget) actor.targetId = basicTarget.id;
      function effect(victim, type, magnitude, duration = EFFECT_DURATION, extra = {}) {
        effects.push({ actor, victim, status: { type, sourceId: actor.id, appliedAt: battle.elapsed, expiresAt: battle.elapsed + duration, magnitude, ...extra } });
      }
      function targets(action) {
        const allEnemies = damageable.filter(unit => unit.side !== actor.side && clearSight(game, actor, unit));
        const allies = alive.filter(unit => unit.side === actor.side);
        let selected;
        if (action.target === 'target') selected = target ? [target] : [];
        // Global and local areas retain their explicitly authored reach. A
        // target-centered area first needs a primary target in ability range.
        else if (action.target === 'all-enemies') selected = allEnemies.sort(byId);
        else if (action.target === 'all-allies') selected = allies.sort(byId);
        else if (action.target === 'self') selected = [actor];
        else if (action.target === 'weakest-enemy') selected = [...castEnemies].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || byId(a, b)).slice(0, 1);
        else if (action.target === 'strongest-enemy') selected = [...castEnemies].sort((a, b) => b.effectiveAttack - a.effectiveAttack || byId(a, b)).slice(0, 1);
        else if (action.target === 'nearby-enemies') selected = allEnemies.filter(enemy => distance(actor, enemy) <= action.radius + 1e-9).sort(byId);
        else if (action.target === 'target-neighbors') selected = target ? allEnemies.filter(enemy => distance(target, enemy) <= action.radius + 1e-9).sort(byId) : [];
        else if (action.target === 'enemy-row') selected = target ? allEnemies.filter(enemy => Math.abs(enemy.row - target.row) <= 0.5).sort(byId) : [];
        else if (action.target === 'enemy-column') selected = target ? allEnemies.filter(enemy => Math.abs(enemy.col - target.col) <= 0.5).sort(byId) : [];
        else if (action.target === 'enemy-cross') selected = target ? allEnemies.filter(enemy => Math.abs(enemy.col - target.col) <= 0.5 || Math.abs(enemy.row - target.row) <= 0.5).sort(byId) : [];
        else if (action.target === 'wounded-allies') selected = allies.sort((a, b) => (b.maxHp - b.hp) - (a.maxHp - a.hp) || byId(a, b));
        else if (action.target === 'nearby-allies') selected = allies.filter(ally => distance(actor, ally) <= action.radius + 1e-9).sort(byId);
        else throw new Error('Unknown ability target: ' + action.target);
        // Objectives accept enemy damage and hostile statuses, never healing,
        // protection, or a friendly action. Ally selectors remain hero-only.
        selected = selected.filter(victim => victim.kind !== 'treasure' ||
          (victim.side !== actor.side && (['hit', 'burn'].includes(action.type) ||
            (action.type === 'status' && !['haste', 'empower'].includes(action.status)))));
        return action.count === undefined ? selected : selected.slice(0, action.count);
      }
      // A normal attack and a cast have separate readiness. A ready spell never
      // consumes or resets attack recovery, and attacking grants no generic AP.
      if (basicTarget && actor.effectiveSpeed > 0 && actor.cooldown <= GEOMETRY_EPSILON && distance(actor, basicTarget) <= actor.range + GEOMETRY_EPSILON && clearSight(game, actor, basicTarget)) {
        actor.attacks++;
        actor.cooldown = actor.effectiveAttackInterval;
        actor.lastAction = { type: 'attack', at: battle.elapsed, targetId: basicTarget.id };
        emit({ type: 'attack', unitId: actor.id, targetId: basicTarget.id, attackStyle: actor.normalAttack });
        if (hasItem(actor, 'forgeblade+mana-vial')) grantAbilityPoints(actor, itemValue('forgeblade+mana-vial', 'FlatManaRestore') * ITEMS.MANA_SCALE, 'item-attack');
        if (hasItem(actor, 'quickstring+vital-sash')) grantAbilityPoints(actor, itemValue('quickstring+vital-sash', 'BaseManaOnHit') * ITEMS.MANA_SCALE, 'item-attack');
        if (hasItem(actor, 'quickstring+veil-cloth')) {
          const cap = itemValue('quickstring+veil-cloth', 'MaxStacks');
          actor.itemRuntime.attackStacks = Math.min(cap, actor.itemRuntime.attackStacks + 1);
          actor.itemRuntime.attackRatio = actor.itemRuntime.attackStacks * itemValue('quickstring+veil-cloth', 'ADOnAttack');
          if (actor.itemRuntime.attackStacks === cap) actor.itemRuntime.speedRatio = itemValue('quickstring+veil-cloth', 'ASCapstone');
          refreshEffectiveStats(actor);
        }
        if (hasItem(actor, 'quickstring+iron-plate')) {
          const cap = itemValue('quickstring+iron-plate', 'StackCap');
          actor.itemRuntime.titanStacks = Math.min(cap, actor.itemRuntime.titanStacks + 1);
          actor.itemRuntime.attackRatio = actor.itemRuntime.titanStacks * itemValue('quickstring+iron-plate', 'StackingAD');
          actor.itemRuntime.abilityPowerRatio = actor.itemRuntime.titanStacks * itemValue('quickstring+iron-plate', 'StackingSP') / 100;
          if (actor.itemRuntime.titanStacks === cap) actor.itemRuntime.damageAmp = itemValue('quickstring+iron-plate', 'StackedAmp');
          refreshEffectiveStats(actor);
        }
        hits.push({ actor, victim: basicTarget, amount: actor.effectiveAttack + actor.attacks, ability: false, basic: true, pressure: actor.attacks });
        if (actor.shatterDamage && basicTarget.statuses.some(status => status.type === 'slow')) hits.push({ actor, victim: basicTarget, amount: actor.shatterDamage, ability: false, factionId: 'rime', shatter: true });
        if (actor.chillStrength) effect(basicTarget, 'slow', actor.chillStrength, EFFECT_DURATION, { channel: 'faction', factionId: 'rime' });
      }
      const resolvedActions = actor.abilityActions.map(action => ({ action, victims: targets(action) }));
      const useful = ({ action, victims }) => victims.some(victim => action.type !== 'heal' || victim.hp < victim.maxHp);
      if (actor.mana + GEOMETRY_EPSILON >= actor.maxMana && resolvedActions.some(useful)) {
        actor.mana = Math.max(0, actor.mana - actor.maxMana);
        const castTarget = target || resolvedActions.find(useful).victims[0];
        actor.lastAction = { type: 'ability', at: battle.elapsed, targetId: castTarget.id };
        emit({ type: 'ability', unitId: actor.id, name: actor.abilityName, abilityId: actor.abilityId, targetId: castTarget.id });
        for (const holder of alive.filter(unit => unit.side !== actor.side && hasItem(unit, 'spellglass+veil-cloth') && distance(unit, actor) <= itemValue('spellglass+veil-cloth', 'HexRange'))) {
          hits.push({ actor: holder, victim: actor, amount: actor.maxMana / ITEMS.MANA_SCALE * ITEMS.HEALTH_SCALE *
            itemValue('spellglass+veil-cloth', 'ManaRatio') / 100, ability: true, itemId: 'spellglass+veil-cloth' });
        }
        const itemAbilityMultiplier = 1 + (actor.itemRuntime?.abilityPowerRatio || 0) +
          (actor.itemRuntime?.handOfJustice && actor.hp / actor.maxHp > itemValue('mana-vial+lucky-grips', 'HealthThreshold')
            ? itemValue('mana-vial+lucky-grips', 'AP_NotStatBar') / 100 : 0);
        for (const { action, victims } of resolvedActions) {
          for (const victim of victims) for (let repeat = 0; repeat < (action.repeat ?? 1); repeat++) {
            if (action.type === 'hit') hits.push({ actor, victim, amount: actor.abilityScore * action.factor * actor.spellPower * itemAbilityMultiplier + actor.fireDamage, ability: true });
            else if (action.type === 'heal') heals.push({ actor, victim, amount: actor.abilityScore * action.factor * actor.healingPower * itemAbilityMultiplier });
            else if (action.type === 'shield') shields.push({ actor, victim, amount: actor.abilityScore * action.factor * actor.shieldPower * itemAbilityMultiplier });
            else if (action.type === 'status') {
              const potency = ['haste', 'empower'].includes(action.status) ? actor.buffPower : actor.debuffPower;
              effect(victim, action.status, action.magnitude * potency, action.duration ?? EFFECT_DURATION);
            } else if (action.type === 'burn') {
              const interval = action.interval ?? DOT_INTERVAL;
              effect(victim, 'burn', 0, action.duration ?? EFFECT_DURATION, { damage: actor.abilityScore * action.factor * actor.spellPower, tickInterval: interval, nextTick: battle.elapsed + interval });
            } else throw new Error('Unknown ability action: ' + action.type);
          }
        }
        const allied = alive.filter(unit => unit.side === actor.side);
        const wounded = [...allied].sort((a, b) => (b.maxHp - b.hp) - (a.maxHp - a.hp) || byId(a, b))[0];
        if (actor.castHealing) heals.push({ actor, victim: wounded, amount: actor.castHealing, factionId: 'verdant' });
        if (actor.castShield) {
          const recipients = actor.combatFaction === 'tide' ? (actor.factionComplete ? allied : [wounded]) : [actor];
          for (const victim of recipients) shields.push({ actor, victim, amount: actor.castShield, factionId: actor.combatFaction });
        }
        if (target && actor.combatFaction === 'ember' && actor.fireDamage) {
          const victims = actor.factionComplete ? damageable.filter(unit => unit.side !== actor.side && Math.abs(unit.row - target.row) <= 0.5 && clearSight(game, actor, unit)) : [target];
          for (const victim of victims) effect(victim, 'burn', 0, EFFECT_DURATION, { damage: actor.fireDamage, tickInterval: DOT_INTERVAL, nextTick: battle.elapsed + DOT_INTERVAL, channel: 'faction', factionId: 'ember' });
        }
        if (actor.manaGift) {
          const recipients = allied.filter(unit => unit.id !== actor.id).sort((a, b) => (b.maxMana - b.mana) - (a.maxMana - a.mana) || byId(a, b));
          const chosen = actor.factionComplete ? recipients : recipients.slice(0, 1);
          // One cast has one AP budget, shared rather than multiplied by allies.
          for (const victim of chosen) manaGifts.push({ actor, victim, amount: actor.manaGift / chosen.length });
        }
        if (target && actor.castSlow) effect(target, 'slow', actor.castSlow, EFFECT_DURATION, { channel: 'faction', factionId: 'dune' });
        if (target && actor.castWeakness) for (const victim of damageable.filter(unit => unit.side !== actor.side && Math.abs(unit.row - target.row) <= 0.5 && clearSight(game, actor, unit))) effect(victim, 'weakness', actor.castWeakness, EFFECT_DURATION, { channel: 'faction', factionId: 'dune' });
      }
    }
    for (const { actor, victim, amount } of manaGifts) {
      grantAbilityPoints(victim, amount, 'conduit', actor, { factionId: 'astral' });
    }
    effects.forEach(applyEffect);
    for (const { actor, victim = actor, amount, factionId } of shields) {
      victim.shield += amount;
      emit({ type: 'shield', unitId: actor.id, targetId: victim.id, amount, ...(factionId ? { factionId } : {}) });
    }
    heals.forEach(restore);
    const drained = new Map(), damageRecords = [];
    const healthBefore = new Map(damageable.map(unit => [unit.id, Math.max(0, unit.hp)]));
    let pendingHits = hits;
    while (pendingHits.length) {
      const resolved = pendingHits.map(packet => {
        const { actor, victim } = packet;
        if ((packet.basic || packet.ability) && victim.statuses) {
          if (hasItem(actor, 'quickstring+lucky-grips')) applyEffect({ actor, victim, status: {
            type: 'sunder', sourceId: actor.id, appliedAt: battle.elapsed,
            expiresAt: battle.elapsed + itemValue('quickstring+lucky-grips', 'ArmorBreakDuration'),
            magnitude: itemValue('quickstring+lucky-grips', 'ArmorReductionPercent') / 100, channel: 'item' } });
          if (hasItem(actor, 'quickstring+mana-vial')) applyEffect({ actor, victim, status: {
            type: 'shred', sourceId: actor.id, appliedAt: battle.elapsed,
            expiresAt: battle.elapsed + itemValue('quickstring+mana-vial', 'MRShredDuration'),
            magnitude: itemValue('quickstring+mana-vial', 'MRShred') / 100, channel: 'item' } });
        }
        let amount = packet.amount * (packet.ability && actor.zoneModifiers ? 1 + actor.zoneModifiers.damage : 1);
        if (actor.itemRuntime) {
          amount *= 1 + (actor.damageAmp || 0) + (actor.itemRuntime.damageAmp || 0);
          if (hasItem(actor, 'forgeblade+quickstring') && victim.heroId && CLASSES.find(entry => entry.id === heroById(victim.heroId)?.primaryClass)?.primaryArchetype === 'tank')
            amount *= 1 + itemValue('forgeblade+quickstring', 'DamageAmp');
          if (packet.basic && actor.itemRuntime.handOfJustice && actor.hp / actor.maxHp > itemValue('mana-vial+lucky-grips', 'HealthThreshold'))
            amount *= 1 + itemValue('mana-vial+lucky-grips', 'AD_NotStatBar');
        }
        const canCrit = packet.basic || packet.ability && hasItem(actor, 'spellglass+lucky-grips');
        if (canCrit && actor.critChance > 0) {
            const roll = makeRandom((game.token.battleSeed || 'items') + ':critical:' + battle.tick + ':' + actor.id + ':' + victim.id + ':' + (packet.pressure || 0))();
            if (roll < Math.min(1, actor.critChance)) {
              amount *= 1.4;
              packet.critical = true;
              if (actor.itemRuntime && hasItem(actor, 'vital-sash+lucky-grips')) actor.itemRuntime.damageAmp = Math.min(
                itemValue('vital-sash+lucky-grips', 'MaxStacks') * itemValue('vital-sash+lucky-grips', 'BuffDamageAmp'),
                (actor.itemRuntime.damageAmp || 0) + itemValue('vital-sash+lucky-grips', 'BuffDamageAmp'));
              if (packet.basic && hasItem(actor, 'quickstring+vital-sash')) grantAbilityPoints(actor,
                (itemValue('quickstring+vital-sash', 'ManaOnCrit') - itemValue('quickstring+vital-sash', 'BaseManaOnHit')) * ITEMS.MANA_SCALE, 'item-critical');
            }
        }
        let armor = packet.ability && victim.magicResist !== undefined ? victim.magicResist : victim.armor;
        if (hasItem(victim, 'iron-plate+veil-cloth')) armor +=
          alive.filter(enemy => enemy.side !== victim.side && enemy.targetId === victim.id).length *
          itemValue('iron-plate+veil-cloth', packet.ability ? 'MRPerEnemy' : 'ArmorPerEnemy');
        if (hasItem(victim, 'veil-cloth+vital-sash') && battle.elapsed <= itemValue('veil-cloth+vital-sash', 'BonusResistDuration'))
          armor += itemValue('veil-cloth+vital-sash', 'BonusResists');
        const reduction = Math.max(0, ...victim.statuses.filter(status => status.type === (packet.ability ? 'shred' : 'sunder')).map(status => status.magnitude));
        const resists = armor * (1 - reduction);
        const durability = packet.basic && hasItem(victim, 'iron-plate+iron-plate') ? itemValue('iron-plate+iron-plate', 'AutoDamageReduction') : 0;
        const steadfast = hasItem(victim, 'iron-plate+lucky-grips') ? victim.hp / victim.maxHp > itemValue('iron-plate+lucky-grips', 'ThresholdForEmpower')
          ? itemValue('iron-plate+lucky-grips', 'EmpoweredDurability') : itemValue('iron-plate+lucky-grips', 'BaseDurability') : 0;
        amount *= 1 - durability;
        amount *= 1 - steadfast;
        return { ...packet, amount, postArmor: packet.trueDamage ? amount : amount * 100 / (100 + resists / (1 + actor.armorPierce)) };
      });
      const totals = new Map();
      for (const packet of resolved) totals.set(packet.victim.id, (totals.get(packet.victim.id) || 0) + packet.postArmor);
      const pools = new Map();
      for (const victim of damageable) if (totals.has(victim.id)) {
        const total = totals.get(victim.id), absorbed = Math.min(victim.shield, total);
        if (victim.itemRuntime && victim.hp - (total - absorbed) <= victim.maxHp * .6) {
          const trigger = (id, threshold, shieldRatio) => {
            if (!hasItem(victim, id) || victim.itemRuntime.triggered.includes(id) || victim.hp - (total - absorbed) > victim.maxHp * threshold) return;
            victim.itemRuntime.triggered.push(id);
            const amount = victim.maxHp * shieldRatio;victim.shield += amount;
            emit({ type: 'item-shield', unitId: victim.id, itemId: id, amount });
          };
          trigger('forgeblade+vital-sash', itemValue('forgeblade+vital-sash', 'HealthThreshold') / 100, itemValue('forgeblade+vital-sash', 'PercentHealthShield'));
          trigger('forgeblade+veil-cloth', itemValue('forgeblade+veil-cloth', 'HealthThreshold') / 100, itemValue('forgeblade+veil-cloth', 'ShieldHealthPercent') / 100);
          trigger('mana-vial+iron-plate', itemValue('mana-vial+iron-plate', 'HealthThreshold') / 100, itemValue('mana-vial+iron-plate', 'ShieldHealthPercent') / 100);
          if (hasItem(victim, 'forgeblade+iron-plate') && !victim.itemRuntime.triggered.includes('forgeblade+iron-plate') && victim.hp - (total - absorbed) <= victim.maxHp * itemValue('forgeblade+iron-plate', 'HealthThreshold') / 100) {
            victim.itemRuntime.triggered.push('forgeblade+iron-plate');
            victim.itemRuntime.untargetableUntil = battle.elapsed + itemValue('forgeblade+iron-plate', 'StealthDuration');
            victim.statuses = victim.statuses.filter(status => !['slow', 'weakness', 'burn', 'wound', 'sunder', 'shred', 'taunt'].includes(status.type));
            const healed = (victim.maxHp - victim.hp) * itemValue('forgeblade+iron-plate', 'MissingHealthRestore');
            victim.hp += healed; emit({ type: 'item-heal', unitId: victim.id, itemId: 'forgeblade+iron-plate', amount: healed });
          }
        }
        const effectiveAbsorbed = Math.min(victim.shield, total);
        pools.set(victim.id, { total, absorbed: effectiveAbsorbed, healthDamage: Math.min(Math.max(0, victim.hp), total - effectiveAbsorbed) });
        victim.shield -= effectiveAbsorbed;
        victim.hp -= total - effectiveAbsorbed;
      }
      pendingHits = [];
      for (const packet of resolved) {
        const { actor, victim, amount, ability, basic, dot, reflected, shatter, factionId, postArmor, pressure = 0 } = packet;
        const pool = pools.get(victim.id), share = pool.total > 0 ? postArmor / pool.total : 0;
        const absorbed = pool.absorbed * share, healthDamage = pool.healthDamage * share;
        const actual = postArmor - absorbed;
        // Lingering damage may outlive its source. Reflect only into this tick's
        // living snapshot; a source taking lethal damage this tick still qualifies.
        if (absorbed > 0 && victim.reflectionRatio && !reflected && alive.includes(actor)) pendingHits.push({ actor: victim, victim: actor, amount: absorbed * victim.reflectionRatio, reflected: true, factionId: 'iron' });
        const justiceLifesteal = actor.itemRuntime?.handOfJustice && actor.hp / actor.maxHp <= itemValue('mana-vial+lucky-grips', 'HealthThreshold')
          ? itemValue('mana-vial+lucky-grips', 'StatOmnivamp_NotStatBar') : 0;
        drained.set(actor.id, (drained.get(actor.id) || 0) + healthDamage * (actor.lifesteal + justiceLifesteal));
        if (healthDamage > 0 && hasItem(actor, 'forgeblade+spellglass')) {
          const teammate = alive.filter(unit => unit.side === actor.side).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || byId(a, b))[0];
          if (teammate) restore({ actor, victim: teammate, amount: healthDamage * itemValue('forgeblade+spellglass', 'AllyHealing') });
        }
        if (!reflected && victim.itemRuntime && healthDamage + absorbed > 0 && hasItem(victim, 'quickstring+iron-plate')) {
          const cap = itemValue('quickstring+iron-plate', 'StackCap');
          victim.itemRuntime.titanStacks = Math.min(cap, victim.itemRuntime.titanStacks + 1);
          victim.itemRuntime.attackRatio = victim.itemRuntime.titanStacks * itemValue('quickstring+iron-plate', 'StackingAD');
          victim.itemRuntime.abilityPowerRatio = victim.itemRuntime.titanStacks * itemValue('quickstring+iron-plate', 'StackingSP') / 100;
          if (victim.itemRuntime.titanStacks === cap) victim.itemRuntime.damageAmp = itemValue('quickstring+iron-plate', 'StackedAmp');
          refreshEffectiveStats(victim);
        }
        if (basic && !reflected && hasItem(victim, 'iron-plate+iron-plate') &&
          (victim.itemRuntime.lastThornAt === undefined || battle.elapsed - victim.itemRuntime.lastThornAt >= itemValue('iron-plate+iron-plate', 'ICD'))) {
          victim.itemRuntime.lastThornAt = battle.elapsed;
          for (const enemy of damageable.filter(unit => unit.side !== victim.side && distance(unit, victim) <= 1 + GEOMETRY_EPSILON))
            pendingHits.push({ actor: victim, victim: enemy, amount: itemValue('iron-plate+iron-plate', '1StarAoEDamage') * ITEMS.HEALTH_SCALE, ability: true, reflected: true, itemId: 'iron-plate+iron-plate' });
        }
        if ((basic || ability) && !dot && !reflected && victim.statuses) {
          const burnId = hasItem(actor, 'quickstring+quickstring') ? 'quickstring+quickstring'
            : hasItem(actor, 'spellglass+vital-sash') ? 'spellglass+vital-sash' : null;
          if (burnId) {
            const value = ITEMS.VALUES[burnId], duration = value.BurnDuration || value.Duration;
            applyEffect({ actor, victim, status: { type: 'burn', sourceId: actor.id, appliedAt: battle.elapsed,
              expiresAt: battle.elapsed + duration, damage: victim.maxHp * value.BurnPercent / 100,
              tickInterval: 1, nextTick: battle.elapsed + 1, channel: 'item' } });
            applyEffect({ actor, victim, status: { type: 'wound', sourceId: actor.id, appliedAt: battle.elapsed,
              expiresAt: battle.elapsed + duration, magnitude: (value.HealingReductionPct || value.GrievousWoundsPercent) / 100, channel: 'item' } });
          }
        }
        damageRecords.push({ actor, victim, ability, basic, dot, reflected, absorbed, healthDamage });
        emit({ type: reflected ? 'reflect-hit' : shatter ? 'shatter-hit' : dot ? 'dot-hit' : ability ? 'spell-hit' : 'hit', unitId: actor.id, targetId: victim.id,
          amount: actual, rawAmount: amount, postArmor, healthDamage, absorbed, pressure,
          pressureDamage: amount > 0 ? postArmor * pressure / amount : 0,
          ...(dot ? { status: 'burn' } : {}), ...(factionId ? { factionId } : {}) });
      }
    }
    // Job AP is evaluated after all hits, from their actual simultaneous health
    // and shield losses. It can fund the next decision, never a recursive cast
    // within this one. Normalized pools avoid per-hit and per-status AP farming.
    for (const beneficiary of alive) {
      const trigger = ABILITY_PROFILES[beneficiary.abilityProfile]?.trigger;
      if (!trigger) continue;
      const nearbyAllies = alive.filter(unit => unit.side === beneficiary.side && distance(beneficiary, unit) <= beneficiary.abilityRange + GEOMETRY_EPSILON);
      const otherAllies = nearbyAllies.filter(unit => unit.id !== beneficiary.id);
      const hpPool = units => units.reduce((sum, unit) => sum + unit.maxHp, 0);
      const hasOwnHex = unit => unit.statuses.some(status => status.sourceId === beneficiary.id && ['burn', 'slow', 'weakness'].includes(status.type));
      const hexedEnemies = damageable.filter(unit => unit.side !== beneficiary.side && hasOwnHex(unit));
      const burnedEnemies = damageable.filter(unit => unit.side !== beneficiary.side && unit.statuses.some(status => status.sourceId === beneficiary.id && status.type === 'burn'));
      const directAbilityEnemies = [...new Set(damageRecords.filter(record => record.actor.id === beneficiary.id && record.actor.side !== record.victim.side && record.ability && !record.dot && !record.reflected).map(record => record.victim))];
      let fraction = 0;
      for (const record of damageRecords) {
        const { actor, victim, ability, basic, dot, reflected, absorbed, healthDamage } = record;
        if (reflected || actor.side === victim.side) continue;
        const dealt = healthDamage + absorbed;
        if (trigger === 'self-damage' && victim.id === beneficiary.id) fraction += dealt / beneficiary.maxHp;
        else if (trigger === 'ally-pressure' && otherAllies.includes(victim)) fraction += dealt / hpPool(otherAllies);
        else if (trigger === 'ally-health-damage' && nearbyAllies.includes(victim)) fraction += healthDamage / hpPool(nearbyAllies);
        else if (trigger === 'ally-damage-dealt' && otherAllies.includes(actor)) fraction += dealt / hpPool(otherAllies);
        else if (trigger === 'ability-damage' && actor.id === beneficiary.id && ability && !dot) fraction += dealt / hpPool(directAbilityEnemies);
        else if (trigger === 'basic-damage' && actor.id === beneficiary.id && basic) fraction += dealt / victim.maxHp;
        else if (trigger === 'distant-damage' && actor.id === beneficiary.id && distance(actor, victim) > 1 + GEOMETRY_EPSILON) fraction += dealt / victim.maxHp;
        else if (trigger === 'wounded-damage' && actor.id === beneficiary.id) fraction += dealt / victim.maxHp * Math.max(0, 1 - (healthBefore.get(victim.id) || 0) / victim.maxHp);
        else if (trigger === 'dot-damage' && actor.id === beneficiary.id && dot) fraction += dealt / (hpPool(burnedEnemies) || victim.maxHp);
        else if (trigger === 'hex-damage' && actor.side === beneficiary.side && hexedEnemies.includes(victim)) fraction += dealt / hpPool(hexedEnemies);
      }
      if (fraction > 0) grantAbilityPoints(beneficiary, beneficiary.maxMana * fraction, trigger, beneficiary, { classId: beneficiary.abilityProfile, damageFraction: fraction });
    }
    // Damage-based hero AP and lifesteal inherit normal enemy-target behavior.
    // Objective damage never enters ally HP pools or hero defeat bonuses.
    for (const chest of objectives) if (chest.hp <= 0) {
      chest.hp = 0; chest.status = 'defeated'; chest.statuses = [];
      chest.defeatedAtSeconds = battle.elapsed;
      chest.captorSide = chest.side === 'player' ? 'enemy' : 'player';
      emit({ type: chest.rewardKind === 'cherub' ? 'cherub-defeated' : 'treasure-defeated',
        ...(chest.rewardKind === 'cherub' ? { cherubId: chest.id } : { chestId: chest.id }), ownerSide: chest.side,
        captorSide: chest.captorSide, defeatedAtSeconds: battle.elapsed });
    }
    const fallen = [];
    for (const actor of alive) {
      // A simultaneous lethal hit cannot be undone by lifesteal.
      if (actor.hp > 0) {
        const amount = Math.min(actor.maxHp - actor.hp, drained.get(actor.id) || 0);
        actor.hp += amount;
        if (amount > 0) emit({ type: 'heal', unitId: actor.id, targetId: actor.id, amount, factionId: 'hollow' });
      }
      else {
        actor.hp = 0; actor.alive = false; actor.statuses = [];
        actor.lastAction = { type: 'death', at: battle.elapsed };
        emit({ type: 'death', unitId: actor.id }); fallen.push(actor);
      }
    }
    for (const defeated of fallen) {
      if (defeated.temporary) continue; // Temporary copies cannot farm defeat-trigger rewards.
      if (defeated.deathHealing) for (const victim of battle.units.filter(unit => unit.alive && unit.side === defeated.side)) restore({ actor: defeated, victim, amount: defeated.deathHealing, factionId: 'verdant' });
      for (const actor of battle.units.filter(unit => unit.alive && unit.side !== defeated.side && unit.harvestHaste)) applyEffect({ actor, victim: actor, status: { type: 'haste', sourceId: actor.id, appliedAt: battle.elapsed, expiresAt: battle.elapsed + EFFECT_DURATION, magnitude: actor.harvestHaste * actor.buffPower, channel: 'faction', factionId: 'hollow' } });
    }
    // Release attention immediately on the taunter’s defeat, including between
    // fixed simulation steps; movement/target selection resumes next decision.
    for (const unit of battle.units.filter(item => item.alive)) {
      unit.statuses = unit.statuses.filter(status => {
        if (status.type !== 'taunt' || battle.units.some(item => item.id === status.sourceId && item.alive)) return true;
        emit({ type: 'status-expired', unitId: status.sourceId, targetId: unit.id, status: 'taunt', reason: 'source-defeated' });
        unit.targetId = null;
        return false;
      });
      refreshEffectiveStats(unit);
    }
    if (battle.zoneDefense) refreshZoneBenefits(game, 0, false);
    settle(game);
  }

  // 20 simulation decisions per second is authored animation/combat fidelity,
  // not a duration cap. Rendering can supply any non-negative elapsed delta.
  const FIXED_STEP = 1 / 20;
  function step(game, dt) {
    if (!Number.isFinite(dt) || dt < 0) throw new Error('Step duration must be a finite non-negative number.');
    if (game.phase !== 'battle') return game;
    game.battle.accumulator += dt;
    while (game.battle.accumulator + 1e-9 >= FIXED_STEP && game.phase === 'battle') {
      game.battle.accumulator -= FIXED_STEP;
      tick(game, FIXED_STEP);
    }
    return game;
  }

  function resetBattle(game) {
    game.phase = 'planning'; game.battle = null; game.result = null;
    return game;
  }

  const AB = { DEFAULT_CONFIG, ABILITY_PROFILES, SPAWN_RARITY, spawnOdds, ARCHETYPES, FACTIONS, CLASSES, ROSTER, heroById, makeRandom, generate, createGame, deploy, recall, mergeGroups, combine, synergies, deriveStats, cherubMaxHp, cherubObjectives, bodyProfile, MOVE_SPEED, MIME_STATS, previewCombatUnits, startBattle, step, resetBattle, FIXED_STEP };
  if (typeof module !== 'undefined' && module.exports) module.exports = AB;
  root.AB = AB;
})(typeof globalThis !== 'undefined' ? globalThis : this);
