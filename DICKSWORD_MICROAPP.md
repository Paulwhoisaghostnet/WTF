# Dicksword Microapp

Dicksword is the WTF desktop surface for Discord identity, Discord-native
participation, avatar composition, and safe role-sync preparation.

## Environment To Fill

WTF app:

```bash
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_GUILD_ID=1375286181079810058
WTF_BOT_WEBHOOK_SECRET=
DICKSWORD_INVITE_URL=
DICKSWORD_CLAIM_TTL_MS=600000
DICKSWORD_PROTECTED_ROLE_IDS=
DICKSWORD_AVATAR_UPLOAD_DIR=/app/uploads/dicksword
DICKSWORD_AVATAR_MAX_BYTES=2000000
```

Bot:

```bash
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=1375286181079810058
DISCORD_CONTESTANT_ROLE_ID=
DISCORD_STAFF_ROLE_ID=
DICKSWORD_PROTECTED_ROLE_IDS=
DICKSWORD_ROLE_SYNC_DRY_RUN=true
WTF_WEBHOOK_BASE_URL=
WTF_BOT_WEBHOOK_SECRET=
```

`WTF_BOT_WEBHOOK_SECRET` must match in both environments.

## Identity Flows

OAuth:

1. User logs into WTF.
2. User opens `Dicksword`.
3. User clicks `Connect Discord OAuth`.
4. Existing Passport Discord flow links `users.discord_id`.

Proof code:

1. User logs into WTF.
2. User opens `Dicksword` and generates a proof code.
3. User runs `/wtf prove <code>` in Discord.
4. Bot signs the claim to `/api/dicksword/bot/proof`.
5. WTF links the Discord ID and attaches pending Discord activity/attendance.

## Avatar Layer Rules

- Use PNG assets with transparent backgrounds.
- Add one base layer before accessories.
- Lower `stack_order` renders first; higher order renders above it.
- Add conflicts for mutually exclusive pieces, such as two hats or two faces.
- Disable layers instead of deleting them when they have already been used.

## Adding Avatar Assets Over Time

The app includes a public skeleton at:

```text
public/dicksword/avatar-assets/
```

At runtime those files are available under:

```text
/dicksword/avatar-assets/
```

Recommended drop folders are `base`, `hair`, `face`, `clothes`,
`accessories`, and `effects`. Add PNGs whenever they are ready, then open the
Dicksword admin panel and register each layer with its public URL, stack order,
and conflicts. The included `manifest.example.json` is only a planning aid; the
live app uses database records so assets can arrive gradually.

## What Is Not Live Yet

- No code in this change mutates Discord channels/categories.
- Role sync defaults to dry-run in the bot env template.
- Avatar file upload storage is reserved by env for a later direct-upload flow.
  The current admin pathway registers asset URLs, including local public URLs
  from the skeleton folder.

## Discord Bot Extension

The Discord bot source now lives in the WTF repo at:

```text
extensions/wtf-gameshow-bot/
```

Deploy it with the `Deploy Discord bot extension to Hetzner` GitHub workflow.
The service runs from `/opt/platform/repos/wtf-app/extensions/wtf-gameshow-bot`
and keeps its production secrets in `/srv/wtf-gameshow-bot/.env`.
