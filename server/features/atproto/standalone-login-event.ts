import type { NormalizedSystemEventInput } from "../../challenges/events/types";

export async function loginRequestUser(
  req: any,
  user: { id: number; username?: string | null },
  created: boolean,
  emitAuthEvent: (event: NormalizedSystemEventInput) => Promise<unknown>
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

  return true;
}
