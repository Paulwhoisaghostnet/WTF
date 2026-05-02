import { useStudioStore } from "../state/store";

export function WelcomePopup() {
  const global = useStudioStore((s) => s.global);
  const setGlobal = useStudioStore((s) => s.setGlobal);

  if (!global.showWelcome) return null;

  const handleClose = () => {
    setGlobal({ showWelcome: false });
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: "var(--bg-panel)",
          borderRadius: "var(--radius)",
          padding: 32,
          maxWidth: 600,
          maxHeight: "80vh",
          overflow: "auto",
          border: "1px solid var(--stroke)"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h1 style={{ marginTop: 0, marginBottom: 16, color: "var(--accent)" }}>
          Welcome to Particle Studio! ✨
        </h1>

        <h3 style={{ marginBottom: 12 }}>Getting Started</h3>
        <ol style={{ paddingLeft: 20, marginBottom: 24 }}>
          <li style={{ marginBottom: 8 }}>
            <strong>Add a Layer</strong> - Click the "+ Add" button in the left panel to create your first particle layer
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Choose Particle Type</strong> - Select from Sand, Dust, Sparks, Ink, Crumbs, or Liquid
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Adjust Parameters</strong> - Use the left panel for physics and forces, right panel for appearance
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Add a Mask</strong> - Create a "Mask" layer and upload an image to define boundaries
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Play & Experiment</strong> - Press Space to pause/resume, R to reset particles
          </li>
        </ol>

        <h3 style={{ marginBottom: 12 }}>Exporting Your Work</h3>
        <ul style={{ paddingLeft: 20, marginBottom: 24 }}>
          <li style={{ marginBottom: 6 }}>
            <strong>Screenshot (PNG)</strong> - Click "Screenshot" in the export bar for a single frame
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>GIF Export</strong> - Click "Export GIF" to create an animated GIF (3-second default)
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>Video Recording</strong> - Use "Record" to capture longer WebM videos
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>MP4 with Audio</strong> - Upload audio and use "MP4" export for sound-reactive videos
          </li>
        </ul>

        <h3 style={{ marginBottom: 12 }}>Tips</h3>
        <ul style={{ paddingLeft: 20, marginBottom: 24 }}>
          <li style={{ marginBottom: 6 }}>
            Use <strong>Movement Patterns</strong> like Wave, Spiral, Vortex, Evade, or Clusters for dynamic effects
          </li>
          <li style={{ marginBottom: 6 }}>
            Enable <strong>Show Mask</strong> to visualize mask boundaries in red
          </li>
          <li style={{ marginBottom: 6 }}>
            Add multiple <strong>Attraction Points</strong> for complex particle behaviors
          </li>
          <li style={{ marginBottom: 6 }}>
            Adjust <strong>Jitter</strong> parameters (size, color, brightness, scale) for natural variation
          </li>
        </ul>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <button
            className="btn"
            onClick={() => {
              // Open the local user manual or GitHub readme
              // Note: In production, this would link to hosted documentation
              alert("Check out USER_MANUAL.md in the project files for comprehensive documentation!");
            }}
          >
            📖 Read Manual
          </button>
          <button className="btn btnPrimary" onClick={handleClose}>
            🚀 Get Started
          </button>
        </div>
      </div>
    </div>
  );
}
