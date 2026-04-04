"""
WTF Marketplace contract (SmartPy, FA2-based settlement).

Core flow:
  1) Seller creates listing (NFT escrowed into contract).
  2) Seller pays 25 WTF listing fee (raw units, 8 decimals).
  3) Buyer buys listing with WTF.
  4) Contract transfers WTF split:
     - royalty share to royalty recipient (if configured)
     - seller share to seller
  5) Contract transfers NFT to buyer.

Notes:
  - Contract can hold XTZ (`default` entrypoint) and admin can withdraw XTZ.
  - Tezos transaction fees are paid by the operation source account, not by
    contract balance. A relayer/paymaster pattern is needed for fully sponsored UX.
"""

import smartpy as sp

WTF_DECIMALS = 8
WTF_SCALE = 10 ** WTF_DECIMALS
DEFAULT_LISTING_FEE_WTF = 25 * WTF_SCALE


class WTFMarketplace(sp.Contract):
    def __init__(
        self,
        admin,
        fee_collector,
        wtf_token_address,
        wtf_token_id,
        listing_fee_wtf=DEFAULT_LISTING_FEE_WTF,
    ):
        listing_type = sp.TRecord(
            seller=sp.TAddress,
            token_contract=sp.TAddress,
            token_id=sp.TNat,
            token_amount=sp.TNat,
            price_wtf=sp.TNat,
            royalty_recipient=sp.TOption(sp.TAddress),
            royalty_bps=sp.TNat,  # out of 10_000
            active=sp.TBool,
        ).layout(
            (
                "seller",
                (
                    "token_contract",
                    (
                        "token_id",
                        (
                            "token_amount",
                            ("price_wtf", ("royalty_recipient", ("royalty_bps", "active"))),
                        ),
                    ),
                ),
            )
        )

        self.init(
            admin=admin,
            fee_collector=fee_collector,
            wtf_token_address=wtf_token_address,
            wtf_token_id=sp.nat(wtf_token_id),
            listing_fee_wtf=sp.nat(listing_fee_wtf),
            next_listing_id=sp.nat(0),
            listings=sp.big_map(tkey=sp.TNat, tvalue=listing_type),
        )

    def _assert_no_tez(self):
        sp.verify(sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED")

    def _fa2_transfer(self, token_contract, from_, to_, token_id, amount):
        transfer_t = sp.TList(
            sp.TRecord(
                from_=sp.TAddress,
                txs=sp.TList(
                    sp.TRecord(
                        to_=sp.TAddress,
                        token_id=sp.TNat,
                        amount=sp.TNat,
                    ).layout(("to_", ("token_id", "amount")))
                ),
            ).layout(("from_", "txs"))
        )
        transfer_ep = sp.contract(transfer_t, token_contract, "transfer").open_some("FA2_TRANSFER_EP_MISSING")
        payload = [
            sp.record(
                from_=from_,
                txs=[sp.record(to_=to_, token_id=token_id, amount=amount)],
            )
        ]
        sp.transfer(payload, sp.mutez(0), transfer_ep)

    def _wtf_transfer(self, from_, to_, amount):
        self._fa2_transfer(
            self.data.wtf_token_address,
            from_,
            to_,
            self.data.wtf_token_id,
            amount,
        )

    @sp.entry_point
    def default(self):
        """Accept incoming XTZ to keep treasury balance on contract."""
        sp.unit

    @sp.entry_point
    def create_listing(self, params):
        self._assert_no_tez()
        sp.set_type(
            params,
            sp.TRecord(
                token_contract=sp.TAddress,
                token_id=sp.TNat,
                token_amount=sp.TNat,
                price_wtf=sp.TNat,
                royalty_recipient=sp.TOption(sp.TAddress),
                royalty_bps=sp.TNat,
            ).layout(
                (
                    "token_contract",
                    ("token_id", ("token_amount", ("price_wtf", ("royalty_recipient", "royalty_bps")))),
                )
            ),
        )
        sp.verify(params.token_amount > 0, "TOKEN_AMOUNT_INVALID")
        sp.verify(params.price_wtf > 0, "PRICE_INVALID")
        sp.verify(params.royalty_bps <= 10_000, "ROYALTY_BPS_INVALID")
        sp.verify(
            (params.royalty_bps == 0) | params.royalty_recipient.is_some(),
            "ROYALTY_RECIPIENT_REQUIRED",
        )

        # Listing fee in raw WTF units (decimals already applied).
        self._wtf_transfer(sp.sender, self.data.fee_collector, self.data.listing_fee_wtf)

        # Escrow listed token into marketplace contract.
        self._fa2_transfer(
            params.token_contract,
            sp.sender,
            sp.self_address,
            params.token_id,
            params.token_amount,
        )

        listing_id = self.data.next_listing_id
        self.data.listings[listing_id] = sp.record(
            seller=sp.sender,
            token_contract=params.token_contract,
            token_id=params.token_id,
            token_amount=params.token_amount,
            price_wtf=params.price_wtf,
            royalty_recipient=params.royalty_recipient,
            royalty_bps=params.royalty_bps,
            active=True,
        )
        self.data.next_listing_id = listing_id + 1

    @sp.entry_point
    def buy(self, listing_id):
        self._assert_no_tez()
        sp.set_type(listing_id, sp.TNat)
        sp.verify(self.data.listings.contains(listing_id), "LISTING_NOT_FOUND")
        listing = self.data.listings[listing_id]
        sp.verify(listing.active, "LISTING_INACTIVE")
        sp.verify(sp.sender != listing.seller, "SELF_BUY_FORBIDDEN")

        royalty_amount = (listing.price_wtf * listing.royalty_bps) // 10_000
        seller_amount = sp.as_nat(listing.price_wtf - royalty_amount)

        with listing.royalty_recipient.match_cases() as royalty_case:
            with royalty_case.match("Some") as royalty_addr:
                with sp.if_(royalty_amount > 0):
                    self._wtf_transfer(sp.sender, royalty_addr, royalty_amount)
            with royalty_case.match("None"):
                sp.unit

        self._wtf_transfer(sp.sender, listing.seller, seller_amount)

        self._fa2_transfer(
            listing.token_contract,
            sp.self_address,
            sp.sender,
            listing.token_id,
            listing.token_amount,
        )

        listing.active = False
        self.data.listings[listing_id] = listing

    @sp.entry_point
    def cancel_listing(self, listing_id):
        self._assert_no_tez()
        sp.set_type(listing_id, sp.TNat)
        sp.verify(self.data.listings.contains(listing_id), "LISTING_NOT_FOUND")
        listing = self.data.listings[listing_id]
        sp.verify(listing.active, "LISTING_INACTIVE")
        sp.verify(
            (sp.sender == listing.seller) | (sp.sender == self.data.admin),
            "NOT_AUTHORIZED",
        )

        self._fa2_transfer(
            listing.token_contract,
            sp.self_address,
            listing.seller,
            listing.token_id,
            listing.token_amount,
        )

        listing.active = False
        self.data.listings[listing_id] = listing

    @sp.entry_point
    def set_admin(self, new_admin):
        self._assert_no_tez()
        sp.set_type(new_admin, sp.TAddress)
        sp.verify(sp.sender == self.data.admin, "NOT_ADMIN")
        self.data.admin = new_admin

    @sp.entry_point
    def set_fee_collector(self, new_fee_collector):
        self._assert_no_tez()
        sp.set_type(new_fee_collector, sp.TAddress)
        sp.verify(sp.sender == self.data.admin, "NOT_ADMIN")
        self.data.fee_collector = new_fee_collector

    @sp.entry_point
    def set_listing_fee(self, new_listing_fee_wtf):
        self._assert_no_tez()
        # Raw WTF units (8 decimals).
        sp.set_type(new_listing_fee_wtf, sp.TNat)
        sp.verify(sp.sender == self.data.admin, "NOT_ADMIN")
        self.data.listing_fee_wtf = new_listing_fee_wtf

    @sp.entry_point
    def admin_withdraw_xtz(self, params):
        self._assert_no_tez()
        sp.set_type(
            params,
            sp.TRecord(destination=sp.TAddress, amount=sp.TMutez).layout(("destination", "amount")),
        )
        sp.verify(sp.sender == self.data.admin, "NOT_ADMIN")
        sp.send(params.destination, params.amount)


sp.add_compilation_target(
    "WTFMarketplace",
    WTFMarketplace(
        admin=sp.address("tz1burnburnburnburnburnburnburjAYjjX"),
        fee_collector=sp.address("tz1burnburnburnburnburnburnburjAYjjX"),
        wtf_token_address=sp.address("KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD"),
        wtf_token_id=0,
        listing_fee_wtf=DEFAULT_LISTING_FEE_WTF,
    ),
)
