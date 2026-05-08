# WtfCasinoMembership - SmartPy v0.24.1
#
# One-way XTZ membership router for WTF Casino access. The app owns the
# membership ledger, expiry policy, and app-pass gate. This contract only
# accepts the exact 1 XTZ membership payment, records transaction context
# through the entrypoint parameter/event, and forwards the XTZ to the platform
# treasury wallet.

import smartpy as sp


@sp.module
def wtf_casino_membership_main():
    PurchaseMembershipInputType: type = sp.record(
        membership_ref=sp.string,
    )

    class WtfCasinoMembership(sp.Contract):
        def __init__(self, treasury):
            self.data.treasury = treasury
            self.data.membership_fee = sp.tez(1)

        @sp.entrypoint
        def default(self):
            assert False, "DEFAULT_DISABLED"

        @sp.entrypoint
        def purchase_membership(self, params):
            sp.cast(params, PurchaseMembershipInputType)
            assert sp.amount == self.data.membership_fee, "BAD_MEMBERSHIP_FEE"
            assert sp.len(params.membership_ref) > 0, "MEMBERSHIP_REF_REQUIRED"
            assert sp.len(params.membership_ref) <= 128, "MEMBERSHIP_REF_TOO_LONG"

            sp.send(self.data.treasury, sp.amount)
            sp.emit(
                sp.record(
                    member=sp.sender,
                    membership_ref=params.membership_ref,
                    fee=sp.amount,
                    treasury=self.data.treasury,
                ),
                tag="membership_purchased",
            )


main = wtf_casino_membership_main


@sp.add_test()
def deploy_wtf_casino_membership_template():
    import os

    scenario = sp.test_scenario("deploy_wtf_casino_membership_template", main)
    treasury = sp.address(
        os.environ.get(
            "WTF_CASINO_MEMBERSHIP_TREASURY",
            "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt",
        )
    )
    membership = main.WtfCasinoMembership(treasury=treasury)
    scenario += membership
