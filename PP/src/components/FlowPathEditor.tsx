import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useStudioStore } from "../state/store";
import { SliderRow } from "./ui/SliderRow";
import type { FlowPath, FlowPoint } from "../state/types";

const CANVAS_SIZE = 512;

export function FlowPathEditor() {
  const layers = useStudioStore((s) => s.layers);
  const selectedLayerId = useStudioStore((s) => s.selectedLayerId);
  const setLayer = useStudioStore((s) => s.setLayer);

  const layer = useMemo(
    () => layers.find((l) => l.id === selectedLayerId),
    [layers, selectedLayerId]
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<FlowPoint[]>([]);
  const [brushSize, setBrushSize] = useState(8);
  const [isActive, setIsActive] = useState(false);

  // Render existing paths
  const renderPaths = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layer) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    const gridSize = 32;
    for (let x = 0; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw saved paths
    const paths = layer.flowPaths || [];
    paths.forEach((path, pathIndex) => {
      if (path.length < 2) return;

      // Color based on path index for visual distinction
      const hue = (pathIndex * 137) % 360;
      ctx.strokeStyle = `hsla(${hue}, 70%, 60%, 0.8)`;
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();
      ctx.moveTo(path[0].x * canvas.width, path[0].y * canvas.height);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x * canvas.width, path[i].y * canvas.height);
      }
      ctx.stroke();

      // Draw direction arrows
      for (let i = 0; i < path.length - 1; i += Math.max(1, Math.floor(path.length / 8))) {
        const p1 = path[i];
        const p2 = path[Math.min(i + 3, path.length - 1)];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 0.01) continue;

        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        const angle = Math.atan2(dy, dx);

        ctx.save();
        ctx.translate(mx * canvas.width, my * canvas.height);
        ctx.rotate(angle);
        ctx.fillStyle = `hsla(${hue}, 70%, 80%, 0.9)`;
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(-4, -5);
        ctx.lineTo(-4, 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    });

    // Draw current path being drawn
    if (currentPath.length > 1) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();
      ctx.moveTo(currentPath[0].x * canvas.width, currentPath[0].y * canvas.height);
      for (let i = 1; i < currentPath.length; i++) {
        ctx.lineTo(currentPath[i].x * canvas.width, currentPath[i].y * canvas.height);
      }
      ctx.stroke();
    }
  }, [layer, currentPath, brushSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    renderPaths();
  }, [layer?.id, renderPaths]);

  useEffect(() => {
    renderPaths();
  }, [renderPaths]);

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): FlowPoint => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height
    };
  };

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isActive) return;
      setIsDrawing(true);
      const point = getCanvasPoint(e);
      setCurrentPath([point]);
    },
    [isActive]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawing || !isActive) return;
      const point = getCanvasPoint(e);

      // Only add point if it's far enough from the last one (simplification)
      const lastPoint = currentPath[currentPath.length - 1];
      const dist = Math.sqrt(
        (point.x - lastPoint.x) ** 2 + (point.y - lastPoint.y) ** 2
      );
      if (dist > 0.01) {
        setCurrentPath((prev) => [...prev, point]);
      }
    },
    [isDrawing, isActive, currentPath]
  );

  const handlePointerUp = useCallback(() => {
    if (!isDrawing || !layer) return;
    setIsDrawing(false);

    // Save path if it has enough points
    if (currentPath.length >= 3) {
      const newPaths = [...(layer.flowPaths || []), currentPath];
      setLayer(layer.id, { flowPaths: newPaths });
    }
    setCurrentPath([]);
  }, [isDrawing, layer, currentPath, setLayer]);

  const clearPaths = () => {
    if (!layer) return;
    setLayer(layer.id, { flowPaths: [] });
    setCurrentPath([]);
  };

  const undoLastPath = () => {
    if (!layer) return;
    const paths = layer.flowPaths || [];
    if (paths.length > 0) {
      setLayer(layer.id, { flowPaths: paths.slice(0, -1) });
    }
  };

  if (!layer || (layer.kind !== "directedFlow" && layer.kind !== "mask")) return null;

  const pathCount = (layer.flowPaths || []).length;

  return (
    <div className="section">
      <h3 className="sectionTitle">
        Flow Paths
        <div style={{ display: "flex", gap: 6, marginLeft: "auto", alignItems: "center" }}>
          <span className="value">{pathCount} path{pathCount !== 1 ? "s" : ""}</span>
          <button
            className={`btn btnSm ${isActive ? "btnDanger" : "btnPrimary"}`}
            onClick={() => setIsActive(!isActive)}
          >
            {isActive ? "Done" : "Draw"}
          </button>
        </div>
      </h3>

      {isActive && (
        <>
          <SliderRow
            label="Line width"
            value={brushSize}
            min={2}
            max={20}
            step={1}
            onChange={setBrushSize}
          />

          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button className="btn btnSm" onClick={undoLastPath} disabled={pathCount === 0}>
              Undo
            </button>
            <button className="btn btnSm btnDanger" onClick={clearPaths} disabled={pathCount === 0}>
              Clear All
            </button>
          </div>
        </>
      )}

      <div
        style={{
          border: "1px solid var(--stroke)",
          borderRadius: "var(--radius-sm)",
          overflow: "hidden",
          background: "#111",
          position: "relative"
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            aspectRatio: "1",
            cursor: isActive ? "crosshair" : "default",
            display: "block"
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
        {isActive && (
          <div
            className="small"
            style={{
              position: "absolute",
              bottom: 4,
              left: 4,
              background: "rgba(0,0,0,0.7)",
              padding: "2px 6px",
              borderRadius: 4
            }}
          >
            Draw paths to direct particle flow
          </div>
        )}
      </div>

      {!isActive && pathCount === 0 && (
        <div className="small" style={{ marginTop: 8, textAlign: "center" }}>
          Click "Draw" to add flow paths. Particles will follow the direction you draw.
        </div>
      )}
    </div>
  );
}
