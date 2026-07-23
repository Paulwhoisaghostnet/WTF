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
    issuer = sp.test_account("RewardIssuer")
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
        issuer=issuer,
        buyer=buyer,
        buyer2=buyer2,
        treasury=treasury,
    )
    return accounts, token, market


def add_fixture_to_scenario(scenario, token, market):
    scenario += token
    scenario += market


def purchase_v2_params(
    market,
    token,
    treasury,
    amount=1_000_000_000,
    listing_id=0,
    purchase_ref="cart:1:test",
    cart_hash="a" * 64,
):
    return sp.record(
        listing_id=listing_id,
        amount_wtf_units=amount,
        purchase_ref=purchase_ref,
        cart_hash=cart_hash,
        expected_treasury=treasury.address,
        expected_wtf_token_address=token.address,
        expected_wtf_token_id=0,
    )


def fund_params(token, amount=10_000_000_000):
    return sp.record(
        amount_wtf_units=amount,
        expected_wtf_token_address=token.address,
        expected_wtf_token_id=0,
    )


def create_redemption_params(
    claimant,
    amount=2_000_000_000,
    redemption_id=1,
    item_ref="tip:1:pet-food",
    expires_at=sp.timestamp(1_000),
):
    return sp.record(
        redemption_id=redemption_id,
        claimant=claimant.address,
        amount_wtf_units=amount,
        item_ref=item_ref,
        expires_at=expires_at,
    )


def claim_redemption_params(
    token,
    claimant,
    amount=2_000_000_000,
    redemption_id=1,
    item_ref="tip:1:pet-food",
):
    return sp.record(
        redemption_id=redemption_id,
        expected_claimant=claimant.address,
        expected_amount_wtf_units=amount,
        expected_item_ref=item_ref,
        expected_wtf_token_address=token.address,
        expected_wtf_token_id=0,
    )


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


@sp.add_test()
def test_v2_purchase_binds_expected_terms():
    scenario = sp.test_scenario("wtf_in_app_market_v2_purchase", [dummy, market_main])
    accounts, token, _market = new_fixture()
    market = market_main.WtfInAppMarketV2(
        wtf_token_address=token.address,
        wtf_token_id=0,
        treasury=accounts.treasury.address,
    )
    add_fixture_to_scenario(scenario, token, market)

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
        purchase_v2_params(market, token, accounts.treasury),
        _sender=accounts.buyer,
        _amount=sp.mutez(1),
        _valid=False,
        _exception="NO_XTZ_IN",
    )
    market.purchase(
        purchase_v2_params(market, token, accounts.treasury, amount=0),
        _sender=accounts.buyer,
        _valid=False,
        _exception="ZERO_AMOUNT",
    )
    market.purchase(
        purchase_v2_params(market, token, accounts.treasury, purchase_ref=""),
        _sender=accounts.buyer,
        _valid=False,
        _exception="EMPTY_PURCHASE_REF",
    )
    market.purchase(
        purchase_v2_params(market, token, accounts.treasury, cart_hash=""),
        _sender=accounts.buyer,
        _valid=False,
        _exception="EMPTY_CART_HASH",
    )
    market.purchase(
        purchase_v2_params(market, token, accounts.treasury, cart_hash="a" * 129),
        _sender=accounts.buyer,
        _valid=False,
        _exception="CART_HASH_TOO_LONG",
    )
    market.purchase(
        sp.record(
            listing_id=0,
            amount_wtf_units=1_000_000_000,
            purchase_ref="cart:bad:treasury",
            cart_hash="b" * 64,
            expected_treasury=accounts.buyer2.address,
            expected_wtf_token_address=token.address,
            expected_wtf_token_id=0,
        ),
        _sender=accounts.buyer,
        _valid=False,
        _exception="TREASURY_MISMATCH",
    )
    market.purchase(
        sp.record(
            listing_id=0,
            amount_wtf_units=1_000_000_000,
            purchase_ref="cart:bad:token",
            cart_hash="c" * 64,
            expected_treasury=accounts.treasury.address,
            expected_wtf_token_address=market.address,
            expected_wtf_token_id=0,
        ),
        _sender=accounts.buyer,
        _valid=False,
        _exception="TOKEN_ADDRESS_MISMATCH",
    )
    market.purchase(
        sp.record(
            listing_id=0,
            amount_wtf_units=1_000_000_000,
            purchase_ref="cart:bad:token-id",
            cart_hash="d" * 64,
            expected_treasury=accounts.treasury.address,
            expected_wtf_token_address=token.address,
            expected_wtf_token_id=1,
        ),
        _sender=accounts.buyer,
        _valid=False,
        _exception="TOKEN_ID_MISMATCH",
    )

    market.purchase(
        purchase_v2_params(
            market,
            token,
            accounts.treasury,
            amount=3_000_000_000,
            purchase_ref="cart:3:ok",
            cart_hash="e" * 64,
        ),
        _sender=accounts.buyer,
    )
    scenario.verify(ledger_balance(token, accounts.buyer.address) == 9_000_000_000)
    scenario.verify(ledger_balance(token, accounts.treasury.address) == 3_000_000_000)
    scenario.verify(market.balance == sp.mutez(0))


@sp.add_test()
def test_redemption_escrow_funds_claims_and_guards_reserved_wtf():
    scenario = sp.test_scenario("wtf_in_app_redemption_escrow", [dummy, market_main])
    accounts, token, _market = new_fixture()
    escrow = market_main.WtfInAppRedemptionEscrow(
        admin=accounts.admin.address,
        issuer=accounts.issuer.address,
        wtf_token_address=token.address,
        wtf_token_id=0,
        metadata=sp.big_map({"": sp.bytes("0x")}),
    )
    scenario += token
    scenario += escrow

    token.mint(
        [sp.record(to_=accounts.issuer.address, amount=20_000_000_000)],
        _sender=accounts.admin,
    )
    add_market_operator(token, accounts.issuer, escrow.address)

    escrow.default(
        _sender=accounts.buyer,
        _amount=sp.mutez(1),
        _valid=False,
        _exception="DEFAULT_DISABLED",
    )
    escrow.fund(
        fund_params(token),
        _sender=accounts.buyer,
        _valid=False,
        _exception="NOT_ISSUER",
    )
    escrow.fund(
        fund_params(token),
        _sender=accounts.issuer,
        _amount=sp.mutez(1),
        _valid=False,
        _exception="NO_XTZ_IN",
    )
    escrow.fund(
        fund_params(token, amount=0),
        _sender=accounts.issuer,
        _valid=False,
        _exception="ZERO_AMOUNT",
    )
    escrow.fund(
        sp.record(
            amount_wtf_units=10_000_000_000,
            expected_wtf_token_address=escrow.address,
            expected_wtf_token_id=0,
        ),
        _sender=accounts.issuer,
        _valid=False,
        _exception="TOKEN_ADDRESS_MISMATCH",
    )

    escrow.fund(fund_params(token), _sender=accounts.issuer)
    scenario.verify(ledger_balance(token, accounts.issuer.address) == 10_000_000_000)
    scenario.verify(ledger_balance(token, escrow.address) == 10_000_000_000)
    scenario.verify(escrow.data.escrow_balance_wtf == 10_000_000_000)
    scenario.verify(escrow.data.reserved_wtf == 0)
    scenario.verify(escrow.data.admin == accounts.admin.address)
    scenario.verify(escrow.data.issuer == accounts.issuer.address)
    scenario.verify(escrow.data.version == "wtf-in-app-redemption-escrow-v2")

    escrow.create_redemption(
        create_redemption_params(accounts.buyer),
        _sender=accounts.admin,
        _now=sp.timestamp(10),
        _valid=False,
        _exception="NOT_ISSUER",
    )
    escrow.create_redemption(
        create_redemption_params(accounts.buyer, amount=0),
        _sender=accounts.issuer,
        _now=sp.timestamp(10),
        _valid=False,
        _exception="ZERO_AMOUNT",
    )
    escrow.create_redemption(
        create_redemption_params(accounts.buyer, item_ref=""),
        _sender=accounts.issuer,
        _now=sp.timestamp(10),
        _valid=False,
        _exception="EMPTY_ITEM_REF",
    )
    escrow.create_redemption(
        create_redemption_params(accounts.buyer, expires_at=sp.timestamp(9)),
        _sender=accounts.issuer,
        _now=sp.timestamp(10),
        _valid=False,
        _exception="EXPIRED_REDEMPTION",
    )
    escrow.create_redemption(
        create_redemption_params(accounts.buyer, amount=11_000_000_000),
        _sender=accounts.issuer,
        _now=sp.timestamp(10),
        _valid=False,
        _exception="INSUFFICIENT_ESCROW",
    )

    escrow.create_redemption(
        create_redemption_params(accounts.buyer),
        _sender=accounts.issuer,
        _now=sp.timestamp(10),
    )
    scenario.verify(escrow.data.reserved_wtf == 2_000_000_000)
    escrow.create_redemption(
        create_redemption_params(accounts.buyer, redemption_id=1),
        _sender=accounts.issuer,
        _now=sp.timestamp(10),
        _valid=False,
        _exception="REDEMPTION_EXISTS",
    )

    escrow.claim_redemption(
        claim_redemption_params(token, accounts.buyer),
        _sender=accounts.buyer2,
        _now=sp.timestamp(20),
        _valid=False,
        _exception="NOT_CLAIMANT",
    )
    escrow.claim_redemption(
        claim_redemption_params(token, accounts.buyer, amount=1_000_000_000),
        _sender=accounts.buyer,
        _now=sp.timestamp(20),
        _valid=False,
        _exception="AMOUNT_MISMATCH",
    )
    escrow.claim_redemption(
        claim_redemption_params(token, accounts.buyer, item_ref="wrong"),
        _sender=accounts.buyer,
        _now=sp.timestamp(20),
        _valid=False,
        _exception="ITEM_REF_MISMATCH",
    )
    escrow.claim_redemption(
        sp.record(
            redemption_id=1,
            expected_claimant=accounts.buyer.address,
            expected_amount_wtf_units=2_000_000_000,
            expected_item_ref="tip:1:pet-food",
            expected_wtf_token_address=escrow.address,
            expected_wtf_token_id=0,
        ),
        _sender=accounts.buyer,
        _now=sp.timestamp(20),
        _valid=False,
        _exception="TOKEN_ADDRESS_MISMATCH",
    )

    escrow.claim_redemption(
        claim_redemption_params(token, accounts.buyer),
        _sender=accounts.buyer,
        _now=sp.timestamp(20),
    )
    scenario.verify(ledger_balance(token, accounts.buyer.address) == 2_000_000_000)
    scenario.verify(ledger_balance(token, escrow.address) == 8_000_000_000)
    scenario.verify(escrow.data.escrow_balance_wtf == 8_000_000_000)
    scenario.verify(escrow.data.reserved_wtf == 0)
    scenario.verify(escrow.data.redemptions[1].status_code == 1)
    escrow.claim_redemption(
        claim_redemption_params(token, accounts.buyer),
        _sender=accounts.buyer,
        _now=sp.timestamp(20),
        _valid=False,
        _exception="REDEMPTION_NOT_ACTIVE",
    )

    escrow.create_redemption(
        create_redemption_params(accounts.buyer2, redemption_id=2, amount=3_000_000_000),
        _sender=accounts.issuer,
        _now=sp.timestamp(30),
    )
    scenario.verify(escrow.data.reserved_wtf == 3_000_000_000)
    escrow.return_unreserved_escrow(
        sp.record(
            amount_wtf_units=6_000_000_000,
            destination=accounts.admin.address,
            expected_wtf_token_address=token.address,
            expected_wtf_token_id=0,
        ),
        _sender=accounts.admin,
        _valid=False,
        _exception="INSUFFICIENT_UNRESERVED_ESCROW",
    )
    escrow.cancel_redemption(2, _sender=accounts.issuer)
    scenario.verify(escrow.data.redemptions[2].status_code == 2)
    scenario.verify(escrow.data.reserved_wtf == 0)
    escrow.return_unreserved_escrow(
        sp.record(
            amount_wtf_units=5_000_000_000,
            destination=accounts.admin.address,
            expected_wtf_token_address=token.address,
            expected_wtf_token_id=0,
        ),
        _sender=accounts.admin,
    )
    scenario.verify(ledger_balance(token, accounts.admin.address) == 5_000_000_000)
    scenario.verify(ledger_balance(token, accounts.issuer.address) == 10_000_000_000)
    scenario.verify(ledger_balance(token, escrow.address) == 3_000_000_000)
    scenario.verify(escrow.data.escrow_balance_wtf == 3_000_000_000)

    escrow.pause(_sender=accounts.admin)
    scenario.verify(escrow.data.paused)
    escrow.create_redemption(
        create_redemption_params(accounts.buyer, redemption_id=3, amount=1_000_000_000),
        _sender=accounts.issuer,
        _now=sp.timestamp(40),
        _valid=False,
        _exception="PAUSED",
    )
    escrow.unpause(_sender=accounts.admin)
    escrow.propose_admin(accounts.buyer.address, _sender=accounts.admin)
    escrow.accept_admin(_sender=accounts.buyer)
    scenario.verify(escrow.data.admin == accounts.buyer.address)
    escrow.propose_issuer(accounts.buyer2.address, _sender=accounts.buyer)
    escrow.accept_issuer(_sender=accounts.buyer2)
    scenario.verify(escrow.data.issuer == accounts.buyer2.address)
    escrow.return_unreserved_escrow(
        sp.record(
            amount_wtf_units=1,
            destination=accounts.issuer.address,
            expected_wtf_token_address=token.address,
            expected_wtf_token_id=0,
        ),
        _sender=accounts.buyer2,
        _valid=False,
        _exception="NOT_ADMIN",
    )
