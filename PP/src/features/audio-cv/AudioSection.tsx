import { useState, useEffect } from "react";
import { useStudioStore } from "../../state/store";
import { AudioControls } from "../../components/AudioControls";
import { AudioMappingEditor } from "../../components/AudioMappingEditor";
import { AudioCVGraph } from "./AudioCVGraph";
import type { AudioAnalysisData } from "../../engine/AudioEngine";
import type { CVSample } from "./AudioCVGraph";

export function AudioSection({
  onAnalysisUpdate,
  cvBuffer = [],
}: {
  onAnalysisUpdate?: (data: AudioAnalysisData) => void;
  cvBuffer?: CVSample[];
}) {
  const global = useStudioStore((s) => s.global);
  const layers = useStudioStore((s) => s.layers);
  const selectedLayerId = useStudioStore((s) => s.selectedLayerId);
  const hasAudio = Boolean(global.audioUrl);
  const layer = layers.find((l) => l.id === selectedLayerId);

  const [isOpen, setIsOpen] = useState(hasAudio);
  useEffect(() => {
    if (hasAudio) setIsOpen(true);
  }, [hasAudio]);

  const title = hasAudio ? "Audio" : "Upload MP3";

  return (
    <div className="section">
      <h3
        className="sectionTitle"
        style={{ cursor: "pointer", userSelect: "none", display: "flex", justifyContent: "space-between" }}
        onClick={() => setIsOpen(!isOpen)}
      >
        {title}
        <span style={{ fontSize: "0.8em", opacity: 0.7 }}>{isOpen ? "▼" : "▶"}</span>
      </h3>
      {isOpen && (
        <>
          <AudioControls onAnalysisUpdate={onAnalysisUpdate} />
          {cvBuffer.length > 0 && <AudioCVGraph buffer={cvBuffer} />}
          {layer && (
            <>
              <div className="hr" style={{ margin: "12px 0" }} />
              <AudioMappingEditor />
            </>
          )}
        </>
      )}
    </div>
  );
}
