# Arcade, Console, And Game Studio

## Purpose

This domain covers browser-playable games, score sessions, creator submissions, the game SDK, stock Console titles, Arcade catalog pages, and Game Studio projects.

## WTF OS Connection

Arcade and Console are playable OS apps. Game Studio is the creator path for building or packaging games, then submitting them to Arcade review or trusted creator publish lanes.

## Main Code

- `server/features/arcade`
- `server/features/console`
- `server/features/game-studio`
- `client/src/features/studio`
- `client/src/pages/Arcade.tsx`
- `client/src/pages/GameStudio.tsx`

## Notes

Paid play, creator earnings, play cards, credits, refunds, and revenue-share accounting should stay modular: gameplay/session validation belongs to Arcade and Console, while payment settlement belongs to commerce and wallet services.
