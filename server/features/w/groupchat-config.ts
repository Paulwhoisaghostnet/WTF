export type WGroupchatConfigMode = "db_preferred" | "env_override";
export type WGroupchatConfigSource = "db" | "env" | "default" | "unconfigured";

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
  const dbIds = parseConversationIds(dbRaw);
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
