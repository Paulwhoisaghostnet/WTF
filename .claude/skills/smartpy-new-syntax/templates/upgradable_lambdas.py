import smartpy as sp

##########################################################
# Upgradable Contract that uses lambdas
# https://tezos.gitlab.io/michelson-reference/#type-lambda
##########################################################


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

    # Logic Version 1 (x, y)
    def logic1(data):
        unpacked = sp.unpack(data, t1).unwrap_some(error="Cannot UNPACK")
        return unpacked.x + unpacked.y

    # Logic Version 2 (x, y, z)
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

    # Update logic to version 2
    c1.updateLogic(main.logic2)

    # Use logic version 2
    c1.calc(sp.pack(sp.record(x=1, y=2, z=3)))
