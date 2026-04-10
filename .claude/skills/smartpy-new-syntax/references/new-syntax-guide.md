# SmartPy New Syntax Complete Reference

## Table of Contents
1. [Module Definition](#module-definition)
2. [Type System](#type-system)
3. [Value Creation](#value-creation)
4. [Contract Data](#contract-data)
5. [Collections](#collections)
6. [Flow Control](#flow-control)
7. [Pattern Matching](#pattern-matching)
8. [Entrypoints & Views](#entrypoints-and-views)
9. [Operations](#operations)
10. [Common Blockchain Patterns](#common-blockchain-patterns)
11. [Differences from Python](#differences-from-python)

---

## Module Definition

SmartPy modules use the `@sp.module` decorator. Code inside is SmartPy (NOT Python).

```python
import smartpy as sp

@sp.module
def main():
    # Types, contracts, and auxiliary functions go here
    pass
```

Multiple modules can import each other:
```python
@sp.module
def utils():
    def helper(x):
        return x + 1

@sp.module
def main():
    import utils
    
    class MyContract(sp.Contract):
        @sp.entrypoint
        def ep(self, x):
            self.data.value = utils.helper(x)
```

For `.spy` files:
```python
import calculator_main as cm
import utils.calculator_main as cm  # subdirectory
```

---

## Type System

### Primitive Types
```python
sp.nat          # Natural numbers (0, 1, 2, ...)
sp.int          # Integers (..., -1, 0, 1, ...)
sp.string       # Strings
sp.bytes        # Byte sequences
sp.bool         # Booleans
sp.address      # Tezos addresses
sp.key          # Public keys
sp.key_hash     # Key hashes
sp.signature    # Cryptographic signatures
sp.timestamp    # Timestamps
sp.mutez        # Micro-tez amounts
sp.chain_id     # Chain identifiers
sp.unit         # Unit type (value is `()`)
sp.operation    # Operations
```

### Composite Types
```python
sp.record(field1=sp.nat, field2=sp.string)   # Named fields
sp.variant(case1=sp.nat, case2=sp.string)    # Tagged union
sp.pair[sp.nat, sp.int]                      # Pair
sp.option[sp.nat]                            # Optional value
sp.list[sp.nat]                              # List
sp.set[sp.nat]                               # Set
sp.map[sp.address, sp.nat]                   # Map
sp.big_map[sp.address, sp.nat]               # Lazy-loaded map
sp.lambda_(sp.nat, sp.int)                   # Lambda
```

### Named Type Definitions
```python
@sp.module
def main():
    # Define at module level
    my_record_type: type = sp.record(
        owner=sp.address,
        amount=sp.nat,
        active=sp.bool,
    )
    
    action_type: type = sp.variant(
        transfer=sp.record(to=sp.address, amount=sp.nat),
        burn=sp.nat,
        pause=sp.unit,
    )
```

---

## Value Creation

```python
# Integers
a = 1                    # inferred as sp.int
b = sp.nat(1)            # explicitly sp.nat
c = sp.cast(1, sp.nat)   # cast to sp.nat

# Tez amounts
amount = sp.tez(5)       # 5 tez
amount = sp.mutez(5000)  # 5000 mutez

# Records
r = sp.record(x=1, y=2)

# Variants
v = sp.variant.Circle(5)
v = sp.variant.None_()   # for None variant case

# Options
o = sp.Some(5)
o = None                 # None option

# Lists, sets, maps
l = [1, 2, 3]
s = {1, 2, 3}            # non-empty set
s = set()                # empty set (then cast)
m = {1: "a", 2: "b"}    # map literal
m = sp.big_map()         # empty big_map

# Empty collections need casting
sp.cast(self.data.my_list, sp.list[sp.nat])
sp.cast(self.data.my_map, sp.map[sp.address, sp.nat])
```

---

## Contract Data

### Initialization
```python
class MyContract(sp.Contract):
    def __init__(self, admin: sp.address, initial_value: sp.nat):
        self.data.admin = admin
        self.data.value = initial_value
        self.data.paused = False
        self.data.ledger = sp.big_map()
        
        # Optional: cast for clarity / layout
        sp.cast(self.data, sp.record(
            admin=sp.address,
            value=sp.nat,
            paused=sp.bool,
            ledger=sp.big_map[sp.address, sp.nat],
        ))
```

### Constants (read-only after init)
```python
def __init__(self):
    self.private.max_supply = sp.nat(10000)
    # self.private fields are read-only after __init__
```

---

## Collections

### Lists
```python
self.data.my_list = []
sp.cast(self.data.my_list, sp.list[sp.int])

# Add element (push to front)
self.data.my_list.push(42)

# Iterate
for item in self.data.my_list:
    # use item

# Sum
total = sp.sum(self.data.my_list)

# Head/tail matching
match my_list:
    case []:
        pass  # empty
    case [head, *tail]:
        # head is first, tail is rest
        pass
```

### Sets
```python
self.data.my_set = set()
sp.cast(self.data.my_set, sp.set[sp.address])

self.data.my_set.add(sp.sender)
# Check membership — NOT `in`, use .contains()
assert self.data.my_set.contains(sp.sender), "Not in set"
```

### Maps & Big Maps
```python
# Map
self.data.prices = sp.cast({}, sp.map[sp.nat, sp.mutez])
self.data.prices[token_id] = sp.mutez(1000000)

# Access with default
price = self.data.prices.get(token_id, default=sp.mutez(0))
# Access with error
price = self.data.prices.get(token_id, error="TOKEN_NOT_FOUND")
# Optional access
price_opt = self.data.prices.get_opt(token_id)

# Delete
del self.data.prices[token_id]

# Iterate (maps only, NOT big_maps)
for item in self.data.prices.items():
    # item.key, item.value
    pass

# Big map — same syntax, but CANNOT iterate or count
self.data.ledger = sp.big_map()
sp.cast(self.data.ledger, sp.big_map[sp.address, sp.nat])
```

---

## Flow Control

```python
# If/else (NO elif!)
if condition_a:
    # ...
else:
    if condition_b:
        # ...
    else:
        # ...

# For loops
for i in range(0, 10):
    # ...

for item in my_list:
    # ...

for entry in my_map.items():
    # entry.key, entry.value

# While loops
while condition:
    # ...
```

---

## Pattern Matching

Only for variants and options:
```python
# Variant matching
match action:
    case Transfer(params):
        # params is the inner value
        pass
    case Burn(amount):
        pass

# Option matching
match self.data.ledger.get_opt(owner):
    case Some(balance):
        # use balance
        pass
    case None:
        raise "NOT_FOUND"
```

---

## Entrypoints and Views

### Entrypoints
```python
@sp.entrypoint
def transfer(self, to, amount):
    assert sp.sender == self.data.admin, "NOT_ADMIN"
    assert amount > 0, "INVALID_AMOUNT"
    self.data.ledger[to] = amount
```

### On-chain Views
```python
@sp.onchain_view
def get_balance(self, owner):
    return self.data.ledger.get(owner, default=sp.nat(0))
```

### Off-chain Views
```python
@sp.offchain_view
def get_metadata(self):
    return self.data.metadata
```

### Calling Views
```python
result = sp.view("get_balance", contract_address, owner, sp.nat)
balance = result.unwrap_some(error="VIEW_FAILED")
```

---

## Operations

### Transfer tez
```python
sp.send(destination, sp.tez(1))
```

### Create contract
```python
op = sp.create_contract(MyOtherContract, sp.mutez(0), init_value)
```

### Transaction context
```python
sp.sender     # Address that called the entrypoint
sp.source     # Original sender of the transaction
sp.amount     # Tez sent with the call
sp.balance    # Contract's current balance
sp.now        # Current timestamp
sp.level      # Current block level
sp.self_address  # This contract's address
sp.chain_id   # Current chain ID
```

---

## Common Blockchain Patterns

### Admin check
```python
assert sp.sender == self.data.admin, "NOT_ADMIN"
```

### Pausable contract
```python
assert not self.data.paused, "CONTRACT_PAUSED"
```

### Require tez payment
```python
assert sp.amount >= sp.tez(1), "INSUFFICIENT_PAYMENT"
```

### No tez accepted
```python
assert sp.amount == sp.tez(0), "NO_TEZ_ACCEPTED"
```

### Deadline check
```python
assert sp.now < self.data.deadline, "EXPIRED"
```

---

## Differences from Python

Key limitations inside `@sp.module`:
- No `import` of Python libraries
- No f-strings
- No `elif` (use nested `if/else`)
- No `try/except`
- No `type()` or `bool()` builtins
- No standard Python `in` for set membership
- Cannot change variable types after definition
- Lists use `.push()` not `.append()`
- `print()` not available — use `sp.trace()` for debugging
- All code paths in views must end with the same `return`
