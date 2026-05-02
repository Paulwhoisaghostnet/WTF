import { useRef, useEffect, useCallback, useState } from "react";
import { useStudioStore } from "../state/store";
import { AudioEngine, AudioAnalysisData } from "../engine/AudioEngine";
import { SliderRow } from "./ui/SliderRow";

// Singleton audio engine - exported for use by ParticleEngine
let audioEngine: AudioEngine | null = null;

export function getAudioEngine(): AudioEngine {
  if (!audioEngine) {
    audioEngine = new AudioEngine();
  }
  return audioEngine;
}

type Props = {
  onAnalysisUpdate?: (data: AudioAnalysisData) => void;
};

export function AudioControls({ onAnalysisUpdate }: Props) {
  const global = useStudioStore((s) => s.global);
  const setGlobal = useStudioStore((s) => s.setGlobal);
  
  const [isLoaded, setIsLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [analysisData, setAnalysisData] = useState<AudioAnalysisData | null>(null);
  const rafRef = useRef<number | null>(null);
  
  // Handle file upload
  const handleFileUpload = useCallback(async (file: File) => {
    const url = URL.createObjectURL(file);
    setGlobal({ audioUrl: url });
    
    try {
      const engine = getAudioEngine();
      await engine.loadAudio(url);
      setIsLoaded(true);
    } catch (err) {
      console.error("Failed to load audio:", err);
      setIsLoaded(false);
    }
  }, [setGlobal]);
  
  // Load audio when URL changes
  useEffect(() => {
    if (!global.audioUrl) {
      setIsLoaded(false);
      return;
    }
    
    const loadAudio = async () => {
      try {
        const engine = getAudioEngine();
        await engine.loadAudio(global.audioUrl!);
        setIsLoaded(true);
      } catch (err) {
        console.error("Failed to load audio:", err);
        setIsLoaded(false);
      }
    };
    
    loadAudio();
  }, [global.audioUrl]);
  
  // Handle play/pause state
  useEffect(() => {
    if (!isLoaded) return;
    
    const engine = getAudioEngine();
    if (global.audioPlaying) {
      engine.play();
      setIsPlaying(true);
    } else {
      engine.pause();
      setIsPlaying(false);
    }
  }, [global.audioPlaying, isLoaded]);
  
  // Handle volume changes
  useEffect(() => {
    const engine = getAudioEngine();
    engine.setVolume(global.audioVolume);
  }, [global.audioVolume]);
  
  // Analysis loop
  useEffect(() => {
    if (!isPlaying || !onAnalysisUpdate) return;
    
    const engine = getAudioEngine();
    
    const loop = () => {
      const data = engine.getAnalysis();
      setAnalysisData(data);
      onAnalysisUpdate(data);
      rafRef.current = requestAnimationFrame(loop);
    };
    
    rafRef.current = requestAnimationFrame(loop);
    
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isPlaying, onAnalysisUpdate]);
  
  const handlePlay = async () => {
    const engine = getAudioEngine();
    await engine.initialize();
    setGlobal({ audioPlaying: true });
  };
  
  const handlePause = () => {
    setGlobal({ audioPlaying: false });
  };
  
  const handleRestart = () => {
    const engine = getAudioEngine();
    engine.restart();
    setGlobal({ audioPlaying: true });
  };
  
  const handleClear = () => {
    const engine = getAudioEngine();
    engine.pause();
    setGlobal({ audioUrl: undefined, audioPlaying: false });
    setIsLoaded(false);
    setIsPlaying(false);
    setAnalysisData(null);
  };
  
  return (
    <div className="section">
      <h3 className="sectionTitle">
        Audio
        {isPlaying && <span className="badge" style={{ marginLeft: 8, background: "var(--accent)" }}>Playing</span>}
      </h3>
      
      {!global.audioUrl ? (
        <div>
          <label className="btn btnPrimary" style={{ display: "inline-block", cursor: "pointer" }}>
            Upload MP3
            <input
              type="file"
              accept="audio/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
            />
          </label>
          <div className="small" style={{ marginTop: 8 }}>
            Upload an audio file to enable audio-reactive particles.
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {!isPlaying ? (
              <button className="btn btnPrimary" onClick={handlePlay} disabled={!isLoaded}>
                Play
              </button>
            ) : (
              <button className="btn" onClick={handlePause}>
                Pause
              </button>
            )}
            <button className="btn" onClick={handleRestart} disabled={!isLoaded}>
              Restart
            </button>
            <button className="btn btnDanger" onClick={handleClear}>
              Clear
            </button>
          </div>
          
          <SliderRow
            label="Volume"
            value={global.audioVolume}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setGlobal({ audioVolume: v })}
          />
          
          <SliderRow
            label="Reactivity Gain"
            value={global.audioGain ?? 1}
            min={0}
            max={3}
            step={0.01}
            onChange={(v) => setGlobal({ audioGain: v })}
          />
          
          {/* Audio visualization */}
          {analysisData && isPlaying && (
            <div style={{ marginTop: 12 }}>
              <div className="small" style={{ marginBottom: 8 }}>Audio Analysis</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
                <AudioMeter label="Bass" value={analysisData.bass} color="#ff6b6b" />
                <AudioMeter label="Mid" value={analysisData.mid} color="#4ecdc4" />
                <AudioMeter label="Treble" value={analysisData.treble} color="#45b7d1" />
                <AudioMeter label="Beat" value={analysisData.beat} color="#f7dc6f" />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <div className="value" style={{ flex: 1 }}>
                  Amp: {(analysisData.amplitude * 100).toFixed(0)}%
                </div>
                <div className="value" style={{ flex: 1 }}>
                  Bright: {(analysisData.brightness * 100).toFixed(0)}%
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AudioMeter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>{label}</div>
      <div
        style={{
          height: 40,
          background: "rgba(255,255,255,0.1)",
          borderRadius: 4,
          overflow: "hidden",
          position: "relative"
        }}
      >
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: `${value * 100}%`,
            background: color,
            transition: "height 50ms ease-out"
          }}
        />
      </div>
    </div>
  );
}
