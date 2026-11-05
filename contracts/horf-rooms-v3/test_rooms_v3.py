"""Scenario tests for HORF V3 custody, unique claims, and automatic Outlaw swaps."""

import sys
from pathlib import Path

import smartpy as sp

sys.path.insert(0, str(Path(__file__).resolve().parent))
import HorfRoomsV3 as horf  # noqa: E402


CHAIN_ID = sp.chain_id_cst("0x7a06a770")  # Tezos Mainnet NetXdQprcVkpaWU.


@sp.module
def mock_fa2():
    LedgerKey: type = sp.record(owner=sp.address, token_id=sp.nat).layout(("owner", "token_id"))
    OperatorKey: type = sp.record(
        owner=sp.address, operator=sp.address, token_id=sp.nat
    ).layout(("owner", ("operator", "token_id")))
    Tx: type = sp.record(to_=sp.address, token_id=sp.nat, amount=sp.nat).layout(
        ("to_", ("token_id", "amount"))
    )
    Batch: type = sp.record(from_=sp.address, txs=sp.list[Tx]).layout(("from_", "txs"))
    BalanceRequest: type = sp.record(owner=sp.address, token_id=sp.nat).layout(
        ("owner", "token_id")
    )
    BalanceResponse: type = sp.record(request=BalanceRequest, balance=sp.nat).layout(
        ("request", "balance")
    )
    BalanceOf: type = sp.record(
        requests=sp.list[BalanceRequest], callback=sp.contract[sp.list[BalanceResponse]],
    ).layout(("requests", "callback"))
    Mint: type = sp.record(owner=sp.address, token_id=sp.nat, amount=sp.nat)
    Operator: type = sp.record(
        owner=sp.address, operator=sp.address, token_id=sp.nat, enabled=sp.bool
    )

    class MockFA2(sp.Contract):
        def __init__(self, silent_balance, fake_transfer):
            self.data.ledger = sp.cast(sp.big_map(), sp.big_map[LedgerKey, sp.nat])
            self.data.operators = sp.cast(sp.big_map(), sp.big_map[OperatorKey, sp.unit])
            self.data.silent_balance = sp.cast(silent_balance, sp.bool)
            self.data.fake_transfer = sp.cast(fake_transfer, sp.bool)

        @sp.entrypoint
        def mint(self, params):
            sp.cast(params, Mint)
            key = sp.record(owner=params.owner, token_id=params.token_id)
            self.data.ledger[key] = self.data.ledger.get(key, default=sp.nat(0)) + params.amount

        @sp.entrypoint
        def set_operator(self, params):
            sp.cast(params, Operator)
            assert sp.sender == params.owner, "NOT_OWNER"
            key = sp.record(owner=params.owner, operator=params.operator, token_id=params.token_id)
            if params.enabled:
                self.data.operators[key] = ()
            else:
                if key in self.data.operators:
                    del self.data.operators[key]

        @sp.entrypoint
        def transfer(self, batches):
            sp.cast(batches, sp.list[Batch])
            for batch in batches:
                for tx in batch.txs:
                    operator = sp.record(owner=batch.from_, operator=sp.sender, token_id=tx.token_id)
                    assert sp.sender == batch.from_ or operator in self.data.operators, "FA2_NOT_OPERATOR"
                    if not self.data.fake_transfer:
                        from_key = sp.record(owner=batch.from_, token_id=tx.token_id)
                        to_key = sp.record(owner=tx.to_, token_id=tx.token_id)
                        amount = self.data.ledger.get(from_key, default=sp.nat(0))
                        assert amount >= tx.amount, "FA2_INSUFFICIENT_BALANCE"
                        self.data.ledger[from_key] = sp.as_nat(amount - tx.amount)
                        self.data.ledger[to_key] = self.data.ledger.get(to_key, default=sp.nat(0)) + tx.amount

        @sp.entrypoint
        def balance_of(self, params):
            sp.cast(params, BalanceOf)
            if not self.data.silent_balance:
                replies = sp.cast([], sp.list[BalanceResponse])
                for request in params.requests:
                    key = sp.record(owner=request.owner, token_id=request.token_id)
                    replies.push(sp.record(
                        request=request,
                        balance=self.data.ledger.get(key, default=sp.nat(0)),
                    ))
                sp.transfer(replies, sp.mutez(0), params.callback)


def nonce(number: int):
    return sp.bytes("0x" + number.to_bytes(32, "big").hex())


def right_pair(values):
    return (values[0], values[1]) if len(values) == 2 else (values[0], right_pair(values[1:]))


def permit_signature(rooms, oracle, caller, action, mode, listing_id, token, token_id, amount, number, epoch=0):
    payload = sp.pack(right_pair([
        CHAIN_ID, rooms.address, caller.address, sp.nat(action), sp.nat(mode),
        sp.nat(listing_id), token.address, sp.nat(token_id), sp.nat(amount),
        nonce(number), sp.nat(epoch),
    ]))
    return sp.make_signature(oracle.secret_key, payload)


def deposit(rooms, oracle, sender, mode, token, token_id, amount, number, *, valid=True, error=None):
    rooms.deposit(
        mode=mode, token_contract=token.address, token_id=token_id,
        amount=amount, nonce=nonce(number),
        signature=permit_signature(rooms, oracle, sender, 0, mode, 0, token, token_id, amount, number),
        _sender=sender, _chain_id=CHAIN_ID, _valid=valid,
        **({"_exception": error} if error else {}),
    )


def swap(rooms, oracle, sender, listing_id, input_token, input_id, permit_number, completion_number,
         *, valid=True, error=None):
    rooms.swap_outlaw(
        listing_id=listing_id, input_token_contract=input_token.address,
        input_token_id=input_id, permit_nonce=nonce(permit_number),
        signature=permit_signature(rooms, oracle, sender, 1, 2, listing_id,
                                   input_token, input_id, 1, permit_number),
        completion_nonce=nonce(completion_number),
        _sender=sender, _chain_id=CHAIN_ID, _valid=valid,
        **({"_exception": error} if error else {}),
    )


def create_private(rooms, oracle, owner, output_token, output_id, offerer,
                   input_token, input_id, permit_number):
    rooms.create_private_offer(
        token_contract=output_token.address, token_id=output_id,
        offerer=offerer.address, input_token_contract=input_token.address,
        input_token_id=input_id, nonce=nonce(permit_number),
        signature=permit_signature(rooms, oracle, owner, 0, 3, 0,
                                   output_token, output_id, 1, permit_number),
        _sender=owner, _chain_id=CHAIN_ID,
    )


def fulfill_private(rooms, oracle, sender, listing_id, input_token, input_id,
                    permit_number, completion_number, *, valid=True, error=None):
    rooms.fulfill_private_offer(
        listing_id=listing_id, permit_nonce=nonce(permit_number),
        signature=permit_signature(rooms, oracle, sender, 2, 3, listing_id,
                                   input_token, input_id, 1, permit_number),
        completion_nonce=nonce(completion_number),
        _sender=sender, _chain_id=CHAIN_ID, _valid=valid,
        **({"_exception": error} if error else {}),
    )


def held(token, owner, token_id):
    address = owner.address if hasattr(owner, "address") else owner
    return token.data.ledger.get(sp.record(owner=address, token_id=token_id), sp.nat(0))


@sp.add_test()
def reciprocal_requires_stake_and_one_distinct_unowned_horse():
    scenario = sp.test_scenario("horf_v3_reciprocal", [horf.main, mock_fa2])
    scenario.add_flag("protocol", "tallinn")
    admin = sp.test_account("Admin")
    oracle = sp.test_account("Oracle")
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")
    carol = sp.test_account("Carol")
    token = mock_fa2.MockFA2(False, False)
    rooms = horf.main.HorfRoomsV3(admin.address, oracle.public_key)
    scenario += token
    scenario += rooms
    token.mint(owner=alice.address, token_id=11, amount=2)
    token.mint(owner=bob.address, token_id=12, amount=2)
    token.mint(owner=carol.address, token_id=11, amount=1)
    token.mint(owner=carol.address, token_id=13, amount=1)
    for owner, token_id in [(alice, 11), (bob, 12), (carol, 13)]:
        token.set_operator(owner=owner.address, operator=rooms.address,
                           token_id=token_id, enabled=True, _sender=owner)
    deposit(rooms, oracle, alice, 0, token, 11, 2, 1)
    deposit(rooms, oracle, bob, 0, token, 12, 2, 2)
    deposit(rooms, oracle, carol, 0, token, 13, 1, 3)
    scenario.verify(rooms.data.reciprocal_credits[alice.address] == 2)
    rooms.claim(listing_id=0, completion_nonce=nonce(101), _sender=bob)
    rooms.assert_completed(nonce(101), _sender=bob)
    scenario.verify(rooms.data.reciprocal_credits[bob.address] == 1)
    scenario.verify(held(token, bob, 11) == 1)
    rooms.claim(listing_id=0, completion_nonce=nonce(102), _sender=bob,
                _valid=False, _exception="HORSE_ALREADY_CLAIMED")
    rooms.claim(listing_id=0, completion_nonce=nonce(103), _sender=carol,
                _valid=False, _exception="HORSE_ALREADY_OWNED")
    scenario.verify(rooms.data.reciprocal_credits[carol.address] == 1)
    rooms.claim(listing_id=1, completion_nonce=nonce(104), _sender=alice)
    rooms.assert_completed(nonce(104), _sender=alice)
    scenario.verify(rooms.data.reciprocal_credits[alice.address] == 1)
    rooms.cancel(listing_id=0, amount=1, _sender=alice)
    scenario.verify(rooms.data.reciprocal_credits[alice.address] == 0)
    scenario.verify(held(token, alice, 11) == 1)
    rooms.claim(listing_id=2, completion_nonce=nonce(105), _sender=bob)
    scenario.verify(rooms.data.reciprocal_credits[bob.address] == 0)
    rooms.cancel(listing_id=1, amount=1, _sender=bob, _valid=False,
                 _exception="CREDITS_ALREADY_SPENT")


@sp.add_test()
def outlaw_swaps_one_input_horse_for_one_escrowed_output_automatically():
    scenario = sp.test_scenario("horf_v3_outlaw_swap", [horf.main, mock_fa2])
    scenario.add_flag("protocol", "tallinn")
    admin = sp.test_account("Admin")
    oracle = sp.test_account("Oracle")
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")
    carol = sp.test_account("Carol")
    real = mock_fa2.MockFA2(False, False)
    offered = mock_fa2.MockFA2(False, False)
    rooms = horf.main.HorfRoomsV3(admin.address, oracle.public_key)
    scenario += real
    scenario += offered
    scenario += rooms
    real.mint(owner=alice.address, token_id=10, amount=3)
    real.mint(owner=carol.address, token_id=10, amount=1)
    offered.mint(owner=bob.address, token_id=20, amount=2)
    offered.mint(owner=carol.address, token_id=21, amount=1)
    real.set_operator(owner=alice.address, operator=rooms.address, token_id=10,
                      enabled=True, _sender=alice)
    offered.set_operator(owner=bob.address, operator=rooms.address, token_id=20,
                         enabled=True, _sender=bob)
    offered.set_operator(owner=carol.address, operator=rooms.address, token_id=21,
                         enabled=True, _sender=carol)
    deposit(rooms, oracle, alice, 2, real, 10, 3, 4)
    scenario.verify(held(real, rooms, 10) == 3)
    swap(rooms, oracle, bob, 0, offered, 20, 5, 105)
    rooms.assert_completed(nonce(105), _sender=bob)
    scenario.verify(held(real, bob, 10) == 1)
    scenario.verify(held(offered, alice, 20) == 1)
    scenario.verify(rooms.data.listings[0].remaining == 2)
    swap(rooms, oracle, bob, 0, offered, 20, 6, 106,
         valid=False, error="HORSE_ALREADY_CLAIMED")
    swap(rooms, oracle, carol, 0, offered, 21, 7, 107,
         valid=False, error="HORSE_ALREADY_OWNED")
    scenario.verify(held(offered, carol, 21) == 1)
    rooms.cancel(listing_id=0, amount=2, _sender=alice)
    scenario.verify(held(real, alice, 10) == 2)


@sp.add_test()
def honor_claim_is_free_but_requires_zero_balance_and_unique_token():
    scenario = sp.test_scenario("horf_v3_honor", [horf.main, mock_fa2])
    scenario.add_flag("protocol", "tallinn")
    admin = sp.test_account("Admin")
    oracle = sp.test_account("Oracle")
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")
    token = mock_fa2.MockFA2(False, False)
    rooms = horf.main.HorfRoomsV3(admin.address, oracle.public_key)
    scenario += token
    scenario += rooms
    token.mint(owner=alice.address, token_id=30, amount=2)
    token.set_operator(owner=alice.address, operator=rooms.address, token_id=30,
                       enabled=True, _sender=alice)
    deposit(rooms, oracle, alice, 1, token, 30, 2, 8)
    rooms.claim(listing_id=0, completion_nonce=nonce(108), _sender=bob)
    rooms.assert_completed(nonce(108), _sender=bob)
    scenario.verify(held(token, bob, 30) == 1)
    rooms.claim(listing_id=0, completion_nonce=nonce(109), _sender=bob,
                _valid=False, _exception="HORSE_ALREADY_CLAIMED")


@sp.add_test()
def no_balance_callback_cannot_complete_claim_and_pending_can_be_aborted():
    scenario = sp.test_scenario("horf_v3_no_callback", [horf.main, mock_fa2])
    scenario.add_flag("protocol", "tallinn")
    admin = sp.test_account("Admin")
    oracle = sp.test_account("Oracle")
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")
    silent = mock_fa2.MockFA2(True, False)
    rooms = horf.main.HorfRoomsV3(admin.address, oracle.public_key)
    scenario += silent
    scenario += rooms
    silent.mint(owner=alice.address, token_id=40, amount=1)
    silent.set_operator(owner=alice.address, operator=rooms.address, token_id=40,
                        enabled=True, _sender=alice)
    deposit(rooms, oracle, alice, 1, silent, 40, 1, 9)
    rooms.claim(listing_id=0, completion_nonce=nonce(110), _sender=bob)
    rooms.assert_completed(nonce(110), _sender=bob, _valid=False,
                           _exception="BALANCE_CALLBACK_MISSING")
    scenario.verify(rooms.data.listings[0].remaining == 1)
    scenario.verify(held(silent, bob, 40) == 0)
    rooms.abort_pending(_sender=bob)
    scenario.verify(~rooms.data.pending.contains(bob.address))


@sp.add_test()
def unreviewed_noop_fa2_is_an_explicit_outlaw_trust_risk():
    scenario = sp.test_scenario("horf_v3_outlaw_noop_risk", [horf.main, mock_fa2])
    scenario.add_flag("protocol", "tallinn")
    admin = sp.test_account("Admin")
    oracle = sp.test_account("Oracle")
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")
    real = mock_fa2.MockFA2(False, False)
    fake = mock_fa2.MockFA2(False, True)
    rooms = horf.main.HorfRoomsV3(admin.address, oracle.public_key)
    scenario += real
    scenario += fake
    scenario += rooms
    real.mint(owner=alice.address, token_id=50, amount=1)
    real.set_operator(owner=alice.address, operator=rooms.address, token_id=50,
                      enabled=True, _sender=alice)
    fake.set_operator(owner=bob.address, operator=rooms.address, token_id=60,
                      enabled=True, _sender=bob)
    deposit(rooms, oracle, alice, 2, real, 50, 1, 10)
    swap(rooms, oracle, bob, 0, fake, 60, 11, 111)
    rooms.assert_completed(nonce(111), _sender=bob)
    scenario.verify(held(real, bob, 50) == 1)
    scenario.verify(held(fake, alice, 60) == 0)
    scenario.verify(rooms.data.listings[0].remaining == 0)


@sp.add_test()
def private_offer_escrows_one_and_binds_exact_offer_wallet_and_horse():
    scenario = sp.test_scenario("horf_v3_private_offer", [horf.main, mock_fa2])
    scenario.add_flag("protocol", "tallinn")
    admin = sp.test_account("Admin")
    oracle = sp.test_account("Oracle")
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")
    carol = sp.test_account("Carol")
    output = mock_fa2.MockFA2(False, False)
    offered = mock_fa2.MockFA2(False, False)
    rooms = horf.main.HorfRoomsV3(admin.address, oracle.public_key)
    scenario += output
    scenario += offered
    scenario += rooms
    output.mint(owner=alice.address, token_id=70, amount=2)
    offered.mint(owner=bob.address, token_id=80, amount=1)
    offered.mint(owner=carol.address, token_id=80, amount=1)
    output.set_operator(owner=alice.address, operator=rooms.address, token_id=70,
                        enabled=True, _sender=alice)
    offered.set_operator(owner=bob.address, operator=rooms.address, token_id=80,
                         enabled=True, _sender=bob)
    create_private(rooms, oracle, alice, output, 70, bob, offered, 80, 12)
    scenario.verify(rooms.data.listings[0].mode == 3)
    scenario.verify(rooms.data.listings[0].remaining == 1)
    scenario.verify(rooms.data.private_terms[0].offerer == bob.address)
    scenario.verify(rooms.data.private_terms[0].input_token_contract == offered.address)
    scenario.verify(rooms.data.private_terms[0].input_token_id == 80)
    scenario.verify(held(output, rooms, 70) == 1)
    scenario.verify(held(output, alice, 70) == 1)
    fulfill_private(rooms, oracle, carol, 0, offered, 80, 13, 113,
                    valid=False, error="WRONG_OFFERER")
    fulfill_private(rooms, oracle, bob, 0, offered, 81, 14, 114,
                    valid=False, error="BAD_ELIGIBILITY_PERMIT")
    scenario.verify(held(output, rooms, 70) == 1)
    fulfill_private(rooms, oracle, bob, 0, offered, 80, 15, 115)
    rooms.assert_completed(nonce(115), _sender=bob)
    scenario.verify(held(output, bob, 70) == 1)
    scenario.verify(held(offered, alice, 80) == 1)
    scenario.verify(held(offered, bob, 80) == 0)
    scenario.verify(rooms.data.listings[0].remaining == 0)
    scenario.verify(rooms.data.claimed_tokens.contains(sp.record(
        claimant=bob.address, token_contract=output.address, token_id=70,
    )))
    rooms.cancel(listing_id=0, amount=1, _sender=alice,
                 _valid=False, _exception="INSUFFICIENT_REMAINING")
    create_private(rooms, oracle, alice, output, 70, carol, offered, 80, 16)
    rooms.cancel(listing_id=1, amount=1, _sender=alice)
    scenario.verify(held(output, alice, 70) == 1)
    scenario.verify(rooms.data.listings[1].remaining == 0)


@sp.add_test()
def private_offer_does_not_release_output_if_input_transfer_fails():
    scenario = sp.test_scenario("horf_v3_private_atomicity", [horf.main, mock_fa2])
    scenario.add_flag("protocol", "tallinn")
    admin = sp.test_account("Admin")
    oracle = sp.test_account("Oracle")
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")
    output = mock_fa2.MockFA2(False, False)
    offered = mock_fa2.MockFA2(False, False)
    rooms = horf.main.HorfRoomsV3(admin.address, oracle.public_key)
    scenario += output
    scenario += offered
    scenario += rooms
    output.mint(owner=alice.address, token_id=90, amount=1)
    offered.mint(owner=bob.address, token_id=91, amount=1)
    output.set_operator(owner=alice.address, operator=rooms.address, token_id=90,
                        enabled=True, _sender=alice)
    create_private(rooms, oracle, alice, output, 90, bob, offered, 91, 17)
    fulfill_private(rooms, oracle, bob, 0, offered, 91, 18, 118,
                    valid=False, error="FA2_NOT_OPERATOR")
    scenario.verify(held(output, rooms, 90) == 1)
    scenario.verify(held(output, bob, 90) == 0)
    scenario.verify(held(offered, bob, 91) == 1)
    scenario.verify(rooms.data.listings[0].remaining == 1)
    scenario.verify(~rooms.data.pending.contains(bob.address))
