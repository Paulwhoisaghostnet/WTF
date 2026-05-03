# Universal WTF/Hack Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one Hetzner-hosted universal chat system at `wtfgameshow.app` that lets `*.wtf.tez` and `*.hack.tez` identities share public rooms and direct messages.

**Architecture:** Move the authoritative chat persistence and WebSocket runtime into the WTF Gameshow Express/Postgres server. Keep Tezos domain identity as the chat principal, issue short-lived JWTs from wallet signatures, and make `wtfgameshow.app` the canonical API/WS origin used by `wtf.tez`, `hack.tez`, and the WTF platform UI. Keep the existing WTF web2 DM system separate, but allow platform users with linked wallets to open the same universal domain chat.

**Tech Stack:** Node 20, Express 5, `ws`, Drizzle ORM, PostgreSQL 16, React 19, TanStack Query, octez.connect/Beacon signature flow, Tezos Domains GraphQL, Docker Compose + Caddy on Hetzner.

---

## Current State Analysis

### What already exists

- `WTF combo/wtf tez/hack-tez/chat/` is the original hackchat backend: Cloudflare Worker auth/API, D1 storage, and PartyKit WebSocket rooms.
- `WTF combo/wtf tez/wtf.tez/chat/` is a copied and partly generalized backend. It has `src/domain-config.ts`, `CHAT_PARENT_DOMAINS`, `CHAT_PARENT_DOMAIN`, `CHAT_SIGNING_PREFIX`, and tests proving labels can resolve to both `wtf.tez` and `hack.tez`.
- `WTF combo/wtf tez/wtf.tez/src/config/tezos.ts` already exposes:
  - `hackchatUrl` from `VITE_WTFCHAT_URL` or `VITE_HACKCHAT_URL`
  - `partykitHost` from `VITE_PARTYKIT_HOST`
  - `chatParentDomains` from `VITE_CHAT_PARENT_DOMAINS`
  - `chatSigningPrefix` from `VITE_CHAT_SIGNING_PREFIX`
- The existing registrar chat UI already supports:
  - wallet-signature JWT auth
  - full-domain identities
  - global chat
  - deterministic DM room ids (`dm:${sortedDomainA}+${sortedDomainB}`)
  - message edit, delete, reactions, replies, media metadata, moderation, bans, and push subscriptions at the Worker/D1 layer.
- `WTF combo/WTF` is the live WTF platform. It is deployed to the Hetzner server with Docker Compose and Caddy.
- `WTF combo/WTF/server/routes/messages.ts` has platform DMs, but those are `users.id` based and session-cookie authenticated. They are not the same identity model as hackchat.
- `WTF combo/WTF/server/websocket.ts` already runs the app WebSocket server at `/ws`, authenticated with the Express session cookie.
- `WTF combo/WTF/Caddyfile` already proxies WebSocket upgrades to the app container, so `/ws/universal-chat` can work without a new public port.
- `WTF combo/WTF/.github/workflows/deploy.yml` applies numbered SQL migrations from `drizzle/0015+` on every Hetzner deploy.

### Gaps to close

- The copied `wtf.tez` chat backend is still Cloudflare/PartyKit shaped. It is not running inside the Hetzner WTF stack.
- The main WTF platform DM schema cannot directly support `alice.wtf.tez` <-> `bob.hack.tez`, because it only models registered platform users.
- `wtf.tez` and `hack.tez` currently depend on environment-selected chat endpoints; there is no single canonical `wtfgameshow.app` chat API/WS endpoint.
- The current Worker auth uses client-generated timestamp/nonce challenges and does not persist nonce use. The Hetzner version should reject replayed nonces while keeping the same signing UX.
- Existing public room support is only the single `global` room. The new system needs named universal rooms and cross-parent DMs.

### Implementation decision

Make `WTF combo/WTF` the source of truth for universal chat:

- Store universal chat in Postgres, not D1.
- Host REST under `/api/universal-chat/*`.
- Host WebSockets under `/ws/universal-chat`.
- Authenticate with chat JWTs issued by the WTF server from Tezos wallet signatures.
- Resolve owned identities from Tezos Domains for both `wtf.tez` and `hack.tez`.
- Keep domain identities independent from platform users, with optional `linkedUserId` when a WTF account has a matching linked wallet.
- Update `wtf.tez` and `hack-tez` clients to prefer the Hetzner universal transport and keep PartyKit fallback until cutover is verified.

## File Structure

Create or modify these files:

- Create: `WTF combo/WTF/drizzle/0042_universal_chat.sql`
- Modify: `WTF combo/WTF/shared/schema.ts`
- Create: `WTF combo/WTF/server/lib/universal-chat/domain.ts`
- Create: `WTF combo/WTF/server/lib/universal-chat/domain.test.ts`
- Create: `WTF combo/WTF/server/lib/universal-chat/auth.ts`
- Create: `WTF combo/WTF/server/lib/universal-chat/tezos-domains.ts`
- Create: `WTF combo/WTF/server/lib/universal-chat/repository.ts`
- Create: `WTF combo/WTF/server/routes/universal-chat.ts`
- Create: `WTF combo/WTF/server/universal-chat-websocket.ts`
- Modify: `WTF combo/WTF/server/routes.ts`
- Modify: `WTF combo/WTF/server/index.ts`
- Modify: `WTF combo/WTF/.env.example`
- Modify: `WTF combo/WTF/README.md`
- Create: `WTF combo/WTF/client/src/lib/universal-chat-client.ts`
- Create: `WTF combo/WTF/client/src/pages/UniversalChat.tsx`
- Modify: `WTF combo/WTF/client/src/App.tsx`
- Modify: `WTF combo/wtf tez/wtf.tez/src/config/tezos.ts`
- Create: `WTF combo/wtf tez/wtf.tez/src/lib/universalChatTransport.ts`
- Modify: `WTF combo/wtf tez/wtf.tez/src/hooks/useChat.ts`
- Modify: `WTF combo/wtf tez/wtf.tez/src/hooks/useDM.ts`
- Modify: `WTF combo/wtf tez/wtf.tez/src/hooks/useDMList.ts`
- Modify: `WTF combo/wtf tez/wtf.tez/.env.example`
- Repeat the same registrar transport changes in `WTF combo/wtf tez/hack-tez/` after `wtf.tez` passes local verification.

## Data Contracts

### Canonical identity

```ts
export interface UniversalChatIdentity {
  domain: string;           // alice.wtf.tez or bob.hack.tez
  walletAddress: string;    // tz1/tz2/tz3 owner from Tezos Domains lookup
  parentDomain: string;     // wtf.tez or hack.tez
  network: "mainnet" | "ghostnet";
  linkedUserId: number | null;
}
```

### Canonical room keys

```ts
export function canonicalPublicRoomSlug(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function canonicalDmKey(domainA: string, domainB: string): string {
  return [domainA.toLowerCase(), domainB.toLowerCase()].sort().join("+");
}
```

### REST endpoints

```txt
POST /api/universal-chat/auth
POST /api/universal-chat/auth/refresh
GET  /api/universal-chat/rooms
GET  /api/universal-chat/rooms/:slug/history?before=&limit=
GET  /api/universal-chat/dms
POST /api/universal-chat/dms
GET  /api/universal-chat/dms/:dmKey/history?before=&limit=
GET  /api/universal-chat/identities/search?q=&limit=
```

### WebSocket endpoint

```txt
wss://wtfgameshow.app/ws/universal-chat?token=<jwt>&room=global
wss://wtfgameshow.app/ws/universal-chat?token=<jwt>&room=room:dev
wss://wtfgameshow.app/ws/universal-chat?token=<jwt>&room=dm:alice.wtf.tez+bob.hack.tez
```

## Task 1: Add Postgres Schema

**Files:**
- Create: `WTF combo/WTF/drizzle/0042_universal_chat.sql`
- Modify: `WTF combo/WTF/shared/schema.ts`

- [ ] **Step 1: Create the SQL migration**

Create `WTF combo/WTF/drizzle/0042_universal_chat.sql`:

```sql
-- Universal Tezos-domain chat for wtf.tez + hack.tez identities.

CREATE TABLE IF NOT EXISTS universal_chat_used_nonces (
  nonce VARCHAR(128) PRIMARY KEY,
  wallet_address VARCHAR(36) NOT NULL,
  signing_prefix VARCHAR(120) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS universal_chat_used_nonces_expires_idx
  ON universal_chat_used_nonces(expires_at);

CREATE TABLE IF NOT EXISTS universal_chat_identities (
  domain VARCHAR(255) PRIMARY KEY,
  wallet_address VARCHAR(36) NOT NULL,
  parent_domain VARCHAR(120) NOT NULL,
  network VARCHAR(16) NOT NULL DEFAULT 'mainnet',
  linked_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  first_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS universal_chat_identity_wallet_idx
  ON universal_chat_identities(wallet_address);
CREATE INDEX IF NOT EXISTS universal_chat_identity_parent_idx
  ON universal_chat_identities(parent_domain);
CREATE INDEX IF NOT EXISTS universal_chat_identity_linked_user_idx
  ON universal_chat_identities(linked_user_id);

CREATE TABLE IF NOT EXISTS universal_chat_rooms (
  id SERIAL PRIMARY KEY,
  room_kind VARCHAR(16) NOT NULL CHECK (room_kind IN ('public', 'dm')),
  slug VARCHAR(120),
  dm_key VARCHAR(520),
  title VARCHAR(160),
  description TEXT,
  created_by_domain VARCHAR(255),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT universal_chat_room_key CHECK (
    (room_kind = 'public' AND slug IS NOT NULL AND dm_key IS NULL)
    OR
    (room_kind = 'dm' AND slug IS NULL AND dm_key IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS universal_chat_public_slug_unique_idx
  ON universal_chat_rooms(slug) WHERE room_kind = 'public';
CREATE UNIQUE INDEX IF NOT EXISTS universal_chat_dm_key_unique_idx
  ON universal_chat_rooms(dm_key) WHERE room_kind = 'dm';
CREATE INDEX IF NOT EXISTS universal_chat_rooms_active_idx
  ON universal_chat_rooms(active);

INSERT INTO universal_chat_rooms (room_kind, slug, title, description)
VALUES
  ('public', 'global', 'Global', 'Universal wtf.tez + hack.tez lobby'),
  ('public', 'dev', 'Dev', 'Builder and integration chat'),
  ('public', 'art', 'Art', 'Media, galleries, and drops')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS universal_chat_room_members (
  room_id INTEGER NOT NULL REFERENCES universal_chat_rooms(id) ON DELETE CASCADE,
  domain VARCHAR(255) NOT NULL REFERENCES universal_chat_identities(domain) ON DELETE CASCADE,
  joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_read_at TIMESTAMP,
  PRIMARY KEY (room_id, domain)
);
CREATE INDEX IF NOT EXISTS universal_chat_members_domain_idx
  ON universal_chat_room_members(domain);

CREATE TABLE IF NOT EXISTS universal_chat_messages (
  id BIGSERIAL PRIMARY KEY,
  room_id INTEGER NOT NULL REFERENCES universal_chat_rooms(id) ON DELETE CASCADE,
  sender_domain VARCHAR(255) NOT NULL REFERENCES universal_chat_identities(domain),
  content TEXT,
  message_type VARCHAR(24) NOT NULL DEFAULT 'text',
  media JSONB NOT NULL DEFAULT '[]'::jsonb,
  reply_to_message_id BIGINT REFERENCES universal_chat_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMP,
  deleted_at TIMESTAMP,
  deleted_by_domain VARCHAR(255),
  delete_reason TEXT,
  delete_visible BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT universal_chat_message_body CHECK (
    content IS NOT NULL OR jsonb_array_length(media) > 0
  )
);
CREATE INDEX IF NOT EXISTS universal_chat_messages_room_time_idx
  ON universal_chat_messages(room_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS universal_chat_messages_sender_idx
  ON universal_chat_messages(sender_domain);

CREATE TABLE IF NOT EXISTS universal_chat_reactions (
  message_id BIGINT NOT NULL REFERENCES universal_chat_messages(id) ON DELETE CASCADE,
  domain VARCHAR(255) NOT NULL REFERENCES universal_chat_identities(domain) ON DELETE CASCADE,
  emoji VARCHAR(32) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, domain, emoji)
);
CREATE INDEX IF NOT EXISTS universal_chat_reactions_message_idx
  ON universal_chat_reactions(message_id);

CREATE TABLE IF NOT EXISTS universal_chat_bans (
  domain VARCHAR(255) PRIMARY KEY,
  wallet_address VARCHAR(36),
  scope VARCHAR(16) NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'platform')),
  ban_type VARCHAR(16) NOT NULL CHECK (ban_type IN ('soft', 'hard')),
  reason TEXT NOT NULL,
  admin_domain VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS universal_chat_bans_wallet_idx
  ON universal_chat_bans(wallet_address) WHERE wallet_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS universal_chat_bans_expires_idx
  ON universal_chat_bans(expires_at) WHERE expires_at IS NOT NULL;
```

- [ ] **Step 2: Add Drizzle schema exports**

In `WTF combo/WTF/shared/schema.ts`, add tables after the existing DM tables. Keep `varchar` lengths aligned with the SQL above.

```ts
export const universalChatIdentities = pgTable(
  "universal_chat_identities",
  {
    domain: varchar("domain", { length: 255 }).primaryKey(),
    walletAddress: varchar("wallet_address", { length: 36 }).notNull(),
    parentDomain: varchar("parent_domain", { length: 120 }).notNull(),
    network: varchar("network", { length: 16 }).default("mainnet").notNull(),
    linkedUserId: integer("linked_user_id").references(() => users.id, { onDelete: "set null" }),
    firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  },
  (table) => [
    index("universal_chat_identity_wallet_idx").on(table.walletAddress),
    index("universal_chat_identity_parent_idx").on(table.parentDomain),
    index("universal_chat_identity_linked_user_idx").on(table.linkedUserId),
  ]
);
```

Add the same Drizzle definitions for:

```txt
universalChatUsedNonces
universalChatRooms
universalChatRoomMembers
universalChatMessages
universalChatReactions
universalChatBans
```

Use `jsonb("media").$type<Array<Record<string, unknown>>>().default(sql`'[]'::jsonb`).notNull()` for `media`.

- [ ] **Step 3: Run migration locally**

Run:

```bash
cd "WTF combo/WTF"
docker compose up -d postgres
docker compose exec -T postgres psql -U wtf -d wtf -v ON_ERROR_STOP=1 < drizzle/0042_universal_chat.sql
```

Expected:

```txt
CREATE TABLE
CREATE INDEX
INSERT 0 3
```

- [ ] **Step 4: Verify TypeScript schema**

Run:

```bash
cd "WTF combo/WTF"
npm run check
```

Expected: `tsc --noEmit` exits `0`.

- [ ] **Step 5: Commit**

```bash
cd "WTF combo/WTF"
git add drizzle/0042_universal_chat.sql shared/schema.ts
git commit -m "feat: add universal chat schema"
```

## Task 2: Add Domain Normalization and Auth Libraries

**Files:**
- Create: `WTF combo/WTF/server/lib/universal-chat/domain.ts`
- Create: `WTF combo/WTF/server/lib/universal-chat/domain.test.ts`
- Create: `WTF combo/WTF/server/lib/universal-chat/auth.ts`

- [ ] **Step 1: Create domain helpers**

Create `WTF combo/WTF/server/lib/universal-chat/domain.ts`:

```ts
const LABEL_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const FULL_DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export type UniversalChatNetwork = "mainnet" | "ghostnet";

export function networkTld(network: UniversalChatNetwork): "tez" | "gho" {
  return network === "mainnet" ? "tez" : "gho";
}

export function allowedParentDomains(network: UniversalChatNetwork): string[] {
  const raw = process.env.UNIVERSAL_CHAT_PARENT_DOMAINS || "wtf,hack";
  const tld = networkTld(network);
  const domains = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase().replace(/^\*\./, "").replace(/^\./, ""))
    .filter(Boolean)
    .map((entry) => (entry.includes(".") ? entry : `${entry}.${tld}`))
    .filter((entry) => FULL_DOMAIN_PATTERN.test(entry));
  return [...new Set(domains)];
}

export function defaultParentDomain(network: UniversalChatNetwork): string {
  return allowedParentDomains(network)[0] || `wtf.${networkTld(network)}`;
}

export function signingPrefix(network: UniversalChatNetwork): string {
  return (process.env.UNIVERSAL_CHAT_SIGNING_PREFIX || `${defaultParentDomain(network)}-chat`).trim();
}

export function normalizeChatDomain(
  input: string,
  network: UniversalChatNetwork
): { ok: true; domain: string; parentDomain: string } | { ok: false; error: string } {
  const raw = input.trim().toLowerCase();
  if (!raw) return { ok: false, error: "domain is required" };
  if (raw.length > 180) return { ok: false, error: "domain is too long" };

  if (!raw.includes(".")) {
    if (raw.length > 63 || !LABEL_PATTERN.test(raw)) {
      return { ok: false, error: "invalid label format" };
    }
    const parentDomain = defaultParentDomain(network);
    return { ok: true, domain: `${raw}.${parentDomain}`, parentDomain };
  }

  for (const parentDomain of allowedParentDomains(network)) {
    const suffix = `.${parentDomain}`;
    if (!raw.endsWith(suffix)) continue;
    const label = raw.slice(0, -suffix.length);
    if (!label.includes(".") && LABEL_PATTERN.test(label)) {
      return { ok: true, domain: raw, parentDomain };
    }
  }

  return {
    ok: false,
    error: `domain must be a label or end with ${allowedParentDomains(network).map((d) => `.${d}`).join(" / ")}`,
  };
}

export function canonicalPublicRoomSlug(input: string): string {
  const slug = input.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "global";
}

export function canonicalDmKey(domainA: string, domainB: string): string {
  return [domainA.toLowerCase(), domainB.toLowerCase()].sort().join("+");
}

export function adminDomains(network: UniversalChatNetwork): string[] {
  return allowedParentDomains(network).map((parent) => `admin.${parent}`);
}
```

- [ ] **Step 2: Test domain helpers**

Create `WTF combo/WTF/server/lib/universal-chat/domain.test.ts`:

```ts
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import {
  allowedParentDomains,
  canonicalDmKey,
  canonicalPublicRoomSlug,
  normalizeChatDomain,
  signingPrefix,
} from "./domain";

const originalParents = process.env.UNIVERSAL_CHAT_PARENT_DOMAINS;
const originalPrefix = process.env.UNIVERSAL_CHAT_SIGNING_PREFIX;

afterEach(() => {
  process.env.UNIVERSAL_CHAT_PARENT_DOMAINS = originalParents;
  process.env.UNIVERSAL_CHAT_SIGNING_PREFIX = originalPrefix;
});

test("allowedParentDomains expands labels with the network tld", () => {
  process.env.UNIVERSAL_CHAT_PARENT_DOMAINS = "wtf,hack.tez";
  assert.deepEqual(allowedParentDomains("mainnet"), ["wtf.tez", "hack.tez"]);
});

test("normalizeChatDomain defaults bare labels to the first parent", () => {
  process.env.UNIVERSAL_CHAT_PARENT_DOMAINS = "wtf,hack";
  assert.deepEqual(normalizeChatDomain("alice", "mainnet"), {
    ok: true,
    domain: "alice.wtf.tez",
    parentDomain: "wtf.tez",
  });
});

test("normalizeChatDomain accepts cross-parent direct targets", () => {
  process.env.UNIVERSAL_CHAT_PARENT_DOMAINS = "wtf,hack";
  assert.deepEqual(normalizeChatDomain("bob.hack.tez", "mainnet"), {
    ok: true,
    domain: "bob.hack.tez",
    parentDomain: "hack.tez",
  });
});

test("canonicalDmKey is deterministic", () => {
  assert.equal(canonicalDmKey("bob.hack.tez", "alice.wtf.tez"), "alice.wtf.tez+bob.hack.tez");
});

test("canonicalPublicRoomSlug normalizes room names", () => {
  assert.equal(canonicalPublicRoomSlug("Dev Room!"), "dev-room");
});

test("signingPrefix defaults from first parent", () => {
  process.env.UNIVERSAL_CHAT_PARENT_DOMAINS = "wtf,hack";
  delete process.env.UNIVERSAL_CHAT_SIGNING_PREFIX;
  assert.equal(signingPrefix("mainnet"), "wtf.tez-chat");
});
```

Run:

```bash
cd "WTF combo/WTF"
node --test --import tsx server/lib/universal-chat/domain.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Create auth helpers**

Create `WTF combo/WTF/server/lib/universal-chat/auth.ts` with these exports:

```ts
import { SignJWT, jwtVerify } from "jose";
import { getPkhfromPk, verifySignature } from "@taquito/utils";
import { db } from "../../db";
import { universalChatUsedNonces } from "@shared/schema";
import { and, eq, lt } from "drizzle-orm";
import type { UniversalChatNetwork } from "./domain";
import { signingPrefix } from "./domain";

const TOKEN_TTL = "24h";
const TIMESTAMP_WINDOW_MS = 5 * 60 * 1000;

export interface UniversalChatClaims {
  address: string;
  domains: string[];
  activeDomain: string | null;
  network: UniversalChatNetwork;
}

function jwtSecret(): Uint8Array {
  const secret = process.env.UNIVERSAL_CHAT_JWT_SECRET || process.env.SESSION_SECRET || "";
  if (!secret) throw new Error("UNIVERSAL_CHAT_JWT_SECRET or SESSION_SECRET is required");
  return new TextEncoder().encode(secret);
}

function packMichelineString(str: string): string {
  const bytes = new TextEncoder().encode(str);
  const lenHex = bytes.length.toString(16).padStart(8, "0");
  return `0501${lenHex}${Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function buildChallengeMessage(network: UniversalChatNetwork, timestamp: number, nonce: string): string {
  return `${signingPrefix(network)}:${timestamp}:${nonce}`;
}

export async function verifyWalletChallenge(params: {
  network: UniversalChatNetwork;
  address: string;
  publicKey: string;
  signature: string;
  timestamp: number;
  nonce: string;
}): Promise<boolean> {
  const timestampMs = params.timestamp < 1_000_000_000_000 ? params.timestamp * 1000 : params.timestamp;
  if (Math.abs(Date.now() - timestampMs) > TIMESTAMP_WINDOW_MS) return false;
  if (!/^[A-Fa-f0-9]{8,128}$/.test(params.nonce)) return false;
  if (getPkhfromPk(params.publicKey) !== params.address) return false;

  const existing = await db
    .select({ nonce: universalChatUsedNonces.nonce })
    .from(universalChatUsedNonces)
    .where(
      and(
        eq(universalChatUsedNonces.nonce, params.nonce),
        eq(universalChatUsedNonces.walletAddress, params.address)
      )
    )
    .limit(1);
  if (existing.length > 0) return false;

  const message = buildChallengeMessage(params.network, params.timestamp, params.nonce);
  const ok = verifySignature(packMichelineString(message), params.publicKey, params.signature);
  if (!ok) return false;

  await db.delete(universalChatUsedNonces).where(lt(universalChatUsedNonces.expiresAt, new Date()));
  await db.insert(universalChatUsedNonces).values({
    nonce: params.nonce,
    walletAddress: params.address,
    signingPrefix: signingPrefix(params.network),
    expiresAt: new Date(Date.now() + TIMESTAMP_WINDOW_MS),
  });
  return true;
}

export async function signChatJwt(claims: UniversalChatClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(jwtSecret());
}

export async function verifyChatJwt(token: string): Promise<UniversalChatClaims | null> {
  try {
    const verified = await jwtVerify(token, jwtSecret(), { algorithms: ["HS256"] });
    return verified.payload as unknown as UniversalChatClaims;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run checks**

```bash
cd "WTF combo/WTF"
node --test --import tsx server/lib/universal-chat/domain.test.ts
npm run check
```

Expected: tests and TypeScript pass.

- [ ] **Step 5: Commit**

```bash
cd "WTF combo/WTF"
git add server/lib/universal-chat/domain.ts server/lib/universal-chat/domain.test.ts server/lib/universal-chat/auth.ts
git commit -m "feat: add universal chat auth helpers"
```

## Task 3: Add Repository and REST API

**Files:**
- Create: `WTF combo/WTF/server/lib/universal-chat/repository.ts`
- Create: `WTF combo/WTF/server/routes/universal-chat.ts`
- Modify: `WTF combo/WTF/server/routes.ts`

- [ ] **Step 1: Add repository functions**

Create `WTF combo/WTF/server/lib/universal-chat/repository.ts` with focused functions:

```ts
export async function upsertIdentitiesForWallet(params: {
  address: string;
  domains: Array<{ domain: string; parentDomain: string }>;
  network: "mainnet" | "ghostnet";
}): Promise<void>;

export async function listPublicRooms(): Promise<Array<{ id: number; slug: string; title: string; description: string | null }>>;

export async function ensureDmRoom(domainA: string, domainB: string): Promise<{ id: number; dmKey: string }>;

export async function listDmRoomsForDomains(domains: string[]): Promise<Array<{
  roomId: number;
  dmKey: string;
  peerDomain: string;
  lastMessage: string | null;
  lastMessageAt: Date | null;
  unreadCount: number;
}>>;

export async function readRoomHistory(params: {
  roomId: number;
  beforeId?: number;
  limit: number;
}): Promise<{ messages: UniversalChatMessageDto[]; hasMore: boolean }>;

export async function searchIdentities(q: string, limit: number): Promise<Array<{ domain: string; walletAddress: string; linkedUserId: number | null }>>;
```

Use Drizzle for simple selects/inserts. Use raw SQL for the DM list query because it needs latest-message and unread aggregation, matching the pattern already used in `server/routes/messages.ts`.

- [ ] **Step 2: Add REST routes**

Create `WTF combo/WTF/server/routes/universal-chat.ts`:

```ts
import { Router } from "express";
import { z } from "zod";
import { getOwnedDomains } from "../lib/universal-chat/tezos-domains";
import { normalizeChatDomain, networkTld } from "../lib/universal-chat/domain";
import { signChatJwt, verifyChatJwt, verifyWalletChallenge } from "../lib/universal-chat/auth";
import {
  ensureDmRoom,
  listDmRoomsForDomains,
  listPublicRooms,
  readRoomHistory,
  searchIdentities,
  upsertIdentitiesForWallet,
} from "../lib/universal-chat/repository";

const router = Router();

const authBody = z.object({
  address: z.string().min(10).max(80),
  publicKey: z.string().min(20).max(120),
  signature: z.string().min(20).max(200),
  timestamp: z.number().int().positive(),
  nonce: z.string().min(8).max(128),
  network: z.enum(["mainnet", "ghostnet"]).optional(),
});

router.post("/api/universal-chat/auth", async (req, res) => {
  const parsed = authBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid auth body" });
  const network = parsed.data.network || (process.env.TEZOS_NETWORK === "ghostnet" ? "ghostnet" : "mainnet");
  const ok = await verifyWalletChallenge({ ...parsed.data, network });
  if (!ok) return res.status(401).json({ error: "Invalid signature or replayed nonce" });

  const domains = await getOwnedDomains(parsed.data.address, network);
  await upsertIdentitiesForWallet({ address: parsed.data.address, domains, network });
  const activeDomain = domains[0]?.domain ?? null;
  const token = await signChatJwt({
    address: parsed.data.address,
    domains: domains.map((d) => d.domain),
    activeDomain,
    network,
  });
  res.json({ token, domains: domains.map((d) => d.domain), activeDomain });
});
```

Add the remaining routes:

```txt
POST /api/universal-chat/auth/refresh
GET /api/universal-chat/rooms
GET /api/universal-chat/rooms/:slug/history
POST /api/universal-chat/dms
GET /api/universal-chat/dms
GET /api/universal-chat/dms/:dmKey/history
GET /api/universal-chat/identities/search
```

Every route except `/auth` must call a local `requireChatJwt(req)` helper that accepts `Authorization: Bearer <token>` and optional `X-Active-Domain` if that domain is present in the JWT `domains` array.

- [ ] **Step 3: Register the route**

In `WTF combo/WTF/server/routes.ts`, import and mount the new router next to other route modules:

```ts
import universalChatRouter from "./routes/universal-chat";
```

Then register:

```ts
app.use(universalChatRouter);
```

- [ ] **Step 4: Add a Tezos Domains lookup module**

Create `WTF combo/WTF/server/lib/universal-chat/tezos-domains.ts` by porting the Node-free logic from `WTF combo/wtf tez/wtf.tez/chat/src/auth/domains.ts`, but return parent metadata:

```ts
export async function getOwnedDomains(
  address: string,
  network: "mainnet" | "ghostnet"
): Promise<Array<{ domain: string; parentDomain: string }>> {
  // Query Tezos Domains GraphQL once per allowed parent domain.
  // Filter through normalizeChatDomain so only configured parents are returned.
}
```

- [ ] **Step 5: Run checks**

```bash
cd "WTF combo/WTF"
npm run check
```

Expected: TypeScript passes.

- [ ] **Step 6: Commit**

```bash
cd "WTF combo/WTF"
git add server/lib/universal-chat server/routes/universal-chat.ts server/routes.ts
git commit -m "feat: add universal chat rest api"
```

## Task 4: Add Universal Chat WebSocket Server

**Files:**
- Create: `WTF combo/WTF/server/universal-chat-websocket.ts`
- Modify: `WTF combo/WTF/server/index.ts`

- [ ] **Step 1: Implement `/ws/universal-chat`**

Create `WTF combo/WTF/server/universal-chat-websocket.ts` with a separate `WebSocketServer`:

```ts
import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { verifyChatJwt } from "./lib/universal-chat/auth";
import { canonicalDmKey, canonicalPublicRoomSlug } from "./lib/universal-chat/domain";
import {
  appendMessage,
  ensureDmRoom,
  getPublicRoomBySlug,
  markRoomRead,
  readRoomHistory,
  userCanJoinRoom,
} from "./lib/universal-chat/repository";

interface UniversalClient {
  ws: WebSocket;
  domain: string;
  domains: string[];
  roomKey: string;
  roomId: number;
}

const clients = new Set<UniversalClient>();

export function setupUniversalChatWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws/universal-chat" });
  wss.on("connection", (ws, req) => {
    void handleConnection(ws, req.url || "/");
  });
}
```

The `handleConnection` logic must:

```txt
1. Read `token`, `room`, and optional `activeDomain` from the query string.
2. Verify the JWT with `verifyChatJwt`.
3. Select `activeDomain` only if it is in `claims.domains`.
4. Resolve room:
   - `global` or `room:<slug>` -> public room slug
   - `dm:<domainA>+<domainB>` -> deterministic DM, require active domain is one participant
5. Send `{ type: "connected", domain, room }`.
6. Send recent history from `readRoomHistory`.
7. Accept inbound `{ type: "message", content, media, replyTo }`.
8. Persist via `appendMessage`, then broadcast persisted message DTO to all clients in the same room.
9. Accept `{ type: "read" }` and update `last_read_at`.
10. Accept `{ type: "ping" }` and respond `{ type: "pong" }`.
```

Use a room broadcast helper:

```ts
function broadcastRoom(roomId: number, payload: Record<string, unknown>) {
  const raw = JSON.stringify(payload);
  for (const client of clients) {
    if (client.roomId === roomId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(raw);
    }
  }
}
```

- [ ] **Step 2: Wire the server**

In `WTF combo/WTF/server/index.ts`, find the existing `setupWebSocket(server)` call and add:

```ts
import { setupUniversalChatWebSocket } from "./universal-chat-websocket";

setupWebSocket(server);
setupUniversalChatWebSocket(server);
```

- [ ] **Step 3: Run checks**

```bash
cd "WTF combo/WTF"
npm run check
```

Expected: TypeScript passes.

- [ ] **Step 4: Commit**

```bash
cd "WTF combo/WTF"
git add server/universal-chat-websocket.ts server/index.ts server/lib/universal-chat/repository.ts
git commit -m "feat: host universal chat websocket"
```

## Task 5: Add WTF Platform Client Surface

**Files:**
- Create: `WTF combo/WTF/client/src/lib/universal-chat-client.ts`
- Create: `WTF combo/WTF/client/src/pages/UniversalChat.tsx`
- Modify: `WTF combo/WTF/client/src/App.tsx`

- [ ] **Step 1: Add browser API client**

Create `WTF combo/WTF/client/src/lib/universal-chat-client.ts`:

```ts
const API_BASE = "";

export async function universalChatAuth(input: {
  address: string;
  publicKey: string;
  signature: string;
  timestamp: number;
  nonce: string;
}) {
  const res = await fetch(`${API_BASE}/api/universal-chat/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ ...input, network: "mainnet" }),
  });
  if (!res.ok) throw new Error("Universal chat authentication failed");
  return res.json() as Promise<{ token: string; domains: string[]; activeDomain: string | null }>;
}

export function openUniversalChatSocket(params: {
  token: string;
  room: string;
  activeDomain: string;
}): WebSocket {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(`${protocol}//${window.location.host}/ws/universal-chat`);
  url.searchParams.set("token", params.token);
  url.searchParams.set("room", params.room);
  url.searchParams.set("activeDomain", params.activeDomain);
  return new WebSocket(url);
}
```

- [ ] **Step 2: Add the platform window**

Create `WTF combo/WTF/client/src/pages/UniversalChat.tsx`. The first version should:

```txt
1. Require logged-in WTF user.
2. Ask the user to connect/sign with a linked Tezos wallet using the existing wallet context.
3. Call `/api/universal-chat/auth`.
4. Let the user choose one returned domain.
5. Show tabs for `global`, `dev`, `art`, and DMs.
6. Open `openUniversalChatSocket`.
7. Render messages and send plain text.
```

Keep the first platform client plain-text only. Media, reactions, moderation, and push are preserved for registrar clients and can be added to the platform surface after cutover.

- [ ] **Step 3: Register a desktop app route**

In `WTF combo/WTF/client/src/App.tsx`, add a lazy import and route definition matching existing page patterns:

```ts
const UniversalChat = lazy(() => import("./pages/UniversalChat"));
```

Add page metadata:

```ts
{
  path: "/universal-chat",
  title: "Universal Chat",
  component: UniversalChat,
  auth: true,
}
```

- [ ] **Step 4: Run checks**

```bash
cd "WTF combo/WTF"
npm run check
```

Expected: TypeScript passes.

- [ ] **Step 5: Commit**

```bash
cd "WTF combo/WTF"
git add client/src/lib/universal-chat-client.ts client/src/pages/UniversalChat.tsx client/src/App.tsx
git commit -m "feat: add universal chat platform window"
```

## Task 6: Switch `wtf.tez` to Universal Transport

**Files:**
- Modify: `WTF combo/wtf tez/wtf.tez/src/config/tezos.ts`
- Create: `WTF combo/wtf tez/wtf.tez/src/lib/universalChatTransport.ts`
- Modify: `WTF combo/wtf tez/wtf.tez/src/hooks/useChat.ts`
- Modify: `WTF combo/wtf tez/wtf.tez/src/hooks/useDM.ts`
- Modify: `WTF combo/wtf tez/wtf.tez/src/hooks/useDMList.ts`
- Modify: `WTF combo/wtf tez/wtf.tez/.env.example`

- [ ] **Step 1: Add env config**

In `src/config/tezos.ts`, add:

```ts
export const universalChatApiUrl: string =
  (import.meta.env.VITE_UNIVERSAL_CHAT_API_URL || hackchatUrl).trim().replace(/\/+$/, "");

export const universalChatWsUrl: string =
  (import.meta.env.VITE_UNIVERSAL_CHAT_WS_URL || "").trim().replace(/\/+$/, "");

export const useUniversalChatTransport: boolean =
  Boolean(universalChatWsUrl || import.meta.env.VITE_UNIVERSAL_CHAT_API_URL);
```

- [ ] **Step 2: Add native WebSocket adapter**

Create `src/lib/universalChatTransport.ts`:

```ts
import { universalChatWsUrl } from "../config/tezos";

export function createUniversalChatSocket(params: {
  token: string;
  room: string;
  activeDomain: string;
}): WebSocket {
  const base = universalChatWsUrl || "wss://wtfgameshow.app/ws/universal-chat";
  const url = new URL(base);
  url.searchParams.set("token", params.token);
  url.searchParams.set("room", params.room);
  url.searchParams.set("activeDomain", params.activeDomain);
  return new WebSocket(url);
}

export function universalDmRoom(domainA: string, domainB: string): string {
  return `dm:${[domainA.toLowerCase(), domainB.toLowerCase()].sort().join("+")}`;
}
```

- [ ] **Step 3: Update `useChat`**

In `src/hooks/useChat.ts`, keep the PartySocket path as fallback. When `useUniversalChatTransport` is true, use:

```ts
const ws = createUniversalChatSocket({
  token,
  room: "global",
  activeDomain,
});
```

Normalize native WebSocket API differences:

```ts
function sendSocket(ws: WebSocket | PartySocket, payload: Record<string, unknown>) {
  ws.send(JSON.stringify(payload));
}
```

Keep existing message handlers for `message`, `history`, `presence`, `typing`, `message-edited`, `reaction-update`, `message-deleted`, and `error`.

- [ ] **Step 4: Update `useDM`**

In `src/hooks/useDM.ts`, for universal transport open:

```ts
const ws = createUniversalChatSocket({
  token,
  room: roomId.startsWith("dm:") ? roomId : `dm:${roomId}`,
  activeDomain,
});
```

Keep PartyKit fallback unchanged.

- [ ] **Step 5: Update `useDMList`**

When universal transport is enabled, fetch:

```ts
fetch(`${universalChatApiUrl}/api/universal-chat/dms`, {
  headers: {
    Authorization: `Bearer ${token}`,
    "X-Active-Domain": activeDomain,
  },
});
```

Map the response into the existing `DMConversation` shape:

```ts
{
  roomId: `dm:${row.dmKey}`,
  ownDomain: activeDomain,
  peerDomain: row.peerDomain,
  lastMessage: row.lastMessage,
  lastMessageAt: row.lastMessageAt,
  unreadCount: row.unreadCount,
}
```

- [ ] **Step 6: Update auth endpoint**

In `WTF combo/wtf tez/wtf.tez/src/context/TezosContext.tsx`, replace chat auth fetches with `universalChatApiUrl` when `useUniversalChatTransport` is true:

```ts
const authBase = useUniversalChatTransport ? universalChatApiUrl : hackchatUrl;
const res = await fetch(`${authBase}/api/universal-chat/auth`, ...);
```

For fallback, keep the current `${hackchatUrl}/auth` path.

- [ ] **Step 7: Add env examples**

In `WTF combo/wtf tez/wtf.tez/.env.example`, add:

```bash
VITE_UNIVERSAL_CHAT_API_URL=https://wtfgameshow.app
VITE_UNIVERSAL_CHAT_WS_URL=wss://wtfgameshow.app/ws/universal-chat
VITE_CHAT_PARENT_DOMAINS=wtf,hack
VITE_CHAT_SIGNING_PREFIX=wtf.tez-chat
```

- [ ] **Step 8: Verify locally**

Run:

```bash
cd "WTF combo/wtf tez/wtf.tez"
npm run build
```

Expected: production build exits `0`.

- [ ] **Step 9: Commit**

```bash
cd "WTF combo/wtf tez/wtf.tez"
git add src/config/tezos.ts src/lib/universalChatTransport.ts src/hooks/useChat.ts src/hooks/useDM.ts src/hooks/useDMList.ts src/context/TezosContext.tsx .env.example
git commit -m "feat: point wtf tez chat at universal transport"
```

## Task 7: Apply Registrar Transport to `hack-tez`

**Files:**
- Modify corresponding files under `WTF combo/wtf tez/hack-tez/`

- [ ] **Step 1: Copy the verified transport changes**

After Task 6 passes, apply the same config, transport, hook, and auth-base changes to:

```txt
WTF combo/wtf tez/hack-tez/src/config/tezos.ts
WTF combo/wtf tez/hack-tez/src/lib/universalChatTransport.ts
WTF combo/wtf tez/hack-tez/src/hooks/useChat.ts
WTF combo/wtf tez/hack-tez/src/hooks/useDM.ts
WTF combo/wtf tez/hack-tez/src/hooks/useDMList.ts
WTF combo/wtf tez/hack-tez/src/context/TezosContext.tsx
WTF combo/wtf tez/hack-tez/.env.example
```

- [ ] **Step 2: Keep hack defaults hack-first**

Use:

```bash
VITE_UNIVERSAL_CHAT_API_URL=https://wtfgameshow.app
VITE_UNIVERSAL_CHAT_WS_URL=wss://wtfgameshow.app/ws/universal-chat
VITE_CHAT_PARENT_DOMAINS=hack,wtf
VITE_CHAT_SIGNING_PREFIX=wtf.tez-chat
```

The signing prefix must match the server. The default identity order can still be hack-first by setting `VITE_CHAT_PARENT_DOMAINS=hack,wtf`.

- [ ] **Step 3: Verify build**

```bash
cd "WTF combo/wtf tez/hack-tez"
npm run build
```

Expected: production build exits `0`.

- [ ] **Step 4: Commit**

```bash
cd "WTF combo/wtf tez/hack-tez"
git add src/config/tezos.ts src/lib/universalChatTransport.ts src/hooks/useChat.ts src/hooks/useDM.ts src/hooks/useDMList.ts src/context/TezosContext.tsx .env.example
git commit -m "feat: point hack tez chat at universal transport"
```

## Task 8: Update Hetzner Deployment Configuration

**Files:**
- Modify: `WTF combo/WTF/.env.example`
- Modify: `WTF combo/WTF/README.md`
- Optionally modify: `WTF combo/WTF/Caddyfile`

- [ ] **Step 1: Add environment variables**

In `WTF combo/WTF/.env.example`, add:

```bash
# -----------------------------------------------------------------------------
# UNIVERSAL CHAT -- Tezos-domain chat bridge for wtf.tez + hack.tez
# -----------------------------------------------------------------------------
UNIVERSAL_CHAT_JWT_SECRET=
UNIVERSAL_CHAT_PARENT_DOMAINS=wtf,hack
UNIVERSAL_CHAT_SIGNING_PREFIX=wtf.tez-chat
UNIVERSAL_CHAT_RATE_LIMIT_WINDOW_MS=30000
UNIVERSAL_CHAT_RATE_LIMIT_MAX=10
```

- [ ] **Step 2: Confirm Caddy**

`WTF combo/WTF/Caddyfile` already proxies WebSocket upgrades to `app:3000`. No change is required for `/ws/universal-chat`.

Only add a dedicated subdomain if operators want `chat.wtfgameshow.app`:

```caddy
chat.wtfgameshow.app {
  encode gzip zstd
  reverse_proxy app:3000 {
    header_up X-Real-IP {remote_host}
    header_up X-Forwarded-For {remote_host}
    header_up X-Forwarded-Proto {scheme}
  }
}
```

- [ ] **Step 3: Document production cutover**

In `WTF combo/WTF/README.md`, add a "Universal Chat" deployment note:

```md
### Universal Chat

The WTF server hosts the cross-domain chat API at `/api/universal-chat/*`
and WebSocket runtime at `/ws/universal-chat`. Production registrar builds
should point at:

- `VITE_UNIVERSAL_CHAT_API_URL=https://wtfgameshow.app`
- `VITE_UNIVERSAL_CHAT_WS_URL=wss://wtfgameshow.app/ws/universal-chat`
- `VITE_CHAT_PARENT_DOMAINS=wtf,hack` for wtf.tez
- `VITE_CHAT_PARENT_DOMAINS=hack,wtf` for hack.tez
- `VITE_CHAT_SIGNING_PREFIX=wtf.tez-chat`
```

- [ ] **Step 4: Commit**

```bash
cd "WTF combo/WTF"
git add .env.example README.md Caddyfile
git commit -m "docs: document universal chat deployment"
```

## Task 9: Local End-to-End Verification

**Files:**
- No production files unless tests expose a defect.

- [ ] **Step 1: Start WTF app**

```bash
cd "WTF combo/WTF"
docker compose up -d postgres
npm run dev
```

Expected:

```txt
serving on port 3000
```

- [ ] **Step 2: Apply DB migration**

```bash
cd "WTF combo/WTF"
docker compose exec -T postgres psql -U wtf -d wtf -v ON_ERROR_STOP=1 < drizzle/0042_universal_chat.sql
```

Expected: no SQL errors.

- [ ] **Step 3: Run static checks**

```bash
cd "WTF combo/WTF"
node --test --import tsx server/lib/universal-chat/domain.test.ts
npm run check
```

Expected: tests pass and TypeScript exits `0`.

- [ ] **Step 4: Build registrar clients**

```bash
cd "WTF combo/wtf tez/wtf.tez"
npm run build
cd "../hack-tez"
npm run build
```

Expected: both builds exit `0`.

- [ ] **Step 5: Browser smoke with Browser Use**

Use the in-app browser against:

```txt
http://localhost:3000/universal-chat
```

Verify:

```txt
1. Page renders inside the desktop shell.
2. Wallet-sign authentication can start.
3. A signed-in domain can open global chat.
4. Sending a message appends it without a full page reload.
5. A second browser/session can receive the message through WebSocket.
```

- [ ] **Step 6: Commit verification fixes**

Only if local verification required code changes:

```bash
git add <changed-files>
git commit -m "fix: stabilize universal chat local verification"
```

## Task 10: Hetzner Cutover

**Files:**
- Production environment on `wtfgameshow.app`
- Registrar deployment environment for `wtf.tez` and `hack.tez`

- [ ] **Step 1: Prepare production `.env` on Hetzner**

SSH to the Hetzner host and set:

```bash
cd /opt/platform/repos/wtf-app
grep -q '^UNIVERSAL_CHAT_JWT_SECRET=' .env || printf '\nUNIVERSAL_CHAT_JWT_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env
grep -q '^UNIVERSAL_CHAT_PARENT_DOMAINS=' .env || printf 'UNIVERSAL_CHAT_PARENT_DOMAINS=wtf,hack\n' >> .env
grep -q '^UNIVERSAL_CHAT_SIGNING_PREFIX=' .env || printf 'UNIVERSAL_CHAT_SIGNING_PREFIX=wtf.tez-chat\n' >> .env
```

- [ ] **Step 2: Deploy WTF server**

Use the existing GitHub workflow or manual flow:

```bash
cd /opt/platform/repos/wtf-app
git pull
docker compose up -d --build
docker compose exec -T postgres psql -U wtf -d wtf -v ON_ERROR_STOP=1 < drizzle/0042_universal_chat.sql
docker compose restart app
```

- [ ] **Step 3: Health check**

```bash
curl -sf https://wtfgameshow.app/api/health
curl -sf https://wtfgameshow.app/api/universal-chat/rooms
```

Expected:

```json
{"status":"ok"}
```

and a rooms payload containing `global`, `dev`, and `art`.

- [ ] **Step 4: Deploy registrar frontends with universal chat env**

For `wtf.tez`:

```bash
VITE_UNIVERSAL_CHAT_API_URL=https://wtfgameshow.app
VITE_UNIVERSAL_CHAT_WS_URL=wss://wtfgameshow.app/ws/universal-chat
VITE_CHAT_PARENT_DOMAINS=wtf,hack
VITE_CHAT_SIGNING_PREFIX=wtf.tez-chat
npm run build
```

For `hack.tez`:

```bash
VITE_UNIVERSAL_CHAT_API_URL=https://wtfgameshow.app
VITE_UNIVERSAL_CHAT_WS_URL=wss://wtfgameshow.app/ws/universal-chat
VITE_CHAT_PARENT_DOMAINS=hack,wtf
VITE_CHAT_SIGNING_PREFIX=wtf.tez-chat
npm run build
```

- [ ] **Step 5: Production smoke**

Verify with two wallets/domains:

```txt
1. `alice.wtf.tez` sends in Global from wtf.tez.
2. `bob.hack.tez` sees the message in Global from hack.tez.
3. `bob.hack.tez` starts a DM to `alice.wtf.tez`.
4. `alice.wtf.tez` sees the DM in wtf.tez and on wtfgameshow.app Universal Chat.
5. Refresh both browsers; history persists.
6. Disconnect one browser; the other remains connected.
```

- [ ] **Step 6: Rollback switch**

Keep these fallback envs available for one deploy cycle:

```bash
VITE_UNIVERSAL_CHAT_API_URL=
VITE_UNIVERSAL_CHAT_WS_URL=
VITE_WTFCHAT_URL=<previous worker url>
VITE_PARTYKIT_HOST=<previous partykit host>
```

Rollback means redeploying registrar frontends with the fallback values. Do not drop Postgres universal chat tables after rollback; they are additive and harmless.

## Self-Review

### Spec coverage

- Connect `wtf.tez` chat to `hack.tez` chat: covered by canonical domain identity, shared Postgres backend, shared WS endpoint, and registrar env cutover.
- Universal chat rooms: covered by `universal_chat_rooms` public rooms and `/api/universal-chat/rooms`.
- Direct messaging: covered by deterministic `dm_key`, DM room creation/list/history, and `/ws/universal-chat?room=dm:*`.
- WTF platform connection: covered by the Universal Chat desktop window and shared Hetzner API/WS runtime.
- Hetzner deployment: covered by Docker/Caddy/env/migration/deploy tasks.

### Type consistency

- Domain identity is always `domain` as a full lower-case Tezos domain.
- Public rooms use `slug`.
- DMs use `dmKey` in REST and `dm:<dmKey>` in WebSocket query params.
- JWT claims use `address`, `domains`, `activeDomain`, and `network`.

### Risk notes

- The first release intentionally keeps universal chat separate from existing WTF `dm_messages`; this avoids corrupting or overloading web2 platform DMs.
- Moderation from hackchat should be ported after the base universal transport is stable. The schema already includes bans and deletion fields.
- Push subscriptions from Worker/D1 are not included in the first Hetzner release. Browser notifications can be reintroduced once room and DM delivery are proven.
