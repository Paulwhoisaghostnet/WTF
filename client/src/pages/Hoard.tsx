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
  color: string;
  tokenName: string;
}

interface Dragon {
  x: number;
  dir: number;
  wingPhase: number;
  dropTimer: number;
}

interface GuineaPig {
  x: number;
  targetX: number;
  carrying: boolean;
  carryY: number;
}

const COIN_COLORS = ["#ffd700", "#ffb800", "#e6a800", "#ccac00", "#daa520", "#f0c040", "#ffdf00", "#e8c000"];
const GRAVITY = 0.18;
const BOUNCE = 0.3;
const FRICTION = 0.92;

function pickColor() {
  return COIN_COLORS[Math.floor(Math.random() * COIN_COLORS.length)];
}

function runScene(
  canvas: HTMLCanvasElement,
  tokens: TokenSummary[],
  totalCoins: number,
  stopRef: { current: boolean }
) {
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;
  const FLOOR = H - 20;
  const COIN_R = 5;
  const MAX_VISIBLE_COINS = Math.min(totalCoins, 2000);
  const DROP_INTERVAL = Math.max(1, Math.floor(60 / Math.min(totalCoins, 120)));

  const coins: Coin[] = [];
  let tokenIdx = 0;
  let editionIdx = 0;
  let coinsDropped = 0;

  const dragon: Dragon = { x: W / 2, dir: 1, wingPhase: 0, dropTimer: 0 };
  const pig: GuineaPig = { x: W / 2, targetX: W / 2, carrying: false, carryY: FLOOR };

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
    if (coinsDropped >= MAX_VISIBLE_COINS) return;
    const t = nextToken();
    coinsDropped++;
    coins.push({
      x: dragon.x + (Math.random() - 0.5) * 30,
      y: 50,
      vx: (Math.random() - 0.5) * 2,
      vy: 0,
      r: COIN_R + Math.random() * 2,
      settled: false,
      color: pickColor(),
      tokenName: t.name,
    });
  }

  function drawDragon() {
    const d = dragon;
    const wingY = Math.sin(d.wingPhase) * 8;
    ctx.save();
    ctx.translate(d.x, 30);
    if (d.dir < 0) ctx.scale(-1, 1);

    ctx.fillStyle = "#228b22";
    ctx.beginPath();
    ctx.ellipse(0, 0, 24, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#1a6e1a";
    ctx.beginPath();
    ctx.ellipse(22, -2, 10, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ff4444";
    ctx.beginPath();
    ctx.arc(29, -4, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#2a9e2a";
    ctx.beginPath();
    ctx.moveTo(-10, -8);
    ctx.lineTo(-24, -18 + wingY);
    ctx.lineTo(-5, -4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-10, 8);
    ctx.lineTo(-24, 18 - wingY);
    ctx.lineTo(-5, 4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#1a6e1a";
    ctx.beginPath();
    ctx.moveTo(-20, 0);
    ctx.lineTo(-36, -6);
    ctx.lineTo(-32, 0);
    ctx.lineTo(-36, 6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawPig() {
    const p = pig;
    ctx.save();
    ctx.translate(p.x, FLOOR - 8);

    ctx.fillStyle = "#d4956a";
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#c0804a";
    ctx.beginPath();
    ctx.ellipse(8, -2, 6, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(12, -3, 1.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f0a0a0";
    ctx.beginPath();
    ctx.ellipse(14, 0, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#b0704a";
    ctx.beginPath();
    ctx.arc(-4, 6, 2.5, 0, Math.PI * 2);
    ctx.arc(4, 6, 2.5, 0, Math.PI * 2);
    ctx.fill();

    if (p.carrying) {
      ctx.fillStyle = "#ffd700";
      ctx.beginPath();
      ctx.arc(0, -10, COIN_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#b8860b";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawCoin(c: Coin) {
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#b8860b";
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  function drawChamber() {
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < W; i += 24) {
      for (let j = 0; j < H; j += 24) {
        ctx.fillStyle = (((i / 24) + (j / 24)) % 2 === 0) ? "#1e1e36" : "#1a1a2e";
        ctx.fillRect(i, j, 24, 24);
      }
    }

    ctx.fillStyle = "#2a1a0a";
    ctx.fillRect(0, FLOOR, W, H - FLOOR);
    ctx.strokeStyle = "#3a2a1a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, FLOOR);
    ctx.lineTo(W, FLOOR);
    ctx.stroke();
  }

  function drawHUD() {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(4, 4, 180, 36);
    ctx.fillStyle = "#ffd700";
    ctx.font = "bold 11px monospace";
    ctx.fillText(`Hoard: ${coinsDropped} / ${totalCoins} coins`, 10, 18);
    ctx.fillStyle = "#aaa";
    ctx.font = "10px monospace";
    ctx.fillText(`${tokens.length} unique tokens`, 10, 32);
  }

  function physicsTick() {
    for (const c of coins) {
      if (c.settled) continue;
      c.vy += GRAVITY;
      c.x += c.vx;
      c.y += c.vy;

      if (c.x < c.r) { c.x = c.r; c.vx *= -BOUNCE; }
      if (c.x > W - c.r) { c.x = W - c.r; c.vx *= -BOUNCE; }

      let restY = FLOOR - c.r;
      for (const other of coins) {
        if (other === c || !other.settled) continue;
        const dx = c.x - other.x;
        const dy = c.y - other.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = c.r + other.r;
        if (dist < minDist && c.y < other.y) {
          restY = Math.min(restY, other.y - other.r - c.r);
        }
      }

      if (c.y >= restY) {
        c.y = restY;
        if (Math.abs(c.vy) < 1) {
          c.vy = 0;
          c.vx = 0;
          c.settled = true;
        } else {
          c.vy *= -BOUNCE;
          c.vx *= FRICTION;

          if (Math.random() < 0.3) {
            c.vx += (Math.random() - 0.5) * 3;
          }
        }
      }
    }

    if (coins.length > MAX_VISIBLE_COINS + 200) {
      coins.splice(0, coins.length - MAX_VISIBLE_COINS);
    }
  }

  function updateDragon() {
    const d = dragon;
    d.x += d.dir * 1.5;
    if (d.x > W - 40) d.dir = -1;
    if (d.x < 40) d.dir = 1;
    d.wingPhase += 0.15;
    d.dropTimer++;
    if (d.dropTimer >= DROP_INTERVAL) {
      d.dropTimer = 0;
      dropCoin();
    }
  }

  function updatePig() {
    const p = pig;
    if (Math.random() < 0.02) {
      p.targetX = Math.random() * (W - 40) + 20;
    }
    const dx = p.targetX - p.x;
    p.x += Math.sign(dx) * Math.min(Math.abs(dx), 1.2);
  }

  function frame() {
    if (stopRef.current) return;
    updateDragon();
    updatePig();
    physicsTick();

    drawChamber();
    for (const c of coins) drawCoin(c);
    drawDragon();
    drawPig();
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
    <AppWindow title="HOARD! — Dragon's Treasure Chamber">
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
            width={760}
            height={480}
            style={{ width: "100%", height: "auto", display: "block", imageRendering: "pixelated" }}
          />
        </div>
      )}
    </AppWindow>
  );
}
