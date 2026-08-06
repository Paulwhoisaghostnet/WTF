# WTF OS Registry

This registry is the operational companion to [wtf-os.md](./wtf-os.md). It documents how the desktop shell, command palette, admin gate, and app install policy fit together.

## Surface Roll-Up

- Master register: [master-register.md](./master-register.md)
- Domain guide: [wtf-os.md](./wtf-os.md)
- Registry: this file

## Command Palette Registry

The desktop shell command palette is the canonical launcher for route-first app access. The palette should only surface routes that are reachable through the live page registry and current app gate state.

Primary commands and launch paths:

- Mission Control
- Command Palette
- Recovery Mode
- File Manager
- Settings
- Browser Boundaries
- Agent (`/agent`)
- Applications (`/applications`, apphost-backed)
- Terminal
- CLI (`/cli`, native `@wtfos/cli`)
- Notification Center
- Task Manager
- Admin surfaces when the current user has the right role

Registry rule:

- If a desktop app is hidden because its docs/install key is stale, normal users do not get a palette command for it.
- Admins and trusted creators can still see the repair path.
- New route-first apps must ship their `DesktopAppKey`, default gate config, start-menu gate, desktop icon/layout key, admin surface, package acceptance, doc-registry mapping, and inventory row in one pass.

## MCP Registry

WTF OS MCP tools are the system-level companion to the shell and should remain separate from user-facing content tools. The shared MCP access manifest and paired-agent token flows are the canonical registry for:

- `wtf_get_capabilities`
- `wtf_get_access_manifest`
- `wtf_get_desktop_appearance`
- `wtf_set_desktop_appearance`
- `wtf_get_desktop_pet`
- `wtf_keep_desktop_pet_alive`

Agent consumes the same paired-token registry from `/agent`; it does not create a second MCP authority or proxy provider credentials through wtfOS. Its provider runtime speaks browser-direct to remote providers or local endpoints with user-owned session credentials, while MCP tokens remain scoped to the authenticated wtfOS user. The provider panel reviews detected capability profiles for OpenAI, Anthropic, Google, OpenRouter, Ollama, LM Studio, and OpenAI-compatible APIs, and lets users override advertised reasoning, multimodal, artifact, tool, embedding, local-inference, and custom-endpoint features without forking Agent into provider-specific apps. Portable Agent projects are stored as `WTF/Projects/Agent` snapshots containing files, plan items, reviewable generated actions, memory, provider metadata, messages, grants, local git branches, staged paths, extension manifests, and commit history, never provider secrets. The native workbench can create, rename, delete, search, diagnose, summarize, jump from code outline/search/diagnostic results to exact editor lines, stage, unstage, commit, and branch files inside the active project path before those snapshots are exported or restored. Its permissions panel previews the MCP resources, scopes, allowed tools, and blocked tool families produced by the current visible grants before a paired token is created. Provider replies and pasted drafts can propose file edits or allowlisted command actions, but the user must apply or dismiss them through visible write/filesystem or execute/terminal grants. Its extension registry lets users review core manifests and install, enable/disable, or remove user-owned provider, MCP-server, tool, personality, theme, and knowledge-pack manifests without granting runtime authority outside visible permissions. Its companion knowledge base and extension catalog are machine-readable registries derived from live route, admin-surface, provider, filesystem, project-bundle, MCP, permission, and extension manifests.

Registry rule:

- Tool access follows paired-agent token scope and admin app gates.
- A tool should never be published as a user-facing shortcut if the parent app is not installable.

## CLI Registry

The wtfOS CLI stack is a **UI-less mirror** of browser gates — not a backdoor.

Surfaces:

| Surface | Path / package | Gate API |
| --- | --- | --- |
| In-browser Terminal | `/terminal` | Local `evaluateBrowserRouteAccess` |
| Full-screen CLI | `/cli` | Same shared kernel |
| Native CLI | `@wtfos/cli` (`packages/wtfos-cli`) | `GET /api/cli/can-open`, `GET /api/cli/routes` |

Shared kernel: `shared/wtfos-cli/` (allowlisted commands only — no server shell).

**Builder obligations** for new apps: `docs/wtfos-cli-builder-obligations.md` and `@wtfos/sdk` export `WTFOS_CLI_BUILDER_OBLIGATIONS`.

Registry rules:

- Apps inherit `open /route` handles when their browser route is registered — no per-app CLI commands.
- Keep `shared/wtf-browser-routes.ts` synced with `PAGE_DEFS`.
- Never validate route opens against `GET /api/access` alone.
- Anonymous `can-open` probes receive generic deny copy (no route oracle).
- `/api/cli/can-open` and `/api/cli/routes` are rate-limited (60/min) separately from generic `/api/*`.

Core CLI events:

- `cli.viewed`
- `cli.command_executed`
- `terminal.viewed`
- `terminal.command_executed`

## Event Registry

Core WTF OS events that describe the shell and registry lifecycle:

- `command_palette.opened`
- `command_palette.executed`
- `desktop.icon.clicked`
- `desktop.window.opened`
- `desktop.window.closed`
- `desktop.app.disabled_by_admin`
- `admin.app_gate.updated`
- `desktop.icon.layout_changed`
- `desktop.appearance.updated`

Registry rule:

- Shell events are not app payloads; they are system telemetry.
- A new surface must either reuse an existing event family or register a new one here before it ships.

## Install Policy

WTF OS installability depends on the app being doc-registered, the docs being fresh, and the install key being issued from the admin gate.

Policy:

- Fresh docs stay within the 24-hour refresh window.
- A stale registry revokes normal-user installability.
- Admins and trusted creators can still reach the repair surface.
- The install key must be treated as a short-lived authorization artifact, not a permanent entitlement.

## Operating Procedures

1. Update this registry before changing the shell surface.
1. Update the domain guide when the conceptual contract changes.
1. Update the package acceptance entry when an app, tool, or admin surface changes.
1. Refresh install keys after the docs are changed.
1. Use the master register as the human entrypoint for cross-domain audits.

## Universal App Registry (APP_REGISTRY_ENABLED)

The universal App Registry (`server/features/app-registry/`) generalizes the
legacy per-desktop-app install gate to EVERY app on wtfOS — the 20 desktop apps,
the static creation tools / packages / integration plugins, and user-published
`installed:<slug>` apps. It is additive and gated by the master flag
`APP_REGISTRY_ENABLED` (default OFF). When the flag is off the registry routes
404, the verifier no-ops, and the legacy `desktop_app_settings` launcher
behaviour is unchanged.

Generic tables (`shared/schema-app-registry.ts`):

- `app_registrations` — one row per universal `app_id` (e.g. `desktop:arcade`,
  `creation-tool:particle-painter`, `installed:<slug>`): kind, label, doctrine
  domain, `lifecycleState`, `enabled`, integrity fingerprint legs
  (`manifestHash`/`bundleHash`/`buildHash` → `integrityFingerprint`), source
  metadata, and an optional `did` for spine mirroring.
- `app_keys` — modelled on `mcp_agent_tokens`: only a sha256 `keyHash` + short
  `keyPrefix` are stored, plus `scopes`, `boundFingerprint`, `disabledAt`/
  `disabledReason`, `revokedAt`, `lastUsedAt`, `issuedBy`.

Keys (`wtfapp_<appId>_<rand>`):

- Issued on register / promote / re-register and bound to the app's current
  integrity fingerprint. The secret is shown ONCE.
- Valid iff `revokedAt` is null AND `disabledAt` is null AND `boundFingerprint`
  equals the app's current fingerprint. A valid key is MANDATORY only when
  `APP_REGISTRY_ENABLED` is on; the legacy null-key-active path stays only when
  the flag is off.
- Admins disable/revoke keys via the admin routes.

Integrity (Req4):

- `integrityFingerprint = sha256(manifestHash ‖ bundleHash ‖ buildHash)`.
  `manifestHash` is sha256 of the canonicalized (deterministic key sort)
  manifest; `bundleHash` is the merkle root over the app's asset tree (reuses
  `server/lib/merkle.ts`); `buildHash` is the git commit / package version.
- The verifier (startup, the `app-registry-integrity` background job, and on key
  use) recomputes the fingerprint. On drift it disables the key
  (`disabledReason=integrity_changed`), flips the app to `needs-reregister`, and
  emits a `app_registry.integrity_changed` system event. Re-registering
  recomputes the fingerprint, rebinds/reissues the key, and restores the
  lifecycle.

Lifecycle: `draft → registered → alpha → published` plus the auto state
`needs-reregister` and the admin states `disabled` / `revoked`. An app is
installable only when `APP_REGISTRY_ENABLED` is on, it is `enabled`, has a valid
key, the fingerprint matches, and it is `published` (or `alpha` for the cohort of
users with `test_subject` / `trusted_creator` roles). Alpha apps never appear in
the public command palette.

Install-New-App wizard: `POST /api/admin/app-registry/wizard/{preview,install}`
(admins + `trusted_creator`). A code project (GitHub repo via the read-only API,
or an upload pre-extracted by the route) is turned into a `wtfos.app.json`
manifest, VALIDATED against the universal standards (the same contract as
`shared/wtf-app-packages.test.ts`), fingerprinted, registered, given a key, and
moved into ALPHA. Uploaded/repo code is VALIDATED ONLY in this pass — never
executed or sandboxed.

Operating procedures:

1. Run `npm run app-registry:backfill` once after enabling the flag (idempotent)
   so every current app is registered with computed fingerprints and enabled
   builtins keep a valid key.
1. Use `POST /api/admin/app-registry/registrations/:appId/issue-key` to rotate a
   key, `.../disable-key` and `.../revoke-key` to suspend an app, and
   `.../transition` to promote `alpha → published`.
1. After an app's code/manifest changes, re-register it
   (`.../reregister`) to rebind its key.
1. Optional spine mirroring (`app.wtfos.os.app.*` / `app_keys.did`) only engages
   when `ATPROTO_SPINE_ENABLED` is also on; the registry runs fully on Postgres
   with the spine flag off.
