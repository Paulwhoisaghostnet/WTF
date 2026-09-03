# Media, TV, And Studio Registry

This registry is the operational companion to [media-tv-studio.md](./media-tv-studio.md). It covers playback, publishing, Studio workflows, and media-library surfaces.

## Command Palette Registry

Primary launchable surfaces:

- WTF TV
- Studio
- My Gallery
- My Videos
- My Photos
- My Music
- Browser / media helpers
- Anchor (`/apps/anchor`) — independent preservation-appliance downloads alongside hosted Porcupin

## MCP Registry

This domain is mostly surfaced through shared WTFOS MCP reads and the media tooling around Studio and TV. Any new publish tool or media automation path must be cross-linked here.

## Event Registry

Common event families:

- `tv.*`
- `studio.*`
- `media.*`
- `gallery.*`
- `upload.*`
- `playback.*`
- `anchor.download_manifest.viewed`

Registry rule:

- Media playback, upload, and publish events should be bounded and should preserve provenance metadata.
- If a new media surface can publish publicly, it needs explicit rollback and moderation evidence.
- Anchor download artifacts stay hidden until both a safe URL and the matching SHA-256 are configured; access to its download manifest does not grant hosted Porcupin permissions.

## Install Policy

Media and Studio apps are installable only while their registry docs are fresh. If the install key ages out, normal users lose the launcher path until the registry is refreshed.

## Operating Procedures

1. Keep the TV/Studio/media registry aligned with the published assets and route list.
1. Treat project bundles and media archives as a provenance contract, not just a filesystem detail.
1. Update the install policy whenever a new publish or playback path is added.
