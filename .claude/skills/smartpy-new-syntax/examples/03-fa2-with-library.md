# FA2 Contracts Using the FA2 Library — Official Templates

The recommended way to build FA2 token contracts. Uses `smartpy.templates.fa2_lib` for
base classes and mixins. All three token types: NFT, Fungible, SingleAsset.

---

## Setup Pattern (same for all three)

```python
import smartpy as sp
from smartpy.templates import fa2_lib as fa2

# Alias the FA2 main module
main = fa2.main
```

---

## 1. NFT Contract (fa2_lib_nft.py)

```python
import smartpy as sp
from smartpy.templates import fa2_lib as fa2

main = fa2.main


@sp.module
def my_module():
    import main

    # Order of inheritance: [Admin], [<policy>], <base class>, [<other mixins>].
    class MyNFTContract(
        main.Admin,
        main.Nft,
        main.MintNft,
        main.BurnNft,
        main.OnchainviewBalanceOf,
    ):
        def __init__(self, admin_address, contract_metadata, ledger, token_metadata):
            # Initialize in REVERSE order of inheritance (bottom → top):
            # 1. Other mixins
            main.OnchainviewBalanceOf.__init__(self)
            main.BurnNft.__init__(self)
            main.MintNft.__init__(self)
            # 2. Base class
            main.Nft.__init__(self, contract_metadata, ledger, token_metadata)
            # 3. Admin (last)
            main.Admin.__init__(self, admin_address)
```

### NFT Test

**IMPORTANT**: FA2 library views (`total_supply`, `get_balance`) raise `FA2_TOKEN_UNDEFINED`
if you query a token_id that was never registered. You must either pre-populate tokens at
origination or mint them before querying views. See the pattern below.

```python
# View helper functions — define OUTSIDE @sp.module (pure Python)
def _get_balance(fa2_contract, args):
    return sp.View(fa2_contract, "get_balance")(args)

def _total_supply(fa2_contract, args):
    return sp.View(fa2_contract, "total_supply")(args)


@sp.add_test()
def test():
    scenario = sp.test_scenario("fa2_lib_nft")
    scenario.h1("FA2 NFT contract test")

    admin = sp.test_account("Admin")
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")

    # Token metadata
    tok0_md = fa2.make_metadata(name="Token Zero", decimals=1, symbol="Tok0")
    tok1_md = fa2.make_metadata(name="Token One", decimals=1, symbol="Tok1")
    tok2_md = fa2.make_metadata(name="Token Two", decimals=1, symbol="Tok2")
    token_metadata = [tok0_md, tok1_md, tok2_md]

    # NFT ledger: token_id → owner address
    # PRE-POPULATE tokens here so views work immediately after origination!
    ledger = {0: alice.address, 1: alice.address, 2: bob.address}

    contract = my_module.MyNFTContract(
        admin.address, sp.big_map(), ledger, token_metadata
    )

    # TZIP-16 Contract Metadata
    contract_metadata = sp.create_tzip16_metadata(
        name="My FA2 NFT contract",
        description="This is an FA2 NFT contract using SmartPy.",
        version="1.0.0",
        license_name="CC-BY-SA",
        license_details="Creative Commons Attribution Share Alike license 4.0",
        interfaces=["TZIP-012", "TZIP-016"],
        authors=["SmartPy <https://smartpy.io/#contact>"],
        homepage="https://smartpy.io/ide?template=fa2_lib_nft.py",
        source_uri=None,
        offchain_views=contract.get_offchain_views(),
    )
    contract_metadata["permissions"] = {
        "operator": "owner-or-operator-transfer",
        "receiver": "owner-no-hook",
        "sender": "owner-no-hook",
    }

    metadata_uri = "ipfs://example"
    contract.data.metadata = sp.scenario_utils.metadata_of_url(metadata_uri)
    scenario += contract

    # Verify balances — SAFE because tokens 0,1,2 were pre-populated above
    scenario.verify(
        _get_balance(contract, sp.record(owner=alice.address, token_id=0)) == 1
    )
    scenario.verify(_total_supply(contract, sp.record(token_id=0)) == 1)

    # Transfer
    contract.transfer(
        [
            sp.record(
                from_=alice.address,
                txs=[sp.record(to_=bob.address, amount=1, token_id=0)],
            ),
        ],
        _sender=alice,
    )

    # Mint (admin only) — creates token_id=3
    nft3_md = fa2.make_metadata(name="Token Three", decimals=1, symbol="Tok3")
    contract.mint(
        [sp.record(metadata=nft3_md, to_=bob.address)],
        _sender=admin,
    )
    # Non-admin mint fails
    contract.mint(
        [sp.record(metadata=nft3_md, to_=bob.address)],
        _sender=bob,
        _valid=False,
    )

    # NOW token 3 exists, so we can safely query its supply
    scenario.verify(_total_supply(contract, sp.record(token_id=3)) == 1)

    # Burn (owner can burn own tokens)
    contract.burn(
        [sp.record(token_id=3, from_=bob.address, amount=1)], _sender=bob
    )
    # Can't burn someone else's token
    contract.burn(
        [sp.record(token_id=3, from_=bob.address, amount=1)],
        _sender=alice,
        _valid=False,
    )
```

---

## 2. Fungible Token Contract (fa2_lib_fungible.py)

```python
import smartpy as sp
from smartpy.templates import fa2_lib as fa2

main = fa2.main


@sp.module
def my_module():
    import main

    class MyFungibleContract(
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
```

### Fungible Mint Pattern (key difference from NFT)

```python
# Mint NEW token type
contract.mint(
    [
        sp.record(to_=alice.address, amount=100, token=sp.variant("new", tok0_md)),
        sp.record(to_=bob.address, amount=100, token=sp.variant("new", tok1_md)),
    ],
    _sender=admin,
)

# Mint EXISTING token (increase supply)
contract.mint(
    [
        sp.record(to_=alice.address, amount=100, token=sp.variant("existing", 0)),
        sp.record(to_=bob.address, amount=100, token=sp.variant("existing", 1)),
    ],
    _sender=admin,
)
```

**Key difference:** Fungible mint uses `sp.variant("new", metadata)` for new token types and `sp.variant("existing", token_id)` to mint more of an existing token.

---

## 3. Single Asset Contract (fa2_lib_single_asset.py)

```python
import smartpy as sp
from smartpy.templates import fa2_lib as fa2

main = fa2.main


@sp.module
def my_module():
    import main

    class MySingleAssetContract(
        main.Admin,
        main.SingleAsset,
        main.MintSingleAsset,
        main.BurnSingleAsset,
        main.OnchainviewBalanceOf,
    ):
        def __init__(self, admin_address, contract_metadata, ledger, token_metadata):
            main.OnchainviewBalanceOf.__init__(self)
            main.MintSingleAsset.__init__(self)
            main.BurnSingleAsset.__init__(self)
            main.SingleAsset.__init__(self, contract_metadata, ledger, token_metadata)
            main.Admin.__init__(self, admin_address)
```

### Single Asset Mint Pattern (simplest)

```python
# Single asset: only token_id=0, no token variant needed
contract.mint(
    [
        sp.record(to_=alice.address, amount=100),
        sp.record(to_=bob.address, amount=100),
    ],
    _sender=admin,
)
```

---

## Transfer Pattern (same for all three)

```python
contract.transfer(
    [
        sp.record(
            from_=alice.address,
            txs=[sp.record(to_=bob.address, amount=5, token_id=0)],
        ),
    ],
    _sender=alice,
)
```

---

## Burn Pattern (same for all three)

```python
# Burn own tokens
contract.burn(
    [sp.record(token_id=0, from_=alice.address, amount=1)],
    _sender=alice,
)
```

---

## Available Mixins Quick Reference

| Mixin | Purpose |
|-------|---------|
| `main.Admin` | Admin-only entrypoints |
| `main.Nft` | NFT base (ledger: token_id → address) |
| `main.Fungible` | Fungible base (ledger: (address, token_id) → nat) |
| `main.SingleAsset` | Single fungible token (ledger: address → nat) |
| `main.MintNft` / `main.MintFungible` / `main.MintSingleAsset` | Mint entrypoint |
| `main.BurnNft` / `main.BurnFungible` / `main.BurnSingleAsset` | Burn entrypoint |
| `main.OnchainviewBalanceOf` | On-chain balance view |
| `main.OffchainviewTokenMetadata` | Off-chain token metadata view |
| `main.OffchainviewAllTokens` | Off-chain all tokens view |

## Mixin Init Order Rule

**Inheritance** (top to bottom): Admin → Policy → Base → Mixins
**Init calls** (bottom to top): Mixins → Base → Policy → Admin

## Metadata Helper

```python
fa2.make_metadata(name="My Token", decimals=0, symbol="TOK")
```
Returns `sp.map[sp.string, sp.bytes]` suitable for `token_metadata`.
