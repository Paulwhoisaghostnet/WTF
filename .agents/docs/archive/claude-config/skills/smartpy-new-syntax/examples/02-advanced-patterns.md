# SmartPy Advanced Patterns — Official Template Examples

Contracts demonstrating tez handling, hashing, time logic, private functions, and inter-contract calls.

---

## 1. Escrow — Tez Handling, Time, Hashing, Private Functions

```python
import smartpy as sp


@sp.module
def main():
    class Escrow(sp.Contract):
        def __init__(
            self, owner, fromOwner, counterparty, fromCounterparty, epoch, hashedSecret
        ):
            self.data.fromOwner = fromOwner
            self.data.fromCounterparty = fromCounterparty
            self.data.balanceOwner = sp.tez(0)
            self.data.balanceCounterparty = sp.tez(0)
            self.data.hashedSecret = hashedSecret
            self.data.epoch = epoch
            self.data.owner = owner
            self.data.counterparty = counterparty

        @sp.entrypoint
        def addBalanceOwner(self):
            assert self.data.balanceOwner == sp.tez(0)
            assert sp.amount == self.data.fromOwner
            self.data.balanceOwner = self.data.fromOwner

        @sp.entrypoint
        def addBalanceCounterparty(self):
            assert self.data.balanceCounterparty == sp.tez(0)
            assert sp.amount == self.data.fromCounterparty
            self.data.balanceCounterparty = self.data.fromCounterparty

        @sp.private(with_storage="read-write", with_operations=True)
        def claim(self, identity):
            assert sp.sender == identity
            sp.send(identity, self.data.balanceOwner + self.data.balanceCounterparty)
            self.data.balanceOwner = sp.tez(0)
            self.data.balanceCounterparty = sp.tez(0)

        @sp.entrypoint
        def claimCounterparty(self, params):
            assert sp.now < self.data.epoch
            assert self.data.hashedSecret == sp.blake2b(params.secret)
            self.claim(self.data.counterparty)

        @sp.entrypoint
        def claimOwner(self):
            assert self.data.epoch < sp.now
            self.claim(self.data.owner)


@sp.add_test()
def test():
    scenario = sp.test_scenario("Escrow")
    scenario.h1("Escrow")
    hashSecret = sp.blake2b(sp.bytes("0x01223344"))
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")
    c1 = main.Escrow(
        alice.address, sp.tez(50), bob.address, sp.tez(4), sp.timestamp(123), hashSecret
    )
    scenario += c1

    c1.addBalanceOwner(_sender=alice, _amount=sp.tez(50))
    c1.addBalanceCounterparty(_sender=bob, _amount=sp.tez(4))
    scenario.h3("Erroneous secret")
    c1.claimCounterparty(secret=sp.bytes("0x01223343"), _sender=bob, _valid=False)
    scenario.h3("Correct secret")
    c1.claimCounterparty(secret=sp.bytes("0x01223344"), _sender=bob)
```

**Patterns demonstrated:**
- `sp.amount` — access tez sent with transaction
- `sp.tez(n)` / `sp.mutez(n)` — tez values
- `sp.send(address, amount)` — transfer tez
- `sp.now` — current timestamp
- `sp.timestamp(n)` — timestamp from integer
- `sp.blake2b(bytes)` — hashing
- `sp.bytes("0x...")` — bytes literal
- `sp.sender` — caller address
- `@sp.private(with_storage="read-write", with_operations=True)` — private function that can modify storage and emit operations
- `_sender=alice, _amount=sp.tez(50)` — test params

---

## 2. Atomic Swap — Secrets, Deadlines, sp.send

```python
import smartpy as sp


@sp.module
def main():
    class AtomicSwap(sp.Contract):
        def __init__(self, notional, epoch, hashedSecret, owner, counterparty):
            self.data.notional = notional
            self.data.hashedSecret = hashedSecret
            self.data.epoch = epoch
            self.data.owner = owner
            self.data.counterparty = counterparty

        @sp.private(with_storage="read-write")
        def checkAlive(self, identity):
            assert self.data.notional != sp.mutez(0)
            assert identity == sp.sender

        @sp.private(with_storage="read-write")
        def finish(self):
            self.data.notional = sp.mutez(0)

        @sp.entrypoint
        def allSigned(self):
            self.checkAlive(self.data.owner)
            sp.send(self.data.counterparty, self.data.notional)
            self.finish()

        @sp.entrypoint
        def cancelSwap(self):
            self.checkAlive(self.data.owner)
            assert self.data.epoch < sp.now
            sp.send(self.data.owner, self.data.notional)
            self.finish()

        @sp.entrypoint
        def knownSecret(self, params):
            self.checkAlive(self.data.counterparty)
            assert self.data.hashedSecret == sp.blake2b(params.secret)
            sp.send(self.data.counterparty, self.data.notional)
            self.finish()


@sp.add_test()
def test():
    hashSecret = sp.blake2b(sp.bytes("0x12345678aabb"))
    alice = sp.test_account("Alice")
    bob = sp.test_account("Robert")
    scenario = sp.test_scenario("AtomicSwap")
    scenario.h1("Atomic Swap")

    c1 = main.AtomicSwap(
        sp.mutez(12), sp.timestamp(50), hashSecret, alice.address, bob.address
    )
    c1.set_initial_balance(sp.tez(3))
    scenario += c1
    c1.knownSecret(secret=sp.bytes("0x12345678aa"), _sender=bob, _valid=False)
    c1.knownSecret(secret=sp.bytes("0x12345678aabb"), _sender=bob)
```

**Patterns demonstrated:**
- `sp.mutez(n)` — mutez values
- `set_initial_balance(sp.tez(3))` — set contract balance in tests
- Multiple `@sp.private` helpers for code reuse
- `@sp.private(with_storage="read-write")` without operations (default: no operations)

---

## 3. Collatz — Inter-Contract Calls with sp.transfer

```python
import smartpy as sp


@sp.module
def main():
    class OnEven(sp.Contract):
        @sp.entrypoint
        def run(self, params):
            sp.transfer(params.x / 2, sp.mutez(0), params.k)

    class OnOdd(sp.Contract):
        @sp.entrypoint
        def run(self, params):
            sp.transfer(3 * params.x + 1, sp.mutez(0), params.k)

    class Collatz(sp.Contract):
        def __init__(self, onEven, onOdd):
            self.data.onEven = onEven
            self.data.onOdd = onOdd
            self.data.counter = 0

        @sp.entrypoint
        def run(self, x):
            if x > 1:
                self.data.counter += 1
                params = sp.record(k=sp.self_entrypoint("run"), x=x)
                if sp.mod(x, 2) == 0:
                    sp.transfer(
                        params,
                        sp.mutez(0),
                        sp.contract(
                            sp.record(k=sp.contract[sp.int_or_nat], x=sp.int_or_nat),
                            self.data.onEven,
                        ).unwrap_some(),
                    )
                else:
                    sp.transfer(
                        params,
                        sp.mutez(0),
                        sp.contract(
                            sp.record(k=sp.contract[sp.int_or_nat], x=sp.int_or_nat),
                            self.data.onOdd,
                        ).unwrap_some(),
                    )

        @sp.entrypoint
        def reset(self):
            self.data.counter = 0


@sp.add_test()
def test():
    scenario = sp.test_scenario("Collatz")
    scenario.h1("Collatz - Inter-Contract Calls")
    on_even = main.OnEven()
    scenario += on_even
    on_odd = main.OnOdd()
    scenario += on_odd
    collatz = main.Collatz(onEven=on_even.address, onOdd=on_odd.address)
    scenario += collatz
    collatz.run(42)
    scenario.verify(collatz.data.counter == 8)
    collatz.reset()
    collatz.run(5)
    scenario.verify(collatz.data.counter == 5)
```

**Patterns demonstrated:**
- `sp.transfer(data, amount, contract_handle)` — call another contract
- `sp.contract(param_type, address)` — get contract handle by address
- `sp.contract(param_type, address, "entrypoint_name")` — specific entrypoint
- `.unwrap_some()` — unwrap option (contract might not exist)
- `sp.self_entrypoint("name")` — reference to own entrypoint (for callbacks)
- `sp.mod(x, 2)` — modulo operation
- `sp.int_or_nat` — type that accepts both int and nat
- Multiple contracts in one module

---

## 4. Inter-Contract Calls — Clean Pattern with Type Definitions

```python
import smartpy as sp


@sp.module
def main():
    # Worker contract that stores a string
    class Worker(sp.Contract):
        def __init__(self):
            self.data.message = ""

        @sp.entrypoint
        def set_message(self, message):
            self.data.message = message

        @sp.entrypoint
        def append_message(self, message, separator):
            if sp.len(self.data.message) == 0:
                self.data.message = message
            else:
                self.data.message = sp.concat([self.data.message, separator, message])

    # Module-level type definitions for entrypoint signatures
    set_message_args_type: type = sp.string
    append_message_args_type: type = sp.record(message=sp.string, separator=sp.string)

    # Main contract that calls Worker
    class Main(sp.Contract):
        def __init__(self, worker_contract_address):
            self.data.worker_contract_address = worker_contract_address

        @sp.entrypoint
        def store_single_message(self, message):
            # Get handle to the entrypoint (returns sp.option → unwrap)
            set_message_entrypoint = sp.contract(
                set_message_args_type, self.data.worker_contract_address, "set_message"
            ).unwrap_some()
            # Call the entrypoint
            sp.transfer(message, sp.tez(0), set_message_entrypoint)

        @sp.entrypoint
        def append_multiple_messages(self, params):
            sp.cast(params, sp.record(messages=sp.list[sp.string], separator=sp.string))

            append_message_entrypoint = sp.contract(
                append_message_args_type,
                self.data.worker_contract_address,
                "append_message",
            ).unwrap_some()

            for message in params.messages:
                append_message_args = sp.record(
                    message=message, separator=params.separator
                )
                sp.transfer(append_message_args, sp.tez(0), append_message_entrypoint)


@sp.add_test()
def test():
    scenario = sp.test_scenario("InterContractCalls")
    scenario.h1("Inter-Contract Calls")

    # Originate Worker
    worker_contract = main.Worker()
    scenario += worker_contract

    # Direct calls
    worker_contract.set_message("Directly set a message")
    scenario.verify(worker_contract.data.message == "Directly set a message")

    # Originate Main with Worker's address
    main_contract = main.Main(worker_contract.address)
    scenario += main_contract

    # Indirect calls via Main → Worker
    main_contract.store_single_message("Indirectly set a message")
    scenario.verify(worker_contract.data.message == "Indirectly set a message")

    main_contract.append_multiple_messages(
        messages=["and", "append", "some", "more"], separator=", "
    )
    scenario.verify(
        worker_contract.data.message
        == "Indirectly set a message, and, append, some, more"
    )
```

**Patterns demonstrated:**
- Module-level type aliases: `my_type: type = sp.record(...)`
- `sp.contract(type, address, "entrypoint")` — typed contract reference
- `sp.cast(params, type)` — explicit type casting for parameters
- `sp.len(string)` — string length
- `sp.concat([...])` — concatenate list of strings
- `for item in list` — iteration
- Clean architecture: separate Worker + Controller contracts

---

## Key Takeaways from Advanced Patterns

1. **Private functions** use `@sp.private(with_storage=..., with_operations=...)`
2. **Inter-contract calls** always follow: get handle → unwrap → transfer
3. **Type definitions** at module level help with `sp.contract()` signatures
4. **sp.amount, sp.sender, sp.now** — key blockchain context variables
5. **Hashing**: `sp.blake2b()`, `sp.sha256()`, `sp.sha512()`
6. **Tez**: `sp.tez(n)`, `sp.mutez(n)`, `sp.send(addr, amount)`
