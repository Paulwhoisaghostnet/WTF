# PastaBlindPackController
#
# Ravioli v3 keeps its FA2 wrapper, recipe reservations, and atomic child
# delivery in PastaPackRouterFA2.  This typed helper owns only the bounded
# blind-sale state that would otherwise push the router over Tezos' script-size
# limit:
#
#   * immutable salted reveal commitment and deadline,
#   * per-holder contiguous LIFO claim stacks,
#   * exact per-claim primary payment and escrow,
#   * the reveal permutation and consumed serial set,
#   * timeout refund/cancellation authorization and holder pull-payment credit.
#
# Every mutating entrypoint derives the pack namespace from sp.sender.  A
# caller cannot mutate another router's state by supplying a pack_contract
# field.  Cross-contract views accept an explicit pack_contract because views
# do not mutate state.  Router + controller + child calls remain one Tezos
# operation tree, so a failure at any depth rolls the complete transition back.

import smartpy as sp


@sp.module
def pasta_blind_pack_controller_main():
    MAX_PACK_SUPPLY = 64
    MAX_CLAIM_BATCH = 8

    PackKeyType: type = sp.record(
        pack_contract=sp.address,
        pack_token_id=sp.nat,
    ).layout(("pack_contract", "pack_token_id"))
    HolderKeyType: type = sp.record(
        pack_contract=sp.address,
        pack_token_id=sp.nat,
        owner=sp.address,
    ).layout(("pack_contract", ("pack_token_id", "owner")))
    ClaimSlotKeyType: type = sp.record(
        pack_contract=sp.address,
        pack_token_id=sp.nat,
        owner=sp.address,
        slot=sp.nat,
    ).layout(("pack_contract", ("pack_token_id", ("owner", "slot"))))
    SerialKeyType: type = sp.record(
        pack_contract=sp.address,
        pack_token_id=sp.nat,
        serial=sp.nat,
    ).layout(("pack_contract", ("pack_token_id", "serial")))
    ClaimRecordType: type = sp.record(
        claim_id=sp.nat,
        paid=sp.mutez,
    ).layout(("claim_id", "paid"))
    PackStateType: type = sp.record(
        max_supply=sp.nat,
        inventory_owner=sp.address,
        treasury=sp.address,
        unit_price=sp.mutez,
        sale_end=sp.timestamp,
        reveal_deadline=sp.timestamp,
        open_deadline=sp.timestamp,
        reveal_commitment=sp.bytes,
        contents_uri=sp.option[sp.bytes],
        reveal_salt=sp.option[sp.bytes],
        revealed=sp.bool,
        reveal_offset=sp.option[sp.nat],
        next_claim_id=sp.nat,
        outstanding=sp.nat,
        unclaimed=sp.nat,
        escrowed=sp.mutez,
        cancelled=sp.bool,
    )
    RegisterPackType: type = sp.record(
        pack_token_id=sp.nat,
        max_supply=sp.nat,
        inventory_owner=sp.address,
        treasury=sp.address,
        unit_price=sp.mutez,
        sale_end=sp.timestamp,
        reveal_deadline=sp.timestamp,
        open_deadline=sp.timestamp,
        reveal_commitment=sp.bytes,
    )
    AssignClaimsType: type = sp.record(
        pack_token_id=sp.nat,
        buyer=sp.address,
        amount=sp.nat,
    )
    MoveClaimsType: type = sp.record(
        pack_token_id=sp.nat,
        from_=sp.address,
        to_=sp.address,
        amount=sp.nat,
    )
    MoveClaimsBatchType: type = sp.list[MoveClaimsType]
    ResolveClaimType: type = sp.record(
        pack_contract=sp.address,
        pack_token_id=sp.nat,
        holder=sp.address,
        expected_claim_id=sp.nat,
    )
    ConsumeClaimType: type = sp.record(
        pack_token_id=sp.nat,
        holder=sp.address,
        expected_claim_id=sp.nat,
        serial=sp.nat,
    )
    RevealTupleType: type = sp.record(
        contents_uri=sp.bytes,
        salt=sp.bytes,
        offset=sp.nat,
    ).layout(("contents_uri", ("offset", "salt")))
    RevealType: type = sp.record(
        pack_token_id=sp.nat,
        contents_uri=sp.bytes,
        salt=sp.bytes,
        offset=sp.nat,
        burned_unclaimed=sp.nat,
    )
    RefundQuoteType: type = sp.record(
        pack_contract=sp.address,
        pack_token_id=sp.nat,
        holder=sp.address,
        amount=sp.nat,
        expected_claim_id=sp.nat,
    )
    RefundClaimsType: type = sp.record(
        pack_token_id=sp.nat,
        holder=sp.address,
        amount=sp.nat,
        expected_claim_id=sp.nat,
        expected_refund=sp.mutez,
    )
    WithdrawRefundType: type = sp.record(
        destination=sp.address,
        amount=sp.mutez,
    )
    BurnRefundedType: type = sp.record(
        owner=sp.address,
        token_id=sp.nat,
        amount=sp.nat,
    )
    TimeoutCancelType: type = sp.record(
        token_id=sp.nat,
        inventory_owner=sp.address,
        unclaimed=sp.nat,
    )

    class PastaBlindPackController(sp.Contract):
        def __init__(self, metadata):
            self.data.metadata = sp.cast(
                metadata, sp.big_map[sp.string, sp.bytes]
            )
            self.data.packs = sp.cast(
                sp.big_map(), sp.big_map[PackKeyType, PackStateType]
            )
            self.data.claim_counts = sp.cast(
                sp.big_map(), sp.big_map[HolderKeyType, sp.nat]
            )
            self.data.claim_slots = sp.cast(
                sp.big_map(), sp.big_map[ClaimSlotKeyType, ClaimRecordType]
            )
            self.data.consumed_serials = sp.cast(
                sp.big_map(), sp.big_map[SerialKeyType, sp.unit]
            )
            # Expiry processing must never depend on whether a holder address
            # accepts an unsolicited tez transfer. Permissionless refunds burn
            # the wrapper and move its exact liability here; only that holder
            # can later pull some or all of the credit to a chosen destination.
            self.data.refund_credits = sp.cast(
                sp.big_map(), sp.big_map[sp.address, sp.mutez]
            )

        @sp.private(with_storage="read-only")
        def _pack_key(self, token_id):
            return sp.record(
                pack_contract=sp.sender,
                pack_token_id=token_id,
            )

        @sp.private(with_storage="read-only")
        def _holder_key(self, params):
            sp.cast(
                params,
                sp.record(
                    pack_contract=sp.address,
                    pack_token_id=sp.nat,
                    owner=sp.address,
                ),
            )
            return sp.record(
                pack_contract=params.pack_contract,
                pack_token_id=params.pack_token_id,
                owner=params.owner,
            )

        @sp.private(with_storage="read-only")
        def _top_claim(self, holder_key):
            sp.cast(holder_key, HolderKeyType)
            count = self.data.claim_counts.get(
                holder_key, default=sp.nat(0)
            )
            assert count > 0, "BLIND_CLAIM_REQUIRED"
            return self.data.claim_slots.get(
                sp.record(
                    pack_contract=holder_key.pack_contract,
                    pack_token_id=holder_key.pack_token_id,
                    owner=holder_key.owner,
                    slot=sp.as_nat(count - 1),
                ),
                error="BLIND_CLAIM_MISSING",
            )

        @sp.entrypoint
        def register_pack(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, RegisterPackType)
            key = self._pack_key(params.pack_token_id)
            assert not (key in self.data.packs), "PACK_ALREADY_REGISTERED"
            assert params.max_supply > 0, "BAD_SUPPLY"
            assert params.max_supply <= MAX_PACK_SUPPLY, "SUPPLY_TOO_LARGE"
            assert sp.len(params.reveal_commitment) == 32, "BAD_REVEAL_COMMITMENT"
            assert params.sale_end > sp.now, "ENDED"
            assert params.sale_end < params.reveal_deadline, "REVEAL_NOT_AFTER_SALE"
            assert params.reveal_deadline > sp.now, "BAD_REVEAL_DEADLINE"
            assert params.reveal_deadline < params.open_deadline, "OPEN_NOT_AFTER_REVEAL"
            self.data.packs[key] = sp.record(
                max_supply=params.max_supply,
                inventory_owner=params.inventory_owner,
                treasury=params.treasury,
                unit_price=params.unit_price,
                sale_end=params.sale_end,
                reveal_deadline=params.reveal_deadline,
                open_deadline=params.open_deadline,
                reveal_commitment=params.reveal_commitment,
                contents_uri=sp.cast(None, sp.option[sp.bytes]),
                reveal_salt=sp.cast(None, sp.option[sp.bytes]),
                revealed=False,
                reveal_offset=sp.cast(None, sp.option[sp.nat]),
                next_claim_id=sp.nat(0),
                outstanding=sp.nat(0),
                unclaimed=params.max_supply,
                escrowed=sp.mutez(0),
                cancelled=False,
            )

        @sp.entrypoint
        def assign_claims(self, params):
            sp.cast(params, AssignClaimsType)
            assert params.amount > 0, "BAD_AMOUNT"
            assert params.amount <= MAX_CLAIM_BATCH, "CLAIM_BATCH_TOO_LARGE"
            key = self._pack_key(params.pack_token_id)
            pack = self.data.packs.get(key, error="NO_PACK")
            assert not pack.cancelled, "PACK_CANCELLED"
            assert not pack.revealed, "CONTENTS_LOCKED"
            assert sp.now <= pack.sale_end, "ENDED"
            assert sp.now < pack.reveal_deadline, "REVEAL_DEADLINE_PASSED"
            assert pack.unclaimed >= params.amount, "BLIND_INVENTORY_UNDERFUNDED"
            assert sp.amount == sp.split_tokens(
                pack.unit_price, params.amount, 1
            ), "BAD_PAYMENT"

            holder_key = sp.record(
                pack_contract=sp.sender,
                pack_token_id=params.pack_token_id,
                owner=params.buyer,
            )
            holder_count = self.data.claim_counts.get(
                holder_key, default=sp.nat(0)
            )
            assert pack.next_claim_id + params.amount <= pack.max_supply, "CLAIMS_EXHAUSTED"
            for index in range(0, params.amount):
                self.data.claim_slots[
                    sp.record(
                        pack_contract=sp.sender,
                        pack_token_id=params.pack_token_id,
                        owner=params.buyer,
                        slot=holder_count + index,
                    )
                ] = sp.record(
                    claim_id=pack.next_claim_id + index,
                    paid=pack.unit_price,
                )
            self.data.claim_counts[holder_key] = holder_count + params.amount
            self.data.packs[key] = sp.record(
                max_supply=pack.max_supply,
                inventory_owner=pack.inventory_owner,
                treasury=pack.treasury,
                unit_price=pack.unit_price,
                sale_end=pack.sale_end,
                reveal_deadline=pack.reveal_deadline,
                open_deadline=pack.open_deadline,
                reveal_commitment=pack.reveal_commitment,
                contents_uri=pack.contents_uri,
                reveal_salt=pack.reveal_salt,
                revealed=pack.revealed,
                reveal_offset=pack.reveal_offset,
                next_claim_id=pack.next_claim_id + params.amount,
                outstanding=pack.outstanding + params.amount,
                unclaimed=sp.as_nat(pack.unclaimed - params.amount),
                escrowed=pack.escrowed + sp.amount,
                cancelled=pack.cancelled,
            )

        @sp.entrypoint
        def move_claim_batch(self, moves):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(moves, MoveClaimsBatchType)
            assert sp.len(moves) <= MAX_CLAIM_BATCH, "CLAIM_BATCH_TOO_LARGE"
            claim_units = sp.nat(0)
            # The router submits one controller operation for the complete FA2
            # transfer call.  Iterating this explicit list makes claim-stack
            # movement follow the same declared order as ledger movement;
            # internal-operation scheduling cannot invert adjacent A->B/B->C
            # transfers.
            for params in moves:
                assert params.amount > 0, "BAD_AMOUNT"
                assert params.amount <= MAX_CLAIM_BATCH, "CLAIM_BATCH_TOO_LARGE"
                claim_units += params.amount
                assert claim_units <= MAX_CLAIM_BATCH, "CLAIM_BATCH_TOO_LARGE"
                key = self._pack_key(params.pack_token_id)
                pack = self.data.packs.get(key, error="NO_PACK")
                assert not pack.cancelled, "PACK_CANCELLED"
                if pack.revealed:
                    assert sp.now < pack.open_deadline, "TRANSFER_DEADLINE_PASSED"
                else:
                    assert sp.now < pack.reveal_deadline, "TRANSFER_DEADLINE_PASSED"
                from_key = sp.record(
                    pack_contract=sp.sender,
                    pack_token_id=params.pack_token_id,
                    owner=params.from_,
                )
                from_count = self.data.claim_counts.get(
                    from_key, default=sp.nat(0)
                )
                assert from_count >= params.amount, "BLIND_CLAIM_REQUIRED"
                if params.from_ != params.to_:
                    to_key = sp.record(
                        pack_contract=sp.sender,
                        pack_token_id=params.pack_token_id,
                        owner=params.to_,
                    )
                    to_count = self.data.claim_counts.get(
                        to_key, default=sp.nat(0)
                    )
                    first_source_slot = sp.as_nat(from_count - params.amount)
                    for index in range(0, params.amount):
                        source_slot = first_source_slot + index
                        source_key = sp.record(
                            pack_contract=sp.sender,
                            pack_token_id=params.pack_token_id,
                            owner=params.from_,
                            slot=source_slot,
                        )
                        claim = self.data.claim_slots.get(
                            source_key, error="BLIND_CLAIM_MISSING"
                        )
                        self.data.claim_slots[
                            sp.record(
                                pack_contract=sp.sender,
                                pack_token_id=params.pack_token_id,
                                owner=params.to_,
                                slot=to_count + index,
                            )
                        ] = claim
                        del self.data.claim_slots[source_key]
                    if first_source_slot == 0:
                        del self.data.claim_counts[from_key]
                    else:
                        self.data.claim_counts[from_key] = first_source_slot
                    self.data.claim_counts[to_key] = to_count + params.amount

        @sp.entrypoint
        def reveal(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, RevealType)
            assert sp.len(params.contents_uri) > 0 and sp.len(
                params.contents_uri
            ) <= 256, "BAD_CONTENTS_URI"
            assert sp.len(params.salt) == 32, "BAD_REVEAL_SALT"
            key = self._pack_key(params.pack_token_id)
            pack = self.data.packs.get(key, error="NO_PACK")
            assert not pack.cancelled, "PACK_CANCELLED"
            assert not pack.revealed, "CONTENTS_LOCKED"
            assert sp.now < pack.reveal_deadline, "REVEAL_DEADLINE_PASSED"
            assert params.offset < pack.max_supply, "BAD_REVEAL_OFFSET"
            reveal = sp.record(
                contents_uri=params.contents_uri,
                salt=params.salt,
                offset=params.offset,
            )
            sp.cast(reveal, RevealTupleType)
            assert sp.blake2b(
                sp.pack(reveal)
            ) == pack.reveal_commitment, "BAD_REVEAL"
            # A creator may reveal immediately after sellout, or close a
            # partially sold edition once its immutable sale window ends.
            # The router burns only unsold seller inventory in the same
            # operation tree; sold claims retain their cyclic assignments.
            assert pack.unclaimed == 0 or sp.now >= pack.sale_end, "SALE_STILL_OPEN"
            assert params.burned_unclaimed == pack.unclaimed, "UNCLAIMED_CHANGED"
            assert pack.next_claim_id + pack.unclaimed == pack.max_supply, "BLIND_CLAIMS_INCOMPLETE"
            assert pack.outstanding == pack.next_claim_id, "BLIND_CLAIMS_INCOMPLETE"
            self.data.packs[key] = sp.record(
                max_supply=pack.max_supply,
                inventory_owner=pack.inventory_owner,
                treasury=pack.treasury,
                unit_price=pack.unit_price,
                sale_end=pack.sale_end,
                reveal_deadline=pack.reveal_deadline,
                open_deadline=pack.open_deadline,
                reveal_commitment=pack.reveal_commitment,
                contents_uri=sp.Some(params.contents_uri),
                reveal_salt=sp.Some(params.salt),
                revealed=True,
                reveal_offset=sp.Some(params.offset),
                next_claim_id=pack.next_claim_id,
                outstanding=pack.outstanding,
                unclaimed=sp.nat(0),
                escrowed=pack.escrowed,
                cancelled=pack.cancelled,
            )

        @sp.entrypoint
        def consume_claim(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, ConsumeClaimType)
            key = self._pack_key(params.pack_token_id)
            pack = self.data.packs.get(key, error="NO_PACK")
            assert pack.revealed, "BLIND_NOT_REVEALED"
            assert not pack.cancelled, "PACK_CANCELLED"
            assert pack.reveal_offset.is_some(), "BLIND_NOT_REVEALED"
            assert sp.now < pack.open_deadline, "OPEN_DEADLINE_PASSED"
            holder_key = sp.record(
                pack_contract=sp.sender,
                pack_token_id=params.pack_token_id,
                owner=params.holder,
            )
            count = self.data.claim_counts.get(
                holder_key, default=sp.nat(0)
            )
            claim = self._top_claim(holder_key)
            assert claim.claim_id == params.expected_claim_id, "CLAIM_CHANGED"
            serial = sp.mod(
                claim.claim_id + pack.reveal_offset.unwrap_some(),
                pack.max_supply,
            )
            assert serial == params.serial, "CLAIM_SERIAL_CHANGED"
            serial_key = sp.record(
                pack_contract=sp.sender,
                pack_token_id=params.pack_token_id,
                serial=serial,
            )
            assert not (
                serial_key in self.data.consumed_serials
            ), "SERIAL_ALREADY_CONSUMED"
            last_slot = sp.as_nat(count - 1)
            del self.data.claim_slots[
                sp.record(
                    pack_contract=sp.sender,
                    pack_token_id=params.pack_token_id,
                    owner=params.holder,
                    slot=last_slot,
                )
            ]
            if last_slot == 0:
                del self.data.claim_counts[holder_key]
            else:
                self.data.claim_counts[holder_key] = last_slot
            self.data.consumed_serials[serial_key] = ()
            assert pack.escrowed >= claim.paid, "PROCEEDS_ESCROW_UNDERFUNDED"
            remaining_escrow = pack.escrowed - claim.paid
            self.data.packs[key] = sp.record(
                max_supply=pack.max_supply,
                inventory_owner=pack.inventory_owner,
                treasury=pack.treasury,
                unit_price=pack.unit_price,
                sale_end=pack.sale_end,
                reveal_deadline=pack.reveal_deadline,
                open_deadline=pack.open_deadline,
                reveal_commitment=pack.reveal_commitment,
                contents_uri=pack.contents_uri,
                reveal_salt=pack.reveal_salt,
                revealed=pack.revealed,
                reveal_offset=pack.reveal_offset,
                next_claim_id=pack.next_claim_id,
                outstanding=sp.as_nat(pack.outstanding - 1),
                unclaimed=pack.unclaimed,
                escrowed=remaining_escrow,
                cancelled=pack.cancelled,
            )
            if claim.paid > sp.mutez(0):
                sp.send(pack.treasury, claim.paid)

        @sp.entrypoint
        def refund_claims(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, RefundClaimsType)
            assert params.amount > 0, "BAD_AMOUNT"
            assert params.amount <= MAX_CLAIM_BATCH, "CLAIM_BATCH_TOO_LARGE"
            key = self._pack_key(params.pack_token_id)
            pack = self.data.packs.get(key, error="NO_PACK")
            assert not pack.cancelled, "PACK_CANCELLED"
            if pack.revealed:
                assert sp.now >= pack.open_deadline, "REFUND_NOT_AVAILABLE"
            else:
                assert sp.now >= pack.reveal_deadline, "REFUND_NOT_AVAILABLE"
            holder_key = sp.record(
                pack_contract=sp.sender,
                pack_token_id=params.pack_token_id,
                owner=params.holder,
            )
            count = self.data.claim_counts.get(
                holder_key, default=sp.nat(0)
            )
            assert count >= params.amount, "BLIND_CLAIM_REQUIRED"
            top = self._top_claim(holder_key)
            assert top.claim_id == params.expected_claim_id, "CLAIM_CHANGED"
            refund = sp.mutez(0)
            for index in range(0, params.amount):
                slot = sp.as_nat(count - (index + 1))
                slot_key = sp.record(
                    pack_contract=sp.sender,
                    pack_token_id=params.pack_token_id,
                    owner=params.holder,
                    slot=slot,
                )
                claim = self.data.claim_slots.get(
                    slot_key, error="BLIND_CLAIM_MISSING"
                )
                refund += claim.paid
                del self.data.claim_slots[slot_key]
            assert refund == params.expected_refund, "REFUND_QUOTE_CHANGED"
            assert pack.escrowed >= refund, "PROCEEDS_ESCROW_UNDERFUNDED"
            remaining = sp.as_nat(count - params.amount)
            if remaining == 0:
                del self.data.claim_counts[holder_key]
            else:
                self.data.claim_counts[holder_key] = remaining
            self.data.packs[key] = sp.record(
                max_supply=pack.max_supply,
                inventory_owner=pack.inventory_owner,
                treasury=pack.treasury,
                unit_price=pack.unit_price,
                sale_end=pack.sale_end,
                reveal_deadline=pack.reveal_deadline,
                open_deadline=pack.open_deadline,
                reveal_commitment=pack.reveal_commitment,
                contents_uri=pack.contents_uri,
                reveal_salt=pack.reveal_salt,
                revealed=pack.revealed,
                reveal_offset=pack.reveal_offset,
                next_claim_id=pack.next_claim_id,
                outstanding=sp.as_nat(pack.outstanding - params.amount),
                unclaimed=pack.unclaimed,
                escrowed=pack.escrowed - refund,
                cancelled=pack.cancelled,
            )
            burn_handle = sp.contract(
                BurnRefundedType,
                sp.sender,
                "burn_refunded",
            ).unwrap_some(error="BAD_PACK_ROUTER")
            sp.transfer(
                sp.record(
                    owner=params.holder,
                    token_id=params.pack_token_id,
                    amount=params.amount,
                ),
                sp.mutez(0),
                burn_handle,
            )
            if refund > sp.mutez(0):
                self.data.refund_credits[params.holder] = (
                    self.data.refund_credits.get(
                        params.holder, default=sp.mutez(0)
                    )
                    + refund
                )

        @sp.entrypoint
        def withdraw_refund(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, WithdrawRefundType)
            assert params.amount > sp.mutez(0), "BAD_AMOUNT"
            credit = self.data.refund_credits.get(
                sp.sender, default=sp.mutez(0)
            )
            assert credit >= params.amount, "REFUND_CREDIT_UNDERFUNDED"
            remaining = credit - params.amount
            if remaining == sp.mutez(0):
                del self.data.refund_credits[sp.sender]
            else:
                self.data.refund_credits[sp.sender] = remaining
            # A destination rejection rolls this debit back with the complete
            # operation tree, preserving the holder's withdrawable credit.
            sp.send(params.destination, params.amount)

        @sp.entrypoint
        def cancel_unrevealed(self, pack_token_id):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(pack_token_id, sp.nat)
            key = self._pack_key(pack_token_id)
            pack = self.data.packs.get(key, error="NO_PACK")
            assert not pack.cancelled, "PACK_CANCELLED"
            assert not pack.revealed, "CONTENTS_LOCKED"
            assert sp.now >= pack.reveal_deadline, "REFUND_NOT_AVAILABLE"
            assert pack.outstanding == 0, "CLAIMS_OUTSTANDING"
            assert pack.escrowed == sp.mutez(0), "PROCEEDS_ESCROWED"
            self.data.packs[key] = sp.record(
                max_supply=pack.max_supply,
                inventory_owner=pack.inventory_owner,
                treasury=pack.treasury,
                unit_price=pack.unit_price,
                sale_end=pack.sale_end,
                reveal_deadline=pack.reveal_deadline,
                open_deadline=pack.open_deadline,
                reveal_commitment=pack.reveal_commitment,
                contents_uri=pack.contents_uri,
                reveal_salt=pack.reveal_salt,
                revealed=pack.revealed,
                reveal_offset=pack.reveal_offset,
                next_claim_id=pack.next_claim_id,
                outstanding=pack.outstanding,
                unclaimed=sp.nat(0),
                escrowed=pack.escrowed,
                cancelled=True,
            )
            cancel_handle = sp.contract(
                TimeoutCancelType,
                sp.sender,
                "timeout_cancel",
            ).unwrap_some(error="BAD_PACK_ROUTER")
            sp.transfer(
                sp.record(
                    token_id=pack_token_id,
                    inventory_owner=pack.inventory_owner,
                    unclaimed=pack.unclaimed,
                ),
                sp.mutez(0),
                cancel_handle,
            )

        @sp.onchain_view()
        def get_claim_count(self, holder):
            sp.cast(holder, HolderKeyType)
            return self.data.claim_counts.get(holder, default=sp.nat(0))

        @sp.onchain_view()
        def get_pack_status(self, key):
            sp.cast(key, PackKeyType)
            return self.data.packs.get(key, error="NO_PACK")

        @sp.onchain_view()
        def get_refund_credit(self, owner):
            sp.cast(owner, sp.address)
            return self.data.refund_credits.get(
                owner, default=sp.mutez(0)
            )

        @sp.onchain_view()
        def get_last_claim(self, holder):
            sp.cast(holder, HolderKeyType)
            return self._top_claim(holder)

        @sp.onchain_view()
        def get_claim_serial(self, params):
            sp.cast(params, ResolveClaimType)
            key = sp.record(
                pack_contract=params.pack_contract,
                pack_token_id=params.pack_token_id,
            )
            pack = self.data.packs.get(key, error="NO_PACK")
            assert pack.revealed, "BLIND_NOT_REVEALED"
            assert not pack.cancelled, "PACK_CANCELLED"
            assert pack.reveal_offset.is_some(), "BLIND_NOT_REVEALED"
            assert sp.now < pack.open_deadline, "OPEN_DEADLINE_PASSED"
            holder_key = sp.record(
                pack_contract=params.pack_contract,
                pack_token_id=params.pack_token_id,
                owner=params.holder,
            )
            claim = self._top_claim(holder_key)
            assert claim.claim_id == params.expected_claim_id, "CLAIM_CHANGED"
            serial = sp.mod(
                claim.claim_id + pack.reveal_offset.unwrap_some(),
                pack.max_supply,
            )
            assert not (
                sp.record(
                    pack_contract=params.pack_contract,
                    pack_token_id=params.pack_token_id,
                    serial=serial,
                )
                in self.data.consumed_serials
            ), "SERIAL_ALREADY_CONSUMED"
            return serial

        @sp.onchain_view()
        def quote_refund(self, params):
            sp.cast(params, RefundQuoteType)
            assert params.amount > 0, "BAD_AMOUNT"
            assert params.amount <= MAX_CLAIM_BATCH, "CLAIM_BATCH_TOO_LARGE"
            key = sp.record(
                pack_contract=params.pack_contract,
                pack_token_id=params.pack_token_id,
            )
            pack = self.data.packs.get(key, error="NO_PACK")
            assert not pack.cancelled, "PACK_CANCELLED"
            if pack.revealed:
                assert sp.now >= pack.open_deadline, "REFUND_NOT_AVAILABLE"
            else:
                assert sp.now >= pack.reveal_deadline, "REFUND_NOT_AVAILABLE"
            holder_key = sp.record(
                pack_contract=params.pack_contract,
                pack_token_id=params.pack_token_id,
                owner=params.holder,
            )
            count = self.data.claim_counts.get(
                holder_key, default=sp.nat(0)
            )
            assert count >= params.amount, "BLIND_CLAIM_REQUIRED"
            top = self._top_claim(holder_key)
            assert top.claim_id == params.expected_claim_id, "CLAIM_CHANGED"
            refund = sp.mutez(0)
            for index in range(0, params.amount):
                claim = self.data.claim_slots.get(
                    sp.record(
                        pack_contract=params.pack_contract,
                        pack_token_id=params.pack_token_id,
                        owner=params.holder,
                        slot=sp.as_nat(count - (index + 1)),
                    ),
                    error="BLIND_CLAIM_MISSING",
                )
                refund += claim.paid
            return refund


main = pasta_blind_pack_controller_main


def bytes_of_string(value):
    return sp.bytes("0x" + value.encode("utf-8").hex())


def pasta_blind_pack_controller_template():
    return main.PastaBlindPackController(
        sp.big_map({"": bytes_of_string("ipfs://QmPastaBlindPackControllerV1")})
    )


@sp.add_test()
def deploy_pasta_blind_pack_controller_template():
    scenario = sp.test_scenario(
        "deploy_pasta_blind_pack_controller_template", main
    )
    scenario += pasta_blind_pack_controller_template()
