import smartpy as sp


@sp.module
def main():
    token_ref_type: type = sp.record(
        token_contract=sp.address,
        token_id=sp.nat,
    ).layout(("token_contract", "token_id"))

    owner_token_ref_type: type = sp.record(
        owner=sp.address,
        token_contract=sp.address,
        token_id=sp.nat,
    ).layout(("owner", ("token_contract", "token_id")))

    offer_index_type: type = sp.record(
        target_owner=sp.address,
        token_contract=sp.address,
        token_id=sp.nat,
        offerer=sp.address,
    ).layout(("target_owner", ("token_contract", ("token_id", "offerer"))))

    transfer_tx_type: type = sp.record(
        to_=sp.address,
        token_id=sp.nat,
        amount=sp.nat,
    ).layout(("to_", ("token_id", "amount")))

    transfer_batch_item_type: type = sp.record(
        from_=sp.address,
        txs=sp.list[transfer_tx_type],
    ).layout(("from_", "txs"))

    transfer_batch_type: type = sp.list[transfer_batch_item_type]

    transfer_call_type: type = sp.record(
        token_contract=sp.address,
        from_=sp.address,
        txs=sp.list[transfer_tx_type],
    ).layout(("token_contract", ("from_", "txs")))

    create_listing_type: type = sp.record(
        token_contract=sp.address,
        token_id=sp.nat,
        quantity=sp.nat,
        unit_price_wtf=sp.nat,
        expiry=sp.option[sp.timestamp],
        royalty_bps=sp.nat,
        royalty_recipient=sp.option[sp.address],
    ).layout(
        (
            "token_contract",
            (
                "token_id",
                (
                    "quantity",
                    (
                        "unit_price_wtf",
                        ("expiry", ("royalty_bps", "royalty_recipient")),
                    ),
                ),
            ),
        )
    )

    buy_listing_type: type = sp.record(
        listing_id=sp.nat,
        quantity=sp.nat,
        expected_token=token_ref_type,
        expected_owner=sp.address,
        expected_unit_price_wtf=sp.nat,
    ).layout(
        (
            "listing_id",
            (
                "quantity",
                ("expected_token", ("expected_owner", "expected_unit_price_wtf")),
            ),
        )
    )

    place_offer_type: type = sp.record(
        token_contract=sp.address,
        token_id=sp.nat,
        target_owner=sp.address,
        quantity=sp.nat,
        unit_price_wtf=sp.nat,
        expiry=sp.option[sp.timestamp],
    ).layout(
        (
            "token_contract",
            (
                "token_id",
                ("target_owner", ("quantity", ("unit_price_wtf", "expiry"))),
            ),
        )
    )

    accept_offer_type: type = sp.record(
        offer_id=sp.nat,
        expected_token=token_ref_type,
        expected_target_owner=sp.address,
        expected_quantity=sp.nat,
        expected_unit_price_wtf=sp.nat,
    ).layout(
        (
            "offer_id",
            (
                "expected_token",
                (
                    "expected_target_owner",
                    ("expected_quantity", "expected_unit_price_wtf"),
                ),
            ),
        )
    )

    create_auction_type: type = sp.record(
        token_contract=sp.address,
        token_id=sp.nat,
        quantity=sp.nat,
        reserve_wtf=sp.nat,
        min_increment_wtf=sp.nat,
        start_time=sp.timestamp,
        end_time=sp.timestamp,
    ).layout(
        (
            "token_contract",
            (
                "token_id",
                (
                    "quantity",
                    (
                        "reserve_wtf",
                        ("min_increment_wtf", ("start_time", "end_time")),
                    ),
                ),
            ),
        )
    )

    bid_type: type = sp.record(
        auction_id=sp.nat,
        amount_wtf=sp.nat,
    ).layout(("auction_id", "amount_wtf"))

    listing_type: type = sp.record(
        seller=sp.address,
        token_contract=sp.address,
        token_id=sp.nat,
        remaining_quantity=sp.nat,
        unit_price_wtf=sp.nat,
        expiry=sp.option[sp.timestamp],
        royalty_bps=sp.nat,
        royalty_recipient=sp.option[sp.address],
        active=sp.bool,
    )

    offer_type: type = sp.record(
        offerer=sp.address,
        target_owner=sp.address,
        token_contract=sp.address,
        token_id=sp.nat,
        quantity=sp.nat,
        unit_price_wtf=sp.nat,
        total_wtf=sp.nat,
        expiry=sp.option[sp.timestamp],
        active=sp.bool,
    )

    auction_type: type = sp.record(
        creator=sp.address,
        token_contract=sp.address,
        token_id=sp.nat,
        quantity=sp.nat,
        reserve_wtf=sp.nat,
        min_increment_wtf=sp.nat,
        start_time=sp.timestamp,
        end_time=sp.timestamp,
        current_bid_wtf=sp.nat,
        highest_bidder=sp.option[sp.address],
        active=sp.bool,
    )

    ledger_key_type: type = sp.record(
        owner=sp.address,
        token_id=sp.nat,
    ).layout(("owner", "token_id"))

    operator_key_type: type = sp.record(
        owner=sp.address,
        operator=sp.address,
        token_id=sp.nat,
    ).layout(("owner", ("operator", "token_id")))

    mint_type: type = sp.record(
        owner=sp.address,
        token_id=sp.nat,
        amount=sp.nat,
    ).layout(("owner", ("token_id", "amount")))

    set_operator_type: type = sp.record(
        owner=sp.address,
        operator=sp.address,
        token_id=sp.nat,
        enabled=sp.bool,
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
            self.data.ledger[key] = self.data.ledger.get(key, default=sp.nat(0)) + params.amount

        @sp.entrypoint
        def set_operator(self, params):
            sp.cast(params, set_operator_type)
            assert sp.sender == params.owner, "NOT_OWNER"
            key = sp.record(
                owner=params.owner,
                operator=params.operator,
                token_id=params.token_id,
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
                        owner=transfer.from_,
                        operator=sp.sender,
                        token_id=tx.token_id,
                    )
                    assert (
                        sp.sender == transfer.from_ or op_key in self.data.operators
                    ), "FA2_NOT_OPERATOR"
                    from_key = sp.record(owner=transfer.from_, token_id=tx.token_id)
                    from_bal = self.data.ledger.get(from_key, default=sp.nat(0))
                    assert from_bal >= tx.amount, "FA2_INSUFFICIENT_BALANCE"
                    self.data.ledger[from_key] = sp.as_nat(from_bal - tx.amount)
                    to_key = sp.record(owner=tx.to_, token_id=tx.token_id)
                    self.data.ledger[to_key] = self.data.ledger.get(
                        to_key, default=sp.nat(0)
                    ) + tx.amount

    class WTFMarketplaceV2(sp.Contract):
        def __init__(self, admin, wtf_token_address, wtf_token_id, metadata):
            sp.cast(admin, sp.address)
            sp.cast(wtf_token_address, sp.address)
            sp.cast(wtf_token_id, sp.nat)
            sp.cast(metadata, sp.big_map[sp.string, sp.bytes])

            self.data.admin = admin
            self.data.proposed_admin = sp.cast(None, sp.option[sp.address])
            self.data.wtf_token_address = wtf_token_address
            self.data.wtf_token_id = wtf_token_id
            self.data.paused = False
            self.data.metadata = metadata

            self.data.next_listing_id = sp.nat(0)
            self.data.listings = sp.cast(sp.big_map(), sp.big_map[sp.nat, listing_type])
            self.data.listing_index = sp.cast(
                sp.big_map(), sp.big_map[owner_token_ref_type, sp.nat]
            )

            self.data.next_offer_id = sp.nat(0)
            self.data.offers = sp.cast(sp.big_map(), sp.big_map[sp.nat, offer_type])
            self.data.offer_index = sp.cast(
                sp.big_map(), sp.big_map[offer_index_type, sp.nat]
            )

            self.data.next_auction_id = sp.nat(0)
            self.data.auctions = sp.cast(sp.big_map(), sp.big_map[sp.nat, auction_type])
            self.data.auction_index = sp.cast(
                sp.big_map(), sp.big_map[owner_token_ref_type, sp.nat]
            )

        @sp.private(with_operations=True)
        def _transfer_fa2(self, params):
            sp.cast(params, transfer_call_type)
            transfer_ep = sp.contract(
                transfer_batch_type,
                params.token_contract,
                entrypoint="transfer",
            ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
            sp.transfer(
                [sp.record(from_=params.from_, txs=params.txs)],
                sp.mutez(0),
                transfer_ep,
            )
            return ()

        @sp.private(with_storage="read-only", with_operations=True)
        def _transfer_wtf(self, params):
            sp.cast(
                params,
                sp.record(from_=sp.address, txs=sp.list[transfer_tx_type]).layout(
                    ("from_", "txs")
                ),
            )
            transfer_ep = sp.contract(
                transfer_batch_type,
                self.data.wtf_token_address,
                entrypoint="transfer",
            ).unwrap_some(error="FA2_TRANSFER_EP_MISSING")
            sp.transfer(
                [sp.record(from_=params.from_, txs=params.txs)],
                sp.mutez(0),
                transfer_ep,
            )
            return ()

        @sp.private()
        def _assert_not_expired(self, expiry):
            sp.cast(expiry, sp.option[sp.timestamp])
            if expiry.is_some():
                assert sp.now <= expiry.unwrap_some(), "EXPIRED"
            return ()

        @sp.private()
        def _assert_future_expiry(self, expiry):
            sp.cast(expiry, sp.option[sp.timestamp])
            if expiry.is_some():
                assert expiry.unwrap_some() > sp.now, "EXPIRY_IN_PAST"
            return ()

        @sp.private(with_storage="read-write", with_operations=True)
        def _refund_offer(self, offer_id):
            sp.cast(offer_id, sp.nat)
            offer = self.data.offers[offer_id]
            offer_key = sp.record(
                target_owner=offer.target_owner,
                token_contract=offer.token_contract,
                token_id=offer.token_id,
                offerer=offer.offerer,
            )
            del self.data.offers[offer_id]
            if offer_key in self.data.offer_index:
                del self.data.offer_index[offer_key]
            transfer_ep = sp.contract(
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
                                to_=offer.offerer,
                                token_id=self.data.wtf_token_id,
                                amount=offer.total_wtf,
                            )
                        ],
                    )
                ],
                sp.mutez(0),
                transfer_ep,
            )
            return ()

        @sp.entrypoint
        def default(self):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"

        @sp.entrypoint
        def create_listing(self, params):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            assert not self.data.paused, "PAUSED"
            sp.cast(params, create_listing_type)
            assert params.quantity > 0, "QUANTITY_INVALID"
            assert params.unit_price_wtf > 0, "PRICE_INVALID"
            assert params.royalty_bps <= 5_000, "ROYALTY_BPS_INVALID"
            assert (
                params.royalty_bps == 0 or params.royalty_recipient.is_some()
            ), "ROYALTY_RECIPIENT_REQUIRED"
            _ = self._assert_future_expiry(params.expiry)

            token_key = sp.record(
                owner=sp.sender,
                token_contract=params.token_contract,
                token_id=params.token_id,
            )
            assert not (token_key in self.data.listing_index), "LISTING_ACTIVE"
            assert not (token_key in self.data.auction_index), "AUCTION_ACTIVE"

            _ = self._transfer_fa2(
                sp.record(
                    token_contract=params.token_contract,
                    from_=sp.sender,
                    txs=[
                        sp.record(
                            to_=sp.self_address,
                            token_id=params.token_id,
                            amount=params.quantity,
                        )
                    ],
                )
            )

            listing_id = self.data.next_listing_id
            self.data.listings[listing_id] = sp.record(
                seller=sp.sender,
                token_contract=params.token_contract,
                token_id=params.token_id,
                remaining_quantity=params.quantity,
                unit_price_wtf=params.unit_price_wtf,
                expiry=params.expiry,
                royalty_bps=params.royalty_bps,
                royalty_recipient=params.royalty_recipient,
                active=True,
            )
            self.data.listing_index[token_key] = listing_id
            self.data.next_listing_id += 1
            sp.emit(
                sp.record(
                    listing_id=listing_id,
                    seller=sp.sender,
                    quantity=params.quantity,
                    unit_price_wtf=params.unit_price_wtf,
                ),
                tag="listing_created",
            )

        @sp.entrypoint
        def buy_listing(self, params):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            assert not self.data.paused, "PAUSED"
            sp.cast(params, buy_listing_type)
            assert params.quantity > 0, "QUANTITY_INVALID"
            assert params.listing_id in self.data.listings, "LISTING_NOT_FOUND"

            listing = self.data.listings[params.listing_id]
            assert listing.active, "LISTING_INACTIVE"
            assert sp.sender != listing.seller, "SELF_BUY_FORBIDDEN"
            assert params.expected_owner == listing.seller, "OWNER_MISMATCH"
            assert (
                params.expected_token.token_contract == listing.token_contract
                and params.expected_token.token_id == listing.token_id
            ), "TOKEN_MISMATCH"
            assert (
                params.expected_unit_price_wtf == listing.unit_price_wtf
            ), "PRICE_MISMATCH"
            assert params.quantity <= listing.remaining_quantity, "QUANTITY_TOO_HIGH"
            _ = self._assert_not_expired(listing.expiry)

            total_wtf = params.quantity * listing.unit_price_wtf
            royalty_amount = (total_wtf * listing.royalty_bps) / 10_000
            seller_amount = sp.as_nat(total_wtf - royalty_amount)
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
            _ = self._transfer_wtf(sp.record(from_=sp.sender, txs=payment_txs))
            _ = self._transfer_fa2(
                sp.record(
                    token_contract=listing.token_contract,
                    from_=sp.self_address,
                    txs=[
                        sp.record(
                            to_=sp.sender,
                            token_id=listing.token_id,
                            amount=params.quantity,
                        )
                    ],
                )
            )

            remaining = sp.as_nat(listing.remaining_quantity - params.quantity)
            token_key = sp.record(
                owner=listing.seller,
                token_contract=listing.token_contract,
                token_id=listing.token_id,
            )
            if remaining == 0:
                del self.data.listings[params.listing_id]
                if token_key in self.data.listing_index:
                    del self.data.listing_index[token_key]
            else:
                listing.remaining_quantity = remaining
                self.data.listings[params.listing_id] = listing
            sp.emit(
                sp.record(
                    listing_id=params.listing_id,
                    buyer=sp.sender,
                    quantity=params.quantity,
                    total_wtf=total_wtf,
                ),
                tag="listing_bought",
            )

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
            del self.data.listings[listing_id]
            if token_key in self.data.listing_index:
                del self.data.listing_index[token_key]
            _ = self._transfer_fa2(
                sp.record(
                    token_contract=listing.token_contract,
                    from_=sp.self_address,
                    txs=[
                        sp.record(
                            to_=listing.seller,
                            token_id=listing.token_id,
                            amount=listing.remaining_quantity,
                        )
                    ],
                )
            )
            sp.emit(
                sp.record(listing_id=listing_id, canceller=sp.sender),
                tag="listing_cancelled",
            )

        @sp.entrypoint
        def place_offer(self, params):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            assert not self.data.paused, "PAUSED"
            sp.cast(params, place_offer_type)
            assert params.quantity > 0, "QUANTITY_INVALID"
            assert params.unit_price_wtf > 0, "PRICE_INVALID"
            assert sp.sender != params.target_owner, "SELF_OFFER_FORBIDDEN"
            _ = self._assert_future_expiry(params.expiry)

            offer_key = sp.record(
                target_owner=params.target_owner,
                token_contract=params.token_contract,
                token_id=params.token_id,
                offerer=sp.sender,
            )
            assert not (offer_key in self.data.offer_index), "OFFER_ACTIVE"
            total_wtf = params.quantity * params.unit_price_wtf

            _ = self._transfer_wtf(
                sp.record(
                    from_=sp.sender,
                    txs=[
                        sp.record(
                            to_=sp.self_address,
                            token_id=self.data.wtf_token_id,
                            amount=total_wtf,
                        )
                    ],
                )
            )

            offer_id = self.data.next_offer_id
            self.data.offers[offer_id] = sp.record(
                offerer=sp.sender,
                target_owner=params.target_owner,
                token_contract=params.token_contract,
                token_id=params.token_id,
                quantity=params.quantity,
                unit_price_wtf=params.unit_price_wtf,
                total_wtf=total_wtf,
                expiry=params.expiry,
                active=True,
            )
            self.data.offer_index[offer_key] = offer_id
            self.data.next_offer_id += 1
            sp.emit(
                sp.record(
                    offer_id=offer_id,
                    offerer=sp.sender,
                    target_owner=params.target_owner,
                    quantity=params.quantity,
                    total_wtf=total_wtf,
                ),
                tag="offer_created",
            )

        @sp.entrypoint
        def accept_offer(self, params):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            assert not self.data.paused, "PAUSED"
            sp.cast(params, accept_offer_type)
            assert params.offer_id in self.data.offers, "OFFER_NOT_FOUND"
            offer = self.data.offers[params.offer_id]
            assert offer.active, "OFFER_INACTIVE"
            assert sp.sender == offer.target_owner, "NOT_TARGET_OWNER"
            assert params.expected_target_owner == offer.target_owner, "OWNER_MISMATCH"
            assert (
                params.expected_token.token_contract == offer.token_contract
                and params.expected_token.token_id == offer.token_id
            ), "TOKEN_MISMATCH"
            assert params.expected_quantity == offer.quantity, "QUANTITY_MISMATCH"
            assert params.expected_unit_price_wtf == offer.unit_price_wtf, "PRICE_MISMATCH"
            _ = self._assert_not_expired(offer.expiry)

            token_key = sp.record(
                owner=offer.target_owner,
                token_contract=offer.token_contract,
                token_id=offer.token_id,
            )
            if token_key in self.data.listing_index:
                listing_id = self.data.listing_index[token_key]
                listing = self.data.listings[listing_id]
                assert listing.remaining_quantity >= offer.quantity, "LISTING_QTY_LOW"
                _ = self._transfer_fa2(
                    sp.record(
                        token_contract=offer.token_contract,
                        from_=sp.self_address,
                        txs=[
                            sp.record(
                                to_=offer.offerer,
                                token_id=offer.token_id,
                                amount=offer.quantity,
                            )
                        ],
                    )
                )
                remaining = sp.as_nat(listing.remaining_quantity - offer.quantity)
                if remaining == 0:
                    del self.data.listings[listing_id]
                    del self.data.listing_index[token_key]
                else:
                    listing.remaining_quantity = remaining
                    self.data.listings[listing_id] = listing
            else:
                _ = self._transfer_fa2(
                    sp.record(
                        token_contract=offer.token_contract,
                        from_=sp.sender,
                        txs=[
                            sp.record(
                                to_=offer.offerer,
                                token_id=offer.token_id,
                                amount=offer.quantity,
                            )
                        ],
                    )
                )

            _ = self._transfer_wtf(
                sp.record(
                    from_=sp.self_address,
                    txs=[
                        sp.record(
                            to_=offer.target_owner,
                            token_id=self.data.wtf_token_id,
                            amount=offer.total_wtf,
                        )
                    ],
                )
            )

            offer_key = sp.record(
                target_owner=offer.target_owner,
                token_contract=offer.token_contract,
                token_id=offer.token_id,
                offerer=offer.offerer,
            )
            del self.data.offers[params.offer_id]
            if offer_key in self.data.offer_index:
                del self.data.offer_index[offer_key]
            sp.emit(
                sp.record(
                    offer_id=params.offer_id,
                    acceptor=sp.sender,
                    quantity=offer.quantity,
                    total_wtf=offer.total_wtf,
                ),
                tag="offer_accepted",
            )

        @sp.entrypoint
        def cancel_offer(self, offer_id):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            sp.cast(offer_id, sp.nat)
            assert offer_id in self.data.offers, "OFFER_NOT_FOUND"
            offer = self.data.offers[offer_id]
            assert (
                sp.sender == offer.offerer
                or sp.sender == offer.target_owner
                or sp.sender == self.data.admin
            ), "NOT_AUTHORIZED"
            _ = self._refund_offer(offer_id)
            sp.emit(
                sp.record(offer_id=offer_id, canceller=sp.sender),
                tag="offer_cancelled",
            )

        @sp.entrypoint
        def create_auction(self, params):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            assert not self.data.paused, "PAUSED"
            sp.cast(params, create_auction_type)
            assert params.quantity > 0, "QUANTITY_INVALID"
            assert params.reserve_wtf > 0, "RESERVE_INVALID"
            assert params.min_increment_wtf > 0, "INCREMENT_INVALID"
            assert params.start_time < params.end_time, "TIME_WINDOW_INVALID"
            assert params.end_time > sp.now, "END_IN_PAST"

            token_key = sp.record(
                owner=sp.sender,
                token_contract=params.token_contract,
                token_id=params.token_id,
            )
            assert not (token_key in self.data.listing_index), "LISTING_ACTIVE"
            assert not (token_key in self.data.auction_index), "AUCTION_ACTIVE"

            _ = self._transfer_fa2(
                sp.record(
                    token_contract=params.token_contract,
                    from_=sp.sender,
                    txs=[
                        sp.record(
                            to_=sp.self_address,
                            token_id=params.token_id,
                            amount=params.quantity,
                        )
                    ],
                )
            )

            auction_id = self.data.next_auction_id
            self.data.auctions[auction_id] = sp.record(
                creator=sp.sender,
                token_contract=params.token_contract,
                token_id=params.token_id,
                quantity=params.quantity,
                reserve_wtf=params.reserve_wtf,
                min_increment_wtf=params.min_increment_wtf,
                start_time=params.start_time,
                end_time=params.end_time,
                current_bid_wtf=sp.nat(0),
                highest_bidder=sp.cast(None, sp.option[sp.address]),
                active=True,
            )
            self.data.auction_index[token_key] = auction_id
            self.data.next_auction_id += 1
            sp.emit(
                sp.record(auction_id=auction_id, creator=sp.sender),
                tag="auction_created",
            )

        @sp.entrypoint
        def bid(self, params):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            assert not self.data.paused, "PAUSED"
            sp.cast(params, bid_type)
            assert params.amount_wtf > 0, "BID_INVALID"
            assert params.auction_id in self.data.auctions, "AUCTION_NOT_FOUND"
            auction = self.data.auctions[params.auction_id]
            assert auction.active, "AUCTION_INACTIVE"
            assert sp.now >= auction.start_time, "AUCTION_NOT_STARTED"
            assert sp.now < auction.end_time, "AUCTION_ENDED"
            assert sp.sender != auction.creator, "SELF_BID_FORBIDDEN"
            min_bid = auction.reserve_wtf
            if auction.highest_bidder.is_some():
                min_bid = auction.current_bid_wtf + auction.min_increment_wtf
            assert params.amount_wtf >= min_bid, "BID_TOO_LOW"

            _ = self._transfer_wtf(
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
            )
            if auction.highest_bidder.is_some():
                _ = self._transfer_wtf(
                    sp.record(
                        from_=sp.self_address,
                        txs=[
                            sp.record(
                                to_=auction.highest_bidder.unwrap_some(),
                                token_id=self.data.wtf_token_id,
                                amount=auction.current_bid_wtf,
                            )
                        ],
                    )
                )

            auction.current_bid_wtf = params.amount_wtf
            auction.highest_bidder = sp.Some(sp.sender)
            self.data.auctions[params.auction_id] = auction
            sp.emit(
                sp.record(
                    auction_id=params.auction_id,
                    bidder=sp.sender,
                    amount_wtf=params.amount_wtf,
                ),
                tag="auction_bid",
            )

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
            if auction.highest_bidder.is_some():
                winner = auction.highest_bidder.unwrap_some()
                _ = self._transfer_wtf(
                    sp.record(
                        from_=sp.self_address,
                        txs=[
                            sp.record(
                                to_=auction.creator,
                                token_id=self.data.wtf_token_id,
                                amount=auction.current_bid_wtf,
                            )
                        ],
                    )
                )
                _ = self._transfer_fa2(
                    sp.record(
                        token_contract=auction.token_contract,
                        from_=sp.self_address,
                        txs=[
                            sp.record(
                                to_=winner,
                                token_id=auction.token_id,
                                amount=auction.quantity,
                            )
                        ],
                    )
                )
            else:
                _ = self._transfer_fa2(
                    sp.record(
                        token_contract=auction.token_contract,
                        from_=sp.self_address,
                        txs=[
                            sp.record(
                                to_=auction.creator,
                                token_id=auction.token_id,
                                amount=auction.quantity,
                            )
                        ],
                    )
                )

            del self.data.auctions[auction_id]
            if token_key in self.data.auction_index:
                del self.data.auction_index[token_key]
            sp.emit(sp.record(auction_id=auction_id), tag="auction_settled")

        @sp.entrypoint
        def cancel_auction(self, auction_id):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            sp.cast(auction_id, sp.nat)
            assert auction_id in self.data.auctions, "AUCTION_NOT_FOUND"
            auction = self.data.auctions[auction_id]
            if auction.highest_bidder.is_some():
                assert sp.sender == self.data.admin, "AUCTION_HAS_BID"
                _ = self._transfer_wtf(
                    sp.record(
                        from_=sp.self_address,
                        txs=[
                            sp.record(
                                to_=auction.highest_bidder.unwrap_some(),
                                token_id=self.data.wtf_token_id,
                                amount=auction.current_bid_wtf,
                            )
                        ],
                    )
                )
            else:
                assert (
                    sp.sender == auction.creator or sp.sender == self.data.admin
                ), "NOT_AUTHORIZED"

            token_key = sp.record(
                owner=auction.creator,
                token_contract=auction.token_contract,
                token_id=auction.token_id,
            )
            del self.data.auctions[auction_id]
            if token_key in self.data.auction_index:
                del self.data.auction_index[token_key]
            _ = self._transfer_fa2(
                sp.record(
                    token_contract=auction.token_contract,
                    from_=sp.self_address,
                    txs=[
                        sp.record(
                            to_=auction.creator,
                            token_id=auction.token_id,
                            amount=auction.quantity,
                        )
                    ],
                )
            )
            sp.emit(
                sp.record(auction_id=auction_id, canceller=sp.sender),
                tag="auction_cancelled",
            )

        @sp.entrypoint
        def pause(self):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.paused = True

        @sp.entrypoint
        def unpause(self):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.paused = False

        @sp.entrypoint
        def propose_admin(self, new_admin):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            sp.cast(new_admin, sp.address)
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.proposed_admin = sp.Some(new_admin)

        @sp.entrypoint
        def accept_admin(self):
            assert sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED"
            pending = self.data.proposed_admin.unwrap_some(error="NO_PENDING_ADMIN")
            assert sp.sender == pending, "NOT_PROPOSED_ADMIN"
            self.data.admin = pending
            self.data.proposed_admin = sp.cast(None, sp.option[sp.address])

        @sp.onchain_view()
        def is_paused(self):
            return self.data.paused

        @sp.onchain_view()
        def get_listing(self, listing_id):
            sp.cast(listing_id, sp.nat)
            assert listing_id in self.data.listings, "LISTING_NOT_FOUND"
            return self.data.listings[listing_id]

        @sp.onchain_view()
        def get_offer(self, offer_id):
            sp.cast(offer_id, sp.nat)
            assert offer_id in self.data.offers, "OFFER_NOT_FOUND"
            return self.data.offers[offer_id]

        @sp.onchain_view()
        def get_auction(self, auction_id):
            sp.cast(auction_id, sp.nat)
            assert auction_id in self.data.auctions, "AUCTION_NOT_FOUND"
            return self.data.auctions[auction_id]


if __name__ == "__main__":
    import os

    PROD_ADMIN_ADDRESS = "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt"
    PROD_WTF_TOKEN_ADDRESS = "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD"
    PROD_WTF_TOKEN_ID = 0
    EMPTY_METADATA = sp.big_map(
        {
            "": sp.bytes("0x74657a6f732d73746f726167653a636f6e74656e74"),
            "content": sp.bytes(
                "0x7b226e616d65223a22575446204d61726b6574706c616365205632222c"
                "226465736372697074696f6e223a225754462d64656e6f6d696e61746564"
                "206578706c696369742d7175616e74697479206d61726b6574706c616365"
                "227d"
            ),
        }
    )

    def _balance(token_contract, owner, token_id):
        return token_contract.data.ledger.get(
            sp.record(owner=owner, token_id=token_id),
            default_value=sp.nat(0),
        )

    def _token(token_contract, token_id):
        return sp.record(token_contract=token_contract.address, token_id=token_id)

    def _setup():
        admin = sp.test_account("Admin")
        seller = sp.test_account("Seller")
        buyer = sp.test_account("Buyer")
        offerer = sp.test_account("Offerer")
        nft = main.MockFA2()
        wtf = main.MockFA2()
        market = main.WTFMarketplaceV2(admin.address, wtf.address, 0, EMPTY_METADATA)
        return admin, seller, buyer, offerer, nft, wtf, market

    @sp.add_test()
    def test_compile_marketplace_v2():
        scenario_name = os.environ.get("SMARTPY_SCENARIO_NAME", "WTFMarketplaceV2")
        admin = sp.address(os.environ.get("MARKETPLACE_V2_ADMIN", PROD_ADMIN_ADDRESS))
        wtf_token = sp.address(
            os.environ.get("MARKETPLACE_V2_WTF_TOKEN_ADDRESS", PROD_WTF_TOKEN_ADDRESS)
        )
        wtf_token_id = int(
            os.environ.get("MARKETPLACE_V2_WTF_TOKEN_ID", str(PROD_WTF_TOKEN_ID))
        )
        scenario = sp.test_scenario(scenario_name, main)
        scenario += main.WTFMarketplaceV2(
            admin,
            wtf_token,
            wtf_token_id,
            EMPTY_METADATA,
        )

    @sp.add_test()
    def test_default_rejects_xtz():
        scenario = sp.test_scenario("v2_default_rejects_xtz", main)
        admin, _, _, _, _, _, market = _setup()
        scenario += market
        market.default(_sender=admin, _amount=sp.mutez(1), _valid=False)

    @sp.add_test()
    def test_listing_partial_buy_uses_explicit_terms():
        scenario = sp.test_scenario("v2_listing_partial_buy_uses_explicit_terms", main)
        admin, seller, buyer, _, nft, wtf, market = _setup()
        scenario += nft
        scenario += wtf
        scenario += market

        token_id = 7
        nft.mint(sp.record(owner=seller.address, token_id=token_id, amount=10))
        wtf.mint(sp.record(owner=buyer.address, token_id=0, amount=1_000))
        nft.set_operator(
            sp.record(owner=seller.address, operator=market.address, token_id=token_id, enabled=True),
            _sender=seller,
        )
        wtf.set_operator(
            sp.record(owner=buyer.address, operator=market.address, token_id=0, enabled=True),
            _sender=buyer,
        )

        market.create_listing(
            sp.record(
                token_contract=nft.address,
                token_id=token_id,
                quantity=5,
                unit_price_wtf=100,
                expiry=sp.some(sp.timestamp(1000)),
                royalty_bps=0,
                royalty_recipient=sp.cast(None, sp.option[sp.address]),
            ),
            _sender=seller,
            _now=sp.timestamp(10),
        )
        market.buy_listing(
            sp.record(
                listing_id=0,
                quantity=2,
                expected_token=_token(nft, token_id),
                expected_owner=seller.address,
                expected_unit_price_wtf=101,
            ),
            _sender=buyer,
            _now=sp.timestamp(11),
            _valid=False,
        )
        market.buy_listing(
            sp.record(
                listing_id=0,
                quantity=2,
                expected_token=_token(nft, token_id),
                expected_owner=seller.address,
                expected_unit_price_wtf=100,
            ),
            _sender=buyer,
            _now=sp.timestamp(11),
        )

        scenario.verify(_balance(wtf, seller.address, 0) == 200)
        scenario.verify(_balance(nft, buyer.address, token_id) == 2)
        scenario.verify(market.data.listings[0].remaining_quantity == 3)

    @sp.add_test()
    def test_offer_accept_requires_exact_quantity_and_price():
        scenario = sp.test_scenario("v2_offer_accept_requires_exact_quantity_and_price", main)
        admin, owner, _, offerer, nft, wtf, market = _setup()
        scenario += nft
        scenario += wtf
        scenario += market

        token_id = 42
        nft.mint(sp.record(owner=owner.address, token_id=token_id, amount=10))
        wtf.mint(sp.record(owner=offerer.address, token_id=0, amount=1_000))
        nft.set_operator(
            sp.record(owner=owner.address, operator=market.address, token_id=token_id, enabled=True),
            _sender=owner,
        )
        wtf.set_operator(
            sp.record(owner=offerer.address, operator=market.address, token_id=0, enabled=True),
            _sender=offerer,
        )

        market.place_offer(
            sp.record(
                token_contract=nft.address,
                token_id=token_id,
                target_owner=owner.address,
                quantity=3,
                unit_price_wtf=10,
                expiry=sp.some(sp.timestamp(1000)),
            ),
            _sender=offerer,
            _now=sp.timestamp(10),
        )
        market.accept_offer(
            sp.record(
                offer_id=0,
                expected_token=_token(nft, token_id),
                expected_target_owner=owner.address,
                expected_quantity=2,
                expected_unit_price_wtf=10,
            ),
            _sender=owner,
            _now=sp.timestamp(11),
            _valid=False,
        )
        market.accept_offer(
            sp.record(
                offer_id=0,
                expected_token=_token(nft, token_id),
                expected_target_owner=owner.address,
                expected_quantity=3,
                expected_unit_price_wtf=10,
            ),
            _sender=owner,
            _now=sp.timestamp(11),
        )

        scenario.verify(_balance(wtf, owner.address, 0) == 30)
        scenario.verify(_balance(nft, offerer.address, token_id) == 3)
        scenario.verify(~market.data.offers.contains(0))

    @sp.add_test()
    def test_pause_blocks_risky_actions_but_allows_refund_cancel():
        scenario = sp.test_scenario("v2_pause_blocks_risky_actions_but_allows_refund_cancel", main)
        admin, seller, buyer, _, nft, wtf, market = _setup()
        scenario += nft
        scenario += wtf
        scenario += market

        token_id = 9
        nft.mint(sp.record(owner=seller.address, token_id=token_id, amount=3))
        wtf.mint(sp.record(owner=buyer.address, token_id=0, amount=1_000))
        nft.set_operator(
            sp.record(owner=seller.address, operator=market.address, token_id=token_id, enabled=True),
            _sender=seller,
        )
        wtf.set_operator(
            sp.record(owner=buyer.address, operator=market.address, token_id=0, enabled=True),
            _sender=buyer,
        )
        market.create_listing(
            sp.record(
                token_contract=nft.address,
                token_id=token_id,
                quantity=3,
                unit_price_wtf=25,
                expiry=sp.cast(None, sp.option[sp.timestamp]),
                royalty_bps=0,
                royalty_recipient=sp.cast(None, sp.option[sp.address]),
            ),
            _sender=seller,
        )
        market.pause(_sender=admin)
        market.buy_listing(
            sp.record(
                listing_id=0,
                quantity=1,
                expected_token=_token(nft, token_id),
                expected_owner=seller.address,
                expected_unit_price_wtf=25,
            ),
            _sender=buyer,
            _valid=False,
        )
        market.cancel_listing(0, _sender=seller)
        scenario.verify(_balance(nft, seller.address, token_id) == 3)

    @sp.add_test()
    def test_two_owners_same_token_id_do_not_collide():
        scenario = sp.test_scenario("v2_two_owners_same_token_id_do_not_collide", main)
        admin = sp.test_account("Admin")
        seller_a = sp.test_account("SellerA")
        seller_b = sp.test_account("SellerB")
        nft = main.MockFA2()
        wtf = main.MockFA2()
        market = main.WTFMarketplaceV2(admin.address, wtf.address, 0, EMPTY_METADATA)
        scenario += nft
        scenario += wtf
        scenario += market

        token_id = 77
        nft.mint(sp.record(owner=seller_a.address, token_id=token_id, amount=2))
        nft.mint(sp.record(owner=seller_b.address, token_id=token_id, amount=2))
        nft.set_operator(
            sp.record(owner=seller_a.address, operator=market.address, token_id=token_id, enabled=True),
            _sender=seller_a,
        )
        nft.set_operator(
            sp.record(owner=seller_b.address, operator=market.address, token_id=token_id, enabled=True),
            _sender=seller_b,
        )
        for seller in [seller_a, seller_b]:
            market.create_listing(
                sp.record(
                    token_contract=nft.address,
                    token_id=token_id,
                    quantity=1,
                    unit_price_wtf=10,
                    expiry=sp.cast(None, sp.option[sp.timestamp]),
                    royalty_bps=0,
                    royalty_recipient=sp.cast(None, sp.option[sp.address]),
                ),
                _sender=seller,
            )
        scenario.verify(market.data.next_listing_id == 2)

    @sp.add_test()
    def test_auction_bid_and_settle_transfers_exact_quantity():
        scenario = sp.test_scenario("v2_auction_bid_and_settle_transfers_exact_quantity", main)
        admin, seller, buyer, _, nft, wtf, market = _setup()
        scenario += nft
        scenario += wtf
        scenario += market

        token_id = 5
        nft.mint(sp.record(owner=seller.address, token_id=token_id, amount=2))
        wtf.mint(sp.record(owner=buyer.address, token_id=0, amount=1_000))
        nft.set_operator(
            sp.record(owner=seller.address, operator=market.address, token_id=token_id, enabled=True),
            _sender=seller,
        )
        wtf.set_operator(
            sp.record(owner=buyer.address, operator=market.address, token_id=0, enabled=True),
            _sender=buyer,
        )

        market.create_auction(
            sp.record(
                token_contract=nft.address,
                token_id=token_id,
                quantity=2,
                reserve_wtf=100,
                min_increment_wtf=5,
                start_time=sp.timestamp(10),
                end_time=sp.timestamp(100),
            ),
            _sender=seller,
            _now=sp.timestamp(9),
        )
        market.bid(
            sp.record(auction_id=0, amount_wtf=100),
            _sender=buyer,
            _now=sp.timestamp(11),
        )
        market.settle_auction(0, _sender=seller, _now=sp.timestamp(101))
        scenario.verify(_balance(wtf, seller.address, 0) == 100)
        scenario.verify(_balance(nft, buyer.address, token_id) == 2)
