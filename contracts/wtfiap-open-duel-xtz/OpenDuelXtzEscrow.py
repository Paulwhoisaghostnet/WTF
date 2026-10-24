"""Open-seat coLILseum XTZ duel escrow for Mainnet and Shadownet.

The host's create_offer operation carries entry + the immutable 0.5 XTZ fee.
A referee can authorize verified account-linked challenger wallets. The first
finalized accept_offer wins the open seat; competing deposits revert atomically.
The fee stays refundable until start and transfers only after settlement.
"""
import smartpy as sp


@sp.module
def open_duel_xtz():
    import smartpy.stdlib.utils as utils

    Offer: type = sp.record(
        room_id=sp.bytes, terms_hash=sp.bytes, rules_hash=sp.bytes,
        seed_commitment=sp.bytes, referee=sp.address, entry_amount=sp.nat,
    ).layout(("room_id", ("terms_hash", ("rules_hash", ("seed_commitment", ("referee", "entry_amount"))))))
    Accept: type = sp.record(room_id=sp.bytes, expected_terms_hash=sp.bytes).layout(("room_id", "expected_terms_hash"))
    Authorize: type = sp.record(room_id=sp.bytes, guest=sp.address).layout(("room_id", "guest"))
    Start: type = sp.record(room_id=sp.bytes, expected_terms_hash=sp.bytes, match_id=sp.bytes).layout(("room_id", ("expected_terms_hash", "match_id")))
    Rank: type = sp.record(player=sp.address, rank=sp.nat, group_size=sp.nat).layout(("player", ("rank", "group_size")))
    Finalize: type = sp.record(room_id=sp.bytes, match_id=sp.bytes, transcript_hash=sp.bytes,
        result_hash=sp.bytes, ranks=sp.list[Rank]).layout(("room_id", ("match_id", ("transcript_hash", ("result_hash", "ranks")))))
    Void: type = sp.record(room_id=sp.bytes, reason_hash=sp.bytes, evidence_hash=sp.bytes).layout(("room_id", ("reason_hash", "evidence_hash")))
    Room: type = sp.record(
        terms_hash=sp.bytes, rules_hash=sp.bytes, seed_commitment=sp.bytes,
        referee=sp.address, currency=sp.nat, entry_amount=sp.nat, payout_mode=sp.nat,
        host=sp.address, guest=sp.option[sp.address], entrants=sp.list[sp.address],
        status=sp.nat, paid=sp.set[sp.address], held=sp.nat, paid_out=sp.nat,
        match_id=sp.option[sp.bytes], result_hash=sp.option[sp.bytes],
        transcript_hash=sp.option[sp.bytes], quantum=sp.nat,
        deposited=sp.nat, refunded=sp.nat, treasury_amount=sp.nat,
        fee_held=sp.nat, fees_paid=sp.nat, treasury_claimed=sp.bool,
        void_reason_hash=sp.option[sp.bytes], void_evidence_hash=sp.option[sp.bytes],
    )
    Claim: type = sp.record(amount=sp.nat, claimed=sp.bool)
    ClaimQuery: type = sp.record(room_id=sp.bytes, player=sp.address).layout(("room_id", "player"))

    class OpenDuelXtzEscrow(sp.Contract):
        def __init__(self, treasury_address):
            self.data.treasury_address = treasury_address
            self.data.xtz_quantum = sp.nat(10000)
            self.data.house_fee_mutez = sp.nat(500000)
            self.data.rooms = sp.cast(sp.big_map(), sp.big_map[sp.bytes, Room])
            self.data.authorized = sp.cast(sp.big_map(), sp.big_map[sp.pair[sp.bytes, sp.address], sp.bool])
            self.data.claims = sp.cast(sp.big_map(), sp.big_map[sp.pair[sp.bytes, sp.address], Claim])

        @sp.entrypoint
        def default(self):
            raise "DEFAULT_DISABLED"

        @sp.entrypoint
        def create_offer(self, params):
            sp.cast(params, Offer)
            assert sp.len(params.room_id) == 32 and not params.room_id in self.data.rooms, "ROOM_ID"
            assert sp.len(params.terms_hash) == 32 and sp.len(params.rules_hash) == 32, "TERMS_HASH"
            assert sp.len(params.seed_commitment) == 32, "SEED_COMMITMENT"
            assert params.entry_amount > 0 and sp.mod(params.entry_amount, self.data.xtz_quantum) == 0, "ENTRY_QUANTUM"
            assert sp.amount == utils.nat_to_mutez(params.entry_amount + self.data.house_fee_mutez), "ENTRY_AND_FEE_MISMATCH"
            self.data.rooms[params.room_id] = sp.record(
                terms_hash=params.terms_hash, rules_hash=params.rules_hash, seed_commitment=params.seed_commitment,
                referee=params.referee, currency=sp.nat(0), entry_amount=params.entry_amount, payout_mode=sp.nat(0),
                host=sp.sender, guest=None, entrants=[sp.sender], status=sp.nat(0),
                paid=sp.cast({sp.sender}, sp.set[sp.address]), held=params.entry_amount, paid_out=sp.nat(0),
                match_id=None, result_hash=None, transcript_hash=None, quantum=self.data.xtz_quantum,
                deposited=params.entry_amount, refunded=sp.nat(0), treasury_amount=sp.nat(0),
                fee_held=self.data.house_fee_mutez, fees_paid=sp.nat(0), treasury_claimed=False,
                void_reason_hash=None, void_evidence_hash=None,
            )
            sp.emit(sp.record(room_id=params.room_id, host=sp.sender, entry_amount=params.entry_amount), tag="offer_created")

        @sp.entrypoint
        def authorize_guest(self, params):
            sp.cast(params, Authorize)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert params.room_id in self.data.rooms, "NO_ROOM"
            room = self.data.rooms[params.room_id]
            assert sp.sender == room.referee, "NOT_REFEREE"
            assert room.status == 0 and room.guest == None, "SEAT_CLOSED"
            assert params.guest != room.host, "HOST_CANNOT_CHALLENGE"
            self.data.authorized[(params.room_id, params.guest)] = True

        @sp.entrypoint
        def accept_offer(self, params):
            sp.cast(params, Accept)
            assert params.room_id in self.data.rooms, "NO_ROOM"
            room = self.data.rooms[params.room_id]
            assert room.status == 0 and room.guest == None, "SEAT_CLOSED"
            assert room.terms_hash == params.expected_terms_hash, "TERMS_MISMATCH"
            assert sp.sender != room.host and self.data.authorized.get((params.room_id, sp.sender), default=False), "NOT_AUTHORIZED"
            assert sp.amount == utils.nat_to_mutez(room.entry_amount), "ENTRY_AMOUNT_MISMATCH"
            room.guest = sp.Some(sp.sender)
            room.entrants = [room.host, sp.sender]
            room.paid.add(sp.sender)
            room.held += room.entry_amount
            room.deposited += room.entry_amount
            self.data.rooms[params.room_id] = room
            sp.emit(sp.record(room_id=params.room_id, guest=sp.sender), tag="seat_claimed")

        @sp.entrypoint
        def withdraw_guest(self, room_id):
            sp.cast(room_id, sp.bytes)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert room_id in self.data.rooms, "NO_ROOM"
            room = self.data.rooms[room_id]
            assert room.status == 0 and room.guest == sp.Some(sp.sender), "NOT_OPEN_GUEST"
            room.guest = None
            room.entrants = [room.host]
            room.paid.remove(sp.sender)
            room.held = sp.as_nat(room.held - room.entry_amount)
            room.refunded += room.entry_amount
            self.data.rooms[room_id] = room
            sp.send(sp.sender, utils.nat_to_mutez(room.entry_amount))
            sp.emit(sp.record(room_id=room_id, guest=sp.sender), tag="seat_reopened")

        @sp.entrypoint
        def cancel_offer(self, room_id):
            sp.cast(room_id, sp.bytes)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert room_id in self.data.rooms, "NO_ROOM"
            room = self.data.rooms[room_id]
            assert room.status == 0 and sp.sender == room.host, "HOST_ONLY_OPEN"
            guest = room.guest
            room.status = 4
            room.refunded += room.held
            room.held = 0
            room.fee_held = 0
            room.paid = sp.cast(set(), sp.set[sp.address])
            self.data.rooms[room_id] = room
            if guest != None:
                sp.send(guest.unwrap_some(), utils.nat_to_mutez(room.entry_amount))
            sp.send(room.host, utils.nat_to_mutez(room.entry_amount + self.data.house_fee_mutez))
            sp.emit(room_id, tag="offer_cancelled")

        @sp.entrypoint
        def start_room(self, params):
            sp.cast(params, Start)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert params.room_id in self.data.rooms, "NO_ROOM"
            room = self.data.rooms[params.room_id]
            assert sp.sender == room.referee and room.status == 0, "NOT_OPEN_REFEREE"
            assert room.guest != None and sp.len(room.paid) == 2, "ROOM_NOT_FUNDED"
            assert room.terms_hash == params.expected_terms_hash and sp.len(params.match_id) == 32, "MATCH_MISMATCH"
            assert room.held == room.entry_amount * 2 and room.fee_held == self.data.house_fee_mutez, "DEPOSIT_CONSERVATION"
            room.status = 1
            room.match_id = sp.Some(params.match_id)
            self.data.rooms[params.room_id] = room
            sp.emit(sp.record(room_id=params.room_id, match_id=params.match_id), tag="room_started")

        @sp.entrypoint
        def finalize_room(self, params):
            sp.cast(params, Finalize)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert params.room_id in self.data.rooms, "NO_ROOM"
            room = self.data.rooms[params.room_id]
            assert sp.sender == room.referee and room.status == 1, "NOT_ACTIVE_REFEREE"
            assert room.match_id == sp.Some(params.match_id), "MATCH_MISMATCH"
            assert sp.len(params.transcript_hash) == 32 and sp.len(params.result_hash) == 32, "BAD_RESULT_HASH"
            assert sp.len(params.ranks) == 2, "RANK_COUNT_MISMATCH"
            first = sp.record(player=room.host, rank=sp.nat(0), group_size=sp.nat(0))
            second = sp.record(player=room.host, rank=sp.nat(0), group_size=sp.nat(0))
            index = sp.nat(0)
            for result in params.ranks:
                if index == 0:
                    first = result
                else:
                    second = result
                index += 1
            assert first.player != second.player and first.player in room.paid and second.player in room.paid, "RANKED_NON_ENTRANT"
            first_wins = first.rank == 1 and first.group_size == 1 and second.rank == 2 and second.group_size == 1
            second_wins = second.rank == 1 and second.group_size == 1 and first.rank == 2 and first.group_size == 1
            tie = first.rank == 1 and second.rank == 1 and first.group_size == 2 and second.group_size == 2
            assert first_wins or second_wins or tie, "INVALID_DUEL_RANK"
            self.data.claims[(params.room_id, first.player)] = sp.record(amount=room.entry_amount if tie else room.entry_amount * 2 if first_wins else sp.nat(0), claimed=False)
            self.data.claims[(params.room_id, second.player)] = sp.record(amount=room.entry_amount if tie else room.entry_amount * 2 if second_wins else sp.nat(0), claimed=False)
            sp.send(self.data.treasury_address, utils.nat_to_mutez(room.fee_held))
            room.fees_paid = room.fee_held
            room.fee_held = 0
            room.status = 2
            room.result_hash = sp.Some(params.result_hash)
            room.transcript_hash = sp.Some(params.transcript_hash)
            self.data.rooms[params.room_id] = room
            sp.emit(sp.record(room_id=params.room_id, result_hash=params.result_hash), tag="room_settled")

        @sp.entrypoint
        def void_room(self, params):
            sp.cast(params, Void)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert params.room_id in self.data.rooms, "NO_ROOM"
            room = self.data.rooms[params.room_id]
            assert sp.sender == room.referee and (room.status == 0 or room.status == 1), "VOID_NOT_AVAILABLE"
            assert sp.len(params.reason_hash) == 32 and sp.len(params.evidence_hash) == 32, "BAD_VOID_PROOF"
            room.status = 3
            room.void_reason_hash = sp.Some(params.reason_hash)
            room.void_evidence_hash = sp.Some(params.evidence_hash)
            self.data.rooms[params.room_id] = room

        @sp.entrypoint
        def refund(self, room_id):
            sp.cast(room_id, sp.bytes)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert room_id in self.data.rooms, "NO_ROOM"
            room = self.data.rooms[room_id]
            assert room.status == 3 and sp.sender in room.paid, "NO_REFUND"
            room.paid.remove(sp.sender)
            room.held = sp.as_nat(room.held - room.entry_amount)
            room.refunded += room.entry_amount
            amount = room.entry_amount
            if sp.sender == room.host:
                amount += room.fee_held
                room.fee_held = 0
            self.data.rooms[room_id] = room
            sp.send(sp.sender, utils.nat_to_mutez(amount))

        @sp.entrypoint
        def claim(self, room_id):
            sp.cast(room_id, sp.bytes)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            key = (room_id, sp.sender)
            assert key in self.data.claims, "NO_CLAIM"
            claim = self.data.claims[key]
            assert not claim.claimed and claim.amount > 0, "NO_AWARD"
            room = self.data.rooms[room_id]
            assert room.status == 2, "ROOM_NOT_SETTLED"
            room.held = sp.as_nat(room.held - claim.amount)
            room.paid_out += claim.amount
            claim.claimed = True
            self.data.rooms[room_id] = room
            self.data.claims[key] = claim
            sp.send(sp.sender, utils.nat_to_mutez(claim.amount))

        @sp.onchain_view()
        def get_room(self, room_id):
            sp.cast(room_id, sp.bytes)
            return self.data.rooms[room_id]

        @sp.onchain_view()
        def get_claim(self, params):
            sp.cast(params, ClaimQuery)
            return self.data.claims.get((params.room_id, params.player), default=sp.record(amount=sp.nat(0), claimed=False))


main = open_duel_xtz
