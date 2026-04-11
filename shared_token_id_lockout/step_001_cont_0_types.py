import smartpy as sp

tstorage = sp.record(ledger=sp.big_map[sp.record(owner=sp.address, token_id=sp.nat).layout(("owner", "token_id")), sp.nat], operators=sp.big_map[sp.record(operator=sp.address, owner=sp.address, token_id=sp.nat).layout(("owner", ("operator", "token_id"))), sp.unit]).layout(("ledger", "operators"))
tparameter = sp.variant(mint=sp.record(amount=sp.nat, owner=sp.address, token_id=sp.nat).layout(("owner", ("token_id", "amount"))), set_operator=sp.record(enabled=sp.bool, operator=sp.address, owner=sp.address, token_id=sp.nat).layout(("owner", ("operator", ("token_id", "enabled")))), transfer=sp.list[sp.record(from_=sp.address, txs=sp.list[sp.record(amount=sp.nat, to_=sp.address, token_id=sp.nat).layout(("to_", ("token_id", "amount")))]).layout(("from_", "txs"))]).layout(("mint", ("set_operator", "transfer")))
tprivates = { }
tviews = { }
