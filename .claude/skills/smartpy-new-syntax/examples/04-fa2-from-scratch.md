# FA2 Contracts From Scratch — Official Templates

Self-contained FA2 implementations without using the FA2 library.
Use these when you need full control over the implementation or want to understand the FA2 standard internals.

---

## 1. NFT Minimal (fa2_nft_minimal.py)

```python
import smartpy as sp


@sp.module
def main():
    # Type definition for balance_of callback
    balance_of_args: type = sp.record(
        requests=sp.list[sp.record(owner=sp.address, token_id=sp.nat)],
        callback=sp.contract[
            sp.list[
                sp.record(
                    request=sp.record(owner=sp.address, token_id=sp.nat), balance=sp.nat
                ).layout(("request", "balance"))
            ]
        ],
    ).layout(("requests", "callback"))

    class Fa2NftMinimal(sp.Contract):
        def __init__(self, administrator, metadata):
            self.data.administrator = administrator
            # NFT ledger: token_id → owner
            self.data.ledger = sp.cast(sp.big_map(), sp.big_map[sp.nat, sp.address])
            self.data.metadata = metadata
            self.data.next_token_id = sp.nat(0)
            # Operators: (owner, operator, token_id) → unit
            self.data.operators = sp.cast(
                sp.big_map(),
                sp.big_map[
                    sp.record(
                        owner=sp.address,
                        operator=sp.address,
                        token_id=sp.nat,
                    ).layout(("owner", ("operator", "token_id"))),
                    sp.unit,
                ],
            )
            self.data.token_metadata = sp.cast(
                sp.big_map(),
                sp.big_map[
                    sp.nat,
                    sp.record(token_id=sp.nat, token_info=sp.map[sp.string, sp.bytes]),
                ],
            )

        @sp.entrypoint
        def transfer(self, batch):
            for transfer in batch:
                for tx in transfer.txs:
                    sp.cast(
                        tx,
                        sp.record(
                            to_=sp.address, token_id=sp.nat, amount=sp.nat
                        ).layout(("to_", ("token_id", "amount"))),
                    )
                    assert tx.token_id < self.data.next_token_id, "FA2_TOKEN_UNDEFINED"
                    assert transfer.from_ == sp.sender or (
                        sp.record(
                            owner=transfer.from_,
                            operator=sp.sender,
                            token_id=tx.token_id,
                        )
                        in self.data.operators
                    ), "FA2_NOT_OPERATOR"
                    if tx.amount > 0:
                        assert (
                            tx.amount == 1
                            and self.data.ledger[tx.token_id] == transfer.from_
                        ), "FA2_INSUFFICIENT_BALANCE"
                        self.data.ledger[tx.token_id] = tx.to_

        @sp.entrypoint
        def update_operators(self, actions):
            for action in actions:
                match action:
                    case add_operator(operator):
                        assert operator.owner == sp.sender, "FA2_NOT_OWNER"
                        self.data.operators[operator] = ()
                    case remove_operator(operator):
                        assert operator.owner == sp.sender, "FA2_NOT_OWNER"
                        del self.data.operators[operator]

        @sp.entrypoint
        def balance_of(self, param):
            sp.cast(param, balance_of_args)
            balances = []
            for req in param.requests:
                assert req.token_id < self.data.next_token_id, "FA2_TOKEN_UNDEFINED"
                balances.push(
                    sp.record(
                        request=sp.record(owner=req.owner, token_id=req.token_id),
                        balance=(
                            1 if self.data.ledger[req.token_id] == req.owner else 0
                        ),
                    )
                )
            sp.transfer(reversed(balances), sp.mutez(0), param.callback)

        @sp.entrypoint
        def mint(self, to_, metadata):
            assert sp.sender == self.data.administrator, "FA2_NOT_ADMIN"
            token_id = self.data.next_token_id
            self.data.token_metadata[token_id] = sp.record(
                token_id=token_id, token_info=metadata
            )
            self.data.ledger[token_id] = to_
            self.data.next_token_id += 1

        @sp.offchain_view
        def all_tokens(self):
            return range(0, self.data.next_token_id)

        @sp.offchain_view
        def get_balance(self, params):
            sp.cast(
                params,
                sp.record(owner=sp.address, token_id=sp.nat).layout(
                    ("owner", "token_id")
                ),
            )
            assert params.token_id < self.data.next_token_id, "FA2_TOKEN_UNDEFINED"
            return (
                sp.nat(1)
                if self.data.ledger[params.token_id] == params.owner
                else sp.nat(0)
            )

        @sp.offchain_view
        def total_supply(self, params):
            assert params.token_id < self.data.next_token_id, "FA2_TOKEN_UNDEFINED"
            return 1

        @sp.offchain_view
        def is_operator(self, params):
            return params in self.data.operators
```

---

## 2. Fungible Minimal (fa2_fungible_minimal.py)

Key differences from NFT:

```python
@sp.module
def main():
    # Same balance_of_args type as NFT (omitted for brevity)

    class Fa2FungibleMinimal(sp.Contract):
        def __init__(self, administrator, metadata):
            self.data.administrator = administrator
            # Fungible ledger: (address, token_id) → amount
            self.data.ledger = sp.cast(
                sp.big_map(), sp.big_map[sp.pair[sp.address, sp.nat], sp.nat]
            )
            self.data.metadata = metadata
            self.data.next_token_id = sp.nat(0)
            self.data.operators = sp.cast(
                sp.big_map(),
                sp.big_map[
                    sp.record(
                        owner=sp.address,
                        operator=sp.address,
                        token_id=sp.nat,
                    ).layout(("owner", ("operator", "token_id"))),
                    sp.unit,
                ],
            )
            # Track total supply per token
            self.data.supply = sp.cast(sp.big_map(), sp.big_map[sp.nat, sp.nat])
            self.data.token_metadata = sp.cast(
                sp.big_map(),
                sp.big_map[
                    sp.nat,
                    sp.record(token_id=sp.nat, token_info=sp.map[sp.string, sp.bytes]),
                ],
            )

        @sp.entrypoint
        def transfer(self, batch):
            for transfer in batch:
                for tx in transfer.txs:
                    sp.cast(
                        tx,
                        sp.record(
                            to_=sp.address, token_id=sp.nat, amount=sp.nat
                        ).layout(("to_", ("token_id", "amount"))),
                    )
                    assert tx.token_id < self.data.next_token_id, "FA2_TOKEN_UNDEFINED"
                    from_ = (transfer.from_, tx.token_id)
                    to_ = (tx.to_, tx.token_id)
                    assert transfer.from_ == sp.sender or (
                        sp.record(
                            owner=transfer.from_,
                            operator=sp.sender,
                            token_id=tx.token_id,
                        )
                        in self.data.operators
                    ), "FA2_NOT_OPERATOR"
                    # Subtract with underflow protection
                    self.data.ledger[from_] = sp.as_nat(
                        self.data.ledger.get(from_, default=0) - tx.amount,
                        error="FA2_INSUFFICIENT_BALANCE",
                    )
                    self.data.ledger[to_] = (
                        self.data.ledger.get(to_, default=0) + tx.amount
                    )

        # update_operators is identical to NFT (omitted)

        @sp.entrypoint
        def mint(self, to_, amount, token):
            assert sp.sender == self.data.administrator, "FA2_NOT_ADMIN"
            match token:
                case new(metadata):
                    token_id = self.data.next_token_id
                    self.data.token_metadata[token_id] = sp.record(
                        token_id=token_id, token_info=metadata
                    )
                    self.data.supply[token_id] = amount
                    self.data.ledger[(to_, token_id)] = amount
                    self.data.next_token_id += 1
                case existing(token_id):
                    assert token_id < self.data.next_token_id, "FA2_TOKEN_UNDEFINED"
                    self.data.supply[token_id] += amount
                    self.data.ledger[(to_, token_id)] = (
                        self.data.ledger.get((to_, token_id), default=0) + amount
                    )

        @sp.offchain_view
        def get_balance(self, params):
            sp.cast(
                params,
                sp.record(owner=sp.address, token_id=sp.nat).layout(
                    ("owner", "token_id")
                ),
            )
            assert params.token_id < self.data.next_token_id, "FA2_TOKEN_UNDEFINED"
            return self.data.ledger.get((params.owner, params.token_id), default=0)

        @sp.offchain_view
        def total_supply(self, params):
            assert params.token_id < self.data.next_token_id, "FA2_TOKEN_UNDEFINED"
            return self.data.supply.get(params.token_id, default=0)
```

---

## Key Differences: NFT vs Fungible (from scratch)

| Aspect | NFT | Fungible |
|--------|-----|----------|
| **Ledger type** | `big_map[nat, address]` | `big_map[pair[address, nat], nat]` |
| **Ledger key** | `token_id` | `(address, token_id)` |
| **Transfer** | `ledger[id] = to_` | `ledger[from] -= amount; ledger[to] += amount` |
| **Mint** | `ledger[id] = to_` | `match token: new/existing` variant |
| **Balance** | `1 if owner else 0` | `ledger.get((owner, id), default=0)` |
| **Supply** | Always `1` | `self.data.supply[id]` |

---

## Patterns Demonstrated

- `match action: case add_operator(...) / case remove_operator(...)` — variant pattern matching
- `sp.as_nat(x - y, error="...")` — safe subtraction (nat underflow protection)
- `.layout(("field1", ("field2", "field3")))` — Michelson comb layout specification
- `sp.cast(sp.big_map(), sp.big_map[K, V])` — typed empty big_map initialization
- `balances.push(record)` — list append (SmartPy uses `.push()` not `.append()`)
- `reversed(list)` — reverse a list
- `del map[key]` — delete map entry
- `sp.offchain_view` — off-chain views (no parentheses)
- `sp.unit` represented as `()` — unit value
- Tuple keys: `(address, token_id)` as big_map key
