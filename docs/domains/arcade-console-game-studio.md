# Arcade, Console, And Game Studio

## Purpose

This domain covers browser-playable games, score sessions, creator submissions, the game SDK, stock Console titles, Arcade catalog pages, Game Studio projects, and Remote Applications for hosted Linux desktop titles surfaced through wtfOS.

## WTF OS Connection

Arcade and Console are playable OS apps. Game Studio is the creator path for building or packaging games, then submitting them to Arcade review or trusted creator publish lanes.

Remote Applications is the OS-facing launcher for external Linux desktop apps hosted by the isolated apphost service. Users see manifests, cover art, readiness/status, and a browser play window; Steam, the Linux runtime, virtual display, software rendering, audio plumbing, and host diagnostics remain implementation details behind authenticated wtfOS proxy routes.

## Main Code

- `server/features/arcade`
- `server/features/console`
- `server/features/game-studio`
- `server/features/apphost`
- `server/routes/apphost.ts`
- `client/src/features/studio`
- `client/src/pages/Arcade.tsx`
- `client/src/pages/Applications.tsx`
- `client/src/pages/ApplicationSession.tsx`
- `client/src/pages/GameStudio.tsx`
- `apphost/`

## Notes

Paid play, creator earnings, play cards, credits, refunds, and revenue-share accounting should stay modular: gameplay/session validation belongs to Arcade and Console, while payment settlement belongs to commerce and wallet services.

Remote Applications should stay removable and host-isolated: new launchable apps come from manifests, only one external app may run at a time across wtfOS, and the apphost must not require production database/container mutation to add or remove hosted app support.
