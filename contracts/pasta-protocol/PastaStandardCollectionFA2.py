# PastaStandardCollectionFA2
#
# Pasta Protocol — standard (non-blind) FA2 multi-asset collection contract used by Spaghetti to
# originate a creator-owned collection and then publish token products into it.
#
# Authored in the SmartPy 0.24.x `assert` syntax that the proven Macaroni V2 contract uses, so it
# compiles with the same toolchain. The shared contracts/fa2-templates/* sources (used by the Kiln
# factory) are intentionally left untouched.
#
# Compliant with:
#   TZIP-12  (FA2 — multi-asset)
#   TZIP-16  (contract metadata via `metadata` big_map)
#   TZIP-21  (token metadata via `token_metadata` big_map)
#
# Ownership relationship metadata (parent/franchise/etc.) lives off-chain in the pinned TZIP-16/21
# JSON; it is not enforced on-chain in the MVP.
#
# Entrypoints:
#   transfer, update_operators, balance_of   — FA2 standard
#   create_token                             — admin: register a new token type (token_info map)
#   mint                                     — admin or whitelisted minter: mint supply
#   burn                                     — holder: burn own balance
#   add_minter / remove_minter               — admin: delegate minting
#   set_token_metadata                       — admin: update a token's TZIP-21 URI
#   transfer_administration / accept_administration — two-step admin handoff (for Colander)

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

    class PastaStandardCollectionFA2(sp.Contract):
        def __init__(self, administrator, metadata):
            self.data.administrator = sp.cast(administrator, sp.address)
            self.data.pending_administrator = sp.cast(None, sp.option[sp.address])
            self.data.metadata = sp.cast(metadata, sp.big_map[sp.string, sp.bytes])
            self.data.ledger = sp.cast(sp.big_map(), sp.big_map[LedgerKeyType, sp.nat])
            self.data.operators = sp.cast(sp.big_map(), sp.big_map[OperatorKeyType, sp.unit])
            self.data.token_metadata = sp.cast(sp.big_map(), sp.big_map[sp.nat, TokenMetadataType])
            self.data.total_supply = sp.cast(sp.big_map(), sp.big_map[sp.nat, sp.nat])
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

        # ---- Token products ----

        @sp.entrypoint
        def create_token(self, token_info):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(token_info, sp.map[sp.string, sp.bytes])
            self._only_admin()
            token_id = self.data.next_token_id
            self.data.token_metadata[token_id] = sp.record(token_id=token_id, token_info=token_info)
            self.data.total_supply[token_id] = sp.nat(0)
            self.data.next_token_id += 1

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


def bytes_of_string(s):
    return sp.bytes("0x" + s.encode("utf-8").hex())


def pasta_standard_collection_template():
    admin = sp.test_account("pasta_standard_collection_admin")
    metadata = sp.big_map({"": bytes_of_string("ipfs://QmPastaStandardCollectionMetadataTemplate")})
    return main.PastaStandardCollectionFA2(administrator=admin.address, metadata=metadata)


@sp.add_test()
def deploy_pasta_standard_collection_template():
    scenario = sp.test_scenario("deploy_pasta_standard_collection_template", main)
    c = pasta_standard_collection_template()
    scenario += c


@sp.add_test()
def test():
    scenario = sp.test_scenario("PastaStandardCollectionFA2", main)
    admin = sp.test_account("admin")
    minter = sp.test_account("minter")
    alice = sp.test_account("alice")
    bob = sp.test_account("bob")

    metadata = sp.big_map({"": bytes_of_string("ipfs://QmContract")})
    c = main.PastaStandardCollectionFA2(administrator=admin.address, metadata=metadata)
    scenario += c

    scenario.h2("Admin creates token type 0")
    c.create_token({"": bytes_of_string("ipfs://QmToken0")}, _sender=admin)
    scenario.verify(c.data.next_token_id == 1)

    scenario.h2("Admin mints 5 editions to alice")
    c.mint(sp.record(to_=alice.address, token_id=0, amount=5), _sender=admin)
    scenario.verify(c.data.ledger[sp.record(owner=alice.address, token_id=0)] == 5)
    scenario.verify(c.data.total_supply[0] == 5)

    scenario.h2("Delegated minter mints 2 to bob")
    c.add_minter(minter.address, _sender=admin)
    c.mint(sp.record(to_=bob.address, token_id=0, amount=2), _sender=minter)
    scenario.verify(c.data.total_supply[0] == 7)

    scenario.h2("Non-minter cannot mint")
    c.mint(sp.record(to_=bob.address, token_id=0, amount=1), _sender=bob, _valid=False)

    scenario.h2("Alice burns 2")
    c.burn(sp.record(token_id=0, amount=2), _sender=alice)
    scenario.verify(c.data.ledger[sp.record(owner=alice.address, token_id=0)] == 3)
    scenario.verify(c.data.total_supply[0] == 5)

    scenario.h2("Alice transfers 1 to bob")
    c.transfer(
        [sp.record(from_=alice.address, txs=[sp.record(to_=bob.address, token_id=0, amount=1)])],
        _sender=alice,
    )
    scenario.verify(c.data.ledger[sp.record(owner=bob.address, token_id=0)] == 3)

    scenario.h2("Two-step admin handoff")
    c.transfer_administration(bob.address, _sender=admin)
    c.accept_administration(_sender=bob)
    scenario.verify(c.data.administrator == bob.address)
