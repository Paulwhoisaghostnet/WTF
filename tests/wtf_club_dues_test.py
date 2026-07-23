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


dues_contract = load_module(
    "wtf_club_dues_contract",
    ROOT / "contracts" / "wtf-club-dues" / "WtfClubDues.py",
)

main = dues_contract.main


def new_fixture():
    admin = sp.test_account("Admin")
    treasury = sp.test_account("Treasury")
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")

    dues = main.WtfClubDues(
        admin=admin.address,
        treasury=treasury.address,
        club_name="WTF Club",
        membership_symbol="DUES",
        metadata_uri="ipfs://drop-0",
        monthly_due=sp.mutez(1_000_000),
        month_seconds=sp.nat(30),
        utility_units_per_month=sp.nat(7),
        grace_period_seconds=sp.nat(10),
    )
    return SimpleNamespace(admin=admin, treasury=treasury, alice=alice, bob=bob), dues


@sp.add_test()
def test_legacy_pay_dues_renews_without_new_month_art():
    scenario = sp.test_scenario("club_dues_legacy_renewal_keeps_art", [main])
    accounts, dues = new_fixture()
    scenario += dues

    alice_tier0 = (accounts.alice.address, 0)

    dues.default(
        _sender=accounts.alice,
        _amount=sp.mutez(1),
        _valid=False,
        _exception="DEFAULT_DISABLED",
    )
    dues.pay_dues(
        sp.record(payment_ref="alice-0", months=0),
        _sender=accounts.alice,
        _amount=sp.mutez(0),
        _valid=False,
        _exception="ZERO_MONTHS",
    )
    dues.pay_dues(
        sp.record(payment_ref="alice-1", months=1),
        _sender=accounts.alice,
        _amount=sp.mutez(999_999),
        _valid=False,
        _exception="BAD_DUES_AMOUNT",
    )

    dues.pay_dues(
        sp.record(payment_ref="alice-1", months=1),
        _sender=accounts.alice,
        _amount=sp.mutez(1_000_000),
        _now=sp.timestamp(100),
    )
    scenario.verify(dues.data.members.contains(alice_tier0))
    scenario.verify(dues.data.members[alice_tier0].active_token_id == 0)
    scenario.verify(dues.data.members[alice_tier0].paid_through == sp.timestamp(130))
    scenario.verify(dues.data.members[alice_tier0].utility_units == 7)
    scenario.verify(dues.data.tier_utility_balances[alice_tier0] == 7)
    scenario.verify(dues.data.utility_balances[accounts.alice.address] == 7)
    scenario.verify(dues.data.token_receipts[0].metadata_uri == "ipfs://drop-0")
    scenario.verify(dues.data.token_receipts[0].status == 0)
    scenario.verify(dues.data.drops[0].edition_count == 1)
    scenario.verify(dues.data.next_membership_token_id == 1)
    scenario.verify(dues.balance == sp.mutez(0))

    dues.set_current_drop(
        sp.record(
            drop_id=sp.nat(1),
            metadata_uri="ipfs://drop-1",
            art_hash="sha256:drop-1",
            terms_uri="ipfs://terms-1",
            active=True,
        ),
        _sender=accounts.admin,
        _now=sp.timestamp(105),
    )
    dues.pay_dues(
        sp.record(payment_ref="alice-renew", months=2),
        _sender=accounts.alice,
        _amount=sp.mutez(2_000_000),
        _now=sp.timestamp(110),
    )
    scenario.verify(dues.data.members[alice_tier0].active_token_id == 0)
    scenario.verify(dues.data.members[alice_tier0].paid_through == sp.timestamp(190))
    scenario.verify(dues.data.members[alice_tier0].utility_units == 21)
    scenario.verify(dues.data.token_receipts[0].metadata_uri == "ipfs://drop-0")
    scenario.verify(dues.data.token_receipts[0].paid_through == sp.timestamp(190))
    scenario.verify(dues.data.drops[1].edition_count == 0)
    scenario.verify(dues.data.next_membership_token_id == 1)


@sp.add_test()
def test_tiered_drop_actions_replace_preserve_and_mint():
    scenario = sp.test_scenario("club_dues_tiered_drop_actions", [main])
    accounts, dues = new_fixture()
    scenario += dues

    alice_tier1 = (accounts.alice.address, 1)

    dues.set_tier(
        sp.record(
            tier_id=sp.nat(1),
            name="VIP",
            price=sp.mutez(2_000_000),
            period_seconds=sp.nat(60),
            utility_units_per_period=sp.nat(11),
            metadata_uri="ipfs://vip",
            active=True,
        ),
        _sender=accounts.admin,
    )
    dues.set_current_drop(
        sp.record(
            drop_id=sp.nat(1),
            metadata_uri="ipfs://june-art",
            art_hash="sha256:june",
            terms_uri="ipfs://june-terms",
            active=True,
        ),
        _sender=accounts.admin,
        _now=sp.timestamp(90),
    )

    dues.pay_membership(
        sp.record(payment_ref="vip-first", periods=1, tier_id=1, action=1),
        _sender=accounts.alice,
        _amount=sp.mutez(2_000_000),
        _now=sp.timestamp(100),
    )
    scenario.verify(dues.data.members[alice_tier1].active_token_id == 0)
    scenario.verify(dues.data.members[alice_tier1].paid_through == sp.timestamp(160))
    scenario.verify(dues.data.token_receipts[0].metadata_uri == "ipfs://june-art")
    scenario.verify(dues.data.drops[1].edition_count == 1)
    scenario.verify(dues.data.next_membership_token_id == 1)

    dues.set_current_drop(
        sp.record(
            drop_id=sp.nat(2),
            metadata_uri="ipfs://july-art",
            art_hash="sha256:july",
            terms_uri="ipfs://july-terms",
            active=True,
        ),
        _sender=accounts.admin,
        _now=sp.timestamp(105),
    )
    dues.pay_membership(
        sp.record(payment_ref="vip-renew-old-art", periods=1, tier_id=1, action=0),
        _sender=accounts.alice,
        _amount=sp.mutez(2_000_000),
        _now=sp.timestamp(110),
    )
    scenario.verify(dues.data.members[alice_tier1].active_token_id == 0)
    scenario.verify(dues.data.members[alice_tier1].paid_through == sp.timestamp(220))
    scenario.verify(dues.data.token_receipts[0].metadata_uri == "ipfs://june-art")
    scenario.verify(dues.data.drops[2].edition_count == 0)
    scenario.verify(dues.data.next_membership_token_id == 1)

    dues.pay_membership(
        sp.record(payment_ref="vip-replace-with-july", periods=1, tier_id=1, action=1),
        _sender=accounts.alice,
        _amount=sp.mutez(2_000_000),
        _now=sp.timestamp(120),
    )
    scenario.verify(dues.data.members[alice_tier1].active_token_id == 1)
    scenario.verify(dues.data.members[alice_tier1].replaced_count == 1)
    scenario.verify(dues.data.token_receipts[0].status == 2)
    scenario.verify(dues.data.ledger[(accounts.alice.address, 0)] == 0)
    scenario.verify(dues.data.token_receipts[1].metadata_uri == "ipfs://july-art")
    scenario.verify(dues.data.token_receipts[1].status == 0)
    scenario.verify(dues.data.drops[2].edition_count == 1)
    scenario.verify(dues.data.next_membership_token_id == 2)

    dues.set_current_drop(
        sp.record(
            drop_id=sp.nat(3),
            metadata_uri="ipfs://august-art",
            art_hash="sha256:august",
            terms_uri="ipfs://august-terms",
            active=True,
        ),
        _sender=accounts.admin,
        _now=sp.timestamp(125),
    )
    dues.pay_membership(
        sp.record(payment_ref="vip-preserve-and-mint", periods=1, tier_id=1, action=2),
        _sender=accounts.alice,
        _amount=sp.mutez(3_000_000),
        _now=sp.timestamp(130),
    )
    scenario.verify(dues.data.members[alice_tier1].active_token_id == 2)
    scenario.verify(dues.data.members[alice_tier1].preserved_count == 1)
    scenario.verify(dues.data.token_receipts[1].status == 1)
    scenario.verify(dues.data.ledger[(accounts.alice.address, 1)] == 1)
    scenario.verify(dues.data.token_receipts[2].metadata_uri == "ipfs://august-art")
    scenario.verify(dues.data.token_receipts[2].status == 0)
    scenario.verify(dues.data.drops[3].edition_count == 1)
    scenario.verify(dues.data.next_membership_token_id == 3)
    scenario.verify(dues.balance == sp.mutez(0))


@sp.add_test()
def test_admin_arrears_and_terms_controls():
    scenario = sp.test_scenario("club_dues_arrears_controls", [main])
    accounts, dues = new_fixture()
    scenario += dues

    bob_tier0 = (accounts.bob.address, 0)

    dues.register_member(accounts.bob.address, _sender=accounts.bob, _valid=False, _exception="ADMIN_ONLY")
    dues.register_member(accounts.bob.address, _sender=accounts.admin, _now=sp.timestamp(5))
    scenario.verify(dues.data.members[bob_tier0].active_token_id == 0)

    dues.mark_arrears(
        accounts.bob.address,
        _sender=accounts.admin,
        _now=sp.timestamp(12),
        _valid=False,
        _exception="NOT_IN_ARREARS",
    )
    dues.mark_arrears(accounts.bob.address, _sender=accounts.admin, _now=sp.timestamp(20))
    scenario.verify(dues.data.naughty_list.contains(bob_tier0))

    dues.clear_arrears(accounts.bob.address, _sender=accounts.admin, _now=sp.timestamp(21))
    scenario.verify(~dues.data.naughty_list.contains(bob_tier0))

    dues.update_terms(
        sp.record(
            treasury=accounts.treasury.address,
            monthly_due=sp.mutez(2_000_000),
            month_seconds=sp.nat(3_600),
            utility_units_per_month=sp.nat(11),
            grace_period_seconds=sp.nat(20),
            metadata_uri="ipfs://new",
        ),
        _sender=accounts.admin,
    )
    dues.pay_dues(
        sp.record(payment_ref="bob-renew", months=1),
        _sender=accounts.bob,
        _amount=sp.mutez(2_000_000),
        _now=sp.timestamp(25),
    )
    scenario.verify(dues.data.members[bob_tier0].paid_through == sp.timestamp(3_625))
    scenario.verify(dues.data.members[bob_tier0].utility_units == 11)
    scenario.verify(~dues.data.naughty_list.contains(bob_tier0))


@sp.add_test()
def test_two_step_admin_rotation_and_zero_tez_admin_calls():
    scenario = sp.test_scenario("club_dues_admin_rotation", [main])
    accounts, dues = new_fixture()
    scenario += dues

    scenario.verify(dues.data.version == "wtf-club-dues-v2")
    scenario.verify(dues.data.pending_admin.is_none())

    dues.propose_admin(
        accounts.bob.address,
        _sender=accounts.alice,
        _valid=False,
        _exception="ADMIN_ONLY",
    )
    dues.propose_admin(
        accounts.bob.address,
        _sender=accounts.admin,
        _amount=sp.mutez(1),
        _valid=False,
        _exception="NO_TEZ",
    )
    dues.propose_admin(accounts.bob.address, _sender=accounts.admin)
    scenario.verify(dues.data.pending_admin.unwrap_some() == accounts.bob.address)

    dues.accept_admin(
        _sender=accounts.alice,
        _valid=False,
        _exception="NOT_PENDING_ADMIN",
    )
    dues.accept_admin(_sender=accounts.bob)
    scenario.verify(dues.data.admin == accounts.bob.address)
    scenario.verify(dues.data.pending_admin.is_none())

    dues.set_preserve_fee(
        sp.mutez(2_000_000),
        _sender=accounts.admin,
        _valid=False,
        _exception="ADMIN_ONLY",
    )
    dues.set_preserve_fee(
        sp.mutez(2_000_000),
        _sender=accounts.bob,
        _amount=sp.mutez(1),
        _valid=False,
        _exception="NO_TEZ",
    )
    dues.set_preserve_fee(sp.mutez(2_000_000), _sender=accounts.bob)
    scenario.verify(dues.data.preserve_fee == sp.mutez(2_000_000))
