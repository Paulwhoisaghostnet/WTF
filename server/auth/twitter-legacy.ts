import { createRequire } from "node:module";
import { resolve } from "node:path";

type EnvLike = Record<string, string | undefined>;

const require = createRequire(resolve(process.cwd(), "package.json"));

function truthyFlag(value: string | undefined): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function legacyTwitterOAuthConfigured(env: EnvLike = process.env): boolean {
  return Boolean(
    env.TWITTER_CONSUMER_KEY?.trim() &&
      env.TWITTER_CONSUMER_SECRET?.trim()
  );
}

export function legacyTwitterOAuthPackageAvailable(): boolean {
  try {
    require.resolve("passport-twitter");
    return true;
  } catch {
    return false;
  }
}

export function legacyTwitterOAuthEnabled(
  env: EnvLike = process.env,
  options: { packageAvailable?: boolean } = {}
): boolean {
  const packageAvailable =
    options.packageAvailable ?? legacyTwitterOAuthPackageAvailable();
  return (
    truthyFlag(env.ENABLE_LEGACY_TWITTER_OAUTH) &&
    legacyTwitterOAuthConfigured(env) &&
    packageAvailable
  );
}
