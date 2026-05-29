# Identity And Social Registry

This registry is the operational companion to [identity-and-social.md](./identity-and-social.md). It covers social surfaces, identity bridges, and the doc/install policy for apps that live in that domain.

## Command Palette Registry

Typical launchable surfaces:

- WIM
- W
- Dicksword
- I Hate Telegram
- Dear Diary
- Skywire
- tz2at
- WTF Mail

Repair-only or admin-assisted entries should remain hidden from normal users when the app registry is stale.

## MCP Registry

No domain-specific public MCP tool set is owned here beyond the shared WTFOS access manifest and the paired-agent token layer. Any new identity/social MCP tool must be declared in the shared MCP registry and cross-linked here before it can be treated as a real operating surface.

## Event Registry

Common event families for this domain include:

- `w.message.*`
- `skywire.*`
- `tz2at.*`
- `mail.*`
- `diary.*`
- `dm.*`

Registry rule:

- Public social events can be emitted only when the underlying surface is explicitly public.
- Identity-link or private-user state must remain on the appropriate protected store and must not be mixed with public event records.

## Install Policy

Identity and social apps can be hidden when their docs/install key goes stale. Admins and trusted creators may still use the repair surface, but normal users should see the app as unavailable until the registry is refreshed.

## Operating Procedures

1. Update the domain guide when the user-visible contract changes.
1. Update this registry when commands, routes, or event families change.
1. Refresh the app package acceptance entry before shipping a new or renamed social surface.
