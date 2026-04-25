import type { Env } from "./env.js";

const levels = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof levels;

export function createLogger(env: Pick<Env, "LOG_LEVEL">) {
  const threshold = levels[env.LOG_LEVEL];
  function log(level: Level, msg: string, fields?: Record<string, unknown>) {
    if (levels[level] < threshold) return;
    const payload = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...(fields ?? {}),
    };
    const line = JSON.stringify(payload);
    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }
  }
  return {
    debug: (m: string, f?: Record<string, unknown>) => log("debug", m, f),
    info: (m: string, f?: Record<string, unknown>) => log("info", m, f),
    warn: (m: string, f?: Record<string, unknown>) => log("warn", m, f),
    error: (m: string, f?: Record<string, unknown>) => log("error", m, f),
  };
}

export type Logger = ReturnType<typeof createLogger>;
