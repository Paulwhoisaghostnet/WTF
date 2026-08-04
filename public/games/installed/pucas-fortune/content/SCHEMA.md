# Púca’s Fortune — Content JSON Schema Reference

All game content lives in `/public/content/` as JSON files. Drop-in mods go in `/public/content/mods/`. No recompilation needed — the game loads everything at startup.

---

## File Map

| File | Top-level key | Description |
|---|---|---|
| `jokers.json` | `jokers[]` | Joker cards with ability definitions |
| `tarots.json` | `tarots[]` | Tarot consumables with on-use effects |
| `celestials.json` | `celestials[]` | Planet cards that level up hand types |
| `enhancements.json` | `enhancements[]`, `seals[]`, `editions[]` | Card modifications |
| `bosses.json` | `bosses[]` | Boss blind definitions with effects |
| `decks.json` | `decks[]` | Special starting decks |
| `game-modes.json` | `gameModes[]` | Game mode hand tables and config |
| `card-backs.json` | `cardBacks[]` | Cosmetic card back options |
| `spectrals.json` | `spectrals[]`, `vouchers[]` | Spectral cards and voucher items |
| `locales/en.json` | `strings` | UI string table |

---

## Common Fields (all content types)

```json
{
  "id": "unique_snake_case_id",
  "name": "Display Name",
  "description": "One-line description shown in UI",
  "icon": "🃏",
  "flavor": "Optional italic flavor text",
  "tags": ["tag1", "tag2"],
  "unlocked": true,
  "unlockCondition": { "type": "always" },
  "abilities": [ ...AbilityDef[] ]
}
```

### `unlockCondition` types

```jsonc
{ "type": "always" }               // available from the start
{ "type": "win-run" }              // win any run
{ "type": "reach-ante", "value": 5 }
{ "type": "collect-joker", "value": "joker_base" }
{ "type": "play-hand", "value": "Royal Flush" }
```

---

## AbilityDef

The core building block. Each content item can have 0–N abilities.

```json
{
  "id": "optional_ability_id",
  "trigger": "on-score",
  "condition": { "handName": "Flush" },
  "actions": [
    { "type": "add-mult", "amount": 10 }
  ],
  "maxTriggers": 1,
  "priority": 100
}
```

### Trigger types

| Trigger | When it fires |
|---|---|
| `on-score` | During the scoring pipeline |
| `on-play` | When cards are played (before scoring) |
| `on-draw` | When a card is drawn to hand |
| `on-discard` | When cards are discarded |
| `on-discard-threshold` | When discard counter reaches `threshold` |
| `on-card-destroyed` | When a card is removed from the deck |
| `on-card-enhanced` | When a card gains enhancement/seal/edition |
| `on-purchase` | When this item is bought from the shop |
| `on-sell` | When this item is sold |
| `on-use` | When a consumable is activated |
| `on-blind` | At the start of any blind |
| `on-boss` | At the start of a boss blind |
| `every-hand` | After every hand is scored |
| `every-round` | At the end of every round (before reward) |
| `passive` | Always active during scoring |
| `permanent` | Always active (e.g. extra joker slot) |

### Condition types

```jsonc
{ "handName": "Flush" }                       // exact hand name match
{ "handName": ["Flush", "Straight Flush"] }    // any of these hands
{ "played:suit": "blood" }                    // any played card is Blood
{ "played:rank": ["J","Q","K"] }              // face card played
{ "played:count": { "op": "lte", "value": 3 } } // ≤3 cards played
{ "held:all:suit": ["spear","clover"] }        // all held cards are Spear/Clover
{ "remaining:discards": { "op": "eq", "value": 0 } }
{ "remaining:hands": { "op": "lte", "value": 2 } }
{ "ante": { "op": "gte", "value": 3 } }
{ "chance": 0.5 }                             // 50% probability
{ "counter": { "key": "stacks", "op": "gte", "value": 1 } }
{ "and": [ ...conditions ] }
{ "or":  [ ...conditions ] }
{ "not": condition }
```

### Action types

#### Scoring actions
```jsonc
{ "type": "add-chips",      "amount": 50 }
{ "type": "add-mult",       "amount": 4 }
{ "type": "multiply-mult",  "amount": 2 }

// Multiply once per matching card (e.g. Triboulet ×2 per K/Q)
{ "type": "multiply-mult", "amount": 2, "chained": true, "filter": { "rank": ["K","Q"] } }
```

#### Economy actions
```jsonc
{ "type": "generate-money", "amount": 3 }
```

#### Counter actions
```jsonc
{ "type": "increment-counter", "key": "stacks", "by": 1, "maximum": 5 }
{ "type": "reset-counter",     "key": "stacks" }
```

#### Side-effect actions (handled outside scoring pipeline)
```jsonc
{ "type": "spawn-random",    "objectType": "joker",  "rarity": "rare", "count": 1 }
{ "type": "create-consumable", "consumableId": "tarot_fool" }
{ "type": "create-last-consumable" }
{ "type": "modify-cards",    "target": "played", "modification": "enhance", "enhancementId": "foil", "maxTargets": 2 }
{ "type": "transform-cards", "target": "played", "property": "suit", "value": "coin" }
{ "type": "destroy-cards",   "target": "played", "maxTargets": 1 }
{ "type": "destroy-self" }
{ "type": "apply-status",    "status": "level-up-hand", "handName": "Flush" }
{ "type": "retrigger",       "target": "played" }
{ "type": "add-joker-slot",  "slots": 1 }
{ "type": "add-consumable-slot", "slots": 1 }
```

### Amount expressions

```jsonc
4                                         // static number

{ "per": "played:suit:coin", "value": 3 }       // 3× count of Coin played
{ "per": "played:rank:face",     "value": 8 }   // 8× face cards played
{ "per": "played:rank:fibonacci","value": 8 }   // 2/3/5/8/A
{ "per": "played:rank:royal",    "value": 2 }   // K/Q
{ "per": "played:rank:9",        "value": 1 }   // specific rank
{ "per": "played:count",         "value": 1 }   // total played
{ "per": "held:count",           "value": 1 }   // total held
{ "per": "held:suit:blood",      "value": 2 }
{ "per": "deck:rank:A",          "value": 1 }
{ "per": "deck:count",           "value": 1 }
{ "per": "remaining:discards",   "value": 30 }
{ "per": "remaining:hands",      "value": 10 }
{ "per": "empty:joker-slots",    "value": 1 }
{ "per": "current:gold",         "value": 1, "max": 20 }
{ "per": "joker:sell-value:all", "value": 1 }

{ "counter": "stacks", "valuePer": 1, "minimum": 1, "maximum": 5 }
```

### Card filter (for `filter` and `target` on actions)

```jsonc
{
  "suit":     "blood",
  "rank":     ["J","Q","K"],
  "enhanced": "foil",
  "seal":     "gold",
  "played":   true,
  "held":     true
}
```

---

## Joker example

```json
{
  "id": "joker_greedy",
  "name": "Greedy Joker",
  "description": "Played ♦ cards give +3 Mult each",
  "icon": "♦",
  "rarity": "common",
  "cost": 5,
  "unlocked": true,
  "tags": ["suit", "coin"],
  "abilities": [
    {
      "trigger": "on-score",
      "actions": [
        { "type": "add-mult", "amount": { "per": "played:suit:coin", "value": 3 } }
      ]
    }
  ]
}
```

## Tarot example

```json
{
  "id": "tarot_empress",
  "name": "The Empress",
  "description": "Enhances 2 randomly selected played cards to Foil",
  "icon": "👑",
  "cost": 3,
  "unlocked": true,
  "abilities": [
    {
      "trigger": "on-use",
      "actions": [
        {
          "type": "modify-cards",
          "target": "played",
          "modification": "enhance",
          "enhancementId": "foil",
          "maxTargets": 2
        }
      ]
    }
  ]
}
```

## Planet example

```json
{
  "id": "celestial_jupiter",
  "name": "Jupiter",
  "description": "Levels up Flush hand (+15 Chips, +2 Mult)",
  "icon": "🪐",
  "handName": "Flush",
  "chipsPerLevel": 15,
  "multPerLevel": 2,
  "cost": 3,
  "unlocked": true
}
```

## Boss example

```json
{
  "id": "boss_eye",
  "name": "The Eye",
  "description": "Each hand type can only be played once",
  "icon": "👁️",
  "ante": 1,
  "difficulty": 1,
  "unlocked": true,
  "effects": [
    { "type": "no-repeat-hands" }
  ]
}
```

---

## Drop-in Mod Format

Create `/public/content/mods/index.json`:
```json
{ "mods": ["my-mod.json"] }
```

Create `/public/content/mods/my-mod.json`:
```json
{
  "modId":    "my-mod",
  "modName":  "My Custom Jokers",
  "version":  "1.0.0",
  "author":   "You",
  "jokers": [
    {
      "id": "joker_custom_1",
      "name": "Custom Joker",
      "description": "+999 Mult always",
      "icon": "💥",
      "rarity": "legendary",
      "cost": 20,
      "unlocked": true,
      "abilities": [
        {
          "trigger": "on-score",
          "actions": [ { "type": "add-mult", "amount": 999 } ]
        }
      ]
    }
  ]
}
```

Mods can include: `jokers`, `tarots`, `celestials`, `enhancements`, `bosses`, `decks`, `gameModes`, `spectrals`, `vouchers`. Items with the same `id` as a base item **override** it. New IDs are additive.

---

## Rarity reference

| Tier | Spawn weight | Color |
|---|---|---|
| `common` | 70 | `#9ca3af` |
| `uncommon` | 50 | `#3b82f6` |
| `rare` | 20 | `#a855f7` |
| `legendary` | 5 | `#f59e0b` |
| `mythic` | 1 | `#ec4899` |
