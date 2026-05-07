# WTF Tezos Domains Source Map

## Sources

- `../wtf tez/wtf.tez`
- `../wtf tez/hack-tez`

## Registrar Contract

- Source: `contract/hack_tez_registrar.py`, `contract/deploy.ts`
- Target: `contracts/wtf-subdomains`
- Notes: SmartPy registrar is imported as contract source only. Standalone site assets stay outside this contract folder.

## Registrar Frontend/API

- Source: `src/components/SubdomainManager.tsx`, `src/hooks/useContractConfig.ts`, `src/hooks/useEligibility.ts`, `src/lib/contract.ts`, `src/lib/commitment.ts`, `src/config/tezos.ts`
- Target: `server/features/wtf-subdomains/registrar.ts`, `server/features/wtf-subdomains/contracts.ts`, `client/src/features/wtf-subdomains`
- Notes: WTF defaults to grant-only behavior. On-chain registrar preparation is gated by `WTF_DOMAINS_REGISTRAR_ENABLED`.

## Current WTF Grants

- Source: `server/lib/wtf-subdomains.ts`, `server/lib/wtf-subdomain-grants.ts`, `server/routes/wtf-subdomains.ts`
- Target: `server/features/wtf-subdomains/grants.ts`
- Notes: Compatibility re-exports keep existing imports stable.

## Chat Backend

- Source: `chat/src/*`, `auth/*`, `src/hooks/useChat.ts`, `src/hooks/useDM.ts`
- Target: `server/features/wtf-subdomains/chat.ts`
- Notes: Chat config and domain normalization are isolated from grants. Full chat runtime remains a separate universal-chat cutover concern.

## Automation Bot

- Source: `bot/*`
- Target: `extensions/wtf-domain-bot`
- Notes: Bot remains an extension package and should communicate through public WTF/TzKT APIs rather than importing server internals.
