/**
 * Dragon — Core game loop, state, and input (cyberpunk edition).
 *
 * Characters:
 *   Lance           — Drifter. Reads the feeds. Came anyway.
 *   The Dragon      — Has run this district for 400 years. Calls it infrastructure.
 *   Charlie Romanov — Data archivist. Elena's father. Knows better.
 *   Elena Romanov   — His daughter. Has been performing compliance her whole life.
 *   Mayor Brooks    — Fully owned by the Dragon. Counts metrics like calories.
 *   Hank Brooks     — His son. The narrative manager. There's always a Hank.
 *   Barsik          — The cat. The only one who figured it out early.
 *
 * Story events → events.js
 * Dialogue data → story.js
 * All dt in milliseconds.
 */
'use strict';

const Game = {
  state: {
    scene: 'title',
    currentMapId: null,
    currentMap: null,
    dialogue: null,
    battle: null,
    cutscene: null,
    pendingEvent: null,
    battleItems: null,
    flags: {},
  },

  init() {
    ASSETS.init();
    Renderer.init();
    UI.init();
    Events.init(this);
    this._bindInput();
    this._lastT = performance.now();
    requestAnimationFrame(t => { this._lastT = t; this._loop(t); });
  },

  /* ─── input ────────────────────────────────────────────── */
  _bindInput() {
    document.addEventListener('keydown', e => {
      if (e.target?.tagName === 'INPUT') return;
      e.preventDefault();
      this._onKey(e.key, e.repeat);
    });

    const canvas = document.getElementById('game');
    canvas.addEventListener('pointerdown', e => { this._onClick(e); });

    canvas.addEventListener('mousemove', e => {
      if (this.state.scene !== 'postgame') return;
      const rect   = canvas.getBoundingClientRect();
      const scaleX = 320 / rect.width;
      const scaleY = 240 / rect.height;
      const gx = (e.clientX - rect.left) * scaleX;
      const gy = (e.clientY - rect.top)  * scaleY;
      let found = null;
      for (const c of POSTGAME_CHARS) {
        if (c.hitX !== null && gx >= c.hitX && gx <= c.hitX + c.hitW &&
            gy >= c.hitY && gy <= c.hitY + c.hitH) {
          found = c.id;
          break;
        }
      }
      this.state.postgameHover = found;
    });

    // dialogue choice clicks (delegated via parent container)
    const choicesEl = document.getElementById('ui-dlg-choices');
    if (choicesEl) {
      choicesEl.addEventListener('click', e => {
        const btn = e.target.closest('[data-choice-idx]');
        if (!btn) return;
        const idx = parseInt(btn.getAttribute('data-choice-idx'), 10);
        const s = this.state;
        if (s.dialogue?.active && s.dialogue.showingChoices) {
          Dialogue.selectChoice(s, s.dialogue, idx);
        }
      });
    }

    // battle command div clicks (click to select, click again to execute)
    for (let i = 0; i < 8; i++) {
      const el = document.getElementById('ui-cmd-' + i);
      if (el) {
        el.style.pointerEvents = 'auto';
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => {
          const s = this.state;
          if (s.scene === 'battle' && s.battle && s.battle.phase === 'player') {
            if (s.battle.cursor === i) Combat.input('Enter', s);
            else s.battle.cursor = i;
          }
        });
      }
    }
  },

  _onClick(e) {
    const s = this.state;
    const canvas = document.getElementById('game');
    const rect = canvas.getBoundingClientRect();
    const scaleX = 320 / rect.width;
    const scaleY = 240 / rect.height;
    const gx = (e.clientX - rect.left) * scaleX;
    const gy = (e.clientY - rect.top)  * scaleY;

    if (s.scene === 'title') {
      Events.startForest();
      return;
    }

    if (s.dialogue?.active) {
      // Canvas clicks don't advance when the choice menu is open (handled by DOM buttons)
      if (!s.dialogue.showingChoices) this._onKey('Enter');
      return;
    }

    if (s.scene === 'cutscene') {
      this._onKey('Enter');
      return;
    }

    if (s.scene === 'postgame') {
      for (const c of POSTGAME_CHARS) {
        if (c.hitX !== null && gx >= c.hitX && gx <= c.hitX + c.hitW &&
            gy >= c.hitY && gy <= c.hitY + c.hitH) {
          Events.postgameDialogue(c.id);
          return;
        }
      }
      return;
    }

    if (s.scene === 'battle' && s.battle) {
      if (s.battle.phase === 'player') {
        if (gy > 155) {
          const col = Math.min(3, Math.floor(gx / 80));
          const row = gy > 190 ? 1 : 0;
          const idx = row * 4 + col;
          if (s.battle.cursor === idx) Combat.input('Enter', s);
          else s.battle.cursor = idx;
        } else {
          Combat.input('Enter', s);
        }
      } else {
        Combat.input('Enter', s);
      }
      return;
    }

    if (s.scene === 'map' && s.currentMap) {
      const hero = s.currentMap.actors.find(a => a.id === 'lance');
      if (!hero) return;
      const hx = hero.x * 16 + 8;
      const hy = hero.y * 16 + 8;
      const dx = gx - hx;
      const dy = gy - hy;

      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) {
        Actors.interact(s);
        return;
      }

      if (Math.abs(dx) > Math.abs(dy)) {
        Actors.move(s, dx > 0 ? 1 : -1, 0);
      } else {
        Actors.move(s, 0, dy > 0 ? 1 : -1);
      }
    }
  },

  _onKey(key, repeat = false) {
    const s = this.state;

    if (s.scene === 'title') {
      if (key === 'Enter' || key === ' ') Events.startForest();
      return;
    }

    if (s.dialogue?.active) {
      // Choice menu navigation
      if (s.dialogue.showingChoices) {
        // Arrow navigation is always allowed (even on repeat, for quick scrolling)
        if (key === 'ArrowUp'   || key === 'w' || key === 'W') { Dialogue.moveFocus(s.dialogue, -1); return; }
        if (key === 'ArrowDown' || key === 's' || key === 'S') { Dialogue.moveFocus(s.dialogue,  1); return; }
        // Confirm / direct number — skip if this is a key-repeat event to prevent
        // accidental selection when the choice menu opened on the same keydown
        if (!repeat) {
          if (key === 'Enter' || key === ' ' || key === 'z' || key === 'Z') {
            Dialogue.selectChoice(s, s.dialogue, s.dialogue.focusedChoice || 0);
            return;
          }
          const byNum = { '1': 0, '2': 1, '3': 2 }[key];
          if (byNum !== undefined) Dialogue.selectChoice(s, s.dialogue, byNum);
        }
        return;
      }
      if (['Enter', ' ', 'z', 'Z'].includes(key)) {
        const res = Dialogue.advance(s.dialogue);
        if (res.done) {
          s.dialogue = null;
          if (s.scene === 'cutscene' && s.cutscene) {
            if (s.cutscene._returnToBattle) {
              const saved = s.cutscene._returnToBattle;
              s.cutscene = null;
              s.scene  = 'battle';
              s.battle = saved;
            } else {
              const done = s.cutscene.onDone;
              s.cutscene = null;
              if (s.currentMap) s.scene = 'map';
              if (done) done();
            }
          }
        }
      }
      return;
    }

    if (s.scene === 'cutscene') {
      if (['Enter', ' ', 'z', 'Z'].includes(key) && s.cutscene) {
        const cs = s.cutscene;
        cs.slideIdx = (cs.slideIdx || 0) + 1;
        if (cs.slideIdx >= (cs.totalSlides || 1)) {
          const done = cs.onDone;
          s.cutscene = null;
          if (done) done();
        }
      }
      return;
    }

    if (s.scene === 'postgame') return; // handled by click only

    if (s.scene === 'battle') {
      Combat.input(key, s);
      return;
    }

    if (s.scene === 'map') {
      const move = {
        ArrowUp:[0,-1], ArrowDown:[0,1], ArrowLeft:[-1,0], ArrowRight:[1,0],
        w:[0,-1], s:[0,1], a:[-1,0], d:[1,0],
        W:[0,-1], S:[0,1], A:[-1,0], D:[1,0],
      };
      if (move[key]) Actors.move(s, move[key][0], move[key][1]);
      if (['Enter', ' ', 'z', 'Z'].includes(key)) Actors.interact(s);
    }
  },

  /* ─── loop ─────────────────────────────────────────────── */
  _loop(now) {
    const dt = Math.min(now - this._lastT, 80);
    this._lastT = now;
    this._update(dt);
    Renderer.drawAll(this.state);
    requestAnimationFrame(t => this._loop(t));
  },

  _update(dt) {
    const s = this.state;
    ASSETS.updateAnim(dt);
    if (s.dialogue?.active) Dialogue.tick(dt, s.dialogue);
    if (s.scene === 'battle') Combat.update(dt, s);
    if (s.scene === 'cutscene' && s.cutscene) {
      s.cutscene.elapsed = (s.cutscene.elapsed || 0) + dt;
    }
    if (s.pendingEvent) {
      const ev = s.pendingEvent; s.pendingEvent = null;
      Events.run(ev);
    }
  },

  /* ─── helpers (used by events.js via this._game reference) ─── */
  _dlg(lines, onComplete) {
    this.state.dialogue = Dialogue.show(lines, { onComplete });
  },

  _loadMap(id, lx, ly) {
    const s = this.state;
    s.scene = 'map';
    s.currentMapId = id;
    s.currentMap = Maps.getMap(id);
    s.dialogue = null;
    s.battle = null;
    s.cutscene = null;
    const hero = s.currentMap.actors.find(a => a.id === 'lance');
    if (hero && lx !== undefined) { hero.x = lx; hero.y = ly; }
  },

  _playCutscene(id, lines, onDone, opts = {}) {
    const s = this.state;
    s.scene = 'cutscene';
    s.cutscene = {
      id,
      slideIdx: 0,
      totalSlides: opts.totalSlides || 1,
      elapsed: 0,
      _returnToBattle: opts.returnToBattle || null,
      onDone,
    };
    if (lines && lines.length > 0) this._dlg(lines);
  },
};

window.Game = Game;
document.addEventListener('DOMContentLoaded', () => Game.init());
