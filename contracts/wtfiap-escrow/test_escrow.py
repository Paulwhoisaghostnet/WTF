"""Focused current-SmartPy scenarios. Only local test accounts and dummy tokens."""
import hashlib
import importlib.util
from pathlib import Path
from types import SimpleNamespace

import smartpy as sp

ROOT = Path(__file__).resolve().parents[2]

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

escrow_module = load("wtfiap_escrow_source", Path(__file__).with_name("WtfIapEscrow.py"))
token_module = load("wtfiap_dummy_token", ROOT / "contracts/wtf-xtz-exchange/DummyWtfFA2.py")
main = escrow_module.main
wtfiap_escrow_main = escrow_module.main
dummy = token_module.main

def digest(value):
    return sp.bytes("0x" + hashlib.sha256(value.encode()).hexdigest())

def fixture(scenario, treasury_address=None, player_count=8):
    creator = sp.test_account("WTFIAP room creator")
    referee = sp.test_account("WTFIAP room referee")
    outsider = sp.test_account("WTFIAP outsider")
    players = [sp.test_account("WTFIAP entrant " + str(i)) for i in range(player_count)]
    token = dummy.DummyWtfFA2(
        admin=creator.address, metadata=sp.big_map({"": sp.bytes("0x")}),
        ledger={}, token_metadata=token_module.token_metadata(),
    )
    treasury = sp.test_account("WTFIAP immutable treasury")
    escrow = main.WtfIapEscrow(creator.address, token.address, 0, treasury.address if treasury_address is None else treasury_address)
    scenario += token
    scenario += escrow
    return SimpleNamespace(creator=creator, referee=referee, outsider=outsider,
                           players=players, token=token, escrow=escrow, treasury=treasury)

def create(f, name="room", currency=0, entry=None, entrants=None, payout_mode=None, **overrides):
    if entry is None:
        entry = 10000 if currency == 0 else 1000000
    if payout_mode is None:
        payout_mode = 0 if len(f.players) == 2 else 1
    values = dict(room_id=digest(name), terms_hash=digest(name + ":terms"),
                  rules_hash=digest("rules"), seed_commitment=digest("seed"),
                  referee=f.referee.address, currency=currency, entry_amount=entry,
                  payout_mode=payout_mode,
                  entrants=entrants or [p.address for p in f.players])
    values.update(overrides)
    return sp.record(**values)

def join(name="room"):
    return sp.record(room_id=digest(name), expected_terms_hash=digest(name + ":terms"))

def start(name="room"):
    return sp.record(room_id=digest(name), expected_terms_hash=digest(name + ":terms"), match_id=digest(name + ":match"))

def outcome(f, name="room", ranks=None, order=None, group_sizes=None, **overrides):
    rank_values = ranks or list(range(1, len(f.players) + 1))
    values = dict(room_id=digest(name), match_id=digest(name + ":match"),
                  transcript_hash=digest(name + ":transcript"), result_hash=digest(name + ":result"),
                  ranks=[sp.record(player=f.players[i].address, rank=rank_values[i],
                                   group_size=(group_sizes or {value: rank_values.count(value) for value in rank_values})[rank_values[i]])
                         for i in (order or range(len(f.players)))])
    values.update(overrides)
    return sp.record(**values)

def operator(f, player):
    f.token.update_operators([sp.variant("add_operator", sp.record(
        owner=player.address, operator=f.escrow.address, token_id=0))], _sender=player)

def fund(f, name="room", currency=0, entry=None):
    if entry is None:
        entry = 10000 if currency == 0 else 1000000
    for player in f.players:
        if currency == 1:
            f.token.mint([sp.record(to_=player.address, amount=entry)], _sender=f.creator)
            operator(f, player)
        f.escrow.join_room(join(name), _sender=player, _amount=sp.mutez(entry if currency == 0 else 0))

def claim_value(f, name, i):
    return f.escrow.data.claims[(digest(name), f.players[i].address)]

@sp.add_test()
def native_lifecycle():
    s = sp.test_scenario("wtfiap_escrow_native", [dummy, main])
    f = fixture(s)
    f.escrow.create_room(create(f), _sender=f.creator)
    fund(f)
    s.verify(f.escrow.balance == sp.mutez(80000))
    s.verify(f.escrow.data.rooms[digest("room")].held == 80000)
    f.escrow.start_room(start(), _sender=f.referee)
    f.escrow.finalize_room(outcome(f), _sender=f.referee)
    f.escrow.void_room(sp.record(room_id=digest("room"), reason_hash=digest("reason"), evidence_hash=digest("evidence")), _sender=f.referee, _valid=False, _exception="VOID_NOT_AVAILABLE")
    for i, amount in enumerate([40000, 20000, 10000, 0, 0, 0, 0, 0]):
        s.verify(claim_value(f, "room", i).amount == amount)
    f.escrow.claim(digest("room"), _sender=f.outsider, _valid=False, _exception="NO_CLAIM")
    f.escrow.claim(digest("room"), _sender=f.players[4], _valid=False, _exception="NO_AWARD")
    for i in [2, 0, 1]:
        f.escrow.claim(digest("room"), _sender=f.players[i])
        s.verify(claim_value(f, "room", i).claimed)
    s.verify(f.escrow.data.rooms[digest("room")].treasury_amount == 10000)
    f.escrow.claim_treasury(digest("room"), _sender=f.outsider)
    f.escrow.claim_treasury(digest("room"), _sender=f.outsider, _valid=False, _exception="TREASURY_ALREADY_CLAIMED")
    s.verify(f.escrow.balance == sp.mutez(0))
    s.verify(f.escrow.data.rooms[digest("room")].held == 0)
    s.verify(f.escrow.data.rooms[digest("room")].paid_out == 80000)
    f.escrow.claim(digest("room"), _sender=f.players[0], _valid=False, _exception="ALREADY_CLAIMED")
    f.escrow.finalize_room(outcome(f), _sender=f.referee, _valid=False, _exception="ROOM_NOT_ACTIVE")

@sp.add_test()
def funding_and_bindings():
    s = sp.test_scenario("wtfiap_escrow_gates", [dummy, main])
    f = fixture(s)
    f.escrow.default(_sender=f.players[0], _amount=sp.mutez(1), _valid=False, _exception="DEFAULT_DISABLED")
    f.escrow.create_room(create(f), _sender=f.outsider, _valid=False, _exception="NOT_ROOM_CREATOR")
    f.escrow.create_room(create(f), _sender=f.creator, _amount=sp.mutez(1), _valid=False, _exception="NO_XTZ_IN")
    f.escrow.create_room(create(f, entrants=[f.players[0].address]), _sender=f.creator, _valid=False, _exception="TOURNAMENT_ENTRANT_COUNT")
    f.escrow.create_room(create(f, payout_mode=2), _sender=f.creator, _valid=False, _exception="BAD_PAYOUT_MODE")
    f.escrow.create_room(create(f, entrants=[f.players[0].address] * 8), _sender=f.creator, _valid=False, _exception="DUPLICATE_ENTRANT")
    f.escrow.create_room(create(f, entry=0), _sender=f.creator, _valid=False, _exception="ZERO_ENTRY")
    f.escrow.create_room(create(f, entry=10001), _sender=f.creator, _valid=False, _exception="ENTRY_QUANTUM")
    f.escrow.create_room(create(f, currency=1, entry=10000), _sender=f.creator, _valid=False, _exception="ENTRY_QUANTUM")
    f.escrow.create_room(create(f, currency=2), _sender=f.creator, _valid=False, _exception="BAD_CURRENCY")
    for field, error in [("room_id", "BAD_ROOM_ID"), ("terms_hash", "BAD_TERMS_HASH"), ("rules_hash", "BAD_RULES_HASH"), ("seed_commitment", "BAD_SEED_COMMITMENT")]:
        f.escrow.create_room(create(f, **{field: sp.bytes("0x00")}), _sender=f.creator, _valid=False, _exception=error)
    f.escrow.create_room(create(f), _sender=f.creator)
    f.escrow.create_room(create(f), _sender=f.creator, _valid=False, _exception="ROOM_EXISTS")
    f.escrow.join_room(join(), _sender=f.outsider, _amount=sp.mutez(10000), _valid=False, _exception="NOT_ENTRANT")
    f.escrow.join_room(sp.record(room_id=digest("room"), expected_terms_hash=digest("wrong")), _sender=f.players[0], _amount=sp.mutez(10000), _valid=False, _exception="TERMS_MISMATCH")
    for amount in [0, 9999, 10001]:
        f.escrow.join_room(join(), _sender=f.players[0], _amount=sp.mutez(amount), _valid=False, _exception="ENTRY_AMOUNT_MISMATCH")
    f.escrow.start_room(start(), _sender=f.outsider, _valid=False, _exception="NOT_REFEREE")
    f.escrow.start_room(start(), _sender=f.referee, _valid=False, _exception="ROOM_NOT_FUNDED")
    f.escrow.join_room(join(), _sender=f.players[0], _amount=sp.mutez(10000))
    f.escrow.join_room(join(), _sender=f.players[0], _amount=sp.mutez(10000), _valid=False, _exception="ALREADY_FUNDED")
    s.verify(f.escrow.balance == sp.mutez(10000))
    s.verify(f.escrow.data.rooms[digest("room")].held == 10000)
    for player in f.players[1:]:
        f.escrow.join_room(join(), _sender=player, _amount=sp.mutez(10000))
    f.escrow.start_room(start(), _sender=f.referee)
    f.escrow.join_room(join(), _sender=f.outsider, _amount=sp.mutez(10000), _valid=False, _exception="ROOM_NOT_FUNDING")
    f.escrow.start_room(start(), _sender=f.referee, _valid=False, _exception="ROOM_NOT_FUNDING")
    f.escrow.finalize_room(outcome(f), _sender=f.outsider, _valid=False, _exception="NOT_REFEREE")
    f.escrow.finalize_room(outcome(f, match_id=digest("different-match")), _sender=f.referee, _valid=False, _exception="MATCH_MISMATCH")
    f.escrow.finalize_room(outcome(f, ranks=[1, 2, 2, 3, 5, 6, 7, 8]), _sender=f.referee, _valid=False, _exception="OVERLAPPING_RANK_GROUPS")
    f.escrow.finalize_room(outcome(f, ranks=[1, 1, 2, 4, 5, 6, 7, 8]), _sender=f.referee, _valid=False, _exception="OVERLAPPING_RANK_GROUPS")
    f.escrow.finalize_room(outcome(f, order=[0, 1, 2, 3, 4, 5, 6, 6]), _sender=f.referee, _valid=False, _exception="GROUP_SIZE_UNDERCOUNTS_HUMANS")
    f.escrow.finalize_room(outcome(f, ranks=[0, 2, 3, 4, 5, 6, 7, 8]), _sender=f.referee, _valid=False, _exception="BAD_RANK")
    s.verify(f.escrow.data.rooms[digest("room")].status == 1)
    s.verify(~f.escrow.data.claims.contains((digest("room"), f.players[0].address)))
    f.escrow.finalize_room(outcome(f), _sender=f.referee)

@sp.add_test()
def token_atomicity_and_claims():
    s = sp.test_scenario("wtfiap_escrow_fa2", [dummy, main])
    f = fixture(s)
    f.escrow.create_room(create(f, currency=1), _sender=f.creator)
    f.token.mint([sp.record(to_=f.players[0].address, amount=1000000)], _sender=f.creator)
    f.escrow.join_room(join(), _sender=f.players[0], _valid=False, _exception="FA2_NOT_OPERATOR")
    s.verify(~f.escrow.data.rooms[digest("room")].paid.contains(f.players[0].address))
    s.verify(f.escrow.data.rooms[digest("room")].deposited == 0)
    operator(f, f.players[0])
    f.escrow.join_room(join(), _sender=f.players[0], _amount=sp.mutez(1), _valid=False, _exception="NO_XTZ_IN")
    f.escrow.join_room(join(), _sender=f.players[0])
    operator(f, f.players[1])
    f.escrow.join_room(join(), _sender=f.players[1], _valid=False, _exception="FA2_INSUFFICIENT_BALANCE")
    s.verify(f.escrow.data.rooms[digest("room")].held == 1000000)
    for player in f.players[1:]:
        f.token.mint([sp.record(to_=player.address, amount=1000000)], _sender=f.creator)
        operator(f, player)
        f.escrow.join_room(join(), _sender=player)
    s.verify(f.token.data.ledger[f.escrow.address] == 8000000)
    s.verify(f.escrow.balance == sp.mutez(0))
    f.escrow.start_room(start(), _sender=f.referee)
    f.escrow.finalize_room(outcome(f, ranks=[1, 2, 3, 3, 5, 6, 7, 8]), _sender=f.referee)
    for i, amount in enumerate([4000000, 2000000, 0, 0, 0, 0, 0, 0]):
        s.verify(claim_value(f, "room", i).amount == amount)
        if amount:
            f.escrow.claim(digest("room"), _sender=f.players[i])
            s.verify(f.token.data.ledger[f.players[i].address] == amount)
    s.verify(f.escrow.data.rooms[digest("room")].treasury_amount == 2000000)
    f.escrow.claim_treasury(digest("room"), _sender=f.outsider)
    s.verify(f.token.data.ledger[f.treasury.address] == 2000000)
    s.verify(f.token.data.ledger[f.escrow.address] == 0)
    s.verify(f.escrow.data.rooms[digest("room")].held == 0)

@sp.add_test()
def duel_winner_takes_pot_and_exact_tie():
    s = sp.test_scenario("wtfiap_escrow_duels", [dummy, main])
    f = fixture(s, player_count=2)
    for currency in [0, 1]:
        name = "duel-" + str(currency)
        entry = 10000 if currency == 0 else 1000000
        f.escrow.create_room(create(f, name, currency), _sender=f.creator)
        fund(f, name, currency)
        f.escrow.refund(digest(name), _sender=f.players[1])
        f.escrow.start_room(start(name), _sender=f.referee, _valid=False, _exception="ROOM_NOT_FUNDED")
        f.escrow.join_room(join(name), _sender=f.players[1], _amount=sp.mutez(entry if currency == 0 else 0))
        f.escrow.start_room(start(name), _sender=f.referee)
        f.escrow.finalize_room(outcome(f, name), _sender=f.referee)
        s.verify(claim_value(f, name, 0).amount == entry * 2)
        s.verify(claim_value(f, name, 1).amount == 0)
        s.verify(f.escrow.data.rooms[digest(name)].treasury_amount == 0)
        f.escrow.claim(digest(name), _sender=f.players[1], _valid=False, _exception="NO_AWARD")
        f.escrow.claim(digest(name), _sender=f.players[0])
        f.escrow.claim_treasury(digest(name), _sender=f.outsider, _valid=False, _exception="NO_TREASURY_AWARD")
        s.verify(f.escrow.data.rooms[digest(name)].held == 0)
    tie = "duel-tie"
    f.escrow.create_room(create(f, tie), _sender=f.creator)
    fund(f, tie)
    f.escrow.start_room(start(tie), _sender=f.referee)
    f.escrow.finalize_room(outcome(f, tie, ranks=[1, 1]), _sender=f.referee)
    for player in f.players:
        s.verify(f.escrow.data.claims[(digest(tie), player.address)].amount == 10000)
        f.escrow.claim(digest(tie), _sender=player)
    s.verify(f.escrow.data.rooms[digest(tie)].held == 0)

@sp.add_test()
def ai_filled_tournament_prizes_retain_full_field_places():
    s = sp.test_scenario("wtfiap_escrow_ai_filled", [dummy, main])
    f = fixture(s, player_count=2)
    for currency in [0, 1]:
        quantum = 10000 if currency == 0 else 1000000
        entry = 10 * quantum
        name = "ai-field-" + str(currency)
        f.escrow.create_room(create(f, name, currency, entry=entry, payout_mode=1), _sender=f.creator)
        fund(f, name, currency, entry)
        f.escrow.start_room(start(name), _sender=f.referee)
        # AI holds first and third; humans occupy second and fifth.
        f.escrow.finalize_room(outcome(f, name, ranks=[2, 5]), _sender=f.referee)
        s.verify(claim_value(f, name, 0).amount == 7 * quantum)
        s.verify(claim_value(f, name, 1).amount == 0)
        s.verify(f.escrow.data.rooms[digest(name)].treasury_amount == 13 * quantum)
        f.escrow.claim(digest(name), _sender=f.players[0])
        f.escrow.claim_treasury(digest(name), _sender=f.outsider)
        s.verify(f.escrow.data.rooms[digest(name)].held == 0)
    tied = "ai-tied-with-human"
    f.escrow.create_room(create(f, tied, entry=100000, payout_mode=1), _sender=f.creator)
    fund(f, tied, entry=100000)
    f.escrow.start_room(start(tied), _sender=f.referee)
    # The human at second ties with AI for second and third place.
    f.escrow.finalize_room(outcome(f, tied, ranks=[2, 5], group_sizes={2: 2, 5: 1}), _sender=f.referee)
    s.verify(claim_value(f, tied, 0).amount == 50000)
    s.verify(f.escrow.data.rooms[digest(tied)].treasury_amount == 150000)

@sp.add_test()
def ties_and_permutations():
    s = sp.test_scenario("wtfiap_escrow_ties", [dummy, main])
    f = fixture(s)
    cases = [
        ([1, 2, 2, 4, 5, 6, 7, 8], [40000, 20000, 20000, 0, 0, 0, 0, 0]),
        ([1, 2, 3, 3, 5, 6, 7, 8], [40000, 20000, 0, 0, 0, 0, 0, 0]),
        ([1, 2, 2, 2, 5, 6, 7, 8], [40000, 10000, 10000, 10000, 0, 0, 0, 0]),
        ([1, 2, 2, 2, 2, 2, 2, 2], [40000, 0, 0, 0, 0, 0, 0, 0]),
        ([1, 2, 3, 3, 3, 3, 3, 3], [40000, 20000, 0, 0, 0, 0, 0, 0]),
        ([1, 2, 3, 4, 4, 4, 4, 4], [40000, 20000, 10000, 0, 0, 0, 0, 0]),
    ]
    for case_index, (ranks, expected) in enumerate(cases):
        name = "tie-" + str(case_index)
        f.escrow.create_room(create(f, name), _sender=f.creator)
        fund(f, name)
        f.escrow.start_room(start(name), _sender=f.referee)
        f.escrow.finalize_room(outcome(f, name, ranks, order=list(reversed(range(8)))), _sender=f.referee)
        for i, amount in enumerate(expected):
            s.verify(claim_value(f, name, i).amount == amount)
            if amount:
                f.escrow.claim(digest(name), _sender=f.players[i])
        remainder = 80000 - sum(expected)
        s.verify(f.escrow.data.rooms[digest(name)].treasury_amount == remainder)
        if remainder:
            f.escrow.claim_treasury(digest(name), _sender=f.outsider)
        else:
            f.escrow.claim_treasury(digest(name), _sender=f.outsider, _valid=False, _exception="NO_TREASURY_AWARD")
        s.verify(f.escrow.data.rooms[digest(name)].held == 0)
    s.verify(f.escrow.balance == sp.mutez(0))

@sp.add_test()
def withdrawals_and_technical_voids():
    s = sp.test_scenario("wtfiap_escrow_refunds", [dummy, main])
    f = fixture(s)
    for currency in [0, 1]:
        name = "refund-" + str(currency)
        entry = 10000 if currency == 0 else 1000000
        f.escrow.create_room(create(f, name, currency), _sender=f.creator)
        fund(f, name, currency)
        f.escrow.refund(digest(name), _sender=f.outsider, _valid=False, _exception="NO_DEPOSIT")
        f.escrow.refund(digest(name), _sender=f.players[0])
        s.verify(f.escrow.data.rooms[digest(name)].held == entry * 7)
        s.verify(f.escrow.data.rooms[digest(name)].refunded == entry)
        if currency == 1:
            s.verify(f.token.data.ledger[f.players[0].address] == entry)
        f.escrow.refund(digest(name), _sender=f.players[0], _valid=False, _exception="NO_DEPOSIT")
        f.escrow.start_room(start(name), _sender=f.referee, _valid=False, _exception="ROOM_NOT_FUNDED")
        f.escrow.join_room(join(name), _sender=f.players[0], _amount=sp.mutez(entry if currency == 0 else 0))
        s.verify(f.escrow.data.rooms[digest(name)].deposited == entry * 9)
        f.escrow.start_room(start(name), _sender=f.referee)
        f.escrow.refund(digest(name), _sender=f.players[0], _valid=False, _exception="REFUND_NOT_AVAILABLE")
        void = sp.record(room_id=digest(name), reason_hash=digest("technical-reason"), evidence_hash=digest("auditable-evidence"))
        f.escrow.void_room(void, _sender=f.outsider, _valid=False, _exception="NOT_REFEREE")
        f.escrow.void_room(sp.record(room_id=digest(name), reason_hash=sp.bytes("0x"), evidence_hash=digest("evidence")), _sender=f.referee, _valid=False, _exception="BAD_REASON_HASH")
        f.escrow.void_room(sp.record(room_id=digest(name), reason_hash=digest("reason"), evidence_hash=sp.bytes("0x")), _sender=f.referee, _valid=False, _exception="BAD_EVIDENCE_HASH")
        f.escrow.void_room(void, _sender=f.referee)
        s.verify(f.escrow.data.rooms[digest(name)].void_evidence_hash.unwrap_some() == digest("auditable-evidence"))
        f.escrow.void_room(void, _sender=f.referee, _valid=False, _exception="VOID_NOT_AVAILABLE")
        f.escrow.start_room(start(name), _sender=f.referee, _valid=False, _exception="ROOM_NOT_FUNDING")
        f.escrow.finalize_room(outcome(f, name), _sender=f.referee, _valid=False, _exception="ROOM_NOT_ACTIVE")
        for player in reversed(f.players):
            f.escrow.refund(digest(name), _sender=player)
            if currency == 1:
                s.verify(f.token.data.ledger[player.address] == entry)
        room = f.escrow.data.rooms[digest(name)]
        s.verify(room.held == 0)
        s.verify(room.refunded == room.deposited)
        s.verify(room.treasury_amount == 0)
        s.verify(sp.len(room.paid) == 0)
        f.escrow.join_room(join(name), _sender=f.players[0], _amount=sp.mutez(entry if currency == 0 else 0), _valid=False, _exception="ROOM_NOT_FUNDING")
    # A technical failure may also void a partially funded room.
    f.escrow.create_room(create(f, "partial"), _sender=f.creator)
    f.escrow.join_room(join("partial"), _sender=f.players[0], _amount=sp.mutez(10000))
    f.escrow.void_room(sp.record(room_id=digest("partial"), reason_hash=digest("reason"), evidence_hash=digest("evidence")), _sender=f.referee)
    f.escrow.refund(digest("partial"), _sender=f.players[0])
    s.verify(f.escrow.balance == sp.mutez(0))

@sp.module
def recipient_main():
    import wtfiap_escrow_main

    class RejectingRecipient(sp.Contract):
        def __init__(self, escrow):
            self.data.escrow = escrow

        @sp.entrypoint
        def fund(self, params):
            sp.cast(params, wtfiap_escrow_main.JoinRoom)
            endpoint = sp.contract(wtfiap_escrow_main.JoinRoom, self.data.escrow, entrypoint="join_room").unwrap_some()
            sp.transfer(params, sp.amount, endpoint)

        @sp.entrypoint
        def request_claim(self, room_id):
            sp.cast(room_id, sp.bytes)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            endpoint = sp.contract(sp.bytes, self.data.escrow, entrypoint="claim").unwrap_some()
            sp.transfer(room_id, sp.mutez(0), endpoint)

        @sp.entrypoint
        def request_refund(self, room_id):
            sp.cast(room_id, sp.bytes)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            endpoint = sp.contract(sp.bytes, self.data.escrow, entrypoint="refund").unwrap_some()
            sp.transfer(room_id, sp.mutez(0), endpoint)

        @sp.entrypoint
        def default(self):
            raise "RECIPIENT_REJECTED"


@sp.add_test()
def recipient_failure_is_isolated():
    s = sp.test_scenario("wtfiap_escrow_recipient_failure", [dummy, main, recipient_main])
    f = fixture(s)
    rejector = recipient_main.RejectingRecipient(f.escrow.address)
    s += rejector
    addresses = [rejector.address] + [p.address for p in f.players[1:]]
    f.escrow.create_room(create(f, entrants=addresses), _sender=f.creator)
    rejector.fund(join(), _sender=f.players[0], _amount=sp.mutez(10000))
    rejector.request_refund(digest("room"), _sender=f.players[0], _valid=False, _exception="RECIPIENT_REJECTED")
    s.verify(f.escrow.data.rooms[digest("room")].paid.contains(rejector.address))
    s.verify(f.escrow.data.rooms[digest("room")].refunded == 0)
    for player in f.players[1:]:
        f.escrow.join_room(join(), _sender=player, _amount=sp.mutez(10000))
    f.escrow.start_room(start(), _sender=f.referee)
    f.escrow.finalize_room(sp.record(room_id=digest("room"), match_id=digest("room:match"), transcript_hash=digest("room:transcript"), result_hash=digest("room:result"), ranks=[sp.record(player=address, rank=i + 1, group_size=1) for i, address in enumerate(addresses)]), _sender=f.referee)
    rejector.request_claim(digest("room"), _sender=f.players[0], _valid=False, _exception="RECIPIENT_REJECTED")
    s.verify(~f.escrow.data.claims[(digest("room"), rejector.address)].claimed)
    s.verify(f.escrow.data.rooms[digest("room")].held == 80000)
    f.escrow.claim(digest("room"), _sender=f.players[1])
    f.escrow.claim(digest("room"), _sender=f.players[2])
    f.escrow.claim_treasury(digest("room"), _sender=f.outsider)
    s.verify(f.escrow.data.rooms[digest("room")].held == 40000)
    s.verify(f.escrow.balance == sp.mutez(40000))


@sp.add_test()
def treasury_failure_does_not_block_prizes():
    s = sp.test_scenario("wtfiap_escrow_treasury_failure", [dummy, main, recipient_main])
    rejector = recipient_main.RejectingRecipient(sp.address("tz1burnburnburnburnburnburjAYjjX"))
    s += rejector
    f = fixture(s, treasury_address=rejector.address)
    f.escrow.create_room(create(f), _sender=f.creator)
    fund(f)
    f.escrow.claim_treasury(digest("room"), _sender=f.outsider, _valid=False, _exception="ROOM_NOT_SETTLED")
    f.escrow.start_room(start(), _sender=f.referee)
    f.escrow.finalize_room(outcome(f), _sender=f.referee)
    f.escrow.claim_treasury(digest("room"), _sender=f.outsider, _valid=False, _exception="RECIPIENT_REJECTED")
    s.verify(~f.escrow.data.rooms[digest("room")].treasury_claimed)
    s.verify(f.escrow.data.rooms[digest("room")].paid_out == 0)
    for player in f.players[:3]:
        f.escrow.claim(digest("room"), _sender=player)
    s.verify(f.escrow.data.rooms[digest("room")].paid_out == 70000)
    s.verify(f.escrow.data.rooms[digest("room")].held == 10000)
    s.verify(f.escrow.balance == sp.mutez(10000))
