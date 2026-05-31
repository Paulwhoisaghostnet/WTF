import {
  createInMemoryRateLimit,
  type InMemoryRateLimitMiddleware,
  type InMemoryRateLimitOptions,
} from "./in-memory-rate-limit";
import { createPostgresRateLimit } from "./postgres-rate-limit";

function usePostgresRateLimitStore(): boolean {
  return String(process.env.RATE_LIMIT_STORE || "").toLowerCase() === "postgres";
}

export function createRateLimit(
  options: InMemoryRateLimitOptions
): InMemoryRateLimitMiddleware {
  if (usePostgresRateLimitStore()) {
    return createPostgresRateLimit(options);
  }
  return createInMemoryRateLimit(options);
}
