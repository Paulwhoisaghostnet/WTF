"""Horf's three Tezos L1 FA2 horse-trading stables.

The contract cannot read Objkt metadata. A Horf eligibility oracle signs a
single-use permit for each deposit after checking the token off-chain. The
signature is bound to this contract, chain, depositor, stable, token, amount,
nonce, and oracle epoch. No administrator can withdraw deposited tokens.
"""

import smartpy as sp


@sp.module
def main():
    TokenKey: type = sp.record(token_contract=sp.address, token_id=sp.nat).layout(
        ("token_contract", "token_id")
    )
    GroupClaimKey: type = sp.record(
        claimant=sp.address, token_contract=sp.address, token_id=sp.nat
    ).layout(("claimant", ("token_contract", "token_id")))
    GroupContributionKey: type = sp.record(
        owner=sp.address, token_contract=sp.address, token_id=sp.nat
    ).layout(("owner", ("token_contract", "token_id")))
    GroupContribution: type = sp.record(
        active=sp.nat, ever_claimed=sp.bool
    ).layout(("active", "ever_claimed"))
    Listing: type = sp.record(
        owner=sp.address,
        mode=sp.nat,
        token_contract=sp.address,
        token_id=sp.nat,
        submitted=sp.nat,
        remaining=sp.nat,
    ).layout(
        (
            "owner",
            (
                "mode",
                ("token_contract", ("token_id", ("submitted", "remaining"))),
            ),
        )
    )
    Deposit: type = sp.record(
        mode=sp.nat,
        token_contract=sp.address,
        token_id=sp.nat,
        amount=sp.nat,
        nonce=sp.bytes,
        signature=sp.signature,
    ).layout(
        (
            "mode",
            (
                "token_contract",
                ("token_id", ("amount", ("nonce", "signature"))),
            ),
        )
    )
    Cancel: type = sp.record(listing_id=sp.nat, amount=sp.nat).layout(
        ("listing_id", "amount")
    )
    BlacklistUpdate: type = sp.record(wallet=sp.address, blocked=sp.bool).layout(
        ("wallet", "blocked")
    )
    FA2Tx: type = sp.record(to_=sp.address, token_id=sp.nat, amount=sp.nat).layout(
        ("to_", ("token_id", "amount"))
    )
    FA2Batch: type = sp.record(from_=sp.address, txs=sp.list[FA2Tx]).layout(
        ("from_", "txs")
    )
    TransferInput: type = sp.record(
        token_contract=sp.address,
        from_=sp.address,
        to_=sp.address,
        token_id=sp.nat,
        amount=sp.nat,
    )
    DepositedEvent: type = sp.record(
        listing_id=sp.nat, owner=sp.address, mode=sp.nat,
        token_contract=sp.address, token_id=sp.nat, amount=sp.nat,
    ).layout(("listing_id", ("owner", ("mode", ("token_contract", ("token_id", "amount"))))))
    ClaimedEvent: type = sp.record(
        listing_id=sp.nat, claimant=sp.address, owner=sp.address, mode=sp.nat,
        token_contract=sp.address, token_id=sp.nat,
    ).layout(("listing_id", ("claimant", ("owner", ("mode", ("token_contract", "token_id"))))))
    CancelledEvent: type = sp.record(
        listing_id=sp.nat, owner=sp.address, mode=sp.nat, amount=sp.nat,
    ).layout(("listing_id", ("owner", ("mode", "amount"))))

    class HorfStables(sp.Contract):
        def __init__(self, admin, oracle_key):
            self.data.admin = sp.cast(admin, sp.address)
            self.data.oracle_key = sp.cast(oracle_key, sp.key)
            self.data.oracle_epoch = sp.nat(0)
            self.data.next_listing_id = sp.nat(0)
            self.data.used_permits = sp.cast(sp.big_map(), sp.big_map[sp.bytes, sp.unit])
            self.data.listings = sp.cast(sp.big_map(), sp.big_map[sp.nat, Listing])
            self.data.reciprocal_credits = sp.cast(
                sp.big_map(), sp.big_map[sp.address, sp.nat]
            )
            self.data.group_credits = sp.cast(
                sp.big_map(), sp.big_map[sp.address, sp.nat]
            )
            self.data.group_claimed = sp.cast(
                sp.big_map(), sp.big_map[GroupClaimKey, sp.unit]
            )
            self.data.group_contributions = sp.cast(
                sp.big_map(), sp.big_map[GroupContributionKey, GroupContribution]
            )
            self.data.blacklisted = sp.cast(
                sp.big_map(), sp.big_map[sp.address, sp.bool]
            )

        @sp.private(with_storage="read-only", with_operations=True)
        def transfer_fa2(self, params):
            sp.cast(params, TransferInput)
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
            sp.emit(sp.record(epoch=self.data.oracle_epoch), tag="oracle_rotated")

        @sp.entrypoint
        def bump_oracle_epoch(self):
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.oracle_epoch += 1
            sp.emit(sp.record(epoch=self.data.oracle_epoch), tag="oracle_epoch_bumped")

        @sp.entrypoint
        def set_blacklisted(self, params):
            sp.cast(params, BlacklistUpdate)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.blacklisted[params.wallet] = params.blocked
            sp.emit(params, tag="trader_blacklist_updated")

        @sp.entrypoint
        def deposit(self, params):
            sp.cast(params, Deposit)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert not self.data.blacklisted.get(sp.sender, default=False), "TRADER_BLACKLISTED"
            assert params.mode <= 2, "UNKNOWN_STABLE"
            assert params.amount > 0, "ZERO_DEPOSIT"
            assert sp.len(params.nonce) == 32, "BAD_NONCE"
            assert not params.nonce in self.data.used_permits, "PERMIT_USED"
            # Nested pairs make the PACK type independent of record field order.
            # The service must sign exactly this Micheline shape, without a
            # manager-operation watermark.
            permit_payload = (
                sp.chain_id,
                (
                    sp.self_address,
                    (
                        sp.sender,
                        (
                            params.mode,
                            (
                                params.token_contract,
                                (
                                    params.token_id,
                                    (
                                        params.amount,
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
            ), "BAD_ELIGIBILITY_PERMIT"
            self.data.used_permits[params.nonce] = ()

            listing_id = self.data.next_listing_id
            self.data.next_listing_id += 1
            self.data.listings[listing_id] = sp.record(
                owner=sp.sender,
                mode=params.mode,
                token_contract=params.token_contract,
                token_id=params.token_id,
                submitted=params.amount,
                remaining=params.amount,
            )
            if params.mode == 0:
                self.data.reciprocal_credits[sp.sender] = (
                    self.data.reciprocal_credits.get(sp.sender, default=sp.nat(0))
                    + params.amount
                )
            if params.mode == 2:
                contribution_key = sp.record(
                    owner=sp.sender,
                    token_contract=params.token_contract,
                    token_id=params.token_id,
                )
                if contribution_key in self.data.group_contributions:
                    contribution = self.data.group_contributions[contribution_key]
                    contribution.active += params.amount
                    self.data.group_contributions[contribution_key] = contribution
                else:
                    self.data.group_contributions[contribution_key] = sp.record(
                        active=params.amount, ever_claimed=False
                    )
                    self.data.group_credits[sp.sender] = (
                        self.data.group_credits.get(sp.sender, default=sp.nat(0)) + 30
                    )
            self.transfer_fa2(
                sp.record(
                    token_contract=params.token_contract,
                    from_=sp.sender,
                    to_=sp.self_address,
                    token_id=params.token_id,
                    amount=params.amount,
                )
            )
            sp.emit(
                sp.cast(sp.record(
                    listing_id=listing_id,
                    owner=sp.sender,
                    mode=params.mode,
                    token_contract=params.token_contract,
                    token_id=params.token_id,
                    amount=params.amount,
                ), DepositedEvent),
                tag="horse_deposited",
            )

        @sp.entrypoint
        def claim(self, listing_id):
            sp.cast(listing_id, sp.nat)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert not self.data.blacklisted.get(sp.sender, default=False), "TRADER_BLACKLISTED"
            assert listing_id in self.data.listings, "NO_LISTING"
            listing = self.data.listings[listing_id]
            assert listing.remaining > 0, "LISTING_EMPTY"
            assert sp.sender != listing.owner, "OWN_LISTING"
            if listing.mode == 0:
                credit = self.data.reciprocal_credits.get(
                    sp.sender, default=sp.nat(0)
                )
                assert credit > 0, "RECIPROCAL_DEPOSIT_REQUIRED"
                self.data.reciprocal_credits[sp.sender] = sp.as_nat(credit - 1)
            if listing.mode == 2:
                credit = self.data.group_credits.get(sp.sender, default=sp.nat(0))
                assert credit > 0, "GROUP_DEPOSIT_REQUIRED"
                claim_key = sp.record(
                    claimant=sp.sender,
                    token_contract=listing.token_contract,
                    token_id=listing.token_id,
                )
                assert not claim_key in self.data.group_claimed, "GROUP_TOKEN_ALREADY_CLAIMED"
                self.data.group_claimed[claim_key] = ()
                self.data.group_credits[sp.sender] = sp.as_nat(credit - 1)
                contribution_key = sp.record(
                    owner=listing.owner,
                    token_contract=listing.token_contract,
                    token_id=listing.token_id,
                )
                contribution = self.data.group_contributions[contribution_key]
                assert contribution.active > 0, "GROUP_CONTRIBUTION_EMPTY"
                contribution.active = sp.as_nat(contribution.active - 1)
                contribution.ever_claimed = True
                self.data.group_contributions[contribution_key] = contribution
            listing.remaining = sp.as_nat(listing.remaining - 1)
            self.data.listings[listing_id] = listing
            self.transfer_fa2(
                sp.record(
                    token_contract=listing.token_contract,
                    from_=sp.self_address,
                    to_=sp.sender,
                    token_id=listing.token_id,
                    amount=1,
                )
            )
            sp.emit(
                sp.cast(sp.record(
                    listing_id=listing_id,
                    claimant=sp.sender,
                    owner=listing.owner,
                    mode=listing.mode,
                    token_contract=listing.token_contract,
                    token_id=listing.token_id,
                ), ClaimedEvent),
                tag="horse_claimed",
            )

        @sp.entrypoint
        def cancel(self, params):
            sp.cast(params, Cancel)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert params.listing_id in self.data.listings, "NO_LISTING"
            assert params.amount > 0, "ZERO_CANCEL"
            listing = self.data.listings[params.listing_id]
            assert sp.sender == listing.owner, "NOT_LISTING_OWNER"
            assert listing.remaining >= params.amount, "INSUFFICIENT_REMAINING"
            if listing.mode == 0:
                credit = self.data.reciprocal_credits.get(
                    sp.sender, default=sp.nat(0)
                )
                assert credit >= params.amount, "CREDITS_ALREADY_SPENT"
                self.data.reciprocal_credits[sp.sender] = sp.as_nat(
                    credit - params.amount
                )
            if listing.mode == 2:
                contribution_key = sp.record(
                    owner=sp.sender,
                    token_contract=listing.token_contract,
                    token_id=listing.token_id,
                )
                contribution = self.data.group_contributions[contribution_key]
                assert contribution.active >= params.amount, "GROUP_CONTRIBUTION_EMPTY"
                contribution.active = sp.as_nat(contribution.active - params.amount)
                if contribution.active == 0 and not contribution.ever_claimed:
                    credit = self.data.group_credits.get(sp.sender, default=sp.nat(0))
                    assert credit >= 30, "CREDITS_ALREADY_SPENT"
                    self.data.group_credits[sp.sender] = sp.as_nat(credit - 30)
                    del self.data.group_contributions[contribution_key]
                else:
                    self.data.group_contributions[contribution_key] = contribution
            listing.remaining = sp.as_nat(listing.remaining - params.amount)
            self.data.listings[params.listing_id] = listing
            self.transfer_fa2(
                sp.record(
                    token_contract=listing.token_contract,
                    from_=sp.self_address,
                    to_=sp.sender,
                    token_id=listing.token_id,
                    amount=params.amount,
                )
            )
            sp.emit(
                sp.cast(sp.record(
                    listing_id=params.listing_id,
                    owner=sp.sender,
                    mode=listing.mode,
                    amount=params.amount,
                ), CancelledEvent),
                tag="horse_cancelled",
            )

        @sp.onchain_view()
        def get_listing(self, listing_id):
            sp.cast(listing_id, sp.nat)
            return self.data.listings.get_opt(listing_id)

        @sp.onchain_view()
        def get_credits(self, trader):
            sp.cast(trader, sp.address)
            return sp.record(
                reciprocal=self.data.reciprocal_credits.get(
                    trader, default=sp.nat(0)
                ),
                group=self.data.group_credits.get(trader, default=sp.nat(0)),
            )

        @sp.onchain_view()
        def has_claimed_group(self, params):
            sp.cast(params, GroupClaimKey)
            return params in self.data.group_claimed

        @sp.onchain_view()
        def is_blacklisted(self, wallet):
            sp.cast(wallet, sp.address)
            return self.data.blacklisted.get(wallet, default=False)


@sp.add_test()
def deploy_horf_stables_template():
    scenario = sp.test_scenario("deploy_horf_stables_template", main)
    scenario.add_flag("protocol", "tallinn")
    administrator = sp.test_account("Horf template administrator")
    oracle = sp.test_account("Horf template eligibility oracle")
    scenario += main.HorfStables(administrator.address, oracle.public_key)
