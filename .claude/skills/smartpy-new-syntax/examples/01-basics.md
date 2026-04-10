# SmartPy Basics — Official Template Examples

These are official SmartPy templates demonstrating fundamental contract patterns.
All code uses **new syntax (v0.17+)** and is copy-paste ready.

---

## 1. Minimal Contract

The absolute minimum SmartPy contract structure.

```python
import smartpy as sp


@sp.module
def main():
    class MyContract(sp.Contract):
        def __init__(self):
            pass

        @sp.entrypoint
        def entrypoint_1(self):
            pass


@sp.add_test()
def test():
    scenario = sp.test_scenario("Minimal")
    scenario.h1("Minimal")
    c1 = main.MyContract()
    scenario += c1
```

**Patterns:** `@sp.module`, class inheriting `sp.Contract`, `@sp.entrypoint`, `@sp.add_test()`, `sp.test_scenario`.

---

## 2. Welcome — First Contract with Storage and Tests

```python
import smartpy as sp


@sp.module
def main():
    class MyContract(sp.Contract):
        def __init__(self, my_parameter_1, my_parameter_2):
            self.data.my_parameter_1 = my_parameter_1
            self.data.my_parameter_2 = my_parameter_2

        @sp.entrypoint
        def my_entrypoint(self, params):
            assert self.data.my_parameter_1 <= 123
            self.data.my_parameter_1 += params


@sp.add_test()
def test():
    scenario = sp.test_scenario("Welcome")
    scenario.h1("Welcome")

    # Originate contract with initial storage
    c1 = main.MyContract(12, 123)
    scenario += c1

    # Call entrypoints
    c1.my_entrypoint(12)
    c1.my_entrypoint(13)
    c1.my_entrypoint(14)
    c1.my_entrypoint(50)
    c1.my_entrypoint(50)
    c1.my_entrypoint(50, _valid=False)  # expected to fail

    # Verify final storage
    scenario.verify(c1.data.my_parameter_1 == 151)

    # Use current state of c1 to create c2
    c2 = main.MyContract(1, c1.data.my_parameter_1)
    scenario += c2
    scenario.verify(c2.data.my_parameter_2 == 151)
```

**Patterns:** Constructor parameters → storage, `assert` for validation, `_valid=False` for expected failures, `scenario.verify()`, using one contract's data to initialize another.

---

## 3. Store Value — Multiple Entrypoints with Named Parameters

```python
import smartpy as sp


@sp.module
def main():
    class StoreValue(sp.Contract):
        def __init__(self, value):
            self.data.storedValue = value

        @sp.entrypoint
        def replace(self, params):
            self.data.storedValue = params.value

        @sp.entrypoint
        def double(self):
            self.data.storedValue *= 2

        @sp.entrypoint
        def divide(self, params):
            assert params.divisor > 5
            self.data.storedValue /= params.divisor


if "main" in __name__:

    @sp.add_test()
    def test():
        scenario = sp.test_scenario("StoreValue")
        c1 = main.StoreValue(12)
        scenario.h1("Store Value")
        scenario += c1
        c1.replace(value=15)
        scenario.p("Some computation").show(c1.data.storedValue * 12)
        c1.replace(value=25)
        c1.double()
        c1.divide(
            divisor=2, _valid=False, _exception="Assert failure: params.divisor > 5"
        )
        scenario.verify(c1.data.storedValue == 50)
        c1.divide(divisor=6)
        scenario.verify(c1.data.storedValue == 8)
```

**Patterns:** `params.field` access for record parameters, `_exception` to check specific error messages, `scenario.p()` and `.show()` for test output, `if "main" in __name__` guard.

---

## 4. Calculator — Loops, Ranges, While, Multiple Entrypoints

```python
import smartpy as sp


@sp.module
def main():
    class Calculator(sp.Contract):
        def __init__(self):
            self.data.result = 0

        @sp.entrypoint
        def multiply(self, x, y):
            self.data.result = x * y

        @sp.entrypoint
        def add(self, x, y):
            self.data.result = x + y

        @sp.entrypoint
        def square(self, x):
            self.data.result = x * x

        @sp.entrypoint
        def squareRoot(self, x):
            assert x >= 0
            y = x
            while y * y > x:
                y = (x / y + y) / 2
            assert y * y <= x and x < (y + 1) * (y + 1)
            self.data.result = y

        @sp.entrypoint
        def factorial(self, x):
            self.data.result = 1
            for y in range(1, x + 1):
                self.data.result *= y

        @sp.entrypoint
        def log2(self, x):
            self.data.result = 0
            y = x
            while y > 1:
                self.data.result += 1
                y /= 2


if "main" in __name__:

    @sp.add_test()
    def test():
        scenario = sp.test_scenario("Calculator")
        c1 = main.Calculator()
        scenario.h1("Calculator")
        scenario += c1
        c1.multiply(x=2, y=5)
        c1.add(x=2, y=5)
        c1.square(12)
        c1.squareRoot(0)
        c1.squareRoot(1234)
        c1.factorial(100)
        c1.log2(c1.data.result)
        scenario.verify(c1.data.result == 524)
```

**Patterns:** Multiple named parameters (`x, y`), `while` loops, `for y in range(1, x + 1)`, local variable assignment (`y = x`), compound assertions with `and`.

---

## Key Takeaways from Basic Templates

1. **All code inside `@sp.module`** — contracts, types, helper functions
2. **Tests are pure Python** outside `@sp.module`, using `@sp.add_test()`
3. **Storage via `self.data.field`** — assigned in `__init__`
4. **`assert` replaces `sp.verify`** inside contracts
5. **Local variables** are just `x = value` (no `sp.local`)
6. **Control flow** uses native Python: `if/else`, `for`, `while` (no `sp.if`)
7. **Single param**: `def ep(self, x)` → call with `c.ep(5)`
8. **Multiple params**: `def ep(self, x, y)` → call with `c.ep(x=2, y=5)`
9. **Record param**: `def ep(self, params)` → access via `params.field`
