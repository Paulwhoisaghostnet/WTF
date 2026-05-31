import { existsSync } from "node:fs";

export function getDigestScraperStorageStatePath(): string {
  return String(process.env.W_X_SCRAPER_STORAGE_STATE || "").trim();
}

export function getDigestScraperCredentials(): { username: string; password: string } | null {
  const username = String(process.env.W_X_SCRAPER_USERNAME || "").trim();
  const password = String(process.env.W_X_SCRAPER_PASSWORD || "").trim();
  if (!username || !password) return null;
  return { username, password };
}

export function isDigestScraperConfigured(): boolean {
  const storagePath = getDigestScraperStorageStatePath();
  const hasStorage = Boolean(storagePath && existsSync(storagePath));
  return Boolean(hasStorage || getDigestScraperCredentials());
}

export function getDigestScraperIntervalMs(): number {
  return Math.max(120_000, Number(process.env.W_DIGEST_SCRAPER_INTERVAL_MS || 600_000));
}
