# WTFOS AT Protocol Spine — Decisions Ledger (S0.1)

Status: locked unless explicitly revised here. This is the authoritative record of every
architecture decision for the AT Protocol spine. Implementation steps (S1.x+) must conform to
this ledger. See `01-doctrine-map.md` for how each decision maps to WTF doctrine, and
`02-dns-tls.md` for the concrete DNS/TLS topology.

## 1. Thesis

- Make wtfOS its own **sovereign, federated AT Protocol network** that also interconnects with
  Bluesky. Equal goals: (a) apps interconnect via AT instead of bespoke wiring, (b) WTF activity
  becomes public/portable records, (c) user-owned portable identity + data.
- The OS is an **AT Protocol client that serves its underlying apps**. The AT network is the
  **spine**, not the body. The wtfOS kernel/skeleton stays AT-independent and keeps running on
  Node/Express + PostgreSQL.

## 2. Source of truth & data model

- **PostgreSQL is canonical. AT is a published mirror.** For public data: Postgres commits first,
  then an async best-effort publish to AT via the existing `wtfos_atproto_outbox` with retry
  (PG-first). Private/operational data stays Postgres-only.
- A PDS is a signed, content-addressed record/blob store (SQLite + blobstore internally), not a
  relational query engine. We do **not** move Postgres into a PDS — they are complementary.
- **Public-by-default under a new ToS/UA**: all WTF files and activity are public record unless
  explicitly marked private or derived from an encrypted / inherently-private source.
- **Public classes**: activity/interaction events, board posts/replies/reactions, user-created
  media, token/XP/reward ledgers, gameshow participation/progress, public profiles + handles +
  identity links, wallet↔DID proofs, live presence / room membership.
- **Never public** (ribcage/vault doctrine): DMs, WTF Mail, vault/secrets/security guidance,
  signer/operator keys + internal ops, passwords/OAuth tokens/sessions, email/PII,
  admin/moderation internals. Dear Diary is treated **private-by-default** (assumption — confirm).
- **Ledgers**: append-only event records + periodic balance **snapshots** (balance is a derived
  projection). Off-chain accounting; on-chain token movements are ingested from TZAT (see §8).
- **Dual-write failure policy**: Postgres commit is authoritative; AT publish is async best-effort
  through the outbox with retry. A lag metric + periodic reconciliation guards drift.

## 3. Topology (multi-PDS)

- Official Bluesky PDS image (`ghcr.io/bluesky-social/pds`), which is **multi-tenant** (one PDS
  hosts many repos). Fleet:
  - **Master PDS** (`pds.wtfos.me`): canonical records + WTF-owned per-account tracking repos.
    The existing `wtfos-pds` service is promoted to this role.
  - **7 domain PDSes** (one per constitutional domain): `social`, `commerce`, `media`, `arcade`,
    `tezos`, `ops`, `os` `.wtfos.me`. Each hosts one repo per subdomain; fed **pointer echoes**.
  - **Users PDS** (`users.wtfos.me`): WTF-hosted user `did:plc` identity repos.
  - **Private PDS** (`private.wtfos.me`): encrypted DM/private-room records; **not** federated.
- **Indigo relay** (`relay.wtfos.me`): aggregated `com.atproto.sync.subscribeRepos` firehose +
  a convenience JSON firehose.
- **Self-hosted PLC mirror** (`plc.wtfos.me`) alongside public `plc.directory` (see §5).
- **Labeler** (`mod.wtfos.me`): `com.atproto.label` for bans/labels.
- **Echo flow**: master PDS is canonical; domain PDSes receive **pointer-only** `index.ref` echoes
  via a filtered subscription to the relay firehose, filtered by lexicon `$type` prefix → domain.

## 4. Identity & repo taxonomy

- **DID methods**: `did:web` for everything WTF owns (system, domain, per-account tracking repos);
  `did:plc` for user-owned repos WTF hosts (portable).
- **Per user**:
  - **Tracking repo** — always created at signup, WTF-owned `did:web`, on master PDS. Holds
    activity/media echoes, labels, event tracking. Every account gets one (even never-linked).
  - **Hosted identity repo** — on request, user-owned `did:plc` on `users.wtfos.me`. Full
    Bluesky-equivalent capability, WTF-branded, under WTF terms. WTF retains a **non-removable**
    PLC rotation key + PDS admin (parental/moderation/recovery).
  - **Bring-your-own** — external Bluesky DID; WTF writes only via granted permission; binding
    applied to the external repo by a **one-time OAuth write** (`@atproto/oauth-client-node`).
  - **Link service** — link records bind external DID ↔ WTF DID.
- **Handles**: `alice.wtfos.me` (flat), with a **reserved-words** list so users can't shadow infra
  hosts. Resolution via HTTP `/.well-known/atproto-did` (primary) + DNS `_atproto` TXT.
  Handle change keeps the old handle as an alias/redirect.
- **Recovery**: WTF-custodial (we hold rotation keys) + optional user export of their recovery key.
- **Provisioning abuse control**: account/repo creation is gated because only the WTF app can call
  provisioning (no public invite codes required).
- **Existing Skywire + tz2at identity** are **extended**, not replaced (S4.5).

## 5. PLC strategy (dual)

- Register user `did:plc` DIDs on **public `plc.directory`** (authoritative for issuance →
  interop with Bluesky) **and** mirror to a **self-hosted PLC** (`plc.wtfos.me`) for sovereignty /
  failover if Bluesky sunsets. A consistency checker runs before federation (pre-mortem T1).

## 6. Storage / media ("echo")

- Media **bytes stay in S3** (warm cache; existing `server/lib/storage/object-storage.ts`). The
  repo record carries a `media.echo` reference (CID, S3 bucket/key/endpoint/region, mime/size/dims,
  derivatives, license/attribution). Optionally also a real AT blob ref for true portability (flag).
- External AT clients fetch bytes through a **relay-proxy media gateway** that resolves an echo →
  S3 and streams. Private/user-marked-private media stays **PG + private-S3 only (no AT)**.
- Repo growth controlled by **archive + evict** (cold archive to S3/Storage Box + tombstone),
  reusing the TZAT eviction pattern.

## 7. Lexicons & AppView

- Canonical namespace **`app.wtfos.*`** (now domain-backed: reverse-DNS of `wtfos.app` is
  `app.wtfos`; authority resolves at `_lexicon.wtfos.app`).
- Lexicon **JSON** files (`shared/atproto/lexicons/*.json`) are the publishable schema (lex-cli
  compatible; the source for any external SDK/type generation). Runtime validation + in-tree
  TypeScript types come from **Zod** (`shared/atproto/zod.ts`) with types via `z.infer`, bound to the
  JSON by a **parity test** (`shared/atproto/lexicon-parity.test.ts`: identical property + required
  sets, `$type` const = id). `validate:false` at the PDS write (the PDS doesn't host our lexicons).
  - **Refinement of original plan (S1.2, flagged):** rather than `@atproto/lex-cli` generating the
    in-tree types as a separate artifact (which risks dual-source drift against the hand-written
    Zod), Zod is the single source of in-tree types and the parity test enforces JSON↔Zod
    agreement. `lex-cli` is reserved for generating the *external* `@wtfos/sdk` (S3.3). No new
    dependency was added.
- Evolution is **additive**; breaking changes use a versioned NSID (`.vN`).
- **rkeys**: deterministic for entities/dedupe (idempotent re-publish), TIDs for streams/posts.
- **AppView**: firehose-driven indexer (+ projection bootstrap), materializing per-domain read
  models into a dedicated `appview` schema in the existing Postgres (split to a separate DB later
  if needed). Apps read peers via **internal REST now + XRPC** (`api.wtfos.app`) for external/
  federated reads.
- Apps declare what they **emit/consume** by extending `shared/wtf-app-packages.ts`.
- Spine code module: `server/features/atproto-spine`; doctrine/organism name "Synapse".

## 8. Federation

- **Bidirectional with Bluesky**: (a) Bluesky/AppViews crawl our public repos (request crawl from
  `bsky.network`), (b) we read Bluesky public data (existing Skywire), (c) we write to users'
  Bluesky repos with permission (invites/shares), (d) cross-post selected events as
  `app.bsky.feed.post`.
- **Public firehose is filtered**: only public collections are exposed; the private PDS is excluded.
- **WTF Live ROOM invite** use case: an `app.wtfos.room.invite` record in the inviter's repo +
  optional Bluesky notification to the friend's bsky identity.
- WTFOS network **consumes TZAT** as an upstream chain-event source (Tezos domain emissions).

## 9. Domains (purchased)

- **`wtfos.app`** — system: client/desktop shell + AppView (`api.wtfos.app`). Primary/advertised.
- **`wtfos.me`** — social/identity network: handles + PDS/relay/PLC/labeler.
- **`wtfgameshow.app`** — gameshow client + working alias; recognizes WTF accounts. Splitting the
  gameshow into an isolated client is **future / out of scope**.

## 10. Process & guardrails

- **Additive/pragmatic edits only**: add hooks to the existing event spine; never remove existing
  organs. Apps connect themselves to the spine + all required registries (doctrine).
- **Zero user-visible disruption**: everything is flag-gated (master `ATPROTO_SPINE_ENABLED`,
  default off) until explicitly flipped.
- **Single-pass agent steps**: feature-sized, each "done" only with tests, docs/runbook updates,
  inventory + admin-surface + acceptance-manifest updates where a surface changes, explicit
  rollback/disable, observability, and a demoable verification.
- **Timeline**: move fast with demoable checkpoints; correctness gated by the success signals
  (cross-app round-trip read; external firehose replay; user repo export).
- **Inbound event guardrail (security)**: AT Protocol records, firehose frames, and XRPC
  commands must **never** trigger WTFOS kernel events unless explicitly bridged and
  allowlisted. Postgres remains canonical; replay must not re-drive rewards/challenges.
  See `03-inbound-event-guardrail.md` and `server/features/atproto/event-bridge.ts`.
- **Doctrine source**: `WTF-ux-interoperability-clone/WTF-Bible.md` (primary) + `The Law,
  Delivered.md` (execution order). The Bible was located during planning.

## 11. Pilot

- First domain converted end-to-end: **identity-social** (Message Board → W → DMs → identity
  unification). Backfill is cheap (~2 months of sparse activity) and in scope for the pilot domain.
