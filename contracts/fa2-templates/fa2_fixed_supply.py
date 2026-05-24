# fa2_fixed_supply.py — FA2 Fixed-Supply Token (SmartPy v0.17+, new syntax)
#
# TZIP-12 FA2 multi-asset contract with a fixed token supply.  All tokens are
# minted at origination and cannot be created or burned afterwards.  Suitable
# for commemorative tokens, achievement badges, and survival trophies.
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
#   set_token_metadata — admin: update token TZIP-21 URI
#
# Storage initialised at origination:
#   admin             — privileged address (WTF operator wallet)
#   metadata          — TZIP-16 contract metadata
#   ledger            — big_map[{owner,token_id} → nat]
#   token_metadata    — big_map[nat → {token_id, token_info}]
#   operators         — big_map[{owner,operator,token_id} → unit]
#   total_supply      — big_map[nat → nat]

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

    class Fa2FixedSupply(sp.Contract):
        """
        FA2 fixed-supply token contract.

        All tokens must be passed as `initial_ledger` at origination — no
        further minting is possible once the contract is originated.
        """

        def __init__(
            self,
            admin: sp.address,
            metadata: sp.big_map[sp.string, sp.bytes],
            token_metadata: sp.big_map[
                sp.nat, sp.record(token_id=sp.nat, token_info=sp.map[sp.string, sp.bytes])
            ],
            initial_ledger: sp.big_map[LedgerKeyType, sp.nat],
            total_supply: sp.big_map[sp.nat, sp.nat],
        ):
            self.data.admin = admin
            self.data.metadata = metadata
            self.data.token_metadata = token_metadata
            self.data.ledger = initial_ledger
            self.data.operators = sp.cast(
                sp.big_map(), sp.big_map[OperatorKeyType, sp.unit]
            )
            self.data.total_supply = total_supply

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
    scenario = sp.test_scenario("Fa2FixedSupply", main)
    admin = sp.test_account("admin")
    alice = sp.test_account("alice")
    bob = sp.test_account("bob")

    contract = main.Fa2FixedSupply(
        admin=admin.address,
        metadata=sp.big_map({"": sp.bytes("0x74657a6f73")}),
        token_metadata=sp.big_map(
            {
                0: sp.record(
                    token_id=0,
                    token_info={"": sp.bytes("0x697066733a2f2f")},
                )
            }
        ),
        initial_ledger=sp.big_map(
            {sp.record(owner=alice.address, token_id=0): 100}
        ),
        total_supply=sp.big_map({0: 100}),
    )
    scenario += contract

    scenario.h2("Transfer 10 tokens from alice to bob")
    contract.transfer(
        [
            sp.record(
                from_=alice.address,
                txs=[sp.record(to_=bob.address, token_id=0, amount=10)],
            )
        ],
        _sender=alice,
    )
    scenario.verify(
        contract.data.ledger[sp.record(owner=bob.address, token_id=0)] == 10
    )
    scenario.verify(
        contract.data.ledger[sp.record(owner=alice.address, token_id=0)] == 90
    )

    scenario.h2("Unauthorized transfer fails")
    contract.transfer(
        [
            sp.record(
                from_=alice.address,
                txs=[sp.record(to_=bob.address, token_id=0, amount=1)],
            )
        ],
        _sender=bob,
        _valid=False,
    )
