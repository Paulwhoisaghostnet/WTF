import { and, asc, desc, eq } from "drizzle-orm";
import { appKeys, appRegistrations, type AppRegistrationRow } from "@shared/schema";
import { getWtfAppPackageAcceptance } from "@shared/wtf-app-packages";
import { db } from "../../db";
import { resolveBuildHash, type AppRegistryKind, type AppSourceType } from "./config";
import {
  canTransitionLifecycle,
  isLifecycleState,
  lifecycleAfterReregister,
  type LifecycleState,
} from "./lifecycle";
import {
  computeBundleHash,
  computeIntegrityFingerprint,
  computeManifestHash,
  type BundleFile,
  type FingerprintResult,
} from "./fingerprint";

/**
 * App Registry DB service (D1). Owns app_registrations reads/writes and the
 * lifecycle transition operations. Pure policy lives in the *-policy / lifecycle
 * / fingerprint modules; this module is the only registration-side DB surface so
 * the policy stays unit-testable without a connection.
 */

export function isMissingRelationError(err: unknown): boolean {
  const candidate = err as { code?: string; cause?: { code?: string }; message?: string } | null;
  return (
    candidate?.code === "42P01" ||
    candidate?.cause?.code === "42P01" ||
    String(candidate?.message || "").includes("does not exist")
  );
}

export interface RegistrationView {
  appId: string;
  kind: string;
  appKey: string | null;
  label: string;
  domainLabel: string | null;
  lifecycleState: LifecycleState;
  enabled: boolean;
  integrityFingerprint: string | null;
  manifestHash: string | null;
  bundleHash: string | null;
  buildHash: string | null;
  fingerprintAlgo: string;
  sourceType: string | null;
  sourceRef: string | null;
  did: string | null;
  registeredAt: string | null;
  updatedAt: string;
}

function toView(row: AppRegistrationRow): RegistrationView {
  return {
    appId: row.appId,
    kind: row.kind,
    appKey: row.appKey,
    label: row.label,
    domainLabel: row.domainLabel,
    lifecycleState: isLifecycleState(row.lifecycleState) ? row.lifecycleState : "draft",
    enabled: row.enabled,
    integrityFingerprint: row.integrityFingerprint,
    manifestHash: row.manifestHash,
    bundleHash: row.bundleHash,
    buildHash: row.buildHash,
    fingerprintAlgo: row.fingerprintAlgo,
    sourceType: row.sourceType,
    sourceRef: row.sourceRef,
    did: row.did,
    registeredAt: row.registeredAt ? row.registeredAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getRegistrationRow(appId: string): Promise<AppRegistrationRow | null> {
  try {
    const [row] = await db
      .select()
      .from(appRegistrations)
      .where(eq(appRegistrations.appId, appId))
      .limit(1);
    return row ?? null;
  } catch (err) {
    if (isMissingRelationError(err)) return null;
    throw err;
  }
}

export async function listRegistrationRows(): Promise<AppRegistrationRow[]> {
  try {
    return await db.select().from(appRegistrations).orderBy(asc(appRegistrations.appId));
  } catch (err) {
    if (isMissingRelationError(err)) return [];
    throw err;
  }
}

export async function getRegistration(appId: string): Promise<RegistrationView | null> {
  const row = await getRegistrationRow(appId);
  return row ? toView(row) : null;
}

export async function listRegistrations(): Promise<RegistrationView[]> {
  const rows = await listRegistrationRows();
  return rows.map(toView);
}

/**
 * Recompute the integrity fingerprint for a stored row. For builtins the live
 * in-tree manifest is used so a structural manifest change is detected; the
 * recorded bundle/build hashes are reused (a platform redeploy alone must NOT
 * mass-invalidate keys). For installed apps the stored manifest/bundle/build are
 * used; drift only happens on re-registration.
 */
export function recomputeFingerprintForRow(row: AppRegistrationRow): FingerprintResult {
  const liveManifest =
    row.sourceType === "builtin" ? getWtfAppPackageAcceptance(row.appId) ?? row.manifest : row.manifest;
  const manifestHash = computeManifestHash(liveManifest ?? {});
  const bundleHash = row.bundleHash ?? computeBundleHash([]);
  const buildHash = row.buildHash ?? resolveBuildHash();
  return {
    manifestHash,
    bundleHash,
    buildHash,
    integrityFingerprint: computeIntegrityFingerprint(manifestHash, bundleHash, buildHash),
    fingerprintAlgo: "sha256",
  };
}

export interface UpsertRegistrationInput {
  appId: string;
  kind: AppRegistryKind;
  appKey?: string | null;
  label: string;
  domainLabel?: string | null;
  lifecycleState: LifecycleState;
  enabled: boolean;
  sourceType: AppSourceType;
  sourceRef?: string | null;
  did?: string | null;
  manifest: unknown;
  bundleFiles?: readonly BundleFile[];
  buildHash?: string;
  actorUserId?: number | null;
}

/** Compute fingerprint legs for a brand-new/updated registration from raw inputs. */
export function fingerprintForInput(input: UpsertRegistrationInput): FingerprintResult {
  const manifestHash = computeManifestHash(input.manifest ?? {});
  const bundleHash = computeBundleHash(input.bundleFiles ?? []);
  const buildHash = input.buildHash ?? resolveBuildHash();
  return {
    manifestHash,
    bundleHash,
    buildHash,
    integrityFingerprint: computeIntegrityFingerprint(manifestHash, bundleHash, buildHash),
    fingerprintAlgo: "sha256",
  };
}

/**
 * Idempotent insert used by the backfill: inserts a registration only when it is
 * absent so admin-changed lifecycle/enabled/fingerprint state is never clobbered.
 * Returns true when a row was inserted.
 */
export async function insertRegistrationIfAbsent(input: UpsertRegistrationInput): Promise<boolean> {
  const now = new Date();
  const fp = fingerprintForInput(input);
  try {
    const inserted = await db
      .insert(appRegistrations)
      .values({
        appId: input.appId,
        kind: input.kind,
        appKey: input.appKey ?? null,
        label: input.label,
        domainLabel: input.domainLabel ?? null,
        lifecycleState: input.lifecycleState,
        enabled: input.enabled,
        integrityFingerprint: fp.integrityFingerprint,
        manifestHash: fp.manifestHash,
        bundleHash: fp.bundleHash,
        buildHash: fp.buildHash,
        fingerprintAlgo: fp.fingerprintAlgo,
        sourceType: input.sourceType,
        sourceRef: input.sourceRef ?? null,
        did: input.did ?? null,
        manifest: (input.manifest ?? null) as Record<string, unknown> | null,
        registeredBy: input.actorUserId ?? null,
        registeredAt: now,
        updatedBy: input.actorUserId ?? null,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: appRegistrations.appId })
      .returning({ id: appRegistrations.id });
    return inserted.length > 0;
  } catch (err) {
    if (isMissingRelationError(err)) return false;
    throw err;
  }
}

/** Create or fully replace a registration (wizard register / re-register). */
export async function upsertRegistration(input: UpsertRegistrationInput): Promise<RegistrationView> {
  const now = new Date();
  const fp = fingerprintForInput(input);
  const values = {
    appId: input.appId,
    kind: input.kind,
    appKey: input.appKey ?? null,
    label: input.label,
    domainLabel: input.domainLabel ?? null,
    lifecycleState: input.lifecycleState,
    enabled: input.enabled,
    integrityFingerprint: fp.integrityFingerprint,
    manifestHash: fp.manifestHash,
    bundleHash: fp.bundleHash,
    buildHash: fp.buildHash,
    fingerprintAlgo: fp.fingerprintAlgo,
    sourceType: input.sourceType,
    sourceRef: input.sourceRef ?? null,
    did: input.did ?? null,
    manifest: (input.manifest ?? null) as Record<string, unknown> | null,
    registeredBy: input.actorUserId ?? null,
    registeredAt: now,
    updatedBy: input.actorUserId ?? null,
    updatedAt: now,
  };
  const [row] = await db
    .insert(appRegistrations)
    .values(values)
    .onConflictDoUpdate({
      target: appRegistrations.appId,
      set: {
        kind: values.kind,
        appKey: values.appKey,
        label: values.label,
        domainLabel: values.domainLabel,
        lifecycleState: values.lifecycleState,
        enabled: values.enabled,
        integrityFingerprint: values.integrityFingerprint,
        manifestHash: values.manifestHash,
        bundleHash: values.bundleHash,
        buildHash: values.buildHash,
        fingerprintAlgo: values.fingerprintAlgo,
        sourceType: values.sourceType,
        sourceRef: values.sourceRef,
        did: values.did,
        manifest: values.manifest,
        updatedBy: values.updatedBy,
        updatedAt: now,
      },
    })
    .returning();
  return toView(row);
}

export interface TransitionResult {
  ok: boolean;
  error?: string;
  registration?: RegistrationView;
}

/** Apply an admin/system lifecycle transition guarded by the pure state machine. */
export async function transitionLifecycle(
  appId: string,
  to: LifecycleState,
  opts: { actorUserId?: number | null; enabled?: boolean } = {},
): Promise<TransitionResult> {
  const row = await getRegistrationRow(appId);
  if (!row) return { ok: false, error: "registration_not_found" };
  const from: LifecycleState = isLifecycleState(row.lifecycleState) ? row.lifecycleState : "draft";
  if (from !== to && !canTransitionLifecycle(from, to)) {
    return { ok: false, error: `illegal_transition:${from}->${to}` };
  }
  const enabled = opts.enabled !== undefined ? opts.enabled : row.enabled;
  const [updated] = await db
    .update(appRegistrations)
    .set({
      lifecycleState: to,
      enabled,
      updatedBy: opts.actorUserId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(appRegistrations.appId, appId))
    .returning();
  return { ok: true, registration: toView(updated) };
}

/** Mark a row needs-reregister (used by the integrity verifier on drift). */
export async function markNeedsReregister(
  appId: string,
  currentFingerprint: string,
  actorUserId: number | null = null,
): Promise<void> {
  await db
    .update(appRegistrations)
    .set({
      lifecycleState: "needs-reregister",
      integrityFingerprint: currentFingerprint,
      updatedBy: actorUserId,
      updatedAt: new Date(),
    })
    .where(eq(appRegistrations.appId, appId));
}

/** Count of registrations grouped by lifecycle state (observability). */
export async function summarizeRegistrations(): Promise<{
  total: number;
  byState: Record<string, number>;
  enabled: number;
}> {
  const rows = await listRegistrationRows();
  const byState: Record<string, number> = {};
  let enabled = 0;
  for (const row of rows) {
    byState[row.lifecycleState] = (byState[row.lifecycleState] ?? 0) + 1;
    if (row.enabled) enabled += 1;
  }
  return { total: rows.length, byState, enabled };
}

/** Convenience: load a registration with its current key row (most recent active). */
export async function getRegistrationWithKey(appId: string) {
  const row = await getRegistrationRow(appId);
  if (!row) return null;
  try {
    const [key] = await db
      .select()
      .from(appKeys)
      .where(and(eq(appKeys.registrationId, row.id), eq(appKeys.appId, appId)))
      .orderBy(desc(appKeys.createdAt))
      .limit(1);
    return { row, key: key ?? null };
  } catch (err) {
    if (isMissingRelationError(err)) return { row, key: null };
    throw err;
  }
}

/** Admin toggle: flag an app manifest as email-integrated for bot mail provisioning. */
export async function setEmailIntegrationForApp(
  appId: string,
  enabled: boolean,
  actorUserId: number | null = null,
): Promise<RegistrationView | null> {
  const row = await getRegistrationRow(appId);
  if (!row) return null;
  const manifest = { ...(row.manifest || {}) } as Record<string, unknown>;
  const integrations =
    manifest.integrations && typeof manifest.integrations === "object"
      ? { ...(manifest.integrations as Record<string, unknown>) }
      : {};
  integrations.email = {
    ...(integrations.email && typeof integrations.email === "object"
      ? (integrations.email as Record<string, unknown>)
      : {}),
    enabled,
  };
  manifest.integrations = integrations;
  const now = new Date();
  await db
    .update(appRegistrations)
    .set({
      manifest,
      updatedBy: actorUserId,
      updatedAt: now,
    })
    .where(eq(appRegistrations.appId, appId));
  return getRegistration(appId);
}
