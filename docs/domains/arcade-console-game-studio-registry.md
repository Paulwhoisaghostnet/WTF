# Arcade, Console, And Game Studio Registry

This registry is the operational companion to [arcade-console-game-studio.md](./arcade-console-game-studio.md). It keeps the game surfaces, source ingestion, and install policy aligned.

## Command Palette Registry

Primary launchable surfaces:

- Arcade
- Console
- Game Studio

Repair and admin-only paths:

- Console moderation and catalog maintenance
- Game Studio project and bundle repair views
- Arcade source import diagnostics

## MCP Registry

Relevant shared MCP entry points for this domain are the arcade and console tool families that are already part of the WTFOS MCP layer. New game tools must be registered before they can be treated as installable.

## Event Registry

Common event families:

- `arcade.*`
- `console.*`
- `game_studio.*`
- `source_import.*`

Registry rule:

- Game-facing events should never silently bypass moderation or source provenance.
- Installed cartridge and project-bundle updates must always have rollback evidence.

## Install Policy

An Arcade/Console/Game Studio surface is installable only when:

- Its docs are current.
- Its admin surface exists.
- Its install key is issued.
- Its source or bundle provenance is recorded.

## Operating Procedures

1. Keep the console manifest and the acceptance registry in sync.
1. Tie new games or studio exports to explicit rollback notes.
1. Treat source import diagnostics as part of the operating contract, not as optional logs.
