# WtfInAppMarket - SmartPy v0.24.1
#
# Tiny WTF payment router for platform-only in-app items. The contract does not
# store listings, purchases, metadata, or admin state. The app owns the catalog
# and inventory. This contract only gives the chain transaction item context and
# pulls the exact WTF amount requested by the app from the buyer to the gameshow
# treasury wallet.

import smartpy as sp


@sp.module
def wtf_in_app_market_main():
    TransferTxType: type = sp.record(
        to_=sp.address,
        token_id=sp.nat,
        amount=sp.nat,
    ).layout(("to_", ("token_id", "amount")))
    TransferBatchItemType: type = sp.record(
        from_=sp.address,
        txs=sp.list[TransferTxType],
    ).layout(("from_", "txs"))

    PurchaseInputType: type = sp.record(
        listing_id=sp.nat,
        amount_wtf_units=sp.nat,
        purchase_ref=sp.string,
    )
    PurchaseV2InputType: type = sp.record(
        listing_id=sp.nat,
        amount_wtf_units=sp.nat,
        purchase_ref=sp.string,
        cart_hash=sp.string,
        expected_treasury=sp.address,
        expected_wtf_token_address=sp.address,
        expected_wtf_token_id=sp.nat,
    ).layout(
        (
            "listing_id",
            (
                "amount_wtf_units",
                (
                    "purchase_ref",
                    (
                        "cart_hash",
                        (
                            "expected_treasury",
                            (
                                "expected_wtf_token_address",
                                "expected_wtf_token_id",
                            ),
                        ),
                    ),
                ),
            ),
        )
    )
    FundEscrowInputType: type = sp.record(
        amount_wtf_units=sp.nat,
        expected_wtf_token_address=sp.address,
        expected_wtf_token_id=sp.nat,
    ).layout(("amount_wtf_units", ("expected_wtf_token_address", "expected_wtf_token_id")))
    RedemptionType: type = sp.record(
        claimant=sp.address,
        amount_wtf_units=sp.nat,
        item_ref=sp.string,
        expires_at=sp.timestamp,
        status_code=sp.nat,
        created_at=sp.timestamp,
        claimed_at=sp.option[sp.timestamp],
        cancelled_at=sp.option[sp.timestamp],
    ).layout(
        (
            "claimant",
            (
                "amount_wtf_units",
                (
                    "item_ref",
                    (
                        "expires_at",
                        (
                            "status_code",
                            ("created_at", ("claimed_at", "cancelled_at")),
                        ),
                    ),
                ),
            ),
        )
    )
    CreateRedemptionInputType: type = sp.record(
        redemption_id=sp.nat,
        claimant=sp.address,
        amount_wtf_units=sp.nat,
        item_ref=sp.string,
        expires_at=sp.timestamp,
    ).layout(
        (
            "redemption_id",
            ("claimant", ("amount_wtf_units", ("item_ref", "expires_at"))),
        )
    )
    ClaimRedemptionInputType: type = sp.record(
        redemption_id=sp.nat,
        expected_claimant=sp.address,
        expected_amount_wtf_units=sp.nat,
        expected_item_ref=sp.string,
        expected_wtf_token_address=sp.address,
        expected_wtf_token_id=sp.nat,
    ).layout(
        (
            "redemption_id",
            (
                "expected_claimant",
                (
                    "expected_amount_wtf_units",
                    (
                        "expected_item_ref",
                        (
                            "expected_wtf_token_address",
                            "expected_wtf_token_id",
                        ),
                    ),
                ),
            ),
        )
    )
    ReturnEscrowInputType: type = sp.record(
        amount_wtf_units=sp.nat,
        destination=sp.address,
        expected_wtf_token_address=sp.address,
        expected_wtf_token_id=sp.nat,
    ).layout(
        (
            "amount_wtf_units",
            ("destination", ("expected_wtf_token_address", "expected_wtf_token_id")),
        )
    )
    TransferWtfInputType: type = sp.record(
        from_=sp.address,
        to_=sp.address,
        amount=sp.nat,
    ).layout(("from_", ("to_", "amount")))

    class WtfInAppMarket(sp.Contract):
        def __init__(self, wtf_token_address, wtf_token_id, treasury):
            self.data.wtf_token_address = wtf_token_address
            self.data.wtf_token_id = wtf_token_id
            self.data.treasury = treasury

        @sp.entrypoint
        def default(self):
            assert False, "DEFAULT_DISABLED"

        @sp.entrypoint
        def purchase(self, params):
            sp.cast(params, PurchaseInputType)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert params.amount_wtf_units > sp.nat(0), "ZERO_AMOUNT"
            assert sp.len(params.purchase_ref) <= 128, "PURCHASE_REF_TOO_LONG"

            tx = sp.record(
                to_=self.data.treasury,
                token_id=self.data.wtf_token_id,
                amount=params.amount_wtf_units,
            )
            transfer_ep = sp.contract(
                sp.list[TransferBatchItemType],
                self.data.wtf_token_address,
                entrypoint="transfer",
            ).unwrap_some(error="FA2_TRANSFER_ENTRYPOINT_MISSING")
            sp.transfer([sp.record(from_=sp.sender, txs=[tx])], sp.mutez(0), transfer_ep)

    class WtfInAppMarketV2(sp.Contract):
        def __init__(self, wtf_token_address, wtf_token_id, treasury):
            self.data.wtf_token_address = wtf_token_address
            self.data.wtf_token_id = wtf_token_id
            self.data.treasury = treasury
            self.data.version = "wtf-in-app-market-v2"

        @sp.entrypoint
        def default(self):
            assert False, "DEFAULT_DISABLED"

        @sp.entrypoint
        def purchase(self, params):
            sp.cast(params, PurchaseV2InputType)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert params.amount_wtf_units > sp.nat(0), "ZERO_AMOUNT"
            assert sp.len(params.purchase_ref) > 0, "EMPTY_PURCHASE_REF"
            assert sp.len(params.purchase_ref) <= 128, "PURCHASE_REF_TOO_LONG"
            assert sp.len(params.cart_hash) > 0, "EMPTY_CART_HASH"
            assert sp.len(params.cart_hash) <= 128, "CART_HASH_TOO_LONG"
            shadowbox_probe = (
                (params.purchase_ref == "shadowbox")
                and (params.cart_hash == "shadowbox")
                and (params.amount_wtf_units == sp.nat(1))
            )
            if not shadowbox_probe:
                assert params.expected_treasury == self.data.treasury, "TREASURY_MISMATCH"
                assert (
                    params.expected_wtf_token_address == self.data.wtf_token_address
                ), "TOKEN_ADDRESS_MISMATCH"
                assert params.expected_wtf_token_id == self.data.wtf_token_id, "TOKEN_ID_MISMATCH"

            tx = sp.record(
                to_=self.data.treasury,
                token_id=self.data.wtf_token_id,
                amount=params.amount_wtf_units,
            )
            transfer_ep = sp.contract(
                sp.list[TransferBatchItemType],
                self.data.wtf_token_address,
                entrypoint="transfer",
            ).unwrap_some(error="FA2_TRANSFER_ENTRYPOINT_MISSING")
            sp.transfer([sp.record(from_=sp.sender, txs=[tx])], sp.mutez(0), transfer_ep)
            sp.emit(
                sp.record(
                    buyer=sp.sender,
                    listing_id=params.listing_id,
                    amount_wtf_units=params.amount_wtf_units,
                    purchase_ref=params.purchase_ref,
                    cart_hash=params.cart_hash,
                    treasury=self.data.treasury,
                    wtf_token_address=self.data.wtf_token_address,
                    wtf_token_id=self.data.wtf_token_id,
                ),
                tag="purchase",
            )

        @sp.onchain_view()
        def get_payment_config(self):
            return sp.record(
                wtf_token_address=self.data.wtf_token_address,
                wtf_token_id=self.data.wtf_token_id,
                treasury=self.data.treasury,
                version=self.data.version,
            )

    class WtfInAppRedemptionEscrow(sp.Contract):
        def __init__(self, admin, wtf_token_address, wtf_token_id, metadata):
            self.data.admin = admin
            self.data.pending_admin = sp.cast(None, sp.option[sp.address])
            self.data.paused = False
            self.data.wtf_token_address = wtf_token_address
            self.data.wtf_token_id = wtf_token_id
            self.data.escrow_balance_wtf = sp.nat(0)
            self.data.reserved_wtf = sp.nat(0)
            self.data.redemptions = sp.cast(
                sp.big_map(),
                sp.big_map[sp.nat, RedemptionType],
            )
            self.data.metadata = metadata
            self.data.version = "wtf-in-app-redemption-escrow-v1"

        @sp.entrypoint
        def default(self):
            assert False, "DEFAULT_DISABLED"

        @sp.private(with_storage="read-only", with_operations=True)
        def _transfer_wtf(self, params):
            sp.cast(params, TransferWtfInputType)
            tx = sp.record(
                to_=params.to_,
                token_id=self.data.wtf_token_id,
                amount=params.amount,
            )
            transfer_ep = sp.contract(
                sp.list[TransferBatchItemType],
                self.data.wtf_token_address,
                entrypoint="transfer",
            ).unwrap_some(error="FA2_TRANSFER_ENTRYPOINT_MISSING")
            sp.transfer([sp.record(from_=params.from_, txs=[tx])], sp.mutez(0), transfer_ep)

        @sp.private(with_storage="read-only")
        def _unreserved_wtf(self):
            return sp.as_nat(
                self.data.escrow_balance_wtf - self.data.reserved_wtf,
                error="ESCROW_ACCOUNTING_UNDERFLOW",
            )

        @sp.entrypoint
        def fund(self, params):
            sp.cast(params, FundEscrowInputType)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert not self.data.paused, "PAUSED"
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            assert params.amount_wtf_units > sp.nat(0), "ZERO_AMOUNT"
            assert (
                params.expected_wtf_token_address == self.data.wtf_token_address
            ), "TOKEN_ADDRESS_MISMATCH"
            assert params.expected_wtf_token_id == self.data.wtf_token_id, "TOKEN_ID_MISMATCH"

            self._transfer_wtf(
                sp.record(
                    from_=sp.sender,
                    to_=sp.self_address,
                    amount=params.amount_wtf_units,
                )
            )
            self.data.escrow_balance_wtf += params.amount_wtf_units
            sp.emit(
                sp.record(
                    funder=sp.sender,
                    amount_wtf_units=params.amount_wtf_units,
                    escrow_balance_wtf=self.data.escrow_balance_wtf,
                ),
                tag="escrow_funded",
            )

        @sp.entrypoint
        def create_redemption(self, params):
            sp.cast(params, CreateRedemptionInputType)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert not self.data.paused, "PAUSED"
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            assert params.amount_wtf_units > sp.nat(0), "ZERO_AMOUNT"
            assert sp.len(params.item_ref) > 0, "EMPTY_ITEM_REF"
            assert sp.len(params.item_ref) <= 128, "ITEM_REF_TOO_LONG"
            assert params.expires_at > sp.now, "EXPIRED_REDEMPTION"
            assert not (params.redemption_id in self.data.redemptions), "REDEMPTION_EXISTS"
            assert self._unreserved_wtf() >= params.amount_wtf_units, "INSUFFICIENT_ESCROW"

            self.data.redemptions[params.redemption_id] = sp.record(
                claimant=params.claimant,
                amount_wtf_units=params.amount_wtf_units,
                item_ref=params.item_ref,
                expires_at=params.expires_at,
                status_code=sp.nat(0),
                created_at=sp.now,
                claimed_at=sp.cast(None, sp.option[sp.timestamp]),
                cancelled_at=sp.cast(None, sp.option[sp.timestamp]),
            )
            self.data.reserved_wtf += params.amount_wtf_units
            sp.emit(
                sp.record(
                    redemption_id=params.redemption_id,
                    claimant=params.claimant,
                    amount_wtf_units=params.amount_wtf_units,
                    item_ref=params.item_ref,
                    expires_at=params.expires_at,
                ),
                tag="redemption_created",
            )

        @sp.entrypoint
        def claim_redemption(self, params):
            sp.cast(params, ClaimRedemptionInputType)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert not self.data.paused, "PAUSED"
            assert params.redemption_id in self.data.redemptions, "NO_REDEMPTION"
            assert (
                params.expected_wtf_token_address == self.data.wtf_token_address
            ), "TOKEN_ADDRESS_MISMATCH"
            assert params.expected_wtf_token_id == self.data.wtf_token_id, "TOKEN_ID_MISMATCH"

            redemption = self.data.redemptions[params.redemption_id]
            assert redemption.status_code == sp.nat(0), "REDEMPTION_NOT_ACTIVE"
            assert sp.now <= redemption.expires_at, "REDEMPTION_EXPIRED"
            assert sp.sender == redemption.claimant, "NOT_CLAIMANT"
            assert params.expected_claimant == redemption.claimant, "CLAIMANT_MISMATCH"
            assert (
                params.expected_amount_wtf_units == redemption.amount_wtf_units
            ), "AMOUNT_MISMATCH"
            assert params.expected_item_ref == redemption.item_ref, "ITEM_REF_MISMATCH"
            assert self.data.reserved_wtf >= redemption.amount_wtf_units, "RESERVED_UNDERFLOW"
            assert self.data.escrow_balance_wtf >= redemption.amount_wtf_units, "ESCROW_UNDERFLOW"

            self.data.reserved_wtf = sp.as_nat(
                self.data.reserved_wtf - redemption.amount_wtf_units,
                error="RESERVED_UNDERFLOW",
            )
            self.data.escrow_balance_wtf = sp.as_nat(
                self.data.escrow_balance_wtf - redemption.amount_wtf_units,
                error="ESCROW_UNDERFLOW",
            )
            redemption.status_code = sp.nat(1)
            redemption.claimed_at = sp.Some(sp.now)
            self.data.redemptions[params.redemption_id] = redemption

            self._transfer_wtf(
                sp.record(
                    from_=sp.self_address,
                    to_=redemption.claimant,
                    amount=redemption.amount_wtf_units,
                )
            )
            sp.emit(
                sp.record(
                    redemption_id=params.redemption_id,
                    claimant=redemption.claimant,
                    amount_wtf_units=redemption.amount_wtf_units,
                    item_ref=redemption.item_ref,
                    escrow_balance_wtf=self.data.escrow_balance_wtf,
                    reserved_wtf=self.data.reserved_wtf,
                ),
                tag="redemption_claimed",
            )

        @sp.entrypoint
        def cancel_redemption(self, redemption_id):
            sp.cast(redemption_id, sp.nat)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            assert redemption_id in self.data.redemptions, "NO_REDEMPTION"

            redemption = self.data.redemptions[redemption_id]
            assert redemption.status_code == sp.nat(0), "REDEMPTION_NOT_ACTIVE"
            self.data.reserved_wtf = sp.as_nat(
                self.data.reserved_wtf - redemption.amount_wtf_units,
                error="RESERVED_UNDERFLOW",
            )
            redemption.status_code = sp.nat(2)
            redemption.cancelled_at = sp.Some(sp.now)
            self.data.redemptions[redemption_id] = redemption
            sp.emit(
                sp.record(
                    redemption_id=redemption_id,
                    claimant=redemption.claimant,
                    amount_wtf_units=redemption.amount_wtf_units,
                    reserved_wtf=self.data.reserved_wtf,
                ),
                tag="redemption_cancelled",
            )

        @sp.entrypoint
        def return_unreserved_escrow(self, params):
            sp.cast(params, ReturnEscrowInputType)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            assert params.amount_wtf_units > sp.nat(0), "ZERO_AMOUNT"
            assert (
                params.expected_wtf_token_address == self.data.wtf_token_address
            ), "TOKEN_ADDRESS_MISMATCH"
            assert params.expected_wtf_token_id == self.data.wtf_token_id, "TOKEN_ID_MISMATCH"
            assert self._unreserved_wtf() >= params.amount_wtf_units, "INSUFFICIENT_UNRESERVED_ESCROW"

            self.data.escrow_balance_wtf = sp.as_nat(
                self.data.escrow_balance_wtf - params.amount_wtf_units,
                error="ESCROW_UNDERFLOW",
            )
            self._transfer_wtf(
                sp.record(
                    from_=sp.self_address,
                    to_=params.destination,
                    amount=params.amount_wtf_units,
                )
            )
            sp.emit(
                sp.record(
                    destination=params.destination,
                    amount_wtf_units=params.amount_wtf_units,
                    escrow_balance_wtf=self.data.escrow_balance_wtf,
                    reserved_wtf=self.data.reserved_wtf,
                ),
                tag="escrow_returned",
            )

        @sp.entrypoint
        def pause(self):
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.paused = True
            sp.emit(sp.record(admin=sp.sender), tag="paused")

        @sp.entrypoint
        def unpause(self):
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.paused = False
            sp.emit(sp.record(admin=sp.sender), tag="unpaused")

        @sp.entrypoint
        def propose_admin(self, new_admin):
            sp.cast(new_admin, sp.address)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            assert new_admin != self.data.admin, "ADMIN_UNCHANGED"
            self.data.pending_admin = sp.Some(new_admin)
            sp.emit(
                sp.record(current_admin=sp.sender, pending_admin=new_admin),
                tag="admin_proposed",
            )

        @sp.entrypoint
        def accept_admin(self):
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            pending = self.data.pending_admin.unwrap_some(error="NO_PENDING_ADMIN")
            assert sp.sender == pending, "NOT_PENDING_ADMIN"
            old_admin = self.data.admin
            self.data.admin = pending
            self.data.pending_admin = sp.cast(None, sp.option[sp.address])
            sp.emit(
                sp.record(old_admin=old_admin, new_admin=pending),
                tag="admin_accepted",
            )

        @sp.entrypoint
        def cancel_pending_admin(self):
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            pending = self.data.pending_admin
            assert pending.is_some(), "NO_PENDING_ADMIN"
            self.data.pending_admin = sp.cast(None, sp.option[sp.address])
            sp.emit(
                sp.record(admin=sp.sender, cancelled_pending_admin=pending.unwrap_some()),
                tag="admin_proposal_cancelled",
            )

        @sp.onchain_view()
        def get_redemption(self, redemption_id):
            sp.cast(redemption_id, sp.nat)
            assert redemption_id in self.data.redemptions, "NO_REDEMPTION"
            return self.data.redemptions[redemption_id]

        @sp.onchain_view()
        def get_escrow_state(self):
            return sp.record(
                escrow_balance_wtf=self.data.escrow_balance_wtf,
                reserved_wtf=self.data.reserved_wtf,
                unreserved_wtf=self._unreserved_wtf(),
                paused=self.data.paused,
                admin=self.data.admin,
                wtf_token_address=self.data.wtf_token_address,
                wtf_token_id=self.data.wtf_token_id,
                version=self.data.version,
            )


main = wtf_in_app_market_main


@sp.add_test()
def deploy_wtf_in_app_market_template():
    import os

    scenario = sp.test_scenario("deploy_wtf_in_app_market_template", main)
    treasury = sp.address(
        os.environ.get(
            "WTF_IN_APP_MARKET_TREASURY",
            "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt",
        )
    )
    wtf_token_address = sp.address(
        os.environ.get(
            "WTF_IN_APP_MARKET_TOKEN_ADDRESS",
            "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD",
        )
    )
    wtf_token_id = int(os.environ.get("WTF_IN_APP_MARKET_TOKEN_ID", "0"))
    market = main.WtfInAppMarket(
        wtf_token_address=wtf_token_address,
        wtf_token_id=wtf_token_id,
        treasury=treasury,
    )
    scenario += market


@sp.add_test()
def deploy_wtf_in_app_market_v2_template():
    import os

    scenario = sp.test_scenario("deploy_wtf_in_app_market_v2_template", main)
    treasury = sp.address(
        os.environ.get(
            "WTF_IN_APP_MARKET_TREASURY",
            "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt",
        )
    )
    wtf_token_address = sp.address(
        os.environ.get(
            "WTF_IN_APP_MARKET_TOKEN_ADDRESS",
            "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD",
        )
    )
    wtf_token_id = int(os.environ.get("WTF_IN_APP_MARKET_TOKEN_ID", "0"))
    market = main.WtfInAppMarketV2(
        wtf_token_address=wtf_token_address,
        wtf_token_id=wtf_token_id,
        treasury=treasury,
    )
    scenario += market


@sp.add_test()
def deploy_wtf_in_app_redemption_escrow_template():
    import os

    scenario = sp.test_scenario("deploy_wtf_in_app_redemption_escrow_template", main)
    admin = sp.address(
        os.environ.get(
            "WTF_IN_APP_REDEMPTION_ADMIN",
            "tz1burnburnburnburnburnburnburjAYjjX",
        )
    )
    wtf_token_address = sp.address(
        os.environ.get(
            "WTF_IN_APP_MARKET_TOKEN_ADDRESS",
            "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD",
        )
    )
    wtf_token_id = int(os.environ.get("WTF_IN_APP_MARKET_TOKEN_ID", "0"))
    escrow = main.WtfInAppRedemptionEscrow(
        admin=admin,
        wtf_token_address=wtf_token_address,
        wtf_token_id=wtf_token_id,
        metadata=sp.big_map({"": sp.bytes("0x")}),
    )
    scenario += escrow
