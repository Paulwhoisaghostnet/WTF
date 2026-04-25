# WTF Gameshow Discord bot

Lightweight Node 22 / discord.js v14 bot that fans WTF server state out to
Discord and fans Discord presence back into WTF. Runs as a native `systemd`
service on the same Hetzner host as the WTF app and Shadownet Kiln.

This extension lives inside the WTF app repo at
`extensions/wtf-gameshow-bot`. The Hetzner service builds and runs from that
path so the web app, Dicksword API, and Discord bot ship from one repository.

## Responsibilities

| Area                 | Direction     | Notes                                                  |
| -------------------- | ------------- | ------------------------------------------------------ |
| Calendar mirror      | WTF → Discord | Polls `GET /api/discord/mirrors/upcoming`, creates/updates/cancels Discord scheduled events, PATCHes the resulting id back. |
| Voice/stage attendance | Discord → WTF | `voiceStateUpdate` + 60s heartbeats sign to `POST /api/attendance/voice-state`. |
| Role sync            | WTF → Discord | Reconciles `DISCORD_CONTESTANT_ROLE_ID` and `DISCORD_STAFF_ROLE_ID` from `POST /api/discord/role-sync/pull`. |
| `/wtf` slash command | Discord       | `/wtf calendar`, `/wtf link`, `/wtf prove`, `/wtf profile`, `/wtf avatar`, `/wtf xp`, `/wtf whoami`. |

The bot is strictly a courier — every write goes to the WTF server so the
Control Board audit log sees every action.

## HMAC protocol

Every outbound WTF call is signed:

```
x-wtf-timestamp: <unix-millis>
x-wtf-signature: sha256=<hex>     # HMAC_SHA256(secret, `${ts}.${body}`)
```

Secrets must be in sync across environments:

- WTF server `.env`: `WTF_BOT_WEBHOOK_SECRET=...`
- Bot `.env`:        `WTF_BOT_WEBHOOK_SECRET=...`

Requests older than 5 minutes are rejected by the WTF server (see
`WTF/server/lib/webhook-hmac.ts`).

## Local development

```bash
nvm use            # picks up .nvmrc (Node 22)
cp .env.example .env
# fill in DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, WTF_WEBHOOK_BASE_URL, secrets
npm install
npm run register-commands      # one-time per guild / per command-tree change
npm run start:dev
```

## Production (Hetzner, native systemd)

1. DNS / secrets: ensure `HETZNER_HOST`, `HETZNER_USER`, `HETZNER_SSH_KEY`,
   and `HETZNER_KNOWN_HOSTS` are set on the WTF repo's GitHub environment.
2. First-time only: run the `Deploy Discord bot extension to Hetzner` workflow
   with `mode=provision`. This installs Node 22, creates `wtfbot`, and drops
   the systemd unit.
3. SCP `.env` once:
   ```
   scp .env root@<host>:/srv/wtf-gameshow-bot/.env
   ssh root@<host> chown wtfbot:wtfbot /srv/wtf-gameshow-bot/.env
   ssh root@<host> chmod 600 /srv/wtf-gameshow-bot/.env
   ```
4. Every subsequent bot change: run `mode=deploy` to build from
   `/opt/platform/repos/wtf-app/extensions/wtf-gameshow-bot` and restart.

## Operator runbook

- **Check health:** `systemctl status wtf-gameshow-bot.service`.
- **Tail logs:** `journalctl -u wtf-gameshow-bot.service -f`.
- **Re-register commands:** `cd /opt/platform/repos/wtf-app/extensions/wtf-gameshow-bot && sudo -u wtfbot npm run register-commands`.
- **Rotate webhook secret:** update `.env` on both host and WTF server, then
  restart both services — the HMAC is 5-minute-skew-tolerant so a brief
  restart overlap is fine.

## Files

```
src/
  index.ts                      boot + wiring
  commands/wtf.ts               /wtf slash command tree
  events/voice-attendance.ts    voiceStateUpdate + heartbeat loop
  events/calendar-mirror.ts     WTF calendar → Discord scheduled events
  events/role-sync.ts           optional WTF roster → Discord role membership
  lib/env.ts                    zod-validated configuration
  lib/logger.ts                 structured JSON logger
  lib/wtf-client.ts             signed fetch helper
  scripts/register-commands.ts  one-off slash-command upsert
infrastructure/systemd/wtf-gameshow-bot.service
scripts/server-provision.sh     first-time host setup
scripts/server-deploy.sh        pull + build + restart
../../.github/workflows/deploy-discord-bot.yml  manual provision/deploy entry point
```
