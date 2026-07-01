# Pasta Protocol WTF.ME Hosted Page Report

- Status: PARTIAL
- Timestamp: 2026-07-01
- Production focus: `https://wtfos.app`
- Intended host: `wtf-admin.wtfos.me`
- Network: Tezos Shadownet
- Chain id: `NetXsqzbfFenSTS`

## Result

- Deterministic Pasta WTF.ME page snapshots now exist for landing, mint, and collection pages.
- The snapshots use the current signer-backed Shadownet proof contracts and relationship groups from the Pasta readiness matrix.
- The local WTF.ME harness proof publishes those pages through mocked `/api/wtf-sites/*` APIs, then serves them from `http://wtf-admin.wtfos.me:<HARNESS_PORT>` with user-site CSP and COOP headers.
- Production is not yet live-ready: `npm run pasta:wtfme:live-check` fails because `https://wtfos.app/internal/tls/allow?domain=wtf-admin.wtfos.me` returns HTTP 403 `handle not registered`.

## Contracts

| App | Contract | Relationship group | Hosted page role |
| --- | --- | --- | --- |
| Spaghetti | `KT1WTFnZAyWqcC2SB32xEjMS4F4cutnGsyVc` | `spaghetti-shadownet-e2e-mr1oc17f` | Collection page |
| Gnocchi | `KT1W2ijLhjRHeH7wWYnvYcDwDsgRM7TpAFZK` | `gnocchi-shadownet-e2e-mr1oadsz` | Mint page |
| Ravioli | `KT194igzFGez1pB3HHhU8HFqyMzMLSLAPskB` | `ravioli-shadownet-e2e-mr1pdpt4` | Landing proof card |
| Rotini | `KT1HqzEFqbwcR8BpXZrrfPALY6bJaPGQgDHQ` | `rotini-shadownet-e2e-mr1q9kcr` | Landing proof card |
| Penne | `KT1EPdyxCjmosesvJ21cr8WqoCnTXoomCpRz` | `penne-shadownet-e2e-mr1reng0` | Landing proof card |
| Lasagna | `KT1TEz2Rq8nUiNcJEAssrdrTqPj1h3ZN9B8r` | `lasagna-shadownet-e2e-mr1srf15` | Landing proof card |

## Verification

- `npx tsx --test server/features/wtf-sites/pasta-hosting.test.ts` passed.
- `npm run pasta:wtfme:live-publish:check` passed.
- `npm run pasta:wtfme:live-inventory:check` passed.
- `npm run test:e2e:inventory:coverage` passed.
- `npm run check -- --pretty false` passed.
- `npm run pasta:shadownet:wtfme` passed after building the app.
- `npm run pasta:wtfme:live-check` failed as expected because the intended production WTF.ME host is not registered.

## Scope

- This proves hosted-page source generation, current-contract fixture freshness, write-gated live publish tooling, read-only live inventory tooling, local user-site serving, wallet-safe user-site headers, page markers, public-view event emission, and inventory ownership for the WTF.ME hosted Pasta path.
- This does not prove that a production WTF.ME host currently serves those pages, that `.well-known/wtfos-pins` resolves for that host, that a real wallet can mint from the live page, or that Pasta artifacts and metadata are pinned/recoverable through wtfOS.

## Next Step

Use `npm run pasta:wtfme:live-inventory` with scoped production credentials to identify the correct claimable or claimed host, then run `PASTA_WTFME_LIVE_EXPECT_HOST=<host> npm run pasta:wtfme:live-publish` in dry-run mode. Only set `PASTA_WTFME_LIVE_PUBLISH=1` after the dry-run confirms the intended host. After publishing, `PASTA_WTFME_LIVE_HOST=<host> npm run pasta:wtfme:live-check` must pass before this gate can move from `PARTIAL` to `PROVEN`.
