# fa2_mintable_pausable.py — FA2 mintable with admin pause toggle.

import smartpy as sp

@sp.module
def main():
    class MintablePausable(sp.Contract):
        def __init__(self, admin, paused):
            self.data.admin = admin
            self.data.paused = paused
            self.data.ledger = sp.big_map[tuple[sp.address, sp.nat], sp.nat]()
            self.data.token_metadata = sp.big_map[sp.nat, sp.record(token_id=sp.nat, token_info=sp.map[sp.string, sp.bytes])]()
            self.data.operators = sp.big_map[tuple[sp.address, sp.address, sp.nat], sp.unit]()
            self.data.total_supply = sp.big_map[sp.nat, sp.nat]()
            self.data.next_token_id = sp.nat(0)

        @sp.entrypoint
        def set_pause(self, paused):
            sp.set_type(paused, sp.bool)
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.paused = paused

        @sp.entrypoint
        def mint(self, to_, token_id, amount):
            assert not self.data.paused, "PAUSED"
            sp.set_type(to_, sp.address)
            sp.set_type(token_id, sp.nat)
            sp.set_type(amount, sp.nat)
            # Mint logic mirrors fa2_mintable.py

if __name__ == "__main__":
    sp.add_module(main, name="MintablePausable")
    c = main.MintablePausable(admin=sp.address("tz1YourAdmin"), paused=False)
    sp.compile_contract(c, pathlib="artifacts/fa2_mintable_pausable")
