import { useMemo } from "react";
import { useStudioStore } from "../state/store";
import { SliderRow } from "./ui/SliderRow";
import type { MaskTransform } from "../state/types";

const defaultTransform: MaskTransform = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  skewX: 0,
  skewY: 0
};

export function MaskEditor() {
  const layers = useStudioStore((s) => s.layers);
  const selectedLayerId = useStudioStore((s) => s.selectedLayerId);
  const setLayer = useStudioStore((s) => s.setLayer);

  const layer = useMemo(
    () => layers.find((l) => l.id === selectedLayerId),
    [layers, selectedLayerId]
  );

  if (!layer || layer.kind !== "mask") return null;

  const transform = layer.maskTransform || defaultTransform;

  const updateTransform = (patch: Partial<MaskTransform>) => {
    setLayer(layer.id, {
      maskTransform: { ...transform, ...patch }
    });
  };

  const resetTransform = () => {
    setLayer(layer.id, { maskTransform: defaultTransform });
  };

  return (
    <div className="section">
      <h3 className="sectionTitle">
        Mask Transform
        <button className="btn btnSm" style={{ marginLeft: "auto" }} onClick={resetTransform}>
          Reset
        </button>
      </h3>

      <SliderRow
        label="Pan X"
        value={transform.x}
        min={-1}
        max={1}
        step={0.01}
        onChange={(v) => updateTransform({ x: v })}
      />
      <SliderRow
        label="Pan Y"
        value={transform.y}
        min={-1}
        max={1}
        step={0.01}
        onChange={(v) => updateTransform({ y: v })}
      />
      <SliderRow
        label="Scale"
        value={transform.scale}
        min={0.1}
        max={3}
        step={0.01}
        onChange={(v) => updateTransform({ scale: v })}
      />
      <SliderRow
        label="Rotation"
        value={transform.rotation}
        min={0}
        max={360}
        step={1}
        onChange={(v) => updateTransform({ rotation: v })}
      />
      <SliderRow
        label="Skew X"
        value={transform.skewX}
        min={-45}
        max={45}
        step={1}
        onChange={(v) => updateTransform({ skewX: v })}
      />
      <SliderRow
        label="Skew Y"
        value={transform.skewY}
        min={-45}
        max={45}
        step={1}
        onChange={(v) => updateTransform({ skewY: v })}
      />
    </div>
  );
}
