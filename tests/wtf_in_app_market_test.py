import importlib.util
from pathlib import Path
from types import SimpleNamespace

import smartpy as sp


ROOT = Path(__file__).resolve().parents[1]


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


market_contract = load_module(
    "wtf_in_app_market_contract",
    ROOT / "contracts" / "wtf-in-app-market" / "WtfInAppMarket.py",
)
dummy_wtf_contract = load_module(
    "dummy_wtf_fa2_contract",
    ROOT / "contracts" / "wtf-xtz-exchange" / "DummyWtfFA2.py",
)

market_main = market_contract.main
dummy = dummy_wtf_contract.main


def ledger_balance(token_contract, owner, token_id=0):
    if token_id != 0:
        raise ValueError("DummyWtfFA2 is a single-asset token; only token_id 0 exists.")
    return token_contract.data.ledger.get(owner, default_value=sp.nat(0))


def operator_key(owner, operator, token_id=0):
    return sp.record(owner=owner, operator=operator, token_id=token_id)


def add_market_operator(token, owner, market_address):
    token.update_operators(
        [
            sp.variant(
                "add_operator",
                operator_key(owner.address, market_address),
            )
        ],
        _sender=owner,
    )


def new_fixture():
    admin = sp.test_account("Admin")
    buyer = sp.test_account("Buyer")
    buyer2 = sp.test_account("SecondBuyer")
    treasury = sp.test_account("GameshowTreasury")

    token = dummy.DummyWtfFA2(
        admin=admin.address,
        metadata=sp.big_map({"": sp.bytes("0x")}),
        ledger={},
        token_metadata=dummy_wtf_contract.token_metadata(),
    )
    market = market_main.WtfInAppMarket(
        wtf_token_address=token.address,
        wtf_token_id=0,
        treasury=treasury.address,
    )
    accounts = SimpleNamespace(
        admin=admin,
        buyer=buyer,
        buyer2=buyer2,
        treasury=treasury,
    )
    return accounts, token, market


def add_fixture_to_scenario(scenario, token, market):
    scenario += token
    scenario += market


@sp.add_test()
def test_payment_router_forwards_wtf_to_treasury():
    scenario = sp.test_scenario("wtf_in_app_market_payment_router", [dummy, market_main])
    accounts, token, market = new_fixture()
    add_fixture_to_scenario(scenario, token, market)

    scenario.verify(market.data.wtf_token_address == token.address)
    scenario.verify(market.data.wtf_token_id == 0)
    scenario.verify(market.data.treasury == accounts.treasury.address)

    token.mint(
        [sp.record(to_=accounts.buyer.address, amount=12_000_000_000)],
        _sender=accounts.admin,
    )
    add_market_operator(token, accounts.buyer, market.address)

    market.default(
        _sender=accounts.buyer,
        _amount=sp.mutez(1),
        _valid=False,
        _exception="DEFAULT_DISABLED",
    )

    market.purchase(
        sp.record(
            listing_id=0,
            amount_wtf_units=1_000_000_000,
            purchase_ref="pet-food",
        ),
        _sender=accounts.buyer,
        _amount=sp.mutez(1),
        _valid=False,
        _exception="NO_XTZ_IN",
    )
    market.purchase(
        sp.record(
            listing_id=0,
            amount_wtf_units=0,
            purchase_ref="pet-food",
        ),
        _sender=accounts.buyer,
        _valid=False,
        _exception="ZERO_AMOUNT",
    )
    market.purchase(
        sp.record(
            listing_id=0,
            amount_wtf_units=1_000_000_000,
            purchase_ref="x" * 129,
        ),
        _sender=accounts.buyer,
        _valid=False,
        _exception="PURCHASE_REF_TOO_LONG",
    )

    market.purchase(
        sp.record(
            listing_id=0,
            amount_wtf_units=1_000_000_000,
            purchase_ref="pet-food",
        ),
        _sender=accounts.buyer,
    )
    scenario.verify(ledger_balance(token, accounts.buyer.address) == 11_000_000_000)
    scenario.verify(ledger_balance(token, accounts.treasury.address) == 1_000_000_000)
    scenario.verify(market.balance == sp.mutez(0))

    market.purchase(
        sp.record(
            listing_id=2,
            amount_wtf_units=5_000_000_000,
            purchase_ref="shoebox",
        ),
        _sender=accounts.buyer,
    )
    scenario.verify(ledger_balance(token, accounts.buyer.address) == 6_000_000_000)
    scenario.verify(ledger_balance(token, accounts.treasury.address) == 6_000_000_000)

    market.purchase(
        sp.record(
            listing_id=1,
            amount_wtf_units=2_500_000_000,
            purchase_ref="no-operator",
        ),
        _sender=accounts.buyer2,
        _valid=False,
    )
