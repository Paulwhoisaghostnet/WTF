import { useStudioStore } from "../state/store";
import type { LayerKind } from "../state/types";

const kindIcons: Record<LayerKind, string> = {
  mask: "🎭",
  background: "🌌",
  foreground: "✨",
  directedFlow: "🌊"
};

export function LayerTabs({ onAddClick }: { onAddClick: () => void }) {
  const layers = useStudioStore((s) => s.layers);
  const selectedLayerId = useStudioStore((s) => s.selectedLayerId);
  const selectLayer = useStudioStore((s) => s.selectLayer);
  const removeLayer = useStudioStore((s) => s.removeLayer);
  const moveLayerUp = useStudioStore((s) => s.moveLayerUp);
  const moveLayerDown = useStudioStore((s) => s.moveLayerDown);

  return (
    <div className="layerTabs">
      {layers.map((layer, index) => (
        <div
          key={layer.id}
          className={`layerTab ${selectedLayerId === layer.id ? "active" : ""}`}
          onClick={() => selectLayer(layer.id)}
        >
          {selectedLayerId === layer.id && (
            <div className="layerOrderBtns">
              <button
                className="orderBtn"
                disabled={index === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  moveLayerUp(layer.id);
                }}
                title="Move layer up (renders later)"
              >
                ◀
              </button>
              <button
                className="orderBtn"
                disabled={index === layers.length - 1}
                onClick={(e) => {
                  e.stopPropagation();
                  moveLayerDown(layer.id);
                }}
                title="Move layer down (renders earlier)"
              >
                ▶
              </button>
            </div>
          )}
          <span className="kindIcon">{kindIcons[layer.kind]}</span>
          <span>{layer.name}</span>
          <button
            className="closeBtn"
            onClick={(e) => {
              e.stopPropagation();
              removeLayer(layer.id);
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <button className="addLayerBtn" onClick={onAddClick}>
        + Add
      </button>
    </div>
  );
}
