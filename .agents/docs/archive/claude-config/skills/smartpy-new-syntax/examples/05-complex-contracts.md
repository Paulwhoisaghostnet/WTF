# SmartPy Complex Contracts — Official Templates

Advanced patterns: multisig voting, lambda-based upgrades, contract factories, metadata.

---

## 1. Multisig Lambda — Voting + Lambda Execution

Members submit lambdas, vote on them, and when quorum is reached the lambda executes.

```python
import smartpy as sp


@sp.module
def main():
    operation_lambda: type = sp.lambda_(sp.unit, sp.unit, with_operations=True)

    class MultisigLambda(sp.Contract):
        """Multiple members vote for executing lambdas."""

        def __init__(self, members: sp.set[sp.address], required_votes: sp.nat):
            assert required_votes <= sp.len(
                members
            ), "required_votes must be <= len(members)"
            self.data.lambdas = sp.cast(
                sp.big_map(), sp.big_map[sp.nat, operation_lambda]
            )
            self.data.votes = sp.cast(
                sp.big_map(), sp.big_map[sp.nat, sp.set[sp.address]]
            )
            self.data.nextId = 0
            self.data.inactiveBefore = 0
            self.data.members = members
            self.data.required_votes = required_votes

        @sp.entrypoint
        def submit_lambda(self, lambda_):
            assert sp.sender in self.data.members, "You are not a member"
            self.data.lambdas[self.data.nextId] = lambda_
            self.data.votes[self.data.nextId] = set()
            self.data.nextId += 1

        @sp.entrypoint
        def vote_lambda(self, id):
            assert sp.sender in self.data.members, "You are not a member"
            assert id >= self.data.inactiveBefore, "The lambda is inactive"
            assert id in self.data.lambdas, "Lambda not found"
            self.data.votes[id].add(sp.sender)
            if sp.len(self.data.votes[id]) >= self.data.required_votes:
                # Execute the lambda when quorum reached
                self.data.lambdas[id]()
                self.data.inactiveBefore = self.data.nextId

        @sp.onchain_view()
        def get_lambda(self, id):
            return (self.data.lambdas[id], id >= self.data.inactiveBefore)


# --- Test module with a contract to be administered ---

@sp.module
def test():
    class Administrated(sp.Contract):
        def __init__(self, admin):
            self.data.admin = admin
            self.data.value = sp.int(0)

        @sp.entrypoint
        def set_value(self, value):
            assert sp.sender == self.data.admin
            self.data.value = value

    # Lambda with effects (can produce operations)
    @sp.effects(with_operations=True)
    def f(param: sp.pair[sp.address, sp.unit]):
        to_ = sp.fst(param)
        administrated = sp.contract(sp.int, to_, entrypoint="set_value")
        sp.transfer(sp.int(42), sp.tez(0), administrated.unwrap_some())


@sp.add_test()
def basic_scenario():
    sc = sp.test_scenario("MultisigLambda basic scenario")
    sc.h1("Basic scenario.")

    member1 = sp.test_account("member1")
    member2 = sp.test_account("member2")
    member3 = sp.test_account("member3")
    members = {member1.address, member2.address, member3.address}

    sc.h2("MultisigLambda: origination")
    c1 = main.MultisigLambda(members, 2)
    sc += c1

    sc.h2("Administrated: origination")
    c2 = test.Administrated(c1.address)
    sc += c2

    sc.h2("MultisigLambda: submit_lambda")
    # Apply the lambda with the target address
    lambda_ = test.f.apply(c2.address)
    c1.submit_lambda(lambda_, _sender=member1)

    sc.h2("MultisigLambda: vote_lambda")
    c1.vote_lambda(0, _sender=member1)
    c1.vote_lambda(0, _sender=member2)

    # Lambda executed: administrated contract received the value
    sc.verify(c2.data.value == 42)
```

**Patterns demonstrated:**
- `sp.lambda_(param_type, return_type, with_operations=True)` — lambda type definition
- `@sp.effects(with_operations=True)` — define a lambda with side effects
- `lambda.apply(arg)` — partial application of a lambda
- `self.data.lambdas[id]()` — execute a stored lambda
- `set()` — empty set literal
- `set.add(value)` — add to set
- `sp.len(set)` — set length
- `key in big_map` — membership check
- `@sp.onchain_view()` — on-chain view (note: parentheses)
- Multiple `@sp.module` blocks in one file
- Typed constructor parameters: `members: sp.set[sp.address]`

---

## 2. Upgradable Contract — Lambda-Based Logic Upgrade

```python
import smartpy as sp


@sp.module
def main():
    class Upgradable(sp.Contract):
        def __init__(self, value, logic):
            self.data.value = value
            self.data.logic = logic

        @sp.entrypoint
        def calc(self, data):
            self.data.value = self.data.logic(data)

        @sp.entrypoint
        def updateLogic(self, logic):
            self.data.logic = logic

    t1: type = sp.record(x=sp.nat, y=sp.nat)
    t2: type = sp.record(x=sp.nat, y=sp.nat, z=sp.nat)

    # Logic Version 1
    def logic1(data):
        unpacked = sp.unpack(data, t1).unwrap_some(error="Cannot UNPACK")
        return unpacked.x + unpacked.y

    # Logic Version 2
    def logic2(data):
        unpacked = sp.unpack(data, t2).unwrap_some(error="Cannot UNPACK")
        return unpacked.x + unpacked.y + unpacked.z


@sp.add_test()
def test():
    scenario = sp.test_scenario("Upgradable")
    scenario.h1("Upgradable")

    c1 = main.Upgradable(value=0, logic=main.logic1)
    scenario += c1

    # Use logic version 1
    c1.calc(sp.pack(sp.record(x=1, y=2)))

    # Upgrade to version 2
    c1.updateLogic(main.logic2)

    # Use logic version 2
    c1.calc(sp.pack(sp.record(x=1, y=2, z=3)))
```

**Patterns demonstrated:**
- Storing lambdas in contract storage
- `sp.pack(value)` / `sp.unpack(bytes, type)` — serialization
- `.unwrap_some(error="...")` — unwrap option with custom error
- Module-level functions as lambdas: `main.logic1`
- Hot-swappable contract logic via lambda replacement

---

## 3. Contract Factory — sp.create_contract

```python
import smartpy as sp


@sp.module
def main():
    class Created(sp.Contract):
        def __init__(self):
            self.private.px = 10
            self.private.py = 0
            self.data.a = sp.int(0)
            self.data.b = sp.nat(0)

        @sp.entrypoint
        def myEntryPoint(self, params):
            self.data.a += params.x + self.private.px
            self.data.b += params.y + self.private.py

    class Creator(sp.Contract):
        def __init__(self, baker):
            self.private.baker = baker
            self.data.x = None

        @sp.entrypoint
        def create1(self):
            self.data.x = sp.Some(
                sp.create_contract(
                    Created,
                    None,                           # delegate (baker)
                    sp.mutez(123),                   # initial balance
                    sp.record(a=12, b=15),           # initial storage
                    private_=sp.record(px=20, py=13), # private data
                )
            )

        @sp.entrypoint
        def create_with_baker(self):
            self.data.x = sp.Some(
                sp.create_contract(
                    Created,
                    self.private.baker,
                    sp.tez(0),
                    sp.record(a=12, b=15),
                    private_=sp.record(px=20, py=13),
                )
            )


@sp.add_test()
def test():
    scenario = sp.test_scenario("Create")
    scenario.h1("Contract Factory")
    baker = sp.test_account("My baker")

    c = main.Creator(sp.Some(baker.public_key_hash))
    c.set_initial_balance(sp.tez(10))
    scenario += c

    c.create1()

    # Access dynamically created contracts in tests
    dyn0 = scenario.dynamic_contract(main.Created)
    dyn0.myEntryPoint(sp.record(x=1, y=16))
    scenario.verify(dyn0.data.a == 22)  # 1 + 1 + 20
```

**Patterns demonstrated:**
- `sp.create_contract(Class, delegate, balance, storage, private_=...)` — create contract on-chain
- `self.private.field` — private (non-on-chain) storage
- `scenario.dynamic_contract(Class)` — reference last dynamically created contract
- `scenario.dynamic_contract(Class, offset=-N)` — reference Nth-to-last created contract
- `sp.Some(value)` / `None` — option values
- `baker.public_key_hash` — get key hash from test account

---

## 4. Contract Metadata — TZIP-16

```python
import smartpy as sp


@sp.module
def main():
    class MyContract(sp.Contract):
        def __init__(self):
            self.data.x = "Test"
            self.data.metadata = sp.cast(sp.big_map(), sp.big_map[sp.string, sp.bytes])

        @sp.entrypoint
        def ep(self):
            pass

        @sp.offchain_view
        def add_10(self, n: sp.nat):
            """This adds 10."""
            return n + 10


@sp.add_test()
def test():
    sc = sp.test_scenario("Contract metadata")
    c1 = main.MyContract()

    metadata = sp.create_tzip16_metadata(
        name="MyContract",
        version="1.0.0",
        license_name="CC0",
        description="This is a demo contract using SmartPy.",
        authors=["SmartPy <https://smartpy.io/>"],
        homepage="https://smartpy.io/ide?template=contract_metadata.py",
        offchain_views=c1.get_offchain_views(),
        source_uri="ipfs://QmaV5gQ6p9ND9pjc1BPD3dc8oyi8CWEDdueSmkmasiaWGA",
    )

    metadata_uri = "ipfs://QmRpHDSf1P2sCbgYWrxhuWvt3bzTnAmXxPaNeTLCEweCxE"
    c1.data.metadata = sp.scenario_utils.metadata_of_url(metadata_uri)
    sc += c1
```

**Patterns demonstrated:**
- `sp.create_tzip16_metadata(...)` — build TZIP-16 compliant metadata
- `contract.get_offchain_views()` — extract off-chain views for metadata
- `sp.scenario_utils.metadata_of_url(uri)` — convert URI to metadata big_map
- `sp.cast(sp.big_map(), sp.big_map[sp.string, sp.bytes])` — typed empty metadata storage
- `@sp.offchain_view` with type-annotated parameter: `n: sp.nat`
