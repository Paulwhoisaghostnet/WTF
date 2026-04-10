# FA2 Token Contract Patterns

## Table of Contents
1. [Setup and Imports](#setup-and-imports)
2. [NFT Contract](#nft-contract)
3. [Fungible Token Contract](#fungible-token-contract)
4. [Single Asset Contract](#single-asset-contract)
5. [Mixins Reference](#mixins-reference)
6. [Mixin Ordering Rules](#mixin-ordering-rules)
7. [Token Metadata](#token-metadata)
8. [Custom Entrypoints](#custom-entrypoints)
9. [Common Patterns](#common-patterns)

---

## Setup and Imports

```python
import smartpy as sp
from smartpy.templates import fa2_lib as fa2

# Alias the FA2 main module
main = fa2.main
```

## NFT Contract

```python
import smartpy as sp
from smartpy.templates import fa2_lib as fa2

main = fa2.main

@sp.module
def my_module():
    import main

    class MyNFT(
        main.Admin,
        main.Nft,
        main.MintNft,
        main.BurnNft,
        main.OnchainviewBalanceOf,
    ):
        def __init__(self, admin_address, contract_metadata, ledger, token_metadata):
            main.OnchainviewBalanceOf.__init__(self)
            main.BurnNft.__init__(self)
            main.MintNft.__init__(self)
            main.Nft.__init__(self, contract_metadata, ledger, token_metadata)
            main.Admin.__init__(self, admin_address)


@sp.add_test()
def test():
    scenario = sp.test_scenario("NFT Test", [fa2.t, fa2.main, my_module])
    
    admin = sp.test_account("Admin")
    alice = sp.test_account("Alice")
    
    tok0_md = fa2.make_metadata(name="Token Zero", decimals=0, symbol="TK0")
    
    contract = my_module.MyNFT(
        admin_address=admin.address,
        contract_metadata=sp.big_map(),
        ledger={},
        token_metadata=[],
    )
    scenario += contract
    
    # Mint a token
    contract.mint([
        sp.record(
            to_=alice.address,
            metadata=tok0_md,
        )
    ], _sender=admin)
    
    # Verify ownership
    scenario.verify(contract.data.ledger[0] == alice.address)
```

---

## Fungible Token Contract

```python
import smartpy as sp
from smartpy.templates import fa2_lib as fa2

main = fa2.main

@sp.module
def my_module():
    import main

    class MyFungible(
        main.Admin,
        main.Fungible,
        main.MintFungible,
        main.BurnFungible,
        main.OnchainviewBalanceOf,
    ):
        def __init__(self, admin_address, contract_metadata, ledger, token_metadata):
            main.OnchainviewBalanceOf.__init__(self)
            main.BurnFungible.__init__(self)
            main.MintFungible.__init__(self)
            main.Fungible.__init__(self, contract_metadata, ledger, token_metadata)
            main.Admin.__init__(self, admin_address)


@sp.add_test()
def test():
    scenario = sp.test_scenario("Fungible Test", [fa2.t, fa2.main, my_module])
    
    admin = sp.test_account("Admin")
    alice = sp.test_account("Alice")
    
    tok0_md = fa2.make_metadata(name="My Token", decimals=6, symbol="MYT")
    
    contract = my_module.MyFungible(
        admin_address=admin.address,
        contract_metadata=sp.big_map(),
        ledger=sp.big_map(),
        token_metadata=[],
    )
    scenario += contract
    
    # Mint tokens
    contract.mint([
        sp.record(
            to_=alice.address,
            token=sp.variant.new(tok0_md),
            amount=1000,
        )
    ], _sender=admin)
```

---

## Single Asset Contract

```python
import smartpy as sp
from smartpy.templates import fa2_lib as fa2

main = fa2.main

@sp.module
def my_module():
    import main

    class MySingleAsset(
        main.Admin,
        main.SingleAsset,
        main.MintSingleAsset,
        main.BurnSingleAsset,
        main.OnchainviewBalanceOf,
    ):
        def __init__(self, admin_address, contract_metadata, ledger, token_metadata):
            main.OnchainviewBalanceOf.__init__(self)
            main.BurnSingleAsset.__init__(self)
            main.MintSingleAsset.__init__(self)
            main.SingleAsset.__init__(self, contract_metadata, ledger, token_metadata)
            main.Admin.__init__(self, admin_address)
```

---

## Mixins Reference

### Admin Mixins
| Mixin | Description |
|-------|-------------|
| `main.Admin` | Admin management with `is_administrator` check and `set_administrator` entrypoint |

### Mint Mixins
| Mixin | Base Class | Description |
|-------|-----------|-------------|
| `main.MintNft` | `Nft` | Mint NFTs (auto-increment token_id) |
| `main.MintFungible` | `Fungible` | Mint fungible tokens |
| `main.MintSingleAsset` | `SingleAsset` | Mint single-asset tokens |

### Burn Mixins
| Mixin | Base Class | Description |
|-------|-----------|-------------|
| `main.BurnNft` | `Nft` | Burn NFTs |
| `main.BurnFungible` | `Fungible` | Burn fungible tokens |
| `main.BurnSingleAsset` | `SingleAsset` | Burn single-asset tokens |

### View Mixins
| Mixin | Description |
|-------|-------------|
| `main.OnchainviewBalanceOf` | On-chain view for token balances |

### Transfer Policy Mixins
| Mixin | Description |
|-------|-------------|
| `main.OwnerOrOperatorTransfer` | Only owner or approved operator (default) |
| `main.OwnerTransfer` | Only owner can transfer |
| `main.NoTransfer` | No transfers allowed |

---

## Mixin Ordering Rules

**CRITICAL**: Order matters in both the class definition AND `__init__`:

### Class Inheritance Order
```
[Admin], [TransferPolicy], BaseClass, [Mint], [Burn], [Views], [Custom]
```

### `__init__` Reverse Order
Initialize in REVERSE order of inheritance (bottom to top):
```python
def __init__(self, ...):
    main.OnchainviewBalanceOf.__init__(self)    # Last mixin first
    main.BurnNft.__init__(self)
    main.MintNft.__init__(self)
    main.Nft.__init__(self, metadata, ledger, token_metadata)  # Base class
    main.Admin.__init__(self, admin)            # First mixin last
```

---

## Token Metadata

### Using the helper
```python
tok_md = fa2.make_metadata(
    name="My Token",
    decimals=0,
    symbol="TK",
)
```

### Custom metadata
```python
def create_metadata(name, decimals, symbol, displayUri, artifactUri, description, thumbnailUri):
    return sp.map(
        l={
            "name": sp.scenario_utils.bytes_of_string(name),
            "decimals": sp.scenario_utils.bytes_of_string("%d" % decimals),
            "symbol": sp.scenario_utils.bytes_of_string(symbol),
            "displayUri": sp.scenario_utils.bytes_of_string(displayUri),
            "artifactUri": sp.scenario_utils.bytes_of_string(artifactUri),
            "description": sp.scenario_utils.bytes_of_string(description),
            "thumbnailUri": sp.scenario_utils.bytes_of_string(thumbnailUri),
        }
    )
```

---

## Custom Entrypoints

Adding custom entrypoints to an FA2 contract:

```python
@sp.module
def my_module():
    import main

    class MyNFTWithCustom(
        main.Admin,
        main.Nft,
        main.MintNft,
        main.BurnNft,
        main.OnchainviewBalanceOf,
    ):
        def __init__(self, admin_address, contract_metadata, ledger, token_metadata):
            main.OnchainviewBalanceOf.__init__(self)
            main.BurnNft.__init__(self)
            main.MintNft.__init__(self)
            main.Nft.__init__(self, contract_metadata, ledger, token_metadata)
            main.Admin.__init__(self, admin_address)
            # Custom storage fields
            self.data.prices = sp.big_map()
            sp.cast(self.data.prices, sp.big_map[sp.nat, sp.mutez])

        @sp.entrypoint
        def set_price(self, token_id, price):
            assert self.is_administrator_(sp.sender), "NOT_ADMIN"
            assert self.data.token_metadata.contains(token_id), "TOKEN_NOT_FOUND"
            self.data.prices[token_id] = price

        @sp.entrypoint
        def buy(self, token_id):
            price = self.data.prices.get(token_id, error="NO_PRICE_SET")
            assert sp.amount >= price, "INSUFFICIENT_PAYMENT"
            owner = self.data.ledger[token_id]
            # Transfer token
            self.data.ledger[token_id] = sp.sender
            # Pay the seller
            sp.send(owner, price)
```

---

## Common Patterns

### Royalties Pattern
```python
self.data.royalties = sp.big_map()
sp.cast(self.data.royalties, sp.big_map[sp.nat, sp.record(
    creator=sp.address,
    royalty_pct=sp.nat,  # basis points (e.g., 500 = 5%)
)])
```

### Whitelist / Allowlist
```python
self.data.whitelist = set()
sp.cast(self.data.whitelist, sp.set[sp.address])

@sp.entrypoint
def mint_whitelist(self):
    assert self.data.whitelist.contains(sp.sender), "NOT_WHITELISTED"
    # mint logic...
```

### Max Supply Limit
```python
@sp.entrypoint
def mint(self, metadata):
    assert self.is_administrator_(sp.sender), "NOT_ADMIN"
    assert self.data.next_token_id < self.data.max_supply, "MAX_SUPPLY_REACHED"
    # mint logic...
```

### Pause Mechanism
```python
@sp.entrypoint
def set_pause(self, paused):
    assert self.is_administrator_(sp.sender), "NOT_ADMIN"
    self.data.paused = paused

# In transfer or other entrypoints:
assert not self.data.paused, "CONTRACT_PAUSED"
```

---

## FA2 Testing Rules

### Critical: Token Must Exist Before Querying Views

The FA2 library views (`total_supply`, `get_balance`, `all_tokens`) check `is_defined(token_id)` internally.
If the token_id was never registered (via pre-populated ledger or minting), the view raises `FA2_TOKEN_UNDEFINED`.

A non-existent token is **NOT** the same as a token with 0 supply or 0 balance.

```python
# WRONG — will crash with FA2_TOKEN_UNDEFINED:
contract = my_module.MyNFT(admin.address, sp.big_map(), {}, [])  # empty ledger
scenario += contract
scenario.verify(_total_supply(contract, sp.record(token_id=0)) == 0)  # CRASH!

# CORRECT — pre-populate tokens:
ledger = {0: alice.address, 1: bob.address}
token_metadata = [tok0_md, tok1_md]
contract = my_module.MyNFT(admin.address, sp.big_map(), ledger, token_metadata)
scenario += contract
scenario.verify(_total_supply(contract, sp.record(token_id=0)) == 1)  # OK

# ALSO CORRECT — mint first, then query:
contract = my_module.MyNFT(admin.address, sp.big_map(), {}, [])
scenario += contract
contract.mint([sp.record(metadata=tok0_md, to_=alice.address)], _sender=admin)
scenario.verify(_total_supply(contract, sp.record(token_id=0)) == 1)  # OK
```

### Test Flow for FA2 Contracts

The recommended test order:
1. Define test accounts (`sp.test_account`)
2. Create token metadata (`fa2.make_metadata`)
3. Originate contract with pre-populated ledger and token_metadata
4. Verify initial balances (safe because tokens exist)
5. Test transfers
6. Test minting new tokens
7. Verify newly minted token views (safe because mint registered them)
8. Test burning
9. Test permission failures (`_valid=False`)

### View Helper Functions

Always define outside `@sp.module` (pure Python):
```python
def _get_balance(fa2_contract, args):
    return sp.View(fa2_contract, "get_balance")(args)

def _total_supply(fa2_contract, args):
    return sp.View(fa2_contract, "total_supply")(args)
```
