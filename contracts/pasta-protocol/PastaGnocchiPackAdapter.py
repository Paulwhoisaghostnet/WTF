# PastaGnocchiPackAdapter
#
# Typed Ravioli helper for capacity-backed Gnocchi allocation mints. The adapter is registered as a
# Gnocchi minter. Ravioli routers reserve exact token capacity before wrapper mint/sale, then consume
# one reserved allocation per successful pack opening. A failed child mint reverts the entire open.

import smartpy as sp


@sp.module
def pasta_gnocchi_pack_adapter_main():
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
        resource_id=sp.nat,
        payload=sp.bytes,
    )
    AllocationType: type = sp.record(
        target=sp.address, token_id=sp.nat, amount_per_open=sp.nat, active=sp.bool
    )
    CreateAllocationType: type = AllocationType
    SetAllocationActiveType: type = sp.record(resource_id=sp.nat, active=sp.bool)
    ReservationKeyType: type = sp.record(
        pack_contract=sp.address, pack_token_id=sp.nat, resource_id=sp.nat
    )
    CapacityParamType: type = sp.record(token_id=sp.nat, amount=sp.nat)
    MintReservedParamType: type = sp.record(to_=sp.address, token_id=sp.nat, amount=sp.nat)

    class PastaGnocchiPackAdapter(sp.Contract):
        def __init__(self, administrator, metadata):
            self.data.administrator = sp.cast(administrator, sp.address)
            self.data.pending_administrator = sp.cast(None, sp.option[sp.address])
            self.data.metadata = sp.cast(metadata, sp.big_map[sp.string, sp.bytes])
            self.data.routers = sp.cast(sp.big_map(), sp.big_map[sp.address, sp.unit])
            self.data.allocations = sp.cast(sp.big_map(), sp.big_map[sp.nat, AllocationType])
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

        @sp.entrypoint
        def create_allocation(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, CreateAllocationType)
            self._only_admin()
            assert params.amount_per_open > 0, "BAD_AMOUNT"
            self.data.allocations[self.data.next_resource_id] = params
            self.data.next_resource_id += 1

        @sp.entrypoint
        def set_allocation_active(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, SetAllocationActiveType)
            self._only_admin()
            assert params.resource_id in self.data.allocations, "NO_ALLOCATION"
            allocation = self.data.allocations[params.resource_id]
            self.data.allocations[params.resource_id] = sp.record(
                target=allocation.target,
                token_id=allocation.token_id,
                amount_per_open=allocation.amount_per_open,
                active=params.active,
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
            assert params.kind == 1, "BAD_ADAPTER_KIND"
            assert params.resource_id in self.data.allocations, "NO_ALLOCATION"
            assert params.capacity > 0, "BAD_CAPACITY"
            allocation = self.data.allocations[params.resource_id]
            assert allocation.active, "ALLOCATION_INACTIVE"
            key = sp.record(
                pack_contract=params.pack_contract,
                pack_token_id=params.pack_token_id,
                resource_id=params.resource_id,
            )
            self.data.reservations[key] = self.data.reservations.get(
                key, default=sp.nat(0)
            ) + params.capacity
            reserve_handle = sp.contract(
                CapacityParamType, allocation.target, "reserve_mint_capacity"
            ).unwrap_some(error="BAD_GNOCCHI")
            sp.transfer(
                sp.record(
                    token_id=allocation.token_id,
                    amount=allocation.amount_per_open * params.capacity,
                ),
                sp.mutez(0),
                reserve_handle,
            )

        @sp.entrypoint
        def fulfill(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, FulfillParamType)
            self._only_router(params.pack_contract)
            assert params.resource_id in self.data.allocations, "NO_ALLOCATION"
            assert sp.len(params.payload) == 0, "BAD_ALLOCATION_PAYLOAD"
            allocation = self.data.allocations[params.resource_id]
            key = sp.record(
                pack_contract=params.pack_contract,
                pack_token_id=params.pack_token_id,
                resource_id=params.resource_id,
            )
            available = self.data.reservations.get(key, default=sp.nat(0))
            assert available >= 1, "RESERVE_UNDERFUNDED"
            if available == 1:
                del self.data.reservations[key]
            else:
                self.data.reservations[key] = sp.as_nat(available - 1)
            mint_handle = sp.contract(
                MintReservedParamType, allocation.target, "mint_reserved"
            ).unwrap_some(error="BAD_GNOCCHI")
            sp.transfer(
                sp.record(
                    to_=params.recipient,
                    token_id=allocation.token_id,
                    amount=allocation.amount_per_open,
                ),
                sp.mutez(0),
                mint_handle,
            )

        @sp.entrypoint
        def release(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, ReserveParamType)
            self._only_router(params.pack_contract)
            assert params.kind == 1, "BAD_ADAPTER_KIND"
            assert params.resource_id in self.data.allocations, "NO_ALLOCATION"
            assert params.capacity > 0, "BAD_CAPACITY"
            allocation = self.data.allocations[params.resource_id]
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
                CapacityParamType, allocation.target, "release_mint_capacity"
            ).unwrap_some(error="BAD_GNOCCHI")
            sp.transfer(
                sp.record(
                    token_id=allocation.token_id,
                    amount=allocation.amount_per_open * params.capacity,
                ),
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


main = pasta_gnocchi_pack_adapter_main


def bytes_of_string(value):
    return sp.bytes("0x" + value.encode("utf-8").hex())


def pasta_gnocchi_pack_adapter_template():
    admin = sp.test_account("pasta_gnocchi_adapter_admin")
    return main.PastaGnocchiPackAdapter(
        admin.address, sp.big_map({"": bytes_of_string("ipfs://QmPastaGnocchiPackAdapter")})
    )


@sp.add_test()
def deploy_pasta_gnocchi_pack_adapter_template():
    scenario = sp.test_scenario("deploy_pasta_gnocchi_pack_adapter_template", main)
    scenario += pasta_gnocchi_pack_adapter_template()


@sp.add_test()
def allocation_adapter_guards():
    scenario = sp.test_scenario("allocation_adapter_guards", main)
    admin = sp.test_account("admin")
    router = sp.test_account("router")
    stranger = sp.test_account("stranger")
    adapter = main.PastaGnocchiPackAdapter(
        admin.address, sp.big_map({"": bytes_of_string("ipfs://adapter")})
    )
    scenario += adapter
    adapter.create_allocation(
        sp.record(target=admin.address, token_id=0, amount_per_open=1, active=True),
        _sender=admin,
    )
    adapter.add_router(router.address, _sender=stranger, _valid=False, _exception="NOT_ADMIN")
    adapter.add_router(router.address, _sender=admin)
    adapter.reserve(
        sp.record(
            pack_contract=router.address,
            pack_token_id=0,
            kind=1,
            resource_id=0,
            capacity=1,
        ),
        _sender=stranger,
        _valid=False,
        _exception="ROUTER_MISMATCH",
    )
