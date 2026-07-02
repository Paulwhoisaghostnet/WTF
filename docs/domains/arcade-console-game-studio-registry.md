# Arcade, Console, And Game Studio Registry

This registry is the operational companion to [arcade-console-game-studio.md](./arcade-console-game-studio.md). It keeps the game surfaces, remote application surfaces, source ingestion, and install policy aligned.

## Command Palette Registry

Primary launchable surfaces:

- Arcade
- Console
- Game Studio
- Remote Applications (`/applications`)

Repair and admin-only paths:

- Console moderation and catalog maintenance
- Game Studio project and bundle repair views
- Arcade source import diagnostics
- Remote application host diagnostics, manifest review, and single-active-session repair

## MCP Registry

Relevant shared MCP entry points for this domain are the arcade and console tool families that are already part of the WTFOS MCP layer. New game tools must be registered before they can be treated as installable.

Remote Applications are not exposed as Steam or host-control tools to users. wtfOS owns the authenticated `/api/apphost/*` proxy, `/ws/apphost` signaling/input channel, manifest-driven title list, and the single-active-external-app guard.

## Event Registry

Common event families:

- `arcade.*`
- `console.*`
- `game_studio.*`
- `applications.*`
- `apphost.*`
- `source_import.*`

Registry rule:

- Game-facing events should never silently bypass moderation or source provenance.
- Installed cartridge and project-bundle updates must always have rollback evidence.
- Remote application launch, stop, stream, and input events must preserve the apphost boundary and keep Steam/runtime details implementation-private.

## Install Policy

An Arcade/Console/Game Studio surface is installable only when:

- Its docs are current.
- Its admin surface exists.
- Its install key is issued.
- Its source or bundle provenance is recorded.
- For Remote Applications, its `DesktopAppKey`, default desktop app config, start-menu gate, desktop icon, admin surface, package acceptance, apphost manifests, and interaction inventory all agree.
- For Remote Applications, the host remains isolated under `/opt/wtfos/apphost`, supports rollback/removal without touching production wtfOS containers or databases, and preserves the one-running-external-app constraint.

## Operating Procedures

1. Keep the console manifest and the acceptance registry in sync.
1. Tie new games or studio exports to explicit rollback notes.
1. Treat source import diagnostics as part of the operating contract, not as optional logs.
1. Keep Remote Applications manifests, `/applications` routes, apphost API docs, and the desktop app registry in the same change when adding or repairing hosted apps.
1. Validate WebRTC media, pointer/keyboard input forwarding, apphost snapshots, and Mesa software-rendering fallback before enabling a new remote hosted application for normal users.
