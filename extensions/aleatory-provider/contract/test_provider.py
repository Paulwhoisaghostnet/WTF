"""Local conformance and authority tests against the exact upstream module."""

from pathlib import Path
import sys

import smartpy as sp

sys.path.insert(0, str(Path(__file__).resolve().parent / "upstream"))
from aleatory import aleatory


@sp.module
def fixtures():
    class Recipient(sp.Contract):
        @sp.entrypoint
        def default(self):
            pass


@sp.add_test()
def provider_conformance():
    scenario = sp.test_scenario("ProviderConformance", [aleatory, fixtures])
    operator = sp.test_account("Provider operator")
    agent = sp.test_account("Provider agent")
    next_agent = sp.test_account("Replacement agent")
    stranger = sp.test_account("Unrelated collector")
    content = sp.bytes("0x7b226e616d65223a227774664f53227d")
    provider = aleatory.AleatoryProvider(
        operator=operator.address,
        agent=agent.address,
        render_gas=sp.mutez(50_000),
        metadata=sp.big_map({"content": content}),
    )
    registry = aleatory.AleatoryRegistry()
    recipient = fixtures.Recipient()
    scenario += provider
    scenario += registry
    scenario += recipient

    # The real upstream registry invokes all three typed on-chain views.
    scenario.verify(sp.View(provider, "get_render_gas")() == sp.mutez(50_000))
    scenario.verify(sp.View(provider, "get_agent")() == agent.address)
    scenario.verify(sp.View(provider, "get_operator")() == operator.address)
    registry.register(provider.address, _sender=stranger, _now=sp.timestamp(1))
    scenario.verify(registry.data.count == 1)
    scenario.verify(sp.View(registry, "is_registered")(provider.address))
    registry.register(provider.address, _sender=operator, _valid=False, _exception="ALREADY")
    registry.register(recipient.address, _sender=operator, _valid=False, _exception="NOT_A_PROVIDER")

    # Income is received by the contract and cannot be withdrawn by the agent.
    provider.default(_sender=stranger, _amount=sp.mutez(150_000))
    scenario.verify(provider.balance == sp.mutez(150_000))
    for unauthorized in [agent, stranger]:
        provider.set_render_gas(sp.mutez(1), _sender=unauthorized, _valid=False, _exception="NOT_OPERATOR")
        provider.set_agent(unauthorized.address, _sender=unauthorized, _valid=False, _exception="NOT_OPERATOR")
        provider.set_metadata(key="content", value=sp.bytes("0x00"), _sender=unauthorized, _valid=False, _exception="NOT_OPERATOR")
        provider.withdraw(amount=sp.mutez(1), to_=unauthorized.address, _sender=unauthorized, _valid=False, _exception="NOT_OPERATOR")
        registry.deregister(provider.address, _sender=unauthorized, _valid=False, _exception="NOT_OPERATOR")
    scenario.verify(provider.balance == sp.mutez(150_000))
    scenario.verify(provider.data.metadata["content"] == content)

    provider.set_render_gas(sp.mutez(25_000), _sender=operator)
    provider.set_agent(next_agent.address, _sender=operator)
    updated = sp.bytes("0x7b226e616d65223a227774664f53207632227d")
    provider.set_metadata(key="content", value=updated, _sender=operator)
    scenario.verify(sp.View(provider, "get_render_gas")() == sp.mutez(25_000))
    scenario.verify(sp.View(provider, "get_agent")() == next_agent.address)
    scenario.verify(sp.View(provider, "get_operator")() == operator.address)
    scenario.verify(provider.data.metadata["content"] == updated)
    provider.withdraw(amount=sp.mutez(150_001), to_=recipient.address, _sender=operator, _valid=False, _exception="INSUFFICIENT")
    provider.withdraw(amount=sp.mutez(100_000), to_=recipient.address, _sender=operator)
    scenario.verify(provider.balance == sp.mutez(50_000))
    scenario.verify(recipient.balance == sp.mutez(100_000))

    # Configuration/withdrawal and directory actions reject attached tez.
    provider.set_render_gas(sp.mutez(1), _sender=operator, _amount=sp.mutez(1), _valid=False, _exception="TEZ_NOT_ACCEPTED")
    provider.set_agent(agent.address, _sender=operator, _amount=sp.mutez(1), _valid=False, _exception="TEZ_NOT_ACCEPTED")
    provider.set_metadata(key="content", value=content, _sender=operator, _amount=sp.mutez(1), _valid=False, _exception="TEZ_NOT_ACCEPTED")
    provider.withdraw(amount=sp.mutez(1), to_=recipient.address, _sender=operator, _amount=sp.mutez(1), _valid=False, _exception="TEZ_NOT_ACCEPTED")
    registry.deregister(provider.address, _sender=operator, _amount=sp.mutez(1), _valid=False, _exception="TEZ_NOT_ACCEPTED")
    registry.deregister(provider.address, _sender=operator)
    scenario.verify(registry.data.count == 0)
    scenario.verify(~sp.View(registry, "is_registered")(provider.address))
    registry.register(provider.address, _sender=operator, _amount=sp.mutez(1), _valid=False, _exception="TEZ_NOT_ACCEPTED")
