/* Original named characters and individual signature abilities. Values, including each hero’s distinct base AP regeneration, are authored prototype tuning. */
(function(root){
'use strict';
const catalog={
  "factions": {
    "ember": {
      "lineage": "Volcanic drakekin",
      "appearance": "Scales, horns, tails and living embers distinguish the drakekin.",
      "strategy": "Brakka and Pik anchor Sythra and Vikka’s fast attacks; Korrun supports Avara, Vezhra and Aereth’s spell formation. Five drakekin leave room for class partners; all ten fill a level-10 board."
    },
    "tide": {
      "lineage": "Reef and abyssal creatures",
      "appearance": "Gills, fins, shells, tentacles and deep-sea lures make the reef kin unmistakable.",
      "strategy": "Oruun and Ghorl protect Nemi, Ilyth and Salka through a steady mid-cost curve. Complete the reef for layered protection, or trade a faction slot for an outside damage partner."
    },
    "verdant": {
      "lineage": "Living flora and fungi",
      "appearance": "Bark, roots, petals, fungal caps and carnivorous leaves form living bodies.",
      "strategy": "Tharn buys time for Morrow and Lumae to sustain Serris or Nyss. The low-to-mid-cost choir favors melee pressure and needs outside ranged damage when a packed frontline stalls."
    },
    "hollow": {
      "lineage": "Undead and spectral beings",
      "appearance": "Exposed bone, hollow faces, reliquaries and translucent spirit bodies mark the assembly.",
      "strategy": "Verrik and Veyl pressure targets while Dolma controls lines and Ossick restores them. An outside defender can anchor the lower-cost four until the expensive Kharrow joins them."
    },
    "iron": {
      "lineage": "Forged mechanical constructs",
      "appearance": "Gears, riveted plates, segmented limbs and luminous lenses replace flesh.",
      "strategy": "Gromet and Tessik hold a formation for Kern and Bolgrin while Ferrix suppresses enemy carries. This mid-to-high-cost team trades cheap starters for specialized protection, repair and damage."
    },
    "astral": {
      "lineage": "Celestial lifeforms",
      "appearance": "Crystalline or nebulous bodies, halos, orbiting fragments and strange eyes reveal star-born life.",
      "strategy": "Aelune and Selkor protect Orryx and Vaelis while Zevra hunts a dangerous foe. Mixed caster teams add shared-class bonuses; the full accord trades fast melee attacks for spell power and healing."
    },
    "dune": {
      "lineage": "Desert beastkin",
      "appearance": "Scarab shells, scorpion tails, jackal muzzles, fennec ears and cobra hoods identify the dune kin.",
      "strategy": "Khepru guards Jassar as Zikra and Seshra weaken enemies; Razi connects attacks and healing. Its full cost span offers a flexible core, with outside tanks or casters competing for faction slots."
    },
    "silk": {
      "lineage": "Silken mothkin",
      "appearance": "Feathery antennae, downy bodies and patterned wings range from long lunar tails to immense atlas canopies.",
      "strategy": "Luneth and Orruma layer support while Thimri empowers allies and Vespera disrupts enemies. Four mothkin complete a compact support team; outside heroes supply concentrated ranged damage."
    },
    "rime": {
      "lineage": "Arctic beasts",
      "appearance": "Dense fur, snowy feathers, curved tusks and frost-laden paws distinguish the polar kin.",
      "strategy": "Boruun holds the line, Urvek restores allies and Soryn suppresses a priority target. This mid-cost trio links six classes but needs partners to activate those traits or add rapid damage."
    },
    "gargoyle": {
      "lineage": "Living winged stone",
      "appearance": "Carved stone muscles, weathered seams and cathedral wings bring monumental guardians to life.",
      "strategy": "Elyra guards allies while Kharvox breaks clustered enemies. The 3/5-cost duo completes its faction in two slots, leaving room for shared-class partners, healing and focused damage."
    }
  },
  "heroes": [
    {
      "id": "ember-vanguard",
      "abilityRegen": 0.91,
      "name": "Brakka",
      "title": "Ash Marshal",
      "species": "Basalt drake",
      "primaryClass": "vanguard",
      "secondaryClass": null,
      "ability": {
        "id": "brakka-basalt-challenge",
        "name": "Basalt Challenge",
        "description": "Draw nearby attacks, raise a stone shield and slow foes with an impact strike.",
        "actions": [
          {
            "type": "hit",
            "target": "target",
            "factor": 0.9
          },
          {
            "type": "shield",
            "target": "self",
            "factor": 1
          },
          {
            "type": "status",
            "target": "nearby-enemies",
            "status": "taunt",
            "magnitude": 0,
            "radius": 2
          },
          {
            "type": "status",
            "target": "nearby-enemies",
            "status": "slow",
            "magnitude": 0.25,
            "radius": 2
          }
        ]
      },
      "faction": "ember",
      "cost": 1
    },
    {
      "id": "ember-duelist",
      "abilityRegen": 1.86,
      "name": "Sythra",
      "title": "Flame Dancer",
      "species": "Fire newt",
      "primaryClass": "duelist",
      "secondaryClass": "arcanist",
      "ability": {
        "id": "sythra-molten-pirouette",
        "name": "Molten Pirouette",
        "description": "Cut twice, then scatter burning sparks into every adjacent enemy.",
        "actions": [
          {
            "type": "hit",
            "target": "target",
            "factor": 0.85,
            "repeat": 2
          },
          {
            "type": "hit",
            "target": "nearby-enemies",
            "factor": 0.45,
            "radius": 1
          },
          {
            "type": "burn",
            "target": "nearby-enemies",
            "factor": 0.2,
            "radius": 1
          }
        ]
      },
      "faction": "ember",
      "cost": 2
    },
    {
      "id": "ember-artificer",
      "abilityRegen": 1.03,
      "name": "Pik",
      "title": "Spark Smith",
      "species": "Furnace salamander",
      "primaryClass": "artificer",
      "secondaryClass": null,
      "ability": {
        "id": "pik-bellows-mend",
        "name": "Bellows Mend",
        "description": "Repair the most wounded ally, empower their attacks and vent a shock into a foe.",
        "actions": [
          {
            "type": "heal",
            "target": "wounded-allies",
            "factor": 1.8,
            "count": 1
          },
          {
            "type": "status",
            "target": "wounded-allies",
            "status": "empower",
            "magnitude": 0.18,
            "count": 1
          },
          {
            "type": "hit",
            "target": "target",
            "factor": 1.1
          }
        ]
      },
      "faction": "ember",
      "cost": 2
    },
    {
      "id": "ember-ranger",
      "abilityRegen": 0.72,
      "name": "Avara",
      "title": "Cinderwing",
      "species": "Ash wyvern",
      "primaryClass": "ranger",
      "secondaryClass": "stormcaller",
      "ability": {
        "id": "avara-ashwing-skewer",
        "name": "Ashwing Skewer",
        "description": "Pierce the target row with a burning feather volley and slow the primary target.",
        "actions": [
          {
            "type": "hit",
            "target": "enemy-row",
            "factor": 2
          },
          {
            "type": "burn",
            "target": "enemy-row",
            "factor": 0.35
          },
          {
            "type": "status",
            "target": "target",
            "status": "slow",
            "magnitude": 0.2
          }
        ]
      },
      "faction": "ember",
      "cost": 4
    },
    {
      "id": "ember-stormcaller",
      "abilityRegen": 0.94,
      "name": "Vezhra",
      "title": "Cinder Tempest",
      "species": "Three-headed ember hydra",
      "primaryClass": "stormcaller",
      "secondaryClass": "arcanist",
      "ability": {
        "id": "vezhra-threefold-cataclysm",
        "name": "Threefold Cataclysm",
        "description": "Three heads erupt along the target row and column, burning and weakening those enemies.",
        "actions": [
          {
            "type": "hit",
            "target": "enemy-cross",
            "factor": 0.75
          },
          {
            "type": "burn",
            "target": "enemy-cross",
            "factor": 0.6
          },
          {
            "type": "status",
            "target": "enemy-cross",
            "status": "weakness",
            "magnitude": 0.2
          }
        ]
      },
      "faction": "ember",
      "cost": 5
    },
    {
      "id": "tide-mender",
      "abilityRegen": 1.06,
      "name": "Nemi",
      "title": "Foam Tender",
      "species": "Reef axolotl",
      "primaryClass": "mender",
      "secondaryClass": null,
      "ability": {
        "id": "nemi-foam-cradle",
        "name": "Foam Cradle",
        "description": "Wrap two wounded allies in restorative foam and haste, then flick a bubble at a foe.",
        "actions": [
          {
            "type": "heal",
            "target": "wounded-allies",
            "factor": 1.3,
            "count": 2
          },
          {
            "type": "status",
            "target": "wounded-allies",
            "status": "haste",
            "magnitude": 0.12,
            "count": 2
          },
          {
            "type": "hit",
            "target": "target",
            "factor": 0.7
          }
        ]
      },
      "faction": "tide",
      "cost": 1
    },
    {
      "id": "tide-sentinel",
      "abilityRegen": 0.9,
      "name": "Oruun",
      "title": "Shell Aegis",
      "species": "Reef turtle",
      "primaryClass": "sentinel",
      "secondaryClass": null,
      "ability": {
        "id": "oruun-reef-refuge",
        "name": "Reef Refuge",
        "description": "Shield nearby allies, restore the most wounded ally and draw nearby enemies toward your shell.",
        "actions": [
          {
            "type": "shield",
            "target": "nearby-allies",
            "factor": 1.2,
            "radius": 2
          },
          {
            "type": "heal",
            "target": "wounded-allies",
            "factor": 1.2,
            "count": 1
          },
          {
            "type": "status",
            "target": "nearby-enemies",
            "status": "taunt",
            "magnitude": 0,
            "radius": 3
          },
          {
            "type": "hit",
            "target": "target",
            "factor": 0.7
          }
        ]
      },
      "faction": "tide",
      "cost": 2
    },
    {
      "id": "tide-ranger",
      "abilityRegen": 0.7,
      "name": "Salka",
      "title": "Brine Harrier",
      "species": "Spined seahorse",
      "primaryClass": "ranger",
      "secondaryClass": "assassin",
      "ability": {
        "id": "salka-brine-harpoon",
        "name": "Brine Harpoon",
        "description": "Harpoon the most wounded enemy, weaken it and quicken your next attacks.",
        "actions": [
          {
            "type": "hit",
            "target": "weakest-enemy",
            "factor": 2.7
          },
          {
            "type": "status",
            "target": "weakest-enemy",
            "status": "weakness",
            "magnitude": 0.2
          },
          {
            "type": "status",
            "target": "self",
            "status": "haste",
            "magnitude": 0.15
          }
        ]
      },
      "faction": "tide",
      "cost": 3
    },
    {
      "id": "tide-arcanist",
      "abilityRegen": 1.47,
      "name": "Ilyth",
      "title": "Pearl Oracle",
      "species": "Pearl cuttlefish",
      "primaryClass": "arcanist",
      "secondaryClass": "mender",
      "ability": {
        "id": "ilyth-pearlescent-bloom",
        "name": "Pearlescent Bloom",
        "description": "Detonate a pearl around the target; its returning light heals nearby allies and empowers a wounded ally.",
        "actions": [
          {
            "type": "hit",
            "target": "target-neighbors",
            "factor": 0.9,
            "radius": 1
          },
          {
            "type": "heal",
            "target": "nearby-allies",
            "factor": 0.85,
            "radius": 2
          },
          {
            "type": "status",
            "target": "wounded-allies",
            "status": "empower",
            "magnitude": 0.12,
            "count": 1
          }
        ]
      },
      "faction": "tide",
      "cost": 3
    },
    {
      "id": "tide-hexbinder",
      "abilityRegen": 0.88,
      "name": "Ghorl",
      "title": "Undertow Binder",
      "species": "Abyssal anglerfish",
      "primaryClass": "vanguard",
      "secondaryClass": "hexbinder",
      "ability": {
        "id": "ghorl-abyssal-lure",
        "name": "Abyssal Lure",
        "description": "Raise a shield and lure nearby foes into a weakening, burning abyssal glow.",
        "actions": [
          {
            "type": "shield",
            "target": "self",
            "factor": 1.5
          },
          {
            "type": "status",
            "target": "nearby-enemies",
            "status": "taunt",
            "magnitude": 0,
            "radius": 3
          },
          {
            "type": "burn",
            "target": "nearby-enemies",
            "factor": 0.5,
            "radius": 2
          },
          {
            "type": "status",
            "target": "nearby-enemies",
            "status": "weakness",
            "magnitude": 0.25,
            "radius": 2
          },
          {
            "type": "hit",
            "target": "target",
            "factor": 0.5
          }
        ]
      },
      "faction": "tide",
      "cost": 4
    },
    {
      "id": "verdant-mender",
      "abilityRegen": 1.02,
      "name": "Lumae",
      "title": "Bloom Weaver",
      "species": "Lotus sprite",
      "primaryClass": "mender",
      "secondaryClass": null,
      "ability": {
        "id": "lumae-lotus-reprieve",
        "name": "Lotus Reprieve",
        "description": "Unfurl petals around two wounded allies to heal and shield them while a thorn strikes a foe.",
        "actions": [
          {
            "type": "heal",
            "target": "wounded-allies",
            "factor": 1.2,
            "count": 2
          },
          {
            "type": "shield",
            "target": "wounded-allies",
            "factor": 0.8,
            "count": 2
          },
          {
            "type": "hit",
            "target": "target",
            "factor": 0.6
          }
        ]
      },
      "faction": "verdant",
      "cost": 1
    },
    {
      "id": "verdant-hexbinder",
      "abilityRegen": 0.75,
      "name": "Morrow",
      "title": "Root Hexer",
      "species": "Mycelial mushroom",
      "primaryClass": "hexbinder",
      "secondaryClass": "mender",
      "ability": {
        "id": "morrow-spore-exchange",
        "name": "Spore Exchange",
        "description": "Infect a clustered enemy group with weakening spores and restore the most wounded ally.",
        "actions": [
          {
            "type": "burn",
            "target": "target-neighbors",
            "factor": 0.35,
            "radius": 1
          },
          {
            "type": "status",
            "target": "target-neighbors",
            "status": "weakness",
            "magnitude": 0.2,
            "radius": 1
          },
          {
            "type": "heal",
            "target": "wounded-allies",
            "factor": 1.5,
            "count": 1
          }
        ]
      },
      "faction": "verdant",
      "cost": 2
    },
    {
      "id": "verdant-vanguard",
      "abilityRegen": 0.93,
      "name": "Tharn",
      "title": "Thorn Sentinel",
      "species": "Ancient oak ent",
      "primaryClass": "vanguard",
      "secondaryClass": null,
      "ability": {
        "id": "tharn-rootbound-stand",
        "name": "Rootbound Stand",
        "description": "Root into a thick self-shield, mend your bark and draw attention while branches strike adjacent foes.",
        "actions": [
          {
            "type": "status",
            "target": "nearby-enemies",
            "status": "taunt",
            "magnitude": 0,
            "radius": 2
          },
          {
            "type": "shield",
            "target": "self",
            "factor": 1.8
          },
          {
            "type": "heal",
            "target": "self",
            "factor": 0.6
          },
          {
            "type": "hit",
            "target": "nearby-enemies",
            "factor": 0.7,
            "radius": 1
          }
        ]
      },
      "faction": "verdant",
      "cost": 3
    },
    {
      "id": "verdant-duelist",
      "abilityRegen": 1.8,
      "name": "Serris",
      "title": "Petal Blade",
      "species": "Orchid mantis",
      "primaryClass": "duelist",
      "secondaryClass": null,
      "ability": {
        "id": "serris-petal-scissors",
        "name": "Petal Scissors",
        "description": "Shear the target with three petal-blade cuts, then empower your own attacks.",
        "actions": [
          {
            "type": "hit",
            "target": "target",
            "factor": 0.75,
            "repeat": 3
          },
          {
            "type": "status",
            "target": "self",
            "status": "empower",
            "magnitude": 0.18
          }
        ]
      },
      "faction": "verdant",
      "cost": 2
    },
    {
      "id": "verdant-assassin",
      "abilityRegen": 0.68,
      "name": "Nyss",
      "title": "Nettle Shade",
      "species": "Pitcher-plant stalker",
      "primaryClass": "assassin",
      "secondaryClass": "hexbinder",
      "ability": {
        "id": "nyss-nectar-trap",
        "name": "Nectar Trap",
        "description": "Finish a wounded enemy with a venomous strike; leave it weakened and burning while feeding your own health.",
        "actions": [
          {
            "type": "hit",
            "target": "weakest-enemy",
            "factor": 2.2
          },
          {
            "type": "burn",
            "target": "weakest-enemy",
            "factor": 0.6
          },
          {
            "type": "status",
            "target": "weakest-enemy",
            "status": "weakness",
            "magnitude": 0.25
          },
          {
            "type": "heal",
            "target": "self",
            "factor": 0.8
          }
        ]
      },
      "faction": "verdant",
      "cost": 4
    },
    {
      "id": "hollow-assassin",
      "abilityRegen": 0.66,
      "name": "Verrik",
      "title": "Silent Knife",
      "species": "Skeletal raven",
      "primaryClass": "assassin",
      "secondaryClass": null,
      "ability": {
        "id": "verrik-raven-claim",
        "name": "Raven Claim",
        "description": "Dive into a wounded foe with a weakening strike and claim power for your own attacks.",
        "actions": [
          {
            "type": "hit",
            "target": "weakest-enemy",
            "factor": 2.5
          },
          {
            "type": "status",
            "target": "weakest-enemy",
            "status": "weakness",
            "magnitude": 0.2
          },
          {
            "type": "status",
            "target": "self",
            "status": "empower",
            "magnitude": 0.12
          }
        ]
      },
      "faction": "hollow",
      "cost": 1
    },
    {
      "id": "hollow-stormcaller",
      "abilityRegen": 0.96,
      "name": "Dolma",
      "title": "Dirge Tempest",
      "species": "Bell wraith",
      "primaryClass": "stormcaller",
      "secondaryClass": null,
      "ability": {
        "id": "dolma-funeral-toll",
        "name": "Funeral Toll",
        "description": "Toll down the target column, leaving every struck enemy burning and heavily slowed.",
        "actions": [
          {
            "type": "hit",
            "target": "enemy-column",
            "factor": 0.55
          },
          {
            "type": "burn",
            "target": "enemy-column",
            "factor": 0.45
          },
          {
            "type": "status",
            "target": "enemy-column",
            "status": "slow",
            "magnitude": 0.35
          }
        ]
      },
      "faction": "hollow",
      "cost": 2
    },
    {
      "id": "hollow-artificer",
      "abilityRegen": 1.01,
      "name": "Ossick",
      "title": "Clockwork Mourner",
      "species": "Reliquary skeleton",
      "primaryClass": "artificer",
      "secondaryClass": null,
      "ability": {
        "id": "ossick-borrowed-breath",
        "name": "Borrowed Breath",
        "description": "Share stored soul-light with two wounded allies, healing and empowering them as a bone shard hits a foe.",
        "actions": [
          {
            "type": "heal",
            "target": "wounded-allies",
            "factor": 1.2,
            "count": 2
          },
          {
            "type": "status",
            "target": "wounded-allies",
            "status": "empower",
            "magnitude": 0.12,
            "count": 2
          },
          {
            "type": "hit",
            "target": "target",
            "factor": 0.6
          }
        ]
      },
      "faction": "hollow",
      "cost": 3
    },
    {
      "id": "hollow-duelist",
      "abilityRegen": 1.74,
      "name": "Veyl",
      "title": "Glass Duelist",
      "species": "Mirror specter",
      "primaryClass": "duelist",
      "secondaryClass": "assassin",
      "ability": {
        "id": "veyl-mirror-reversal",
        "name": "Mirror Reversal",
        "description": "Cut the target twice; a mirror strike also damages and slows the enemy with the highest attack.",
        "actions": [
          {
            "type": "hit",
            "target": "target",
            "factor": 0.9,
            "repeat": 2
          },
          {
            "type": "hit",
            "target": "strongest-enemy",
            "factor": 0.5
          },
          {
            "type": "status",
            "target": "strongest-enemy",
            "status": "slow",
            "magnitude": 0.2
          }
        ],
        "manaCost": 4
      },
      "faction": "hollow",
      "cost": 3
    },
    {
      "id": "hollow-sentinel",
      "abilityRegen": 0.82,
      "name": "Kharrow",
      "title": "Crypt Paladin",
      "species": "Ossuary bone golem",
      "primaryClass": "vanguard",
      "secondaryClass": "sentinel",
      "ability": {
        "id": "kharrow-ossuary-oath",
        "name": "Ossuary Oath",
        "description": "Draw nearby attacks, shield your surrounding allies and heal a wounded ally while bones strike adjacent foes.",
        "actions": [
          {
            "type": "status",
            "target": "nearby-enemies",
            "status": "taunt",
            "magnitude": 0,
            "radius": 3
          },
          {
            "type": "shield",
            "target": "nearby-allies",
            "factor": 1.5,
            "radius": 2
          },
          {
            "type": "heal",
            "target": "wounded-allies",
            "factor": 1,
            "count": 1
          },
          {
            "type": "hit",
            "target": "nearby-enemies",
            "factor": 0.6,
            "radius": 1
          }
        ]
      },
      "faction": "hollow",
      "cost": 5
    },
    {
      "id": "iron-arcanist",
      "abilityRegen": 1.51,
      "name": "Kern",
      "title": "Runic Smith",
      "species": "Floating forge orb",
      "primaryClass": "arcanist",
      "secondaryClass": null,
      "ability": {
        "id": "kern-runic-aperture",
        "name": "Runic Aperture",
        "description": "Open a runic beam across the target row, then concentrate a second pulse on the primary target.",
        "actions": [
          {
            "type": "hit",
            "target": "enemy-row",
            "factor": 1.15
          },
          {
            "type": "hit",
            "target": "target",
            "factor": 0.5
          }
        ]
      },
      "faction": "iron",
      "cost": 2
    },
    {
      "id": "iron-artificer",
      "abilityRegen": 0.99,
      "name": "Tessik",
      "title": "Brass Architect",
      "species": "Quadruped brass spider",
      "primaryClass": "artificer",
      "secondaryClass": null,
      "ability": {
        "id": "tessik-clockwork-triage",
        "name": "Clockwork Triage",
        "description": "Repair, shield and empower the most wounded ally while a contact arc damages a foe.",
        "actions": [
          {
            "type": "heal",
            "target": "wounded-allies",
            "factor": 1.8,
            "count": 1
          },
          {
            "type": "shield",
            "target": "wounded-allies",
            "factor": 1.2,
            "count": 1
          },
          {
            "type": "status",
            "target": "wounded-allies",
            "status": "empower",
            "magnitude": 0.12,
            "count": 1
          },
          {
            "type": "hit",
            "target": "target",
            "factor": 0.6
          }
        ]
      },
      "faction": "iron",
      "cost": 3
    },
    {
      "id": "iron-hexbinder",
      "abilityRegen": 0.79,
      "name": "Ferrix",
      "title": "Rust Binder",
      "species": "Articulated iron centipede",
      "primaryClass": "hexbinder",
      "secondaryClass": null,
      "ability": {
        "id": "ferrix-corrosion-crawl",
        "name": "Corrosion Crawl",
        "description": "Coil around the highest-attack enemy, applying corrosion and deep weakness while repairing your own body.",
        "actions": [
          {
            "type": "hit",
            "target": "strongest-enemy",
            "factor": 0.7
          },
          {
            "type": "burn",
            "target": "strongest-enemy",
            "factor": 0.65
          },
          {
            "type": "status",
            "target": "strongest-enemy",
            "status": "weakness",
            "magnitude": 0.35
          },
          {
            "type": "heal",
            "target": "self",
            "factor": 0.6
          }
        ]
      },
      "faction": "iron",
      "cost": 3
    },
    {
      "id": "iron-vanguard",
      "abilityRegen": 0.86,
      "name": "Gromet",
      "title": "Iron Prefect",
      "species": "Furnace automaton",
      "primaryClass": "vanguard",
      "secondaryClass": "artificer",
      "ability": {
        "id": "gromet-furnace-interdict",
        "name": "Furnace Interdict",
        "description": "Taunt nearby foes behind a self-shield; furnace exhaust strikes adjacent foes and empowers nearby allies.",
        "actions": [
          {
            "type": "status",
            "target": "nearby-enemies",
            "status": "taunt",
            "magnitude": 0,
            "radius": 2
          },
          {
            "type": "hit",
            "target": "nearby-enemies",
            "factor": 0.8,
            "radius": 1
          },
          {
            "type": "shield",
            "target": "self",
            "factor": 1.4
          },
          {
            "type": "status",
            "target": "nearby-allies",
            "status": "empower",
            "magnitude": 0.12,
            "radius": 2
          }
        ]
      },
      "faction": "iron",
      "cost": 4
    },
    {
      "id": "iron-ranger",
      "abilityRegen": 0.64,
      "name": "Bolgrin",
      "title": "Bolt Warden",
      "species": "Cyclopean ballista walker",
      "primaryClass": "ranger",
      "secondaryClass": "arcanist",
      "ability": {
        "id": "bolgrin-siege-eye",
        "name": "Siege Eye",
        "description": "Fire one immense bolt into the target, weakening it and blasting the enemies around it.",
        "actions": [
          {
            "type": "hit",
            "target": "target",
            "factor": 3
          },
          {
            "type": "hit",
            "target": "target-neighbors",
            "factor": 0.65,
            "radius": 1
          },
          {
            "type": "status",
            "target": "target",
            "status": "weakness",
            "magnitude": 0.2
          }
        ]
      },
      "faction": "iron",
      "cost": 5
    },
    {
      "id": "astral-mender",
      "abilityRegen": 1.1,
      "name": "Aelune",
      "title": "Dawn Healer",
      "species": "Star jellyfish",
      "primaryClass": "mender",
      "secondaryClass": null,
      "ability": {
        "id": "aelune-dawn-drift",
        "name": "Dawn Drift",
        "description": "Drift restorative starlight through nearby allies, healing and hastening them as a spark hits a foe.",
        "actions": [
          {
            "type": "heal",
            "target": "nearby-allies",
            "factor": 1,
            "radius": 2
          },
          {
            "type": "status",
            "target": "nearby-allies",
            "status": "haste",
            "magnitude": 0.1,
            "radius": 2
          },
          {
            "type": "hit",
            "target": "target",
            "factor": 0.5
          }
        ]
      },
      "faction": "astral",
      "cost": 1
    },
    {
      "id": "astral-assassin",
      "abilityRegen": 0.65,
      "name": "Zevra",
      "title": "Night Comet",
      "species": "Comet mantis",
      "primaryClass": "assassin",
      "secondaryClass": null,
      "ability": {
        "id": "zevra-comet-cut",
        "name": "Comet Cut",
        "description": "Cut into the highest-attack enemy, weaken it and accelerate your next attacks.",
        "actions": [
          {
            "type": "hit",
            "target": "strongest-enemy",
            "factor": 2.6
          },
          {
            "type": "status",
            "target": "strongest-enemy",
            "status": "weakness",
            "magnitude": 0.2
          },
          {
            "type": "status",
            "target": "self",
            "status": "haste",
            "magnitude": 0.12
          }
        ]
      },
      "faction": "astral",
      "cost": 3
    },
    {
      "id": "astral-arcanist",
      "abilityRegen": 1.43,
      "name": "Orryx",
      "title": "Orbit Sage",
      "species": "Ringed crystal oracle",
      "primaryClass": "arcanist",
      "secondaryClass": null,
      "ability": {
        "id": "orryx-orbital-refraction",
        "name": "Orbital Refraction",
        "description": "Split a beam along the target row and column; the intersection takes both pulses.",
        "actions": [
          {
            "type": "hit",
            "target": "enemy-column",
            "factor": 1
          },
          {
            "type": "hit",
            "target": "enemy-row",
            "factor": 1
          }
        ]
      },
      "faction": "astral",
      "cost": 3
    },
    {
      "id": "astral-sentinel",
      "abilityRegen": 0.85,
      "name": "Selkor",
      "title": "Moonward Giant",
      "species": "Crescent colossus",
      "primaryClass": "sentinel",
      "secondaryClass": null,
      "ability": {
        "id": "selkor-lunar-anchorage",
        "name": "Lunar Anchorage",
        "description": "Draw nearby enemies toward your crescent frame, shield two wounded allies and restore your own health.",
        "actions": [
          {
            "type": "status",
            "target": "nearby-enemies",
            "status": "taunt",
            "magnitude": 0,
            "radius": 3
          },
          {
            "type": "shield",
            "target": "wounded-allies",
            "factor": 1.3,
            "count": 2
          },
          {
            "type": "heal",
            "target": "self",
            "factor": 1.3
          },
          {
            "type": "hit",
            "target": "target",
            "factor": 0.6
          }
        ]
      },
      "faction": "astral",
      "cost": 4
    },
    {
      "id": "astral-stormcaller",
      "abilityRegen": 0.98,
      "name": "Vaelis",
      "title": "Nebula Caller",
      "species": "Many-eyed cloud ray",
      "primaryClass": "stormcaller",
      "secondaryClass": "mender",
      "ability": {
        "id": "vaelis-nebula-rain",
        "name": "Nebula Rain",
        "description": "Rain burning stardust over every enemy, slow their attacks and restore two wounded allies.",
        "actions": [
          {
            "type": "burn",
            "target": "all-enemies",
            "factor": 0.25
          },
          {
            "type": "status",
            "target": "all-enemies",
            "status": "slow",
            "magnitude": 0.2
          },
          {
            "type": "heal",
            "target": "wounded-allies",
            "factor": 0.9,
            "count": 2
          }
        ]
      },
      "faction": "astral",
      "cost": 5
    },
    {
      "id": "dune-stormcaller",
      "abilityRegen": 1.05,
      "name": "Zikra",
      "title": "Thunder Nomad",
      "species": "Storm scorpion",
      "primaryClass": "stormcaller",
      "secondaryClass": null,
      "ability": {
        "id": "zikra-scorpion-squall",
        "name": "Scorpion Squall",
        "description": "Sting the target with lingering venom and slow its attacks while grit splashes into nearby enemies.",
        "actions": [
          {
            "type": "hit",
            "target": "target",
            "factor": 0.7
          },
          {
            "type": "burn",
            "target": "target",
            "factor": 0.5
          },
          {
            "type": "status",
            "target": "target",
            "status": "slow",
            "magnitude": 0.3
          },
          {
            "type": "hit",
            "target": "target-neighbors",
            "factor": 0.4,
            "radius": 1
          }
        ]
      },
      "faction": "dune",
      "cost": 1
    },
    {
      "id": "dune-vanguard",
      "abilityRegen": 0.89,
      "name": "Khepru",
      "title": "Sand Marshal",
      "species": "Sand scarab",
      "primaryClass": "vanguard",
      "secondaryClass": null,
      "ability": {
        "id": "khepru-dune-carapace",
        "name": "Dune Carapace",
        "description": "Raise a heavy carapace shield and draw nearby enemies into slowing sand before striking a foe.",
        "actions": [
          {
            "type": "shield",
            "target": "self",
            "factor": 1.7
          },
          {
            "type": "status",
            "target": "nearby-enemies",
            "status": "taunt",
            "magnitude": 0,
            "radius": 2
          },
          {
            "type": "status",
            "target": "nearby-enemies",
            "status": "slow",
            "magnitude": 0.25,
            "radius": 2
          },
          {
            "type": "hit",
            "target": "target",
            "factor": 0.8
          }
        ]
      },
      "faction": "dune",
      "cost": 2
    },
    {
      "id": "dune-duelist",
      "abilityRegen": 1.78,
      "name": "Razi",
      "title": "Sirocco Blade",
      "species": "Dune fennec",
      "primaryClass": "duelist",
      "secondaryClass": "mender",
      "ability": {
        "id": "razi-sirocco-feint",
        "name": "Sirocco Feint",
        "description": "Strike twice while a restorative desert wind heals and hastens a wounded ally.",
        "actions": [
          {
            "type": "hit",
            "target": "target",
            "factor": 0.8,
            "repeat": 2
          },
          {
            "type": "heal",
            "target": "wounded-allies",
            "factor": 0.6,
            "count": 1
          },
          {
            "type": "status",
            "target": "wounded-allies",
            "status": "haste",
            "magnitude": 0.1,
            "count": 1
          }
        ],
        "manaCost": 4
      },
      "faction": "dune",
      "cost": 3
    },
    {
      "id": "dune-ranger",
      "abilityRegen": 0.67,
      "name": "Jassar",
      "title": "Dust Hunter",
      "species": "Jackal tracker",
      "primaryClass": "ranger",
      "secondaryClass": "assassin",
      "ability": {
        "id": "jassar-track-the-weak",
        "name": "Track the Weak",
        "description": "Mark a wounded enemy with a concentrated shot that leaves burning wounds and weakness.",
        "actions": [
          {
            "type": "hit",
            "target": "weakest-enemy",
            "factor": 2.9
          },
          {
            "type": "burn",
            "target": "weakest-enemy",
            "factor": 0.25
          },
          {
            "type": "status",
            "target": "weakest-enemy",
            "status": "weakness",
            "magnitude": 0.3
          }
        ]
      },
      "faction": "dune",
      "cost": 4
    },
    {
      "id": "dune-mender",
      "abilityRegen": 0.97,
      "name": "Seshra",
      "title": "Oasis Keeper",
      "species": "Hooded desert cobra",
      "primaryClass": "mender",
      "secondaryClass": "hexbinder",
      "ability": {
        "id": "seshra-oasis-covenant",
        "name": "Oasis Covenant",
        "description": "Restore and hasten your entire army while an enemy suffers weakening venom.",
        "actions": [
          {
            "type": "heal",
            "target": "all-allies",
            "factor": 1
          },
          {
            "type": "status",
            "target": "all-allies",
            "status": "haste",
            "magnitude": 0.12
          },
          {
            "type": "burn",
            "target": "target",
            "factor": 0.4
          },
          {
            "type": "status",
            "target": "target",
            "status": "weakness",
            "magnitude": 0.25
          }
        ]
      },
      "faction": "dune",
      "cost": 5
    },
    {
      "id": "ember-korrun",
      "abilityRegen": 0.92,
      "name": "Korrun",
      "title": "Caldera Keeper",
      "species": "Lava tortoise",
      "faction": "ember",
      "cost": 3,
      "primaryClass": "sentinel",
      "secondaryClass": "mender",
      "ability": {
        "id": "korrun-caldera-haven",
        "name": "Caldera Haven",
        "description": "Draw nearby attacks, shelter two wounded allies, restore those close to your shell and scorch the target.",
        "actions": [
          {
            "type": "status",
            "target": "nearby-enemies",
            "status": "taunt",
            "magnitude": 0,
            "radius": 3
          },
          {
            "type": "shield",
            "target": "wounded-allies",
            "factor": 1,
            "count": 2
          },
          {
            "type": "heal",
            "target": "nearby-allies",
            "factor": 0.8,
            "radius": 1
          },
          {
            "type": "burn",
            "target": "target",
            "factor": 0.25
          }
        ]
      }
    },
    {
      "id": "ember-vikka",
      "abilityRegen": 1.7,
      "name": "Vikka",
      "title": "Tailfire Stalker",
      "species": "Fire skink",
      "faction": "ember",
      "cost": 2,
      "primaryClass": "duelist",
      "secondaryClass": "assassin",
      "ability": {
        "id": "vikka-tailfire-ambush",
        "name": "Tailfire Ambush",
        "description": "Ambush a wounded enemy with three quick cuts, gain haste and leave a burning trail down the target column.",
        "actions": [
          {
            "type": "hit",
            "target": "weakest-enemy",
            "factor": 1.4
          },
          {
            "type": "hit",
            "target": "weakest-enemy",
            "factor": 0.5,
            "repeat": 2
          },
          {
            "type": "status",
            "target": "self",
            "status": "haste",
            "magnitude": 0.12
          },
          {
            "type": "burn",
            "target": "enemy-column",
            "factor": 0.2
          }
        ]
      }
    },
    {
      "id": "ember-aereth",
      "abilityRegen": 0.95,
      "name": "Aereth",
      "title": "Dawnfire Ascendant",
      "species": "Phoenix drake",
      "faction": "ember",
      "cost": 5,
      "primaryClass": "mender",
      "secondaryClass": "stormcaller",
      "ability": {
        "id": "aereth-dawnfire-ascension",
        "name": "Dawnfire Ascension",
        "description": "Restore every ally, shelter the most wounded with a radiant shield and rain lingering fire over every enemy.",
        "actions": [
          {
            "type": "heal",
            "target": "all-allies",
            "factor": 0.8
          },
          {
            "type": "shield",
            "target": "wounded-allies",
            "factor": 1.4,
            "count": 1
          },
          {
            "type": "burn",
            "target": "all-enemies",
            "factor": 0.2
          }
        ]
      }
    },
    {
      "id": "ember-drazhul",
      "abilityRegen": 0.84,
      "name": "Drazhul",
      "title": "Obsidian Resonator",
      "species": "Obsidian drake",
      "faction": "ember",
      "cost": 4,
      "primaryClass": "vanguard",
      "secondaryClass": "arcanist",
      "ability": {
        "id": "drazhul-obsidian-reverberation",
        "name": "Obsidian Reverberation",
        "description": "Blast surrounding enemies and the strongest foe, raise an obsidian shield and draw attacks from adjacent enemies.",
        "actions": [
          {
            "type": "hit",
            "target": "nearby-enemies",
            "factor": 1.15,
            "radius": 2
          },
          {
            "type": "hit",
            "target": "strongest-enemy",
            "factor": 1.2
          },
          {
            "type": "shield",
            "target": "self",
            "factor": 1.2
          },
          {
            "type": "status",
            "target": "nearby-enemies",
            "status": "taunt",
            "magnitude": 0,
            "radius": 1
          }
        ]
      }
    },
    {
      "id": "ember-sazrik",
      "abilityRegen": 0.77,
      "name": "Sazrik",
      "title": "Coalcoil Oracle",
      "species": "Cinder serpent",
      "faction": "ember",
      "cost": 2,
      "primaryClass": "hexbinder",
      "secondaryClass": null,
      "ability": {
        "id": "sazrik-coalcoil-venom",
        "name": "Coalcoil Venom",
        "description": "Strike a wounded enemy with burning, slowing venom while restoring the most wounded ally.",
        "actions": [
          {
            "type": "hit",
            "target": "weakest-enemy",
            "factor": 1.1
          },
          {
            "type": "burn",
            "target": "weakest-enemy",
            "factor": 0.55
          },
          {
            "type": "status",
            "target": "weakest-enemy",
            "status": "slow",
            "magnitude": 0.25
          },
          {
            "type": "heal",
            "target": "wounded-allies",
            "factor": 0.75,
            "count": 1
          }
        ]
      }
    },
    {
      "id": "silk-luneth",
      "abilityRegen": 1.04,
      "name": "Luneth",
      "title": "Moonthread Tender",
      "species": "Luna moth",
      "faction": "silk",
      "cost": 1,
      "primaryClass": "mender",
      "secondaryClass": null,
      "ability": {
        "id": "luneth-moonthread-cocoon",
        "name": "Moonthread Cocoon",
        "description": "Heal, shield and hasten a wounded ally inside a lunar cocoon while a silver thread lashes the target.",
        "actions": [
          {
            "type": "heal",
            "target": "wounded-allies",
            "factor": 1.7,
            "count": 1
          },
          {
            "type": "shield",
            "target": "wounded-allies",
            "factor": 1.1,
            "count": 1
          },
          {
            "type": "status",
            "target": "wounded-allies",
            "status": "haste",
            "magnitude": 0.1,
            "count": 1
          },
          {
            "type": "hit",
            "target": "target",
            "factor": 0.45
          }
        ]
      }
    },
    {
      "id": "silk-thimri",
      "abilityRegen": 1.82,
      "name": "Thimri",
      "title": "Rose Needle",
      "species": "Rosy maple moth",
      "faction": "silk",
      "cost": 2,
      "primaryClass": "duelist",
      "secondaryClass": "artificer",
      "ability": {
        "id": "thimri-rose-needle-waltz",
        "name": "Rose Needle Waltz",
        "description": "Make three needle cuts, empower adjacent allies and mend your own downy body.",
        "actions": [
          {
            "type": "hit",
            "target": "target",
            "factor": 0.6,
            "repeat": 3
          },
          {
            "type": "status",
            "target": "nearby-allies",
            "status": "empower",
            "magnitude": 0.08,
            "radius": 1
          },
          {
            "type": "heal",
            "target": "self",
            "factor": 0.2
          }
        ]
      }
    },
    {
      "id": "silk-vespera",
      "abilityRegen": 0.73,
      "name": "Vespera",
      "title": "Deathmask Seer",
      "species": "Death’s-head moth",
      "faction": "silk",
      "cost": 3,
      "primaryClass": "hexbinder",
      "secondaryClass": "assassin",
      "ability": {
        "id": "vespera-deathmask-dust",
        "name": "Deathmask Dust",
        "description": "Dust a clustered enemy group with burning weakness, then sting the most wounded foe.",
        "actions": [
          {
            "type": "burn",
            "target": "target-neighbors",
            "factor": 0.35,
            "radius": 1
          },
          {
            "type": "status",
            "target": "target-neighbors",
            "status": "weakness",
            "magnitude": 0.3,
            "radius": 1
          },
          {
            "type": "hit",
            "target": "weakest-enemy",
            "factor": 1.4
          }
        ]
      }
    },
    {
      "id": "silk-orruma",
      "abilityRegen": 0.83,
      "name": "Orruma",
      "title": "Atlas Mantle",
      "species": "Atlas moth",
      "faction": "silk",
      "cost": 4,
      "primaryClass": "sentinel",
      "secondaryClass": "mender",
      "ability": {
        "id": "orruma-atlas-canopy",
        "name": "Atlas Canopy",
        "description": "Draw nearby attacks beneath your wings, shield the whole army and heal two wounded allies while striking a foe.",
        "actions": [
          {
            "type": "status",
            "target": "nearby-enemies",
            "status": "taunt",
            "magnitude": 0,
            "radius": 3
          },
          {
            "type": "shield",
            "target": "all-allies",
            "factor": 0.65
          },
          {
            "type": "heal",
            "target": "wounded-allies",
            "factor": 0.9,
            "count": 2
          },
          {
            "type": "hit",
            "target": "target",
            "factor": 0.7
          }
        ]
      }
    },
    {
      "id": "rime-soryn",
      "abilityRegen": 0.69,
      "name": "Soryn",
      "title": "Whiteout Watcher",
      "species": "Snowy owl",
      "faction": "rime",
      "cost": 3,
      "primaryClass": "ranger",
      "secondaryClass": "stormcaller",
      "ability": {
        "id": "soryn-whiteout-quills",
        "name": "Whiteout Quills",
        "description": "Drive a quill into the highest-attack enemy while an icy volley strikes and slows the target column.",
        "actions": [
          {
            "type": "hit",
            "target": "strongest-enemy",
            "factor": 2
          },
          {
            "type": "hit",
            "target": "enemy-column",
            "factor": 0.7
          },
          {
            "type": "status",
            "target": "enemy-column",
            "status": "slow",
            "magnitude": 0.25
          }
        ]
      }
    },
    {
      "id": "rime-urvek",
      "abilityRegen": 1.0,
      "name": "Urvek",
      "title": "Winter Hearth",
      "species": "Polar bear",
      "faction": "rime",
      "cost": 3,
      "primaryClass": "mender",
      "secondaryClass": "hexbinder",
      "ability": {
        "id": "urvek-hearth-of-winter",
        "name": "Hearth of Winter",
        "description": "Restore nearby allies, raise a frost shield around yourself and weaken enemies within claw reach.",
        "actions": [
          {
            "type": "heal",
            "target": "nearby-allies",
            "factor": 1.25,
            "radius": 2
          },
          {
            "type": "shield",
            "target": "self",
            "factor": 1.25
          },
          {
            "type": "status",
            "target": "nearby-enemies",
            "status": "weakness",
            "magnitude": 0.2,
            "radius": 1
          }
        ]
      }
    },
    {
      "id": "rime-boruun",
      "abilityRegen": 0.87,
      "name": "Boruun",
      "title": "Tundra Rampart",
      "species": "Woolly mammoth",
      "faction": "rime",
      "cost": 4,
      "primaryClass": "vanguard",
      "secondaryClass": "sentinel",
      "ability": {
        "id": "boruun-tundra-rampart",
        "name": "Tundra Rampart",
        "description": "Sweep adjacent foes with your tusks, taunt nearby enemies, slow the target row and shield two wounded allies.",
        "actions": [
          {
            "type": "hit",
            "target": "nearby-enemies",
            "factor": 0.9,
            "radius": 1
          },
          {
            "type": "status",
            "target": "nearby-enemies",
            "status": "taunt",
            "magnitude": 0,
            "radius": 2
          },
          {
            "type": "status",
            "target": "enemy-row",
            "status": "slow",
            "magnitude": 0.25
          },
          {
            "type": "shield",
            "target": "wounded-allies",
            "factor": 1.1,
            "count": 2
          }
        ]
      }
    },
    {
      "id": "gargoyle-kharvox",
      "abilityRegen": 1.39,
      "name": "Kharvox",
      "title": "Cathedral Rupture",
      "species": "Bat-winged granite gargoyle",
      "faction": "gargoyle",
      "cost": 3,
      "primaryClass": "arcanist",
      "secondaryClass": null,
      "ability": {
        "id": "kharvox-cathedral-rupture",
        "name": "Cathedral Rupture",
        "description": "Shatter stone around the target and down its column, seal yourself in a shield and weaken the strongest enemy.",
        "actions": [
          {
            "type": "hit",
            "target": "target-neighbors",
            "factor": 1,
            "radius": 1
          },
          {
            "type": "shield",
            "target": "self",
            "factor": 0.65
          },
          {
            "type": "hit",
            "target": "enemy-column",
            "factor": 0.5
          },
          {
            "type": "status",
            "target": "strongest-enemy",
            "status": "weakness",
            "magnitude": 0.12
          }
        ],
        "manaCost": 4
      }
    },
    {
      "id": "gargoyle-elyra",
      "abilityRegen": 0.81,
      "name": "Elyra",
      "title": "Pinnacle Guardian",
      "species": "Living limestone griffin",
      "faction": "gargoyle",
      "cost": 5,
      "primaryClass": "sentinel",
      "secondaryClass": "ranger",
      "ability": {
        "id": "elyra-pinnacle-vow",
        "name": "Pinnacle Vow",
        "description": "Draw nearby attacks, shield surrounding allies, restore a wounded ally and hurl a stone feather into the strongest foe.",
        "actions": [
          {
            "type": "status",
            "target": "nearby-enemies",
            "status": "taunt",
            "magnitude": 0,
            "radius": 3
          },
          {
            "type": "shield",
            "target": "nearby-allies",
            "factor": 1.1,
            "radius": 2
          },
          {
            "type": "heal",
            "target": "wounded-allies",
            "factor": 1.5,
            "count": 1
          },
          {
            "type": "hit",
            "target": "strongest-enemy",
            "factor": 1.8
          }
        ]
      }
    },
    {
      "id": "mime",
      "abilityRegen": 1.12,
      "name": "The Mime",
      "title": "The Mime",
      "species": "Independent performer",
      "primaryClass": null,
      "secondaryClass": null,
      "faction": null,
      "cost": 5
    }
  ]
};
if(typeof module!=='undefined'&&module.exports)module.exports=catalog;
root.ABHeroCatalog=catalog;
})(typeof globalThis!=='undefined'?globalThis:this);
