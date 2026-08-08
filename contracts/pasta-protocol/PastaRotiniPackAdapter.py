# PastaRotiniPackAdapter
#
# Typed Ravioli helper for collector-triggered Rotini minting. It reserves zero-price Rotini project
# capacity before wrapper sale. During opening it unpacks a finished PNG/GIF/offline-ZIP artifact
# binding and asks Rotini to create the token directly for the wrapper holder in the same operation tree.

import smartpy as sp


@sp.module
def pasta_rotini_pack_adapter_main():
    ReserveParamType: type = sp.record(
        pack_contract=sp.address,
        pack_token_id=sp.nat,
        kind=sp.nat,
        resource_id=sp.nat,
        capacity=sp.nat,
    )
    FulfillParamType: type = sp.record(
        recipient=sp.address,
        pack_contract=sp.address,
        pack_token_id=sp.nat,
        open_serial=sp.nat,
        action_index=sp.nat,
        resource_id=sp.nat,
        payload=sp.bytes,
    )
    ResourceType: type = sp.record(target=sp.address, project_id=sp.nat, active=sp.bool)
    SetResourceActiveType: type = sp.record(resource_id=sp.nat, active=sp.bool)
    ReservationKeyType: type = sp.record(
        pack_contract=sp.address, pack_token_id=sp.nat, resource_id=sp.nat
    )
    PackRenderContextParamType: type = sp.record(
        pack_contract=sp.address,
        pack_token_id=sp.nat,
        open_serial=sp.nat,
        action_index=sp.nat,
        resource_id=sp.nat,
    )
    CapacityParamType: type = sp.record(project_id=sp.nat, amount=sp.nat)
    ArtifactPayloadType: type = sp.record(
        metadata_uri=sp.bytes,
        artifact_uri=sp.bytes,
        display_uri=sp.bytes,
        thumbnail_uri=sp.bytes,
        mime_type=sp.bytes,
        artifact_hash=sp.bytes,
    )
    MintPackIterationType: type = sp.record(
        recipient=sp.address,
        pack_contract=sp.address,
        pack_token_id=sp.nat,
        open_serial=sp.nat,
        action_index=sp.nat,
        project_id=sp.nat,
        metadata_uri=sp.bytes,
        artifact_uri=sp.bytes,
        display_uri=sp.bytes,
        thumbnail_uri=sp.bytes,
        mime_type=sp.bytes,
        artifact_hash=sp.bytes,
    )

    class PastaRotiniPackAdapter(sp.Contract):
        def __init__(self, administrator, metadata):
            self.data.administrator = sp.cast(administrator, sp.address)
            self.data.pending_administrator = sp.cast(None, sp.option[sp.address])
            self.data.metadata = sp.cast(metadata, sp.big_map[sp.string, sp.bytes])
            self.data.routers = sp.cast(sp.big_map(), sp.big_map[sp.address, sp.unit])
            self.data.resources = sp.cast(sp.big_map(), sp.big_map[sp.nat, ResourceType])
            self.data.reservations = sp.cast(sp.big_map(), sp.big_map[ReservationKeyType, sp.nat])
            self.data.next_resource_id = sp.nat(0)

        @sp.private(with_storage="read-only")
        def _only_admin(self):
            assert sp.sender == self.data.administrator, "NOT_ADMIN"

        @sp.private(with_storage="read-only")
        def _only_router(self, pack_contract):
            sp.cast(pack_contract, sp.address)
            assert sp.sender == pack_contract, "ROUTER_MISMATCH"
            assert sp.sender in self.data.routers, "NOT_ROUTER"

        @sp.private(with_storage="read-only")
        def _only_reservation_owner(self, pack_contract):
            # The exact reservation key survives router-role revocation; only
            # creating additional reservations still needs live membership.
            sp.cast(pack_contract, sp.address)
            assert sp.sender == pack_contract, "ROUTER_MISMATCH"

        @sp.entrypoint
        def create_resource(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, ResourceType)
            self._only_admin()
            self.data.resources[self.data.next_resource_id] = params
            self.data.next_resource_id += 1

        @sp.entrypoint
        def set_resource_active(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, SetResourceActiveType)
            self._only_admin()
            assert params.resource_id in self.data.resources, "NO_RESOURCE"
            resource = self.data.resources[params.resource_id]
            self.data.resources[params.resource_id] = sp.record(
                target=resource.target, project_id=resource.project_id, active=params.active
            )

        @sp.entrypoint
        def add_router(self, router):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(router, sp.address)
            self._only_admin()
            self.data.routers[router] = ()

        @sp.entrypoint
        def remove_router(self, router):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(router, sp.address)
            self._only_admin()
            if router in self.data.routers:
                del self.data.routers[router]

        @sp.entrypoint
        def reserve(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, ReserveParamType)
            self._only_router(params.pack_contract)
            assert params.kind == 2, "BAD_ADAPTER_KIND"
            assert params.resource_id in self.data.resources, "NO_RESOURCE"
            assert params.capacity > 0, "BAD_CAPACITY"
            resource = self.data.resources[params.resource_id]
            assert resource.active, "RESOURCE_INACTIVE"
            key = sp.record(
                pack_contract=params.pack_contract,
                pack_token_id=params.pack_token_id,
                resource_id=params.resource_id,
            )
            self.data.reservations[key] = self.data.reservations.get(
                key, default=sp.nat(0)
            ) + params.capacity
            reserve_handle = sp.contract(
                CapacityParamType, resource.target, "reserve_pack_capacity"
            ).unwrap_some(error="BAD_ROTINI")
            sp.transfer(
                sp.record(project_id=resource.project_id, amount=params.capacity),
                sp.mutez(0),
                reserve_handle,
            )

        @sp.entrypoint
        def fulfill(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, FulfillParamType)
            self._only_reservation_owner(params.pack_contract)
            assert params.resource_id in self.data.resources, "NO_RESOURCE"
            resource = self.data.resources[params.resource_id]
            key = sp.record(
                pack_contract=params.pack_contract,
                pack_token_id=params.pack_token_id,
                resource_id=params.resource_id,
            )
            available = self.data.reservations.get(key, default=sp.nat(0))
            assert available >= 1, "RESERVE_UNDERFUNDED"
            artifact = sp.unpack(params.payload, ArtifactPayloadType).unwrap_some(
                error="BAD_ARTIFACT_PAYLOAD"
            )
            if available == 1:
                del self.data.reservations[key]
            else:
                self.data.reservations[key] = sp.as_nat(available - 1)
            mint_handle = sp.contract(
                MintPackIterationType, resource.target, "mint_pack_iteration"
            ).unwrap_some(error="BAD_ROTINI")
            sp.transfer(
                sp.record(
                    recipient=params.recipient,
                    pack_contract=params.pack_contract,
                    pack_token_id=params.pack_token_id,
                    open_serial=params.open_serial,
                    action_index=params.action_index,
                    project_id=resource.project_id,
                    metadata_uri=artifact.metadata_uri,
                    artifact_uri=artifact.artifact_uri,
                    display_uri=artifact.display_uri,
                    thumbnail_uri=artifact.thumbnail_uri,
                    mime_type=artifact.mime_type,
                    artifact_hash=artifact.artifact_hash,
                ),
                sp.mutez(0),
                mint_handle,
            )

        @sp.entrypoint
        def release(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, ReserveParamType)
            self._only_reservation_owner(params.pack_contract)
            assert params.kind == 2, "BAD_ADAPTER_KIND"
            assert params.resource_id in self.data.resources, "NO_RESOURCE"
            assert params.capacity > 0, "BAD_CAPACITY"
            resource = self.data.resources[params.resource_id]
            key = sp.record(
                pack_contract=params.pack_contract,
                pack_token_id=params.pack_token_id,
                resource_id=params.resource_id,
            )
            available = self.data.reservations.get(key, default=sp.nat(0))
            assert available >= params.capacity, "RESERVE_UNDERFUNDED"
            next_available = sp.as_nat(available - params.capacity)
            if next_available == 0:
                del self.data.reservations[key]
            else:
                self.data.reservations[key] = next_available
            release_handle = sp.contract(
                CapacityParamType, resource.target, "release_pack_capacity"
            ).unwrap_some(error="BAD_ROTINI")
            sp.transfer(
                sp.record(project_id=resource.project_id, amount=params.capacity),
                sp.mutez(0),
                release_handle,
            )

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

        @sp.onchain_view()
        def get_reserved(self, key):
            sp.cast(key, ReservationKeyType)
            return self.data.reservations.get(key, default=sp.nat(0))

        @sp.onchain_view()
        def get_render_context(self, params):
            """Return the exact public inputs a holder must render before opening.

            The target Rotini collection derives its token seed from this same
            packed record in ``mint_pack_iteration``.  Publishing the context
            here lets a self-hosted Ravioli page render the immutable project
            automatically after reveal instead of accepting an unrelated file
            upload.  The view intentionally does not require the resource to
            remain active: capacity reserved by a finalized pack stays
            fulfillable after later resource deactivation.
            """
            sp.cast(params, PackRenderContextParamType)
            assert params.resource_id in self.data.resources, "NO_RESOURCE"
            resource = self.data.resources[params.resource_id]
            seed = sp.blake2b(
                sp.pack(
                    sp.record(
                        pack_contract=params.pack_contract,
                        pack_token_id=params.pack_token_id,
                        open_serial=params.open_serial,
                        action_index=params.action_index,
                        project_id=resource.project_id,
                    )
                )
            )
            return sp.record(
                target=resource.target,
                project_id=resource.project_id,
                seed=seed,
            )


main = pasta_rotini_pack_adapter_main


def bytes_of_string(value):
    return sp.bytes("0x" + value.encode("utf-8").hex())


def pasta_rotini_pack_adapter_template():
    admin = sp.test_account("pasta_rotini_adapter_admin")
    return main.PastaRotiniPackAdapter(
        admin.address, sp.big_map({"": bytes_of_string("ipfs://QmPastaRotiniPackAdapter")})
    )


@sp.add_test()
def deploy_pasta_rotini_pack_adapter_template():
    scenario = sp.test_scenario("deploy_pasta_rotini_pack_adapter_template", main)
    scenario += pasta_rotini_pack_adapter_template()


@sp.add_test()
def generative_adapter_guards():
    scenario = sp.test_scenario("generative_adapter_guards", main)
    admin = sp.test_account("admin")
    router = sp.test_account("router")
    stranger = sp.test_account("stranger")
    adapter = main.PastaRotiniPackAdapter(
        admin.address, sp.big_map({"": bytes_of_string("ipfs://adapter")})
    )
    scenario += adapter
    adapter.create_resource(
        sp.record(target=admin.address, project_id=0, active=True), _sender=admin
    )
    adapter.add_router(router.address, _sender=admin)
    context = adapter.get_render_context(
        sp.record(
            pack_contract=router.address,
            pack_token_id=3,
            open_serial=5,
            action_index=2,
            resource_id=0,
        )
    )
    scenario.verify(context.target == admin.address)
    scenario.verify(context.project_id == 0)
    scenario.verify(
        context.seed
        == sp.blake2b(
            sp.pack(
                sp.record(
                    pack_contract=router.address,
                    pack_token_id=3,
                    open_serial=5,
                    action_index=2,
                    project_id=0,
                )
            )
        )
    )
    adapter.reserve(
        sp.record(
            pack_contract=router.address,
            pack_token_id=0,
            kind=2,
            resource_id=0,
            capacity=1,
        ),
        _sender=stranger,
        _valid=False,
        _exception="ROUTER_MISMATCH",
    )
