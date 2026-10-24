# WTFIAP-v0.01 registry

Companion to [WTFIAP-v0.01](./wtfiap.md), under the [master register](./master-register.md).

## App and launch registry

| Binding | Canonical value |
| --- | --- |
| Display name | WTFIAP-v0.01 |
| Desktop app key / persisted icon key | `wtfiap` |
| Native route | `/colilseum` and `/colilseum/:roomCode`; legacy `/wtfiap` |
| Menu | Stuffs → Play |
| Placement and price | Default desktop; free |
| Native owner | `client/src/pages/WtfIap.tsx` |
| Browser runtime | `/games/installed/wtfiap/index.html`, `/games/installed/wtfiap/party.html` |
| Room API | `/api/wtfiap/party` |
| Admin surface | `wtfiap` |

The PageDef and shared browser route both expose the public game route. The ordinary desktop app gate controls launcher availability. Room seats use game-issued credentials; this release does not create a new wallet identity, entitlement, or payment gate.

## Command palette and MCP registry

The standard route/desktop registries make `/colilseum` discoverable through the existing shell launch mechanisms and `open /colilseum`. Room invitations use `/colilseum/:roomCode`; `/wtfiap` remains a legacy alias. There are no dedicated game MCP tools or automatic wagering commands. Any future tool needs its own authorized contract.

## Events and interactions

Desktop launch and window tracking retain the existing `desktop.icon.opened`, `desktop.window.opened`, and `desktop.start_menu.opened` handles. Game room state and replay receipts belong to the Party authority; local practice does not award platform XP or emit Arcade score events. Do not advertise game room receipts as blockchain settlement.

The interaction inventory and `tests/e2e/inventory/` own the native route, game-mode navigation, invitation entry, browser seat recovery, and unfunded tournament preview. The focused browser story is `tests/playwright/inventory/wtfiap.spec.mjs`; `server/features/wtfiap/authority.test.ts` owns the authority boundary and persistence checks. `GET /api/wtfiap/party/health` is the read-only domain probe.

## Install and package policy

The built-in app must retain its canonical bindings in `shared/types.ts`, `shared/desktop-apps.ts`, `shared/desktop.ts`, `shared/wtfos-app-catalog.ts`, `shared/wtf-browser-routes.ts`, `shared/wtf-app-packages.ts`, `shared/wtf-docregistry.ts`, PageDefs, desktop icons, Start Menu gates/model, and the admin surface registry. Documentation and package acceptance point to this domain. No separate install purchase is required.

The game assets use the existing path-scoped installed-game compatibility policy. The outer wtfOS shell retains its strict production script policy. Browser verification must run the packaged assets and actual room API, not substitute a static lobby screenshot.

## Operating, rollback, and uninstall procedures

1. Build the packaged game and wtfOS shell from the same reviewed source tree.
2. Verify desktop and Stuffs launches, local shop/formation actions, the Party invitation path, and saved-seat recovery. Run inventory coverage and the inventory suite alongside the domain server tests.
3. Verify the publicly served release after deployment before claiming it is live.
4. To roll back, restore the prior deploy commit and packaged assets while retaining room snapshots and browser seat credentials. Do not erase active rooms as a launcher repair.
5. Disabling `wtfiap` through existing OS Admin app controls removes launcher access without deleting game data. Destructive removal requires a separately authorized migration.
