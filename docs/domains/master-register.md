# WTFOS Master Register

This is the top-level roll-up for WTFOS documentation. Every domain guide must be paired with a domain registry file, and every installable app/package must point back to the master register, its parent domain guide, and the owning domain registry.

## Roll-Up Rule

1. Master register
1. Domain guide
1. Domain registry
1. App/package acceptance entry
1. Runtime gate and install-key policy

If a new app, tool, or integration is added to WTFOS, the change is not complete until the owning domain registry is updated and the install policy is clear.

## Domain Index

| Domain | Guide | Registry |
| --- | --- | --- |
| WTF OS | [wtf-os.md](./wtf-os.md) | [wtf-os-registry.md](./wtf-os-registry.md) |
| Identity And Social | [identity-and-social.md](./identity-and-social.md) | [identity-and-social-registry.md](./identity-and-social-registry.md) |
| Arcade, Console, And Game Studio | [arcade-console-game-studio.md](./arcade-console-game-studio.md) | [arcade-console-game-studio-registry.md](./arcade-console-game-studio-registry.md) |
| Commerce And Wallets | [commerce-and-wallets.md](./commerce-and-wallets.md) | [commerce-and-wallets-registry.md](./commerce-and-wallets-registry.md) |
| Media, TV, And Studio | [media-tv-studio.md](./media-tv-studio.md) | [media-tv-studio-registry.md](./media-tv-studio-registry.md) |
| Tezos Platform | [tezos-platform.md](./tezos-platform.md) | [tezos-platform-registry.md](./tezos-platform-registry.md) |
| Operations | [operations.md](./operations.md) | [operations-registry.md](./operations-registry.md) |

## Install-Key Policy

WTFOS apps can only be installed when their domain registry is complete, their docs are current, and their install key is issued through the admin gate. If the docs age past the freshness window, the install key is considered stale and the app falls back to hidden-by-default behavior for normal users.

## Shared Operating Principles

- Docs are modular, not monolithic.
- Registry files are the canonical operational companions to the domain guides.
- Command palette, MCP, and event registries must stay aligned with the live route and admin surface set.
- App packages must preserve provenance and rollback evidence.
- Admin and trusted-creator repair access is separate from normal install access.
