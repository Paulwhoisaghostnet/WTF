# Mainnet Deployment Instructions

Mainnet deployment is intentionally gated.

Do not prepare or deploy the final mainnet artifact until:

- Exchange source and local SmartPy tests pass.
- Exchange is deployed to Shadownet with a Shadownet WTF FA2 reference.
- Kiln puppet-wallet E2E passes and records operation hashes.
- `.agents/docs/archive/contracts/wtf-xtz-exchange/shadownet-e2e-report.md` contains `- Status: PASSED`.
- The project owner explicitly instructs mainnet artifact preparation/deployment in a later pass.

Once those are true:

```bash
MAINNET_ADMIN_ADDRESS=tz1... \
npm run contract:prepare:wtf-xtz:mainnet
```

The prep script always verifies the mainnet WTF token through TzKT before writing final artifacts. If `MAINNET_ADMIN_ADDRESS` is missing, it writes `.agents/docs/archive/contracts/wtf-xtz-exchange/mainnet-readiness-report.md` with `Status: BLOCKED` and exits without compiling final storage.

The generated mainnet artifact will use:

- WTF FA2: `KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD`
- Token ID: `0`
- Native payout asset: XTZ in mutez

The script writes:

```text
build/wtf-xtz-exchange-mainnet/mainnet-artifact-manifest.json
build/wtf-xtz-exchange-mainnet/deploy_wtf_xtz_exchange_template/step_001_cont_0_contract.tz
build/wtf-xtz-exchange-mainnet/deploy_wtf_xtz_exchange_template/step_001_cont_0_storage.tz
```

Do not originate on mainnet without explicit project-owner instruction and a final manual review of:

- admin address
- WTF FA2 address
- token id
- initial storage
- explicit `create_listing` and `swap` parameter shape in the UI/wallet caller
- TzKT token probe in `mainnet-readiness-report.md`
- chain target
- operation signer
