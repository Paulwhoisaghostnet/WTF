"""HORF V3: inspected reciprocal/honor pools and trust-zone Outlaw swaps.

Objkt mint tags and Marshal approvals are checked by the off-chain eligibility
oracle. An Outlaw swap is automatic after a one-use horse permit, but the
uninspected input FA2 may still lie about its transfer. Its listing creator
accepts that trust-zone risk by depositing into the Outlaw room.
"""

import smartpy as sp


@sp.module
def main():
    TokenClaimKey: type = sp.record(
        claimant=sp.address, token_contract=sp.address, token_id=sp.nat
    ).layout(("claimant", ("token_contract", "token_id")))
    Listing: type = sp.record(
        owner=sp.address, mode=sp.nat, token_contract=sp.address,
        token_id=sp.nat, submitted=sp.nat, remaining=sp.nat,
    ).layout(("owner", ("mode", ("token_contract", ("token_id", ("submitted", "remaining"))))))
    Deposit: type = sp.record(
        mode=sp.nat, token_contract=sp.address, token_id=sp.nat,
        amount=sp.nat, nonce=sp.bytes, signature=sp.signature,
    ).layout(("mode", ("token_contract", ("token_id", ("amount", ("nonce", "signature"))))))
    PrivateTerms: type = sp.record(
        offerer=sp.address, input_token_contract=sp.address, input_token_id=sp.nat,
    ).layout(("offerer", ("input_token_contract", "input_token_id")))
    CreatePrivateOffer: type = sp.record(
        token_contract=sp.address, token_id=sp.nat, offerer=sp.address,
        input_token_contract=sp.address, input_token_id=sp.nat,
        nonce=sp.bytes, signature=sp.signature,
    ).layout(("token_contract", ("token_id", ("offerer", (
        "input_token_contract", ("input_token_id", ("nonce", "signature")))))))
    PermitCheck: type = sp.record(
        action=sp.nat, mode=sp.nat, listing_id=sp.nat,
        token_contract=sp.address, token_id=sp.nat, amount=sp.nat,
        nonce=sp.bytes, signature=sp.signature,
    )
    Claim: type = sp.record(listing_id=sp.nat, completion_nonce=sp.bytes).layout(
        ("listing_id", "completion_nonce")
    )
    OutlawSwap: type = sp.record(
        listing_id=sp.nat, input_token_contract=sp.address,
        input_token_id=sp.nat, permit_nonce=sp.bytes,
        signature=sp.signature, completion_nonce=sp.bytes,
    ).layout(("listing_id", ("input_token_contract", ("input_token_id", (
        "permit_nonce", ("signature", "completion_nonce"))))))
    FulfillPrivateOffer: type = sp.record(
        listing_id=sp.nat, permit_nonce=sp.bytes,
        signature=sp.signature, completion_nonce=sp.bytes,
    ).layout(("listing_id", ("permit_nonce", ("signature", "completion_nonce"))))
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
        token_contract=sp.address, from_=sp.address, to_=sp.address,
        token_id=sp.nat, amount=sp.nat,
    )
    BalanceRequest: type = sp.record(owner=sp.address, token_id=sp.nat).layout(
        ("owner", "token_id")
    )
    BalanceResponse: type = sp.record(request=BalanceRequest, balance=sp.nat).layout(
        ("request", "balance")
    )
    BalanceOf: type = sp.record(
        requests=sp.list[BalanceRequest], callback=sp.contract[sp.list[BalanceResponse]],
    ).layout(("requests", "callback"))
    Pending: type = sp.record(
        kind=sp.nat, listing_id=sp.nat, recipient=sp.address,
        input_token_contract=sp.address, input_token_id=sp.nat,
        nonce=sp.bytes, level=sp.nat,
    )
    DepositedEvent: type = sp.record(
        listing_id=sp.nat, owner=sp.address, mode=sp.nat,
        token_contract=sp.address, token_id=sp.nat, amount=sp.nat,
    ).layout(("listing_id", ("owner", ("mode", ("token_contract", ("token_id", "amount"))))))
    ClaimedEvent: type = sp.record(
        listing_id=sp.nat, claimant=sp.address, owner=sp.address, mode=sp.nat,
        token_contract=sp.address, token_id=sp.nat,
    ).layout(("listing_id", ("claimant", ("owner", ("mode", ("token_contract", "token_id"))))))
    SwappedEvent: type = sp.record(
        listing_id=sp.nat, claimant=sp.address, owner=sp.address,
        output_contract=sp.address, output_id=sp.nat,
        input_contract=sp.address, input_id=sp.nat,
    ).layout(("listing_id", ("claimant", ("owner", ("output_contract", (
        "output_id", ("input_contract", "input_id")))))))
    PrivateOfferEvent: type = sp.record(
        listing_id=sp.nat, owner=sp.address, offerer=sp.address,
        output_contract=sp.address, output_id=sp.nat,
        input_contract=sp.address, input_id=sp.nat,
    ).layout(("listing_id", ("owner", ("offerer", ("output_contract", (
        "output_id", ("input_contract", "input_id")))))))
    CancelledEvent: type = sp.record(
        listing_id=sp.nat, owner=sp.address, mode=sp.nat, amount=sp.nat,
    ).layout(("listing_id", ("owner", ("mode", "amount"))))

    class HorfRoomsV3(sp.Contract):
        def __init__(self, admin, oracle_key):
            self.data.admin = sp.cast(admin, sp.address)
            self.data.oracle_key = sp.cast(oracle_key, sp.key)
            self.data.oracle_epoch = sp.nat(0)
            self.data.next_listing_id = sp.nat(0)
            self.data.used_permits = sp.cast(sp.big_map(), sp.big_map[sp.bytes, sp.unit])
            self.data.listings = sp.cast(sp.big_map(), sp.big_map[sp.nat, Listing])
            self.data.private_terms = sp.cast(sp.big_map(), sp.big_map[sp.nat, PrivateTerms])
            self.data.reciprocal_credits = sp.cast(sp.big_map(), sp.big_map[sp.address, sp.nat])
            self.data.claimed_tokens = sp.cast(sp.big_map(), sp.big_map[TokenClaimKey, sp.unit])
            self.data.pending = sp.cast(sp.big_map(), sp.big_map[sp.address, Pending])
            self.data.last_completion = sp.cast(sp.big_map(), sp.big_map[sp.address, sp.bytes])
            self.data.blacklisted = sp.cast(sp.big_map(), sp.big_map[sp.address, sp.bool])

        @sp.private(with_storage="read-write")
        def verify_permit(self, params):
            sp.cast(params, PermitCheck)
            assert sp.len(params.nonce) == 32, "BAD_PERMIT_NONCE"
            assert not params.nonce in self.data.used_permits, "PERMIT_USED"
            payload = (
                sp.chain_id,
                (sp.self_address,
                 (sp.sender,
                  (params.action,
                   (params.mode,
                    (params.listing_id,
                     (params.token_contract,
                      (params.token_id,
                       (params.amount,
                        (params.nonce, self.data.oracle_epoch))))))))),
            )
            assert sp.check_signature(self.data.oracle_key, params.signature, sp.pack(payload)), "BAD_ELIGIBILITY_PERMIT"
            self.data.used_permits[params.nonce] = ()

        @sp.private(with_storage="read-only", with_operations=True)
        def transfer_fa2(self, params):
            sp.cast(params, TransferInput)
            transfer_ep = sp.contract(
                sp.list[FA2Batch], params.token_contract, entrypoint="transfer"
            ).unwrap_some(error="FA2_TRANSFER_MISSING")
            sp.transfer([
                sp.record(from_=params.from_, txs=[
                    sp.record(to_=params.to_, token_id=params.token_id, amount=params.amount)
                ])
            ], sp.mutez(0), transfer_ep)

        @sp.private(with_storage="read-only", with_operations=True)
        def ask_balance(self, params):
            sp.cast(params, sp.record(token_contract=sp.address, owner=sp.address, token_id=sp.nat))
            balance_ep = sp.contract(
                BalanceOf, params.token_contract, entrypoint="balance_of"
            ).unwrap_some(error="FA2_BALANCE_OF_MISSING")
            sp.transfer(sp.record(
                requests=[sp.record(owner=params.owner, token_id=params.token_id)],
                callback=sp.contract(sp.list[BalanceResponse], sp.self_address,
                    entrypoint="on_balance").unwrap_some(),
            ), sp.mutez(0), balance_ep)

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
            assert params.mode <= 2, "UNKNOWN_ROOM"
            assert params.amount > 0, "ZERO_DEPOSIT"
            self.verify_permit(sp.record(
                action=sp.nat(0), mode=params.mode, listing_id=sp.nat(0),
                token_contract=params.token_contract, token_id=params.token_id,
                amount=params.amount, nonce=params.nonce, signature=params.signature,
            ))
            listing_id = self.data.next_listing_id
            self.data.next_listing_id += 1
            self.data.listings[listing_id] = sp.record(
                owner=sp.sender, mode=params.mode, token_contract=params.token_contract,
                token_id=params.token_id, submitted=params.amount, remaining=params.amount,
            )
            if params.mode == 0:
                self.data.reciprocal_credits[sp.sender] = (
                    self.data.reciprocal_credits.get(sp.sender, default=sp.nat(0)) + params.amount
                )
            self.transfer_fa2(sp.record(
                token_contract=params.token_contract, from_=sp.sender,
                to_=sp.self_address, token_id=params.token_id, amount=params.amount,
            ))
            sp.emit(sp.cast(sp.record(
                listing_id=listing_id, owner=sp.sender, mode=params.mode,
                token_contract=params.token_contract, token_id=params.token_id,
                amount=params.amount,
            ), DepositedEvent), tag="horse_deposited")

        @sp.entrypoint
        def create_private_offer(self, params):
            sp.cast(params, CreatePrivateOffer)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert not self.data.blacklisted.get(sp.sender, default=False), "TRADER_BLACKLISTED"
            assert not self.data.blacklisted.get(params.offerer, default=False), "OFFERER_BLACKLISTED"
            assert params.offerer != sp.sender, "OWN_OFFER"
            assert params.input_token_contract != params.token_contract or params.input_token_id != params.token_id, "SAME_HORSE"
            self.verify_permit(sp.record(
                action=sp.nat(0), mode=sp.nat(3), listing_id=sp.nat(0),
                token_contract=params.token_contract, token_id=params.token_id,
                amount=sp.nat(1), nonce=params.nonce, signature=params.signature,
            ))
            listing_id = self.data.next_listing_id
            self.data.next_listing_id += 1
            self.data.listings[listing_id] = sp.record(
                owner=sp.sender, mode=sp.nat(3), token_contract=params.token_contract,
                token_id=params.token_id, submitted=sp.nat(1), remaining=sp.nat(1),
            )
            self.data.private_terms[listing_id] = sp.record(
                offerer=params.offerer, input_token_contract=params.input_token_contract,
                input_token_id=params.input_token_id,
            )
            self.transfer_fa2(sp.record(
                token_contract=params.token_contract, from_=sp.sender,
                to_=sp.self_address, token_id=params.token_id, amount=sp.nat(1),
            ))
            sp.emit(sp.cast(sp.record(
                listing_id=listing_id, owner=sp.sender, offerer=params.offerer,
                output_contract=params.token_contract, output_id=params.token_id,
                input_contract=params.input_token_contract, input_id=params.input_token_id,
            ), PrivateOfferEvent), tag="private_offer_escrowed")

        @sp.entrypoint
        def claim(self, params):
            sp.cast(params, Claim)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert sp.sender == sp.source, "DIRECT_WALLET_REQUIRED"
            assert not self.data.blacklisted.get(sp.sender, default=False), "TRADER_BLACKLISTED"
            assert params.listing_id in self.data.listings, "NO_LISTING"
            listing = self.data.listings[params.listing_id]
            assert listing.mode <= 1, "USE_OUTLAW_SWAP"
            assert listing.remaining > 0, "LISTING_EMPTY"
            assert listing.owner != sp.sender, "OWN_LISTING"
            if listing.mode == 0:
                assert self.data.reciprocal_credits.get(sp.sender, default=sp.nat(0)) > 0, "RECIPROCAL_DEPOSIT_REQUIRED"
            assert sp.len(params.completion_nonce) == 32, "BAD_COMPLETION_NONCE"
            assert params.completion_nonce != self.data.last_completion.get(sp.sender, default=sp.bytes("0x")), "COMPLETION_NONCE_REUSED"
            assert not sp.sender in self.data.pending, "PENDING_CHECK_EXISTS"
            claim_key = sp.record(claimant=sp.sender, token_contract=listing.token_contract, token_id=listing.token_id)
            assert not claim_key in self.data.claimed_tokens, "HORSE_ALREADY_CLAIMED"
            self.data.pending[sp.sender] = sp.record(
                kind=sp.nat(0), listing_id=params.listing_id, recipient=sp.sender,
                input_token_contract=sp.self_address, input_token_id=sp.nat(0),
                nonce=params.completion_nonce, level=sp.level,
            )
            self.ask_balance(sp.record(
                token_contract=listing.token_contract, owner=sp.sender, token_id=listing.token_id,
            ))

        @sp.entrypoint
        def swap_outlaw(self, params):
            sp.cast(params, OutlawSwap)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert sp.sender == sp.source, "DIRECT_WALLET_REQUIRED"
            assert not self.data.blacklisted.get(sp.sender, default=False), "TRADER_BLACKLISTED"
            assert params.listing_id in self.data.listings, "NO_LISTING"
            listing = self.data.listings[params.listing_id]
            assert listing.mode == 2, "NOT_OUTLAW_ROOM"
            assert listing.remaining > 0, "LISTING_EMPTY"
            assert listing.owner != sp.sender, "OWN_LISTING"
            assert not self.data.blacklisted.get(listing.owner, default=False), "CREATOR_BLACKLISTED"
            assert params.input_token_contract != listing.token_contract or params.input_token_id != listing.token_id, "SAME_HORSE"
            assert sp.len(params.completion_nonce) == 32, "BAD_COMPLETION_NONCE"
            assert params.completion_nonce != self.data.last_completion.get(sp.sender, default=sp.bytes("0x")), "COMPLETION_NONCE_REUSED"
            assert not sp.sender in self.data.pending, "PENDING_CHECK_EXISTS"
            claim_key = sp.record(claimant=sp.sender, token_contract=listing.token_contract, token_id=listing.token_id)
            assert not claim_key in self.data.claimed_tokens, "HORSE_ALREADY_CLAIMED"
            self.verify_permit(sp.record(
                action=sp.nat(1), mode=sp.nat(2), listing_id=params.listing_id,
                token_contract=params.input_token_contract, token_id=params.input_token_id,
                amount=sp.nat(1), nonce=params.permit_nonce, signature=params.signature,
            ))
            self.data.pending[sp.sender] = sp.record(
                kind=sp.nat(1), listing_id=params.listing_id, recipient=sp.sender,
                input_token_contract=params.input_token_contract,
                input_token_id=params.input_token_id,
                nonce=params.completion_nonce, level=sp.level,
            )
            self.ask_balance(sp.record(
                token_contract=listing.token_contract, owner=sp.sender, token_id=listing.token_id,
            ))

        @sp.entrypoint
        def fulfill_private_offer(self, params):
            sp.cast(params, FulfillPrivateOffer)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert sp.sender == sp.source, "DIRECT_WALLET_REQUIRED"
            assert not self.data.blacklisted.get(sp.sender, default=False), "TRADER_BLACKLISTED"
            assert params.listing_id in self.data.listings, "NO_LISTING"
            listing = self.data.listings[params.listing_id]
            assert listing.mode == 3, "NOT_PRIVATE_OFFER"
            assert listing.remaining == 1, "LISTING_EMPTY"
            assert not self.data.blacklisted.get(listing.owner, default=False), "CREATOR_BLACKLISTED"
            assert params.listing_id in self.data.private_terms, "NO_PRIVATE_TERMS"
            terms = self.data.private_terms[params.listing_id]
            assert sp.sender == terms.offerer, "WRONG_OFFERER"
            assert sp.len(params.completion_nonce) == 32, "BAD_COMPLETION_NONCE"
            assert params.completion_nonce != self.data.last_completion.get(sp.sender, default=sp.bytes("0x")), "COMPLETION_NONCE_REUSED"
            assert not sp.sender in self.data.pending, "PENDING_CHECK_EXISTS"
            claim_key = sp.record(claimant=sp.sender, token_contract=listing.token_contract, token_id=listing.token_id)
            assert not claim_key in self.data.claimed_tokens, "HORSE_ALREADY_CLAIMED"
            self.verify_permit(sp.record(
                action=sp.nat(2), mode=sp.nat(3), listing_id=params.listing_id,
                token_contract=terms.input_token_contract, token_id=terms.input_token_id,
                amount=sp.nat(1), nonce=params.permit_nonce, signature=params.signature,
            ))
            self.data.pending[sp.sender] = sp.record(
                kind=sp.nat(2), listing_id=params.listing_id, recipient=sp.sender,
                input_token_contract=terms.input_token_contract,
                input_token_id=terms.input_token_id,
                nonce=params.completion_nonce, level=sp.level,
            )
            self.ask_balance(sp.record(
                token_contract=listing.token_contract, owner=sp.sender, token_id=listing.token_id,
            ))

        @sp.entrypoint
        def on_balance(self, responses):
            sp.cast(responses, sp.list[BalanceResponse])
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert sp.len(responses) == 1, "BAD_BALANCE_RESPONSE"
            assert sp.source in self.data.pending, "NO_PENDING_CHECK"
            pending = self.data.pending[sp.source]
            assert pending.level == sp.level, "STALE_PENDING_CHECK"
            assert pending.recipient == sp.source, "BAD_PENDING_RECIPIENT"
            assert pending.listing_id in self.data.listings, "NO_LISTING"
            listing = self.data.listings[pending.listing_id]
            assert sp.sender == listing.token_contract, "WRONG_BALANCE_CONTRACT"
            assert listing.remaining > 0, "LISTING_EMPTY"
            for response in responses:
                assert response.request.owner == pending.recipient, "WRONG_BALANCE_OWNER"
                assert response.request.token_id == listing.token_id, "WRONG_BALANCE_TOKEN"
                assert response.balance == 0, "HORSE_ALREADY_OWNED"
            claim_key = sp.record(
                claimant=pending.recipient, token_contract=listing.token_contract, token_id=listing.token_id,
            )
            assert not claim_key in self.data.claimed_tokens, "HORSE_ALREADY_CLAIMED"
            if pending.kind == 0:
                assert listing.mode <= 1, "WRONG_PENDING_KIND"
                assert listing.owner != pending.recipient, "OWN_LISTING"
                if listing.mode == 0:
                    credit = self.data.reciprocal_credits.get(pending.recipient, default=sp.nat(0))
                    assert credit > 0, "RECIPROCAL_DEPOSIT_REQUIRED"
                    self.data.reciprocal_credits[pending.recipient] = sp.as_nat(credit - 1)
                self.transfer_fa2(sp.record(
                    token_contract=listing.token_contract, from_=sp.self_address,
                    to_=pending.recipient, token_id=listing.token_id, amount=sp.nat(1),
                ))
                sp.emit(sp.cast(sp.record(
                    listing_id=pending.listing_id, claimant=pending.recipient,
                    owner=listing.owner, mode=listing.mode,
                    token_contract=listing.token_contract, token_id=listing.token_id,
                ), ClaimedEvent), tag="horse_claimed")
            else:
                assert (pending.kind == 1 and listing.mode == 2) or (pending.kind == 2 and listing.mode == 3), "WRONG_PENDING_KIND"
                assert not self.data.blacklisted.get(listing.owner, default=False), "CREATOR_BLACKLISTED"
                if pending.kind == 2:
                    assert pending.listing_id in self.data.private_terms, "NO_PRIVATE_TERMS"
                    terms = self.data.private_terms[pending.listing_id]
                    assert pending.recipient == terms.offerer, "WRONG_OFFERER"
                    assert pending.input_token_contract == terms.input_token_contract, "WRONG_INPUT_CONTRACT"
                    assert pending.input_token_id == terms.input_token_id, "WRONG_INPUT_TOKEN"
                self.transfer_fa2(sp.record(
                    token_contract=pending.input_token_contract,
                    from_=pending.recipient, to_=listing.owner,
                    token_id=pending.input_token_id, amount=sp.nat(1),
                ))
                self.transfer_fa2(sp.record(
                    token_contract=listing.token_contract, from_=sp.self_address,
                    to_=pending.recipient, token_id=listing.token_id, amount=sp.nat(1),
                ))
                event = sp.cast(sp.record(
                    listing_id=pending.listing_id, claimant=pending.recipient,
                    owner=listing.owner, output_contract=listing.token_contract,
                    output_id=listing.token_id,
                    input_contract=pending.input_token_contract,
                    input_id=pending.input_token_id,
                ), SwappedEvent)
                if pending.kind == 1:
                    sp.emit(event, tag="horse_swapped")
                else:
                    sp.emit(event, tag="private_offer_fulfilled")
            listing.remaining = sp.as_nat(listing.remaining - 1)
            self.data.listings[pending.listing_id] = listing
            self.data.claimed_tokens[claim_key] = ()
            self.data.last_completion[sp.source] = pending.nonce
            del self.data.pending[sp.source]

        @sp.entrypoint
        def assert_completed(self, completion_nonce):
            sp.cast(completion_nonce, sp.bytes)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert sp.len(completion_nonce) == 32, "BAD_COMPLETION_NONCE"
            assert self.data.last_completion.get(sp.sender, default=sp.bytes("0x")) == completion_nonce, "BALANCE_CALLBACK_MISSING"
            assert not sp.sender in self.data.pending, "PENDING_CHECK_EXISTS"

        @sp.entrypoint
        def abort_pending(self):
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert sp.sender in self.data.pending, "NO_PENDING_CHECK"
            del self.data.pending[sp.sender]

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
                credit = self.data.reciprocal_credits.get(sp.sender, default=sp.nat(0))
                assert credit >= params.amount, "CREDITS_ALREADY_SPENT"
                self.data.reciprocal_credits[sp.sender] = sp.as_nat(credit - params.amount)
            listing.remaining = sp.as_nat(listing.remaining - params.amount)
            self.data.listings[params.listing_id] = listing
            self.transfer_fa2(sp.record(
                token_contract=listing.token_contract, from_=sp.self_address,
                to_=sp.sender, token_id=listing.token_id, amount=params.amount,
            ))
            sp.emit(sp.cast(sp.record(
                listing_id=params.listing_id, owner=sp.sender,
                mode=listing.mode, amount=params.amount,
            ), CancelledEvent), tag="horse_cancelled")

        @sp.onchain_view()
        def get_listing(self, listing_id):
            sp.cast(listing_id, sp.nat)
            return self.data.listings.get_opt(listing_id)

        @sp.onchain_view()
        def get_private_terms(self, listing_id):
            sp.cast(listing_id, sp.nat)
            return self.data.private_terms.get_opt(listing_id)

        @sp.onchain_view()
        def get_credits(self, trader):
            sp.cast(trader, sp.address)
            return self.data.reciprocal_credits.get(trader, default=sp.nat(0))

        @sp.onchain_view()
        def has_claimed(self, params):
            sp.cast(params, TokenClaimKey)
            return params in self.data.claimed_tokens

        @sp.onchain_view()
        def is_blacklisted(self, wallet):
            sp.cast(wallet, sp.address)
            return self.data.blacklisted.get(wallet, default=False)


@sp.add_test()
def deploy_horf_rooms_v3_template():
    scenario = sp.test_scenario("deploy_horf_rooms_v3_template", main)
    scenario.add_flag("protocol", "tallinn")
    administrator = sp.test_account("Horf V3 template administrator")
    oracle = sp.test_account("Horf V3 eligibility oracle")
    scenario += main.HorfRoomsV3(administrator.address, oracle.public_key)
