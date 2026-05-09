import type { NormalizedSystemEventInput } from "../challenges/events/types";

export const AUTH_WELCOME_EVENT_TYPE = "auth.welcome.event";
export const AUTH_WELCOME_COMPLETED_EVENT_TYPE = "auth.welcome.completed";

type WelcomeUser = {
  id?: number | null;
  username?: string | null;
  welcomedToWtfOs?: boolean | null;
};

export function shouldRunWelcomeEvent(user: WelcomeUser | null | undefined) {
  return Boolean(user?.id && user.welcomedToWtfOs !== true);
}

export function buildWelcomeEventInput(
  user: WelcomeUser,
  sourceModule: string
): NormalizedSystemEventInput {
  if (!user.id) throw new Error("Welcome event requires a user id");
  return {
    eventId: `${AUTH_WELCOME_EVENT_TYPE}:${user.id}`,
    eventType: AUTH_WELCOME_EVENT_TYPE,
    userId: user.id,
    source: "auth",
    sourceModule,
    rawRefType: "user",
    rawRefId: user.id,
    metadata: {
      eventName: "welcome event",
      method: sourceModule,
      username: user.username ?? null,
      accountAlreadyWelcomed: user.welcomedToWtfOs === true,
    },
  };
}

export async function emitWelcomeEventIfNeeded(
  user: WelcomeUser | null | undefined,
  sourceModule: string
) {
  if (!shouldRunWelcomeEvent(user)) return;
  if (!user) return;
  try {
    const { ingestSystemEvent } = await import("../challenges/events/ingest");
    await ingestSystemEvent(buildWelcomeEventInput(user, sourceModule));
  } catch (err) {
    console.warn("[auth] failed to emit welcome event:", err);
  }
}
