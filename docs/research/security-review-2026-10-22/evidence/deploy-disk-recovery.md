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

## Completed normal deployment and live image proof

The preceding pending checks passed on 2026-10-22. [Normal deploy 39848495495](https://github.com/Paulwhoisaghostnet/WTF/actions/runs/39848495495) completed successfully for `c21e4aa7fb02ecf17c436c66292299728171f09a`, including export, activation, and health checks.

| Measured live result | Value |
| --- | --- |
| Running app image | `sha256:5185e3df5518f7ec94fd2a152bdbd21aa2d50ceafa6371e9721a335519c2a851` |
| Container start | `2026-10-22T20:27:55.746666899Z` |
| Runtime | Node `v22.23.4` |
| Application process identity | Node UID 1000 / GID 1000; PID 1 `tini` remains root as designed |
| Container state | Running, healthy, restart count 0 |
| Docker image-list disk usage | 4.68 GB; failed predecessor reported 6.63 GB |
| Docker image-inspect `Size` | 1306423399 bytes; recorded separately from image-list disk usage |
| Final mount-directory layer | 45.1 kB, replacing the old 1.46 GB late recursive ownership layer |
| Free filesystem space after deployment | 14528228 KiB |

Live `stat` verified UID/GID **1000:1000** for `/app`, both package manifests, `node_modules`, `dist`, `public`, `server`, `shared`, `contracts`, `scripts`, and every present requested writable directory (`cache`, `cache/tv`, `uploads`, `uploads/studio`, `uploads-staging`, `tmp-processing`, `backups`, `wtfiap-data`). A read-only permissions check executed as `node` confirmed read/traverse/write permissions on those directories and read/write permission on both manifests. No files were written for this check.

The existing `/app/cache` bind mount masks the image's precreated contents; its persisted directory currently has no `gm-nfts` child. The child remains present in the image's recorded directory-creation instruction. Verification did not create or alter persisted cache data.

Actual running-image history shows ownership in the dependency-install layer and `COPY --chown=node:node` instructions, with no separate late recursive `/app` chown layer. Local and public `/api/health/ready` returned `ready`, commit `c21e4aa7`, and successful database, chain, and jobs checks at `2026-10-22T20:28:32.343Z`. This completes the normal-build/export, ownership, runtime, and live-commit proof for the disk correction.
