"""Additive coLILseum sponsor-prize escrow.

The existing duel/tournament escrow is unchanged. A room manifest fixes one to
three human prize places, XTZ/WTF awards, optional FA2 lots, and an optional
human entry fee. The game referee supplies ordered *human* finishers and a
replay hash; it never chooses an arbitrary payment address. The server remains
the trusted result authority, as in the current funded-room design.

FA2 deposits are atomic pulls through `transfer`: the sponsor must authorize
this contract as operator for each token ID before calling the funding entry.
No manifest or off-chain quote is treated as a deposit. Every payout is a
permissionless pull to an immutable recipient. There is no admin sweep.
"""
import smartpy as sp


@sp.module
def wtfiap_sponsor_escrow_main():
    import smartpy.stdlib.utils as utils

    TransferTx: type = sp.record(to_=sp.address, token_id=sp.nat, amount=sp.nat).layout(
        ("to_", ("token_id", "amount"))
    )
    TransferBatch: type = sp.record(from_=sp.address, txs=sp.list[TransferTx]).layout(
        ("from_", "txs")
    )
    TokenTransfer: type = sp.record(
        token_address=sp.address, token_id=sp.nat, from_=sp.address,
        to_=sp.address, amount=sp.nat,
    )
    PrizePlace: type = sp.record(
        xtz=sp.nat, wtf=sp.nat, pool_weight=sp.nat,
    ).layout(("xtz", ("wtf", "pool_weight")))
    PrizeLot: type = sp.record(
        token_address=sp.address, token_id=sp.nat, amount=sp.nat,
        fixed_place=sp.nat,
    ).layout(("token_address", ("token_id", ("amount", "fixed_place"))))
    CreateRoom: type = sp.record(
        room_id=sp.bytes, terms_hash=sp.bytes, rules_hash=sp.bytes,
        seed_commitment=sp.bytes, referee=sp.address, sponsor=sp.address,
        mode=sp.nat, minimum_humans=sp.nat, entry_currency=sp.nat,
        entry_amount=sp.nat, pool_numerator=sp.nat, pool_denominator=sp.nat,
        designated_wallet=sp.address, places=sp.list[PrizePlace],
        lots=sp.list[PrizeLot], pick_counts=sp.list[sp.nat],
    )
    Room: type = sp.record(
        terms_hash=sp.bytes, rules_hash=sp.bytes, seed_commitment=sp.bytes,
        referee=sp.address, sponsor=sp.address, mode=sp.nat,
        minimum_humans=sp.nat, entry_currency=sp.nat, entry_amount=sp.nat,
        pool_numerator=sp.nat, pool_denominator=sp.nat,
        designated_wallet=sp.address, places=sp.list[PrizePlace],
        lots=sp.list[PrizeLot], pick_counts=sp.list[sp.nat],
        prize_xtz=sp.nat, prize_wtf=sp.nat, house_fee=sp.nat,
        entrants=sp.list[sp.address], paid=sp.set[sp.address],
        sponsor_xtz_funded=sp.bool, sponsor_wtf_funded=sp.bool,
        funded_lots=sp.set[sp.nat], status=sp.nat,
        held_xtz=sp.nat, held_wtf=sp.nat,
        match_id=sp.option[sp.bytes], result_hash=sp.option[sp.bytes],
        transcript_hash=sp.option[sp.bytes],
        void_reason_hash=sp.option[sp.bytes],
        void_evidence_hash=sp.option[sp.bytes],
    )
    RoomHash: type = sp.record(room_id=sp.bytes, expected_terms_hash=sp.bytes).layout(
        ("room_id", "expected_terms_hash")
    )
    Register: type = sp.record(room_id=sp.bytes, player=sp.address).layout(
        ("room_id", "player")
    )
    LotQuery: type = sp.record(room_id=sp.bytes, index=sp.nat).layout(
        ("room_id", "index")
    )
    StartRoom: type = sp.record(
        room_id=sp.bytes, expected_terms_hash=sp.bytes, match_id=sp.bytes,
    ).layout(("room_id", ("expected_terms_hash", "match_id")))
    FinalizeRoom: type = sp.record(
        room_id=sp.bytes, match_id=sp.bytes, transcript_hash=sp.bytes,
        result_hash=sp.bytes, human_ranks=sp.list[sp.address],
        lot_places=sp.list[sp.nat],
    )
    VoidRoom: type = sp.record(
        room_id=sp.bytes, reason_hash=sp.bytes, evidence_hash=sp.bytes,
    ).layout(("room_id", ("reason_hash", "evidence_hash")))
    CashClaim: type = sp.record(amount=sp.nat, claimed=sp.bool)
    LotClaim: type = sp.record(recipient=sp.address, claimed=sp.bool)
    CashQuery: type = sp.record(
        room_id=sp.bytes, recipient=sp.address, currency=sp.nat,
    ).layout(("room_id", ("recipient", "currency")))
    Credit: type = sp.record(
        room_id=sp.bytes, recipient=sp.address, currency=sp.nat, amount=sp.nat,
    )
    LotAt: type = sp.record(lots=sp.list[PrizeLot], index=sp.nat)
    PlaceAt: type = sp.record(places=sp.list[PrizePlace], index=sp.nat)
    NatAt: type = sp.record(values=sp.list[sp.nat], index=sp.nat)

    class WtfIapSponsorEscrow(sp.Contract):
        def __init__(self, room_creator, wtf_token_address, wtf_token_id,
                     treasury_address, xtz_paid_room_house_fee):
            self.data.room_creator = room_creator
            self.data.wtf_token_address = wtf_token_address
            self.data.wtf_token_id = wtf_token_id
            self.data.treasury_address = treasury_address
            # Configure 500000 mutez for Mainnet; zero for Shadownet. The fee
            # applies only to paid XTZ rooms and remains refundable on void.
            self.data.xtz_paid_room_house_fee = xtz_paid_room_house_fee
            self.data.xtz_quantum = sp.nat(10000)
            self.data.wtf_quantum = sp.nat(1000000)
            self.data.rooms = sp.cast(sp.big_map(), sp.big_map[sp.bytes, Room])
            self.data.cash_claims = sp.cast(
                sp.big_map(), sp.big_map[sp.pair[sp.bytes, sp.pair[sp.address, sp.nat]], CashClaim]
            )
            self.data.lot_claims = sp.cast(
                sp.big_map(), sp.big_map[sp.pair[sp.bytes, sp.nat], LotClaim]
            )

        @sp.private(with_storage="read-only", with_operations=True)
        def transfer_token(self, params):
            sp.cast(params, TokenTransfer)
            endpoint = sp.contract(
                sp.list[TransferBatch], params.token_address, entrypoint="transfer"
            ).unwrap_some(error="FA2_TRANSFER_ENTRYPOINT_MISSING")
            sp.transfer([sp.record(from_=params.from_, txs=[sp.record(
                to_=params.to_, token_id=params.token_id, amount=params.amount,
            )])], sp.mutez(0), endpoint)

        @sp.private(with_storage="read-write")
        def credit_cash(self, params):
            sp.cast(params, Credit)
            if params.amount > 0:
                key = (params.room_id, (params.recipient, params.currency))
                claim = self.data.cash_claims.get(key, default=sp.record(amount=sp.nat(0), claimed=False))
                assert not claim.claimed, "CLAIM_ALREADY_PAID"
                claim.amount += params.amount
                self.data.cash_claims[key] = claim

        @sp.private(with_storage="read-only")
        def lot_at(self, params):
            sp.cast(params, LotAt)
            selected = sp.cast(None, sp.option[PrizeLot])
            index = sp.nat(0)
            for item in params.lots:
                if index == params.index:
                    selected = sp.Some(item)
                index += 1
            return selected.unwrap_some(error="LOT_OUT_OF_RANGE")

        @sp.private(with_storage="read-only")
        def place_at(self, params):
            sp.cast(params, PlaceAt)
            selected = sp.cast(None, sp.option[PrizePlace])
            index = sp.nat(0)
            for item in params.places:
                if index == params.index:
                    selected = sp.Some(item)
                index += 1
            return selected.unwrap_some(error="PLACE_OUT_OF_RANGE")

        @sp.private(with_storage="read-only")
        def nat_at(self, params):
            sp.cast(params, NatAt)
            selected = sp.cast(None, sp.option[sp.nat])
            index = sp.nat(0)
            for item in params.values:
                if index == params.index:
                    selected = sp.Some(item)
                index += 1
            return selected.unwrap_some(error="INDEX_OUT_OF_RANGE")

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
            assert params.mode <= 2, "BAD_MODE"
            assert sp.len(params.places) >= 1 and sp.len(params.places) <= 3, "BAD_PRIZE_PLACES"
            assert params.minimum_humans >= sp.len(params.places) and params.minimum_humans <= 8, "BAD_MINIMUM_HUMANS"
            assert params.entry_currency <= 2, "BAD_ENTRY_CURRENCY"
            assert params.pool_denominator > 0 and params.pool_numerator <= params.pool_denominator, "BAD_POOL_SHARE"
            if params.entry_currency == 0:
                assert params.entry_amount == 0 and params.pool_numerator == 0, "FREE_ENTRY_TERMS"
            else:
                quantum = self.data.xtz_quantum
                if params.entry_currency == 2:
                    quantum = self.data.wtf_quantum
                assert params.entry_amount > 0 and sp.mod(params.entry_amount, quantum) == 0, "ENTRY_QUANTUM"
            prize_xtz = sp.nat(0)
            prize_wtf = sp.nat(0)
            pool_weight = sp.nat(0)
            for award in params.places:
                assert sp.mod(award.xtz, self.data.xtz_quantum) == 0, "XTZ_PRIZE_QUANTUM"
                assert sp.mod(award.wtf, self.data.wtf_quantum) == 0, "WTF_PRIZE_QUANTUM"
                prize_xtz += award.xtz
                prize_wtf += award.wtf
                pool_weight += award.pool_weight
            if params.pool_numerator > 0:
                assert pool_weight > 0, "MISSING_POOL_WEIGHTS"
            lot_count = sp.nat(0)
            for lot in params.lots:
                assert lot.amount > 0, "EMPTY_LOT"
                if params.mode == 0:
                    assert lot.fixed_place >= 1 and lot.fixed_place <= sp.len(params.places), "BAD_FIXED_PLACE"
                else:
                    assert lot.fixed_place == 0, "NONFIXED_LOT_PLACE"
                lot_count += 1
            if params.mode == 0:
                assert sp.len(params.pick_counts) == 0, "FIXED_PICK_COUNTS"
            else:
                assert sp.len(params.pick_counts) == sp.len(params.places), "BAD_PICK_COUNTS"
                requested = sp.nat(0)
                for count in params.pick_counts:
                    requested += count
                assert requested == lot_count, "PICK_COUNT_MISMATCH"
            assert prize_xtz > 0 or prize_wtf > 0 or lot_count > 0, "NO_SPONSOR_PRIZE"
            house_fee = sp.nat(0)
            if params.entry_currency == 1:
                house_fee = self.data.xtz_paid_room_house_fee
            self.data.rooms[params.room_id] = sp.record(
                terms_hash=params.terms_hash, rules_hash=params.rules_hash,
                seed_commitment=params.seed_commitment, referee=params.referee,
                sponsor=params.sponsor, mode=params.mode,
                minimum_humans=params.minimum_humans,
                entry_currency=params.entry_currency, entry_amount=params.entry_amount,
                pool_numerator=params.pool_numerator, pool_denominator=params.pool_denominator,
                designated_wallet=params.designated_wallet, places=params.places,
                lots=params.lots, pick_counts=params.pick_counts,
                prize_xtz=prize_xtz, prize_wtf=prize_wtf, house_fee=house_fee,
                entrants=sp.cast([], sp.list[sp.address]),
                paid=sp.cast(set(), sp.set[sp.address]),
                sponsor_xtz_funded=False, sponsor_wtf_funded=False,
                funded_lots=sp.cast(set(), sp.set[sp.nat]), status=sp.nat(0),
                held_xtz=sp.nat(0), held_wtf=sp.nat(0),
                match_id=None, result_hash=None, transcript_hash=None,
                void_reason_hash=None, void_evidence_hash=None,
            )
            sp.emit(sp.record(room_id=params.room_id, terms_hash=params.terms_hash), tag="sponsor_room_created")

        @sp.entrypoint
        def fund_sponsor_xtz(self, params):
            sp.cast(params, RoomHash)
            assert params.room_id in self.data.rooms, "NO_ROOM"
            room = self.data.rooms[params.room_id]
            assert room.status == 0 and sp.sender == room.sponsor, "NOT_FUNDING_SPONSOR"
            assert room.terms_hash == params.expected_terms_hash, "TERMS_MISMATCH"
            assert not room.sponsor_xtz_funded, "SPONSOR_XTZ_FUNDED"
            required = room.prize_xtz + room.house_fee
            assert required > 0, "NO_XTZ_REQUIRED"
            assert sp.amount == utils.nat_to_mutez(required), "SPONSOR_XTZ_MISMATCH"
            room.sponsor_xtz_funded = True
            room.held_xtz += required
            self.data.rooms[params.room_id] = room
            sp.emit(sp.record(room_id=params.room_id, amount=required), tag="sponsor_xtz_funded")

        @sp.entrypoint
        def fund_sponsor_wtf(self, params):
            sp.cast(params, RoomHash)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert params.room_id in self.data.rooms, "NO_ROOM"
            room = self.data.rooms[params.room_id]
            assert room.status == 0 and sp.sender == room.sponsor, "NOT_FUNDING_SPONSOR"
            assert room.terms_hash == params.expected_terms_hash, "TERMS_MISMATCH"
            assert not room.sponsor_wtf_funded and room.prize_wtf > 0, "SPONSOR_WTF_FUNDED_OR_EMPTY"
            room.sponsor_wtf_funded = True
            room.held_wtf += room.prize_wtf
            self.data.rooms[params.room_id] = room
            self.transfer_token(sp.record(token_address=self.data.wtf_token_address,
                token_id=self.data.wtf_token_id, from_=sp.sender,
                to_=sp.self_address, amount=room.prize_wtf))
            sp.emit(sp.record(room_id=params.room_id, amount=room.prize_wtf), tag="sponsor_wtf_funded")

        @sp.entrypoint
        def fund_sponsor_lot(self, params):
            sp.cast(params, sp.record(room_id=sp.bytes, index=sp.nat,
                expected_terms_hash=sp.bytes).layout(("room_id", ("index", "expected_terms_hash"))))
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert params.room_id in self.data.rooms, "NO_ROOM"
            room = self.data.rooms[params.room_id]
            assert room.status == 0 and sp.sender == room.sponsor, "NOT_FUNDING_SPONSOR"
            assert room.terms_hash == params.expected_terms_hash, "TERMS_MISMATCH"
            assert params.index < sp.len(room.lots), "LOT_OUT_OF_RANGE"
            assert not params.index in room.funded_lots, "LOT_ALREADY_FUNDED"
            lot = self.lot_at(sp.record(lots=room.lots, index=params.index))
            room.funded_lots.add(params.index)
            self.data.rooms[params.room_id] = room
            self.transfer_token(sp.record(token_address=lot.token_address, token_id=lot.token_id,
                from_=sp.sender, to_=sp.self_address, amount=lot.amount))
            sp.emit(sp.record(room_id=params.room_id, index=params.index), tag="sponsor_lot_funded")

        @sp.entrypoint
        def register_entrant(self, params):
            sp.cast(params, Register)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert sp.sender == self.data.room_creator, "NOT_ROOM_CREATOR"
            assert params.room_id in self.data.rooms, "NO_ROOM"
            room = self.data.rooms[params.room_id]
            assert room.status == 0 and sp.len(room.entrants) < 8, "NO_OPEN_SEAT"
            for player in room.entrants:
                assert player != params.player, "DUPLICATE_ENTRANT"
            room.entrants.push(params.player)
            self.data.rooms[params.room_id] = room

        @sp.entrypoint
        def unregister_entrant(self, params):
            sp.cast(params, Register)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert sp.sender == self.data.room_creator, "NOT_ROOM_CREATOR"
            assert params.room_id in self.data.rooms, "NO_ROOM"
            room = self.data.rooms[params.room_id]
            assert room.status == 0 and not params.player in room.paid, "FUNDED_OR_STARTED"
            entrants = sp.cast([], sp.list[sp.address])
            removed = False
            for player in room.entrants:
                if player == params.player:
                    removed = True
                else:
                    entrants.push(player)
            assert removed, "NOT_ENTRANT"
            room.entrants = entrants
            self.data.rooms[params.room_id] = room

        @sp.entrypoint
        def join_room(self, params):
            sp.cast(params, RoomHash)
            assert params.room_id in self.data.rooms, "NO_ROOM"
            room = self.data.rooms[params.room_id]
            assert room.status == 0 and room.terms_hash == params.expected_terms_hash, "ROOM_NOT_FUNDING"
            assert not sp.sender in room.paid, "ALREADY_JOINED"
            admitted = False
            for player in room.entrants:
                if player == sp.sender:
                    admitted = True
            assert admitted, "NOT_REGISTERED"
            if room.entry_currency == 1:
                assert sp.amount == utils.nat_to_mutez(room.entry_amount), "ENTRY_AMOUNT_MISMATCH"
                room.held_xtz += room.entry_amount
            else:
                assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            if room.entry_currency == 2:
                room.held_wtf += room.entry_amount
            room.paid.add(sp.sender)
            self.data.rooms[params.room_id] = room
            if room.entry_currency == 2:
                self.transfer_token(sp.record(token_address=self.data.wtf_token_address,
                    token_id=self.data.wtf_token_id, from_=sp.sender,
                    to_=sp.self_address, amount=room.entry_amount))
            sp.emit(sp.record(room_id=params.room_id, player=sp.sender), tag="human_joined")

        @sp.entrypoint
        def start_room(self, params):
            sp.cast(params, StartRoom)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert params.room_id in self.data.rooms, "NO_ROOM"
            room = self.data.rooms[params.room_id]
            assert sp.sender == room.referee, "NOT_REFEREE"
            assert room.status == 0 and room.terms_hash == params.expected_terms_hash, "ROOM_NOT_FUNDING"
            assert sp.len(params.match_id) == 32, "BAD_MATCH_ID"
            assert sp.len(room.entrants) >= room.minimum_humans, "HUMAN_MINIMUM"
            assert sp.len(room.paid) == sp.len(room.entrants), "ENTRIES_NOT_FUNDED"
            assert sp.len(room.funded_lots) == sp.len(room.lots), "LOTS_NOT_FUNDED"
            if room.prize_xtz + room.house_fee > 0:
                assert room.sponsor_xtz_funded, "SPONSOR_XTZ_NOT_FUNDED"
            if room.prize_wtf > 0:
                assert room.sponsor_wtf_funded, "SPONSOR_WTF_NOT_FUNDED"
            entry_pot = room.entry_amount * sp.len(room.entrants)
            expected_xtz = room.prize_xtz + room.house_fee
            expected_wtf = room.prize_wtf
            if room.entry_currency == 1:
                expected_xtz += entry_pot
            if room.entry_currency == 2:
                expected_wtf += entry_pot
            assert room.held_xtz == expected_xtz and room.held_wtf == expected_wtf, "DEPOSIT_CONSERVATION"
            room.status = 1
            room.match_id = sp.Some(params.match_id)
            self.data.rooms[params.room_id] = room
            sp.emit(sp.record(room_id=params.room_id, match_id=params.match_id), tag="sponsor_room_started")

        @sp.entrypoint
        def finalize_room(self, params):
            sp.cast(params, FinalizeRoom)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert params.room_id in self.data.rooms, "NO_ROOM"
            room = self.data.rooms[params.room_id]
            assert sp.sender == room.referee and room.status == 1, "NOT_ACTIVE_REFEREE"
            assert room.match_id.unwrap_some() == params.match_id, "MATCH_MISMATCH"
            assert sp.len(params.transcript_hash) == 32 and sp.len(params.result_hash) == 32, "BAD_RESULT_HASH"
            assert sp.len(params.human_ranks) == sp.len(room.entrants), "HUMAN_RANK_COUNT"
            assert sp.len(params.lot_places) == sp.len(room.lots), "LOT_ALLOCATION_COUNT"
            seen = sp.cast(set(), sp.set[sp.address])
            for player in params.human_ranks:
                assert player in room.paid and not player in seen, "INVALID_HUMAN_RANK"
                seen.add(player)
            # The referee's order is the tie-resolved human order. AI has no
            # registered address, so it cannot receive a payout.
            entry_pot = room.entry_amount * sp.len(room.entrants)
            pool = sp.nat(0)
            if room.entry_currency != 0:
                pool = sp.fst(sp.ediv(entry_pot * room.pool_numerator,
                    room.pool_denominator).unwrap_some())
            fee_pool = sp.as_nat(entry_pot - pool)
            quantum = self.data.xtz_quantum
            if room.entry_currency == 2:
                quantum = self.data.wtf_quantum
            pool_weight = sp.nat(0)
            for award in room.places:
                pool_weight += award.pool_weight
            allocated_pool = sp.nat(0)
            place_number = sp.nat(1)
            for player in params.human_ranks:
                if place_number <= sp.len(room.places):
                    prize = self.place_at(sp.record(places=room.places,
                        index=sp.as_nat(place_number - 1)))
                    self.credit_cash(sp.record(room_id=params.room_id, recipient=player,
                        currency=sp.nat(0), amount=prize.xtz))
                    self.credit_cash(sp.record(room_id=params.room_id, recipient=player,
                        currency=sp.nat(1), amount=prize.wtf))
                    if pool > 0:
                        share = sp.fst(sp.ediv(pool * prize.pool_weight,
                            pool_weight * quantum).unwrap_some()) * quantum
                        allocated_pool += share
                        currency = sp.nat(0)
                        if room.entry_currency == 2:
                            currency = sp.nat(1)
                        self.credit_cash(sp.record(room_id=params.room_id, recipient=player,
                            currency=currency, amount=share))
                place_number += 1
            # 95/5 of the non-prize portion, rounded down to the currency's
            # 0.01 quantum for the designated wallet. The treasury receives
            # its five percent plus every subquantum remainder.
            designated = sp.fst(sp.ediv(fee_pool * 95, 100 * quantum).unwrap_some()) * quantum
            treasury = sp.as_nat(fee_pool - designated) + sp.as_nat(pool - allocated_pool)
            if room.entry_currency != 0:
                currency = sp.nat(0)
                if room.entry_currency == 2:
                    currency = sp.nat(1)
                self.credit_cash(sp.record(room_id=params.room_id,
                    recipient=room.designated_wallet, currency=currency,
                    amount=designated))
                self.credit_cash(sp.record(room_id=params.room_id,
                    recipient=self.data.treasury_address, currency=currency,
                    amount=treasury))
            self.credit_cash(sp.record(room_id=params.room_id,
                recipient=self.data.treasury_address, currency=sp.nat(0),
                amount=room.house_fee))
            # Validate fixed assignments or the exact per-place lot counts.
            if room.mode != 0:
                place = sp.nat(1)
                for expected_count in room.pick_counts:
                    actual_count = sp.nat(0)
                    for assigned in params.lot_places:
                        if assigned == place:
                            actual_count += 1
                    assert actual_count == expected_count, "PICK_COUNT_MISMATCH"
                    place += 1
            index = sp.nat(0)
            for lot in room.lots:
                assigned_place = self.nat_at(sp.record(values=params.lot_places, index=index))
                assert assigned_place >= 1 and assigned_place <= sp.len(room.places), "BAD_LOT_PLACE"
                if room.mode == 0:
                    assert assigned_place == lot.fixed_place, "FIXED_LOT_MISMATCH"
                recipient = room.sponsor
                rank = sp.nat(1)
                for player in params.human_ranks:
                    if rank == assigned_place:
                        recipient = player
                    rank += 1
                self.data.lot_claims[(params.room_id, index)] = sp.record(
                    recipient=recipient, claimed=False)
                index += 1
            room.status = 2
            room.result_hash = sp.Some(params.result_hash)
            room.transcript_hash = sp.Some(params.transcript_hash)
            self.data.rooms[params.room_id] = room
            sp.emit(sp.record(room_id=params.room_id,
                result_hash=params.result_hash), tag="sponsor_room_settled")

        @sp.entrypoint
        def cancel_room(self, room_id):
            sp.cast(room_id, sp.bytes)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert room_id in self.data.rooms, "NO_ROOM"
            room = self.data.rooms[room_id]
            assert sp.sender == room.sponsor and room.status == 0, "NOT_CANCELLABLE"
            room.status = 3
            self.data.rooms[room_id] = room
            sp.emit(room_id, tag="sponsor_room_cancelled")

        @sp.entrypoint
        def void_room(self, params):
            sp.cast(params, VoidRoom)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert params.room_id in self.data.rooms, "NO_ROOM"
            room = self.data.rooms[params.room_id]
            assert sp.sender == room.referee and (room.status == 0 or room.status == 1), "VOID_NOT_AVAILABLE"
            assert sp.len(params.reason_hash) == 32 and sp.len(params.evidence_hash) == 32, "BAD_VOID_EVIDENCE"
            room.status = 3
            room.void_reason_hash = sp.Some(params.reason_hash)
            room.void_evidence_hash = sp.Some(params.evidence_hash)
            self.data.rooms[params.room_id] = room
            sp.emit(params, tag="sponsor_room_voided")

        @sp.entrypoint
        def refund_entry(self, params):
            sp.cast(params, Register)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert params.room_id in self.data.rooms, "NO_ROOM"
            room = self.data.rooms[params.room_id]
            assert room.status == 0 or room.status == 3, "REFUND_NOT_AVAILABLE"
            assert params.player in room.paid, "ENTRY_NOT_FUNDED"
            room.paid.remove(params.player)
            if room.entry_currency == 1:
                room.held_xtz = sp.as_nat(room.held_xtz - room.entry_amount, error="ROOM_RESERVE_UNDERFLOW")
            if room.entry_currency == 2:
                room.held_wtf = sp.as_nat(room.held_wtf - room.entry_amount, error="ROOM_RESERVE_UNDERFLOW")
            self.data.rooms[params.room_id] = room
            if room.entry_currency == 1:
                sp.send(params.player, utils.nat_to_mutez(room.entry_amount))
            if room.entry_currency == 2:
                self.transfer_token(sp.record(token_address=self.data.wtf_token_address,
                    token_id=self.data.wtf_token_id, from_=sp.self_address,
                    to_=params.player, amount=room.entry_amount))
            sp.emit(sp.record(room_id=params.room_id, player=params.player), tag="sponsor_entry_refunded")

        @sp.entrypoint
        def refund_sponsor_xtz(self, room_id):
            sp.cast(room_id, sp.bytes)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert room_id in self.data.rooms, "NO_ROOM"
            room = self.data.rooms[room_id]
            assert room.status == 0 or room.status == 3, "REFUND_NOT_AVAILABLE"
            assert room.sponsor_xtz_funded, "SPONSOR_XTZ_NOT_FUNDED"
            amount = room.prize_xtz + room.house_fee
            room.sponsor_xtz_funded = False
            room.held_xtz = sp.as_nat(room.held_xtz - amount, error="ROOM_RESERVE_UNDERFLOW")
            self.data.rooms[room_id] = room
            sp.send(room.sponsor, utils.nat_to_mutez(amount))
            sp.emit(sp.record(room_id=room_id, amount=amount), tag="sponsor_xtz_refunded")

        @sp.entrypoint
        def refund_sponsor_wtf(self, room_id):
            sp.cast(room_id, sp.bytes)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert room_id in self.data.rooms, "NO_ROOM"
            room = self.data.rooms[room_id]
            assert room.status == 0 or room.status == 3, "REFUND_NOT_AVAILABLE"
            assert room.sponsor_wtf_funded, "SPONSOR_WTF_NOT_FUNDED"
            room.sponsor_wtf_funded = False
            room.held_wtf = sp.as_nat(room.held_wtf - room.prize_wtf, error="ROOM_RESERVE_UNDERFLOW")
            self.data.rooms[room_id] = room
            self.transfer_token(sp.record(token_address=self.data.wtf_token_address,
                token_id=self.data.wtf_token_id, from_=sp.self_address,
                to_=room.sponsor, amount=room.prize_wtf))
            sp.emit(room_id, tag="sponsor_wtf_refunded")

        @sp.entrypoint
        def refund_sponsor_lot(self, params):
            sp.cast(params, LotQuery)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert params.room_id in self.data.rooms, "NO_ROOM"
            room = self.data.rooms[params.room_id]
            assert room.status == 0 or room.status == 3, "REFUND_NOT_AVAILABLE"
            assert params.index in room.funded_lots, "LOT_NOT_FUNDED"
            lot = self.lot_at(sp.record(lots=room.lots, index=params.index))
            room.funded_lots.remove(params.index)
            self.data.rooms[params.room_id] = room
            self.transfer_token(sp.record(token_address=lot.token_address,
                token_id=lot.token_id, from_=sp.self_address,
                to_=room.sponsor, amount=lot.amount))
            sp.emit(params, tag="sponsor_lot_refunded")

        @sp.entrypoint
        def claim_cash(self, params):
            sp.cast(params, CashQuery)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert params.currency <= 1, "BAD_CURRENCY"
            key = (params.room_id, (params.recipient, params.currency))
            assert key in self.data.cash_claims, "NO_CLAIM"
            claim = self.data.cash_claims[key]
            assert not claim.claimed and claim.amount > 0, "ALREADY_CLAIMED"
            room = self.data.rooms[params.room_id]
            assert room.status == 2, "ROOM_NOT_SETTLED"
            if params.currency == 0:
                room.held_xtz = sp.as_nat(room.held_xtz - claim.amount, error="ROOM_RESERVE_UNDERFLOW")
            else:
                room.held_wtf = sp.as_nat(room.held_wtf - claim.amount, error="ROOM_RESERVE_UNDERFLOW")
            claim.claimed = True
            self.data.cash_claims[key] = claim
            self.data.rooms[params.room_id] = room
            if params.currency == 0:
                sp.send(params.recipient, utils.nat_to_mutez(claim.amount))
            else:
                self.transfer_token(sp.record(token_address=self.data.wtf_token_address,
                    token_id=self.data.wtf_token_id, from_=sp.self_address,
                    to_=params.recipient, amount=claim.amount))
            sp.emit(sp.record(room_id=params.room_id, recipient=params.recipient,
                currency=params.currency, amount=claim.amount), tag="sponsor_cash_claimed")

        @sp.entrypoint
        def claim_lot(self, params):
            sp.cast(params, LotQuery)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert params.room_id in self.data.rooms, "NO_ROOM"
            room = self.data.rooms[params.room_id]
            assert room.status == 2 and params.index in room.funded_lots, "LOT_NOT_CLAIMABLE"
            key = (params.room_id, params.index)
            assert key in self.data.lot_claims, "NO_LOT_CLAIM"
            claim = self.data.lot_claims[key]
            assert not claim.claimed, "ALREADY_CLAIMED"
            claim.claimed = True
            self.data.lot_claims[key] = claim
            room.funded_lots.remove(params.index)
            self.data.rooms[params.room_id] = room
            lot = self.lot_at(sp.record(lots=room.lots, index=params.index))
            self.transfer_token(sp.record(token_address=lot.token_address,
                token_id=lot.token_id, from_=sp.self_address,
                to_=claim.recipient, amount=lot.amount))
            sp.emit(sp.record(room_id=params.room_id, index=params.index,
                recipient=claim.recipient), tag="sponsor_lot_claimed")

        @sp.onchain_view()
        def get_room(self, room_id):
            sp.cast(room_id, sp.bytes)
            return self.data.rooms[room_id]

        @sp.onchain_view()
        def get_cash_claim(self, params):
            sp.cast(params, CashQuery)
            return self.data.cash_claims.get((params.room_id, (params.recipient, params.currency)),
                default=sp.record(amount=sp.nat(0), claimed=False))

        @sp.onchain_view()
        def get_lot_claim(self, params):
            sp.cast(params, LotQuery)
            return self.data.lot_claims.get((params.room_id, params.index),
                default=sp.record(recipient=self.data.treasury_address, claimed=False))


main = wtfiap_sponsor_escrow_main
