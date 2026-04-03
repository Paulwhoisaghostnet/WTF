"""
WTF Marketplace Smart Contract (SmartPy)

A marketplace for trading tokens using WTF as the denomination currency.
Sellers list NFTs/tokens, buyers pay with WTF FA2 tokens.

Entrypoints:
  - create_listing: List a token for sale (buy-now or auction)
  - buy: Purchase a buy-now listing with WTF tokens
  - place_bid: Place a bid on an auction listing (WTF escrowed)
  - accept_bid: Seller accepts a bid
  - cancel_listing: Seller cancels their listing
  - withdraw: Withdraw claimable WTF from completed sales
  - set_admin: Update admin address

Requires FA2 update_operators approval for both the listed token and WTF token.
"""

import smartpy as sp

FA2 = sp.io.import_script_from_url("https://smartpy.io/templates/fa2_lib.py")


class WTFMarketplace(sp.Contract):
    def __init__(self, admin, wtf_token_address, wtf_token_id):
        self.init(
            admin=admin,
            wtf_token_address=wtf_token_address,
            wtf_token_id=sp.nat(wtf_token_id),
            next_listing_id=sp.nat(0),
            next_bid_id=sp.nat(0),
            listings=sp.big_map(
                tkey=sp.TNat,
                tvalue=sp.TRecord(
                    seller=sp.TAddress,
                    token_contract=sp.TAddress,
                    token_id=sp.TNat,
                    token_amount=sp.TNat,
                    listing_type=sp.TNat,  # 0 = buy_now, 1 = auction
                    price_wtf=sp.TNat,
                    min_bid_wtf=sp.TNat,
                    end_time=sp.TTimestamp,
                    active=sp.TBool,
                ),
            ),
            bids=sp.big_map(
                tkey=sp.TNat,
                tvalue=sp.TRecord(
                    listing_id=sp.TNat,
                    bidder=sp.TAddress,
                    amount_wtf=sp.TNat,
                    active=sp.TBool,
                ),
            ),
            claimable=sp.big_map(tkey=sp.TAddress, tvalue=sp.TNat),
        )

    def _transfer_fa2(self, token_contract, from_, to_, token_id, amount):
        """Helper to call FA2 transfer entrypoint."""
        transfer_type = sp.TList(
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
        transfer_data = [
            sp.record(
                from_=from_,
                txs=[sp.record(to_=to_, token_id=token_id, amount=amount)],
            )
        ]
        contract = sp.contract(transfer_type, token_contract, "transfer").open_some()
        sp.transfer(transfer_data, sp.mutez(0), contract)

    def _transfer_wtf(self, from_, to_, amount):
        """Transfer WTF tokens."""
        self._transfer_fa2(
            self.data.wtf_token_address,
            from_,
            to_,
            self.data.wtf_token_id,
            amount,
        )

    def _add_claimable(self, address, amount):
        """Add to claimable balance."""
        current = self.data.claimable.get(address, sp.nat(0))
        self.data.claimable[address] = current + amount

    @sp.entry_point
    def create_listing(self, params):
        """
        Create a new listing.
        Params: token_contract, token_id, token_amount, listing_type (0=buy_now, 1=auction),
                price_wtf, min_bid_wtf, end_time
        The seller must have approved this contract as an operator for the listed token.
        """
        sp.set_type(
            params,
            sp.TRecord(
                token_contract=sp.TAddress,
                token_id=sp.TNat,
                token_amount=sp.TNat,
                listing_type=sp.TNat,
                price_wtf=sp.TNat,
                min_bid_wtf=sp.TNat,
                end_time=sp.TTimestamp,
            ),
        )
        sp.verify(params.listing_type <= 1, "INVALID_LISTING_TYPE")
        sp.verify(params.price_wtf > 0, "PRICE_MUST_BE_POSITIVE")
        sp.verify(params.token_amount > 0, "AMOUNT_MUST_BE_POSITIVE")

        # Escrow the listed token into the contract
        self._transfer_fa2(
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
            listing_type=params.listing_type,
            price_wtf=params.price_wtf,
            min_bid_wtf=params.min_bid_wtf,
            end_time=params.end_time,
            active=True,
        )
        self.data.next_listing_id = listing_id + 1

    @sp.entry_point
    def buy(self, listing_id):
        """
        Buy a buy-now listing. Buyer must have approved this contract as operator for WTF token.
        """
        sp.set_type(listing_id, sp.TNat)
        listing = self.data.listings[listing_id]
        sp.verify(listing.active, "LISTING_NOT_ACTIVE")
        sp.verify(listing.listing_type == 0, "NOT_BUY_NOW")
        sp.verify(sp.sender != listing.seller, "CANNOT_BUY_OWN")

        # Transfer WTF from buyer to claimable for seller
        self._transfer_wtf(sp.sender, sp.self_address, listing.price_wtf)
        self._add_claimable(listing.seller, listing.price_wtf)

        # Transfer listed token from contract to buyer
        self._transfer_fa2(
            listing.token_contract,
            sp.self_address,
            sp.sender,
            listing.token_id,
            listing.token_amount,
        )

        # Deactivate listing
        listing.active = False
        self.data.listings[listing_id] = listing

    @sp.entry_point
    def place_bid(self, params):
        """
        Place a bid on an auction listing.
        The bid amount in WTF is escrowed.
        """
        sp.set_type(params, sp.TRecord(listing_id=sp.TNat, amount_wtf=sp.TNat))
        listing = self.data.listings[params.listing_id]
        sp.verify(listing.active, "LISTING_NOT_ACTIVE")
        sp.verify(listing.listing_type == 1, "NOT_AUCTION")
        sp.verify(sp.sender != listing.seller, "CANNOT_BID_OWN")
        sp.verify(params.amount_wtf >= listing.min_bid_wtf, "BID_TOO_LOW")
        sp.verify(sp.now <= listing.end_time, "AUCTION_ENDED")

        # Escrow WTF bid
        self._transfer_wtf(sp.sender, sp.self_address, params.amount_wtf)

        bid_id = self.data.next_bid_id
        self.data.bids[bid_id] = sp.record(
            listing_id=params.listing_id,
            bidder=sp.sender,
            amount_wtf=params.amount_wtf,
            active=True,
        )
        self.data.next_bid_id = bid_id + 1

    @sp.entry_point
    def accept_bid(self, bid_id):
        """Seller accepts a bid. Transfers token to bidder, WTF to seller's claimable."""
        sp.set_type(bid_id, sp.TNat)
        bid = self.data.bids[bid_id]
        sp.verify(bid.active, "BID_NOT_ACTIVE")

        listing = self.data.listings[bid.listing_id]
        sp.verify(listing.active, "LISTING_NOT_ACTIVE")
        sp.verify(sp.sender == listing.seller, "NOT_SELLER")

        # Move escrowed WTF to seller's claimable
        self._add_claimable(listing.seller, bid.amount_wtf)

        # Transfer listed token to bidder
        self._transfer_fa2(
            listing.token_contract,
            sp.self_address,
            bid.bidder,
            listing.token_id,
            listing.token_amount,
        )

        # Deactivate listing and bid
        listing.active = False
        self.data.listings[bid.listing_id] = listing
        bid.active = False
        self.data.bids[bid_id] = bid

    @sp.entry_point
    def cancel_listing(self, listing_id):
        """Seller cancels a listing and gets their token back."""
        sp.set_type(listing_id, sp.TNat)
        listing = self.data.listings[listing_id]
        sp.verify(listing.active, "LISTING_NOT_ACTIVE")
        sp.verify(
            (sp.sender == listing.seller) | (sp.sender == self.data.admin),
            "NOT_AUTHORIZED",
        )

        # Return escrowed token to seller
        self._transfer_fa2(
            listing.token_contract,
            sp.self_address,
            listing.seller,
            listing.token_id,
            listing.token_amount,
        )

        listing.active = False
        self.data.listings[listing_id] = listing

    @sp.entry_point
    def cancel_bid(self, bid_id):
        """Bidder cancels their bid and gets WTF back."""
        sp.set_type(bid_id, sp.TNat)
        bid = self.data.bids[bid_id]
        sp.verify(bid.active, "BID_NOT_ACTIVE")
        sp.verify(
            (sp.sender == bid.bidder) | (sp.sender == self.data.admin),
            "NOT_AUTHORIZED",
        )

        # Return escrowed WTF to bidder's claimable
        self._add_claimable(bid.bidder, bid.amount_wtf)

        bid.active = False
        self.data.bids[bid_id] = bid

    @sp.entry_point
    def withdraw(self):
        """Withdraw all claimable WTF tokens."""
        amount = self.data.claimable.get(sp.sender, sp.nat(0))
        sp.verify(amount > 0, "NOTHING_TO_WITHDRAW")

        self._transfer_wtf(sp.self_address, sp.sender, amount)
        del self.data.claimable[sp.sender]

    @sp.entry_point
    def set_admin(self, new_admin):
        """Update the admin address."""
        sp.set_type(new_admin, sp.TAddress)
        sp.verify(sp.sender == self.data.admin, "NOT_ADMIN")
        self.data.admin = new_admin


# ─── Tests ────────────────────────────────────────────────

@sp.add_test(name="WTFMarketplace")
def test():
    scenario = sp.test_scenario()
    scenario.h1("WTF Marketplace Tests")

    admin = sp.test_account("Admin")
    seller = sp.test_account("Seller")
    buyer = sp.test_account("Buyer")

    wtf_address = sp.address("KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD")

    marketplace = WTFMarketplace(
        admin=admin.address,
        wtf_token_address=wtf_address,
        wtf_token_id=0,
    )
    scenario += marketplace

    scenario.h2("Contract deployed successfully")
    scenario.verify(marketplace.data.next_listing_id == 0)
    scenario.verify(marketplace.data.admin == admin.address)


sp.add_compilation_target("WTFMarketplace", WTFMarketplace(
    admin=sp.address("tz1burnburnburnburnburnburnburjAYjjX"),
    wtf_token_address=sp.address("KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD"),
    wtf_token_id=0,
))
