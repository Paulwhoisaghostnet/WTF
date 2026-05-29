import { existsSync } from "node:fs";
import { createOctokit } from "../../github";
import { type BundleFile } from "./fingerprint";
import {
  resolveRegistryKind,
  validateAppManifest,
  type StandardsValidationResult,
  type WtfAppManifest,
} from "./standards";
import { upsertRegistration, type RegistrationView } from "./registry-service";
import { issueAppKey, type IssuedKey } from "./key-service";

/**
 * Install-New-App wizard (Req5 / D5). Turns a user's code project (repo or
 * upload) into a wtfOS app:
 *   source → derive a wtfos.app.json manifest → VALIDATE against universal
 *   standards → compute fingerprint → draft → registered → issue key → alpha.
 *
 * IMPORTANT: uploaded/repo code is VALIDATED ONLY in this pass — never executed
 * or sandboxed. Repo ingestion uses the read-only GitHub API; uploads are passed
 * in pre-extracted by the route (multer) as a manifest + file hash list.
 */

export const DEFAULT_MANIFEST_PATH = "wtfos.app.json";

export interface WizardRepoSource {
  sourceType: "repo";
  owner: string;
  repo: string;
  ref?: string;
  manifestPath?: string;
  authToken?: string;
}

export interface WizardUploadSource {
  sourceType: "upload";
  manifest: unknown;
  bundleFiles: BundleFile[];
  buildHash?: string;
  sourceRef?: string;
}

export type WizardSource = WizardRepoSource | WizardUploadSource;

export interface DerivedApp {
  manifest: WtfAppManifest;
  bundleFiles: BundleFile[];
  buildHash: string;
  sourceRef: string;
}

function toSlug(value: unknown, fallback: string): string {
  const base = typeof value === "string" && value.trim() ? value : fallback;
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Read-only repo ingestion via the GitHub API. Never clones or executes code. */
export async function deriveFromRepo(source: WizardRepoSource): Promise<DerivedApp> {
  const octokit = createOctokit(source.authToken);
  const ref = source.ref || undefined;
  const manifestPath = source.manifestPath || DEFAULT_MANIFEST_PATH;

  const contentRes = await octokit.repos.getContent({
    owner: source.owner,
    repo: source.repo,
    path: manifestPath,
    ref,
  });
  const file = contentRes.data as { content?: string; encoding?: string };
  if (!file.content) {
    throw new Error(`manifest ${manifestPath} not found in ${source.owner}/${source.repo}`);
  }
  const raw = Buffer.from(file.content, (file.encoding as BufferEncoding) || "base64").toString("utf8");
  const manifest = JSON.parse(raw) as WtfAppManifest;

  const commit = await octokit.repos.getCommit({
    owner: source.owner,
    repo: source.repo,
    ref: ref || "HEAD",
  });
  const buildHash = commit.data.sha;

  const tree = await octokit.git.getTree({
    owner: source.owner,
    repo: source.repo,
    tree_sha: buildHash,
    recursive: "true",
  });
  const bundleFiles: BundleFile[] = tree.data.tree
    .filter((entry) => entry.type === "blob" && entry.path && entry.sha)
    .map((entry) => ({ path: String(entry.path), sha256: String(entry.sha) }));

  return {
    manifest,
    bundleFiles,
    buildHash,
    sourceRef: `github:${source.owner}/${source.repo}@${buildHash.slice(0, 12)}`,
  };
}

export function deriveFromUpload(source: WizardUploadSource): DerivedApp {
  return {
    manifest: (source.manifest ?? {}) as WtfAppManifest,
    bundleFiles: source.bundleFiles ?? [],
    buildHash: source.buildHash || `upload:${Date.now()}`,
    sourceRef: source.sourceRef || "upload",
  };
}

export async function deriveApp(source: WizardSource): Promise<DerivedApp> {
  return source.sourceType === "repo" ? deriveFromRepo(source) : deriveFromUpload(source);
}

/** Standards validation including filesystem checks (doc-path / domain-guide existence). */
export function validateInstall(manifest: WtfAppManifest): StandardsValidationResult {
  const result = validateAppManifest(manifest);
  const errors = [...result.errors];

  const guide = manifest.domain?.guide;
  if (typeof guide === "string" && guide && !existsSync(guide)) {
    errors.push(`domain.guide path does not exist: ${guide}`);
  }
  const documentation = (manifest as { documentation?: Record<string, unknown> }).documentation;
  if (documentation && typeof documentation === "object") {
    for (const value of Object.values(documentation)) {
      if (typeof value === "string" && value && !existsSync(value)) {
        errors.push(`documentation path does not exist: ${value}`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export interface InstallWizardResult {
  ok: boolean;
  errors?: string[];
  appId?: string;
  registration?: RegistrationView;
  key?: IssuedKey | null;
}

/** Validate-only dry run: derive + validate, no DB writes. */
export async function previewInstall(source: WizardSource): Promise<{
  ok: boolean;
  errors: string[];
  appId?: string;
  manifest?: WtfAppManifest;
}> {
  const derived = await deriveApp(source);
  const validation = validateInstall(derived.manifest);
  const slug = toSlug(derived.manifest.key, "app");
  const appId =
    typeof derived.manifest.id === "string" && derived.manifest.id.trim()
      ? derived.manifest.id
      : `installed:${slug}`;
  return { ok: validation.ok, errors: validation.errors, appId, manifest: derived.manifest };
}

/**
 * Full wizard: derive → validate → register (draft→registered) → issue key →
 * alpha. The app must pass standards validation before it gets a registration or
 * a key; it lands in ALPHA (cohort-only) and is NOT published until an admin
 * promotes it.
 */
export async function runInstallWizard(
  source: WizardSource,
  opts: { actorUserId?: number | null; scopes?: string[] } = {},
): Promise<InstallWizardResult> {
  const derived = await deriveApp(source);
  const validation = validateInstall(derived.manifest);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }

  const slug = toSlug(derived.manifest.key, "app");
  const appId =
    typeof derived.manifest.id === "string" && derived.manifest.id.trim()
      ? derived.manifest.id
      : `installed:${slug}`;
  const kind = resolveRegistryKind(derived.manifest);

  const registration = await upsertRegistration({
    appId,
    kind,
    appKey: slug,
    label: typeof derived.manifest.label === "string" ? derived.manifest.label : slug,
    domainLabel:
      typeof derived.manifest.domain?.label === "string" ? derived.manifest.domain.label : null,
    lifecycleState: "registered",
    enabled: true,
    sourceType: source.sourceType,
    sourceRef: derived.sourceRef,
    manifest: derived.manifest,
    bundleFiles: derived.bundleFiles,
    buildHash: derived.buildHash,
    actorUserId: opts.actorUserId ?? null,
  });

  const key = await issueAppKey(appId, {
    scopes: opts.scopes ?? ["operate"],
    issuedBy: opts.actorUserId ?? null,
  });

  // registered → alpha (cohort-only testing phase, never public until promoted).
  const { transitionLifecycle } = await import("./registry-service");
  const transitioned = await transitionLifecycle(appId, "alpha", {
    actorUserId: opts.actorUserId ?? null,
    enabled: true,
  });

  return {
    ok: true,
    appId,
    registration: transitioned.registration ?? registration,
    key,
  };
}
