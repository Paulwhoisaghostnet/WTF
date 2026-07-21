import importlib.util
from pathlib import Path

import smartpy as sp


ROOT = Path(__file__).resolve().parents[1]


def load_module(name, filename):
    path = ROOT / "contracts" / "pasta-protocol" / filename
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


standard_source = load_module("pasta_ravioli_standard", "PastaStandardCollectionFA2.py")
gnocchi_source = load_module("pasta_ravioli_gnocchi", "PastaOpenEditionFA2.py")
rotini_source = load_module("pasta_ravioli_rotini", "PastaGenerativeCollectionFA2.py")
router_source = load_module("pasta_ravioli_router", "PastaPackRouterFA2.py")
gnocchi_adapter_source = load_module(
    "pasta_ravioli_gnocchi_adapter", "PastaGnocchiPackAdapter.py"
)
rotini_adapter_source = load_module(
    "pasta_ravioli_rotini_adapter", "PastaRotiniPackAdapter.py"
)

standard = standard_source.main
gnocchi = gnocchi_source.main
rotini = rotini_source.main
router = router_source.main
gnocchi_adapter = gnocchi_adapter_source.main
rotini_adapter = rotini_adapter_source.main


def b(value):
    return sp.bytes("0x" + value.encode("utf-8").hex())


def nonce(value):
    return b(f"ravioli-proof-nonce-{value}")


def pack_config(mode, item_count, max_supply=1, blind=True):
    return sp.record(
        mode=sp.nat(mode),
        blind=blind,
        item_count=sp.nat(item_count),
        max_supply=sp.nat(max_supply),
        committed_recipes=sp.nat(0),
        finalized=False,
        cancelled=False,
        contents_uri=sp.cast(None, sp.option[sp.bytes]),
    )


def escrow_reservation(asset, token_id, amount=1):
    return sp.variant(
        "escrow",
        sp.record(fa2=asset.address, token_id=sp.nat(token_id), amount=sp.nat(amount)),
    )


def escrow_action(asset, token_id, amount=1):
    return escrow_reservation(asset, token_id, amount)


def allocated_reservation(adapter, resource_id=0, payload=sp.bytes("0x")):
    return sp.variant(
        "allocated_mint",
        sp.record(
            adapter=adapter.address,
            resource_id=sp.nat(resource_id),
            payload_commitment=sp.Some(sp.blake2b(payload)),
        ),
    )


def allocated_action(adapter, resource_id=0, payload=sp.bytes("0x"), committed_payload=None):
    if committed_payload is None:
        committed_payload = payload
    return sp.variant(
        "allocated_mint",
        sp.record(
            adapter=adapter.address,
            resource_id=sp.nat(resource_id),
            payload=payload,
            payload_commitment=sp.Some(sp.blake2b(committed_payload)),
        ),
    )


def generative_reservation(adapter, resource_id=0, payload=None):
    return sp.variant(
        "generative_mint",
        sp.record(
            adapter=adapter.address,
            resource_id=sp.nat(resource_id),
            payload_commitment=(
                sp.cast(None, sp.option[sp.bytes])
                if payload is None
                else sp.Some(sp.blake2b(payload))
            ),
        ),
    )


def artifact_payload(serial, mime="image/png"):
    suffix = {
        "image/png": "png",
        "image/gif": "gif",
        "application/zip": "zip",
    }.get(mime, "bin")
    return sp.pack(
        sp.record(
            metadata_uri=b(f"ipfs://metadata-{serial}"),
            artifact_uri=b(f"ipfs://artifact-{serial}.{suffix}"),
            display_uri=b(f"ipfs://display-{serial}.{suffix}"),
            thumbnail_uri=b(f"ipfs://thumbnail-{serial}.{suffix}"),
            mime_type=b(mime),
            artifact_hash=sp.bytes("0x" + "ab" * 32),
        )
    )


def generative_action(
    adapter,
    serial,
    resource_id=0,
    mime="image/png",
    committed_payload=None,
    generated_at_open=False,
):
    payload = artifact_payload(serial, mime)
    if committed_payload is None:
        committed_payload = payload
    return sp.variant(
        "generative_mint",
        sp.record(
            adapter=adapter.address,
            resource_id=sp.nat(resource_id),
            payload=payload,
            payload_commitment=(
                sp.cast(None, sp.option[sp.bytes])
                if generated_at_open
                else sp.Some(sp.blake2b(committed_payload))
            ),
        ),
    )


def create_pack(pack_router, admin, token_id, mode, item_count, max_supply=1, blind=True):
    pack_router.create_pack(
        sp.record(
            token_info={
                "": b(f"ipfs://ravioli-wrapper-{token_id}"),
                "name": b(f"Ravioli mode {mode}"),
                "symbol": b("RAV"),
                "decimals": sp.bytes("0x30"),
            },
            config=pack_config(mode, item_count, max_supply, blind),
        ),
        _sender=admin,
    )


def commit(pack_router, admin, token_id, nonce_value, reservations):
    pack_router.commit_recipe(
        sp.record(
            token_id=sp.nat(token_id),
            nonce_commitment=sp.blake2b(nonce(nonce_value)),
            reservations=reservations,
        ),
        _sender=admin,
    )


@sp.add_test()
def ravioli_five_mode_atomic_fulfillment():
    scenario = sp.test_scenario(
        "Ravioli five-mode atomic fulfillment",
        [standard, gnocchi, rotini, router, gnocchi_adapter, rotini_adapter],
    )
    admin = sp.test_account("admin")
    alice = sp.test_account("alice")
    bob = sp.test_account("bob")

    metadata = sp.big_map({"": b("ipfs://contract-metadata")})
    asset = standard.PastaStandardCollectionFA2(admin.address, metadata)
    oe = gnocchi.PastaOpenEditionFA2(admin.address, metadata)
    generator = rotini.PastaGenerativeCollectionFA2(admin.address, metadata)
    allocation_adapter = gnocchi_adapter.PastaGnocchiPackAdapter(admin.address, metadata)
    generation_adapter = rotini_adapter.PastaRotiniPackAdapter(admin.address, metadata)
    packs = router.PastaPackRouterFA2(admin.address, metadata)
    scenario += asset
    scenario += oe
    scenario += generator
    scenario += allocation_adapter
    scenario += generation_adapter
    scenario += packs

    scenario.h2("Prepare FA2 assets, one capped Gnocchi allocation, and free Rotini PNG/GIF/ZIP projects")
    asset.create_token({"": b("ipfs://existing-zero")}, _sender=admin)
    asset.create_token({"": b("ipfs://existing-one")}, _sender=admin)
    asset.mint(sp.record(to_=admin.address, token_id=0, amount=10), _sender=admin)
    asset.mint(sp.record(to_=admin.address, token_id=1, amount=10), _sender=admin)
    for token_id in [0, 1]:
        asset.update_operators(
            [
                sp.variant(
                    "add_operator",
                    sp.record(owner=admin.address, operator=packs.address, token_id=token_id),
                )
            ],
            _sender=admin,
        )

    oe.create_open_edition(
        sp.record(
            token_info={"": b("ipfs://allocated-token")},
            sale=sp.record(
                active=True,
                start=sp.cast(None, sp.option[sp.timestamp]),
                end=sp.cast(None, sp.option[sp.timestamp]),
                base_price=sp.mutez(0),
                increment=sp.mutez(0),
                step_size=sp.nat(1),
                min_price=sp.cast(None, sp.option[sp.mutez]),
                max_price=sp.cast(None, sp.option[sp.mutez]),
                max_supply=sp.Some(sp.nat(10)),
                treasury=admin.address,
            ),
            creator_reserve=sp.nat(0),
            lock_policy=True,
        ),
        _sender=admin,
    )
    oe.add_minter(allocation_adapter.address, _sender=admin)
    allocation_adapter.create_allocation(
        sp.record(target=oe.address, token_id=0, amount_per_open=1, active=True),
        _sender=admin,
    )
    allocation_adapter.add_router(packs.address, _sender=admin)

    generator.create_project(
        sp.record(
            active=True,
            name=b("Ravioli Rotini PNG"),
            symbol=b("RRP"),
            generator_uri=b("ipfs://offline-generator"),
            display_uri=b("ipfs://project-preview"),
            output_mode=b("png"),
            price=sp.mutez(0),
            treasury=admin.address,
            max_supply=sp.Some(sp.nat(10)),
            max_per_wallet=sp.Some(sp.nat(1)),
            reservation_ttl=sp.nat(100),
        ),
        _sender=admin,
    )
    generator.add_pack_minter(generation_adapter.address, _sender=admin)
    generation_adapter.create_resource(
        sp.record(target=generator.address, project_id=0, active=True), _sender=admin
    )
    # Rotini's output mode is part of the project contract.  Keep one resource for
    # each accepted output so a Ravioli generative recipe proves the same typed
    # adapter works for PNG, animated GIF, and dependency-free ZIP artifacts.
    for output_mode, name, symbol in [
        ("gif", "Ravioli Rotini GIF", "RRG"),
        ("zip", "Ravioli Rotini ZIP", "RRZ"),
    ]:
        generator.create_project(
            sp.record(
                active=True,
                name=b(name),
                symbol=b(symbol),
                generator_uri=b("ipfs://offline-generator"),
                display_uri=b("ipfs://project-preview"),
                output_mode=b(output_mode),
                price=sp.mutez(0),
                treasury=admin.address,
                max_supply=sp.Some(sp.nat(10)),
                max_per_wallet=sp.Some(sp.nat(1)),
                reservation_ttl=sp.nat(100),
            ),
            _sender=admin,
        )
    generation_adapter.create_resource(
        sp.record(target=generator.address, project_id=1, active=True), _sender=admin
    )
    generation_adapter.create_resource(
        sp.record(target=generator.address, project_id=2, active=True), _sender=admin
    )
    generation_adapter.add_router(packs.address, _sender=admin)

    scenario.h2("Mode 0: deterministic vaulted bundle transfers an existing FA2 token")
    create_pack(packs, admin, 0, mode=0, item_count=1, blind=False)
    commit(packs, admin, 0, 0, [escrow_reservation(asset, 0)])
    packs.finalize_pack(0, _sender=admin)
    packs.mint(sp.record(to_=alice.address, token_id=0, amount=1), _sender=admin)
    packs.open_pack(
        sp.record(token_id=0, nonce=nonce(0), actions=[escrow_action(asset, 0)]),
        _sender=alice,
    )
    scenario.verify(asset.data.ledger[sp.record(owner=alice.address, token_id=0)] == 1)
    scenario.verify(packs.data.total_supply[0] == 0)
    scenario.verify(packs.data.opened[0] == 1)

    scenario.h2("Mode 1: blind funded pool commits two distinct existing-token allocations")
    create_pack(packs, admin, 1, mode=1, item_count=1, max_supply=2)
    commit(packs, admin, 1, 10, [escrow_reservation(asset, 0)])
    commit(packs, admin, 1, 11, [escrow_reservation(asset, 1)])
    packs.finalize_pack(1, _sender=admin)
    packs.mint(sp.record(to_=alice.address, token_id=1, amount=1), _sender=admin)
    packs.mint(sp.record(to_=bob.address, token_id=1, amount=1), _sender=admin)
    packs.open_pack(
        sp.record(token_id=1, nonce=nonce(10), actions=[escrow_action(asset, 0)]),
        _sender=alice,
    )
    packs.open_pack(
        sp.record(token_id=1, nonce=nonce(11), actions=[escrow_action(asset, 1)]),
        _sender=bob,
    )
    scenario.verify(asset.data.ledger[sp.record(owner=bob.address, token_id=1)] == 1)

    scenario.h2("Mode 2: a blind unminted allocation is reserved before wrapper issuance")
    create_pack(packs, admin, 2, mode=2, item_count=1)
    commit(packs, admin, 2, 20, [allocated_reservation(allocation_adapter)])
    scenario.verify(oe.data.total_reserved[0] == 1)
    packs.finalize_pack(2, _sender=admin)
    packs.mint(sp.record(to_=alice.address, token_id=2, amount=1), _sender=admin)
    oe.set_sale_active(sp.record(token_id=0, active=False), _sender=admin)
    packs.open_pack(
        sp.record(
            token_id=2,
            nonce=nonce(20),
            actions=[
                allocated_action(
                    allocation_adapter,
                    payload=sp.bytes("0x01"),
                )
            ],
        ),
        _sender=alice,
        _valid=False,
        _exception="BAD_RECIPE",
    )
    scenario.verify(packs.data.ledger[sp.record(owner=alice.address, token_id=2)] == 1)
    scenario.verify(oe.data.total_reserved[0] == 1)
    packs.open_pack(
        sp.record(
            token_id=2,
            nonce=nonce(20),
            actions=[allocated_action(allocation_adapter)],
        ),
        _sender=alice,
    )
    scenario.verify(oe.data.total_reserved[0] == 0)
    scenario.verify(oe.data.total_minted[0] == 1)
    scenario.verify(oe.data.ledger[sp.record(owner=alice.address, token_id=0)] == 1)

    scenario.h2("Mode 3: an exact payload commitment rejects artifact substitution atomically")
    create_pack(packs, admin, 3, mode=3, item_count=1)
    committed_png = artifact_payload(30)
    commit(
        packs,
        admin,
        3,
        30,
        [generative_reservation(generation_adapter, payload=committed_png)],
    )
    packs.finalize_pack(3, _sender=admin)
    packs.mint(sp.record(to_=alice.address, token_id=3, amount=1), _sender=admin)
    packs.open_pack(
        sp.record(
            token_id=3,
            nonce=nonce(30),
            actions=[generative_action(generation_adapter, 31)],
        ),
        _sender=alice,
        _valid=False,
        _exception="BAD_RECIPE",
    )
    scenario.verify(packs.data.ledger[sp.record(owner=alice.address, token_id=3)] == 1)
    scenario.verify(generation_adapter.data.reservations[
        sp.record(pack_contract=packs.address, pack_token_id=3, resource_id=0)
    ] == 1)
    scenario.verify(generator.data.projects[0].reserved == 1)
    packs.open_pack(
        sp.record(
            token_id=3,
            nonce=nonce(30),
            actions=[generative_action(generation_adapter, 30)],
        ),
        _sender=alice,
    )
    scenario.verify(generator.data.ledger[sp.record(owner=alice.address, token_id=0)] == 1)

    scenario.h2("Mode 4: hybrid atomically delivers escrow, allocation, and generative output")
    oe.set_sale_active(sp.record(token_id=0, active=True), _sender=admin)
    create_pack(packs, admin, 4, mode=4, item_count=3)
    hybrid_reservations = [
        escrow_reservation(asset, 1, amount=2),
        allocated_reservation(allocation_adapter),
        generative_reservation(generation_adapter),
    ]
    commit(packs, admin, 4, 40, hybrid_reservations)
    packs.finalize_pack(4, _sender=admin)
    packs.mint(sp.record(to_=alice.address, token_id=4, amount=1), _sender=admin)
    packs.open_pack(
        sp.record(
            token_id=4,
            nonce=nonce(999),
            actions=[
                escrow_action(asset, 1, amount=2),
                allocated_action(allocation_adapter),
                generative_action(generation_adapter, 40, generated_at_open=True),
            ],
        ),
        _sender=alice,
        _valid=False,
        _exception="BAD_RECIPE",
    )
    scenario.verify(packs.data.ledger[sp.record(owner=alice.address, token_id=4)] == 1)
    packs.open_pack(
        sp.record(
            token_id=4,
            nonce=nonce(40),
            actions=[
                escrow_action(asset, 1, amount=2),
                allocated_action(allocation_adapter),
                generative_action(generation_adapter, 40, generated_at_open=True),
            ],
        ),
        _sender=alice,
    )
    scenario.verify(asset.data.ledger[sp.record(owner=alice.address, token_id=1)] == 2)
    scenario.verify(oe.data.ledger[sp.record(owner=alice.address, token_id=0)] == 2)
    # The public wallet cap is one, but both pack units were pre-reserved and remain fulfillable.
    scenario.verify(generator.data.ledger[sp.record(owner=alice.address, token_id=1)] == 1)
    scenario.verify(generator.data.minted_by[sp.record(owner=alice.address, token_id=0)] == 2)
    scenario.verify(packs.data.total_supply[4] == 0)
    scenario.verify(packs.data.opened[4] == 1)

    scenario.h2("Generative wrappers preserve Rotini GIF and offline ZIP output bindings")
    for token_id, serial, resource_id, mime, project_token_id in [
        (5, 50, 1, "image/gif", 2),
        (6, 60, 2, "application/zip", 3),
    ]:
        create_pack(packs, admin, token_id, mode=3, item_count=1)
        commit(
            packs,
            admin,
            token_id,
            serial,
            [
                generative_reservation(
                    generation_adapter,
                    resource_id,
                    payload=artifact_payload(serial, mime),
                )
            ],
        )
        packs.finalize_pack(token_id, _sender=admin)
        packs.mint(sp.record(to_=alice.address, token_id=token_id, amount=1), _sender=admin)
        packs.open_pack(
            sp.record(
                token_id=token_id,
                nonce=nonce(serial),
                actions=[generative_action(generation_adapter, serial, resource_id, mime)],
            ),
            _sender=alice,
        )
        scenario.verify(generator.data.token_artifact[project_token_id].mime_type == b(mime))
        scenario.verify(generator.data.token_artifact[project_token_id].artifact_uri == b(f"ipfs://artifact-{serial}.{mime.rsplit('/', 1)[-1]}"))
        scenario.verify(generator.data.ledger[sp.record(owner=alice.address, token_id=project_token_id)] == 1)

    scenario.h2("Backing cannot be recovered until the fully opened pack is explicitly closed")
    packs.recover_asset(
        sp.record(token_id=4, fa2=asset.address, asset_token_id=1, amount=1),
        _sender=admin,
        _valid=False,
        _exception="PACK_STILL_LIVE",
    )
    packs.cancel_pack(4, _sender=admin)
    scenario.verify(packs.data.packs[4].cancelled)


@sp.add_test()
def ravioli_mode_and_wrapper_balance_invariants():
    """Mode tags must agree with recipes and opening must burn one wrapper only.

    The second assertion protects the FA2 conservation invariant when the
    router itself already owns wrapper inventory (for example, a creator
    escrows sale inventory at the router before a collector opens a pack).
    """
    scenario = sp.test_scenario(
        "Ravioli mode and wrapper balance invariants", [standard, router]
    )
    admin = sp.test_account("admin")
    alice = sp.test_account("alice")
    bob = sp.test_account("bob")
    metadata = sp.big_map({"": b("ipfs://contract-metadata")})
    asset = standard.PastaStandardCollectionFA2(admin.address, metadata)
    packs = router.PastaPackRouterFA2(admin.address, metadata)
    scenario += asset
    scenario += packs

    asset.create_token({"": b("ipfs://existing")}, _sender=admin)
    asset.mint(sp.record(to_=admin.address, token_id=0, amount=3), _sender=admin)
    asset.update_operators(
        [
            sp.variant(
                "add_operator",
                sp.record(owner=admin.address, operator=packs.address, token_id=0),
            )
        ],
        _sender=admin,
    )

    # A mode-2 pack is allocation-backed and must reject an escrow recipe
    # before attempting any child transfer.
    create_pack(packs, admin, 0, mode=2, item_count=1)
    packs.commit_recipe(
        sp.record(
            token_id=sp.nat(0),
            nonce_commitment=sp.blake2b(nonce(200)),
            reservations=[escrow_reservation(asset, 0)],
        ),
        _sender=admin,
        _valid=False,
        _exception="MODE_RECIPE_MISMATCH",
    )
    packs.commit_recipe(
        sp.record(
            token_id=sp.nat(0),
            nonce_commitment=sp.blake2b(nonce(200)),
            reservations=[
                sp.variant(
                    "allocated_mint",
                    sp.record(
                        adapter=asset.address,
                        resource_id=sp.nat(0),
                        payload_commitment=sp.cast(None, sp.option[sp.bytes]),
                    ),
                )
            ],
        ),
        _sender=admin,
        _valid=False,
        _exception="MISSING_PAYLOAD_COMMITMENT",
    )
    packs.commit_recipe(
        sp.record(
            token_id=sp.nat(0),
            nonce_commitment=sp.blake2b(nonce(200)),
            reservations=[
                sp.variant(
                    "allocated_mint",
                    sp.record(
                        adapter=asset.address,
                        resource_id=sp.nat(0),
                        payload_commitment=sp.Some(sp.bytes("0x01")),
                    ),
                )
            ],
        ),
        _sender=admin,
        _valid=False,
        _exception="BAD_PAYLOAD_COMMITMENT",
    )

    # A mode-0 escrow pack can coexist with router-held wrapper inventory.
    # Opening Alice's unit must leave the two inventory units untouched.
    create_pack(packs, admin, 1, mode=0, item_count=1, max_supply=3, blind=False)
    commit(packs, admin, 1, 201, [escrow_reservation(asset, 0)])
    commit(packs, admin, 1, 202, [escrow_reservation(asset, 0)])
    commit(packs, admin, 1, 203, [escrow_reservation(asset, 0)])
    packs.finalize_pack(1, _sender=admin)
    packs.mint(sp.record(to_=packs.address, token_id=1, amount=2), _sender=admin)
    packs.mint(sp.record(to_=alice.address, token_id=1, amount=1), _sender=admin)
    # FA2/TZIP-12 treats zero transfers as normal transfers.  The router must
    # accept the operation without changing either balance or supply.
    packs.transfer(
        [
            sp.record(
                from_=alice.address,
                txs=[sp.record(to_=bob.address, token_id=1, amount=0)],
            )
        ],
        _sender=alice,
    )
    scenario.verify(packs.data.ledger[sp.record(owner=alice.address, token_id=1)] == 1)
    scenario.verify(packs.data.total_supply[1] == 3)
    packs.open_pack(
        sp.record(token_id=1, nonce=nonce(201), actions=[escrow_action(asset, 0)]),
        _sender=alice,
    )
    scenario.verify(
        packs.data.ledger[sp.record(owner=packs.address, token_id=1)] == 2
    )
    scenario.verify(packs.data.total_supply[1] == 2)
    scenario.verify(asset.data.ledger[sp.record(owner=alice.address, token_id=0)] == 1)

    scenario.h2("A free primary sale transfers the wrapper without an empty tez transaction")
    asset.mint(sp.record(to_=admin.address, token_id=0, amount=1), _sender=admin)
    create_pack(packs, admin, 2, mode=0, item_count=1, blind=False)
    commit(packs, admin, 2, 204, [escrow_reservation(asset, 0)])
    packs.finalize_pack(2, _sender=admin)
    packs.mint(sp.record(to_=admin.address, token_id=2, amount=1), _sender=admin)
    packs.set_sale(
        sp.record(
            token_id=sp.nat(2),
            sale=sp.record(
                active=True,
                seller=admin.address,
                treasury=admin.address,
                price=sp.mutez(0),
                remaining=sp.nat(1),
                start=sp.cast(None, sp.option[sp.timestamp]),
                end=sp.cast(None, sp.option[sp.timestamp]),
            ),
        ),
        _sender=admin,
    )
    packs.buy(
        sp.record(token_id=sp.nat(2), amount=sp.nat(1)),
        _sender=bob,
        _amount=sp.mutez(0),
    )
    scenario.verify(packs.data.ledger[sp.record(owner=bob.address, token_id=2)] == 1)
    scenario.verify(packs.data.sales[2].remaining == 0)
