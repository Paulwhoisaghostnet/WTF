import smartpy as sp

# This contract shows how to generate the metadata for a contract.


@sp.module
def main():
    class MyContract(sp.Contract):
        """My Contract"""

        def __init__(self):
            self.data.x = "Test"
            self.data.metadata = sp.cast(sp.big_map(), sp.big_map[sp.string, sp.bytes])

        @sp.entrypoint
        def ep(self):
            pass

        @sp.offchain_view
        def add_10(self, n: sp.nat):
            """This adds 10."""
            return n + 10


if "main" in __name__:
    pin_on_ipfs = False

    @sp.add_test()
    def test():
        sc = sp.test_scenario("Contract metadata")
        # Instantiate the contract
        c1 = main.MyContract()
        # SmartPy source code of the contract
        source = c1.get_source()
        if pin_on_ipfs:
            # ⚠️ Don't do that if you don't want to reveal your SmartPy
            # source code to the world!
            source_uri = sp.pin_on_ipfs(source, api_key=None, secret_key=None)
        else:
            source_uri = "ipfs://QmaV5gQ6p9ND9pjc1BPD3dc8oyi8CWEDdueSmkmasiaWGA"
        # Build the metadata
        metadata = sp.create_tzip16_metadata(
            name="MyContract",
            version="1.0.0",
            license_name="CC0",
            description="This is a demo contract using SmartPy.",
            authors=["SmartPy <https://smartpy.io/>"],
            homepage="https://smartpy.io/ide?template=contract_metadata.py",
            offchain_views=c1.get_offchain_views(),
            # Don't add the source_uri if you don't want to reveal your SmartPy
            # source code to the world.
            source_uri=source_uri,
        )
        if pin_on_ipfs:
            metadata_uri = sp.pin_on_ipfs(metadata, api_key=None, secret_key=None)
        else:
            metadata_uri = "ipfs://QmRpHDSf1P2sCbgYWrxhuWvt3bzTnAmXxPaNeTLCEweCxE"
        # Update the metadata on the contract
        c1.data.metadata = sp.scenario_utils.metadata_of_url(metadata_uri)
        # Originate the contract
        sc += c1
