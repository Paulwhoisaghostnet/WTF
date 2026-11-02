"""Minimal operator-controlled FA2 used only in local escrow scenarios."""
import smartpy as sp


@sp.module
def dummy_prize_fa2_main():
    TransferTx: type = sp.record(to_=sp.address, token_id=sp.nat, amount=sp.nat).layout(
        ("to_", ("token_id", "amount"))
    )
    TransferBatch: type = sp.record(from_=sp.address, txs=sp.list[TransferTx]).layout(
        ("from_", "txs")
    )
    Operator: type = sp.record(owner=sp.address, operator=sp.address, token_id=sp.nat).layout(
        ("owner", ("operator", "token_id"))
    )
    OperatorUpdate: type = sp.variant(
        add_operator=Operator, remove_operator=Operator,
    )
    Mint: type = sp.record(to_=sp.address, token_id=sp.nat, amount=sp.nat)

    class DummyPrizeFA2(sp.Contract):
        def __init__(self, admin):
            self.data.admin = admin
            self.data.ledger = sp.cast(sp.big_map(), sp.big_map[sp.pair[sp.address, sp.nat], sp.nat])
            self.data.operators = sp.cast(set(), sp.set[sp.pair[sp.address, sp.pair[sp.address, sp.nat]]])

        @sp.entrypoint
        def mint(self, params):
            sp.cast(params, Mint)
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            assert params.amount > 0, "ZERO_MINT"
            key = (params.to_, params.token_id)
            self.data.ledger[key] = self.data.ledger.get(key, default=sp.nat(0)) + params.amount

        @sp.entrypoint
        def update_operators(self, updates):
            sp.cast(updates, sp.list[OperatorUpdate])
            for update in updates:
                match update:
                    case add_operator(value):
                        assert sp.sender == value.owner, "NOT_OWNER"
                        self.data.operators.add((value.owner, (value.operator, value.token_id)))
                    case remove_operator(value):
                        assert sp.sender == value.owner, "NOT_OWNER"
                        self.data.operators.remove((value.owner, (value.operator, value.token_id)))

        @sp.entrypoint
        def transfer(self, batches):
            sp.cast(batches, sp.list[TransferBatch])
            for batch in batches:
                for tx in batch.txs:
                    assert sp.sender == batch.from_ or (batch.from_, (sp.sender, tx.token_id)) in self.data.operators, "FA2_NOT_OPERATOR"
                    source = (batch.from_, tx.token_id)
                    destination = (tx.to_, tx.token_id)
                    balance = self.data.ledger.get(source, default=sp.nat(0))
                    assert balance >= tx.amount, "FA2_INSUFFICIENT_BALANCE"
                    self.data.ledger[source] = sp.as_nat(balance - tx.amount)
                    self.data.ledger[destination] = self.data.ledger.get(destination, default=sp.nat(0)) + tx.amount


main = dummy_prize_fa2_main
