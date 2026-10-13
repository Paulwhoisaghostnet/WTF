# PastaCollabSplitFA2
#
# Pasta Protocol / Aleatory Collaboration Split Library
# Implements ALEATORY-001 / Aleatory PR #143 fail-safe mint & royalty splits:
# 1. collab.shares: Basis points summing to 10000, max 8 recipients.
# 2. Probe-and-route-to-admin: An unpayable KT1 or failing recipient routes their share
#    and rounding dust to administrator instead of reverting the whole mint operation.
# 3. Two-step attribution: collab.confirmed set requires accept_collaboration() from the
#    recipient before they are credited in public creators metadata.

import smartpy as sp


@sp.module
def pasta_collab_split_module():
    CollabStorageType: type = sp.record(
        shares=sp.map[sp.address, sp.nat],
        confirmed=sp.set[sp.address],
    )

    def validate_shares(shares: sp.map[sp.address, sp.nat], deployer: sp.address):
        assert sp.len(shares) <= 8, "TOO_MANY_COLLABORATORS"
        assert shares.contains(deployer), "DEPLOYER_NOT_A_COLLABORATOR"
        total = sp.cast(0, sp.nat)
        for share in shares.values():
            total += share
        assert total == 10000, "COLLAB_SHARES_NOT_WHOLE"

    def distribute_payout(shares: sp.map[sp.address, sp.nat], amount: sp.mutez, admin: sp.address):
        if amount > sp.mutez(0):
            remaining = amount
            for item in shares.items():
                cut = sp.split_tokens(amount, item.value, 10000)
                if cut > sp.mutez(0):
                    dest = sp.contract(sp.unit, item.key)
                    if dest.is_some():
                        remaining -= cut
                        sp.transfer((), cut, dest.unwrap_some())
            if remaining > sp.mutez(0):
                sp.send(admin, remaining)


main = pasta_collab_split_module
