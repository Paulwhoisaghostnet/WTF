# SmartPy Complete Syntax Reference — From Official Tests

Comprehensive reference extracted from `test_new_syntax.py` and `syntax.py`.
Every pattern here is verified working in SmartPy v0.17+.

---

## Module & Contract Structure

```python
import smartpy as sp

@sp.module
def main():
    # Type definitions at module level
    my_type: type = sp.record(x=sp.int, y=sp.string)

    # Variant type
    shape: type = sp.variant(Circle=sp.int, Rectangle=sp.pair[sp.int, sp.int])

    class MyContract(sp.Contract):
        def __init__(self):
            self.data.s = 0
            self.data.value = 3
```

---

## Entrypoints

```python
# Single parameter
@sp.entrypoint
def ep1(self, x):
    self.data.s = x

# Multiple named parameters
@sp.entrypoint
def ep2(self, x, y):
    r = x * x + y * y
    assert r == 25

# Record parameter
@sp.entrypoint
def ep3(self, params):
    sp.cast(params, sp.record(messages=sp.list[sp.string], separator=sp.string))
```

---

## Assertions & Errors

```python
# Assert (replaces sp.verify)
assert condition, "error message"

# Raise (replaces sp.failwith)
if x > 42:
    raise "too big"
```

---

## Arithmetic

```python
# Basic
assert 14 / 3 == 4           # integer division
assert sp.mod(x, 2) == 0     # modulo

# Euclidean division → option of (quotient, remainder)
assert sp.ediv(14, 3) == sp.Some((4, 2))
assert sp.ediv(-14, 3) == sp.Some((-5, 1))

# Nat ↔ Int conversions
assert sp.nat(2) - sp.nat(3) == -1        # nat - nat → int
assert -sp.nat(2) == sp.int(-2)
assert sp.is_nat(2) == sp.Some(2)          # int → option[nat]
assert sp.is_nat(-2) == None
assert sp.as_nat(2) == 2                   # int → nat (fails if negative)
assert sp.as_nat(x - y, error="underflow") # with custom error
assert sp.to_int(2) == 2                   # nat → int

# Tez arithmetic
assert sp.mutez(2) + sp.mutez(2) == sp.mutez(4)
assert sp.mutez(10) - sp.mutez(8) == sp.mutez(2)
assert sp.split_tokens(sp.mutez(100), 1, 20) == sp.mutez(5)  # (amount * num) / denom

# Bitwise
assert 42 & 1 == 0    # AND
assert 42 | 1 == 43   # OR

# Type-specific arithmetic
assert sp.add(sp.nat(4), sp.nat(5)) == 9
assert sp.add(sp.int(-4), sp.nat(5)) == 1
assert sp.mul(sp.nat(4), sp.nat(5)) == 20
assert sp.mul(sp.int(-4), sp.nat(5)) == -20
```

---

## Strings & Bytes

```python
# Concatenation
assert "ab" + "c" == "abc"
assert sp.concat(["ab", "cd", "ef"]) == "abcdef"
assert sp.concat([sp.bytes("ab"), sp.bytes("cd")]) == sp.bytes("abcdef")

# Slicing: sp.slice(offset, length, value) → option
assert sp.slice(3, 5, "0123456789") == sp.Some("34567")
assert sp.slice(3, 5, "01234") == None  # out of bounds → None

# Length
sp.len("hello")    # → 5
sp.len(sp.bytes("0xaabb"))  # → 2

# Bytes literal (case insensitive)
assert sp.bytes("0xaBcd") == sp.bytes("abcd")
```

---

## Tuples & Records

```python
# Pairs / Tuples
assert sp.fst((1, "abc")) == 1
(a, b, c) = (42, "abc", True)

# Records
x = sp.record(a=42, b="abc")
sp.cast(x, sp.record(a=sp.int, b=sp.string))

# Record layout for Michelson compatibility
sp.cast(x, sp.record(a=int, b=sp.string, c=bool).layout((("a", "c"), "b")))
```

---

## Options & Variants

```python
# Options
assert not sp.cast(None, sp.option[sp.int]).is_some()
assert sp.Some(42).is_some()
assert sp.cast(None, sp.option[sp.int]).is_none()

# Unwrap
value = my_option.unwrap_some(error="not found")

# Create variants
c = sp.variant.Circle(2)
assert c.is_variant.Circle()
assert c.unwrap.Circle() == 2

# Pattern matching (variants)
match my_variant:
    case Circle(radius):
        # handle circle
        pass
    case Rectangle(dims):
        # handle rectangle
        pass

# Pattern matching (options)
match my_option:
    case Some(value):
        # use value
        pass
    case None:
        pass

# Pattern matching (FA2 operator actions)
match action:
    case add_operator(operator):
        self.data.operators[operator] = ()
    case remove_operator(operator):
        del self.data.operators[operator]
```

---

## Lists, Sets, Maps

```python
# Lists
l = [1, 2, 3]
l.push(4)              # prepend (NOT append)
reversed(l)            # reverse a list
sp.cons(1, [2, 3])     # prepend element
assert len(l) == 3
assert sum([1, 2, 3]) == 6

# Sets
s = {1, 2, 3}
s.add(4)
s.remove(2)
assert 1 in s
assert len(s) == 3
empty_set = sp.cast(set(), sp.set[sp.int])

# Maps
m = {"a": 65, "b": 66}
m[42] = 43             # add/update entry
del m["a"]             # delete entry
assert "a" in m        # membership check (after del: False)
assert m.get("xyz", default=100) == 100
m.get("xyz", error="not found")  # alternative: raise on missing

# Iteration
for x in m.items():
    total += x.key * x.value
for k in m.keys():
    pass
for v in m.values():
    pass
assert sp.concat(m.keys()) == "ab"
assert sum(m.values()) == 131

# Ranges
for i in range(0, 5):       # 0,1,2,3,4
    pass
range(3, 7)                  # [3,4,5,6]
range(3, 7, 2)               # [3,5]

# Big maps (typed initialization)
sp.cast(sp.big_map(), sp.big_map[sp.nat, sp.address])
```

---

## Storage Patterns

```python
class MyContract(sp.Contract):
    def __init__(self, b, s, h, i):
        # Public storage
        self.data.b = b
        self.data.s = s
        self.data.n = sp.nat(123)
        self.data.m = {}                           # empty map
        self.data.l = sp.cast(set(), sp.set[sp.int])  # typed empty set
        self.data.aaa = {1, 2, 3}                  # set literal
        self.data.abc = [sp.Some(123), None]        # list of options
        self.data.abca = {0: sp.Some(123), 1: None} # map of options
        self.data.ddd = range(0, 10)                # list from range
        self.data.pkh = sp.key_hash("tz1YB12JHVHw9GbN66wyfakGYgdTBvokmXQk")

        # Private storage (not on-chain, compile-time constant)
        self.private.bb = s
```

---

## Control Flow

```python
# If/else (NO elif in SmartPy!)
if x > 0:
    pass
else:
    if x == 0:    # nested if instead of elif
        pass
    else:
        pass

# While
while self.data.i <= 42:
    self.data.i += 2

# For loops
for i in range(0, 5):
    pass
for item in my_list:
    pass
for x in my_map.items():
    total += x.key * x.value
```

---

## Lambdas & Effects

```python
# Lambda with storage access
@sp.effects(with_storage="read-write")
def f(x):
    self.data.s = 42
    return x

assert f(42) == 42

# Lambda with operations (can call other contracts)
@sp.effects(with_operations=True)
def g(param: sp.pair[sp.address, sp.unit]):
    to_ = sp.fst(param)
    c = sp.contract(sp.int, to_, entrypoint="set_value")
    sp.transfer(sp.int(42), sp.tez(0), c.unwrap_some())

# Lambda type definition
operation_lambda: type = sp.lambda_(sp.unit, sp.unit, with_operations=True)

# Module-level functions as lambdas
def logic1(data):
    unpacked = sp.unpack(data, t1).unwrap_some(error="Cannot UNPACK")
    return unpacked.x + unpacked.y

# Partial application
lambda_ = test.f.apply(c2.address)
```

---

## Operations (Blockchain Actions)

```python
# Transfer tez
sp.send(address, sp.tez(5))

# Call another contract's entrypoint
c = sp.contract(param_type, address, "entrypoint_name").unwrap_some()
sp.transfer(data, sp.mutez(0), c)

# Call own entrypoint
sp.transfer(42, sp.mutez(0), sp.self_entrypoint("abc"))

# Set delegate
sp.set_delegate(None)
sp.set_delegate(sp.Some(baker_key_hash))

# Emit events
sp.emit("Hello")
sp.emit("World", tag="mytag")
sp.emit(sp.record(a="ABC", b="XYZ"), tag="mytag2")
sp.emit(sp.record(a="ABC", b="XYZ"), tag="mytag2", with_type=False)

# Create contract
address = sp.create_contract(
    ContractClass, delegate, initial_balance, initial_storage, private_=private_data
)
```

---

## Views

```python
# On-chain view (callable from other contracts)
@sp.onchain_view()
def get_value(self, key):
    return self.data.ledger.get(key, default=sp.nat(0))

# Off-chain view (callable off-chain only)
@sp.offchain_view
def all_tokens(self):
    return range(0, self.data.next_token_id)

# Calling views in tests
result = sp.View(contract, "get_balance")(sp.record(owner=alice.address, token_id=0))
```

---

## Private Functions

```python
# Read-only, no operations
@sp.private(with_storage="read-only")
def _helper(self, a, b):
    return a + b

# Read-write, no operations
@sp.private(with_storage="read-write")
def _update(self, value):
    self.data.x = value

# Read-write with operations
@sp.private(with_storage="read-write", with_operations=True)
def _send(self, to, amount):
    sp.send(to, amount)
```

---

## Test Patterns

```python
@sp.add_test()
def test():
    scenario = sp.test_scenario("TestName", main)  # optional module arg
    scenario.h1("Title")
    scenario.h2("Subtitle")
    scenario.p("Paragraph text")

    # Test accounts
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")
    # alice.address, alice.public_key, alice.public_key_hash, alice.secret_key

    # Originate contract
    c1 = main.MyContract(args)
    c1.set_initial_balance(sp.tez(10))
    scenario += c1

    # Call entrypoints
    c1.ep(value, _sender=alice)
    c1.ep(value, _sender=alice, _amount=sp.tez(5))
    c1.ep(value, _sender=alice, _valid=False)  # expect failure
    c1.ep(value, _valid=False, _exception="specific error")
    c1.ep(value, _now=sp.timestamp(100))  # mock timestamp

    # Verify
    scenario.verify(c1.data.field == expected)
    scenario.verify_equal(c1.data, expected_record)

    # Show
    scenario.show(c1.data)
    scenario.show(c1.data, html=False)

    # Dynamic contracts (from sp.create_contract)
    dyn = scenario.dynamic_contract(main.Created)
    dyn = scenario.dynamic_contract(main.Created, offset=-2)

    # Simulation mode check
    if scenario.simulation_mode() is sp.SimulationMode.MOCKUP:
        return
```

---

## Hashing & Crypto

```python
sp.blake2b(sp.bytes("0x..."))
sp.sha256(sp.bytes("0x..."))
sp.sha512(sp.bytes("0x..."))
sp.check_signature(public_key, signature, message_bytes)
sp.pack(value)                    # serialize to bytes
sp.unpack(bytes, type)            # deserialize → option
```

---

## Important SmartPy-Specific Rules

1. **No `elif`** — use nested `if/else`
2. **No `try/except`** inside `@sp.module`
3. **No Python `in` for sets** inside contracts — use `.contains()` or `x in set`
4. **Lists use `.push()`** not `.append()`
5. **Cannot change variable types** after first assignment
6. **Cannot import Python libraries** inside `@sp.module`
7. **Test code is pure Python** — outside `@sp.module`, any Python works
8. **`@sp.onchain_view()`** has parentheses, **`@sp.offchain_view`** does not
9. **Views must return** at the end — no early returns
10. **`sp.int_or_nat`** — special type accepting both int and nat
