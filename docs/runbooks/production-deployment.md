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

Adrift ([source issue](https://github.com/Paulwhoisaghostnet/Neon-experiments/issues/3)) and Before the Shovels ([source issue](https://github.com/JoshuaFarnworth/TheOrangeGhostisClyde/issues/7)) are public static sites, independent of the wtfOS app router. The default host bundles are `demos/adrift/index.html` and `demos/bts/index.html` in this checkout. The Compose Caddy service binds each directory read-only at `/srv/demos/adrift` and `/srv/demos/bts`. If the bundles live elsewhere on the server, set `WTFOS_ADRIFT_DEMO_HOST_DIR` and `WTFOS_BTS_DEMO_HOST_DIR` to those existing directories before the normal deploy. Missing directories cause Caddy startup to fail instead of silently serving empty pages.

Both exact Caddy hostnames use automatic HTTPS. The existing Cloudflare wildcard DNS covers the two subdomains; Caddy manages the origin certificates through its existing ACME storage and port 80 challenge path. No separate Cloudflare origin certificate or DNS challenge is configured for these hosts. Before promotion, verify both `index.html` files are present in the source commit or in the configured mounted directories.

The room preflight can intentionally defer the release while a coLILseum room is open. GitHub can still label that workflow run successful because the deferral exits zero and skips packaging, server replacement, and health check. Inspect the deploy job's step conclusions and the live `version.commitRef`; a green run alone is not proof of deployment. Keep the room guard in place, wait for its safe state, then dispatch the current `main` workflow again. The protected Duel route is carried from the tracked Caddyfile into the verified startup Caddyfile by `scripts/server-deploy.sh` during normal replacement.

After an eligible deploy, verify each host at the origin and through Cloudflare, then reload each page in a browser and confirm that its `?hash=` query parameter changes and the art still renders. Confirm that neither demo exposes mint or purchase controls:

```bash
curl -fsSI https://adrift.wtfos.app/
curl -fsSI https://bts.wtfos.app/
```

On the Hetzner host, `curl --resolve adrift.wtfos.app:443:127.0.0.1 https://adrift.wtfos.app/` (and the corresponding `bts.wtfos.app` command) checks the origin certificate and static response directly, independent of Cloudflare.

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
