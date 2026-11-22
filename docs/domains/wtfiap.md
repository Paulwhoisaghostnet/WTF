# coLILseum

coLILseum is the original autobattler hosted in a native wtfOS window at `/colilseum`. Launch it from its desktop icon or **Stuffs → Games → coLILseum**. The app is a free default desktop entry; the existing wtfOS app availability controls apply.

## Play

**Local practice** opens the complete browser game. Buy heroes from the shared finite shop pool, place them on your home territory, combine matching copies, and progress through battles. Gold, commander health, XP, treasure chests, factions, classes, and the chosen board mode follow the packaged game rules.

**Party & Tournament** opens room creation and invitations. Party rooms support eight commanders with optional AI fill, preparation limits of two, five, or ten minutes, or a ready-button mode. Room codes and invitation URLs let other players join; browser-held room credentials reconnect to the same seat. The server validates room actions and records rounds.

Tournament rooms require eight human entrants. The host selects XTZ or WTF and an entry amount; the prize preview assigns 50% / 35% / 15% to the top three places in that currency. Same-round eliminations rank by final raw HP, then gold, then the last fielded team's total maximum HP. Exact ties split the combined prizes for their occupied places equally, including exact fractions where an atomic unit is indivisible.

**The tournament preview shows the prize split before funding.** Configured wagered rooms use escrow for deposits and payouts.

## Runtime and recovery

- The native window embeds `/games/installed/wtfiap/index.html` and `/games/installed/wtfiap/party.html` from the same origin.
- `/colilseum/CODE` opens a Duel, Party, or Tournament invitation within the native window. The old `/wtfiap?room=CODE` link remains a compatibility alias for existing invitations. Parameters belong to that window, not whichever desktop window most recently changed the address bar.
- The hosted Party authority is `/api/wtfiap/party`. Room credentials remain private; invitation links contain room identifiers only.
- Runtime sources live in `server/features/wtfiap/runtime/`; packaged browser assets live in `public/games/installed/wtfiap/`. These are maintained game artifacts, not remote third-party iframe destinations.
- Preserve the server's room store during a deploy or rollback. Reloading a room URL in the same browser recovers its saved seat.

## Isolated funded Duels

The isolated runtime accepts new open-seat XTZ Duels only on networks named in its mounted admission policy. It uses the ordinary wtfOS session, CSRF, wallet-ownership and bearer-token checks. Its escrow database and writable match directory are separate. The runtime holds the database writer lease and refuses startup if its room directory or privileges fail the isolation checks.

The gateway routes a created room by its durable file, including after admission for its network is paused. The protected legacy Duel bypasses the gateway. The lobby combines both read-only directories. A shared signer serializes wallet operations and applies its durable request journal, while each authority computes results only from rooms it owns.

Keep both room stores, the isolated database, and the ingress through restarts. An empty admission policy sends new rooms back to the legacy path and preserves routing for every already-owned isolated room.

## wtfOS deployments

The Hetzner deploy workflow checks both room stores before it uploads a release or updates the signer. Waiting rooms, active matches, and rooms with unsettled escrow defer the deploy. Look for the deferral in the workflow summary and rerun the latest main-branch deploy when the rooms finish.

The host reads `/etc/wtf/wtfiap-duel-deploy.json` to verify the protected legacy room UUID and cross-checks the reader and writer mounts. During an eligible cutover, Caddy temporarily blocks new admissions and starts. The deploy rechecks both room stores and restores the previous ingress if replacement is deferred. The adapted startup file lives on the attached volume under `/mnt/wtf-data/config/wtfiap-caddy`. The deploy verifies the gateway route, legacy bypass, and both isolated containers after replacement.

The guarded Shadownet proof script checks the deployed chain ID and contract, uses the standard wallets and gameplay routes, and verifies automatic start and payout without calling a reconcile or claim endpoint. Run the actual funded proof on Shadownet before adding Mainnet to the admission policy.

See the [registry](./wtfiap-registry.md) for installation and verification ownership.
