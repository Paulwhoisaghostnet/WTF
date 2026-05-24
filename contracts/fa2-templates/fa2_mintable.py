# fa2_mintable.py — FA2 Mintable Token (SmartPy v0.17+, new syntax)
#
# TZIP-12 FA2 multi-asset contract with admin-controlled minting and burning.
# Suitable for open editions, phygitals, and reward tokens that require
# supply management after deployment.
#
# Compliant with:
#   TZIP-12  (FA2 — Financial Asset 2, multi-asset)
#   TZIP-16  (contract metadata via `metadata` big_map)
#   TZIP-21  (token metadata via `token_metadata` big_map)
#
# Entrypoints:
#   transfer          — FA2 batch transfer
#   update_operators  — FA2 operator management
#   balance_of        — FA2 on-chain view (callback)
#   create_token      — admin: register a new token type
#   mint              — admin or whitelisted minter: mint supply to an address
#   burn              — token holder: burn own balance
#   add_minter        — admin: grant mint permission to an address
#   remove_minter     — admin: revoke mint permission
#   set_token_metadata — admin: update token TZIP-21 URI

import smartpy as sp


@sp.module
def main():
    LedgerKeyType: type = sp.record(owner=sp.address, token_id=sp.nat)
    OperatorKeyType: type = sp.record(
        owner=sp.address, operator=sp.address, token_id=sp.nat
    )
    TransferTxType: type = sp.record(
        to_=sp.address, token_id=sp.nat, amount=sp.nat
    )
    TransferBatchType: type = sp.record(
        from_=sp.address, txs=sp.list[TransferTxType]
    )
    OperatorParamType: type = sp.variant(
        add_operator=OperatorKeyType, remove_operator=OperatorKeyType
    )
    BalanceOfRequestType: type = sp.record(owner=sp.address, token_id=sp.nat)
    BalanceOfResponseType: type = sp.record(
        request=BalanceOfRequestType, balance=sp.nat
    )
    MintParamType: type = sp.record(
        to_=sp.address, token_id=sp.nat, amount=sp.nat
    )

    class Fa2Mintable(sp.Contract):
        """
        FA2 mintable-supply token contract.

        The admin may create new token types (via `create_token`) and delegate
        minting rights to additional addresses (via `add_minter`).  Token
        holders can burn their own balance.  No cap enforcement is implemented
        here — add `max_supply` to `token_info` metadata and enforce it in a
        sub-class or minting script if required.
        """

        def __init__(
            self,
            admin: sp.address,
            metadata: sp.big_map[sp.string, sp.bytes],
        ):
            self.data.admin = admin
            self.data.metadata = metadata
            self.data.ledger = sp.cast(
                sp.big_map(), sp.big_map[LedgerKeyType, sp.nat]
            )
            self.data.token_metadata = sp.cast(
                sp.big_map(),
                sp.big_map[
                    sp.nat,
                    sp.record(token_id=sp.nat, token_info=sp.map[sp.string, sp.bytes]),
                ],
            )
            self.data.operators = sp.cast(
                sp.big_map(), sp.big_map[OperatorKeyType, sp.unit]
            )
            self.data.total_supply = sp.cast(
                sp.big_map(), sp.big_map[sp.nat, sp.nat]
            )
            self.data.minters = sp.cast(
                sp.big_map(), sp.big_map[sp.address, sp.unit]
            )
            self.data.next_token_id = sp.nat(0)

        # ── FA2: transfer ────────────────────────────────────────────────────

        @sp.entrypoint
        def transfer(self, batch):
            sp.cast(batch, sp.list[TransferBatchType])
            for item in batch:
                sp.verify(
                    item.from_ == sp.sender
                    or self.data.operators.contains(
                        sp.record(
                            owner=item.from_,
                            operator=sp.sender,
                            token_id=sp.nat(0),
                        )
                    ),
                    "FA2_NOT_OPERATOR",
                )
                for tx in item.txs:
                    from_key = sp.record(owner=item.from_, token_id=tx.token_id)
                    from_bal = self.data.ledger.get(from_key, default=sp.nat(0))
                    sp.verify(from_bal >= tx.amount, "FA2_INSUFFICIENT_BALANCE")
                    self.data.ledger[from_key] = sp.as_nat(from_bal - tx.amount)
                    to_key = sp.record(owner=tx.to_, token_id=tx.token_id)
                    self.data.ledger[to_key] = (
                        self.data.ledger.get(to_key, default=sp.nat(0)) + tx.amount
                    )

        # ── FA2: update_operators ────────────────────────────────────────────

        @sp.entrypoint
        def update_operators(self, params):
            sp.cast(params, sp.list[OperatorParamType])
            for op in params:
                with sp.match(op):
                    with sp.case.add_operator as p:
                        sp.verify(sp.sender == p.owner, "FA2_NOT_OWNER")
                        self.data.operators[p] = sp.unit
                    with sp.case.remove_operator as p:
                        sp.verify(sp.sender == p.owner, "FA2_NOT_OWNER")
                        del self.data.operators[p]

        # ── FA2: balance_of ──────────────────────────────────────────────────

        @sp.entrypoint
        def balance_of(self, params):
            sp.cast(
                params,
                sp.record(
                    requests=sp.list[BalanceOfRequestType],
                    callback=sp.contract[sp.list[BalanceOfResponseType]],
                ),
            )
            responses: sp.list[BalanceOfResponseType] = []
            for req in params.requests:
                bal = self.data.ledger.get(
                    sp.record(owner=req.owner, token_id=req.token_id),
                    default=sp.nat(0),
                )
                responses.push(sp.record(request=req, balance=bal))
            sp.transfer(responses, sp.mutez(0), params.callback)

        # ── Admin: create_token ───────────────────────────────────────────────

        @sp.entrypoint
        def create_token(self, token_info):
            sp.cast(token_info, sp.map[sp.string, sp.bytes])
            sp.verify(sp.sender == self.data.admin, "NOT_ADMIN")
            token_id = self.data.next_token_id
            self.data.token_metadata[token_id] = sp.record(
                token_id=token_id, token_info=token_info
            )
            self.data.total_supply[token_id] = sp.nat(0)
            self.data.next_token_id += 1

        # ── Minter: mint ──────────────────────────────────────────────────────

        @sp.entrypoint
        def mint(self, params):
            sp.cast(params, MintParamType)
            sp.verify(
                sp.sender == self.data.admin
                or self.data.minters.contains(sp.sender),
                "NOT_MINTER",
            )
            sp.verify(
                self.data.token_metadata.contains(params.token_id),
                "FA2_TOKEN_UNDEFINED",
            )
            to_key = sp.record(owner=params.to_, token_id=params.token_id)
            self.data.ledger[to_key] = (
                self.data.ledger.get(to_key, default=sp.nat(0)) + params.amount
            )
            self.data.total_supply[params.token_id] = (
                self.data.total_supply.get(params.token_id, default=sp.nat(0))
                + params.amount
            )

        # ── Holder: burn ──────────────────────────────────────────────────────

        @sp.entrypoint
        def burn(self, params):
            sp.cast(params, sp.record(token_id=sp.nat, amount=sp.nat))
            from_key = sp.record(owner=sp.sender, token_id=params.token_id)
            from_bal = self.data.ledger.get(from_key, default=sp.nat(0))
            sp.verify(from_bal >= params.amount, "FA2_INSUFFICIENT_BALANCE")
            self.data.ledger[from_key] = sp.as_nat(from_bal - params.amount)
            cur_supply = self.data.total_supply.get(params.token_id, default=sp.nat(0))
            self.data.total_supply[params.token_id] = sp.as_nat(
                cur_supply - params.amount
            )

        # ── Admin: minter management ──────────────────────────────────────────

        @sp.entrypoint
        def add_minter(self, minter):
            sp.cast(minter, sp.address)
            sp.verify(sp.sender == self.data.admin, "NOT_ADMIN")
            self.data.minters[minter] = sp.unit

        @sp.entrypoint
        def remove_minter(self, minter):
            sp.cast(minter, sp.address)
            sp.verify(sp.sender == self.data.admin, "NOT_ADMIN")
            del self.data.minters[minter]

        # ── Admin: set_token_metadata ────────────────────────────────────────

        @sp.entrypoint
        def set_token_metadata(self, params):
            sp.cast(
                params,
                sp.record(
                    token_id=sp.nat,
                    token_info=sp.map[sp.string, sp.bytes],
                ),
            )
            sp.verify(sp.sender == self.data.admin, "NOT_ADMIN")
            self.data.token_metadata[params.token_id] = sp.record(
                token_id=params.token_id, token_info=params.token_info
            )


@sp.add_test()
def test():
    scenario = sp.test_scenario("Fa2Mintable", main)
    admin = sp.test_account("admin")
    minter = sp.test_account("minter")
    alice = sp.test_account("alice")
    bob = sp.test_account("bob")

    contract = main.Fa2Mintable(
        admin=admin.address,
        metadata=sp.big_map({"": sp.bytes("0x74657a6f73")}),
    )
    scenario += contract

    scenario.h2("Create token type 0")
    contract.create_token(
        {"": sp.bytes("0x697066733a2f2f")}, _sender=admin
    )

    scenario.h2("Add external minter")
    contract.add_minter(minter.address, _sender=admin)

    scenario.h2("Mint 50 to alice via external minter")
    contract.mint(
        sp.record(to_=alice.address, token_id=0, amount=50), _sender=minter
    )
    scenario.verify(
        contract.data.ledger[sp.record(owner=alice.address, token_id=0)] == 50
    )

    scenario.h2("Alice burns 10")
    contract.burn(sp.record(token_id=0, amount=10), _sender=alice)
    scenario.verify(
        contract.data.ledger[sp.record(owner=alice.address, token_id=0)] == 40
    )

    scenario.h2("Unauthorized mint fails")
    contract.mint(
        sp.record(to_=bob.address, token_id=0, amount=1), _sender=bob, _valid=False
    )
