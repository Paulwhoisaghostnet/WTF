"""
WTF Marketplace V1.2 (SmartPy, FA2-based settlement).

V1.2 changes vs legacy marketplace:
  - Owner-scoped active indexes for listings/auctions/offers to avoid global token-id collisions.
  - Auction creation now blocks when same owner-token already has an active listing.
  - Listing completion/cancel paths proactively clear/refund stale offers for the same owner-token.
  - Optional in-contract royalty policy for unlisted-offer acceptance.
  - Share fanout hard-capped and auction settlement payouts batched into one WTF transfer call.

Security fixes applied from audit:
  - H-1: Two-step admin transfer (propose/accept).
  - H-2: default entrypoint rejects XTZ.
  - M-1: Defensive bidder refund in settle_auction else branch.
  - M-3: extension_time capped at 86400 seconds (1 day).
  - M-4: TZIP-16 metadata + on-chain views.
  - M-5: Removed dead `active` field from listing_type / auction_type.
  - L-2: Event emission on state changes.
  - L-3: Share amount > 0 validation.
  - L-8: Removed unused wtf_transfer_call_type.
"""

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
    ).layout(
        (
            "seller",
            (
                "token_contract",
                (
                    "token_id",
                    ("token_amount", ("price_wtf", ("royalty_recipient", "royalty_bps"))),
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

    transfer_call_type: type = sp.record(
        token_contract=sp.address,
        from_=sp.address,
        txs=sp.list[transfer_tx_type],
    ).layout(("token_contract", ("from_", "txs")))

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

    owner_token_ref_type: type = sp.record(
        owner=sp.address,
        token_contract=sp.address,
        token_id=sp.nat,
    ).layout(("owner", ("token_contract", "token_id")))

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
                                            ("highest_bidder", ("has_bid", "shares")),
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

    royalty_policy_type: type = sp.record(
        royalty_recipient=sp.option[sp.address],
        royalty_bps=sp.nat,
    ).layout(("royalty_recipient", "royalty_bps"))

    set_token_royalty_type: type = sp.record(
        token_contract=sp.address,
        token_id=sp.nat,
        royalty_recipient=sp.option[sp.address],
        royalty_bps=sp.nat,
    ).layout(("token_contract", ("token_id", ("royalty_recipient", "royalty_bps"))))

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

    class WTFMarketplaceV12(sp.Contract):
        def __init__(self, admin, wtf_token_address, wtf_token_id, metadata):
            sp.cast(admin, sp.address)
            sp.cast(wtf_token_address, sp.address)
            sp.cast(wtf_token_id, sp.nat)

            self.data.admin = admin
            self.data.proposed_admin = sp.cast(None, sp.option[sp.address])
            self.data.wtf_token_address = wtf_token_address
            self.data.wtf_token_id = wtf_token_id

            self.data.next_listing_id = sp.nat(0)
            self.data.listings = sp.cast(sp.big_map(), sp.big_map[sp.nat, listing_type])
            self.data.listing_tokens = sp.cast(
                sp.big_map(), sp.big_map[owner_token_ref_type, sp.nat]
            )

            self.data.next_auction_id = sp.nat(0)
            self.data.auctions = sp.cast(sp.big_map(), sp.big_map[sp.nat, auction_type])
            self.data.auction_tokens = sp.cast(
                sp.big_map(), sp.big_map[owner_token_ref_type, sp.nat]
            )

            self.data.offers = sp.cast(
                sp.big_map(), sp.big_map[owner_token_ref_type, offer_type]
            )
            self.data.token_royalties = sp.cast(
                sp.big_map(), sp.big_map[token_ref_type, royalty_policy_type]
            )

            self.data.paused = False
            self.data.metadata = sp.cast(metadata, sp.big_map[sp.string, sp.bytes])

        @sp.private(with_operations=True)
        def _transfer_fa2(self, params):
            sp.cast(params, transfer_call_type)
            transfer_ep = sp.contract(
                transfer_batch_type, params.token_contract, entrypoint="transfer"
            ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
            sp.transfer(
                [sp.record(from_=params.from_, txs=params.txs)], sp.mutez(0), transfer_ep
            )
            return ()

        @sp.private(with_storage="read-write", with_operations=True)
        def _refund_offer_if_exists(self, token_key):
            if token_key in self.data.offers:
                offer = self.data.offers[token_key]
                del self.data.offers[token_key]
                refund_txs = sp.cast([], sp.list[transfer_tx_type])
                refund_txs.push(
                    sp.record(
                        to_=offer.offerer,
                        token_id=self.data.wtf_token_id,
                        amount=offer.amount_wtf,
                    )
                )
                transfer_ep = sp.contract(
                    transfer_batch_type,
                    self.data.wtf_token_address,
                    entrypoint="transfer",
                ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
                sp.transfer(
                    [sp.record(from_=sp.self_address, txs=refund_txs)],
                    sp.mutez(0),
                    transfer_ep,
                )
            return ()

        # [H-2] Reject accidental XTZ
        @sp.entrypoint
        def default(self):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"

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
                owner=sp.sender,
                token_contract=params.token_contract,
                token_id=params.token_id,
            )
            assert not (token_key in self.data.listing_tokens), "TOKEN_ALREADY_LISTED"
            assert not (token_key in self.data.auction_tokens), "AUCTION_ACTIVE"

            _ = self._transfer_fa2(
                sp.record(
                    token_contract=params.token_contract,
                    from_=sp.sender,
                    txs=[
                        sp.record(
                            to_=sp.self_address,
                            token_id=params.token_id,
                            amount=params.token_amount,
                        )
                    ],
                )
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
            )
            self.data.listing_tokens[token_key] = listing_id
            self.data.next_listing_id += 1
            sp.emit(sp.record(listing_id=listing_id, seller=sp.sender), tag="listing_created")

        @sp.entrypoint
        def buy(self, listing_id):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            assert not self.data.paused, "PAUSED"
            sp.cast(listing_id, sp.nat)

            assert listing_id in self.data.listings, "LISTING_NOT_FOUND"
            listing = self.data.listings[listing_id]
            assert sp.sender != listing.seller, "SELF_BUY_FORBIDDEN"

            token_key = sp.record(
                owner=listing.seller,
                token_contract=listing.token_contract,
                token_id=listing.token_id,
            )

            royalty_amount = (listing.price_wtf * listing.royalty_bps) / 10_000
            seller_amount = sp.as_nat(listing.price_wtf - royalty_amount)

            payment_txs = sp.cast([], sp.list[transfer_tx_type])
            payment_txs.push(
                sp.record(
                    to_=listing.seller,
                    token_id=self.data.wtf_token_id,
                    amount=seller_amount,
                )
            )
            if listing.royalty_recipient.is_some() and royalty_amount > 0:
                payment_txs.push(
                    sp.record(
                        to_=listing.royalty_recipient.unwrap_some(),
                        token_id=self.data.wtf_token_id,
                        amount=royalty_amount,
                    )
                )

            _ = self._transfer_fa2(sp.record(token_contract=self.data.wtf_token_address, from_=sp.sender, txs=payment_txs))
            _ = self._refund_offer_if_exists(token_key)

            _ = self._transfer_fa2(
                sp.record(
                    token_contract=listing.token_contract,
                    from_=sp.self_address,
                    txs=[
                        sp.record(
                            to_=sp.sender,
                            token_id=listing.token_id,
                            amount=listing.token_amount,
                        )
                    ],
                )
            )

            del self.data.listing_tokens[token_key]
            del self.data.listings[listing_id]
            sp.emit(sp.record(listing_id=listing_id, buyer=sp.sender), tag="listing_bought")

        @sp.entrypoint
        def cancel_listing(self, listing_id):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            sp.cast(listing_id, sp.nat)

            assert listing_id in self.data.listings, "LISTING_NOT_FOUND"
            listing = self.data.listings[listing_id]
            assert (
                sp.sender == listing.seller or sp.sender == self.data.admin
            ), "NOT_AUTHORIZED"

            token_key = sp.record(
                owner=listing.seller,
                token_contract=listing.token_contract,
                token_id=listing.token_id,
            )

            del self.data.listing_tokens[token_key]
            del self.data.listings[listing_id]

            _ = self._refund_offer_if_exists(token_key)
            _ = self._transfer_fa2(
                sp.record(
                    token_contract=listing.token_contract,
                    from_=sp.self_address,
                    txs=[
                        sp.record(
                            to_=listing.seller,
                            token_id=listing.token_id,
                            amount=listing.token_amount,
                        )
                    ],
                )
            )
            sp.emit(sp.record(listing_id=listing_id, canceller=sp.sender), tag="listing_cancelled")

        @sp.entrypoint
        def create_auction(self, params):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            assert not self.data.paused, "PAUSED"
            sp.cast(params, create_auction_type)

            assert params.reserve > 0, "RESERVE_INVALID"
            assert params.end_time > params.start_time, "TIME_WINDOW_INVALID"
            assert params.end_time > sp.now, "END_TIME_IN_PAST"
            assert params.price_increment > 0, "PRICE_INCREMENT_INVALID"
            # [M-3] Cap extension to prevent indefinite auction locking
            assert params.extension_time <= 86_400, "EXTENSION_TIME_TOO_LONG"
            assert sp.len(params.shares) <= 25, "TOO_MANY_SHARES"

            shares_total = sp.nat(0)
            for share in params.shares:
                # [L-3] Reject zero-amount shares
                assert share.amount > 0, "SHARE_AMOUNT_ZERO"
                shares_total += share.amount
            assert shares_total <= 10_000, "SHARES_TOO_HIGH"

            token_key = sp.record(
                owner=sp.sender,
                token_contract=params.token_contract,
                token_id=params.token_id,
            )
            assert not (token_key in self.data.auction_tokens), "AUCTION_ACTIVE"
            assert not (token_key in self.data.listing_tokens), "LISTING_ACTIVE"
            assert not (token_key in self.data.offers), "OFFER_EXISTS"

            _ = self._transfer_fa2(
                sp.record(
                    token_contract=params.token_contract,
                    from_=sp.sender,
                    txs=[
                        sp.record(
                            to_=sp.self_address,
                            token_id=params.token_id,
                            amount=1,
                        )
                    ],
                )
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
            )
            self.data.auction_tokens[token_key] = auction_id
            self.data.next_auction_id += 1
            sp.emit(sp.record(auction_id=auction_id, creator=sp.sender), tag="auction_created")

        @sp.entrypoint
        def bid(self, params):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            assert not self.data.paused, "PAUSED"
            sp.cast(params, bid_type)

            assert params.auction_id in self.data.auctions, "AUCTION_NOT_FOUND"
            auction = self.data.auctions[params.auction_id]

            assert sp.now >= auction.start_time, "AUCTION_NOT_STARTED"
            assert sp.now < auction.end_time, "AUCTION_ENDED"
            assert sp.sender != auction.creator, "CREATOR_CANNOT_BID"

            if auction.has_bid:
                assert (
                    params.amount >= auction.current_price + auction.price_increment
                ), "BID_TOO_LOW"
            else:
                assert params.amount >= auction.reserve, "BID_TOO_LOW"

            _ = self._transfer_fa2(sp.record(token_contract=self.data.wtf_token_address,
                    from_=sp.sender,
                    txs=[
                        sp.record(
                            to_=sp.self_address,
                            token_id=self.data.wtf_token_id,
                            amount=params.amount,
                        )
                    ],
                )
            )

            if auction.has_bid:
                _ = self._transfer_fa2(sp.record(token_contract=self.data.wtf_token_address,
                        from_=sp.self_address,
                        txs=[
                            sp.record(
                                to_=auction.highest_bidder,
                                token_id=self.data.wtf_token_id,
                                amount=auction.current_price,
                            )
                        ],
                    )
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
            sp.emit(sp.record(auction_id=params.auction_id, bidder=sp.sender, amount=params.amount), tag="bid_placed")

        @sp.entrypoint
        def settle_auction(self, auction_id):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            sp.cast(auction_id, sp.nat)

            assert auction_id in self.data.auctions, "AUCTION_NOT_FOUND"
            auction = self.data.auctions[auction_id]

            assert sp.now >= auction.end_time, "AUCTION_NOT_ENDED"

            token_key = sp.record(
                owner=auction.creator,
                token_contract=auction.token_contract,
                token_id=auction.token_id,
            )
            del self.data.auction_tokens[token_key]
            del self.data.auctions[auction_id]

            if auction.has_bid and auction.current_price >= auction.reserve:
                payout_txs = sp.cast([], sp.list[transfer_tx_type])
                distributed = sp.nat(0)
                for share in auction.shares:
                    share_amount = (auction.current_price * share.amount) / 10_000
                    if share_amount > 0:
                        payout_txs.push(
                            sp.record(
                                to_=share.recipient,
                                token_id=self.data.wtf_token_id,
                                amount=share_amount,
                            )
                        )
                    distributed += share_amount

                creator_amount = sp.as_nat(auction.current_price - distributed)
                if creator_amount > 0:
                    payout_txs.push(
                        sp.record(
                            to_=auction.creator,
                            token_id=self.data.wtf_token_id,
                            amount=creator_amount,
                        )
                    )

                if sp.len(payout_txs) > 0:
                    _ = self._transfer_fa2(sp.record(token_contract=self.data.wtf_token_address, from_=sp.self_address, txs=payout_txs))

                _ = self._transfer_fa2(
                    sp.record(
                        token_contract=auction.token_contract,
                        from_=sp.self_address,
                        txs=[
                            sp.record(
                                to_=auction.highest_bidder,
                                token_id=auction.token_id,
                                amount=1,
                            )
                        ],
                    )
                )
            else:
                # [M-1] Defensive: refund bidder if settlement condition not met
                if auction.has_bid:
                    _ = self._transfer_fa2(sp.record(
                        token_contract=self.data.wtf_token_address,
                        from_=sp.self_address,
                        txs=[
                            sp.record(
                                to_=auction.highest_bidder,
                                token_id=self.data.wtf_token_id,
                                amount=auction.current_price,
                            )
                        ],
                    ))
                _ = self._transfer_fa2(
                    sp.record(
                        token_contract=auction.token_contract,
                        from_=sp.self_address,
                        txs=[
                            sp.record(
                                to_=auction.creator,
                                token_id=auction.token_id,
                                amount=1,
                            )
                        ],
                    )
                )
            sp.emit(sp.record(auction_id=auction_id), tag="auction_settled")

        @sp.entrypoint
        def cancel_auction(self, auction_id):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            sp.cast(auction_id, sp.nat)

            assert auction_id in self.data.auctions, "AUCTION_NOT_FOUND"
            auction = self.data.auctions[auction_id]

            assert (
                sp.sender == auction.creator or sp.sender == self.data.admin
            ), "NOT_AUTHORIZED"
            assert not auction.has_bid, "AUCTION_HAS_BID"

            token_key = sp.record(
                owner=auction.creator,
                token_contract=auction.token_contract,
                token_id=auction.token_id,
            )
            del self.data.auction_tokens[token_key]
            del self.data.auctions[auction_id]

            _ = self._transfer_fa2(
                sp.record(
                    token_contract=auction.token_contract,
                    from_=sp.self_address,
                    txs=[
                        sp.record(
                            to_=auction.creator,
                            token_id=auction.token_id,
                            amount=1,
                        )
                    ],
                )
            )
            sp.emit(sp.record(auction_id=auction_id, canceller=sp.sender), tag="auction_cancelled")

        @sp.entrypoint
        def place_offer(self, params):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            assert not self.data.paused, "PAUSED"
            sp.cast(params, place_offer_type)

            assert params.amount_wtf > 0, "OFFER_AMOUNT_INVALID"
            assert params.token_amount > 0, "TOKEN_AMOUNT_INVALID"
            assert params.token_amount == 1, "OFFER_SINGLE_EDITION_ONLY"
            assert sp.sender != params.target_owner, "SELF_OFFER_FORBIDDEN"

            token_key = sp.record(
                owner=params.target_owner,
                token_contract=params.token_contract,
                token_id=params.token_id,
            )
            assert not (token_key in self.data.auction_tokens), "AUCTION_ACTIVE"
            if token_key in self.data.listing_tokens:
                listing_id = self.data.listing_tokens[token_key]
                assert self.data.listings[listing_id].token_amount == 1, "OFFER_SINGLE_EDITION_ONLY"

            if token_key in self.data.offers:
                existing_offer = self.data.offers[token_key]
                assert params.amount_wtf > existing_offer.amount_wtf, "OFFER_NOT_HIGHER"

            _ = self._transfer_fa2(sp.record(token_contract=self.data.wtf_token_address,
                    from_=sp.sender,
                    txs=[
                        sp.record(
                            to_=sp.self_address,
                            token_id=self.data.wtf_token_id,
                            amount=params.amount_wtf,
                        )
                    ],
                )
            )

            if token_key in self.data.offers:
                previous_offer = self.data.offers[token_key]
                _ = self._transfer_fa2(sp.record(token_contract=self.data.wtf_token_address,
                        from_=sp.self_address,
                        txs=[
                            sp.record(
                                to_=previous_offer.offerer,
                                token_id=self.data.wtf_token_id,
                                amount=previous_offer.amount_wtf,
                            )
                        ],
                    )
                )

            self.data.offers[token_key] = sp.record(
                offerer=sp.sender,
                token_amount=params.token_amount,
                amount_wtf=params.amount_wtf,
                target_owner=params.target_owner,
            )
            sp.emit(sp.record(offerer=sp.sender, amount_wtf=params.amount_wtf), tag="offer_placed")

        @sp.entrypoint
        def cancel_offer(self, token):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            sp.cast(token, owner_token_ref_type)

            assert token in self.data.offers, "OFFER_NOT_FOUND"
            offer = self.data.offers[token]

            authorized = (
                sp.sender == offer.offerer
                or sp.sender == offer.target_owner
                or sp.sender == self.data.admin
            )

            if not authorized:
                if token in self.data.listing_tokens:
                    listing_id = self.data.listing_tokens[token]
                    listing = self.data.listings[listing_id]
                    authorized = sp.sender == listing.seller

            assert authorized, "NOT_AUTHORIZED"

            del self.data.offers[token]
            _ = self._transfer_fa2(sp.record(token_contract=self.data.wtf_token_address,
                    from_=sp.self_address,
                    txs=[
                        sp.record(
                            to_=offer.offerer,
                            token_id=self.data.wtf_token_id,
                            amount=offer.amount_wtf,
                        )
                    ],
                )
            )
            sp.emit(sp.record(offerer=offer.offerer, canceller=sp.sender), tag="offer_cancelled")

        @sp.entrypoint
        def accept_offer(self, token):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            assert not self.data.paused, "PAUSED"
            sp.cast(token, owner_token_ref_type)

            assert token in self.data.offers, "OFFER_NOT_FOUND"
            offer = self.data.offers[token]

            if token in self.data.listing_tokens:
                listing_id = self.data.listing_tokens[token]
                listing = self.data.listings[listing_id]
                assert sp.sender == listing.seller, "NOT_TOKEN_OWNER"
                assert listing.token_amount == offer.token_amount, "TOKEN_AMOUNT_MISMATCH"

                royalty_amount = (offer.amount_wtf * listing.royalty_bps) / 10_000
                seller_amount = sp.as_nat(offer.amount_wtf - royalty_amount)

                payout_txs = sp.cast([], sp.list[transfer_tx_type])
                payout_txs.push(
                    sp.record(
                        to_=listing.seller,
                        token_id=self.data.wtf_token_id,
                        amount=seller_amount,
                    )
                )
                if listing.royalty_recipient.is_some() and royalty_amount > 0:
                    payout_txs.push(
                        sp.record(
                            to_=listing.royalty_recipient.unwrap_some(),
                            token_id=self.data.wtf_token_id,
                            amount=royalty_amount,
                        )
                    )

                _ = self._transfer_fa2(sp.record(token_contract=self.data.wtf_token_address, from_=sp.self_address, txs=payout_txs))
                _ = self._transfer_fa2(
                    sp.record(
                        token_contract=listing.token_contract,
                        from_=sp.self_address,
                        txs=[
                            sp.record(
                                to_=offer.offerer,
                                token_id=listing.token_id,
                                amount=listing.token_amount,
                            )
                        ],
                    )
                )

                del self.data.listings[listing_id]
                del self.data.listing_tokens[token]
                del self.data.offers[token]
            else:
                assert sp.sender == offer.target_owner, "NOT_TOKEN_OWNER"

                royalty_amount = sp.nat(0)
                seller_amount = offer.amount_wtf
                policy_key = sp.record(
                    token_contract=token.token_contract,
                    token_id=token.token_id,
                )

                has_policy = policy_key in self.data.token_royalties
                if has_policy:
                    policy = self.data.token_royalties[policy_key]
                    if policy.royalty_bps > 0:
                        royalty_amount = (offer.amount_wtf * policy.royalty_bps) / 10_000
                        seller_amount = sp.as_nat(offer.amount_wtf - royalty_amount)

                payout_txs = sp.cast([], sp.list[transfer_tx_type])
                payout_txs.push(
                    sp.record(
                        to_=sp.sender,
                        token_id=self.data.wtf_token_id,
                        amount=seller_amount,
                    )
                )
                if has_policy:
                    policy = self.data.token_royalties[policy_key]
                    if policy.royalty_recipient.is_some() and royalty_amount > 0:
                        payout_txs.push(
                            sp.record(
                                to_=policy.royalty_recipient.unwrap_some(),
                                token_id=self.data.wtf_token_id,
                                amount=royalty_amount,
                            )
                        )

                _ = self._transfer_fa2(
                    sp.record(
                        token_contract=token.token_contract,
                        from_=sp.sender,
                        txs=[
                            sp.record(
                                to_=offer.offerer,
                                token_id=token.token_id,
                                amount=offer.token_amount,
                            )
                        ],
                    )
                )
                _ = self._transfer_fa2(sp.record(token_contract=self.data.wtf_token_address, from_=sp.self_address, txs=payout_txs))
                del self.data.offers[token]
            sp.emit(sp.record(offerer=offer.offerer, acceptor=sp.sender), tag="offer_accepted")

        @sp.entrypoint
        def set_token_royalty(self, params):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            sp.cast(params, set_token_royalty_type)
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            assert params.royalty_bps <= 10_000, "ROYALTY_BPS_INVALID"
            assert (
                params.royalty_bps == 0 or params.royalty_recipient.is_some()
            ), "ROYALTY_RECIPIENT_REQUIRED"

            token_key = sp.record(
                token_contract=params.token_contract,
                token_id=params.token_id,
            )

            if params.royalty_bps == 0 and not params.royalty_recipient.is_some():
                if token_key in self.data.token_royalties:
                    del self.data.token_royalties[token_key]
            else:
                self.data.token_royalties[token_key] = sp.record(
                    royalty_recipient=params.royalty_recipient,
                    royalty_bps=params.royalty_bps,
                )

        @sp.entrypoint
        def toggle_pause(self):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.paused = not self.data.paused

        # [H-1] Two-step admin transfer
        @sp.entrypoint
        def propose_admin(self, new_admin):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            sp.cast(new_admin, sp.address)
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.proposed_admin = sp.Some(new_admin)

        @sp.entrypoint
        def accept_admin(self):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            assert self.data.proposed_admin.is_some(), "NO_PENDING_ADMIN"
            assert sp.sender == self.data.proposed_admin.unwrap_some(), "NOT_PROPOSED_ADMIN"
            self.data.admin = sp.sender
            self.data.proposed_admin = sp.cast(None, sp.option[sp.address])

        @sp.entrypoint
        def admin_withdraw_xtz(self, params):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            sp.cast(params, withdraw_xtz_type)
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            sp.send(params.destination, params.amount)

        # [M-4] On-chain views
        @sp.onchain_view()
        def get_listing(self, listing_id):
            sp.cast(listing_id, sp.nat)
            assert listing_id in self.data.listings, "LISTING_NOT_FOUND"
            return self.data.listings[listing_id]

        @sp.onchain_view()
        def get_auction(self, auction_id):
            sp.cast(auction_id, sp.nat)
            assert auction_id in self.data.auctions, "AUCTION_NOT_FOUND"
            return self.data.auctions[auction_id]

        @sp.onchain_view()
        def get_offer(self, token_key):
            sp.cast(token_key, owner_token_ref_type)
            assert token_key in self.data.offers, "OFFER_NOT_FOUND"
            return self.data.offers[token_key]

        @sp.onchain_view()
        def is_paused(self):
            return self.data.paused


if __name__ == "__main__":
    import os

    PROD_ADMIN = sp.address("tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt")
    PROD_WTF_TOKEN = sp.address("KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD")
    PROD_WTF_TOKEN_ID = 0

    def _ledger_balance(token_contract, owner, token_id):
        return token_contract.data.ledger.get(
            sp.record(owner=owner, token_id=token_id), default_value=sp.nat(0)
        )

    def _offer_key(owner, token_contract, token_id):
        return sp.record(owner=owner, token_contract=token_contract, token_id=token_id)

    @sp.add_test()
    def test_compile_marketplace_v12():
        scenario_name = os.environ.get("SMARTPY_SCENARIO_NAME", "WTFMarketplaceV1_2")
        scenario = sp.test_scenario(scenario_name, main)
        scenario += main.WTFMarketplaceV12(PROD_ADMIN, PROD_WTF_TOKEN, PROD_WTF_TOKEN_ID, sp.big_map())

    @sp.add_test()
    def test_owner_scoped_listings_allow_parallel_holders():
        scenario = sp.test_scenario("owner_scoped_listings_allow_parallel_holders", main)

        admin = sp.test_account("Admin")
        seller_a = sp.test_account("SellerA")
        seller_b = sp.test_account("SellerB")
        nft = main.MockFA2()
        wtf = main.MockFA2()
        market = main.WTFMarketplaceV12(admin.address, wtf.address, 0, sp.big_map())

        scenario += nft
        scenario += wtf
        scenario += market

        token_id = 77
        nft.mint(sp.record(owner=seller_a.address, token_id=token_id, amount=1))
        nft.mint(sp.record(owner=seller_b.address, token_id=token_id, amount=1))

        nft.set_operator(
            sp.record(owner=seller_a.address, operator=market.address, token_id=token_id, enabled=True),
            _sender=seller_a,
        )
        nft.set_operator(
            sp.record(owner=seller_b.address, operator=market.address, token_id=token_id, enabled=True),
            _sender=seller_b,
        )

        market.create_listing(
            sp.record(
                token_contract=nft.address,
                token_id=token_id,
                token_amount=1,
                price_wtf=100,
                royalty_recipient=sp.none,
                royalty_bps=0,
            ),
            _sender=seller_a,
        )
        market.create_listing(
            sp.record(
                token_contract=nft.address,
                token_id=token_id,
                token_amount=1,
                price_wtf=120,
                royalty_recipient=sp.none,
                royalty_bps=0,
            ),
            _sender=seller_b,
        )

        scenario.verify(market.data.next_listing_id == 2)

    @sp.add_test()
    def test_create_auction_rejects_active_listing_same_owner_token():
        scenario = sp.test_scenario("create_auction_rejects_active_listing_same_owner_token", main)

        admin = sp.test_account("Admin")
        seller = sp.test_account("Seller")
        nft = main.MockFA2()
        wtf = main.MockFA2()
        market = main.WTFMarketplaceV12(admin.address, wtf.address, 0, sp.big_map())

        scenario += nft
        scenario += wtf
        scenario += market

        token_id = 9
        nft.mint(sp.record(owner=seller.address, token_id=token_id, amount=1))
        nft.set_operator(
            sp.record(owner=seller.address, operator=market.address, token_id=token_id, enabled=True),
            _sender=seller,
        )

        market.create_listing(
            sp.record(
                token_contract=nft.address,
                token_id=token_id,
                token_amount=1,
                price_wtf=100,
                royalty_recipient=sp.none,
                royalty_bps=0,
            ),
            _sender=seller,
        )

        market.create_auction(
            sp.record(
                token_contract=nft.address,
                token_id=token_id,
                reserve=50,
                start_time=sp.timestamp(10),
                end_time=sp.timestamp(100),
                extension_time=10,
                price_increment=5,
                shares=[],
            ),
            _sender=seller,
            _now=sp.timestamp(1),
            _valid=False,
            _exception="LISTING_ACTIVE",
        )

    @sp.add_test()
    def test_listing_buy_clears_and_refunds_stale_offer():
        scenario = sp.test_scenario("listing_buy_clears_and_refunds_stale_offer", main)

        admin = sp.test_account("Admin")
        seller = sp.test_account("Seller")
        buyer = sp.test_account("Buyer")
        offerer = sp.test_account("Offerer")

        nft = main.MockFA2()
        wtf = main.MockFA2()
        market = main.WTFMarketplaceV12(admin.address, wtf.address, 0, sp.big_map())

        scenario += nft
        scenario += wtf
        scenario += market

        token_id = 11
        nft.mint(sp.record(owner=seller.address, token_id=token_id, amount=1))
        wtf.mint(sp.record(owner=buyer.address, token_id=0, amount=1000))
        wtf.mint(sp.record(owner=offerer.address, token_id=0, amount=1000))

        nft.set_operator(
            sp.record(owner=seller.address, operator=market.address, token_id=token_id, enabled=True),
            _sender=seller,
        )
        wtf.set_operator(
            sp.record(owner=buyer.address, operator=market.address, token_id=0, enabled=True),
            _sender=buyer,
        )
        wtf.set_operator(
            sp.record(owner=offerer.address, operator=market.address, token_id=0, enabled=True),
            _sender=offerer,
        )

        market.create_listing(
            sp.record(
                token_contract=nft.address,
                token_id=token_id,
                token_amount=1,
                price_wtf=200,
                royalty_recipient=sp.none,
                royalty_bps=0,
            ),
            _sender=seller,
        )

        market.place_offer(
            sp.record(
                token_contract=nft.address,
                token_id=token_id,
                token_amount=1,
                amount_wtf=150,
                target_owner=seller.address,
            ),
            _sender=offerer,
        )

        offer_key = _offer_key(seller.address, nft.address, token_id)
        scenario.verify(market.data.offers.contains(offer_key))

        market.buy(0, _sender=buyer)

        scenario.verify(~market.data.offers.contains(offer_key))
        scenario.verify(_ledger_balance(wtf, offerer.address, 0) == 1000)

    @sp.add_test()
    def test_unlisted_offer_uses_token_policy_royalty():
        scenario = sp.test_scenario("unlisted_offer_uses_token_policy_royalty", main)

        admin = sp.test_account("Admin")
        seller = sp.test_account("Seller")
        buyer = sp.test_account("Buyer")
        artist = sp.test_account("Artist")

        nft = main.MockFA2()
        wtf = main.MockFA2()
        market = main.WTFMarketplaceV12(admin.address, wtf.address, 0, sp.big_map())

        scenario += nft
        scenario += wtf
        scenario += market

        token_id = 333
        nft.mint(sp.record(owner=seller.address, token_id=token_id, amount=1))
        wtf.mint(sp.record(owner=buyer.address, token_id=0, amount=1000))

        nft.set_operator(
            sp.record(owner=seller.address, operator=market.address, token_id=token_id, enabled=True),
            _sender=seller,
        )
        wtf.set_operator(
            sp.record(owner=buyer.address, operator=market.address, token_id=0, enabled=True),
            _sender=buyer,
        )

        market.set_token_royalty(
            sp.record(
                token_contract=nft.address,
                token_id=token_id,
                royalty_recipient=sp.some(artist.address),
                royalty_bps=1_000,
            ),
            _sender=admin,
        )

        market.place_offer(
            sp.record(
                token_contract=nft.address,
                token_id=token_id,
                token_amount=1,
                amount_wtf=500,
                target_owner=seller.address,
            ),
            _sender=buyer,
        )

        market.accept_offer(
            _offer_key(seller.address, nft.address, token_id),
            _sender=seller,
        )

        scenario.verify(_ledger_balance(wtf, artist.address, 0) == 50)
        scenario.verify(_ledger_balance(wtf, seller.address, 0) == 450)
        scenario.verify(_ledger_balance(nft, buyer.address, token_id) == 1)

    @sp.add_test()
    def test_two_step_admin_transfer():
        scenario = sp.test_scenario("v12_marketplace_two_step_admin", main)
        admin = sp.test_account("Admin")
        new_admin = sp.test_account("NewAdmin")
        wtf = main.MockFA2()
        market = main.WTFMarketplaceV12(admin.address, wtf.address, 0, sp.big_map())
        scenario += wtf
        scenario += market

        market.propose_admin(new_admin.address, _sender=admin)
        market.accept_admin(_sender=new_admin)
        scenario.verify(market.data.admin == new_admin.address)
