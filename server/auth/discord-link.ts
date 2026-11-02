/** The Profile link uses Discord only to prove which account approved it. */
export const DISCORD_PROFILE_SCOPES = ["identify"] as const;

export type DiscordLinkIntent = {
  userId: number;
  expectedHandle: string;
};

export type DiscordLinkErrorCode =
  | "discord_handle"
  | "discord_session"
  | "discord_profile"
  | "discord_already_linked"
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

export function resolveDiscordLinkIdentity(
  intent: DiscordLinkIntent | null | undefined,
  currentUserId: number,
  profile: { id?: string | null; username?: string | null; discriminator?: string | null }
): { id: string; handle: string } {
  if (
    !intent ||
    !Number.isInteger(currentUserId) ||
    intent.userId !== currentUserId ||
    !normalizeDiscordExpectedHandle(intent.expectedHandle)
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

  if (normalizeDiscordExpectedHandle(intent.expectedHandle) !== handle) {
    throw new DiscordLinkError("discord_account_mismatch");
  }
  return { id, handle };
}
