# Escrow - Example for illustrative purposes only.

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
    if scenario.simulation_mode() is sp.SimulationMode.MOCKUP:
        # Underflowing subtraction of 1 tez and 50 tez
        scenario.p(
            "Balance of contract tz1WxrQuZ4CK1MBUa2GqUWK1yJ4J6EtG1Gwi too low (1) to spend 50"
        )
        return

    c1.addBalanceOwner(_sender=alice, _amount=sp.tez(50))
    c1.addBalanceCounterparty(_sender=bob, _amount=sp.tez(4))
    scenario.h3("Erronous secret")
    c1.claimCounterparty(secret=sp.bytes("0x01223343"), _sender=bob, _valid=False)
    scenario.h3("Correct secret")
    c1.claimCounterparty(secret=sp.bytes("0x01223344"), _sender=bob)
