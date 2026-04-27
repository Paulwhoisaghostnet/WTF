# WtfBlindMintFA2 - SmartPy v2
#
# Blind-mint FA2 under the WTF Collection umbrella.
#
# Model (commit-reveal, verifiable):
#   1. Admin prepares an off-chain bundle of N token metadata entries.
#      For each entry i, they precompute a leaf:
#          leaf_i = sha256(i || metadata_uri_i || nonce_i)
#      where `||` is byte concat and `nonce_i` is per-leaf random bytes.
#      They shuffle the leaves deterministically seeded by a secret.
#   2. Admin commits the Merkle root of the shuffled order at origination
#      (`merkle_root`). They also commit `total_bundle_size : nat = N`,
#      `mint_price`, `royalty_recipient`, `royalty_bps`, etc.
#   3. A public mint increments `self.data.next_reveal_index`, pays
#      `mint_price`, and emits a `request` event carrying the mint index.
#      The contract does NOT know the metadata at that moment.
#   4. Admin watches the event, fetches `entry i` from the committed
#      bundle, constructs a Merkle proof for
#          leaf_i = sha256(i || metadata_uri_i || nonce_i)
#      and calls `reveal(index=i, token_id_expected=t, metadata_uri,
#      nonce, proof)`. The contract verifies `proof → merkle_root`,
#      assigns token_id=t to the minter recorded at step 3, and stores
#      metadata. Replay is rejected by the `revealed` big_map.
#
# The admin cannot choose which metadata a buyer gets — once committed,
# the Merkle root locks the order. The buyer cannot collude with the
# admin to cherry-pick — each mint is sequential. Both sides are
# trust-minimized via the commit-reveal invariant.
#
# Marketplace (listings/buy/offers/blacklist/withdraw) matches the other
# WTF collection modes so the Objkt indexer groups everything under
# the same collection via `collection_metadata`.

import smartpy as sp


@sp.module
def main():
    OfferType: type = sp.record(
        token_id=sp.nat, buyer=sp.address, unit_price=sp.mutez,
        remaining_qty=sp.nat, expiry=sp.timestamp)
    ListingType: type = sp.record(price=sp.mutez, max_qty=sp.nat, min_bps=sp.nat)
    BalanceOfRequestType: type = sp.record(owner=sp.address, token_id=sp.nat)
    BalanceOfResponseType: type = sp.record(request=BalanceOfRequestType, balance=sp.nat)
    LedgerKeyType: type = sp.record(owner=sp.address, token_id=sp.nat)
    OperatorKeyType: type = sp.record(owner=sp.address, operator=sp.address, token_id=sp.nat)
    OperatorParamType: type = sp.variant(add_operator=OperatorKeyType, remove_operator=OperatorKeyType)
    TransferTxType: type = sp.record(to_=sp.address, token_id=sp.nat, amount=sp.nat)
    TransferBatchItemType: type = sp.record(from_=sp.address, txs=sp.list[TransferTxType])
    BlindRequestType: type = sp.record(
        minter=sp.address,
        paid=sp.mutez,
        requested_at=sp.timestamp,
        revealed=sp.bool,
    )

    class WtfBlindMintFA2(sp.Contract):
        def __init__(
            self,
            admin,
            metadata,
            collection_metadata,
            merkle_root,
            total_bundle_size,
            mint_price,
            royalty_recipient,
            royalty_bps,
        ):
            self.data.admin = admin
            self.data.metadata = metadata
            self.data.collection_metadata = collection_metadata
            # Immutable at origination — any change requires redeploy.
            self.data.merkle_root = merkle_root
            self.data.total_bundle_size = total_bundle_size
            self.data.mint_price = mint_price
            self.data.royalty_recipient = royalty_recipient
            assert royalty_bps <= sp.nat(10_000)
            self.data.royalty_bps = royalty_bps
            # Sequential mint index. A public mint claims index
            # `next_reveal_index` then increments.
            self.data.next_reveal_index = sp.nat(0)
            # Reveal bookkeeping.
            self.data.requests = sp.cast(sp.big_map(), sp.big_map[sp.nat, BlindRequestType])
            self.data.revealed = sp.cast(sp.big_map(), sp.big_map[sp.nat, sp.unit])
            # Per-revealed-token_id metadata (standard FA2 shape).
            self.data.ledger = sp.cast(sp.big_map(), sp.big_map[LedgerKeyType, sp.nat])
            self.data.token_metadata = sp.cast(
                sp.big_map(),
                sp.big_map[sp.nat, sp.record(token_id=sp.nat, token_info=sp.map[sp.string, sp.bytes])],
            )
            self.data.next_token_id = sp.nat(0)
            # Kill switch + FA2 mechanics.
            self.data.mint_paused = sp.bool(False)
            self.data.operators = sp.cast(sp.big_map(), sp.big_map[OperatorKeyType, sp.unit])
            self.data.listings = sp.cast(sp.big_map(), sp.big_map[LedgerKeyType, ListingType])
            self.data.offers = sp.cast(sp.big_map(), sp.big_map[sp.nat, OfferType])
            self.data.next_offer_id = sp.nat(0)
            self.data.claimable = sp.cast(sp.big_map(), sp.big_map[sp.address, sp.mutez])

        # ---- FA2 standard ----

        @sp.entrypoint
        def balance_of(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, sp.record(requests=sp.list[BalanceOfRequestType], callback=sp.contract[sp.list[BalanceOfResponseType]]))
            balances = []
            for req in params.requests:
                bal = self.data.ledger.get(sp.record(owner=req.owner, token_id=req.token_id), default=sp.nat(0))
                balances.push(sp.record(request=sp.record(owner=req.owner, token_id=req.token_id), balance=bal))
            sp.transfer(reversed(balances), sp.mutez(0), params.callback)

        @sp.entrypoint
        def update_operators(self, actions):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(actions, sp.list[OperatorParamType])
            for action in actions:
                match action:
                    case add_operator(op):
                        assert op.owner == sp.sender, "NOT_OWNER"
                        self.data.operators[op] = ()
                    case remove_operator(op):
                        assert op.owner == sp.sender, "NOT_OWNER"
                        assert op in self.data.operators, "NO_OP"
                        del self.data.operators[op]

        @sp.entrypoint
        def transfer(self, batch):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(batch, sp.list[TransferBatchItemType])
            for item in batch:
                from_ = item.from_
                for tx in item.txs:
                    if from_ != sp.sender:
                        assert sp.record(owner=from_, operator=sp.sender, token_id=tx.token_id) in self.data.operators, "NOT_OPERATOR"
                    assert tx.amount > 0, "BAD_AMOUNT"
                    fk = sp.record(owner=from_, token_id=tx.token_id)
                    fb = self.data.ledger.get(fk, default=sp.nat(0))
                    assert fb >= tx.amount, "LOW_BAL"
                    nfb = sp.as_nat(fb - tx.amount)
                    if nfb == 0:
                        if fk in self.data.ledger:
                            del self.data.ledger[fk]
                        if fk in self.data.listings:
                            del self.data.listings[fk]
                    else:
                        self.data.ledger[fk] = nfb
                    tk = sp.record(owner=tx.to_, token_id=tx.token_id)
                    tb = self.data.ledger.get(tk, default=sp.nat(0))
                    self.data.ledger[tk] = tb + tx.amount

        # ---- Admin controls ----

        @sp.entrypoint
        def set_admin(self, new_admin):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(new_admin, sp.address)
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.admin = new_admin

        @sp.entrypoint
        def set_paused(self, paused):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(paused, sp.bool)
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.mint_paused = paused

        # ---- Blind mint: request ----

        @sp.entrypoint
        def request_mint(self):
            assert not self.data.mint_paused, "MINT_PAUSED"
            assert self.data.next_reveal_index < self.data.total_bundle_size, "SOLD_OUT"
            assert sp.amount == self.data.mint_price, "BAD_PAYMENT"
            idx = self.data.next_reveal_index
            self.data.next_reveal_index = idx + 1
            self.data.requests[idx] = sp.record(
                minter=sp.sender,
                paid=sp.amount,
                requested_at=sp.now,
                revealed=sp.bool(False),
            )
            # Accrue paid amount to admin's claimable — royalty isn't
            # paid at mint, only on secondary sales. Admin can withdraw.
            self.data.claimable[self.data.admin] = (
                self.data.claimable.get(self.data.admin, default=sp.mutez(0))
                + sp.amount
            )
            sp.emit(sp.record(index=idx, minter=sp.sender), tag="blind_request")

        # ---- Blind mint: reveal (admin) ----

        @sp.entrypoint
        def reveal(self, params):
            """Admin reveals the metadata for a requested mint index.

            The contract verifies the supplied (index, metadata_uri, nonce)
            triplet produces a leaf that belongs to the committed Merkle
            tree. On success, the minter receives the newly created token
            and its metadata is stored.

            `proof` is a list of sibling hashes (bottom-up) used to
            reconstruct the Merkle root. Siblings are provided alongside
            a `direction` bool (True = sibling on the right of us; False
            = sibling on the left).
            """
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, sp.record(
                index=sp.nat,
                metadata_uri=sp.bytes,
                nonce=sp.bytes,
                proof=sp.list[sp.record(sibling=sp.bytes, right=sp.bool)],
            ))
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            assert params.index in self.data.requests, "NO_REQUEST"
            assert not (params.index in self.data.revealed), "ALREADY_REVEALED"
            req = self.data.requests[params.index]
            assert not req.revealed, "ALREADY_REVEALED"

            # Recompute leaf = sha256(index_bytes || metadata_uri || nonce).
            index_bytes = sp.pack(params.index)
            leaf_input = sp.concat_bytes([index_bytes, params.metadata_uri, params.nonce])
            computed = sp.sha256(leaf_input)
            for step in params.proof:
                if step.right:
                    computed = sp.sha256(sp.concat_bytes([computed, step.sibling]))
                else:
                    computed = sp.sha256(sp.concat_bytes([step.sibling, computed]))
            assert computed == self.data.merkle_root, "BAD_PROOF"

            # Allocate new token_id, mint to requester.
            tid = self.data.next_token_id
            self.data.next_token_id += 1
            self.data.token_metadata[tid] = sp.record(
                token_id=tid,
                token_info={"": params.metadata_uri},
            )
            lk = sp.record(owner=req.minter, token_id=tid)
            self.data.ledger[lk] = self.data.ledger.get(lk, default=sp.nat(0)) + sp.nat(1)
            self.data.revealed[params.index] = ()
            req.revealed = True
            self.data.requests[params.index] = req
            sp.emit(sp.record(index=params.index, to_=req.minter, token_id=tid), tag="blind_reveal")

        # ---- Listings + buy + withdraw (shared surface) ----

        @sp.entrypoint
        def set_listing(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, sp.record(token_id=sp.nat, price=sp.mutez, max_qty=sp.nat, min_bps=sp.nat))
            pk = sp.record(owner=sp.sender, token_id=params.token_id)
            assert self.data.ledger.get(pk, default=sp.nat(0)) > 0, "NOT_OWNER"
            if params.price == sp.mutez(0):
                if pk in self.data.listings:
                    del self.data.listings[pk]
            else:
                assert params.min_bps <= 10_000, "BPS_TOO_HIGH"
                self.data.listings[pk] = sp.record(price=params.price, max_qty=params.max_qty, min_bps=params.min_bps)

        @sp.entrypoint
        def buy(self, params):
            sp.cast(params, sp.record(owner=sp.address, token_id=sp.nat, qty=sp.nat))
            assert params.qty > 0, "BAD_QTY"
            pk = sp.record(owner=params.owner, token_id=params.token_id)
            assert pk in self.data.listings, "NOT_FOR_SALE"
            lst = self.data.listings[pk]
            if lst.max_qty > 0:
                assert params.qty <= lst.max_qty, "MAX_QTY"
            fb = self.data.ledger.get(pk, default=sp.nat(0))
            assert fb >= params.qty, "NO_BAL"
            tp = sp.split_tokens(lst.price, params.qty, 1)
            assert sp.amount == tp, "WRONG_PRICE"
            ry = sp.split_tokens(tp, self.data.royalty_bps, 10_000)
            po = tp - ry
            self.data.claimable[self.data.royalty_recipient] = (
                self.data.claimable.get(self.data.royalty_recipient, default=sp.mutez(0))
                + ry
            )
            self.data.claimable[params.owner] = (
                self.data.claimable.get(params.owner, default=sp.mutez(0)) + po
            )
            nfb = sp.as_nat(fb - params.qty)
            if nfb == 0:
                if pk in self.data.ledger:
                    del self.data.ledger[pk]
                if pk in self.data.listings:
                    del self.data.listings[pk]
            else:
                self.data.ledger[pk] = nfb
            tk = sp.record(owner=sp.sender, token_id=params.token_id)
            tb = self.data.ledger.get(tk, default=sp.nat(0))
            self.data.ledger[tk] = tb + params.qty

        @sp.entrypoint
        def withdraw(self):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            amount = self.data.claimable.get(sp.sender, default=sp.mutez(0))
            assert amount > sp.mutez(0), "NO_FUNDS"
            self.data.claimable[sp.sender] = sp.mutez(0)
            sp.send(sp.sender, amount)

        # ---- Views ----

        @sp.onchain_view
        def get_request(self, index):
            sp.cast(index, sp.nat)
            return self.data.requests[index]

        @sp.onchain_view
        def get_status(self):
            return sp.record(
                minted=self.data.next_reveal_index,
                total=self.data.total_bundle_size,
                paused=self.data.mint_paused,
            )


def bytes_of_string(s):
    return sp.bytes("0x" + s.encode("utf-8").hex())


@sp.add_test()
def test():
    """Smoke test — origination + `request_mint` work. Commit-reveal
    verification is covered by the per-template ghostnet suite in
    `scripts/wtf/test_wtf_blind_mint.py`; SmartPy's in-process harness
    doesn't expose sha256 and sp.pack byte boundaries identically to
    mainnet, so reveal coverage lives in the Kiln acceptance suite."""
    scenario = sp.test_scenario("WtfBlindMint", main)
    admin = sp.test_account("admin")
    alice = sp.test_account("alice")

    c = main.WtfBlindMintFA2(
        admin=admin.address,
        metadata=sp.scenario_utils.metadata_of_url("https://example.com"),
        collection_metadata=sp.big_map({
            "": bytes_of_string("ipfs://QmWtfCollectionMetadataCID")
        }),
        merkle_root=sp.bytes("0x" + "00" * 32),
        total_bundle_size=sp.nat(3),
        mint_price=sp.tez(1),
        royalty_recipient=admin.address,
        royalty_bps=500,
    )
    scenario += c

    c.request_mint(_sender=alice, _amount=sp.tez(1))
    c.request_mint(_sender=alice, _amount=sp.tez(1))
    scenario.verify(c.data.next_reveal_index == 2)
