# wtfOS CLI / Terminal — Builder Obligations

Last reviewed: 2026-05-31

This document is the human-facing companion to `shared/wtfos-cli-builder-obligations.ts` and the `@wtfos/sdk` builder export (`WTFOS_CLI_BUILDER_OBLIGATIONS`).

## Rule

wtfOS apps do **not** register bespoke CLI commands. They inherit CLI and Terminal reachability when their **browser route** is registered with the same gates as the web UI.

After registration, users and agents can:

- `open /your-route` in **Terminal** or full-screen **`/cli`**
- `wtfos open /your-route` in **`@wtfos/cli`**

All opens evaluate `shared/wtf-browser-route-access` (browser) or `GET /api/cli/can-open` (native CLI) — never the public access manifest alone.

## Same-Pass Checklist

| Step | File(s) |
| --- | --- |
| Browser route | `client/src/routes/page-defs.ts` |
| Shared route meta | `shared/wtf-browser-routes.ts` (+ sync test) |
| Access manifest | `server/lib/wtf-access.ts` |
| Launcher gates | `start-menu-app-gates.ts`, `DESKTOP_APPS`, `DEFAULT_DESKTOP_APP_CONFIG` |
| Admin surface | `admin-surface-registry.ts` |
| Package acceptance | `shared/wtf-app-packages.ts` |
| Inventory + E2E | `user-interaction-inventory.md`, `tests/e2e/inventory/*` |

Run `npm run test:e2e:inventory:coverage` before claiming the app is fully registered.

## Special Rollout Gates

If your app needs env/role rollout beyond standard PAGE_DEFS gates (Skywire staff-alpha is the reference), extend **`shared/wtf-browser-route-access.ts`** so browser, Terminal, and native CLI stay aligned. Do not add CLI-only bypasses.

## Forbidden

- Per-app commands in `shared/wtfos-cli/commands.ts` (unless OS-wide)
- Gate checks against `GET /api/access` route lists
- Server shell execution or scraping gated HTML via CLI
- Skipping session/role/app gates on `/api/cli/*`

## Machine Export

```ts
import { WTFOS_CLI_BUILDER_OBLIGATIONS } from "@wtfos/sdk/builder-cli";
```

See also: [wtfos-sdk.md](./wtfos-sdk.md), [wtf-os-registry.md](./domains/wtf-os-registry.md) § CLI Registry, [public-access.md](./public-access.md) § Native CLI.
