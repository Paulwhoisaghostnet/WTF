# Pasta WTF.ME Live Publish Runbook

Purpose: publish the final Pasta Protocol public WTF.ME proof host without bypassing account ownership, wallet, PDS, pinning, TLS, or public collector-path checks.

This runbook is the safe next step after `npm run pasta:live-readiness:final` proves every non-WTF.ME Pasta surface and exits only on the dedicated WTF.ME credential/host blockers.

## Required Inputs

- A dedicated Pasta WTF.ME account or explicitly approved proof account.
- A claimed or claimable `<host>.wtfos.me` that is meant to serve only Pasta proof pages.
- An active WTFOS DID/repo or linked Bluesky DID target for the account.
- A linked Tezos wallet.
- WTF Pin Collector permission (`use_wtfos_pinning`).
- Local-only credentials through `PASTA_WTFME_LIVE_COOKIE` or `PASTA_WTFME_LIVE_USERNAME` plus `PASTA_WTFME_LIVE_PASSWORD`.

Do not commit credentials, print credential values, or add them to production env files just to satisfy this publish path. The publisher defaults to `https://wtfos.app`.

## Dry-Run and Inventory

Bind every credentialed check to the intended public host before publishing:

```sh
export PASTA_WTFME_LIVE_HOST=<host>.wtfos.me
export PASTA_WTFME_LIVE_EXPECT_HOST=<host>.wtfos.me

npm run pasta:wtfme:live-inventory
PASTA_WTFME_LIVE_PUBLISH=0 PASTA_WTFME_LIVE_VERIFY_AFTER_PUBLISH=0 npm run pasta:wtfme:live-publish
npm run pasta:live-readiness:final
```

The final command should still fail before publish, but only on missing public host proof. If inventory reports missing wallet, DID/repo, permission, site readiness, or host mismatch, fix that product/account state first.

## Publish

Run the write path only after the dry-run resolves to the expected host:

```sh
PASTA_WTFME_LIVE_PUBLISH=1 npm run pasta:wtfme:live-publish
```

The publisher must:

- Save Pasta landing, mint, and collection pages.
- Publish the WTF.ME site.
- Confirm the production TLS allow endpoint accepts the host.
- Publish Pasta pin recovery.
- Run `npm run pasta:wtfme:live-check` against the public host before exiting successfully.

If the publisher refuses to overwrite existing non-Pasta pages, use a dedicated clean proof host or remove the non-target pages through the product path first. Set `PASTA_WTFME_LIVE_OVERWRITE_EXISTING=1` only for an explicitly approved dedicated Pasta proof host.

## Public Verification

After publish, keep pin discovery enabled and run:

```sh
PASTA_WTFME_LIVE_HOST=<host>.wtfos.me npm run pasta:wtfme:live-check
PASTA_WTFME_LIVE_HOST=<host>.wtfos.me PASTA_WTFME_LIVE_MANIFEST_PAYLOAD_URL=<public-manifest-json> npm run pasta:wtfme:live-check
npm run pasta:live-readiness:final
```

The manifest payload URL check should be added when the public object-mirror URL is known. The final readiness gate must pass without `PASTA_LIVE_READINESS_ALLOW_BLOCKERS=1` and without disabling repo-cleanup, static, installer, Colander, or WTF.ME probes.

## Stop Conditions

Stop and do not claim Pasta is live if any of these happen:

- Credentials authenticate to a different host than `PASTA_WTFME_LIVE_EXPECT_HOST`.
- The TLS allow endpoint denies the host.
- Public pages miss `data-pasta-hosted-page` markers.
- `.well-known/wtfos-pins` is missing or points to a non-resolving `app.wtfos.media.pinManifest` record.
- The manifest payload checksum, item counts, item kinds, IPFS CIDs, or object-mirror coordinates fail.
- `npm run pasta:live-readiness:final` exits nonzero after publish.

Do not repair these with direct production database edits. Use the account, WTF.ME publish, PDS, wallet, and pinning product paths so ownership and recovery proofs stay real.
