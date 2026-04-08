import { useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Hourglass } from "react95";
import { AppWindow } from "../components/layout/AppWindow";
import { useWallet } from "../lib/wallet-context";
import { api } from "../lib/api";

interface TokenSummary {
  name: string;
  balance: number;
  thumbnail?: string;
}

interface Coin {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  settled: boolean;
  shimmerPhase: number;
  shimmerSpeed: number;
  baseHue: number;
  tokenName: string;
  angle: number;
  angularVel: number;
}

interface Dragon {
  x: number;
  y: number;
  dir: number;
  wingPhase: number;
  jawPhase: number;
  breathTimer: number;
  dropTimer: number;
  bobPhase: number;
}

interface GuineaPig {
  x: number;
  y: number;
  targetX: number;
  state: "wander" | "goto_coin" | "carry" | "place" | "push" | "rest";
  stateTimer: number;
  dir: number;
  legPhase: number;
  tailWag: number;
  earWiggle: number;
  carryCoin: Coin | null;
  placeX: number;
  speed: number;
  blinkTimer: number;
  blinkOpen: boolean;
}

const GRAVITY = 0.12;
const BOUNCE = 0.25;
const FRICTION = 0.88;
const COIN_R = 2.5;

function runScene(
  canvas: HTMLCanvasElement,
  tokens: TokenSummary[],
  totalCoins: number,
  stopRef: { current: boolean }
) {
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;
  const FLOOR = H - 30;
  const MAX_VISIBLE = Math.min(totalCoins, 4000);
  const DROP_RATE = Math.max(1, Math.floor(40 / Math.min(totalCoins, 200)));

  const coins: Coin[] = [];
  let tokenIdx = 0;
  let editionIdx = 0;
  let dropped = 0;
  let tick = 0;

  const dragon: Dragon = {
    x: W * 0.3,
    y: 55,
    dir: 1,
    wingPhase: 0,
    jawPhase: 0,
    breathTimer: 0,
    dropTimer: 0,
    bobPhase: Math.random() * Math.PI * 2,
  };

  const pig: GuineaPig = {
    x: W / 2,
    y: FLOOR,
    targetX: W / 2,
    state: "wander",
    stateTimer: 120,
    dir: 1,
    legPhase: 0,
    tailWag: 0,
    earWiggle: 0,
    carryCoin: null,
    placeX: W * 0.8,
    speed: 0,
    blinkTimer: 200,
    blinkOpen: true,
  };

  function nextToken(): TokenSummary {
    const t = tokens[tokenIdx % tokens.length];
    editionIdx++;
    if (editionIdx >= t.balance) {
      editionIdx = 0;
      tokenIdx = (tokenIdx + 1) % tokens.length;
    }
    return t;
  }

  function dropCoin() {
    if (dropped >= MAX_VISIBLE) return;
    const t = nextToken();
    dropped++;
    const hue = 38 + (Math.random() - 0.5) * 16;
    coins.push({
      x: dragon.x + (Math.random() - 0.5) * 20,
      y: dragon.y + 20,
      vx: dragon.dir * 0.4 + (Math.random() - 0.5) * 1.5,
      vy: Math.random() * 0.5,
      r: COIN_R + Math.random() * 1,
      settled: false,
      shimmerPhase: Math.random() * Math.PI * 2,
      shimmerSpeed: 0.02 + Math.random() * 0.03,
      baseHue: hue,
      tokenName: t.name,
      angle: Math.random() * Math.PI * 2,
      angularVel: (Math.random() - 0.5) * 0.2,
    });
  }

  /* ── spatial grid for coin-coin collision ───────────── */
  const CELL = COIN_R * 6;
  const GRID_COLS = Math.ceil(W / CELL);
  const GRID_ROWS = Math.ceil(H / CELL);
  const grid: Coin[][] = new Array(GRID_COLS * GRID_ROWS);

  function buildGrid() {
    for (let i = 0; i < grid.length; i++) grid[i] = [];
    for (const c of coins) {
      const gx = Math.floor(c.x / CELL);
      const gy = Math.floor(c.y / CELL);
      if (gx >= 0 && gx < GRID_COLS && gy >= 0 && gy < GRID_ROWS) {
        grid[gy * GRID_COLS + gx].push(c);
      }
    }
  }

  function neighborsOf(c: Coin): Coin[] {
    const gx = Math.floor(c.x / CELL);
    const gy = Math.floor(c.y / CELL);
    const result: Coin[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = gx + dx;
        const ny = gy + dy;
        if (nx >= 0 && nx < GRID_COLS && ny >= 0 && ny < GRID_ROWS) {
          const cell = grid[ny * GRID_COLS + nx];
          for (const o of cell) {
            if (o !== c) result.push(o);
          }
        }
      }
    }
    return result;
  }

  /* ── physics ────────────────────────────────────────── */

  function physicsTick() {
    buildGrid();

    for (const c of coins) {
      if (c.settled) {
        c.shimmerPhase += c.shimmerSpeed;
        continue;
      }

      c.vy += GRAVITY;
      c.x += c.vx;
      c.y += c.vy;
      c.angle += c.angularVel;
      c.shimmerPhase += c.shimmerSpeed;

      // Walls
      if (c.x < c.r) { c.x = c.r; c.vx = Math.abs(c.vx) * BOUNCE; c.angularVel *= -0.5; }
      if (c.x > W - c.r) { c.x = W - c.r; c.vx = -Math.abs(c.vx) * BOUNCE; c.angularVel *= -0.5; }

      // Coin-coin collisions
      const near = neighborsOf(c);
      for (const o of near) {
        const dx = c.x - o.x;
        const dy = c.y - o.y;
        const distSq = dx * dx + dy * dy;
        const minDist = c.r + o.r;
        if (distSq < minDist * minDist && distSq > 0.01) {
          const dist = Math.sqrt(distSq);
          const nx = dx / dist;
          const ny = dy / dist;
          const overlap = minDist - dist;

          if (o.settled) {
            c.x += nx * overlap;
            c.y += ny * overlap;
            const dot = c.vx * nx + c.vy * ny;
            if (dot < 0) {
              c.vx -= 2 * dot * nx * BOUNCE;
              c.vy -= 2 * dot * ny * BOUNCE;
              c.vx *= FRICTION;
              c.angularVel += (Math.random() - 0.5) * 0.1;
            }
          } else {
            const half = overlap * 0.5;
            c.x += nx * half;
            c.y += ny * half;
            o.x -= nx * half;
            o.y -= ny * half;
            const relVx = c.vx - o.vx;
            const relVy = c.vy - o.vy;
            const relDot = relVx * nx + relVy * ny;
            if (relDot < 0) {
              const impulse = relDot * BOUNCE;
              c.vx -= impulse * nx;
              c.vy -= impulse * ny;
              o.vx += impulse * nx;
              o.vy += impulse * ny;
            }
          }
        }
      }

      // Floor
      if (c.y >= FLOOR - c.r) {
        c.y = FLOOR - c.r;
        if (Math.abs(c.vy) < 0.6 && Math.abs(c.vx) < 0.3) {
          c.vy = 0;
          c.vx = 0;
          c.angularVel = 0;
          c.settled = true;
        } else {
          c.vy *= -BOUNCE;
          c.vx *= FRICTION;
          c.angularVel *= 0.7;
        }
      }

      // Unsettle stacked coins that lost support
      if (c.settled) {
        let supported = c.y >= FLOOR - c.r - 0.5;
        if (!supported) {
          for (const o of near) {
            if (!o.settled) continue;
            const dx2 = c.x - o.x;
            const dy2 = c.y - o.y;
            if (dy2 < 0 && Math.abs(dx2) < c.r + o.r && Math.abs(dy2) < c.r + o.r + 1) {
              supported = true;
              break;
            }
          }
        }
        if (!supported) {
          c.settled = false;
          c.vy = 0.5;
        }
      }
    }

    // Cascade: tall unstable columns topple
    if (tick % 30 === 0) {
      for (const c of coins) {
        if (!c.settled) continue;
        if (c.y < FLOOR - c.r * 20) {
          const support = neighborsOf(c).filter(
            (o) => o.settled && o.y > c.y && Math.abs(o.x - c.x) < c.r + o.r + 1
          );
          if (support.length < 2 && Math.random() < 0.4) {
            c.settled = false;
            c.vx = (Math.random() - 0.5) * 2;
            c.vy = -0.5;
          }
        }
      }
    }

    if (coins.length > MAX_VISIBLE + 400) {
      coins.splice(0, coins.length - MAX_VISIBLE);
    }
  }

  /* ── dragon ─────────────────────────────────────────── */

  function updateDragon() {
    const d = dragon;
    d.x += d.dir * 0.5;
    d.bobPhase += 0.03;
    d.y = 55 + Math.sin(d.bobPhase) * 6;
    if (d.x > W - 60) d.dir = -1;
    if (d.x < 60) d.dir = 1;
    d.wingPhase += 0.08;
    d.jawPhase += 0.04;
    d.breathTimer++;
    d.dropTimer++;
    if (d.dropTimer >= DROP_RATE) {
      d.dropTimer = 0;
      dropCoin();
    }
  }

  function drawDragon() {
    const d = dragon;
    const wingAmp = Math.sin(d.wingPhase) * 14;
    const jawOpen = Math.max(0, Math.sin(d.jawPhase * 2)) * 3;
    const breathGlow = d.breathTimer % 200 < 30;

    ctx.save();
    ctx.translate(d.x, d.y);
    if (d.dir < 0) ctx.scale(-1, 1);

    // Tail — curving sinusoid
    ctx.strokeStyle = "#8b1a1a";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-28, 2);
    for (let i = 1; i <= 6; i++) {
      const tx = -28 - i * 7;
      const ty = 2 + Math.sin(d.wingPhase + i * 0.5) * 4 * (i / 6);
      ctx.lineTo(tx, ty);
    }
    ctx.stroke();
    // Tail tip spikes
    ctx.fillStyle = "#cc3300";
    const tailEndX = -28 - 42;
    const tailEndY = 2 + Math.sin(d.wingPhase + 3) * 4;
    ctx.beginPath();
    ctx.moveTo(tailEndX, tailEndY);
    ctx.lineTo(tailEndX - 8, tailEndY - 5);
    ctx.lineTo(tailEndX - 4, tailEndY);
    ctx.lineTo(tailEndX - 8, tailEndY + 5);
    ctx.closePath();
    ctx.fill();

    // Wings (behind body)
    ctx.fillStyle = "#b22222";
    ctx.strokeStyle = "#8b1a1a";
    ctx.lineWidth = 1;
    // Upper wing
    ctx.beginPath();
    ctx.moveTo(-8, -8);
    ctx.quadraticCurveTo(-22, -30 + wingAmp, -40, -22 + wingAmp * 0.6);
    ctx.quadraticCurveTo(-30, -14 + wingAmp * 0.3, -18, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Wing membrane lines
    ctx.strokeStyle = "#cc4422";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-12, -10);
    ctx.lineTo(-30, -24 + wingAmp * 0.7);
    ctx.moveTo(-16, -9);
    ctx.lineTo(-36, -22 + wingAmp * 0.6);
    ctx.stroke();
    // Lower wing
    ctx.fillStyle = "#b22222";
    ctx.strokeStyle = "#8b1a1a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-8, 8);
    ctx.quadraticCurveTo(-22, 28 - wingAmp, -38, 20 - wingAmp * 0.5);
    ctx.quadraticCurveTo(-28, 14 - wingAmp * 0.3, -16, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Legs (behind body)
    ctx.fillStyle = "#8b1a1a";
    // Back legs
    ctx.beginPath();
    ctx.moveTo(-14, 10);
    ctx.lineTo(-18, 18);
    ctx.lineTo(-12, 18);
    ctx.closePath();
    ctx.fill();
    // Front legs
    ctx.beginPath();
    ctx.moveTo(8, 10);
    ctx.lineTo(4, 18);
    ctx.lineTo(12, 18);
    ctx.closePath();
    ctx.fill();
    // Claws
    ctx.fillStyle = "#daa520";
    for (const lx of [-16, -14, 6, 10]) {
      ctx.beginPath();
      ctx.arc(lx, 19, 1, 0, Math.PI * 2);
      ctx.fill();
    }

    // Body
    ctx.fillStyle = "#cc2200";
    ctx.beginPath();
    ctx.ellipse(0, 0, 28, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    // Belly scales — golden-orange
    ctx.fillStyle = "#e8a020";
    ctx.beginPath();
    ctx.ellipse(0, 4, 16, 7, 0, 0, Math.PI);
    ctx.fill();
    // Scale pattern on body
    ctx.strokeStyle = "#991a00";
    ctx.lineWidth = 0.4;
    for (let sx = -18; sx <= 14; sx += 6) {
      ctx.beginPath();
      ctx.arc(sx, -2, 3, 0, Math.PI, true);
      ctx.stroke();
    }

    // Neck
    ctx.fillStyle = "#a01800";
    ctx.beginPath();
    ctx.moveTo(20, -6);
    ctx.quadraticCurveTo(30, -10, 34, -14);
    ctx.lineTo(34, 2);
    ctx.quadraticCurveTo(30, 4, 20, 6);
    ctx.closePath();
    ctx.fill();

    // Head
    ctx.fillStyle = "#8b0000";
    ctx.beginPath();
    ctx.ellipse(38, -8, 12, 9, -0.15, 0, Math.PI * 2);
    ctx.fill();
    // Jaw (opens)
    ctx.fillStyle = "#7a0000";
    ctx.beginPath();
    ctx.ellipse(40, -2 + jawOpen, 10, 5 + jawOpen * 0.5, 0.1, 0, Math.PI);
    ctx.fill();
    // Mouth interior
    if (jawOpen > 1) {
      ctx.fillStyle = "#ff4400";
      ctx.beginPath();
      ctx.ellipse(40, -1 + jawOpen * 0.5, 6, 2 + jawOpen * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Eye — molten gold
    ctx.fillStyle = "#ffd700";
    ctx.beginPath();
    ctx.ellipse(42, -12, 3.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(42.5, -12, 1.5, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(41.5, -13, 0.8, 0, Math.PI * 2);
    ctx.fill();

    // Horns — gold
    ctx.fillStyle = "#daa520";
    ctx.beginPath();
    ctx.moveTo(34, -16);
    ctx.lineTo(30, -28);
    ctx.lineTo(36, -18);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(38, -16);
    ctx.lineTo(36, -26);
    ctx.lineTo(40, -17);
    ctx.closePath();
    ctx.fill();

    // Dorsal spines — crimson-orange
    ctx.fillStyle = "#cc3300";
    for (let si = 0; si < 6; si++) {
      const sx = 16 - si * 7;
      const sSize = 3 + Math.sin(d.wingPhase + si * 0.4) * 0.5;
      ctx.beginPath();
      ctx.moveTo(sx - 2, -13);
      ctx.lineTo(sx, -13 - sSize);
      ctx.lineTo(sx + 2, -13);
      ctx.closePath();
      ctx.fill();
    }

    // Nostril smoke / fire breath
    if (breathGlow) {
      const flameLen = 8 + Math.random() * 6;
      const grd = ctx.createRadialGradient(50, -6, 1, 50, -6, flameLen);
      grd.addColorStop(0, "rgba(255,80,0,0.9)");
      grd.addColorStop(0.4, "rgba(255,180,0,0.5)");
      grd.addColorStop(1, "rgba(255,220,0,0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(50 + flameLen * 0.4, -5, flameLen, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Nostrils
    ctx.fillStyle = "#3a0000";
    ctx.beginPath();
    ctx.arc(48, -6, 1.2, 0, Math.PI * 2);
    ctx.arc(48, -4, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Name label
    ctx.fillStyle = "rgba(255,215,0,0.7)";
    ctx.font = "bold 8px monospace";
    ctx.textAlign = "center";
    ctx.fillText("Red Jeff", 0, -22);
    ctx.textAlign = "start";

    ctx.restore();
  }

  /* ── guinea pig ─────────────────────────────────────── */

  function findLooseCoin(): Coin | null {
    let best: Coin | null = null;
    let bestDist = Infinity;
    for (const c of coins) {
      if (!c.settled) continue;
      const dist = Math.abs(c.x - pig.x);
      if (dist < bestDist && dist < 200) {
        best = c;
        bestDist = dist;
      }
    }
    return best;
  }

  function updatePig() {
    const p = pig;
    p.stateTimer--;
    p.blinkTimer--;
    p.tailWag += 0.15;
    p.earWiggle += 0.1;

    if (p.blinkTimer <= 0) {
      p.blinkOpen = !p.blinkOpen;
      p.blinkTimer = p.blinkOpen ? 150 + Math.random() * 200 : 6;
    }

    switch (p.state) {
      case "wander": {
        if (p.stateTimer <= 0) {
          const coin = findLooseCoin();
          if (coin && Math.random() < 0.6) {
            p.state = "goto_coin";
            p.targetX = coin.x;
            p.stateTimer = 300;
          } else if (Math.random() < 0.3) {
            p.state = "rest";
            p.stateTimer = 60 + Math.random() * 80;
            p.speed = 0;
          } else {
            p.targetX = 40 + Math.random() * (W - 80);
            p.stateTimer = 100 + Math.random() * 100;
          }
        }
        movePigToward(p.targetX, 0.6);
        break;
      }
      case "goto_coin": {
        movePigToward(p.targetX, 0.8);
        const nearCoin = findNearestSettledCoin(p.x, 8);
        if (nearCoin) {
          nearCoin.settled = false;
          p.carryCoin = nearCoin;
          p.state = "carry";
          p.placeX = findNeatStackX();
          p.stateTimer = 400;
        }
        if (p.stateTimer <= 0) {
          p.state = "wander";
          p.stateTimer = 40;
        }
        break;
      }
      case "carry": {
        if (p.carryCoin) {
          p.carryCoin.x = p.x;
          p.carryCoin.y = p.y - 14;
          p.carryCoin.vx = 0;
          p.carryCoin.vy = 0;
          p.carryCoin.settled = false;
        }
        movePigToward(p.placeX, 0.7);
        if (Math.abs(p.x - p.placeX) < 4 || p.stateTimer <= 0) {
          p.state = "place";
          p.stateTimer = 20;
        }
        break;
      }
      case "place": {
        if (p.carryCoin) {
          p.carryCoin.settled = false;
          p.carryCoin.vy = -1;
          p.carryCoin.vx = (Math.random() - 0.5) * 0.5;
          p.carryCoin = null;
        }
        if (p.stateTimer <= 0) {
          p.state = "wander";
          p.stateTimer = 60 + Math.random() * 60;
        }
        break;
      }
      case "push": {
        movePigToward(p.targetX, 0.4);
        // Push nearby settled coins
        for (const c of coins) {
          if (!c.settled) continue;
          if (Math.abs(c.x - p.x) < 8 && c.y > FLOOR - 20) {
            c.settled = false;
            c.vx = p.dir * 1.5;
            c.vy = -0.8;
          }
        }
        if (p.stateTimer <= 0) {
          p.state = "wander";
          p.stateTimer = 80;
        }
        break;
      }
      case "rest": {
        p.speed *= 0.9;
        if (p.stateTimer <= 0) {
          p.state = "wander";
          p.stateTimer = 60;
          p.targetX = p.x + (Math.random() - 0.5) * 100;
        }
        break;
      }
    }

    p.legPhase += p.speed * 0.4;
  }

  function movePigToward(targetX: number, maxSpeed: number) {
    const p = pig;
    const dx = targetX - p.x;
    const desired = Math.sign(dx) * Math.min(Math.abs(dx), maxSpeed);
    p.speed += (desired - p.speed) * 0.1;
    p.x += p.speed;
    if (Math.abs(p.speed) > 0.1) p.dir = p.speed > 0 ? 1 : -1;
    p.x = Math.max(12, Math.min(W - 12, p.x));
  }

  function findNearestSettledCoin(x: number, maxDist: number): Coin | null {
    for (const c of coins) {
      if (c.settled && Math.abs(c.x - x) < maxDist) return c;
    }
    return null;
  }

  function findNeatStackX(): number {
    // Try to stack near the right side of the chamber
    const zone = W * 0.7 + Math.random() * (W * 0.25);
    return Math.min(W - 20, zone);
  }

  function drawPig() {
    const p = pig;
    const legSwing = Math.sin(p.legPhase) * 3;
    const tailSwing = Math.sin(p.tailWag) * 4;
    const earBob = Math.sin(p.earWiggle) * 1.5;
    const breathe = Math.sin(tick * 0.05) * 0.5;

    ctx.save();
    ctx.translate(p.x, FLOOR - 9);
    ctx.scale(p.dir, 1);

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.beginPath();
    ctx.ellipse(0, 9, 11, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tail
    ctx.strokeStyle = "#c0804a";
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-10, -1);
    ctx.quadraticCurveTo(-14, -3 + tailSwing, -16, -1 + tailSwing * 0.5);
    ctx.stroke();

    // Back legs
    ctx.fillStyle = "#b0704a";
    ctx.beginPath();
    ctx.ellipse(-5, 6 + legSwing * 0.5, 3, 3.5, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-3, 6 - legSwing * 0.5, 3, 3.5, -0.1, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = "#d4956a";
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 7 + breathe, 0, 0, Math.PI * 2);
    ctx.fill();
    // Belly stripe
    ctx.fillStyle = "#e8b88a";
    ctx.beginPath();
    ctx.ellipse(0, 3, 8, 4, 0, 0, Math.PI);
    ctx.fill();
    // Fur texture
    ctx.strokeStyle = "#c0804a";
    ctx.lineWidth = 0.3;
    for (let fx = -6; fx <= 4; fx += 3) {
      ctx.beginPath();
      ctx.moveTo(fx, -5);
      ctx.lineTo(fx + 1, -3);
      ctx.stroke();
    }

    // Front legs
    ctx.fillStyle = "#b0704a";
    ctx.beginPath();
    ctx.ellipse(5, 6 - legSwing * 0.5, 3, 3.5, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(7, 6 + legSwing * 0.5, 3, 3.5, 0.1, 0, Math.PI * 2);
    ctx.fill();
    // Little paws
    ctx.fillStyle = "#f0c8a8";
    for (const lx of [-5, -3, 5, 7]) {
      ctx.beginPath();
      ctx.ellipse(lx, 9, 2, 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Head
    ctx.fillStyle = "#c8855a";
    ctx.beginPath();
    ctx.ellipse(9, -3, 7, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ears
    ctx.fillStyle = "#d4956a";
    ctx.beginPath();
    ctx.ellipse(6, -8 + earBob, 3, 2.5, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(10, -8 - earBob, 3, 2.5, 0.3, 0, Math.PI * 2);
    ctx.fill();
    // Ear inners
    ctx.fillStyle = "#f0a8a8";
    ctx.beginPath();
    ctx.ellipse(6, -8 + earBob, 1.5, 1.2, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(10, -8 - earBob, 1.5, 1.2, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    if (p.blinkOpen) {
      ctx.fillStyle = "#222";
      ctx.beginPath();
      ctx.ellipse(12, -4, 1.6, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(12.5, -4.5, 0.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = "#222";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(10.5, -4);
      ctx.lineTo(13.5, -4);
      ctx.stroke();
    }

    // Nose
    ctx.fillStyle = "#f0a0a0";
    ctx.beginPath();
    ctx.ellipse(15, -2, 2.5, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d08080";
    ctx.beginPath();
    ctx.arc(15.5, -2, 0.6, 0, Math.PI * 2);
    ctx.arc(14.5, -2, 0.6, 0, Math.PI * 2);
    ctx.fill();

    // Whiskers
    ctx.strokeStyle = "#888";
    ctx.lineWidth = 0.3;
    for (const wy of [-3, -1.5]) {
      ctx.beginPath();
      ctx.moveTo(15, wy);
      ctx.lineTo(22, wy - 1.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(15, wy);
      ctx.lineTo(22, wy + 1);
      ctx.stroke();
    }

    // Carrying coin on head
    if (p.carryCoin) {
      ctx.fillStyle = `hsl(${p.carryCoin.baseHue}, 90%, 55%)`;
      ctx.beginPath();
      ctx.arc(4, -12, COIN_R + 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#b8860b";
      ctx.lineWidth = 0.4;
      ctx.stroke();
    }

    ctx.restore();
  }

  /* ── draw coin with shimmer ─────────────────────────── */

  function drawCoin(c: Coin) {
    const shimmer = Math.sin(c.shimmerPhase) * 12;
    const lightness = 50 + shimmer;
    ctx.fillStyle = `hsl(${c.baseHue}, 90%, ${lightness}%)`;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();

    // Highlight
    const hlX = c.x - c.r * 0.3;
    const hlY = c.y - c.r * 0.3;
    ctx.fillStyle = `hsla(${c.baseHue}, 100%, ${75 + shimmer * 0.5}%, 0.4)`;
    ctx.beginPath();
    ctx.arc(hlX, hlY, c.r * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Rim
    ctx.strokeStyle = `hsl(${c.baseHue}, 70%, ${35 + shimmer * 0.3}%)`;
    ctx.lineWidth = 0.3;
    ctx.stroke();
  }

  /* ── chamber background ─────────────────────────────── */

  function drawChamber() {
    // Gradient sky
    const skyGrd = ctx.createLinearGradient(0, 0, 0, H);
    skyGrd.addColorStop(0, "#0c0c1e");
    skyGrd.addColorStop(0.4, "#1a1a2e");
    skyGrd.addColorStop(1, "#12121f");
    ctx.fillStyle = skyGrd;
    ctx.fillRect(0, 0, W, H);

    // Stone wall pattern
    ctx.strokeStyle = "rgba(255,255,255,0.02)";
    ctx.lineWidth = 0.5;
    const brickH = 16;
    const brickW = 32;
    for (let row = 0; row < H / brickH; row++) {
      const offset = (row % 2) * brickW * 0.5;
      for (let col = -1; col < W / brickW + 1; col++) {
        const bx = col * brickW + offset;
        const by = row * brickH;
        ctx.strokeRect(bx, by, brickW, brickH);
      }
    }

    // Torches on walls
    const torchPositions = [60, W * 0.3, W * 0.5, W * 0.7, W - 60];
    for (const tx of torchPositions) {
      // Bracket
      ctx.fillStyle = "#3a2a1a";
      ctx.fillRect(tx - 2, 80, 4, 12);
      // Flame
      const flicker = Math.random() * 3;
      const fGrd = ctx.createRadialGradient(tx, 76, 1, tx, 76, 10 + flicker);
      fGrd.addColorStop(0, "rgba(255,200,50,0.6)");
      fGrd.addColorStop(0.5, "rgba(255,120,20,0.2)");
      fGrd.addColorStop(1, "rgba(255,80,0,0)");
      ctx.fillStyle = fGrd;
      ctx.beginPath();
      ctx.arc(tx, 76, 10 + flicker, 0, Math.PI * 2);
      ctx.fill();
    }

    // Floor
    const floorGrd = ctx.createLinearGradient(0, FLOOR, 0, H);
    floorGrd.addColorStop(0, "#3a2a1a");
    floorGrd.addColorStop(1, "#2a1a0a");
    ctx.fillStyle = floorGrd;
    ctx.fillRect(0, FLOOR, W, H - FLOOR);
    // Floor edge highlight
    ctx.strokeStyle = "#5a4a3a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, FLOOR);
    ctx.lineTo(W, FLOOR);
    ctx.stroke();
    ctx.strokeStyle = "#1a0a00";
    ctx.beginPath();
    ctx.moveTo(0, FLOOR + 1);
    ctx.lineTo(W, FLOOR + 1);
    ctx.stroke();
  }

  function drawHUD() {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(4, 4, 200, 38);
    ctx.strokeStyle = "rgba(255,215,0,0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(4, 4, 200, 38);
    ctx.fillStyle = "#ffd700";
    ctx.font = "bold 11px monospace";
    ctx.fillText(`Hoard: ${dropped} / ${totalCoins} coins`, 10, 18);
    ctx.fillStyle = "#aaa";
    ctx.font = "10px monospace";
    ctx.fillText(`${tokens.length} unique tokens`, 10, 34);
  }

  /* ── main loop ──────────────────────────────────────── */

  function frame() {
    if (stopRef.current) return;
    tick++;
    updateDragon();
    updatePig();
    physicsTick();

    drawChamber();
    for (const c of coins) drawCoin(c);
    drawPig();
    drawDragon();
    drawHUD();

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

export function Hoard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stopRef = useRef(false);
  const startedRef = useRef(false);
  const { address } = useWallet();

  const { data, isLoading } = useQuery({
    queryKey: ["hoard-tokens"],
    queryFn: () =>
      api.get<{
        items: {
          id: number;
          name?: string;
          balance: string;
          thumbnail?: string;
          contract: string;
          tokenId: string;
        }[];
        pagination: { total: number };
      }>("/api/profile/tokens?limit=500&sortBy=balance&sortDir=desc"),
  });

  const tokens: TokenSummary[] = useMemo(
    () =>
      (data?.items || []).map((t) => ({
        name: t.name || `#${t.tokenId}`,
        balance: Math.max(1, parseInt(t.balance) || 1),
        thumbnail: t.thumbnail,
      })),
    [data]
  );

  const totalCoins = useMemo(
    () => tokens.reduce((sum, t) => sum + t.balance, 0),
    [tokens]
  );

  useEffect(() => {
    if (!canvasRef.current || tokens.length === 0 || startedRef.current) return;
    startedRef.current = true;
    stopRef.current = false;
    runScene(canvasRef.current, tokens, totalCoins, stopRef);
    return () => {
      stopRef.current = true;
      startedRef.current = false;
    };
  }, [tokens, totalCoins]);

  return (
    <AppWindow title="HOARD! — Red Jeff's Treasure Chamber">
      {isLoading ? (
        <div style={{ textAlign: "center", padding: 32 }}>
          <Hourglass size={32} />
          <p style={{ fontSize: 12, marginTop: 8 }}>Loading your hoard...</p>
        </div>
      ) : tokens.length === 0 ? (
        <div style={{ textAlign: "center", padding: 32 }}>
          <p style={{ fontSize: 14 }}>
            {address
              ? "No tokens found in your wallet. Sync your wallet first."
              : "Connect your wallet to see your hoard!"}
          </p>
        </div>
      ) : (
        <div style={{ background: "#000", padding: 0, lineHeight: 0 }}>
          <canvas
            ref={canvasRef}
            width={1200}
            height={700}
            style={{ width: "100%", height: "auto", display: "block", imageRendering: "pixelated" }}
          />
        </div>
      )}
    </AppWindow>
  );
}
