# Collekt Source Map

Source folder: `../collekt-wtf`

WTF targets:

- `apps/collekt`: independently buildable Next/R3F module.
- `shared/collekt.ts`: shared session and token API contracts.
- `server/features/collekt`: WTF API session, token, and module URL services.
- `client/src/features/collekt`: desktop iframe bridge and session hook.

Existing WTF public wrappers:

- `server/routes/collekt.ts` remains mounted at `/api/collekt/session` and `/api/collekt/tokens`.
- `client/src/pages/Collekt.tsx` remains the `/collekt` page wrapper.

Runtime env:

- `COLLEKT_MODULE_URL`: server-provided standalone module URL.
- `VITE_COLLEKT_MODULE_URL`: client build-time override for the embedded module URL.

First verification commands:

- `npm run check`
- `npm run collekt:check`
