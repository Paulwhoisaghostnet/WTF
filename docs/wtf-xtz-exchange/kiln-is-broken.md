# Kiln Gap Report

This is not a fake deployment success report.

## Current Confirmed Kiln Facts

- `https://kiln.wtfgameshow.app/api/kiln/capabilities?networkId=tezos-shadownet` responded `200` and reported Shadownet chain id `NetXsqzbfFenSTS`.
- An unauthenticated mutation request to `/api/kiln/workflow/run` responded `401 Unauthorized`.
- This local environment does not have `KILN_API_TOKEN`, so protected Kiln workflow/deploy routes cannot be used from here.

## Payable Entrypoint Gap

The local Kiln API schema inspected at `../building/shadownet kiln/src/lib/api-schemas.ts` has:

- `/api/kiln/execute`: `contractAddress`, `entrypoint`, `args`, `wallet`
- `/api/kiln/e2e/run`: `steps[].entrypoint`, `steps[].args`, `steps[].wallet`

Neither schema includes a tez/mutez amount field. The runtime implementation calls Taquito `.send()` without an amount. That means Kiln’s post-deploy execution API cannot create this exchange listing, because `create_listing` is intentionally payable and rejects zero escrow.

## Required Workaround

- Use Kiln for compile/audit/workflow/deployment once `KILN_API_TOKEN` is available.
- Use `scripts/wtf-xtz-exchange/e2e-shadownet.ts` with Taquito for payable `create_listing` and full swap/cancel E2E.

## Current Blockers

- Missing `KILN_API_TOKEN`.
- Missing deployed Shadownet contract addresses.
- Missing funded Shadownet secret keys for listing owner/admin and taker.

