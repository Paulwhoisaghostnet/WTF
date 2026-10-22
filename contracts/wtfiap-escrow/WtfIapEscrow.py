"""WTFIAP-v0.01 tournament escrow: LOCAL DRAFT, not deployed.

Eight fixed entrants; 50/35/15 occupied-place shares rounded down to 0.01
room-currency units. Remainders belong to the immutable deployment treasury.
Pre-start withdrawals and evidence-bound referee technical voids return exact
entries. This source is not evidence of a deployed or funded contract.
"""
import smartpy as sp


@sp.module
def wtfiap_escrow_main():
    import smartpy.stdlib.utils as utils

    TransferTx: type = sp.record(to_=sp.address, token_id=sp.nat, amount=sp.nat).layout(
        ("to_", ("token_id", "amount"))
    )
    TransferBatch: type = sp.record(from_=sp.address, txs=sp.list[TransferTx]).layout(
        ("from_", "txs")
    )
    TransferInput: type = sp.record(from_=sp.address, to_=sp.address, amount=sp.nat)
    Rank: type = sp.record(player=sp.address, rank=sp.nat).layout(("player", "rank"))
    CreateRoom: type = sp.record(
        room_id=sp.bytes, terms_hash=sp.bytes, rules_hash=sp.bytes,
        seed_commitment=sp.bytes, referee=sp.address, currency=sp.nat,
        entry_amount=sp.nat, entrants=sp.list[sp.address],
    ).layout(("room_id", ("terms_hash", ("rules_hash", ("seed_commitment", (
        "referee", ("currency", ("entry_amount", "entrants"))))))))
    JoinRoom: type = sp.record(room_id=sp.bytes, expected_terms_hash=sp.bytes).layout(
        ("room_id", "expected_terms_hash")
    )
    StartRoom: type = sp.record(
        room_id=sp.bytes, expected_terms_hash=sp.bytes, match_id=sp.bytes,
    ).layout(("room_id", ("expected_terms_hash", "match_id")))
    FinalizeRoom: type = sp.record(
        room_id=sp.bytes, match_id=sp.bytes, transcript_hash=sp.bytes,
        result_hash=sp.bytes, ranks=sp.list[Rank],
    ).layout(("room_id", ("match_id", ("transcript_hash", ("result_hash", "ranks")))))
    VoidRoom: type = sp.record(
        room_id=sp.bytes, reason_hash=sp.bytes, evidence_hash=sp.bytes,
    ).layout(("room_id", ("reason_hash", "evidence_hash")))
    Room: type = sp.record(
        terms_hash=sp.bytes, rules_hash=sp.bytes, seed_commitment=sp.bytes,
        referee=sp.address, currency=sp.nat, entry_amount=sp.nat,
        entrants=sp.list[sp.address], roster_hash=sp.bytes, status=sp.nat,
        paid=sp.set[sp.address], held=sp.nat, paid_out=sp.nat,
        match_id=sp.option[sp.bytes], result_hash=sp.option[sp.bytes],
        transcript_hash=sp.option[sp.bytes], quantum=sp.nat,
        deposited=sp.nat, refunded=sp.nat, treasury_amount=sp.nat,
        treasury_claimed=sp.bool, void_reason_hash=sp.option[sp.bytes],
        void_evidence_hash=sp.option[sp.bytes],
    )
    Claim: type = sp.record(amount=sp.nat, claimed=sp.bool)
    ClaimQuery: type = sp.record(room_id=sp.bytes, player=sp.address).layout(
        ("room_id", "player")
    )

    class WtfIapEscrow(sp.Contract):
        def __init__(self, room_creator, wtf_token_address, wtf_token_id, treasury_address):
            self.data.room_creator = room_creator
            self.data.wtf_token_address = wtf_token_address
            self.data.wtf_token_id = wtf_token_id
            self.data.treasury_address = treasury_address
            self.data.xtz_quantum = sp.nat(10000)
            self.data.wtf_quantum = sp.nat(1000000)
            self.data.rooms = sp.cast(sp.big_map(), sp.big_map[sp.bytes, Room])
            self.data.claims = sp.cast(
                sp.big_map(), sp.big_map[sp.pair[sp.bytes, sp.address], Claim]
            )

        @sp.private(with_storage="read-only", with_operations=True)
        def transfer_wtf(self, params):
            sp.cast(params, TransferInput)
            endpoint = sp.contract(
                sp.list[TransferBatch], self.data.wtf_token_address, entrypoint="transfer"
            ).unwrap_some(error="FA2_TRANSFER_ENTRYPOINT_MISSING")
            sp.transfer(
                [sp.record(from_=params.from_, txs=[sp.record(
                    to_=params.to_, token_id=self.data.wtf_token_id, amount=params.amount
                )])], sp.mutez(0), endpoint,
            )

        @sp.entrypoint
        def default(self):
            raise "DEFAULT_DISABLED"

        @sp.entrypoint
        def create_room(self, params):
            sp.cast(params, CreateRoom)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert sp.sender == self.data.room_creator, "NOT_ROOM_CREATOR"
            assert sp.len(params.room_id) == 32, "BAD_ROOM_ID"
            assert sp.len(params.terms_hash) == 32, "BAD_TERMS_HASH"
            assert sp.len(params.rules_hash) == 32, "BAD_RULES_HASH"
            assert sp.len(params.seed_commitment) == 32, "BAD_SEED_COMMITMENT"
            assert not params.room_id in self.data.rooms, "ROOM_EXISTS"
            assert params.currency <= 1, "BAD_CURRENCY"
            assert params.entry_amount > 0, "ZERO_ENTRY"
            quantum = self.data.xtz_quantum
            if params.currency == 1:
                quantum = self.data.wtf_quantum
            assert sp.mod(params.entry_amount, quantum) == 0, "ENTRY_QUANTUM"
            assert sp.len(params.entrants) == 8, "EIGHT_ENTRANTS_REQUIRED"
            seen = sp.cast(set(), sp.set[sp.address])
            for player in params.entrants:
                assert not player in seen, "DUPLICATE_ENTRANT"
                seen.add(player)
            self.data.rooms[params.room_id] = sp.record(
                terms_hash=params.terms_hash, rules_hash=params.rules_hash,
                seed_commitment=params.seed_commitment, referee=params.referee,
                currency=params.currency, entry_amount=params.entry_amount,
                entrants=params.entrants, roster_hash=sp.blake2b(sp.pack(params.entrants)),
                status=sp.nat(0), paid=sp.cast(set(), sp.set[sp.address]),
                held=sp.nat(0), paid_out=sp.nat(0),
                match_id=None, result_hash=None, transcript_hash=None, quantum=quantum,
                deposited=sp.nat(0), refunded=sp.nat(0), treasury_amount=sp.nat(0),
                treasury_claimed=False, void_reason_hash=None, void_evidence_hash=None,
            )
            sp.emit(sp.record(room_id=params.room_id, terms_hash=params.terms_hash), tag="room_created")

        @sp.entrypoint
        def join_room(self, params):
            sp.cast(params, JoinRoom)
            assert params.room_id in self.data.rooms, "NO_ROOM"
            room = self.data.rooms[params.room_id]
            assert room.status == 0, "ROOM_NOT_FUNDING"
            assert room.terms_hash == params.expected_terms_hash, "TERMS_MISMATCH"
            assert not sp.sender in room.paid, "ALREADY_FUNDED"
            admitted = False
            for player in room.entrants:
                if player == sp.sender:
                    admitted = True
            assert admitted, "NOT_ENTRANT"
            if room.currency == 0:
                assert sp.amount == utils.nat_to_mutez(room.entry_amount), "ENTRY_AMOUNT_MISMATCH"
            else:
                assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            room.paid.add(sp.sender)
            room.held += room.entry_amount
            room.deposited += room.entry_amount
            self.data.rooms[params.room_id] = room
            if room.currency == 1:
                self.transfer_wtf(sp.record(from_=sp.sender, to_=sp.self_address, amount=room.entry_amount))
            sp.emit(sp.record(room_id=params.room_id, player=sp.sender, amount=room.entry_amount), tag="room_funded")

        @sp.entrypoint
        def start_room(self, params):
            sp.cast(params, StartRoom)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert params.room_id in self.data.rooms, "NO_ROOM"
            room = self.data.rooms[params.room_id]
            assert sp.sender == room.referee, "NOT_REFEREE"
            assert room.status == 0, "ROOM_NOT_FUNDING"
            assert room.terms_hash == params.expected_terms_hash, "TERMS_MISMATCH"
            assert sp.len(params.match_id) == 32, "BAD_MATCH_ID"
            assert sp.len(room.paid) == 8, "ROOM_NOT_FUNDED"
            assert room.held == room.entry_amount * 8, "DEPOSIT_CONSERVATION"
            room.status = 1
            room.match_id = sp.Some(params.match_id)
            self.data.rooms[params.room_id] = room
            sp.emit(sp.record(room_id=params.room_id, match_id=params.match_id), tag="room_started")

        @sp.entrypoint
        def finalize_room(self, params):
            sp.cast(params, FinalizeRoom)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert params.room_id in self.data.rooms, "NO_ROOM"
            room = self.data.rooms[params.room_id]
            assert sp.sender == room.referee, "NOT_REFEREE"
            assert room.status == 1, "ROOM_NOT_ACTIVE"
            assert params.match_id == room.match_id.unwrap_some(), "MATCH_MISMATCH"
            assert sp.len(params.transcript_hash) == 32, "BAD_TRANSCRIPT_HASH"
            assert sp.len(params.result_hash) == 32, "BAD_RESULT_HASH"
            assert sp.len(params.ranks) == 8, "EIGHT_RANKS_REQUIRED"
            # Combine the exact percentages for occupied prize places first,
            # divide among tied players, then round each share down once.
            pot = room.entry_amount * 8
            assert room.held == pot, "DEPOSIT_CONSERVATION"
            seen = sp.cast(set(), sp.set[sp.address])
            winner_count = sp.nat(0)
            allocated = sp.nat(0)
            for result in params.ranks:
                assert result.player in room.paid, "RANKED_NON_ENTRANT"
                assert not result.player in seen, "DUPLICATE_RANKED_PLAYER"
                seen.add(result.player)
                assert result.rank >= 1 and result.rank <= 8, "BAD_RANK"
                earlier = sp.nat(0)
                tied = sp.nat(0)
                for other in params.ranks:
                    if other.rank < result.rank:
                        earlier += 1
                    if other.rank == result.rank:
                        tied += 1
                assert result.rank == earlier + 1, "INVALID_COMPETITION_RANK"
                if result.rank == 1:
                    winner_count += 1
                combined_percent = sp.nat(0)
                if result.rank <= 1 and result.rank + tied > 1:
                    combined_percent += 50
                if result.rank <= 2 and result.rank + tied > 2:
                    combined_percent += 35
                if result.rank <= 3 and result.rank + tied > 3:
                    combined_percent += 15
                amount = sp.fst(sp.ediv(
                    pot * combined_percent, 100 * tied * room.quantum
                ).unwrap_some()) * room.quantum
                self.data.claims[(params.room_id, result.player)] = sp.record(amount=amount, claimed=False)
                allocated += amount
            assert winner_count == 1, "UNIQUE_WINNER_REQUIRED"
            room.treasury_amount = sp.as_nat(pot - allocated, error="PRIZE_CONSERVATION")
            room.status = 2
            room.result_hash = sp.Some(params.result_hash)
            room.transcript_hash = sp.Some(params.transcript_hash)
            self.data.rooms[params.room_id] = room
            sp.emit(sp.record(room_id=params.room_id, result_hash=params.result_hash), tag="room_settled")

        @sp.entrypoint
        def refund(self, room_id):
            sp.cast(room_id, sp.bytes)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert room_id in self.data.rooms, "NO_ROOM"
            room = self.data.rooms[room_id]
            assert room.status == 0 or room.status == 3, "REFUND_NOT_AVAILABLE"
            assert sp.sender in room.paid, "NO_DEPOSIT"
            # Consume before transferring. A rejecting receiver or token failure
            # rolls this entire transaction back; other recipients are independent.
            room.paid.remove(sp.sender)
            room.held = sp.as_nat(room.held - room.entry_amount, error="ROOM_RESERVE_UNDERFLOW")
            room.refunded += room.entry_amount
            self.data.rooms[room_id] = room
            if room.currency == 0:
                sp.send(sp.sender, utils.nat_to_mutez(room.entry_amount))
            else:
                self.transfer_wtf(sp.record(from_=sp.self_address, to_=sp.sender, amount=room.entry_amount))
            sp.emit(sp.record(room_id=room_id, player=sp.sender, amount=room.entry_amount), tag="entry_refunded")

        @sp.entrypoint
        def void_room(self, params):
            sp.cast(params, VoidRoom)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert params.room_id in self.data.rooms, "NO_ROOM"
            room = self.data.rooms[params.room_id]
            assert sp.sender == room.referee, "NOT_REFEREE"
            assert room.status == 0 or room.status == 1, "VOID_NOT_AVAILABLE"
            assert sp.len(params.reason_hash) == 32, "BAD_REASON_HASH"
            assert sp.len(params.evidence_hash) == 32, "BAD_EVIDENCE_HASH"
            room.status = 3
            room.void_reason_hash = sp.Some(params.reason_hash)
            room.void_evidence_hash = sp.Some(params.evidence_hash)
            self.data.rooms[params.room_id] = room
            sp.emit(params, tag="technical_void")

        @sp.entrypoint
        def claim_treasury(self, room_id):
            sp.cast(room_id, sp.bytes)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert room_id in self.data.rooms, "NO_ROOM"
            room = self.data.rooms[room_id]
            assert room.status == 2, "ROOM_NOT_SETTLED"
            assert not room.treasury_claimed, "TREASURY_ALREADY_CLAIMED"
            assert room.treasury_amount > 0, "NO_TREASURY_AWARD"
            room.treasury_claimed = True
            room.held = sp.as_nat(room.held - room.treasury_amount, error="ROOM_RESERVE_UNDERFLOW")
            room.paid_out += room.treasury_amount
            self.data.rooms[room_id] = room
            if room.currency == 0:
                sp.send(self.data.treasury_address, utils.nat_to_mutez(room.treasury_amount))
            else:
                self.transfer_wtf(sp.record(from_=sp.self_address, to_=self.data.treasury_address, amount=room.treasury_amount))
            sp.emit(sp.record(room_id=room_id, amount=room.treasury_amount), tag="treasury_claimed")

        @sp.entrypoint
        def claim(self, room_id):
            sp.cast(room_id, sp.bytes)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            key = (room_id, sp.sender)
            assert key in self.data.claims, "NO_CLAIM"
            entitlement = self.data.claims[key]
            assert not entitlement.claimed, "ALREADY_CLAIMED"
            assert entitlement.amount > 0, "NO_AWARD"
            room = self.data.rooms[room_id]
            assert room.status == 2, "ROOM_NOT_SETTLED"
            room.held = sp.as_nat(room.held - entitlement.amount, error="ROOM_RESERVE_UNDERFLOW")
            room.paid_out += entitlement.amount
            entitlement.claimed = True
            self.data.claims[key] = entitlement
            self.data.rooms[room_id] = room
            if room.currency == 0:
                sp.send(sp.sender, utils.nat_to_mutez(entitlement.amount))
            else:
                self.transfer_wtf(sp.record(from_=sp.self_address, to_=sp.sender, amount=entitlement.amount))
            sp.emit(sp.record(room_id=room_id, player=sp.sender, amount=entitlement.amount), tag="prize_claimed")

        @sp.onchain_view()
        def get_room(self, room_id):
            sp.cast(room_id, sp.bytes)
            return self.data.rooms[room_id]

        @sp.onchain_view()
        def get_claim(self, params):
            sp.cast(params, ClaimQuery)
            return self.data.claims.get((params.room_id, params.player), default=sp.record(amount=sp.nat(0), claimed=False))


main = wtfiap_escrow_main
