# Operations Registry

This registry is the operational companion to [operations.md](./operations.md). It covers the admin-only support surfaces that keep WTFOS healthy.

## Command Palette Registry

The operations domain is intentionally sparse in the launcher. Admin-only support surfaces should stay under the admin/ops area and should not masquerade as normal user apps.

## MCP Registry

Operations work is mostly host-side and admin-side. If a new support tool needs MCP exposure, it should be explicitly registered and reviewed as an operational capability, not as a convenience shortcut.

## Event Registry

Common event families:

- `admin.*`
- `backup.*`
- `deploy.*`
- `health.*`
- `incident.*`
- `system.log.*`

Registry rule:

- Host, backup, and deploy actions should be fully auditable.
- The operations registry is the place to describe failure handling, restore proof, and deploy health.

## Install Policy

Operations surfaces are admin-only by design. They are not installable by normal users, and they should not be promoted as desktop apps.

## Operating Procedures

1. Keep health and backup documentation aligned with the live admin tools.
1. Update restore proof and deploy evidence whenever the operational path changes.
1. Use the master register as the control-room index for support surfaces.
