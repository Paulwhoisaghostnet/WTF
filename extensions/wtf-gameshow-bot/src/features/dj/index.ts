import type { Env } from "../../lib/env.js";

export function djFeatureStatus(env: Env) {
  return {
    enabled: env.DISCORD_DJ_ENABLED,
    reason: env.DISCORD_DJ_ENABLED
      ? "DJ feature flag is enabled, but no voice/music runtime is bundled."
      : "DJ feature is intentionally disabled until voice/music dependencies are approved for production.",
  };
}
