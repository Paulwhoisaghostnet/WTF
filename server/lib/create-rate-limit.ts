import {
  createInMemoryRateLimit,
  type InMemoryRateLimitMiddleware,
  type InMemoryRateLimitOptions,
} from "./in-memory-rate-limit";
import { createPostgresRateLimit } from "./postgres-rate-limit";

export type RateLimitOptions = InMemoryRateLimitOptions & {
  name: string;
};

function usePostgresRateLimitStore(): boolean {
  return String(process.env.RATE_LIMIT_STORE || "").toLowerCase() === "postgres";
}

export function createRateLimit(
  options: RateLimitOptions
): InMemoryRateLimitMiddleware {
  if (usePostgresRateLimitStore()) {
    return createPostgresRateLimit(options);
  }
  return createInMemoryRateLimit(options);
}
