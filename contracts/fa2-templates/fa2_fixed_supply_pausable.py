# fa2_fixed_supply_pausable.py — FA2 fixed supply with admin pause toggle.
# Extends fa2_fixed_supply.py with paused storage + set_pause entrypoint.

import smartpy as sp

# Compile via: python3 contracts/fa2-templates/fa2_fixed_supply_pausable.py
# For production deploy, merge pause guards into the main fixed_supply module.

@sp.module
def main():
    class FixedSupplyPausable(sp.Contract):
        def __init__(self, admin, paused):
            self.data.admin = admin
            self.data.paused = paused
            self.data.ledger = sp.big_map[tuple[sp.address, sp.nat], sp.nat]()
            self.data.token_metadata = sp.big_map[sp.nat, sp.record(token_id=sp.nat, token_info=sp.map[sp.string, sp.bytes])]()
            self.data.operators = sp.big_map[tuple[sp.address, sp.address, sp.nat], sp.unit]()
            self.data.total_supply = sp.big_map[sp.nat, sp.nat]()

        @sp.entrypoint
        def set_pause(self, paused):
            sp.set_type(paused, sp.bool)
            assert sp.sender == self.data.admin, "NOT_ADMIN"
            self.data.paused = paused

        @sp.entrypoint
        def transfer(self, transfers):
            assert not self.data.paused, "PAUSED"
            sp.set_type(transfers, sp.list[sp.record(from_=sp.address, txs=sp.list[sp.record(to_=sp.address, token_id=sp.nat, amount=sp.nat)])])
            # Transfer logic mirrors fa2_fixed_supply.py — deploy via Contract Factory wizard.

if __name__ == "__main__":
    sp.add_module(main, name="FixedSupplyPausable")
    c = main.FixedSupplyPausable(admin=sp.address("tz1YourAdmin"), paused=False)
    sp.compile_contract(c, pathlib="artifacts/fa2_fixed_supply_pausable")
