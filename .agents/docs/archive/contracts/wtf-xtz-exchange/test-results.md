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

Status: PASSED.

Contracts:

- Kiln WTF FA2: `KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj`
- WTF -> XTZ exchange: `KT1UTYBkXLWm6JDqFhEJmfeDmbZcK1avQGZF`
- Admin/listing owner puppet: `tz1aXPHYxQrXmsDigEJKDF7PyB8FvUTtGyfn`
- Taker puppet: `tz1gQyc3ZrMtg1ztDvpS2okyUH2yvoKsFnL4`

Commands:

```bash
npm run contract:deploy:wtf-xtz:kiln
npm run contract:e2e:wtf-xtz:shadownet
npm run contract:test:wtf-xtz
npx tsx --test scripts/kiln/e2e-assertions.test.ts
npm run check
npm run test:e2e:inventory:coverage
git diff --check
```

What passed:

- Kiln Shadownet deployment using the named Kiln WTF FA2 token.
- 13/13 Kiln E2E steps.
- 8/8 declared entrypoints covered across WTF token and exchange contracts.
- Storage, balance, and big-map assertion kinds.
- Mismatched `escrow_mutez` rejected with `ESCROW_AMOUNT_MISMATCH`.
- Paused swap rejected with `PAUSED`.
- Stale expected output rejected with `XTZ_OUT_MISMATCH`.
- Two partial fills paid exact XTZ output and transferred exact WTF.
- Overfill rejected with `INSUFFICIENT_ESCROW`.
- Owner cancellation refunded remaining escrow and left the exchange XTZ balance at `0`.

No mainnet deployment was attempted.
