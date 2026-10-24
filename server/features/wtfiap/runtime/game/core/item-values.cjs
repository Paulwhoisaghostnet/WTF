/* Numeric item values from Riot TFT client data via CommunityDragon, sampled 2026-10-24.
 * Recipe and display names are authored for coLILseum. This is a pinned data
 * snapshot; live patch drift must not silently change an in-progress match. */
(function(root){
  const values = Object.freeze({
  "forgeblade+forgeblade": {
    "AD": 0.55,
    "BonusDamage": 0.1
  },
  "forgeblade+quickstring": {
    "AD": 0.15,
    "AP": 15.0,
    "AS": 15.0,
    "DamageAmp": 0.15
  },
  "forgeblade+spellglass": {
    "AD": 0.2,
    "AP": 20.0,
    "AllyHealing": 0.2,
    "ManaRegen": 1.0,
    "Omnivamp": 18.0,
    "StatOmnivamp": 0.15
  },
  "forgeblade+mana-vial": {
    "AD": 0.15,
    "AP": 15.0,
    "FlatManaRestore": 5.0,
    "ManaRegen": 1.0
  },
  "forgeblade+iron-plate": {
    "AD": 0.1,
    "AP": 10.0,
    "AS": 15.0,
    "Armor": 20.0,
    "DamageReduction": 100.0,
    "HealthThreshold": 60.0,
    "MissingHealthRestore": 0.2,
    "StealthDuration": 1.0
  },
  "forgeblade+veil-cloth": {
    "AD": 0.15,
    "AP": 15.0,
    "HealthThreshold": 40.0,
    "LifeSteal": 20.0,
    "MagicResist": 20.0,
    "ShieldDuration": 5.0,
    "ShieldHealthPercent": 25.0,
    "StatOmnivamp": 0.2
  },
  "forgeblade+vital-sash": {
    "AD": 0.45,
    "Health": 300.0,
    "HealthThreshold": 60.0,
    "PercentHealthShield": 0.4,
    "ShieldDuration": 4.0
  },
  "forgeblade+lucky-grips": {
    "AD": 0.35,
    "CritChance": 35.0
  },
  "quickstring+quickstring": {
    "AS": 45.0,
    "BonusDamage": 0.06,
    "BurnPercent": 1.0,
    "Duration": 5.0,
    "HealingReductionPct": 33.0,
    "HexRangeIncrease": 1.0
  },
  "quickstring+spellglass": {
    "AP": 10.0,
    "AS": 10.0,
    "AttackSpeedPerStack": 7.0
  },
  "quickstring+mana-vial": {
    "AP": 35.0,
    "AS": 15.0,
    "MRShred": 30.0,
    "MRShredDuration": 5.0,
    "ManaRegen": 1.0
  },
  "quickstring+iron-plate": {
    "AS": 10.0,
    "Armor": 20.0,
    "StackCap": 25.0,
    "StackedAmp": 0.1,
    "StackingAD": 0.02,
    "StackingSP": 2.0
  },
  "quickstring+veil-cloth": {
    "AD": 0.1,
    "ADOnAttack": 0.035,
    "AS": 10.0,
    "ASCapstone": 0.15,
    "MagicResist": 20.0,
    "MaxStacks": 15.0
  },
  "quickstring+vital-sash": {
    "AP": 15.0,
    "AS": 10.0,
    "BaseManaOnHit": 2,
    "CritChance": 20.0,
    "Health": 150.0,
    "ManaOnCrit": 4.0
  },
  "quickstring+lucky-grips": {
    "AD": 0.15,
    "AS": 20.0,
    "ArmorBreakDuration": 3.0,
    "ArmorReductionPercent": 30.0,
    "CritChance": 20.0
  },
  "spellglass+spellglass": {
    "AP": 55.0,
    "BonusDamage": 0.15
  },
  "spellglass+mana-vial": {
    "AP": 30.0,
    "APPerInterval": 20.0,
    "IntervalSeconds": 5.0,
    "ManaRegen": 1.0
  },
  "spellglass+iron-plate": {
    "AP": 20.0,
    "Armor": 20.0,
    "Health": 100.0,
    "ShieldBonusAP": 25.0,
    "ShieldDuration": 8.0,
    "ShieldSize": 25.0
  },
  "spellglass+veil-cloth": {
    "AP": 15.0,
    "Damage": 250.0,
    "Health": 250.0,
    "HexRange": 2.0,
    "MRShred": 30.0,
    "MagicResist": 35.0,
    "ManaRatio": 150.0
  },
  "spellglass+vital-sash": {
    "AP": 20.0,
    "BurnDuration": 10.0,
    "BurnPercent": 1.0,
    "GrievousWoundsPercent": 33.0,
    "Health": 150.0,
    "ManaRegen": 1.0,
    "MonsterCap": 100.0,
    "TicksPerSecond": 1.0
  },
  "spellglass+lucky-grips": {
    "AP": 35.0,
    "CritChance": 35.0
  },
  "mana-vial+mana-vial": {
    "AD": 0.15,
    "AP": 15.0,
    "ManaRegen": 5.0,
    "ModifiedADAP": 0.1
  },
  "mana-vial+iron-plate": {
    "Armor": 25.0,
    "CombatStartMana": 20.0,
    "HealthThreshold": 40.0,
    "MagicResist": 25.0,
    "ManaRegen": 1.0,
    "ShieldDuration": 60.0,
    "ShieldHealthPercent": 20.0,
    "TriggerMana": 15.0
  },
  "mana-vial+veil-cloth": {
    "BacklineADAP": 10.0,
    "FrontlineResists": 30.0,
    "MagicResist": 20.0,
    "ManaPercIncrease": 0.15,
    "ManaRegen": 3.0
  },
  "mana-vial+vital-sash": {
    "HealTickRate": 1.0,
    "Health": 300.0,
    "ManaRegen": 2.0,
    "MaxHeal": 250.0,
    "MissingHealthHeal": 0.02
  },
  "mana-vial+lucky-grips": {
    "AD_NotStatBar": 0.15,
    "AP_NotStatBar": 15.0,
    "CritChance": 20.0,
    "HealthThreshold": 0.5,
    "ManaRegen": 1.0,
    "StatOmnivamp_NotStatBar": 0.12
  },
  "iron-plate+iron-plate": {
    "1StarAoEDamage": 100.0,
    "2StarAoEDamage": 100.0,
    "3StarAoEDamage": 100.0,
    "4StarAoEDamage": 100.0,
    "Armor": 50.0,
    "AutoDamageReduction": 0.05,
    "ICD": 2.0,
    "PercentMaxHP": 0.06
  },
  "iron-plate+veil-cloth": {
    "Armor": 25.0,
    "ArmorPerEnemy": 10.0,
    "Health": 100.0,
    "MRPerEnemy": 10.0,
    "MagicResist": 25.0,
    "SizeIncrease": 0.075
  },
  "iron-plate+vital-sash": {
    "Armor": 20.0,
    "BonusPercentHP": 0.08,
    "BurnDuration": 10.0,
    "BurnPercent": 1.0,
    "GrievousWoundsPercent": 33.0,
    "Health": 150.0,
    "HexRange": 2.0,
    "ICD": 2.0,
    "MonsterCap": 100.0
  },
  "iron-plate+lucky-grips": {
    "Armor": 20.0,
    "BaseDurability": 0.05,
    "CritChance": 20.0,
    "EmpoweredDurability": 0.15,
    "Health": 250.0,
    "ThresholdForEmpower": 0.5
  },
  "veil-cloth+veil-cloth": {
    "HealthRegenInterval": 2.0,
    "ICD": 0.5,
    "MagicResist": 60.0,
    "PercentHealthDamage": 2.5,
    "PercentMaxHP": 0.06
  },
  "veil-cloth+vital-sash": {
    "ARReductionAmount": 30.0,
    "BonusResistDuration": 15.0,
    "BonusResists": 15.0,
    "Health": 250.0,
    "HexRange": 2.0,
    "MagicResist": 20.0
  },
  "veil-cloth+lucky-grips": {
    "AS": 15.0,
    "CritChance": 20.0,
    "MagicResist": 20.0,
    "ProcAttackSpeed": 0.03,
    "SpellShieldDuration": 18.0
  },
  "vital-sash+vital-sash": {
    "BonusPercentHP": 0.18,
    "Health": 500.0
  },
  "vital-sash+lucky-grips": {
    "AS": 10.0,
    "BuffDamageAmp": 0.05,
    "CritChance": 20.0,
    "Duration": 5.0,
    "Health": 150.0,
    "MaxStacks": 4.0
  },
  "lucky-grips+lucky-grips": {
    "CritChance": 20.0,
    "Health": 150.0
  }
});
  if(typeof module!=="undefined"&&module.exports) module.exports=values;
  else root.ABItemValues=values;
})(typeof globalThis!=="undefined"?globalThis:this);
