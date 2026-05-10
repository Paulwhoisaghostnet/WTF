import { createHash } from "node:crypto";

export type CasinoAuditSeverity = "info" | "warning" | "rejection" | "settlement";

export type CasinoAuditEvent = {
  id: string;
  atMs: number;
  gameKey: string;
  scope: string;
  action: string;
  actorHash: string | null;
  severity: CasinoAuditSeverity;
  message: string;
  payloadHash: string;
  previousHash: string;
  eventHash: string;
};

export type CasinoAuditJournal = {
  latestHash: string;
  eventCount: number;
  events: CasinoAuditEvent[];
};

export type CasinoAuditSummary = {
  latestHash: string;
  eventCount: number;
  retainedEventCount: number;
  events: CasinoAuditEvent[];
};

export type CasinoAuditEventInput = {
  atMs: number;
  gameKey: string;
  scope: string;
  action: string;
  actorId?: string | null;
  severity?: CasinoAuditSeverity;
  message: string;
  payload?: unknown;
};

const INITIAL_AUDIT_SEED = "wtf-casino-audit:v1";
const DEFAULT_MAX_EVENTS = 80;

function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

function normalizeAuditValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((entry) => normalizeAuditValue(entry, seen));
  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const source = value as Record<string, unknown>;
    return Object.keys(source)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = normalizeAuditValue(source[key], seen);
        return acc;
      }, {});
  }
  return String(value);
}

export function stableCasinoAuditJson(value: unknown) {
  return JSON.stringify(normalizeAuditValue(value));
}

export function hashCasinoPayload(payload: unknown) {
  return sha256(stableCasinoAuditJson(payload));
}

export function hashCasinoActor(actorId: string | number | null | undefined) {
  if (actorId == null) return null;
  const raw = String(actorId).trim();
  if (!raw) return null;
  return sha256(`casino-actor:${raw}`).slice(0, 16);
}

export function createCasinoAuditJournal(seed = INITIAL_AUDIT_SEED): CasinoAuditJournal {
  return {
    latestHash: sha256(seed),
    eventCount: 0,
    events: [],
  };
}

function compact(input: string, maxLength = 240) {
  return input.trim().slice(0, maxLength);
}

function idSafe(input: string) {
  return compact(input, 80).replace(/[^a-zA-Z0-9:_-]+/g, "_") || "event";
}

export function appendCasinoAuditEvent(
  journal: CasinoAuditJournal,
  input: CasinoAuditEventInput,
  maxEvents = DEFAULT_MAX_EVENTS
): CasinoAuditJournal {
  const previousHash = journal.latestHash;
  const actorHash = hashCasinoActor(input.actorId);
  const payloadHash = hashCasinoPayload(input.payload ?? null);
  const eventSeed = {
    action: compact(input.action, 80),
    actorHash,
    atMs: input.atMs,
    gameKey: compact(input.gameKey, 80),
    message: compact(input.message),
    payloadHash,
    previousHash,
    scope: compact(input.scope, 120),
    severity: input.severity ?? "info",
  };
  const eventHash = hashCasinoPayload(eventSeed);
  const event: CasinoAuditEvent = {
    id: `${idSafe(eventSeed.gameKey)}:${idSafe(eventSeed.action)}:${input.atMs}:${eventHash.slice(0, 10)}`,
    atMs: input.atMs,
    gameKey: eventSeed.gameKey,
    scope: eventSeed.scope,
    action: eventSeed.action,
    actorHash,
    severity: eventSeed.severity,
    message: eventSeed.message,
    payloadHash,
    previousHash,
    eventHash,
  };
  const retained = Math.max(0, maxEvents);
  return {
    latestHash: eventHash,
    eventCount: journal.eventCount + 1,
    events: [event, ...journal.events].slice(0, retained),
  };
}

export function summarizeCasinoAuditJournal(
  journal: CasinoAuditJournal,
  limit = 12
): CasinoAuditSummary {
  return {
    latestHash: journal.latestHash,
    eventCount: journal.eventCount,
    retainedEventCount: journal.events.length,
    events: journal.events.slice(0, Math.max(0, limit)),
  };
}
