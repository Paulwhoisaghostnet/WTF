# Future wtfOS React Shell Demos

This is the second local prototype pass for a larger wtfOS shell. It deliberately leaves React95 behind while keeping React as the application/runtime constraint.

Run it from the repo root:

```bash
npm --prefix local-demos/modern-wtfos-react-future run dev
```

If `npm` is not on PATH in this environment, use the bundled Node runtime directly:

```bash
/Users/joshuafarnworth/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5189 --config local-demos/modern-wtfos-react-future/vite.config.ts
```

Then open:

```text
http://127.0.0.1:5189
```

## What This Explores

- React-only shell primitives: object cards, pods, intent rail, docks, decks, runbooks, inspector panels.
- 12 concepts across pitch-grade, indie web, mobile-native, and operation-first families.
- A migration posture where React95 can remain as a compatibility skin while new surfaces use modern primitives.
- The constraints that still matter: route governance, access gates, wallet trust states, inventory/E2E promotion requirements, mobile grammar, and lazy hydration.

## Boundary

This demo is local-only and does not import `react95`. It does not touch `client/src/App.tsx`, `client/src/routes/page-defs.ts`, `shared/wtf-browser-routes.ts`, server routes, desktop app registries, or production deploy config.
