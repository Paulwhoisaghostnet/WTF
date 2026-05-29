# WTFOS AT Protocol Spine — Doctrine Map (S0.1)

How the AT Protocol spine conforms to WTF doctrine. Primary source:
`WTF-ux-interoperability-clone/WTF-Bible.md`; execution order: `The Law, Delivered.md`;
gates: `docs/constitutional-acceptance.md`. Each row ties a spine decision to the law it satisfies.

## Constitution (Appendix OMEGA)

- **Art. III §1 — The Kernel is the hidden authority layer; no app shall replace Kernel authority.**
  → The AT spine is a **kernel service** (`server/features/atproto-spine`, "Synapse"). Apps call it;
  they do not own AT credentials or PDS access directly. Identity/permissions/events stay kernel-owned.
- **Art. III §3 — Apps communicate through events, kernel services, inventory, rewards,
  permissions, notifications; apps shall not become isolated kingdoms.**
  → AT interconnection is the doctrinal cure for isolated kingdoms: apps emit to / read from the
  spine instead of bespoke cross-app wiring.
- **Art. I §1–2 — User First; the right to know.**
  → Publishing is governed by a clear ToS/UA; public-by-default is explicit, not hidden. Private
  classes are protected. Users can see/understand what is public.
- **Art. I §4 — Right to safe value; no blind signing.**
  → AT writes never bypass the transaction firewall for any wallet-touching action. AT identity is
  separate from wallet signing.
- **Art. II §2–3 — All admin actions audited; admins must have observability.**
  → The labeler (bans/labels) and provisioning write **audit records** (timestamp, acting admin,
  reason, affected entity). Admin observability surfaces cover outbox/firehose/echo health (S5.1).

## Skeleton / organism (Appendix E)

- **6.1 Spine = App Registry / Domain Architecture.**
  → The AT domain partitioning mirrors the constitutional **domain map**; each app keeps its place
  in the registry. AT does not reshape the skeleton; it attaches to it.
- **Nervous system = automation/events** (`ingestSystemEvent` → `challenge_system_events`).
  → The spine adds an **additive hook** to the existing event spine to enqueue AT publishes; it does
  not replace or reroute the reflex arc.
- **6.2 Ribcage = Storage Boundary (Private Media / Public Media / Backups).**
  → Public records → PDS; private media → PG + private-S3; secrets/signer → never AT. The private
  PDS is excluded from federation.

## Core foundation (Bible §1–5)

- **Kernel is sacred; no feature bypasses the kernel** (§1).
  → No app gets its own unsafe AT path; all AT writes/reads funnel through the kernel spine service.
- **Identity layer: local + wallet identity; wallet is a system service** (§2–3).
  → AT DID/handle is a third identity facet layered on top of the existing local + wallet identity,
  not a replacement. WTF account remains the local identity.
- **Sync is consent-based; private/vault/signer must never drift into public/cloud by accident**
  (§4 sync service).
  → The single most important privacy rule: only ToS-public classes are published; private classes
  are structurally separated (private PDS, no public firehose, encrypted values).

## Acceptance gates (constitutional-acceptance.md)

- **LAW.FA1/FA2/AO1** — every new/changed app surface keeps the domain-guide skeleton, locks app
  manifests to doctrine domains, and locks the Admin OS surface registry to domain guides.
  → Each app conversion (S4.x) completes the **same-pass registration checklist** (route, icon/gate,
  admin surface domain+subdomain, `wtf-app-packages.ts` emits/consumes, inventory row, E2E fixture,
  event handles) in one change.

## Risks to doctrine (tracked)

- Missing organs: do not amputate. AT is additive; existing flows keep working with flags off.
- "The Law is an execution order, not permission to transplant stale files wholesale" — extractions
  from TZAT are generalized into a configurable package, not copied wholesale into app code.
