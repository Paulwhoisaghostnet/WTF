export type WGroupchatConfigMode = "db_preferred" | "env_override";
export type WGroupchatConfigSource = "db" | "env" | "default" | "unconfigured";

// The X DM cache already retains at most 250 conversation identities per
// account. Keep the operator-selected gameshow list inside that same persisted
// conversation window so request work and platform_settings storage are bounded.
export const W_GROUPCHAT_MAX_CONVERSATIONS = 250;

export type WGroupchatConfigState = {
  mode: WGroupchatConfigMode;
  source: WGroupchatConfigSource;
  conversationIds: string[];
  conversationId: string | null;
  warnings: string[];
  db: {
    configured: boolean;
    valid: boolean;
    ids: string[];
    updatedAt: string | null;
    updatedBy: number | null;
  };
  env: {
    configured: boolean;
    valid: boolean;
    ids: string[];
    keys: string[];
  };
  default: {
    configured: boolean;
    valid: boolean;
    ids: string[];
  };
};

function isDmConversationId(value: string | null | undefined): boolean {
  const id = String(value || "").trim();
  return /^(?:g[a-z0-9_-]+|\d+|\d+-\d+)$/i.test(id);
}

export type WGroupchatConversationSelection =
  | { ok: true; conversationIds: string[] }
  | { ok: false; error: string };

export function validateWGroupchatConversationSelection(
  value: unknown
): WGroupchatConversationSelection {
  if (!Array.isArray(value)) {
    return { ok: false, error: "conversationIds must be an array" };
  }
  if (value.length === 0) {
    return { ok: false, error: "At least one X DM conversation id is required" };
  }
  if (value.length > W_GROUPCHAT_MAX_CONVERSATIONS) {
    return {
      ok: false,
      error: `No more than ${W_GROUPCHAT_MAX_CONVERSATIONS} X DM conversations may be selected`,
    };
  }

  const conversationIds: string[] = [];
  const seen = new Set<string>();
  for (const rawId of value) {
    if (typeof rawId !== "string") {
      return { ok: false, error: "Every X DM conversation id must be a string" };
    }
    const id = rawId.trim();
    if (!isDmConversationId(id)) {
      return { ok: false, error: `Invalid X DM conversation id: ${id || "(empty)"}` };
    }
    if (!seen.has(id)) {
      seen.add(id);
      conversationIds.push(id);
    }
  }

  return { ok: true, conversationIds };
}

function parseDbConversationIds(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    const selection = validateWGroupchatConversationSelection(parsed);
    return selection.ok ? selection.conversationIds : [];
  } catch {
    return [];
  }
}

function parseConversationIds(value: string | null | undefined): string[] {
  const raw = String(value || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return Array.from(new Set(parsed.map((id) => String(id).trim()).filter(isDmConversationId)));
    }
  } catch {
    // Accept legacy single-id and comma-separated env/config values.
  }
  return Array.from(new Set(raw.split(/[,\s]+/).map((id) => id.trim()).filter(isDmConversationId)));
}

function groupchatConfigMode(value: string | null | undefined): WGroupchatConfigMode {
  return String(value || "").trim() === "env_override" ? "env_override" : "db_preferred";
}

export function resolveWGroupchatConfigState(input: {
  dbValue?: string | null;
  dbUpdatedAt?: Date | string | null;
  dbUpdatedBy?: number | null;
  envValue?: string | null;
  envKeys?: string[];
  defaultValue?: string | null;
  mode?: string | null;
}): WGroupchatConfigState {
  const mode = groupchatConfigMode(input.mode);
  const dbRaw = String(input.dbValue || "").trim();
  const envRaw = String(input.envValue || "").trim();
  const defaultRaw = String(input.defaultValue || "").trim();
  const dbIds = dbRaw ? parseDbConversationIds(dbRaw) : [];
  const envIds = parseConversationIds(envRaw);
  const defaultIds = parseConversationIds(defaultRaw);
  const warnings: string[] = [];

  if (dbRaw && dbIds.length === 0) warnings.push("db_value_invalid");
  if (envRaw && envIds.length === 0) warnings.push("env_value_invalid");
  if (defaultRaw && defaultIds.length === 0) warnings.push("default_value_invalid");

  const ordered: Array<{ source: WGroupchatConfigSource; ids: string[] }> =
    mode === "env_override"
      ? [
          { source: "env", ids: envIds },
          { source: "db", ids: dbIds },
          { source: "default", ids: defaultIds },
        ]
      : [
          { source: "db", ids: dbIds },
          { source: "env", ids: envIds },
          { source: "default", ids: defaultIds },
        ];
  const active = ordered.find((candidate) => candidate.ids.length > 0) || {
    source: "unconfigured" as const,
    ids: [],
  };

  if (mode === "env_override" && envIds.length > 0 && dbIds.length > 0) {
    warnings.push("env_override_ignores_db_value");
  }
  if (mode === "db_preferred" && dbIds.length > 0 && envIds.length > 0) {
    warnings.push("db_preferred_ignores_env_value");
  }

  return {
    mode,
    source: active.source,
    conversationIds: active.ids,
    conversationId: active.ids[0] || null,
    warnings,
    db: {
      configured: Boolean(dbRaw),
      valid: dbIds.length > 0,
      ids: dbIds,
      updatedAt: input.dbUpdatedAt
        ? input.dbUpdatedAt instanceof Date
          ? input.dbUpdatedAt.toISOString()
          : String(input.dbUpdatedAt)
        : null,
      updatedBy: input.dbUpdatedBy ?? null,
    },
    env: {
      configured: Boolean(envRaw),
      valid: envIds.length > 0,
      ids: envIds,
      keys: input.envKeys || [],
    },
    default: {
      configured: Boolean(defaultRaw),
      valid: defaultIds.length > 0,
      ids: defaultIds,
    },
  };
}
