---
name: smartpy-new-syntax
description: >
  Generates, reviews, and debugs Tezos smart contracts using SmartPy's current syntax (v0.17+).
  Use this skill whenever the user asks to write a smart contract, create a SmartPy contract,
  build an FA2 token (NFT, fungible, single-asset), write a marketplace, auction, escrow, multisig,
  DAO, or any Tezos contract. Also use when the user mentions SmartPy, sp.module, sp.entrypoint,
  FA2 library, TZIP-12, or asks to migrate old SmartPy syntax to new syntax.
  Triggers on: "smart contract", "SmartPy", "Tezos", "FA2", "NFT contract", "fungible token",
  "mint entrypoint", "auction", "marketplace", "escrow", "multisig", "DAO contract",
  "token metadata", "on-chain view", "migrate SmartPy", "old syntax to new", "sp.module",
  "sp.entrypoint", "deploy contract", "blockchain contract".
  Do NOT trigger for general Python questions unrelated to SmartPy or for Michelson-only development.
metadata:
  author: Johannes Simon
  version: 1.0.0
  category: blockchain-development
---

# SmartPy New Syntax Skill

## Resource Map — Read Before Writing Code

This skill uses progressive disclosure. The SKILL.md you're reading now contains the essential
rules. For detailed patterns and full examples, consult the bundled resources below.

### Quick Routing Table

| User wants...                                      | Read this first                          |
|----------------------------------------------------|------------------------------------------|
| Simple contract, storage, entrypoints              | `examples/01-basics.md`                  |
| Escrow, swaps, time logic, hashing, tez handling   | `examples/02-advanced-patterns.md`       |
| FA2 NFT / Fungible / SingleAsset (recommended)     | `examples/03-fa2-with-library.md`        |
| FA2 from scratch (full control, no library)        | `examples/04-fa2-from-scratch.md`        |
| Multisig, upgradable contracts, factories          | `examples/05-complex-contracts.md`       |
| Any syntax question, type system, operations       | `examples/06-syntax-reference.md`        |
| FA2 mixin details, init ordering rules             | `references/fa2-patterns.md`            |
| Syntax migration old → new, complete type mapping  | `references/new-syntax-guide.md`        |

### When to Read Multiple Files
- **FA2 + custom logic** (marketplace, auction): `03-fa2-with-library.md` + `02-advanced-patterns.md`
- **Complex DeFi**: `02-advanced-patterns.md` + `05-complex-contracts.md`
- **Any syntax doubt**: Always fall back to `06-syntax-reference.md`

### Ground-Truth Templates (`templates/` directory)
When uncertain about any pattern, read the actual `.py` source files in `templates/`. These
are extracted directly from the official SmartPy repository and are guaranteed correct.
Key files: `fa2_lib.py` (FA2 library source), `fa2_lib_nft.py`, `fa2_lib_fungible.py`,
`escrow.py`, `multisig_lambda.py`, `syntax.py` (comprehensive syntax demo).

---

## Essential Rules

These rules are the minimum you need to generate correct SmartPy code. The reference files
contain much more detail — these are just the non-negotiable essentials.

### 1. Everything Inside `@sp.module`

All contract code — classes, type definitions, helper functions — lives inside a function
decorated with `@sp.module`. Test code lives outside, in regular Python.

```python
import smartpy as sp

@sp.module
def main():
    # Types, contracts, helpers go here (SmartPy language)
    class MyContract(sp.Contract):
        def __init__(self):
            self.data.value = 0

        @sp.entrypoint
        def update(self, new_value):
            self.data.value = new_value

# Tests go here (regular Python)
@sp.add_test()
def test():
    scenario = sp.test_scenario("MyTest", main)
    c = main.MyContract()
    scenario += c
    c.update(42)
    scenario.verify(c.data.value == 42)
```

### 2. Banned Syntax — Never Generate These

The left column will **not compile** in SmartPy v0.17+. Always use the right column.

| Old (BROKEN)                              | New (CORRECT)                                |
|-------------------------------------------|----------------------------------------------|
| `sp.TInt`, `sp.TNat`, `sp.TString` etc.  | `sp.int`, `sp.nat`, `sp.string`              |
| `sp.TRecord(...)`, `sp.TVariant(...)`    | `sp.record(...)`, `sp.variant(...)`          |
| `sp.TMap(...)`, `sp.TBigMap(...)`        | `sp.map[...]`, `sp.big_map[...]`             |
| `sp.TOption(...)`, `sp.TList(...)`       | `sp.option[...]`, `sp.list[...]`             |
| `self.init(field=value)`                 | `self.data.field = value` in `__init__`      |
| `self.init_type(sp.TRecord(...))`        | `sp.cast(self.data, sp.record(...))`         |
| `sp.set_type(x, t)`                     | `sp.cast(x, t)`                             |
| `sp.verify(cond, "msg")`                | `assert cond, "msg"`                         |
| `sp.failwith("msg")`                    | `raise "msg"`                                |
| `sp.result(value)`                       | `return value`                               |
| `sp.if` / `sp.else` / `sp.for` / `sp.while` | `if` / `else` / `for` / `while`        |
| `sp.local("x", value)` then `x.value`   | `x = value` then use `x` directly           |
| `.open_some()`                           | `.unwrap_some(error="...")`                  |
| `sp.entry_point`                         | `sp.entrypoint`                              |
| `sp.set(x, y)`                          | `{x, y}` or `set()` for empty               |
| `sp.unit`                               | `()`                                         |
| `sp.pair(x, y)`                          | `(x, y)`                                    |

### 3. Storage Pattern

```python
class MyContract(sp.Contract):
    def __init__(self, admin):
        self.data.admin = admin
        self.data.ledger = sp.cast(sp.big_map(), sp.big_map[sp.nat, sp.address])
        self.data.counter = sp.nat(0)
```

Empty collections (`big_map()`, `set()`, `[]`, `{}`) need `sp.cast()` to establish their type.

### 4. Module-Level Types

```python
@sp.module
def main():
    my_type: type = sp.record(owner=sp.address, amount=sp.nat)
    action: type = sp.variant(Transfer=sp.record(to=sp.address, amount=sp.nat), Burn=sp.nat)
```

### 5. SmartPy-Specific Gotchas

These trip up even experienced Python developers:

- **No `elif`** — use nested `if/else` instead
- **No `try/except`** inside `@sp.module`
- **Lists use `.push()`** not `.append()` (and `.push()` prepends, not appends)
- **`@sp.onchain_view()`** has parentheses; **`@sp.offchain_view`** does not
- **Views must return** at the end — no early returns
- **Cannot change variable types** after first assignment
- **Cannot import Python libraries** inside `@sp.module`
- **`sp.mod(x, y)`** for modulo — not `x % y`
- **`sp.as_nat(x - y, error="...")`** for safe nat subtraction

### 6. Private Functions

```python
@sp.private(with_storage="read-write", with_operations=True)
def _send_payment(self, to, amount):
    sp.send(to, amount)
```

Options: `with_storage` can be `"read-only"` or `"read-write"`.
`with_operations` defaults to `False` — set `True` if the function emits operations.

### 7. Inter-Contract Calls

Always follows the pattern: **get handle → unwrap → transfer**.

```python
contract_handle = sp.contract(param_type, address, "entrypoint_name").unwrap_some()
sp.transfer(data, sp.mutez(0), contract_handle)
```

### 8. Test Patterns

```python
@sp.add_test()
def test():
    scenario = sp.test_scenario("MyTest", main)
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")

    c = main.MyContract(alice.address)
    c.set_initial_balance(sp.tez(10))  # optional: set contract balance
    scenario += c

    c.my_ep(42, _sender=alice)                        # specify sender
    c.my_ep(42, _sender=alice, _amount=sp.tez(5))     # send tez
    c.my_ep(42, _sender=bob, _valid=False)             # expect failure
    c.my_ep(42, _valid=False, _exception="NOT_ADMIN")  # expect specific error
    c.my_ep(42, _now=sp.timestamp(100))                # mock timestamp

    scenario.verify(c.data.value == 42)
```

---

## FA2 Token Contracts — Quick Start

FA2 is the Tezos token standard (TZIP-12). There are two approaches:

### Recommended: Use the FA2 Library
```python
import smartpy as sp
from smartpy.templates import fa2_lib as fa2
main = fa2.main

@sp.module
def my_module():
    import main
    class MyNFT(main.Admin, main.Nft, main.MintNft, main.BurnNft, main.OnchainviewBalanceOf):
        def __init__(self, admin_address, contract_metadata, ledger, token_metadata):
            main.OnchainviewBalanceOf.__init__(self)
            main.BurnNft.__init__(self)
            main.MintNft.__init__(self)
            main.Nft.__init__(self, contract_metadata, ledger, token_metadata)
            main.Admin.__init__(self, admin_address)
```

**Critical rule**: `__init__` calls are in **reverse order** of the class inheritance list.

### FA2 Testing — Common Pitfalls

The FA2 library views (`total_supply`, `get_balance`, `all_tokens`) will raise
`FA2_TOKEN_UNDEFINED` if you query a token_id that has never been registered. A token
that doesn't exist is NOT the same as a token with supply 0 — the library checks
`is_defined(token_id)` first and fails hard if the token was never created.

**This means you MUST either:**
1. **Pre-populate tokens at origination** (recommended for tests):
```python
tok0_md = fa2.make_metadata(name="Token Zero", decimals=0, symbol="TK0")
tok1_md = fa2.make_metadata(name="Token One", decimals=0, symbol="TK1")
ledger = {0: alice.address, 1: bob.address}         # NFT: token_id → owner
token_metadata = [tok0_md, tok1_md]                  # list of metadata maps

contract = my_module.MyNFT(admin.address, sp.big_map(), ledger, token_metadata)
scenario += contract

# NOW you can safely query views:
scenario.verify(_total_supply(contract, sp.record(token_id=0)) == 1)  # OK
```

2. **Or mint first, then query:**
```python
contract = my_module.MyNFT(admin.address, sp.big_map(), {}, [])  # empty
scenario += contract

# Mint first
contract.mint([sp.record(metadata=tok0_md, to_=alice.address)], _sender=admin)

# NOW query is safe:
scenario.verify(_total_supply(contract, sp.record(token_id=0)) == 1)  # OK
```

**NEVER do this** — it will crash with `FA2_TOKEN_UNDEFINED`:
```python
contract = my_module.MyNFT(admin.address, sp.big_map(), {}, [])
scenario += contract
# WRONG: token 0 doesn't exist yet!
scenario.verify(_total_supply(contract, sp.record(token_id=0)) == 0)  # CRASH!
```

### FA2 Test Helper Functions
Always define these helpers outside `@sp.module` for view access:
```python
def _get_balance(fa2_contract, args):
    return sp.View(fa2_contract, "get_balance")(args)

def _total_supply(fa2_contract, args):
    return sp.View(fa2_contract, "total_supply")(args)
```

For full details on all three token types (NFT, Fungible, SingleAsset), mixin options,
mint/burn/transfer patterns, and custom entrypoints, read:
- `examples/03-fa2-with-library.md` — complete examples with tests
- `references/fa2-patterns.md` — mixin reference and ordering rules
- `templates/fa2_lib_nft.py` — **official NFT test (guaranteed working)**
- `templates/fa2_lib.py` — actual library source code

### Alternative: Build FA2 From Scratch
When you need full control, see `examples/04-fa2-from-scratch.md` and
`templates/fa2_nft_minimal.py` / `templates/fa2_fungible_minimal.py`.

---

## Workflow

When generating a SmartPy contract:

1. **Read the matching reference file(s)** from the routing table above
2. Identify storage fields, entrypoints, and types needed
3. Write the contract inside `@sp.module` using only new syntax
4. Add `sp.cast()` for empty collections and complex storage
5. Define named types at module level where useful
6. Write a test scenario with `@sp.add_test()` covering happy + failure paths
7. **Self-review**: scan your output against the banned syntax table — if you see
   anything from the left column, fix it immediately

---

## Templates Directory

The `templates/` directory contains **20 official `.py` files** extracted from the SmartPy
repository. These are the ground truth — if a reference file and a template disagree,
the template is correct. Key files:

| File                        | What it demonstrates                                    |
|-----------------------------|---------------------------------------------------------|
| `syntax.py`                 | Comprehensive syntax demo (comparisons, loops, types)   |
| `fa2_lib.py`                | FA2 library source code (all base classes & mixins)     |
| `fa2_lib_nft.py`            | NFT contract using FA2 library                          |
| `fa2_lib_fungible.py`       | Fungible token using FA2 library                        |
| `fa2_lib_single_asset.py`   | Single-asset token using FA2 library                    |
| `fa2_nft_minimal.py`        | NFT from scratch (no library)                           |
| `fa2_fungible_minimal.py`   | Fungible from scratch (no library)                      |
| `escrow.py`                 | Escrow with hashing, time, tez handling                 |
| `multisig_lambda.py`        | Multisig with lambda voting                             |
| `upgradable_lambdas.py`     | Hot-swappable contract logic                            |
| `create_contract.py`        | Contract factory pattern                                |
| `inter_contract_calls.py`   | Clean inter-contract call pattern                       |
| `contract_metadata.py`      | TZIP-16 metadata setup                                  |
| `voting.py`                 | Voting / governance contract                            |
| `calculator.py`             | Loops, ranges, multiple entrypoints                     |
| `minimal.py`                | Absolute minimum contract                               |
| `storeValue.py`             | Basic storage and params                                |
| `atomicSwap.py`             | Atomic swap with secrets                                |
| `collatz.py`                | Inter-contract calls with callbacks                     |
