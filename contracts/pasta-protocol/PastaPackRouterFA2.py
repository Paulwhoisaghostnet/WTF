# PastaPackRouterFA2
#
# Pasta Protocol / Ravioli v2. A pack wrapper is an FA2 multi-asset token whose serial recipes are
# committed and fully reserved before any wrapper can mint or sell. Opening one wrapper atomically:
#
#   1. verifies the next serial's nonce + ordered recipe commitment,
#   2. transfers every escrowed FA2 asset and/or invokes every typed mint adapter,
#   3. burns exactly one wrapper only if every child operation succeeds.
#
# Tezos reverts the complete internal-operation tree when a child transfer or adapter mint fails, so
# the wrapper and every reserve counter remain unchanged on a failed open. Allocated and generative
# products use small helper adapters rather than embedding protocol-specific minter shapes here.
#
# Five first-class Ravioli modes are encoded as nat values:
#   0 deterministic vaulted bundle
#   1 blind funded-pool pack
#   2 blind allocated-mint pack
#   3 blind generative-mint pack
#   4 hybrid pack (any ordered mixture of the three primitives)
#
# "Blind" means commit/reveal and ordinary UI concealment, not chain privacy. Funding and reservation
# operations are public Tezos data and can be inspected by sophisticated users before opening.

import smartpy as sp


@sp.module
def pasta_pack_router_main():
    MAX_PACK_SUPPLY = 64
    MAX_RECIPE_ACTIONS = 8
    MAX_ADAPTER_PAYLOAD_BYTES = 4096

    LedgerKeyType: type = sp.record(owner=sp.address, token_id=sp.nat).layout(
        ("owner", "token_id")
    )
    OperatorKeyType: type = sp.record(
        owner=sp.address, operator=sp.address, token_id=sp.nat
    ).layout(("owner", ("operator", "token_id")))
    BalanceOfRequestType: type = sp.record(owner=sp.address, token_id=sp.nat).layout(
        ("owner", "token_id")
    )
    BalanceOfResponseType: type = sp.record(request=BalanceOfRequestType, balance=sp.nat).layout(
        ("request", "balance")
    )
    BalanceOfParamType: type = sp.record(
        requests=sp.list[BalanceOfRequestType], callback=sp.contract[sp.list[BalanceOfResponseType]]
    ).layout(("requests", "callback"))
    OperatorParamType: type = sp.variant(add_operator=OperatorKeyType, remove_operator=OperatorKeyType)
    TransferTxType: type = sp.record(to_=sp.address, token_id=sp.nat, amount=sp.nat).layout(
        ("to_", ("token_id", "amount"))
    )
    TransferBatchItemType: type = sp.record(from_=sp.address, txs=sp.list[TransferTxType]).layout(
        ("from_", "txs")
    )
    TokenMetadataType: type = sp.record(token_id=sp.nat, token_info=sp.map[sp.string, sp.bytes]).layout(
        ("token_id", "token_info")
    )
    MintParamType: type = sp.record(to_=sp.address, token_id=sp.nat, amount=sp.nat)
    SetTokenMetadataType: type = sp.record(token_id=sp.nat, token_info=sp.map[sp.string, sp.bytes])

    EscrowActionType: type = sp.record(fa2=sp.address, token_id=sp.nat, amount=sp.nat)
    # Adapter recipes make the payload policy explicit. Allocated mints always
    # commit the exact (normally empty) payload. Generative mints may either
    # commit exact output bytes with Some(blake2b(payload)) or deliberately use
    # None for an artifact generated only when the holder opens the wrapper.
    # The latter still commits the adapter/project identity and the fact that
    # the output is generated-at-open; it is not misrepresented as an exact
    # precommitted artifact.
    AdapterReservationType: type = sp.record(
        adapter=sp.address,
        resource_id=sp.nat,
        payload_commitment=sp.option[sp.bytes],
    )
    AdapterActionType: type = sp.record(
        adapter=sp.address,
        resource_id=sp.nat,
        payload=sp.bytes,
        payload_commitment=sp.option[sp.bytes],
    )
    RecipeReservationType: type = sp.variant(
        escrow=EscrowActionType,
        allocated_mint=AdapterReservationType,
        generative_mint=AdapterReservationType,
    )
    RecipeActionType: type = sp.variant(
        escrow=EscrowActionType,
        allocated_mint=AdapterActionType,
        generative_mint=AdapterActionType,
    )

    PackConfigType: type = sp.record(
        mode=sp.nat,
        blind=sp.bool,
        item_count=sp.nat,
        max_supply=sp.nat,
        committed_recipes=sp.nat,
        finalized=sp.bool,
        cancelled=sp.bool,
        contents_uri=sp.option[sp.bytes],
    )
    CreatePackType: type = sp.record(token_info=sp.map[sp.string, sp.bytes], config=PackConfigType)
    CommitRecipeType: type = sp.record(
        token_id=sp.nat,
        nonce_commitment=sp.bytes,
        reservations=sp.list[RecipeReservationType],
    )
    OpenPackType: type = sp.record(token_id=sp.nat, nonce=sp.bytes, actions=sp.list[RecipeActionType])
    RecipeKeyType: type = sp.record(pack_token_id=sp.nat, serial=sp.nat)
    AssetKeyType: type = sp.record(pack_token_id=sp.nat, fa2=sp.address, asset_token_id=sp.nat)
    AdapterKeyType: type = sp.record(
        pack_token_id=sp.nat, adapter=sp.address, kind=sp.nat, resource_id=sp.nat
    )
    AdapterReserveParamType: type = sp.record(
        pack_contract=sp.address,
        pack_token_id=sp.nat,
        kind=sp.nat,
        resource_id=sp.nat,
        capacity=sp.nat,
    )
    AdapterFulfillParamType: type = sp.record(
        recipient=sp.address,
        pack_contract=sp.address,
        pack_token_id=sp.nat,
        open_serial=sp.nat,
        resource_id=sp.nat,
        payload=sp.bytes,
    )
    AdapterReleaseParamType: type = AdapterReserveParamType
    RecoverAssetType: type = sp.record(
        token_id=sp.nat, fa2=sp.address, asset_token_id=sp.nat, amount=sp.nat
    )
    RecoverAdapterType: type = sp.record(
        token_id=sp.nat, adapter=sp.address, kind=sp.nat, resource_id=sp.nat, capacity=sp.nat
    )
    SetPackContentsType: type = sp.record(token_id=sp.nat, contents_uri=sp.bytes)
    SaleConfigType: type = sp.record(
        active=sp.bool,
        seller=sp.address,
        treasury=sp.address,
        price=sp.mutez,
        remaining=sp.nat,
        start=sp.option[sp.timestamp],
        end=sp.option[sp.timestamp],
    )
    SetSaleType: type = sp.record(token_id=sp.nat, sale=SaleConfigType)
    SetSaleActiveType: type = sp.record(token_id=sp.nat, active=sp.bool)
    BuyParamType: type = sp.record(token_id=sp.nat, amount=sp.nat)

    class PastaPackRouterFA2(sp.Contract):
        def __init__(self, administrator, metadata):
            self.data.administrator = sp.cast(administrator, sp.address)
            self.data.pending_administrator = sp.cast(None, sp.option[sp.address])
            self.data.metadata = sp.cast(metadata, sp.big_map[sp.string, sp.bytes])
            self.data.ledger = sp.cast(sp.big_map(), sp.big_map[LedgerKeyType, sp.nat])
            self.data.operators = sp.cast(sp.big_map(), sp.big_map[OperatorKeyType, sp.unit])
            self.data.token_metadata = sp.cast(sp.big_map(), sp.big_map[sp.nat, TokenMetadataType])
            self.data.total_supply = sp.cast(sp.big_map(), sp.big_map[sp.nat, sp.nat])
            self.data.packs = sp.cast(sp.big_map(), sp.big_map[sp.nat, PackConfigType])
            self.data.recipe_commitments = sp.cast(sp.big_map(), sp.big_map[RecipeKeyType, sp.bytes])
            self.data.minted = sp.cast(sp.big_map(), sp.big_map[sp.nat, sp.nat])
            self.data.opened = sp.cast(sp.big_map(), sp.big_map[sp.nat, sp.nat])
            self.data.opened_by = sp.cast(sp.big_map(), sp.big_map[LedgerKeyType, sp.nat])
            self.data.asset_allowances = sp.cast(sp.big_map(), sp.big_map[AssetKeyType, sp.nat])
            self.data.adapter_allowances = sp.cast(sp.big_map(), sp.big_map[AdapterKeyType, sp.nat])
            self.data.sales = sp.cast(sp.big_map(), sp.big_map[sp.nat, SaleConfigType])
            self.data.minters = sp.cast(sp.big_map(), sp.big_map[sp.address, sp.unit])
            self.data.next_token_id = sp.nat(0)

        @sp.private(with_storage="read-only")
        def _only_admin(self):
            assert sp.sender == self.data.administrator, "NOT_ADMIN"

        @sp.private(with_storage="read-write")
        def _move(self, params):
            sp.cast(params, sp.record(from_=sp.address, to_=sp.address, token_id=sp.nat, amount=sp.nat))
            assert params.token_id in self.data.packs, "FA2_TOKEN_UNDEFINED"
            if params.amount > 0:
                from_key = sp.record(owner=params.from_, token_id=params.token_id)
                from_balance = self.data.ledger.get(from_key, default=sp.nat(0))
                assert from_balance >= params.amount, "FA2_INSUFFICIENT_BALANCE"
                remaining = sp.as_nat(from_balance - params.amount)
                if remaining == 0:
                    if from_key in self.data.ledger:
                        del self.data.ledger[from_key]
                else:
                    self.data.ledger[from_key] = remaining
            # TZIP-12 defines a zero-amount transfer as a normal transfer.  It
            # therefore still materializes the destination balance key while
            # changing no token quantity.
            to_key = sp.record(owner=params.to_, token_id=params.token_id)
            self.data.ledger[to_key] = self.data.ledger.get(to_key, default=sp.nat(0)) + params.amount

        @sp.private(with_storage="read-only")
        def _recoverable(self, token_id):
            assert token_id in self.data.packs, "NO_PACK"
            pack = self.data.packs[token_id]
            assert pack.cancelled, "PACK_STILL_LIVE"

        @sp.entrypoint
        def balance_of(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, BalanceOfParamType)
            responses = []
            for req in params.requests:
                assert req.token_id in self.data.packs, "FA2_TOKEN_UNDEFINED"
                responses.push(
                    sp.record(
                        request=req,
                        balance=self.data.ledger.get(
                            sp.record(owner=req.owner, token_id=req.token_id), default=sp.nat(0)
                        ),
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
                    if item.from_ != sp.sender:
                        assert sp.record(
                            owner=item.from_, operator=sp.sender, token_id=tx.token_id
                        ) in self.data.operators, "FA2_NOT_OPERATOR"
                    self._move(
                        sp.record(
                            from_=item.from_, to_=tx.to_, token_id=tx.token_id, amount=tx.amount
                        )
                    )

        @sp.entrypoint
        def create_pack(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, CreatePackType)
            self._only_admin()
            assert params.config.mode <= 4, "BAD_MODE"
            assert params.config.item_count > 0, "EMPTY_RECIPE"
            assert params.config.item_count <= MAX_RECIPE_ACTIONS, "RECIPE_TOO_LARGE"
            assert params.config.max_supply > 0, "BAD_SUPPLY"
            assert params.config.max_supply <= MAX_PACK_SUPPLY, "SUPPLY_TOO_LARGE"
            assert params.config.committed_recipes == 0, "BAD_INITIAL_STATE"
            assert not params.config.finalized and not params.config.cancelled, "BAD_INITIAL_STATE"
            token_id = self.data.next_token_id
            self.data.token_metadata[token_id] = sp.record(token_id=token_id, token_info=params.token_info)
            self.data.total_supply[token_id] = 0
            self.data.minted[token_id] = 0
            self.data.opened[token_id] = 0
            self.data.packs[token_id] = params.config
            self.data.next_token_id += 1

        @sp.entrypoint
        def commit_recipe(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, CommitRecipeType)
            self._only_admin()
            assert params.token_id in self.data.packs, "NO_PACK"
            pack = self.data.packs[params.token_id]
            assert not pack.finalized and not pack.cancelled, "PACK_LOCKED"
            assert pack.committed_recipes < pack.max_supply, "ALL_RECIPES_COMMITTED"
            assert sp.len(params.nonce_commitment) == 32, "BAD_NONCE_COMMITMENT"
            assert sp.len(params.reservations) == pack.item_count, "BAD_ITEM_COUNT"

            serial = pack.committed_recipes
            commitment = sp.blake2b(
                sp.pack(
                    sp.record(
                        nonce_commitment=params.nonce_commitment,
                        reservations=params.reservations,
                    )
                )
            )
            self.data.recipe_commitments[
                sp.record(pack_token_id=params.token_id, serial=serial)
            ] = commitment

            for reservation in params.reservations:
                match reservation:
                    case escrow(asset):
                        # Modes 0/1 are existing-token products.  Mode 4 is the
                        # explicitly heterogeneous product.  Keeping this
                        # invariant on-chain prevents a pack advertised as an
                        # allocation/generative product from silently carrying
                        # a different child type.
                        assert pack.mode == 0 or pack.mode == 1 or pack.mode == 4, "MODE_RECIPE_MISMATCH"
                        assert asset.amount > 0, "BAD_ASSET_AMOUNT"
                        key = sp.record(
                            pack_token_id=params.token_id,
                            fa2=asset.fa2,
                            asset_token_id=asset.token_id,
                        )
                        self.data.asset_allowances[key] = self.data.asset_allowances.get(
                            key, default=sp.nat(0)
                        ) + asset.amount
                        transfer_handle = sp.contract(
                            sp.list[TransferBatchItemType], asset.fa2, "transfer"
                        ).unwrap_some(error="BAD_FA2")
                        sp.transfer(
                            [
                                sp.record(
                                    from_=sp.sender,
                                    txs=[
                                        sp.record(
                                            to_=sp.self_address,
                                            token_id=asset.token_id,
                                            amount=asset.amount,
                                        )
                                    ],
                                )
                            ],
                            sp.mutez(0),
                            transfer_handle,
                        )
                    case allocated_mint(adapter_reservation):
                        assert pack.mode == 2 or pack.mode == 4, "MODE_RECIPE_MISMATCH"
                        assert adapter_reservation.payload_commitment.is_some(), "MISSING_PAYLOAD_COMMITMENT"
                        assert sp.len(adapter_reservation.payload_commitment.unwrap_some()) == 32, "BAD_PAYLOAD_COMMITMENT"
                        key = sp.record(
                            pack_token_id=params.token_id,
                            adapter=adapter_reservation.adapter,
                            kind=sp.nat(1),
                            resource_id=adapter_reservation.resource_id,
                        )
                        self.data.adapter_allowances[key] = self.data.adapter_allowances.get(
                            key, default=sp.nat(0)
                        ) + 1
                        reserve_handle = sp.contract(
                            AdapterReserveParamType, adapter_reservation.adapter, "reserve"
                        ).unwrap_some(error="BAD_ADAPTER")
                        sp.transfer(
                            sp.record(
                                pack_contract=sp.self_address,
                                pack_token_id=params.token_id,
                                kind=1,
                                resource_id=adapter_reservation.resource_id,
                                capacity=1,
                            ),
                            sp.mutez(0),
                            reserve_handle,
                        )
                    case generative_mint(adapter_reservation):
                        assert pack.mode == 3 or pack.mode == 4, "MODE_RECIPE_MISMATCH"
                        if adapter_reservation.payload_commitment.is_some():
                            assert sp.len(adapter_reservation.payload_commitment.unwrap_some()) == 32, "BAD_PAYLOAD_COMMITMENT"
                        key = sp.record(
                            pack_token_id=params.token_id,
                            adapter=adapter_reservation.adapter,
                            kind=sp.nat(2),
                            resource_id=adapter_reservation.resource_id,
                        )
                        self.data.adapter_allowances[key] = self.data.adapter_allowances.get(
                            key, default=sp.nat(0)
                        ) + 1
                        reserve_handle = sp.contract(
                            AdapterReserveParamType, adapter_reservation.adapter, "reserve"
                        ).unwrap_some(error="BAD_ADAPTER")
                        sp.transfer(
                            sp.record(
                                pack_contract=sp.self_address,
                                pack_token_id=params.token_id,
                                kind=2,
                                resource_id=adapter_reservation.resource_id,
                                capacity=1,
                            ),
                            sp.mutez(0),
                            reserve_handle,
                        )

            self.data.packs[params.token_id] = sp.record(
                mode=pack.mode,
                blind=pack.blind,
                item_count=pack.item_count,
                max_supply=pack.max_supply,
                committed_recipes=pack.committed_recipes + 1,
                finalized=False,
                cancelled=False,
                contents_uri=pack.contents_uri,
            )

        @sp.entrypoint
        def finalize_pack(self, token_id):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(token_id, sp.nat)
            self._only_admin()
            assert token_id in self.data.packs, "NO_PACK"
            pack = self.data.packs[token_id]
            assert not pack.finalized and not pack.cancelled, "PACK_LOCKED"
            assert pack.committed_recipes == pack.max_supply, "RECIPES_INCOMPLETE"
            self.data.packs[token_id] = sp.record(
                mode=pack.mode,
                blind=pack.blind,
                item_count=pack.item_count,
                max_supply=pack.max_supply,
                committed_recipes=pack.committed_recipes,
                finalized=True,
                cancelled=False,
                contents_uri=pack.contents_uri,
            )

        @sp.entrypoint
        def open_pack(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, OpenPackType)
            assert params.token_id in self.data.packs, "NO_PACK"
            pack = self.data.packs[params.token_id]
            assert pack.finalized and not pack.cancelled, "PACK_NOT_READY"
            assert sp.len(params.actions) == pack.item_count, "BAD_ITEM_COUNT"
            holder_key = sp.record(owner=sp.sender, token_id=params.token_id)
            assert self.data.ledger.get(holder_key, default=sp.nat(0)) >= 1, "FA2_INSUFFICIENT_BALANCE"
            serial = self.data.opened.get(params.token_id, default=sp.nat(0))
            assert serial < pack.committed_recipes, "NO_RECIPE"

            reservations = []
            for action in params.actions:
                match action:
                    case escrow(asset):
                        assert pack.mode == 0 or pack.mode == 1 or pack.mode == 4, "MODE_RECIPE_MISMATCH"
                        reservations.push(sp.variant.escrow(asset))
                    case allocated_mint(adapter_action):
                        assert pack.mode == 2 or pack.mode == 4, "MODE_RECIPE_MISMATCH"
                        assert sp.len(adapter_action.payload) <= MAX_ADAPTER_PAYLOAD_BYTES, "PAYLOAD_TOO_LARGE"
                        assert adapter_action.payload_commitment.is_some(), "MISSING_PAYLOAD_COMMITMENT"
                        allocated_payload_commitment = adapter_action.payload_commitment.unwrap_some()
                        assert sp.len(allocated_payload_commitment) == 32, "BAD_PAYLOAD_COMMITMENT"
                        assert allocated_payload_commitment == sp.blake2b(adapter_action.payload), "BAD_PAYLOAD_COMMITMENT"
                        reservations.push(
                            sp.variant.allocated_mint(
                                sp.record(
                                    adapter=adapter_action.adapter,
                                    resource_id=adapter_action.resource_id,
                                    payload_commitment=adapter_action.payload_commitment,
                                )
                            )
                        )
                    case generative_mint(adapter_action):
                        assert pack.mode == 3 or pack.mode == 4, "MODE_RECIPE_MISMATCH"
                        assert sp.len(adapter_action.payload) > 0, "EMPTY_GENERATIVE_PAYLOAD"
                        assert sp.len(adapter_action.payload) <= MAX_ADAPTER_PAYLOAD_BYTES, "PAYLOAD_TOO_LARGE"
                        if adapter_action.payload_commitment.is_some():
                            generative_payload_commitment = adapter_action.payload_commitment.unwrap_some()
                            assert sp.len(generative_payload_commitment) == 32, "BAD_PAYLOAD_COMMITMENT"
                            assert generative_payload_commitment == sp.blake2b(adapter_action.payload), "BAD_PAYLOAD_COMMITMENT"
                        reservations.push(
                            sp.variant.generative_mint(
                                sp.record(
                                    adapter=adapter_action.adapter,
                                    resource_id=adapter_action.resource_id,
                                    payload_commitment=adapter_action.payload_commitment,
                                )
                            )
                        )
            ordered_reservations = reversed(reservations)
            supplied_commitment = sp.blake2b(
                sp.pack(
                    sp.record(
                        nonce_commitment=sp.blake2b(params.nonce),
                        reservations=ordered_reservations,
                    )
                )
            )
            expected_commitment = self.data.recipe_commitments.get(
                sp.record(pack_token_id=params.token_id, serial=serial), error="NO_RECIPE"
            )
            assert supplied_commitment == expected_commitment, "BAD_RECIPE"

            for action in params.actions:
                match action:
                    case escrow(asset):
                        assert asset.amount > 0, "BAD_ASSET_AMOUNT"
                        key = sp.record(
                            pack_token_id=params.token_id,
                            fa2=asset.fa2,
                            asset_token_id=asset.token_id,
                        )
                        available = self.data.asset_allowances.get(key, default=sp.nat(0))
                        assert available >= asset.amount, "ASSET_UNDERFUNDED"
                        self.data.asset_allowances[key] = sp.as_nat(available - asset.amount)
                        transfer_handle = sp.contract(
                            sp.list[TransferBatchItemType], asset.fa2, "transfer"
                        ).unwrap_some(error="BAD_FA2")
                        sp.transfer(
                            [
                                sp.record(
                                    from_=sp.self_address,
                                    txs=[
                                        sp.record(
                                            to_=sp.sender,
                                            token_id=asset.token_id,
                                            amount=asset.amount,
                                        )
                                    ],
                                )
                            ],
                            sp.mutez(0),
                            transfer_handle,
                        )
                    case allocated_mint(adapter_action):
                        key = sp.record(
                            pack_token_id=params.token_id,
                            adapter=adapter_action.adapter,
                            kind=sp.nat(1),
                            resource_id=adapter_action.resource_id,
                        )
                        available = self.data.adapter_allowances.get(key, default=sp.nat(0))
                        assert available >= 1, "ALLOCATION_UNDERFUNDED"
                        self.data.adapter_allowances[key] = sp.as_nat(available - 1)
                        fulfill_handle = sp.contract(
                            AdapterFulfillParamType, adapter_action.adapter, "fulfill"
                        ).unwrap_some(error="BAD_ADAPTER")
                        sp.transfer(
                            sp.record(
                                recipient=sp.sender,
                                pack_contract=sp.self_address,
                                pack_token_id=params.token_id,
                                open_serial=serial,
                                resource_id=adapter_action.resource_id,
                                payload=adapter_action.payload,
                            ),
                            sp.mutez(0),
                            fulfill_handle,
                        )
                    case generative_mint(adapter_action):
                        key = sp.record(
                            pack_token_id=params.token_id,
                            adapter=adapter_action.adapter,
                            kind=sp.nat(2),
                            resource_id=adapter_action.resource_id,
                        )
                        available = self.data.adapter_allowances.get(key, default=sp.nat(0))
                        assert available >= 1, "GENERATOR_UNDERFUNDED"
                        self.data.adapter_allowances[key] = sp.as_nat(available - 1)
                        fulfill_handle = sp.contract(
                            AdapterFulfillParamType, adapter_action.adapter, "fulfill"
                        ).unwrap_some(error="BAD_ADAPTER")
                        sp.transfer(
                            sp.record(
                                recipient=sp.sender,
                                pack_contract=sp.self_address,
                                pack_token_id=params.token_id,
                                open_serial=serial,
                                resource_id=adapter_action.resource_id,
                                payload=adapter_action.payload,
                            ),
                            sp.mutez(0),
                            fulfill_handle,
                        )

            # Burn exactly the wrapper opened by the holder.  Moving it to the
            # router and deleting the router ledger key would erase *all*
            # wrappers previously escrowed at this address, while reducing
            # total supply by only one.  That would violate FA2 balance/supply
            # conservation and strand sale inventory.  Keep the burn local to
            # the holder key and leave any router-held wrappers untouched.
            holder_balance = self.data.ledger.get(holder_key, default=sp.nat(0))
            assert holder_balance >= 1, "FA2_INSUFFICIENT_BALANCE"
            if holder_balance == 1:
                del self.data.ledger[holder_key]
            else:
                self.data.ledger[holder_key] = sp.as_nat(holder_balance - 1)
            self.data.total_supply[params.token_id] = sp.as_nat(
                self.data.total_supply[params.token_id] - 1
            )
            self.data.opened[params.token_id] = serial + 1
            self.data.opened_by[holder_key] = self.data.opened_by.get(
                holder_key, default=sp.nat(0)
            ) + 1
            sp.emit(
                sp.record(owner=sp.sender, token_id=params.token_id, serial=serial),
                tag="ravioli_opened",
            )

        @sp.entrypoint
        def cancel_pack(self, token_id):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(token_id, sp.nat)
            self._only_admin()
            assert token_id in self.data.packs, "NO_PACK"
            pack = self.data.packs[token_id]
            assert not pack.cancelled, "PACK_CANCELLED"
            minted = self.data.minted.get(token_id, default=sp.nat(0))
            opened = self.data.opened.get(token_id, default=sp.nat(0))
            supply = self.data.total_supply.get(token_id, default=sp.nat(0))
            assert minted == 0 or (supply == 0 and opened == minted), "WRAPPERS_EXIST"
            self.data.packs[token_id] = sp.record(
                mode=pack.mode,
                blind=pack.blind,
                item_count=pack.item_count,
                max_supply=pack.max_supply,
                committed_recipes=pack.committed_recipes,
                finalized=False,
                cancelled=True,
                contents_uri=pack.contents_uri,
            )

        @sp.entrypoint
        def recover_asset(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, RecoverAssetType)
            self._only_admin()
            self._recoverable(params.token_id)
            assert params.amount > 0, "BAD_AMOUNT"
            key = sp.record(
                pack_token_id=params.token_id, fa2=params.fa2, asset_token_id=params.asset_token_id
            )
            available = self.data.asset_allowances.get(key, default=sp.nat(0))
            assert available >= params.amount, "ASSET_UNDERFUNDED"
            self.data.asset_allowances[key] = sp.as_nat(available - params.amount)
            transfer_handle = sp.contract(
                sp.list[TransferBatchItemType], params.fa2, "transfer"
            ).unwrap_some(error="BAD_FA2")
            sp.transfer(
                [
                    sp.record(
                        from_=sp.self_address,
                        txs=[
                            sp.record(
                                to_=sp.sender,
                                token_id=params.asset_token_id,
                                amount=params.amount,
                            )
                        ],
                    )
                ],
                sp.mutez(0),
                transfer_handle,
            )

        @sp.entrypoint
        def recover_adapter(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, RecoverAdapterType)
            self._only_admin()
            self._recoverable(params.token_id)
            assert params.kind == 1 or params.kind == 2, "BAD_ADAPTER_KIND"
            assert params.capacity > 0, "BAD_CAPACITY"
            key = sp.record(
                pack_token_id=params.token_id,
                adapter=params.adapter,
                kind=params.kind,
                resource_id=params.resource_id,
            )
            available = self.data.adapter_allowances.get(key, default=sp.nat(0))
            assert available >= params.capacity, "ADAPTER_UNDERFUNDED"
            self.data.adapter_allowances[key] = sp.as_nat(available - params.capacity)
            release_handle = sp.contract(
                AdapterReleaseParamType, params.adapter, "release"
            ).unwrap_some(error="BAD_ADAPTER")
            sp.transfer(
                sp.record(
                    pack_contract=sp.self_address,
                    pack_token_id=params.token_id,
                    kind=params.kind,
                    resource_id=params.resource_id,
                    capacity=params.capacity,
                ),
                sp.mutez(0),
                release_handle,
            )

        @sp.entrypoint
        def set_pack_contents(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, SetPackContentsType)
            self._only_admin()
            assert params.token_id in self.data.packs, "NO_PACK"
            assert sp.len(params.contents_uri) > 0 and sp.len(params.contents_uri) <= 256, "BAD_CONTENTS_URI"
            pack = self.data.packs[params.token_id]
            assert not pack.cancelled, "PACK_CANCELLED"
            assert pack.blind, "NOT_BLIND"
            assert pack.contents_uri.is_none(), "CONTENTS_LOCKED"
            self.data.packs[params.token_id] = sp.record(
                mode=pack.mode,
                blind=pack.blind,
                item_count=pack.item_count,
                max_supply=pack.max_supply,
                committed_recipes=pack.committed_recipes,
                finalized=pack.finalized,
                cancelled=pack.cancelled,
                contents_uri=sp.Some(params.contents_uri),
            )

        @sp.entrypoint
        def mint(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, MintParamType)
            assert sp.sender == self.data.administrator or sp.sender in self.data.minters, "NOT_MINTER"
            assert params.token_id in self.data.packs, "FA2_TOKEN_UNDEFINED"
            pack = self.data.packs[params.token_id]
            assert pack.finalized and not pack.cancelled, "PACK_NOT_READY"
            assert params.amount > 0, "BAD_AMOUNT"
            minted = self.data.minted.get(params.token_id, default=sp.nat(0))
            assert minted + params.amount <= pack.max_supply, "SUPPLY_EXCEEDED"
            key = sp.record(owner=params.to_, token_id=params.token_id)
            self.data.ledger[key] = self.data.ledger.get(key, default=sp.nat(0)) + params.amount
            self.data.total_supply[params.token_id] = self.data.total_supply.get(
                params.token_id, default=sp.nat(0)
            ) + params.amount
            self.data.minted[params.token_id] = minted + params.amount

        @sp.entrypoint
        def set_sale(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, SetSaleType)
            self._only_admin()
            assert params.token_id in self.data.packs, "NO_PACK"
            pack = self.data.packs[params.token_id]
            assert pack.finalized and not pack.cancelled, "PACK_NOT_READY"
            assert params.sale.seller == sp.sender, "BAD_SELLER"
            if params.sale.start.is_some() and params.sale.end.is_some():
                assert params.sale.start.unwrap_some() <= params.sale.end.unwrap_some(), "BAD_WINDOW"
            seller_key = sp.record(owner=params.sale.seller, token_id=params.token_id)
            assert self.data.ledger.get(seller_key, default=sp.nat(0)) >= params.sale.remaining, "LOW_INVENTORY"
            self.data.sales[params.token_id] = params.sale

        @sp.entrypoint
        def set_sale_active(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, SetSaleActiveType)
            self._only_admin()
            assert params.token_id in self.data.sales, "NO_SALE"
            if params.active:
                assert not self.data.packs[params.token_id].cancelled, "PACK_CANCELLED"
            sale = self.data.sales[params.token_id]
            self.data.sales[params.token_id] = sp.record(
                active=params.active,
                seller=sale.seller,
                treasury=sale.treasury,
                price=sale.price,
                remaining=sale.remaining,
                start=sale.start,
                end=sale.end,
            )

        @sp.entrypoint
        def buy(self, params):
            sp.cast(params, BuyParamType)
            assert params.amount > 0, "BAD_AMOUNT"
            assert params.token_id in self.data.sales, "NO_SALE"
            assert not self.data.packs[params.token_id].cancelled, "PACK_CANCELLED"
            sale = self.data.sales[params.token_id]
            assert sale.active, "SALE_INACTIVE"
            if sale.start.is_some():
                assert sp.now >= sale.start.unwrap_some(), "NOT_STARTED"
            if sale.end.is_some():
                assert sp.now <= sale.end.unwrap_some(), "ENDED"
            assert sale.remaining >= params.amount, "SOLD_OUT"
            assert sp.amount == sp.split_tokens(sale.price, params.amount, 1), "BAD_PAYMENT"
            self._move(
                sp.record(
                    from_=sale.seller, to_=sp.sender, token_id=params.token_id, amount=params.amount
                )
            )
            self.data.sales[params.token_id] = sp.record(
                active=sale.active,
                seller=sale.seller,
                treasury=sale.treasury,
                price=sale.price,
                remaining=sp.as_nat(sale.remaining - params.amount),
                start=sale.start,
                end=sale.end,
            )
            # Tezos rejects a zero-mutez internal transaction. Free wrapper
            # sales are valid, so only emit the treasury transfer when the
            # buyer actually paid tez.
            if sp.amount > sp.mutez(0):
                sp.send(sale.treasury, sp.amount)

        @sp.entrypoint
        def add_minter(self, minter):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(minter, sp.address)
            self._only_admin()
            self.data.minters[minter] = ()

        @sp.entrypoint
        def remove_minter(self, minter):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(minter, sp.address)
            self._only_admin()
            if minter in self.data.minters:
                del self.data.minters[minter]

        @sp.entrypoint
        def set_token_metadata(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, SetTokenMetadataType)
            self._only_admin()
            assert params.token_id in self.data.token_metadata, "FA2_TOKEN_UNDEFINED"
            assert not self.data.packs[params.token_id].finalized, "METADATA_LOCKED"
            self.data.token_metadata[params.token_id] = sp.record(
                token_id=params.token_id, token_info=params.token_info
            )

        @sp.entrypoint
        def transfer_administration(self, pending_administrator):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(pending_administrator, sp.address)
            self._only_admin()
            self.data.pending_administrator = sp.Some(pending_administrator)

        @sp.entrypoint
        def accept_administration(self):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            assert self.data.pending_administrator.is_some(), "NO_PENDING_ADMIN"
            pending = self.data.pending_administrator.unwrap_some()
            assert sp.sender == pending, "NOT_PENDING_ADMIN"
            self.data.administrator = pending
            self.data.pending_administrator = sp.cast(None, sp.option[sp.address])

        @sp.onchain_view()
        def get_balance(self, params):
            sp.cast(params, LedgerKeyType)
            return self.data.ledger.get(params, default=sp.nat(0))

        @sp.onchain_view()
        def get_total_supply(self, token_id):
            sp.cast(token_id, sp.nat)
            return self.data.total_supply.get(token_id, default=sp.nat(0))

        @sp.onchain_view()
        def get_opened(self, token_id):
            sp.cast(token_id, sp.nat)
            return self.data.opened.get(token_id, default=sp.nat(0))

        @sp.onchain_view()
        def get_recipe_commitment(self, key):
            sp.cast(key, RecipeKeyType)
            return self.data.recipe_commitments.get(key, error="NO_RECIPE")


main = pasta_pack_router_main


def bytes_of_string(value):
    return sp.bytes("0x" + value.encode("utf-8").hex())


def pasta_pack_router_template():
    admin = sp.test_account("pasta_pack_admin")
    return main.PastaPackRouterFA2(
        admin.address, sp.big_map({"": bytes_of_string("ipfs://QmPastaPackRouterV2")})
    )


@sp.add_test()
def deploy_pasta_pack_router_template():
    scenario = sp.test_scenario("deploy_pasta_pack_router_template", main)
    scenario += pasta_pack_router_template()


@sp.add_test()
def bounded_pack_lifecycle_guards():
    scenario = sp.test_scenario("bounded_pack_lifecycle_guards", main)
    admin = sp.test_account("admin")
    alice = sp.test_account("alice")
    contract = main.PastaPackRouterFA2(
        admin.address, sp.big_map({"": bytes_of_string("ipfs://contract")})
    )
    scenario += contract

    config = sp.record(
        mode=sp.nat(2),
        blind=True,
        item_count=sp.nat(1),
        max_supply=sp.nat(1),
        committed_recipes=sp.nat(0),
        finalized=False,
        cancelled=False,
        contents_uri=sp.cast(None, sp.option[sp.bytes]),
    )
    contract.create_pack(
        sp.record(token_info={"": bytes_of_string("ipfs://wrapper")}, config=config),
        _sender=admin,
    )
    contract.mint(
        sp.record(to_=alice.address, token_id=0, amount=1), _sender=admin, _valid=False
    )
    contract.finalize_pack(0, _sender=admin, _valid=False)
    scenario.verify(contract.data.packs[0].blind)
    scenario.verify(contract.data.packs[0].mode == 2)
    scenario.verify(contract.data.packs[0].committed_recipes == 0)
