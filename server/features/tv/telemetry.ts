import { createInMemoryRateLimit } from "../../lib/in-memory-rate-limit";
import {
  createTvTelemetryStore,
  type TelemetryReason,
} from "../../lib/tv-telemetry";

export type { TelemetryReason };

const TV_TELEMETRY_WINDOW_MS = Math.max(
  60 * 1000,
  Number(process.env.TV_TELEMETRY_WINDOW_MS || 60 * 60 * 1000)
);
const TV_TELEMETRY_BLACKLIST_THRESHOLD = Math.max(
  1,
  Number(process.env.TV_TELEMETRY_BLACKLIST_THRESHOLD || 3)
);
const TV_TELEMETRY_MAX_TRACKED_VIDEOS = Math.max(
  100,
  Number(process.env.TV_TELEMETRY_MAX_TRACKED_VIDEOS || 4000)
);
const TV_TELEMETRY_MAX_TRACKED_BUMPERS = Math.max(
  100,
  Number(process.env.TV_TELEMETRY_MAX_TRACKED_BUMPERS || 1000)
);
const TV_TELEMETRY_MAX_ERROR_SESSIONS_PER_ITEM = Math.max(
  TV_TELEMETRY_BLACKLIST_THRESHOLD,
  Number(process.env.TV_TELEMETRY_MAX_ERROR_SESSIONS_PER_ITEM || 64)
);
const TV_TELEMETRY_RATE_LIMIT_PER_MINUTE = Math.max(
  10,
  Number(process.env.TV_TELEMETRY_RATE_LIMIT_PER_MINUTE || 60)
);
const TV_TELEMETRY_RATE_LIMIT_MAX_KEYS = Math.max(
  100,
  Number(process.env.TV_TELEMETRY_RATE_LIMIT_MAX_KEYS || 2000)
);

export const tvTelemetryStore = createTvTelemetryStore({
  windowMs: TV_TELEMETRY_WINDOW_MS,
  blacklistThreshold: TV_TELEMETRY_BLACKLIST_THRESHOLD,
  maxTrackedVideos: TV_TELEMETRY_MAX_TRACKED_VIDEOS,
  maxTrackedBumpers: TV_TELEMETRY_MAX_TRACKED_BUMPERS,
  maxErroredSessionsPerItem: TV_TELEMETRY_MAX_ERROR_SESSIONS_PER_ITEM,
});

export const tvTelemetryRateLimit = createInMemoryRateLimit({
  windowMs: 60 * 1000,
  max: TV_TELEMETRY_RATE_LIMIT_PER_MINUTE,
  message: { error: "Too many TV telemetry events, please try again later" },
  maxEntries: TV_TELEMETRY_RATE_LIMIT_MAX_KEYS,
});

export function videoIdsCurrentlyBlacklisted(): Set<number> {
  return tvTelemetryStore.blacklistedVideoIds();
}
