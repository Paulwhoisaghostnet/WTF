/**
 * Single source of truth for the session-cookie HMAC secret.
 *
 * The same secret backs:
 *
 *   • express-session cookie signing (`server/auth/passport.ts`)
 *   • the WebSocket handshake cookie unsign (`server/websocket.ts`)
 *
 * If those ever drift apart, every WebSocket upgrade silently 401s
 * even though HTTP works fine — a particularly nasty failure mode.
 * Forcing both code paths through this getter eliminates the drift.
 *
 * In production we fail loud rather than fall back to a hard-coded
 * dev secret, because that fallback would let an attacker forge
 * arbitrary session cookies if SESSION_SECRET were ever unset.
 */

const DEV_FALLBACK = "wtf-gameshow-dev-secret";

let warnedAboutDevFallback = false;

export function getSessionSecret(): string {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv) return fromEnv;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET must be set in production. Refusing to start with the dev fallback."
    );
  }

  if (!warnedAboutDevFallback) {
    console.warn(
      "[auth] SESSION_SECRET is unset; using insecure dev fallback. Set SESSION_SECRET in your environment."
    );
    warnedAboutDevFallback = true;
  }

  return DEV_FALLBACK;
}
