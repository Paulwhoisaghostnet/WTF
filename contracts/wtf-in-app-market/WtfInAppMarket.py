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
