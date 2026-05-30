/**
 * ShareCardButton — Canvas-based share card generator
 *
 * Renders a styled share card onto an offscreen <canvas>, converts it to
 * a PNG data-URL, and either triggers a native share (Web Share API) or
 * falls back to downloading the image.
 *
 * No external dependencies — uses the native Canvas 2D API only.
 */

import { useCallback, useRef, useState } from "react";
import { Button } from "react95";

export interface ShareCardData {
  displayName: string;
  address: string;
  domain?: string | null;
  tokenCount?: number;
  xp?: number;
  avatarUrl?: string | null;
  tagline?: string;
}

// ── Canvas drawing ─────────────────────────────────────────────────────────

const CARD_W = 800;
const CARD_H = 418;

function hex2rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

async function drawShareCard(
  canvas: HTMLCanvasElement,
  data: ShareCardData
): Promise<void> {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  grad.addColorStop(0, "#0a0a0a");
  grad.addColorStop(0.5, "#001a1a");
  grad.addColorStop(1, "#0a000a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Scanline texture (subtle horizontal stripes)
  ctx.fillStyle = "rgba(255,255,255,0.02)";
  for (let y = 0; y < CARD_H; y += 3) {
    ctx.fillRect(0, y, CARD_W, 1);
  }

  // Top accent bar
  const accentGrad = ctx.createLinearGradient(0, 0, CARD_W, 0);
  accentGrad.addColorStop(0, "#00ffcc");
  accentGrad.addColorStop(0.5, "#0088ff");
  accentGrad.addColorStop(1, "#cc00ff");
  ctx.fillStyle = accentGrad;
  ctx.fillRect(0, 0, CARD_W, 4);

  // WTF branding
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px 'Courier New', monospace";
  ctx.fillText("WTFOS", 40, 56);
  ctx.font = "12px 'Courier New', monospace";
  ctx.fillStyle = "#888";
  ctx.fillText("wtf.wtf", CARD_W - 80, 48);

  // Avatar circle placeholder
  const avatarX = 40;
  const avatarY = 90;
  const avatarR = 48;

  if (data.avatarUrl) {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = data.avatarUrl!;
      });
      if (img.width > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX + avatarR, avatarY + avatarR, avatarR, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, avatarX, avatarY, avatarR * 2, avatarR * 2);
        ctx.restore();
      } else {
        drawAvatarFallback(ctx, avatarX, avatarY, avatarR, data.displayName);
      }
    } catch {
      drawAvatarFallback(ctx, avatarX, avatarY, avatarR, data.displayName);
    }
  } else {
    drawAvatarFallback(ctx, avatarX, avatarY, avatarR, data.displayName);
  }

  // Display name
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 32px 'Arial', sans-serif";
  ctx.fillText(
    truncate(data.displayName, 22),
    avatarX + avatarR * 2 + 20,
    avatarY + 34
  );

  // Domain / address
  if (data.domain) {
    ctx.fillStyle = "#00ffcc";
    ctx.font = "16px 'Courier New', monospace";
    ctx.fillText(data.domain, avatarX + avatarR * 2 + 20, avatarY + 60);
  }
  ctx.fillStyle = "#666";
  ctx.font = "12px 'Courier New', monospace";
  ctx.fillText(
    `${data.address.slice(0, 14)}…${data.address.slice(-6)}`,
    avatarX + avatarR * 2 + 20,
    avatarY + 82
  );

  // Stats row
  const statsY = 230;
  const stats: Array<{ label: string; value: string; color: string }> = [
    {
      label: "TOKENS",
      value: (data.tokenCount ?? 0).toLocaleString(),
      color: "#00ffcc",
    },
    {
      label: "XP",
      value: (data.xp ?? 0).toLocaleString(),
      color: "#0088ff",
    },
  ];

  stats.forEach((stat, i) => {
    const sx = 40 + i * 200;
    ctx.fillStyle = "#333";
    ctx.fillRect(sx, statsY, 160, 70);
    ctx.fillStyle = stat.color;
    ctx.font = "bold 28px 'Arial', sans-serif";
    ctx.fillText(stat.value, sx + 12, statsY + 40);
    ctx.fillStyle = "#888";
    ctx.font = "11px 'Courier New', monospace";
    ctx.fillText(stat.label, sx + 12, statsY + 58);
  });

  // Tagline
  if (data.tagline) {
    ctx.fillStyle = "#aaa";
    ctx.font = "italic 14px 'Arial', sans-serif";
    ctx.fillText(truncate(data.tagline, 60), 40, CARD_H - 24);
  }

  // Bottom accent bar
  ctx.fillStyle = accentGrad;
  ctx.fillRect(0, CARD_H - 4, CARD_W, 4);
}

function drawAvatarFallback(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  name: string
) {
  const [rr, gg, bb] = hex2rgb(nameToColor(name));
  const grad = ctx.createRadialGradient(x + r, y + r, 0, x + r, y + r, r);
  grad.addColorStop(0, `rgba(${rr},${gg},${bb},0.9)`);
  grad.addColorStop(1, `rgba(${Math.round(rr * 0.4)},${Math.round(gg * 0.4)},${Math.round(bb * 0.4)},0.9)`);
  ctx.beginPath();
  ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${r}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText((name[0] ?? "?").toUpperCase(), x + r, y + r);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function nameToColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h},60%,40%)`;
}

function truncate(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

// ── Component ──────────────────────────────────────────────────────────────

interface ShareCardButtonProps {
  cardData: ShareCardData;
  label?: string;
}

export function ShareCardButton({
  cardData,
  label = "Share Card",
}: ShareCardButtonProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [busy, setBusy] = useState(false);

  const handleShare = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true);
    try {
      await drawShareCard(canvas, cardData);
      const dataUrl = canvas.toDataURL("image/png");

      if (navigator.share) {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], "wtf-share.png", { type: "image/png" });
        await navigator.share({
          title: `${cardData.displayName} on wtfOS`,
          text: cardData.tagline ?? "Check out my wtfOS profile!",
          files: [file],
        });
      } else {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `wtf-${(cardData.domain ?? cardData.address).slice(0, 20)}.png`;
        a.click();
      }
    } catch (err) {
      console.error("[ShareCard] failed:", err);
    } finally {
      setBusy(false);
    }
  }, [cardData]);

  return (
    <>
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <Button onClick={() => { void handleShare(); }} disabled={busy}>
        {busy ? "Generating…" : label}
      </Button>
    </>
  );
}
