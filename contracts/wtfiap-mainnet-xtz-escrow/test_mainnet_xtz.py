"""Local proof for the Mainnet XTZ duel candidate; no chain transactions."""
import hashlib
import importlib.util
from pathlib import Path

import smartpy as sp

source = Path(__file__).with_name("WtfIapMainnetXtzEscrow.py")
spec = importlib.util.spec_from_file_location("wtfiap_mainnet_xtz_source", source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
main = module.main


def digest(text):
    return sp.bytes("0x" + hashlib.sha256(text.encode()).hexdigest())


def fixture(scenario):
    creator = sp.test_account("room creator")
    referee = sp.test_account("match referee")
    treasury = sp.test_account("wtf treasury")
    alice = sp.test_account("alice")
    bob = sp.test_account("bob")
    token = sp.test_account("unused wtf token")
    escrow = main.WtfIapEscrow(creator.address, token.address, 0, treasury.address)
    scenario += escrow
    escrow.create_room(sp.record(room_id=digest("room"), terms_hash=digest("terms"),
        rules_hash=digest("rules"), seed_commitment=digest("seed"),
        referee=referee.address, currency=0, entry_amount=1000000,
        payout_mode=0, entrants=[alice.address, bob.address], host=alice.address), _sender=creator)
    return escrow, referee, alice, bob


def join():
    return sp.record(room_id=digest("room"), expected_terms_hash=digest("terms"))


@sp.add_test()
def mainnet_fee_is_separate_from_duel_pot():
    s = sp.test_scenario("mainnet_xtz_fee", main)
    escrow, referee, alice, bob = fixture(s)
    escrow.join_room(join(), _sender=alice, _amount=sp.mutez(1000000),
        _valid=False, _exception="ENTRY_AND_FEE_MISMATCH")
    escrow.join_room(join(), _sender=alice, _amount=sp.mutez(1500000))
    escrow.join_room(join(), _sender=bob, _amount=sp.mutez(1000000))
    s.verify(escrow.balance == sp.mutez(2500000))
    s.verify(escrow.data.rooms[digest("room")].held == 2000000)
    s.verify(escrow.data.rooms[digest("room")].fee_held == 500000)
    escrow.start_room(sp.record(room_id=digest("room"), expected_terms_hash=digest("terms"),
        match_id=digest("match")), _sender=referee)
    escrow.finalize_room(sp.record(room_id=digest("room"), match_id=digest("match"),
        transcript_hash=digest("transcript"), result_hash=digest("result"),
        ranks=[sp.record(player=alice.address, rank=1, group_size=1),
               sp.record(player=bob.address, rank=2, group_size=1)]), _sender=referee)
    s.verify(escrow.balance == sp.mutez(2000000))
    s.verify(escrow.data.rooms[digest("room")].fees_paid == 500000)
    s.verify(escrow.data.claims[(digest("room"), alice.address)].amount == 2000000)
    escrow.claim(digest("room"), _sender=alice)
    s.verify(escrow.balance == sp.mutez(0))


@sp.add_test()
def withdrawal_refunds_entry_and_unearned_fee():
    s = sp.test_scenario("mainnet_xtz_refund", main)
    escrow, _, alice, _ = fixture(s)
    escrow.join_room(join(), _sender=alice, _amount=sp.mutez(1500000))
    escrow.refund(digest("room"), _sender=alice)
    s.verify(escrow.balance == sp.mutez(0))
    s.verify(escrow.data.rooms[digest("room")].held == 0)
    s.verify(escrow.data.rooms[digest("room")].fee_held == 0)


@sp.add_test()
def technical_void_refunds_both_funded_entries_and_fees():
    s = sp.test_scenario("mainnet_xtz_void", main)
    escrow, referee, alice, bob = fixture(s)
    escrow.join_room(join(), _sender=alice, _amount=sp.mutez(1500000))
    escrow.join_room(join(), _sender=bob, _amount=sp.mutez(1000000))
    escrow.start_room(sp.record(room_id=digest("room"), expected_terms_hash=digest("terms"),
        match_id=digest("match")), _sender=referee)
    escrow.void_room(sp.record(room_id=digest("room"), reason_hash=digest("technical"),
        evidence_hash=digest("evidence")), _sender=referee)
    escrow.refund(digest("room"), _sender=alice)
    escrow.refund(digest("room"), _sender=bob)
    s.verify(escrow.balance == sp.mutez(0))
    s.verify(escrow.data.rooms[digest("room")].fee_held == 0)
    s.verify(escrow.data.rooms[digest("room")].fees_paid == 0)
