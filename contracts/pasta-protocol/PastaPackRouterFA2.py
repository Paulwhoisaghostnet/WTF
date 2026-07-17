# PastaPackRouterFA2 prototype v2
#
# Ravioli's pack contract. A wrapper is an enforceable, commitment-backed recipe rather than a token
# whose metadata merely names other tokens. Every opening atomically burns one wrapper and executes all
# recipe actions. Tezos reverts the entire operation group if any child transfer or adapter mint fails.
#
# Three composable fulfillment primitives cover all Ravioli products:
#   escrow          - transfer an existing FA2 asset from pack-specific custody
#   allocated_mint  - exercise reserved capacity through an authorized delivery adapter
#   generative_mint - invoke a generative adapter that creates the iteration during opening
#
# A recipe is committed before wrappers can mint. The nonce keeps blind recipes private until opening;
# the hash makes creator-side allocation tamper-evident. This is not advertised as unbiased randomness.

import smartpy as sp


@sp.module
def main():
    LedgerKeyType: type = sp.record(owner=sp.address, token_id=sp.nat)
    OperatorKeyType: type = sp.record(owner=sp.address, operator=sp.address, token_id=sp.nat)
    BalanceOfRequestType: type = sp.record(owner=sp.address, token_id=sp.nat)
    BalanceOfResponseType: type = sp.record(request=BalanceOfRequestType, balance=sp.nat)
    OperatorParamType: type = sp.variant(add_operator=OperatorKeyType, remove_operator=OperatorKeyType)
    TransferTxType: type = sp.record(to_=sp.address, token_id=sp.nat, amount=sp.nat)
    TransferBatchItemType: type = sp.record(from_=sp.address, txs=sp.list[TransferTxType])
    TokenMetadataType: type = sp.record(token_id=sp.nat, token_info=sp.map[sp.string, sp.bytes])
    MintParamType: type = sp.record(to_=sp.address, token_id=sp.nat, amount=sp.nat)
    BurnParamType: type = sp.record(token_id=sp.nat, amount=sp.nat)
    SetTokenMetadataType: type = sp.record(token_id=sp.nat, token_info=sp.map[sp.string, sp.bytes])

    EscrowActionType: type = sp.record(fa2=sp.address, token_id=sp.nat, amount=sp.nat)
    AdapterActionType: type = sp.record(adapter=sp.address, payload=sp.bytes)
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
        recipe_commitment=sp.bytes,
        contents_uri=sp.option[sp.bytes],
        finalized=sp.bool,
        cancelled=sp.bool,
    )
    CreatePackType: type = sp.record(token_info=sp.map[sp.string, sp.bytes], config=PackConfigType)
    OpenPackType: type = sp.record(token_id=sp.nat, nonce=sp.bytes, actions=sp.list[RecipeActionType])
    AssetKeyType: type = sp.record(pack_token_id=sp.nat, fa2=sp.address, asset_token_id=sp.nat)
    AssetFundingType: type = sp.record(fa2=sp.address, token_id=sp.nat, amount=sp.nat)
    AdapterKeyType: type = sp.record(
        pack_token_id=sp.nat,
        adapter=sp.address,
        kind=sp.nat,
        payload_commitment=sp.bytes,
    )
    AdapterReservationType: type = sp.record(
        adapter=sp.address,
        kind=sp.nat,
        payload_commitment=sp.bytes,
        capacity=sp.nat,
    )
    FinalizePackType: type = sp.record(
        token_id=sp.nat,
        assets=sp.list[AssetFundingType],
        adapters=sp.list[AdapterReservationType],
    )
    AdapterReserveParamType: type = sp.record(
        pack_contract=sp.address,
        pack_token_id=sp.nat,
        kind=sp.nat,
        payload_commitment=sp.bytes,
        capacity=sp.nat,
    )
    AdapterFulfillParamType: type = sp.record(
        recipient=sp.address,
        pack_contract=sp.address,
        pack_token_id=sp.nat,
        open_serial=sp.nat,
        payload=sp.bytes,
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

    class PastaBundleFA2(sp.Contract):
        def __init__(self, administrator, metadata):
            self.data.administrator = sp.cast(administrator, sp.address)
            self.data.pending_administrator = sp.cast(None, sp.option[sp.address])
            self.data.metadata = sp.cast(metadata, sp.big_map[sp.string, sp.bytes])
            self.data.ledger = sp.cast(sp.big_map(), sp.big_map[LedgerKeyType, sp.nat])
            self.data.operators = sp.cast(sp.big_map(), sp.big_map[OperatorKeyType, sp.unit])
            self.data.token_metadata = sp.cast(sp.big_map(), sp.big_map[sp.nat, TokenMetadataType])
            self.data.total_supply = sp.cast(sp.big_map(), sp.big_map[sp.nat, sp.nat])
            self.data.packs = sp.cast(sp.big_map(), sp.big_map[sp.nat, PackConfigType])
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
        def _transfer_wrapper(self, params):
            sp.cast(params, sp.record(from_=sp.address, to_=sp.address, token_id=sp.nat, amount=sp.nat))
            from_key = sp.record(owner=params.from_, token_id=params.token_id)
            from_balance = self.data.ledger.get(from_key, default=sp.nat(0))
            assert from_balance >= params.amount, "LOW_BALANCE"
            remaining = sp.as_nat(from_balance - params.amount)
            if remaining == 0:
                if from_key in self.data.ledger:
                    del self.data.ledger[from_key]
            else:
                self.data.ledger[from_key] = remaining
            to_key = sp.record(owner=params.to_, token_id=params.token_id)
            self.data.ledger[to_key] = self.data.ledger.get(to_key, default=sp.nat(0)) + params.amount

        @sp.entrypoint
        def balance_of(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, sp.record(requests=sp.list[BalanceOfRequestType], callback=sp.contract[sp.list[BalanceOfResponseType]]))
            responses = []
            for req in params.requests:
                responses.push(sp.record(request=req, balance=self.data.ledger.get(sp.record(owner=req.owner, token_id=req.token_id), default=sp.nat(0))))
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
                        assert sp.record(owner=item.from_, operator=sp.sender, token_id=tx.token_id) in self.data.operators, "NOT_OPERATOR"
                    assert tx.amount > 0, "BAD_AMOUNT"
                    self._transfer_wrapper(sp.record(from_=item.from_, to_=tx.to_, token_id=tx.token_id, amount=tx.amount))

        @sp.entrypoint
        def create_pack(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, CreatePackType)
            self._only_admin()
            assert params.config.mode <= 4, "BAD_MODE"
            assert params.config.item_count > 0, "EMPTY_RECIPE"
            assert params.config.max_supply > 0, "BAD_SUPPLY"
            assert not params.config.finalized and not params.config.cancelled, "BAD_INITIAL_STATE"
            token_id = self.data.next_token_id
            self.data.token_metadata[token_id] = sp.record(token_id=token_id, token_info=params.token_info)
            self.data.total_supply[token_id] = 0
            self.data.minted[token_id] = 0
            self.data.opened[token_id] = 0
            self.data.packs[token_id] = params.config
            self.data.next_token_id += 1

        @sp.entrypoint
        def finalize_pack(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, FinalizePackType)
            self._only_admin()
            assert params.token_id in self.data.packs, "NO_PACK"
            pack = self.data.packs[params.token_id]
            assert not pack.finalized and not pack.cancelled, "PACK_LOCKED"
            for asset in params.assets:
                assert asset.amount > 0, "BAD_ASSET_AMOUNT"
                key = sp.record(pack_token_id=params.token_id, fa2=asset.fa2, asset_token_id=asset.token_id)
                assert self.data.asset_allowances.get(key, default=sp.nat(0)) == 0, "DUPLICATE_ASSET"
                self.data.asset_allowances[key] = asset.amount
                transfer_handle = sp.contract(sp.list[TransferBatchItemType], asset.fa2, "transfer").unwrap_some(error="BAD_FA2")
                sp.transfer([sp.record(from_=sp.sender, txs=[sp.record(to_=sp.self_address, token_id=asset.token_id, amount=asset.amount)])], sp.mutez(0), transfer_handle)
            for reservation in params.adapters:
                assert reservation.kind == 1 or reservation.kind == 2, "BAD_ADAPTER_KIND"
                assert reservation.capacity > 0, "BAD_CAPACITY"
                key = sp.record(pack_token_id=params.token_id, adapter=reservation.adapter, kind=reservation.kind, payload_commitment=reservation.payload_commitment)
                assert self.data.adapter_allowances.get(key, default=sp.nat(0)) == 0, "DUPLICATE_ADAPTER"
                self.data.adapter_allowances[key] = reservation.capacity
                reserve_handle = sp.contract(AdapterReserveParamType, reservation.adapter, "reserve").unwrap_some(error="BAD_ADAPTER")
                sp.transfer(sp.record(pack_contract=sp.self_address, pack_token_id=params.token_id, kind=reservation.kind, payload_commitment=reservation.payload_commitment, capacity=reservation.capacity), sp.mutez(0), reserve_handle)
            self.data.packs[params.token_id] = sp.record(mode=pack.mode, blind=pack.blind, item_count=pack.item_count, max_supply=pack.max_supply, recipe_commitment=pack.recipe_commitment, contents_uri=pack.contents_uri, finalized=True, cancelled=False)

        @sp.entrypoint
        def open_pack(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, OpenPackType)
            assert params.token_id in self.data.packs, "NO_PACK"
            pack = self.data.packs[params.token_id]
            assert pack.finalized and not pack.cancelled, "PACK_NOT_READY"
            assert sp.len(params.actions) == pack.item_count, "BAD_ITEM_COUNT"
            assert sp.blake2b(sp.pack(sp.record(nonce=params.nonce, actions=params.actions))) == pack.recipe_commitment, "BAD_RECIPE"
            holder_key = sp.record(owner=sp.sender, token_id=params.token_id)
            assert self.data.ledger.get(holder_key, default=sp.nat(0)) >= 1, "LOW_BALANCE"
            serial = self.data.opened.get(params.token_id, default=sp.nat(0))
            for action in params.actions:
                match action:
                    case escrow(asset):
                        assert asset.amount > 0, "BAD_ASSET_AMOUNT"
                        key = sp.record(pack_token_id=params.token_id, fa2=asset.fa2, asset_token_id=asset.token_id)
                        available = self.data.asset_allowances.get(key, default=sp.nat(0))
                        assert available >= asset.amount, "ASSET_UNDERFUNDED"
                        self.data.asset_allowances[key] = sp.as_nat(available - asset.amount)
                        transfer_handle = sp.contract(sp.list[TransferBatchItemType], asset.fa2, "transfer").unwrap_some(error="BAD_FA2")
                        sp.transfer([sp.record(from_=sp.self_address, txs=[sp.record(to_=sp.sender, token_id=asset.token_id, amount=asset.amount)])], sp.mutez(0), transfer_handle)
                    case allocated_mint(mint_action):
                        payload_commitment = sp.blake2b(mint_action.payload)
                        key = sp.record(pack_token_id=params.token_id, adapter=mint_action.adapter, kind=sp.nat(1), payload_commitment=payload_commitment)
                        available = self.data.adapter_allowances.get(key, default=sp.nat(0))
                        assert available >= 1, "ALLOCATION_UNDERFUNDED"
                        self.data.adapter_allowances[key] = sp.as_nat(available - 1)
                        fulfill_handle = sp.contract(AdapterFulfillParamType, mint_action.adapter, "fulfill").unwrap_some(error="BAD_ADAPTER")
                        sp.transfer(sp.record(recipient=sp.sender, pack_contract=sp.self_address, pack_token_id=params.token_id, open_serial=serial, payload=mint_action.payload), sp.mutez(0), fulfill_handle)
                    case generative_mint(mint_action):
                        payload_commitment = sp.blake2b(mint_action.payload)
                        key = sp.record(pack_token_id=params.token_id, adapter=mint_action.adapter, kind=sp.nat(2), payload_commitment=payload_commitment)
                        available = self.data.adapter_allowances.get(key, default=sp.nat(0))
                        assert available >= 1, "GENERATOR_UNDERFUNDED"
                        self.data.adapter_allowances[key] = sp.as_nat(available - 1)
                        fulfill_handle = sp.contract(AdapterFulfillParamType, mint_action.adapter, "fulfill").unwrap_some(error="BAD_ADAPTER")
                        sp.transfer(sp.record(recipient=sp.sender, pack_contract=sp.self_address, pack_token_id=params.token_id, open_serial=serial, payload=mint_action.payload), sp.mutez(0), fulfill_handle)
            self._transfer_wrapper(sp.record(from_=sp.sender, to_=sp.self_address, token_id=params.token_id, amount=1))
            del self.data.ledger[sp.record(owner=sp.self_address, token_id=params.token_id)]
            self.data.total_supply[params.token_id] = sp.as_nat(self.data.total_supply[params.token_id] - 1)
            self.data.opened[params.token_id] = serial + 1
            self.data.opened_by[holder_key] = self.data.opened_by.get(holder_key, default=sp.nat(0)) + 1

        @sp.entrypoint
        def set_pack_contents(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, SetPackContentsType)
            self._only_admin()
            assert params.token_id in self.data.packs, "NO_PACK"
            pack = self.data.packs[params.token_id]
            self.data.packs[params.token_id] = sp.record(mode=pack.mode, blind=pack.blind, item_count=pack.item_count, max_supply=pack.max_supply, recipe_commitment=pack.recipe_commitment, contents_uri=sp.Some(params.contents_uri), finalized=pack.finalized, cancelled=pack.cancelled)

        @sp.entrypoint
        def mint(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, MintParamType)
            assert sp.sender == self.data.administrator or sp.sender in self.data.minters, "NOT_MINTER"
            assert params.token_id in self.data.packs, "NO_PACK"
            pack = self.data.packs[params.token_id]
            assert pack.finalized and not pack.cancelled, "PACK_NOT_READY"
            assert params.amount > 0, "BAD_AMOUNT"
            minted = self.data.minted.get(params.token_id, default=sp.nat(0))
            assert minted + params.amount <= pack.max_supply, "SUPPLY_EXCEEDED"
            key = sp.record(owner=params.to_, token_id=params.token_id)
            self.data.ledger[key] = self.data.ledger.get(key, default=sp.nat(0)) + params.amount
            self.data.total_supply[params.token_id] = self.data.total_supply.get(params.token_id, default=sp.nat(0)) + params.amount
            self.data.minted[params.token_id] = minted + params.amount

        @sp.entrypoint
        def burn(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, BurnParamType)
            assert params.amount > 0, "BAD_AMOUNT"
            self._transfer_wrapper(sp.record(from_=sp.sender, to_=sp.self_address, token_id=params.token_id, amount=params.amount))
            del self.data.ledger[sp.record(owner=sp.self_address, token_id=params.token_id)]
            self.data.total_supply[params.token_id] = sp.as_nat(self.data.total_supply[params.token_id] - params.amount)

        @sp.entrypoint
        def set_sale(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, SetSaleType)
            self._only_admin()
            assert params.token_id in self.data.packs, "NO_PACK"
            assert self.data.packs[params.token_id].finalized, "PACK_NOT_READY"
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
            sale = self.data.sales[params.token_id]
            self.data.sales[params.token_id] = sp.record(active=params.active, seller=sale.seller, treasury=sale.treasury, price=sale.price, remaining=sale.remaining, start=sale.start, end=sale.end)

        @sp.entrypoint
        def buy(self, params):
            sp.cast(params, BuyParamType)
            assert params.amount > 0, "BAD_AMOUNT"
            assert params.token_id in self.data.sales, "NO_SALE"
            sale = self.data.sales[params.token_id]
            assert sale.active, "SALE_INACTIVE"
            if sale.start.is_some():
                assert sp.now >= sale.start.unwrap_some(), "NOT_STARTED"
            if sale.end.is_some():
                assert sp.now <= sale.end.unwrap_some(), "ENDED"
            assert sale.remaining >= params.amount, "SOLD_OUT"
            assert sp.amount == sp.split_tokens(sale.price, params.amount, 1), "BAD_PAYMENT"
            self._transfer_wrapper(sp.record(from_=sale.seller, to_=sp.sender, token_id=params.token_id, amount=params.amount))
            self.data.sales[params.token_id] = sp.record(active=sale.active, seller=sale.seller, treasury=sale.treasury, price=sale.price, remaining=sp.as_nat(sale.remaining - params.amount), start=sale.start, end=sale.end)
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
            assert params.token_id in self.data.token_metadata, "TOKEN_UNDEFINED"
            self.data.token_metadata[params.token_id] = sp.record(token_id=params.token_id, token_info=params.token_info)

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

        @sp.onchain_view
        def get_balance(self, params):
            sp.cast(params, LedgerKeyType)
            return self.data.ledger.get(params, default=sp.nat(0))

        @sp.onchain_view
        def get_total_supply(self, token_id):
            sp.cast(token_id, sp.nat)
            return self.data.total_supply.get(token_id, default=sp.nat(0))

        @sp.onchain_view
        def get_opened(self, token_id):
            sp.cast(token_id, sp.nat)
            return self.data.opened.get(token_id, default=sp.nat(0))


def bytes_of_string(value):
    return sp.bytes("0x" + value.encode("utf-8").hex())


def pasta_bundle_template():
    admin = sp.test_account("pasta_bundle_admin")
    return main.PastaBundleFA2(admin.address, sp.big_map({"": bytes_of_string("ipfs://QmPastaBundleV2")}))


@sp.add_test()
def deploy_pasta_bundle_template():
    scenario = sp.test_scenario("deploy_pasta_bundle_template", main)
    scenario += pasta_bundle_template()


@sp.add_test()
def pack_lifecycle_guards():
    scenario = sp.test_scenario("pack_lifecycle_guards", main)
    admin = sp.test_account("admin")
    alice = sp.test_account("alice")
    contract = main.PastaBundleFA2(admin.address, sp.big_map({"": bytes_of_string("ipfs://contract")}))
    scenario += contract
    actions = [sp.variant.allocated_mint(sp.record(adapter=admin.address, payload=bytes_of_string("allocation-7")))]
    nonce = bytes_of_string("secret")
    commitment = sp.blake2b(sp.pack(sp.record(nonce=nonce, actions=actions)))
    config = sp.record(mode=sp.nat(2), blind=True, item_count=sp.nat(1), max_supply=sp.nat(1), recipe_commitment=commitment, contents_uri=sp.cast(None, sp.option[sp.bytes]), finalized=False, cancelled=False)
    contract.create_pack(sp.record(token_info={"": bytes_of_string("ipfs://wrapper")}, config=config), _sender=admin)
    contract.mint(sp.record(to_=alice.address, token_id=0, amount=1), _sender=admin, _valid=False)
    scenario.verify(contract.data.packs[0].blind)
    scenario.verify(contract.data.packs[0].mode == 2)
