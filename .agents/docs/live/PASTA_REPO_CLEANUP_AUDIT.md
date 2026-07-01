# Pasta Repo Cleanup Audit

Last audited: 2026-07-01
Auditor: Codex Pasta live-readiness continuation
Production focus: `https://wtfos.app`

## Current Production Authority

- Authoritative production source is `origin/main` at `2c8a34636679ae781d0d7a9919b843d817ce16c8`.
- Live health reports `commitRef: "2c8a346"` and `nodeEnv: "production"`.
- Main Quality Gates run `28480098540` and Deploy to Hetzner run `28480098529` succeeded for commit `2c8a3463`.
- The release evidence branch `codex/pasta-live-readiness` carries Pasta Shadownet evidence commits beyond `origin/main`; it is a proof branch, not the production authority.
- Macaroni Desktop `1.0.0` individual installers are published as release assets and passed public plus authenticated manifest/download verification for macOS, Windows, and Raspberry Pi.
- Pasta Suite Desktop `1.0.0` bundled installers are published as release assets and passed public plus authenticated manifest/download verification for macOS, Windows, and Raspberry Pi.
- Local Macaroni Shadownet puppet proof now passes 5/5 against a disposable Postgres database and `https://tezos-shadownet.octez.io/`, covering trusted-creator defaults, wallet chain safety, wtfOS publish gating, standalone mint-page wallet restore/disconnect, mismatched RPC blocking, and Shadownet Kukai handoff.
- Local Spaghetti Shadownet preflight now passes against `https://tezos-shadownet.octez.io/` and Shadownet TzKT, covering the real RPC chain id, indexer head, contract artifact entrypoints, Colander adapter detection, package metadata, relationship metadata, token metadata, and origination storage payload shape before signer-backed injection.
- Signer-backed Spaghetti Shadownet E2E now passes with keyring wallet `wtf-os-root`, originating `KT1LPXV5b83MU8LsvyVM76YCAH25JtNCBJPH`, creating token 0, minting supply, transferring one edition to collector wallet `arcade-treasury`, and proving TzKT storage/big-map ownership plus token metadata decoding.
- Signer-backed Gnocchi Shadownet E2E now passes with keyring wallets `wtf-os-root` and `arcade-treasury`, originating `KT1FwS1JifrUakeGqFwGYmMHMmfjuwJABaax`, creating token 0, configuring a 1 mutez open-edition sale, collector-minting one edition, and proving TzKT sale, supply, ownership, and metadata big-map state.
- Signer-backed Ravioli Shadownet E2E now passes with keyring wallets `wtf-os-root` and `arcade-treasury`, originating `KT1CeJYHodXy8dvmNFgXxk4zh6SjVB5KYLaG`, creating token 0, minting supply, transferring two editions to the collector, redeeming one edition, and proving TzKT bundle, redeemed, supply, ownership, and metadata big-map state.
- Signer-backed Rotini Shadownet E2E now passes with keyring wallets `wtf-os-root` and `arcade-treasury`, originating `KT1SHHPFkthiSTf9CAmhAzWmbi7t5rTcUeYz`, creating two generated token types, minting one edition of each, transferring one generated edition to the collector, and proving TzKT supply, ownership, relationship metadata, trait attributes, and Rotini DNA state.
- Signer-backed Penne Shadownet E2E now passes with keyring wallets `wtf-os-root` and `arcade-treasury`, originating `KT1DDY9Pyr7PYNJgXxnHnJn9T7WHaVx7ztdx`, creating token 0, loading allocations, completing a collector claim, completing an admin airdrop, closing the claim window, and proving TzKT allocation, claimed, supply, ownership, and metadata big-map state.
- Signer-backed Lasagna Shadownet E2E now passes with keyring wallets `wtf-os-root` and `arcade-treasury`, originating `KT1GrrYTevWKExvhFWVigUdGKR86SQKwYceN`, adding/removing a curator, publishing two cross-Pasta exhibition revisions, resetting the current revision pointer, transferring/accepting administration, and proving TzKT curator, revision, administrator, current-pointer, and metadata big-map state.
- Colander Shadownet discovery now passes through the browser against the six signer-backed proof KT1s, rendering adapter-specific action controls, Shadownet TzKT links, and relationship graphs for Spaghetti, Gnocchi, Ravioli, Rotini, Penne, and Lasagna.
- WTF.ME hosted-page branch proof now serves Pasta landing, Gnocchi mint, and Spaghetti collection pages from a published `wtf-admin.wtfos.me` user-site harness host with Shadownet chain markers, real proof KT1s, wallet-connect and purchase/mint route markers, Shadownet TzKT links, user-site CSP/opener headers, and `wtf_site.public.viewed` events.
- Live Pasta/Macaroni static wallet bundles for `macaroni`, `spaghetti`, `gnocchi`, `ravioli`, `rotini`, `penne`, and `lasagna` passed stale-Taquito probes: Taquito `24.3.0` is absent, Taquito `25.0.0` is present, and the old `rpc.shadownet.teztnets.com` marker is absent.
- Live Pasta static publisher `common.js` files now expose the `window.MD` runtime export in `spaghetti`, `gnocchi`, `ravioli`, `rotini`, `penne`, and `lasagna`, while retaining `consumeCheaseHandoff()` and `loadPlatformCapabilities()` markers.
- App-by-app live-readiness status is tracked in `.agents/docs/live/PASTA_LIVE_READINESS_MATRIX.md`; it allows proof-branch pushes but blocks any full-production Pasta deployment claim until hosted-page, pinning/recovery, and signed-management boundaries are green.

## Cleanup Performed

- Ran `git fetch --all --prune`; no ref changes were needed.
- Ran `git worktree prune -v` after dry-run proof and removed seven dead worktree metadata records whose `/private/tmp` paths no longer existed.
- Archived the stale `WTF-pasta-deploy` checkout to `/Users/joshuafarnworth/.codex/archives/WTF-pasta-deploy-2026-06-30-2c8a346`, including branch refs, status, a binary tracked diff, an untracked-file tarball, and SHA-256 checksums.
- Removed the stale `WTF-pasta-deploy` worktree and deleted the local `pasta-protocol` branch after confirming it was 105 commits behind `origin/main` with zero unique commits.
- Left other existing checked-out worktrees untouched, especially dirty ones, because they may contain user context.

## Worktree Classification

| Worktree | Branch/Head | Dirty Count | Classification | Action |
| --- | --- | ---: | --- | --- |
| `.config/superpowers/worktrees/WTF/codex-pasta-live-readiness` | `codex/pasta-live-readiness` / current proof branch head | 0 | Valid current Pasta/live-readiness record | Keep until the broader goal is fully audited; it is the clean evidence branch and is aligned with `origin/main`. |
| `Desktop/cursor-projects/Sandbox/WTF combo/WTF` | local `main` / `9d043fd` | 295 | Stale mixed scratch checkout | Do not deploy from it. It is behind `origin/main` and mixes Pasta, Gamma/Beta, apphost, Agent, localization, Skywire, WTF LIVE, Particle Painter, docs, and test churn. |
| `Desktop/cursor-projects/Sandbox/WTF combo/WTF-pasta-deploy` | `pasta-protocol` / `f6256708` | 29 archived | Archived superseded Pasta prototype | Removed after archive proof. Do not recreate or promote wholesale. See stale Pasta findings below. |
| `Desktop/cursor-projects/Sandbox/WTF combo/WTF-macaroni-fullsend` | `codex/macaroni-direct-upload-lane` / `6706df2` | 0 | Historical Macaroni branch now ancestor of `origin/main` | Candidate for archival after user confirms no local notes are needed. |
| `Desktop/cursor-projects/Sandbox/WTF combo/WTF-ipfs-fullsend` | `codex/ipfs-pinning-organ` / `d40ab44` | 0 | Historical IPFS branch now ancestor of `origin/main` | Out of current Pasta installer scope; candidate archival. |
| `Desktop/cursor-projects/Sandbox/WTF combo/WTF-maplab-fullsend` | `codex/maplab-demo-fullsend` / `83d5a57` | 6 | Non-Pasta dirty work | Leave for separate Map Lab pass. |
| `.config/superpowers/worktrees/WTF/wtf-tv-roger-radio` | `codex/wtf-tv-roger-radio` / `a7a430f` | 20 | Non-Pasta dirty work | Leave for separate TV pass. |
| Gamma/Beta worktrees | assorted | 0 | Explicitly out of scope | Ignore for this goal unless files contaminate main production release work. |

## Stale Pasta Findings

The old `WTF-pasta-deploy` checkout is not a valid ongoing release branch:

- Most untracked Pasta app surfaces already exist on `origin/main`: `client/src/features/pasta-protocol`, `client/src/pages/Colander.tsx`, `client/src/pages/MacaroniPackager.tsx`, `contracts/pasta-protocol`, `docs/domains/pasta-protocol.md`, all six new static Pasta tools, `scripts/pasta-protocol`, `server/features/macaroni/packages.ts`, `shared/pasta-protocol`, `shared/schema-macaroni.ts`, `tests/playwright/inventory/macaroni-packager.spec.mjs`, and `tests/unit`.
- `drizzle/0103_macaroni_packages.sql` is superseded by tracked `drizzle/0104_macaroni_packages.sql` on `origin/main`.
- `server/features/pasta-protocol` contains only `.gitkeep`, so it does not carry product behavior.
- Its dirty `server/routes/macaroni.ts` would remove live installer checksum exposure, advertise the old Windows `.msi` filename, and allow remote `http:` installer URLs again. Those are supply-chain regressions compared with current production.
- Its dirty inventory and route files also remove newer app routes and presentation entries; those differences are old checkout drift, not a clean Pasta change.

Conclusion: this checkout has been archived outside the repo for recovery/audit only, then removed from the active worktree list. Do not apply its archived patch to main.

## Remaining Product Gaps

- The CH-EASE package-to-Pasta static runtime fix is now production-deployed: post-deploy live probes confirm `window.MD` exports on the six Pasta publisher bundles.
- Pasta suite installer/download is now production-complete for the bundled native suite lane: `apps/pasta-suite-desktop`, the `pasta-suite-desktop-installers.yml` workflow, `/api/pasta/installers`, inventory coverage, package policy checks, GitHub release assets, production env, and the authenticated live verifier all passed for `pasta-suite-desktop-v1.0.0`.
- Full Pasta contract/product workflow proof remains broader than static bundle availability, the now-green Macaroni Shadownet confidence lane, the Spaghetti Shadownet preflight, the signer-backed Spaghetti/Gnocchi/Ravioli/Rotini/Penne/Lasagna deploy/mint/collect/distribution/exhibition proofs, Colander discovery, and local WTF.ME hosted-page proof: failure recovery, production WTF.ME publish/live DNS/TLS, signed hosted-page purchase completion, wtfOS pinning, and browser-wallet Colander mutation/post-operation refresh should remain open until executable evidence exists. The exact app-by-app gate state is recorded in `.agents/docs/live/PASTA_LIVE_READINESS_MATRIX.md`.
- Local `main` at the original workspace should be fast-forwarded, reset, or archived only after the user confirms whether its dirty scratch content should be preserved.

## Current Macaroni Shadownet Proof

- Local proof command: `DATABASE_URL=postgresql://wtf:***@127.0.0.1:55432/wtf npm run test:e2e:macaroni:shadownet`.
- Database proof: disposable local Postgres on `127.0.0.1:55432`, prepared with `npm run db:push`.
- Puppet proof: 12 actor-backed Shadownet wallets seeded against `https://tezos-shadownet.octez.io/` with chain id `NetXsqzbfFenSTS`.
- Playwright proof: 5/5 passed for trusted-creator Shadownet defaults and chain-verified wallet, regular-user wtfOS provider exclusion, generated mint-page wallet restore/disconnect, mismatched RPC blocking before wallet signing, and Shadownet Kukai handoff.
- Scope note: this proves Macaroni's local Shadownet wallet/publish-page confidence lane. It does not yet prove a live KT1 origination, token mint/collect, hosted page resolution, or all Pasta app publishers.

## Current Spaghetti Shadownet Preflight

- Local proof command: `npm run pasta:shadownet:preflight`.
- Network proof: real RPC `https://tezos-shadownet.octez.io/` returned chain id `NetXsqzbfFenSTS`.
- Indexer proof: Shadownet TzKT `/v1/head` returned `chain: "shadownet"`, `chainId: "NetXsqzbfFenSTS"`, and a positive head level.
- Artifact proof: `public/creation-tools/spaghetti/contract/pasta-standard-collection.contract.json` exposes FA2 plus standard collection entrypoints required by the Colander `standard_collection` adapter.
- Payload proof: CH-EASE collection package validation, relationship metadata extraction, token metadata, and origination storage map planning all pass for a two-token Spaghetti publish rehearsal.
- Scope note: this is an unsigned real-network preflight. It does not yet originate, mint, collect, or wait for TzKT-indexed token balances.

## Current Spaghetti Shadownet E2E Proof

- Local proof command: `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:e2e`.
- Funding proof: Shadownet faucet funded keyring wallet `wtf-os-root` through operations `onwDWf5LFoptz17tgvAZz6DqbEvQhUDp3rmGkFfcDrkz47uitMH` and `onzovQJ3NcfEe9G9CuAEwPNFmCXyqLvadGkHjXsiuV2afU2fhH1`.
- Deployment proof: contract `KT1LPXV5b83MU8LsvyVM76YCAH25JtNCBJPH` originated on Shadownet by `tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM`.
- Operation proof: origination `op3EUiVa4vLndQe49EMWUY3jQFGDtBmpDwHHAEpnM8uPAra2JMk`, create token `opEms2XFiRrS5s8wU8VA47BF8wQBBEpc373QW7zDpyDLZ38tbvh`, mint `oouZ5csYnV2KobvcwPdEfLbjLj5meD1ZpPSzBdnb53LMSx9i3Dr`, transfer/collect `ooicX8mNH4zJASga466CSbKxHtnSAVAvwHKFTT2w81x792mjnwJ`.
- Indexer proof: TzKT storage indexed ledger big map `26723`, token metadata big map `26727`, collector ledger balance `1`, and decoded token metadata name `Spaghetti Proof Token` with relationship metadata intact.
- Report: `.agents/docs/archive/contracts/pasta-protocol/shadownet-spaghetti-e2e-report.md`.
- Scope note: this proves Spaghetti standard-collection deployment, token creation, minting, transfer/collect, metadata decoding, and ownership resolution. It does not yet prove WTF.ME page hosting, hosted wtfOS pinning, recovery, or every Pasta publisher variant.

## Current Gnocchi Shadownet E2E Proof

- Local proof command: `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:e2e:gnocchi`.
- Funding proof: Shadownet faucet funded collector wallet `arcade-treasury` through operation `oo3w7TiKj51E8cL1aUypiPU6vQFh9Az4FQshJWS88BGKG3UjzgG` and topped up creator wallet `wtf-os-root` through operation `onkYAR7xPhQLSfk72X9S89RW1xAsEfzgZHKuDTTfTmG84qWDLUp`.
- Deployment proof: contract `KT1FwS1JifrUakeGqFwGYmMHMmfjuwJABaax` originated on Shadownet by `tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM`.
- Operation proof: origination `opDUEStNnLYbs6joZf6zqMneGgosA5SvtVo7zNAyHmgHbTYP2Sc`, create open edition `opPeyD3UhCy4nC23JKPNbvVMjAH9ZHcjAweX288eAg9qSia4xMN`, collector open mint `op2jCQSH4yFF9bzjc8z8o6AmYmGLfBKNMmjAtDaNCiuQvREijay`.
- Indexer proof: TzKT storage indexed ledger big map `26736`, token metadata big map `26741`, total supply big map `26742`, sale big map `26740`, collector ledger balance `1`, total supply `1`, active sale with base price `1`, and decoded token metadata name `Gnocchi Proof Open Edition` with relationship metadata intact.
- Report: `.agents/docs/archive/contracts/pasta-protocol/shadownet-gnocchi-e2e-report.md`.
- Scope note: this proves Gnocchi open-edition deployment, sale configuration, collector paid mint, metadata decoding, total supply, and ownership resolution. Colander discovery is covered separately below; this proof does not yet cover WTF.ME page hosting, hosted wtfOS pinning, recovery, or every Pasta publisher variant.

## Current Ravioli Shadownet E2E Proof

- Local proof command: `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:e2e:ravioli`.
- Funding proof: Shadownet faucet topped up creator wallet `wtf-os-root` through operation `op4t56EoQcLhnLYWmkxT9zEwq1LcwwG765Ue93aAwZJtedmz6o3`.
- Deployment proof: contract `KT1CeJYHodXy8dvmNFgXxk4zh6SjVB5KYLaG` originated on Shadownet by `tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM`.
- Operation proof: origination `oojirLUzsPzxboT7ho4U7BTDAwybHMQPkod4CPwXsg7PvJg8Qex`, create bundle `opaKa8dpR7gYigxMxVdmd2YndjDvkSDQm2rBToBsCaKKRw5Se8h`, mint `onnBGuuK1oy1wdsECXjhHR9UAN2dEiWK3MhEnL5ATZ6znjMeT3P`, transfer/collect `ootNj85u3S1vddi31ddttBc2v8PhFbrBnWHY83bJmSf7RFW85w2`, redeem `oom9M9yq4ZRTHGGMA1myDS41EmCfr4iCqUTMfpPKwe6eUxreKHy`.
- Indexer proof: TzKT storage indexed ledger big map `26744`, token metadata big map `26750`, total supply big map `26751`, bundle big map `26743`, redeemed big map `26748`, collector ledger balance `1` after one redeem, total supply `2`, redeemed count `1`, redeemable non-mystery bundle with item count `2`, and decoded token metadata name `Ravioli Proof Bundle` with relationship and bundle manifest metadata intact.
- Report: `.agents/docs/archive/contracts/pasta-protocol/shadownet-ravioli-e2e-report.md`.
- Scope note: this proves Ravioli bundle deployment, creation, minting, transfer/collect, redeem/burn, metadata decoding, total supply, redeemed count, and ownership resolution. Colander discovery is covered separately below; this proof does not yet cover WTF.ME page hosting, hosted wtfOS pinning, mystery reveal, recovery, or every Pasta publisher variant.

## Current Rotini Shadownet E2E Proof

- Local proof command: `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:e2e:rotini`.
- Funding proof: Shadownet faucet topped up creator wallet `wtf-os-root` through operation `ooRHzKLR58rBMWNQYBRSCghQW25R9Fj6Dns38Qe2o7mkpUvT1Wx`.
- Deployment proof: contract `KT1SHHPFkthiSTf9CAmhAzWmbi7t5rTcUeYz` originated on Shadownet by `tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM`.
- Operation proof: origination `onmFp1bkxq9spGiWCVCyeYMWRALuQrwmcLPHvgQ9N6Ts1xixsDX`, create token 0 `oo2mRGFGzWXo1aPradt5EDohggXhtJuECpWDtFbaXGXz2DHfjvu`, create token 1 `oozC4ad3ZCywFZv4Fk61jTHwNm8Ax81Aqx3ZjwXFeeRtBJyhW5m`, mint token 0 `op6MMHJbJukn6umKtAvYQampqpifqrmptppkQCDxiazLFVMZPW7`, mint token 1 `opTJp3FEvbZUqvBitwNx9gfR5ajxBNKggxyknr72ESkHep1cYXd`, transfer/collect `oo13MwgeFP2bTbbeMzGda6futtrkwYgdBW9rV7P95TDgzDyUzqf`.
- Indexer proof: TzKT storage indexed ledger big map `26752`, token metadata big map `26756`, total supply big map `26757`, creator ledger balance `1` for token 0, collector ledger balance `1` for token 1, total supply `1` for both generated tokens, and decoded token metadata names `Rotini Proof Seed #1` / `Rotini Proof Seed #2` with relationship metadata, trait attributes, and Rotini DNA intact.
- Report: `.agents/docs/archive/contracts/pasta-protocol/shadownet-rotini-e2e-report.md`.
- Scope note: this proves Rotini generative collection deployment, deterministic generated-token metadata, token creation, minting, transfer/collect, supply, and ownership resolution. Colander discovery is covered separately below; this proof does not yet cover WTF.ME page hosting, hosted wtfOS pinning, browser wallet batching, recovery, or every Pasta publisher variant.

## Current Penne Shadownet E2E Proof

- Local proof command: `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:e2e:penne`.
- Funding proof: Shadownet faucet topped up creator wallet `wtf-os-root` through operation `ooGCbZTsK9UhkBJHyAzbKpgNyAo2PtLb9T6qPxZbG9Rprd2Y6Sx`.
- Deployment proof: contract `KT1DDY9Pyr7PYNJgXxnHnJn9T7WHaVx7ztdx` originated on Shadownet by `tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM`.
- Operation proof: origination `oo7mA4ds4txrrsDZeQ4X5qDV2ERtxdXwiKDXH4j2GyuUL9hG96H`, create distribution token `opDhqHgaP1dzb9Ty3xEBsEUW92mY9gNBjcMhFVd4Yx3AeQBfT9G`, set allocations `op6orC8cmLjSNfWynp4ezDFqx4KufLUQA1KT7vmDQ3tMkpfsq9b`, open claim `oorcEQCewpSa1XupXB4cq8W1YLRbhbxkggmZQBfR28gNWPcofUa`, collector claim `ooARevfUWvyzostSimSfi5mSoz3kyWSbMZGSnHHfgECvrM9ceJT`, admin airdrop `opCHwXiemfTzLjeowi9C37ZziEu2WMYDEGPwR34XPoMz3zrbvTY`, close claim `oojDbTFGrTZgDRRdJGemh64q5s6QgiuvbiKU2xstwNv5YZ2pNmd`.
- Indexer proof: TzKT storage indexed ledger big map `26768`, token metadata big map `26772`, total supply big map `26773`, allocations big map `26766`, claimed big map `26767`, collector ledger balance `2` after pull claim, creator ledger balance `3` after admin airdrop, total supply `5`, claimed entries collector `2` and creator `3`, inactive/cleared allocation rows for both recipients, final claim window `false`, and decoded token metadata name `Penne Proof Distribution Token` with relationship metadata and distribution modes intact.
- Report: `.agents/docs/archive/contracts/pasta-protocol/shadownet-penne-e2e-report.md`.
- Scope note: this proves Penne distribution deployment, token creation, allocation loading, claim-window configuration, recipient pull claim, admin push airdrop, allocation consumption, supply, ownership, claimed-state, and metadata resolution. Colander discovery is covered separately below; this proof does not yet cover WTF.ME page hosting, hosted wtfOS pinning, browser wallet batching, failure recovery, or every Pasta publisher variant.

## Current Lasagna Shadownet E2E Proof

- Local proof command: `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:e2e:lasagna`.
- Deployment proof: contract `KT1GrrYTevWKExvhFWVigUdGKR86SQKwYceN` originated on Shadownet by `tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM`.
- Operation proof: origination `onzXgGMzYxcSjdLTMyxbHqf8dfUakWXig3P8ZeCJsh5UvVwsNAT`, add curator `opWHD7JtP8TUhrmsgZC7KntKEHxv779DFTJhc31qBoiNWjGHcwJ`, curator publish revision 0 `op3m9yfqHiQCMmkT7qgNZQBYTZ5ydtYnw8hRbamHEYMcH3eepqe`, administrator publish revision 1 `ooqzTWCAmdUXTt7F6XDWDjkVomQyzNKh96em1Xt7RMyo7uwchUR`, set current revision to 0 `ooH9HKyVjJYRLprbTE7kxZgHY9oXq4JosicS4PQDj6XjMGDspFt`, remove curator `ongWrFmZXn3K6A4BosC5oeJBVt5RkprsRkWLa7kE3ND9ajWems4`, transfer administration `oo6s88oLv7kZoywT9ukH1uH3PAHrdzRH7Zeg696yUDvek9ij8C9`, accept administration `ooLwFs9r5XTygtC1mo3Xv71Gm8ZAamJg69iYK5pfam1HrPG299c`.
- Indexer proof: TzKT storage indexed metadata big map `26775`, curators big map `26774`, revisions big map `26776`, final administrator `tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej`, pending administrator `null`, revision count `2`, current revision pointer `0`, revision 0 by curator with two referenced tokens, revision 1 by creator with three referenced tokens, no active curator big-map entry after removal, and decoded contract metadata name `Lasagna Shadownet E2E` with relationship metadata intact.
- Report: `.agents/docs/archive/contracts/pasta-protocol/shadownet-lasagna-e2e-report.md`.
- Scope note: this proves Lasagna exhibition registry deployment, curator configuration, cross-Pasta revision publication, current-pointer rollback, curator removal, two-step administration transfer, metadata decoding, and indexed registry state. It does not yet prove WTF.ME page hosting, hosted wtfOS pinning, Colander browser-wallet mutation/post-operation refresh, failure recovery, or mainnet readiness.

## Current Colander Shadownet Discovery Proof

- Local proof command: `npm run pasta:shadownet:colander`.
- Browser proof: `/tools/colander` opened all six signer-backed Shadownet proof contracts with app network set to Shadownet.
- Contract proof: Spaghetti `KT1LPXV5b83MU8LsvyVM76YCAH25JtNCBJPH`, Gnocchi `KT1FwS1JifrUakeGqFwGYmMHMmfjuwJABaax`, Ravioli `KT1CeJYHodXy8dvmNFgXxk4zh6SjVB5KYLaG`, Rotini `KT1SHHPFkthiSTf9CAmhAzWmbi7t5rTcUeYz`, Penne `KT1DDY9Pyr7PYNJgXxnHnJn9T7WHaVx7ztdx`, and Lasagna `KT1GrrYTevWKExvhFWVigUdGKR86SQKwYceN`.
- UI/indexer proof: Colander rendered the expected Pasta adapter labels, action panels, Shadownet TzKT explorer links, relationship group metadata, and `colander.contract_opened` / `colander.graph_viewed` inventory events.
- Code proof: Colander now decodes `ipfs://`, HTTPS, and JSON `data:` relationship metadata, uses Shadownet explorer routing, and calls `assertNetworkReadyForSend(me)` before signed writes.
- Report: `.agents/docs/archive/contracts/pasta-protocol/shadownet-colander-discovery-report.md`.
- Scope note: this proves real-contract Colander discovery and read-management rendering. It does not yet prove a browser-wallet signed Colander mutation, post-operation refresh after mutation, WTF.ME page hosting, hosted wtfOS pinning/recovery, or mainnet readiness.

## Current WTF.ME Hosted Page Proof

- Source proof command: `npx tsx --test server/features/wtf-sites/pasta-hosting.test.ts`.
- Browser proof command: `npm run pasta:shadownet:wtfme`.
- Page proof: `server/features/wtf-sites/pasta-hosting.ts` builds immutable user-site snapshots for `home`, `mint`, and `collection` pages.
- Host proof: `tests/playwright/inventory/pasta-protocol-wtfme-hosting.spec.mjs` maps `wtf-admin.wtfos.me` to the local harness, seeds a published user site, and loads `/`, `/mint`, and `/collection` from that public host.
- Contract proof: the pages carry Gnocchi mint contract `KT1FwS1JifrUakeGqFwGYmMHMmfjuwJABaax`, Spaghetti collection contract `KT1LPXV5b83MU8LsvyVM76YCAH25JtNCBJPH`, token id `0`, the relevant relationship groups, Shadownet chain id `NetXsqzbfFenSTS`, and Shadownet TzKT links.
- User-site proof: the harness response includes `X-WTFOS-Surface: user-site`, wallet-compatible Content Security Policy sources, `Cross-Origin-Opener-Policy: same-origin-allow-popups`, and `wtf_site.public.viewed` events for landing, mint, and collection.
- Scope note: this proves branch-level hosted page rendering through the WTF.ME user-site host contract. It does not yet prove live production DNS/TLS, publish UI persistence, hosted wtfOS pinning/recovery, or a signed hosted-page mint/purchase operation.

## Current Suite Installer Proof

- Source/package proof: `npm run pasta-suite:desktop:check` passed 5/5.
- Macaroni regression proof: `npm run macaroni:desktop:check` passed 4/4.
- Inventory proof: `npm run test:e2e:inventory:coverage` passed with `pasta_suite.installer_manifest.viewed` and `/api/pasta/installers` in the Pasta workflow.
- TypeScript proof: `npm run check -- --pretty false` passed.
- Local macOS build proof: `npm run dist:mac --prefix apps/pasta-suite-desktop` produced unsigned artifacts:
  - `apps/pasta-suite-desktop/release/Pasta-Suite-1.0.0-mac-universal.dmg` (`sha256 3b00d06229d2527294aac8f67e43e9437f5544846225e9688a345af9addf01e9`)
  - `apps/pasta-suite-desktop/release/Pasta-Suite-1.0.0-mac-universal.zip` (`sha256 812650e1e62d1bbe7332b84d6a437966ef9ddb2262977c8923429551a4e73f24`)
- Branch Quality Gates run `28470551711` passed on `fd4afcd`; later Pasta readiness Quality Gates included run `28478213183` on `c4ba55ff` and main run `28480098540` on `2c8a3463`.
- Main Deploy to Hetzner run `28471646097` passed for `fd4afcd`; later main Deploy to Hetzner runs `28479148838` and `28480098529` passed, main Quality Gates runs `28479148843` and `28480098540` passed, and live health currently reports `commitRef: "2c8a346"`.
- Pasta Suite Desktop Installers workflow run `28471682307` passed and published release tag `pasta-suite-desktop-v1.0.0`.
- Release asset proof from GitHub release metadata:
  - macOS DMG: `Pasta-Suite-1.0.0-mac-universal.dmg` (`sha256 1c62cfde5a019d0c5900476c9dc72d2fc60c25e8098b06be5a88b4e858dbf39f`)
  - Windows NSIS: `Pasta-Suite-1.0.0-win-x64.exe` (`sha256 5fb9c02531aa492a306928e89501eb3d628c61b4380720fb8a7e54fffa0c2f8a`)
  - Raspberry Pi Debian package: `Pasta-Suite-1.0.0-linux-arm64.deb` (`sha256 bd15004c5a4233bf27280d9b2132e0408739f349ef7f0184af0cf665c5fe4a29`)
- Production `PASTA_SUITE_INSTALLER_*` env was configured from those release digests, then the app container was recreated with the deploy temp-env pattern so the running process picked up the values.
- `npm run pasta-suite:installers:live-check` passed against `https://wtfos.app` with production puppet `e2e_bert`; it verified unauthenticated `401`, GitHub release asset discovery, byte-range download support for all three platform assets, authenticated login, and manifest version/URL/SHA agreement.

## Recommended Next Actions

1. Use `.agents/docs/live/PASTA_LIVE_READINESS_MATRIX.md` as the live-push checklist, next extending WTF.ME hosted pages from local host-mapped proof into production-like publish and signed mint/purchase validation.
2. Extend the now-green Shadownet evidence into one end-to-end Pasta chain: CH-EASE package -> publisher -> Shadownet deploy/mint -> Colander discovery -> hosted page -> artifact resolution.
3. After user confirmation, archive/delete merged historical Macaroni branches and clean checked-out worktrees that are ancestors of `origin/main`.
4. Keep the removed `WTF-pasta-deploy` archive only as recovery evidence; do not mine it for implementation unless a future pass needs a specific historical note.
