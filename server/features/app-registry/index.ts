/**
 * wtfOS universal App Registry kernel (Req1–Req5).
 *
 * Pure policy modules (fingerprint / key-policy / lifecycle / standards /
 * availability / backfill-policy) are DB-free and unit-tested; the DB service
 * modules (registry-service / key-service / integrity-service / backfill) and
 * the wizard/routes wire them into Postgres + Express. Everything is additive
 * and gated behind APP_REGISTRY_ENABLED (config.ts): when the flag is off the
 * registry is inert and legacy desktop_app_settings behaviour is unchanged.
 */

export {
  APP_REGISTRY_FLAG,
  APP_REGISTRY_LEXICON,
  APP_REGISTRY_KINDS,
  APP_SOURCE_TYPES,
  isAppRegistryEnabled,
  resolveBuildHash,
  type AppRegistryKind,
  type AppSourceType,
} from "./config";

export {
  FINGERPRINT_ALGO,
  canonicalizeJson,
  computeManifestHash,
  computeBundleHash,
  computeIntegrityFingerprint,
  computeFingerprint,
  fingerprintMatches,
  type BundleFile,
  type FingerprintInput,
  type FingerprintResult,
} from "./fingerprint";

export {
  APP_KEY_PREFIX,
  KEY_DISABLED_INTEGRITY,
  appIdToKeySlug,
  hashAppKey,
  createAppKeyMaterial,
  isAppKeyValid,
  satisfiesKeyRequirement,
  type AppKeyMaterial,
  type AppKeyState,
} from "./key-policy";

export {
  LIFECYCLE_STATES,
  isLifecycleState,
  canTransitionLifecycle,
  isActiveLifecycleState,
  isInstallable,
  appearsInCommandPalette,
  lifecycleAfterReregister,
  type LifecycleState,
  type InstallableInput,
} from "./lifecycle";

export {
  ACCEPTED_DOCTRINE_DOMAINS,
  validateAppManifest,
  resolveRegistryKind,
  type WtfAppManifest,
  type StandardsValidationResult,
} from "./standards";

export {
  ALPHA_COHORT_ROLES,
  isAlphaCohortMember,
  resolveAvailability,
  type AvailabilityView,
  type AvailabilityReason,
  type RegistrationAvailabilityInput,
} from "./availability";

export {
  buildRegistrationSeeds,
  seedFromPackage,
  isPackageEnabledByDefault,
  lifecycleForSeed,
  type RegistrationSeed,
} from "./backfill-policy";

export {
  getRegistration,
  listRegistrations,
  getRegistrationRow,
  listRegistrationRows,
  upsertRegistration,
  insertRegistrationIfAbsent,
  transitionLifecycle,
  markNeedsReregister,
  recomputeFingerprintForRow,
  summarizeRegistrations,
  getRegistrationWithKey,
  isMissingRelationError,
  type RegistrationView,
  type UpsertRegistrationInput,
  type TransitionResult,
} from "./registry-service";

export {
  issueAppKey,
  disableAppKey,
  revokeAppKey,
  verifyAppKey,
  autoDisableForIntegrity,
  getLatestKeyRow,
  type IssuedKey,
  type VerifyResult,
} from "./key-service";

export {
  runIntegrityVerification,
  verifyIntegrityOnStartup,
  type IntegrityVerificationResult,
} from "./integrity-service";

export { runAppRegistryBackfill, type BackfillSummary } from "./backfill";

export {
  deriveApp,
  previewInstall,
  runInstallWizard,
  validateInstall,
  DEFAULT_MANIFEST_PATH,
  type WizardSource,
  type WizardRepoSource,
  type WizardUploadSource,
  type InstallWizardResult,
} from "./wizard";

export { registerAppRegistryRoutes } from "./admin-routes";
