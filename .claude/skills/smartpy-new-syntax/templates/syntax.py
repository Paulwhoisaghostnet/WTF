# Some Syntax - Example for illustrative purposes only.

# This contract here is simply to show a few syntax constructions.

import smartpy as sp


@sp.module
def main():
    class SyntaxDemo(sp.Contract):
        def __init__(self, b, s, h, i):
            self.private.bb = s
            self.data.b = b
            self.data.s = s
            self.data.h = h
            self.data.i = i
            self.data.pkh = sp.key_hash("tz1YB12JHVHw9GbN66wyfakGYgdTBvokmXQk")
            self.data.n = sp.nat(123)
            self.data.m = {}
            self.data.l = sp.cast(set(), sp.set[sp.int])
            self.data.aaa = {1, 2, 3}
            self.data.abc = [sp.Some(123), None]
            self.data.abca = {0: sp.Some(123), 1: None}
            self.data.ddd = range(0, 10)
            self.data.acb = "toto"

        @sp.entrypoint
        def comparisons(self):
            assert self.data.i <= 123
            assert 2 + self.data.i == 12
            assert 2 + self.data.i != 1234
            assert self.data.i + 4 != 123
            assert self.data.i - 5 < 123
            assert 7 - self.data.i < 123
            assert self.data.i > 3
            assert 4 * self.data.i > 3
            assert self.data.i * 5 > 3
            assert self.data.i >= 3
            assert 3 < self.data.i
            assert 3 <= self.data.i
            assert 3000 > self.data.i
            assert 3000 >= self.data.i
            assert self.data.b and True
            if 3 < self.data.i:
                assert 4 < self.data.i

        @sp.entrypoint
        def someComputations(self, params):
            assert self.data.i <= 123
            self.data.i = self.data.i + params.y
            self.data.acb = params.x
            self.data.i = 100
            self.data.i = self.data.i - 1
            assert sp.add(sp.nat(4), sp.nat(5)) == 9
            assert sp.add(sp.int(-4), sp.nat(5)) == 1
            assert sp.add(sp.nat(5), sp.int(-4)) == 1
            assert sp.add(sp.int(-4), sp.int(5)) == 1
            assert sp.mul(sp.nat(4), sp.nat(5)) == 20
            assert sp.mul(sp.int(-4), sp.nat(5)) == -20
            assert sp.mul(sp.nat(5), sp.int(-4)) == -20
            assert sp.mul(sp.int(-4), sp.int(5)) == -20

        @sp.entrypoint
        def localVariable(self):
            x = self.data.i
            x *= 2
            self.data.i = 10
            self.data.i = x

        @sp.entrypoint
        def iterations(self):
            x = self.data.i
            x = 0
            x = 1
            x = 2
            x = 3
            x = 4

            for i in range(0, 5):
                x = i
            self.data.i = sp.to_int(self.data.n)
            self.data.i = 5
            while self.data.i <= 42:
                self.data.i += 2
            if self.data.i <= 123:
                x = 12
                self.data.i += x
            else:
                x = 5
                self.data.i = x

        @sp.entrypoint
        def myMessageName4(self):
            for x in self.data.m.items():
                self.data.i += x.key * x.value

        @sp.entrypoint
        def myMessageName5(self):
            for x in self.data.m.keys():
                self.data.i += 2 * x

        @sp.entrypoint
        def myMessageName6(self, params):
            sp.cast(params, sp.int)  # FIXME This should be inferred.
            for x in self.data.m.values():
                self.data.i += 3 * x
            self.data.aaa.remove(2)
            self.data.aaa.add(12)
            self.data.abc.push(sp.Some(16))
            self.data.abca[0] = sp.Some(16)
            if 12 in self.data.aaa:
                self.data.m[42] = 43
            self.data.aaa.add(sp.as_nat(-params))


# Tests
@sp.add_test()
def test():
    scenario = sp.test_scenario("Syntax")
    # define a contract
    c1 = main.SyntaxDemo(b=True, s="abc", h=sp.bytes("0x0000ab112233aa"), i=7)
    # show its representation
    scenario.h1("Syntax")
    scenario.h2("Contract")
    scenario += c1
    scenario.h2("Message execution")
    c1.comparisons(_valid=False)
    scenario.h2("Message execution")
    c1.someComputations(x="abcd", y=12)
    scenario.h2("Message execution")
    c1.localVariable()
    c1.iterations()
    scenario.h2("Message execution")
    c1.myMessageName6(-18)
    scenario.verify(c1.data.b)
    scenario.verify(c1.data.i == 55)
    scenario.show(c1.data)
    scenario.show(c1.data, html=False)
    scenario.verify_equal(
        c1.data,
        sp.record(
            acb="abcd",
            abc=[sp.Some(16), sp.Some(123), None],
            abca=sp.scenario_utils.vector([sp.Some(16), None]),
            b=True,
            h=sp.bytes("0x0000ab112233aa"),
            i=55,
            l=sp.set(),
            n=123,
            s="abc",
            aaa={1, 3, 12, 18},
            m={42: 43},
            ddd=sp.list([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
            pkh=sp.key_hash("tz1YB12JHVHw9GbN66wyfakGYgdTBvokmXQk"),
        ),
    )
    scenario.simulation(c1)
