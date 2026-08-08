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
blind_controller_source = load_module(
    "pasta_ravioli_blind_controller", "PastaBlindPackController.py"
)
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
blind_controller = blind_controller_source.main
gnocchi_adapter = gnocchi_adapter_source.main
rotini_adapter = rotini_adapter_source.main


@sp.module
def ravioli_test_support():
    WithdrawRefundType: type = sp.record(
        destination=sp.address,
        amount=sp.mutez,
    )
    RequestWithdrawalType: type = sp.record(
        controller=sp.address,
        destination=sp.address,
        amount=sp.mutez,
    )

    class Treasury(sp.Contract):
        def __init__(self, reject):
            self.data.received = sp.mutez(0)
            self.data.reject = sp.cast(reject, sp.bool)

        @sp.entrypoint
        def default(self):
            assert not self.data.reject, "REJECT_TEZ"
            self.data.received += sp.amount

    class RefundHolder(sp.Contract):
        def __init__(self):
            self.data.marker = ()

        @sp.entrypoint
        def default(self):
            assert False, "REJECT_TEZ"

        @sp.entrypoint
        def withdraw(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, RequestWithdrawalType)
            handle = sp.contract(
                WithdrawRefundType,
                params.controller,
                "withdraw_refund",
            ).unwrap_some(error="BAD_REFUND_CONTROLLER")
            sp.transfer(
                sp.record(
                    destination=params.destination,
                    amount=params.amount,
                ),
                sp.mutez(0),
                handle,
            )


def b(value):
    return sp.bytes("0x" + value.encode("utf-8").hex())


def nonce(value):
    # Ravioli v3 standardizes open preimages at exactly 32 bytes so a creator
    # cannot rely on an operation-sized nonce that holders cannot submit.
    raw = f"ravioli-proof-nonce-{value}".encode("utf-8")
    return sp.bytes("0x" + raw.hex().ljust(64, "0")[:64])


def reveal_uri(token_id):
    return b(f"ipfs://ravioli-contents-{token_id}")


def reveal_salt(token_id):
    return sp.bytes("0x" + f"{token_id + 1:02x}" * 32)


def reveal_commitment(token_id, offset=0, contents_uri=None, salt=None):
    if contents_uri is None:
        contents_uri = reveal_uri(token_id)
    if salt is None:
        salt = reveal_salt(token_id)
    reveal = sp.record(
        contents_uri=contents_uri,
        salt=salt,
        offset=sp.nat(offset),
    )
    sp.cast(
        reveal,
        sp.record(
            contents_uri=sp.bytes,
            salt=sp.bytes,
            offset=sp.nat,
        ).layout(("contents_uri", ("offset", "salt"))),
    )
    return sp.blake2b(sp.pack(reveal))


def pack_config(
    token_id,
    mode,
    item_count,
    max_supply=1,
    blind=True,
    child_expiry=None,
    wrapper_sale_end=None,
    manifest_uri=None,
    reveal_deadline=None,
    reveal_offset=0,
    open_deadline=None,
):
    if blind and reveal_deadline is None:
        reveal_deadline = child_expiry if child_expiry is not None else 2_000
    if blind and open_deadline is None:
        open_deadline = 2_500
    return sp.record(
        mode=sp.nat(mode),
        blind=blind,
        item_count=sp.nat(item_count),
        max_supply=sp.nat(max_supply),
        committed_recipes=sp.nat(0),
        finalized=False,
        cancelled=False,
        contents_uri=sp.cast(None, sp.option[sp.bytes]),
        manifest_uri=(
            b("ipfs://ravioli-manifest") if manifest_uri is None else manifest_uri
        ),
        child_expiry=(
            sp.cast(None, sp.option[sp.timestamp])
            if child_expiry is None
            else sp.Some(sp.timestamp(child_expiry))
        ),
        wrapper_sale_end=(
            sp.cast(None, sp.option[sp.timestamp])
            if wrapper_sale_end is None
            else sp.Some(sp.timestamp(wrapper_sale_end))
        ),
        reveal_deadline=(
            sp.cast(None, sp.option[sp.timestamp])
            if not blind
            else sp.Some(sp.timestamp(reveal_deadline))
        ),
        open_deadline=(
            sp.cast(None, sp.option[sp.timestamp])
            if not blind
            else sp.Some(sp.timestamp(open_deadline))
        ),
        reveal_commitment=(
            sp.cast(None, sp.option[sp.bytes])
            if not blind
            else sp.Some(reveal_commitment(token_id, reveal_offset))
        ),
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


def create_pack(
    pack_router,
    admin,
    token_id,
    mode,
    item_count,
    max_supply=1,
    blind=True,
    child_expiry=None,
    wrapper_sale_end=None,
    manifest_uri=None,
    reveal_deadline=None,
    reveal_offset=0,
    open_deadline=None,
    **scenario_args,
):
    pack_router.create_pack(
        sp.record(
            expected_token_id=sp.nat(token_id),
            token_info={
                "": b(f"ipfs://ravioli-wrapper-{token_id}"),
                "name": b(f"Ravioli mode {mode}"),
                "symbol": b("RAV"),
                "decimals": sp.bytes("0x30"),
            },
            config=pack_config(
                token_id,
                mode,
                item_count,
                max_supply,
                blind,
                child_expiry,
                wrapper_sale_end,
                manifest_uri,
                reveal_deadline,
                reveal_offset,
                open_deadline,
            ),
        ),
        _sender=admin,
        **scenario_args,
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


def reveal(
    pack_router,
    admin,
    token_id,
    offset=0,
    contents_uri=None,
    salt=None,
    **scenario_args,
):
    if contents_uri is None:
        contents_uri = reveal_uri(token_id)
    if salt is None:
        salt = reveal_salt(token_id)
    pack_router.set_pack_contents(
        sp.record(
            token_id=sp.nat(token_id),
            contents_uri=contents_uri,
            salt=salt,
            offset=sp.nat(offset),
        ),
        _sender=admin,
        **scenario_args,
    )


def open_params(token_id, nonce_value, actions, claim_id=None):
    return sp.record(
        token_id=sp.nat(token_id),
        expected_claim_id=(
            sp.cast(None, sp.option[sp.nat])
            if claim_id is None
            else sp.Some(sp.nat(claim_id))
        ),
        nonce=nonce(nonce_value),
        actions=actions,
    )


def wrapper_sale(
    admin,
    editions,
    end=None,
    active=True,
    price=0,
    start=None,
    treasury=None,
):
    if treasury is None:
        treasury = admin.address
    return sp.record(
        active=active,
        seller=admin.address,
        treasury=treasury,
        price=sp.mutez(price),
        remaining=sp.nat(editions),
        start=(
            sp.cast(None, sp.option[sp.timestamp])
            if start is None
            else sp.Some(sp.timestamp(start))
        ),
        end=(
            sp.cast(None, sp.option[sp.timestamp])
            if end is None
            else sp.Some(sp.timestamp(end))
        ),
    )


def finalize_le(
    pack_router,
    admin,
    token_id,
    editions,
    end,
    **scenario_args,
):
    pack_router.finalize_blind_pack(
        sp.record(
            token_id=sp.nat(token_id),
            sale=wrapper_sale(admin, editions, end=end),
        ),
        _sender=admin,
        **scenario_args,
    )


def finalize_blind(
    pack_router,
    admin,
    token_id,
    editions,
    end=1_500,
    price=0,
    treasury=None,
    **scenario_args,
):
    pack_router.finalize_blind_pack(
        sp.record(
            token_id=sp.nat(token_id),
            sale=wrapper_sale(
                admin,
                editions,
                end=end,
                price=price,
                treasury=treasury,
            ),
        ),
        _sender=admin,
        **scenario_args,
    )


def deploy_pack_router(scenario, admin, metadata):
    controller = blind_controller.PastaBlindPackController(metadata)
    packs = router.PastaPackRouterFA2(
        admin.address,
        metadata,
        controller.address,
    )
    scenario += controller
    scenario += packs
    return controller, packs


@sp.add_test()
def ravioli_pack_creation_identity_and_manifest_invariants():
    scenario = sp.test_scenario(
        "Ravioli pack creation identity and manifest invariants",
        [router, blind_controller],
    )
    admin = sp.test_account("admin")
    metadata = sp.big_map({"": b("ipfs://contract-metadata")})
    controller, packs = deploy_pack_router(scenario, admin, metadata)

    scenario.h2("Every new pack requires a bounded immutable manifest URI")
    create_pack(
        packs,
        admin,
        0,
        mode=3,
        item_count=1,
        manifest_uri=sp.bytes("0x"),
        _valid=False,
        _exception="BAD_MANIFEST_URI",
    )
    create_pack(
        packs,
        admin,
        0,
        mode=3,
        item_count=1,
        manifest_uri=sp.bytes("0x" + "ab" * 257),
        _valid=False,
        _exception="BAD_MANIFEST_URI",
    )
    scenario.verify(packs.data.next_token_id == 0)
    scenario.verify(~packs.data.packs.contains(0))
    scenario.verify(~packs.data.token_metadata.contains(0))

    manifest_uri = b("ipfs://ravioli-pack-zero/manifest.json")
    create_pack(
        packs,
        admin,
        0,
        mode=3,
        item_count=1,
        manifest_uri=manifest_uri,
    )
    scenario.verify(packs.data.next_token_id == 1)
    scenario.verify(packs.data.packs[0].manifest_uri == manifest_uri)

    scenario.h2("A stale expected id fails before creating any later pack state")
    create_pack(
        packs,
        admin,
        0,
        mode=3,
        item_count=1,
        manifest_uri=b("ipfs://stale/manifest.json"),
        _valid=False,
        _exception="STALE_EXPECTED_TOKEN_ID",
    )
    scenario.verify(packs.data.next_token_id == 1)
    scenario.verify(~packs.data.packs.contains(1))
    scenario.verify(~packs.data.token_metadata.contains(1))

    scenario.h2("Cancellation cannot replace the committed manifest")
    packs.cancel_pack(0, _sender=admin)
    scenario.verify(packs.data.packs[0].manifest_uri == manifest_uri)

    next_manifest_uri = b("ipfs://ravioli-pack-one/manifest.json")
    create_pack(
        packs,
        admin,
        1,
        mode=0,
        item_count=1,
        blind=False,
        manifest_uri=next_manifest_uri,
    )
    scenario.verify(packs.data.next_token_id == 2)
    scenario.verify(packs.data.packs[1].manifest_uri == next_manifest_uri)


@sp.add_test()
def ravioli_five_mode_atomic_fulfillment():
    scenario = sp.test_scenario(
        "Ravioli five-mode atomic fulfillment",
        [
            standard,
            gnocchi,
            rotini,
            router,
            blind_controller,
            gnocchi_adapter,
            rotini_adapter,
        ],
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
    controller, packs = deploy_pack_router(scenario, admin, metadata)
    scenario += asset
    scenario += oe
    scenario += generator
    scenario += allocation_adapter
    scenario += generation_adapter

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

    child_expiry = 1_000
    wrapper_sale_end = 900
    oe.create_open_edition(
        sp.record(
            token_info={"": b("ipfs://allocated-token")},
            sale=sp.record(
                active=True,
                start=sp.cast(None, sp.option[sp.timestamp]),
                end=sp.Some(sp.timestamp(child_expiry)),
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
    oe.create_open_edition(
        sp.record(
            token_info={"": b("ipfs://forever-allocated-token")},
            sale=sp.record(
                active=True,
                start=sp.cast(None, sp.option[sp.timestamp]),
                end=sp.cast(None, sp.option[sp.timestamp]),
                base_price=sp.mutez(0),
                increment=sp.mutez(0),
                step_size=sp.nat(1),
                min_price=sp.cast(None, sp.option[sp.mutez]),
                max_price=sp.cast(None, sp.option[sp.mutez]),
                max_supply=sp.cast(None, sp.option[sp.nat]),
                treasury=admin.address,
            ),
            creator_reserve=sp.nat(0),
            lock_policy=True,
        ),
        _sender=admin,
    )
    allocation_adapter.create_allocation(
        sp.record(target=oe.address, token_id=1, amount_per_open=1, active=True),
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
            max_supply=sp.Some(sp.nat(20)),
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
        sp.record(
            token_id=sp.nat(0),
            expected_claim_id=sp.cast(None, sp.option[sp.nat]),
            nonce=b("short"),
            actions=[escrow_action(asset, 0)],
        ),
        _sender=alice,
        _valid=False,
        _exception="BAD_NONCE_LENGTH",
    )
    scenario.verify(packs.data.ledger[sp.record(owner=alice.address, token_id=0)] == 1)
    packs.open_pack(
        open_params(0, 0, [escrow_action(asset, 0)]),
        _sender=alice,
    )
    scenario.verify(asset.data.ledger[sp.record(owner=alice.address, token_id=0)] == 1)
    scenario.verify(packs.data.total_supply[0] == 0)
    scenario.verify(packs.data.opened[0] == 1)

    scenario.h2("Mode 1: blind funded pool commits two distinct existing-token allocations")
    create_pack(packs, admin, 1, mode=1, item_count=1, max_supply=2)
    commit(packs, admin, 1, 10, [escrow_reservation(asset, 0)])
    commit(packs, admin, 1, 11, [escrow_reservation(asset, 1)])
    finalize_blind(packs, admin, 1, 2)
    packs.buy(
        sp.record(token_id=sp.nat(1), amount=sp.nat(1)),
        _sender=alice,
        _amount=sp.mutez(0),
    )
    packs.buy(
        sp.record(token_id=sp.nat(1), amount=sp.nat(1)),
        _sender=bob,
        _amount=sp.mutez(0),
    )
    reveal(packs, admin, 1)
    packs.open_pack(
        open_params(1, 10, [escrow_action(asset, 0)], claim_id=0),
        _sender=alice,
    )
    packs.open_pack(
        open_params(1, 11, [escrow_action(asset, 1)], claim_id=1),
        _sender=bob,
    )
    scenario.verify(asset.data.ledger[sp.record(owner=bob.address, token_id=1)] == 1)

    scenario.h2("Mode 2: a blind unminted allocation is reserved before wrapper issuance")
    create_pack(
        packs,
        admin,
        2,
        mode=2,
        item_count=1,
        child_expiry=child_expiry,
        wrapper_sale_end=wrapper_sale_end,
    )
    commit(packs, admin, 2, 20, [allocated_reservation(allocation_adapter)])
    scenario.verify(oe.data.total_reserved[0] == 1)
    packs.finalize_pack(
        2,
        _sender=admin,
        _valid=False,
        _exception="BLIND_USE_ATOMIC_ISSUE",
    )
    finalize_le(
        packs,
        admin,
        2,
        1,
        wrapper_sale_end,
        _now=sp.timestamp(100),
    )
    packs.buy(
        sp.record(token_id=sp.nat(2), amount=sp.nat(1)),
        _sender=alice,
        _amount=sp.mutez(0),
        _now=sp.timestamp(200),
    )
    reveal(packs, admin, 2, _now=sp.timestamp(300))
    oe.set_sale_active(sp.record(token_id=0, active=False), _sender=admin)
    packs.open_pack(
        open_params(
            2,
            20,
            [
                allocated_action(
                    allocation_adapter,
                    payload=sp.bytes("0x01"),
                )
            ],
            claim_id=0,
        ),
        _sender=alice,
        _now=sp.timestamp(child_expiry + 1),
        _valid=False,
        _exception="BAD_RECIPE",
    )
    scenario.verify(packs.data.ledger[sp.record(owner=alice.address, token_id=2)] == 1)
    scenario.verify(oe.data.total_reserved[0] == 1)
    packs.open_pack(
        open_params(
            2,
            20,
            [allocated_action(allocation_adapter)],
            claim_id=0,
        ),
        _sender=alice,
        _now=sp.timestamp(child_expiry + 1),
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
    finalize_blind(packs, admin, 3, 1)
    packs.buy(
        sp.record(token_id=sp.nat(3), amount=sp.nat(1)),
        _sender=alice,
        _amount=sp.mutez(0),
    )
    render_context_before = generation_adapter.get_render_context(
        sp.record(
            pack_contract=packs.address,
            pack_token_id=sp.nat(3),
            open_serial=sp.nat(0),
            action_index=sp.nat(0),
            resource_id=sp.nat(0),
        )
    )
    packs.transfer(
        [
            sp.record(
                from_=alice.address,
                txs=[
                    sp.record(to_=bob.address, token_id=sp.nat(3), amount=1)
                ],
            )
        ],
        _sender=alice,
    )
    render_context_after = generation_adapter.get_render_context(
        sp.record(
            pack_contract=packs.address,
            pack_token_id=sp.nat(3),
            open_serial=sp.nat(0),
            action_index=sp.nat(0),
            resource_id=sp.nat(0),
        )
    )
    scenario.verify(render_context_before.seed == render_context_after.seed)
    reveal(packs, admin, 3)
    packs.open_pack(
        open_params(
            3,
            30,
            [generative_action(generation_adapter, 31)],
            claim_id=0,
        ),
        _sender=bob,
        _valid=False,
        _exception="BAD_RECIPE",
    )
    scenario.verify(packs.data.ledger[sp.record(owner=bob.address, token_id=3)] == 1)
    scenario.verify(generation_adapter.data.reservations[
        sp.record(pack_contract=packs.address, pack_token_id=3, resource_id=0)
    ] == 1)
    scenario.verify(generator.data.projects[0].reserved == 1)
    packs.open_pack(
        open_params(
            3,
            30,
            [generative_action(generation_adapter, 30)],
            claim_id=0,
        ),
        _sender=bob,
    )
    scenario.verify(generator.data.ledger[sp.record(owner=bob.address, token_id=0)] == 1)
    scenario.verify(generator.data.token_seed[0] == render_context_before.seed)

    scenario.h2("Mode 4: hybrid atomically delivers escrow, allocation, and generative output")
    create_pack(packs, admin, 4, mode=4, item_count=3)
    hybrid_reservations = [
        escrow_reservation(asset, 1, amount=2),
        allocated_reservation(allocation_adapter, resource_id=1),
        generative_reservation(generation_adapter),
    ]
    commit(packs, admin, 4, 40, hybrid_reservations)
    finalize_blind(packs, admin, 4, 1)
    packs.buy(
        sp.record(token_id=sp.nat(4), amount=sp.nat(1)),
        _sender=alice,
        _amount=sp.mutez(0),
    )
    reveal(packs, admin, 4)
    packs.open_pack(
        open_params(
            4,
            999,
            [
                escrow_action(asset, 1, amount=2),
                allocated_action(allocation_adapter, resource_id=1),
                generative_action(generation_adapter, 40, generated_at_open=True),
            ],
            claim_id=0,
        ),
        _sender=alice,
        _valid=False,
        _exception="BAD_RECIPE",
    )
    scenario.verify(packs.data.ledger[sp.record(owner=alice.address, token_id=4)] == 1)
    packs.open_pack(
        open_params(
            4,
            40,
            [
                escrow_action(asset, 1, amount=2),
                allocated_action(allocation_adapter, resource_id=1),
                generative_action(generation_adapter, 40, generated_at_open=True),
            ],
            claim_id=0,
        ),
        _sender=alice,
    )
    scenario.verify(asset.data.ledger[sp.record(owner=alice.address, token_id=1)] == 2)
    scenario.verify(oe.data.ledger[sp.record(owner=alice.address, token_id=0)] == 1)
    scenario.verify(oe.data.ledger[sp.record(owner=alice.address, token_id=1)] == 1)
    # Each transferred pack keeps its reserved unit and recipient-independent
    # seed while minting ownership to the holder that ultimately opens it.
    scenario.verify(generator.data.ledger[sp.record(owner=alice.address, token_id=1)] == 1)
    scenario.verify(generator.data.minted_by[sp.record(owner=alice.address, token_id=0)] == 1)
    scenario.verify(generator.data.minted_by[sp.record(owner=bob.address, token_id=0)] == 1)
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
        finalize_blind(packs, admin, token_id, 1)
        packs.buy(
            sp.record(token_id=sp.nat(token_id), amount=sp.nat(1)),
            _sender=alice,
            _amount=sp.mutez(0),
        )
        reveal(packs, admin, token_id)
        packs.open_pack(
            open_params(
                token_id,
                serial,
                [generative_action(generation_adapter, serial, resource_id, mime)],
                claim_id=0,
            ),
            _sender=alice,
        )
        scenario.verify(generator.data.token_artifact[project_token_id].mime_type == b(mime))
        scenario.verify(generator.data.token_artifact[project_token_id].artifact_uri == b(f"ipfs://artifact-{serial}.{mime.rsplit('/', 1)[-1]}"))
        scenario.verify(generator.data.ledger[sp.record(owner=alice.address, token_id=project_token_id)] == 1)

    scenario.h2("Cancelled allocation packs release reserved Gnocchi capacity")
    create_pack(packs, admin, 7, mode=2, item_count=1)
    commit(
        packs,
        admin,
        7,
        70,
        [allocated_reservation(allocation_adapter, resource_id=1)],
    )
    scenario.verify(oe.data.total_reserved[1] == 1)
    packs.cancel_pack(7, _sender=admin)
    packs.recover_adapter(
        sp.record(
            token_id=sp.nat(7),
            adapter=allocation_adapter.address,
            kind=sp.nat(1),
            resource_id=sp.nat(1),
            capacity=sp.nat(1),
        ),
        _sender=admin,
    )
    scenario.verify(oe.data.total_reserved[1] == 0)

    scenario.h2("Aggregate adapter payloads retain Tezos operation-size headroom")
    create_pack(packs, admin, 8, mode=3, item_count=8)
    commit(
        packs,
        admin,
        8,
        80,
        [generative_reservation(generation_adapter) for _ in range(8)],
    )
    finalize_blind(packs, admin, 8, 1)
    packs.buy(
        sp.record(token_id=sp.nat(8), amount=sp.nat(1)),
        _sender=alice,
        _amount=sp.mutez(0),
    )
    reveal(packs, admin, 8)
    oversized_but_individually_valid = sp.bytes("0x" + "ab" * 3073)
    packs.open_pack(
        open_params(
            8,
            80,
            [
                sp.variant(
                    "generative_mint",
                    sp.record(
                        adapter=generation_adapter.address,
                        resource_id=sp.nat(0),
                        payload=oversized_but_individually_valid,
                        payload_commitment=sp.cast(None, sp.option[sp.bytes]),
                    ),
                )
                for _ in range(8)
            ],
            claim_id=0,
        ),
        _sender=alice,
        _valid=False,
        _exception="TOTAL_PAYLOAD_TOO_LARGE",
    )
    scenario.verify(packs.data.ledger[sp.record(owner=alice.address, token_id=8)] == 1)
    scenario.verify(generator.data.projects[0].reserved == 8)

    scenario.h2("Two same-project generative children receive distinct action-index seeds")
    create_pack(packs, admin, 9, mode=3, item_count=2)
    commit(
        packs,
        admin,
        9,
        90,
        [
            generative_reservation(generation_adapter),
            generative_reservation(generation_adapter),
        ],
    )
    finalize_blind(packs, admin, 9, 1)
    packs.buy(
        sp.record(token_id=sp.nat(9), amount=sp.nat(1)),
        _sender=alice,
        _amount=sp.mutez(0),
    )
    reveal(packs, admin, 9)
    packs.open_pack(
        open_params(
            9,
            90,
            [
                generative_action(generation_adapter, 90, generated_at_open=True),
                generative_action(generation_adapter, 90, generated_at_open=True),
            ],
            claim_id=0,
        ),
        _sender=alice,
    )
    scenario.verify(generator.data.token_seed[4] != generator.data.token_seed[5])
    scenario.verify(
        generator.data.token_metadata[4].token_info["pasta:packActionIndex"]
        == sp.pack(sp.nat(0))
    )
    scenario.verify(
        generator.data.token_metadata[5].token_info["pasta:packActionIndex"]
        == sp.pack(sp.nat(1))
    )
    scenario.verify(generator.data.projects[0].reserved == 8)

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
def ravioli_blind_claim_fairness_and_liveness():
    scenario = sp.test_scenario(
        "Ravioli blind claim fairness and liveness",
        [standard, router, blind_controller, ravioli_test_support],
    )
    admin = sp.test_account("admin")
    alice = sp.test_account("alice")
    bob = sp.test_account("bob")
    carol = sp.test_account("carol")
    dave = sp.test_account("dave")
    metadata = sp.big_map({"": b("ipfs://contract-metadata")})
    asset = standard.PastaStandardCollectionFA2(admin.address, metadata)
    treasury = ravioli_test_support.Treasury(False)
    rejecting_treasury = ravioli_test_support.Treasury(True)
    refund_holder = ravioli_test_support.RefundHolder()
    refund_sink = ravioli_test_support.Treasury(False)
    controller, packs = deploy_pack_router(scenario, admin, metadata)
    scenario += asset
    scenario += treasury
    scenario += rejecting_treasury
    scenario += refund_holder
    scenario += refund_sink

    for token_id, amount in [(0, 30), (1, 10), (2, 10)]:
        asset.create_token(
            {"": b(f"ipfs://blind-asset-{token_id}")}, _sender=admin
        )
        asset.mint(
            sp.record(to_=admin.address, token_id=token_id, amount=amount),
            _sender=admin,
        )
        asset.update_operators(
            [
                sp.variant(
                    "add_operator",
                    sp.record(
                        owner=admin.address,
                        operator=packs.address,
                        token_id=token_id,
                    ),
                )
            ],
            _sender=admin,
        )

    scenario.h2("Claims follow ordered FA2 transfers and fix a cyclic serial at reveal")
    create_pack(
        packs,
        admin,
        0,
        mode=1,
        item_count=1,
        max_supply=3,
        reveal_deadline=700,
        reveal_offset=1,
        open_deadline=900,
    )
    for serial, asset_token_id in [(0, 0), (1, 1), (2, 2)]:
        commit(
            packs,
            admin,
            0,
            100 + serial,
            [escrow_reservation(asset, asset_token_id)],
        )
    finalize_blind(
        packs,
        admin,
        0,
        3,
        end=500,
        price=100,
        treasury=treasury.address,
    )
    packs.buy(
        sp.record(token_id=sp.nat(0), amount=sp.nat(2)),
        _sender=alice,
        _amount=sp.mutez(200),
        _now=sp.timestamp(100),
    )
    packs.buy(
        sp.record(token_id=sp.nat(0), amount=sp.nat(1)),
        _sender=bob,
        _amount=sp.mutez(100),
        _now=sp.timestamp(100),
    )
    pack0 = sp.record(pack_contract=packs.address, pack_token_id=sp.nat(0))
    alice0 = sp.record(
        pack_contract=packs.address,
        pack_token_id=sp.nat(0),
        owner=alice.address,
    )
    bob0 = sp.record(
        pack_contract=packs.address,
        pack_token_id=sp.nat(0),
        owner=bob.address,
    )
    scenario.verify(controller.data.packs[pack0].escrowed == sp.mutez(300))
    scenario.verify(controller.data.claim_counts[alice0] == 2)
    scenario.verify(controller.data.claim_counts[bob0] == 1)
    scenario.verify(treasury.data.received == sp.mutez(0))

    packs.open_pack(
        open_params(0, 101, [escrow_action(asset, 1)], claim_id=1),
        _sender=alice,
        _now=sp.timestamp(150),
        _valid=False,
        _exception="BLIND_NOT_REVEALED",
    )
    packs.update_operators(
        [
            sp.variant(
                "add_operator",
                sp.record(
                    owner=carol.address,
                    operator=alice.address,
                    token_id=sp.nat(0),
                ),
            )
        ],
        _sender=carol,
    )
    packs.transfer(
        [
            sp.record(
                from_=alice.address,
                txs=[
                    sp.record(
                        to_=carol.address,
                        token_id=sp.nat(0),
                        amount=sp.nat(1),
                    )
                ],
            ),
            sp.record(
                from_=carol.address,
                txs=[
                    sp.record(
                        to_=dave.address,
                        token_id=sp.nat(0),
                        amount=sp.nat(1),
                    )
                ],
            ),
        ],
        _sender=alice,
    )
    dave0 = sp.record(
        pack_contract=packs.address,
        pack_token_id=sp.nat(0),
        owner=dave.address,
    )
    scenario.verify(controller.data.claim_counts[alice0] == 1)
    scenario.verify(~controller.data.claim_counts.contains(
        sp.record(
            pack_contract=packs.address,
            pack_token_id=sp.nat(0),
            owner=carol.address,
        )
    ))
    scenario.verify(controller.data.claim_counts[dave0] == 1)
    scenario.verify(
        controller.data.claim_slots[
            sp.record(
                pack_contract=packs.address,
                pack_token_id=sp.nat(0),
                owner=dave.address,
                slot=sp.nat(0),
            )
        ].claim_id
        == 1
    )

    reveal(
        packs,
        admin,
        0,
        offset=1,
        salt=sp.bytes("0x" + "ff" * 32),
        _now=sp.timestamp(200),
        _valid=False,
        _exception="BAD_REVEAL",
    )
    scenario.verify(packs.data.packs[0].contents_uri.is_none())
    reveal(packs, admin, 0, offset=1, _now=sp.timestamp(200))
    status0 = controller.get_pack_status(pack0)
    scenario.verify(status0.contents_uri == sp.Some(reveal_uri(0)))
    scenario.verify(status0.reveal_salt == sp.Some(reveal_salt(0)))
    scenario.verify(status0.reveal_offset == sp.Some(sp.nat(1)))
    scenario.verify(status0.open_deadline == sp.timestamp(900))
    scenario.verify(controller.data.packs[pack0].escrowed == sp.mutez(300))
    scenario.verify(treasury.data.received == sp.mutez(0))
    reveal(
        packs,
        admin,
        0,
        offset=1,
        _now=sp.timestamp(201),
        _valid=False,
        _exception="CONTENTS_LOCKED",
    )

    packs.open_pack(
        open_params(0, 100, [escrow_action(asset, 0)], claim_id=2),
        _sender=dave,
        _now=sp.timestamp(300),
        _valid=False,
        _exception="CLAIM_CHANGED",
    )
    packs.open_pack(
        open_params(0, 102, [escrow_action(asset, 2)], claim_id=1),
        _sender=dave,
        _now=sp.timestamp(300),
    )
    scenario.verify(treasury.data.received == sp.mutez(100))
    scenario.verify(controller.data.packs[pack0].escrowed == sp.mutez(200))
    packs.open_pack(
        open_params(0, 102, [escrow_action(asset, 2)], claim_id=1),
        _sender=dave,
        _now=sp.timestamp(301),
        _valid=False,
        _exception="FA2_INSUFFICIENT_BALANCE",
    )
    packs.open_pack(
        open_params(0, 101, [escrow_action(asset, 1)], claim_id=0),
        _sender=alice,
        _now=sp.timestamp(300),
    )
    packs.open_pack(
        open_params(0, 100, [escrow_action(asset, 0)], claim_id=2),
        _sender=bob,
        _now=sp.timestamp(300),
    )
    scenario.verify(treasury.data.received == sp.mutez(300))
    scenario.verify(controller.data.packs[pack0].escrowed == sp.mutez(0))
    scenario.verify(controller.data.packs[pack0].outstanding == 0)
    scenario.verify(packs.data.total_supply[0] == 0)

    scenario.h2("Both claim-move count and aggregate units are bounded at eight")
    create_pack(
        packs,
        admin,
        1,
        mode=1,
        item_count=1,
        max_supply=8,
        reveal_deadline=700,
        open_deadline=900,
    )
    for serial in range(8):
        commit(
            packs,
            admin,
            1,
            200 + serial,
            [escrow_reservation(asset, 0)],
        )
    finalize_blind(
        packs,
        admin,
        1,
        8,
        end=500,
    )
    packs.buy(
        sp.record(token_id=sp.nat(1), amount=sp.nat(8)),
        _sender=alice,
        _amount=sp.mutez(0),
        _now=sp.timestamp(100),
    )
    packs.transfer(
        [
            sp.record(
                from_=alice.address,
                txs=[
                    sp.record(to_=alice.address, token_id=sp.nat(1), amount=4),
                    sp.record(to_=alice.address, token_id=sp.nat(1), amount=4),
                ],
            )
        ],
        _sender=alice,
    )
    packs.transfer(
        [
            sp.record(
                from_=alice.address,
                txs=[
                    sp.record(to_=alice.address, token_id=sp.nat(1), amount=4),
                    sp.record(to_=alice.address, token_id=sp.nat(1), amount=5),
                ],
            )
        ],
        _sender=alice,
        _valid=False,
        _exception="CLAIM_BATCH_TOO_LARGE",
    )
    alice1 = sp.record(
        pack_contract=packs.address,
        pack_token_id=sp.nat(1),
        owner=alice.address,
    )
    scenario.verify(controller.data.claim_counts[alice1] == 8)
    scenario.verify(
        packs.data.ledger[sp.record(owner=alice.address, token_id=1)] == 8
    )

    scenario.h2("Partial sale reveal burns only unsold inventory and mixed settlement closes")
    create_pack(
        packs,
        admin,
        2,
        mode=1,
        item_count=1,
        max_supply=3,
        reveal_deadline=700,
        open_deadline=900,
    )
    for serial, asset_token_id in [(0, 0), (1, 1), (2, 2)]:
        commit(
            packs,
            admin,
            2,
            300 + serial,
            [escrow_reservation(asset, asset_token_id)],
        )
    finalize_blind(
        packs,
        admin,
        2,
        3,
        end=500,
        price=100,
        treasury=treasury.address,
    )
    packs.buy(
        sp.record(token_id=sp.nat(2), amount=sp.nat(2)),
        _sender=alice,
        _amount=sp.mutez(200),
        _now=sp.timestamp(100),
    )
    reveal(
        packs,
        admin,
        2,
        _now=sp.timestamp(200),
        _valid=False,
        _exception="SALE_STILL_OPEN",
    )
    scenario.verify(packs.data.sales[2].remaining == 1)
    scenario.verify(packs.data.total_supply[2] == 3)
    reveal(packs, admin, 2, _now=sp.timestamp(500))
    pack2 = sp.record(pack_contract=packs.address, pack_token_id=sp.nat(2))
    scenario.verify(packs.data.total_supply[2] == 2)
    scenario.verify(packs.data.minted[2] == 2)
    scenario.verify(packs.data.sales[2].remaining == 0)
    scenario.verify(controller.data.packs[pack2].escrowed == sp.mutez(200))
    scenario.verify(treasury.data.received == sp.mutez(300))
    packs.open_pack(
        open_params(2, 301, [escrow_action(asset, 1)], claim_id=1),
        _sender=alice,
        _now=sp.timestamp(600),
    )
    scenario.verify(treasury.data.received == sp.mutez(400))
    scenario.verify(controller.data.packs[pack2].escrowed == sp.mutez(100))
    packs.transfer(
        [
            sp.record(
                from_=alice.address,
                txs=[
                    sp.record(to_=alice.address, token_id=sp.nat(2), amount=1)
                ],
            )
        ],
        _sender=alice,
        _now=sp.timestamp(899),
    )
    packs.refund_blind_claims(
        sp.record(
            token_id=sp.nat(2),
            holder=alice.address,
            amount=sp.nat(1),
            expected_claim_id=0,
        ),
        _sender=admin,
        _now=sp.timestamp(899),
        _valid=False,
        _exception="REFUND_NOT_AVAILABLE",
    )
    packs.open_pack(
        open_params(2, 300, [escrow_action(asset, 0)], claim_id=0),
        _sender=alice,
        _now=sp.timestamp(900),
        _valid=False,
        _exception="OPEN_DEADLINE_PASSED",
    )
    packs.transfer(
        [
            sp.record(
                from_=alice.address,
                txs=[
                    sp.record(to_=alice.address, token_id=sp.nat(2), amount=1)
                ],
            )
        ],
        _sender=alice,
        _now=sp.timestamp(900),
        _valid=False,
        _exception="TRANSFER_DEADLINE_PASSED",
    )
    packs.refund_blind_claims(
        sp.record(
            token_id=sp.nat(2),
            holder=alice.address,
            amount=sp.nat(1),
            expected_claim_id=0,
        ),
        _sender=admin,
        _now=sp.timestamp(900),
    )
    scenario.verify(controller.data.packs[pack2].escrowed == sp.mutez(0))
    scenario.verify(packs.data.total_supply[2] == 0)
    scenario.verify(packs.data.minted[2] == 1)
    scenario.verify(packs.data.opened[2] == 1)
    packs.recover_asset(
        sp.record(token_id=2, fa2=asset.address, asset_token_id=0, amount=1),
        _sender=admin,
        _valid=False,
        _exception="PACK_STILL_LIVE",
    )
    packs.cancel_pack(2, _sender=admin)
    for asset_token_id in [0, 2]:
        packs.recover_asset(
            sp.record(
                token_id=2,
                fa2=asset.address,
                asset_token_id=asset_token_id,
                amount=1,
            ),
            _sender=admin,
        )

    scenario.h2("Withheld reveal refunds the current holder, then timeout burns only inventory")
    create_pack(
        packs,
        admin,
        3,
        mode=1,
        item_count=1,
        max_supply=2,
        reveal_deadline=1_700,
        open_deadline=1_900,
    )
    commit(packs, admin, 3, 400, [escrow_reservation(asset, 0)])
    commit(packs, admin, 3, 401, [escrow_reservation(asset, 0)])
    finalize_blind(
        packs,
        admin,
        3,
        2,
        end=1_500,
        price=100,
        _now=sp.timestamp(1_000),
    )
    packs.buy(
        sp.record(token_id=sp.nat(3), amount=sp.nat(1)),
        _sender=carol,
        _amount=sp.mutez(100),
        _now=sp.timestamp(1_100),
    )
    packs.update_operators(
        [
            sp.variant(
                "add_operator",
                sp.record(
                    owner=carol.address,
                    operator=bob.address,
                    token_id=sp.nat(3),
                ),
            )
        ],
        _sender=carol,
    )
    packs.transfer(
        [
            sp.record(
                from_=carol.address,
                txs=[
                    sp.record(to_=carol.address, token_id=sp.nat(3), amount=1)
                ],
            )
        ],
        _sender=bob,
        _now=sp.timestamp(1_699),
    )
    packs.refund_blind_claims(
        sp.record(
            token_id=sp.nat(3),
            holder=carol.address,
            amount=sp.nat(1),
            expected_claim_id=0,
        ),
        _sender=bob,
        _now=sp.timestamp(1_699),
        _valid=False,
        _exception="REFUND_NOT_AVAILABLE",
    )
    packs.cancel_unrevealed_pack(
        3,
        _sender=bob,
        _now=sp.timestamp(1_700),
        _valid=False,
        _exception="CLAIMS_OUTSTANDING",
    )
    packs.transfer(
        [
            sp.record(
                from_=carol.address,
                txs=[
                    sp.record(to_=carol.address, token_id=sp.nat(3), amount=1)
                ],
            )
        ],
        _sender=bob,
        _now=sp.timestamp(1_700),
        _valid=False,
        _exception="TRANSFER_DEADLINE_PASSED",
    )
    controller.refund_claims(
        sp.record(
            pack_token_id=sp.nat(3),
            holder=carol.address,
            amount=sp.nat(1),
            expected_claim_id=sp.nat(0),
            expected_refund=sp.mutez(99),
        ),
        _sender=packs.address,
        _now=sp.timestamp(1_700),
        _valid=False,
        _exception="REFUND_QUOTE_CHANGED",
    )
    packs.refund_blind_claims(
        sp.record(
            token_id=sp.nat(3),
            holder=carol.address,
            amount=sp.nat(1),
            expected_claim_id=0,
        ),
        _sender=bob,
        _now=sp.timestamp(1_700),
    )
    pack3 = sp.record(pack_contract=packs.address, pack_token_id=sp.nat(3))
    scenario.verify(controller.data.packs[pack3].escrowed == sp.mutez(0))
    scenario.verify(controller.data.packs[pack3].outstanding == 0)
    scenario.verify(packs.data.total_supply[3] == 1)
    packs.cancel_unrevealed_pack(3, _sender=bob, _now=sp.timestamp(1_700))
    scenario.verify(packs.data.packs[3].cancelled)
    scenario.verify(packs.data.total_supply[3] == 0)
    scenario.verify(packs.data.minted[3] == 0)

    scenario.h2("A zero-price withheld claim refunds without an invalid zero transfer")
    create_pack(
        packs,
        admin,
        4,
        mode=1,
        item_count=1,
        reveal_deadline=2_700,
        open_deadline=2_900,
    )
    commit(packs, admin, 4, 500, [escrow_reservation(asset, 0)])
    finalize_blind(
        packs,
        admin,
        4,
        1,
        end=2_500,
        _now=sp.timestamp(2_000),
    )
    packs.buy(
        sp.record(token_id=sp.nat(4), amount=sp.nat(1)),
        _sender=bob,
        _amount=sp.mutez(0),
        _now=sp.timestamp(2_100),
    )
    packs.refund_blind_claims(
        sp.record(
            token_id=sp.nat(4),
            holder=bob.address,
            amount=sp.nat(1),
            expected_claim_id=0,
        ),
        _sender=alice,
        _now=sp.timestamp(2_700),
    )
    packs.cancel_unrevealed_pack(4, _sender=alice, _now=sp.timestamp(2_700))
    scenario.verify(packs.data.packs[4].cancelled)

    scenario.h2("A failed treasury payout rolls child, wrapper, claim, and escrow back")
    create_pack(
        packs,
        admin,
        5,
        mode=1,
        item_count=1,
        reveal_deadline=3_700,
        open_deadline=3_900,
    )
    commit(packs, admin, 5, 600, [escrow_reservation(asset, 0)])
    finalize_blind(
        packs,
        admin,
        5,
        1,
        end=3_500,
        price=100,
        treasury=rejecting_treasury.address,
        _now=sp.timestamp(3_000),
    )
    packs.buy(
        sp.record(token_id=sp.nat(5), amount=sp.nat(1)),
        _sender=alice,
        _amount=sp.mutez(100),
        _now=sp.timestamp(3_100),
    )
    reveal(packs, admin, 5, _now=sp.timestamp(3_200))
    pack5 = sp.record(pack_contract=packs.address, pack_token_id=sp.nat(5))
    alice5 = sp.record(
        pack_contract=packs.address,
        pack_token_id=sp.nat(5),
        owner=alice.address,
    )
    packs.open_pack(
        open_params(5, 600, [escrow_action(asset, 0)], claim_id=0),
        _sender=alice,
        _now=sp.timestamp(3_300),
        _valid=False,
        _exception="REJECT_TEZ",
    )
    scenario.verify(
        packs.data.ledger[sp.record(owner=alice.address, token_id=5)] == 1
    )
    scenario.verify(packs.data.total_supply[5] == 1)
    scenario.verify(packs.data.opened[5] == 0)
    scenario.verify(controller.data.claim_counts[alice5] == 1)
    scenario.verify(controller.data.packs[pack5].escrowed == sp.mutez(100))
    scenario.verify(
        packs.data.asset_allowances[
            sp.record(
                pack_token_id=sp.nat(5),
                fa2=asset.address,
                asset_token_id=sp.nat(0),
            )
        ]
        == 1
    )
    packs.refund_blind_claims(
        sp.record(
            token_id=sp.nat(5),
            holder=alice.address,
            amount=sp.nat(1),
            expected_claim_id=0,
        ),
        _sender=admin,
        _now=sp.timestamp(3_900),
    )
    packs.cancel_pack(5, _sender=admin)
    packs.recover_asset(
        sp.record(token_id=5, fa2=asset.address, asset_token_id=0, amount=1),
        _sender=admin,
    )

    scenario.h2(
        "Permissionless expiry credits a rejecting KT1 holder without blocking cleanup"
    )
    create_pack(
        packs,
        admin,
        6,
        mode=1,
        item_count=1,
        reveal_deadline=4_700,
        open_deadline=4_900,
        _now=sp.timestamp(4_000),
    )
    commit(packs, admin, 6, 700, [escrow_reservation(asset, 0)])
    finalize_blind(
        packs,
        admin,
        6,
        1,
        end=4_500,
        price=125,
        _now=sp.timestamp(4_000),
    )
    packs.buy(
        sp.record(token_id=sp.nat(6), amount=sp.nat(1)),
        _sender=alice,
        _amount=sp.mutez(125),
        _now=sp.timestamp(4_100),
    )
    packs.transfer(
        [
            sp.record(
                from_=alice.address,
                txs=[
                    sp.record(
                        to_=refund_holder.address,
                        token_id=sp.nat(6),
                        amount=sp.nat(1),
                    )
                ],
            )
        ],
        _sender=alice,
        _now=sp.timestamp(4_200),
    )
    packs.refund_blind_claims(
        sp.record(
            token_id=sp.nat(6),
            holder=refund_holder.address,
            amount=sp.nat(1),
            expected_claim_id=sp.nat(0),
        ),
        _sender=dave,
        _now=sp.timestamp(4_700),
    )
    pack6 = sp.record(pack_contract=packs.address, pack_token_id=sp.nat(6))
    scenario.verify(controller.data.packs[pack6].outstanding == 0)
    scenario.verify(controller.data.packs[pack6].escrowed == sp.mutez(0))
    scenario.verify(packs.data.total_supply[6] == 0)
    scenario.verify(packs.data.minted[6] == 0)
    scenario.verify(
        ~packs.data.ledger.contains(
            sp.record(owner=refund_holder.address, token_id=sp.nat(6))
        )
    )
    scenario.verify(
        controller.get_refund_credit(refund_holder.address)
        == sp.mutez(125)
    )

    controller.withdraw_refund(
        sp.record(destination=refund_sink.address, amount=sp.mutez(1)),
        _sender=admin,
        _valid=False,
        _exception="REFUND_CREDIT_UNDERFUNDED",
    )
    refund_holder.withdraw(
        sp.record(
            controller=controller.address,
            destination=refund_sink.address,
            amount=sp.mutez(126),
        ),
        _sender=admin,
        _valid=False,
        _exception="REFUND_CREDIT_UNDERFUNDED",
    )
    refund_holder.withdraw(
        sp.record(
            controller=controller.address,
            destination=refund_holder.address,
            amount=sp.mutez(125),
        ),
        _sender=admin,
        _valid=False,
        _exception="REJECT_TEZ",
    )
    scenario.verify(
        controller.get_refund_credit(refund_holder.address)
        == sp.mutez(125)
    )

    packs.cancel_unrevealed_pack(
        6,
        _sender=bob,
        _now=sp.timestamp(4_700),
    )
    scenario.verify(packs.data.packs[6].cancelled)
    packs.recover_asset(
        sp.record(token_id=6, fa2=asset.address, asset_token_id=0, amount=1),
        _sender=admin,
    )
    refund_holder.withdraw(
        sp.record(
            controller=controller.address,
            destination=refund_sink.address,
            amount=sp.mutez(125),
        ),
        _sender=admin,
    )
    scenario.verify(refund_sink.data.received == sp.mutez(125))
    scenario.verify(
        controller.get_refund_credit(refund_holder.address) == sp.mutez(0)
    )


@sp.add_test()
def ravioli_heterogeneous_le_hybrid_finalization():
    scenario = sp.test_scenario(
        "Ravioli heterogeneous LE hybrid finalization",
        [
            standard,
            gnocchi,
            rotini,
            router,
            blind_controller,
            gnocchi_adapter,
            rotini_adapter,
        ],
    )
    admin = sp.test_account("admin")
    alice = sp.test_account("alice")
    metadata = sp.big_map({"": b("ipfs://contract-metadata")})
    asset = standard.PastaStandardCollectionFA2(admin.address, metadata)
    oe = gnocchi.PastaOpenEditionFA2(admin.address, metadata)
    generator = rotini.PastaGenerativeCollectionFA2(admin.address, metadata)
    allocation_adapter = gnocchi_adapter.PastaGnocchiPackAdapter(
        admin.address, metadata
    )
    generation_adapter = rotini_adapter.PastaRotiniPackAdapter(
        admin.address, metadata
    )
    controller, packs = deploy_pack_router(scenario, admin, metadata)
    scenario += asset
    scenario += oe
    scenario += generator
    scenario += allocation_adapter
    scenario += generation_adapter

    scenario.h2("Prepare one existing asset, one locked LE, and one free generator")
    asset.create_token({"": b("ipfs://existing-hybrid-child")}, _sender=admin)
    asset.mint(sp.record(to_=admin.address, token_id=0, amount=1), _sender=admin)
    asset.update_operators(
        [
            sp.variant(
                "add_operator",
                sp.record(owner=admin.address, operator=packs.address, token_id=0),
            )
        ],
        _sender=admin,
    )

    child_expiry = 1_000
    wrapper_sale_end = 900
    oe.create_open_edition(
        sp.record(
            token_info={"": b("ipfs://limited-hybrid-child")},
            sale=sp.record(
                active=True,
                start=sp.cast(None, sp.option[sp.timestamp]),
                end=sp.Some(sp.timestamp(child_expiry)),
                base_price=sp.mutez(0),
                increment=sp.mutez(0),
                step_size=sp.nat(1),
                min_price=sp.cast(None, sp.option[sp.mutez]),
                max_price=sp.cast(None, sp.option[sp.mutez]),
                max_supply=sp.Some(sp.nat(1)),
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
            name=b("Ravioli LE Hybrid Generator"),
            symbol=b("RLHG"),
            generator_uri=b("ipfs://offline-generator"),
            display_uri=b("ipfs://project-preview"),
            output_mode=b("png"),
            price=sp.mutez(0),
            treasury=admin.address,
            max_supply=sp.Some(sp.nat(1)),
            max_per_wallet=sp.Some(sp.nat(1)),
            reservation_ttl=sp.nat(100),
        ),
        _sender=admin,
    )
    generator.add_pack_minter(generation_adapter.address, _sender=admin)
    generation_adapter.create_resource(
        sp.record(target=generator.address, project_id=0, active=True),
        _sender=admin,
    )
    generation_adapter.add_router(packs.address, _sender=admin)

    scenario.h2(
        "A mode-4 LE recipe reserves all three mechanisms before atomic finalization"
    )
    create_pack(
        packs,
        admin,
        0,
        mode=4,
        item_count=3,
        child_expiry=child_expiry,
        wrapper_sale_end=wrapper_sale_end,
    )
    commit(
        packs,
        admin,
        0,
        400,
        [
            escrow_reservation(asset, 0),
            allocated_reservation(allocation_adapter),
            generative_reservation(generation_adapter),
        ],
    )
    scenario.verify(
        asset.data.ledger[sp.record(owner=packs.address, token_id=0)] == 1
    )
    scenario.verify(oe.data.total_reserved[0] == 1)
    scenario.verify(generator.data.projects[0].reserved == 1)
    packs.finalize_pack(
        0,
        _sender=admin,
        _valid=False,
        _exception="BLIND_USE_ATOMIC_ISSUE",
    )
    finalize_le(
        packs,
        admin,
        0,
        1,
        wrapper_sale_end,
        _now=sp.timestamp(100),
    )
    scenario.verify(packs.data.packs[0].finalized)
    scenario.verify(packs.data.total_supply[0] == 1)
    scenario.verify(packs.data.minted[0] == 1)
    scenario.verify(packs.data.sales[0].remaining == 1)
    scenario.verify(
        packs.data.sales[0].end == sp.Some(sp.timestamp(wrapper_sale_end))
    )

    scenario.h2("The finalized LE wrapper still opens into all three child products")
    packs.buy(
        sp.record(token_id=sp.nat(0), amount=sp.nat(1)),
        _sender=alice,
        _amount=sp.mutez(0),
        _now=sp.timestamp(200),
    )
    reveal(packs, admin, 0, _now=sp.timestamp(300))
    packs.open_pack(
        open_params(
            0,
            400,
            [
                escrow_action(asset, 0),
                allocated_action(allocation_adapter),
                generative_action(generation_adapter, 400, generated_at_open=True),
            ],
            claim_id=0,
        ),
        _sender=alice,
        _now=sp.timestamp(300),
    )
    scenario.verify(asset.data.ledger[sp.record(owner=alice.address, token_id=0)] == 1)
    scenario.verify(oe.data.ledger[sp.record(owner=alice.address, token_id=0)] == 1)
    scenario.verify(
        generator.data.ledger[sp.record(owner=alice.address, token_id=0)] == 1
    )
    scenario.verify(packs.data.total_supply[0] == 0)


@sp.add_test()
def ravioli_mode_and_wrapper_balance_invariants():
    """Mode tags must agree with recipes and opening must burn one wrapper only.

    The second assertion protects the FA2 conservation invariant when the
    router itself already owns wrapper inventory (for example, a creator
    escrows sale inventory at the router before a collector opens a pack).
    """
    scenario = sp.test_scenario(
        "Ravioli mode and wrapper balance invariants",
        [standard, router, blind_controller],
    )
    admin = sp.test_account("admin")
    alice = sp.test_account("alice")
    bob = sp.test_account("bob")
    metadata = sp.big_map({"": b("ipfs://contract-metadata")})
    asset = standard.PastaStandardCollectionFA2(admin.address, metadata)
    controller, packs = deploy_pack_router(scenario, admin, metadata)
    scenario += asset

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
    packs.commit_recipe(
        sp.record(
            token_id=sp.nat(1),
            nonce_commitment=sp.blake2b(nonce(202)),
            reservations=[escrow_reservation(asset, 0)],
        ),
        _sender=admin,
        _valid=False,
        _exception="DETERMINISTIC_RECIPE_MISMATCH",
    )
    commit(packs, admin, 1, 201, [escrow_reservation(asset, 0)])
    commit(packs, admin, 1, 201, [escrow_reservation(asset, 0)])
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
        open_params(1, 201, [escrow_action(asset, 0)]),
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


@sp.add_test()
def ravioli_child_expiry_sale_deconfliction():
    scenario = sp.test_scenario(
        "Ravioli child-expiry sale deconfliction",
        [gnocchi, router, blind_controller, gnocchi_adapter],
    )
    admin = sp.test_account("admin")
    alice = sp.test_account("alice")
    metadata = sp.big_map({"": b("ipfs://contract-metadata")})
    oe = gnocchi.PastaOpenEditionFA2(admin.address, metadata)
    adapter = gnocchi_adapter.PastaGnocchiPackAdapter(admin.address, metadata)
    controller, packs = deploy_pack_router(scenario, admin, metadata)
    scenario += oe
    scenario += adapter
    oe.add_minter(adapter.address, _sender=admin)
    adapter.add_router(packs.address, _sender=admin)

    def child_sale(active=True, end=1_000, max_supply=3):
        return sp.record(
            active=active,
            start=sp.cast(None, sp.option[sp.timestamp]),
            end=(
                sp.cast(None, sp.option[sp.timestamp])
                if end is None
                else sp.Some(sp.timestamp(end))
            ),
            base_price=sp.mutez(0),
            increment=sp.mutez(0),
            step_size=sp.nat(1),
            min_price=sp.cast(None, sp.option[sp.mutez]),
            max_price=sp.cast(None, sp.option[sp.mutez]),
            max_supply=(
                sp.cast(None, sp.option[sp.nat])
                if max_supply is None
                else sp.Some(sp.nat(max_supply))
            ),
            treasury=admin.address,
        )

    def create_child(resource_id, sale, lock_policy=True):
        oe.create_open_edition(
            sp.record(
                token_info={"": b(f"ipfs://child-{resource_id}")},
                sale=sale,
                creator_reserve=sp.nat(0),
                lock_policy=lock_policy,
            ),
            _sender=admin,
        )
        adapter.create_allocation(
            sp.record(
                target=oe.address,
                token_id=sp.nat(resource_id),
                amount_per_open=sp.nat(1),
                active=True,
            ),
            _sender=admin,
        )

    child_expiry = 1_000
    wrapper_end = 900
    create_child(0, child_sale())
    create_child(1, child_sale(), lock_policy=False)
    create_child(2, child_sale(active=False))
    create_child(3, child_sale(end=None))
    create_child(4, child_sale(max_supply=None))
    create_child(5, child_sale(end=None, max_supply=None))
    create_child(6, child_sale(end=child_expiry + 200))
    create_child(7, child_sale())

    scenario.h2("The immutable config requires both LE bounds and a live wrapper end")
    create_pack(
        packs,
        admin,
        0,
        mode=2,
        item_count=1,
        child_expiry=child_expiry,
        _valid=False,
        _exception="LE_WRAPPER_REQUIRES_END",
    )
    create_pack(
        packs,
        admin,
        0,
        mode=2,
        item_count=1,
        wrapper_sale_end=wrapper_end,
        _valid=False,
        _exception="LE_CHILD_EXPIRY_REQUIRED",
    )
    create_pack(
        packs,
        admin,
        0,
        mode=2,
        item_count=1,
        child_expiry=child_expiry,
        wrapper_sale_end=child_expiry + 1,
        _valid=False,
        _exception="PACK_END_AFTER_CHILD",
    )
    create_pack(
        packs,
        admin,
        0,
        mode=2,
        item_count=1,
        child_expiry=child_expiry,
        wrapper_sale_end=wrapper_end,
        _now=sp.timestamp(wrapper_end),
        _valid=False,
        _exception="LE_SALE_ENDED",
    )

    scenario.h2("The actual Gnocchi policy rejects omitted and dishonest declarations")
    create_pack(packs, admin, 0, mode=2, item_count=1)
    packs.commit_recipe(
        sp.record(
            token_id=sp.nat(0),
            nonce_commitment=sp.blake2b(nonce(300)),
            reservations=[allocated_reservation(adapter, resource_id=0)],
        ),
        _sender=admin,
        _valid=False,
        _exception="LE_CHILD_EXPIRY_REQUIRED",
    )
    create_pack(
        packs,
        admin,
        1,
        mode=2,
        item_count=1,
        child_expiry=child_expiry + 200,
        wrapper_sale_end=wrapper_end,
    )
    packs.commit_recipe(
        sp.record(
            token_id=sp.nat(1),
            nonce_commitment=sp.blake2b(nonce(301)),
            reservations=[allocated_reservation(adapter, resource_id=0)],
        ),
        _sender=admin,
        _valid=False,
        _exception="DECLARED_CHILD_EXPIRY_AFTER_CHILD",
    )

    scenario.h2("One allocated-only recipe may share the earliest real LE child expiry")
    create_pack(
        packs,
        admin,
        2,
        mode=2,
        item_count=2,
        child_expiry=child_expiry,
        wrapper_sale_end=wrapper_end,
    )
    commit(
        packs,
        admin,
        2,
        302,
        [
            allocated_reservation(adapter, resource_id=0),
            allocated_reservation(adapter, resource_id=6),
        ],
    )
    finalize_le(packs, admin, 2, 1, wrapper_end, _now=sp.timestamp(100))
    packs.buy(
        sp.record(token_id=sp.nat(2), amount=sp.nat(1)),
        _sender=alice,
        _amount=sp.mutez(0),
        _now=sp.timestamp(200),
    )

    scenario.h2("Every reservable allocation must still be active and policy-locked")
    for pack_token_id, resource_id, expected_error in [
        (3, 1, "POLICY_NOT_LOCKED"),
        (4, 2, "SALE_INACTIVE"),
    ]:
        create_pack(
            packs,
            admin,
            pack_token_id,
            mode=2,
            item_count=1,
            child_expiry=child_expiry,
            wrapper_sale_end=wrapper_end,
        )
        packs.commit_recipe(
            sp.record(
                token_id=sp.nat(pack_token_id),
                nonce_commitment=sp.blake2b(nonce(300 + pack_token_id)),
                reservations=[allocated_reservation(adapter, resource_id=resource_id)],
            ),
            _sender=admin,
            _valid=False,
            _exception=expected_error,
        )

    scenario.h2("Capped untimed, timed OE, and forever OE allocations need no LE wrapper")
    for pack_token_id, resource_id in [(5, 3), (6, 4), (7, 5)]:
        create_pack(packs, admin, pack_token_id, mode=2, item_count=1)
        commit(
            packs,
            admin,
            pack_token_id,
            300 + pack_token_id,
            [allocated_reservation(adapter, resource_id=resource_id)],
        )
        finalize_blind(packs, admin, pack_token_id, 1)
        packs.buy(
            sp.record(token_id=sp.nat(pack_token_id), amount=sp.nat(1)),
            _sender=alice,
            _amount=sp.mutez(0),
        )
        reveal(packs, admin, pack_token_id)
        packs.open_pack(
            open_params(
                pack_token_id,
                300 + pack_token_id,
                [allocated_action(adapter, resource_id=resource_id)],
                claim_id=0,
            ),
            _sender=alice,
        )
        scenario.verify(
            oe.data.ledger[sp.record(owner=alice.address, token_id=resource_id)] == 1
        )

    scenario.h2("Inherited wrapper bounds must still be a complete pair")
    oe.reserve_mint_capacity(
        sp.record(
            token_id=sp.nat(3),
            amount=sp.nat(1),
            declared_child_expiry=sp.Some(sp.timestamp(child_expiry)),
            wrapper_sale_end=sp.cast(None, sp.option[sp.timestamp]),
        ),
        _sender=adapter.address,
        _valid=False,
        _exception="LE_WRAPPER_REQUIRES_END",
    )
    oe.reserve_mint_capacity(
        sp.record(
            token_id=sp.nat(3),
            amount=sp.nat(1),
            declared_child_expiry=sp.cast(None, sp.option[sp.timestamp]),
            wrapper_sale_end=sp.Some(sp.timestamp(wrapper_end)),
        ),
        _sender=adapter.address,
        _valid=False,
        _exception="LE_CHILD_EXPIRY_REQUIRED",
    )
    adapter.reserve(
        sp.record(
            pack_contract=packs.address,
            pack_token_id=sp.nat(999),
            kind=sp.nat(1),
            resource_id=sp.nat(0),
            capacity=sp.nat(1),
            declared_child_expiry=sp.Some(sp.timestamp(child_expiry)),
            wrapper_sale_end=sp.Some(sp.timestamp(child_expiry)),
        ),
        _sender=packs.address,
        _now=sp.timestamp(100),
        _valid=False,
        _exception="PACK_END_AFTER_CHILD",
    )

    scenario.h2("A valid LE cannot finalize or issue without its matching direct sale")
    create_pack(
        packs,
        admin,
        8,
        mode=2,
        item_count=1,
        child_expiry=child_expiry,
        wrapper_sale_end=wrapper_end,
    )
    commit(packs, admin, 8, 308, [allocated_reservation(adapter, resource_id=0)])
    packs.finalize_pack(
        8,
        _sender=admin,
        _valid=False,
        _exception="BLIND_USE_ATOMIC_ISSUE",
    )
    packs.finalize_blind_pack(
        sp.record(
            token_id=sp.nat(8),
            sale=wrapper_sale(admin, 1, end=None),
        ),
        _sender=admin,
        _now=sp.timestamp(100),
        _valid=False,
        _exception="BLIND_SALE_REQUIRES_END",
    )
    packs.finalize_blind_pack(
        sp.record(
            token_id=sp.nat(8),
            sale=wrapper_sale(admin, 1, end=wrapper_end - 1),
        ),
        _sender=admin,
        _now=sp.timestamp(100),
        _valid=False,
        _exception="LE_SALE_END_MISMATCH",
    )
    packs.finalize_blind_pack(
        sp.record(
            token_id=sp.nat(8),
            sale=wrapper_sale(admin, 1, end=wrapper_end, active=False),
        ),
        _sender=admin,
        _now=sp.timestamp(100),
        _valid=False,
        _exception="BLIND_SALE_INACTIVE",
    )
    packs.finalize_blind_pack(
        sp.record(
            token_id=sp.nat(8),
            sale=wrapper_sale(admin, 0, end=wrapper_end),
        ),
        _sender=admin,
        _now=sp.timestamp(100),
        _valid=False,
        _exception="BLIND_SALE_NOT_FULL_SUPPLY",
    )
    finalize_le(packs, admin, 8, 1, wrapper_end, _now=sp.timestamp(100))
    scenario.verify(packs.data.packs[8].finalized)
    scenario.verify(packs.data.total_supply[8] == 1)
    scenario.verify(packs.data.minted[8] == 1)
    scenario.verify(packs.data.sales[8].end == sp.Some(sp.timestamp(wrapper_end)))
    packs.mint(
        sp.record(to_=admin.address, token_id=8, amount=1),
        _sender=admin,
        _now=sp.timestamp(100),
        _valid=False,
        _exception="BLIND_USE_ATOMIC_ISSUE",
    )

    scenario.h2("An allocated pack inherits LE bounds across LE, timed-OE, and forever children")
    create_pack(
        packs,
        admin,
        9,
        mode=2,
        item_count=3,
        child_expiry=child_expiry,
        wrapper_sale_end=wrapper_end,
    )
    commit(
        packs,
        admin,
        9,
        309,
        [
            allocated_reservation(adapter, resource_id=0),
            allocated_reservation(adapter, resource_id=4),
            allocated_reservation(adapter, resource_id=5),
        ],
    )
    finalize_le(packs, admin, 9, 1, wrapper_end, _now=sp.timestamp(100))

    scenario.h2(
        "Blind LE ordering requires sale end < reveal deadline <= child expiry"
    )
    create_pack(
        packs,
        admin,
        10,
        mode=2,
        item_count=1,
        child_expiry=child_expiry,
        wrapper_sale_end=child_expiry,
        _valid=False,
        _exception="PACK_END_AFTER_CHILD",
    )
    create_pack(
        packs,
        admin,
        10,
        mode=2,
        item_count=1,
        child_expiry=child_expiry,
        wrapper_sale_end=wrapper_end,
        reveal_deadline=wrapper_end,
        _valid=False,
        _exception="REVEAL_NOT_AFTER_SALE",
    )
    create_pack(
        packs,
        admin,
        10,
        mode=2,
        item_count=1,
        child_expiry=child_expiry,
        wrapper_sale_end=wrapper_end,
        reveal_deadline=child_expiry + 1,
        _valid=False,
        _exception="REVEAL_AFTER_CHILD",
    )
    create_pack(
        packs,
        admin,
        10,
        mode=2,
        item_count=1,
        child_expiry=child_expiry,
        wrapper_sale_end=child_expiry - 1,
        reveal_deadline=child_expiry,
    )
    commit(packs, admin, 10, 310, [allocated_reservation(adapter, resource_id=7)])
    finalize_le(packs, admin, 10, 1, child_expiry - 1, _now=sp.timestamp(100))
    scenario.verify(packs.data.packs[10].finalized)
    scenario.verify(packs.data.total_supply[10] == 1)
    scenario.verify(packs.data.minted[10] == 1)
    scenario.verify(packs.data.sales[10].remaining == 1)
    scenario.verify(
        packs.data.sales[10].end == sp.Some(sp.timestamp(child_expiry - 1))
    )

    scenario.h2("Reserved child delivery remains open after every public deadline")
    packs.buy(
        sp.record(token_id=sp.nat(8), amount=sp.nat(1)),
        _sender=alice,
        _amount=sp.mutez(0),
        _now=sp.timestamp(200),
    )
    packs.buy(
        sp.record(token_id=sp.nat(9), amount=sp.nat(1)),
        _sender=alice,
        _amount=sp.mutez(0),
        _now=sp.timestamp(200),
    )
    reveal(packs, admin, 8, _now=sp.timestamp(300))
    reveal(packs, admin, 9, _now=sp.timestamp(300))
    reveal(packs, admin, 2, _now=sp.timestamp(300))
    oe.set_sale_active(sp.record(token_id=0, active=False), _sender=admin)
    packs.open_pack(
        open_params(
            8,
            308,
            [allocated_action(adapter, resource_id=0)],
            claim_id=0,
        ),
        _sender=alice,
        _now=sp.timestamp(child_expiry + 1),
    )
    packs.open_pack(
        open_params(
            9,
            309,
            [
                allocated_action(adapter, resource_id=0),
                allocated_action(adapter, resource_id=4),
                allocated_action(adapter, resource_id=5),
            ],
            claim_id=0,
        ),
        _sender=alice,
        _now=sp.timestamp(child_expiry + 1),
    )
    packs.open_pack(
        open_params(
            2,
            302,
            [
                allocated_action(adapter, resource_id=0),
                allocated_action(adapter, resource_id=6),
            ],
            claim_id=0,
        ),
        _sender=alice,
        _now=sp.timestamp(child_expiry + 201),
    )
    scenario.verify(oe.data.ledger[sp.record(owner=alice.address, token_id=0)] == 3)
    scenario.verify(oe.data.ledger[sp.record(owner=alice.address, token_id=4)] == 2)
    scenario.verify(oe.data.ledger[sp.record(owner=alice.address, token_id=5)] == 2)
    scenario.verify(oe.data.ledger[sp.record(owner=alice.address, token_id=6)] == 1)
    scenario.verify(oe.data.total_reserved[0] == 0)
    scenario.verify(oe.data.total_reserved[6] == 0)
    scenario.verify(packs.data.total_supply[2] == 0)
    scenario.verify(packs.data.total_supply[8] == 0)
    scenario.verify(packs.data.total_supply[9] == 0)


@sp.add_test()
def ravioli_reserved_capacity_survives_role_revocation():
    scenario = sp.test_scenario(
        "Ravioli reserved capacity survives role revocation",
        [gnocchi, rotini, gnocchi_adapter, rotini_adapter],
    )
    admin = sp.test_account("admin")
    router_account = sp.test_account("router")
    stranger = sp.test_account("stranger")
    alice = sp.test_account("alice")
    metadata = sp.big_map({"": b("ipfs://contract-metadata")})

    oe = gnocchi.PastaOpenEditionFA2(admin.address, metadata)
    allocation_adapter = gnocchi_adapter.PastaGnocchiPackAdapter(
        admin.address, metadata
    )
    generator = rotini.PastaGenerativeCollectionFA2(admin.address, metadata)
    generation_adapter = rotini_adapter.PastaRotiniPackAdapter(
        admin.address, metadata
    )
    scenario += oe
    scenario += allocation_adapter
    scenario += generator
    scenario += generation_adapter

    scenario.h2("Reserve Gnocchi and Rotini capacity while every role is active")
    oe.create_open_edition(
        sp.record(
            token_info={"": b("ipfs://revocation-gnocchi")},
            sale=sp.record(
                active=True,
                start=sp.cast(None, sp.option[sp.timestamp]),
                end=sp.cast(None, sp.option[sp.timestamp]),
                base_price=sp.mutez(0),
                increment=sp.mutez(0),
                step_size=sp.nat(1),
                min_price=sp.cast(None, sp.option[sp.mutez]),
                max_price=sp.cast(None, sp.option[sp.mutez]),
                max_supply=sp.cast(None, sp.option[sp.nat]),
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
    allocation_adapter.add_router(router_account.address, _sender=admin)
    allocation_adapter.reserve(
        sp.record(
            pack_contract=router_account.address,
            pack_token_id=0,
            kind=1,
            resource_id=0,
            capacity=2,
            declared_child_expiry=sp.cast(None, sp.option[sp.timestamp]),
            wrapper_sale_end=sp.cast(None, sp.option[sp.timestamp]),
        ),
        _sender=router_account,
    )
    scenario.verify(oe.data.total_reserved[0] == 2)

    generator.create_project(
        sp.record(
            active=True,
            name=b("Revocation Rotini"),
            symbol=b("RVR"),
            generator_uri=b("ipfs://offline-generator"),
            display_uri=b("ipfs://project-preview"),
            output_mode=b("png"),
            price=sp.mutez(0),
            treasury=admin.address,
            max_supply=sp.Some(sp.nat(4)),
            max_per_wallet=sp.cast(None, sp.option[sp.nat]),
            reservation_ttl=sp.nat(100),
        ),
        _sender=admin,
    )
    generator.add_pack_minter(generation_adapter.address, _sender=admin)
    generation_adapter.create_resource(
        sp.record(target=generator.address, project_id=0, active=True),
        _sender=admin,
    )
    generation_adapter.add_router(router_account.address, _sender=admin)
    generation_adapter.reserve(
        sp.record(
            pack_contract=router_account.address,
            pack_token_id=0,
            kind=2,
            resource_id=0,
            capacity=2,
        ),
        _sender=router_account,
    )
    scenario.verify(generator.data.projects[0].reserved == 2)

    scenario.h2("Revocation blocks new reservations without invalidating existing keys")
    allocation_adapter.remove_router(router_account.address, _sender=admin)
    oe.remove_minter(allocation_adapter.address, _sender=admin)
    generation_adapter.remove_router(router_account.address, _sender=admin)
    generator.remove_pack_minter(generation_adapter.address, _sender=admin)

    allocation_adapter.reserve(
        sp.record(
            pack_contract=router_account.address,
            pack_token_id=1,
            kind=1,
            resource_id=0,
            capacity=1,
            declared_child_expiry=sp.cast(None, sp.option[sp.timestamp]),
            wrapper_sale_end=sp.cast(None, sp.option[sp.timestamp]),
        ),
        _sender=router_account,
        _valid=False,
        _exception="NOT_ROUTER",
    )
    oe.reserve_mint_capacity(
        sp.record(
            token_id=sp.nat(0),
            amount=sp.nat(1),
            declared_child_expiry=sp.cast(None, sp.option[sp.timestamp]),
            wrapper_sale_end=sp.cast(None, sp.option[sp.timestamp]),
        ),
        _sender=allocation_adapter.address,
        _valid=False,
        _exception="NOT_MINTER",
    )
    generation_adapter.reserve(
        sp.record(
            pack_contract=router_account.address,
            pack_token_id=1,
            kind=2,
            resource_id=0,
            capacity=1,
        ),
        _sender=router_account,
        _valid=False,
        _exception="NOT_ROUTER",
    )
    generator.reserve_pack_capacity(
        sp.record(project_id=sp.nat(0), amount=sp.nat(1)),
        _sender=generation_adapter.address,
        _valid=False,
        _exception="NOT_PACK_MINTER",
    )

    scenario.h2("The exact revoked router can still fulfill one and release one")
    allocation_adapter.fulfill(
        sp.record(
            recipient=alice.address,
            pack_contract=router_account.address,
            pack_token_id=0,
            open_serial=0,
            action_index=0,
            resource_id=0,
            payload=sp.bytes("0x"),
        ),
        _sender=router_account,
    )
    allocation_adapter.release(
        sp.record(
            pack_contract=router_account.address,
            pack_token_id=0,
            kind=1,
            resource_id=0,
            capacity=1,
        ),
        _sender=router_account,
    )
    scenario.verify(oe.data.ledger[sp.record(owner=alice.address, token_id=0)] == 1)
    scenario.verify(oe.data.total_reserved[0] == 0)

    generation_adapter.fulfill(
        sp.record(
            recipient=alice.address,
            pack_contract=router_account.address,
            pack_token_id=0,
            open_serial=0,
            action_index=0,
            resource_id=0,
            payload=artifact_payload(900),
        ),
        _sender=router_account,
    )
    generation_adapter.release(
        sp.record(
            pack_contract=router_account.address,
            pack_token_id=0,
            kind=2,
            resource_id=0,
            capacity=1,
        ),
        _sender=router_account,
    )
    scenario.verify(generator.data.ledger[sp.record(owner=alice.address, token_id=0)] == 1)
    scenario.verify(generator.data.projects[0].reserved == 0)

    scenario.h2("Wrong senders and exhausted reservation keys remain rejected")
    allocation_adapter.fulfill(
        sp.record(
            recipient=alice.address,
            pack_contract=router_account.address,
            pack_token_id=0,
            open_serial=1,
            action_index=0,
            resource_id=0,
            payload=sp.bytes("0x"),
        ),
        _sender=stranger,
        _valid=False,
        _exception="ROUTER_MISMATCH",
    )
    allocation_adapter.fulfill(
        sp.record(
            recipient=alice.address,
            pack_contract=router_account.address,
            pack_token_id=0,
            open_serial=1,
            action_index=0,
            resource_id=0,
            payload=sp.bytes("0x"),
        ),
        _sender=router_account,
        _valid=False,
        _exception="RESERVE_UNDERFUNDED",
    )
    allocation_adapter.release(
        sp.record(
            pack_contract=router_account.address,
            pack_token_id=0,
            kind=1,
            resource_id=0,
            capacity=1,
        ),
        _sender=stranger,
        _valid=False,
        _exception="ROUTER_MISMATCH",
    )
    allocation_adapter.release(
        sp.record(
            pack_contract=router_account.address,
            pack_token_id=0,
            kind=1,
            resource_id=0,
            capacity=1,
        ),
        _sender=router_account,
        _valid=False,
        _exception="RESERVE_UNDERFUNDED",
    )
    oe.mint_reserved(
        sp.record(to_=alice.address, token_id=sp.nat(0), amount=sp.nat(1)),
        _sender=stranger,
        _valid=False,
        _exception="RESERVE_UNDERFUNDED",
    )
    oe.release_mint_capacity(
        sp.record(token_id=sp.nat(0), amount=sp.nat(1)),
        _sender=stranger,
        _valid=False,
        _exception="RESERVE_UNDERFUNDED",
    )

    generation_adapter.fulfill(
        sp.record(
            recipient=alice.address,
            pack_contract=router_account.address,
            pack_token_id=0,
            open_serial=1,
            action_index=0,
            resource_id=0,
            payload=artifact_payload(901),
        ),
        _sender=stranger,
        _valid=False,
        _exception="ROUTER_MISMATCH",
    )
    generation_adapter.fulfill(
        sp.record(
            recipient=alice.address,
            pack_contract=router_account.address,
            pack_token_id=0,
            open_serial=1,
            action_index=0,
            resource_id=0,
            payload=artifact_payload(901),
        ),
        _sender=router_account,
        _valid=False,
        _exception="RESERVE_UNDERFUNDED",
    )
    generation_adapter.release(
        sp.record(
            pack_contract=router_account.address,
            pack_token_id=0,
            kind=2,
            resource_id=0,
            capacity=1,
        ),
        _sender=stranger,
        _valid=False,
        _exception="ROUTER_MISMATCH",
    )
    generation_adapter.release(
        sp.record(
            pack_contract=router_account.address,
            pack_token_id=0,
            kind=2,
            resource_id=0,
            capacity=1,
        ),
        _sender=router_account,
        _valid=False,
        _exception="RESERVE_UNDERFUNDED",
    )
    generator.release_pack_capacity(
        sp.record(project_id=sp.nat(0), amount=sp.nat(1)),
        _sender=stranger,
        _valid=False,
        _exception="RESERVE_UNDERFUNDED",
    )
