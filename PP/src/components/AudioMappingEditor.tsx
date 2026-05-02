import { useMemo } from "react";
import { useStudioStore } from "../state/store";
import type { AudioSource, AudioMapping, LayerAudioConfig } from "../state/types";
import { SliderRow } from "./ui/SliderRow";
import { SwitchRow } from "./ui/SwitchRow";

const audioSources: { value: AudioSource; label: string }[] = [
  { value: "amplitude", label: "Amplitude (overall volume)" },
  { value: "bass", label: "Bass (low frequencies)" },
  { value: "mid", label: "Mid (mid frequencies)" },
  { value: "treble", label: "Treble (high frequencies)" },
  { value: "beat", label: "Beat (rhythm detection)" },
  { value: "brightness", label: "Brightness (spectral)" },
  { value: "centroid", label: "Centroid (spectral center)" }
];

const mappableParams: { key: keyof LayerAudioConfig; label: string; defaultMin: number; defaultMax: number }[] = [
  { key: "spawnRate", label: "Spawn Rate", defaultMin: 0, defaultMax: 1 },
  { key: "gravity", label: "Gravity", defaultMin: -0.5, defaultMax: 1 },
  { key: "pointSize", label: "Point Size", defaultMin: 0.5, defaultMax: 8 },
  { key: "speed", label: "Speed", defaultMin: 0, defaultMax: 2 },
  { key: "curl", label: "Curl", defaultMin: 0, defaultMax: 1 },
  { key: "jitter", label: "Jitter", defaultMin: 0, defaultMax: 1 },
  { key: "windStrength", label: "Wind Strength", defaultMin: 0, defaultMax: 0.5 },
  { key: "colorIntensity", label: "Color Intensity", defaultMin: 0, defaultMax: 2 }
];

const defaultMapping = (defaultMin: number, defaultMax: number): AudioMapping => ({
  enabled: false,
  source: "amplitude",
  min: defaultMin,
  max: defaultMax,
  smoothing: 0.5,
  invert: false
});

export function AudioMappingEditor() {
  const layers = useStudioStore((s) => s.layers);
  const selectedLayerId = useStudioStore((s) => s.selectedLayerId);
  const setLayer = useStudioStore((s) => s.setLayer);

  const layer = useMemo(
    () => layers.find((l) => l.id === selectedLayerId),
    [layers, selectedLayerId]
  );

  if (!layer) return null;

  const audioConfig = layer.audio || { enabled: false };

  const updateAudioConfig = (patch: Partial<LayerAudioConfig>) => {
    setLayer(layer.id, {
      audio: { ...audioConfig, ...patch }
    });
  };

  const updateMapping = (paramKey: keyof LayerAudioConfig, patch: Partial<AudioMapping>) => {
    const paramInfo = mappableParams.find(p => p.key === paramKey);
    const currentMapping = (audioConfig[paramKey] as AudioMapping) || 
      defaultMapping(paramInfo?.defaultMin || 0, paramInfo?.defaultMax || 1);
    updateAudioConfig({
      [paramKey]: { ...currentMapping, ...patch }
    });
  };

  return (
    <div className="section">
      <h3 className="sectionTitle">Audio Reactivity</h3>
      
      <SwitchRow
        label="Enable audio for this layer"
        checked={audioConfig.enabled}
        onCheckedChange={(b) => updateAudioConfig({ enabled: b })}
      />

      {audioConfig.enabled && (
        <div style={{ marginTop: 12 }}>
          <div className="small" style={{ marginBottom: 12 }}>
            Map audio properties to particle parameters. Each enabled mapping will modulate its parameter based on the selected audio source.
          </div>

          {mappableParams.map((param) => {
            const mapping = (audioConfig[param.key] as AudioMapping) || 
              defaultMapping(param.defaultMin, param.defaultMax);

            return (
              <AudioParamMapping
                key={param.key}
                label={param.label}
                mapping={mapping}
                onChange={(patch) => updateMapping(param.key, patch)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

type AudioParamMappingProps = {
  label: string;
  mapping: AudioMapping;
  onChange: (patch: Partial<AudioMapping>) => void;
};

function AudioParamMapping({ label, mapping, onChange }: AudioParamMappingProps) {
  return (
    <div
      style={{
        padding: 10,
        marginBottom: 8,
        border: "1px solid var(--stroke)",
        borderRadius: "var(--radius-sm)",
        background: mapping.enabled ? "rgba(124,58,237,0.1)" : "transparent"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={mapping.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
        />
        <span style={{ fontWeight: 500, fontSize: 12 }}>{label}</span>
      </div>

      {mapping.enabled && (
        <>
          <div className="row" style={{ marginBottom: 8 }}>
            <span className="small">Source</span>
            <select
              className="select inputSm"
              style={{ width: 160 }}
              value={mapping.source}
              onChange={(e) => onChange({ source: e.target.value as AudioSource })}
            >
              {audioSources.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <SliderRow
            label="Min output"
            value={mapping.min}
            min={-1}
            max={3}
            step={0.01}
            onChange={(v) => onChange({ min: v })}
          />
          <SliderRow
            label="Max output"
            value={mapping.max}
            min={-1}
            max={3}
            step={0.01}
            onChange={(v) => onChange({ max: v })}
          />
          <SliderRow
            label="Smoothing"
            value={mapping.smoothing}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => onChange({ smoothing: v })}
          />

          <SwitchRow
            label="Invert"
            checked={mapping.invert}
            onCheckedChange={(b) => onChange({ invert: b })}
          />
        </>
      )}
    </div>
  );
}
