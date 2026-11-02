"""Local SmartPy rehearsal for the additive sponsor-prize escrow."""
import hashlib
from pathlib import Path

import smartpy as sp

import importlib.util

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

source = load("wtfiap_sponsor_escrow_source", Path(__file__).with_name("WtfIapSponsorEscrow.py"))
token_source = load("wtfiap_sponsor_dummy_token", Path(__file__).with_name("DummyPrizeFA2.py"))
main = source.main
dummy = token_source.main

def digest(value):
    return sp.bytes("0x" + hashlib.sha256(value.encode()).hexdigest())

def room(name, sponsor, referee, places, lots=None, *, entry_currency=0,
         entry_amount=0, pool_numerator=0, pool_denominator=100,
         mode=0, pick_counts=None, minimum_humans=None, designated_wallet=None):
    return sp.record(
        room_id=digest(name), terms_hash=digest(name + ":terms"),
        rules_hash=digest(name + ":rules"), seed_commitment=digest(name + ":seed"),
        referee=referee, sponsor=sponsor, mode=mode,
        minimum_humans=minimum_humans or len(places),
        entry_currency=entry_currency, entry_amount=entry_amount,
        pool_numerator=pool_numerator, pool_denominator=pool_denominator,
        designated_wallet=sponsor if designated_wallet is None else designated_wallet,
        places=[sp.record(xtz=p[0], wtf=p[1], pool_weight=p[2]) for p in places],
        lots=lots or [], pick_counts=pick_counts or [],
    )

def room_hash(name):
    return sp.record(room_id=digest(name), expected_terms_hash=digest(name + ":terms"))

def start(name):
    return sp.record(room_id=digest(name), expected_terms_hash=digest(name + ":terms"),
                     match_id=digest(name + ":match"))

def finish(name, players, places=None):
    return sp.record(room_id=digest(name), match_id=digest(name + ":match"),
                     transcript_hash=digest(name + ":transcript"),
                     result_hash=digest(name + ":result"),
                     human_ranks=[player.address for player in players],
                     lot_places=places or [])

def setup(s):
    creator = sp.test_account("creator")
    sponsor = sp.test_account("sponsor")
    referee = sp.test_account("referee")
    designated = sp.test_account("designated")
    treasury = sp.test_account("treasury")
    outsider = sp.test_account("outsider")
    players = [sp.test_account("player " + str(i)) for i in range(3)]
    token = dummy.DummyPrizeFA2(creator.address)
    escrow = main.WtfIapSponsorEscrow(creator.address, token.address, 0,
                                     treasury.address, 500000)
    s += token
    s += escrow
    return creator, sponsor, referee, designated, treasury, outsider, players, token, escrow

def register(escrow, name, creator, players):
    for player in players:
        escrow.register_entrant(sp.record(room_id=digest(name), player=player.address),
                               _sender=creator)

def operator(token, owner, escrow, token_id):
    token.update_operators([sp.variant("add_operator", sp.record(
        owner=owner.address, operator=escrow.address, token_id=token_id))],
        _sender=owner)

@sp.add_test()
def sponsored_free_room():
    s = sp.test_scenario("sponsor_free_room", [dummy, main])
    creator, sponsor, referee, designated, treasury, outsider, players, token, escrow = setup(s)
    escrow.create_room(room("free", sponsor.address, referee.address,
                            [(20000, 0, 0), (10000, 0, 0)]), _sender=creator)
    escrow.fund_sponsor_xtz(room_hash("free"), _sender=sponsor, _amount=sp.mutez(30000))
    register(escrow, "free", creator, players[:2])
    for player in players[:2]:
        escrow.join_room(room_hash("free"), _sender=player)
    escrow.start_room(start("free"), _sender=referee)
    escrow.finalize_room(finish("free", players[:2]), _sender=referee)
    escrow.claim_cash(sp.record(room_id=digest("free"), recipient=players[0].address,
                                currency=0), _sender=outsider)
    escrow.claim_cash(sp.record(room_id=digest("free"), recipient=players[1].address,
                                currency=0), _sender=outsider)
    s.verify(escrow.data.rooms[digest("free")].held_xtz == 0)
    s.verify(escrow.balance == sp.mutez(0))

@sp.add_test()
def sponsored_paid_room_fee_split():
    s = sp.test_scenario("sponsor_paid_room_fee_split", [dummy, main])
    creator, sponsor, referee, designated, treasury, outsider, players, token, escrow = setup(s)
    escrow.create_room(room("paid", sponsor.address, referee.address,
                            [(10000, 0, 3), (10000, 0, 2)],
                            entry_currency=1, entry_amount=10000,
                            pool_numerator=25, pool_denominator=100,
                            designated_wallet=designated.address), _sender=creator)
    escrow.fund_sponsor_xtz(room_hash("paid"), _sender=sponsor,
                            _amount=sp.mutez(520000))
    register(escrow, "paid", creator, players)
    for player in players:
        escrow.join_room(room_hash("paid"), _sender=player,
                         _amount=sp.mutez(10000))
    escrow.start_room(start("paid"), _sender=referee)
    escrow.finalize_room(finish("paid", players), _sender=referee)
    # Pool 7500 mutez is below a 0.01 XTZ quantum, so its entire remainder
    # goes to wtf.tez. Fee 22500 likewise rounds the designated share down.
    key = lambda address: (digest("paid"), (address, 0))
    s.verify(escrow.data.cash_claims[key(players[0].address)].amount == 10000)
    s.verify(escrow.data.cash_claims[key(players[1].address)].amount == 10000)
    s.verify(escrow.data.cash_claims[key(designated.address)].amount == 20000)
    s.verify(escrow.data.cash_claims[key(treasury.address)].amount == 510000)
    for recipient in [players[0], players[1], designated, treasury]:
        escrow.claim_cash(sp.record(room_id=digest("paid"), recipient=recipient.address,
                                    currency=0), _sender=outsider)
    s.verify(escrow.data.rooms[digest("paid")].held_xtz == 0)
    s.verify(escrow.balance == sp.mutez(0))

@sp.add_test()
def mixed_fa2_prizes_and_human_places():
    s = sp.test_scenario("sponsor_mixed_fa2_prizes", [dummy, main])
    creator, sponsor, referee, designated, treasury, outsider, players, token, escrow = setup(s)
    token.mint(sp.record(to_=sponsor.address, token_id=0, amount=3000000), _sender=creator)
    token.mint(sp.record(to_=sponsor.address, token_id=7, amount=1), _sender=creator)
    lot = sp.record(token_address=token.address, token_id=7, amount=1, fixed_place=2)
    escrow.create_room(room("mixed", sponsor.address, referee.address,
                            [(10000, 1000000, 0), (10000, 2000000, 0)],
                            lots=[lot], minimum_humans=2), _sender=creator)
    escrow.fund_sponsor_xtz(room_hash("mixed"), _sender=sponsor,
                            _amount=sp.mutez(20000))
    escrow.fund_sponsor_wtf(room_hash("mixed"), _sender=sponsor,
                            _valid=False, _exception="FA2_NOT_OPERATOR")
    operator(token, sponsor, escrow, 0)
    escrow.fund_sponsor_wtf(room_hash("mixed"), _sender=sponsor)
    escrow.fund_sponsor_lot(sp.record(room_id=digest("mixed"), index=0,
                expected_terms_hash=digest("mixed:terms")), _sender=sponsor,
                _valid=False, _exception="FA2_NOT_OPERATOR")
    operator(token, sponsor, escrow, 7)
    escrow.fund_sponsor_lot(sp.record(room_id=digest("mixed"), index=0,
                expected_terms_hash=digest("mixed:terms")), _sender=sponsor)
    register(escrow, "mixed", creator, players[:2])
    for player in players[:2]:
        escrow.join_room(room_hash("mixed"), _sender=player)
    escrow.start_room(start("mixed"), _sender=referee)
    escrow.finalize_room(finish("mixed", players[:2], places=[1]), _sender=referee,
        _valid=False, _exception="FIXED_LOT_MISMATCH")
    escrow.finalize_room(finish("mixed", [outsider, players[1]], places=[2]),
        _sender=referee, _valid=False, _exception="INVALID_HUMAN_RANK")
    escrow.finalize_room(finish("mixed", players[:2], places=[2]), _sender=referee)
    escrow.claim_cash(sp.record(room_id=digest("mixed"), recipient=players[0].address,
                                currency=0), _sender=outsider)
    escrow.claim_cash(sp.record(room_id=digest("mixed"), recipient=players[1].address,
                                currency=0), _sender=outsider)
    escrow.claim_cash(sp.record(room_id=digest("mixed"), recipient=players[0].address,
                                currency=1), _sender=outsider)
    escrow.claim_cash(sp.record(room_id=digest("mixed"), recipient=players[1].address,
                                currency=1), _sender=outsider)
    escrow.claim_lot(sp.record(room_id=digest("mixed"), index=0), _sender=outsider)
    s.verify(token.data.ledger[(players[1].address, 7)] == 1)
    s.verify(escrow.data.rooms[digest("mixed")].held_xtz == 0)
    s.verify(escrow.data.rooms[digest("mixed")].held_wtf == 0)

@sp.add_test()
def prestart_cancellation_refunds_every_asset():
    s = sp.test_scenario("sponsor_cancellation_refunds", [dummy, main])
    creator, sponsor, referee, designated, treasury, outsider, players, token, escrow = setup(s)
    token.mint(sp.record(to_=sponsor.address, token_id=9, amount=1), _sender=creator)
    operator(token, sponsor, escrow, 9)
    lot = sp.record(token_address=token.address, token_id=9, amount=1, fixed_place=1)
    escrow.create_room(room("cancel", sponsor.address, referee.address,
                            [(10000, 0, 0)], lots=[lot], entry_currency=1,
                            entry_amount=10000, designated_wallet=designated.address),
                       _sender=creator)
    escrow.fund_sponsor_xtz(room_hash("cancel"), _sender=sponsor,
                            _amount=sp.mutez(510000))
    escrow.fund_sponsor_lot(sp.record(room_id=digest("cancel"), index=0,
                expected_terms_hash=digest("cancel:terms")), _sender=sponsor)
    register(escrow, "cancel", creator, players[:2])
    escrow.join_room(room_hash("cancel"), _sender=players[0],
                     _amount=sp.mutez(10000))
    escrow.cancel_room(digest("cancel"), _sender=sponsor)
    escrow.start_room(start("cancel"), _sender=referee,
                      _valid=False, _exception="ROOM_NOT_FUNDING")
    escrow.refund_entry(sp.record(room_id=digest("cancel"), player=players[0].address),
                        _sender=outsider)
    escrow.refund_sponsor_xtz(digest("cancel"), _sender=outsider)
    escrow.refund_sponsor_lot(sp.record(room_id=digest("cancel"), index=0),
                              _sender=outsider)
    s.verify(escrow.balance == sp.mutez(0))
    s.verify(escrow.data.rooms[digest("cancel")].held_xtz == 0)
    s.verify(token.data.ledger[(sponsor.address, 9)] == 1)

@sp.add_test()
def technical_void_refunds_wtf_entries_and_sponsor():
    s = sp.test_scenario("sponsor_technical_void_refunds", [dummy, main])
    creator, sponsor, referee, designated, treasury, outsider, players, token, escrow = setup(s)
    token.mint(sp.record(to_=sponsor.address, token_id=0, amount=2000000), _sender=creator)
    operator(token, sponsor, escrow, 0)
    for player in players[:2]:
        token.mint(sp.record(to_=player.address, token_id=0, amount=1000000), _sender=creator)
        operator(token, player, escrow, 0)
    escrow.create_room(room("void", sponsor.address, referee.address,
                            [(10000, 2000000, 0)], entry_currency=2,
                            entry_amount=1000000,
                            designated_wallet=designated.address), _sender=creator)
    escrow.fund_sponsor_xtz(room_hash("void"), _sender=sponsor,
                            _amount=sp.mutez(10000))
    escrow.fund_sponsor_wtf(room_hash("void"), _sender=sponsor)
    register(escrow, "void", creator, players[:2])
    for player in players[:2]:
        escrow.join_room(room_hash("void"), _sender=player)
    escrow.start_room(start("void"), _sender=referee)
    escrow.void_room(sp.record(room_id=digest("void"), reason_hash=digest("failure"),
                               evidence_hash=digest("replay")), _sender=referee)
    for player in players[:2]:
        escrow.refund_entry(sp.record(room_id=digest("void"), player=player.address),
                            _sender=outsider)
    escrow.refund_sponsor_xtz(digest("void"), _sender=outsider)
    escrow.refund_sponsor_wtf(digest("void"), _sender=outsider)
    s.verify(escrow.data.rooms[digest("void")].held_xtz == 0)
    s.verify(escrow.data.rooms[digest("void")].held_wtf == 0)
    s.verify(token.data.ledger[(sponsor.address, 0)] == 2000000)
    for player in players[:2]:
        s.verify(token.data.ledger[(player.address, 0)] == 1000000)

@sp.add_test()
def place_order_allocation_enforces_counts():
    s = sp.test_scenario("sponsor_place_order_allocation", [dummy, main])
    creator, sponsor, referee, designated, treasury, outsider, players, token, escrow = setup(s)
    token.mint(sp.record(to_=sponsor.address, token_id=7, amount=1), _sender=creator)
    token.mint(sp.record(to_=sponsor.address, token_id=8, amount=1), _sender=creator)
    operator(token, sponsor, escrow, 7)
    operator(token, sponsor, escrow, 8)
    lots = [sp.record(token_address=token.address, token_id=token_id,
                      amount=1, fixed_place=0) for token_id in (7, 8)]
    escrow.create_room(room("pick", sponsor.address, referee.address,
                            [(0, 0, 0), (0, 0, 0)], lots=lots,
                            mode=2, pick_counts=[1, 1]), _sender=creator)
    for index in (0, 1):
        escrow.fund_sponsor_lot(sp.record(room_id=digest("pick"), index=index,
                    expected_terms_hash=digest("pick:terms")), _sender=sponsor)
    register(escrow, "pick", creator, players[:2])
    for player in players[:2]:
        escrow.join_room(room_hash("pick"), _sender=player)
    escrow.start_room(start("pick"), _sender=referee)
    escrow.finalize_room(finish("pick", players[:2], places=[1, 1]),
        _sender=referee, _valid=False, _exception="PICK_COUNT_MISMATCH")
    escrow.finalize_room(finish("pick", players[:2], places=[2, 1]),
                         _sender=referee)
    escrow.claim_lot(sp.record(room_id=digest("pick"), index=0), _sender=outsider)
    escrow.claim_lot(sp.record(room_id=digest("pick"), index=1), _sender=outsider)
    s.verify(token.data.ledger[(players[1].address, 7)] == 1)
    s.verify(token.data.ledger[(players[0].address, 8)] == 1)
