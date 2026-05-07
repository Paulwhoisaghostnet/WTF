/**
 * Dragon — Story events and scene transitions (cyberpunk edition).
 *
 * Owns all story-event routing (_runEvent), map-entry helpers (_enter*),
 * battle outcome handlers (_onBattleWin/Lose/Retry), and postgame
 * character dialogues (_postgameDialogue).
 *
 * Receives a reference to the Game object via Events.init(game) so it
 * can call game._dlg, game._loadMap, game._playCutscene, and game.state.
 */
'use strict';

const Events = {
  _game: null,

  init(game) {
    this._game = game;
  },

  /* ── convenience accessors ─────────────────────────────────── */
  get _s()     { return this._game.state; },
  get _flags() { return this._game.state.flags; },
  _dlg(lines, cb)               { this._game._dlg(lines, cb); },
  _loadMap(id, lx, ly)          { this._game._loadMap(id, lx, ly); },
  _playCutscene(id, lines, cb, opts) { this._game._playCutscene(id, lines, cb, opts); },

  /* ══════════════════════════════════════════════════════════════
     STORY EVENT ROUTER
     ══════════════════════════════════════════════════════════════ */
  run(ev) {
    const s = this._s, flags = this._flags;

    /* ── mid-battle cutscene (fired by combat.js via pendingEvent) ── */
    if (ev === 'cutscene:dragon_broadcast') {
      const savedBattle = { ...s.battle };
      this._playCutscene('dragon_broadcast', STORY.dragon_broadcast, () => {
        s.scene  = 'battle';
        s.battle = savedBattle;
      }, { returnToBattle: savedBattle });
      return;
    }

    /* ── map exits ── */
    if (ev.startsWith('exit:')) {
      const [, to, lx, ly] = ev.split(':');
      const handlers = {
        kitchen:      () => this.enterKitchen(+lx, +ly),
        townSquare:   () => this.enterTownSquare(+lx, +ly),
        workshop:     () => this.enterWorkshop(+lx, +ly),
        mountain:     () => this.enterMountain(+lx, +ly),
        lairEntrance: () => this.enterLairEntrance(+lx, +ly),
        palace:       () => this.enterPalace(+lx, +ly),
        forest:       () => this._loadMap('forest', +lx, +ly),
      };
      if (handlers[to]) handlers[to]();
      return;
    }

    /* ══ FOREST ══════════════════════════════════════════ */
    if (ev === 'forest_intro') {
      if (!flags.forestIntro) {
        flags.forestIntro = true;
        this._dlg(STORY.forest_intro);
      }
      return;
    }

    /* ══ KITCHEN ═════════════════════════════════════════ */
    if (ev === 'kitchen_intro') {
      if (!flags.kitchenIntro) {
        flags.kitchenIntro = true;
        this._dlg(STORY.kitchen_intro);
      }
      return;
    }

    if (ev === 'talk_barsik') {
      if (!flags.barsikTold) {
        flags.barsikTold = true;
        this._dlg(STORY.talk_barsik_first, () => { s.pendingEvent = 'family_arrives'; });
      } else if (flags.dragonVisited) {
        this._dlg(STORY.talk_barsik_after_dragon);
      } else {
        this._dlg(STORY.talk_barsik_wait);
      }
      return;
    }

    if (ev === 'family_arrives') {
      const map = s.currentMap;
      const show = id => { const a = map.actors.find(x => x.id === id); if (a) a.visible = true; };
      show('charlie'); show('elena');
      this._dlg(STORY.family_arrives, () => { s.pendingEvent = 'dragon_visits'; });
      return;
    }

    if (ev === 'dragon_visits') {
      // Make the Dragon sprite visible left of the servers
      const map = s.currentMap;
      if (map) {
        const d = map.actors.find(a => a.id === 'dragon');
        if (d) d.visible = true;
      }
      this._dlg(STORY.dragon_visits, () => {
        flags.dragonVisited = true;
        this.enterTownSquare(5, 13);
      });
      return;
    }

    /* ══ TOWN SQUARE ═════════════════════════════════════ */
    if (ev === 'square_intro') {
      if (!flags.squareIntro) {
        flags.squareIntro = true;
        this._dlg(STORY.square_intro);
      }
      return;
    }

    /* ══ SYRINGE SCENE ════════════════════════════════════ */
    if (ev === 'elena_syringe_scene') {
      if (!flags.syringeSceneDone) {
        flags.syringeSceneDone = true;
        this._dlg(STORY.elena_syringe_scene);
      }
      return;
    }

    if (ev === 'talk_elena') {
      this._dlg(flags.syringeSceneDone ? STORY.talk_elena_after_syringe : STORY.talk_elena_before_syringe);
      return;
    }

    if (ev === 'talk_mayor') {
      this._dlg(STORY.talk_mayor);
      return;
    }

    if (ev === 'talk_charlie') {
      this._dlg(STORY.talk_charlie);
      return;
    }

    if (ev === 'talk_hank') {
      this._dlg(STORY.talk_hank);
      return;
    }

    /* ══ WORKSHOP ════════════════════════════════════════ */
    if (ev === 'workshop_intro') {
      if (!flags.workshopIntro) {
        flags.workshopIntro = true;
        // Barsik left stim packs on the worktable before you arrived
        if (!s.battleItems) s.battleItems = {};
        s.battleItems.stim = (s.battleItems.stim || 0) + 2;
        this._playCutscene('workshop_intro', STORY.workshop_intro, () => { s.scene = 'map'; });
      }
      return;
    }

    if (ev === 'talk_blacksmith') {
      if (!flags.smythGifted) {
        flags.smythGifted = true;
        s.lastChoiceCorrect = null;
        this._dlg(STORY.talk_blacksmith, () => {
          if (s.lastChoiceCorrect !== false) {
            if (!s.battleItems) s.battleItems = {};
            s.battleItems.overclock = (s.battleItems.overclock || 0) + 2;
          }
        });
      } else {
        this._dlg(STORY.talk_blacksmith_again);
      }
      return;
    }

    if (ev === 'talk_petrov') {
      if (!flags.petrovGifted) {
        flags.petrovGifted = true;
        s.lastChoiceCorrect = null;
        this._dlg(STORY.talk_petrov, () => {
          if (s.lastChoiceCorrect !== false) {
            if (!s.battleItems) s.battleItems = {};
            s.battleItems.etrike = (s.battleItems.etrike || 0) + 1;
          }
        });
      } else {
        this._dlg(STORY.talk_petrov_again);
      }
      return;
    }

    if (ev === 'talk_hatter') {
      if (!flags.hatterGifted) {
        flags.hatterGifted = true;
        s.lastChoiceCorrect = null;
        this._dlg(STORY.talk_hatter, () => {
          if (s.lastChoiceCorrect !== false) {
            if (!s.battleItems) s.battleItems = {};
            s.battleItems.vpn = (s.battleItems.vpn || 0) + 1;
          }
        });
      } else {
        this._dlg(STORY.talk_hatter_again);
      }
      return;
    }

    if (ev === 'talk_luthier') {
      if (!flags.wuGifted) {
        flags.wuGifted = true;
        s.lastChoiceCorrect = null;
        this._dlg(STORY.talk_luthier, () => {
          if (s.lastChoiceCorrect !== false) {
            if (!s.battleItems) s.battleItems = {};
            s.battleItems.pirate = (s.battleItems.pirate || 0) + 2;
          }
        });
      } else {
        this._dlg(STORY.talk_luthier_again);
      }
      return;
    }

    /* ══ MOUNTAIN / LAIR ═════════════════════════════════ */
    if (ev === 'mountain_intro') {
      if (!flags.mountainIntro) {
        flags.mountainIntro = true;
        this._dlg(STORY.mountain_intro);
      }
      return;
    }

    if (ev === 'lair_intro') {
      if (!flags.lairIntro) {
        flags.lairIntro = true;
        this._playCutscene('lair_approach', STORY.lair_intro, () => { s.scene = 'map'; });
      }
      return;
    }

    if (ev === 'start_battle') {
      if (!flags.battleStarted) {
        flags.battleStarted = true;
        this._dlg(STORY.start_battle, () => {
          Combat.start(s);
          s.onBattleWin  = () => this.onBattleWin();
          s.onBattleLose = () => this.onBattleLose();
        });
      }
      return;
    }

    /* ══ PALACE ══════════════════════════════════════════ */
    if (ev === 'palace_intro') {
      if (!flags.palaceIntro) {
        flags.palaceIntro = true;
        this._dlg(STORY.palace_intro, () => { s.pendingEvent = 'mayor_press_conference'; });
      }
      return;
    }

    if (ev === 'mayor_press_conference') {
      this._playCutscene('mayor_credit', STORY.mayor_press_conference,
        () => { s.pendingEvent = 'palace_confrontation'; });
      return;
    }

    if (ev === 'palace_confrontation') {
      this._dlg(STORY.palace_confrontation, () => { s.pendingEvent = 'ending'; });
      return;
    }

    if (ev === 'ending') {
      this._dlg(STORY.ending, () => { s.scene = 'postgame'; });
      return;
    }
  },

  /* ══ SCENE TRANSITIONS ════════════════════════════════════════ */
  startForest() {
    this._loadMap('forest', 9, 13);
    this._s.pendingEvent = 'forest_intro';
  },

  enterKitchen(lx, ly) {
    this._loadMap('kitchen', lx ?? 9, ly ?? 13);
    if (!this._flags.kitchenIntro) this._s.pendingEvent = 'kitchen_intro';
  },

  enterTownSquare(lx, ly) {
    this._loadMap('townSquare', lx ?? 5, ly ?? 13);
    const flags = this._flags;
    const s = this._s;

    // Gate the east exit to mountain until the player has visited the workshop
    if (!flags.workshopIntro && s.currentMap) {
      s.currentMap.exits = s.currentMap.exits.filter(e => e.to !== 'mountain');
    }

    if (!flags.squareIntro) {
      s.pendingEvent = 'square_intro';
    } else if (flags.workshopIntro && !flags.syringeSceneDone) {
      // Player returns from workshop — trigger syringe scene
      s.pendingEvent = 'elena_syringe_scene';
    }
  },

  enterWorkshop(lx, ly) {
    this._loadMap('workshop', lx ?? 9, ly ?? 13);
    if (!this._flags.workshopIntro) this._s.pendingEvent = 'workshop_intro';
  },

  enterMountain(lx, ly) {
    this._loadMap('mountain', lx ?? 2, ly ?? 13);
    if (!this._flags.mountainIntro) this._s.pendingEvent = 'mountain_intro';
  },

  enterLairEntrance(lx, ly) {
    this._loadMap('lairEntrance', lx ?? 9, ly ?? 12);
    if (!this._flags.lairIntro) this._s.pendingEvent = 'lair_intro';
  },

  enterPalace(lx, ly) {
    this._loadMap('palace', lx ?? 9, ly ?? 13);
    if (!this._flags.palaceIntro) this._s.pendingEvent = 'palace_intro';
  },

  /* ══ BATTLE OUTCOMES ══════════════════════════════════════════ */
  onBattleWin() {
    const s = this._s;
    s.battle = null;
    this._playCutscene('lance_faint', STORY.battle_win, () => {
      this.enterPalace(9, 13);
    });
  },

  onBattleLose() {
    this._dlg(STORY.battle_lose, () => { this.retryBattle(); });
  },

  retryBattle() {
    const f = this._flags;
    f.battleStarted = false;
    f.lairIntro = false;
    this.enterLairEntrance(9, 10);
    this._s.pendingEvent = 'start_battle';
  },

  /* ══ POSTGAME CHARACTER DIALOGUES ═════════════════════════════ */
  postgameDialogue(id) {
    const s = this._s;
    if (s.dialogue?.active) return;
    const key = 'postgame_' + id;
    if (STORY[key]) this._dlg(STORY[key]);
  },
};

window.Events = Events;
