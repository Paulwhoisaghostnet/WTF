"""Compile only the unchanged upstream AleatoryProvider; never originate it."""

from pathlib import Path
import sys

import smartpy as sp

sys.path.insert(0, str(Path(__file__).resolve().parent / "upstream"))
from aleatory import aleatory


@sp.add_test()
def compile_provider():
    scenario = sp.test_scenario("AleatoryProvider", aleatory)
    # Compilation fixtures only. Deployment supplies operator, agent, fee and
    # metadata independently; no storage fixture is exported as a deploy input.
    fixture = sp.address("tz1burnburnburnburnburnburnburjAYjjX")
    scenario += aleatory.AleatoryProvider(
        operator=fixture,
        agent=fixture,
        render_gas=sp.mutez(0),
        metadata=sp.big_map({"": sp.bytes("0x00")}),
    )
