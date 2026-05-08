# UX Lab Source Map

Source folder: `../WTF-ux-interoperability-clone`

Imported targets:

- `client/src/features/ux-lab/mock-wtf-lab.ts`
- `client/src/features/ux-lab/ux-lab.ts`
- `client/src/features/ux-lab/CollectionWorkspace.tsx`
- `scripts/run-ux-lab-panel.ts`
- `client/src/pages/UxLab.tsx`

Retired experiment:

- `client/src/pages/TV2.tsx` remains source-reference only. It was not promoted as a WTF production page during this pass.

Runtime shape:

- `/dev/ux-lab` is an authenticated admin/host/cohost route.
- Mock data utilities live under the feature folder and are only imported by the dev route and the runner script.

Verification:

- `npm run check`
