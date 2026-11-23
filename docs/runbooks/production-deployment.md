# Production Deployment Runbook

## Scope

This runbook covers the live `wtfos.app` deployment from the correct repo:

```bash
/Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/WTF combo/WTF
```

Production is a Docker Compose app on Hetzner, deployed by GitHub Actions from `main`.

## Preflight

1. Confirm the correct remote and branch.

```bash
git status --short --branch
git remote -v
```

The remote must be `https://github.com/Paulwhoisaghostnet/WTF.git`. Wrong-repo or stale dirty branches are reference-only and must not be bulk imported.

2. Confirm local gates for the slice.

```bash
npm run check -- --pretty false
npm run build
npm run test:e2e:inventory:coverage
```

Run `npx playwright test tests/playwright/inventory` when routes, app shells, admin surfaces, inventory handles, or workflow wiring changed.

3. Confirm no private secrets or exploit details are staged.

```bash
git diff --cached --name-only
git diff --check
```

## Deploy

Push the reviewed commit to `main`:

```bash
git push origin HEAD:main
```

Watch both workflow runs:

```bash
gh run list --branch main --limit 5
gh run watch <quality-run-id> --exit-status
gh run watch <deploy-run-id> --exit-status
```

`Quality Gates` must pass typecheck, build, inventory coverage, inventory Playwright smoke, external link safety, and SmartPy contract tests. `Deploy to Hetzner` must pass its server deploy and health check.

### Clyde static art demos

Adrift ([source issue](https://github.com/Paulwhoisaghostnet/Neon-experiments/issues/3)) and Before the Shovels ([source issue](https://github.com/JoshuaFarnworth/TheOrangeGhostisClyde/issues/7)) are public static sites, independent of the wtfOS app router. The default host bundles are `demos/adrift/index.html`, `demos/bts/index.html`, and the nine-render BTS contact sheet at `demos/bts/contact/index.html` in this checkout. The Compose Caddy service binds each directory read-only at `/srv/demos/adrift` and `/srv/demos/bts`. On BTS, Caddy rewrites exact `/contact` to `/contact/index.html` and paths matching `/(ar/)?<width>x<height>` to `/index.html`, retaining the requested URLs and a 200 response for valid ratios. The renderer validates the numbers; Caddy only recognizes their syntax. If the bundles live elsewhere on the server, set `WTFOS_ADRIFT_DEMO_HOST_DIR` and `WTFOS_BTS_DEMO_HOST_DIR` to those existing directories before the normal deploy. Missing directories cause Caddy startup to fail instead of silently serving empty pages.

Both exact Caddy hostnames use automatic HTTPS. The existing Cloudflare wildcard DNS covers the two subdomains; Caddy manages the origin certificates through its existing ACME storage and port 80 challenge path. No separate Cloudflare origin certificate or DNS challenge is configured for these hosts. Before promotion, verify both `index.html` files are present in the source commit or in the configured mounted directories.

The room preflight can intentionally defer the release while a coLILseum room is open. GitHub can still label that workflow run successful because the deferral exits zero and skips packaging, server replacement, and health check. Inspect the deploy job's step conclusions and the live `version.commitRef`; a green run alone is not proof of deployment. Keep the room guard in place, wait for its safe state, then dispatch the current `main` workflow again. The protected Duel route is carried from the tracked Caddyfile into the verified startup Caddyfile by `scripts/server-deploy.sh` during normal replacement.

After an eligible deploy, verify each host at the origin and through Cloudflare, then reload each page in a browser and confirm that its `?hash=` query parameter changes and the art still renders. Check BTS `/contact`, `/ar/9x16`, `/4x5`, and `/2x3` as well. Confirm that neither demo exposes mint or purchase controls:

```bash
curl -fsSI https://adrift.wtfos.app/
curl -fsSI https://bts.wtfos.app/
```

On the Hetzner host, `curl --resolve adrift.wtfos.app:443:127.0.0.1 https://adrift.wtfos.app/` (and the corresponding `bts.wtfos.app` command) checks the origin certificate and static response directly, independent of Cloudflare.

### Static-only preview without app replacement

Use `scripts/deploy-clyde-static-demos.mjs` when the art bundles are ready but the app should not be replaced. The script does not reset Git, rebuild the app, restart any container, change the protected Duel gateway, or change the current lobby reader. It copies validated art bundles into a versioned directory under Caddy's existing persistent `/data` volume and appends exact-host file-server routes to the **running Caddy JSON**. The live on-disk Caddyfile currently lacks a runtime-only coLILseum lobby-reader route, so loading that file or recreating Caddy from it would remove the route.

Prepare BTS from the checked source only after its `contact/index.html`, nine renders, and aspect route bootstrap are present. `prepare` reads the live runtime, container identities, and the exact saved-room deploy guard. It can produce a reviewable plan while the guard is `deferred`; it changes no running Caddy config. Use a fresh path outside the Git checkout for each plan:

```bash
clyde_state_dir="$HOME/clyde-bts-plan-$(date +%Y%m%dT%H%M%S)"
node scripts/deploy-clyde-static-demos.mjs prepare --ssh wtf --site bts --state-dir "$clyde_state_dir"
node scripts/deploy-clyde-static-demos.mjs apply --state-dir "$clyde_state_dir"
node scripts/deploy-clyde-static-demos.mjs verify --state-dir "$clyde_state_dir"
```

After Adrift's checked source revision is ready, run the same three commands with `--site adrift` and a different new state directory. Each `prepare` captures the latest running JSON, so the Adrift plan retains an already active BTS route. The plan snapshots the bundle and the saved-room scanner, hashes every file, adapts the checked Caddy site block with the running Caddy binary, and proves that removing the new routes from its candidate yields the exact original JSON. `apply` uses the ordinary `/tmp/wtf-app-deploy.lock`; it aborts if Caddy, app, Duel authority, gateway, lobby reader, app commit, or runtime config changed since preparation. It runs the same saved-room guard used by production deployment before staging and again immediately before reload; exit 75 (`deferred`) blocks the reload. It stages files, validates the candidate, reloads through Caddy's admin API, and checks both origin and Cloudflare HTTPS/HTML responses only when the guard is safe. BTS verification includes exact `/contact` and representative aspect routes `/ar/9x16`, `/4x5`, and `/2x3`. Browser verification must still confirm different `?hash=` values on successive root-page and aspect-route reloads and that no mint or purchase control appears.

`apply` reports `verified` only when origin and Cloudflare checks pass. If its reload succeeded but ACME or the edge is still catching up, it reports `active_host_verification_pending`; the configuration stays active and the command does not present that pending state as a failed reload. Rerun `verify` after checking Caddy's certificate logs, and require its `verified` result before calling the host live. To restore the exact captured runtime JSON, use:

```bash
node scripts/deploy-clyde-static-demos.mjs rollback --state-dir "$clyde_state_dir"
```

Rollback refuses to overwrite a Caddy config changed by another operator, checks the saved-room guard before its own reload, and leaves the inert versioned bundle in `/data`. Caddy's default reverse proxy closes existing WebSockets when its config unloads; adding `stream_close_delay` to a new config cannot protect connections held by the current old handler. The saved-room guard is the project's prerequisite for any proxy reload, and it currently defers while a room is open. A scan immediately before reload still cannot close the race with a newly created room or prove that unrelated app WebSockets are absent. For a strict no-disconnect release while rooms remain open, host these new domains on an independent static origin or edge route instead of reloading this Caddy process; otherwise coordinate a drained admission window and rerun the guard. The current Caddy container starts from `/etc/caddy/Caddyfile`, so a later container restart would lose this temporary runtime-only preview and the existing runtime-only lobby route. If restart durability is required after the room clears, first verify the autosaved JSON, then use a separately reviewed Caddy-only Compose override with `command: ["caddy", "run", "--resume"]` and `up -d --no-deps --no-build --force-recreate caddy`; this interrupts proxy connections briefly while retaining the app and Duel processes and certificate volumes. When the room guard clears, promote the committed demo bundles through the normal main deploy and verify its exact live commit.

## Live Verification

Verify the deployed commit and readiness:

```bash
curl -fsS https://wtfos.app/api/health
```

Required live health fields:

- `status` / `ok`: healthy.
- `version.commitRef`: the commit just pushed.
- `db.ok`: true.
- `chain.ok`: true.
- `chain.network`: `mainnet`.
- `chain.tzktBase`: `https://api.tzkt.io/v1`.
- `chain.tezosRpcUrl`: `https://tezos-mainnet.octez.io/`.
- `jobs.ok`: true.
- `jobs.recentErrors`: 0 unless there is a known, documented transient.

Verify security headers when the slice touches browser, wallet, embed, or media boundaries:

```bash
curl -fsSI https://wtfos.app
```

For wallet slices, `content-security-policy` must include explicit `frame-src` and `child-src`; wallet frames must not fall back to `default-src`.

## Rollback Posture

Prefer a forward fix or a normal revert commit pushed to `main`. Do not use destructive local commands such as `git reset --hard` or host-side manual file edits unless the owner explicitly requests emergency surgery.

If production health fails after deploy:

1. Capture the failed workflow logs.
2. Capture `/api/health`.
3. Identify whether the failure is deploy, DB, chain/upstream, job readiness, or browser header/runtime.
4. Revert or patch in the live repo, run local gates, and push through the same Actions path.
