# MacaroniBlindMintFA2V2
#
# FA2 blind mint drop contract for Macaroni V2 feature work:
#   * token rows may have quantity > 1, minting one edition at a time while
#     sharing the same FA2 token id.
#   * delayed reveal can choose from a pool of unrevealed placeholder metadata.
#   * optional minter royalty state is tracked on-chain while metadata updates
#     are pushed by the generated drop page or a creator/updater action.
#
# This source intentionally separates royalty pool state from the token metadata
# update call. Macaroni should not operate an indefinite watchdog; request-time
# drop-page/updater code calls update_minter_royalty_metadata after mints.

import smartpy as sp


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
    OperatorParamType: type = sp.variant(add_operator=OperatorKeyType, remove_operator=OperatorKeyType)
    TransferTxType: type = sp.record(to_=sp.address, token_id=sp.nat, amount=sp.nat).layout(
        ("to_", ("token_id", "amount"))
    )
    TransferBatchItemType: type = sp.record(
        from_=sp.address, txs=sp.list[TransferTxType]
    ).layout(("from_", "txs"))
    TokenMetadataType: type = sp.record(
        token_id=sp.nat, token_info=sp.map[sp.string, sp.bytes]
    ).layout(("token_id", "token_info"))
    TokenBatchItemType: type = sp.record(token_id=sp.nat, token_info=sp.map[sp.string, sp.bytes], quantity=sp.nat)
    StageType: type = sp.record(
        start=sp.timestamp,
        price=sp.mutez,
        use_allowlist=sp.bool,
        max_per_wallet=sp.option[sp.nat],
    )
    AllowKeyType: type = sp.record(stage=sp.nat, holder=sp.address)
    MinterKeyType: type = sp.record(token_id=sp.nat, minter=sp.address)
    RoyaltyConfigType: type = sp.record(
        enabled=sp.bool,
        bps=sp.nat,
        mode=sp.nat,  # 0 = first minter, 1 = rolling pool
        updater=sp.address,
    )
    RoyaltyMetadataUpdateType: type = sp.record(
        token_id=sp.nat,
        token_info=sp.map[sp.string, sp.bytes],
        final_token_info=sp.option[sp.map[sp.string, sp.bytes]],
        revision=sp.nat,
        lock=sp.bool,
    )

    class MacaroniBlindMintFA2V2(sp.Contract):
        def __init__(
            self,
            administrator,
            treasury,
            metadata,
            delayed_reveal,
            placeholder_pool,
            placeholder_count,
            reveal_delay,
            minter_royalty_config,
        ):
            self.data.administrator = sp.cast(administrator, sp.address)
            self.data.pending_administrator = sp.cast(None, sp.option[sp.address])
            self.data.treasury = sp.cast(treasury, sp.address)
            self.data.metadata = sp.cast(metadata, sp.big_map[sp.string, sp.bytes])
            self.data.ledger = sp.cast(sp.big_map(), sp.big_map[LedgerKeyType, sp.nat])
            self.data.operators = sp.cast(sp.big_map(), sp.big_map[OperatorKeyType, sp.unit])
            self.data.token_metadata = sp.cast(sp.big_map(), sp.big_map[sp.nat, TokenMetadataType])
            self.data.pending_tokens = sp.cast(sp.big_map(), sp.big_map[sp.nat, TokenMetadataType])
            self.data.token_supply = sp.cast(sp.big_map(), sp.big_map[sp.nat, sp.nat])
            self.data.token_minted = sp.cast(sp.big_map(), sp.big_map[sp.nat, sp.nat])
            self.data.slots = sp.cast(sp.big_map(), sp.big_map[sp.nat, sp.nat])
            self.data.supply = sp.nat(0)  # edition supply across all token rows
            self.data.minted = sp.nat(0)  # editions minted
            self.data.token_count = sp.nat(0)
            self.data.stages = sp.cast({}, sp.map[sp.nat, StageType])
            self.data.allowlist = sp.cast(sp.big_map(), sp.big_map[AllowKeyType, sp.nat])
            self.data.stage_minted = sp.cast(sp.big_map(), sp.big_map[AllowKeyType, sp.nat])
            self.data.locked = False
            self.data.paused = False
            self.data.delayed_reveal = sp.cast(delayed_reveal, sp.bool)
            self.data.placeholder_pool = sp.cast(placeholder_pool, sp.big_map[sp.nat, TokenMetadataType])
            self.data.placeholder_count = sp.cast(placeholder_count, sp.nat)
            self.data.token_placeholder = sp.cast(sp.big_map(), sp.big_map[sp.nat, sp.nat])
            self.data.reveal_queue = sp.cast(sp.big_map(), sp.big_map[sp.nat, sp.nat])
            self.data.reveal_cursor = sp.nat(0)
            self.data.reveal_tail = sp.nat(0)
            self.data.reveal_delay = sp.cast(reveal_delay, sp.nat)
            self.data.unrevealed_since = sp.cast(None, sp.option[sp.timestamp])
            self.data.revealed = sp.nat(0)
            self.data.minter_royalty_config = sp.cast(minter_royalty_config, RoyaltyConfigType)
            self.data.first_minter = sp.cast(sp.big_map(), sp.big_map[sp.nat, sp.address])
            self.data.minter_pool = sp.cast(sp.big_map(), sp.big_map[MinterKeyType, sp.unit])
            self.data.minter_pool_count = sp.cast(sp.big_map(), sp.big_map[sp.nat, sp.nat])
            self.data.royalty_revision = sp.cast(sp.big_map(), sp.big_map[sp.nat, sp.nat])
            self.data.metadata_revision = sp.cast(sp.big_map(), sp.big_map[sp.nat, sp.nat])
            self.data.royalty_locked = sp.cast(sp.big_map(), sp.big_map[sp.nat, sp.bool])

        @sp.private(with_storage="read-only")
        def _only_admin(self):
            assert sp.sender == self.data.administrator, "NOT_ADMIN"
            return ()

        @sp.private(with_storage="read-only")
        def _only_admin_or_updater(self):
            assert (
                sp.sender == self.data.administrator
                or sp.sender == self.data.minter_royalty_config.updater
            ), "NOT_UPDATER"
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

        @sp.private(with_storage="read-write", with_operations=True)
        def _record_minter_royalty(self, params):
            sp.cast(params, sp.record(token_id=sp.nat, minter=sp.address))
            cfg = self.data.minter_royalty_config
            if cfg.enabled and cfg.bps > 0:
                locked = self.data.royalty_locked.get(params.token_id, default=False)
                if not locked:
                    minted_before = self.data.token_minted.get(params.token_id, default=sp.nat(0))
                    if cfg.mode == 0:
                        if minted_before == 0:
                            self.data.first_minter[params.token_id] = params.minter
                            self.data.royalty_revision[params.token_id] = (
                                self.data.royalty_revision.get(params.token_id, default=sp.nat(0)) + 1
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
                                self.data.minter_pool_count.get(params.token_id, default=sp.nat(0)) + 1
                            )
                            self.data.royalty_revision[params.token_id] = (
                                self.data.royalty_revision.get(params.token_id, default=sp.nat(0)) + 1
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

        @sp.private(with_storage="read-write")
        def _maybe_set_placeholder(self, token_id):
            if self.data.delayed_reveal:
                assert self.data.placeholder_count > 0, "NO_PLACEHOLDER"
                minted_before = self.data.token_minted.get(token_id, default=sp.nat(0))
                if minted_before == 0:
                    # Placeholder choice is cosmetic, so level/mint-position
                    # entropy is enough here; final artwork draw uses slots.
                    placeholder_index = sp.mod(
                        sp.level + self.data.minted + token_id,
                        self.data.placeholder_count,
                    )
                    self.data.token_placeholder[token_id] = placeholder_index
                    self.data.token_metadata[token_id] = self.data.placeholder_pool[placeholder_index]
                    self.data.reveal_queue[self.data.reveal_tail] = token_id
                    self.data.reveal_tail += 1
                    if self.data.unrevealed_since.is_none():
                        self.data.unrevealed_since = sp.Some(sp.now)
            return ()

        # ---- FA2 standard ----

        @sp.entrypoint
        def balance_of(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, BalanceOfParamType)
            responses = []
            for req in params.requests:
                responses.push(
                    sp.record(
                        request=sp.record(owner=req.owner, token_id=req.token_id),
                        balance=self.data.ledger.get(sp.record(owner=req.owner, token_id=req.token_id), default=sp.nat(0)),
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
                        assert op.owner == sp.sender, "NOT_OWNER"
                        self.data.operators[op] = ()
                    case remove_operator(op):
                        assert op.owner == sp.sender, "NOT_OWNER"
                        if op in self.data.operators:
                            del self.data.operators[op]

        @sp.entrypoint
        def transfer(self, batch):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(batch, sp.list[TransferBatchItemType])
            for item in batch:
                for tx in item.txs:
                    if item.from_ != sp.sender:
                        assert (
                            sp.record(owner=item.from_, operator=sp.sender, token_id=tx.token_id)
                            in self.data.operators
                        ), "NOT_OPERATOR"
                    assert tx.amount > 0, "BAD_AMOUNT"
                    from_key = sp.record(owner=item.from_, token_id=tx.token_id)
                    from_bal = self.data.ledger.get(from_key, default=sp.nat(0))
                    assert from_bal >= tx.amount, "LOW_BALANCE"
                    next_from = sp.as_nat(from_bal - tx.amount)
                    if next_from == 0:
                        if from_key in self.data.ledger:
                            del self.data.ledger[from_key]
                    else:
                        self.data.ledger[from_key] = next_from
                    to_key = sp.record(owner=tx.to_, token_id=tx.token_id)
                    self.data.ledger[to_key] = self.data.ledger.get(to_key, default=sp.nat(0)) + tx.amount

        # ---- Administration ----

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
        def set_pause(self, paused):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(paused, sp.bool)
            _ = self._only_admin()
            self.data.paused = paused

        @sp.entrypoint
        def set_stages(self, stages):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(stages, sp.map[sp.nat, StageType])
            _ = self._only_admin()
            assert not self.data.locked, "LOCKED"
            self.data.stages = stages

        @sp.entrypoint
        def set_allowlist(self, entries):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(entries, sp.list[sp.record(stage=sp.nat, holder=sp.address, capacity=sp.nat)])
            _ = self._only_admin()
            assert not self.data.locked, "LOCKED"
            for item in entries:
                self.data.allowlist[sp.record(stage=item.stage, holder=item.holder)] = item.capacity

        # ---- Token loading ----

        @sp.entrypoint
        def add_tokens_v2(self, tokens):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(tokens, sp.list[TokenBatchItemType])
            _ = self._only_admin()
            assert not self.data.locked, "LOCKED"
            for token in tokens:
                assert token.quantity > 0, "BAD_QUANTITY"
                assert token.token_id == self.data.token_count, "NON_SEQUENTIAL_TOKEN"
                meta = sp.record(token_id=token.token_id, token_info=token.token_info)
                self.data.pending_tokens[token.token_id] = meta
                if not self.data.delayed_reveal:
                    self.data.token_metadata[token.token_id] = meta
                self.data.token_supply[token.token_id] = token.quantity
                self.data.token_minted[token.token_id] = sp.nat(0)
                self.data.royalty_revision[token.token_id] = sp.nat(0)
                self.data.metadata_revision[token.token_id] = sp.nat(0)
                self.data.royalty_locked[token.token_id] = False
                for slot_index in sp.range(0, token.quantity):
                    self.data.slots[self.data.supply] = token.token_id
                    self.data.supply += 1
                self.data.token_count += 1

        @sp.entrypoint
        def replace_tokens_v2(self, tokens):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(tokens, sp.list[TokenBatchItemType])
            _ = self._only_admin()
            assert not self.data.locked, "LOCKED"
            for token in tokens:
                assert token.token_id < self.data.token_count, "TOKEN_UNDEFINED"
                assert self.data.token_minted.get(token.token_id, default=sp.nat(0)) == 0, "TOKEN_ALREADY_MINTED"
                assert token.quantity == self.data.token_supply[token.token_id], "SUPPLY_IMMUTABLE"
                meta = sp.record(token_id=token.token_id, token_info=token.token_info)
                self.data.pending_tokens[token.token_id] = meta
                if not self.data.delayed_reveal:
                    self.data.token_metadata[token.token_id] = meta

        # ---- Mint/reveal ----

        @sp.entrypoint
        def mint(self, amount):
            sp.cast(amount, sp.nat)
            assert amount > 0, "BAD_AMOUNT"
            assert not self.data.paused, "PAUSED"
            assert self.data.minted + amount <= self.data.supply, "SOLD_OUT"
            stage_id_opt = self._active_stage_id()
            assert stage_id_opt.is_some(), "NO_STAGE"
            stage_id = stage_id_opt.unwrap_some()
            stage = self.data.stages[stage_id]
            expected = sp.split_tokens(stage.price, amount, 1)
            assert sp.amount == expected, "BAD_PAYMENT"

            stage_key = sp.record(stage=stage_id, holder=sp.sender)
            already_stage_minted = self.data.stage_minted.get(stage_key, default=sp.nat(0))
            if stage.max_per_wallet.is_some():
                assert already_stage_minted + amount <= stage.max_per_wallet.unwrap_some(), "WALLET_LIMIT"
            if stage.use_allowlist:
                cap = self.data.allowlist.get(stage_key, default=sp.nat(0))
                assert already_stage_minted + amount <= cap, "ALLOWLIST_LIMIT"

            for mint_index in sp.range(0, amount):
                remaining = sp.as_nat(self.data.supply - self.data.minted)
                draw = sp.mod(sp.level + self.data.minted, remaining)
                last = sp.as_nat(remaining - 1)
                token_id = self.data.slots[draw]
                if draw != last:
                    self.data.slots[draw] = self.data.slots[last]
                if last in self.data.slots:
                    del self.data.slots[last]

                _ = self._record_minter_royalty(sp.record(token_id=token_id, minter=sp.sender))
                _ = self._maybe_set_placeholder(token_id)

                ledger_key = sp.record(owner=sp.sender, token_id=token_id)
                self.data.ledger[ledger_key] = self.data.ledger.get(ledger_key, default=sp.nat(0)) + 1
                self.data.token_minted[token_id] = self.data.token_minted.get(token_id, default=sp.nat(0)) + 1
                self.data.minted += 1
                sp.emit(token_id, tag="blind_mint")

            self.data.stage_minted[stage_key] = already_stage_minted + amount
            sp.send(self.data.treasury, sp.amount)
            if self.data.minted == self.data.supply:
                self.data.locked = True

        @sp.entrypoint
        def reveal(self, amount):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(amount, sp.nat)
            assert self.data.delayed_reveal, "NOT_DELAYED"
            assert amount > 0, "BAD_AMOUNT"
            if sp.sender != self.data.administrator:
                assert self.data.unrevealed_since.is_some(), "NO_PENDING_REVEAL"
                assert sp.now >= sp.add_seconds(
                    self.data.unrevealed_since.unwrap_some(),
                    sp.to_int(self.data.reveal_delay),
                ), "TOO_EARLY"
            count = sp.nat(0)
            while count < amount and self.data.reveal_cursor < self.data.reveal_tail:
                token_id = self.data.reveal_queue[self.data.reveal_cursor]
                self.data.token_metadata[token_id] = self.data.pending_tokens[token_id]
                if token_id in self.data.token_placeholder:
                    del self.data.token_placeholder[token_id]
                if self.data.reveal_cursor in self.data.reveal_queue:
                    del self.data.reveal_queue[self.data.reveal_cursor]
                self.data.reveal_cursor += 1
                self.data.revealed += 1
                count += 1
            if self.data.reveal_cursor == self.data.reveal_tail:
                self.data.unrevealed_since = sp.cast(None, sp.option[sp.timestamp])

        # ---- Minter royalty metadata update boundary ----

        @sp.entrypoint
        def update_minter_royalty_metadata(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, RoyaltyMetadataUpdateType)
            _ = self._only_admin_or_updater()
            assert self.data.minter_royalty_config.enabled, "MINTER_ROYALTY_OFF"
            assert params.token_id < self.data.token_count, "TOKEN_UNDEFINED"
            assert not self.data.royalty_locked.get(params.token_id, default=False), "ROYALTY_LOCKED"
            assert params.revision == self.data.royalty_revision.get(params.token_id, default=sp.nat(0)), "BAD_REVISION"
            visible_meta = sp.record(token_id=params.token_id, token_info=params.token_info)
            self.data.token_metadata[params.token_id] = visible_meta
            if self.data.delayed_reveal and params.token_id in self.data.token_placeholder:
                if params.final_token_info.is_some():
                    self.data.pending_tokens[params.token_id] = sp.record(
                        token_id=params.token_id,
                        token_info=params.final_token_info.unwrap_some(),
                    )
            else:
                self.data.pending_tokens[params.token_id] = visible_meta
            self.data.metadata_revision[params.token_id] = params.revision
            if params.lock:
                cfg = self.data.minter_royalty_config
                sold_out = self.data.token_minted.get(params.token_id, default=sp.nat(0)) == self.data.token_supply[params.token_id]
                assert cfg.mode == 0 or sold_out or sp.sender == self.data.administrator, "ROYALTY_POOL_OPEN"
                self.data.royalty_locked[params.token_id] = True

        @sp.entrypoint
        def lock_minter_royalties(self, token_id):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(token_id, sp.nat)
            _ = self._only_admin_or_updater()
            assert token_id < self.data.token_count, "TOKEN_UNDEFINED"
            assert self.data.metadata_revision.get(token_id, default=sp.nat(0)) == self.data.royalty_revision.get(token_id, default=sp.nat(0)), "SYNC_REQUIRED"
            cfg = self.data.minter_royalty_config
            sold_out = self.data.token_minted.get(token_id, default=sp.nat(0)) == self.data.token_supply[token_id]
            assert cfg.mode == 0 or sold_out or sp.sender == self.data.administrator, "ROYALTY_POOL_OPEN"
            self.data.royalty_locked[token_id] = True

        # ---- Views ----

        @sp.onchain_view
        def get_balance(self, params):
            sp.cast(params, sp.record(owner=sp.address, token_id=sp.nat))
            return self.data.ledger.get(sp.record(owner=params.owner, token_id=params.token_id), default=sp.nat(0))

        @sp.onchain_view
        def get_token_supply(self, token_id):
            sp.cast(token_id, sp.nat)
            return self.data.token_supply[token_id]

        @sp.onchain_view
        def get_token_minted(self, token_id):
            sp.cast(token_id, sp.nat)
            return self.data.token_minted.get(token_id, default=sp.nat(0))

        @sp.onchain_view
        def get_minter_pool_count(self, token_id):
            sp.cast(token_id, sp.nat)
            return self.data.minter_pool_count.get(token_id, default=sp.nat(0))


def bytes_of_string(s):
    return sp.bytes("0x" + s.encode("utf-8").hex())


def macaroni_v2_template_contract():
    admin = sp.test_account("macaroni_v2_template_admin")
    metadata = sp.big_map({"": bytes_of_string("ipfs://QmMacaroniV2ContractMetadataTemplate")})
    placeholder_info = {"": bytes_of_string("ipfs://QmMacaroniV2PlaceholderMetadataTemplate")}
    placeholders = sp.big_map({
        0: sp.record(token_id=0, token_info=placeholder_info),
    })
    royalty_config = sp.record(
        enabled=False,
        bps=sp.nat(0),
        mode=sp.nat(0),
        updater=admin.address,
    )
    return main.MacaroniBlindMintFA2V2(
        administrator=admin.address,
        treasury=admin.address,
        metadata=metadata,
        delayed_reveal=False,
        placeholder_pool=placeholders,
        placeholder_count=sp.nat(1),
        reveal_delay=sp.nat(604800),
        minter_royalty_config=royalty_config,
    )


@sp.add_test()
def deploy_macaroni_blind_mint_v2_template():
    scenario = sp.test_scenario("deploy_macaroni_blind_mint_v2_template", main)
    c = macaroni_v2_template_contract()
    scenario += c


@sp.add_test()
def test():
    scenario = sp.test_scenario("MacaroniBlindMintFA2V2", main)
    admin = sp.test_account("admin")
    alice = sp.test_account("alice")
    bob = sp.test_account("bob")

    metadata = sp.big_map({"": bytes_of_string("ipfs://QmContract")})
    placeholder_info = {"": bytes_of_string("ipfs://QmPlaceholder")}
    placeholders = sp.big_map({
        0: sp.record(token_id=0, token_info=placeholder_info),
    })
    royalty_config = sp.record(enabled=True, bps=500, mode=1, updater=admin.address)

    c = main.MacaroniBlindMintFA2V2(
        administrator=admin.address,
        treasury=admin.address,
        metadata=metadata,
        delayed_reveal=True,
        placeholder_pool=placeholders,
        placeholder_count=1,
        reveal_delay=sp.nat(0),
        minter_royalty_config=royalty_config,
    )
    scenario += c

    token_info = {"": bytes_of_string("ipfs://QmToken")}
    c.add_tokens_v2([sp.record(token_id=0, token_info=token_info, quantity=3)], _sender=admin)
    c.set_stages({
        0: sp.record(
            start=sp.timestamp(0),
            price=sp.tez(1),
            use_allowlist=False,
            max_per_wallet=sp.cast(None, sp.option[sp.nat]),
        )
    }, _sender=admin)
    c.mint(1, _sender=alice, _amount=sp.tez(1), _now=sp.timestamp(1))
    c.mint(1, _sender=bob, _amount=sp.tez(1), _now=sp.timestamp(2))
    c.reveal(1, _sender=bob, _now=sp.timestamp(3))
