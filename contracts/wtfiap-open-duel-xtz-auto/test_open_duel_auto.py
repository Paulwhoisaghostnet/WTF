"""Open-seat duel invariants; every test uses the compiled SmartPy source."""
import hashlib
import importlib.util
from pathlib import Path
import smartpy as sp

path = Path(__file__).with_name('OpenDuelXtzEscrowAuto.py')
spec = importlib.util.spec_from_file_location('open_duel_source', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
main = module.main

def digest(value):
    return sp.bytes('0x' + hashlib.sha256(value.encode()).hexdigest())

def setup(s):
    host, guest, rival = [sp.test_account(name) for name in ('host', 'guest', 'rival')]
    referee, treasury = [sp.test_account(name) for name in ('referee', 'treasury')]
    escrow = main.OpenDuelXtzEscrow(treasury.address)
    s += escrow
    offer = sp.record(room_id=digest('room'), terms_hash=digest('terms'), rules_hash=digest('rules'),
        seed_commitment=digest('seed'), referee=referee.address, entry_amount=1000000)
    return escrow, offer, host, guest, rival, referee, treasury

@sp.add_test()
def host_funds_first_and_first_challenger_wins_seat():
    s = sp.test_scenario('host-first', main)
    escrow, offer, host, guest, rival, referee, treasury = setup(s)
    escrow.create_offer(offer, _sender=host, _amount=sp.mutez(1000000), _valid=False, _exception='ENTRY_AND_FEE_MISMATCH')
    escrow.create_offer(offer, _sender=host, _amount=sp.mutez(1500000))
    room = escrow.data.rooms[digest('room')]
    s.verify(room.held == 1000000)
    s.verify(room.guest == None)
    s.verify(room.fee_held == 500000)
    accept = sp.record(room_id=digest('room'), expected_terms_hash=digest('terms'))
    escrow.accept_offer(accept, _sender=guest, _amount=sp.mutez(1000000), _valid=False, _exception='NOT_AUTHORIZED')
    escrow.authorize_guest(sp.record(room_id=digest('room'), guest=guest.address), _sender=referee)
    escrow.authorize_guest(sp.record(room_id=digest('room'), guest=rival.address), _sender=referee)
    escrow.accept_offer(accept, _sender=guest, _amount=sp.mutez(1000000))
    escrow.accept_offer(accept, _sender=rival, _amount=sp.mutez(1000000), _valid=False, _exception='SEAT_CLOSED')
    escrow.start_room(sp.record(room_id=digest('room'), expected_terms_hash=digest('terms'), match_id=digest('match')), _sender=referee)
    escrow.finalize_room(sp.record(room_id=digest('room'), match_id=digest('match'), transcript_hash=digest('transcript'),
        result_hash=digest('result'), ranks=[sp.record(player=guest.address, rank=1, group_size=1),
        sp.record(player=host.address, rank=2, group_size=1)]), _sender=referee)
    s.verify(escrow.data.rooms[digest('room')].fees_paid == 500000)
    s.verify(escrow.data.claims[(digest('room'), guest.address)].amount == 2000000)
    s.verify(escrow.data.claims[(digest('room'), guest.address)].claimed)
    s.verify(escrow.data.rooms[digest('room')].paid_out == 2000000)
    s.verify(escrow.data.rooms[digest('room')].held == 0)
    s.verify(escrow.data.rooms[digest('room')].payout_mode == 1)
    s.verify(escrow.balance == sp.mutez(0))
    escrow.finalize_room(sp.record(room_id=digest('room'), match_id=digest('match'), transcript_hash=digest('transcript'),
        result_hash=digest('result'), ranks=[sp.record(player=guest.address, rank=1, group_size=1),
        sp.record(player=host.address, rank=2, group_size=1)]), _sender=referee,
        _valid=False, _exception='NOT_ACTIVE_REFEREE')

@sp.add_test()
def a_tie_pays_both_entrants_atomically():
    s = sp.test_scenario('tie-direct-payout', main)
    escrow, offer, host, guest, _, referee, _ = setup(s)
    escrow.create_offer(offer, _sender=host, _amount=sp.mutez(1500000))
    escrow.authorize_guest(sp.record(room_id=digest('room'), guest=guest.address), _sender=referee)
    escrow.accept_offer(sp.record(room_id=digest('room'), expected_terms_hash=digest('terms')),
        _sender=guest, _amount=sp.mutez(1000000))
    escrow.start_room(sp.record(room_id=digest('room'), expected_terms_hash=digest('terms'), match_id=digest('match')),
        _sender=referee)
    tied = sp.record(room_id=digest('room'), match_id=digest('match'), transcript_hash=digest('transcript'),
        result_hash=digest('tie'), ranks=[sp.record(player=host.address, rank=1, group_size=2),
        sp.record(player=guest.address, rank=1, group_size=2)])
    escrow.finalize_room(tied, _sender=host, _valid=False, _exception='NOT_ACTIVE_REFEREE')
    escrow.finalize_room(sp.record(room_id=digest('room'), match_id=digest('match'), transcript_hash=digest('transcript'),
        result_hash=digest('invalid'), ranks=[sp.record(player=host.address, rank=1, group_size=1),
        sp.record(player=guest.address, rank=1, group_size=1)]), _sender=referee,
        _valid=False, _exception='INVALID_DUEL_RANK')
    s.verify(escrow.data.rooms[digest('room')].held == 2000000)
    escrow.finalize_room(tied, _sender=referee)
    s.verify(escrow.data.claims[(digest('room'), host.address)].amount == 1000000)
    s.verify(escrow.data.claims[(digest('room'), guest.address)].amount == 1000000)
    s.verify(escrow.data.claims[(digest('room'), host.address)].claimed)
    s.verify(escrow.data.claims[(digest('room'), guest.address)].claimed)
    s.verify(escrow.data.rooms[digest('room')].paid_out == 2000000)
    s.verify(escrow.balance == sp.mutez(0))

@sp.add_test()
def unmatched_creator_cancellation_refunds_entry_and_fee():
    s = sp.test_scenario('cancel-unmatched', main)
    escrow, offer, host, guest, _, referee, _ = setup(s)
    escrow.create_offer(offer, _sender=host, _amount=sp.mutez(1500000))
    escrow.cancel_offer(digest('room'), _sender=host)
    s.verify(escrow.balance == sp.mutez(0))
    s.verify(escrow.data.rooms[digest('room')].refunded == 1000000)
    escrow.authorize_guest(sp.record(room_id=digest('room'), guest=guest.address), _sender=referee, _valid=False, _exception='SEAT_CLOSED')

@sp.add_test()
def prestart_guest_exit_reopens_then_host_can_cancel():
    s = sp.test_scenario('guest-exit', main)
    escrow, offer, host, guest, rival, referee, _ = setup(s)
    escrow.create_offer(offer, _sender=host, _amount=sp.mutez(1500000))
    for candidate in (guest, rival):
        escrow.authorize_guest(sp.record(room_id=digest('room'), guest=candidate.address), _sender=referee)
    accept = sp.record(room_id=digest('room'), expected_terms_hash=digest('terms'))
    escrow.accept_offer(accept, _sender=guest, _amount=sp.mutez(1000000))
    escrow.withdraw_guest(digest('room'), _sender=guest)
    s.verify(escrow.data.rooms[digest('room')].guest == None)
    escrow.accept_offer(accept, _sender=rival, _amount=sp.mutez(1000000))
    escrow.cancel_offer(digest('room'), _sender=host)
    s.verify(escrow.balance == sp.mutez(0))

@sp.add_test()
def technical_void_refunds_both_and_fee():
    s = sp.test_scenario('technical-void', main)
    escrow, offer, host, guest, _, referee, _ = setup(s)
    escrow.create_offer(offer, _sender=host, _amount=sp.mutez(1500000))
    escrow.authorize_guest(sp.record(room_id=digest('room'), guest=guest.address), _sender=referee)
    escrow.accept_offer(sp.record(room_id=digest('room'), expected_terms_hash=digest('terms')),
        _sender=guest, _amount=sp.mutez(1000000))
    escrow.start_room(sp.record(room_id=digest('room'), expected_terms_hash=digest('terms'), match_id=digest('match')), _sender=referee)
    escrow.void_room(sp.record(room_id=digest('room'), reason_hash=digest('reason'), evidence_hash=digest('evidence')), _sender=referee)
    escrow.refund(digest('room'), _sender=host)
    escrow.refund(digest('room'), _sender=guest)
    s.verify(escrow.balance == sp.mutez(0))
