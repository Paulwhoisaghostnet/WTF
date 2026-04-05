"""
WTF Barter Board contract (SmartPy, FA2 token-for-token swaps).

Core flow:
  1) Maker creates a trade and escrows offered tokens into the contract.
  2) Taker accepts trade by transferring the requested token set to maker.
  3) Contract releases offered tokens:
     - package mode: all offered items to taker
     - choice mode: selected item to taker, remaining items refunded to maker

Requested side supports:
  - all mode: taker must satisfy every requested line
  - choice mode: taker satisfies exactly one requested line selected at accept time
  - wildcard token id (None): means any token id from that contract is accepted,
    with amounts summed across provided token ids for that contract.

Notes:
  - Offered side is escrowed at trade creation.
  - Requested side is transferred at trade acceptance.
  - Trades are single-fill and removed when completed/cancelled.
"""

import os

import smartpy as sp


@sp.module
def main():
    # ---------------------------------------------------------------------
    # Types
    # ---------------------------------------------------------------------
    offered_item_type: type = sp.record(
        token_contract=sp.address,
        token_id=sp.nat,
        amount=sp.nat,
    ).layout(("token_contract", ("token_id", "amount")))

    requested_item_type: type = sp.record(
        token_contract=sp.address,
        token_id=sp.option[sp.nat],
        amount=sp.nat,
    ).layout(("token_contract", ("token_id", "amount")))

    offered_mode_type: type = sp.variant(package=sp.unit, choice=sp.unit)
    requested_mode_type: type = sp.variant(package=sp.unit, choice=sp.unit)

    offered_token_key_type: type = sp.record(
        token_contract=sp.address,
        token_id=sp.nat,
    ).layout(("token_contract", "token_id"))

    requested_token_key_type: type = sp.record(
        token_contract=sp.address,
        token_id=sp.option[sp.nat],
    ).layout(("token_contract", "token_id"))

    trade_type: type = sp.record(
        maker=sp.address,
        requested_mode=requested_mode_type,
        requested_items=sp.list[requested_item_type],
        offered_mode=offered_mode_type,
        offered_items=sp.list[offered_item_type],
        expires_at=sp.option[sp.timestamp],
        active=sp.bool,
    ).layout(
        (
            "maker",
            (
                "requested_mode",
                (
                    "requested_items",
                    (
                        "offered_mode",
                        ("offered_items", ("expires_at", "active")),
                    ),
                ),
            ),
        )
    )

    create_trade_type: type = sp.record(
        requested_mode=requested_mode_type,
        requested_items=sp.list[requested_item_type],
        offered_mode=offered_mode_type,
        offered_items=sp.list[offered_item_type],
        expires_at=sp.option[sp.timestamp],
    ).layout(
        (
            "requested_mode",
            ("requested_items", ("offered_mode", ("offered_items", "expires_at"))),
        )
    )

    accept_trade_type: type = sp.record(
        trade_id=sp.nat,
        selected_offer_token=sp.option[offered_token_key_type],
        selected_request_token=sp.option[requested_token_key_type],
        requested_transfers=sp.list[offered_item_type],
    ).layout(
        (
            "trade_id",
            (
                "selected_offer_token",
                ("selected_request_token", "requested_transfers"),
            ),
        )
    )

    transfer_tx_type: type = sp.record(
        to_=sp.address,
        token_id=sp.nat,
        amount=sp.nat,
    ).layout(("to_", ("token_id", "amount")))

    transfer_batch_type: type = sp.list[
        sp.record(
            from_=sp.address,
            txs=sp.list[transfer_tx_type],
        ).layout(("from_", "txs"))
    ]

    withdraw_xtz_type: type = sp.record(destination=sp.address, amount=sp.mutez).layout(
        ("destination", "amount")
    )

    ledger_key_type: type = sp.record(owner=sp.address, token_id=sp.nat).layout(
        ("owner", "token_id")
    )

    operator_key_type: type = sp.record(
        owner=sp.address, operator=sp.address, token_id=sp.nat
    ).layout(("owner", ("operator", "token_id")))

    mint_type: type = sp.record(
        owner=sp.address, token_id=sp.nat, amount=sp.nat
    ).layout(("owner", ("token_id", "amount")))

    set_operator_type: type = sp.record(
        owner=sp.address, operator=sp.address, token_id=sp.nat, enabled=sp.bool
    ).layout(("owner", ("operator", ("token_id", "enabled"))))

    # ---------------------------------------------------------------------
    # Test helper FA2
    # ---------------------------------------------------------------------
    class MockFA2(sp.Contract):
        def __init__(self):
            self.data.ledger = sp.cast(sp.big_map(), sp.big_map[ledger_key_type, sp.nat])
            self.data.operators = sp.cast(
                sp.big_map(), sp.big_map[operator_key_type, sp.unit]
            )

        @sp.entrypoint
        def mint(self, params):
            sp.cast(params, mint_type)
            key = sp.record(owner=params.owner, token_id=params.token_id)
            bal = self.data.ledger.get(key, default=sp.nat(0))
            self.data.ledger[key] = bal + params.amount

        @sp.entrypoint
        def set_operator(self, params):
            sp.cast(params, set_operator_type)
            assert sp.sender == params.owner, "NOT_OWNER"
            key = sp.record(
                owner=params.owner, operator=params.operator, token_id=params.token_id
            )
            if params.enabled:
                self.data.operators[key] = ()
            else:
                if key in self.data.operators:
                    del self.data.operators[key]

        @sp.entrypoint
        def transfer(self, batch):
            sp.cast(batch, transfer_batch_type)
            for transfer in batch:
                for tx in transfer.txs:
                    op_key = sp.record(
                        owner=transfer.from_, operator=sp.sender, token_id=tx.token_id
                    )
                    assert (
                        sp.sender == transfer.from_ or op_key in self.data.operators
                    ), "FA2_NOT_OPERATOR"

                    from_key = sp.record(owner=transfer.from_, token_id=tx.token_id)
                    from_bal = self.data.ledger.get(from_key, default=sp.nat(0))
                    assert from_bal >= tx.amount, "FA2_INSUFFICIENT_BALANCE"
                    self.data.ledger[from_key] = sp.as_nat(from_bal - tx.amount)

                    to_key = sp.record(owner=tx.to_, token_id=tx.token_id)
                    to_bal = self.data.ledger.get(to_key, default=sp.nat(0))
                    self.data.ledger[to_key] = to_bal + tx.amount

    # ---------------------------------------------------------------------
    # Contract
    # ---------------------------------------------------------------------
    class WTFBarterBoard(sp.Contract):
        def __init__(self, admin):
            sp.cast(admin, sp.address)
            self.data.admin = admin
            self.data.paused = False
            self.data.next_trade_id = sp.nat(0)
            self.data.trades = sp.cast(sp.big_map(), sp.big_map[sp.nat, trade_type])

        @sp.entrypoint
        def default(self):
            pass

        @sp.entrypoint
        def create_trade(self, params):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            assert not self.data.paused, "PAUSED"
            sp.cast(params, create_trade_type)

            offered_count = sp.len(params.offered_items)
            assert offered_count > 0, "OFFERED_ITEMS_EMPTY"
            assert offered_count <= 25, "TOO_MANY_OFFERED_ITEMS"

            requested_count = sp.len(params.requested_items)
            assert requested_count > 0, "REQUESTED_ITEMS_EMPTY"
            assert requested_count <= 25, "TOO_MANY_REQUESTED_ITEMS"

            if params.expires_at.is_some():
                assert params.expires_at.unwrap_some() > sp.now, "EXPIRY_IN_PAST"

            seen_offered = sp.cast({}, sp.map[offered_token_key_type, sp.unit])
            for item in params.offered_items:
                assert item.amount > 0, "OFFERED_AMOUNT_INVALID"

                offered_key = sp.record(
                    token_contract=item.token_contract,
                    token_id=item.token_id,
                )
                assert not (offered_key in seen_offered), "DUPLICATE_OFFERED_TOKEN"
                seen_offered[offered_key] = ()
                transfer_ep = sp.contract(
                    transfer_batch_type, item.token_contract, entrypoint="transfer"
                ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
                sp.transfer(
                    [
                        sp.record(
                            from_=sp.sender,
                            txs=[
                                sp.record(
                                    to_=sp.self_address,
                                    token_id=item.token_id,
                                    amount=item.amount,
                                )
                            ],
                        )
                    ],
                    sp.mutez(0),
                    transfer_ep,
                )

            seen_requested = sp.cast({}, sp.map[requested_token_key_type, sp.unit])
            wildcard_contracts = sp.cast({}, sp.map[sp.address, sp.unit])
            specific_contracts = sp.cast({}, sp.map[sp.address, sp.unit])

            for request in params.requested_items:
                assert request.amount > 0, "REQUESTED_AMOUNT_INVALID"

                request_key = sp.record(
                    token_contract=request.token_contract,
                    token_id=request.token_id,
                )
                assert not (request_key in seen_requested), "DUPLICATE_REQUESTED_TOKEN"
                seen_requested[request_key] = ()

                if request.token_id.is_some():
                    assert not (request.token_contract in wildcard_contracts), "REQUEST_FILTER_AMBIGUOUS"
                    specific_contracts[request.token_contract] = ()
                else:
                    assert not (request.token_contract in specific_contracts), "REQUEST_FILTER_AMBIGUOUS"
                    wildcard_contracts[request.token_contract] = ()

            trade_id = self.data.next_trade_id
            self.data.trades[trade_id] = sp.record(
                maker=sp.sender,
                requested_mode=params.requested_mode,
                requested_items=params.requested_items,
                offered_mode=params.offered_mode,
                offered_items=params.offered_items,
                expires_at=params.expires_at,
                active=True,
            )
            self.data.next_trade_id += 1

        @sp.entrypoint
        def accept_trade(self, params):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            assert not self.data.paused, "PAUSED"
            sp.cast(params, accept_trade_type)

            assert params.trade_id in self.data.trades, "TRADE_NOT_FOUND"
            trade = self.data.trades[params.trade_id]

            assert trade.active, "TRADE_INACTIVE"
            assert sp.sender != trade.maker, "SELF_ACCEPT_FORBIDDEN"

            if trade.expires_at.is_some():
                assert sp.now <= trade.expires_at.unwrap_some(), "TRADE_EXPIRED"

            transfer_count = sp.len(params.requested_transfers)
            assert transfer_count > 0, "REQUESTED_TRANSFERS_EMPTY"
            assert transfer_count <= 25, "TOO_MANY_REQUESTED_TRANSFERS"

            if trade.requested_mode.is_variant.package():
                assert not params.selected_request_token.is_some(), "UNEXPECTED_REQUEST_SELECTION"
            else:
                assert trade.requested_mode.is_variant.choice(), "REQUEST_MODE_INVALID"
                assert params.selected_request_token.is_some(), "MISSING_REQUEST_SELECTION"
                requested_lookup = sp.cast(
                    {}, sp.map[requested_token_key_type, sp.unit]
                )
                for request in trade.requested_items:
                    request_key = sp.record(
                        token_contract=request.token_contract,
                        token_id=request.token_id,
                    )
                    requested_lookup[request_key] = ()
                assert (
                    params.selected_request_token.unwrap_some() in requested_lookup
                ), "INVALID_REQUEST_SELECTION"

            if trade.offered_mode.is_variant.package():
                assert not params.selected_offer_token.is_some(), "UNEXPECTED_OFFER_SELECTION"
            else:
                assert trade.offered_mode.is_variant.choice(), "OFFER_MODE_INVALID"
                assert params.selected_offer_token.is_some(), "MISSING_OFFER_SELECTION"
                offered_lookup = sp.cast(
                    {}, sp.map[offered_token_key_type, sp.unit]
                )
                for item in trade.offered_items:
                    offered_key = sp.record(
                        token_contract=item.token_contract,
                        token_id=item.token_id,
                    )
                    offered_lookup[offered_key] = ()
                assert (
                    params.selected_offer_token.unwrap_some() in offered_lookup
                ), "INVALID_OFFER_SELECTION"

            expected_specific = sp.cast({}, sp.map[offered_token_key_type, sp.nat])
            expected_any = sp.cast({}, sp.map[sp.address, sp.nat])
            for request in trade.requested_items:
                request_key = sp.record(
                    token_contract=request.token_contract,
                    token_id=request.token_id,
                )
                include_request = True
                if params.selected_request_token.is_some():
                    include_request = (
                        request_key == params.selected_request_token.unwrap_some()
                    )
                if include_request:
                    if request.token_id.is_some():
                        specific_key = sp.record(
                            token_contract=request.token_contract,
                            token_id=request.token_id.unwrap_some(),
                        )
                        assert not (specific_key in expected_specific), "REQUEST_FILTER_AMBIGUOUS"
                        expected_specific[specific_key] = request.amount
                    else:
                        assert not (request.token_contract in expected_any), "REQUEST_FILTER_AMBIGUOUS"
                        expected_any[request.token_contract] = request.amount

            seen_requested_transfers = sp.cast(
                {}, sp.map[offered_token_key_type, sp.unit]
            )
            matched_specific = sp.cast({}, sp.map[offered_token_key_type, sp.unit])
            matched_any_amount = sp.cast({}, sp.map[sp.address, sp.nat])

            for transfer_item in params.requested_transfers:
                assert transfer_item.amount > 0, "REQUESTED_TRANSFER_AMOUNT_INVALID"

                transfer_key = sp.record(
                    token_contract=transfer_item.token_contract,
                    token_id=transfer_item.token_id,
                )
                assert not (transfer_key in seen_requested_transfers), "DUPLICATE_REQUESTED_TRANSFER"
                seen_requested_transfers[transfer_key] = ()

                if transfer_key in expected_specific:
                    expected_amount = expected_specific.get(transfer_key, default=sp.nat(0))
                    assert transfer_item.amount == expected_amount, "REQUESTED_AMOUNT_MISMATCH"
                    matched_specific[transfer_key] = ()
                else:
                    assert transfer_item.token_contract in expected_any, "REQUESTED_TRANSFER_INVALID"
                    expected_total = expected_any.get(
                        transfer_item.token_contract, default=sp.nat(0)
                    )
                    running_total = (
                        matched_any_amount.get(
                            transfer_item.token_contract, default=sp.nat(0)
                        )
                        + transfer_item.amount
                    )
                    assert running_total <= expected_total, "REQUESTED_AMOUNT_MISMATCH"
                    matched_any_amount[transfer_item.token_contract] = running_total

            for request in trade.requested_items:
                request_key = sp.record(
                    token_contract=request.token_contract,
                    token_id=request.token_id,
                )
                include_request = True
                if params.selected_request_token.is_some():
                    include_request = (
                        request_key == params.selected_request_token.unwrap_some()
                    )
                if include_request:
                    if request.token_id.is_some():
                        key = sp.record(
                            token_contract=request.token_contract,
                            token_id=request.token_id.unwrap_some(),
                        )
                        assert key in matched_specific, "REQUESTED_TRANSFER_MISSING"
                    else:
                        matched_total = matched_any_amount.get(
                            request.token_contract, default=sp.nat(0)
                        )
                        assert matched_total == request.amount, "REQUESTED_AMOUNT_MISMATCH"

            for transfer_item in params.requested_transfers:
                transfer_ep = sp.contract(
                    transfer_batch_type,
                    transfer_item.token_contract,
                    entrypoint="transfer",
                ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
                sp.transfer(
                    [
                        sp.record(
                            from_=sp.sender,
                            txs=[
                                sp.record(
                                    to_=trade.maker,
                                    token_id=transfer_item.token_id,
                                    amount=transfer_item.amount,
                                )
                            ],
                        )
                    ],
                    sp.mutez(0),
                    transfer_ep,
                )

            if trade.offered_mode.is_variant.package():
                for item in trade.offered_items:
                    transfer_ep = sp.contract(
                        transfer_batch_type, item.token_contract, entrypoint="transfer"
                    ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
                    sp.transfer(
                        [
                            sp.record(
                                from_=sp.self_address,
                                txs=[
                                    sp.record(
                                        to_=sp.sender,
                                        token_id=item.token_id,
                                        amount=item.amount,
                                    )
                                ],
                            )
                        ],
                        sp.mutez(0),
                        transfer_ep,
                    )
            else:
                assert trade.offered_mode.is_variant.choice(), "OFFER_MODE_INVALID"
                selected_offered = params.selected_offer_token.unwrap_some()
                for item in trade.offered_items:
                    item_key = sp.record(
                        token_contract=item.token_contract,
                        token_id=item.token_id,
                    )
                    if item_key == selected_offered:
                        transfer_ep = sp.contract(
                            transfer_batch_type, item.token_contract, entrypoint="transfer"
                        ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
                        sp.transfer(
                            [
                                sp.record(
                                    from_=sp.self_address,
                                    txs=[
                                        sp.record(
                                            to_=sp.sender,
                                            token_id=item.token_id,
                                            amount=item.amount,
                                        )
                                    ],
                                )
                            ],
                            sp.mutez(0),
                            transfer_ep,
                        )
                    else:
                        transfer_ep = sp.contract(
                            transfer_batch_type, item.token_contract, entrypoint="transfer"
                        ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
                        sp.transfer(
                            [
                                sp.record(
                                    from_=sp.self_address,
                                    txs=[
                                        sp.record(
                                            to_=trade.maker,
                                            token_id=item.token_id,
                                            amount=item.amount,
                                        )
                                    ],
                                )
                            ],
                            sp.mutez(0),
                            transfer_ep,
                        )

            del self.data.trades[params.trade_id]

        @sp.entrypoint
        def cancel_trade(self, trade_id):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            sp.cast(trade_id, sp.nat)

            assert trade_id in self.data.trades, "TRADE_NOT_FOUND"
            trade = self.data.trades[trade_id]
            assert trade.active, "TRADE_INACTIVE"

            is_maker_or_admin = (sp.sender == trade.maker) or (
                sp.sender == self.data.admin
            )

            if not is_maker_or_admin:
                assert trade.expires_at.is_some(), "NOT_AUTHORIZED"
                assert sp.now > trade.expires_at.unwrap_some(), "NOT_AUTHORIZED"

            for item in trade.offered_items:
                transfer_ep = sp.contract(
                    transfer_batch_type, item.token_contract, entrypoint="transfer"
                ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
                sp.transfer(
                    [
                        sp.record(
                            from_=sp.self_address,
                            txs=[
                                sp.record(
                                    to_=trade.maker,
                                    token_id=item.token_id,
                                    amount=item.amount,
                                )
                            ],
                        )
                    ],
                    sp.mutez(0),
                    transfer_ep,
                )
            del self.data.trades[trade_id]

        @sp.entrypoint
        def toggle_pause(self):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.paused = not self.data.paused

        @sp.entrypoint
        def set_admin(self, new_admin):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            sp.cast(new_admin, sp.address)
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.admin = new_admin

        @sp.entrypoint
        def admin_withdraw_xtz(self, params):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            sp.cast(params, withdraw_xtz_type)
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            sp.send(params.destination, params.amount)


if "main" in __name__:
    PROD_ADMIN = sp.address("tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt")

    def _ledger_balance(token_contract, owner, token_id):
        return token_contract.data.ledger.get(
            sp.record(owner=owner, token_id=token_id), default_value=sp.nat(0)
        )

    def _trade_exists(scenario, barter, trade_id, exists):
        scenario.verify(barter.data.trades.contains(trade_id) == exists)

    def _deploy_fixture(name):
        scenario = sp.test_scenario(name, main)
        scenario.h1(name)

        admin = sp.test_account("Admin")
        maker = sp.test_account("Maker")
        taker = sp.test_account("Taker")
        stranger = sp.test_account("Stranger")

        token_a = main.MockFA2()
        token_b = main.MockFA2()
        scenario += token_a
        scenario += token_b

        barter = main.WTFBarterBoard(admin=admin.address)
        scenario += barter

        return scenario, admin, maker, taker, stranger, token_a, token_b, barter

    @sp.add_test()
    def test_compile_barter_board():
        scenario_name = os.environ.get("SMARTPY_SCENARIO_NAME", "WTFBarterBoard")
        scenario = sp.test_scenario(scenario_name, main)
        scenario.h1(scenario_name)

        contract = main.WTFBarterBoard(admin=PROD_ADMIN)
        scenario += contract

    @sp.add_test()
    def test_package_trade_lifecycle_with_specific_request():
        (
            scenario,
            _admin,
            maker,
            taker,
            _stranger,
            token_a,
            token_b,
            barter,
        ) = _deploy_fixture("package_trade_lifecycle_with_specific_request")

        token_a.mint(sp.record(owner=maker.address, token_id=1, amount=10))
        token_a.mint(sp.record(owner=maker.address, token_id=2, amount=7))
        token_b.mint(sp.record(owner=taker.address, token_id=9, amount=30))

        token_a.set_operator(
            sp.record(owner=maker.address, operator=barter.address, token_id=1, enabled=True),
            _sender=maker,
        )
        token_a.set_operator(
            sp.record(owner=maker.address, operator=barter.address, token_id=2, enabled=True),
            _sender=maker,
        )
        token_b.set_operator(
            sp.record(owner=taker.address, operator=barter.address, token_id=9, enabled=True),
            _sender=taker,
        )

        barter.create_trade(
            sp.record(
                requested_mode=sp.variant("package", ()),
                requested_items=[
                    sp.record(
                        token_contract=token_b.address,
                        token_id=sp.some(sp.nat(9)),
                        amount=8,
                    )
                ],
                offered_mode=sp.variant("package", ()),
                offered_items=[
                    sp.record(token_contract=token_a.address, token_id=1, amount=3),
                    sp.record(token_contract=token_a.address, token_id=2, amount=2),
                ],
                expires_at=sp.none,
            ),
            _sender=maker,
        )

        barter.accept_trade(
            sp.record(
                trade_id=0,
                selected_offer_token=sp.none,
                selected_request_token=sp.none,
                requested_transfers=[
                    sp.record(token_contract=token_b.address, token_id=9, amount=8)
                ],
            ),
            _sender=taker,
        )

        _trade_exists(scenario, barter, 0, False)
        scenario.verify(_ledger_balance(token_a, taker.address, 1) == 3)
        scenario.verify(_ledger_balance(token_a, taker.address, 2) == 2)
        scenario.verify(_ledger_balance(token_b, maker.address, 9) == 8)
        scenario.verify(_ledger_balance(token_b, taker.address, 9) == 22)

    @sp.add_test()
    def test_choice_offered_with_wildcard_requested_uneven_trade():
        (
            scenario,
            _admin,
            maker,
            taker,
            _stranger,
            token_a,
            token_b,
            barter,
        ) = _deploy_fixture("choice_offered_with_wildcard_requested_uneven_trade")

        token_a.mint(sp.record(owner=maker.address, token_id=3, amount=5))
        token_a.mint(sp.record(owner=maker.address, token_id=4, amount=6))
        token_b.mint(sp.record(owner=taker.address, token_id=10, amount=2))
        token_b.mint(sp.record(owner=taker.address, token_id=11, amount=4))

        token_a.set_operator(
            sp.record(owner=maker.address, operator=barter.address, token_id=3, enabled=True),
            _sender=maker,
        )
        token_a.set_operator(
            sp.record(owner=maker.address, operator=barter.address, token_id=4, enabled=True),
            _sender=maker,
        )
        token_b.set_operator(
            sp.record(owner=taker.address, operator=barter.address, token_id=10, enabled=True),
            _sender=taker,
        )
        token_b.set_operator(
            sp.record(owner=taker.address, operator=barter.address, token_id=11, enabled=True),
            _sender=taker,
        )

        barter.create_trade(
            sp.record(
                requested_mode=sp.variant("package", ()),
                requested_items=[
                    sp.record(
                        token_contract=token_b.address,
                        token_id=sp.none,
                        amount=3,
                    )
                ],
                offered_mode=sp.variant("choice", ()),
                offered_items=[
                    sp.record(token_contract=token_a.address, token_id=3, amount=2),
                    sp.record(token_contract=token_a.address, token_id=4, amount=3),
                ],
                expires_at=sp.some(sp.timestamp(1000)),
            ),
            _sender=maker,
            _now=sp.timestamp(1),
        )

        barter.accept_trade(
            sp.record(
                trade_id=0,
                selected_offer_token=sp.some(
                    sp.record(token_contract=token_a.address, token_id=4)
                ),
                selected_request_token=sp.none,
                requested_transfers=[
                    sp.record(token_contract=token_b.address, token_id=10, amount=2),
                    sp.record(token_contract=token_b.address, token_id=11, amount=1),
                ],
            ),
            _sender=taker,
            _now=sp.timestamp(2),
        )

        # maker receives uneven wildcard request (2 + 1 from different token_ids)
        scenario.verify(_ledger_balance(token_b, maker.address, 10) == 2)
        scenario.verify(_ledger_balance(token_b, maker.address, 11) == 1)

        # selected offered item (token_id 4) goes to taker
        scenario.verify(_ledger_balance(token_a, taker.address, 4) == 3)

        # unselected offered item (token_id 3) refunded to maker
        scenario.verify(_ledger_balance(token_a, maker.address, 3) == 5)

    @sp.add_test()
    def test_requested_choice_mode_lifecycle():
        (
            scenario,
            _admin,
            maker,
            taker,
            _stranger,
            token_a,
            token_b,
            barter,
        ) = _deploy_fixture("requested_choice_mode_lifecycle")

        token_a.mint(sp.record(owner=maker.address, token_id=6, amount=5))
        token_b.mint(sp.record(owner=taker.address, token_id=20, amount=3))
        token_b.mint(sp.record(owner=taker.address, token_id=21, amount=2))

        token_a.set_operator(
            sp.record(owner=maker.address, operator=barter.address, token_id=6, enabled=True),
            _sender=maker,
        )
        token_b.set_operator(
            sp.record(owner=taker.address, operator=barter.address, token_id=21, enabled=True),
            _sender=taker,
        )

        barter.create_trade(
            sp.record(
                requested_mode=sp.variant("choice", ()),
                requested_items=[
                    sp.record(
                        token_contract=token_b.address,
                        token_id=sp.some(sp.nat(20)),
                        amount=2,
                    ),
                    sp.record(
                        token_contract=token_b.address,
                        token_id=sp.some(sp.nat(21)),
                        amount=1,
                    ),
                ],
                offered_mode=sp.variant("package", ()),
                offered_items=[
                    sp.record(token_contract=token_a.address, token_id=6, amount=2)
                ],
                expires_at=sp.none,
            ),
            _sender=maker,
        )

        barter.accept_trade(
            sp.record(
                trade_id=0,
                selected_offer_token=sp.none,
                selected_request_token=sp.some(
                    sp.record(token_contract=token_b.address, token_id=sp.some(sp.nat(21)))
                ),
                requested_transfers=[
                    sp.record(token_contract=token_b.address, token_id=21, amount=1)
                ],
            ),
            _sender=taker,
        )

        _trade_exists(scenario, barter, 0, False)
        scenario.verify(_ledger_balance(token_a, taker.address, 6) == 2)
        scenario.verify(_ledger_balance(token_b, maker.address, 21) == 1)
        scenario.verify(_ledger_balance(token_b, maker.address, 20) == 0)

    @sp.add_test()
    def test_cancel_and_expiry_cleanup():
        (
            scenario,
            admin,
            maker,
            _taker,
            stranger,
            token_a,
            token_b,
            barter,
        ) = _deploy_fixture("cancel_and_expiry_cleanup")

        token_a.mint(sp.record(owner=maker.address, token_id=30, amount=10))
        token_b.mint(sp.record(owner=stranger.address, token_id=2, amount=10))

        token_a.set_operator(
            sp.record(owner=maker.address, operator=barter.address, token_id=30, enabled=True),
            _sender=maker,
        )

        barter.create_trade(
            sp.record(
                requested_mode=sp.variant("package", ()),
                requested_items=[
                    sp.record(
                        token_contract=token_b.address,
                        token_id=sp.some(sp.nat(2)),
                        amount=1,
                    )
                ],
                offered_mode=sp.variant("package", ()),
                offered_items=[
                    sp.record(token_contract=token_a.address, token_id=30, amount=4)
                ],
                expires_at=sp.some(sp.timestamp(10)),
            ),
            _sender=maker,
            _now=sp.timestamp(1),
        )

        barter.cancel_trade(
            0,
            _sender=stranger,
            _now=sp.timestamp(5),
            _valid=False,
            _exception="NOT_AUTHORIZED",
        )

        barter.cancel_trade(0, _sender=admin, _now=sp.timestamp(5))
        _trade_exists(scenario, barter, 0, False)
        scenario.verify(_ledger_balance(token_a, maker.address, 30) == 10)

        barter.create_trade(
            sp.record(
                requested_mode=sp.variant("package", ()),
                requested_items=[
                    sp.record(
                        token_contract=token_b.address,
                        token_id=sp.some(sp.nat(2)),
                        amount=1,
                    )
                ],
                offered_mode=sp.variant("package", ()),
                offered_items=[
                    sp.record(token_contract=token_a.address, token_id=30, amount=3)
                ],
                expires_at=sp.some(sp.timestamp(20)),
            ),
            _sender=maker,
            _now=sp.timestamp(11),
        )

        barter.cancel_trade(1, _sender=stranger, _now=sp.timestamp(21))
        _trade_exists(scenario, barter, 1, False)
        scenario.verify(_ledger_balance(token_a, maker.address, 30) == 10)

    @sp.add_test()
    def test_guards_and_failures():
        (
            scenario,
            admin,
            maker,
            taker,
            stranger,
            token_a,
            token_b,
            barter,
        ) = _deploy_fixture("guards_and_failures")

        token_a.mint(sp.record(owner=maker.address, token_id=1, amount=100))
        token_a.mint(sp.record(owner=maker.address, token_id=2, amount=10))
        token_b.mint(sp.record(owner=taker.address, token_id=1, amount=5))
        token_b.mint(sp.record(owner=taker.address, token_id=2, amount=2))

        token_a.set_operator(
            sp.record(owner=maker.address, operator=barter.address, token_id=1, enabled=True),
            _sender=maker,
        )
        token_a.set_operator(
            sp.record(owner=maker.address, operator=barter.address, token_id=2, enabled=True),
            _sender=maker,
        )

        scenario.h2("Create guards")
        barter.create_trade(
            sp.record(
                requested_mode=sp.variant("package", ()),
                requested_items=[],
                offered_mode=sp.variant("package", ()),
                offered_items=[sp.record(token_contract=token_a.address, token_id=1, amount=1)],
                expires_at=sp.none,
            ),
            _sender=maker,
            _valid=False,
            _exception="REQUESTED_ITEMS_EMPTY",
        )

        too_many_requested = [
            sp.record(token_contract=token_b.address, token_id=sp.some(sp.nat(i)), amount=1)
            for i in range(26)
        ]
        barter.create_trade(
            sp.record(
                requested_mode=sp.variant("package", ()),
                requested_items=too_many_requested,
                offered_mode=sp.variant("package", ()),
                offered_items=[sp.record(token_contract=token_a.address, token_id=1, amount=1)],
                expires_at=sp.none,
            ),
            _sender=maker,
            _valid=False,
            _exception="TOO_MANY_REQUESTED_ITEMS",
        )

        too_many_offered = [
            sp.record(token_contract=token_a.address, token_id=i, amount=1)
            for i in range(26)
        ]
        barter.create_trade(
            sp.record(
                requested_mode=sp.variant("package", ()),
                requested_items=[
                    sp.record(token_contract=token_b.address, token_id=sp.some(sp.nat(1)), amount=1)
                ],
                offered_mode=sp.variant("package", ()),
                offered_items=too_many_offered,
                expires_at=sp.none,
            ),
            _sender=maker,
            _valid=False,
            _exception="TOO_MANY_OFFERED_ITEMS",
        )

        barter.create_trade(
            sp.record(
                requested_mode=sp.variant("package", ()),
                requested_items=[
                    sp.record(token_contract=token_b.address, token_id=sp.some(sp.nat(1)), amount=0)
                ],
                offered_mode=sp.variant("package", ()),
                offered_items=[sp.record(token_contract=token_a.address, token_id=1, amount=1)],
                expires_at=sp.none,
            ),
            _sender=maker,
            _valid=False,
            _exception="REQUESTED_AMOUNT_INVALID",
        )

        barter.create_trade(
            sp.record(
                requested_mode=sp.variant("package", ()),
                requested_items=[
                    sp.record(token_contract=token_b.address, token_id=sp.some(sp.nat(1)), amount=1)
                ],
                offered_mode=sp.variant("package", ()),
                offered_items=[sp.record(token_contract=token_a.address, token_id=1, amount=0)],
                expires_at=sp.none,
            ),
            _sender=maker,
            _valid=False,
            _exception="OFFERED_AMOUNT_INVALID",
        )

        barter.create_trade(
            sp.record(
                requested_mode=sp.variant("package", ()),
                requested_items=[
                    sp.record(token_contract=token_b.address, token_id=sp.some(sp.nat(1)), amount=1),
                    sp.record(token_contract=token_b.address, token_id=sp.some(sp.nat(1)), amount=2),
                ],
                offered_mode=sp.variant("package", ()),
                offered_items=[sp.record(token_contract=token_a.address, token_id=1, amount=1)],
                expires_at=sp.none,
            ),
            _sender=maker,
            _valid=False,
            _exception="DUPLICATE_REQUESTED_TOKEN",
        )

        barter.create_trade(
            sp.record(
                requested_mode=sp.variant("package", ()),
                requested_items=[
                    sp.record(token_contract=token_b.address, token_id=sp.none, amount=2),
                    sp.record(token_contract=token_b.address, token_id=sp.some(sp.nat(1)), amount=1),
                ],
                offered_mode=sp.variant("package", ()),
                offered_items=[sp.record(token_contract=token_a.address, token_id=1, amount=1)],
                expires_at=sp.none,
            ),
            _sender=maker,
            _valid=False,
            _exception="REQUEST_FILTER_AMBIGUOUS",
        )

        barter.create_trade(
            sp.record(
                requested_mode=sp.variant("package", ()),
                requested_items=[
                    sp.record(token_contract=token_b.address, token_id=sp.some(sp.nat(1)), amount=1)
                ],
                offered_mode=sp.variant("package", ()),
                offered_items=[
                    sp.record(token_contract=token_a.address, token_id=1, amount=1),
                    sp.record(token_contract=token_a.address, token_id=1, amount=2),
                ],
                expires_at=sp.none,
            ),
            _sender=maker,
            _valid=False,
            _exception="DUPLICATE_OFFERED_TOKEN",
        )

        # maker missing operator on token_id 3
        token_a.mint(sp.record(owner=maker.address, token_id=3, amount=1))
        barter.create_trade(
            sp.record(
                requested_mode=sp.variant("package", ()),
                requested_items=[
                    sp.record(token_contract=token_b.address, token_id=sp.some(sp.nat(1)), amount=1)
                ],
                offered_mode=sp.variant("package", ()),
                offered_items=[sp.record(token_contract=token_a.address, token_id=3, amount=1)],
                expires_at=sp.none,
            ),
            _sender=maker,
            _valid=False,
            _exception="FA2_NOT_OPERATOR",
        )

        scenario.h2("Pause guards")
        barter.toggle_pause(_sender=admin)
        barter.create_trade(
            sp.record(
                requested_mode=sp.variant("package", ()),
                requested_items=[
                    sp.record(token_contract=token_b.address, token_id=sp.some(sp.nat(1)), amount=1)
                ],
                offered_mode=sp.variant("package", ()),
                offered_items=[sp.record(token_contract=token_a.address, token_id=1, amount=1)],
                expires_at=sp.none,
            ),
            _sender=maker,
            _valid=False,
            _exception="PAUSED",
        )
        barter.toggle_pause(_sender=admin)

        scenario.h2("Accept guards")
        barter.create_trade(
            sp.record(
                requested_mode=sp.variant("choice", ()),
                requested_items=[
                    sp.record(token_contract=token_b.address, token_id=sp.some(sp.nat(1)), amount=6),
                    sp.record(token_contract=token_b.address, token_id=sp.some(sp.nat(2)), amount=2),
                ],
                offered_mode=sp.variant("choice", ()),
                offered_items=[
                    sp.record(token_contract=token_a.address, token_id=1, amount=2),
                    sp.record(token_contract=token_a.address, token_id=2, amount=1),
                ],
                expires_at=sp.some(sp.timestamp(100)),
            ),
            _sender=maker,
            _now=sp.timestamp(1),
        )

        barter.accept_trade(
            sp.record(
                trade_id=0,
                selected_offer_token=sp.some(
                    sp.record(token_contract=token_a.address, token_id=1)
                ),
                selected_request_token=sp.some(
                    sp.record(token_contract=token_b.address, token_id=sp.some(sp.nat(1)))
                ),
                requested_transfers=[
                    sp.record(token_contract=token_b.address, token_id=1, amount=6)
                ],
            ),
            _sender=maker,
            _valid=False,
            _exception="SELF_ACCEPT_FORBIDDEN",
        )

        barter.accept_trade(
            sp.record(
                trade_id=0,
                selected_offer_token=sp.none,
                selected_request_token=sp.some(
                    sp.record(token_contract=token_b.address, token_id=sp.some(sp.nat(1)))
                ),
                requested_transfers=[
                    sp.record(token_contract=token_b.address, token_id=1, amount=6)
                ],
            ),
            _sender=taker,
            _valid=False,
            _exception="MISSING_OFFER_SELECTION",
        )

        barter.accept_trade(
            sp.record(
                trade_id=0,
                selected_offer_token=sp.some(
                    sp.record(token_contract=token_a.address, token_id=1)
                ),
                selected_request_token=sp.none,
                requested_transfers=[
                    sp.record(token_contract=token_b.address, token_id=1, amount=6)
                ],
            ),
            _sender=taker,
            _valid=False,
            _exception="MISSING_REQUEST_SELECTION",
        )

        barter.accept_trade(
            sp.record(
                trade_id=0,
                selected_offer_token=sp.some(
                    sp.record(token_contract=token_a.address, token_id=99)
                ),
                selected_request_token=sp.some(
                    sp.record(token_contract=token_b.address, token_id=sp.some(sp.nat(1)))
                ),
                requested_transfers=[
                    sp.record(token_contract=token_b.address, token_id=1, amount=6)
                ],
            ),
            _sender=taker,
            _valid=False,
            _exception="INVALID_OFFER_SELECTION",
        )

        barter.accept_trade(
            sp.record(
                trade_id=0,
                selected_offer_token=sp.some(
                    sp.record(token_contract=token_a.address, token_id=1)
                ),
                selected_request_token=sp.some(
                    sp.record(token_contract=token_b.address, token_id=sp.some(sp.nat(99)))
                ),
                requested_transfers=[
                    sp.record(token_contract=token_b.address, token_id=1, amount=6)
                ],
            ),
            _sender=taker,
            _valid=False,
            _exception="INVALID_REQUEST_SELECTION",
        )

        barter.accept_trade(
            sp.record(
                trade_id=0,
                selected_offer_token=sp.some(
                    sp.record(token_contract=token_a.address, token_id=1)
                ),
                selected_request_token=sp.some(
                    sp.record(token_contract=token_b.address, token_id=sp.some(sp.nat(1)))
                ),
                requested_transfers=[],
            ),
            _sender=taker,
            _valid=False,
            _exception="REQUESTED_TRANSFERS_EMPTY",
        )

        barter.accept_trade(
            sp.record(
                trade_id=0,
                selected_offer_token=sp.some(
                    sp.record(token_contract=token_a.address, token_id=1)
                ),
                selected_request_token=sp.some(
                    sp.record(token_contract=token_b.address, token_id=sp.some(sp.nat(1)))
                ),
                requested_transfers=[
                    sp.record(token_contract=token_b.address, token_id=99, amount=6)
                ],
            ),
            _sender=taker,
            _valid=False,
            _exception="REQUESTED_TRANSFER_INVALID",
        )

        barter.accept_trade(
            sp.record(
                trade_id=0,
                selected_offer_token=sp.some(
                    sp.record(token_contract=token_a.address, token_id=1)
                ),
                selected_request_token=sp.some(
                    sp.record(token_contract=token_b.address, token_id=sp.some(sp.nat(1)))
                ),
                requested_transfers=[
                    sp.record(token_contract=token_b.address, token_id=1, amount=5)
                ],
            ),
            _sender=taker,
            _valid=False,
            _exception="REQUESTED_AMOUNT_MISMATCH",
        )

        # taker missing operator on requested token
        barter.accept_trade(
            sp.record(
                trade_id=0,
                selected_offer_token=sp.some(
                    sp.record(token_contract=token_a.address, token_id=2)
                ),
                selected_request_token=sp.some(
                    sp.record(token_contract=token_b.address, token_id=sp.some(sp.nat(2)))
                ),
                requested_transfers=[
                    sp.record(token_contract=token_b.address, token_id=2, amount=2)
                ],
            ),
            _sender=taker,
            _valid=False,
            _exception="FA2_NOT_OPERATOR",
        )

        token_b.set_operator(
            sp.record(owner=taker.address, operator=barter.address, token_id=1, enabled=True),
            _sender=taker,
        )

        barter.accept_trade(
            sp.record(
                trade_id=0,
                selected_offer_token=sp.some(
                    sp.record(token_contract=token_a.address, token_id=1)
                ),
                selected_request_token=sp.some(
                    sp.record(token_contract=token_b.address, token_id=sp.some(sp.nat(1)))
                ),
                requested_transfers=[
                    sp.record(token_contract=token_b.address, token_id=1, amount=6)
                ],
            ),
            _sender=taker,
            _valid=False,
            _exception="FA2_INSUFFICIENT_BALANCE",
        )

        token_b.set_operator(
            sp.record(owner=taker.address, operator=barter.address, token_id=2, enabled=True),
            _sender=taker,
        )

        barter.toggle_pause(_sender=admin)
        barter.accept_trade(
            sp.record(
                trade_id=0,
                selected_offer_token=sp.some(
                    sp.record(token_contract=token_a.address, token_id=2)
                ),
                selected_request_token=sp.some(
                    sp.record(token_contract=token_b.address, token_id=sp.some(sp.nat(2)))
                ),
                requested_transfers=[
                    sp.record(token_contract=token_b.address, token_id=2, amount=2)
                ],
            ),
            _sender=taker,
            _valid=False,
            _exception="PAUSED",
        )
        barter.toggle_pause(_sender=admin)

        # unauthorized cancel before expiry
        barter.cancel_trade(0, _sender=stranger, _now=sp.timestamp(50), _valid=False, _exception="NOT_AUTHORIZED")

        # successful completion using request choice index 1
        barter.accept_trade(
            sp.record(
                trade_id=0,
                selected_offer_token=sp.some(
                    sp.record(token_contract=token_a.address, token_id=2)
                ),
                selected_request_token=sp.some(
                    sp.record(token_contract=token_b.address, token_id=sp.some(sp.nat(2)))
                ),
                requested_transfers=[
                    sp.record(token_contract=token_b.address, token_id=2, amount=2)
                ],
            ),
            _sender=taker,
            _now=sp.timestamp(51),
        )

        _trade_exists(scenario, barter, 0, False)
        scenario.verify(_ledger_balance(token_a, taker.address, 2) == 1)
        scenario.verify(_ledger_balance(token_b, maker.address, 2) == 2)

        # expiry guard
        barter.create_trade(
            sp.record(
                requested_mode=sp.variant("package", ()),
                requested_items=[
                    sp.record(token_contract=token_b.address, token_id=sp.some(sp.nat(2)), amount=1)
                ],
                offered_mode=sp.variant("package", ()),
                offered_items=[sp.record(token_contract=token_a.address, token_id=1, amount=1)],
                expires_at=sp.some(sp.timestamp(60)),
            ),
            _sender=maker,
            _now=sp.timestamp(52),
        )

        barter.accept_trade(
            sp.record(
                trade_id=1,
                selected_offer_token=sp.none,
                selected_request_token=sp.none,
                requested_transfers=[
                    sp.record(token_contract=token_b.address, token_id=2, amount=1)
                ],
            ),
            _sender=taker,
            _now=sp.timestamp(61),
            _valid=False,
            _exception="TRADE_EXPIRED",
        )

        # expired cleanup by anyone
        barter.cancel_trade(1, _sender=stranger, _now=sp.timestamp(61))
        _trade_exists(scenario, barter, 1, False)
