"""Scenario tests for Horf's FA2 stables and one-use eligibility permits."""

import sys
from pathlib import Path

import smartpy as sp

sys.path.insert(0, str(Path(__file__).resolve().parent))
import HorfStables as horf  # noqa: E402


CHAIN_ID = sp.chain_id_cst("0x7a06a770")  # Tezos mainnet NetXdQprcVkpaWU.


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
            self.data.operators = sp.cast(
                sp.big_map(), sp.big_map[OperatorKey, sp.unit]
            )

        @sp.entrypoint
        def mint(self, params):
            sp.cast(params, Mint)
            key = sp.record(owner=params.owner, token_id=params.token_id)
            self.data.ledger[key] = (
                self.data.ledger.get(key, default=sp.nat(0)) + params.amount
            )

        @sp.entrypoint
        def set_operator(self, params):
            sp.cast(params, Operator)
            assert sp.sender == params.owner, "NOT_OWNER"
            key = sp.record(
                owner=params.owner,
                operator=params.operator,
                token_id=params.token_id,
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
                    assert (
                        sp.sender == batch.from_ or operator in self.data.operators
                    ), "FA2_NOT_OPERATOR"
                    from_key = sp.record(owner=batch.from_, token_id=tx.token_id)
                    to_key = sp.record(owner=tx.to_, token_id=tx.token_id)
                    balance = self.data.ledger.get(from_key, default=sp.nat(0))
                    assert balance >= tx.amount, "FA2_INSUFFICIENT_BALANCE"
                    self.data.ledger[from_key] = sp.as_nat(balance - tx.amount)
                    self.data.ledger[to_key] = (
                        self.data.ledger.get(to_key, default=sp.nat(0)) + tx.amount
                    )


@sp.module
def permit_vector():
    class PackedPermit(sp.Contract):
        def __init__(self):
            self.data.packed = sp.bytes("0x")

        @sp.entrypoint
        def compute(self):
            self.data.packed = sp.pack(
                (
                    sp.chain_id,
                    (
                        sp.address("KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton"),
                        (
                            sp.address("tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY"),
                            (
                                sp.nat(2),
                                (
                                    sp.address("KT1L7PSeJpnj79MEaybcEiDtbHM43g5DZe12"),
                                    (
                                        sp.nat(7),
                                        (
                                            sp.nat(3),
                                            (sp.bytes("0x1111111111111111111111111111111111111111111111111111111111111111"), sp.nat(0)),
                                        ),
                                    ),
                                ),
                            ),
                        ),
                    ),
                )
            )


def nonce(number: int):
    return sp.bytes("0x" + number.to_bytes(32, "big").hex())


def eligibility_signature(stable, oracle, sender, mode, token, token_id, amount, number, epoch=0):
    payload = sp.pack(
        (
            CHAIN_ID,
            (
                stable.address,
                (
                    sender.address,
                    (
                        sp.nat(mode),
                        (
                            token.address,
                            (
                                sp.nat(token_id),
                                (sp.nat(amount), (nonce(number), sp.nat(epoch))),
                            ),
                        ),
                    ),
                ),
            ),
        )
    )
    return sp.make_signature(oracle.secret_key, payload)


def deposit(stable, oracle, sender, mode, token, token_id, amount, number, *, valid=True, error=None, epoch=0):
    stable.deposit(
        mode=mode,
        token_contract=token.address,
        token_id=token_id,
        amount=amount,
        nonce=nonce(number),
        signature=eligibility_signature(
            stable, oracle, sender, mode, token, token_id, amount, number, epoch
        ),
        _sender=sender,
        _chain_id=CHAIN_ID,
        _valid=valid,
        **({"_exception": error} if error else {}),
    )


def balance(token, owner, token_id):
    return token.data.ledger[
        sp.record(owner=owner.address if hasattr(owner, "address") else owner, token_id=token_id)
    ]


@sp.add_test()
def reciprocal_stable_requires_deposit_and_preserves_cancel_credit():
    scenario = sp.test_scenario("horf_reciprocal_stable", [horf.main, mock_fa2])
    scenario.add_flag("protocol", "tallinn")
    admin = sp.test_account("Admin")
    oracle = sp.test_account("Oracle")
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")
    carol = sp.test_account("Carol")
    token = mock_fa2.MockFA2()
    stable = horf.main.HorfStables(admin.address, oracle.public_key)
    scenario += token
    scenario += stable
    token.mint(owner=alice.address, token_id=11, amount=2)
    token.mint(owner=bob.address, token_id=12, amount=1)
    token.set_operator(owner=alice.address, operator=stable.address, token_id=11, enabled=True, _sender=alice)
    token.set_operator(owner=bob.address, operator=stable.address, token_id=12, enabled=True, _sender=bob)

    deposit(stable, oracle, alice, 0, token, 11, 2, 1)
    scenario.verify(stable.data.reciprocal_credits[alice.address] == 2)
    scenario.verify(balance(token, stable, 11) == 2)
    deposit(stable, oracle, alice, 0, token, 11, 2, 1, valid=False, error="PERMIT_USED")
    stable.claim(0, _sender=alice, _valid=False, _exception="OWN_LISTING")
    stable.claim(0, _sender=carol, _valid=False, _exception="RECIPROCAL_DEPOSIT_REQUIRED")
    stable.cancel(listing_id=0, amount=1, _sender=bob, _valid=False, _exception="NOT_LISTING_OWNER")

    deposit(stable, oracle, bob, 0, token, 12, 1, 2)
    stable.claim(0, _sender=bob)
    scenario.verify(stable.data.reciprocal_credits[bob.address] == 0)
    stable.cancel(listing_id=1, amount=1, _sender=bob, _valid=False, _exception="CREDITS_ALREADY_SPENT")
    stable.cancel(listing_id=0, amount=1, _sender=alice)
    scenario.verify(stable.data.reciprocal_credits[alice.address] == 1)
    scenario.verify(balance(token, alice, 11) == 1)
    stable.claim(1, _sender=alice)
    scenario.verify(stable.data.reciprocal_credits[alice.address] == 0)
    scenario.verify(balance(token, alice, 12) == 1)
    stable.claim(1, _sender=alice, _valid=False, _exception="LISTING_EMPTY")


@sp.add_test()
def honor_stable_allows_free_claims_and_donor_cancel():
    scenario = sp.test_scenario("horf_honor_stable", [horf.main, mock_fa2])
    scenario.add_flag("protocol", "tallinn")
    admin = sp.test_account("Admin")
    oracle = sp.test_account("Oracle")
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")
    carol = sp.test_account("Carol")
    token = mock_fa2.MockFA2()
    stable = horf.main.HorfStables(admin.address, oracle.public_key)
    scenario += token
    scenario += stable
    token.mint(owner=alice.address, token_id=20, amount=3)
    token.set_operator(owner=alice.address, operator=stable.address, token_id=20, enabled=True, _sender=alice)
    deposit(stable, oracle, alice, 1, token, 20, 3, 3)
    stable.claim(0, _sender=bob)
    stable.claim(0, _sender=carol)
    scenario.verify(balance(token, bob, 20) == 1)
    scenario.verify(balance(token, carol, 20) == 1)
    scenario.verify(stable.data.listings[0].remaining == 1)
    stable.cancel(listing_id=0, amount=1, _sender=alice)
    scenario.verify(balance(token, alice, 20) == 1)
    scenario.verify(stable.data.listings[0].remaining == 0)


@sp.add_test()
def admin_blacklist_blocks_new_deposits_and_claims_but_preserves_cancel():
    scenario = sp.test_scenario("horf_stable_blacklist", [horf.main, mock_fa2])
    scenario.add_flag("protocol", "tallinn")
    admin = sp.test_account("Admin")
    oracle = sp.test_account("Oracle")
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")
    carol = sp.test_account("Carol")
    token = mock_fa2.MockFA2()
    stable = horf.main.HorfStables(admin.address, oracle.public_key)
    scenario += token
    scenario += stable
    token.mint(owner=alice.address, token_id=21, amount=4)
    token.set_operator(owner=alice.address, operator=stable.address, token_id=21, enabled=True, _sender=alice)
    deposit(stable, oracle, alice, 1, token, 21, 3, 9)

    stable.set_blacklisted(wallet=bob.address, blocked=True, _sender=alice, _valid=False, _exception="NOT_ADMIN")
    stable.set_blacklisted(wallet=bob.address, blocked=True, _sender=admin)
    stable.set_blacklisted(wallet=alice.address, blocked=True, _sender=admin)
    scenario.verify(stable.data.blacklisted[bob.address])
    stable.claim(0, _sender=bob, _valid=False, _exception="TRADER_BLACKLISTED")
    deposit(stable, oracle, alice, 1, token, 21, 1, 10, valid=False, error="TRADER_BLACKLISTED")
    stable.claim(0, _sender=carol)
    stable.cancel(listing_id=0, amount=1, _sender=alice)
    scenario.verify(balance(token, alice, 21) == 2)
    stable.set_blacklisted(wallet=bob.address, blocked=False, _sender=admin)
    stable.claim(0, _sender=bob)
    scenario.verify(balance(token, bob, 21) == 1)


@sp.add_test()
def group_stable_grants_thirty_per_token_and_one_of_each_claimed_token():
    scenario = sp.test_scenario("horf_group_stable", [horf.main, mock_fa2])
    scenario.add_flag("protocol", "tallinn")
    admin = sp.test_account("Admin")
    oracle = sp.test_account("Oracle")
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")
    carol = sp.test_account("Carol")
    dave = sp.test_account("Dave")
    token = mock_fa2.MockFA2()
    stable = horf.main.HorfStables(admin.address, oracle.public_key)
    scenario += token
    scenario += stable
    token.mint(owner=alice.address, token_id=30, amount=2)
    token.mint(owner=bob.address, token_id=31, amount=2)
    token.mint(owner=carol.address, token_id=31, amount=2)
    token.mint(owner=bob.address, token_id=32, amount=1)
    token.mint(owner=dave.address, token_id=33, amount=1)
    for owner, token_id in [(alice, 30), (bob, 31), (carol, 31), (bob, 32), (dave, 33)]:
        token.set_operator(owner=owner.address, operator=stable.address, token_id=token_id, enabled=True, _sender=owner)
    deposit(stable, oracle, alice, 2, token, 30, 2, 4)
    deposit(stable, oracle, bob, 2, token, 31, 2, 5)
    deposit(stable, oracle, carol, 2, token, 31, 2, 6)
    deposit(stable, oracle, bob, 2, token, 32, 1, 7)
    deposit(stable, oracle, dave, 2, token, 33, 1, 8)
    scenario.verify(stable.data.group_credits[alice.address] == 30)
    stable.claim(1, _sender=alice)
    scenario.verify(stable.data.group_credits[alice.address] == 29)
    stable.claim(2, _sender=alice, _valid=False, _exception="GROUP_TOKEN_ALREADY_CLAIMED")
    stable.claim(3, _sender=alice)
    scenario.verify(stable.data.group_credits[alice.address] == 28)
    scenario.verify(balance(token, alice, 31) == 1)
    scenario.verify(balance(token, alice, 32) == 1)
    stable.claim(0, _sender=alice, _valid=False, _exception="OWN_LISTING")
    stable.claim(0, _sender=bob)
    scenario.verify(stable.data.group_credits[bob.address] == 59)
    stable.cancel(listing_id=1, amount=1, _sender=bob)
    scenario.verify(stable.data.group_credits[bob.address] == 59)
    stable.claim(2, _sender=dave)
    scenario.verify(stable.data.group_credits[dave.address] == 29)
    stable.cancel(listing_id=4, amount=1, _sender=dave, _valid=False, _exception="CREDITS_ALREADY_SPENT")
    stable.cancel(listing_id=0, amount=1, _sender=alice)
    scenario.verify(stable.data.group_credits[alice.address] == 28)


@sp.add_test()
def group_stable_counts_token_once_across_split_deposits_and_cancellations():
    scenario = sp.test_scenario("horf_group_token_contribution", [horf.main, mock_fa2])
    scenario.add_flag("protocol", "tallinn")
    admin = sp.test_account("Admin")
    oracle = sp.test_account("Oracle")
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")
    token = mock_fa2.MockFA2()
    stable = horf.main.HorfStables(admin.address, oracle.public_key)
    scenario += token
    scenario += stable
    token.mint(owner=alice.address, token_id=40, amount=7)
    token.mint(owner=alice.address, token_id=41, amount=1)
    token.mint(owner=bob.address, token_id=42, amount=1)
    for owner, token_id in [(alice, 40), (alice, 41), (bob, 42)]:
        token.set_operator(owner=owner.address, operator=stable.address, token_id=token_id, enabled=True, _sender=owner)

    deposit(stable, oracle, alice, 2, token, 40, 3, 31)
    deposit(stable, oracle, alice, 2, token, 40, 2, 32)
    contribution_key = sp.record(owner=alice.address, token_contract=token.address, token_id=40)
    scenario.verify(stable.data.group_credits[alice.address] == 30)
    scenario.verify(stable.data.group_contributions[contribution_key].active == 5)
    deposit(stable, oracle, alice, 2, token, 41, 1, 33)
    scenario.verify(stable.data.group_credits[alice.address] == 60)

    stable.cancel(listing_id=0, amount=2, _sender=alice)
    stable.cancel(listing_id=1, amount=2, _sender=alice)
    scenario.verify(stable.data.group_credits[alice.address] == 60)
    scenario.verify(stable.data.group_contributions[contribution_key].active == 1)
    stable.cancel(listing_id=0, amount=1, _sender=alice)
    scenario.verify(stable.data.group_credits[alice.address] == 30)
    scenario.verify(~stable.data.group_contributions.contains(contribution_key))

    deposit(stable, oracle, alice, 2, token, 40, 1, 34)
    scenario.verify(stable.data.group_credits[alice.address] == 60)
    deposit(stable, oracle, bob, 2, token, 42, 1, 35)
    stable.claim(3, _sender=bob)
    scenario.verify(stable.data.group_contributions[contribution_key].active == 0)
    scenario.verify(stable.data.group_contributions[contribution_key].ever_claimed)
    deposit(stable, oracle, alice, 2, token, 40, 1, 36)
    scenario.verify(stable.data.group_credits[alice.address] == 60)
    scenario.verify(stable.data.group_contributions[contribution_key].active == 1)
    stable.cancel(listing_id=5, amount=1, _sender=alice)
    scenario.verify(stable.data.group_credits[alice.address] == 60)
    scenario.verify(stable.data.group_contributions.contains(contribution_key))


@sp.add_test()
def permits_bind_sender_mode_token_amount_chain_and_oracle_epoch():
    scenario = sp.test_scenario("horf_eligibility_permits", [horf.main, mock_fa2])
    scenario.add_flag("protocol", "tallinn")
    admin = sp.test_account("Admin")
    oracle = sp.test_account("Oracle")
    wrong_oracle = sp.test_account("Wrong oracle")
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")
    token = mock_fa2.MockFA2()
    stable = horf.main.HorfStables(admin.address, oracle.public_key)
    other_stable = horf.main.HorfStables(admin.address, oracle.public_key)
    scenario += token
    scenario += stable
    scenario += other_stable
    token.mint(owner=alice.address, token_id=50, amount=2)
    stable.default(_sender=alice, _amount=sp.tez(1), _valid=False, _exception="DEFAULT_DISABLED")
    deposit(stable, oracle, alice, 1, token, 50, 1, 9, valid=False, error="FA2_NOT_OPERATOR")
    scenario.verify(stable.data.next_listing_id == 0)
    scenario.verify(~stable.data.used_permits.contains(nonce(9)))
    token.set_operator(owner=alice.address, operator=stable.address, token_id=50, enabled=True, _sender=alice)
    deposit(stable, oracle, alice, 1, token, 50, 1, 9)
    scenario.verify(stable.data.next_listing_id == 1)
    signature = eligibility_signature(stable, oracle, alice, 1, token, 50, 1, 10)
    stable.deposit(mode=1, token_contract=token.address, token_id=50, amount=1,
                   nonce=nonce(10), signature=signature, _sender=alice, _chain_id=CHAIN_ID,
                   _amount=sp.tez(1), _valid=False, _exception="NO_XTZ_IN")
    stable.deposit(mode=1, token_contract=token.address, token_id=50, amount=1,
                   nonce=nonce(10), signature=signature, _sender=bob, _chain_id=CHAIN_ID,
                   _valid=False, _exception="BAD_ELIGIBILITY_PERMIT")
    stable.deposit(mode=2, token_contract=token.address, token_id=50, amount=1,
                   nonce=nonce(10), signature=signature, _sender=alice, _chain_id=CHAIN_ID,
                   _valid=False, _exception="BAD_ELIGIBILITY_PERMIT")
    stable.deposit(mode=1, token_contract=token.address, token_id=51, amount=1,
                   nonce=nonce(10), signature=signature, _sender=alice, _chain_id=CHAIN_ID,
                   _valid=False, _exception="BAD_ELIGIBILITY_PERMIT")
    other_stable.deposit(mode=1, token_contract=token.address, token_id=50, amount=1,
                         nonce=nonce(10), signature=signature, _sender=alice, _chain_id=CHAIN_ID,
                         _valid=False, _exception="BAD_ELIGIBILITY_PERMIT")
    stable.deposit(mode=1, token_contract=token.address, token_id=50, amount=2,
                   nonce=nonce(10), signature=signature, _sender=alice, _chain_id=CHAIN_ID,
                   _valid=False, _exception="BAD_ELIGIBILITY_PERMIT")
    stable.deposit(mode=1, token_contract=token.address, token_id=50, amount=1,
                   nonce=nonce(10), signature=signature, _sender=alice,
                   _chain_id=sp.chain_id_cst("0x7a06a771"),
                   _valid=False, _exception="BAD_ELIGIBILITY_PERMIT")
    stable.deposit(mode=1, token_contract=token.address, token_id=50, amount=1,
                   nonce=nonce(10), signature=eligibility_signature(stable, wrong_oracle, alice, 1, token, 50, 1, 10),
                   _sender=alice, _chain_id=CHAIN_ID,
                   _valid=False, _exception="BAD_ELIGIBILITY_PERMIT")
    stable.bump_oracle_epoch(_sender=bob, _valid=False, _exception="NOT_ADMIN")
    stable.bump_oracle_epoch(_sender=admin)
    stable.deposit(mode=1, token_contract=token.address, token_id=50, amount=1,
                   nonce=nonce(10), signature=signature, _sender=alice, _chain_id=CHAIN_ID,
                   _valid=False, _exception="BAD_ELIGIBILITY_PERMIT")
    deposit(stable, oracle, alice, 1, token, 50, 1, 11, epoch=1)
    scenario.verify(stable.data.listings[1].remaining == 1)
    scenario.verify(stable.data.oracle_epoch == 1)


@sp.add_test()
def permit_pack_matches_taquito_vector():
    scenario = sp.test_scenario("horf_permit_pack_vector", permit_vector)
    scenario.add_flag("protocol", "tallinn")
    fixture = permit_vector.PackedPermit()
    scenario += fixture
    fixture.compute(_chain_id=CHAIN_ID)
    # Expected bytes were independently produced by Taquito packDataBytes
    # from the exact right-nested Micheline pair type in README.md.
    prefix = (
        "0x0507070a000000047a06a77007070a0000001601b752c7f3de31759bce246416a6823e86b9756c6c"
        "0007070a000000160000379dfd0263493eab3182c1abed190d7bc4e2ac310707000207070a00000016"
        "017e73cfaf4bcbb88ed678fd03dbeff9e97fb5bc9000070700070707000307070a00000020"
    )
    scenario.verify(fixture.data.packed == sp.bytes(prefix + "11" * 32 + "0000"))
