import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useStudioStore } from "../state/store";
import { SliderRow } from "./ui/SliderRow";

export function MaskEraser() {
  const layers = useStudioStore((s) => s.layers);
  const selectedLayerId = useStudioStore((s) => s.selectedLayerId);
  const setLayer = useStudioStore((s) => s.setLayer);

  const layer = useMemo(
    () => layers.find((l) => l.id === selectedLayerId),
    [layers, selectedLayerId]
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isErasing, setIsErasing] = useState(false);
  const [brushSize, setBrushSize] = useState(30);
  const [isActive, setIsActive] = useState(false);

  // Initialize or load existing erase mask
  useEffect(() => {
    if (!layer || layer.kind !== "mask") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size to match mask resolution
    canvas.width = 512;
    canvas.height = 512;

    // Clear to transparent (no erasing)
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Load existing erase mask if present
    if (layer.maskEraseMask) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = layer.maskEraseMask;
    }
  }, [layer?.id, layer?.kind]);

  const saveEraseMask = useCallback(() => {
    if (!layer || layer.kind !== "mask") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL("image/png");
    setLayer(layer.id, { maskEraseMask: dataUrl });
  }, [layer, setLayer]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isActive) return;
      setIsErasing(true);
      draw(e);
    },
    [isActive]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isErasing || !isActive) return;
      draw(e);
    },
    [isErasing, isActive]
  );

  const handlePointerUp = useCallback(() => {
    if (isErasing) {
      setIsErasing(false);
      saveEraseMask();
    }
  }, [isErasing, saveEraseMask]);

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Draw white circle (erased area)
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(x, y, brushSize * scaleX, 0, Math.PI * 2);
    ctx.fill();
  };

  const clearEraseMask = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (layer) {
      setLayer(layer.id, { maskEraseMask: undefined });
    }
  };

  if (!layer || layer.kind !== "mask") return null;

  return (
    <div className="section">
      <h3 className="sectionTitle">
        Mask Eraser
        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          <button
            className={`btn btnSm ${isActive ? "btnDanger" : "btnPrimary"}`}
            onClick={() => setIsActive(!isActive)}
          >
            {isActive ? "Done" : "Erase"}
          </button>
          <button className="btn btnSm" onClick={clearEraseMask}>
            Clear
          </button>
        </div>
      </h3>

      {isActive && (
        <>
          <SliderRow
            label="Brush size"
            value={brushSize}
            min={5}
            max={100}
            step={1}
            onChange={setBrushSize}
          />

          <div
            style={{
              marginTop: 10,
              border: "1px solid var(--stroke)",
              borderRadius: "var(--radius-sm)",
              overflow: "hidden",
              background: "#222",
              position: "relative"
            }}
          >
            <canvas
              ref={canvasRef}
              style={{
                width: "100%",
                aspectRatio: "1",
                cursor: "crosshair",
                display: "block"
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            />
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
              Draw to erase mask areas
            </div>
          </div>
        </>
      )}

      {!isActive && layer.maskEraseMask && (
        <div className="small" style={{ marginTop: 8 }}>
          Erase mask active. Click "Erase" to edit.
        </div>
      )}
    </div>
  );
}
