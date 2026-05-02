import { useMemo } from "react";
import { useStudioStore } from "../state/store";
import { SliderRow } from "./ui/SliderRow";
import type { AttractionPoint, AttractionType, AttractionEffect } from "../state/types";

const uid = () => Math.random().toString(36).slice(2, 10);

const attractionTypes: { value: AttractionType; label: string }[] = [
  { value: "direct", label: "Direct" },
  { value: "spiral", label: "Spiral" },
  { value: "blackhole", label: "Blackhole" },
  { value: "pulsing", label: "Pulsing" },
  { value: "magnetic", label: "Magnetic" }
];

const attractionEffects: { value: AttractionEffect; label: string }[] = [
  { value: "none", label: "Pass Through" },
  { value: "despawn", label: "Despawn" },
  { value: "orbit", label: "Orbit" },
  { value: "concentrate", label: "Concentrate" },
  { value: "transform", label: "Transform Color" },
  { value: "passToNext", label: "Pass to Next Point" }
];

export function AttractionPointsEditor() {
  const layers = useStudioStore((s) => s.layers);
  const selectedLayerId = useStudioStore((s) => s.selectedLayerId);
  const setLayer = useStudioStore((s) => s.setLayer);

  const layer = useMemo(
    () => layers.find((l) => l.id === selectedLayerId),
    [layers, selectedLayerId]
  );

  if (!layer) return null;

  const points = layer.attractionPoints || [];

  const addPoint = () => {
    const newPoint: AttractionPoint = {
      id: uid(),
      enabled: true,
      position: { x: 0.5, y: 0.5 },
      strength: 0.2,
      falloff: 1.0,
      type: "direct",
      effect: "none",
      transformColor: "#ffffff",
      pulseFrequency: 1.0
    };
    setLayer(layer.id, { attractionPoints: [...points, newPoint] });
  };

  const updatePoint = (pointId: string, updates: Partial<AttractionPoint>) => {
    const newPoints = points.map((p) =>
      p.id === pointId ? { ...p, ...updates } : p
    );
    setLayer(layer.id, { attractionPoints: newPoints });
  };

  const removePoint = (pointId: string) => {
    const newPoints = points.filter((p) => p.id !== pointId);
    setLayer(layer.id, { attractionPoints: newPoints });
  };

  return (
    <div className="section">
      <h3 className="sectionTitle">
        Attraction Points
        <button 
          className="btn btnSm btnPrimary" 
          style={{ marginLeft: "auto" }}
          onClick={addPoint}
        >
          + Add Point
        </button>
      </h3>

      <div className="small" style={{ marginBottom: 8 }}>
        Add multiple attraction/repulsion points. Negative strength creates repulsion.
      </div>

      {points.length === 0 ? (
        <div className="small" style={{ opacity: 0.7, padding: "8px 0" }}>
          No attraction points. Click "+ Add Point" to create one.
        </div>
      ) : (
        points.map((point, index) => (
          <div 
            key={point.id} 
            style={{ 
              marginBottom: 16, 
              padding: 12, 
              background: "rgba(255,255,255,0.05)", 
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--stroke)"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span className="small" style={{ fontWeight: 600 }}>Point {index + 1}</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className={`btn btnSm ${point.enabled ? "" : "btnDanger"}`}
                  onClick={() => updatePoint(point.id, { enabled: !point.enabled })}
                >
                  {point.enabled ? "ON" : "OFF"}
                </button>
                <button
                  className="btn btnSm btnDanger"
                  onClick={() => removePoint(point.id)}
                >
                  ✕
                </button>
              </div>
            </div>

            {point.enabled && (
              <>
                <SliderRow
                  label="Strength"
                  value={point.strength}
                  min={-1}
                  max={1}
                  step={0.01}
                  onChange={(v) => updatePoint(point.id, { strength: v })}
                  tooltip="Positive = attract, Negative = repel"
                />
                <SliderRow
                  label="Falloff"
                  value={point.falloff}
                  min={0}
                  max={2}
                  step={0.1}
                  onChange={(v) => updatePoint(point.id, { falloff: v })}
                  tooltip="0 = constant, 2 = inverse square"
                />
                <SliderRow
                  label="Position X"
                  value={point.position.x}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) => updatePoint(point.id, { position: { ...point.position, x: v } })}
                />
                <SliderRow
                  label="Position Y"
                  value={point.position.y}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) => updatePoint(point.id, { position: { ...point.position, y: v } })}
                />

                <div className="row">
                  <span className="rowLabel small">Type</span>
                  <select
                    className="select inputSm"
                    style={{ width: 120 }}
                    value={point.type}
                    onChange={(e) => updatePoint(point.id, { type: e.target.value as AttractionType })}
                  >
                    {attractionTypes.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                {point.type === "pulsing" && (
                  <SliderRow
                    label="Pulse Frequency"
                    value={point.pulseFrequency ?? 1}
                    min={0.1}
                    max={5}
                    step={0.1}
                    onChange={(v) => updatePoint(point.id, { pulseFrequency: v })}
                  />
                )}

                <div className="row">
                  <span className="rowLabel small">Effect at Point</span>
                  <select
                    className="select inputSm"
                    style={{ width: 120 }}
                    value={point.effect}
                    onChange={(e) => updatePoint(point.id, { effect: e.target.value as AttractionEffect })}
                  >
                    {attractionEffects.map((e) => (
                      <option key={e.value} value={e.value}>{e.label}</option>
                    ))}
                  </select>
                </div>

                {point.effect === "transform" && (
                  <div className="row">
                    <span className="rowLabel small">Transform Color</span>
                    <input
                      type="color"
                      className="colorInput"
                      value={point.transformColor ?? "#ffffff"}
                      onChange={(e) => updatePoint(point.id, { transformColor: e.target.value })}
                    />
                  </div>
                )}

                {point.effect === "passToNext" && points.length > 1 && (
                  <div className="row">
                    <span className="rowLabel small">Next Point</span>
                    <select
                      className="select inputSm"
                      style={{ width: 120 }}
                      value={point.nextPointId ?? ""}
                      onChange={(e) => updatePoint(point.id, { nextPointId: e.target.value })}
                    >
                      <option value="">Select...</option>
                      {points
                        .map((p, originalIndex) => ({ p, originalIndex }))
                        .filter(({ p }) => p.id !== point.id)
                        .map(({ p, originalIndex }) => (
                          <option key={p.id} value={p.id}>Point {originalIndex + 1}</option>
                        ))}
                    </select>
                  </div>
                )}
              </>
            )}
          </div>
        ))
      )}
    </div>
  );
}
