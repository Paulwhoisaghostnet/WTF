/**
 * Dragon — Combat system (cyberpunk edition).
 *
 * 8 commands:  LASER | OVERLOAD | FIREWALL | STIM
 *              OVERCLOCK | E-TRIKE | VPN | PIRATE
 *
 * New mechanics:
 *   - Dragon telegraphs its next attack ("CHARGING: X") so FIREWALL
 *     decisions have real weight.
 *   - CORRUPTED debuff: Dragon can corrupt Lance, halving his next
 *     offensive action.
 *   - CHARGE move: Dragon spends a turn charging — next attack doubles.
 *   - Phase-3 Overload stun: 50% chance to skip the dragon's next turn
 *     on a hit.
 */
'use strict';

const Combat = {

  start(state) {
    state.scene = 'battle';
    const items = state.battleItems || {};
    state.battle = {
      phase: 'player',
      phase_dragon: 1,
      playerHp: 140,
      playerMaxHp: 140,
      enemyHp: 200,
      enemyMaxHp: 200,
      cursor: 0,
      message: '"You dare breach the Sovereign Process? We\'ll see about that." — The Dragon',
      messageIsAction: false,
      messageTimer: 0,
      nextPhase: 'player',
      nextMessage: 'Your move.',
      isGuarding: false,
      skipEnemyTurn: false,
      steelActive: false,
      violinActive: false,
      corrupted: false,       // halves Lance's next attack
      dragonCharging: false,  // dragon charged last turn — next hit doubles
      dragonNext: null,       // telegraph: 'burst'|'sweep'|'surge'|'spike'|'thermal'|'rage'|'voltage'|'charge'|'corrupt'
      items: { ...items },
    };
  },

  update(dt, state) {
    const b = state.battle;
    if (!b || b.phase === 'end') return;

    if (b.phase === 'message') {
      b.messageTimer -= dt;
      if (b.messageTimer <= 0) {
        b.phase = b.nextPhase;
        b.message = b.nextMessage;
        b.messageIsAction = false;
      }
      return;
    }

    if (b.phase === 'enemy') {
      b.messageTimer -= dt;
      if (b.messageTimer <= 0) this._dragonAttack(b, state);
      return;
    }
  },

  input(key, state) {
    const b = state.battle;
    if (!b) return;

    if (b.phase === 'message') {
      if ((key === 'Enter' || key === ' ' || key === 'z') && b.messageTimer > 180)
        b.messageTimer = 180;
      return;
    }
    if (b.phase === 'end' || b.phase !== 'player') return;

    const col = b.cursor % 4;
    const row = Math.floor(b.cursor / 4);
    if (key === 'ArrowLeft')  b.cursor = row * 4 + ((col + 3) % 4);
    if (key === 'ArrowRight') b.cursor = row * 4 + ((col + 1) % 4);
    if (key === 'ArrowUp' || key === 'ArrowDown') b.cursor = ((row + 1) % 2) * 4 + col;

    if (key === 'Enter' || key === ' ' || key === 'z') {
      this._playerAction(b, state);
    }
  },

  /* ───────────────────────────────────────────────────────────
     PLAYER ACTION
     Row 0: LASER(0) | OVERLOAD(1) | FIREWALL(2) | STIM(3)
     Row 1: OVERCLOCK(4) | E-TRIKE(5) | VPN(6) | PIRATE(7)
     ─────────────────────────────────────────────────────────── */
  _itemKeys: ['stim', 'overclock', 'etrike', 'vpn', 'pirate'],

  _playerAction(b, state) {
    b.isGuarding = false;
    const c = b.cursor;

    if (c === 0) {
      let dmg = 12 + Math.floor(Math.random() * 9);
      if (b.steelActive)  { dmg *= 2; b.steelActive = false; }
      if (b.violinActive) { dmg = Math.max(dmg, 25) + 10; b.violinActive = false; }
      if (b.corrupted)    { dmg = Math.max(1, Math.floor(dmg / 2)); b.corrupted = false; }
      b.enemyHp = Math.max(0, b.enemyHp - dmg);
      b.message = (b.corrupted ? '[CORRUPTED] ' : '') + 'Laser burns through for ' + dmg + ' damage!';
      b.messageIsAction = true;

    } else if (c === 1) {
      const hit = b.violinActive ? true : Math.random() > 0.25;
      if (hit) {
        let dmg = 22 + Math.floor(Math.random() * 14);
        if (b.steelActive)  { dmg = Math.floor(dmg * 1.5); b.steelActive = false; }
        if (b.violinActive) { dmg += 12; b.violinActive = false; }
        if (b.corrupted)    { dmg = Math.max(1, Math.floor(dmg / 2)); b.corrupted = false; }
        b.enemyHp = Math.max(0, b.enemyHp - dmg);
        b.message = 'Overload surge hits for ' + dmg + '! The Dragon\u2019s systems spike.';
        // Phase 3 stun bonus
        if (b.phase_dragon === 3 && Math.random() < 0.5) {
          b.skipEnemyTurn = true;
          b.message += ' Critical — Dragon stunned!';
        }
      } else {
        b.steelActive  = false;
        b.violinActive = false;
        if (b.corrupted) b.corrupted = false;
        b.message = "Overload missed \u2014 'Latency is everything,' sneers the Dragon.";
      }
      b.messageIsAction = true;

    } else if (c === 2) {
      b.isGuarding = true;
      const warn = b.dragonNext ? ' [' + _attackLabel(b.dragonNext) + ' incoming]' : '';
      b.message = "Firewall deployed. 'I\u2019ve tanked worse packets than this.'" + warn;

    } else {
      const itemKey = this._itemKeys[c - 3];
      if ((b.items[itemKey] || 0) <= 0) {
        b.message = "Depleted \u2014 pick another action.";
        return;
      }
      b.items[itemKey]--;

      switch (itemKey) {
        case 'stim':
          b.playerHp = Math.min(b.playerMaxHp, b.playerHp + 35);
          b.message = "Stim pack injected (+35 HP). Nanobots online.";
          if (b.corrupted) { b.corrupted = false; b.message += ' Corruption flushed.'; }
          break;
        case 'overclock':
          b.steelActive = true;
          b.message = "Overclock chip installed. Next LASER or OVERLOAD deals 2\xd7 damage!";
          break;
        case 'etrike':
          b.skipEnemyTurn = true;
          b.message = "E-trike swoops in! The Dragon\u2019s attack is dodged this turn.";
          break;
        case 'vpn':
          b.skipEnemyTurn = true;
          b.message = "VPN Shield activated \u2014 Lance goes dark! The Dragon scans empty air.";
          break;
        case 'pirate':
          b.playerHp = Math.min(b.playerMaxHp, b.playerHp + 20);
          b.violinActive = true;
          if (b.corrupted) { b.corrupted = false; b.message = "Pirate signal overrides corruption. +20 HP, next strike can\u2019t miss!"; }
          else b.message = "Pirate signal broadcasting. +20 HP, and the next strike can\u2019t miss!";
          break;
      }
      b.messageIsAction = false;
    }

    this._checkPhase(b, state);
    if (b.phase === 'end') return;

    b.phase = 'message';
    b.nextPhase = 'enemy';
    b.messageTimer = 1600;

    if (b.skipEnemyTurn) {
      b.nextMessage = 'The Dragon\u2019s processes thrash uselessly...';
    } else {
      b.nextMessage = 'The Dragon\u2019s cluster spins up...';
    }
  },

  /* ───────────────────────────────────────────────────────────
     PHASE CHECK
     ─────────────────────────────────────────────────────────── */
  _checkPhase(b, state) {
    if (b.enemyHp <= 0) {
      b.phase = 'end';
      b.message = 'The Dragon has crashed. "It had to be a buffer overflow in my legacy code..." The district erupts.';
      b.messageIsAction = true;
      setTimeout(() => { if (state.onBattleWin) state.onBattleWin(); }, 3800);
      return;
    }
    const pct = b.enemyHp / b.enemyMaxHp;
    if (pct <= 0.33 && b.phase_dragon < 3) {
      b.phase_dragon = 3;
      b.dragonCharging = false;
      b.corrupted = false;
      b.message = "Third monitor shatters. 'I\u2019m leaving dead processes behind me... as always.'";
      b.messageIsAction = true;
    } else if (pct <= 0.66 && b.phase_dragon < 2) {
      b.phase_dragon = 2;
      b.dragonCharging = false;
      b.message = 'Second monitor crashes to the floor. Then \u2014 every screen in the district lights up.';
      b.messageIsAction = true;
      state.pendingEvent = 'cutscene:dragon_broadcast';
    }
  },

  /* ───────────────────────────────────────────────────────────
     DRAGON ATTACK
     ─────────────────────────────────────────────────────────── */
  _dragonAttack(b, state) {
    if (b.skipEnemyTurn) {
      b.skipEnemyTurn = false;
      b.dragonNext = this._pickNext(b.phase_dragon);
      b.phase = 'message';
      b.nextPhase = 'player';
      b.nextMessage = _yourMove(b);
      b.messageTimer = 1400;
      b.message = 'The Dragon\u2019s strike finds only noise. Lance is safe.';
      return;
    }

    const p = b.phase_dragon, roll = Math.random();
    let dmg = 0, msg = '', guardable = true;
    const attackType = b.dragonNext || this._pickNext(p);

    if (attackType === 'charge') {
      b.dragonCharging = true;
      b.dragonNext = this._pickDamageMove(p);
      msg = '"Charging core processes..." The Dragon holds back \u2014 something big is loading.';
      dmg = 0; guardable = false;
      b.phase = 'message';
      b.nextPhase = 'player';
      b.nextMessage = _yourMove(b);
      b.messageTimer = 1900;
      b.message = msg;
      return;
    }

    if (attackType === 'corrupt') {
      b.corrupted = true;
      b.dragonNext = this._pickNext(p);
      msg = '"Your targeting is compromised." Dragon injects corrupted code \u2014 your next attack is weakened.';
      dmg = 0; guardable = false;
      b.phase = 'message';
      b.nextPhase = 'player';
      b.nextMessage = _yourMove(b);
      b.messageTimer = 1900;
      b.message = msg;
      b.messageIsAction = true;
      return;
    }

    // damage moves
    if (attackType === 'burst') {
      dmg = 8 + Math.floor(Math.random() * 7);
      msg = 'Data Burst scorches the connection!';
    } else if (attackType === 'sweep') {
      dmg = 6 + Math.floor(Math.random() * 6);
      msg = 'System Sweep! "Stability must be maintained."';
    } else if (attackType === 'surge') {
      dmg = 10 + Math.floor(Math.random() * 9);
      msg = 'Tri-Monitor Surge! All three screens blast at once!';
    } else if (attackType === 'spike') {
      dmg = 10 + Math.floor(Math.random() * 8);
      msg = '"Infrastructure requires sacrifice." Power Spike!';
    } else if (attackType === 'thermal') {
      dmg = 12 + Math.floor(Math.random() * 8);
      msg = '"System integrity demands this." Thermal Overload!';
    } else if (attackType === 'rage') {
      dmg = 13 + Math.floor(Math.random() * 10);
      msg = '"I AM THE NETWORK!" The Dragon rages with everything left!';
    } else if (attackType === 'voltage') {
      dmg = 8 + Math.floor(Math.random() * 7);
      msg = '"You cannot debug me. Nobody ever debugs me." Voltage Strike.';
    } else {
      dmg = 0;
      msg = '"My users \u2014 where are my users?" The Dragon hesitates.';
      guardable = false;
    }

    if (b.dragonCharging && dmg > 0) {
      dmg = Math.floor(dmg * 2);
      msg = '\u26a1 CHARGED! ' + msg;
      b.dragonCharging = false;
    }

    if (b.isGuarding && dmg > 0 && guardable) {
      const reduced = Math.max(1, Math.floor(dmg * 0.25));
      msg += ` (FIREWALL: ${dmg}\u2192${reduced})`;
      dmg = reduced;
    } else if (b.isGuarding && !guardable && dmg === 0) {
      msg += ' (Firewall had no effect \u2014 this was code, not force.)';
    }

    b.playerHp = Math.max(0, b.playerHp - dmg);

    if (b.playerHp <= 0) {
      b.phase = 'end';
      b.message = "Lance crashes. 'Three critical errors before... this makes four.' [ENTER to retry]";
      b.messageIsAction = false;
      setTimeout(() => { if (state.onBattleLose) state.onBattleLose(); }, 3000);
      return;
    }

    b.dragonNext = this._pickNext(p);
    b.message = msg;
    b.phase = 'message';
    b.nextPhase = 'player';
    b.nextMessage = _yourMove(b);
    b.messageTimer = 1900;
  },

  _pickNext(phase) {
    const r = Math.random();
    if (phase === 1) {
      if (r < 0.12) return 'charge';
      if (r < 0.38) return 'burst';
      if (r < 0.64) return 'sweep';
      return 'surge';
    } else if (phase === 2) {
      if (r < 0.15) return 'charge';
      if (r < 0.28) return 'corrupt';
      if (r < 0.56) return 'spike';
      return 'thermal';
    } else {
      if (r < 0.20) return 'charge';
      if (r < 0.35) return 'corrupt';
      if (r < 0.58) return 'rage';
      if (r < 0.80) return 'voltage';
      return 'hesitate';
    }
  },

  _pickDamageMove(phase) {
    if (phase === 1) return ['burst','sweep','surge'][Math.floor(Math.random()*3)];
    if (phase === 2) return ['spike','thermal'][Math.floor(Math.random()*2)];
    return ['rage','voltage'][Math.floor(Math.random()*2)];
  },
};

function _attackLabel(type) {
  return {
    burst:'DATA BURST', sweep:'SYSTEM SWEEP', surge:'TRI-SURGE',
    spike:'POWER SPIKE', thermal:'THERMAL OVL', rage:'FULL RAGE',
    voltage:'VOLTAGE STR', charge:'CHARGE', corrupt:'CORRUPT',
    hesitate:'?',
  }[type] || type.toUpperCase();
}

function _yourMove(b) {
  const parts = ['Your move.'];
  if (b.dragonNext && b.dragonNext !== 'hesitate') {
    parts.push('\u26a0 INCOMING: ' + _attackLabel(b.dragonNext));
  }
  if (b.corrupted) parts.push('[CORRUPTED \u2014 next attack halved]');
  if (b.dragonCharging) parts.push('[DRAGON CHARGED \u2014 brace!]');
  return parts.join('  ');
}

window.Combat = Combat;
