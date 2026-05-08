# Particle Studio 🎨✨

A GPU-accelerated particle simulation and visual effects application built with React, TypeScript, and WebGL2.

## Quick Start

### Prerequisites
- Node.js 18+ 
- A WebGL2-capable browser (Chrome, Firefox, Safari, Edge)

### Installation

```bash
cd particle-studio
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Getting Started in 5 Steps

1. **Add a Layer** - Click "+ Add" in the left panel
2. **Choose Type** - Select particle type (Sand, Dust, Sparks, Ink, etc.)
3. **Adjust Physics** - Modify gravity, wind, jitter in the Forces section
4. **Style Particles** - Change size, color, brightness in the right panel
5. **Export** - Use the export bar to capture screenshots, GIFs, or videos

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Pause/Resume simulation |
| `R` | Reset all particles |

## Features

### Movement Patterns
- **Still** - Particles respond only to forces
- **Linear** - Move in a set direction
- **Wave** - Sinusoidal motion with cardinal direction controls
- **Spiral** - Spiral toward/away from center
- **Orbit** - Circular orbit around a point
- **Vortex** - Spinning drain effect
- **Brownian** - Random walk motion
- **Evade** - Particles flee from each other
- **Clusters** - Particles bind together in groups

### Boundary Modes
- Respawn, Bounce, Wrap, Stick, Destroy, Slow Bounce

### Export Options
- PNG Screenshots
- Animated GIFs
- WebM Video Recording
- MP4 with Audio (audio-reactive)

## Documentation

For comprehensive documentation, see [USER_MANUAL.md](./USER_MANUAL.md)

## Development

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run lint     # Run linter
npm run preview  # Preview production build
```

## Tech Stack

- React 18 + TypeScript
- WebGL2 for GPU-accelerated particles
- Vite for fast development
- Zustand for state management
- Radix UI for accessible components

## License

MIT
