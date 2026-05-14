# TzKT Upstream Runbook

## Scope

TzKT is the canonical public Tezos indexer for WTF reads. WTF also uses the TzKT-backed mainnet RPC for wallet and server-side chain checks.

Default production endpoints:

- API: `https://api.tzkt.io/v1`
- RPC: `https://rpc.tzkt.io/mainnet`

ECAD RPC endpoints must not be reintroduced.

## Code Ownership

- `server/lib/upstream.ts`: shared retry, timeout, backoff, and TzKT client ownership.
- `server/tzkt.ts`: core token balance/transfer helpers and persistent hot-route cache.
- `server/lib/contract-config.ts`: runtime chain/contract config used by `/api/health`.
- `server/lib/wallet-events.ts`: wallet event sync cursor ownership.
- `server/lib/contract-metadata-sync.ts`: contract metadata polling.
- `server/lib/backfill-handlers.ts`: bounded TzKT backfill handlers.

New server-side TzKT callers must use shared upstream helpers instead of raw `fetch()` loops or local base URLs.

## Normal Verification

Run the policy and helper tests after changing TzKT behavior:

```bash
npx tsx --test server/tzkt-policy.test.ts server/tzkt-kernel-policy.test.ts server/tzkt-persistent-cache-policy.test.ts server/tzkt-cursor-pagination.test.ts server/lib/upstream.test.ts
npm run check -- --pretty false
npm run test:e2e:inventory:coverage
```

After deploy, verify production health:

```bash
curl -fsS https://wtfgameshow.app/api/health
```

The live response must report:

- `chain.ok: true`
- `chain.network: mainnet`
- `chain.tzktBase: https://api.tzkt.io/v1`
- `chain.tezosRpcUrl: https://rpc.tzkt.io/mainnet`
- `jobs.ok: true`
- `jobs.issues: []`

## Failure Response

If TzKT returns 429 or transient 5xx responses:

1. Confirm callers are using `server/lib/upstream.ts` so retry/backoff and timeout behavior applies.
2. Check `/api/health` job summaries for stuck or failing sync jobs.
3. Serve cached DB/persistent-cache data where the route already supports it.
4. Reduce new fanout before increasing intervals or adding new jobs.
5. Do not add another public indexer or RPC as a silent fallback unless the health response and docs name the new provider.

If the RPC endpoint fails:

1. Confirm `TEZOS_RPC_URL` on the host is not ECAD.
2. Confirm `/api/health` reports the failing value.
3. Patch the runtime config, deploy through GitHub Actions, and verify the live health response.

## Cache Rules

Hot-route TzKT caches must be bounded, expiring, and safe to serve stale only where product behavior accepts stale reads. Writes, rewards, marketplace verification, and user-value decisions must not claim success from stale cache alone.
