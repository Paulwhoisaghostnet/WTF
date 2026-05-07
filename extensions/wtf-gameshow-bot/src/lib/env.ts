import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(1, "DISCORD_BOT_TOKEN is required"),
  DISCORD_CLIENT_ID: z.string().min(1, "DISCORD_CLIENT_ID is required"),
  DISCORD_GUILD_ID: z.string().optional(),
  DISCORD_CONTESTANT_ROLE_ID: z.string().optional(),
  DISCORD_STAFF_ROLE_ID: z.string().optional(),
  DICKSWORD_PROTECTED_ROLE_IDS: z.string().default(""),
  DICKSWORD_ROLE_SYNC_DRY_RUN: z
    .string()
    .default("true")
    .transform((v) => v === "true" || v === "1"),

  WTF_WEBHOOK_BASE_URL: z
    .string()
    .url("WTF_WEBHOOK_BASE_URL must be an absolute URL"),
  WTF_BOT_WEBHOOK_SECRET: z
    .string()
    .min(16, "WTF_BOT_WEBHOOK_SECRET must be at least 16 chars"),

  WTF_MIRROR_INTERVAL_MS: z
    .string()
    .default("60000")
    .transform((v) => Number.parseInt(v, 10))
    .refine((n) => Number.isFinite(n) && n >= 10_000, {
      message: "WTF_MIRROR_INTERVAL_MS must be >= 10000",
    }),
  WTF_VOICE_HEARTBEAT_MS: z
    .string()
    .default("60000")
    .transform((v) => Number.parseInt(v, 10))
    .refine((n) => Number.isFinite(n) && n >= 15_000, {
      message: "WTF_VOICE_HEARTBEAT_MS must be >= 15000",
    }),
  DISCORD_XP_MESSAGE_POINTS: z
    .string()
    .default("1")
    .transform((v) => Number.parseInt(v, 10))
    .refine((n) => Number.isFinite(n) && n >= 0 && n <= 1000),
  DISCORD_XP_REACTION_POINTS: z
    .string()
    .default("2")
    .transform((v) => Number.parseInt(v, 10))
    .refine((n) => Number.isFinite(n) && n >= 0 && n <= 1000),
  DISCORD_XP_LEVEL_BASE: z
    .string()
    .default("100")
    .transform((v) => Number.parseInt(v, 10))
    .refine((n) => Number.isFinite(n) && n > 0),
  DISCORD_XP_LEVEL_MULTIPLIER: z
    .string()
    .default("1.5")
    .transform((v) => Number.parseFloat(v))
    .refine((n) => Number.isFinite(n) && n >= 1),
  DISCORD_IMAGE_CHALLENGE_BASE_POINTS: z
    .string()
    .default("10")
    .transform((v) => Number.parseInt(v, 10))
    .refine((n) => Number.isFinite(n) && n >= 0 && n <= 1000),
  DISCORD_IMAGE_CHALLENGE_BONUS_POINTS: z
    .string()
    .default("50")
    .transform((v) => Number.parseInt(v, 10))
    .refine((n) => Number.isFinite(n) && n >= 0 && n <= 1000),
  DISCORD_TRAIT_SUGGESTION_POINTS: z
    .string()
    .default("5")
    .transform((v) => Number.parseInt(v, 10))
    .refine((n) => Number.isFinite(n) && n >= 0 && n <= 1000),
  DISCORD_TRAIT_ADOPTED_POINTS: z
    .string()
    .default("100")
    .transform((v) => Number.parseInt(v, 10))
    .refine((n) => Number.isFinite(n) && n >= 0 && n <= 1000),
  DISCORD_DJ_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true" || v === "1"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`[env] invalid bot configuration — ${issues}`);
  }
  cached = parsed.data;
  return cached;
}
