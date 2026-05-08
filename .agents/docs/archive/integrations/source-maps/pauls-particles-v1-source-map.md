# Paul's Particles V1 Source Map

Source URL: `https://ipfs.io/ipfs/Qmf6ZkGLgzJBFiAG2iXueCo3utYWHDgVJ1brhyzrcBxmy5`

Local snapshot: `../particle-system-capture-ipfs-Qmf6ZkGLgzJBFiAG2iXueCo3utYWHDgVJ1brhyzrcBxmy5`

WTF target: `public/creation-tools/pauls-particles-v1`

WTF route: `/tools/pauls-particles-v1`

## Current Finding

The snapshot is a static `Particle System Capture` p5/CCapture app. WTF already contains matching `sketch.js`, `lib/CCapture.all.min.js`, and `lib/gif.worker.js`.

The only intentional HTML difference is that the IPFS page loads p5 from `https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.4.0/p5.min.js`, while WTF uses local `lib/p5.min.js`.
Keep WTF's local p5 copy so the tool works without a CDN dependency.

Verification:

- `npm run creation-tools:check`
- `npm run check`
