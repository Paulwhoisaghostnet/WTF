# DummyWtfFA2 - SmartPy v0.24.1
#
# SmartPy FA2-library single-asset token for Shadownet and local exchange
# testing. Token id 0 represents WTF base units; metadata uses decimals = 8
# to mirror the mainnet WTF token.

import smartpy as sp
from smartpy.templates import fa2_lib as fa2


main = fa2.main


@sp.module
def dummy_wtf_fa2_main():
    import main

    class DummyWtfFA2(
        main.Admin,
        main.SingleAsset,
        main.MintSingleAsset,
        main.OnchainviewBalanceOf,
    ):
        def __init__(self, admin, metadata, ledger, token_metadata):
            main.OnchainviewBalanceOf.__init__(self)
            main.MintSingleAsset.__init__(self)
            main.SingleAsset.__init__(self, metadata, ledger, token_metadata)
            main.Admin.__init__(self, admin)


fa2_lib_main = main
main = dummy_wtf_fa2_main


def token_metadata():
    return fa2.make_metadata(name="Dummy WTF", decimals=8, symbol="WTF")


@sp.add_test()
def deploy_dummy_wtf_template():
    import os

    scenario = sp.test_scenario("deploy_dummy_wtf_template", [fa2.t, fa2_lib_main, main])
    admin = sp.address(
        os.environ.get(
            "DUMMY_WTF_ADMIN",
            "tz1burnburnburnburnburnburnburjAYjjX",
        )
    )
    token = main.DummyWtfFA2(
        admin=admin,
        metadata=sp.big_map({"": sp.bytes("0x")}),
        ledger={},
        token_metadata=token_metadata(),
    )
    scenario += token
