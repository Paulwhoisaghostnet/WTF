# Modern wtfOS React95 Local Demos

This is an isolated local prototype host for testing "Modern wtfOS" interface directions without registering a new production route, Start Menu item, desktop app key, API, or deploy path.

Run it from the repo root:

```bash
npm --prefix local-demos/modern-wtfos-react95 run dev
```

Then open:

```text
http://127.0.0.1:5187
```

## Demo Set

- 3 pitch-grade product concepts: Signal Office, Protocol Atlas, Creator Market Terminal.
- 3 indie-web concepts: Zineyard 95, Public Access Bodega, Hypercard Orchard.
- 3 mobile-first concepts: Pocket Mission Control, Live Pocket Studio, Chain Wallet Deck.
- 3 operation-first concepts: Command Rail OS, Recovery Console First, Role Runbook Workspace.

## Boundary

The demos use mocked data and root React/React95 dependencies. They do not touch `client/src/App.tsx`, `client/src/routes/page-defs.ts`, `shared/wtf-browser-routes.ts`, the interaction inventory, production server routes, or live deployment config.

If one of these concepts is promoted into real wtfOS, that promotion must update the normal route/access/inventory/E2E contract in the same pass.
