# PastaOpenEditionFA2
#
# Pasta Protocol — open-edition FA2 collection used by Gnocchi to publish open editions with
# timed / forever / supply-limited / bonding-curve pricing and a public, payable mint surface.
#
# Forked from PastaStandardCollectionFA2 (same proven SmartPy 0.24.x `assert` syntax + FA2 core) with
# the open-edition sale module added:
#   - per-token `sales` config (active, window, base_price, increment, step_size, min/max clamps,
#     max_supply, treasury) plus an optional immutable issuance-policy lock
#   - one FA2 can hold timed uncapped OEs, forever OEs, and capped timed LEs as independent token ids
#   - cumulative `total_minted` accounting keeps burns from reopening a declared edition cap or rewinding
#     the bonding curve
#   - creator reserves are declared and minted atomically when an edition is registered
#   - public payable `open_mint` priced along a bonding curve that steps BETWEEN calls (flat unit price
#     per call), matching shared/pasta-protocol/pricing.ts (`priceAtSupply` / `costForBatch`) exactly so
#     the studio preview and on-chain charge agree.
#   - proceeds forwarded to the sale treasury via `sp.send` (proven Macaroni pattern). Lesson from
#     Bowers: never fake on-chain success — `open_mint` reverts on bad payment / closed sale / sold out.
#
# The shared contracts/fa2-templates/* sources (used by the Kiln factory) are intentionally untouched.
#
# Compliant with: TZIP-12 (FA2 multi-asset), TZIP-16 (contract metadata), TZIP-21 (token metadata).

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
    SetTokenMetadataType: type = sp.record(token_id=sp.nat, token_info=sp.map[sp.string, sp.bytes])
    BurnParamType: type = sp.record(token_id=sp.nat, amount=sp.nat)

    # Open-edition sale configuration (per token id).
    SaleConfigType: type = sp.record(
        active=sp.bool,
        start=sp.option[sp.timestamp],
        end=sp.option[sp.timestamp],
        base_price=sp.mutez,
        increment=sp.mutez,  # mutez added per price step (ascending/flat in MVP)
        step_size=sp.nat,  # editions per price step (>= 1)
        min_price=sp.option[sp.mutez],
        max_price=sp.option[sp.mutez],
        max_supply=sp.option[sp.nat],
        treasury=sp.address,
    )
    CreateOpenEditionType: type = sp.record(
        token_info=sp.map[sp.string, sp.bytes],
        sale=SaleConfigType,
        creator_reserve=sp.nat,
        lock_policy=sp.bool,
    )
    SetSaleType: type = sp.record(token_id=sp.nat, sale=SaleConfigType)
    SetSaleActiveType: type = sp.record(token_id=sp.nat, active=sp.bool)
    OpenMintType: type = sp.record(token_id=sp.nat, amount=sp.nat)

    class PastaOpenEditionFA2(sp.Contract):
        def __init__(self, administrator, metadata):
            self.data.administrator = sp.cast(administrator, sp.address)
            self.data.pending_administrator = sp.cast(None, sp.option[sp.address])
            self.data.metadata = sp.cast(metadata, sp.big_map[sp.string, sp.bytes])
            self.data.ledger = sp.cast(sp.big_map(), sp.big_map[LedgerKeyType, sp.nat])
            self.data.operators = sp.cast(sp.big_map(), sp.big_map[OperatorKeyType, sp.unit])
            self.data.token_metadata = sp.cast(sp.big_map(), sp.big_map[sp.nat, TokenMetadataType])
            self.data.total_supply = sp.cast(sp.big_map(), sp.big_map[sp.nat, sp.nat])
            self.data.total_minted = sp.cast(sp.big_map(), sp.big_map[sp.nat, sp.nat])
            self.data.sales = sp.cast(sp.big_map(), sp.big_map[sp.nat, SaleConfigType])
            self.data.policy_locked = sp.cast(sp.big_map(), sp.big_map[sp.nat, sp.bool])
            self.data.minters = sp.cast(sp.big_map(), sp.big_map[sp.address, sp.unit])
            self.data.next_token_id = sp.nat(0)

        @sp.private(with_storage="read-only")
        def _only_admin(self):
            assert sp.sender == self.data.administrator, "NOT_ADMIN"

        @sp.private(with_storage="read-only")
        def _assert_sale_valid(self, sale):
            sp.cast(sale, SaleConfigType)
            assert sale.step_size > 0, "BAD_STEP"
            if sale.start.is_some() and sale.end.is_some():
                assert sale.start.unwrap_some() <= sale.end.unwrap_some(), "BAD_WINDOW"

        @sp.private(with_storage="read-only")
        def _assert_issuance_open(self, sale):
            sp.cast(sale, SaleConfigType)
            assert sale.active, "SALE_INACTIVE"
            if sale.start.is_some():
                assert sp.now >= sale.start.unwrap_some(), "NOT_STARTED"
            if sale.end.is_some():
                assert sp.now <= sale.end.unwrap_some(), "ENDED"

        @sp.private(with_storage="read-only")
        def _unit_price(self, params):
            # price = clamp(base_price + increment * floor(minted / step_size)). step_size 0 -> flat.
            sp.cast(params, sp.record(sale=SaleConfigType, minted=sp.nat))
            sale = params.sale
            steps = sp.nat(0)
            match sp.ediv(params.minted, sale.step_size):
                case Some(qr):
                    steps = sp.fst(qr)
                case None:
                    steps = sp.nat(0)
            unit = sale.base_price + sp.split_tokens(sale.increment, steps, 1)
            if sale.min_price.is_some():
                if unit < sale.min_price.unwrap_some():
                    unit = sale.min_price.unwrap_some()
            if sale.max_price.is_some():
                if unit > sale.max_price.unwrap_some():
                    unit = sale.max_price.unwrap_some()
            return unit

        # ---- FA2 standard ----

        @sp.entrypoint
        def balance_of(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(
                params,
                sp.record(
                    requests=sp.list[BalanceOfRequestType],
                    callback=sp.contract[sp.list[BalanceOfResponseType]],
                ),
            )
            responses = []
            for req in params.requests:
                responses.push(
                    sp.record(
                        request=sp.record(owner=req.owner, token_id=req.token_id),
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

        # ---- Open editions ----

        @sp.entrypoint
        def create_open_edition(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, CreateOpenEditionType)
            self._only_admin()
            self._assert_sale_valid(params.sale)
            if params.sale.max_supply.is_some():
                assert params.creator_reserve <= params.sale.max_supply.unwrap_some(), "RESERVE_EXCEEDS_CAP"
            token_id = self.data.next_token_id
            self.data.token_metadata[token_id] = sp.record(token_id=token_id, token_info=params.token_info)
            self.data.total_supply[token_id] = params.creator_reserve
            self.data.total_minted[token_id] = params.creator_reserve
            self.data.sales[token_id] = params.sale
            self.data.policy_locked[token_id] = params.lock_policy
            if params.creator_reserve > 0:
                reserve_key = sp.record(owner=self.data.administrator, token_id=token_id)
                self.data.ledger[reserve_key] = params.creator_reserve
            self.data.next_token_id += 1

        @sp.entrypoint
        def set_sale(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, SetSaleType)
            self._only_admin()
            assert params.token_id in self.data.token_metadata, "TOKEN_UNDEFINED"
            self._assert_sale_valid(params.sale)
            issued = self.data.total_minted.get(params.token_id, default=sp.nat(0))
            if params.sale.max_supply.is_some():
                assert params.sale.max_supply.unwrap_some() >= issued, "CAP_BELOW_MINTED"
            if self.data.policy_locked.get(params.token_id, default=False):
                current = self.data.sales[params.token_id]
                assert params.sale.start == current.start, "POLICY_LOCKED"
                assert params.sale.end == current.end, "POLICY_LOCKED"
                assert params.sale.max_supply == current.max_supply, "POLICY_LOCKED"
            self.data.sales[params.token_id] = params.sale

        @sp.entrypoint
        def lock_sale_policy(self, token_id):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(token_id, sp.nat)
            self._only_admin()
            assert token_id in self.data.sales, "NO_SALE"
            self.data.policy_locked[token_id] = True

        @sp.entrypoint
        def set_sale_active(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, SetSaleActiveType)
            self._only_admin()
            assert params.token_id in self.data.sales, "NO_SALE"
            sale = self.data.sales[params.token_id]
            self.data.sales[params.token_id] = sp.record(
                active=params.active,
                start=sale.start,
                end=sale.end,
                base_price=sale.base_price,
                increment=sale.increment,
                step_size=sale.step_size,
                min_price=sale.min_price,
                max_price=sale.max_price,
                max_supply=sale.max_supply,
                treasury=sale.treasury,
            )

        @sp.entrypoint
        def open_mint(self, params):
            sp.cast(params, OpenMintType)
            assert params.amount > 0, "BAD_AMOUNT"
            assert params.token_id in self.data.sales, "NO_SALE"
            sale = self.data.sales[params.token_id]
            self._assert_issuance_open(sale)
            minted = self.data.total_minted.get(params.token_id, default=sp.nat(0))
            if sale.max_supply.is_some():
                assert minted + params.amount <= sale.max_supply.unwrap_some(), "SOLD_OUT"
            unit = self._unit_price(sp.record(sale=sale, minted=minted))
            expected = sp.split_tokens(unit, params.amount, 1)
            assert sp.amount == expected, "BAD_PAYMENT"
            to_key = sp.record(owner=sp.sender, token_id=params.token_id)
            self.data.ledger[to_key] = self.data.ledger.get(to_key, default=sp.nat(0)) + params.amount
            self.data.total_supply[params.token_id] = self.data.total_supply.get(
                params.token_id, default=sp.nat(0)
            ) + params.amount
            self.data.total_minted[params.token_id] = minted + params.amount
            sp.send(sale.treasury, sp.amount)

        @sp.entrypoint
        def mint(self, params):
            # Admin / delegated free mint (artist proofs); the public priced path is open_mint.
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, MintParamType)
            assert sp.sender == self.data.administrator or sp.sender in self.data.minters, "NOT_MINTER"
            assert params.token_id in self.data.token_metadata, "TOKEN_UNDEFINED"
            assert params.amount > 0, "BAD_AMOUNT"
            current_supply = self.data.total_supply.get(params.token_id, default=sp.nat(0))
            issued = self.data.total_minted.get(params.token_id, default=sp.nat(0))
            if params.token_id in self.data.sales:
                sale = self.data.sales[params.token_id]
                if self.data.policy_locked.get(params.token_id, default=False):
                    self._assert_issuance_open(sale)
                if sale.max_supply.is_some():
                    assert issued + params.amount <= sale.max_supply.unwrap_some(), "SOLD_OUT"
            to_key = sp.record(owner=params.to_, token_id=params.token_id)
            self.data.ledger[to_key] = self.data.ledger.get(to_key, default=sp.nat(0)) + params.amount
            self.data.total_supply[params.token_id] = current_supply + params.amount
            self.data.total_minted[params.token_id] = issued + params.amount

        @sp.entrypoint
        def burn(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, BurnParamType)
            assert params.amount > 0, "BAD_AMOUNT"
            from_key = sp.record(owner=sp.sender, token_id=params.token_id)
            from_bal = self.data.ledger.get(from_key, default=sp.nat(0))
            assert from_bal >= params.amount, "LOW_BALANCE"
            next_from = sp.as_nat(from_bal - params.amount)
            if next_from == 0:
                if from_key in self.data.ledger:
                    del self.data.ledger[from_key]
            else:
                self.data.ledger[from_key] = next_from
            cur_supply = self.data.total_supply.get(params.token_id, default=sp.nat(0))
            self.data.total_supply[params.token_id] = sp.as_nat(cur_supply - params.amount)

        # ---- Admin ----

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

        # ---- Views ----

        @sp.onchain_view
        def get_balance(self, params):
            sp.cast(params, sp.record(owner=sp.address, token_id=sp.nat))
            return self.data.ledger.get(
                sp.record(owner=params.owner, token_id=params.token_id), default=sp.nat(0)
            )

        @sp.onchain_view
        def get_total_supply(self, token_id):
            sp.cast(token_id, sp.nat)
            return self.data.total_supply.get(token_id, default=sp.nat(0))

        @sp.onchain_view
        def get_total_minted(self, token_id):
            sp.cast(token_id, sp.nat)
            return self.data.total_minted.get(token_id, default=sp.nat(0))

        @sp.onchain_view
        def current_price(self, token_id):
            # Unit price (mutez) at current supply for the next open_mint call.
            sp.cast(token_id, sp.nat)
            assert token_id in self.data.sales, "NO_SALE"
            sale = self.data.sales[token_id]
            minted = self.data.total_minted.get(token_id, default=sp.nat(0))
            return self._unit_price(sp.record(sale=sale, minted=minted))


def bytes_of_string(s):
    return sp.bytes("0x" + s.encode("utf-8").hex())


def pasta_open_edition_template():
    admin = sp.test_account("pasta_open_edition_admin")
    metadata = sp.big_map({"": bytes_of_string("ipfs://QmPastaOpenEditionMetadataTemplate")})
    return main.PastaOpenEditionFA2(administrator=admin.address, metadata=metadata)


@sp.add_test()
def deploy_pasta_open_edition_template():
    scenario = sp.test_scenario("deploy_pasta_open_edition_template", main)
    c = pasta_open_edition_template()
    scenario += c


@sp.add_test()
def test():
    scenario = sp.test_scenario("PastaOpenEditionFA2", main)
    admin = sp.test_account("admin")
    treasury = sp.test_account("treasury")
    alice = sp.test_account("alice")
    bob = sp.test_account("bob")

    metadata = sp.big_map({"": bytes_of_string("ipfs://QmContract")})
    c = main.PastaOpenEditionFA2(administrator=admin.address, metadata=metadata)
    scenario += c

    timed_sale = sp.record(
        active=True,
        start=sp.some(sp.timestamp(100)),
        end=sp.some(sp.timestamp(200)),
        base_price=sp.tez(1),
        increment=sp.mutez(500000),
        step_size=sp.nat(2),
        min_price=sp.none,
        max_price=sp.none,
        max_supply=sp.none,
        treasury=treasury.address,
    )

    scenario.h2("Token 0 is a locked timed OE with no supply ceiling")
    c.create_open_edition(
        sp.record(
            token_info={"": bytes_of_string("ipfs://QmTimedOE")},
            sale=timed_sale,
            creator_reserve=sp.nat(0),
            lock_policy=True,
        ),
        _sender=admin,
    )
    scenario.verify(c.data.next_token_id == 1)
    scenario.verify(c.current_price(0) == sp.tez(1))
    c.open_mint(
        sp.record(token_id=0, amount=1),
        _sender=alice,
        _amount=sp.tez(1),
        _now=sp.timestamp(99),
        _valid=False,
    )
    c.open_mint(
        sp.record(token_id=0, amount=2),
        _sender=alice,
        _amount=sp.tez(2),
        _now=sp.timestamp(150),
    )
    scenario.verify(c.data.ledger[sp.record(owner=alice.address, token_id=0)] == 2)
    scenario.verify(c.data.total_supply[0] == 2)
    scenario.verify(c.data.total_minted[0] == 2)
    scenario.verify(c.current_price(0) == sp.mutez(1500000))
    c.mint(
        sp.record(to_=bob.address, token_id=0, amount=1),
        _sender=admin,
        _now=sp.timestamp(201),
        _valid=False,
    )
    c.set_sale(
        sp.record(
            token_id=0,
            sale=sp.record(
                active=True,
                start=sp.some(sp.timestamp(100)),
                end=sp.some(sp.timestamp(201)),
                base_price=sp.tez(1),
                increment=sp.mutez(0),
                step_size=sp.nat(1),
                min_price=sp.none,
                max_price=sp.none,
                max_supply=sp.none,
                treasury=treasury.address,
            ),
        ),
        _sender=admin,
        _valid=False,
    )

    scenario.h2("Token 1 is a locked forever OE that can be vaulted and reopened")
    forever_sale = sp.record(
        active=True,
        start=sp.none,
        end=sp.none,
        base_price=sp.mutez(250000),
        increment=sp.mutez(0),
        step_size=sp.nat(1),
        min_price=sp.none,
        max_price=sp.none,
        max_supply=sp.none,
        treasury=treasury.address,
    )
    c.create_open_edition(
        sp.record(
            token_info={"": bytes_of_string("ipfs://QmForeverOE")},
            sale=forever_sale,
            creator_reserve=sp.nat(0),
            lock_policy=True,
        ),
        _sender=admin,
    )
    c.open_mint(
        sp.record(token_id=1, amount=1),
        _sender=alice,
        _amount=sp.mutez(250000),
        _now=sp.timestamp(1000),
    )
    scenario.verify(c.data.total_supply[1] == 1)

    scenario.h2("Only the admin can vault; vault blocks public issuance")
    c.set_sale_active(sp.record(token_id=1, active=False), _sender=alice, _valid=False)
    c.set_sale_active(sp.record(token_id=1, active=False), _sender=admin)
    c.open_mint(
        sp.record(token_id=1, amount=1),
        _sender=bob,
        _amount=sp.mutez(250000),
        _valid=False,
    )
    scenario.verify(c.data.total_supply[1] == 1)

    scenario.h2("Unvault resumes the same forever OE without changing prior supply")
    c.set_sale_active(sp.record(token_id=1, active=True), _sender=admin)
    c.open_mint(
        sp.record(token_id=1, amount=1),
        _sender=bob,
        _amount=sp.mutez(250000),
        _now=sp.timestamp(1000000),
    )
    scenario.verify(c.data.total_supply[1] == 2)
    scenario.verify(c.data.ledger[sp.record(owner=alice.address, token_id=1)] == 1)
    scenario.verify(c.data.ledger[sp.record(owner=bob.address, token_id=1)] == 1)

    scenario.h2("Token 2 is a locked timed LE with a creator reserve inside its lifetime cap")
    limited_sale = sp.record(
        active=True,
        start=sp.some(sp.timestamp(100)),
        end=sp.some(sp.timestamp(200)),
        base_price=sp.mutez(500000),
        increment=sp.mutez(0),
        step_size=sp.nat(1),
        min_price=sp.none,
        max_price=sp.none,
        max_supply=sp.some(sp.nat(3)),
        treasury=treasury.address,
    )
    c.create_open_edition(
        sp.record(
            token_info={"": bytes_of_string("ipfs://QmLimited")},
            sale=limited_sale,
            creator_reserve=sp.nat(1),
            lock_policy=True,
        ),
        _sender=admin,
    )
    scenario.verify(c.data.ledger[sp.record(owner=admin.address, token_id=2)] == 1)
    scenario.verify(c.data.total_supply[2] == 1)
    scenario.verify(c.data.total_minted[2] == 1)
    c.open_mint(
        sp.record(token_id=2, amount=1),
        _sender=alice,
        _amount=sp.mutez(500000),
        _now=sp.timestamp(150),
    )
    c.open_mint(
        sp.record(token_id=2, amount=1),
        _sender=bob,
        _amount=sp.mutez(500000),
        _now=sp.timestamp(150),
    )
    c.burn(sp.record(token_id=2, amount=1), _sender=alice)
    scenario.verify(c.data.total_supply[2] == 2)
    scenario.verify(c.data.total_minted[2] == 3)
    c.open_mint(
        sp.record(token_id=2, amount=1),
        _sender=alice,
        _amount=sp.mutez(500000),
        _now=sp.timestamp(150),
        _valid=False,
    )
    c.set_sale(
        sp.record(
            token_id=2,
            sale=sp.record(
                active=True,
                start=sp.some(sp.timestamp(100)),
                end=sp.some(sp.timestamp(200)),
                base_price=sp.mutez(750000),
                increment=sp.mutez(0),
                step_size=sp.nat(1),
                min_price=sp.none,
                max_price=sp.none,
                max_supply=sp.some(sp.nat(3)),
                treasury=treasury.address,
            ),
        ),
        _sender=admin,
    )
    c.set_sale(
        sp.record(
            token_id=2,
            sale=sp.record(
                active=True,
                start=sp.some(sp.timestamp(100)),
                end=sp.some(sp.timestamp(200)),
                base_price=sp.mutez(750000),
                increment=sp.mutez(0),
                step_size=sp.nat(1),
                min_price=sp.none,
                max_price=sp.none,
                max_supply=sp.some(sp.nat(4)),
                treasury=treasury.address,
            ),
        ),
        _sender=admin,
        _valid=False,
    )

    scenario.h2("Invalid windows and reserves above the cap are rejected")
    c.create_open_edition(
        sp.record(
            token_info={"": bytes_of_string("ipfs://QmBadWindow")},
            sale=sp.record(
                active=True,
                start=sp.some(sp.timestamp(300)),
                end=sp.some(sp.timestamp(200)),
                base_price=sp.mutez(0),
                increment=sp.mutez(0),
                step_size=sp.nat(1),
                min_price=sp.none,
                max_price=sp.none,
                max_supply=sp.none,
                treasury=treasury.address,
            ),
            creator_reserve=sp.nat(0),
            lock_policy=True,
        ),
        _sender=admin,
        _valid=False,
    )
    c.create_open_edition(
        sp.record(
            token_info={"": bytes_of_string("ipfs://QmBadReserve")},
            sale=limited_sale,
            creator_reserve=sp.nat(4),
            lock_policy=True,
        ),
        _sender=admin,
        _valid=False,
    )
    scenario.verify(c.data.next_token_id == 3)

    scenario.h2("An intentionally mutable custom policy can be finalized with an irreversible admin lock")
    mutable_sale = sp.record(
        active=False,
        start=sp.none,
        end=sp.none,
        base_price=sp.mutez(0),
        increment=sp.mutez(0),
        step_size=sp.nat(1),
        min_price=sp.none,
        max_price=sp.none,
        max_supply=sp.some(sp.nat(5)),
        treasury=treasury.address,
    )
    c.create_open_edition(
        sp.record(
            token_info={"": bytes_of_string("ipfs://QmMutable")},
            sale=mutable_sale,
            creator_reserve=sp.nat(0),
            lock_policy=False,
        ),
        _sender=admin,
    )
    c.set_sale(
        sp.record(
            token_id=3,
            sale=sp.record(
                active=False,
                start=sp.none,
                end=sp.none,
                base_price=sp.mutez(0),
                increment=sp.mutez(0),
                step_size=sp.nat(1),
                min_price=sp.none,
                max_price=sp.none,
                max_supply=sp.some(sp.nat(4)),
                treasury=treasury.address,
            ),
        ),
        _sender=admin,
    )
    c.lock_sale_policy(3, _sender=alice, _valid=False)
    c.lock_sale_policy(3, _sender=admin)
    c.set_sale(
        sp.record(token_id=3, sale=mutable_sale),
        _sender=admin,
        _valid=False,
    )
    scenario.verify(c.data.policy_locked[3])
    scenario.verify(c.data.next_token_id == 4)

    scenario.h2("Two-step admin handoff")
    c.transfer_administration(bob.address, _sender=admin)
    c.accept_administration(_sender=bob)
    scenario.verify(c.data.administrator == bob.address)
