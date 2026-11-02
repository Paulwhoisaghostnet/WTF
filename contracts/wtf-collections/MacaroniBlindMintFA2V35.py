# MacaroniBlindMintFA2V35
#
# V3.5 is a claim-first blind-mint contract. A purchase never accepts a token
# id, metadata URI, CID, seed, recipient, or allocation choice. It records one
# FIFO claim per purchased unit. The authorized finalizer later supplies the
# next preimage from a reverse SHA-256 hash chain and the metadata committed for
# the token row selected by the contract. Allocation, metadata verification,
# and final TZIP-12 minting are atomic; there is no placeholder token and no
# reveal-after-mint state.
#
# The hidden chain makes allocation unpredictable to ordinary buyers who do
# not know its preimages and prevents the finalizer from choosing a different
# preimage after a claim exists. It is not trustless randomness: the single
# chain custodian knows future preimages, can simulate candidate outcomes when
# the other claim inputs are known, can selectively participate, and can
# withhold fulfillment. Finalizer authority can be recovered through a two-step
# rotation, but recovery still requires transferring the unchanged next
# preimage to that new custodian; rotation never changes the entropy cursor or
# FIFO claim order.
# Strict FIFO settlement prevents timing, batching, or settlement order from
# changing the already-bound result, but it cannot force the custodian to act.

import hashlib

import smartpy as sp


CHAIN_DOMAIN = b"macaroni-v35/hash-chain/v1"
ALLOCATION_DOMAIN_TEXT = "macaroni-v35/allocation/v1"
METADATA_DOMAIN_TEXT = "macaroni-v35/metadata/v1"


@sp.module
def main():
    LedgerKeyType: type = sp.record(owner=sp.address, token_id=sp.nat).layout(
        ("owner", "token_id")
    )
    OperatorKeyType: type = sp.record(
        owner=sp.address, operator=sp.address, token_id=sp.nat
    ).layout(("owner", ("operator", "token_id")))
    BalanceOfRequestType: type = sp.record(owner=sp.address, token_id=sp.nat).layout(
        ("owner", "token_id")
    )
    BalanceOfResponseType: type = sp.record(
        request=BalanceOfRequestType, balance=sp.nat
    ).layout(("request", "balance"))
    BalanceOfParamType: type = sp.record(
        requests=sp.list[BalanceOfRequestType],
        callback=sp.contract[sp.list[BalanceOfResponseType]],
    ).layout(("requests", "callback"))
    OperatorParamType: type = sp.variant(
        add_operator=OperatorKeyType, remove_operator=OperatorKeyType
    )
    TransferTxType: type = sp.record(
        to_=sp.address, token_id=sp.nat, amount=sp.nat
    ).layout(("to_", ("token_id", "amount")))
    TransferBatchItemType: type = sp.record(
        from_=sp.address, txs=sp.list[TransferTxType]
    ).layout(("from_", "txs"))
    TokenMetadataType: type = sp.record(
        token_id=sp.nat, token_info=sp.map[sp.string, sp.bytes]
    ).layout(("token_id", "token_info"))
    TokenCommitmentBatchItemType: type = sp.record(
        token_id=sp.nat,
        metadata_commitment=sp.bytes,
        quantity=sp.nat,
    ).layout(("token_id", ("metadata_commitment", "quantity")))
    SlotAppendBatchItemType: type = sp.record(
        token_id=sp.nat,
        count=sp.nat,
    ).layout(("token_id", "count"))
    SettlementItemType: type = sp.record(
        claim_id=sp.nat,
        entropy_preimage=sp.bytes,
        metadata_uri=sp.bytes,
        metadata_nonce=sp.bytes,
    ).layout(
        (
            "claim_id",
            ("entropy_preimage", ("metadata_uri", "metadata_nonce")),
        )
    )
    StageType: type = sp.record(
        start=sp.timestamp,
        price=sp.mutez,
        use_allowlist=sp.bool,
        max_per_wallet=sp.option[sp.nat],
    ).layout(("start", ("price", ("use_allowlist", "max_per_wallet"))))
    AllowKeyType: type = sp.record(stage=sp.nat, holder=sp.address).layout(
        ("stage", "holder")
    )
    MinterKeyType: type = sp.record(token_id=sp.nat, minter=sp.address).layout(
        ("token_id", "minter")
    )
    RoyaltyConfigType: type = sp.record(
        enabled=sp.bool,
        bps=sp.nat,
        mode=sp.nat,  # 0 = first minter, 1 = rolling unique-minter pool
        updater=sp.address,
    ).layout(("enabled", ("bps", ("mode", "updater"))))
    ClaimType: type = sp.record(
        buyer=sp.address,
        recipient=sp.address,
        unit=sp.nat,
        purchase_level=sp.nat,
        purchase_time=sp.timestamp,
        stage_id=sp.nat,
    ).layout(
        (
            "buyer",
            (
                "recipient",
                ("unit", ("purchase_level", ("purchase_time", "stage_id"))),
            ),
        )
    )
    ReleasePolicyType: type = sp.variant(
        immediate=sp.unit,
        rolling_delay=sp.nat,
        scheduled=sp.timestamp,
        sellout=sp.unit,
    )

    class MacaroniBlindMintFA2V35(sp.Contract):
        def __init__(
            self,
            creator,
            administrator,
            finalizer,
            treasury,
            metadata,
            release_policy,
            entropy_commitment,
            entropy_length,
            fulfillment_subsidy,
            minter_royalty_config,
        ):
            # Immutable profile fields.
            self.data.creator = sp.cast(creator, sp.address)
            self.data.treasury = sp.cast(treasury, sp.address)
            self.data.release_policy = sp.cast(release_policy, ReleasePolicyType)
            self.data.entropy_commitment = sp.cast(entropy_commitment, sp.bytes)
            self.data.entropy_length = sp.cast(entropy_length, sp.nat)
            self.data.fulfillment_subsidy = sp.cast(fulfillment_subsidy, sp.mutez)
            self.data.minter_royalty_config = sp.cast(
                minter_royalty_config, RoyaltyConfigType
            )

            # Rotatable administration does not change creator-domain allocation.
            self.data.administrator = sp.cast(administrator, sp.address)
            self.data.pending_administrator = sp.cast(None, sp.option[sp.address])
            self.data.finalizer = sp.cast(finalizer, sp.address)
            self.data.pending_finalizer = sp.cast(None, sp.option[sp.address])

            # Standard FA2 storage.
            self.data.metadata = sp.cast(metadata, sp.big_map[sp.string, sp.bytes])
            self.data.ledger = sp.cast(sp.big_map(), sp.big_map[LedgerKeyType, sp.nat])
            self.data.operators = sp.cast(
                sp.big_map(), sp.big_map[OperatorKeyType, sp.unit]
            )
            self.data.token_metadata = sp.cast(
                sp.big_map(), sp.big_map[sp.nat, TokenMetadataType]
            )

            # Setup-only inventory. Each physical slot contains one token row id;
            # repeated ids are editions of the same final TZIP-12 token.
            self.data.token_commitments = sp.cast(
                sp.big_map(), sp.big_map[sp.nat, sp.bytes]
            )
            self.data.commitment_owner = sp.cast(
                sp.big_map(), sp.big_map[sp.bytes, sp.nat]
            )
            self.data.token_supply = sp.cast(
                sp.big_map(), sp.big_map[sp.nat, sp.nat]
            )
            self.data.token_minted = sp.cast(
                sp.big_map(), sp.big_map[sp.nat, sp.nat]
            )
            self.data.slots = sp.cast(sp.big_map(), sp.big_map[sp.nat, sp.nat])
            self.data.token_slots_loaded = sp.cast(
                sp.big_map(), sp.big_map[sp.nat, sp.nat]
            )
            self.data.metadata_uri_owner = sp.cast(
                sp.big_map(), sp.big_map[sp.bytes, sp.nat]
            )
            self.data.supply = sp.nat(0)
            self.data.slots_loaded = sp.nat(0)
            self.data.next_slot_token_id = sp.nat(0)
            self.data.token_count = sp.nat(0)

            # Sale/access state originates closed and is locked by finalize_setup.
            self.data.stages = sp.cast({}, sp.map[sp.nat, StageType])
            self.data.allowlist = sp.cast(
                sp.big_map(), sp.big_map[AllowKeyType, sp.nat]
            )
            self.data.stage_minted = sp.cast(
                sp.big_map(), sp.big_map[AllowKeyType, sp.nat]
            )
            self.data.setup_finalized = False
            self.data.sale_activated = False
            self.data.sale_active = False
            self.data.sale_permanently_closed = False
            self.data.fulfillment_armed = False
            self.data.paused = False

            # Immutable FIFO purchase claims and their final allocations.
            self.data.claims = sp.cast(sp.big_map(), sp.big_map[sp.nat, ClaimType])
            self.data.claim_token = sp.cast(
                sp.big_map(), sp.big_map[sp.nat, sp.nat]
            )
            self.data.claim_allocation_digest = sp.cast(
                sp.big_map(), sp.big_map[sp.nat, sp.bytes]
            )
            self.data.claims_created = sp.nat(0)
            self.data.claims_settled = sp.nat(0)
            self.data.next_claim_to_settle = sp.nat(0)

            # The cursor starts at the public chain head. Every successful FIFO
            # settlement reveals exactly one 32-byte preimage and advances once.
            self.data.entropy_cursor = sp.cast(entropy_commitment, sp.bytes)
            self.data.entropy_remaining = sp.cast(entropy_length, sp.nat)

            # Fulfillment accounting. Five reimbursements must be funded before
            # activation; paid purchases retain one fixed subsidy per unit.
            self.data.total_sales_received = sp.mutez(0)
            self.data.total_treasury_paid = sp.mutez(0)
            self.data.total_subsidy_retained = sp.mutez(0)
            self.data.total_reimbursements = sp.mutez(0)
            self.data.activation_reserve_required = sp.mutez(0)
            self.data.final_sweep_amount = sp.mutez(0)
            self.data.final_sweep_complete = False

            # Minter royalty recipient evidence remains on-chain without a
            # post-mint metadata mutation path.
            self.data.first_minter = sp.cast(
                sp.big_map(), sp.big_map[sp.nat, sp.address]
            )
            self.data.minter_pool = sp.cast(
                sp.big_map(), sp.big_map[MinterKeyType, sp.unit]
            )
            self.data.minter_pool_count = sp.cast(
                sp.big_map(), sp.big_map[sp.nat, sp.nat]
            )
            self.data.royalty_revision = sp.cast(
                sp.big_map(), sp.big_map[sp.nat, sp.nat]
            )

        @sp.private(with_storage="read-only")
        def _only_admin(self):
            assert sp.sender == self.data.administrator, "NOT_ADMIN"
            return ()

        @sp.private(with_storage="read-only")
        def _active_stage_id(self):
            active = sp.cast(None, sp.option[sp.nat])
            for stage_id in self.data.stages.keys():
                stage = self.data.stages[stage_id]
                if stage.start <= sp.now:
                    if active.is_none():
                        active = sp.Some(stage_id)
                    else:
                        previous = active.unwrap_some()
                        if previous < stage_id:
                            active = sp.Some(stage_id)
            return active

        @sp.private(with_storage="read-only")
        def _assert_release_eligible(self, claim):
            sp.cast(claim, ClaimType)
            eligible = False
            match self.data.release_policy:
                case immediate(_):
                    eligible = True
                case rolling_delay(seconds):
                    eligible = sp.now >= sp.add_seconds(
                        claim.purchase_time, sp.to_int(seconds)
                    )
                case scheduled(release_at):
                    eligible = sp.now >= release_at
                case sellout(_):
                    eligible = (
                        self.data.claims_created == self.data.supply
                        or self.data.sale_permanently_closed
                    )
            assert eligible, "RELEASE_NOT_ELIGIBLE"
            return ()

        @sp.private(with_storage="read-write", with_operations=True)
        def _record_minter_royalty(self, params):
            sp.cast(params, sp.record(token_id=sp.nat, minter=sp.address))
            cfg = self.data.minter_royalty_config
            if cfg.enabled and cfg.bps > 0:
                minted_before = self.data.token_minted.get(
                    params.token_id, default=sp.nat(0)
                )
                if cfg.mode == 0:
                    if minted_before == 0:
                        self.data.first_minter[params.token_id] = params.minter
                        self.data.royalty_revision[params.token_id] = (
                            self.data.royalty_revision.get(
                                params.token_id, default=sp.nat(0)
                            )
                            + 1
                        )
                        sp.emit(
                            sp.record(
                                token_id=params.token_id,
                                minter=params.minter,
                                revision=self.data.royalty_revision[params.token_id],
                            ),
                            tag="minter_royalty_revision",
                        )
                else:
                    key = sp.record(token_id=params.token_id, minter=params.minter)
                    if not (key in self.data.minter_pool):
                        self.data.minter_pool[key] = ()
                        self.data.minter_pool_count[params.token_id] = (
                            self.data.minter_pool_count.get(
                                params.token_id, default=sp.nat(0)
                            )
                            + 1
                        )
                        self.data.royalty_revision[params.token_id] = (
                            self.data.royalty_revision.get(
                                params.token_id, default=sp.nat(0)
                            )
                            + 1
                        )
                        sp.emit(
                            sp.record(
                                token_id=params.token_id,
                                minter=params.minter,
                                count=self.data.minter_pool_count[params.token_id],
                                revision=self.data.royalty_revision[params.token_id],
                            ),
                            tag="minter_royalty_revision",
                        )
            return ()

        # ---- FA2 standard ----

        @sp.entrypoint
        def balance_of(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, BalanceOfParamType)
            responses = []
            for req in params.requests:
                assert req.token_id < self.data.token_count, "FA2_TOKEN_UNDEFINED"
                key = sp.record(owner=req.owner, token_id=req.token_id)
                responses.push(
                    sp.record(
                        request=sp.record(owner=req.owner, token_id=req.token_id),
                        balance=self.data.ledger.get(key, default=sp.nat(0)),
                    )
                )
            sp.transfer(reversed(responses), sp.mutez(0), params.callback)

        @sp.entrypoint
        def update_operators(self, actions):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(actions, sp.list[OperatorParamType])
            for action in actions:
                match action:
                    case add_operator(op):
                        assert op.owner == sp.sender, "FA2_NOT_OWNER"
                        assert op.token_id < self.data.token_count, "FA2_TOKEN_UNDEFINED"
                        self.data.operators[op] = ()
                    case remove_operator(op):
                        assert op.owner == sp.sender, "FA2_NOT_OWNER"
                        if op in self.data.operators:
                            del self.data.operators[op]

        @sp.entrypoint
        def transfer(self, batch):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(batch, sp.list[TransferBatchItemType])
            for item in batch:
                for tx in item.txs:
                    assert tx.token_id < self.data.token_count, "FA2_TOKEN_UNDEFINED"
                    if item.from_ != sp.sender:
                        operator_key = sp.record(
                            owner=item.from_,
                            operator=sp.sender,
                            token_id=tx.token_id,
                        )
                        assert operator_key in self.data.operators, "FA2_NOT_OPERATOR"
                    if tx.amount > 0:
                        from_key = sp.record(
                            owner=item.from_, token_id=tx.token_id
                        )
                        from_balance = self.data.ledger.get(
                            from_key, default=sp.nat(0)
                        )
                        assert from_balance >= tx.amount, "FA2_INSUFFICIENT_BALANCE"
                        next_from = sp.as_nat(from_balance - tx.amount)
                        if next_from == 0:
                            if from_key in self.data.ledger:
                                del self.data.ledger[from_key]
                        else:
                            self.data.ledger[from_key] = next_from
                        to_key = sp.record(owner=tx.to_, token_id=tx.token_id)
                        self.data.ledger[to_key] = (
                            self.data.ledger.get(to_key, default=sp.nat(0))
                            + tx.amount
                        )

        # ---- Administration and setup ----

        @sp.entrypoint
        def transfer_administration(self, pending_administrator):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(pending_administrator, sp.address)
            _ = self._only_admin()
            self.data.pending_administrator = sp.Some(pending_administrator)

        @sp.entrypoint
        def accept_administration(self):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            assert self.data.pending_administrator.is_some(), "NO_PENDING_ADMIN"
            pending = self.data.pending_administrator.unwrap_some()
            assert sp.sender == pending, "NOT_PENDING_ADMIN"
            self.data.administrator = pending
            self.data.pending_administrator = sp.cast(None, sp.option[sp.address])

        @sp.entrypoint
        def transfer_finalizer(self, pending_finalizer):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(pending_finalizer, sp.address)
            _ = self._only_admin()
            assert not self.data.final_sweep_complete, "LIFECYCLE_COMPLETE"
            assert pending_finalizer != self.data.finalizer, "FINALIZER_UNCHANGED"
            self.data.pending_finalizer = sp.Some(pending_finalizer)

        @sp.entrypoint
        def accept_finalizer(self):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            assert not self.data.final_sweep_complete, "LIFECYCLE_COMPLETE"
            assert self.data.pending_finalizer.is_some(), "NO_PENDING_FINALIZER"
            pending = self.data.pending_finalizer.unwrap_some()
            assert sp.sender == pending, "NOT_PENDING_FINALIZER"
            previous = self.data.finalizer
            self.data.finalizer = pending
            self.data.pending_finalizer = sp.cast(None, sp.option[sp.address])
            if not self.data.sale_activated:
                self.data.fulfillment_armed = False
            sp.emit(
                sp.record(previous=previous, current=pending),
                tag="finalizer_rotated",
            )

        @sp.entrypoint
        def set_pause(self, paused):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(paused, sp.bool)
            _ = self._only_admin()
            self.data.paused = paused

        @sp.entrypoint
        def fund_fulfillment_reserve(self):
            assert not self.data.final_sweep_complete, "LIFECYCLE_COMPLETE"
            sp.emit(sp.amount, tag="fulfillment_reserve_funded")

        @sp.entrypoint
        def arm_fulfillment(self):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            assert sp.sender == self.data.finalizer, "NOT_FINALIZER"
            assert self.data.setup_finalized, "SETUP_NOT_FINALIZED"
            assert not self.data.sale_activated, "SALE_ALREADY_ACTIVATED"
            assert not self.data.sale_permanently_closed, "SALE_PERMANENTLY_CLOSED"
            assert not self.data.fulfillment_armed, "FULFILLMENT_ALREADY_ARMED"
            assert self.data.claims_created == 0, "CLAIMS_ALREADY_EXIST"
            self.data.fulfillment_armed = True
            sp.emit(
                sp.record(
                    finalizer=sp.sender,
                    entropy_commitment=self.data.entropy_commitment,
                    entropy_length=self.data.entropy_length,
                ),
                tag="fulfillment_armed",
            )

        @sp.entrypoint
        def add_tokens_v35(self, tokens):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(tokens, sp.list[TokenCommitmentBatchItemType])
            _ = self._only_admin()
            assert not self.data.sale_permanently_closed, "SALE_PERMANENTLY_CLOSED"
            assert not self.data.setup_finalized, "SETUP_FINALIZED"
            assert not self.data.sale_activated, "SALE_ALREADY_ACTIVATED"
            assert sp.len(tokens) > 0, "EMPTY_TOKEN_BATCH"
            for token in tokens:
                assert token.quantity > 0, "BAD_QUANTITY"
                assert token.token_id == self.data.token_count, "NON_SEQUENTIAL_TOKEN"
                assert sp.len(token.metadata_commitment) == 32, "BAD_COMMITMENT"
                assert not (
                    token.metadata_commitment in self.data.commitment_owner
                ), "DUPLICATE_COMMITMENT"
                self.data.token_commitments[token.token_id] = (
                    token.metadata_commitment
                )
                self.data.commitment_owner[token.metadata_commitment] = token.token_id
                self.data.token_supply[token.token_id] = token.quantity
                self.data.token_minted[token.token_id] = sp.nat(0)
                self.data.token_slots_loaded[token.token_id] = sp.nat(0)
                self.data.royalty_revision[token.token_id] = sp.nat(0)
                self.data.supply += token.quantity
                self.data.token_count += 1

        @sp.entrypoint
        def append_token_slots_v35(self, items):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(items, sp.list[SlotAppendBatchItemType])
            _ = self._only_admin()
            assert not self.data.sale_permanently_closed, "SALE_PERMANENTLY_CLOSED"
            assert not self.data.setup_finalized, "SETUP_FINALIZED"
            assert not self.data.sale_activated, "SALE_ALREADY_ACTIVATED"
            assert sp.len(items) > 0, "EMPTY_SLOT_BATCH"
            for item in items:
                assert item.count > 0, "BAD_SLOT_COUNT"
                assert item.token_id < self.data.token_count, "TOKEN_UNDEFINED"
                assert (
                    item.token_id == self.data.next_slot_token_id
                ), "NON_SEQUENTIAL_SLOT_TOKEN"
                loaded_before = self.data.token_slots_loaded.get(
                    item.token_id, default=sp.nat(0)
                )
                loaded_after = loaded_before + item.count
                assert (
                    loaded_after <= self.data.token_supply[item.token_id]
                ), "TOKEN_SLOTS_OVERFILLED"
                for slot_offset in sp.range(0, item.count):
                    self.data.slots[self.data.slots_loaded] = item.token_id
                    self.data.slots_loaded += 1
                self.data.token_slots_loaded[item.token_id] = loaded_after
                if loaded_after == self.data.token_supply[item.token_id]:
                    self.data.next_slot_token_id += 1
                sp.emit(
                    sp.record(
                        token_id=item.token_id,
                        appended=item.count,
                        token_slots_loaded=loaded_after,
                        total_slots_loaded=self.data.slots_loaded,
                    ),
                    tag="token_slots_appended",
                )

        @sp.entrypoint
        def replace_tokens_v35(self, tokens):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(tokens, sp.list[TokenCommitmentBatchItemType])
            _ = self._only_admin()
            assert not self.data.sale_permanently_closed, "SALE_PERMANENTLY_CLOSED"
            assert not self.data.setup_finalized, "SETUP_FINALIZED"
            assert not self.data.sale_activated, "SALE_ALREADY_ACTIVATED"
            assert sp.len(tokens) > 0, "EMPTY_TOKEN_BATCH"
            for token in tokens:
                assert token.token_id < self.data.token_count, "TOKEN_UNDEFINED"
                assert (
                    token.quantity == self.data.token_supply[token.token_id]
                ), "SUPPLY_IMMUTABLE"
                assert sp.len(token.metadata_commitment) == 32, "BAD_COMMITMENT"
                old_commitment = self.data.token_commitments[token.token_id]
                if token.metadata_commitment != old_commitment:
                    assert not (
                        token.metadata_commitment in self.data.commitment_owner
                    ), "DUPLICATE_COMMITMENT"
                    if old_commitment in self.data.commitment_owner:
                        del self.data.commitment_owner[old_commitment]
                    self.data.token_commitments[token.token_id] = (
                        token.metadata_commitment
                    )
                    self.data.commitment_owner[token.metadata_commitment] = (
                        token.token_id
                    )

        @sp.entrypoint
        def set_stages(self, stages):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(stages, sp.map[sp.nat, StageType])
            _ = self._only_admin()
            assert not self.data.sale_permanently_closed, "SALE_PERMANENTLY_CLOSED"
            assert not self.data.setup_finalized, "SETUP_FINALIZED"
            assert not self.data.sale_activated, "SALE_ALREADY_ACTIVATED"
            self.data.stages = stages

        @sp.entrypoint
        def set_allowlist(self, entries):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(
                entries,
                sp.list[
                    sp.record(stage=sp.nat, holder=sp.address, capacity=sp.nat)
                ],
            )
            _ = self._only_admin()
            assert not self.data.sale_permanently_closed, "SALE_PERMANENTLY_CLOSED"
            assert not self.data.setup_finalized, "SETUP_FINALIZED"
            assert not self.data.sale_activated, "SALE_ALREADY_ACTIVATED"
            for item in entries:
                self.data.allowlist[
                    sp.record(stage=item.stage, holder=item.holder)
                ] = item.capacity

        @sp.entrypoint
        def finalize_setup(self):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            _ = self._only_admin()
            assert not self.data.sale_permanently_closed, "SALE_PERMANENTLY_CLOSED"
            assert not self.data.setup_finalized, "SETUP_FINALIZED"
            assert not self.data.sale_activated, "SALE_ALREADY_ACTIVATED"
            assert self.data.token_count > 0, "EMPTY_INVENTORY"
            assert self.data.supply > 0, "EMPTY_INVENTORY"
            assert self.data.slots_loaded == self.data.supply, "SLOTS_INCOMPLETE"
            assert (
                self.data.next_slot_token_id == self.data.token_count
            ), "SLOTS_INCOMPLETE"
            assert sp.len(self.data.stages) > 0, "NO_STAGES"
            assert sp.len(self.data.entropy_commitment) == 32, "BAD_ENTROPY_HEAD"
            assert (
                self.data.entropy_length == self.data.supply
            ), "ENTROPY_LENGTH_MISMATCH"
            cfg = self.data.minter_royalty_config
            assert cfg.bps <= 10_000, "BAD_ROYALTY_BPS"
            assert cfg.mode <= 1, "BAD_ROYALTY_MODE"
            for stage_id in self.data.stages.keys():
                stage = self.data.stages[stage_id]
                if stage.price > sp.mutez(0):
                    assert (
                        stage.price >= self.data.fulfillment_subsidy
                    ), "PRICE_BELOW_SUBSIDY"
            self.data.setup_finalized = True
            sp.emit(
                sp.record(
                    token_count=self.data.token_count,
                    physical_supply=self.data.supply,
                    entropy_commitment=self.data.entropy_commitment,
                    entropy_length=self.data.entropy_length,
                ),
                tag="setup_finalized",
            )

        @sp.entrypoint
        def activate_sale(self):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            _ = self._only_admin()
            assert self.data.setup_finalized, "SETUP_NOT_FINALIZED"
            assert not self.data.sale_activated, "SALE_ALREADY_ACTIVATED"
            assert not self.data.sale_permanently_closed, "SALE_PERMANENTLY_CLOSED"
            assert self.data.claims_created == 0, "CLAIMS_ALREADY_EXIST"
            assert self.data.fulfillment_armed, "FULFILLMENT_NOT_ARMED"
            required_reserve = sp.split_tokens(
                self.data.fulfillment_subsidy, 5, 1
            )
            has_free_stage = False
            for stage_id in self.data.stages.keys():
                if self.data.stages[stage_id].price == sp.mutez(0):
                    has_free_stage = True
            if has_free_stage:
                free_supply_reserve = sp.split_tokens(
                    self.data.fulfillment_subsidy, self.data.supply, 1
                )
                if free_supply_reserve > required_reserve:
                    required_reserve = free_supply_reserve
            assert sp.balance >= required_reserve, "FULFILLMENT_RESERVE_UNDERFUNDED"
            self.data.activation_reserve_required = required_reserve
            self.data.sale_activated = True
            self.data.sale_active = True
            sp.emit(
                sp.record(
                    reserve_balance=sp.balance,
                    minimum=required_reserve,
                    full_free_supply_funded=has_free_stage,
                ),
                tag="sale_activated",
            )

        @sp.entrypoint
        def close_sale(self):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            _ = self._only_admin()
            assert not self.data.sale_permanently_closed, "SALE_PERMANENTLY_CLOSED"
            assert not self.data.final_sweep_complete, "LIFECYCLE_COMPLETE"
            self.data.sale_active = False
            self.data.sale_permanently_closed = True
            sp.emit(
                sp.record(
                    claims_created=self.data.claims_created,
                    claims_settled=self.data.claims_settled,
                    was_activated=self.data.sale_activated,
                    unsold_slots=sp.as_nat(
                        self.data.supply - self.data.claims_created
                    ),
                ),
                tag="sale_permanently_closed",
            )
            if self.data.claims_settled == self.data.claims_created:
                sweep = sp.balance
                self.data.final_sweep_amount = sweep
                self.data.final_sweep_complete = True
                if sweep > sp.mutez(0):
                    self.data.total_treasury_paid += sweep
                    sp.send(self.data.treasury, sweep)

        # ---- Purchase claims and atomic final mint ----

        @sp.entrypoint
        def purchase(self, amount):
            sp.cast(amount, sp.nat)
            assert amount > 0, "BAD_AMOUNT"
            assert self.data.setup_finalized, "SETUP_NOT_FINALIZED"
            assert self.data.sale_active, "SALE_CLOSED"
            assert not self.data.paused, "PAUSED"
            assert (
                self.data.claims_created + amount <= self.data.supply
            ), "SOLD_OUT"

            stage_id_opt = self._active_stage_id()
            assert stage_id_opt.is_some(), "NO_STAGE"
            stage_id = stage_id_opt.unwrap_some()
            stage = self.data.stages[stage_id]
            expected = sp.split_tokens(stage.price, amount, 1)
            assert sp.amount == expected, "BAD_PAYMENT"

            stage_key = sp.record(stage=stage_id, holder=sp.sender)
            already_stage_minted = self.data.stage_minted.get(
                stage_key, default=sp.nat(0)
            )
            if stage.max_per_wallet.is_some():
                assert (
                    already_stage_minted + amount
                    <= stage.max_per_wallet.unwrap_some()
                ), "WALLET_LIMIT"
            if stage.use_allowlist:
                capacity = self.data.allowlist.get(
                    stage_key, default=sp.nat(0)
                )
                assert (
                    already_stage_minted + amount <= capacity
                ), "ALLOWLIST_LIMIT"

            retained = sp.mutez(0)
            if stage.price > sp.mutez(0):
                retained = sp.split_tokens(
                    self.data.fulfillment_subsidy, amount, 1
                )
            treasury_payment = expected - retained
            outstanding_after = sp.as_nat(
                self.data.claims_created
                + amount
                - self.data.claims_settled
            )
            outstanding_liability = sp.split_tokens(
                self.data.fulfillment_subsidy, outstanding_after, 1
            )
            balance_after_treasury = sp.balance - treasury_payment
            assert (
                balance_after_treasury >= outstanding_liability
            ), "FULFILLMENT_RESERVE_UNDERFUNDED"

            for unit in sp.range(0, amount):
                claim_id = self.data.claims_created
                claim = sp.record(
                    buyer=sp.sender,
                    recipient=sp.sender,
                    unit=unit,
                    purchase_level=sp.level,
                    purchase_time=sp.now,
                    stage_id=stage_id,
                )
                self.data.claims[claim_id] = claim
                self.data.claims_created += 1
                sp.emit(
                    sp.record(
                        claim_id=claim_id,
                        buyer=sp.sender,
                        recipient=sp.sender,
                        unit=unit,
                        purchase_level=sp.level,
                    ),
                    tag="purchase_claim",
                )

            self.data.stage_minted[stage_key] = already_stage_minted + amount
            self.data.total_sales_received += expected
            self.data.total_subsidy_retained += retained
            if treasury_payment > sp.mutez(0):
                self.data.total_treasury_paid += treasury_payment
                sp.send(self.data.treasury, treasury_payment)
            if self.data.claims_created == self.data.supply:
                self.data.sale_active = False

        @sp.entrypoint
        def settle_claims_v35(self, items):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(items, sp.list[SettlementItemType])
            assert sp.sender == self.data.finalizer, "NOT_FINALIZER"
            assert self.data.setup_finalized, "SETUP_NOT_FINALIZED"
            assert sp.len(items) > 0, "EMPTY_SETTLEMENT"
            assert not self.data.final_sweep_complete, "LIFECYCLE_COMPLETE"

            for item in items:
                assert (
                    item.claim_id == self.data.next_claim_to_settle
                ), "CLAIM_OUT_OF_ORDER"
                assert item.claim_id < self.data.claims_created, "CLAIM_NOT_PURCHASED"
                assert not (
                    item.claim_id in self.data.claim_token
                ), "CLAIM_ALREADY_SETTLED"
                assert sp.len(item.entropy_preimage) == 32, "BAD_PREIMAGE_LENGTH"
                assert sp.len(item.metadata_nonce) == 32, "BAD_METADATA_NONCE"
                assert sp.len(item.metadata_uri) > 0, "EMPTY_METADATA_URI"

                claim = self.data.claims[item.claim_id]
                _ = self._assert_release_eligible(claim)

                next_link = sp.sha256(
                    sp.concat(
                        [
                            sp.bytes(
                                "0x6d616361726f6e692d7633352f686173682d636861696e2f7631"
                            ),
                            item.entropy_preimage,
                        ]
                    )
                )
                assert next_link == self.data.entropy_cursor, "BAD_ENTROPY_PREIMAGE"
                assert self.data.entropy_remaining > 0, "ENTROPY_EXHAUSTED"

                allocation_input = (
                    sp.bytes(
                        "0x6d616361726f6e692d7633352f616c6c6f636174696f6e2f7631"
                    ),
                    (
                        sp.chain_id,
                        (
                            sp.self_address,
                            (
                                self.data.creator,
                                (
                                    item.claim_id,
                                    (
                                        claim.buyer,
                                        (
                                            claim.recipient,
                                            (
                                                claim.unit,
                                                (
                                                    claim.purchase_level,
                                                    item.entropy_preimage,
                                                ),
                                            ),
                                        ),
                                    ),
                                ),
                            ),
                        ),
                    ),
                )
                allocation_digest = sp.sha256(sp.pack(allocation_input))
                remaining_slots = sp.as_nat(
                    self.data.supply - self.data.claims_settled
                )
                draw = sp.mod(sp.to_nat(allocation_digest), remaining_slots)
                last = sp.as_nat(remaining_slots - 1)
                token_id = self.data.slots[draw]
                if draw != last:
                    self.data.slots[draw] = self.data.slots[last]
                if last in self.data.slots:
                    del self.data.slots[last]

                metadata_input = (
                    sp.bytes(
                        "0x6d616361726f6e692d7633352f6d657461646174612f7631"
                    ),
                    (
                        token_id,
                        (item.metadata_uri, item.metadata_nonce),
                    ),
                )
                metadata_commitment = sp.sha256(sp.pack(metadata_input))
                assert (
                    metadata_commitment == self.data.token_commitments[token_id]
                ), "BAD_METADATA_REVEAL"

                if item.metadata_uri in self.data.metadata_uri_owner:
                    assert (
                        self.data.metadata_uri_owner[item.metadata_uri] == token_id
                    ), "DUPLICATE_METADATA_URI"
                else:
                    self.data.metadata_uri_owner[item.metadata_uri] = token_id

                minted_before = self.data.token_minted.get(
                    token_id, default=sp.nat(0)
                )
                if minted_before == 0:
                    self.data.token_metadata[token_id] = sp.record(
                        token_id=token_id,
                        token_info={"": item.metadata_uri},
                    )
                else:
                    assert (
                        self.data.token_metadata[token_id].token_info[""]
                        == item.metadata_uri
                    ), "METADATA_CHANGED"

                _ = self._record_minter_royalty(
                    sp.record(token_id=token_id, minter=claim.buyer)
                )
                ledger_key = sp.record(
                    owner=claim.recipient, token_id=token_id
                )
                self.data.ledger[ledger_key] = (
                    self.data.ledger.get(ledger_key, default=sp.nat(0)) + 1
                )
                self.data.token_minted[token_id] = minted_before + 1
                self.data.claim_token[item.claim_id] = token_id
                self.data.claim_allocation_digest[item.claim_id] = allocation_digest
                self.data.entropy_cursor = item.entropy_preimage
                self.data.entropy_remaining = sp.as_nat(
                    self.data.entropy_remaining - 1
                )
                self.data.claims_settled += 1
                self.data.next_claim_to_settle += 1
                sp.emit(
                    sp.record(
                        claim_id=item.claim_id,
                        token_id=token_id,
                        recipient=claim.recipient,
                        allocation_digest=allocation_digest,
                    ),
                    tag="claim_settled",
                )

            reimbursement = sp.split_tokens(
                self.data.fulfillment_subsidy, sp.len(items), 1
            )
            assert sp.balance >= reimbursement, "FULFILLMENT_RESERVE_UNDERFUNDED"
            if reimbursement > sp.mutez(0):
                self.data.total_reimbursements += reimbursement
                sp.send(sp.sender, reimbursement)

            # The initial reserve and any unused subsidy remain available until
            # every physical slot sold and the final sold claim minted. Only
            # then does this same successful settlement sweep the remainder.
            if self.data.claims_settled == self.data.claims_created and (
                self.data.claims_created == self.data.supply
                or self.data.sale_permanently_closed
            ):
                if self.data.claims_created == self.data.supply:
                    assert self.data.entropy_remaining == 0, "ENTROPY_NOT_EXHAUSTED"
                sweep = sp.balance - reimbursement
                self.data.final_sweep_amount = sweep
                self.data.final_sweep_complete = True
                if sweep > sp.mutez(0):
                    self.data.total_treasury_paid += sweep
                    sp.send(self.data.treasury, sweep)

        # ---- Views ----

        @sp.onchain_view
        def get_balance(self, params):
            sp.cast(params, BalanceOfRequestType)
            assert params.token_id < self.data.token_count, "FA2_TOKEN_UNDEFINED"
            return self.data.ledger.get(
                sp.record(owner=params.owner, token_id=params.token_id),
                default=sp.nat(0),
            )

        @sp.onchain_view
        def total_supply(self, token_id):
            sp.cast(token_id, sp.nat)
            assert token_id < self.data.token_count, "FA2_TOKEN_UNDEFINED"
            return self.data.token_minted.get(token_id, default=sp.nat(0))

        @sp.onchain_view
        def get_token_supply(self, token_id):
            sp.cast(token_id, sp.nat)
            assert token_id < self.data.token_count, "FA2_TOKEN_UNDEFINED"
            return self.data.token_supply[token_id]

        @sp.onchain_view
        def get_token_minted(self, token_id):
            sp.cast(token_id, sp.nat)
            assert token_id < self.data.token_count, "FA2_TOKEN_UNDEFINED"
            return self.data.token_minted.get(token_id, default=sp.nat(0))

        @sp.onchain_view
        def get_claim(self, claim_id):
            sp.cast(claim_id, sp.nat)
            assert claim_id < self.data.claims_created, "CLAIM_NOT_PURCHASED"
            return self.data.claims[claim_id]

        @sp.onchain_view
        def get_claim_token(self, claim_id):
            sp.cast(claim_id, sp.nat)
            assert claim_id < self.data.claims_created, "CLAIM_NOT_PURCHASED"
            return self.data.claim_token.get_opt(claim_id)

        @sp.onchain_view
        def is_operator(self, operator_key):
            sp.cast(operator_key, OperatorKeyType)
            return operator_key in self.data.operators

        @sp.onchain_view
        def get_minter_pool_count(self, token_id):
            sp.cast(token_id, sp.nat)
            assert token_id < self.data.token_count, "FA2_TOKEN_UNDEFINED"
            return self.data.minter_pool_count.get(token_id, default=sp.nat(0))

        @sp.onchain_view
        def get_first_minter(self, token_id):
            sp.cast(token_id, sp.nat)
            assert token_id < self.data.token_count, "FA2_TOKEN_UNDEFINED"
            return self.data.first_minter.get_opt(token_id)

    # Test-only oracle used to publish byte-for-byte fixtures for companion
    # implementations. It deliberately repeats the production PACK trees and
    # swap/pop draw so a fixture can only be emitted after SmartPy evaluates
    # the same Michelson types and operations used by settlement.
    class MacaroniV35HashFixture(sp.Contract):
        def __init__(
            self,
            chain_id,
            contract_address,
            creator,
            buyer,
            recipient,
            claim_id,
            unit,
            purchase_level,
            entropy_preimage,
            token_id,
            metadata_uri,
            metadata_nonce,
        ):
            allocation_input = (
                sp.bytes(
                    "0x6d616361726f6e692d7633352f616c6c6f636174696f6e2f7631"
                ),
                (
                    sp.cast(chain_id, sp.chain_id),
                    (
                        sp.cast(contract_address, sp.address),
                        (
                            sp.cast(creator, sp.address),
                            (
                                sp.cast(claim_id, sp.nat),
                                (
                                    sp.cast(buyer, sp.address),
                                    (
                                        sp.cast(recipient, sp.address),
                                        (
                                            sp.cast(unit, sp.nat),
                                            (
                                                sp.cast(purchase_level, sp.nat),
                                                sp.cast(entropy_preimage, sp.bytes),
                                            ),
                                        ),
                                    ),
                                ),
                            ),
                        ),
                    ),
                ),
            )
            allocation_pack = sp.pack(allocation_input)
            allocation_hash = sp.sha256(allocation_pack)
            metadata_input = (
                sp.bytes(
                    "0x6d616361726f6e692d7633352f6d657461646174612f7631"
                ),
                (
                    sp.cast(token_id, sp.nat),
                    (
                        sp.cast(metadata_uri, sp.bytes),
                        sp.cast(metadata_nonce, sp.bytes),
                    ),
                ),
            )
            metadata_pack = sp.pack(metadata_input)
            slot_pool = sp.cast(
                {0: 4, 1: 9, 2: 12, 3: 12, 4: 15, 5: 21, 6: 30},
                sp.map[sp.nat, sp.nat],
            )
            remaining_slots = sp.nat(7)
            draw = sp.mod(sp.to_nat(allocation_hash), remaining_slots)
            last = sp.as_nat(remaining_slots - 1)
            selected_token_id = slot_pool[draw]
            replacement_token_id = slot_pool[last]
            if draw != last:
                slot_pool[draw] = replacement_token_id
            del slot_pool[last]

            self.data.allocation_pack = allocation_pack
            self.data.allocation_hash = allocation_hash
            self.data.metadata_pack = metadata_pack
            self.data.metadata_hash = sp.sha256(metadata_pack)
            self.data.chain_step = sp.sha256(
                sp.bytes("0x6d616361726f6e692d7633352f686173682d636861696e2f7631")
                + sp.cast(entropy_preimage, sp.bytes)
            )
            self.data.remaining_slots = remaining_slots
            self.data.draw = draw
            self.data.last = last
            self.data.selected_token_id = selected_token_id
            self.data.replacement_token_id = replacement_token_id
            self.data.remaining_slot_pool = slot_pool

        @sp.entrypoint
        def noop(self):
            pass


def bytes_of_string(value):
    return sp.bytes("0x" + value.encode("utf-8").hex())


def bytes_from_python(value):
    return sp.bytes("0x" + value.hex())


def build_reverse_hash_chain(length, seed):
    current = hashlib.sha256(seed).digest()
    chain = [current]
    for _ in range(length):
        current = hashlib.sha256(CHAIN_DOMAIN + current).digest()
        chain.append(current)
    return bytes_from_python(chain[-1]), [
        bytes_from_python(value) for value in reversed(chain[:-1])
    ]


def metadata_commitment(token_id, metadata_uri, nonce):
    return sp.sha256(
        sp.pack(
            (
                bytes_of_string(METADATA_DOMAIN_TEXT),
                (token_id, (metadata_uri, nonce)),
            )
        )
    )


def default_stage(price, use_allowlist=False, max_per_wallet=None):
    return sp.record(
        start=sp.timestamp(0),
        price=price,
        use_allowlist=use_allowlist,
        max_per_wallet=sp.cast(max_per_wallet, sp.option[sp.nat]),
    )


def default_royalties(updater, enabled=False, mode=0):
    return sp.record(
        enabled=enabled,
        bps=sp.nat(500 if enabled else 0),
        mode=sp.nat(mode),
        updater=updater,
    )


def make_contract(
    admin,
    finalizer,
    treasury,
    release_policy,
    entropy_head,
    entropy_length,
    subsidy,
    royalty_config,
    metadata_uri="ipfs://QmMacaroniV35ContractMetadata",
):
    return main.MacaroniBlindMintFA2V35(
        creator=admin,
        administrator=admin,
        finalizer=finalizer,
        treasury=treasury,
        metadata=sp.big_map({"": bytes_of_string(metadata_uri)}),
        release_policy=release_policy,
        entropy_commitment=entropy_head,
        entropy_length=sp.nat(entropy_length),
        fulfillment_subsidy=subsidy,
        minter_royalty_config=royalty_config,
    )


def macaroni_v35_template_contract():
    admin = sp.test_account("macaroni_v35_template_admin")
    finalizer = sp.test_account("macaroni_v35_template_finalizer")
    head, _ = build_reverse_hash_chain(1, b"macaroni-v35-template-seed")
    return make_contract(
        admin.address,
        finalizer.address,
        admin.address,
        sp.variant.immediate(()),
        head,
        1,
        sp.mutez(0),
        default_royalties(admin.address),
    )


@sp.add_test()
def deploy_macaroni_blind_mint_v35_template():
    scenario = sp.test_scenario("deploy_macaroni_blind_mint_v35_template", main)
    scenario += macaroni_v35_template_contract()


@sp.add_test()
def deploy_macaroni_v35_hash_fixture():
    scenario = sp.test_scenario("macaroni_v35_hash_fixture", main)
    fixture = main.MacaroniV35HashFixture(
        chain_id=sp.chain_id_cst("0xaf1864d9feee0e1f"),
        contract_address=sp.address("KT1XvNYseNDJJ6Kw27qhSEDF8ys8JhDopzfG"),
        creator=sp.address("tz1fextP23D6Ph2zeGTP8EwkP5Y8TufeFCHA"),
        buyer=sp.address("tz1Ke2h7sDdakHJQh8WX4Z372du1KChsksyU"),
        recipient=sp.address("tz1M9CMEtsXm3QxA7FmMU2Qh7xzsuGXVbcDr"),
        claim_id=sp.nat(7),
        unit=sp.nat(2),
        purchase_level=sp.nat(123_456),
        entropy_preimage=sp.bytes("0x" + "11" * 32),
        token_id=sp.nat(12),
        metadata_uri=bytes_of_string(
            "ipfs://QmMacaroniV35CrossLanguageFixture"
        ),
        metadata_nonce=sp.bytes("0x" + "22" * 32),
    )
    scenario += fixture
    scenario.verify(fixture.data.draw < fixture.data.remaining_slots)
    scenario.verify(fixture.data.last == 6)
    scenario.verify(sp.len(fixture.data.remaining_slot_pool) == 6)
    scenario.verify(~fixture.data.remaining_slot_pool.contains(6))


@sp.add_test()
def setup_reserve_accounting_and_final_sweep():
    scenario = sp.test_scenario(
        "V35 setup, five-operation reserve, accounting, and final sweep", main
    )
    admin = sp.test_account("v35_setup_admin")
    finalizer = sp.test_account("v35_setup_finalizer")
    treasury = sp.test_account("v35_setup_treasury")
    alice = sp.test_account("v35_setup_alice")
    head, preimages = build_reverse_hash_chain(2, b"v35-setup-chain")
    uri = bytes_of_string("ipfs://QmV35SetupToken")
    nonce = sp.bytes("0x" + "11" * 32)
    commitment = metadata_commitment(0, uri, nonce)

    contract = make_contract(
        admin.address,
        finalizer.address,
        treasury.address,
        sp.variant.immediate(()),
        head,
        2,
        sp.mutez(1_000),
        default_royalties(admin.address, enabled=True, mode=1),
    )
    scenario += contract

    contract.activate_sale(
        _sender=admin,
        _valid=False,
        _exception="SETUP_NOT_FINALIZED",
    )
    contract.purchase(
        1,
        _sender=alice,
        _amount=sp.tez(1),
        _valid=False,
        _exception="SETUP_NOT_FINALIZED",
    )
    contract.arm_fulfillment(
        _sender=finalizer,
        _valid=False,
        _exception="SETUP_NOT_FINALIZED",
    )
    contract.add_tokens_v35(
        [sp.record(token_id=0, metadata_commitment=commitment, quantity=2)],
        _sender=admin,
    )
    contract.append_token_slots_v35(
        [sp.record(token_id=0, count=2)], _sender=admin
    )
    contract.set_stages({0: default_stage(sp.tez(1))}, _sender=admin)
    contract.finalize_setup(_sender=admin)
    contract.activate_sale(
        _sender=admin,
        _valid=False,
        _exception="FULFILLMENT_NOT_ARMED",
    )
    contract.arm_fulfillment(
        _sender=alice,
        _valid=False,
        _exception="NOT_FINALIZER",
    )
    contract.arm_fulfillment(_sender=finalizer)
    contract.arm_fulfillment(
        _sender=finalizer,
        _valid=False,
        _exception="FULFILLMENT_ALREADY_ARMED",
    )
    contract.add_tokens_v35(
        [sp.record(token_id=1, metadata_commitment=commitment, quantity=1)],
        _sender=admin,
        _valid=False,
        _exception="SETUP_FINALIZED",
    )
    contract.append_token_slots_v35(
        [sp.record(token_id=0, count=1)],
        _sender=admin,
        _valid=False,
        _exception="SETUP_FINALIZED",
    )
    contract.replace_tokens_v35(
        [sp.record(token_id=0, metadata_commitment=commitment, quantity=2)],
        _sender=admin,
        _valid=False,
        _exception="SETUP_FINALIZED",
    )
    contract.set_stages(
        {0: default_stage(sp.tez(1))},
        _sender=admin,
        _valid=False,
        _exception="SETUP_FINALIZED",
    )
    contract.fund_fulfillment_reserve(_sender=admin, _amount=sp.mutez(4_999))
    contract.activate_sale(
        _sender=admin,
        _valid=False,
        _exception="FULFILLMENT_RESERVE_UNDERFUNDED",
    )
    contract.fund_fulfillment_reserve(_sender=admin, _amount=sp.mutez(1))
    contract.activate_sale(_sender=admin)
    contract.purchase(
        2,
        _sender=alice,
        _amount=sp.tez(2),
        _now=sp.timestamp(10),
        _level=100,
    )
    scenario.verify(contract.data.claims_created == 2)
    scenario.verify(contract.data.total_sales_received == sp.tez(2))
    scenario.verify(contract.data.total_subsidy_retained == sp.mutez(2_000))
    scenario.verify(contract.data.total_treasury_paid == sp.mutez(1_998_000))
    scenario.verify(contract.balance == sp.mutez(7_000))
    scenario.verify(~contract.data.final_sweep_complete)

    contract.settle_claims_v35(
        [
            sp.record(
                claim_id=0,
                entropy_preimage=preimages[0],
                metadata_uri=uri,
                metadata_nonce=nonce,
            )
        ],
        _sender=finalizer,
        _now=sp.timestamp(11),
    )
    scenario.verify(contract.data.claims_settled == 1)
    scenario.verify(contract.data.total_reimbursements == sp.mutez(1_000))
    scenario.verify(contract.balance == sp.mutez(6_000))
    scenario.verify(~contract.data.final_sweep_complete)

    contract.settle_claims_v35(
        [
            sp.record(
                claim_id=1,
                entropy_preimage=preimages[1],
                metadata_uri=uri,
                metadata_nonce=nonce,
            )
        ],
        _sender=finalizer,
        _now=sp.timestamp(12),
    )
    scenario.verify(contract.data.claims_settled == 2)
    scenario.verify(contract.data.total_reimbursements == sp.mutez(2_000))
    scenario.verify(contract.data.final_sweep_amount == sp.mutez(5_000))
    scenario.verify(contract.data.total_treasury_paid == sp.mutez(2_003_000))
    scenario.verify(contract.data.final_sweep_complete)
    scenario.verify(contract.balance == sp.mutez(0))
    scenario.verify(contract.data.token_minted[0] == 2)
    scenario.verify(contract.data.ledger[sp.record(owner=alice.address, token_id=0)] == 2)
    scenario.verify(contract.data.minter_pool_count[0] == 1)


@sp.add_test()
def fifo_entropy_metadata_and_duplicate_guards():
    scenario = sp.test_scenario(
        "V35 FIFO, non-reroll, metadata, and duplicate guards", main
    )
    admin = sp.test_account("v35_fifo_admin")
    finalizer = sp.test_account("v35_fifo_finalizer")
    attacker = sp.test_account("v35_fifo_attacker")
    buyer = sp.test_account("v35_fifo_buyer")
    head, preimages = build_reverse_hash_chain(2, b"v35-fifo-chain")
    uri = bytes_of_string("ipfs://QmV35FifoToken")
    nonce = sp.bytes("0x" + "22" * 32)
    commitment = metadata_commitment(0, uri, nonce)
    contract = make_contract(
        admin.address,
        finalizer.address,
        admin.address,
        sp.variant.immediate(()),
        head,
        2,
        sp.mutez(0),
        default_royalties(admin.address),
    )
    scenario += contract
    contract.add_tokens_v35(
        [sp.record(token_id=0, metadata_commitment=commitment, quantity=2)],
        _sender=admin,
    )
    contract.append_token_slots_v35(
        [sp.record(token_id=0, count=2)], _sender=admin
    )
    contract.set_stages({0: default_stage(sp.mutez(0))}, _sender=admin)
    contract.finalize_setup(_sender=admin)
    contract.arm_fulfillment(_sender=finalizer)
    contract.activate_sale(_sender=admin)
    contract.purchase(
        2,
        _sender=buyer,
        _amount=sp.mutez(0),
        _now=sp.timestamp(5),
        _level=55,
    )

    first = sp.record(
        claim_id=0,
        entropy_preimage=preimages[0],
        metadata_uri=uri,
        metadata_nonce=nonce,
    )
    second = sp.record(
        claim_id=1,
        entropy_preimage=preimages[1],
        metadata_uri=uri,
        metadata_nonce=nonce,
    )
    contract.settle_claims_v35(
        [second, first],
        _sender=finalizer,
        _valid=False,
        _exception="CLAIM_OUT_OF_ORDER",
    )
    contract.settle_claims_v35(
        [first],
        _sender=attacker,
        _valid=False,
        _exception="NOT_FINALIZER",
    )
    contract.settle_claims_v35(
        [
            sp.record(
                claim_id=0,
                entropy_preimage=sp.bytes("0x" + "ff" * 32),
                metadata_uri=uri,
                metadata_nonce=nonce,
            )
        ],
        _sender=finalizer,
        _valid=False,
        _exception="BAD_ENTROPY_PREIMAGE",
    )
    contract.settle_claims_v35(
        [
            sp.record(
                claim_id=0,
                entropy_preimage=preimages[0],
                metadata_uri=bytes_of_string("ipfs://QmWrongV35FifoToken"),
                metadata_nonce=nonce,
            )
        ],
        _sender=finalizer,
        _valid=False,
        _exception="BAD_METADATA_REVEAL",
    )
    contract.settle_claims_v35(
        [
            sp.record(
                claim_id=0,
                entropy_preimage=preimages[0],
                metadata_uri=uri,
                metadata_nonce=sp.bytes("0x" + "33" * 32),
            )
        ],
        _sender=finalizer,
        _valid=False,
        _exception="BAD_METADATA_REVEAL",
    )
    cursor_before_rotation = contract.data.entropy_cursor
    contract.transfer_finalizer(attacker.address, _sender=admin)
    contract.accept_finalizer(
        _sender=finalizer,
        _valid=False,
        _exception="NOT_PENDING_FINALIZER",
    )
    scenario.verify(contract.data.finalizer == finalizer.address)
    scenario.verify(contract.data.next_claim_to_settle == 0)
    contract.accept_finalizer(_sender=attacker)
    contract.settle_claims_v35(
        [first],
        _sender=finalizer,
        _valid=False,
        _exception="NOT_FINALIZER",
    )
    scenario.verify(contract.data.entropy_cursor == cursor_before_rotation)
    scenario.verify(contract.data.next_claim_to_settle == 0)
    contract.settle_claims_v35([first], _sender=attacker, _now=sp.timestamp(6))
    first_digest = contract.data.claim_allocation_digest[0]
    contract.settle_claims_v35(
        [first],
        _sender=attacker,
        _valid=False,
        _exception="CLAIM_OUT_OF_ORDER",
    )
    contract.settle_claims_v35([second], _sender=attacker, _now=sp.timestamp(99))
    scenario.verify(contract.data.claims_settled == 2)
    scenario.verify(contract.data.claim_allocation_digest[0] == first_digest)
    scenario.verify(contract.data.claim_token[0] == 0)
    scenario.verify(contract.data.claim_token[1] == 0)
    scenario.verify(contract.data.token_metadata[0].token_info[""] == uri)
    contract.transfer_finalizer(
        finalizer.address,
        _sender=admin,
        _valid=False,
        _exception="LIFECYCLE_COMPLETE",
    )

    duplicate_head, duplicate_preimages = build_reverse_hash_chain(
        2, b"v35-duplicate-uri-chain"
    )
    duplicate_uri = bytes_of_string("ipfs://QmV35DuplicateAcrossRows")
    duplicate_nonce = sp.bytes("0x" + "44" * 32)
    duplicate = make_contract(
        admin.address,
        finalizer.address,
        admin.address,
        sp.variant.immediate(()),
        duplicate_head,
        2,
        sp.mutez(0),
        default_royalties(admin.address),
    )
    scenario += duplicate
    duplicate.add_tokens_v35(
        [
            sp.record(
                token_id=0,
                metadata_commitment=metadata_commitment(
                    0, duplicate_uri, duplicate_nonce
                ),
                quantity=1,
            ),
            sp.record(
                token_id=1,
                metadata_commitment=metadata_commitment(
                    1, duplicate_uri, duplicate_nonce
                ),
                quantity=1,
            ),
        ],
        _sender=admin,
    )
    duplicate.append_token_slots_v35(
        [sp.record(token_id=0, count=1), sp.record(token_id=1, count=1)],
        _sender=admin,
    )
    duplicate.set_stages({0: default_stage(sp.mutez(0))}, _sender=admin)
    duplicate.finalize_setup(_sender=admin)
    duplicate.arm_fulfillment(_sender=finalizer)
    duplicate.activate_sale(_sender=admin)
    duplicate.purchase(2, _sender=buyer, _amount=sp.mutez(0), _level=77)
    duplicate.settle_claims_v35(
        [
            sp.record(
                claim_id=0,
                entropy_preimage=duplicate_preimages[0],
                metadata_uri=duplicate_uri,
                metadata_nonce=duplicate_nonce,
            )
        ],
        _sender=finalizer,
    )
    duplicate.settle_claims_v35(
        [
            sp.record(
                claim_id=1,
                entropy_preimage=duplicate_preimages[1],
                metadata_uri=duplicate_uri,
                metadata_nonce=duplicate_nonce,
            )
        ],
        _sender=finalizer,
        _valid=False,
        _exception="DUPLICATE_METADATA_URI",
    )


@sp.add_test()
def immutable_release_policies():
    scenario = sp.test_scenario("V35 immutable release policies", main)
    admin = sp.test_account("v35_release_admin")
    finalizer = sp.test_account("v35_release_finalizer")
    buyer = sp.test_account("v35_release_buyer")
    nonce = sp.bytes("0x" + "55" * 32)

    rolling_head, rolling_preimages = build_reverse_hash_chain(
        1, b"v35-rolling-chain"
    )
    rolling_uri = bytes_of_string("ipfs://QmV35Rolling")
    rolling = make_contract(
        admin.address,
        finalizer.address,
        admin.address,
        sp.variant.rolling_delay(60),
        rolling_head,
        1,
        sp.mutez(0),
        default_royalties(admin.address),
    )
    scenario += rolling
    rolling.add_tokens_v35(
        [
            sp.record(
                token_id=0,
                metadata_commitment=metadata_commitment(
                    0, rolling_uri, nonce
                ),
                quantity=1,
            )
        ],
        _sender=admin,
    )
    rolling.append_token_slots_v35(
        [sp.record(token_id=0, count=1)], _sender=admin
    )
    rolling.set_stages({0: default_stage(sp.mutez(0))}, _sender=admin)
    rolling.finalize_setup(_sender=admin)
    rolling.arm_fulfillment(_sender=finalizer)
    rolling.activate_sale(_sender=admin)
    rolling.purchase(1, _sender=buyer, _amount=sp.mutez(0), _now=sp.timestamp(100))
    rolling_item = sp.record(
        claim_id=0,
        entropy_preimage=rolling_preimages[0],
        metadata_uri=rolling_uri,
        metadata_nonce=nonce,
    )
    rolling.settle_claims_v35(
        [rolling_item],
        _sender=finalizer,
        _now=sp.timestamp(159),
        _valid=False,
        _exception="RELEASE_NOT_ELIGIBLE",
    )
    rolling.settle_claims_v35(
        [rolling_item], _sender=finalizer, _now=sp.timestamp(160)
    )

    scheduled_head, scheduled_preimages = build_reverse_hash_chain(
        1, b"v35-scheduled-chain"
    )
    scheduled_uri = bytes_of_string("ipfs://QmV35Scheduled")
    scheduled = make_contract(
        admin.address,
        finalizer.address,
        admin.address,
        sp.variant.scheduled(sp.timestamp(500)),
        scheduled_head,
        1,
        sp.mutez(0),
        default_royalties(admin.address),
    )
    scenario += scheduled
    scheduled.add_tokens_v35(
        [
            sp.record(
                token_id=0,
                metadata_commitment=metadata_commitment(
                    0, scheduled_uri, nonce
                ),
                quantity=1,
            )
        ],
        _sender=admin,
    )
    scheduled.append_token_slots_v35(
        [sp.record(token_id=0, count=1)], _sender=admin
    )
    scheduled.set_stages({0: default_stage(sp.mutez(0))}, _sender=admin)
    scheduled.finalize_setup(_sender=admin)
    scheduled.arm_fulfillment(_sender=finalizer)
    scheduled.activate_sale(_sender=admin)
    scheduled.purchase(1, _sender=buyer, _amount=sp.mutez(0), _now=sp.timestamp(10))
    scheduled_item = sp.record(
        claim_id=0,
        entropy_preimage=scheduled_preimages[0],
        metadata_uri=scheduled_uri,
        metadata_nonce=nonce,
    )
    scheduled.settle_claims_v35(
        [scheduled_item],
        _sender=finalizer,
        _now=sp.timestamp(499),
        _valid=False,
        _exception="RELEASE_NOT_ELIGIBLE",
    )
    scheduled.settle_claims_v35(
        [scheduled_item], _sender=finalizer, _now=sp.timestamp(500)
    )

    sellout_head, sellout_preimages = build_reverse_hash_chain(
        2, b"v35-sellout-chain"
    )
    sellout_uri = bytes_of_string("ipfs://QmV35Sellout")
    sellout = make_contract(
        admin.address,
        finalizer.address,
        admin.address,
        sp.variant.sellout(()),
        sellout_head,
        2,
        sp.mutez(0),
        default_royalties(admin.address),
    )
    scenario += sellout
    sellout.add_tokens_v35(
        [
            sp.record(
                token_id=0,
                metadata_commitment=metadata_commitment(
                    0, sellout_uri, nonce
                ),
                quantity=2,
            )
        ],
        _sender=admin,
    )
    sellout.append_token_slots_v35(
        [sp.record(token_id=0, count=2)], _sender=admin
    )
    sellout.set_stages({0: default_stage(sp.mutez(0))}, _sender=admin)
    sellout.finalize_setup(_sender=admin)
    sellout.arm_fulfillment(_sender=finalizer)
    sellout.activate_sale(_sender=admin)
    sellout.purchase(1, _sender=buyer, _amount=sp.mutez(0))
    sellout_first = sp.record(
        claim_id=0,
        entropy_preimage=sellout_preimages[0],
        metadata_uri=sellout_uri,
        metadata_nonce=nonce,
    )
    sellout.settle_claims_v35(
        [sellout_first],
        _sender=finalizer,
        _valid=False,
        _exception="RELEASE_NOT_ELIGIBLE",
    )
    sellout.purchase(1, _sender=buyer, _amount=sp.mutez(0))
    sellout.settle_claims_v35(
        [
            sellout_first,
            sp.record(
                claim_id=1,
                entropy_preimage=sellout_preimages[1],
                metadata_uri=sellout_uri,
                metadata_nonce=nonce,
            ),
        ],
        _sender=finalizer,
    )
    scenario.verify(sellout.data.claims_settled == 2)


@sp.add_test()
def inventory_access_fa2_and_free_paths():
    scenario = sp.test_scenario(
        "V35 inventory exactness, access, FA2, and free funding", main
    )
    admin = sp.test_account("v35_misc_admin")
    finalizer = sp.test_account("v35_misc_finalizer")
    alice = sp.test_account("v35_misc_alice")
    bob = sp.test_account("v35_misc_bob")
    operator = sp.test_account("v35_misc_operator")
    nonce = sp.bytes("0x" + "66" * 32)
    uri = bytes_of_string("ipfs://QmV35Misc")

    mismatch_head, _ = build_reverse_hash_chain(1, b"v35-mismatch-chain")
    mismatch = make_contract(
        admin.address,
        finalizer.address,
        admin.address,
        sp.variant.immediate(()),
        mismatch_head,
        1,
        sp.mutez(0),
        default_royalties(admin.address),
    )
    scenario += mismatch
    mismatch.add_tokens_v35(
        [
            sp.record(
                token_id=0,
                metadata_commitment=metadata_commitment(0, uri, nonce),
                quantity=2,
            )
        ],
        _sender=admin,
    )
    mismatch.append_token_slots_v35(
        [sp.record(token_id=0, count=2)], _sender=admin
    )
    mismatch.set_stages({0: default_stage(sp.mutez(0))}, _sender=admin)
    mismatch.finalize_setup(
        _sender=admin,
        _valid=False,
        _exception="ENTROPY_LENGTH_MISMATCH",
    )

    head, preimages = build_reverse_hash_chain(1, b"v35-access-chain")
    contract = make_contract(
        admin.address,
        finalizer.address,
        admin.address,
        sp.variant.immediate(()),
        head,
        1,
        sp.mutez(1_000),
        default_royalties(admin.address, enabled=True, mode=0),
    )
    contract.set_initial_balance(sp.mutez(5_000))
    scenario += contract
    contract.add_tokens_v35(
        [
            sp.record(
                token_id=0,
                metadata_commitment=metadata_commitment(0, uri, nonce),
                quantity=1,
            )
        ],
        _sender=admin,
    )
    contract.append_token_slots_v35(
        [sp.record(token_id=0, count=1)], _sender=admin
    )
    contract.set_stages(
        {0: default_stage(sp.mutez(0), use_allowlist=True)}, _sender=admin
    )
    contract.set_allowlist(
        [sp.record(stage=0, holder=alice.address, capacity=1)],
        _sender=admin,
    )
    contract.finalize_setup(_sender=admin)
    contract.arm_fulfillment(_sender=finalizer)
    contract.activate_sale(_sender=admin)
    contract.purchase(
        1,
        _sender=bob,
        _amount=sp.mutez(0),
        _valid=False,
        _exception="ALLOWLIST_LIMIT",
    )
    contract.purchase(1, _sender=alice, _amount=sp.mutez(0), _level=90)
    contract.settle_claims_v35(
        [
            sp.record(
                claim_id=0,
                entropy_preimage=preimages[0],
                metadata_uri=uri,
                metadata_nonce=nonce,
            )
        ],
        _sender=finalizer,
    )
    scenario.verify(contract.data.first_minter[0] == alice.address)
    contract.transfer(
        [
            sp.record(
                from_=alice.address,
                txs=[sp.record(to_=bob.address, token_id=0, amount=1)],
            )
        ],
        _sender=alice,
    )
    contract.update_operators(
        [
            sp.variant.add_operator(
                sp.record(owner=bob.address, operator=operator.address, token_id=0)
            )
        ],
        _sender=bob,
    )
    contract.transfer(
        [
            sp.record(
                from_=bob.address,
                txs=[sp.record(to_=alice.address, token_id=0, amount=1)],
            )
        ],
        _sender=operator,
    )
    scenario.verify(
        contract.data.ledger[sp.record(owner=alice.address, token_id=0)] == 1
    )

    # A zero-price drop can use externally funded reimbursement. The contract
    # omits the zero treasury payment, then pays and sweeps only positive values.
    scenario.verify(contract.data.total_reimbursements == sp.mutez(1_000))
    scenario.verify(contract.data.final_sweep_amount == sp.mutez(4_000))
    scenario.verify(contract.balance == sp.mutez(0))

    # A zero-subsidy free profile emits no zero-value internal sends at all.
    zero_head, zero_preimages = build_reverse_hash_chain(1, b"v35-zero-chain")
    zero_uri = bytes_of_string("ipfs://QmV35Zero")
    zero = make_contract(
        admin.address,
        finalizer.address,
        admin.address,
        sp.variant.immediate(()),
        zero_head,
        1,
        sp.mutez(0),
        default_royalties(admin.address),
    )
    scenario += zero
    zero.add_tokens_v35(
        [
            sp.record(
                token_id=0,
                metadata_commitment=metadata_commitment(0, zero_uri, nonce),
                quantity=1,
            )
        ],
        _sender=admin,
    )
    zero.append_token_slots_v35(
        [sp.record(token_id=0, count=1)], _sender=admin
    )
    zero.set_stages({0: default_stage(sp.mutez(0))}, _sender=admin)
    zero.finalize_setup(_sender=admin)
    zero.arm_fulfillment(_sender=finalizer)
    zero.activate_sale(_sender=admin)
    zero.purchase(1, _sender=alice, _amount=sp.mutez(0))
    zero.settle_claims_v35(
        [
            sp.record(
                claim_id=0,
                entropy_preimage=zero_preimages[0],
                metadata_uri=zero_uri,
                metadata_nonce=nonce,
            )
        ],
        _sender=finalizer,
    )
    scenario.verify(zero.data.final_sweep_complete)
    scenario.verify(zero.data.total_reimbursements == sp.mutez(0))
    scenario.verify(zero.data.final_sweep_amount == sp.mutez(0))
    scenario.verify(zero.balance == sp.mutez(0))


@sp.add_test()
def free_supply_reserve_covers_every_claim():
    scenario = sp.test_scenario(
        "V35 free and mixed-price stages reserve the full physical supply", main
    )
    admin = sp.test_account("v35_free_reserve_admin")
    finalizer = sp.test_account("v35_free_reserve_finalizer")
    buyer = sp.test_account("v35_free_reserve_buyer")
    head, preimages = build_reverse_hash_chain(6, b"v35-free-reserve-chain")
    uri = bytes_of_string("ipfs://QmV35FreeReserve")
    nonce = sp.bytes("0x" + "55" * 32)
    contract = make_contract(
        admin.address,
        finalizer.address,
        admin.address,
        sp.variant.immediate(()),
        head,
        6,
        sp.mutez(1_000),
        default_royalties(admin.address),
    )
    contract.set_initial_balance(sp.mutez(5_000))
    scenario += contract
    contract.add_tokens_v35(
        [
            sp.record(
                token_id=0,
                metadata_commitment=metadata_commitment(0, uri, nonce),
                quantity=6,
            )
        ],
        _sender=admin,
    )
    contract.append_token_slots_v35(
        [sp.record(token_id=0, count=6)], _sender=admin
    )
    contract.set_stages(
        {0: default_stage(sp.mutez(0))},
        _sender=admin,
    )
    contract.finalize_setup(_sender=admin)
    contract.arm_fulfillment(_sender=finalizer)
    contract.activate_sale(
        _sender=admin,
        _valid=False,
        _exception="FULFILLMENT_RESERVE_UNDERFUNDED",
    )
    contract.fund_fulfillment_reserve(_sender=admin, _amount=sp.mutez(1_000))
    contract.activate_sale(_sender=admin)
    scenario.verify(contract.data.activation_reserve_required == sp.mutez(6_000))
    contract.purchase(6, _sender=buyer, _amount=sp.mutez(0), _level=600)
    contract.settle_claims_v35(
        [
            sp.record(
                claim_id=claim_id,
                entropy_preimage=preimages[claim_id],
                metadata_uri=uri,
                metadata_nonce=nonce,
            )
            for claim_id in range(6)
        ],
        _sender=finalizer,
    )
    scenario.verify(contract.data.claims_settled == 6)
    scenario.verify(contract.data.total_reimbursements == sp.mutez(6_000))
    scenario.verify(contract.data.final_sweep_complete)
    scenario.verify(contract.balance == sp.mutez(0))


@sp.add_test()
def permanent_close_preserves_pending_claims_before_sweep():
    scenario = sp.test_scenario(
        "V35 permanent close stops sales but settles every existing claim", main
    )
    admin = sp.test_account("v35_close_admin")
    finalizer = sp.test_account("v35_close_finalizer")
    buyer = sp.test_account("v35_close_buyer")
    attacker = sp.test_account("v35_close_attacker")
    head, preimages = build_reverse_hash_chain(3, b"v35-close-chain")
    uri = bytes_of_string("ipfs://QmV35Close")
    nonce = sp.bytes("0x" + "66" * 32)
    contract = make_contract(
        admin.address,
        finalizer.address,
        admin.address,
        sp.variant.sellout(()),
        head,
        3,
        sp.mutez(1_000),
        default_royalties(admin.address),
    )
    contract.set_initial_balance(sp.mutez(5_000))
    scenario += contract
    contract.add_tokens_v35(
        [
            sp.record(
                token_id=0,
                metadata_commitment=metadata_commitment(0, uri, nonce),
                quantity=3,
            )
        ],
        _sender=admin,
    )
    contract.append_token_slots_v35(
        [sp.record(token_id=0, count=3)], _sender=admin
    )
    contract.set_stages({0: default_stage(sp.tez(1))}, _sender=admin)
    contract.finalize_setup(_sender=admin)
    contract.arm_fulfillment(_sender=finalizer)
    contract.activate_sale(_sender=admin)
    contract.set_pause(True, _sender=admin)
    scenario.verify(~contract.data.final_sweep_complete)
    contract.set_pause(False, _sender=admin)
    contract.purchase(1, _sender=buyer, _amount=sp.tez(1), _level=700)
    contract.close_sale(
        _sender=attacker,
        _valid=False,
        _exception="NOT_ADMIN",
    )
    contract.close_sale(_sender=admin)
    scenario.verify(contract.data.sale_permanently_closed)
    scenario.verify(~contract.data.sale_active)
    scenario.verify(~contract.data.final_sweep_complete)
    scenario.verify(contract.data.claims_created == 1)
    scenario.verify(contract.data.claims_settled == 0)
    scenario.verify(contract.data.next_claim_to_settle == 0)
    scenario.verify(contract.data.slots_loaded == 3)
    contract.purchase(
        1,
        _sender=buyer,
        _amount=sp.tez(1),
        _valid=False,
        _exception="SALE_CLOSED",
    )
    contract.settle_claims_v35(
        [
            sp.record(
                claim_id=0,
                entropy_preimage=preimages[0],
                metadata_uri=uri,
                metadata_nonce=nonce,
            )
        ],
        _sender=finalizer,
    )
    scenario.verify(contract.data.claims_settled == 1)
    scenario.verify(contract.data.entropy_remaining == 2)
    scenario.verify(contract.data.final_sweep_complete)
    scenario.verify(contract.data.final_sweep_amount == sp.mutez(5_000))
    scenario.verify(contract.balance == sp.mutez(0))

    cancel_head, _ = build_reverse_hash_chain(1, b"v35-preactivation-cancel")
    cancel_uri = bytes_of_string("ipfs://QmV35PreactivationCancel")
    cancelled = make_contract(
        admin.address,
        finalizer.address,
        admin.address,
        sp.variant.immediate(()),
        cancel_head,
        1,
        sp.mutez(1_000),
        default_royalties(admin.address),
    )
    cancelled.set_initial_balance(sp.mutez(5_000))
    scenario += cancelled
    cancelled.add_tokens_v35(
        [
            sp.record(
                token_id=0,
                metadata_commitment=metadata_commitment(0, cancel_uri, nonce),
                quantity=1,
            )
        ],
        _sender=admin,
    )
    cancelled.append_token_slots_v35(
        [sp.record(token_id=0, count=1)], _sender=admin
    )
    cancelled.set_stages({0: default_stage(sp.tez(1))}, _sender=admin)
    cancelled.finalize_setup(_sender=admin)
    cancelled.close_sale(
        _sender=attacker,
        _valid=False,
        _exception="NOT_ADMIN",
    )
    cancelled.close_sale(_sender=admin)
    scenario.verify(~cancelled.data.sale_activated)
    scenario.verify(cancelled.data.sale_permanently_closed)
    scenario.verify(cancelled.data.final_sweep_complete)
    scenario.verify(cancelled.data.final_sweep_amount == sp.mutez(5_000))
    scenario.verify(cancelled.balance == sp.mutez(0))
    cancelled.activate_sale(
        _sender=admin,
        _valid=False,
        _exception="SALE_PERMANENTLY_CLOSED",
    )


@sp.add_test()
def resumable_large_edition_slot_loading():
    scenario = sp.test_scenario(
        "V35 physical edition slots load canonically across setup operations", main
    )
    admin = sp.test_account("v35_slot_admin")
    finalizer = sp.test_account("v35_slot_finalizer")
    head, _ = build_reverse_hash_chain(12, b"v35-slot-chain")
    uri0 = bytes_of_string("ipfs://QmV35SlotZero")
    uri1 = bytes_of_string("ipfs://QmV35SlotOne")
    nonce0 = sp.bytes("0x" + "77" * 32)
    nonce1 = sp.bytes("0x" + "88" * 32)
    contract = make_contract(
        admin.address,
        finalizer.address,
        admin.address,
        sp.variant.immediate(()),
        head,
        12,
        sp.mutez(0),
        default_royalties(admin.address),
    )
    scenario += contract
    contract.add_tokens_v35(
        [
            sp.record(
                token_id=0,
                metadata_commitment=metadata_commitment(0, uri0, nonce0),
                quantity=10,
            ),
            sp.record(
                token_id=1,
                metadata_commitment=metadata_commitment(1, uri1, nonce1),
                quantity=2,
            ),
        ],
        _sender=admin,
    )
    contract.set_stages({0: default_stage(sp.mutez(0))}, _sender=admin)
    contract.finalize_setup(
        _sender=admin,
        _valid=False,
        _exception="SLOTS_INCOMPLETE",
    )
    contract.append_token_slots_v35(
        [],
        _sender=admin,
        _valid=False,
        _exception="EMPTY_SLOT_BATCH",
    )
    contract.append_token_slots_v35(
        [sp.record(token_id=0, count=0)],
        _sender=admin,
        _valid=False,
        _exception="BAD_SLOT_COUNT",
    )
    contract.append_token_slots_v35(
        [sp.record(token_id=1, count=1)],
        _sender=admin,
        _valid=False,
        _exception="NON_SEQUENTIAL_SLOT_TOKEN",
    )
    contract.append_token_slots_v35(
        [sp.record(token_id=0, count=3)], _sender=admin
    )
    contract.append_token_slots_v35(
        [sp.record(token_id=0, count=4)], _sender=admin
    )
    contract.append_token_slots_v35(
        [sp.record(token_id=0, count=4)],
        _sender=admin,
        _valid=False,
        _exception="TOKEN_SLOTS_OVERFILLED",
    )
    contract.append_token_slots_v35(
        [sp.record(token_id=0, count=3)], _sender=admin
    )
    scenario.verify(contract.data.token_slots_loaded[0] == 10)
    scenario.verify(contract.data.next_slot_token_id == 1)
    contract.append_token_slots_v35(
        [sp.record(token_id=0, count=1)],
        _sender=admin,
        _valid=False,
        _exception="NON_SEQUENTIAL_SLOT_TOKEN",
    )
    contract.append_token_slots_v35(
        [sp.record(token_id=1, count=2)], _sender=admin
    )
    scenario.verify(contract.data.slots_loaded == 12)
    scenario.verify(contract.data.next_slot_token_id == 2)
    for slot_index in range(10):
        scenario.verify(contract.data.slots[slot_index] == 0)
    scenario.verify(contract.data.slots[10] == 1)
    scenario.verify(contract.data.slots[11] == 1)
    contract.finalize_setup(_sender=admin)
    contract.append_token_slots_v35(
        [sp.record(token_id=1, count=1)],
        _sender=admin,
        _valid=False,
        _exception="SETUP_FINALIZED",
    )
