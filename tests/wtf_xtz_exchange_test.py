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


exchange_contract = load_module(
    "wtf_xtz_exchange_contract",
    ROOT / "contracts" / "wtf-xtz-exchange" / "WtfXtzExchange.py",
)
dummy_wtf_contract = load_module(
    "dummy_wtf_fa2_contract",
    ROOT / "contracts" / "wtf-xtz-exchange" / "DummyWtfFA2.py",
)

exchange = exchange_contract.main
dummy = dummy_wtf_contract.main


def ledger_balance(token_contract, owner, token_id=0):
    if token_id != 0:
        raise ValueError("DummyWtfFA2 is a single-asset token; only token_id 0 exists.")
    return token_contract.data.ledger.get(
        owner,
        default_value=sp.nat(0),
    )


def operator_key(owner, operator, token_id=0):
    return sp.record(owner=owner, operator=operator, token_id=token_id)


def add_exchange_operator(token, owner, exchange_address):
    token.update_operators(
        [
            sp.variant(
                "add_operator",
                operator_key(owner.address, exchange_address),
            )
        ],
        _sender=owner,
    )


def new_fixture():
    admin = sp.test_account("Admin")
    owner = sp.test_account("ListingOwner")
    owner2 = sp.test_account("SecondOwner")
    taker = sp.test_account("Taker")
    taker2 = sp.test_account("SecondTaker")
    attacker = sp.test_account("Attacker")

    token = dummy.DummyWtfFA2(
        admin=admin.address,
        metadata=sp.big_map({"": sp.bytes("0x")}),
        ledger={},
        token_metadata=dummy_wtf_contract.token_metadata(),
    )
    exchange_contract_instance = exchange.WtfXtzExchange(
        admin=admin.address,
        wtf_token_address=token.address,
        wtf_token_id=0,
        metadata=sp.big_map({"": sp.bytes("0x")}),
    )
    accounts = SimpleNamespace(
        admin=admin,
        owner=owner,
        owner2=owner2,
        taker=taker,
        taker2=taker2,
        attacker=attacker,
    )
    return accounts, token, exchange_contract_instance


def add_fixture_to_scenario(scenario, token, exchange_contract_instance):
    scenario += token
    scenario += exchange_contract_instance


@sp.add_test()
def test_create_listing_and_bad_inputs():
    scenario = sp.test_scenario("wtf_xtz_create_listing_and_bad_inputs", [dummy, exchange])
    accounts, token, market = new_fixture()
    add_fixture_to_scenario(scenario, token, market)

    market.default(
        _sender=accounts.owner,
        _amount=sp.mutez(1),
        _valid=False,
        _exception="DEFAULT_DISABLED",
    )

    market.create_listing(
        sp.record(rate_numerator_mutez=3, rate_denominator_wtf_units=2),
        _sender=accounts.owner,
        _amount=sp.mutez(10_000),
        _now=sp.timestamp(100),
    )

    listing = market.data.listings[0]
    scenario.verify(listing.listing_id == 0)
    scenario.verify(listing.owner == accounts.owner.address)
    scenario.verify(listing.original_escrow_mutez == sp.mutez(10_000))
    scenario.verify(listing.remaining_escrow_mutez == sp.mutez(10_000))
    scenario.verify(listing.remaining_escrow_mutez == listing.original_escrow_mutez)
    scenario.verify(listing.rate_numerator_mutez == 3)
    scenario.verify(listing.rate_denominator_wtf_units == 2)
    scenario.verify(listing.active)
    scenario.verify(listing.status_code == 0)
    scenario.verify(listing.total_wtf_filled == 0)
    scenario.verify(listing.created_at == sp.timestamp(100))
    scenario.verify(market.data.next_listing_id == 1)

    market.create_listing(
        sp.record(rate_numerator_mutez=1, rate_denominator_wtf_units=1),
        _sender=accounts.owner,
        _amount=sp.mutez(0),
        _valid=False,
        _exception="ZERO_ESCROW",
    )
    market.create_listing(
        sp.record(rate_numerator_mutez=0, rate_denominator_wtf_units=1),
        _sender=accounts.owner,
        _amount=sp.mutez(1),
        _valid=False,
        _exception="ZERO_RATE_NUMERATOR",
    )
    market.create_listing(
        sp.record(rate_numerator_mutez=1, rate_denominator_wtf_units=0),
        _sender=accounts.owner,
        _amount=sp.mutez(1),
        _valid=False,
        _exception="ZERO_RATE_DENOMINATOR",
    )


@sp.add_test()
def test_swap_partial_fill_rounding_and_exhaustion():
    scenario = sp.test_scenario("wtf_xtz_swap_partial_fill_rounding_and_exhaustion", [dummy, exchange])
    accounts, token, market = new_fixture()
    add_fixture_to_scenario(scenario, token, market)

    token.mint([sp.record(to_=accounts.taker.address, amount=10_000)], _sender=accounts.admin)
    add_exchange_operator(token, accounts.taker, market.address)

    market.create_listing(
        sp.record(rate_numerator_mutez=3, rate_denominator_wtf_units=2),
        _sender=accounts.owner,
        _amount=sp.mutez(10_000),
    )
    scenario.verify(market.balance == sp.mutez(10_000))

    market.swap(
        sp.record(listing_id=0, wtf_amount=1),
        _sender=accounts.taker,
        _amount=sp.mutez(1),
        _valid=False,
        _exception="NO_XTZ_IN",
    )

    market.swap(sp.record(listing_id=0, wtf_amount=1_000), _sender=accounts.taker)
    scenario.verify(ledger_balance(token, accounts.owner.address) == 1_000)
    scenario.verify(ledger_balance(token, accounts.taker.address) == 9_000)
    scenario.verify(market.data.listings[0].remaining_escrow_mutez == sp.mutez(8_500))
    scenario.verify(market.data.listings[0].total_wtf_filled == 1_000)
    scenario.verify(market.data.listings[0].total_xtz_paid_out_mutez == sp.mutez(1_500))
    scenario.verify(market.data.listings[0].active)
    scenario.verify(market.balance == sp.mutez(8_500))

    market.swap(sp.record(listing_id=0, wtf_amount=2_001), _sender=accounts.taker)
    scenario.verify(market.data.listings[0].remaining_escrow_mutez == sp.mutez(5_499))
    scenario.verify(market.data.listings[0].total_wtf_filled == 3_001)
    scenario.verify(market.data.listings[0].total_xtz_paid_out_mutez == sp.mutez(4_501))
    scenario.verify(ledger_balance(token, accounts.owner.address) == 3_001)
    scenario.verify(ledger_balance(token, accounts.taker.address) == 6_999)

    market.swap(
        sp.record(listing_id=0, wtf_amount=3_667),
        _sender=accounts.taker,
        _valid=False,
        _exception="INSUFFICIENT_ESCROW",
    )
    market.swap(
        sp.record(listing_id=0, wtf_amount=0),
        _sender=accounts.taker,
        _valid=False,
        _exception="ZERO_WTF_AMOUNT",
    )
    market.swap(
        sp.record(listing_id=99, wtf_amount=1),
        _sender=accounts.taker,
        _valid=False,
        _exception="NO_LISTING",
    )

    market.create_listing(
        sp.record(rate_numerator_mutez=1, rate_denominator_wtf_units=3),
        _sender=accounts.owner,
        _amount=sp.mutez(10),
    )
    market.swap(
        sp.record(listing_id=1, wtf_amount=2),
        _sender=accounts.taker,
        _valid=False,
        _exception="ROUND_TO_ZERO",
    )

    market.create_listing(
        sp.record(rate_numerator_mutez=5, rate_denominator_wtf_units=1),
        _sender=accounts.owner,
        _amount=sp.mutez(10_000),
    )
    market.swap(sp.record(listing_id=2, wtf_amount=2_000), _sender=accounts.taker)
    scenario.verify(market.data.listings[2].remaining_escrow_mutez == sp.mutez(0))
    scenario.verify(market.data.listings[2].active == False)
    scenario.verify(market.data.listings[2].status_code == 1)
    scenario.verify(market.data.listings[2].closed_at.is_some())
    market.swap(
        sp.record(listing_id=2, wtf_amount=1),
        _sender=accounts.taker,
        _valid=False,
        _exception="LISTING_INACTIVE",
    )


@sp.add_test()
def test_operator_balance_and_cancel_paths():
    scenario = sp.test_scenario("wtf_xtz_operator_balance_and_cancel_paths", [dummy, exchange])
    accounts, token, market = new_fixture()
    add_fixture_to_scenario(scenario, token, market)

    token.mint([sp.record(to_=accounts.taker.address, amount=500)], _sender=accounts.admin)

    market.create_listing(
        sp.record(rate_numerator_mutez=10, rate_denominator_wtf_units=1),
        _sender=accounts.owner,
        _amount=sp.mutez(5_000),
    )
    market.swap(
        sp.record(listing_id=0, wtf_amount=100),
        _sender=accounts.taker,
        _valid=False,
    )
    scenario.verify(market.data.listings[0].remaining_escrow_mutez == sp.mutez(5_000))
    scenario.verify(ledger_balance(token, accounts.owner.address) == 0)

    add_exchange_operator(token, accounts.taker, market.address)
    market.swap(
        sp.record(listing_id=0, wtf_amount=600),
        _sender=accounts.taker,
        _valid=False,
    )
    scenario.verify(market.data.listings[0].remaining_escrow_mutez == sp.mutez(5_000))
    scenario.verify(ledger_balance(token, accounts.owner.address) == 0)

    market.swap(sp.record(listing_id=0, wtf_amount=100), _sender=accounts.taker)
    scenario.verify(market.data.listings[0].remaining_escrow_mutez == sp.mutez(4_000))
    scenario.verify(ledger_balance(token, accounts.owner.address) == 100)

    market.cancel_listing(
        0,
        _sender=accounts.attacker,
        _valid=False,
        _exception="NOT_LISTING_OWNER",
    )
    market.cancel_listing(0, _sender=accounts.owner, _now=sp.timestamp(1234))
    scenario.verify(market.data.listings[0].remaining_escrow_mutez == sp.mutez(0))
    scenario.verify(market.data.listings[0].cancelled_refund_mutez == sp.mutez(4_000))
    scenario.verify(market.data.listings[0].status_code == 2)
    scenario.verify(market.data.listings[0].active == False)
    scenario.verify(market.data.listings[0].cancelled_at == sp.Some(sp.timestamp(1234)))
    scenario.verify(market.balance == sp.mutez(0))


@sp.add_test()
def test_pause_and_two_step_admin():
    scenario = sp.test_scenario("wtf_xtz_pause_and_two_step_admin", [dummy, exchange])
    accounts, token, market = new_fixture()
    add_fixture_to_scenario(scenario, token, market)

    token.mint([sp.record(to_=accounts.taker.address, amount=1_000)], _sender=accounts.admin)
    add_exchange_operator(token, accounts.taker, market.address)

    market.create_listing(
        sp.record(rate_numerator_mutez=1, rate_denominator_wtf_units=1),
        _sender=accounts.owner,
        _amount=sp.mutez(100),
    )

    market.pause(_sender=accounts.attacker, _valid=False, _exception="NOT_ADMIN")
    market.pause(_sender=accounts.admin)
    scenario.verify(market.data.paused)

    market.create_listing(
        sp.record(rate_numerator_mutez=1, rate_denominator_wtf_units=1),
        _sender=accounts.owner,
        _amount=sp.mutez(1),
        _valid=False,
        _exception="PAUSED",
    )
    market.swap(
        sp.record(listing_id=0, wtf_amount=1),
        _sender=accounts.taker,
        _valid=False,
        _exception="PAUSED",
    )
    market.cancel_listing(0, _sender=accounts.owner)
    scenario.verify(market.data.listings[0].status_code == 2)

    market.unpause(_sender=accounts.attacker, _valid=False, _exception="NOT_ADMIN")
    market.unpause(_sender=accounts.admin)
    scenario.verify(market.data.paused == False)

    market.propose_admin(accounts.owner.address, _sender=accounts.attacker, _valid=False, _exception="NOT_ADMIN")
    market.propose_admin(accounts.owner.address, _sender=accounts.admin)
    scenario.verify(market.data.pending_admin == sp.Some(accounts.owner.address))
    market.accept_admin(_sender=accounts.attacker, _valid=False, _exception="NOT_PENDING_ADMIN")
    market.accept_admin(_sender=accounts.owner)
    scenario.verify(market.data.admin == accounts.owner.address)
    scenario.verify(market.data.pending_admin == sp.cast(None, sp.option[sp.address]))

    market.propose_admin(accounts.owner2.address, _sender=accounts.owner)
    scenario.verify(market.data.pending_admin == sp.Some(accounts.owner2.address))
    market.cancel_pending_admin(_sender=accounts.owner)
    scenario.verify(market.data.pending_admin == sp.cast(None, sp.option[sp.address]))


@sp.add_test()
def test_multiple_listings_and_owners_are_isolated():
    scenario = sp.test_scenario("wtf_xtz_multiple_listings_and_owners_are_isolated", [dummy, exchange])
    accounts, token, market = new_fixture()
    add_fixture_to_scenario(scenario, token, market)

    token.mint([sp.record(to_=accounts.taker.address, amount=1_000)], _sender=accounts.admin)
    token.mint([sp.record(to_=accounts.taker2.address, amount=1_000)], _sender=accounts.admin)
    add_exchange_operator(token, accounts.taker, market.address)
    add_exchange_operator(token, accounts.taker2, market.address)

    market.create_listing(
        sp.record(rate_numerator_mutez=2, rate_denominator_wtf_units=1),
        _sender=accounts.owner,
        _amount=sp.mutez(1_000),
    )
    market.create_listing(
        sp.record(rate_numerator_mutez=7, rate_denominator_wtf_units=2),
        _sender=accounts.owner2,
        _amount=sp.mutez(2_000),
    )

    market.swap(sp.record(listing_id=0, wtf_amount=100), _sender=accounts.taker)
    market.swap(sp.record(listing_id=1, wtf_amount=100), _sender=accounts.taker2)

    scenario.verify(market.data.listings[0].owner == accounts.owner.address)
    scenario.verify(market.data.listings[0].remaining_escrow_mutez == sp.mutez(800))
    scenario.verify(market.data.listings[0].total_wtf_filled == 100)
    scenario.verify(market.data.listings[1].owner == accounts.owner2.address)
    scenario.verify(market.data.listings[1].remaining_escrow_mutez == sp.mutez(1_650))
    scenario.verify(market.data.listings[1].total_wtf_filled == 100)

    scenario.verify(ledger_balance(token, accounts.owner.address) == 100)
    scenario.verify(ledger_balance(token, accounts.owner2.address) == 100)
    scenario.verify(ledger_balance(token, accounts.taker.address) == 900)
    scenario.verify(ledger_balance(token, accounts.taker2.address) == 900)
    scenario.verify(market.balance == sp.mutez(2_450))
