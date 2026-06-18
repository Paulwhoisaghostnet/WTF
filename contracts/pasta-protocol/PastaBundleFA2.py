# PastaBundleFA2
#
# Pasta Protocol — bundle FA2 collection used by Ravioli to publish bundle Token Products: art packs,
# redeemable bundles, mystery packs, and wrapped sets. Each bundle is a single FA2 token (the "wrapper")
# whose editions can optionally be redeemed.
#
# Forked from PastaStandardCollectionFA2 (same proven SmartPy 0.24.x `assert` syntax + FA2 core) with a
# bundle/redeem module added:
#   - per-token `bundles` config (redeemable, mystery, item_count, contents_uri)
#   - `redeem` burns the wrapper edition(s) from the holder and records the redemption durably on-chain
#     (`redeemed` total + `redeemed_by` per holder). Contents delivery/reveal is OFF-chain via the pinned
#     contents manifest URI; for mystery packs the creator withholds `contents_uri` at mint and reveals it
#     later with `set_bundle_contents`. Lesson from Bowers: never fake on-chain success — redeem mutates
#     real balance/supply/counters or reverts.
#
# The shared contracts/fa2-templates/* sources (used by the Kiln factory) are intentionally untouched.
#
# Compliant with: TZIP-12 (FA2 multi-asset), TZIP-16 (contract metadata), TZIP-21 (token metadata).

import smartpy as sp


@sp.module
def main():
    LedgerKeyType: type = sp.record(owner=sp.address, token_id=sp.nat)
    OperatorKeyType: type = sp.record(owner=sp.address, operator=sp.address, token_id=sp.nat)
    BalanceOfRequestType: type = sp.record(owner=sp.address, token_id=sp.nat)
    BalanceOfResponseType: type = sp.record(request=BalanceOfRequestType, balance=sp.nat)
    OperatorParamType: type = sp.variant(add_operator=OperatorKeyType, remove_operator=OperatorKeyType)
    TransferTxType: type = sp.record(to_=sp.address, token_id=sp.nat, amount=sp.nat)
    TransferBatchItemType: type = sp.record(from_=sp.address, txs=sp.list[TransferTxType])
    TokenMetadataType: type = sp.record(token_id=sp.nat, token_info=sp.map[sp.string, sp.bytes])
    MintParamType: type = sp.record(to_=sp.address, token_id=sp.nat, amount=sp.nat)
    SetTokenMetadataType: type = sp.record(token_id=sp.nat, token_info=sp.map[sp.string, sp.bytes])
    BurnParamType: type = sp.record(token_id=sp.nat, amount=sp.nat)

    # Bundle configuration (per token id).
    BundleConfigType: type = sp.record(
        redeemable=sp.bool,
        mystery=sp.bool,
        item_count=sp.nat,
        contents_uri=sp.option[sp.bytes],
    )
    CreateBundleType: type = sp.record(token_info=sp.map[sp.string, sp.bytes], config=BundleConfigType)
    SetBundleContentsType: type = sp.record(token_id=sp.nat, contents_uri=sp.bytes)
    RedeemParamType: type = sp.record(token_id=sp.nat, amount=sp.nat)

    class PastaBundleFA2(sp.Contract):
        def __init__(self, administrator, metadata):
            self.data.administrator = sp.cast(administrator, sp.address)
            self.data.pending_administrator = sp.cast(None, sp.option[sp.address])
            self.data.metadata = sp.cast(metadata, sp.big_map[sp.string, sp.bytes])
            self.data.ledger = sp.cast(sp.big_map(), sp.big_map[LedgerKeyType, sp.nat])
            self.data.operators = sp.cast(sp.big_map(), sp.big_map[OperatorKeyType, sp.unit])
            self.data.token_metadata = sp.cast(sp.big_map(), sp.big_map[sp.nat, TokenMetadataType])
            self.data.total_supply = sp.cast(sp.big_map(), sp.big_map[sp.nat, sp.nat])
            self.data.bundles = sp.cast(sp.big_map(), sp.big_map[sp.nat, BundleConfigType])
            self.data.redeemed = sp.cast(sp.big_map(), sp.big_map[sp.nat, sp.nat])
            self.data.redeemed_by = sp.cast(sp.big_map(), sp.big_map[LedgerKeyType, sp.nat])
            self.data.minters = sp.cast(sp.big_map(), sp.big_map[sp.address, sp.unit])
            self.data.next_token_id = sp.nat(0)

        @sp.private(with_storage="read-only")
        def _only_admin(self):
            assert sp.sender == self.data.administrator, "NOT_ADMIN"

        # ---- FA2 standard ----

        @sp.entrypoint
        def balance_of(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(
                params,
                sp.record(
                    requests=sp.list[BalanceOfRequestType],
                    callback=sp.contract[sp.list[BalanceOfResponseType]],
                ),
            )
            responses = []
            for req in params.requests:
                responses.push(
                    sp.record(
                        request=sp.record(owner=req.owner, token_id=req.token_id),
                        balance=self.data.ledger.get(
                            sp.record(owner=req.owner, token_id=req.token_id), default=sp.nat(0)
                        ),
                    )
                )
            sp.transfer(reversed(responses), sp.mutez(0), params.callback)

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
                        if op in self.data.operators:
                            del self.data.operators[op]

        @sp.entrypoint
        def transfer(self, batch):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(batch, sp.list[TransferBatchItemType])
            for item in batch:
                for tx in item.txs:
                    if item.from_ != sp.sender:
                        assert (
                            sp.record(owner=item.from_, operator=sp.sender, token_id=tx.token_id)
                            in self.data.operators
                        ), "NOT_OPERATOR"
                    assert tx.amount > 0, "BAD_AMOUNT"
                    from_key = sp.record(owner=item.from_, token_id=tx.token_id)
                    from_bal = self.data.ledger.get(from_key, default=sp.nat(0))
                    assert from_bal >= tx.amount, "LOW_BALANCE"
                    next_from = sp.as_nat(from_bal - tx.amount)
                    if next_from == 0:
                        if from_key in self.data.ledger:
                            del self.data.ledger[from_key]
                    else:
                        self.data.ledger[from_key] = next_from
                    to_key = sp.record(owner=tx.to_, token_id=tx.token_id)
                    self.data.ledger[to_key] = self.data.ledger.get(to_key, default=sp.nat(0)) + tx.amount

        # ---- Bundles ----

        @sp.entrypoint
        def create_bundle(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, CreateBundleType)
            self._only_admin()
            token_id = self.data.next_token_id
            self.data.token_metadata[token_id] = sp.record(token_id=token_id, token_info=params.token_info)
            self.data.total_supply[token_id] = sp.nat(0)
            self.data.bundles[token_id] = params.config
            self.data.redeemed[token_id] = sp.nat(0)
            self.data.next_token_id += 1

        @sp.entrypoint
        def set_bundle_contents(self, params):
            # Reveal / update the off-chain contents manifest URI (mystery-pack reveal).
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, SetBundleContentsType)
            self._only_admin()
            assert params.token_id in self.data.bundles, "NO_BUNDLE"
            cfg = self.data.bundles[params.token_id]
            self.data.bundles[params.token_id] = sp.record(
                redeemable=cfg.redeemable,
                mystery=cfg.mystery,
                item_count=cfg.item_count,
                contents_uri=sp.Some(params.contents_uri),
            )

        @sp.entrypoint
        def redeem(self, params):
            # Burn the wrapper edition(s) from the holder and record the redemption durably on-chain.
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, RedeemParamType)
            assert params.amount > 0, "BAD_AMOUNT"
            assert params.token_id in self.data.bundles, "NO_BUNDLE"
            assert self.data.bundles[params.token_id].redeemable, "NOT_REDEEMABLE"
            from_key = sp.record(owner=sp.sender, token_id=params.token_id)
            from_bal = self.data.ledger.get(from_key, default=sp.nat(0))
            assert from_bal >= params.amount, "LOW_BALANCE"
            next_from = sp.as_nat(from_bal - params.amount)
            if next_from == 0:
                if from_key in self.data.ledger:
                    del self.data.ledger[from_key]
            else:
                self.data.ledger[from_key] = next_from
            cur_supply = self.data.total_supply.get(params.token_id, default=sp.nat(0))
            self.data.total_supply[params.token_id] = sp.as_nat(cur_supply - params.amount)
            self.data.redeemed[params.token_id] = (
                self.data.redeemed.get(params.token_id, default=sp.nat(0)) + params.amount
            )
            self.data.redeemed_by[from_key] = (
                self.data.redeemed_by.get(from_key, default=sp.nat(0)) + params.amount
            )

        @sp.entrypoint
        def mint(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, MintParamType)
            assert sp.sender == self.data.administrator or sp.sender in self.data.minters, "NOT_MINTER"
            assert params.token_id in self.data.token_metadata, "TOKEN_UNDEFINED"
            assert params.amount > 0, "BAD_AMOUNT"
            to_key = sp.record(owner=params.to_, token_id=params.token_id)
            self.data.ledger[to_key] = self.data.ledger.get(to_key, default=sp.nat(0)) + params.amount
            self.data.total_supply[params.token_id] = (
                self.data.total_supply.get(params.token_id, default=sp.nat(0)) + params.amount
            )

        @sp.entrypoint
        def burn(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, BurnParamType)
            from_key = sp.record(owner=sp.sender, token_id=params.token_id)
            from_bal = self.data.ledger.get(from_key, default=sp.nat(0))
            assert from_bal >= params.amount, "LOW_BALANCE"
            next_from = sp.as_nat(from_bal - params.amount)
            if next_from == 0:
                if from_key in self.data.ledger:
                    del self.data.ledger[from_key]
            else:
                self.data.ledger[from_key] = next_from
            cur_supply = self.data.total_supply.get(params.token_id, default=sp.nat(0))
            self.data.total_supply[params.token_id] = sp.as_nat(cur_supply - params.amount)

        # ---- Admin ----

        @sp.entrypoint
        def add_minter(self, minter):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(minter, sp.address)
            self._only_admin()
            self.data.minters[minter] = ()

        @sp.entrypoint
        def remove_minter(self, minter):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(minter, sp.address)
            self._only_admin()
            if minter in self.data.minters:
                del self.data.minters[minter]

        @sp.entrypoint
        def set_token_metadata(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, SetTokenMetadataType)
            self._only_admin()
            assert params.token_id in self.data.token_metadata, "TOKEN_UNDEFINED"
            self.data.token_metadata[params.token_id] = sp.record(
                token_id=params.token_id, token_info=params.token_info
            )

        @sp.entrypoint
        def transfer_administration(self, pending_administrator):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(pending_administrator, sp.address)
            self._only_admin()
            self.data.pending_administrator = sp.Some(pending_administrator)

        @sp.entrypoint
        def accept_administration(self):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            assert self.data.pending_administrator.is_some(), "NO_PENDING_ADMIN"
            pending = self.data.pending_administrator.unwrap_some()
            assert sp.sender == pending, "NOT_PENDING_ADMIN"
            self.data.administrator = pending
            self.data.pending_administrator = sp.cast(None, sp.option[sp.address])

        # ---- Views ----

        @sp.onchain_view
        def get_balance(self, params):
            sp.cast(params, sp.record(owner=sp.address, token_id=sp.nat))
            return self.data.ledger.get(
                sp.record(owner=params.owner, token_id=params.token_id), default=sp.nat(0)
            )

        @sp.onchain_view
        def get_total_supply(self, token_id):
            sp.cast(token_id, sp.nat)
            return self.data.total_supply.get(token_id, default=sp.nat(0))

        @sp.onchain_view
        def get_redeemed(self, token_id):
            sp.cast(token_id, sp.nat)
            return self.data.redeemed.get(token_id, default=sp.nat(0))


def bytes_of_string(s):
    return sp.bytes("0x" + s.encode("utf-8").hex())


def pasta_bundle_template():
    admin = sp.test_account("pasta_bundle_admin")
    metadata = sp.big_map({"": bytes_of_string("ipfs://QmPastaBundleMetadataTemplate")})
    return main.PastaBundleFA2(administrator=admin.address, metadata=metadata)


@sp.add_test()
def deploy_pasta_bundle_template():
    scenario = sp.test_scenario("deploy_pasta_bundle_template", main)
    c = pasta_bundle_template()
    scenario += c


@sp.add_test()
def test():
    scenario = sp.test_scenario("PastaBundleFA2", main)
    admin = sp.test_account("admin")
    alice = sp.test_account("alice")
    bob = sp.test_account("bob")

    metadata = sp.big_map({"": bytes_of_string("ipfs://QmContract")})
    c = main.PastaBundleFA2(administrator=admin.address, metadata=metadata)
    scenario += c

    scenario.h2("Admin creates a redeemable bundle (token 0) with revealed contents")
    redeemable_cfg = sp.record(
        redeemable=True,
        mystery=False,
        item_count=sp.nat(3),
        contents_uri=sp.some(bytes_of_string("ipfs://QmContents0")),
    )
    c.create_bundle(
        sp.record(token_info={"": bytes_of_string("ipfs://QmBundle0")}, config=redeemable_cfg),
        _sender=admin,
    )
    scenario.verify(c.data.next_token_id == 1)

    scenario.h2("Admin creates a mystery, non-redeemable wrapper (token 1), contents withheld")
    mystery_cfg = sp.record(
        redeemable=False, mystery=True, item_count=sp.nat(5), contents_uri=sp.cast(None, sp.option[sp.bytes])
    )
    c.create_bundle(
        sp.record(token_info={"": bytes_of_string("ipfs://QmBundle1")}, config=mystery_cfg), _sender=admin
    )

    scenario.h2("Admin mints 4 bundle editions of token 0 to alice")
    c.mint(sp.record(to_=alice.address, token_id=0, amount=4), _sender=admin)
    scenario.verify(c.data.total_supply[0] == 4)

    scenario.h2("Alice redeems 2 — wrapper burned, redemption recorded")
    c.redeem(sp.record(token_id=0, amount=2), _sender=alice)
    scenario.verify(c.data.ledger[sp.record(owner=alice.address, token_id=0)] == 2)
    scenario.verify(c.data.total_supply[0] == 2)
    scenario.verify(c.data.redeemed[0] == 2)
    scenario.verify(c.data.redeemed_by[sp.record(owner=alice.address, token_id=0)] == 2)
    scenario.verify(c.get_redeemed(0) == 2)

    scenario.h2("Redeeming more than held reverts")
    c.redeem(sp.record(token_id=0, amount=5), _sender=alice, _valid=False)

    scenario.h2("Non-redeemable mystery wrapper cannot be redeemed")
    c.mint(sp.record(to_=bob.address, token_id=1, amount=1), _sender=admin)
    c.redeem(sp.record(token_id=1, amount=1), _sender=bob, _valid=False)

    scenario.h2("Admin reveals mystery contents")
    c.set_bundle_contents(
        sp.record(token_id=1, contents_uri=bytes_of_string("ipfs://QmContents1")), _sender=admin
    )
    scenario.verify(c.data.bundles[1].contents_uri == sp.some(bytes_of_string("ipfs://QmContents1")))

    scenario.h2("Two-step admin handoff")
    c.transfer_administration(bob.address, _sender=admin)
    c.accept_administration(_sender=bob)
    scenario.verify(c.data.administrator == bob.address)
