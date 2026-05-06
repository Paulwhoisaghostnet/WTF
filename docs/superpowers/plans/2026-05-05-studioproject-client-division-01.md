# Division 01: StudioProject Client Refactor

## Scope

- Monolith: `client/src/pages/StudioProject.tsx`
- Goal: keep the route/page export stable while moving Studio workspace responsibilities into `client/src/features/studio/`.
- Compatibility requirements: preserve Studio query keys, socket event invalidation, user-state persistence, annotation tools, upload flows, chat/pin behavior, and member invites.

## Worker Status

- D01-W01 types, DTOs, constants: Complete
- D01-W02 data queries and hooks: Complete
- D01-W03 mutations and command handlers: Complete
- D01-W04 shell layout and toolbar: Complete
- D01-W05 file tree and folder navigation: Complete
- D01-W06 preview surface: Complete
- D01-W07 annotations panel: Complete
- D01-W08 comments and collaboration state: Complete
- D01-W09 project chat and DM bridge: Complete
- D01-W10 upload, storage, and versions: Complete
- D01-W11 compatibility verifier and cleanup: Complete

## Completion Notes

- 2026-05-05: `client/src/pages/StudioProject.tsx` is now a 462-line compatibility wrapper that owns route/project state, selected tool/file state, user-state persistence, and feature-module wiring.
- Feature modules now own Studio DTOs/helpers, shared chrome, project data reads, mutation setup, socket effects, left navigation/upload column, workspace header, preview/annotation surface, annotation details, invite picker, and collaboration/chat/member column.
- Verification: `npm run check -- --pretty false` passed after each extraction slice.
