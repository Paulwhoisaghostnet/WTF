/**
 * Dragon — HTML text overlay (UI module, cyberpunk edition).
 * Includes battle description bubbles and postgame menu.
 */
'use strict';

const _cmdDescs = {
  0: 'Laser strike. 12\u201320 DMG. Halved if CORRUPTED.',
  1: 'High-power burst. 22\u201335 DMG (75% hit). Stuns in phase 3.',
  2: 'Firewall. Blocks ~75% of TELEGRAPHED attacks.',
  3: 'Stim pack. Restores 35 HP. Also clears CORRUPTED.',
  4: 'Overclock chip. Next attack deals 2\xd7 DMG.',
  5: 'E-Trike. Dodge the next attack.',
  6: 'VPN Shield. Go dark, dodge next attack.',
  7: 'Pirate Signal. +20 HP, auto-hit, clears CORRUPTED.',
};

const UI = {
  _els: null,

  init() {
    const $ = id => document.getElementById(id);
    this._els = {
      title:       $('ui-title'),
      postgame:    $('ui-postgame'),
      mapHud:      $('ui-map-hud'),
      mapName:     $('ui-map-name'),
      dlg:         $('ui-dlg'),
      dlgSpeaker:  $('ui-dlg-speaker'),
      dlgText:     $('ui-dlg-text'),
      dlgChoices:  $('ui-dlg-choices'),
      dlgArrow:    $('ui-dlg-arrow'),
      battle:      $('ui-battle'),
      hpFillL:     $('ui-hp-fill-left'),
      hpNumsL:     $('ui-hp-nums-left'),
      hpFillR:     $('ui-hp-fill-right'),
      hpNumsR:     $('ui-hp-nums-right'),
      phase:       $('ui-phase'),
      dragonLabel: $('ui-dragon-label'),
      battleMsg:   $('ui-battle-msg'),
      battleCmds:  $('ui-battle-cmds'),
      battleDesc:  $('ui-battle-desc'),
      cmds:        [0,1,2,3,4,5,6,7].map(i => $('ui-cmd-' + i)),
    };
  },

  setScale(r) {
    const layer = document.getElementById('ui-layer');
    if (!layer) return;
    layer.style.fontSize = Math.max(16, Math.round(20 * r / 1.5)) + 'px';
  },

  update(state) {
    if (!this._els) return;
    this._title(state);
    this._postgame(state);
    this._mapHud(state);
    this._dialogue(state);
    this._battle(state);
  },

  _title(state) {
    const el = this._els.title;
    if (!el) return;
    el.style.display = state.scene === 'title' ? 'flex' : 'none';
  },

  _postgame(state) {
    const el = this._els.postgame;
    if (!el) return;
    el.style.display = state.scene === 'postgame' ? 'flex' : 'none';
  },

  _mapHud(state) {
    const e = this._els;
    const isCutscene = state.scene === 'cutscene';
    const show = (state.scene === 'map' || isCutscene) && state.currentMap && !state.dialogue?.active && !isCutscene;
    e.mapHud.style.display = show ? 'block' : 'none';
    if (show) e.mapName.textContent = state.currentMap.name || '';
  },

  _dialogue(state) {
    const e = this._els;
    const dlg = state.dialogue;

    if (!dlg?.active) {
      e.dlg.style.display = 'none';
      if (e.dlgChoices) { e.dlgChoices.style.display = 'none'; e.dlgChoices.innerHTML = ''; }
      return;
    }
    e.dlg.style.display = 'block';

    const line    = (dlg.lines || [])[dlg.currentLine || 0];
    const speaker = (typeof line === 'object' && line) ? line.speaker : null;
    if (speaker) {
      e.dlgSpeaker.style.display    = 'block';
      e.dlgSpeaker.textContent      = speaker;
      e.dlgSpeaker.style.background = _speakerColor(speaker);
    } else {
      e.dlgSpeaker.style.display = 'none';
    }

    const visible = (dlg.fullText || '').slice(0, dlg.currentChar || 0);
    if (e.dlgText.textContent !== visible) e.dlgText.textContent = visible;

    // Choice display
    if (e.dlgChoices) {
      if (dlg.showingChoices && dlg.choices?.length) {
        e.dlgChoices.style.display = 'flex';
        // Rebuild only when choice set changes
        if (e.dlgChoices.children.length !== dlg.choices.length) {
          e.dlgChoices.innerHTML = '';
          dlg.choices.forEach((c, i) => {
            const btn = document.createElement('div');
            btn.className = 'dlg-choice';
            btn.setAttribute('data-choice-idx', i);
            btn.setAttribute('tabindex', '0');
            btn.style.pointerEvents = 'auto';
            btn.innerHTML = `<span class="dlg-choice-num">[${i + 1}]</span>${c.text}`;
            e.dlgChoices.appendChild(btn);
          });
        }
        // Sync keyboard-focus class every frame (cheap array walk)
        const kids = e.dlgChoices.children;
        for (let i = 0; i < kids.length; i++) {
          kids[i].classList.toggle('focused', i === (dlg.focusedChoice || 0));
        }
        e.dlgArrow.style.opacity = '0';
      } else {
        e.dlgChoices.style.display = 'none';
        if (e.dlgChoices.children.length) e.dlgChoices.innerHTML = '';
        const done = (dlg.currentChar || 0) >= (dlg.fullText || '').length;
        e.dlgArrow.style.opacity = done && (Date.now() / 450 | 0) % 2 === 0 ? '1' : '0';
      }
    } else {
      const done = (dlg.currentChar || 0) >= (dlg.fullText || '').length;
      e.dlgArrow.style.opacity = done && (Date.now() / 450 | 0) % 2 === 0 ? '1' : '0';
    }
  },

  _battle(state) {
    const e = this._els;
    if (state.scene !== 'battle' || !state.battle || state.scene === 'cutscene') {
      e.battle.style.display = 'none';
      return;
    }
    e.battle.style.display = 'block';
    const b = state.battle;

    this._setHP(e.hpFillL, e.hpNumsL, b.playerHp, b.playerMaxHp);
    this._setHP(e.hpFillR, e.hpNumsR, b.enemyHp,  b.enemyMaxHp);

    const phaseLabel = ['THREE MONITORS','TWO MONITORS','LAST MONITOR'][Math.min((b.phase_dragon||1)-1,2)];
    const charging = b.dragonCharging ? ' \u26a1CHARGED' : '';
    const corrupt  = b.corrupted      ? ' \u2620CORRUPTED' : '';
    e.phase.textContent = phaseLabel + charging + corrupt;
    e.phase.style.color = b.dragonCharging ? '#ff6600' : b.corrupted ? '#ff0066' : '';

    const msg = b.message || '';
    if (e.battleMsg.textContent !== msg) e.battleMsg.textContent = msg;
    e.battleMsg.className = b.messageIsAction ? 'accent' : '';

    if (b.phase === 'player') {
      e.battleCmds.style.display = 'grid';
      const ik = ['stim', 'overclock', 'etrike', 'vpn', 'pirate'];
      const labels = [
        'LASER', 'OVERLOAD', 'FIREWALL',
        'STIM\xd7' + (b.items.stim || 0),
        'OCLK\xd7' + (b.items.overclock || 0),
        'TRIKE\xd7' + (b.items.etrike || 0),
        'VPN\xd7' + (b.items.vpn || 0),
        'PIRATE\xd7' + (b.items.pirate || 0),
      ];
      e.cmds.forEach((el, i) => {
        if (!el) return;
        const sel = b.cursor === i;
        const dim = i >= 3 && (b.items[ik[i - 3]] || 0) <= 0;
        el.textContent = (sel ? '\u25b8' : ' ') + labels[i];
        el.className = 'ui-cmd' + (sel ? ' sel' : '') + (dim ? ' dim' : '');
      });

      if (e.battleDesc) {
        e.battleDesc.style.display = 'block';
        const desc = _cmdDescs[b.cursor] || '';
        if (e.battleDesc.textContent !== desc) e.battleDesc.textContent = desc;
      }
    } else {
      e.battleCmds.style.display = 'none';
      if (e.battleDesc) e.battleDesc.style.display = 'none';
    }
  },

  _setHP(fill, nums, hp, maxHp) {
    if (!fill || !nums) return;
    const pct = Math.max(0, Math.min(1, hp / maxHp));
    const col = pct > 0.5 ? '#00ffcc' : pct > 0.25 ? '#ffcc00' : '#ff0066';
    fill.style.width           = (pct * 100).toFixed(1) + '%';
    fill.style.backgroundColor = col;
    fill.style.boxShadow       = `0 0 4px ${col}60`;
    const txt = hp + '/' + maxHp;
    if (nums.textContent !== txt) nums.textContent = txt;
  },
};

function _speakerColor(name) {
  if (!name) return '#00ffcc';
  return {
    LANCE:'#0044aa', ELENA:'#aa0044', CHARLIE:'#4a2a6a',
    MAYOR:'#1a2a3a', HANK:'#2a3040', BARSIK:'#884410',
    DRAGON:'#660028', NARRATOR:'#1a3050', REPORTER:'#0a0a0a',
    PETROV:'#1a4a2a', ANDREEV:'#3a1a08', WU:'#083a4a',
  }[name.toUpperCase()] || '#00ffcc';
}

window.UI             = UI;
window._speakerColor  = _speakerColor;
