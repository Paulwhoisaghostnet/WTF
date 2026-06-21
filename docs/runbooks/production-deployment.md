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
