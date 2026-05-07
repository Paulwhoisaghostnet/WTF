# Vibe Stack + IPFS Platform Integration Map

Last updated: 2026-05-07

## Integration Rule

No donor junk folder. A source either lands inside an existing WTF product domain, becomes a named platform concept with a clear owner, or stays out of the app until it can be converted cleanly.

## Landed From IPFS

| Source | Classification | WTF home | Platform wiring |
| --- | --- | --- | --- |
| The Tezos Pole Game | Game | `public/games/installed/tezos-pole-game/` | Registered by `scripts/install-games.mjs` as a curated static Console cartridge. It launches through `/console` using `/games/installed/tezos-pole-game/index.html`. Leaderboards are disabled until the game speaks the WTF Console SDK. |
| Dragon: A Cyberpunk Fable | Game | `public/games/installed/dragon-cyberpunk-fable/` | Registered by `scripts/install-games.mjs` as a curated static Console cartridge. It launches through `/console` using `/games/installed/dragon-cyberpunk-fable/index.html`. Leaderboards are disabled until the game speaks the WTF Console SDK. |
| Nikshumika Paint | Creation app/tool | `public/creation-tools/nikshumika-paint/` | Registered in `client/src/features/creation-tools/tool-registry.ts` and routed at `/tools/nikshumika-paint`. External React/Babel runtime assets are vendored locally and checked by `npm run creation-tools:check`. |
| Kandinsky Composer | Creation app/tool | `public/creation-tools/kandinsky-composer/` | Registered in `client/src/features/creation-tools/tool-registry.ts` and routed at `/tools/kandinsky-composer`. |
| Winamp Bootloader | Tezamp app module | `public/tezamp/winamp-bootloader/` | Routed at `/tezamp/winamp-bootloader` through the Tezamp page. It receives the same sandboxed iframe treatment as Console and Creation Tool bundles, scoped by the production CSP override in `server/app.ts`. |

## Vibe Stack Harvest Routing

| Source repo | Useful material | WTF target | Implementation shape |
| --- | --- | --- | --- |
| `vibecut` | Mobile-first timeline editor, React Three Fiber preview, multi-track video/image/audio/text model, Mediabunny export direction. | Studio, My Videos, TV. | Build a native `client/src/features/studio/video-editor/` or `client/src/features/media-library/video-editor/` module. Server work belongs under media-library/job infrastructure, with render/export as background jobs or workers. Do not bypass user media ownership or storage rules. |
| `x-shop-demo` | X-style immersive commerce drawer, 3D product preview, shareable product experience. | W, WTF IAM, Marketplace. | Harvest product-card and 3D-preview patterns into `client/src/features/w/social/`, `client/src/features/wtfiam/`, and `client/src/features/marketplace/`. Server handlers should expose marketplace-safe product/public preview routes rather than embedding a standalone Next app. |
| `x-watermark` | Screenshot cleanup flow and browser-side image processing. | W composer, Studio image tools, My Photos. | Convert into an explicit opt-in image tool backed by a Web Worker in a media/image feature module. Use it as a reusable transform step for uploaded screenshots, not a hidden post-processing pass. |
| `three.js` | Canonical Three.js library, examples, loaders, docs patterns. | Shared 3D runtime. | Keep using the package dependency instead of vendoring the repo. Harvest example patterns into domain modules only when needed: Desktop world, Game Studio runtime, Studio previews, Tezamp visualizers. |
| `sparkplusplus` | Gaussian splat import/runtime ideas for Three.js/WebGPU. | Studio 3D assets, Game Studio environments, Gallery/Collekt previews. | Treat splats as a universal 3D media type: import, page/stream, preview, and export through a shared 3D asset pipeline. |
| `three-maps` | 2D floor plan sketching, quick brush, `.t3d` scene format. | Game Studio world editor, Studio 3D editor. | Promote the scene document idea into a WTF scene schema with stable ids, import/export, and asset references. Editor UI belongs in Game Studio first. |
| `freed` | Reactive geometry editor, scene hierarchy, object/edit modes, `.t3d` import/export. | Game Studio and Studio 3D. | Use as a model for reusable scene stores, selection modes, hierarchy operations, and scene round-trip tests. |
| `vibeviz` | Audio-reactive 3D scene editor, keyframes, waveform-driven objects, timeline. | Tezamp, Studio, Creation Tools. | Extract audio-analysis, keyframe, and visualizer concepts into reusable media modules. Tezamp gets playback-linked visualizers; Studio gets keyframe/audio-reactive authoring. |
| `ggez` | Three.js game engine architecture: editor, animation editor, runtime packages, orchestrator. | Game Studio. | Treat it as architectural donor material for `client/src/features/game-studio/` and `server/features/game-studio/`, especially scene export, editor sync, package boundaries, and runtime loaders. |
| `game.js` | Game framework packaging and game-dev workspace conventions. | Game Studio templates and Console SDK docs. | Harvest conventions for scaffold output, build scripts, template contracts, and package-level boundaries. |
| `vibestack` | AI game-generation concept and project scaffolding. | Game Studio MCP/agent tools. | Route generation through existing Game Studio APIs and MCP tools. Do not import its app wholesale or duplicate secret handling. |
| `bikelife` | Three/GGEZ-based game candidate. | Console. | Build and validate as a Console cartridge only after license, asset, and runtime checks. It belongs in `public/games/installed/` only as a processed cartridge, not as source. |
| `mixamo23` | FBX-to-GLB conversion, animation preview, Mixamo cleanup. | Game Studio, Dicksword, Desktop avatar systems. | Promote to an avatar/animation import pipeline: upload FBX, preview, normalize, export GLB, attach animation clips to WTF character/avatar systems. |
| `vibe-human` | Browser human/avatar Three.js workflow. | Dicksword, Desktop world, Game Studio characters. | Harvest rig/avatar preview and character customization pieces into existing identity/avatar surfaces. |
| `vibe-board` | Mobile meme/visual editor with layers, transforms, undo/redo, export/share. | Creation Tools, W composer, My Photos. | Convert layer model and export flow into a native Creation Tool module, with output saved through the media library. |
| `vcode` | Electron IDE UX, Monaco integration, resizable panels, terminal/editor workflow. | Studio, Game Studio source editor, agent workspace surfaces. | Harvest interaction patterns and Monaco/editor helpers only. A desktop IDE shell does not belong inside the web app. |
| `fenix` | React Flow/Mediabunny/Vite editing app patterns. | Studio pipelines. | Inspect for node-graph media workflow concepts before implementing advanced Studio pipeline editors. |
| `ai-context-standard` | `.aicontext` hierarchy and project-context standard. | Universal agent/project context. | Use as the model for WTF project context export/import, Studio project instructions, and agent-readable manifests. This should become a platform concept rather than a page. |

## Universal Concepts To Promote

- Console bundle registry: any playable game becomes a validated cartridge with manifest metadata, sandboxed iframe launch, optional SDK bridge, and optional leaderboard.
- Console dependency resolver: cartridges stay unmodified on disk, while Console serves `/games/installed/*` through a response-time compatibility layer that maps known CDN/font/runtime URLs to cached local dependencies.
- ROM cartridge wrapper: raw ROMs and ZIPs containing ROMs become `rom` cartridges with EmulatorJS served through the same local dependency cache.
- Creation Tool registry: any static or iframe-hosted creation app must register in `tool-registry.ts`, expose a route, and pass asset checks.
- Media render job pipeline: video export, timeline rendering, screenshot cleanup, thumbnailing, and audio-reactive capture should share job records, ownership checks, and worker-safe asset paths.
- Scene document format: 3D editors, Game Studio worlds, Desktop environments, and visualizers need one stable scene contract with ids, assets, transforms, animation, and versioning.
- 3D asset pipeline: GLB, FBX, splats, textures, animation clips, and thumbnails should import through common validation and provenance paths before any domain uses them.
- Social commerce preview: X-style immersive links should become reusable W/Marketplace cards with product, media, preview, and purchase handlers.
- Agent context export: Studio/Game Studio projects should be able to emit agent-readable context files/manifests so tools can work without rediscovering project rules.
- Explicit browser workers: image cleanup, video export, splat processing, and heavy scene transforms should run in named workers with scoped CSP support.

## Non-Goals

- Do not keep source repos in `public/`, `client/src/`, or a generic import directory.
- Do not ship standalone donor apps when WTF already has the owning domain.
- Do not silently alter user media. Transformation tools must be explicit, reversible where possible, and provenance-aware.
- Do not widen production CSP globally for donor bundles; keep exceptions path-scoped to sandboxed static module homes.
