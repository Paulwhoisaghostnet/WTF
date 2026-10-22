# Deployment disk recovery — 2026-10-22

Scope: restore the existing deployment disk requirement and remove a measured duplicate image layer. No disk-floor reduction, paid disk expansion, volume/data deletion, historical-log or backup removal, or direct Docker metadata edits were performed.

## Reproduced failure

[Deploy run 39846715345](https://github.com/Paulwhoisaghostnet/WTF/actions/runs/39846715345), commit `e266b0daa54b73e05e0b53cc304e99ea6fca45e7`, passed image build steps but failed at `2026-10-22T20:17:55Z` writing its temporary Compose build metadata file with `no space left on device`. Export and unpack had completed. The application replacement step had not run; public readiness continued to report healthy commit `7167ca37`.

The previous npm-only cache recovery had left 12345 MiB free, above the existing 12288 MiB floor. That was insufficient for this full export. After the failure, filesystem free space recovered to approximately 7884 MiB; inode usage was only 24%, identifying byte capacity rather than inode exhaustion.

`docker history` measured a **1.46 GB** layer created solely by the late `mkdir ... && chown -R node:node /app` instruction. Other observed layers included the runtime npm/Playwright install at 1.83 GB, `dist` at 291 MB, and `public` at 254 MB. The duplicate ownership layer took 62.7 seconds; export/unpack took 108 seconds. Docker still reported 36 old non-reclaimable build-cache records totaling 12.36 GB, with no active build.

## Narrow correction

The Dockerfile now assigns ownership while creating the runtime dependency layer, uses `COPY --chown=node:node` for runtime application files, and creates writable mount directories with `install -d -o node -g node`. It preserves node ownership of `/app`, its dependencies, application files, and writable directories while avoiding a later copy of the complete application into another layer. Dependency versions, application contents, entrypoint behavior, and the deployment disk floor are unchanged.

## Recovery boundary and measurements

Under the existing `/tmp/wtf-app-deploy.lock`, the following completed but unused failed-build candidates were verified not to be referenced by any container and removed through `docker image rm`, without force:

- App: `sha256:7a941706e114b1ee88555437e236423e23825a5d1f31fa13f28207a093a36621`.
- Caddy: `sha256:ea57e1789920011c9d18e9510e301e4cdc5a15589de1964fbc0bfb25e361c78c`.

The ordinary `docker builder prune -af` subsequently reclaimed 0 B. No active image or persistent volume was removed.

| Measurement | KiB |
| --- | ---: |
| Free before removal | 8073336 |
| Free after removal | 14446780 |
| Recovered | 6373444 |
| Existing required floor | 12582912 |

The resulting **14109 MiB free** exceeds both the existing floor and the earlier failed build's starting space. The source correction additionally removes the observed 1.46 GB duplication; successful rebuilt-image export remains the decisive verification.

Before/after inspection of `wtf-app-app-1`, `wtf-app-caddy-1`, and `wtf-app-postgres-1` compared complete container IDs, image IDs, running states, and restart counts byte-for-byte: unchanged. Public `/api/health/ready` returned `ready` at commit `7167ca37` after cleanup. The lock was released before the separate installer-environment activation.

## Verification status

On Node 22.23.4, deploy dry-run, supply-chain, and Docker build-context policies passed **15/15**. Environment inventory generation and `env:inventory:check` passed; the generated inventory was current. `git diff --check` passed.

**Pending:** the normal new deployment must export successfully, then verify the rebuilt image's layer size and node ownership, actual runtime, and matching live commit. This receipt does not claim that cleanup alone completes deployment.
