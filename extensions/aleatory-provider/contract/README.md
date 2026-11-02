# Aleatory provider contract

This directory compiles the **unchanged** `AleatoryProvider` class from
[`skullzarmy/aleatory` at `82bea97b21bd477f3bd66cb4e189c0f1627c9654`](https://github.com/skullzarmy/aleatory/blob/82bea97b21bd477f3bd66cb4e189c0f1627c9654/contract/aleatory.py).
The complete original module is in `upstream/aleatory.py`; its upstream
Unlicense is retained beside it. No contract semantics have been forked.

```sh
python3 extensions/aleatory-provider/contract/build.py
```

The reproducible build requires `smartpy-tezos==0.24.1`, the compiler used for
these artifacts. It checks the upstream source hash, compiles only the provider,
runs focused local scenarios, and writes `artifacts/AleatoryProvider.json`,
`artifacts/AleatoryProvider.tz`, and `artifacts/build-receipt.json`. It performs
no network operations and cannot originate or register a contract.

The scenarios use the real upstream registry to check all three required views
and registration/deregistration. They also prove tez receipt, operator-only
price/key/metadata changes and withdrawal, refusal of agent/stranger admin
actions, overdraft rejection, and refusal of attached tez on nonpayable actions.
Test amounts are fixtures, not the production price or funding policy.

Deployment must supply separately reviewed initial `operator`, `agent`,
`render_gas`, and metadata. The compilation scenario's burn-address storage is
never exported as a deployment artifact. Only the provider contract should be
originated; the test registry and recipient exist solely in local simulation.

`artifacts/build-receipt.json` records source, test and artifact SHA-256 hashes.
The upstream source hash is
`27a3974c1a45d775b7027ddb9339a4d06ffae71f8ab3f8c82e7557b9e9ff697a`.
Comments in the original module include historical descriptions; the current
compiled behavior and local tests are authoritative for this provider artifact.

An independent read-only comparison also matched every compiled Micheline
section, including annotations, to the official mainnet provider
[`KT1DGd6RcA9zKErjLurg9JGQ8txNCLoFHkmv`](https://api.tzkt.io/v1/contracts/KT1DGd6RcA9zKErjLurg9JGQ8txNCLoFHkmv/code).
Only top-level section ordering was normalized. The dated observation is in
`artifacts/mainnet-equivalence.json`; it is not re-fetched by the offline build.
