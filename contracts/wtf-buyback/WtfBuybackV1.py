# WtfBuybackV1 - SmartPy v2
#
# Closed, time-bounded, allowlist-gated WTF-for-XTZ buyback contract.
#
# Designed for the Phase 10 pre-Season-3 recapture window. Semantics:
#
#   - Operator originates the contract with a fixed rate_xtz_per_wtf,
#     total_xtz_budget, per_seller_cap_wtf, allowlist_root, and
#     window_opens_at / window_closes_at timestamps.
#   - Operator calls `fund_xtz` (payable, admin-only) to push XTZ into
#     the contract up to the budget cap.
#   - Inside the window, an allowlisted seller calls `swap(amount, proof)`.
#     Before calling, the seller must register this contract as an
#     operator for their WTF token. The contract pulls `amount` WTF via
#     FA2 `transfer` and sends `amount * rate_xtz_per_wtf` XTZ back in
#     the same operation.
#   - Proceeds are enforced atomically: swap either completes fully or
#     rolls back. No partial state.
#   - After the window closes, admin can `withdraw_leftover_xtz` to
#     sweep unsold XTZ back to the operator wallet.
#   - At any time, admin can `withdraw_accumulated_wtf` to sweep the
#     recaptured WTF back to the operator wallet.
#   - `pause` / `unpause` is a kill switch.
#   - `extend_window` lets the operator extend `window_closes_at` once
#     the contract is already live, provided the extension points to a
#     future timestamp relative to the current one.
#
# Rate math: `rate_num_mutez_per_wtf` / `rate_den_wtf` — the contract
# computes `xtz_out = wtf_in * rate_num / rate_den` using integer math
# to avoid any float drift. Both numerator and denominator are set at
# origination and cannot be changed.
#
# Allowlist: on-chain we only keep a 32-byte Merkle root. Sellers pass a
# proof derived off-chain from a canonical list sorted ASC by address
# with each leaf = sha256(seller_address_bytes). Siblings are supplied
# bottom-up with a `right` flag (True = sibling on our right).

import smartpy as sp


@sp.module
def main():
    TransferTxType: type = sp.record(to_=sp.address, token_id=sp.nat, amount=sp.nat)
    TransferBatchItemType: type = sp.record(from_=sp.address, txs=sp.list[TransferTxType])
    MerkleStep: type = sp.record(sibling=sp.bytes, right=sp.bool)
    MerkleProofQuery: type = sp.record(seller=sp.address, proof=sp.list[MerkleStep])

    class WtfBuybackV1(sp.Contract):
        def __init__(
            self,
            admin,
            wtf_token_address,
            wtf_token_id,
            rate_num_mutez_per_wtf,
            rate_den_wtf,
            total_xtz_budget,
            per_seller_cap_wtf,
            allowlist_root,
            window_opens_at,
            window_closes_at,
            metadata,
        ):
            assert rate_den_wtf > sp.nat(0)
            assert window_closes_at > window_opens_at
            self.data.admin = admin
            self.data.wtf_token_address = wtf_token_address
            self.data.wtf_token_id = wtf_token_id
            self.data.rate_num_mutez_per_wtf = rate_num_mutez_per_wtf
            self.data.rate_den_wtf = rate_den_wtf
            self.data.total_xtz_budget = total_xtz_budget
            self.data.xtz_paid_out = sp.mutez(0)
            self.data.per_seller_cap_wtf = per_seller_cap_wtf
            self.data.allowlist_root = allowlist_root
            self.data.window_opens_at = window_opens_at
            self.data.window_closes_at = window_closes_at
            self.data.paused = False
            self.data.metadata = metadata
            # Tracking.
            self.data.swapped_by_seller = sp.cast(sp.big_map(), sp.big_map[sp.address, sp.nat])
            self.data.wtf_received_total = sp.nat(0)
            # Swap count for event ordering.
            self.data.swap_counter = sp.nat(0)

        # ---- Admin config ----

        @sp.entrypoint
        def set_admin(self, new_admin):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(new_admin, sp.address)
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.admin = new_admin

        @sp.entrypoint
        def pause(self):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.paused = True

        @sp.entrypoint
        def unpause(self):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.paused = False

        @sp.entrypoint
        def extend_window(self, new_close):
            """Admin may only extend the window, never shorten it."""
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(new_close, sp.timestamp)
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            assert new_close > self.data.window_closes_at, "NOT_EXTENDING"
            self.data.window_closes_at = new_close

        # ---- Funding + withdrawals ----

        @sp.entrypoint
        def fund_xtz(self):
            """Admin deposits XTZ into the contract up to the budget cap."""
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            assert sp.amount > sp.mutez(0), "NO_AMOUNT"
            # Contract balance post-transfer must not exceed budget.
            assert sp.balance <= self.data.total_xtz_budget, "OVER_BUDGET"

        @sp.entrypoint
        def withdraw_leftover_xtz(self):
            """Sweep all remaining XTZ back to admin. Only allowed
            after window closes (or while paused, to unstick a stuck
            run)."""
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            assert (sp.now >= self.data.window_closes_at) or self.data.paused, "WINDOW_OPEN"
            remaining = sp.balance
            assert remaining > sp.mutez(0), "EMPTY"
            sp.send(self.data.admin, remaining)

        @sp.entrypoint
        def withdraw_accumulated_wtf(self, amount):
            """Sweep received WTF back to admin. Safe to call any time."""
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(amount, sp.nat)
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            assert amount > sp.nat(0), "BAD_AMOUNT"
            # Build FA2 transfer of `amount` WTF from contract self to admin.
            tx = sp.record(to_=self.data.admin, token_id=self.data.wtf_token_id, amount=amount)
            batch_item = sp.record(from_=sp.self_address, txs=[tx])
            target = sp.contract(
                sp.list[TransferBatchItemType],
                self.data.wtf_token_address,
                entrypoint="transfer",
            ).unwrap_some()
            sp.transfer([batch_item], sp.mutez(0), target)

        # ---- Public swap ----

        @sp.private(with_storage="read-only")
        def valid_allowlist_proof(self, params):
            sp.cast(params, MerkleProofQuery)
            computed = sp.sha256(sp.pack(params.seller))
            for step in params.proof:
                if step.right:
                    computed = sp.sha256(sp.concat([computed, step.sibling]))
                else:
                    computed = sp.sha256(sp.concat([step.sibling, computed]))
            return computed == self.data.allowlist_root

        @sp.onchain_view
        def allowlist_proof_valid(self, params):
            """Read-only preflight using the exact proof path enforced by `swap`."""
            sp.cast(params, MerkleProofQuery)
            return self.valid_allowlist_proof(params)

        @sp.entrypoint
        def swap(self, params):
            """Atomic WTF -> XTZ swap for an allowlisted seller.

            Prerequisite: seller has added this contract as operator on
            the WTF token via the WTF FA2's `update_operators` in a
            prior operation."""
            assert sp.amount == sp.mutez(0), "NO_TEZ_IN"
            assert not self.data.paused, "PAUSED"
            sp.cast(params, sp.record(wtf_amount=sp.nat, proof=sp.list[MerkleStep]))
            assert params.wtf_amount > sp.nat(0), "BAD_AMOUNT"

            # Window check.
            assert sp.now >= self.data.window_opens_at, "TOO_EARLY"
            assert sp.now < self.data.window_closes_at, "TOO_LATE"

            # Per-seller cap.
            prev = self.data.swapped_by_seller.get(sp.sender, default=sp.nat(0))
            new_total = prev + params.wtf_amount
            assert new_total <= self.data.per_seller_cap_wtf, "OVER_CAP"

            # Compute XTZ out: wtf * num / den.
            xtz_out = sp.split_tokens(
                self.data.rate_num_mutez_per_wtf,
                params.wtf_amount,
                self.data.rate_den_wtf,
            )
            assert xtz_out > sp.mutez(0), "ROUND_TO_ZERO"

            # Budget check.
            new_paid = self.data.xtz_paid_out + xtz_out
            assert new_paid <= self.data.total_xtz_budget, "OVER_BUDGET"
            assert sp.balance >= xtz_out, "UNDERFUNDED"

            assert self.valid_allowlist_proof(
                sp.record(seller=sp.sender, proof=params.proof)
            ), "BAD_PROOF"

            # Pull WTF from seller to contract self via FA2 transfer.
            tx = sp.record(
                to_=sp.self_address,
                token_id=self.data.wtf_token_id,
                amount=params.wtf_amount,
            )
            batch_item = sp.record(from_=sp.sender, txs=[tx])
            target = sp.contract(
                sp.list[TransferBatchItemType],
                self.data.wtf_token_address,
                entrypoint="transfer",
            ).unwrap_some()
            sp.transfer([batch_item], sp.mutez(0), target)

            # Pay XTZ to seller.
            sp.send(sp.sender, xtz_out)

            # Update bookkeeping.
            self.data.swapped_by_seller[sp.sender] = new_total
            self.data.xtz_paid_out = new_paid
            self.data.wtf_received_total += params.wtf_amount
            self.data.swap_counter += 1
            sp.emit(
                sp.record(
                    seller=sp.sender,
                    wtf_in=params.wtf_amount,
                    xtz_out=xtz_out,
                    swap_index=self.data.swap_counter,
                ),
                tag="wtf_buyback_swap",
            )

        # ---- Views ----

        @sp.onchain_view
        def remaining_budget(self):
            return sp.fst(
                sp.ediv(
                    self.data.total_xtz_budget - self.data.xtz_paid_out,
                    sp.mutez(1),
                ).unwrap_some()
            )

        @sp.onchain_view
        def remaining_seller_allowance(self, seller):
            sp.cast(seller, sp.address)
            used = self.data.swapped_by_seller.get(seller, default=sp.nat(0))
            return self.data.per_seller_cap_wtf - used

        @sp.onchain_view
        def window_status(self):
            if sp.now < self.data.window_opens_at:
                return "pending"
            else:
                if sp.now < self.data.window_closes_at:
                    if self.data.paused:
                        return "paused"
                    else:
                        return "open"
                else:
                    return "closed"


@sp.add_test()
def smoke():
    """Smoke-only test. Full semantics (rate math, cap rejection,
    window bounds, allowlist proof, FA2 operator pull, withdrawals)
    live in the ghostnet suite under `scripts/wtf/ghostnet/` run via
    Kiln, because those depend on a live FA2 counterparty and a real
    wall clock."""
    scenario = sp.test_scenario("WtfBuybackV1", main)
    admin = sp.test_account("admin")
    wtf_token = sp.test_account("wtf_token")
    # Root/proofs are fixed vectors generated by server/lib/merkle.ts for a
    # three-address (odd-sized) tree. The TypeScript parity test asserts the
    # same values against Taquito's independent Michelson address packer.
    root = sp.bytes("0x037e4927a3e9393d5f929b63df9d006ee36aead7012c1d5e4012d642ff7dbec1")
    c = main.WtfBuybackV1(
        admin=admin.address,
        wtf_token_address=wtf_token.address,
        wtf_token_id=sp.nat(0),
        rate_num_mutez_per_wtf=sp.mutez(50_000),
        rate_den_wtf=sp.nat(1),
        total_xtz_budget=sp.tez(100),
        per_seller_cap_wtf=sp.nat(20),
        allowlist_root=root,
        window_opens_at=sp.timestamp(1),
        window_closes_at=sp.timestamp(3600),
        metadata=sp.big_map({"": sp.bytes("0x")}),
    )
    scenario += c
    c.fund_xtz(_sender=admin, _amount=sp.tez(10))
    scenario.verify(c.data.total_xtz_budget == sp.tez(100))

    wallet_a = sp.address("KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton")
    wallet_b = sp.address("tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6")
    wallet_c = sp.address("tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb")
    repeated_c = sp.bytes("0xdc917f5ef4e7e5e6555f62e73d38b8b877a13a31b0fb94dc0f5695aede4e8448")
    parent_ab = sp.bytes("0x37d328ad57d73cc597bc03b9e6ccee9b660763d1ee08c04eb2ab6b4daf2e5c9a")
    parent_cc = sp.bytes("0x0cc95654191e0b5ad828e485f7449aa1c185ea6513121c9a8f08488efb63afdd")
    proof_a = [
        sp.record(
            sibling=sp.bytes("0x08269418284a8b2d92427cd4cc0e20cc491f4f4c4721cd9ac3846f7c83121fe5"),
            right=True,
        ),
        sp.record(sibling=parent_cc, right=True),
    ]
    proof_b = [
        sp.record(
            sibling=sp.bytes("0x6e24c27e3dc1410097cf53547ac50019048b306fbe62deb0c9e59475bc221b7a"),
            right=False,
        ),
        sp.record(sibling=parent_cc, right=True),
    ]
    proof_c = [
        sp.record(sibling=repeated_c, right=True),
        sp.record(sibling=parent_ab, right=False),
    ]

    scenario.verify(c.allowlist_proof_valid(sp.record(seller=wallet_a, proof=proof_a)))
    scenario.verify(c.allowlist_proof_valid(sp.record(seller=wallet_b, proof=proof_b)))
    scenario.verify(c.allowlist_proof_valid(sp.record(seller=wallet_c, proof=proof_c)))
    scenario.verify(
        ~c.allowlist_proof_valid(sp.record(seller=wallet_b, proof=proof_a))
    )
    scenario.verify(
        ~c.allowlist_proof_valid(
            sp.record(
                seller=wallet_a,
                proof=[
                    sp.record(
                        sibling=sp.bytes("0x08269418284a8b2d92427cd4cc0e20cc491f4f4c4721cd9ac3846f7c83121fe5"),
                        right=False,
                    ),
                    sp.record(sibling=parent_cc, right=True),
                ],
            )
        )
    )
