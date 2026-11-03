"""Scenario tests for inspected, HORSE-priced, atomic horse listings."""

import sys
from pathlib import Path

import smartpy as sp

sys.path.insert(0, str(Path(__file__).resolve().parent))
import HorseMarket as horse_market  # noqa: E402


CHAIN_ID = sp.chain_id_cst("0x7a06a770")  # Tezos Mainnet.
HORSE_UNIT = 100_000_000  # HORSE has eight decimal places.


@sp.module
def permit_vector():
    PermitInput: type = sp.record(
        market=sp.address,
        seller=sp.address,
        token=sp.address,
        token_id=sp.nat,
        quantity=sp.nat,
        price=sp.nat,
        nonce=sp.bytes,
        epoch=sp.nat,
    )

    class PackedPermit(sp.Contract):
        def __init__(self):
            self.data.packed = sp.bytes("0x")

        @sp.entrypoint
        def compute(self, params):
            sp.cast(params, PermitInput)
            self.data.packed = sp.pack(
                (
                    sp.chain_id,
                    (
                        params.market,
                        (
                            params.seller,
                            (
                                params.token,
                                (
                                    params.token_id,
                                    (
                                        params.quantity,
                                        (
                                            params.price,
                                            (
                                                params.nonce,
                                                params.epoch,
                                            ),
                                        ),
                                    ),
                                ),
                            ),
                        ),
                    ),
                )
            )


@sp.add_test()
def packed_permit_vector():
    scenario = sp.test_scenario("horf_horse_market_packed_permit", permit_vector)
    scenario.add_flag("protocol", "tallinn")
    recorder = permit_vector.PackedPermit()
    scenario += recorder
    recorder.compute(
        market=sp.address("KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton"),
        seller=sp.address("tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY"),
        token=sp.address("KT1L7PSeJpnj79MEaybcEiDtbHM43g5DZe12"),
        token_id=7,
        quantity=3,
        price=123_000_000,
        nonce=sp.bytes("0x1111111111111111111111111111111111111111111111111111111111111111"),
        epoch=0,
        _chain_id=CHAIN_ID,
    )


@sp.module
def mock_fa2():
    LedgerKey: type = sp.record(owner=sp.address, token_id=sp.nat).layout(
        ("owner", "token_id")
    )
    OperatorKey: type = sp.record(
        owner=sp.address, operator=sp.address, token_id=sp.nat
    ).layout(("owner", ("operator", "token_id")))
    Tx: type = sp.record(to_=sp.address, token_id=sp.nat, amount=sp.nat).layout(
        ("to_", ("token_id", "amount"))
    )
    Batch: type = sp.record(from_=sp.address, txs=sp.list[Tx]).layout(
        ("from_", "txs")
    )
    Mint: type = sp.record(owner=sp.address, token_id=sp.nat, amount=sp.nat)
    Operator: type = sp.record(
        owner=sp.address, operator=sp.address, token_id=sp.nat, enabled=sp.bool
    )

    class MockFA2(sp.Contract):
        def __init__(self):
            self.data.ledger = sp.cast(sp.big_map(), sp.big_map[LedgerKey, sp.nat])
            self.data.operators = sp.cast(sp.big_map(), sp.big_map[OperatorKey, sp.unit])

        @sp.entrypoint
        def mint(self, params):
            sp.cast(params, Mint)
            key = sp.record(owner=params.owner, token_id=params.token_id)
            self.data.ledger[key] = self.data.ledger.get(key, default=sp.nat(0)) + params.amount

        @sp.entrypoint
        def set_operator(self, params):
            sp.cast(params, Operator)
            assert sp.sender == params.owner, "NOT_OWNER"
            key = sp.record(
                owner=params.owner, operator=params.operator, token_id=params.token_id
            )
            if params.enabled:
                self.data.operators[key] = ()
            else:
                if key in self.data.operators:
                    del self.data.operators[key]

        @sp.entrypoint
        def transfer(self, batches):
            sp.cast(batches, sp.list[Batch])
            for batch in batches:
                for tx in batch.txs:
                    operator = sp.record(
                        owner=batch.from_, operator=sp.sender, token_id=tx.token_id
                    )
                    assert sp.sender == batch.from_ or operator in self.data.operators, "FA2_NOT_OPERATOR"
                    from_key = sp.record(owner=batch.from_, token_id=tx.token_id)
                    to_key = sp.record(owner=tx.to_, token_id=tx.token_id)
                    balance = self.data.ledger.get(from_key, default=sp.nat(0))
                    assert balance >= tx.amount, "FA2_INSUFFICIENT_BALANCE"
                    self.data.ledger[from_key] = sp.as_nat(balance - tx.amount)
                    self.data.ledger[to_key] = (
                        self.data.ledger.get(to_key, default=sp.nat(0)) + tx.amount
                    )


@sp.module
def mock_noop_fa2():
    Tx: type = sp.record(to_=sp.address, token_id=sp.nat, amount=sp.nat).layout(
        ("to_", ("token_id", "amount"))
    )
    Batch: type = sp.record(from_=sp.address, txs=sp.list[Tx]).layout(
        ("from_", "txs")
    )

    class NoopFA2(sp.Contract):
        @sp.entrypoint
        def transfer(self, batches):
            sp.cast(batches, sp.list[Batch])
            # A malicious FA2 can return success without moving balances.
            pass


def nonce(number: int):
    return sp.bytes("0x" + number.to_bytes(32, "big").hex())


def inspection_signature(market, oracle, seller, token, token_id, quantity, price, number, epoch=0):
    payload = sp.pack(
        (
            CHAIN_ID,
            (
                market.address,
                (
                    seller.address,
                    (
                        token.address,
                        (
                            sp.nat(token_id),
                            (
                                sp.nat(quantity),
                                (sp.nat(price), (nonce(number), sp.nat(epoch))),
                            ),
                        ),
                    ),
                ),
            ),
        )
    )
    return sp.make_signature(oracle.secret_key, payload)


def list_horse(market, oracle, seller, token, token_id, quantity, price, number, *, valid=True, error=None, epoch=0):
    market.create_listing(
        token_contract=token.address,
        token_id=token_id,
        quantity=quantity,
        unit_price_horse=price,
        nonce=nonce(number),
        signature=inspection_signature(
            market, oracle, seller, token, token_id, quantity, price, number, epoch
        ),
        _sender=seller,
        _chain_id=CHAIN_ID,
        _valid=valid,
        **({"_exception": error} if error else {}),
    )


def buy(market, buyer, listing_id, quantity, seller, token, token_id, price, *, valid=True, error=None):
    market.buy_listing(
        listing_id=listing_id,
        quantity=quantity,
        expected_seller=seller.address,
        expected_token=sp.record(token_contract=token.address, token_id=token_id),
        expected_unit_price_horse=price,
        _sender=buyer,
        _valid=valid,
        **({"_exception": error} if error else {}),
    )


def balance(token, owner, token_id):
    address = owner.address if hasattr(owner, "address") else owner
    return token.data.ledger.get(
        sp.record(owner=address, token_id=token_id), default_value=sp.nat(0)
    )


def setup(scenario):
    admin = sp.test_account("wtf.tez admin")
    oracle = sp.test_account("Horf inspection oracle")
    seller = sp.test_account("Horse seller")
    buyer = sp.test_account("Horse buyer")
    horse_token = mock_fa2.MockFA2()
    horse_currency = mock_fa2.MockFA2()
    market = horse_market.main.HorseMarket(admin.address, oracle.public_key, horse_currency.address)
    scenario += horse_token
    scenario += horse_currency
    scenario += market
    horse_token.mint(sp.record(owner=seller.address, token_id=73, amount=3))
    horse_currency.mint(sp.record(owner=buyer.address, token_id=0, amount=40 * HORSE_UNIT))
    horse_token.set_operator(
        sp.record(owner=seller.address, operator=market.address, token_id=73, enabled=True),
        _sender=seller,
    )
    return admin, oracle, seller, buyer, horse_token, horse_currency, market


@sp.add_test()
def inspected_listing_pays_seller_and_delivers_editions_atomically():
    scenario = sp.test_scenario("horf_horse_market_sale", [horse_market.main, mock_fa2])
    scenario.add_flag("protocol", "tallinn")
    admin, oracle, seller, buyer, horse_token, horse_currency, market = setup(scenario)
    price = 7 * HORSE_UNIT

    list_horse(market, oracle, seller, horse_token, 73, 3, price, 1)
    scenario.verify(balance(horse_token, market, 73) == 3)
    scenario.verify(balance(horse_token, seller, 73) == 0)
    scenario.verify(market.data.listings[0].seller == seller.address)
    scenario.verify(market.data.listings[0].unit_price_horse == price)
    list_horse(market, oracle, seller, horse_token, 73, 3, price, 1, valid=False, error="PERMIT_USED")
    buy(market, buyer, 0, 1, seller, horse_token, 73, price, valid=False, error="FA2_NOT_OPERATOR")
    scenario.verify(market.data.listings[0].remaining == 3)
    horse_currency.set_operator(
        sp.record(owner=buyer.address, operator=market.address, token_id=0, enabled=True),
        _sender=buyer,
    )
    buy(market, buyer, 0, 1, seller, horse_token, 73, price + 1, valid=False, error="PRICE_CHANGED")
    buy(market, buyer, 0, 2, seller, horse_token, 73, price)
    scenario.verify(balance(horse_token, buyer, 73) == 2)
    scenario.verify(balance(horse_currency, seller, 0) == 14 * HORSE_UNIT)
    scenario.verify(balance(horse_currency, buyer, 0) == 26 * HORSE_UNIT)
    scenario.verify(market.data.listings[0].remaining == 1)
    market.cancel_listing(0, _sender=buyer, _valid=False, _exception="NOT_AUTHORIZED")
    market.cancel_listing(0, _sender=seller)
    scenario.verify(balance(horse_token, seller, 73) == 1)
    scenario.verify(~market.data.listings.contains(0))
    buy(market, buyer, 0, 1, seller, horse_token, 73, price, valid=False, error="NO_LISTING")


@sp.add_test()
def inspection_permit_is_scoped_to_seller_market_terms_and_epoch():
    scenario = sp.test_scenario("horf_horse_market_permits", [horse_market.main, mock_fa2])
    scenario.add_flag("protocol", "tallinn")
    admin, oracle, seller, buyer, horse_token, _, market = setup(scenario)
    price = 3 * HORSE_UNIT
    market.create_listing(
        token_contract=horse_token.address,
        token_id=73,
        quantity=1,
        unit_price_horse=price + 1,
        nonce=nonce(2),
        signature=inspection_signature(market, oracle, seller, horse_token, 73, 1, price, 2),
        _sender=seller,
        _chain_id=CHAIN_ID,
        _valid=False,
        _exception="BAD_INSPECTION_PERMIT",
    )
    market.create_listing(
        token_contract=horse_token.address,
        token_id=73,
        quantity=1,
        unit_price_horse=price,
        nonce=nonce(3),
        signature=inspection_signature(market, oracle, seller, horse_token, 73, 1, price, 3),
        _sender=buyer,
        _chain_id=CHAIN_ID,
        _valid=False,
        _exception="BAD_INSPECTION_PERMIT",
    )
    market.bump_oracle_epoch(_sender=admin)
    list_horse(market, oracle, seller, horse_token, 73, 1, price, 4, valid=False, error="BAD_INSPECTION_PERMIT")
    list_horse(market, oracle, seller, horse_token, 73, 1, price, 5, epoch=1)
    market.set_blacklisted(wallet=seller.address, blocked=True, _sender=admin)
    buy(market, buyer, 0, 1, seller, horse_token, 73, price, valid=False, error="SELLER_BLACKLISTED")
    market.cancel_listing(0, _sender=seller)
    scenario.verify(balance(horse_token, seller, 73) == 3)


@sp.add_test()
def only_admin_can_change_trust_controls():
    scenario = sp.test_scenario("horf_horse_market_admin", [horse_market.main, mock_fa2])
    scenario.add_flag("protocol", "tallinn")
    admin, oracle, seller, _, horse_token, _, market = setup(scenario)
    market.set_blacklisted(wallet=seller.address, blocked=True, _sender=seller, _valid=False, _exception="NOT_ADMIN")
    market.set_oracle_key(oracle.public_key, _sender=seller, _valid=False, _exception="NOT_ADMIN")
    market.set_token_blocked(
        token_contract=horse_token.address, token_id=73, blocked=True,
        _sender=seller, _valid=False, _exception="NOT_ADMIN",
    )
    market.set_token_blocked(token_contract=horse_token.address, token_id=73, blocked=True, _sender=admin)
    list_horse(market, oracle, seller, horse_token, 73, 1, HORSE_UNIT, 7, valid=False, error="TOKEN_BLOCKED")
    market.set_token_blocked(token_contract=horse_token.address, token_id=73, blocked=False, _sender=admin)
    market.set_blacklisted(wallet=seller.address, blocked=True, _sender=admin)
    list_horse(market, oracle, seller, horse_token, 73, 1, HORSE_UNIT, 6, valid=False, error="TRADER_BLACKLISTED")


@sp.add_test()
def revoked_token_cannot_be_bought_but_can_be_cancelled():
    scenario = sp.test_scenario("horf_horse_market_revocation", [horse_market.main, mock_fa2])
    scenario.add_flag("protocol", "tallinn")
    admin, oracle, seller, buyer, horse_token, horse_currency, market = setup(scenario)
    list_horse(market, oracle, seller, horse_token, 73, 1, HORSE_UNIT, 8)
    horse_currency.set_operator(
        sp.record(owner=buyer.address, operator=market.address, token_id=0, enabled=True),
        _sender=buyer,
    )
    market.set_token_blocked(token_contract=horse_token.address, token_id=73, blocked=True, _sender=admin)
    buy(market, buyer, 0, 1, seller, horse_token, 73, HORSE_UNIT, valid=False, error="TOKEN_BLOCKED")
    scenario.verify(balance(horse_currency, seller, 0) == 0)
    market.cancel_listing(0, _sender=seller)
    scenario.verify(balance(horse_token, seller, 73) == 3)


@sp.add_test()
def fake_fa2_proves_marshal_must_review_transfer_semantics():
    scenario = sp.test_scenario(
        "horf_horse_market_noop_fa2_residual_risk",
        [horse_market.main, mock_fa2, mock_noop_fa2],
    )
    scenario.add_flag("protocol", "tallinn")
    admin = sp.test_account("Admin")
    oracle = sp.test_account("Oracle")
    seller = sp.test_account("Seller")
    buyer = sp.test_account("Buyer")
    fake_horse = mock_noop_fa2.NoopFA2()
    horse_currency = mock_fa2.MockFA2()
    market = horse_market.main.HorseMarket(admin.address, oracle.public_key, horse_currency.address)
    scenario += fake_horse
    scenario += horse_currency
    scenario += market
    horse_currency.mint(owner=buyer.address, token_id=0, amount=HORSE_UNIT)
    horse_currency.set_operator(
        owner=buyer.address, operator=market.address, token_id=0, enabled=True,
        _sender=buyer,
    )
    # This intentionally models a mistaken oracle approval. The contract
    # cannot discover that the fake FA2 did not move anything.
    list_horse(market, oracle, seller, fake_horse, 73, 1, HORSE_UNIT, 9)
    buy(market, buyer, 0, 1, seller, fake_horse, 73, HORSE_UNIT)
    scenario.verify(balance(horse_currency, seller, 0) == HORSE_UNIT)
