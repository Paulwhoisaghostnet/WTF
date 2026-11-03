"""Cumulative, claimant-paid $HORSE awards for verified Horf participation.

The oracle signs the cumulative raw award for one wallet. A claimant sends a
Tezos operation and pays its gas; the vault transfers only the unclaimed delta
of the fixed Mainnet HORSE FA2 token. The oracle never receives custody.
"""

import smartpy as sp


@sp.module
def main():
    Claim: type = sp.record(total_raw=sp.nat, signature=sp.signature).layout(
        ("total_raw", "signature")
    )
    FA2Tx: type = sp.record(to_=sp.address, token_id=sp.nat, amount=sp.nat).layout(
        ("to_", ("token_id", "amount"))
    )
    FA2Batch: type = sp.record(from_=sp.address, txs=sp.list[FA2Tx]).layout(
        ("from_", "txs")
    )
    ClaimedEvent: type = sp.record(
        claimant=sp.address, amount_raw=sp.nat, total_raw=sp.nat
    ).layout(("claimant", ("amount_raw", "total_raw")))

    class HorseClaims(sp.Contract):
        def __init__(self, admin, horse_contract, oracle_key):
            self.data.admin = sp.cast(admin, sp.address)
            self.data.horse_contract = sp.cast(horse_contract, sp.address)
            self.data.horse_token_id = sp.nat(0)
            self.data.oracle_key = sp.cast(oracle_key, sp.key)
            self.data.oracle_epoch = sp.nat(0)
            self.data.claimed_raw = sp.cast(
                sp.big_map(), sp.big_map[sp.address, sp.nat]
            )

        @sp.entrypoint
        def default(self):
            raise "DEFAULT_DISABLED"

        @sp.entrypoint
        def set_oracle_key(self, new_key):
            sp.cast(new_key, sp.key)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.oracle_key = new_key
            self.data.oracle_epoch += 1
            sp.emit(self.data.oracle_epoch, tag="horse_claim_oracle_rotated")

        @sp.entrypoint
        def bump_oracle_epoch(self):
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.oracle_epoch += 1
            sp.emit(self.data.oracle_epoch, tag="horse_claim_oracle_epoch_bumped")

        @sp.entrypoint
        def claim(self, params):
            sp.cast(params, Claim)
            assert sp.amount == sp.mutez(0), "NO_XTZ_IN"
            previous = self.data.claimed_raw.get(sp.sender, default=sp.nat(0))
            assert params.total_raw > previous, "NOTHING_TO_CLAIM"
            payload = (
                sp.chain_id,
                (sp.self_address, (sp.sender, (params.total_raw, self.data.oracle_epoch))),
            )
            assert sp.check_signature(
                self.data.oracle_key, params.signature, sp.pack(payload)
            ), "BAD_CLAIM_PERMIT"
            delta = sp.as_nat(params.total_raw - previous)
            self.data.claimed_raw[sp.sender] = params.total_raw
            transfer_ep = sp.contract(
                sp.list[FA2Batch], self.data.horse_contract, entrypoint="transfer"
            ).unwrap_some(error="HORSE_TRANSFER_MISSING")
            sp.transfer(
                [sp.record(
                    from_=sp.self_address,
                    txs=[sp.record(
                        to_=sp.sender,
                        token_id=self.data.horse_token_id,
                        amount=delta,
                    )],
                )],
                sp.mutez(0),
                transfer_ep,
            )
            sp.emit(
                sp.cast(sp.record(
                    claimant=sp.sender, amount_raw=delta, total_raw=params.total_raw
                ), ClaimedEvent),
                tag="horse_reward_claimed",
            )

        @sp.onchain_view()
        def get_claimed_raw(self, claimant):
            sp.cast(claimant, sp.address)
            return self.data.claimed_raw.get(claimant, default=sp.nat(0))


@sp.add_test()
def deploy_horse_claims_template():
    scenario = sp.test_scenario("deploy_horse_claims_template", main)
    scenario.add_flag("protocol", "tallinn")
    administrator = sp.test_account("Horse Claims template administrator")
    oracle = sp.test_account("Horse Claims template oracle")
    scenario += main.HorseClaims(
        administrator.address,
        sp.address("KT1E9s2ncE5vXjofmzqwE6gEg9JPruTRBdrM"),
        oracle.public_key,
    )
