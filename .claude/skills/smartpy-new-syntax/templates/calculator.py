# Calculator - Example for illustrative purposes only.

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
        c1.add(x=2, y=5)
        c1.square(12)
        c1.squareRoot(0)
        c1.squareRoot(1234)
        c1.factorial(100)
        c1.log2(c1.data.result)
        scenario.verify(c1.data.result == 524)
