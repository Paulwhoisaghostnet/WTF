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

    class CreatedWithViews(sp.Contract):
        def __init__(self):
            self.data.a = sp.int(1)
            self.data.b = sp.nat(2)

        @sp.entrypoint
        def myEntryPoint(self, params):
            self.data.a += params.x
            self.data.b += params.y

        @sp.onchain_view()
        def myView(self, a):
            return self.data.a * a

        @sp.offchain_view()
        def myOffchainView(self, b):
            return self.data.b * b

    class CreatedWithParamInit(sp.Contract):
        def __init__(self, ab):
            self.private.px = 10
            self.private.py = ab.a + ab.b
            self.data.a = ab.a
            self.data.b = ab.b

        @sp.entrypoint
        def myEntryPoint(self, params):
            self.data.a += params.x + self.private.px
            self.data.b += params.y + self.private.py

    class CreatedWithParentClass(Created):
        def __init__(self):
            Created.__init__(self)
            self.private.px1 = 100
            self.private.py1 = 1
            self.data.a1 = sp.int(10)
            self.data.b1 = sp.nat(0)

        @sp.entrypoint
        def myEntryPoint2(self, params):
            self.data.a1 += params.x + self.private.px1
            self.data.b1 += params.y + self.private.py1

    def opopop(x):
        return sp.create_contract_operation(
            Created,
            None,
            sp.mutez(0),
            sp.record(a=x, b=15),
            private_=sp.record(px=20, py=13),
        )

    class Creator(sp.Contract):
        def __init__(self, baker):
            self.private.baker = baker
            self.data.x = None
            self.data.l = opopop

        @sp.entrypoint
        def create1(self):
            self.data.x = sp.Some(
                sp.create_contract(
                    Created,
                    None,
                    sp.mutez(123),
                    sp.record(a=12, b=15),
                    private_=sp.record(px=20, py=13),
                )
            )

        @sp.entrypoint
        def create2(self):
            _ = sp.create_contract(
                Created,
                None,
                sp.tez(2),
                sp.record(a=12, b=15),
                private_=sp.record(px=20, py=13),
            )
            _ = sp.create_contract(
                Created,
                None,
                sp.tez(2),
                sp.record(a=12, b=16),
                private_=sp.record(px=20, py=13),
            )

        @sp.entrypoint
        def create3(self):
            self.data.x = sp.Some(
                sp.create_contract(
                    Created,
                    self.private.baker,
                    sp.tez(0),
                    sp.record(a=12, b=15),
                    private_=sp.record(px=20, py=13),
                )
            )

        @sp.entrypoint
        def create4(self, l):
            for x in l:
                _ = sp.create_contract(
                    Created,
                    None,
                    sp.mutez(0),
                    sp.record(a=x, b=15),
                    private_=sp.record(px=20, py=13),
                )

        @sp.entrypoint
        def create5(self):
            _ = sp.create_contract(
                CreatedWithViews, self.private.baker, sp.mutez(10), sp.record(a=1, b=2)
            )

        @sp.entrypoint
        def create6(self):
            _ = sp.create_contract_operation(
                CreatedWithViews, None, sp.mutez(0), sp.record(a=1, b=2)
            )

        @sp.entrypoint
        def create_op(self):
            record(operation, address).match = self.data.l(42)
            sp.operations.push(operation)
            self.data.x = sp.Some(address)

        @sp.entrypoint
        def create7(self):
            _ = sp.create_contract(
                CreatedWithParamInit,
                None,
                sp.mutez(0),
                sp.record(a=1, b=15),
                private_=sp.record(px=20, py=13),
            )

        @sp.entrypoint
        def create8(self):
            _ = sp.create_contract(
                CreatedWithParentClass,
                None,
                sp.mutez(0),
                sp.record(a=1, b=15, a1=10, b1=0),
                private_=sp.record(px=20, py=13, px1=30, py1=130),
            )


@sp.add_test()
def test():
    scenario = sp.test_scenario("Create")
    scenario.h1("Create Contract")
    baker = sp.test_account("My baker")
    scenario.h2("make the factory contract")
    c = main.Creator(sp.Some(baker.public_key_hash))  # id = 0
    c.set_initial_balance(sp.tez(10))
    scenario += c
    scenario.h2("make some dynamic contracts")
    c.create1()  # id = 1
    c.create2()  # id = 2, 3
    c.create3()  # id = 4
    c.create4([1, 2])  # id = 5, 6
    c.create6()  # id = 7
    c.create5()  # id = 8

    scenario.h2(
        "make another static contract - should be skipped in dyn contract offset calc"
    )
    c2 = main.CreatedWithViews()  # id = 9
    c2.set_initial_balance(sp.tez(1))
    scenario += c2

    scenario.h2("references the contract that was dynamically created N times ago")
    # ie c.create4([***1***, 2]) <-- the '1' one
    dyn0 = scenario.dynamic_contract(main.Created, offset=-4)

    scenario.h2("can call entrypoints via the handle")
    dyn0.myEntryPoint(sp.record(x=1, y=16))
    scenario.verify(dyn0.data.a == 22)  # 1 + 1 + 20
    scenario.verify(dyn0.data.b == 44)  # 15 + 16 + 13
    scenario.verify(dyn0.private.px == 20)
    scenario.verify(dyn0.private.py == 13)
    scenario.verify(dyn0.baker == None)
    scenario.verify(dyn0.balance == sp.tez(0))

    scenario.h2("call entrypoint again but change balance")
    dyn0.myEntryPoint(sp.record(x=1, y=15), _amount=sp.tez(2))
    scenario.verify(dyn0.data.a == 43)  # 22 + 1 + 20
    scenario.verify(dyn0.data.b == 72)  # 44 + 15 + 13
    scenario.verify(dyn0.private.px == 20)
    scenario.verify(dyn0.private.py == 13)
    scenario.verify(dyn0.baker == None)
    scenario.verify(dyn0.balance == sp.tez(2))

    scenario.h2("defaults to the last one created if offset is not given, ie create5()")
    dyn1 = scenario.dynamic_contract(main.CreatedWithViews)
    dyn1.myEntryPoint(sp.record(x=10, y=10))
    scenario.verify(dyn1.data.a == 11)  # 1 + 10
    scenario.verify(dyn1.data.b == 12)  # 2 + 10
    scenario.h2("this one was created with a balance and baker")
    scenario.verify(
        dyn1.baker == sp.Some(sp.key_hash("tz1cWFxVfWdEXMk1HwXqXahXK6RQQw1rvZRP"))
    )
    scenario.verify(dyn1.balance == sp.mutez(10))
    scenario.h2("this one did not have any private data")
    scenario.verify(dyn1.private == sp.unit)

    scenario.h2("can also call views")
    scenario.verify(dyn1.myView(3) == 33)  # 3 * 11
    scenario.verify(dyn1.myOffchainView(4) == 48)  # 4 * 12

    scenario.h2("the static CreatedWithViews contract is a separate instance")
    scenario.verify(c2.data.a == 1)
    scenario.verify(c2.data.b == 2)
    scenario.verify(c2.myView(3) == 3)
    scenario.verify(c2.baker == None)
    scenario.verify(c2.balance == sp.tez(1))

    scenario.h2("can inject the CREATE_CONTRACT operation")
    c.create_op()
    scenario.show(c.data.x)
    scenario.verify(
        c.data.x
        == sp.Some(sp.address("KT1Tezoo1ozzSmartPyzzSTATiCzzzw8CmuY"))  # 10th one
    )
    scenario.h2("can refer to that contract too")
    dyn2 = scenario.dynamic_contract(main.Created)
    scenario.verify(dyn2.data.a == 42)
    scenario.verify(dyn2.data.b == 15)
    scenario.verify(dyn2.private.px == 20)
    scenario.verify(dyn2.private.py == 13)
    scenario.verify(dyn2.baker == None)
    scenario.verify(dyn2.balance == sp.tez(0))

    scenario.h2("references are type checked at runtime")
    try:
        _ = scenario.dynamic_contract(main.CreatedWithViews)
    except sp.RuntimeException as e:
        print(e)
    else:
        assert False

    scenario.h2("can dynamically create contract with parameterised init")
    c.create7()
    dyn3 = scenario.dynamic_contract(main.CreatedWithParamInit)
    scenario.verify(dyn3.data.a == 1)
    scenario.verify(dyn3.data.b == 15)
    scenario.verify(dyn3.private.px == 20)
    scenario.verify(dyn3.private.py == 13)
    scenario.verify(dyn3.baker == None)
    scenario.verify(dyn3.balance == sp.tez(0))

    scenario.h2("can dynamically create contract with parent class")
    c.create8()
    dyn4 = scenario.dynamic_contract(main.CreatedWithParentClass)
    scenario.verify(dyn4.data.a == 1)
    scenario.verify(dyn4.data.a1 == 10)
    scenario.verify(dyn4.data.b == 15)
    scenario.verify(dyn4.data.b1 == 0)
    scenario.verify(dyn4.private.px == 20)
    scenario.verify(dyn4.private.px1 == 30)
    scenario.verify(dyn4.private.py == 13)
    scenario.verify(dyn4.private.py1 == 130)
    scenario.verify(dyn4.baker == None)
    scenario.verify(dyn4.balance == sp.tez(0))


# a module that errors correctly - private data cannot be non-const at compile time
@sp.module
def errors():
    class A(sp.Contract):
        def __init__(self):
            self.private = None
            self.data.a = sp.int(0)
            self.data.b = sp.nat(0)

        @sp.entrypoint
        def myEntryPoint(self, params):
            if self.private.is_some():
                self.data.a += params.x
                self.data.b += params.y

    class CreateBad(sp.Contract):
        @sp.entrypoint
        def createA(self):
            _ = sp.create_contract(
                A, None, sp.mutez(123), sp.record(a=12, b=15), private_=sp.Some(sp.now)
            )


@sp.add_test()
def testErrors():
    try:
        _ = sp.test_scenario("CreateBad", errors)
    except sp.TypeError_ as e:
        print(e)
    else:
        assert False


# a module set that errors incorrectly
@sp.module
def parentChild():
    class Parent(sp.Contract):
        @sp.private()
        def private_(self):
            return False

        @sp.entrypoint()
        def ov(self):
            _ = self.private_()

    class C(Parent):
        def __init__(self):
            Parent.__init__(self)


@sp.module
def factory():
    import parentChild

    class Factory(sp.Contract):
        def __init__(self):
            self.data.created = None

        @sp.entrypoint
        def create(self):
            self.data.created = sp.Some(
                sp.create_contract(parentChild.C, None, sp.mutez(0), ())
            )


@sp.add_test()
def testHierarchy():
    sc = sp.test_scenario("Factory")
    f = factory.Factory()
    sc += f


@sp.module
def imports():
    import smartpy.templates.calculator_main as cmain

    class M(sp.Contract):
        def __init__(self):
            self.data.created = None

        @sp.entrypoint
        def create(self):
            self.data.created = sp.Some(
                sp.create_contract(
                    cmain.Calculator,
                    None,
                    sp.mutez(0),
                    sp.record(result=0, i=10),
                )
            )


@sp.add_test()
def testImports():
    sc = sp.test_scenario("Imports")
    i = imports.M()
    sc += i
    i.create()

    CC = sc.add_module("smartpy/templates/calculator_main.spy")
    dyn0 = sc.dynamic_contract(CC.Calculator)
    dyn0.add(x=1, y=2)
    sc.verify(dyn0.data.result == 3)
