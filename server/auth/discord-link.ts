/** The Profile link uses Discord only to prove which account approved it. */
export const DISCORD_PROFILE_SCOPES = ["identify"] as const;

export type DiscordLinkSnapshot = {
  discordId: string | null;
  discordHandle: string | null;
  discordVerified: boolean;
};

export type DiscordLinkIntent = {
  intentVersion: 2;
  userId: number;
  expectedHandle: string | null;
  priorId: string | null;
  allowAccountChange: boolean;
  snapshot: DiscordLinkSnapshot;
};

export type DiscordLinkErrorCode =
  | "discord_handle"
  | "discord_session"
  | "discord_profile"
  | "discord_already_linked"
  | "discord_link_changed"
  | "discord_account_mismatch";

export class DiscordLinkError extends Error {
  constructor(readonly code: DiscordLinkErrorCode) {
    super(code);
    this.name = "DiscordLinkError";
  }
}

export function discordAuthorizationParams(): { prompt: "consent" } {
  return { prompt: "consent" };
}

/** Accept the unique modern username or the former username#discriminator form. */
export function normalizeDiscordExpectedHandle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().replace(/^@/, "");
  if (!value || value.length > 100 || /[\u0000-\u001f\u007f/]/.test(value)) return null;

  // Older Profile links stored a new-style username with the obsolete #0 suffix.
  const modern = value.replace(/#0$/, "");
  if (/^[a-z0-9._]{2,32}$/i.test(modern)) return modern.toLowerCase();

  const legacy = /^(.{2,32})#([0-9]{4})$/.exec(value);
  return legacy ? `${legacy[1]}#${legacy[2]}` : null;
}

export function resolveDiscordLinkIntent(
  rawExpectedHandle: unknown,
  current: {
    id?: number | null;
    discordId?: string | null;
    discordHandle?: string | null;
    discordVerified?: boolean | null;
  }
): DiscordLinkIntent | null {
  if (!Number.isInteger(current.id)) return null;
  if (rawExpectedHandle != null && typeof rawExpectedHandle !== "string") return null;
  const supplied = typeof rawExpectedHandle === "string" ? rawExpectedHandle.trim() : "";
  const requestedHandle = supplied ? normalizeDiscordExpectedHandle(supplied) : null;
  if (supplied && !requestedHandle) return null;

  const snapshot: DiscordLinkSnapshot = {
    discordId: current.discordId ?? null,
    discordHandle: current.discordHandle ?? null,
    discordVerified: current.discordVerified === true,
  };
  const priorId = snapshot.discordVerified ? snapshot.discordId : null;
  if (snapshot.discordVerified && !priorId && !requestedHandle) return null;
  const currentHandle = normalizeDiscordExpectedHandle(snapshot.discordHandle);
  const allowAccountChange = !snapshot.discordVerified || Boolean(
    requestedHandle && requestedHandle !== currentHandle
  );

  return {
    intentVersion: 2,
    userId: current.id!,
    expectedHandle: requestedHandle,
    priorId,
    allowAccountChange,
    snapshot,
  };
}

export function resolveDiscordLinkIdentity(
  intent: DiscordLinkIntent | null | undefined,
  currentUserId: number,
  profile: { id?: string | null; username?: string | null; discriminator?: string | null }
): { id: string; handle: string } {
  if (
    !intent ||
    intent.intentVersion !== 2 ||
    !Number.isInteger(currentUserId) ||
    intent.userId !== currentUserId ||
    (intent.expectedHandle !== null && !normalizeDiscordExpectedHandle(intent.expectedHandle)) ||
    !intent.snapshot
  ) {
    throw new DiscordLinkError("discord_session");
  }

  const id = typeof profile.id === "string" ? profile.id.trim() : "";
  const username = typeof profile.username === "string" ? profile.username.trim() : "";
  const discriminator = typeof profile.discriminator === "string"
    ? profile.discriminator.trim()
    : "";
  const rawHandle = discriminator && discriminator !== "0"
    ? `${username}#${discriminator}`
    : username;
  const handle = normalizeDiscordExpectedHandle(rawHandle);
  if (!/^[0-9]+$/.test(id) || !handle) {
    throw new DiscordLinkError("discord_profile");
  }

  if (intent.expectedHandle && normalizeDiscordExpectedHandle(intent.expectedHandle) !== handle) {
    throw new DiscordLinkError("discord_account_mismatch");
  }
  if (intent.priorId && !intent.allowAccountChange && intent.priorId !== id) {
    throw new DiscordLinkError("discord_account_mismatch");
  }
  return { id, handle };
}
