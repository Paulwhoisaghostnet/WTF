# Atomic Swaps - Example for illustrative purposes only.

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
    scenario = sp.test_scenario("AtomicSwap1")
    c1 = main.AtomicSwap(
        sp.mutez(12), sp.timestamp(50), hashSecret, alice.address, bob.address
    )
    scenario.h1("Atomic Swap")
    scenario += c1


@sp.add_test()
def test():
    alice = sp.test_account("Alice")
    bob = sp.test_account("Robert")
    scenario = sp.test_scenario("AtomicSwap2")
    scenario.h1("Atomic Swap")

    hashSecret = sp.blake2b(sp.bytes("0x12345678aabb"))
    c1 = main.AtomicSwap(
        sp.mutez(12), sp.timestamp(50), hashSecret, alice.address, bob.address
    )
    c2 = main.AtomicSwap(
        sp.mutez(20), sp.timestamp(50), hashSecret, bob.address, alice.address
    )
    scenario.h1("c1")
    c1.set_initial_balance(sp.tez(3))
    scenario += c1
    c1.knownSecret(secret=sp.bytes("0x12345678aa"), _sender=bob, _valid=False)
    c1.knownSecret(secret=sp.bytes("0x12345678aabb"), _sender=bob)
    scenario.h1("c2")
    scenario += c2
