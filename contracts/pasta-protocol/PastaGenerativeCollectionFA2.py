# PastaGenerativeCollectionFA2
#
# Pasta Protocol — collector-finalized generative FA2 used by Rotini. A creator publishes a
# deterministic generator before collection. A collector then reserves an on-chain token id and seed,
# renders a normal self-contained artifact locally, pins that artifact plus TZIP-21 metadata, and
# finalizes the reservation. No FA2 token, metadata entry, supply, or ownership exists before finalize.
#
# The contract deliberately treats the reservation seed as a unique deterministic input, not unbiased
# randomness. It binds payment and supply capacity while the browser creates a PNG, GIF, or dependency-
# free interactive ZIP. Abandoned reservations can be refunded after their creator-chosen TTL.
# Ravioli pack adapters may reserve zero-price project capacity before wrapper sale and later create a
# normal Rotini token atomically during pack opening from a deterministic pack serial seed. For pack
# mints, that immutable generator + seed pair is the canonical generative identity. The submitted
# PNG/GIF/offline-ZIP URI and hash are a self-rendered reproducible cache/holder attestation; the
# contract does not claim to verify rendered pixels against the generator on chain.

import smartpy as sp


@sp.module
def pasta_generative_collection_main():
    LedgerKeyType: type = sp.record(owner=sp.address, token_id=sp.nat)
    OperatorKeyType: type = sp.record(
        owner=sp.address, operator=sp.address, token_id=sp.nat
    ).layout(("owner", ("operator", "token_id")))
    BalanceOfRequestType: type = sp.record(owner=sp.address, token_id=sp.nat).layout(
        ("owner", "token_id")
    )
    BalanceOfResponseType: type = sp.record(
        request=BalanceOfRequestType, balance=sp.nat
    ).layout(("request", "balance"))
    BalanceOfParamType: type = sp.record(
        requests=sp.list[BalanceOfRequestType], callback=sp.contract[sp.list[BalanceOfResponseType]]
    ).layout(("requests", "callback"))
    OperatorParamType: type = sp.variant(add_operator=OperatorKeyType, remove_operator=OperatorKeyType)
    TransferTxType: type = sp.record(to_=sp.address, token_id=sp.nat, amount=sp.nat).layout(
        ("to_", ("token_id", "amount"))
    )
    TransferBatchItemType: type = sp.record(
        from_=sp.address, txs=sp.list[TransferTxType]
    ).layout(("from_", "txs"))
    TokenMetadataType: type = sp.record(token_id=sp.nat, token_info=sp.map[sp.string, sp.bytes])
    ProjectType: type = sp.record(
        active=sp.bool,
        name=sp.bytes,
        symbol=sp.bytes,
        generator_uri=sp.bytes,
        display_uri=sp.bytes,
        output_mode=sp.bytes,
        price=sp.mutez,
        treasury=sp.address,
        max_supply=sp.option[sp.nat],
        max_per_wallet=sp.option[sp.nat],
        reservation_ttl=sp.nat,
        minted=sp.nat,
        reserved=sp.nat,
    )
    CreateProjectType: type = sp.record(
        active=sp.bool,
        name=sp.bytes,
        symbol=sp.bytes,
        generator_uri=sp.bytes,
        display_uri=sp.bytes,
        output_mode=sp.bytes,
        price=sp.mutez,
        treasury=sp.address,
        max_supply=sp.option[sp.nat],
        max_per_wallet=sp.option[sp.nat],
        reservation_ttl=sp.nat,
    )
    ReservationType: type = sp.record(
        owner=sp.address,
        project_id=sp.nat,
        token_id=sp.nat,
        iteration=sp.nat,
        seed=sp.bytes,
        price=sp.mutez,
        expires_at=sp.timestamp,
    )
    ArtifactType: type = sp.record(
        artifact_uri=sp.bytes,
        display_uri=sp.bytes,
        thumbnail_uri=sp.bytes,
        mime_type=sp.bytes,
        artifact_hash=sp.bytes,
    )
    FinalizeIterationType: type = sp.record(
        reservation_id=sp.nat,
        metadata_uri=sp.bytes,
        artifact_uri=sp.bytes,
        display_uri=sp.bytes,
        thumbnail_uri=sp.bytes,
        mime_type=sp.bytes,
        artifact_hash=sp.bytes,
    )
    SetProjectActiveType: type = sp.record(project_id=sp.nat, active=sp.bool)
    PackCapacityType: type = sp.record(project_id=sp.nat, amount=sp.nat)
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

    PNG_MODE = sp.bytes("0x706e67")
    GIF_MODE = sp.bytes("0x676966")
    ZIP_MODE = sp.bytes("0x7a6970")
    PNG_MIME = sp.bytes("0x696d6167652f706e67")
    GIF_MIME = sp.bytes("0x696d6167652f676966")
    ZIP_MIME = sp.bytes("0x6170706c69636174696f6e2f7a6970")

    class PastaGenerativeCollectionFA2(sp.Contract):
        def __init__(self, administrator, metadata):
            self.data.administrator = sp.cast(administrator, sp.address)
            self.data.pending_administrator = sp.cast(None, sp.option[sp.address])
            self.data.metadata = sp.cast(metadata, sp.big_map[sp.string, sp.bytes])
            self.data.ledger = sp.cast(sp.big_map(), sp.big_map[LedgerKeyType, sp.nat])
            self.data.operators = sp.cast(sp.big_map(), sp.big_map[OperatorKeyType, sp.unit])
            self.data.token_metadata = sp.cast(sp.big_map(), sp.big_map[sp.nat, TokenMetadataType])
            self.data.total_supply = sp.cast(sp.big_map(), sp.big_map[sp.nat, sp.nat])
            self.data.projects = sp.cast(sp.big_map(), sp.big_map[sp.nat, ProjectType])
            self.data.reservations = sp.cast(sp.big_map(), sp.big_map[sp.nat, ReservationType])
            self.data.latest_reservation = sp.cast(sp.big_map(), sp.big_map[sp.address, sp.nat])
            self.data.token_project = sp.cast(sp.big_map(), sp.big_map[sp.nat, sp.nat])
            self.data.token_seed = sp.cast(sp.big_map(), sp.big_map[sp.nat, sp.bytes])
            self.data.token_artifact = sp.cast(sp.big_map(), sp.big_map[sp.nat, ArtifactType])
            self.data.minted_by = sp.cast(sp.big_map(), sp.big_map[LedgerKeyType, sp.nat])
            self.data.reserved_by = sp.cast(sp.big_map(), sp.big_map[LedgerKeyType, sp.nat])
            self.data.pack_minters = sp.cast(sp.big_map(), sp.big_map[sp.address, sp.unit])
            self.data.pack_reserved = sp.cast(sp.big_map(), sp.big_map[LedgerKeyType, sp.nat])
            self.data.next_project_id = sp.nat(0)
            self.data.next_reservation_id = sp.nat(0)
            self.data.next_token_id = sp.nat(0)

        @sp.private(with_storage="read-only")
        def _only_admin(self):
            assert sp.sender == self.data.administrator, "NOT_ADMIN"

        @sp.entrypoint
        def balance_of(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, BalanceOfParamType)
            responses = []
            for req in params.requests:
                responses.push(
                    sp.record(
                        request=req,
                        balance=self.data.ledger.get(
                            sp.record(owner=req.owner, token_id=req.token_id), default=sp.nat(0)
                        ),
                    )
                )
            sp.transfer(reversed(responses), sp.mutez(0), params.callback)

        @sp.entrypoint
        def update_operators(self, actions):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(actions, sp.list[OperatorParamType])
            for action in actions:
                match action:
                    case add_operator(op):
                        assert op.owner == sp.sender, "NOT_OWNER"
                        self.data.operators[op] = ()
                    case remove_operator(op):
                        assert op.owner == sp.sender, "NOT_OWNER"
                        if op in self.data.operators:
                            del self.data.operators[op]

        @sp.entrypoint
        def transfer(self, batch):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(batch, sp.list[TransferBatchItemType])
            for item in batch:
                for tx in item.txs:
                    if item.from_ != sp.sender:
                        assert (
                            sp.record(owner=item.from_, operator=sp.sender, token_id=tx.token_id)
                            in self.data.operators
                        ), "NOT_OPERATOR"
                    assert tx.amount == 1, "NFT_AMOUNT"
                    from_key = sp.record(owner=item.from_, token_id=tx.token_id)
                    assert self.data.ledger.get(from_key, default=sp.nat(0)) == 1, "LOW_BALANCE"
                    del self.data.ledger[from_key]
                    to_key = sp.record(owner=tx.to_, token_id=tx.token_id)
                    assert self.data.ledger.get(to_key, default=sp.nat(0)) == 0, "NFT_ALREADY_OWNED"
                    self.data.ledger[to_key] = 1

        @sp.entrypoint
        def create_project(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, CreateProjectType)
            self._only_admin()
            assert (
                (params.output_mode == PNG_MODE)
                or (params.output_mode == GIF_MODE)
                or (params.output_mode == ZIP_MODE)
            ), "BAD_OUTPUT_MODE"
            assert params.reservation_ttl >= 60 and params.reservation_ttl <= 86400, "BAD_RESERVATION_TTL"
            if params.max_supply.is_some():
                assert params.max_supply.unwrap_some() > 0, "BAD_SUPPLY"
            if params.max_per_wallet.is_some():
                assert params.max_per_wallet.unwrap_some() > 0, "BAD_WALLET_CAP"
            project_id = self.data.next_project_id
            self.data.projects[project_id] = sp.record(
                active=params.active,
                name=params.name,
                symbol=params.symbol,
                generator_uri=params.generator_uri,
                display_uri=params.display_uri,
                output_mode=params.output_mode,
                price=params.price,
                treasury=params.treasury,
                max_supply=params.max_supply,
                max_per_wallet=params.max_per_wallet,
                reservation_ttl=params.reservation_ttl,
                minted=0,
                reserved=0,
            )
            self.data.next_project_id += 1

        @sp.entrypoint
        def set_project_active(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, SetProjectActiveType)
            self._only_admin()
            assert params.project_id in self.data.projects, "NO_PROJECT"
            project = self.data.projects[params.project_id]
            self.data.projects[params.project_id] = sp.record(
                active=params.active,
                name=project.name,
                symbol=project.symbol,
                generator_uri=project.generator_uri,
                display_uri=project.display_uri,
                output_mode=project.output_mode,
                price=project.price,
                treasury=project.treasury,
                max_supply=project.max_supply,
                max_per_wallet=project.max_per_wallet,
                reservation_ttl=project.reservation_ttl,
                minted=project.minted,
                reserved=project.reserved,
            )

        @sp.entrypoint
        def reserve_iteration(self, project_id):
            sp.cast(project_id, sp.nat)
            assert project_id in self.data.projects, "NO_PROJECT"
            project = self.data.projects[project_id]
            assert project.active, "PROJECT_INACTIVE"
            if project.max_supply.is_some():
                assert project.minted + project.reserved < project.max_supply.unwrap_some(), "SOLD_OUT"
            wallet_key = sp.record(owner=sp.sender, token_id=project_id)
            already_minted = self.data.minted_by.get(wallet_key, default=sp.nat(0))
            already_reserved = self.data.reserved_by.get(wallet_key, default=sp.nat(0))
            if project.max_per_wallet.is_some():
                assert already_minted + already_reserved < project.max_per_wallet.unwrap_some(), "WALLET_CAP"
            assert sp.amount == project.price, "BAD_PAYMENT"

            reservation_id = self.data.next_reservation_id
            token_id = self.data.next_token_id
            iteration = project.minted + project.reserved
            seed = sp.blake2b(
                sp.pack(
                    sp.record(
                        project_id=project_id,
                        reservation_id=reservation_id,
                        token_id=token_id,
                        minter=sp.sender,
                        level=sp.level,
                        timestamp=sp.now,
                    )
                )
            )
            self.data.reservations[reservation_id] = sp.record(
                owner=sp.sender,
                project_id=project_id,
                token_id=token_id,
                iteration=iteration,
                seed=seed,
                price=project.price,
                expires_at=sp.add_seconds(sp.now, sp.to_int(project.reservation_ttl)),
            )
            self.data.latest_reservation[sp.sender] = reservation_id
            self.data.projects[project_id] = sp.record(
                active=project.active,
                name=project.name,
                symbol=project.symbol,
                generator_uri=project.generator_uri,
                display_uri=project.display_uri,
                output_mode=project.output_mode,
                price=project.price,
                treasury=project.treasury,
                max_supply=project.max_supply,
                max_per_wallet=project.max_per_wallet,
                reservation_ttl=project.reservation_ttl,
                minted=project.minted,
                reserved=project.reserved + 1,
            )
            self.data.reserved_by[wallet_key] = already_reserved + 1
            self.data.next_reservation_id += 1
            self.data.next_token_id += 1

        @sp.entrypoint
        def finalize_iteration(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, FinalizeIterationType)
            assert params.reservation_id in self.data.reservations, "NO_RESERVATION"
            reservation = self.data.reservations[params.reservation_id]
            assert sp.sender == reservation.owner, "NOT_RESERVATION_OWNER"
            assert sp.now <= reservation.expires_at, "RESERVATION_EXPIRED"
            assert sp.len(params.metadata_uri) > 0 and sp.len(params.metadata_uri) <= 256, "BAD_METADATA_URI"
            assert sp.len(params.artifact_uri) > 0 and sp.len(params.artifact_uri) <= 256, "BAD_ARTIFACT_URI"
            assert sp.len(params.display_uri) > 0 and sp.len(params.display_uri) <= 256, "BAD_DISPLAY_URI"
            assert sp.len(params.thumbnail_uri) > 0 and sp.len(params.thumbnail_uri) <= 256, "BAD_THUMBNAIL_URI"
            assert sp.len(params.artifact_hash) == 32, "BAD_ARTIFACT_HASH"

            project = self.data.projects[reservation.project_id]
            assert (
                ((project.output_mode == PNG_MODE) and (params.mime_type == PNG_MIME))
                or ((project.output_mode == GIF_MODE) and (params.mime_type == GIF_MIME))
                or ((project.output_mode == ZIP_MODE) and (params.mime_type == ZIP_MIME))
            ), "BAD_OUTPUT_MIME"
            token_info = {
                "": params.metadata_uri,
                "name": project.name,
                "symbol": project.symbol,
                "decimals": sp.bytes("0x30"),
                "artifactUri": params.artifact_uri,
                "displayUri": params.display_uri,
                "thumbnailUri": params.thumbnail_uri,
                "pasta:generatorUri": project.generator_uri,
                "pasta:seed": reservation.seed,
                "pasta:projectId": sp.pack(reservation.project_id),
                "pasta:iteration": sp.pack(reservation.iteration),
                "pasta:mimeType": params.mime_type,
                "pasta:artifactSha256": params.artifact_hash,
            }
            token_id = reservation.token_id
            self.data.token_metadata[token_id] = sp.record(token_id=token_id, token_info=token_info)
            self.data.total_supply[token_id] = 1
            self.data.ledger[sp.record(owner=reservation.owner, token_id=token_id)] = 1
            self.data.token_project[token_id] = reservation.project_id
            self.data.token_seed[token_id] = reservation.seed
            self.data.token_artifact[token_id] = sp.record(
                artifact_uri=params.artifact_uri,
                display_uri=params.display_uri,
                thumbnail_uri=params.thumbnail_uri,
                mime_type=params.mime_type,
                artifact_hash=params.artifact_hash,
            )

            wallet_key = sp.record(owner=reservation.owner, token_id=reservation.project_id)
            already_minted = self.data.minted_by.get(wallet_key, default=sp.nat(0))
            already_reserved = self.data.reserved_by.get(wallet_key, default=sp.nat(0))
            assert already_reserved > 0 and project.reserved > 0, "BAD_RESERVATION_COUNT"
            self.data.projects[reservation.project_id] = sp.record(
                active=project.active,
                name=project.name,
                symbol=project.symbol,
                generator_uri=project.generator_uri,
                display_uri=project.display_uri,
                output_mode=project.output_mode,
                price=project.price,
                treasury=project.treasury,
                max_supply=project.max_supply,
                max_per_wallet=project.max_per_wallet,
                reservation_ttl=project.reservation_ttl,
                minted=project.minted + 1,
                reserved=sp.as_nat(project.reserved - 1),
            )
            self.data.minted_by[wallet_key] = already_minted + 1
            if already_reserved == 1:
                del self.data.reserved_by[wallet_key]
            else:
                self.data.reserved_by[wallet_key] = sp.as_nat(already_reserved - 1)
            del self.data.reservations[params.reservation_id]
            if reservation.price > sp.mutez(0):
                sp.send(project.treasury, reservation.price)

        @sp.entrypoint
        def cancel_expired_reservation(self, reservation_id):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(reservation_id, sp.nat)
            assert reservation_id in self.data.reservations, "NO_RESERVATION"
            reservation = self.data.reservations[reservation_id]
            assert sp.now > reservation.expires_at, "RESERVATION_ACTIVE"
            project = self.data.projects[reservation.project_id]
            wallet_key = sp.record(owner=reservation.owner, token_id=reservation.project_id)
            already_reserved = self.data.reserved_by.get(wallet_key, default=sp.nat(0))
            assert already_reserved > 0 and project.reserved > 0, "BAD_RESERVATION_COUNT"
            self.data.projects[reservation.project_id] = sp.record(
                active=project.active,
                name=project.name,
                symbol=project.symbol,
                generator_uri=project.generator_uri,
                display_uri=project.display_uri,
                output_mode=project.output_mode,
                price=project.price,
                treasury=project.treasury,
                max_supply=project.max_supply,
                max_per_wallet=project.max_per_wallet,
                reservation_ttl=project.reservation_ttl,
                minted=project.minted,
                reserved=sp.as_nat(project.reserved - 1),
            )
            if already_reserved == 1:
                del self.data.reserved_by[wallet_key]
            else:
                self.data.reserved_by[wallet_key] = sp.as_nat(already_reserved - 1)
            del self.data.reservations[reservation_id]
            if reservation.price > sp.mutez(0):
                sp.send(reservation.owner, reservation.price)

        @sp.entrypoint
        def add_pack_minter(self, minter):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(minter, sp.address)
            self._only_admin()
            self.data.pack_minters[minter] = ()

        @sp.entrypoint
        def remove_pack_minter(self, minter):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(minter, sp.address)
            self._only_admin()
            if minter in self.data.pack_minters:
                del self.data.pack_minters[minter]

        @sp.entrypoint
        def reserve_pack_capacity(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, PackCapacityType)
            assert sp.sender in self.data.pack_minters, "NOT_PACK_MINTER"
            assert params.project_id in self.data.projects, "NO_PROJECT"
            assert params.amount > 0, "BAD_AMOUNT"
            project = self.data.projects[params.project_id]
            assert project.active, "PROJECT_INACTIVE"
            assert project.price == sp.mutez(0), "PACK_PROJECT_NOT_FREE"
            if project.max_supply.is_some():
                assert project.minted + project.reserved + params.amount <= project.max_supply.unwrap_some(), "SOLD_OUT"
            key = sp.record(owner=sp.sender, token_id=params.project_id)
            self.data.pack_reserved[key] = self.data.pack_reserved.get(
                key, default=sp.nat(0)
            ) + params.amount
            self.data.projects[params.project_id] = sp.record(
                active=project.active,
                name=project.name,
                symbol=project.symbol,
                generator_uri=project.generator_uri,
                display_uri=project.display_uri,
                output_mode=project.output_mode,
                price=project.price,
                treasury=project.treasury,
                max_supply=project.max_supply,
                max_per_wallet=project.max_per_wallet,
                reservation_ttl=project.reservation_ttl,
                minted=project.minted,
                reserved=project.reserved + params.amount,
            )

        @sp.entrypoint
        def release_pack_capacity(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, PackCapacityType)
            # The sender-owned reservation key is durable authority; removing
            # a pack minter only prevents reserve_pack_capacity from adding more.
            assert params.project_id in self.data.projects, "NO_PROJECT"
            assert params.amount > 0, "BAD_AMOUNT"
            project = self.data.projects[params.project_id]
            key = sp.record(owner=sp.sender, token_id=params.project_id)
            available = self.data.pack_reserved.get(key, default=sp.nat(0))
            assert available >= params.amount and project.reserved >= params.amount, "RESERVE_UNDERFUNDED"
            next_available = sp.as_nat(available - params.amount)
            if next_available == 0:
                del self.data.pack_reserved[key]
            else:
                self.data.pack_reserved[key] = next_available
            self.data.projects[params.project_id] = sp.record(
                active=project.active,
                name=project.name,
                symbol=project.symbol,
                generator_uri=project.generator_uri,
                display_uri=project.display_uri,
                output_mode=project.output_mode,
                price=project.price,
                treasury=project.treasury,
                max_supply=project.max_supply,
                max_per_wallet=project.max_per_wallet,
                reservation_ttl=project.reservation_ttl,
                minted=project.minted,
                reserved=sp.as_nat(project.reserved - params.amount),
            )

        @sp.entrypoint
        def mint_pack_iteration(self, params):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            sp.cast(params, MintPackIterationType)
            # Existing capacity remains fulfillable after pack-minter revocation.
            assert params.project_id in self.data.projects, "NO_PROJECT"
            project = self.data.projects[params.project_id]
            reserve_key = sp.record(owner=sp.sender, token_id=params.project_id)
            available = self.data.pack_reserved.get(reserve_key, default=sp.nat(0))
            assert available >= 1 and project.reserved >= 1, "RESERVE_UNDERFUNDED"
            assert sp.len(params.metadata_uri) > 0 and sp.len(params.metadata_uri) <= 256, "BAD_METADATA_URI"
            assert sp.len(params.artifact_uri) > 0 and sp.len(params.artifact_uri) <= 256, "BAD_ARTIFACT_URI"
            assert sp.len(params.display_uri) > 0 and sp.len(params.display_uri) <= 256, "BAD_DISPLAY_URI"
            assert sp.len(params.thumbnail_uri) > 0 and sp.len(params.thumbnail_uri) <= 256, "BAD_THUMBNAIL_URI"
            assert sp.len(params.artifact_hash) == 32, "BAD_ARTIFACT_HASH"
            assert (
                ((project.output_mode == PNG_MODE) and (params.mime_type == PNG_MIME))
                or ((project.output_mode == GIF_MODE) and (params.mime_type == GIF_MIME))
                or ((project.output_mode == ZIP_MODE) and (params.mime_type == ZIP_MIME))
            ), "BAD_OUTPUT_MIME"

            wallet_key = sp.record(owner=params.recipient, token_id=params.project_id)
            already_minted = self.data.minted_by.get(wallet_key, default=sp.nat(0))
            # Pack capacity was irrevocably reserved before its wrapper could be issued. Applying the
            # public mint wallet cap here could strand a legitimately purchased wrapper if its holder
            # already minted from the project, so reserved pack fulfillment deliberately bypasses it.

            token_id = self.data.next_token_id
            seed = sp.blake2b(
                sp.pack(
                    sp.record(
                        pack_contract=params.pack_contract,
                        pack_token_id=params.pack_token_id,
                        open_serial=params.open_serial,
                        action_index=params.action_index,
                        project_id=params.project_id,
                    )
                )
            )
            token_info = {
                "": params.metadata_uri,
                "name": project.name,
                "symbol": project.symbol,
                "decimals": sp.bytes("0x30"),
                "artifactUri": params.artifact_uri,
                "displayUri": params.display_uri,
                "thumbnailUri": params.thumbnail_uri,
                "pasta:generatorUri": project.generator_uri,
                "pasta:seed": seed,
                "pasta:projectId": sp.pack(params.project_id),
                "pasta:iteration": sp.pack(project.minted),
                "pasta:packContract": sp.pack(params.pack_contract),
                "pasta:packTokenId": sp.pack(params.pack_token_id),
                "pasta:packSerial": sp.pack(params.open_serial),
                "pasta:packActionIndex": sp.pack(params.action_index),
                "pasta:mimeType": params.mime_type,
                "pasta:artifactSha256": params.artifact_hash,
                "pasta:artifactPolicy": sp.bytes(
                    "0x73656c662d72656e64657265642d6361636865"
                ),
            }
            self.data.token_metadata[token_id] = sp.record(token_id=token_id, token_info=token_info)
            self.data.total_supply[token_id] = 1
            self.data.ledger[sp.record(owner=params.recipient, token_id=token_id)] = 1
            self.data.token_project[token_id] = params.project_id
            self.data.token_seed[token_id] = seed
            self.data.token_artifact[token_id] = sp.record(
                artifact_uri=params.artifact_uri,
                display_uri=params.display_uri,
                thumbnail_uri=params.thumbnail_uri,
                mime_type=params.mime_type,
                artifact_hash=params.artifact_hash,
            )
            self.data.next_token_id += 1
            self.data.minted_by[wallet_key] = already_minted + 1
            if available == 1:
                del self.data.pack_reserved[reserve_key]
            else:
                self.data.pack_reserved[reserve_key] = sp.as_nat(available - 1)
            self.data.projects[params.project_id] = sp.record(
                active=project.active,
                name=project.name,
                symbol=project.symbol,
                generator_uri=project.generator_uri,
                display_uri=project.display_uri,
                output_mode=project.output_mode,
                price=project.price,
                treasury=project.treasury,
                max_supply=project.max_supply,
                max_per_wallet=project.max_per_wallet,
                reservation_ttl=project.reservation_ttl,
                minted=project.minted + 1,
                reserved=sp.as_nat(project.reserved - 1),
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

        @sp.onchain_view
        def get_balance(self, params):
            sp.cast(params, LedgerKeyType)
            return self.data.ledger.get(params, default=sp.nat(0))

        @sp.onchain_view
        def get_total_supply(self, token_id):
            sp.cast(token_id, sp.nat)
            return self.data.total_supply.get(token_id, default=sp.nat(0))

        @sp.onchain_view
        def get_project(self, project_id):
            sp.cast(project_id, sp.nat)
            assert project_id in self.data.projects, "NO_PROJECT"
            return self.data.projects[project_id]

        @sp.onchain_view
        def get_reservation(self, reservation_id):
            sp.cast(reservation_id, sp.nat)
            assert reservation_id in self.data.reservations, "NO_RESERVATION"
            return self.data.reservations[reservation_id]


main = pasta_generative_collection_main


def bytes_of_string(value):
    return sp.bytes("0x" + value.encode("utf-8").hex())


def hash32(value):
    return sp.bytes("0x" + value * 64)


def pasta_generative_template():
    admin = sp.test_account("pasta_generative_admin")
    metadata = sp.big_map({"": bytes_of_string("ipfs://QmPastaGenerativeCollection")})
    return main.PastaGenerativeCollectionFA2(admin.address, metadata)


@sp.add_test()
def deploy_pasta_generative_template():
    scenario = sp.test_scenario("deploy_pasta_generative_template", main)
    scenario += pasta_generative_template()


@sp.add_test()
def test():
    scenario = sp.test_scenario("PastaGenerativeCollectionFA2", main)
    admin = sp.test_account("admin")
    treasury = sp.test_account("treasury")
    alice = sp.test_account("alice")
    bob = sp.test_account("bob")
    stranger = sp.test_account("stranger")
    contract = main.PastaGenerativeCollectionFA2(
        admin.address, sp.big_map({"": bytes_of_string("ipfs://contract")})
    )
    scenario += contract

    project = sp.record(
        active=True,
        name=bytes_of_string("Rotini PNG Proof"),
        symbol=bytes_of_string("ROT"),
        generator_uri=bytes_of_string("ipfs://generator"),
        display_uri=bytes_of_string("ipfs://preview"),
        output_mode=bytes_of_string("png"),
        price=sp.mutez(1000),
        treasury=treasury.address,
        max_supply=sp.some(sp.nat(3)),
        max_per_wallet=sp.some(sp.nat(2)),
        reservation_ttl=sp.nat(100),
    )
    contract.create_project(project, _sender=admin)
    contract.create_project(project, _sender=alice, _valid=False, _exception="NOT_ADMIN")
    contract.create_project(
        sp.record(
            active=True,
            name=bytes_of_string("Bad"),
            symbol=bytes_of_string("BAD"),
            generator_uri=bytes_of_string("ipfs://generator"),
            display_uri=bytes_of_string("ipfs://preview"),
            output_mode=bytes_of_string("mp4"),
            price=sp.mutez(0),
            treasury=treasury.address,
            max_supply=sp.none,
            max_per_wallet=sp.none,
            reservation_ttl=sp.nat(100),
        ),
        _sender=admin,
        _valid=False,
        _exception="BAD_OUTPUT_MODE",
    )

    scenario.h2("Reservations bind seed, payment, supply, and wallet capacity without minting")
    contract.reserve_iteration(0, _sender=alice, _amount=sp.mutez(1000), _now=sp.timestamp(10), _level=10)
    contract.reserve_iteration(0, _sender=bob, _amount=sp.mutez(1000), _now=sp.timestamp(11), _level=11)
    scenario.verify(contract.data.next_token_id == 2)
    scenario.verify(contract.data.projects[0].minted == 0)
    scenario.verify(contract.data.projects[0].reserved == 2)
    scenario.verify(~contract.data.token_metadata.contains(0))
    scenario.verify(~contract.data.total_supply.contains(0))
    scenario.verify(~contract.data.ledger.contains(sp.record(owner=alice.address, token_id=0)))
    scenario.verify(contract.data.reservations[0].seed != contract.data.reservations[1].seed)
    contract.reserve_iteration(0, _sender=alice, _amount=sp.mutez(999), _valid=False, _exception="BAD_PAYMENT")

    scenario.h2("Only the reserver can finalize the exact project output mode")
    png_finalization = sp.record(
        reservation_id=0,
        metadata_uri=bytes_of_string("ipfs://metadata-0"),
        artifact_uri=bytes_of_string("ipfs://artifact-0.png"),
        display_uri=bytes_of_string("ipfs://artifact-0.png"),
        thumbnail_uri=bytes_of_string("ipfs://artifact-0.png"),
        mime_type=bytes_of_string("image/png"),
        artifact_hash=hash32("a"),
    )
    contract.finalize_iteration(png_finalization, _sender=bob, _valid=False, _exception="NOT_RESERVATION_OWNER")
    contract.finalize_iteration(
        sp.record(
            reservation_id=0,
            metadata_uri=bytes_of_string("ipfs://metadata-0"),
            artifact_uri=bytes_of_string("ipfs://artifact-0.gif"),
            display_uri=bytes_of_string("ipfs://artifact-0.gif"),
            thumbnail_uri=bytes_of_string("ipfs://artifact-0.gif"),
            mime_type=bytes_of_string("image/gif"),
            artifact_hash=hash32("b"),
        ),
        _sender=alice,
        _now=sp.timestamp(12),
        _valid=False,
        _exception="BAD_OUTPUT_MIME",
    )
    contract.finalize_iteration(png_finalization, _sender=alice, _now=sp.timestamp(12))
    scenario.verify(contract.data.projects[0].minted == 1)
    scenario.verify(contract.data.projects[0].reserved == 1)
    scenario.verify(contract.data.total_supply[0] == 1)
    scenario.verify(contract.data.ledger[sp.record(owner=alice.address, token_id=0)] == 1)
    scenario.verify(contract.data.token_metadata[0].token_info[""] == bytes_of_string("ipfs://metadata-0"))
    scenario.verify(contract.data.token_artifact[0].mime_type == bytes_of_string("image/png"))

    scenario.h2("Closing blocks new reservations but does not strand a paid reservation")
    contract.set_project_active(sp.record(project_id=0, active=False), _sender=alice, _valid=False, _exception="NOT_ADMIN")
    contract.set_project_active(sp.record(project_id=0, active=False), _sender=admin)
    contract.reserve_iteration(0, _sender=alice, _amount=sp.mutez(1000), _valid=False, _exception="PROJECT_INACTIVE")
    contract.finalize_iteration(
        sp.record(
            reservation_id=1,
            metadata_uri=bytes_of_string("ipfs://metadata-1"),
            artifact_uri=bytes_of_string("ipfs://artifact-1.png"),
            display_uri=bytes_of_string("ipfs://artifact-1.png"),
            thumbnail_uri=bytes_of_string("ipfs://artifact-1.png"),
            mime_type=bytes_of_string("image/png"),
            artifact_hash=hash32("c"),
        ),
        _sender=bob,
        _now=sp.timestamp(13),
    )
    scenario.verify(contract.data.projects[0].minted == 2)
    scenario.verify(contract.data.projects[0].reserved == 0)

    scenario.h2("Expired reservations refund and release their exact capacity")
    contract.set_project_active(sp.record(project_id=0, active=True), _sender=admin)
    contract.reserve_iteration(0, _sender=alice, _amount=sp.mutez(1000), _now=sp.timestamp(20), _level=20)
    contract.cancel_expired_reservation(2, _sender=stranger, _now=sp.timestamp(120), _valid=False, _exception="RESERVATION_ACTIVE")
    contract.cancel_expired_reservation(2, _sender=stranger, _now=sp.timestamp(121))
    scenario.verify(contract.data.projects[0].minted == 2)
    scenario.verify(contract.data.projects[0].reserved == 0)
    scenario.verify(~contract.data.reservations.contains(2))
    contract.reserve_iteration(0, _sender=alice, _amount=sp.mutez(1000), _now=sp.timestamp(122), _level=21)
    contract.reserve_iteration(0, _sender=bob, _amount=sp.mutez(1000), _valid=False, _exception="SOLD_OUT")

    scenario.h2("Free projects finalize and expire without forbidden zero-tez internal transfers")
    free_project = sp.record(
        active=True,
        name=bytes_of_string("Free Rotini PNG Proof"),
        symbol=bytes_of_string("FREE"),
        generator_uri=bytes_of_string("ipfs://free-generator"),
        display_uri=bytes_of_string("ipfs://free-preview"),
        output_mode=bytes_of_string("png"),
        price=sp.mutez(0),
        treasury=treasury.address,
        max_supply=sp.some(sp.nat(2)),
        max_per_wallet=sp.some(sp.nat(2)),
        reservation_ttl=sp.nat(100),
    )
    contract.create_project(free_project, _sender=admin)
    contract.reserve_iteration(1, _sender=alice, _amount=sp.mutez(0), _now=sp.timestamp(200), _level=22)
    contract.finalize_iteration(
        sp.record(
            reservation_id=4,
            metadata_uri=bytes_of_string("ipfs://free-metadata"),
            artifact_uri=bytes_of_string("ipfs://free-artifact.png"),
            display_uri=bytes_of_string("ipfs://free-artifact.png"),
            thumbnail_uri=bytes_of_string("ipfs://free-artifact.png"),
            mime_type=bytes_of_string("image/png"),
            artifact_hash=hash32("d"),
        ),
        _sender=alice,
        _now=sp.timestamp(201),
    )
    scenario.verify(contract.data.total_supply[4] == 1)
    scenario.verify(contract.data.ledger[sp.record(owner=alice.address, token_id=4)] == 1)
    contract.reserve_iteration(1, _sender=bob, _amount=sp.mutez(0), _now=sp.timestamp(300), _level=23)
    contract.cancel_expired_reservation(5, _sender=stranger, _now=sp.timestamp(401))
    scenario.verify(~contract.data.reservations.contains(5))
    scenario.verify(contract.data.projects[1].reserved == 0)

    scenario.h2("Generated NFTs remain transferable")
    contract.transfer(
        [sp.record(from_=alice.address, txs=[sp.record(to_=bob.address, token_id=0, amount=1)])],
        _sender=alice,
    )
    scenario.verify(contract.data.ledger[sp.record(owner=bob.address, token_id=0)] == 1)
