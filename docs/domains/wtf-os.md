# WTF OS

## Purpose

WTF OS is the desktop shell that hosts the platform. Users open app windows, arrange desktop icons, manage settings, and move between gameshow, social, market, media, and creator tools without leaving the OS frame.

## WTF OS Connection

Every major feature appears as a route and, when appropriate, as a window-capable app. Admin-only and staff-only tools should be registered through the OS admin surface registry so settings, permissions, and discoverability stay consistent.

## Main Code

- `client/src/components/layout`
- `client/src/features/desktop`
- `client/src/features/admin-os`
- `client/src/routes`
- `shared/desktop.ts`

## Notes

New apps should add their route, icon/window behavior, permission metadata, and admin surface entry in the same pass.

## Phase 4 Closeout

Phase 4 is the shell, Mission Control, and user-rights layer. The canonical user-facing OS surfaces are:

- Mission Control: answers where the user is, what counts, what failed, what changed, what happens next, active wallet state, transaction-preflight context, and claimable rewards without sending normal users into admin tools.
- Command Palette: opens rounds, rewards, wallet activity, media, IPFS preparation, bundles, checks, logs, recovery, backup proof, and role-gated admin routes.
- File Manager: maps the WTF dwellings for Desktop, Projects, Media, Documents, Downloads, Vault, Apps, Chain, Archives, and Shared.
- System Settings and Theme Builder: keep account, appearance, notification, wallet, W, recovery, admin, theme, wallpaper, cursor, physics, pet, and MCP settings inside the OS.
- Notification Center: exposes all/unread notification state, preference changes, linked targets, and read actions.
- Browser Boundaries: separates normal browsing, wallet-safe mode, local development, media capture, archive/save-to-project, and admin surfaces.
- Recovery Mode: provides user-safe repair actions and routes operator-only reset, rollback, restore-proof, and driver-quarantine work to gated admin surfaces.
- Backup Manager: remains admin-gated and is the restore-proof authority.
- Terminal: runs only allowlisted WTF OS diagnostics and route actions; it is not an arbitrary server shell.

The executable Phase 4 gate is `client/src/pages/phase4-shell-verification.test.ts`. It locks the Law's verification questions to the actual shell surfaces, route registry, admin registry, command palette, browser modes, recovery actions, and interaction-event spine.

Phase 4 should not keep expanding unless one of those canonical surfaces regresses. New work should proceed into Phase 5 domain organ/reference grafts: kernel-safe chain clients, bounded caches, domain organ wiring, and domain-specific admin observability.

## Phase 5 Closeout

Phase 5 kernel grafts are closed in [Phase 5 Kernel Grafts Closeout](../phase-closeouts/phase-5-kernel-grafts.md). Do not reopen Phase 5 unless one of those recorded contracts regresses.
