# 2026-05-06 Refactor Branch Review Bugs

Branch: `codex/modular-architecture-refactor`

Scope: regressions introduced by the modular architecture refactor only. Existing open `BUG_BOUNTY_BOARD.md` items are ignored for this merge gate unless this branch newly worsens them.

## Review Gates

| Gate | Status | Evidence |
| --- | --- | --- |
| Production build | Pass | `npm run build` |
| TypeScript | Pass | `npm run check -- --pretty false` |
| Whitespace | Pass | `git diff --check` |
| Local dev server | Pending | Not started yet |
| Browser smoke | Pending | Not run yet |
| Merge to `main` | Pending | Waiting on browser smoke |
| Deploy | Pending | Waiting on merge |

## Branch Bugs

No branch-introduced bugs have been found yet.

## Browser Smoke Matrix

Exercise moved surfaces that were split into domains during this branch:

- Desktop OS shell and desktop pet modules.
- Admin console tabs and server admin routes.
- TV shell, playback, creator tools, menu screens, and server TV routes.
- W shell, timeline, social, messages, actions, link previews, and server W routes.
- Studio project workspace modules.
- Marketplace listing, board, auction, and wallet-action modules.
- Message board client modules.
- Shared schema barrel and domain schema imports through runtime API pages.
