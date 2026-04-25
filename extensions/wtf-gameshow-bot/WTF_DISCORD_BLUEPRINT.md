# WTF Discord Blueprint

Guild ID: `1375286181079810058`

This is the dry-run server plan for the Dicksword microapp and WTF Discord bot.
It is documentation only: no channel, role, permission, or bot deployment changes
are applied by this file.

## Principles

- Preserve the existing server. Move legacy channels into an archive category or
  document their current purpose; do not delete channels.
- The bot manages only explicitly configured WTF roles. Admin, host, cohost,
  moderator, and Discord-native power roles stay protected unless the owner maps
  them later.
- Discord-native users can participate before OAuth. Activity is recorded by
  Discord user ID, then attached to a WTF account after OAuth or `/wtf prove`.
- XP-producing events must be idempotent. Message activity uses Discord message
  IDs as external refs; other games should provide stable event refs.

## Categories And Channels

### Archive

- `archive-index`: pinned index explaining what was preserved.
- Existing channels: move here only after owner approval.

### WTF Lobby

- `welcome`: server entry, WTF links, Dicksword explanation.
- `rules`: conduct, anti-scam, wallet-safety guidance.
- `announcements`: staff-only post channel.
- `account-linking`: instructions for OAuth and `/wtf prove`.
- `help-desk`: support for WTF, wallet, and Discord issues.

### Gameshow Floor

- `live-stage`: Discord stage/voice mirror for active shows.
- `green-room`: contestant prep.
- `audience-chat`: public show chatter.
- `contestant-check-in`: proof of attendance and show logistics.
- `event-feed`: bot-posted upcoming events from WTF calendar mirror.

### Tezos Social

- `token-talk`: WTF token and Tezos discussion.
- `objkt-gallery`: collector/showcase posts.
- `auctions`: auction announcements and discussion.
- `lotteries`: game and lottery announcements.
- `cross-community-intros`: space for other Discord communities to connect.

### Dicksword Lab

- `avatar-customizer`: paper-doll avatar previews and asset drops.
- `bot-commands`: safe place to run `/wtf` commands.
- `xp-log`: bot summary of XP-ready and awarded activity.
- `feedback`: microapp/server feedback.

### Staff Ops

- `bot-log`: bot diagnostics and dry-run role-sync output.
- `sync-review`: role and account sync review.
- `manual-claim-review`: collision and disputed proof handling.
- `role-review`: protected role mapping decisions.

## Suggested Role Families

The following are labels only until real Discord role IDs are provided in env or
Dicksword admin mappings.

- `WTF Contestant`: synced from active season contestant roster.
- `WTF Cohost+`: synced from cohost/host/admin/resident wizard profiles.
- `WTF Regular`, `WTF Veteran`, `WTF Show Icon`: XP-title roles prepared for a
  later XP role connector.
- `Avatar Artist`: manual/community title for people contributing layer PNGs.
- `Auction Goblin`, `Lottery Gremlin`, `Stage Ghost`: custom titles that can be
  mapped later without changing WTF account roles.

Protected role examples:

- Discord `Administrator`
- Discord `Moderator`
- WTF `Admin`
- WTF `Host`
- WTF `Cohost`

## Slash Commands

- `/wtf link`: shows OAuth and proof-code instructions.
- `/wtf prove <code>`: links this Discord account to a WTF account through the
  short-lived Dicksword code.
- `/wtf profile`: shows linked WTF role, handle, and summary.
- `/wtf xp`: shows XP and tier.
- `/wtf avatar`: shows selected avatar layers.
- `/wtf calendar`: shows upcoming WTF mirrored events.

## Launch Checklist

1. Fill WTF app `.env.example` Discord/Dicksword values in the real env.
2. Fill bot `.env.example` values in the real bot env.
3. Register slash commands with `npm run register-commands`.
4. Run the bot with `DICKSWORD_ROLE_SYNC_DRY_RUN=true` and inspect logs.
5. Add protected role IDs before any live role sync.
6. Explicitly approve changing `DICKSWORD_ROLE_SYNC_DRY_RUN=false`.
