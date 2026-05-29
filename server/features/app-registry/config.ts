/**
 * App Registry kernel config (Req2 / D0).
 *
 * The master flag APP_REGISTRY_ENABLED gates ALL new registry behaviour. It is
 * a clean process the admin can DISABLE: when off, the registry routes 404, the
 * verifier job no-ops, and the legacy desktop_app_settings launcher behaviour is
 * UNCHANGED (non-destructive). Pure + side-effect free so it is unit testable.
 */

export const APP_REGISTRY_FLAG = "APP_REGISTRY_ENABLED";

/** Lexicon namespace segment used when ATPROTO_SPINE_ENABLED mirrors apps (D6). */
export const APP_REGISTRY_LEXICON = "app.wtfos.os.app";

/** Canonical app kinds the registry governs. Mirrors WtfAppPackageKind plus user installs. */
export const APP_REGISTRY_KINDS = [
  "desktop-app",
  "creation-tool",
  "console-stock-cartridges",
  "project-bundle",
  "integration-plugin",
  "installed-app",
] as const;
export type AppRegistryKind = (typeof APP_REGISTRY_KINDS)[number];

/** Source of an app's code/manifest. */
export const APP_SOURCE_TYPES = ["builtin", "repo", "upload"] as const;
export type AppSourceType = (typeof APP_SOURCE_TYPES)[number];

export function isAppRegistryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[APP_REGISTRY_FLAG] === "true" || env[APP_REGISTRY_FLAG] === "1";
}

/**
 * Resolve the build hash used as the buildHash leg of the integrity fingerprint.
 * Prefers an explicit deploy SHA, then common CI git env vars, then the wtfOS
 * package version so the fingerprint is always deterministic for a given build.
 */
export function resolveBuildHash(
  env: NodeJS.ProcessEnv = process.env,
  fallbackVersion = "0.0.0",
): string {
  return (
    env.WTFOS_BUILD_SHA ||
    env.GIT_COMMIT ||
    env.SOURCE_VERSION ||
    env.RENDER_GIT_COMMIT ||
    env.VERCEL_GIT_COMMIT_SHA ||
    `pkg:${env.npm_package_version || fallbackVersion}`
  );
}
