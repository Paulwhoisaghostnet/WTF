# Particle Painter Source Map

Sources:

- `../PP-UI-update-reference`
- `../Particle Painting/particle-studio`

The two source trees currently match except for `.DS_Store`, so `PP-UI-update-reference` was used as the import source.

WTF target: `PP`

## Delta Classification

- Audio/CV: `AudioSection.tsx`, `AudioCVGraph.tsx`, expanded `AudioEngine.ts`, audio analysis wiring.
- Export: `HTMLExporter.ts`, `QuickExport.ts`, frame buffer export controls, buffer quality controls.
- Engine: `FrameBuffer.ts`, `ParticleEngine.ts`, shader and state updates.
- UI layout: updated `LeftPanel`, `RightPanel`, `StudioControls`, `WelcomePopup`, `LayerControls`, and export bar controls.
- Tezos: updated `walletService.ts`, `teiaService.ts`, and mint modal flow.
- Dependency: source requires `@taquito/utils`.

## WTF Modular Placement

- `PP/src/features/audio-cv`: Audio/CV panel and graph owner.
- `PP/src/features/export`: HTML and quick-export adapters.
- `PP/src/features/tezos`: optional Tezos wallet/mint adapters.

Compatibility wrappers remain in `PP/src/components`, `PP/src/engine`, and `PP/src/services` so existing app imports keep working while the implementation owners are separated.

Verification:

- `npm --prefix PP run build`
- `npm run check`
