# Media, TV, And Studio

## Purpose

Media and TV systems cover user media libraries, WTF TV channels, playback, embeds, creator uploads, Studio workflows, and gallery-style presentation.

## WTF OS Connection

Users open WTF TV, My Videos, My Photos, Studio, and gallery modules through WTF OS windows. Public TV embeds and playback routes can be viewed outside a logged-in OS session when published.

## Main Code

- `server/features/tv`
- `server/lib/studio`
- `client/src/features/tv`
- `client/src/features/media-library`
- `client/src/features/studio`
- `apps/collekt`

## Notes

Public playback should expose only published media and safe metadata. Uploads, private library files, draft Studio work, and creator controls remain session-protected.
