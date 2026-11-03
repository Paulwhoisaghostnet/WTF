"""HORF's inspected horse market, priced exclusively in the HORSE FA2 token.

The same Horf eligibility oracle that gates Stables issues one-use listing
permits only after a HORF MARSHAL has approved the horse asset. The market
cannot inspect Objkt metadata or prove that arbitrary FA2 code moved balances.
"""

import smartpy as sp


@sp.module
def main():
    TokenRef: type = sp.record(token_contract=sp.address, token_id=sp.nat).layout(
        ("token_contract", "token_id")
    )
    Listing: type = sp.record(
        seller=sp.address,
        token_contract=sp.address,
        token_id=sp.nat,
        remaining=sp.nat,
        unit_price_horse=sp.nat,
    ).layout(
        ("seller", ("token_contract", ("token_id", ("remaining", "unit_price_horse"))))
    )
    ListInput: type = sp.record(
        token_contract=sp.address,
        token_id=sp.nat,
        quantity=sp.nat,
        unit_price_horse=sp.nat,
        nonce=sp.bytes,
        signature=sp.signature,
    ).layout(
        (
            "token_contract",
            (
                "token_id",
                ("quantity", ("unit_price_horse", ("nonce", "signature"))),
            ),
        )
    )
    BuyInput: type = sp.record(
        listing_id=sp.nat,
        quantity=sp.nat,
        expected_seller=sp.address,
        expected_token=TokenRef,
        expected_unit_price_horse=sp.nat,
    ).layout(
        (
            "listing_id",
            (
                "quantity",
                ("expected_seller", ("expected_token", "expected_unit_price_horse")),
            ),
        )
    )
    BlacklistInput: type = sp.record(wallet=sp.address, blocked=sp.bool).layout(
        ("wallet", "blocked")
    )
    TokenBlockInput: type = sp.record(
        token_contract=sp.address, token_id=sp.nat, blocked=sp.bool
    ).layout(("token_contract", ("token_id", "blocked")))
    FA2Tx: type = sp.record(to_=sp.address, token_id=sp.nat, amount=sp.nat).layout(
        ("to_", ("token_id", "amount"))
    )
    FA2Batch: type = sp.record(from_=sp.address, txs=sp.list[FA2Tx]).layout(
        ("from_", "txs")
    )
    FA2Transfer: type = sp.record(
        token_contract=sp.address,
        from_=sp.address,
        to_=sp.address,
        token_id=sp.nat,
        amount=sp.nat,
    )
    ListedEvent: type = sp.record(
        listing_id=sp.nat,
        seller=sp.address,
        token_contract=sp.address,
        token_id=sp.nat,
        quantity=sp.nat,
        unit_price_horse=sp.nat,
    ).layout(
        ("listing_id", ("seller", ("token_contract", ("token_id", ("quantity", "unit_price_horse")))))
    )
    BoughtEvent: type = sp.record(
        listing_id=sp.nat,
        seller=sp.address,
        buyer=sp.address,
        token_contract=sp.address,
        token_id=sp.nat,
        quantity=sp.nat,
        total_horse=sp.nat,
    ).layout(
        ("listing_id", ("seller", ("buyer", ("token_contract", ("token_id", ("quantity", "total_horse"))))))
    )
    CancelledEvent: type = sp.record(
        listing_id=sp.nat,
        seller=sp.address,
        token_contract=sp.address,
        token_id=sp.nat,
        quantity=sp.nat,
    ).layout(
        ("listing_id", ("seller", ("token_contract", ("token_id", "quantity"))))
    )

    class HorseMarket(sp.Contract):
        def __init__(self, admin, oracle_key, horse_contract):
            self.data.admin = sp.cast(admin, sp.address)
            self.data.oracle_key = sp.cast(oracle_key, sp.key)
            self.data.oracle_epoch = sp.nat(0)
            self.data.horse_contract = sp.cast(horse_contract, sp.address)
            self.data.next_listing_id = sp.nat(0)
            self.data.listings = sp.cast(sp.big_map(), sp.big_map[sp.nat, Listing])
            self.data.used_permits = sp.cast(sp.big_map(), sp.big_map[sp.bytes, sp.unit])
            self.data.blacklisted = sp.cast(sp.big_map(), sp.big_map[sp.address, sp.bool])
            self.data.blocked_tokens = sp.cast(sp.big_map(), sp.big_map[TokenRef, sp.bool])

        @sp.private(with_storage="read-only", with_operations=True)
        def transfer_fa2(self, params):
            sp.cast(params, FA2Transfer)
            transfer_ep = sp.contract(
                sp.list[FA2Batch], params.token_contract, entrypoint="transfer"
            ).unwrap_some(error="FA2_TRANSFER_MISSING")
            sp.transfer(
                [
                    sp.record(
                        from_=params.from_,
                        txs=[
                            sp.record(
                                to_=params.to_,
                                token_id=params.token_id,
                                amount=params.amount,
                            )
                        ],
                    )
                ],
                sp.mutez(0),
                transfer_ep,
            )

        @sp.entrypoint
        def default(self):
            raise "DEFAULT_DISABLED"

        @sp.entrypoint
        def set_oracle_key(self, new_key):
            sp.cast(new_key, sp.key)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.oracle_key = new_key
            self.data.oracle_epoch += 1
            sp.emit(self.data.oracle_epoch, tag="horse_market_oracle_rotated")

        @sp.entrypoint
        def bump_oracle_epoch(self):
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.oracle_epoch += 1
            sp.emit(self.data.oracle_epoch, tag="horse_market_oracle_epoch_bumped")

        @sp.entrypoint
        def set_blacklisted(self, params):
            sp.cast(params, BlacklistInput)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.blacklisted[params.wallet] = params.blocked
            sp.emit(params, tag="horse_market_blacklist_updated")

        @sp.entrypoint
        def set_token_blocked(self, params):
            sp.cast(params, TokenBlockInput)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            key = sp.record(token_contract=params.token_contract, token_id=params.token_id)
            self.data.blocked_tokens[key] = params.blocked
            sp.emit(params, tag="horse_market_token_blocked")

        @sp.entrypoint
        def create_listing(self, params):
            sp.cast(params, ListInput)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert not self.data.blacklisted.get(sp.sender, default=False), "TRADER_BLACKLISTED"
            assert params.quantity > 0, "ZERO_QUANTITY"
            assert params.unit_price_horse > 0, "ZERO_PRICE"
            assert params.token_contract != self.data.horse_contract, "HORSE_NOT_HORSE"
            token_key = sp.record(token_contract=params.token_contract, token_id=params.token_id)
            assert not self.data.blocked_tokens.get(token_key, default=False), "TOKEN_BLOCKED"
            assert sp.len(params.nonce) == 32, "BAD_NONCE"
            assert not params.nonce in self.data.used_permits, "PERMIT_USED"
            # The service signs this exact nested pair only after an active
            # Marshal inspection and the Horf horse eligibility check.
            permit_payload = (
                sp.chain_id,
                (
                    sp.self_address,
                    (
                        sp.sender,
                        (
                            params.token_contract,
                            (
                                params.token_id,
                                (
                                    params.quantity,
                                    (
                                        params.unit_price_horse,
                                        (params.nonce, self.data.oracle_epoch),
                                    ),
                                ),
                            ),
                        ),
                    ),
                ),
            )
            assert sp.check_signature(
                self.data.oracle_key, params.signature, sp.pack(permit_payload)
            ), "BAD_INSPECTION_PERMIT"
            self.data.used_permits[params.nonce] = ()

            listing_id = self.data.next_listing_id
            self.data.next_listing_id += 1
            self.data.listings[listing_id] = sp.record(
                seller=sp.sender,
                token_contract=params.token_contract,
                token_id=params.token_id,
                remaining=params.quantity,
                unit_price_horse=params.unit_price_horse,
            )
            self.transfer_fa2(
                sp.record(
                    token_contract=params.token_contract,
                    from_=sp.sender,
                    to_=sp.self_address,
                    token_id=params.token_id,
                    amount=params.quantity,
                )
            )
            sp.emit(
                sp.cast(
                    sp.record(
                        listing_id=listing_id,
                        seller=sp.sender,
                        token_contract=params.token_contract,
                        token_id=params.token_id,
                        quantity=params.quantity,
                        unit_price_horse=params.unit_price_horse,
                    ),
                    ListedEvent,
                ),
                tag="horse_market_listed",
            )

        @sp.entrypoint
        def buy_listing(self, params):
            sp.cast(params, BuyInput)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert not self.data.blacklisted.get(sp.sender, default=False), "TRADER_BLACKLISTED"
            assert params.quantity > 0, "ZERO_QUANTITY"
            assert params.listing_id in self.data.listings, "NO_LISTING"
            listing = self.data.listings[params.listing_id]
            assert not self.data.blacklisted.get(listing.seller, default=False), "SELLER_BLACKLISTED"
            assert sp.sender != listing.seller, "SELF_BUY"
            assert params.expected_seller == listing.seller, "SELLER_CHANGED"
            assert params.expected_token.token_contract == listing.token_contract, "TOKEN_CHANGED"
            assert params.expected_token.token_id == listing.token_id, "TOKEN_CHANGED"
            assert params.expected_unit_price_horse == listing.unit_price_horse, "PRICE_CHANGED"
            assert params.quantity <= listing.remaining, "QUANTITY_TOO_HIGH"
            token_key = sp.record(token_contract=listing.token_contract, token_id=listing.token_id)
            assert not self.data.blocked_tokens.get(token_key, default=False), "TOKEN_BLOCKED"

            total_horse = params.quantity * listing.unit_price_horse
            listing.remaining = sp.as_nat(listing.remaining - params.quantity)
            if listing.remaining == 0:
                del self.data.listings[params.listing_id]
            else:
                self.data.listings[params.listing_id] = listing
            self.transfer_fa2(
                sp.record(
                    token_contract=self.data.horse_contract,
                    from_=sp.sender,
                    to_=listing.seller,
                    token_id=0,
                    amount=total_horse,
                )
            )
            self.transfer_fa2(
                sp.record(
                    token_contract=listing.token_contract,
                    from_=sp.self_address,
                    to_=sp.sender,
                    token_id=listing.token_id,
                    amount=params.quantity,
                )
            )
            sp.emit(
                sp.cast(
                    sp.record(
                        listing_id=params.listing_id,
                        seller=listing.seller,
                        buyer=sp.sender,
                        token_contract=listing.token_contract,
                        token_id=listing.token_id,
                        quantity=params.quantity,
                        total_horse=total_horse,
                    ),
                    BoughtEvent,
                ),
                tag="horse_market_bought",
            )

        @sp.entrypoint
        def cancel_listing(self, listing_id):
            sp.cast(listing_id, sp.nat)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert listing_id in self.data.listings, "NO_LISTING"
            listing = self.data.listings[listing_id]
            assert sp.sender == listing.seller or sp.sender == self.data.admin, "NOT_AUTHORIZED"
            del self.data.listings[listing_id]
            self.transfer_fa2(
                sp.record(
                    token_contract=listing.token_contract,
                    from_=sp.self_address,
                    to_=listing.seller,
                    token_id=listing.token_id,
                    amount=listing.remaining,
                )
            )
            sp.emit(
                sp.cast(
                    sp.record(
                        listing_id=listing_id,
                        seller=listing.seller,
                        token_contract=listing.token_contract,
                        token_id=listing.token_id,
                        quantity=listing.remaining,
                    ),
                    CancelledEvent,
                ),
                tag="horse_market_cancelled",
            )

        @sp.onchain_view()
        def get_listing(self, listing_id):
            sp.cast(listing_id, sp.nat)
            return self.data.listings.get_opt(listing_id)


@sp.add_test()
def deploy_horf_horse_market_template():
    scenario = sp.test_scenario("deploy_horf_horse_market_template", main)
    scenario.add_flag("protocol", "tallinn")
    admin = sp.test_account("Horf market template administrator")
    oracle = sp.test_account("Horf market template inspection oracle")
    scenario += main.HorseMarket(
        admin.address,
        oracle.public_key,
        sp.address("KT1E9s2ncE5vXjofmzqwE6gEg9JPruTRBdrM"),
    )
