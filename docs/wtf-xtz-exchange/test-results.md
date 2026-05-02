# Test Results

## Local SmartPy

Command:

```bash
scripts/test-wtf-xtz-exchange.sh
```

Status: PASSED.

What ran:

- `python3 tests/wtf_xtz_exchange_test.py`
- `smartpy compile contracts/wtf-xtz-exchange/WtfXtzExchange.py build/wtf-xtz-exchange/exchange`
- `smartpy compile contracts/wtf-xtz-exchange/DummyWtfFA2.py build/wtf-xtz-exchange/dummy-wtf-fa2`

Notes:

- SmartPy version present locally: `smartpy-tezos 0.24.1`.
- SmartPy FA2 library emits deprecation warnings for its internal `.contains(...)` usage. These warnings are inside the installed library, not the exchange contract.

## Shadownet

Status: BLOCKED.

Blockers:

- `KILN_API_TOKEN` is not set for Kiln deploy.
- `DUMMY_WTF_ADDRESS`, `EXCHANGE_ADDRESS`, `LISTING_OWNER_SECRET_KEY`, and `TAKER_SECRET_KEY` are not set for Taquito E2E.

Commands attempted:

```bash
npm run contract:deploy:wtf-xtz:kiln
npm run contract:e2e:wtf-xtz:shadownet
npm run contract:prepare:wtf-xtz:mainnet
```

The mainnet artifact command correctly blocked because Shadownet E2E has not passed.

