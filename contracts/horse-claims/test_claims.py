"""Cumulative HORSE claim and FA2 custody scenarios."""

import sys
from pathlib import Path

import smartpy as sp

sys.path.insert(0, str(Path(__file__).resolve().parent))
import HorseClaims as claims  # noqa: E402


CHAIN_ID = sp.chain_id_cst("0x7a06a770")  # Tezos Mainnet.
RAW_HORSE = 100_000_000


@sp.module
def mock_fa2():
    LedgerKey: type = sp.record(owner=sp.address, token_id=sp.nat).layout(
        ("owner", "token_id")
    )
    Tx: type = sp.record(to_=sp.address, token_id=sp.nat, amount=sp.nat).layout(
        ("to_", ("token_id", "amount"))
    )
    Batch: type = sp.record(from_=sp.address, txs=sp.list[Tx]).layout(
        ("from_", "txs")
    )
    Mint: type = sp.record(owner=sp.address, amount=sp.nat)

    class MockFA2(sp.Contract):
        def __init__(self):
            self.data.ledger = sp.cast(sp.big_map(), sp.big_map[LedgerKey, sp.nat])

        @sp.entrypoint
        def mint(self, params):
            sp.cast(params, Mint)
            key = sp.record(owner=params.owner, token_id=0)
            self.data.ledger[key] = self.data.ledger.get(key, default=sp.nat(0)) + params.amount

        @sp.entrypoint
        def transfer(self, batches):
            sp.cast(batches, sp.list[Batch])
            for batch in batches:
                assert sp.sender == batch.from_, "FA2_NOT_OWNER"
                for tx in batch.txs:
                    assert tx.token_id == 0, "FA2_UNKNOWN_TOKEN"
                    from_key = sp.record(owner=batch.from_, token_id=0)
                    to_key = sp.record(owner=tx.to_, token_id=0)
                    balance = self.data.ledger.get(from_key, default=sp.nat(0))
                    assert balance >= tx.amount, "FA2_INSUFFICIENT_BALANCE"
                    self.data.ledger[from_key] = sp.as_nat(balance - tx.amount)
                    self.data.ledger[to_key] = self.data.ledger.get(to_key, default=sp.nat(0)) + tx.amount


@sp.module
def pack_vector():
    class PackVector(sp.Contract):
        def __init__(self):
            self.data.packed = sp.bytes("0x")

        @sp.entrypoint
        def compute(self):
            self.data.packed = sp.pack((
                sp.chain_id,
                (
                    sp.address("KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton"),
                    (
                        sp.address("tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY"),
                        (sp.nat(2000000000), sp.nat(0)),
                    ),
                ),
            ))


def permit(vault, oracle, claimant, total_raw, epoch=0, chain_id=CHAIN_ID):
    packed = sp.pack((
        chain_id,
        (vault.address, (claimant.address, (sp.nat(total_raw), sp.nat(epoch)))),
    ))
    return sp.make_signature(oracle.secret_key, packed)


def balance(token, owner):
    address = owner.address if hasattr(owner, "address") else owner
    return token.data.ledger[sp.record(owner=address, token_id=0)]


@sp.add_test()
def cumulative_claims_pay_only_delta_and_reject_replay():
    scenario = sp.test_scenario("horse_claims_cumulative", [claims.main, mock_fa2])
    scenario.add_flag("protocol", "tallinn")
    admin = sp.test_account("Admin")
    oracle = sp.test_account("Oracle")
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")
    token = mock_fa2.MockFA2()
    vault = claims.main.HorseClaims(admin.address, token.address, oracle.public_key)
    scenario += token
    scenario += vault
    token.mint(owner=vault.address, amount=100 * RAW_HORSE)

    initial = permit(vault, oracle, alice, 10 * RAW_HORSE)
    vault.claim(total_raw=10 * RAW_HORSE, signature=initial, _sender=alice, _chain_id=CHAIN_ID)
    scenario.verify(vault.data.claimed_raw[alice.address] == 10 * RAW_HORSE)
    scenario.verify(balance(token, alice) == 10 * RAW_HORSE)
    vault.claim(total_raw=10 * RAW_HORSE, signature=initial, _sender=alice,
                _chain_id=CHAIN_ID, _valid=False, _exception="NOTHING_TO_CLAIM")
    vault.claim(total_raw=10 * RAW_HORSE, signature=initial, _sender=bob,
                _chain_id=CHAIN_ID, _valid=False, _exception="BAD_CLAIM_PERMIT")
    vault.claim(total_raw=11 * RAW_HORSE, signature=initial, _sender=alice,
                _chain_id=CHAIN_ID, _valid=False, _exception="BAD_CLAIM_PERMIT")

    next_claim = permit(vault, oracle, alice, 30 * RAW_HORSE)
    vault.claim(total_raw=30 * RAW_HORSE, signature=next_claim, _sender=alice, _chain_id=CHAIN_ID)
    scenario.verify(vault.data.claimed_raw[alice.address] == 30 * RAW_HORSE)
    scenario.verify(balance(token, alice) == 30 * RAW_HORSE)
    scenario.verify(balance(token, vault) == 70 * RAW_HORSE)
    scenario.verify(sp.View(vault, "get_claimed_raw")(alice.address) == 30 * RAW_HORSE)


@sp.add_test()
def epoch_rotation_and_empty_vault_are_atomic():
    scenario = sp.test_scenario("horse_claims_epoch_and_reserve", [claims.main, mock_fa2])
    scenario.add_flag("protocol", "tallinn")
    admin = sp.test_account("Admin")
    oracle = sp.test_account("Oracle")
    next_oracle = sp.test_account("Next oracle")
    alice = sp.test_account("Alice")
    token = mock_fa2.MockFA2()
    vault = claims.main.HorseClaims(admin.address, token.address, oracle.public_key)
    scenario += token
    scenario += vault
    token.mint(owner=vault.address, amount=10 * RAW_HORSE)

    old_permit = permit(vault, oracle, alice, 20 * RAW_HORSE)
    vault.claim(total_raw=20 * RAW_HORSE, signature=old_permit, _sender=alice,
                _chain_id=CHAIN_ID, _valid=False, _exception="FA2_INSUFFICIENT_BALANCE")
    scenario.verify(sp.View(vault, "get_claimed_raw")(alice.address) == 0)
    vault.bump_oracle_epoch(_sender=alice, _valid=False, _exception="NOT_ADMIN")
    vault.bump_oracle_epoch(_sender=admin)
    vault.claim(total_raw=20 * RAW_HORSE, signature=old_permit, _sender=alice,
                _chain_id=CHAIN_ID, _valid=False, _exception="BAD_CLAIM_PERMIT")
    vault.set_oracle_key(next_oracle.public_key, _sender=admin)
    scenario.verify(vault.data.oracle_epoch == 2)
    good = permit(vault, next_oracle, alice, 10 * RAW_HORSE, epoch=2)
    vault.claim(total_raw=10 * RAW_HORSE, signature=good, _sender=alice, _chain_id=CHAIN_ID)
    scenario.verify(balance(token, alice) == 10 * RAW_HORSE)
    vault.claim(total_raw=11 * RAW_HORSE,
                signature=permit(vault, next_oracle, alice, 11 * RAW_HORSE, epoch=2),
                _sender=alice, _chain_id=CHAIN_ID, _amount=sp.tez(1),
                _valid=False, _exception="NO_XTZ_IN")


@sp.add_test()
def packed_claim_vector():
    scenario = sp.test_scenario("horse_claims_pack_vector", pack_vector)
    scenario.add_flag("protocol", "tallinn")
    vector = pack_vector.PackVector()
    scenario += vector
    vector.compute(_chain_id=CHAIN_ID)
    scenario.verify(vector.data.packed == sp.pack((
        CHAIN_ID,
        (
            sp.address("KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton"),
            (sp.address("tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY"),
             (sp.nat(2_000_000_000), sp.nat(0))),
        ),
    )))
