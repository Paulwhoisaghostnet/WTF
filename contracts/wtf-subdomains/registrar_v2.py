"""
WTF Domains Registrar v2 — commit-reveal subdomain registration for .wtf.tez

This module is the canonical SmartPy registrar used by WTF Gameshow.
It implements the same commit-reveal pattern proven in skullzarmy/hack-tez,
adapted for the configured WTF parent domain via Tezos Domains (TED).

Run tests:
  python contracts/wtf-subdomains/wtf_domains_registrar.py

The implementation lives in wtf_domains_registrar.py; this file documents
the v2 contract surface and re-exports the test runner entrypoint.
"""

from wtf_domains_registrar import main  # noqa: F401

if __name__ == "__main__":
    import smartpy as sp

    sp.test_scenario("WtfDomainsRegistrarV2").add_test(
        main.WtfDomainsRegistrar,
        extra_imports=[main],
    )
