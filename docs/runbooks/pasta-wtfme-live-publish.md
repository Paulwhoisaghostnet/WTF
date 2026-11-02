# Pasta WTF.ME hosted-page and pin-discovery proof

This runbook operates the existing Shadownet Pasta proof pages on a **dedicated** `*.wtfos.me` host. It is not a Mainnet sale or a production Pasta launch. The source of the pages is `server/features/wtf-sites/pasta-hosting.ts`; the guarded writer is `scripts/pasta-protocol/wtfme-live-publish.ts`. Keep account credentials outside Git, logs, and shared shell transcripts.

## Establish the account and host

Use an account whose candidate host is reserved for Pasta. The `pasta` username was unclaimed in a public lookup on 2026-10-30; verify availability again when the owner establishes the account and its social identity. The account must have a linked Tezos wallet, an OAuth social identity, an active WTFOS DID/repo or linked Bluesky DID, and WTF Pin Collector permission (`use_wtfos_pinning`, supplied by the `wtf_pin_collector` role). The pin registry also needs an active PDS/repo pin home before recovery can be published. Do not use an existing personal site with unrelated pages as a shortcut.

As checked on 2026-10-30, the live WTFOS PDS was healthy but self-service repo provisioning reported `provisioningEnabled:false`. A linked Bluesky DID can make the page host claimable, but it does not by itself create the WTFOS repo required by pin recovery. After creating the dedicated WTF account and obtaining its numeric user ID, the release operator can set `WTFOS_PDS_PROVISIONING_ALLOWED_USER_IDS` to that exact ID in the private server runtime environment, deploy the scoped provisioning policy, and verify `GET /api/tz2at/pds/status` reports `provisioningEnabled:true` for that account. Then the account can request its WTFOS PDS offering through the normal authenticated flow. Keep `WTFOS_PDS_PROVISIONING_ENABLED` unset unless a separate public rollout is approved. Confirm PDS health and the account's active repo in the read-only inventory before publishing pin recovery.

Supply either `PASTA_WTFME_LIVE_COOKIE` or both `PASTA_WTFME_LIVE_USERNAME` and `PASTA_WTFME_LIVE_PASSWORD` from the private credential store in the operator environment. Do not write them to the repository. The scripts target `https://wtfos.app` by default. Set `PASTA_WTFME_LIVE_EXPECT_HOST` to the exact dedicated candidate host before any write. The publisher rejects a missing expected host in publish mode and rejects a host change after publication.

## Read-only preflight

1. Run `npm run pasta:wtfme:live-inventory` with the credentials and `PASTA_WTFME_LIVE_EXPECT_HOST` supplied. Review `candidateHost`, `pagePublishChecks`, `pinRecoveryChecks`, and `currentPublicDiscovery`. `pagePublishReady` must pass before page publication. An unpublished site can make `pinRecoveryPublishReady` false until the pages are published; check its individual pin-home and permission results before writing.
2. Run `npm run pasta:wtfme:live-publish` with `PASTA_WTFME_LIVE_PUBLISH` unset. This authenticates, checks the exact host and existing content, and describes the intended pages and pin manifest without writing. Resolve any eligibility or existing-content error before proceeding. The normal guard refuses unrelated pages and non-Pasta page replacements. Do not set `PASTA_WTFME_LIVE_OVERWRITE_EXISTING=1` to make a personal site pass.
3. Run `PASTA_LIVE_READINESS_ALLOW_BLOCKERS=1 npm run pasta:live-readiness` to record the other live release checks. It forces the publisher into dry-run mode and does not publish.

## Publish the dedicated proof host

With the preflight accepted and the expected host pinned, run `PASTA_WTFME_LIVE_PUBLISH=1 npm run pasta:wtfme:live-publish` in the credentialed environment. The writer claims the host if needed, saves the Pasta home/mint/collection pages, publishes the site, checks the production TLS gate, publishes Pasta pin recovery, and runs the public verifier. Its default `PASTA_WTFME_LIVE_PUBLISH_PINS=1` and `PASTA_WTFME_LIVE_VERIFY_AFTER_PUBLISH=1` should remain enabled for a complete proof.

Publication is a sequence of external writes, not one atomic transaction. If it stops after a page or site write, retain the returned host and version, inspect the current site and pin registry with `npm run pasta:wtfme:live-inventory`, and reconcile the exact state before any retry. Do not claim a passing host or pin proof from a successful page write alone.

## Verify and record the result

Run `PASTA_WTFME_LIVE_HOST=<published-host> npm run pasta:wtfme:live-check` with pin and pin-record checks enabled. Record the host, published site version, public `/.well-known/wtfos-pins` URL, manifest URI, and the verifier output without recording credentials. Then rerun `npm run pasta:live-readiness` with the same host and credentials. Its repo audit and every other required release check must pass independently; a hosted Shadownet proof does not establish Mainnet payment, fulfillment, installer signing, or recovery readiness.
