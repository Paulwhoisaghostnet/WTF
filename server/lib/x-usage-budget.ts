import { eq } from "drizzle-orm";
import { db } from "../db";
import { platformSettings } from "@shared/schema";
import { validatePlatformSettingValue } from "./platform-settings";
import { logSystemEvent } from "./system-log";

export type XUsageFeature =
  | "timeline_stream_posts"
  | "search_recovery_posts"
  | "groupchat_dm_events"
  | "groupchat_dm_writes";

type FeatureBudget = {
  unitUsd: number;
  softUsd: number | null;
  hardUsd: number;
};

type UsageLedger = {
  month: string;
  counts: Partial<Record<XUsageFeature, number>>;
  updatedAt?: string;
};

export type XUsageFeatureState = FeatureBudget & {
  feature: XUsageFeature;
  units: number;
  estimatedUsd: number;
  remainingUnits: number;
  softExceeded: boolean;
  hardExceeded: boolean;
};

const SETTINGS_KEY = "w.x_usage_budget";

const FEATURE_LABELS: Record<XUsageFeature, string> = {
  timeline_stream_posts: "timeline stream posts",
  search_recovery_posts: "recent-search recovery posts",
  groupchat_dm_events: "groupchat DM events",
  groupchat_dm_writes: "groupchat DM writes",
};

function moneyEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function getXBudgetConfig(): Record<XUsageFeature, FeatureBudget> {
  return {
    timeline_stream_posts: {
      unitUsd: moneyEnv("W_X_BUDGET_TIMELINE_STREAM_UNIT_USD", 0.005),
      softUsd: moneyEnv("W_X_BUDGET_TIMELINE_STREAM_SOFT_USD", 35),
      hardUsd: moneyEnv("W_X_BUDGET_TIMELINE_STREAM_HARD_USD", 45),
    },
    search_recovery_posts: {
      unitUsd: moneyEnv("W_X_BUDGET_SEARCH_RECOVERY_UNIT_USD", 0.005),
      softUsd: null,
      hardUsd: moneyEnv("W_X_BUDGET_SEARCH_RECOVERY_HARD_USD", 3),
    },
    groupchat_dm_events: {
      unitUsd: moneyEnv("W_X_BUDGET_GROUPCHAT_READ_UNIT_USD", 0.01),
      softUsd: null,
      hardUsd: moneyEnv("W_X_BUDGET_GROUPCHAT_READ_HARD_USD", 5),
    },
    groupchat_dm_writes: {
      unitUsd: moneyEnv("W_X_BUDGET_GROUPCHAT_WRITE_UNIT_USD", 0.015),
      softUsd: null,
      hardUsd: moneyEnv("W_X_BUDGET_GROUPCHAT_WRITE_HARD_USD", 5),
    },
  };
}

export function currentXUsageMonth(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

function nextMonthResetIso(month = currentXUsageMonth()): string {
  const [year, monthNumber] = month.split("-").map((part) => Number(part));
  const next = new Date(Date.UTC(year, monthNumber, 1, 0, 0, 0, 0));
  return next.toISOString();
}

function emptyLedger(month = currentXUsageMonth()): UsageLedger {
  return { month, counts: {}, updatedAt: new Date().toISOString() };
}

function normalizeLedger(raw: string | null | undefined, month = currentXUsageMonth()): UsageLedger {
  if (!raw) return emptyLedger(month);
  try {
    const parsed = JSON.parse(raw) as UsageLedger;
    if (parsed?.month === month && parsed.counts && typeof parsed.counts === "object") {
      return {
        month,
        counts: parsed.counts,
        updatedAt: parsed.updatedAt,
      };
    }
  } catch {
    // Corrupt budget state should fail closed to a fresh current-month ledger.
  }
  return emptyLedger(month);
}

async function readLedger(): Promise<UsageLedger> {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, SETTINGS_KEY))
    .limit(1);
  return normalizeLedger(row?.value);
}

async function writeLedger(ledger: UsageLedger): Promise<void> {
  const value = validatePlatformSettingValue(
    JSON.stringify({ ...ledger, updatedAt: new Date().toISOString() })
  );
  await db
    .insert(platformSettings)
    .values({ key: SETTINGS_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: { value, updatedAt: new Date() },
    });
}

function cents(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function calculateXBudgetState(
  feature: XUsageFeature,
  units: number,
  budget: FeatureBudget
): XUsageFeatureState {
  const estimatedUsd = cents(units * budget.unitUsd);
  const remainingUnits = Math.max(0, Math.floor((budget.hardUsd - estimatedUsd) / budget.unitUsd));
  return {
    feature,
    ...budget,
    units,
    estimatedUsd,
    remainingUnits,
    softExceeded: budget.softUsd !== null && estimatedUsd >= budget.softUsd,
    hardExceeded: estimatedUsd >= budget.hardUsd,
  };
}

function stateFor(feature: XUsageFeature, ledger: UsageLedger): XUsageFeatureState {
  const config = getXBudgetConfig()[feature];
  return calculateXBudgetState(feature, Number(ledger.counts[feature] || 0), config);
}

export async function getXUsageBudgetStatus(): Promise<{
  month: string;
  nextResetAtIso: string;
  features: XUsageFeatureState[];
  updatedAt?: string;
}> {
  const ledger = await readLedger();
  const features = (Object.keys(getXBudgetConfig()) as XUsageFeature[]).map((feature) =>
    stateFor(feature, ledger)
  );
  return { month: ledger.month, nextResetAtIso: nextMonthResetIso(ledger.month), features, updatedAt: ledger.updatedAt };
}

export async function canUseXFeature(
  feature: XUsageFeature,
  nextUnits = 1
): Promise<{ allowed: boolean; reason: string | null; state: XUsageFeatureState }> {
  const ledger = await readLedger();
  const current = Number(ledger.counts[feature] || 0);
  const nextState = calculateXBudgetState(feature, current + Math.max(1, nextUnits), getXBudgetConfig()[feature]);
  if (nextState.hardExceeded) {
    return { allowed: false, reason: `${feature}_monthly_budget_exceeded`, state: nextState };
  }
  return { allowed: true, reason: null, state: nextState };
}

export async function recordXFeatureUsage(feature: XUsageFeature, units: number): Promise<XUsageFeatureState> {
  const safeUnits = Math.max(0, Math.trunc(units));
  const ledger = await readLedger();
  if (safeUnits > 0) {
    ledger.counts[feature] = Number(ledger.counts[feature] || 0) + safeUnits;
    await writeLedger(ledger);
  }
  const state = stateFor(feature, ledger);
  if (state.softExceeded || state.hardExceeded) {
    logSystemEvent({
      source: "x-usage-budget",
      eventType: state.hardExceeded ? "x_budget_hard_exceeded" : "x_budget_soft_exceeded",
      severity: state.hardExceeded ? "error" : "warn",
      message: `X usage budget ${state.hardExceeded ? "hard" : "soft"} cap reached for ${FEATURE_LABELS[feature]}`,
      metadata: {
        month: ledger.month,
        feature,
        units: state.units,
        estimatedUsd: state.estimatedUsd,
        softUsd: state.softUsd,
        hardUsd: state.hardUsd,
      },
    });
  }
  return state;
}
