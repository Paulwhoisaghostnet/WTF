import { useState } from "react";
import { useStudioStore } from "../state/store";
import type { LayerKind, ParticleType } from "../state/types";

const kindOptions: { value: LayerKind; name: string; desc: string; icon: string }[] = [
  {
    value: "mask",
    name: "Mask",
    desc: "Particles constrained by an image boundary",
    icon: "🎭"
  },
  {
    value: "background",
    name: "Background",
    desc: "Universal particle flow behind other layers",
    icon: "🌌"
  },
  {
    value: "foreground",
    name: "Foreground",
    desc: "Universal particle flow in front of other layers",
    icon: "✨"
  },
  {
    value: "directedFlow",
    name: "Directed Flow",
    desc: "Particles follow freehand-drawn paths",
    icon: "🌊"
  }
];

const typeOptions: { value: ParticleType; label: string }[] = [
  { value: "sand", label: "Sand" },
  { value: "dust", label: "Dust" },
  { value: "sparks", label: "Sparks" },
  { value: "ink", label: "Ink" }
];

type Props = {
  open: boolean;
  onClose: () => void;
};

export function AddLayerModal({ open, onClose }: Props) {
  const addLayer = useStudioStore((s) => s.addLayer);
  const [selectedKind, setSelectedKind] = useState<LayerKind>("foreground");
  const [selectedType, setSelectedType] = useState<ParticleType>("dust");

  if (!open) return null;

  const handleCreate = () => {
    addLayer(selectedKind, selectedType);
    onClose();
    // Reset to defaults for next time
    setSelectedKind("foreground");
    setSelectedType("dust");
  };

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modalTitle">Add New Layer</h2>

        <div className="modalBody">
          <div className="section">
            <h4 className="sectionTitle">Layer Type</h4>
            <div className="kindSelector">
              {kindOptions.map((opt) => (
                <div
                  key={opt.value}
                  className={`kindOption ${selectedKind === opt.value ? "selected" : ""}`}
                  onClick={() => setSelectedKind(opt.value)}
                >
                  <div className="kindName">
                    {opt.icon} {opt.name}
                  </div>
                  <div className="kindDesc">{opt.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {selectedKind !== "directedFlow" && (
            <div className="section">
              <h4 className="sectionTitle">Particle Type</h4>
              <div className="segmented">
                {typeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    className={selectedType === opt.value ? "active" : ""}
                    onClick={() => setSelectedType(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="modalFooter">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btnPrimary" onClick={handleCreate}>
            Create Layer
          </button>
        </div>
      </div>
    </div>
  );
}
