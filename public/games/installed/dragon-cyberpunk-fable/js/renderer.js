/**
 * Dragon — Renderer (cyberpunk edition).
 * Offscreen canvas at 320×240, blitted to 640×480 at 2× scale.
 * All text rendered as HTML via ui.js.
 */
'use strict';

/**
 * Single source of truth for postgame epilogue characters.
 * Used by drawPostgame (rendering) and game.js _onClick (hit-testing).
 * hitX/hitY are null for characters that are not clickable.
 */
/**
 * Hotspot positions are mapped directly to character figurines
 * in bg_palace_hall.png rendered at 320×240 via cover scaling.
 * Source image is 1376×768; cover crops 176px from each horizontal side
 * and scales the remaining 1024×768 to fit 320×240 (scale = 0.3125).
 *
 * Canvas formula from source coords:
 *   canvas_x = (src_x - 176) * 0.3125
 *   canvas_y = src_y * 0.3125
 *
 * Character source x estimates (left-to-right): Elena≈250 Charlie≈370
 * Barsik≈490 Mayor≈615 Hank≈735 Petrov≈855 Andreev≈975 Wu≈1100
 * Adjust hitX/hitW/hitH if click zones feel off.
 */
/**
 * All x positions are shifted ~36 px right relative to the first estimate so
 * labels sit above the correct figurine (Lance, leftmost, is not clickable and
 * sits where the old "Elena" label was).  labelY is lowered to sit just above
 * each character's head rather than floating above the whole image.
 * hitH covers ~90 % of the figure height.
 *
 * TUNING: if labels still feel off, adjust hitX / hitW / hitY / hitH here.
 */
// hitX = labelX-3, hitY = labelY-10 (starts above label),
// hitW = label.length*6+6 (matches highlight box width), hitH = 100 (covers full figure below label)
const POSTGAME_CHARS = [
  { id:'elena',   label:'ELENA',   labelX:52,  labelY:118, hitX:49,  hitY:108, hitW:36, hitH:100 },
  { id:'charlie', label:'CHARLIE', labelX:86,  labelY:118, hitX:83,  hitY:108, hitW:48, hitH:100 },
  { id:'barsik',  label:'BARSIK',  labelX:124, labelY:148, hitX:121, hitY:138, hitW:42, hitH:50  },
  { id:'mayor',   label:'MAYOR',   labelX:158, labelY:116, hitX:155, hitY:106, hitW:36, hitH:100 },
  { id:'hank',    label:'HANK',    labelX:201, labelY:118, hitX:198, hitY:108, hitW:30, hitH:100 },
  { id:'petrov',  label:'PETROV',  labelX:236, labelY:118, hitX:233, hitY:108, hitW:42, hitH:100 },
  { id:'andreev', label:'ANDREEV', labelX:270, labelY:118, hitX:267, hitY:108, hitW:48, hitH:100 },
];

function _wrapText(s, charsPerLine) {
  const words = s.split(' '), out = [];
  let line = '';
  for (const w of words) {
    if (line.length + w.length + (line ? 1 : 0) <= charsPerLine) {
      line += (line ? ' ' : '') + w;
    } else {
      if (line) out.push(line);
      line = w;
    }
  }
  if (line) out.push(line);
  return out.slice(0, 4);
}

const Renderer = {
  width: 320,
  height: 240,

  init() {
    this.mainCanvas = document.getElementById('game');
    this.mainCtx    = this.mainCanvas.getContext('2d');
    this.mainCtx.imageSmoothingEnabled = false;

    this.offscreen = document.createElement('canvas');
    this.offscreen.width  = this.width;
    this.offscreen.height = this.height;
    this.ctx = this.offscreen.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  },

  resize() {
    const container = this.mainCanvas.parentElement;
    const outerWrap = container.parentElement;
    const r = Math.min(outerWrap.clientWidth / 640, outerWrap.clientHeight / 480, 4.5);
    const w = Math.floor(640 * r), h = Math.floor(480 * r);
    this.mainCanvas.style.width  = w + 'px';
    this.mainCanvas.style.height = h + 'px';
    container.style.width  = w + 'px';
    container.style.height = h + 'px';
    if (window.UI) UI.setScale(r);
  },

  /**
   * Draw a background image with cover semantics: scale to fill the canvas
   * while preserving aspect ratio, cropping the excess from the center.
   * All source images are 1376×768 (16:9); canvas is 320×240 (4:3).
   */
  _drawBgCover(ctx, img, W, H) {
    const iW = img.naturalWidth, iH = img.naturalHeight;
    const scale = Math.max(W / iW, H / iH);
    const sw = W / scale, sh = H / scale;
    const sx = (iW - sw) / 2, sy = (iH - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
  },

  /* ---------- title — cyberpunk cityscape ---------- */
  drawTitle() {
    const ctx = this.ctx, W = this.width, H = this.height;
    const bg = ASSETS.imgs.bg_title;
    if (bg && bg.complete && bg.naturalWidth > 0) {
      this._drawBgCover(ctx, bg, W, H);
      const t = Date.now();
      const a = 0.04 + 0.03 * Math.sin(t / 900);
      ctx.fillStyle = `rgba(0,255,200,${a.toFixed(3)})`;
      ctx.fillRect(0, H - 4, W, 4);
      if (Math.floor(t / 3000) % 4 === 0) {
        ctx.fillStyle = 'rgba(255,0,100,0.06)';
        ctx.fillRect(0, (t * 0.02) % H, W, 2);
      }
    } else {
      ctx.fillStyle = '#04040e'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#0a0e1e'; ctx.fillRect(0, 0, W, H * 0.35);
      ctx.fillStyle = '#06060e';
      for (const [bx,bw,bh] of [
        [0,22,24],[24,18,36],[44,24,20],[70,16,44],[88,14,26],[104,20,18],
        [126,18,34],[146,14,22],[162,24,40],[188,16,26],[206,18,18],
        [226,20,32],[248,16,22],[266,24,28],[292,18,18],[312,8,24]
      ]) ctx.fillRect(bx, H - bh, bw, bh);
      ctx.fillStyle = '#00ffcc10'; ctx.fillRect(0, H - 2, W, 2);
    }
  },

  /* ---------- map ---------- */
  drawMap(map) {
    if (!map?.tiles) return;
    const ctx = this.ctx;
    for (let ty = 0; ty < map.tiles.length; ty++) {
      const row = map.tiles[ty]; if (!row) continue;
      for (let tx = 0; tx < row.length; tx++)
        ASSETS.drawTile(ctx, tx, ty, row[tx] || 'stone_floor');
    }
  },

  drawActors(map) {
    if (!map?.actors) return;
    const ctx = this.ctx;
    [...map.actors]
      .sort((a, b) => a.y - b.y)
      .forEach(a => { if (a.visible !== false) ASSETS.drawSprite(ctx, a); });
  },

  drawExitHighlights(map) {
    if (!map) return;
    const ctx = this.ctx;
    const TS = 16;
    const t  = Date.now();
    const fill   = 0.35 + 0.25 * Math.abs(Math.sin(t / 600));
    const border = 0.85;

    const _paint = (rows, cols, fCol, bCol) => {
      ctx.fillStyle = fCol.replace('A', fill.toFixed(2));
      for (const row of rows)
        for (const col of cols)
          ctx.fillRect(col * TS, row * TS, TS, TS);

      ctx.strokeStyle = bCol;
      ctx.lineWidth   = 1.5;
      for (const row of rows)
        for (const col of cols)
          ctx.strokeRect(col * TS + 0.75, row * TS + 0.75, TS - 1.5, TS - 1.5);
    };

    // exits → cyan
    for (const exit of (map.exits || []))
      _paint(exit.rows, exit.cols,
        `rgba(0,255,200,A)`, `rgba(0,255,200,${border})`);

    // battle triggers → magenta
    for (const tr of (map.triggers || []))
      _paint([tr.y], [tr.x],
        `rgba(255,0,100,A)`, `rgba(255,100,150,${border})`);
  },

  /* ---------- battle (pixel art only) ---------- */
  drawBattle(state) {
    const ctx = this.ctx, W = this.width, H = this.height;
    const b = state.battle; if (!b) return;

    const bgImg = ASSETS.imgs.bg_battle_cave;
    if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
      this._drawBgCover(ctx, bgImg, W, H);
      ctx.fillStyle = 'rgba(0,12,20,0.35)';
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = '#010810'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#041018'; ctx.fillRect(0, H * 0.5, W, H * 0.5);

      ctx.fillStyle = '#00886608';
      for (let lx = 0; lx < W; lx += 16) ctx.fillRect(lx, H * 0.5, 1, H * 0.5);
      for (let ly = Math.floor(H * 0.5); ly < H; ly += 12) ctx.fillRect(0, ly, W, 1);

      ctx.fillStyle = '#00ccaa';
      for (const [lx,ly,lw] of [[20,148,30],[80,156,18],[160,152,24],[220,158,20],[270,146,15]])
        ctx.fillRect(lx, ly, lw, 1);

      ctx.fillStyle = '#041018';
      for (const [sx,sw,sd] of [[10,4,14],[60,3,10],[120,6,18],[200,4,12],[260,5,16],[300,3,8]])
        ctx.fillRect(sx, 0, sw, sd);

      ctx.fillStyle = '#00ccaa10';
      ctx.fillRect(0, H * 0.5, W, 2);
    }

    const dPhase = b.phase_dragon || 1;
    ASSETS.drawDragonBattle(ctx, 90, 158, dPhase);
    ASSETS.drawLanceBattle(ctx, 255, 172);
  },

  /* ---------- cutscene (pixel art layer) ---------- */
  drawCutscene(state) {
    const cs = state.cutscene;
    if (!cs) return;
    const ctx = this.ctx, W = this.width, H = this.height;

    const bgKeys = {
      dragon_broadcast: 'bg_broadcast',
      lance_faint:      'bg_etrike_escape',
      mayor_credit:     'bg_palace_hall',
      workshop_intro:   'bg_workshop',
      lair_approach:    'bg_lair_entrance',
    };
    const bgKey = bgKeys[cs.id] || 'bg_battle_cave';
    const bgImg = ASSETS.imgs[bgKey];

    if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
      this._drawBgCover(ctx, bgImg, W, H);
    } else {
      ctx.fillStyle = '#04040e';
      ctx.fillRect(0, 0, W, H);
    }

    const t = cs.elapsed || 0;

    if (cs.id === 'dragon_broadcast') {
      // intense TV static / digital interference
      const alpha = 0.18 + 0.14 * Math.sin(t / 100);
      ctx.fillStyle = `rgba(0,136,255,${alpha.toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
      // heavy scan-lines
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let ly = 0; ly < H; ly += 3) ctx.fillRect(0, ly, W, 1);
      // glitch bars
      if (Math.floor(t / 200) % 5 === 0) {
        const gy = (t * 0.3) % H;
        ctx.fillStyle = 'rgba(255,0,100,0.2)';
        ctx.fillRect(0, gy, W, 4);
      }
    }

    if (cs.id === 'lance_faint') {
      const slideIdx = cs.slideIdx || 0;
      const alpha = slideIdx === 0 ? 0
                  : slideIdx === 1 ? 0.35
                  : Math.min(0.7, 0.35 + (t / 3000) * 0.35);
      if (alpha > 0) {
        ctx.fillStyle = `rgba(0,0,10,${alpha.toFixed(2)})`;
        ctx.fillRect(0, 0, W, H);
      }
      if (slideIdx >= 2) {
        // e-trike glow rising
        const trikeY = Math.max(H * 0.55, H - (t / 2000) * H * 0.4);
        ctx.fillStyle = '#0088ff';
        ctx.fillRect(W * 0.3, trikeY, W * 0.4, 12);
        ctx.fillStyle = '#00ffcc';
        ctx.fillRect(W * 0.3, trikeY, W * 0.4, 2);
        ctx.fillRect(W * 0.3, trikeY + 10, W * 0.4, 2);
        // propulsion glow
        ctx.fillStyle = 'rgba(0,255,200,0.15)';
        ctx.fillRect(W * 0.25, trikeY - 4, W * 0.5, 20);
      }
    }

    if (cs.id === 'mayor_credit') {
      if (Math.floor(t / 1800) % 7 === 0) {
        ctx.fillStyle = 'rgba(0,255,200,0.15)';
        ctx.fillRect(0, 0, W, H);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      for (let ly = 0; ly < H; ly += 4) ctx.fillRect(0, ly, W, 1);
    }

    if (cs.id === 'workshop_intro') {
      // warm amber tint — soldering heat, busy workshop
      ctx.fillStyle = 'rgba(20,8,0,0.22)';
      ctx.fillRect(0, 0, W, H);
      // faint dust-particle scan lines
      ctx.fillStyle = 'rgba(255,180,60,0.04)';
      for (let ly = 0; ly < H; ly += 5) ctx.fillRect(0, ly, W, 1);
      // subtle flicker like fluorescent light
      if (Math.floor(t / 120) % 18 === 0) {
        ctx.fillStyle = 'rgba(255,200,80,0.06)';
        ctx.fillRect(0, 0, W, H);
      }
    }

    if (cs.id === 'lair_approach') {
      // cold blue-green tint — server cold-air corridor
      ctx.fillStyle = 'rgba(0,6,20,0.28)';
      ctx.fillRect(0, 0, W, H);
      // slow pulsing danger glow from ahead
      const pulse = 0.04 + 0.03 * Math.sin(t / 400);
      ctx.fillStyle = `rgba(255,0,100,${pulse.toFixed(3)})`;
      ctx.fillRect(W * 0.3, H * 0.3, W * 0.4, H * 0.4);
      // scan lines
      ctx.fillStyle = 'rgba(0,255,200,0.04)';
      for (let ly = 0; ly < H; ly += 4) ctx.fillRect(0, ly, W, 1);
    }
  },

  /* ---------- postgame — interactive epilogue ---------- */
  drawPostgame(state) {
    const ctx = this.ctx, W = this.width, H = this.height;
    const bg = ASSETS.imgs.bg_palace_hall;
    if (bg && bg.complete && bg.naturalWidth > 0) {
      this._drawBgCover(ctx, bg, W, H);
      // light overlay only — image characters provide the visuals
      ctx.fillStyle = 'rgba(4,4,14,0.18)';
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = '#04040e'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#0a0a1e'; ctx.fillRect(0, 0, W, H * 0.6);
    }

    const t = Date.now();

    // neon grid overlay
    ctx.fillStyle = '#00ffcc04';
    for (let x = 0; x < W; x += 24) ctx.fillRect(x, 0, 1, H);
    for (let y = 0; y < H; y += 24) ctx.fillRect(0, y, W, 1);

    // name labels — hover highlights the active character
    const hover = state?.postgameHover || null;
    ctx.font = '8px monospace';
    for (const c of POSTGAME_CHARS) {
      const isHovered = hover === c.id && c.hitX !== null;
      if (isHovered) {
        // draw a faint highlight box behind the label text
        const tw = c.label.length * 6 + 6;
        ctx.fillStyle = 'rgba(0,255,200,0.22)';
        ctx.fillRect(c.labelX - 3, c.labelY - 8, tw, 12);
        ctx.strokeStyle = 'rgba(0,255,200,0.6)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(c.labelX - 3, c.labelY - 8, tw, 12);
      }
      ctx.fillStyle = isHovered ? '#ffffff' : (c.hitX !== null ? '#00ffcc' : '#4a6888');
      ctx.fillText(c.label, c.labelX, c.labelY);
    }

    // ominous computer terminal (top-right)
    const tx = 244, ty = 8, tw = 72, th = 68;
    ctx.fillStyle = '#08081a'; ctx.fillRect(tx, ty, tw, th);
    ctx.strokeStyle = '#ff0066'; ctx.lineWidth = 1;
    ctx.strokeRect(tx, ty, tw, th);
    ctx.fillStyle = '#0a1430'; ctx.fillRect(tx + 2, ty + 2, tw - 4, th - 4);

    ctx.fillStyle = '#ff0066'; ctx.font = '8px monospace';
    ctx.fillText('DRAGON', tx + 4, ty + 14);
    ctx.fillText('.SYS', tx + 4, ty + 24);
    ctx.fillStyle = '#ffcc00';
    ctx.fillText('COPY...', tx + 4, ty + 36);
    const elapsed = this._postgameT0 ? (t - this._postgameT0) : 0;
    const pct = Math.min(100, Math.floor(elapsed / 300)); // 30s to reach 100%
    const done = pct >= 100;
    ctx.fillStyle = done ? '#ff0066' : '#00ffcc';
    ctx.fillText(pct + '%', tx + 4, ty + 48);
    ctx.fillStyle = '#1a1a30'; ctx.fillRect(tx + 4, ty + 52, tw - 8, 6);
    ctx.fillStyle = done ? '#ff0066' : '#ffcc00';
    ctx.fillRect(tx + 4, ty + 52, Math.floor((tw - 8) * pct / 100), 6);
    ctx.fillStyle = '#ff006660'; ctx.font = '8px monospace';
    ctx.fillText(done ? '!!!!!!!' : 'LEAKED', tx + 4, ty + 66);

    if (done && Math.floor(t / 400) % 3 === 0) {
      ctx.fillStyle = 'rgba(255,0,100,0.2)';
      ctx.fillRect(tx, ty, tw, th);
    } else if (!done && Math.floor(t / 600) % 5 === 0) {
      ctx.fillStyle = 'rgba(255,0,100,0.12)';
      ctx.fillRect(tx, ty, tw, th);
    }

    // "THE END" message once upload completes
    if (done) {
      const flash = Math.floor(t / 500) % 2 === 0;
      ctx.fillStyle = 'rgba(4,4,14,0.75)';
      ctx.fillRect(20, 62, W - 40, 52);
      ctx.strokeStyle = '#ff0066';
      ctx.lineWidth = 1;
      ctx.strokeRect(20, 62, W - 40, 52);
      ctx.fillStyle = '#cc2020'; ctx.font = '16px monospace';
      ctx.fillText('— THE END —', 52, 84);
      ctx.fillStyle = flash ? '#ff0066' : '#ffcc00';
      ctx.font = '8px monospace';
      ctx.fillText('..but something escaped...', 42, 104);
    }

    ctx.fillStyle = '#4a709080'; ctx.font = '8px monospace';
    ctx.fillText('Click characters to talk', 88, 238);
  },

  /* ---------- master draw ---------- */
  drawAll(state) {
    if (state.scene !== 'postgame') this._postgameT0 = null;

    if (state.scene === 'title') {
      this.drawTitle();
    } else if (state.scene === 'map' && state.currentMap) {
      this.drawMap(state.currentMap);
      this.drawExitHighlights(state.currentMap);
      this.drawActors(state.currentMap);
    } else if (state.scene === 'battle') {
      this.drawBattle(state);
    } else if (state.scene === 'cutscene') {
      this.drawCutscene(state);
    } else if (state.scene === 'postgame') {
      if (!this._postgameT0) this._postgameT0 = Date.now();
      this.drawPostgame(state);
    }

    this.mainCtx.imageSmoothingEnabled = false;
    this.mainCtx.drawImage(this.offscreen, 0, 0, 640, 480);

    if (window.UI) UI.update(state);
  },
};

window.Renderer      = Renderer;
window._wrapText     = _wrapText;
window.POSTGAME_CHARS = POSTGAME_CHARS;
