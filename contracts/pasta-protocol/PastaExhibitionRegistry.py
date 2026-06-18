# PastaExhibitionRegistry
#
# Pasta Protocol — on-chain curation / exhibition registry used by Lasagna to publish a Contract Product
# that *references* existing tokens rather than minting new art. An exhibition is a curator set plus an
# append-only log of revisions; each revision is an ordered list of (contract, token_id) references with a
# TZIP-16/21 metadata pointer (title, curatorial statement, curator snapshot). The "current" revision is a
# movable pointer, but revisions themselves are never edited or deleted — like the layers of a lasagna.
#
# Not an FA2: this contract holds no balances and mints nothing. Curation = references + roles + history.
#
# SmartPy 0.24.x `assert` syntax mirrored from MacaroniBlindMintFA2V2.py. The shared
# contracts/fa2-templates/* sources (used by the Kiln factory) are intentionally untouched.
#
# Compliant with: TZIP-16 (contract metadata), TZIP-21 (referenced token / exhibition metadata).

import smartpy as sp


@sp.module
def main():
    ItemRefType: type = sp.record(contract=sp.address, token_id=sp.nat)
    RevisionType: type = sp.record(
        metadata_uri=sp.bytes,
        items=sp.list[ItemRefType],
        curator=sp.address,
        timestamp=sp.timestamp,
    )
    PublishParamType: type = sp.record(metadata_uri=sp.bytes, items=sp.list[ItemRefType])

    class PastaExhibitionRegistry(sp.Contract):
        def __init__(self, administrator, metadata):
            self.data.administrator = sp.cast(administrator, sp.address)
            self.data.pending_administrator = sp.cast(None, sp.option[sp.address])
            self.data.metadata = sp.cast(metadata, sp.big_map[sp.string, sp.bytes])
            self.data.curators = sp.cast(sp.big_map(), sp.big_map[sp.address, sp.unit])
            self.data.revisions = sp.cast(sp.big_map(), sp.big_map[sp.nat, RevisionType])
            self.data.revision_count = sp.nat(0)
            self.data.current_revision = sp.cast(None, sp.option[sp.nat])

        @sp.private(with_storage="read-only")
        def _only_admin(self):
            assert sp.sender == self.data.administrator, "NOT_ADMIN"

        @sp.private(with_storage="read-only")
        def _only_curator(self):
            assert (
                sp.sender == self.data.administrator or sp.sender in self.data.curators
            ), "NOT_CURATOR"

        # ---- Curator roles ----

        @sp.entrypoint
        def add_curator(self, curator):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(curator, sp.address)
            self._only_admin()
            self.data.curators[curator] = ()

        @sp.entrypoint
        def remove_curator(self, curator):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(curator, sp.address)
            self._only_admin()
            if curator in self.data.curators:
                del self.data.curators[curator]

        # ---- Revisions (append-only) ----

        @sp.entrypoint
        def publish_revision(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, PublishParamType)
            self._only_curator()
            rid = self.data.revision_count
            self.data.revisions[rid] = sp.record(
                metadata_uri=params.metadata_uri,
                items=params.items,
                curator=sp.sender,
                timestamp=sp.now,
            )
            self.data.revision_count = rid + 1
            self.data.current_revision = sp.Some(rid)

        @sp.entrypoint
        def set_current_revision(self, rid):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(rid, sp.nat)
            self._only_curator()
            assert rid < self.data.revision_count, "NO_SUCH_REVISION"
            self.data.current_revision = sp.Some(rid)

        @sp.entrypoint
        def set_metadata(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, sp.record(key=sp.string, value=sp.bytes))
            self._only_admin()
            self.data.metadata[params.key] = params.value

        # ---- Admin handoff ----

        @sp.entrypoint
        def transfer_administration(self, pending_administrator):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(pending_administrator, sp.address)
            self._only_admin()
            self.data.pending_administrator = sp.Some(pending_administrator)

        @sp.entrypoint
        def accept_administration(self):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            assert self.data.pending_administrator.is_some(), "NO_PENDING_ADMIN"
            pending = self.data.pending_administrator.unwrap_some()
            assert sp.sender == pending, "NOT_PENDING_ADMIN"
            self.data.administrator = pending
            self.data.pending_administrator = sp.cast(None, sp.option[sp.address])

        # ---- Views ----

        @sp.onchain_view
        def get_revision_count(self):
            return self.data.revision_count

        @sp.onchain_view
        def get_current_revision(self):
            return self.data.current_revision

        @sp.onchain_view
        def get_revision(self, rid):
            sp.cast(rid, sp.nat)
            assert rid in self.data.revisions, "NO_SUCH_REVISION"
            return self.data.revisions[rid]

        @sp.onchain_view
        def is_curator(self, address):
            sp.cast(address, sp.address)
            return address == self.data.administrator or address in self.data.curators


def bytes_of_string(s):
    return sp.bytes("0x" + s.encode("utf-8").hex())


def pasta_exhibition_template():
    admin = sp.test_account("pasta_exhibition_admin")
    metadata = sp.big_map({"": bytes_of_string("ipfs://QmPastaExhibitionMetadataTemplate")})
    return main.PastaExhibitionRegistry(administrator=admin.address, metadata=metadata)


@sp.add_test()
def deploy_pasta_exhibition_template():
    scenario = sp.test_scenario("deploy_pasta_exhibition_template", main)
    c = pasta_exhibition_template()
    scenario += c


@sp.add_test()
def test():
    scenario = sp.test_scenario("PastaExhibitionRegistry", main)
    admin = sp.test_account("admin")
    curator = sp.test_account("curator")
    stranger = sp.test_account("stranger")
    art = sp.test_account("art_contract")

    metadata = sp.big_map({"": bytes_of_string("ipfs://QmContract")})
    c = main.PastaExhibitionRegistry(administrator=admin.address, metadata=metadata)
    scenario += c

    scenario.h2("Admin adds a curator")
    c.add_curator(curator.address, _sender=admin)
    scenario.verify(c.is_curator(curator.address))
    scenario.verify(c.is_curator(admin.address))
    scenario.verify(~c.is_curator(stranger.address))

    scenario.h2("Strangers cannot publish")
    c.publish_revision(
        sp.record(
            metadata_uri=bytes_of_string("ipfs://QmRev0"),
            items=[sp.record(contract=art.address, token_id=1)],
        ),
        _sender=stranger,
        _valid=False,
    )

    scenario.h2("Curator publishes the first revision (exhibition published)")
    c.publish_revision(
        sp.record(
            metadata_uri=bytes_of_string("ipfs://QmRev0"),
            items=[
                sp.record(contract=art.address, token_id=1),
                sp.record(contract=art.address, token_id=2),
            ],
        ),
        _sender=curator,
    )
    scenario.verify(c.data.revision_count == 1)
    scenario.verify(c.get_current_revision() == sp.Some(0))
    scenario.verify(c.get_revision(0).curator == curator.address)

    scenario.h2("Admin publishes a second revision (revision added)")
    c.publish_revision(
        sp.record(
            metadata_uri=bytes_of_string("ipfs://QmRev1"),
            items=[sp.record(contract=art.address, token_id=3)],
        ),
        _sender=admin,
    )
    scenario.verify(c.data.revision_count == 2)
    scenario.verify(c.get_current_revision() == sp.Some(1))

    scenario.h2("Curator can roll the current pointer back to an earlier revision")
    c.set_current_revision(0, _sender=curator)
    scenario.verify(c.get_current_revision() == sp.Some(0))

    scenario.h2("Cannot point at a nonexistent revision")
    c.set_current_revision(9, _sender=admin, _valid=False)

    scenario.h2("Removed curators lose publish rights")
    c.remove_curator(curator.address, _sender=admin)
    c.publish_revision(
        sp.record(
            metadata_uri=bytes_of_string("ipfs://QmRev2"),
            items=[sp.record(contract=art.address, token_id=4)],
        ),
        _sender=curator,
        _valid=False,
    )

    scenario.h2("Two-step admin handoff")
    c.transfer_administration(curator.address, _sender=admin)
    c.accept_administration(_sender=curator)
    scenario.verify(c.data.administrator == curator.address)
