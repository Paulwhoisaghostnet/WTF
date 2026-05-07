import { useRef, useEffect } from "react";

export type CVSample = {
  t: number;
  amplitude: number;
  bass: number;
  mid: number;
  treble: number;
  beat: number;
};

const SERIES: { key: keyof Omit<CVSample, "t">; color: string; label: string }[] = [
  { key: "amplitude", color: "#888", label: "Amp" },
  { key: "bass", color: "#e74c3c", label: "Bass" },
  { key: "mid", color: "#2ecc71", label: "Mid" },
  { key: "treble", color: "#3498db", label: "Treble" },
  { key: "beat", color: "#f1c40f", label: "Beat" },
];

export function AudioCVGraph({ buffer, width = 280, height = 120 }: { buffer: CVSample[]; width?: number; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || buffer.length < 2) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio ?? 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const padding = { top: 8, right: 8, bottom: 20, left: 32 };
    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;

    const tMin = buffer[0].t;
    const tMax = buffer[buffer.length - 1].t;
    const tRange = Math.max(tMax - tMin, 0.001);

    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(padding.left, padding.top, plotW, plotH);

    // Y axis ticks (0–1)
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    for (let v = 0; v <= 1; v += 0.25) {
      const y = padding.top + plotH * (1 - v);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + plotW, y);
      ctx.stroke();
    }

    // X axis: time
    ctx.fillStyle = "var(--muted)";
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("0s", padding.left, height - 4);
    ctx.textAlign = "right";
    ctx.fillText(`${tRange.toFixed(1)}s`, padding.left + plotW, height - 4);

    SERIES.forEach(({ key, color }) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let first = true;
      for (let i = 0; i < buffer.length; i++) {
        const x = padding.left + ((buffer[i].t - tMin) / tRange) * plotW;
        const y = padding.top + plotH * (1 - buffer[i][key]);
        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    });

    // Legend
    ctx.font = "9px system-ui, sans-serif";
    ctx.textAlign = "left";
    SERIES.forEach(({ label, color }, i) => {
      ctx.fillStyle = color;
      ctx.fillText(label, padding.left + i * 42, padding.top - 2);
    });
  }, [buffer, width, height]);

  if (buffer.length < 2) {
    return (
      <div style={{ marginTop: 8, padding: 8, background: "rgba(0,0,0,0.2)", borderRadius: 4, fontSize: 11, color: "var(--muted)" }}>
        CV graph: play audio to record
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div className="small" style={{ marginBottom: 6 }}>CV amplitude over time</div>
      <canvas
        ref={canvasRef}
        style={{ display: "block", borderRadius: 4, background: "rgba(0,0,0,0.2)" }}
        width={width}
        height={height}
      />
    </div>
  );
}
