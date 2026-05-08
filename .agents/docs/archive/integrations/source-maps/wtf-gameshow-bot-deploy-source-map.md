# WTF Gameshow Bot Deploy Source Map

## Source

- `../building/wtf-gameshow-bot`

## Integrated Targets

- `extensions/wtf-gameshow-bot/infrastructure/hetzner/server-deploy.sh`
- `extensions/wtf-gameshow-bot/infrastructure/hetzner/server-provision.sh`
- `extensions/wtf-gameshow-bot/infrastructure/systemd/wtf-gameshow-bot.service`
- `.github/workflows/deploy-wtf-gameshow-bot.yml`

## Deltas Recorded

- Source deployment cloned and reset a standalone bot repo under `/srv/wtf-gameshow-bot/current`.
- Integrated deployment builds from the WTF app repo extension at `/opt/platform/repos/wtf-app/extensions/wtf-gameshow-bot`.
- Source workflow used `WTF_BOT_REPO_URL`; integrated workflow assumes the WTF app repo is already the deployment root.
- Integrated systemd unit keeps Node/V8 compatible sandboxing by setting `MemoryDenyWriteExecute=false`.
- Legacy `extensions/wtf-gameshow-bot/scripts/*` remain for compatibility; canonical Hetzner copies now live under `infrastructure/hetzner`.
