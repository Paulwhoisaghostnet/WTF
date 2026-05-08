# Mainnet Deployment Instructions

Mainnet deployment is intentionally gated.

Do not prepare or deploy the final mainnet artifact until:

- Dummy WTF FA2 is deployed to Shadownet.
- Exchange is deployed to Shadownet.
- Taquito E2E passes and records operation hashes.
- `docs/wtf-xtz-exchange/shadownet-e2e-report.md` contains `- Status: PASSED`.

Once those are true:

```bash
MAINNET_ADMIN_ADDRESS=tz1... \
npm run contract:prepare:wtf-xtz:mainnet
```

The generated mainnet artifact will use:

- WTF FA2: `KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD`
- Token ID: `0`

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
- chain target
- operation signer

