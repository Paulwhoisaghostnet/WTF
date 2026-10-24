# coLILseum

coLILseum is the original autobattler hosted in a native wtfOS window at `/wtfiap`. Launch it from its desktop icon or **Stuffs → Play → coLILseum**. The app is a free default desktop entry; the existing wtfOS app availability controls apply.

## Play

**Local practice** opens the complete browser game. Buy heroes from the shared finite shop pool, place them on your home territory, combine matching copies, and progress through battles. Gold, commander health, XP, treasure chests, factions, classes, and the chosen board mode follow the packaged game rules.

**Party & Tournament** opens room creation and invitations. Party rooms support eight commanders with optional AI fill, preparation limits of two, five, or ten minutes, or a ready-button mode. Room codes and invitation URLs let other players join; browser-held room credentials reconnect to the same seat. The server validates room actions and records rounds.

Tournament rooms require eight human entrants. The host selects XTZ or WTF and an entry amount; the prize preview assigns 50% / 35% / 15% to the top three places in that currency. Same-round eliminations rank by final raw HP, then gold, then the last fielded team's total maximum HP. Exact ties split the combined prizes for their occupied places equally, including exact fractions where an atomic unit is indivisible.

**Tournament amounts are accounting previews. No funds are collected or paid.** This release has no wallet payment, escrow, transfer, or prize-claim flow.

## Runtime and recovery

- The native window embeds `/games/installed/wtfiap/index.html` and `/games/installed/wtfiap/party.html` from the same origin.
- `/wtfiap?room=CODE` opens the Party invitation within the native window. Query parameters belong to that window, not whichever desktop window most recently changed the address bar.
- The hosted Party authority is `/api/wtfiap/party`. Room credentials remain private; invitation links contain room identifiers only.
- Runtime sources live in `server/features/wtfiap/runtime/`; packaged browser assets live in `public/games/installed/wtfiap/`. These are maintained game artifacts, not remote third-party iframe destinations.
- Preserve the server's room store during a deploy or rollback. Reloading a room URL in the same browser recovers its saved seat.

See the [registry](./wtfiap-registry.md) for installation and verification ownership.
