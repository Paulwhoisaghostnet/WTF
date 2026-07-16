import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../../db";
import { objktOperatorStates } from "@shared/schema";
import {
  DEFAULT_OBJKT_OPERATOR_SESSION,
  DEFAULT_OBJKT_OPERATOR_SETTINGS,
  defaultObjktOperatorState,
  type ObjktOperatorEvent,
  type ObjktOperatorState,
} from "@shared/objkt-operator";

type DbLike = typeof db;
type StatePatch = Partial<Pick<
  ObjktOperatorState,
  "walletAddress" | "settings" | "creators" | "scan" | "queue" | "session" | "events"
>>;

function rowToState(row: typeof objktOperatorStates.$inferSelect): ObjktOperatorState {
  return {
    version: row.version,
    walletAddress: row.walletAddress,
    settings: { ...DEFAULT_OBJKT_OPERATOR_SETTINGS, ...(row.settings || {}) },
    creators: Array.isArray(row.creators) ? row.creators : [],
    scan: row.scan || null,
    queue: Array.isArray(row.queue) ? row.queue : [],
    session: { ...DEFAULT_OBJKT_OPERATOR_SESSION, ...(row.session || {}) },
    events: Array.isArray(row.events) ? row.events : [],
    createdAt: row.createdAt?.toISOString() || null,
    updatedAt: row.updatedAt?.toISOString() || null,
  };
}

export async function loadObjktOperatorState(
  userId: number,
  database: DbLike = db,
): Promise<ObjktOperatorState> {
  const [existing] = await database
    .select()
    .from(objktOperatorStates)
    .where(eq(objktOperatorStates.userId, userId))
    .limit(1);
  if (existing) return rowToState(existing);

  const defaults = defaultObjktOperatorState();
  const [created] = await database
    .insert(objktOperatorStates)
    .values({
      userId,
      settings: defaults.settings,
      creators: defaults.creators,
      scan: defaults.scan,
      queue: defaults.queue,
      session: defaults.session,
      events: defaults.events,
    })
    .onConflictDoNothing({ target: objktOperatorStates.userId })
    .returning();
  if (created) return rowToState(created);

  const [raced] = await database
    .select()
    .from(objktOperatorStates)
    .where(eq(objktOperatorStates.userId, userId))
    .limit(1);
  if (!raced) throw new Error("Failed to initialize Objkt Operator state");
  return rowToState(raced);
}

export async function patchObjktOperatorState(
  userId: number,
  patch: StatePatch,
  database: DbLike = db,
): Promise<ObjktOperatorState> {
  await loadObjktOperatorState(userId, database);
  const [updated] = await database
    .update(objktOperatorStates)
    .set({
      ...patch,
      version: sql`${objktOperatorStates.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(objktOperatorStates.userId, userId))
    .returning();
  if (!updated) throw new Error("Failed to persist Objkt Operator state");
  return rowToState(updated);
}

export function operatorEvent(
  type: ObjktOperatorEvent["type"],
  message: string,
  href?: string,
): ObjktOperatorEvent {
  return {
    id: randomUUID(),
    at: new Date().toISOString(),
    type,
    message,
    ...(href ? { href } : {}),
  };
}

export function appendOperatorEvent(
  state: ObjktOperatorState,
  event: ObjktOperatorEvent,
) {
  return [event, ...state.events].slice(0, 100);
}
