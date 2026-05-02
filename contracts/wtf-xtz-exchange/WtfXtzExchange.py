# WtfXtzExchange - SmartPy v0.24.1
#
# One-way WTF -> XTZ exchange backed by per-listing XTZ escrow.
# Takers must pre-authorize this contract as an FA2 operator for the
# configured WTF token id before calling `swap`.

import smartpy as sp


@sp.module
def wtf_xtz_exchange_main():
    import smartpy.stdlib.utils as utils

    TransferTxType: type = sp.record(
        to_=sp.address,
        token_id=sp.nat,
        amount=sp.nat,
    ).layout(("to_", ("token_id", "amount")))
    TransferBatchItemType: type = sp.record(
        from_=sp.address,
        txs=sp.list[TransferTxType],
    ).layout(("from_", "txs"))

    ListingType: type = sp.record(
        listing_id=sp.nat,
        owner=sp.address,
        original_escrow_mutez=sp.mutez,
        remaining_escrow_mutez=sp.mutez,
        rate_numerator_mutez=sp.nat,
        rate_denominator_wtf_units=sp.nat,
        active=sp.bool,
        status_code=sp.nat,
        total_wtf_filled=sp.nat,
        total_xtz_paid_out_mutez=sp.mutez,
        created_at=sp.timestamp,
        closed_at=sp.option[sp.timestamp],
        cancelled_at=sp.option[sp.timestamp],
        cancelled_refund_mutez=sp.mutez,
    )

    CreateListingType: type = sp.record(
        rate_numerator_mutez=sp.nat,
        rate_denominator_wtf_units=sp.nat,
    )

    SwapType: type = sp.record(
        listing_id=sp.nat,
        wtf_amount=sp.nat,
    )

    class WtfXtzExchange(sp.Contract):
        def __init__(
            self,
            admin,
            wtf_token_address,
            wtf_token_id,
            metadata,
        ):
            self.data.admin = admin
            self.data.pending_admin = sp.cast(None, sp.option[sp.address])
            self.data.paused = False
            self.data.wtf_token_address = wtf_token_address
            self.data.wtf_token_id = wtf_token_id
            self.data.next_listing_id = sp.nat(0)
            self.data.listings = sp.cast(sp.big_map(), sp.big_map[sp.nat, ListingType])
            self.data.metadata = metadata

        @sp.entrypoint
        def default(self):
            assert False, "DEFAULT_DISABLED"

        @sp.entrypoint
        def create_listing(self, params):
            sp.cast(params, CreateListingType)
            assert not self.data.paused, "PAUSED"
            assert sp.amount > sp.mutez(0), "ZERO_ESCROW"
            assert params.rate_numerator_mutez > sp.nat(0), "ZERO_RATE_NUMERATOR"
            assert params.rate_denominator_wtf_units > sp.nat(0), "ZERO_RATE_DENOMINATOR"

            listing_id = self.data.next_listing_id
            self.data.listings[listing_id] = sp.record(
                listing_id=listing_id,
                owner=sp.sender,
                original_escrow_mutez=sp.amount,
                remaining_escrow_mutez=sp.amount,
                rate_numerator_mutez=params.rate_numerator_mutez,
                rate_denominator_wtf_units=params.rate_denominator_wtf_units,
                active=True,
                status_code=sp.nat(0),
                total_wtf_filled=sp.nat(0),
                total_xtz_paid_out_mutez=sp.mutez(0),
                created_at=sp.now,
                closed_at=None,
                cancelled_at=None,
                cancelled_refund_mutez=sp.mutez(0),
            )
            self.data.next_listing_id += 1
            sp.emit(
                sp.record(
                    listing_id=listing_id,
                    owner=sp.sender,
                    original_escrow_mutez=sp.amount,
                    rate_numerator_mutez=params.rate_numerator_mutez,
                    rate_denominator_wtf_units=params.rate_denominator_wtf_units,
                ),
                tag="listing_created",
            )

        @sp.entrypoint
        def swap(self, params):
            sp.cast(params, SwapType)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert not self.data.paused, "PAUSED"
            assert params.wtf_amount > sp.nat(0), "ZERO_WTF_AMOUNT"
            assert params.listing_id in self.data.listings, "NO_LISTING"

            listing = self.data.listings[params.listing_id]
            assert listing.active, "LISTING_INACTIVE"
            assert listing.status_code == sp.nat(0), "LISTING_NOT_ACTIVE"

            numerator_product = params.wtf_amount * listing.rate_numerator_mutez
            quotient = sp.fst(
                sp.ediv(numerator_product, listing.rate_denominator_wtf_units).unwrap_some(
                    error="BAD_RATE_DENOMINATOR"
                )
            )
            assert quotient > sp.nat(0), "ROUND_TO_ZERO"
            xtz_out = utils.nat_to_mutez(quotient)
            assert listing.remaining_escrow_mutez >= xtz_out, "INSUFFICIENT_ESCROW"

            tx = sp.record(
                to_=listing.owner,
                token_id=self.data.wtf_token_id,
                amount=params.wtf_amount,
            )
            batch_item = sp.record(from_=sp.sender, txs=[tx])
            transfer_ep = sp.contract(
                sp.list[TransferBatchItemType],
                self.data.wtf_token_address,
                entrypoint="transfer",
            ).unwrap_some(error="FA2_TRANSFER_ENTRYPOINT_MISSING")
            sp.transfer([batch_item], sp.mutez(0), transfer_ep)

            sp.send(sp.sender, xtz_out)

            new_remaining = listing.remaining_escrow_mutez - xtz_out
            listing.remaining_escrow_mutez = new_remaining
            listing.total_wtf_filled += params.wtf_amount
            listing.total_xtz_paid_out_mutez += xtz_out

            if new_remaining == sp.mutez(0):
                listing.active = False
                listing.status_code = sp.nat(1)
                listing.closed_at = sp.Some(sp.now)
                sp.emit(sp.record(listing_id=params.listing_id), tag="listing_exhausted")

            self.data.listings[params.listing_id] = listing
            sp.emit(
                sp.record(
                    listing_id=params.listing_id,
                    taker=sp.sender,
                    owner=listing.owner,
                    wtf_amount=params.wtf_amount,
                    xtz_out=xtz_out,
                    remaining_escrow_mutez=new_remaining,
                    total_wtf_filled=listing.total_wtf_filled,
                ),
                tag="listing_swapped",
            )

        @sp.entrypoint
        def cancel_listing(self, listing_id):
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            sp.cast(listing_id, sp.nat)
            assert listing_id in self.data.listings, "NO_LISTING"

            listing = self.data.listings[listing_id]
            assert listing.owner == sp.sender, "NOT_LISTING_OWNER"
            assert listing.active, "LISTING_INACTIVE"

            refund = listing.remaining_escrow_mutez
            listing.active = False
            listing.status_code = sp.nat(2)
            listing.remaining_escrow_mutez = sp.mutez(0)
            listing.closed_at = sp.Some(sp.now)
            listing.cancelled_at = sp.Some(sp.now)
            listing.cancelled_refund_mutez = refund
            self.data.listings[listing_id] = listing

            if refund > sp.mutez(0):
                sp.send(listing.owner, refund)

            sp.emit(
                sp.record(
                    listing_id=listing_id,
                    owner=listing.owner,
                    refund_mutez=refund,
                ),
                tag="listing_cancelled",
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
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            sp.cast(new_admin, sp.address)
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
        def get_listing(self, listing_id):
            sp.cast(listing_id, sp.nat)
            assert listing_id in self.data.listings, "NO_LISTING"
            return self.data.listings[listing_id]

        @sp.onchain_view()
        def get_remaining_escrow(self, listing_id):
            sp.cast(listing_id, sp.nat)
            assert listing_id in self.data.listings, "NO_LISTING"
            return self.data.listings[listing_id].remaining_escrow_mutez

        @sp.onchain_view()
        def is_paused(self):
            return self.data.paused


main = wtf_xtz_exchange_main


@sp.add_test()
def deploy_exchange_template():
    import os

    scenario = sp.test_scenario("deploy_wtf_xtz_exchange_template", main)
    admin = sp.address(
        os.environ.get(
            "WTF_XTZ_ADMIN",
            "tz1burnburnburnburnburnburnburjAYjjX",
        )
    )
    wtf_token_address = sp.address(
        os.environ.get(
            "WTF_XTZ_TOKEN_ADDRESS",
            "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD",
        )
    )
    wtf_token_id = int(os.environ.get("WTF_XTZ_TOKEN_ID", "0"))
    exchange = main.WtfXtzExchange(
        admin=admin,
        wtf_token_address=wtf_token_address,
        wtf_token_id=sp.nat(wtf_token_id),
        metadata=sp.big_map({"": sp.bytes("0x")}),
    )
    scenario += exchange
