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


casino_contract = load_module(
    "wtf_casino_membership_contract",
    ROOT / "contracts" / "wtf-casino-membership" / "WtfCasinoMembership.py",
)

casino = casino_contract.main


def new_fixture():
    buyer = sp.test_account("Buyer")
    treasury = sp.test_account("GameshowTreasury")
    attacker = sp.test_account("Attacker")
    membership = casino.WtfCasinoMembership(treasury=treasury.address)
    accounts = SimpleNamespace(
        buyer=buyer,
        treasury=treasury,
        attacker=attacker,
    )
    return accounts, membership


@sp.add_test()
def test_membership_router_rejects_bad_inputs():
    scenario = sp.test_scenario("wtf_casino_membership_bad_inputs", casino)
    accounts, membership = new_fixture()
    scenario += membership

    scenario.verify(membership.data.treasury == accounts.treasury.address)
    scenario.verify(membership.data.membership_fee == sp.tez(1))

    membership.default(
        _sender=accounts.buyer,
        _amount=sp.tez(1),
        _valid=False,
        _exception="DEFAULT_DISABLED",
    )
    membership.purchase_membership(
        sp.record(membership_ref="casino:test:zero"),
        _sender=accounts.buyer,
        _amount=sp.mutez(0),
        _valid=False,
        _exception="BAD_MEMBERSHIP_FEE",
    )
    membership.purchase_membership(
        sp.record(membership_ref="casino:test:underpay"),
        _sender=accounts.buyer,
        _amount=sp.mutez(999_999),
        _valid=False,
        _exception="BAD_MEMBERSHIP_FEE",
    )
    membership.purchase_membership(
        sp.record(membership_ref="casino:test:overpay"),
        _sender=accounts.buyer,
        _amount=sp.mutez(1_000_001),
        _valid=False,
        _exception="BAD_MEMBERSHIP_FEE",
    )
    membership.purchase_membership(
        sp.record(membership_ref=""),
        _sender=accounts.buyer,
        _amount=sp.tez(1),
        _valid=False,
        _exception="MEMBERSHIP_REF_REQUIRED",
    )
    membership.purchase_membership(
        sp.record(membership_ref="x" * 129),
        _sender=accounts.buyer,
        _amount=sp.tez(1),
        _valid=False,
        _exception="MEMBERSHIP_REF_TOO_LONG",
    )


@sp.add_test()
def test_membership_router_forwards_exact_xtz_to_treasury():
    scenario = sp.test_scenario("wtf_casino_membership_forwarding", casino)
    accounts, membership = new_fixture()
    scenario += membership

    membership.purchase_membership(
        sp.record(membership_ref="casino:buyer:membership-001"),
        _sender=accounts.buyer,
        _amount=sp.tez(1),
    )
    scenario.verify(membership.balance == sp.mutez(0))

    membership.purchase_membership(
        sp.record(membership_ref="casino:attacker:membership-002"),
        _sender=accounts.attacker,
        _amount=sp.tez(1),
    )
    scenario.verify(membership.balance == sp.mutez(0))
