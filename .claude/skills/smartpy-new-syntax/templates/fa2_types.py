import smartpy as sp


@sp.module
def t():
    # Common

    metadata: type = sp.big_map[sp.string, sp.bytes]
    token_metadata: type = sp.big_map[
        sp.nat,
        sp.record(token_id=sp.nat, token_info=sp.map[sp.string, sp.bytes]).layout(
            ("token_id", "token_info")
        ),
    ]
    operator_permission: type = sp.record(
        owner=sp.address, operator=sp.address, token_id=sp.nat
    ).layout(("owner", ("operator", "token_id")))
    spender_key: type = sp.record(owner=sp.address, spender=sp.address, token_id=sp.nat)
    tx_transfer_request: type = sp.record(
        from_=sp.address, token_id=sp.nat, amount=sp.nat
    ).layout(("from_", ("token_id", "amount")))
    tx: type = sp.record(to_=sp.address, token_id=sp.nat, amount=sp.nat).layout(
        ("to_", ("token_id", "amount"))
    )
    ticket: type = sp.ticket[sp.pair[sp.nat, sp.option[sp.bytes]]]
    lambda_action: type = sp.lambda_(sp.list[ticket], sp.list[sp.operation])
    balance_of_request: type = sp.record(owner=sp.address, token_id=sp.nat).layout(
        ("owner", "token_id")
    )

    # Private lambdas
    transfer_tx_param: type = sp.record(from_=sp.address, tx=tx)
    balance_params: type = sp.pair[
        sp.lambda_(sp.nat, sp.bool, with_storage="read-only"), balance_of_request
    ]
    receive_tokens_: type = sp.lambda_(tx, sp.unit, with_storage="read-write")
    check_tx_transfer_permissions_: type = sp.lambda_(
        tx_transfer_request, sp.unit, with_storage="read-write"
    )
    is_defined_: type = sp.lambda_(sp.nat, sp.bool, with_storage="read-only")

    # Ledger dependent

    ledger_nft: type = sp.big_map[sp.nat, sp.address]
    ledger_fungible: type = sp.big_map[sp.pair[sp.address, sp.nat], sp.nat]
    ledger_single_asset: type = sp.big_map[sp.address, sp.nat]
    supply_fungible: type = sp.big_map[sp.nat, sp.nat]

    # Entrypoints

    transfer_batch: type = sp.record(
        from_=sp.address,
        txs=list[tx],
    ).layout(("from_", "txs"))
    transfer_param: type = list[transfer_batch]
    update_operators_param: type = sp.list[
        sp.variant(
            add_operator=operator_permission, remove_operator=operator_permission
        )
    ]
    balance_of_response: type = sp.record(
        request=balance_of_request, balance=sp.nat
    ).layout(("request", "balance"))
    balance_of_param: type = sp.record(
        callback=sp.contract[list[balance_of_response]],
        requests=list[balance_of_request],
    ).layout(("requests", "callback"))
    export_ticket_param: type = sp.record(
        destination=sp.option[
            sp.contract[sp.list[sp.pair[sp.address, sp.list[ticket]]]]
        ],
        txs=sp.list[
            sp.record(
                to_=sp.address,
                tickets_to_export=sp.list[tx_transfer_request],
            )
        ],
    )
    import_ticket_param: type = sp.list[
        sp.record(to_=sp.address, tickets=sp.list[ticket]).layout(("to_", "tickets"))
    ]
    approve_param: type = sp.list[
        sp.record(
            owner=sp.address,
            spender=sp.address,
            token_id=sp.nat,
            action=sp.variant(increase=sp.nat, decrease=sp.nat),
        ).layout(("owner", ("spender", ("token_id", "action"))))
    ]
    lambda_export_param: type = sp.record(
        tickets_to_export=sp.list[tx_transfer_request], action=lambda_action
    ).layout(("tickets_to_export", "action"))

    # Events

    balance_delta: type = sp.map[sp.record(owner=sp.address, token_id=sp.nat), sp.int]

    transfer_event: type = sp.record(
        from_=sp.address, to_=sp.address, token_id=sp.nat, amount=sp.nat
    )
    balance_update_event: type = sp.record(
        owner=sp.address,
        token_id=sp.nat,
        new_balance=sp.nat,
        diff=sp.int,
    ).layout(("owner", ("token_id", ("new_balance", "diff"))))
    allowance_update_event: type = sp.record(
        owner=sp.address,
        spender=sp.address,
        token_id=sp.nat,
        new_allowance=sp.nat,
        diff=sp.int,
    ).layout(("owner", ("spender", ("token_id", ("new_allowance", "diff")))))
    total_supply_update_event: type = sp.record(
        token_id=sp.nat,
        new_total_supply=sp.nat,
        diff=sp.int,
    ).layout(("token_id", ("new_total_supply", "diff")))
    operator_update_event: type = sp.record(
        owner=sp.address,
        operator=sp.address,
        token_id=sp.nat,
        is_operator=sp.bool,
    ).layout(("owner", ("operator", ("token_id", "is_operator"))))
    token_metadata_update_event: type = sp.record(
        token_id=sp.nat, new_metadata=sp.option[sp.map[sp.string, sp.bytes]]
    ).layout(("token_id", "new_metadata"))

    # Others

    sandbox: type = sp.pair[sp.list[ticket], lambda_action]
