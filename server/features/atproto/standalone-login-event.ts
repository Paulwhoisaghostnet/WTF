import type { NormalizedSystemEventInput } from "../../challenges/events/types";
import { emitWelcomeEventIfNeeded } from "../../auth/welcome-event";

type StandaloneUser = {
  id: number;
  username?: string | null;
  welcomedToWtfOs?: boolean | null;
};

export async function loginRequestUser(
  req: any,
  user: StandaloneUser,
  created: boolean,
  emitAuthEvent: (event: NormalizedSystemEventInput) => Promise<unknown>,
  emitWelcomeEvent: (user: StandaloneUser, sourceModule: string) => Promise<unknown> = emitWelcomeEventIfNeeded
): Promise<boolean> {
  if (typeof req.login !== "function") return false;

  await new Promise<void>((resolve, reject) => {
    req.login(user, (err: unknown) => {
      if (err) reject(err);
      else resolve();
    });
  });

  try {
    await emitAuthEvent({
      eventType: created ? "auth.register.succeeded" : "auth.login.succeeded",
      userId: user.id,
      source: "auth",
      sourceModule: "skywire-atproto-login",
      rawRefType: "user",
      rawRefId: user.id,
      metadata: { username: user.username ?? null, method: "atproto" },
    });
  } catch (err) {
    console.warn("[skywire] failed to emit standalone auth SystemEvent:", err);
  }

  try {
    await emitWelcomeEvent(user, "skywire-atproto-login");
  } catch (err) {
    console.warn("[skywire] failed to deliver standalone welcome:", err);
  }

  return true;
}
