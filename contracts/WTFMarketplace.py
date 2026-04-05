"""
WTF Marketplace contract (SmartPy, FA2-based settlement).

Core flow:
  1) Seller creates listing (NFT escrowed into contract).
  2) Buyer buys listing with WTF.
  3) Contract transfers WTF split:
     - royalty share to royalty recipient (if configured)
     - seller share to seller
  4) Contract transfers NFT to buyer.

Notes:
  - Contract can hold XTZ (`default` entrypoint) and admin can withdraw XTZ.
  - Tezos transaction fees are paid by the operation source account, not by
    contract balance. A relayer/paymaster pattern is needed for fully sponsored UX.
"""

import os

import smartpy as sp


@sp.module
def main():
    listing_type: type = sp.record(
        seller=sp.address,
        token_contract=sp.address,
        token_id=sp.nat,
        token_amount=sp.nat,
        price_wtf=sp.nat,
        royalty_recipient=sp.option[sp.address],
        royalty_bps=sp.nat,
        active=sp.bool,
    ).layout(
        (
            "seller",
            (
                "token_contract",
                (
                    "token_id",
                    ("token_amount", ("price_wtf", ("royalty_recipient", ("royalty_bps", "active")))),
                ),
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

    create_listing_type: type = sp.record(
        token_contract=sp.address,
        token_id=sp.nat,
        token_amount=sp.nat,
        price_wtf=sp.nat,
        royalty_recipient=sp.option[sp.address],
        royalty_bps=sp.nat,
    ).layout(
        (
            "token_contract",
            ("token_id", ("token_amount", ("price_wtf", ("royalty_recipient", "royalty_bps")))),
        )
    )

    token_ref_type: type = sp.record(token_contract=sp.address, token_id=sp.nat).layout(
        ("token_contract", "token_id")
    )

    place_offer_type: type = sp.record(
        token_contract=sp.address,
        token_id=sp.nat,
        token_amount=sp.nat,
        amount_wtf=sp.nat,
        target_owner=sp.address,
    ).layout(
        (
            "token_contract",
            ("token_id", ("token_amount", ("amount_wtf", "target_owner"))),
        )
    )

    offer_type: type = sp.record(
        offerer=sp.address,
        token_amount=sp.nat,
        amount_wtf=sp.nat,
        target_owner=sp.address,
    ).layout(("offerer", ("token_amount", ("amount_wtf", "target_owner"))))

    share_type: type = sp.record(amount=sp.nat, recipient=sp.address).layout(
        ("amount", "recipient")
    )

    create_auction_type: type = sp.record(
        token_contract=sp.address,
        token_id=sp.nat,
        reserve=sp.nat,
        start_time=sp.timestamp,
        end_time=sp.timestamp,
        extension_time=sp.nat,
        price_increment=sp.nat,
        shares=sp.list[share_type],
    ).layout(
        (
            "token_contract",
            (
                "token_id",
                (
                    "reserve",
                    ("start_time", ("end_time", ("extension_time", ("price_increment", "shares")))),
                ),
            ),
        )
    )

    bid_type: type = sp.record(auction_id=sp.nat, amount=sp.nat).layout(
        ("auction_id", "amount")
    )

    auction_type: type = sp.record(
        creator=sp.address,
        token_contract=sp.address,
        token_id=sp.nat,
        reserve=sp.nat,
        start_time=sp.timestamp,
        end_time=sp.timestamp,
        extension_time=sp.nat,
        price_increment=sp.nat,
        current_price=sp.nat,
        highest_bidder=sp.address,
        has_bid=sp.bool,
        shares=sp.list[share_type],
        active=sp.bool,
    ).layout(
        (
            "creator",
            (
                "token_contract",
                (
                    "token_id",
                    (
                        "reserve",
                        (
                            "start_time",
                            (
                                "end_time",
                                (
                                    "extension_time",
                                    (
                                        "price_increment",
                                        (
                                            "current_price",
                                            ("highest_bidder", ("has_bid", ("shares", "active"))),
                                        ),
                                    ),
                                ),
                            ),
                        ),
                    ),
                ),
            ),
        )
    )

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

    class WTFMarketplace(sp.Contract):
        def __init__(self, admin, wtf_token_address, wtf_token_id):
            sp.cast(admin, sp.address)
            sp.cast(wtf_token_address, sp.address)
            sp.cast(wtf_token_id, sp.nat)

            self.data.admin = admin
            self.data.wtf_token_address = wtf_token_address
            self.data.wtf_token_id = wtf_token_id

            self.data.next_listing_id = sp.nat(0)
            self.data.listings = sp.cast(sp.big_map(), sp.big_map[sp.nat, listing_type])
            self.data.listing_tokens = sp.cast(
                sp.big_map(), sp.big_map[token_ref_type, sp.nat]
            )

            self.data.next_auction_id = sp.nat(0)
            self.data.auctions = sp.cast(sp.big_map(), sp.big_map[sp.nat, auction_type])
            self.data.auction_tokens = sp.cast(
                sp.big_map(), sp.big_map[token_ref_type, sp.nat]
            )

            self.data.offers = sp.cast(sp.big_map(), sp.big_map[token_ref_type, offer_type])

            self.data.paused = False

        @sp.entrypoint
        def default(self):
            pass

        @sp.entrypoint
        def create_listing(self, params):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            assert not self.data.paused, "PAUSED"
            sp.cast(params, create_listing_type)

            assert params.token_amount > 0, "TOKEN_AMOUNT_INVALID"
            assert params.price_wtf > 0, "PRICE_INVALID"
            assert params.royalty_bps <= 10_000, "ROYALTY_BPS_INVALID"
            assert (
                params.royalty_bps == 0 or params.royalty_recipient.is_some()
            ), "ROYALTY_RECIPIENT_REQUIRED"

            token_key = sp.record(
                token_contract=params.token_contract, token_id=params.token_id
            )
            assert not self.data.listing_tokens.contains(token_key), "TOKEN_ALREADY_LISTED"
            assert not self.data.auction_tokens.contains(token_key), "AUCTION_ACTIVE"

            transfer_ep = sp.contract(
                transfer_batch_type, params.token_contract, entrypoint="transfer"
            ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
            sp.transfer(
                [
                    sp.record(
                        from_=sp.sender,
                        txs=[
                            sp.record(
                                to_=sp.self_address,
                                token_id=params.token_id,
                                amount=params.token_amount,
                            )
                        ],
                    )
                ],
                sp.mutez(0),
                transfer_ep,
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
            self.data.listing_tokens[token_key] = listing_id
            self.data.next_listing_id += 1

        @sp.entrypoint
        def buy(self, listing_id):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            assert not self.data.paused, "PAUSED"
            sp.cast(listing_id, sp.nat)

            assert listing_id in self.data.listings, "LISTING_NOT_FOUND"
            listing = self.data.listings[listing_id]
            assert listing.active, "LISTING_INACTIVE"
            assert sp.sender != listing.seller, "SELF_BUY_FORBIDDEN"

            token_key = sp.record(
                token_contract=listing.token_contract, token_id=listing.token_id
            )

            royalty_amount = (listing.price_wtf * listing.royalty_bps) / 10_000
            seller_amount = sp.as_nat(listing.price_wtf - royalty_amount)

            if listing.royalty_recipient.is_some() and royalty_amount > 0:
                royalty_transfer_ep = sp.contract(
                    transfer_batch_type,
                    self.data.wtf_token_address,
                    entrypoint="transfer",
                ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
                sp.transfer(
                    [
                        sp.record(
                            from_=sp.sender,
                            txs=[
                                sp.record(
                                    to_=listing.royalty_recipient.unwrap_some(),
                                    token_id=self.data.wtf_token_id,
                                    amount=royalty_amount,
                                )
                            ],
                        )
                    ],
                    sp.mutez(0),
                    royalty_transfer_ep,
                )

            seller_transfer_ep = sp.contract(
                transfer_batch_type, self.data.wtf_token_address, entrypoint="transfer"
            ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
            sp.transfer(
                [
                    sp.record(
                        from_=sp.sender,
                        txs=[
                            sp.record(
                                to_=listing.seller,
                                token_id=self.data.wtf_token_id,
                                amount=seller_amount,
                            )
                        ],
                    )
                ],
                sp.mutez(0),
                seller_transfer_ep,
            )

            nft_transfer_ep = sp.contract(
                transfer_batch_type, listing.token_contract, entrypoint="transfer"
            ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
            sp.transfer(
                [
                    sp.record(
                        from_=sp.self_address,
                        txs=[
                            sp.record(
                                to_=sp.sender,
                                token_id=listing.token_id,
                                amount=listing.token_amount,
                            )
                        ],
                    )
                ],
                sp.mutez(0),
                nft_transfer_ep,
            )
            del self.data.listing_tokens[token_key]
            del self.data.listings[listing_id]

        @sp.entrypoint
        def cancel_listing(self, listing_id):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            sp.cast(listing_id, sp.nat)

            assert listing_id in self.data.listings, "LISTING_NOT_FOUND"
            listing = self.data.listings[listing_id]
            assert listing.active, "LISTING_INACTIVE"
            assert (
                sp.sender == listing.seller or sp.sender == self.data.admin
            ), "NOT_AUTHORIZED"

            token_key = sp.record(
                token_contract=listing.token_contract, token_id=listing.token_id
            )
            del self.data.listing_tokens[token_key]
            del self.data.listings[listing_id]

            transfer_ep = sp.contract(
                transfer_batch_type, listing.token_contract, entrypoint="transfer"
            ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
            sp.transfer(
                [
                    sp.record(
                        from_=sp.self_address,
                        txs=[
                            sp.record(
                                to_=listing.seller,
                                token_id=listing.token_id,
                                amount=listing.token_amount,
                            )
                        ],
                    )
                ],
                sp.mutez(0),
                transfer_ep,
            )

        @sp.entrypoint
        def create_auction(self, params):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            assert not self.data.paused, "PAUSED"
            sp.cast(params, create_auction_type)

            assert params.reserve > 0, "RESERVE_INVALID"
            assert params.end_time > params.start_time, "TIME_WINDOW_INVALID"
            assert params.end_time > sp.now, "END_TIME_IN_PAST"
            assert params.price_increment > 0, "PRICE_INCREMENT_INVALID"

            shares_total = sp.nat(0)
            for share in params.shares:
                shares_total += share.amount
            assert shares_total <= 10_000, "SHARES_TOO_HIGH"

            token_key = sp.record(
                token_contract=params.token_contract, token_id=params.token_id
            )
            assert not self.data.auction_tokens.contains(token_key), "AUCTION_ACTIVE"
            assert not self.data.offers.contains(token_key), "OFFER_EXISTS"

            transfer_ep = sp.contract(
                transfer_batch_type, params.token_contract, entrypoint="transfer"
            ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
            sp.transfer(
                [
                    sp.record(
                        from_=sp.sender,
                        txs=[
                            sp.record(
                                to_=sp.self_address,
                                token_id=params.token_id,
                                amount=1,
                            )
                        ],
                    )
                ],
                sp.mutez(0),
                transfer_ep,
            )

            auction_id = self.data.next_auction_id
            self.data.auctions[auction_id] = sp.record(
                creator=sp.sender,
                token_contract=params.token_contract,
                token_id=params.token_id,
                reserve=params.reserve,
                start_time=params.start_time,
                end_time=params.end_time,
                extension_time=params.extension_time,
                price_increment=params.price_increment,
                current_price=sp.nat(0),
                highest_bidder=sp.sender,
                has_bid=False,
                shares=params.shares,
                active=True,
            )
            self.data.auction_tokens[token_key] = auction_id
            self.data.next_auction_id += 1

        @sp.entrypoint
        def bid(self, params):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            assert not self.data.paused, "PAUSED"
            sp.cast(params, bid_type)

            assert params.auction_id in self.data.auctions, "AUCTION_NOT_FOUND"
            auction = self.data.auctions[params.auction_id]

            assert auction.active, "AUCTION_INACTIVE"
            assert sp.now >= auction.start_time, "AUCTION_NOT_STARTED"
            assert sp.now < auction.end_time, "AUCTION_ENDED"
            assert sp.sender != auction.creator, "CREATOR_CANNOT_BID"

            if auction.has_bid:
                assert (
                    params.amount >= auction.current_price + auction.price_increment
                ), "BID_TOO_LOW"
            else:
                assert params.amount >= auction.reserve, "BID_TOO_LOW"

            bid_payment_ep = sp.contract(
                transfer_batch_type, self.data.wtf_token_address, entrypoint="transfer"
            ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
            sp.transfer(
                [
                    sp.record(
                        from_=sp.sender,
                        txs=[
                            sp.record(
                                to_=sp.self_address,
                                token_id=self.data.wtf_token_id,
                                amount=params.amount,
                            )
                        ],
                    )
                ],
                sp.mutez(0),
                bid_payment_ep,
            )
            if auction.has_bid:
                refund_ep = sp.contract(
                    transfer_batch_type, self.data.wtf_token_address, entrypoint="transfer"
                ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
                sp.transfer(
                    [
                        sp.record(
                            from_=sp.self_address,
                            txs=[
                                sp.record(
                                    to_=auction.highest_bidder,
                                    token_id=self.data.wtf_token_id,
                                    amount=auction.current_price,
                                )
                            ],
                        )
                    ],
                    sp.mutez(0),
                    refund_ep,
                )

            auction.current_price = params.amount
            auction.highest_bidder = sp.sender
            auction.has_bid = True

            remaining_seconds = sp.as_nat(auction.end_time - sp.now)
            if remaining_seconds <= auction.extension_time:
                auction.end_time = sp.add_seconds(
                    sp.now, sp.to_int(auction.extension_time)
                )

            self.data.auctions[params.auction_id] = auction

        @sp.entrypoint
        def settle_auction(self, auction_id):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            sp.cast(auction_id, sp.nat)

            assert auction_id in self.data.auctions, "AUCTION_NOT_FOUND"
            auction = self.data.auctions[auction_id]

            assert auction.active, "AUCTION_INACTIVE"
            assert sp.now >= auction.end_time, "AUCTION_NOT_ENDED"
            token_key = sp.record(
                token_contract=auction.token_contract, token_id=auction.token_id
            )
            del self.data.auction_tokens[token_key]
            del self.data.auctions[auction_id]

            if auction.has_bid and auction.current_price >= auction.reserve:
                winner = auction.highest_bidder
                distributed = sp.nat(0)
                for share in auction.shares:
                    share_amount = (auction.current_price * share.amount) / 10_000
                    if share_amount > 0:
                        share_transfer_ep = sp.contract(
                            transfer_batch_type,
                            self.data.wtf_token_address,
                            entrypoint="transfer",
                        ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
                        sp.transfer(
                            [
                                sp.record(
                                    from_=sp.self_address,
                                    txs=[
                                        sp.record(
                                            to_=share.recipient,
                                            token_id=self.data.wtf_token_id,
                                            amount=share_amount,
                                        )
                                    ],
                                )
                            ],
                            sp.mutez(0),
                            share_transfer_ep,
                        )
                    distributed += share_amount

                creator_amount = sp.as_nat(auction.current_price - distributed)
                if creator_amount > 0:
                    creator_transfer_ep = sp.contract(
                        transfer_batch_type,
                        self.data.wtf_token_address,
                        entrypoint="transfer",
                    ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
                    sp.transfer(
                        [
                            sp.record(
                                from_=sp.self_address,
                                txs=[
                                    sp.record(
                                        to_=auction.creator,
                                        token_id=self.data.wtf_token_id,
                                        amount=creator_amount,
                                    )
                                ],
                            )
                        ],
                        sp.mutez(0),
                        creator_transfer_ep,
                    )

                nft_transfer_ep = sp.contract(
                    transfer_batch_type, auction.token_contract, entrypoint="transfer"
                ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
                sp.transfer(
                    [
                        sp.record(
                            from_=sp.self_address,
                            txs=[
                                sp.record(
                                    to_=winner,
                                    token_id=auction.token_id,
                                    amount=1,
                                )
                            ],
                        )
                    ],
                    sp.mutez(0),
                    nft_transfer_ep,
                )
            else:
                nft_transfer_ep = sp.contract(
                    transfer_batch_type, auction.token_contract, entrypoint="transfer"
                ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
                sp.transfer(
                    [
                        sp.record(
                            from_=sp.self_address,
                            txs=[
                                sp.record(
                                    to_=auction.creator,
                                    token_id=auction.token_id,
                                    amount=1,
                                )
                            ],
                        )
                    ],
                    sp.mutez(0),
                    nft_transfer_ep,
                )

        @sp.entrypoint
        def cancel_auction(self, auction_id):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            sp.cast(auction_id, sp.nat)

            assert auction_id in self.data.auctions, "AUCTION_NOT_FOUND"
            auction = self.data.auctions[auction_id]

            assert auction.active, "AUCTION_INACTIVE"
            assert (
                sp.sender == auction.creator or sp.sender == self.data.admin
            ), "NOT_AUTHORIZED"
            assert not auction.has_bid, "AUCTION_HAS_BID"
            token_key = sp.record(
                token_contract=auction.token_contract, token_id=auction.token_id
            )
            del self.data.auction_tokens[token_key]
            del self.data.auctions[auction_id]
            transfer_ep = sp.contract(
                transfer_batch_type, auction.token_contract, entrypoint="transfer"
            ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
            sp.transfer(
                [
                    sp.record(
                        from_=sp.self_address,
                        txs=[
                            sp.record(
                                to_=auction.creator,
                                token_id=auction.token_id,
                                amount=1,
                            )
                        ],
                    )
                ],
                sp.mutez(0),
                transfer_ep,
            )

        @sp.entrypoint
        def place_offer(self, params):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            assert not self.data.paused, "PAUSED"
            sp.cast(params, place_offer_type)

            assert params.amount_wtf > 0, "OFFER_AMOUNT_INVALID"
            assert params.token_amount > 0, "TOKEN_AMOUNT_INVALID"
            assert sp.sender != params.target_owner, "SELF_OFFER_FORBIDDEN"

            token_key = sp.record(
                token_contract=params.token_contract, token_id=params.token_id
            )
            assert not self.data.auction_tokens.contains(token_key), "AUCTION_ACTIVE"

            if self.data.offers.contains(token_key):
                existing_offer = self.data.offers[token_key]
                assert params.amount_wtf > existing_offer.amount_wtf, "OFFER_NOT_HIGHER"

            offer_payment_ep = sp.contract(
                transfer_batch_type, self.data.wtf_token_address, entrypoint="transfer"
            ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
            sp.transfer(
                [
                    sp.record(
                        from_=sp.sender,
                        txs=[
                            sp.record(
                                to_=sp.self_address,
                                token_id=self.data.wtf_token_id,
                                amount=params.amount_wtf,
                            )
                        ],
                    )
                ],
                sp.mutez(0),
                offer_payment_ep,
            )

            if self.data.offers.contains(token_key):
                previous_offer = self.data.offers[token_key]
                refund_ep = sp.contract(
                    transfer_batch_type, self.data.wtf_token_address, entrypoint="transfer"
                ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
                sp.transfer(
                    [
                        sp.record(
                            from_=sp.self_address,
                            txs=[
                                sp.record(
                                    to_=previous_offer.offerer,
                                    token_id=self.data.wtf_token_id,
                                    amount=previous_offer.amount_wtf,
                                )
                            ],
                        )
                    ],
                    sp.mutez(0),
                    refund_ep,
                )

            self.data.offers[token_key] = sp.record(
                offerer=sp.sender,
                token_amount=params.token_amount,
                amount_wtf=params.amount_wtf,
                target_owner=params.target_owner,
            )

        @sp.entrypoint
        def cancel_offer(self, token):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            sp.cast(token, token_ref_type)

            assert self.data.offers.contains(token), "OFFER_NOT_FOUND"
            offer = self.data.offers[token]

            if sp.sender != offer.offerer and sp.sender != offer.target_owner:
                if self.data.listing_tokens.contains(token):
                    listing_id = self.data.listing_tokens[token]
                    listing = self.data.listings[listing_id]
                    assert sp.sender == listing.seller, "NOT_AUTHORIZED"
                else:
                    assert False, "NOT_AUTHORIZED"

            del self.data.offers[token]
            refund_ep = sp.contract(
                transfer_batch_type, self.data.wtf_token_address, entrypoint="transfer"
            ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
            sp.transfer(
                [
                    sp.record(
                        from_=sp.self_address,
                        txs=[
                            sp.record(
                                to_=offer.offerer,
                                token_id=self.data.wtf_token_id,
                                amount=offer.amount_wtf,
                            )
                        ],
                    )
                ],
                sp.mutez(0),
                refund_ep,
            )

        @sp.entrypoint
        def accept_offer(self, token):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            assert not self.data.paused, "PAUSED"
            sp.cast(token, token_ref_type)

            assert self.data.offers.contains(token), "OFFER_NOT_FOUND"
            offer = self.data.offers[token]

            if self.data.listing_tokens.contains(token):
                listing_id = self.data.listing_tokens[token]
                listing = self.data.listings[listing_id]
                assert listing.active, "LISTING_INACTIVE"
                assert sp.sender == listing.seller, "NOT_TOKEN_OWNER"
                assert listing.token_amount == offer.token_amount, "TOKEN_AMOUNT_MISMATCH"

                royalty_amount = (offer.amount_wtf * listing.royalty_bps) / 10_000
                seller_amount = sp.as_nat(offer.amount_wtf - royalty_amount)

                if listing.royalty_recipient.is_some() and royalty_amount > 0:
                    royalty_transfer_ep = sp.contract(
                        transfer_batch_type,
                        self.data.wtf_token_address,
                        entrypoint="transfer",
                    ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
                    sp.transfer(
                        [
                            sp.record(
                                from_=sp.self_address,
                                txs=[
                                    sp.record(
                                        to_=listing.royalty_recipient.unwrap_some(),
                                        token_id=self.data.wtf_token_id,
                                        amount=royalty_amount,
                                    )
                                ],
                            )
                        ],
                        sp.mutez(0),
                        royalty_transfer_ep,
                    )

                seller_transfer_ep = sp.contract(
                    transfer_batch_type, self.data.wtf_token_address, entrypoint="transfer"
                ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
                sp.transfer(
                    [
                        sp.record(
                            from_=sp.self_address,
                            txs=[
                                sp.record(
                                    to_=listing.seller,
                                    token_id=self.data.wtf_token_id,
                                    amount=seller_amount,
                                )
                            ],
                        )
                    ],
                    sp.mutez(0),
                    seller_transfer_ep,
                )

                nft_transfer_ep = sp.contract(
                    transfer_batch_type, listing.token_contract, entrypoint="transfer"
                ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
                sp.transfer(
                    [
                        sp.record(
                            from_=sp.self_address,
                            txs=[
                                sp.record(
                                    to_=offer.offerer,
                                    token_id=listing.token_id,
                                    amount=listing.token_amount,
                                )
                            ],
                        )
                    ],
                    sp.mutez(0),
                    nft_transfer_ep,
                )

                del self.data.listings[listing_id]
                del self.data.listing_tokens[token]
                del self.data.offers[token]
            else:
                assert sp.sender == offer.target_owner, "NOT_TOKEN_OWNER"

                nft_transfer_ep = sp.contract(
                    transfer_batch_type, token.token_contract, entrypoint="transfer"
                ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
                sp.transfer(
                    [
                        sp.record(
                            from_=sp.sender,
                            txs=[
                                sp.record(
                                    to_=offer.offerer,
                                    token_id=token.token_id,
                                    amount=offer.token_amount,
                                )
                            ],
                        )
                    ],
                    sp.mutez(0),
                    nft_transfer_ep,
                )

                seller_transfer_ep = sp.contract(
                    transfer_batch_type, self.data.wtf_token_address, entrypoint="transfer"
                ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
                sp.transfer(
                    [
                        sp.record(
                            from_=sp.self_address,
                            txs=[
                                sp.record(
                                    to_=sp.sender,
                                    token_id=self.data.wtf_token_id,
                                    amount=offer.amount_wtf,
                                )
                            ],
                        )
                    ],
                    sp.mutez(0),
                    seller_transfer_ep,
                )

                del self.data.offers[token]

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
    PROD_WTF_TOKEN = sp.address("KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD")
    PROD_WTF_TOKEN_ID = 0


    def _ledger_balance(token_contract, owner, token_id):
        return token_contract.data.ledger.get(
            sp.record(owner=owner, token_id=token_id), default_value=sp.nat(0)
        )

    def _verify_listing_exists(scenario, market, listing_id, exists):
        scenario.verify(market.data.listings.contains(listing_id) == exists)

    def _verify_auction_exists(scenario, market, auction_id, exists):
        scenario.verify(market.data.auctions.contains(auction_id) == exists)

    def _verify_offer_exists(scenario, market, token_contract, token_id, exists):
        token_key = sp.record(token_contract=token_contract, token_id=token_id)
        scenario.verify(market.data.offers.contains(token_key) == exists)

    def _deploy_marketplace_fixture(name):
        scenario = sp.test_scenario(name, main)
        scenario.h1(name)

        admin = sp.test_account("Admin")
        seller = sp.test_account("Seller")
        buyer = sp.test_account("Buyer")
        artist = sp.test_account("Artist")
        stranger = sp.test_account("Stranger")

        nft = main.MockFA2()
        wtf = main.MockFA2()
        scenario += nft
        scenario += wtf

        market = main.WTFMarketplace(
            admin=admin.address,
            wtf_token_address=wtf.address,
            wtf_token_id=0,
        )
        scenario += market

        return scenario, admin, seller, buyer, artist, stranger, nft, wtf, market

    @sp.add_test()
    def test_compile_marketplace():
        scenario_name = os.environ.get("SMARTPY_SCENARIO_NAME", "WTFMarketplace")
        scenario = sp.test_scenario(scenario_name, main)
        scenario += main.WTFMarketplace(
            admin=PROD_ADMIN,
            wtf_token_address=PROD_WTF_TOKEN,
            wtf_token_id=PROD_WTF_TOKEN_ID,
        )

    @sp.add_test()
    def deploy_wtf_marketplace():
        scenario = sp.test_scenario("deploy_wtf_marketplace", main)
        scenario += main.WTFMarketplace(
            admin=PROD_ADMIN,
            wtf_token_address=PROD_WTF_TOKEN,
            wtf_token_id=PROD_WTF_TOKEN_ID,
        )

    @sp.add_test()
    def test_listing_and_buy_with_royalty():
        (
            scenario,
            _admin,
            seller,
            buyer,
            artist,
            _stranger,
            nft,
            wtf,
            market,
        ) = _deploy_marketplace_fixture("listing_and_buy_with_royalty")

        nft_token_id = 42
        listing_price_wtf = 4_00000000
        royalty_bps = 750
        royalty_amount = (listing_price_wtf * royalty_bps) // 10_000
        seller_amount = listing_price_wtf - royalty_amount
        buyer_initial_wtf = 10_00000000

        scenario.h2("Mint and approvals")
        nft.mint(sp.record(owner=seller.address, token_id=nft_token_id, amount=1))
        wtf.mint(sp.record(owner=buyer.address, token_id=0, amount=buyer_initial_wtf))

        nft.set_operator(
            sp.record(
                owner=seller.address,
                operator=market.address,
                token_id=nft_token_id,
                enabled=True,
            ),
            _sender=seller,
        )
        wtf.set_operator(
            sp.record(owner=buyer.address, operator=market.address, token_id=0, enabled=True),
            _sender=buyer,
        )

        scenario.h2("Create listing")
        market.create_listing(
            sp.record(
                token_contract=nft.address,
                token_id=nft_token_id,
                token_amount=1,
                price_wtf=listing_price_wtf,
                royalty_recipient=sp.some(artist.address),
                royalty_bps=royalty_bps,
            ),
            _sender=seller,
        )

        scenario.verify(market.data.next_listing_id == 1)
        _verify_listing_exists(scenario, market, 0, True)
        scenario.verify(_ledger_balance(nft, seller.address, nft_token_id) == 0)
        scenario.verify(_ledger_balance(nft, market.address, nft_token_id) == 1)

        scenario.h2("Buy and settle")
        market.buy(0, _sender=buyer)

        _verify_listing_exists(scenario, market, 0, False)
        scenario.verify(_ledger_balance(nft, buyer.address, nft_token_id) == 1)
        scenario.verify(_ledger_balance(nft, market.address, nft_token_id) == 0)
        scenario.verify(_ledger_balance(wtf, artist.address, 0) == royalty_amount)
        scenario.verify(_ledger_balance(wtf, seller.address, 0) == seller_amount)
        scenario.verify(
            _ledger_balance(wtf, buyer.address, 0) == buyer_initial_wtf - listing_price_wtf
        )

    @sp.add_test()
    def test_create_and_buy_guards():
        (
            scenario,
            _admin,
            seller,
            buyer,
            artist,
            _stranger,
            nft,
            wtf,
            market,
        ) = _deploy_marketplace_fixture("create_and_buy_guards")

        nft_token_id = 7
        listing_price_wtf = 2_50000000

        scenario.h2("Mint balances")
        nft.mint(sp.record(owner=seller.address, token_id=nft_token_id, amount=1))
        wtf.mint(sp.record(owner=buyer.address, token_id=0, amount=listing_price_wtf * 2))

        scenario.h2("Listing requires NFT operator")
        market.create_listing(
            sp.record(
                token_contract=nft.address,
                token_id=nft_token_id,
                token_amount=1,
                price_wtf=listing_price_wtf,
                royalty_recipient=sp.none,
                royalty_bps=0,
            ),
            _sender=seller,
            _valid=False,
            _exception="FA2_NOT_OPERATOR",
        )
        scenario.verify(market.data.next_listing_id == 0)

        nft.set_operator(
            sp.record(
                owner=seller.address,
                operator=market.address,
                token_id=nft_token_id,
                enabled=True,
            ),
            _sender=seller,
        )

        scenario.h2("Listing validations")
        market.create_listing(
            sp.record(
                token_contract=nft.address,
                token_id=nft_token_id,
                token_amount=1,
                price_wtf=listing_price_wtf,
                royalty_recipient=sp.none,
                royalty_bps=100,
            ),
            _sender=seller,
            _valid=False,
            _exception="ROYALTY_RECIPIENT_REQUIRED",
        )
        scenario.verify(market.data.next_listing_id == 0)

        market.create_listing(
            sp.record(
                token_contract=nft.address,
                token_id=nft_token_id,
                token_amount=1,
                price_wtf=listing_price_wtf,
                royalty_recipient=sp.some(artist.address),
                royalty_bps=100,
            ),
            _sender=seller,
            _amount=sp.mutez(1),
            _valid=False,
            _exception="NO_XTZ_ALLOWED",
        )
        scenario.verify(market.data.next_listing_id == 0)

        scenario.h2("Create valid listing")
        market.create_listing(
            sp.record(
                token_contract=nft.address,
                token_id=nft_token_id,
                token_amount=1,
                price_wtf=listing_price_wtf,
                royalty_recipient=sp.some(artist.address),
                royalty_bps=100,
            ),
            _sender=seller,
        )

        scenario.h2("Buy validations")
        market.buy(0, _sender=seller, _valid=False, _exception="SELF_BUY_FORBIDDEN")
        market.buy(0, _sender=buyer, _valid=False, _exception="FA2_NOT_OPERATOR")
        _verify_listing_exists(scenario, market, 0, True)

        wtf.set_operator(
            sp.record(owner=buyer.address, operator=market.address, token_id=0, enabled=True),
            _sender=buyer,
        )
        market.buy(
            0,
            _sender=buyer,
            _amount=sp.mutez(1),
            _valid=False,
            _exception="NO_XTZ_ALLOWED",
        )
        _verify_listing_exists(scenario, market, 0, True)

        scenario.h2("Buy succeeds after approvals")
        market.buy(0, _sender=buyer)
        _verify_listing_exists(scenario, market, 0, False)

    @sp.add_test()
    def test_cancel_listing_permissions():
        (
            scenario,
            admin,
            seller,
            _buyer,
            _artist,
            stranger,
            nft,
            _wtf,
            market,
        ) = _deploy_marketplace_fixture("cancel_listing_permissions")

        first_token_id = 99
        second_token_id = 100
        listing_price_wtf = 3_00000000

        scenario.h2("Mint and approve")
        nft.mint(sp.record(owner=seller.address, token_id=first_token_id, amount=1))
        nft.mint(sp.record(owner=seller.address, token_id=second_token_id, amount=1))

        nft.set_operator(
            sp.record(
                owner=seller.address,
                operator=market.address,
                token_id=first_token_id,
                enabled=True,
            ),
            _sender=seller,
        )
        nft.set_operator(
            sp.record(
                owner=seller.address,
                operator=market.address,
                token_id=second_token_id,
                enabled=True,
            ),
            _sender=seller,
        )

        scenario.h2("Create two listings")
        market.create_listing(
            sp.record(
                token_contract=nft.address,
                token_id=first_token_id,
                token_amount=1,
                price_wtf=listing_price_wtf,
                royalty_recipient=sp.none,
                royalty_bps=0,
            ),
            _sender=seller,
        )
        market.create_listing(
            sp.record(
                token_contract=nft.address,
                token_id=second_token_id,
                token_amount=1,
                price_wtf=listing_price_wtf,
                royalty_recipient=sp.none,
                royalty_bps=0,
            ),
            _sender=seller,
        )

        scenario.h2("Unauthorized cancel fails")
        market.cancel_listing(0, _sender=stranger, _valid=False, _exception="NOT_AUTHORIZED")
        _verify_listing_exists(scenario, market, 0, True)

        scenario.h2("Admin and seller cancel succeed")
        market.cancel_listing(0, _sender=admin)
        _verify_listing_exists(scenario, market, 0, False)
        scenario.verify(_ledger_balance(nft, seller.address, first_token_id) == 1)
        scenario.verify(_ledger_balance(nft, market.address, first_token_id) == 0)

        market.cancel_listing(1, _sender=seller)
        _verify_listing_exists(scenario, market, 1, False)
        scenario.verify(_ledger_balance(nft, seller.address, second_token_id) == 1)
        scenario.verify(_ledger_balance(nft, market.address, second_token_id) == 0)

    @sp.add_test()
    def test_auction_lifecycle_with_outbid_and_shares():
        (
            scenario,
            admin,
            seller,
            buyer,
            artist,
            stranger,
            nft,
            wtf,
            market,
        ) = _deploy_marketplace_fixture("auction_lifecycle_with_outbid_and_shares")

        nft_token_id = 501
        reserve = 100
        first_bid = 100
        second_bid = 120
        winning_bid = 150

        artist_share_amount = (winning_bid * 500) // 10_000
        admin_share_amount = (winning_bid * 250) // 10_000
        creator_amount = winning_bid - artist_share_amount - admin_share_amount

        scenario.h2("Mint and approvals")
        nft.mint(sp.record(owner=seller.address, token_id=nft_token_id, amount=1))
        wtf.mint(sp.record(owner=buyer.address, token_id=0, amount=1000))
        wtf.mint(sp.record(owner=stranger.address, token_id=0, amount=1000))

        nft.set_operator(
            sp.record(
                owner=seller.address,
                operator=market.address,
                token_id=nft_token_id,
                enabled=True,
            ),
            _sender=seller,
        )
        wtf.set_operator(
            sp.record(owner=buyer.address, operator=market.address, token_id=0, enabled=True),
            _sender=buyer,
        )
        wtf.set_operator(
            sp.record(
                owner=stranger.address, operator=market.address, token_id=0, enabled=True
            ),
            _sender=stranger,
        )

        scenario.h2("Create auction")
        market.create_auction(
            sp.record(
                token_contract=nft.address,
                token_id=nft_token_id,
                reserve=reserve,
                start_time=sp.timestamp(10),
                end_time=sp.timestamp(100),
                extension_time=20,
                price_increment=10,
                shares=[
                    sp.record(amount=500, recipient=artist.address),
                    sp.record(amount=250, recipient=admin.address),
                ],
            ),
            _sender=seller,
            _now=sp.timestamp(5),
        )

        scenario.verify(market.data.next_auction_id == 1)
        _verify_auction_exists(scenario, market, 0, True)
        scenario.verify(_ledger_balance(nft, seller.address, nft_token_id) == 0)
        scenario.verify(_ledger_balance(nft, market.address, nft_token_id) == 1)

        scenario.h2("Bid flow and anti-sniping extension")
        market.bid(
            sp.record(auction_id=0, amount=first_bid),
            _sender=buyer,
            _valid=False,
            _exception="AUCTION_NOT_STARTED",
            _now=sp.timestamp(9),
        )

        market.bid(sp.record(auction_id=0, amount=first_bid), _sender=buyer, _now=sp.timestamp(20))
        scenario.verify(_ledger_balance(wtf, buyer.address, 0) == 900)
        scenario.verify(_ledger_balance(wtf, market.address, 0) == first_bid)

        market.bid(
            sp.record(auction_id=0, amount=105),
            _sender=stranger,
            _valid=False,
            _exception="BID_TOO_LOW",
            _now=sp.timestamp(20),
        )
        market.bid(sp.record(auction_id=0, amount=second_bid), _sender=stranger, _now=sp.timestamp(20))
        scenario.verify(_ledger_balance(wtf, buyer.address, 0) == 1000)
        scenario.verify(_ledger_balance(wtf, stranger.address, 0) == 880)
        scenario.verify(_ledger_balance(wtf, market.address, 0) == second_bid)

        market.bid(sp.record(auction_id=0, amount=winning_bid), _sender=buyer, _now=sp.timestamp(90))
        scenario.verify(market.data.auctions[0].end_time == sp.timestamp(110))
        scenario.verify(_ledger_balance(wtf, buyer.address, 0) == 850)
        scenario.verify(_ledger_balance(wtf, stranger.address, 0) == 1000)
        scenario.verify(_ledger_balance(wtf, market.address, 0) == winning_bid)

        market.settle_auction(
            0, _sender=admin, _valid=False, _exception="AUCTION_NOT_ENDED", _now=sp.timestamp(100)
        )

        scenario.h2("Settle and distribute proceeds")
        market.settle_auction(0, _sender=stranger, _now=sp.timestamp(111))

        _verify_auction_exists(scenario, market, 0, False)
        scenario.verify(_ledger_balance(nft, buyer.address, nft_token_id) == 1)
        scenario.verify(_ledger_balance(nft, market.address, nft_token_id) == 0)

        scenario.verify(_ledger_balance(wtf, seller.address, 0) == creator_amount)
        scenario.verify(_ledger_balance(wtf, artist.address, 0) == artist_share_amount)
        scenario.verify(_ledger_balance(wtf, admin.address, 0) == admin_share_amount)
        scenario.verify(_ledger_balance(wtf, buyer.address, 0) == 850)
        scenario.verify(_ledger_balance(wtf, stranger.address, 0) == 1000)
        scenario.verify(_ledger_balance(wtf, market.address, 0) == 0)

    @sp.add_test()
    def test_auction_guards_pause_and_cancel():
        (
            scenario,
            admin,
            seller,
            buyer,
            _artist,
            stranger,
            nft,
            wtf,
            market,
        ) = _deploy_marketplace_fixture("auction_guards_pause_and_cancel")

        first_token_id = 601
        second_token_id = 602

        scenario.h2("Mint and approvals")
        nft.mint(sp.record(owner=seller.address, token_id=first_token_id, amount=1))
        nft.mint(sp.record(owner=seller.address, token_id=second_token_id, amount=1))
        wtf.mint(sp.record(owner=buyer.address, token_id=0, amount=500))

        nft.set_operator(
            sp.record(
                owner=seller.address,
                operator=market.address,
                token_id=first_token_id,
                enabled=True,
            ),
            _sender=seller,
        )
        nft.set_operator(
            sp.record(
                owner=seller.address,
                operator=market.address,
                token_id=second_token_id,
                enabled=True,
            ),
            _sender=seller,
        )
        wtf.set_operator(
            sp.record(owner=buyer.address, operator=market.address, token_id=0, enabled=True),
            _sender=buyer,
        )

        scenario.h2("Auction validation guards")
        market.create_auction(
            sp.record(
                token_contract=nft.address,
                token_id=first_token_id,
                reserve=100,
                start_time=sp.timestamp(10),
                end_time=sp.timestamp(10),
                extension_time=10,
                price_increment=5,
                shares=[],
            ),
            _sender=seller,
            _valid=False,
            _exception="TIME_WINDOW_INVALID",
            _now=sp.timestamp(1),
        )
        market.create_auction(
            sp.record(
                token_contract=nft.address,
                token_id=first_token_id,
                reserve=100,
                start_time=sp.timestamp(10),
                end_time=sp.timestamp(60),
                extension_time=10,
                price_increment=5,
                shares=[
                    sp.record(amount=7000, recipient=seller.address),
                    sp.record(amount=4000, recipient=buyer.address),
                ],
            ),
            _sender=seller,
            _valid=False,
            _exception="SHARES_TOO_HIGH",
            _now=sp.timestamp(1),
        )

        scenario.h2("Create auction and enforce pause")
        market.create_auction(
            sp.record(
                token_contract=nft.address,
                token_id=first_token_id,
                reserve=100,
                start_time=sp.timestamp(5),
                end_time=sp.timestamp(50),
                extension_time=10,
                price_increment=5,
                shares=[],
            ),
            _sender=seller,
            _now=sp.timestamp(1),
        )
        _verify_auction_exists(scenario, market, 0, True)

        market.toggle_pause(_sender=seller, _valid=False, _exception="NOT_ADMIN")
        market.toggle_pause(_sender=admin)
        scenario.verify(market.data.paused == True)

        market.bid(
            sp.record(auction_id=0, amount=100),
            _sender=buyer,
            _valid=False,
            _exception="PAUSED",
        )
        market.create_listing(
            sp.record(
                token_contract=nft.address,
                token_id=second_token_id,
                token_amount=1,
                price_wtf=100,
                royalty_recipient=sp.none,
                royalty_bps=0,
            ),
            _sender=seller,
            _valid=False,
            _exception="PAUSED",
        )
        market.create_auction(
            sp.record(
                token_contract=nft.address,
                token_id=second_token_id,
                reserve=50,
                start_time=sp.timestamp(5),
                end_time=sp.timestamp(20),
                extension_time=5,
                price_increment=1,
                shares=[],
            ),
            _sender=seller,
            _valid=False,
            _exception="PAUSED",
        )

        market.toggle_pause(_sender=admin)
        scenario.verify(market.data.paused == False)

        scenario.h2("Bids block cancel and no-bid auction can be cancelled")
        market.bid(sp.record(auction_id=0, amount=100), _sender=buyer, _now=sp.timestamp(6))
        market.cancel_auction(
            0, _sender=seller, _valid=False, _exception="AUCTION_HAS_BID"
        )

        market.create_auction(
            sp.record(
                token_contract=nft.address,
                token_id=second_token_id,
                reserve=50,
                start_time=sp.timestamp(7),
                end_time=sp.timestamp(30),
                extension_time=5,
                price_increment=1,
                shares=[],
            ),
            _sender=seller,
            _now=sp.timestamp(6),
        )
        market.cancel_auction(1, _sender=stranger, _valid=False, _exception="NOT_AUTHORIZED")
        market.cancel_auction(1, _sender=admin)
        _verify_auction_exists(scenario, market, 1, False)
        scenario.verify(_ledger_balance(nft, seller.address, second_token_id) == 1)

    @sp.add_test()
    def test_offer_lifecycle_unlisted_and_listed_tokens():
        (
            scenario,
            _admin,
            seller,
            buyer,
            artist,
            stranger,
            nft,
            wtf,
            market,
        ) = _deploy_marketplace_fixture("offer_lifecycle_unlisted_and_listed_tokens")

        unlisted_token_id = 700
        listed_token_id = 701

        scenario.h2("Mint and approvals")
        nft.mint(sp.record(owner=seller.address, token_id=unlisted_token_id, amount=1))
        nft.mint(sp.record(owner=seller.address, token_id=listed_token_id, amount=1))
        wtf.mint(sp.record(owner=buyer.address, token_id=0, amount=1000))
        wtf.mint(sp.record(owner=stranger.address, token_id=0, amount=1000))

        nft.set_operator(
            sp.record(
                owner=seller.address,
                operator=market.address,
                token_id=unlisted_token_id,
                enabled=True,
            ),
            _sender=seller,
        )
        nft.set_operator(
            sp.record(
                owner=seller.address,
                operator=market.address,
                token_id=listed_token_id,
                enabled=True,
            ),
            _sender=seller,
        )
        wtf.set_operator(
            sp.record(owner=buyer.address, operator=market.address, token_id=0, enabled=True),
            _sender=buyer,
        )
        wtf.set_operator(
            sp.record(owner=stranger.address, operator=market.address, token_id=0, enabled=True),
            _sender=stranger,
        )

        scenario.h2("Unlisted offer: higher offer replaces and refunds")
        market.place_offer(
            sp.record(
                token_contract=nft.address,
                token_id=unlisted_token_id,
                token_amount=1,
                amount_wtf=100,
                target_owner=seller.address,
            ),
            _sender=buyer,
        )
        _verify_offer_exists(scenario, market, nft.address, unlisted_token_id, True)
        scenario.verify(_ledger_balance(wtf, buyer.address, 0) == 900)
        scenario.verify(_ledger_balance(wtf, market.address, 0) == 100)

        market.place_offer(
            sp.record(
                token_contract=nft.address,
                token_id=unlisted_token_id,
                token_amount=1,
                amount_wtf=100,
                target_owner=seller.address,
            ),
            _sender=stranger,
            _valid=False,
            _exception="OFFER_NOT_HIGHER",
        )
        market.cancel_offer(
            sp.record(token_contract=nft.address, token_id=unlisted_token_id),
            _sender=artist,
            _valid=False,
            _exception="NOT_AUTHORIZED",
        )

        market.place_offer(
            sp.record(
                token_contract=nft.address,
                token_id=unlisted_token_id,
                token_amount=1,
                amount_wtf=150,
                target_owner=seller.address,
            ),
            _sender=stranger,
        )
        scenario.verify(_ledger_balance(wtf, buyer.address, 0) == 1000)
        scenario.verify(_ledger_balance(wtf, stranger.address, 0) == 850)
        scenario.verify(_ledger_balance(wtf, market.address, 0) == 150)

        scenario.h2("Owner can reject/cancel offer and refund offerer")
        market.cancel_offer(
            sp.record(token_contract=nft.address, token_id=unlisted_token_id), _sender=seller
        )
        _verify_offer_exists(scenario, market, nft.address, unlisted_token_id, False)
        scenario.verify(_ledger_balance(wtf, stranger.address, 0) == 1000)
        scenario.verify(_ledger_balance(wtf, market.address, 0) == 0)

        scenario.h2("Offerer can cancel own offer")
        market.place_offer(
            sp.record(
                token_contract=nft.address,
                token_id=unlisted_token_id,
                token_amount=1,
                amount_wtf=120,
                target_owner=seller.address,
            ),
            _sender=buyer,
        )
        market.cancel_offer(
            sp.record(token_contract=nft.address, token_id=unlisted_token_id), _sender=buyer
        )
        _verify_offer_exists(scenario, market, nft.address, unlisted_token_id, False)
        scenario.verify(_ledger_balance(wtf, buyer.address, 0) == 1000)

        scenario.h2("Listed token offer can be accepted by listing owner")
        market.create_listing(
            sp.record(
                token_contract=nft.address,
                token_id=listed_token_id,
                token_amount=1,
                price_wtf=300,
                royalty_recipient=sp.some(artist.address),
                royalty_bps=500,
            ),
            _sender=seller,
        )
        market.place_offer(
            sp.record(
                token_contract=nft.address,
                token_id=listed_token_id,
                token_amount=1,
                amount_wtf=220,
                target_owner=seller.address,
            ),
            _sender=buyer,
        )
        market.accept_offer(
            sp.record(token_contract=nft.address, token_id=listed_token_id), _sender=seller
        )
        _verify_offer_exists(scenario, market, nft.address, listed_token_id, False)
        scenario.verify(_ledger_balance(nft, buyer.address, listed_token_id) == 1)
        scenario.verify(_ledger_balance(nft, market.address, listed_token_id) == 0)
        scenario.verify(_ledger_balance(wtf, artist.address, 0) == 11)
        scenario.verify(_ledger_balance(wtf, seller.address, 0) == 209)

        scenario.h2("Unlisted offer can be accepted by token owner")
        market.place_offer(
            sp.record(
                token_contract=nft.address,
                token_id=unlisted_token_id,
                token_amount=1,
                amount_wtf=180,
                target_owner=seller.address,
            ),
            _sender=buyer,
        )
        market.accept_offer(
            sp.record(token_contract=nft.address, token_id=unlisted_token_id), _sender=seller
        )
        _verify_offer_exists(scenario, market, nft.address, unlisted_token_id, False)
        scenario.verify(_ledger_balance(nft, buyer.address, unlisted_token_id) == 1)
        scenario.verify(_ledger_balance(wtf, seller.address, 0) == 389)
        scenario.verify(_ledger_balance(wtf, buyer.address, 0) == 600)
        scenario.verify(_ledger_balance(wtf, market.address, 0) == 0)

    @sp.add_test()
    def test_offer_blocked_for_auction_tokens():
        (
            scenario,
            _admin,
            seller,
            buyer,
            _artist,
            _stranger,
            nft,
            wtf,
            market,
        ) = _deploy_marketplace_fixture("offer_blocked_for_auction_tokens")

        token_id = 800

        scenario.h2("Mint and approvals")
        nft.mint(sp.record(owner=seller.address, token_id=token_id, amount=1))
        wtf.mint(sp.record(owner=buyer.address, token_id=0, amount=500))

        nft.set_operator(
            sp.record(owner=seller.address, operator=market.address, token_id=token_id, enabled=True),
            _sender=seller,
        )
        wtf.set_operator(
            sp.record(owner=buyer.address, operator=market.address, token_id=0, enabled=True),
            _sender=buyer,
        )

        scenario.h2("Offer must be cleared before auction creation")
        market.place_offer(
            sp.record(
                token_contract=nft.address,
                token_id=token_id,
                token_amount=1,
                amount_wtf=150,
                target_owner=seller.address,
            ),
            _sender=buyer,
        )
        market.create_auction(
            sp.record(
                token_contract=nft.address,
                token_id=token_id,
                reserve=100,
                start_time=sp.timestamp(10),
                end_time=sp.timestamp(100),
                extension_time=20,
                price_increment=5,
                shares=[],
            ),
            _sender=seller,
            _now=sp.timestamp(1),
            _valid=False,
            _exception="OFFER_EXISTS",
        )

        market.cancel_offer(sp.record(token_contract=nft.address, token_id=token_id), _sender=seller)
        scenario.verify(_ledger_balance(wtf, buyer.address, 0) == 500)

        market.create_auction(
            sp.record(
                token_contract=nft.address,
                token_id=token_id,
                reserve=100,
                start_time=sp.timestamp(10),
                end_time=sp.timestamp(100),
                extension_time=20,
                price_increment=5,
                shares=[],
            ),
            _sender=seller,
            _now=sp.timestamp(1),
        )

        scenario.h2("No offers allowed while auction is active")
        market.place_offer(
            sp.record(
                token_contract=nft.address,
                token_id=token_id,
                token_amount=1,
                amount_wtf=200,
                target_owner=seller.address,
            ),
            _sender=buyer,
            _valid=False,
            _exception="AUCTION_ACTIVE",
        )
