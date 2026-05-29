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
- Terminal
- Notification Center
- Task Manager
- Admin surfaces when the current user has the right role

Registry rule:

- If a desktop app is hidden because its docs/install key is stale, normal users do not get a palette command for it.
- Admins and trusted creators can still see the repair path.

## MCP Registry

WTF OS MCP tools are the system-level companion to the shell and should remain separate from user-facing content tools. The shared MCP access manifest and paired-agent token flows are the canonical registry for:

- `wtf_get_capabilities`
- `wtf_get_access_manifest`
- `wtf_get_desktop_appearance`
- `wtf_set_desktop_appearance`
- `wtf_get_desktop_pet`
- `wtf_keep_desktop_pet_alive`

Registry rule:

- Tool access follows paired-agent token scope and admin app gates.
- A tool should never be published as a user-facing shortcut if the parent app is not installable.

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

- `app_registrations` — one row per universal `app_id` (e.g. `desktop:hoard`,
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
