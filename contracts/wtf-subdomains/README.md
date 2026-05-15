# WTF Subdomain Registrar Contracts

This folder holds the SmartPy registrar sources imported from the `wtf tez`
apps. The contract remains intentionally separate from WTF grant reservations,
domain chat, and bot automation.

## Files

- `wtf_domains_registrar.py` - commit-reveal Tezos Domains subdomain registrar.
- `deploy.ts` - Taquito origination helper for compiled Michelson artifacts.

The source contract accepts the parent domain as deployment storage; configure
`WTF_DOMAINS_PARENT_DOMAIN` / `PARENT_DOMAIN` at deployment time for the parent
domain that WTF is issuing under.
