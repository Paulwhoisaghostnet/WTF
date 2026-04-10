# Collatz, calling other contracts - Example for illustrative purposes only.

import smartpy as sp

# Compute the length of the nth Collatz sequence
# (https://oeis.org/A006577) with on-chain continuations


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
    scenario.h1("Collatz template - Inter-Contract Calls")
    on_even = main.OnEven()
    scenario += on_even
    on_odd = main.OnOdd()
    scenario += on_odd
    collatz = main.Collatz(onEven=on_even.address, onOdd=on_odd.address)
    scenario += collatz
    # See https://oeis.org/A006577/list
    collatz.run(42)
    scenario.verify(collatz.data.counter == 8)
    collatz.reset()
    collatz.run(5)
    scenario.verify(collatz.data.counter == 5)
