(function(root){const catalog={
  "factions": {
    "ember": {
      "lineage": "The Cookout",
      "appearance": "Red or orange body/clothing against charcoal; flame-like hair, red scarves or red formal accents.",
      "strategy": "Ten neighbors, one grill, no adult supervision. Their hospitality is warm enough to qualify as damage over time.",
      "name": "The Cookout"
    },
    "tide": {
      "lineage": "Pool Rules Committee",
      "appearance": "Blue-and-white clothes and skin, sailor caps or blue headwear; pale trim and beach footwear.",
      "strategy": "They saved the pool by banning almost everything that happens in a pool. Their protective magic is technically a liability waiver.",
      "name": "Pool Rules Committee"
    },
    "verdant": {
      "lineage": "Lawn & Disorder",
      "appearance": "Visible leaf green on clothing, skin or hood, with brown earth tones; garden tools, flowers and unruly growth.",
      "strategy": "A gardening club that takes invasive species personally. Their compost has started attending meetings.",
      "name": "Lawn & Disorder"
    },
    "hollow": {
      "lineage": "The Late Fees",
      "appearance": "Bone white and charcoal, visible skeletal or ghostly faces, with black neckwear, cloaks or formal clothes.",
      "strategy": "Death did not cancel their membership. They collect overdue souls and occasionally lend one back.",
      "name": "The Late Fees"
    },
    "iron": {
      "lineage": "Void Warranty",
      "appearance": "A conspicuous yellow garment, headband, bandana or utility belt against dark workwear; hardware, helmets and goggles.",
      "strategy": "Five repair technicians who learned healing from a troubleshooting diagram. Their first diagnostic step is hitting the problem.",
      "name": "Void Warranty"
    },
    "astral": {
      "lineage": "Bedtime Is a Lie",
      "appearance": "Violet garments or skin with pale accents and dark trim; sleepwear, witchy headwear and conspicuously tired or strange eyes.",
      "strategy": "A sleepover became a cosmic incident. Nobody has slept, but everybody has a theory.",
      "name": "Bedtime Is a Lie"
    },
    "dune": {
      "lineage": "Cul-de-Sac Outlaws",
      "appearance": "Cowboy boots and denim, with tan/brown/yellow western headwear or sheriff clothing; a shared dusty leather-and-denim pattern.",
      "strategy": "Suburban cowboys patrolling a road with no through traffic. Their jurisdiction ends at the speed bump.",
      "name": "Cul-de-Sac Outlaws"
    },
    "silk": {
      "lineage": "Cuddle Cartel",
      "appearance": "Every member wears an integrated plush bear suit: round ears, oversized paws and a contrasting belly. Suit colors and exposed faces distinguish members.",
      "strategy": "An organized comfort ring. Every hug comes with protection, and the protection is not optional.",
      "name": "Cuddle Cartel"
    },
    "rime": {
      "lineage": "Freezer Burnouts",
      "appearance": "Frost-white heads/hair/hoods with ice-blue or cobalt clothing and footwear; no warm-colored outfit accents.",
      "strategy": "The night shift went in for ice and formed a faction. They are keeping morale at a brisk minus twelve.",
      "name": "Freezer Burnouts"
    },
    "gargoyle": {
      "lineage": "Curb Appeal",
      "appearance": "Both members wear the same black tuxedo family and gold ear stud, with pale stone-like skin and sharply different hair silhouettes.",
      "strategy": "Two decorative guardians who elected themselves the homeowners' association. Their complaints are structurally sound.",
      "name": "Curb Appeal"
    }
  },
  "heroes": [
    {
      "id": "ember-vanguard",
      "abilityRegen": 0.91,
      "name": "Briq",
      "title": "Grill Security",
      "species": "The Cookout · Lil Guy",
      "primaryClass": "vanguard",
      "secondaryClass": null,
      "ability": {
        "id": "brakka-basalt-challenge",
        "name": "Not on the Guest List",
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
      "name": "Flambae",
      "title": "Aggressive Dinner Theatre",
      "species": "The Cookout · Lil Guy",
      "primaryClass": "duelist",
      "secondaryClass": "arcanist",
      "ability": {
        "id": "sythra-molten-pirouette",
        "name": "Dinner and a Show",
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
      "name": "Spare Rib",
      "title": "Unlicensed Grill Medic",
      "species": "The Cookout · Lil Guy",
      "primaryClass": "artificer",
      "secondaryClass": null,
      "ability": {
        "id": "pik-bellows-mend",
        "name": "A Little Heat Fixes Everything",
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
      "name": "Hot Shot",
      "title": "Long-Distance Seasoning",
      "species": "The Cookout · Lil Guy",
      "primaryClass": "ranger",
      "secondaryClass": "stormcaller",
      "ability": {
        "id": "avara-ashwing-skewer",
        "name": "Pass the Pepper",
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
      "name": "Trips",
      "title": "Three Opinions at Once",
      "species": "The Cookout · Lil Guy",
      "primaryClass": "stormcaller",
      "secondaryClass": "arcanist",
      "ability": {
        "id": "vezhra-threefold-cataclysm",
        "name": "Reply All",
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
      "name": "Bobbi Float",
      "title": "Emergency Buddy System",
      "species": "Pool Rules Committee · Lil Guy",
      "primaryClass": "mender",
      "secondaryClass": null,
      "ability": {
        "id": "nemi-foam-cradle",
        "name": "Two at a Time, Please",
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
      "name": "No Running",
      "title": "Acting Assistant Lifeguard",
      "species": "Pool Rules Committee · Lil Guy",
      "primaryClass": "sentinel",
      "secondaryClass": null,
      "ability": {
        "id": "oruun-reef-refuge",
        "name": "I Said Walk",
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
      "name": "Deep End",
      "title": "Recreational Threat",
      "species": "Pool Rules Committee · Lil Guy",
      "primaryClass": "ranger",
      "secondaryClass": "assassin",
      "ability": {
        "id": "salka-brine-harpoon",
        "name": "No Diving",
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
      "name": "Pearl Clutch",
      "title": "Deeply Concerned Member",
      "species": "Pool Rules Committee · Lil Guy",
      "primaryClass": "arcanist",
      "secondaryClass": "mender",
      "ability": {
        "id": "ilyth-pearlescent-bloom",
        "name": "An Incident at the Pool",
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
      "name": "Draino",
      "title": "Maintenance Incident",
      "species": "Pool Rules Committee · Lil Guy",
      "primaryClass": "vanguard",
      "secondaryClass": "hexbinder",
      "ability": {
        "id": "ghorl-abyssal-lure",
        "name": "Chemical Imbalance",
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
      "name": "Daisy Chain",
      "title": "Unpaid Plant Therapist",
      "species": "Lawn & Disorder · Lil Guy",
      "primaryClass": "mender",
      "secondaryClass": null,
      "ability": {
        "id": "lumae-lotus-reprieve",
        "name": "You Are Doing So Well",
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
      "name": "Compost Malone",
      "title": "Live Culture Enthusiast",
      "species": "Lawn & Disorder · Lil Guy",
      "primaryClass": "hexbinder",
      "secondaryClass": "mender",
      "ability": {
        "id": "morrow-spore-exchange",
        "name": "Mostly Organic",
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
      "name": "Doug Fir",
      "title": "Unmovable Neighbor",
      "species": "Lawn & Disorder · Lil Guy",
      "primaryClass": "vanguard",
      "secondaryClass": null,
      "ability": {
        "id": "tharn-rootbound-stand",
        "name": "Putting Down Roots",
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
      "name": "Hedge Fund",
      "title": "Aggressive Growth Strategy",
      "species": "Lawn & Disorder · Lil Guy",
      "primaryClass": "duelist",
      "secondaryClass": null,
      "ability": {
        "id": "serris-petal-scissors",
        "name": "Cutbacks",
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
      "name": "Snapdragon",
      "title": "Houseplant Gone Wrong",
      "species": "Lawn & Disorder · Lil Guy",
      "primaryClass": "assassin",
      "secondaryClass": "hexbinder",
      "ability": {
        "id": "nyss-nectar-trap",
        "name": "Do Not Feed After Anything",
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
      "name": "Morsel",
      "title": "Grave Pickpocket",
      "species": "The Late Fees · Lil Guy",
      "primaryClass": "assassin",
      "secondaryClass": null,
      "ability": {
        "id": "verrik-raven-claim",
        "name": "Finders, Reapers",
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
      "name": "Sheety",
      "title": "Full-Time Haunter",
      "species": "The Late Fees · Lil Guy",
      "primaryClass": "stormcaller",
      "secondaryClass": null,
      "ability": {
        "id": "dolma-funeral-toll",
        "name": "Final Notice",
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
      "name": "Dr. Rattles",
      "title": "Out-of-Network Necromedic",
      "species": "The Late Fees · Lil Guy",
      "primaryClass": "artificer",
      "secondaryClass": null,
      "ability": {
        "id": "ossick-borrowed-breath",
        "name": "Borrowed Parts",
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
      "name": "Refund",
      "title": "Returns Department",
      "species": "The Late Fees · Lil Guy",
      "primaryClass": "duelist",
      "secondaryClass": "assassin",
      "ability": {
        "id": "veyl-mirror-reversal",
        "name": "Return to Sender",
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
      "name": "Grimbo",
      "title": "Doorman of the Dead",
      "species": "The Late Fees · Lil Guy",
      "primaryClass": "vanguard",
      "secondaryClass": "sentinel",
      "ability": {
        "id": "kharrow-ossuary-oath",
        "name": "You Are Not on the Crypt",
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
      "name": "Reboot",
      "title": "Device Not Found",
      "species": "Void Warranty · Lil Guy",
      "primaryClass": "arcanist",
      "secondaryClass": null,
      "ability": {
        "id": "kern-runic-aperture",
        "name": "Have You Tried Turning Them Off?",
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
      "name": "Allen Wrench",
      "title": "One Part Left Over",
      "species": "Void Warranty · Lil Guy",
      "primaryClass": "artificer",
      "secondaryClass": null,
      "ability": {
        "id": "tessik-clockwork-triage",
        "name": "It Was Like That When I Got Here",
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
      "name": "Rusty Nail",
      "title": "Warranty Exclusion",
      "species": "Void Warranty · Lil Guy",
      "primaryClass": "hexbinder",
      "secondaryClass": null,
      "ability": {
        "id": "ferrix-corrosion-crawl",
        "name": "Pre-Existing Condition",
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
      "name": "Hard Reset",
      "title": "Technical Support, Physically",
      "species": "Void Warranty · Lil Guy",
      "primaryClass": "vanguard",
      "secondaryClass": "artificer",
      "ability": {
        "id": "gromet-furnace-interdict",
        "name": "Percussive Maintenance",
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
      "name": "Scopes",
      "title": "One-Eyed Artillery",
      "species": "Void Warranty · Lil Guy",
      "primaryClass": "ranger",
      "secondaryClass": "arcanist",
      "ability": {
        "id": "bolgrin-siege-eye",
        "name": "Factory-Reset Target",
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
      "name": "Mel A. Tonin",
      "title": "Unauthorized Bedtime",
      "species": "Bedtime Is a Lie · Lil Guy",
      "primaryClass": "mender",
      "secondaryClass": null,
      "ability": {
        "id": "aelune-dawn-drift",
        "name": "Just Rest Your Eyes",
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
      "name": "Zoomies",
      "title": "The 3:04 AM Appointment",
      "species": "Bedtime Is a Lie · Lil Guy",
      "primaryClass": "assassin",
      "secondaryClass": null,
      "ability": {
        "id": "zevra-comet-cut",
        "name": "Absolutely No Reason",
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
      "name": "Madam Probably",
      "title": "Licensed in Vibes",
      "species": "Bedtime Is a Lie · Lil Guy",
      "primaryClass": "arcanist",
      "secondaryClass": null,
      "ability": {
        "id": "orryx-orbital-refraction",
        "name": "Mercury Is in Your Personal Space",
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
      "name": "Pillow Fort",
      "title": "Structural Nap Engineer",
      "species": "Bedtime Is a Lie · Lil Guy",
      "primaryClass": "sentinel",
      "secondaryClass": null,
      "ability": {
        "id": "selkor-lunar-anchorage",
        "name": "Everybody Under the Blanket",
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
      "name": "Doomscroll",
      "title": "Forecast: Still Awake",
      "species": "Bedtime Is a Lie · Lil Guy",
      "primaryClass": "stormcaller",
      "secondaryClass": "mender",
      "ability": {
        "id": "vaelis-nebula-rain",
        "name": "One More Catastrophe",
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
      "name": "Pocket Sand",
      "title": "Neighborhood Watch Hazard",
      "species": "Cul-de-Sac Outlaws · Lil Guy",
      "primaryClass": "stormcaller",
      "secondaryClass": null,
      "ability": {
        "id": "zikra-scorpion-squall",
        "name": "Pocket Sand, Obviously",
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
      "name": "Permit Pete",
      "title": "Sheriff of the Speed Bump",
      "species": "Cul-de-Sac Outlaws · Lil Guy",
      "primaryClass": "vanguard",
      "secondaryClass": null,
      "ability": {
        "id": "khepru-dune-carapace",
        "name": "Do You Have a Permit for That?",
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
      "name": "Yeehawwwn",
      "title": "Campfire Headliner",
      "species": "Cul-de-Sac Outlaws · Lil Guy",
      "primaryClass": "duelist",
      "secondaryClass": "mender",
      "ability": {
        "id": "razi-sirocco-feint",
        "name": "One More Song",
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
      "name": "Wyatt Earpiece",
      "title": "Wanted Poster Model",
      "species": "Cul-de-Sac Outlaws · Lil Guy",
      "primaryClass": "ranger",
      "secondaryClass": "assassin",
      "ability": {
        "id": "jassar-track-the-weak",
        "name": "I Heard You Were Wounded",
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
      "name": "Well Actually",
      "title": "Oasis of Unsolicited Advice",
      "species": "Cul-de-Sac Outlaws · Lil Guy",
      "primaryClass": "mender",
      "secondaryClass": "hexbinder",
      "ability": {
        "id": "seshra-oasis-covenant",
        "name": "Stay Hydrated, Idiot",
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
      "name": "Uncle Medium",
      "title": "It Will Cook Off",
      "species": "The Cookout · Lil Guy",
      "faction": "ember",
      "cost": 3,
      "primaryClass": "sentinel",
      "secondaryClass": "mender",
      "ability": {
        "id": "korrun-caldera-haven",
        "name": "Everybody Behind Uncle",
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
      "name": "Lil Brisket",
      "title": "Back-Alley Caterer",
      "species": "The Cookout · Lil Guy",
      "faction": "ember",
      "cost": 2,
      "primaryClass": "duelist",
      "secondaryClass": "assassin",
      "ability": {
        "id": "vikka-tailfire-ambush",
        "name": "Three Cuts, No Waiting",
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
      "name": "Auntie Flare",
      "title": "Aggressive Hospitality",
      "species": "The Cookout · Lil Guy",
      "faction": "ember",
      "cost": 5,
      "primaryClass": "mender",
      "secondaryClass": "stormcaller",
      "ability": {
        "id": "aereth-dawnfire-ascension",
        "name": "Have Another Helping",
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
      "name": "Charbro",
      "title": "Load-Bearing Grill",
      "species": "The Cookout · Lil Guy",
      "faction": "ember",
      "cost": 4,
      "primaryClass": "vanguard",
      "secondaryClass": "arcanist",
      "ability": {
        "id": "drazhul-obsidian-reverberation",
        "name": "Who Touched the Thermostat?",
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
      "name": "Sizzle",
      "title": "Venom Sommelier",
      "species": "The Cookout · Lil Guy",
      "faction": "ember",
      "cost": 2,
      "primaryClass": "hexbinder",
      "secondaryClass": null,
      "ability": {
        "id": "sazrik-coalcoil-venom",
        "name": "Notes of Regret",
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
      "name": "Lil Spoon",
      "title": "Comfort Specialist",
      "species": "Cuddle Cartel · Lil Guy",
      "faction": "silk",
      "cost": 1,
      "primaryClass": "mender",
      "secondaryClass": null,
      "ability": {
        "id": "luneth-moonthread-cocoon",
        "name": "You Look Like You Need This",
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
      "name": "Seam Reaper",
      "title": "Pastel Menace",
      "species": "Cuddle Cartel · Lil Guy",
      "faction": "silk",
      "cost": 2,
      "primaryClass": "duelist",
      "secondaryClass": "artificer",
      "ability": {
        "id": "thimri-rose-needle-waltz",
        "name": "A Stitch in Your Side",
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
      "name": "Dust Bunny",
      "title": "Aggressive Soft Furnishing",
      "species": "Cuddle Cartel · Lil Guy",
      "faction": "silk",
      "cost": 3,
      "primaryClass": "hexbinder",
      "secondaryClass": "assassin",
      "ability": {
        "id": "vespera-deathmask-dust",
        "name": "Do Not Shake Indoors",
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
      "name": "Big Hug Energy",
      "title": "Personal Space Enforcer",
      "species": "Cuddle Cartel · Lil Guy",
      "faction": "silk",
      "cost": 4,
      "primaryClass": "sentinel",
      "secondaryClass": "mender",
      "ability": {
        "id": "orruma-atlas-canopy",
        "name": "Group Hug Is Mandatory",
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
      "name": "Hoodini",
      "title": "Cold Case Specialist",
      "species": "Freezer Burnouts · Lil Guy",
      "faction": "rime",
      "cost": 3,
      "primaryClass": "ranger",
      "secondaryClass": "stormcaller",
      "ability": {
        "id": "soryn-whiteout-quills",
        "name": "Freeze Frame",
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
      "abilityRegen": 1,
      "name": "Brrnard",
      "title": "Certified Warm Hugger",
      "species": "Freezer Burnouts · Lil Guy",
      "faction": "rime",
      "cost": 3,
      "primaryClass": "mender",
      "secondaryClass": "hexbinder",
      "ability": {
        "id": "urvek-hearth-of-winter",
        "name": "Warm Thoughts, Cold Hands",
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
      "name": "Frosty Reception",
      "title": "Doorman at Absolute Zero",
      "species": "Freezer Burnouts · Lil Guy",
      "faction": "rime",
      "cost": 4,
      "primaryClass": "vanguard",
      "secondaryClass": "sentinel",
      "ability": {
        "id": "boruun-tundra-rampart",
        "name": "You Are Letting the Cold Out",
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
      "name": "Chip",
      "title": "Historical Nuisance",
      "species": "Curb Appeal · Lil Guy",
      "faction": "gargoyle",
      "cost": 3,
      "primaryClass": "arcanist",
      "secondaryClass": null,
      "ability": {
        "id": "kharvox-cathedral-rupture",
        "name": "Property Damage Assessment",
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
      "name": "Gracie",
      "title": "Load-Bearing Angel",
      "species": "Curb Appeal · Lil Guy",
      "faction": "gargoyle",
      "cost": 5,
      "primaryClass": "sentinel",
      "secondaryClass": "ranger",
      "ability": {
        "id": "elyra-pinnacle-vow",
        "name": "Bless Your Load-Bearing Heart",
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
      "name": "Mimothy",
      "title": "Unpaid Understudy",
      "species": "Independent Lil Guy",
      "primaryClass": null,
      "secondaryClass": null,
      "faction": null,
      "cost": 5
    }
  ]
};if(typeof module!=='undefined'&&module.exports)module.exports=catalog;root.ABHeroCatalog=catalog;})(globalThis);
