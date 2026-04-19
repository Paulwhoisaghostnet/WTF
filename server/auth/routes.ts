import { Router, type Request, type Response, type NextFunction } from "express";
import passport from "passport";
import { hashPassword, comparePasswords, isAuthenticated } from "./passport";
import {
  createUser,
  getUserById,
  getUserByUsername,
  getUserByEmail,
  getUserByWalletAddress,
  createWalletAuthNonce,
  consumeWalletAuthNonce,
  updateUserPassword,
} from "./storage";
import { classifyDbError } from "../errors/db-errors";
import { getPublicSiteOrigin } from "./oauth-base";
import {
  buildChallengeMessage,
  verifyWalletSignature,
  verifyPublicKeyOwnership,
  publicKeyToAddress,
} from "./wallet-verify";
import { getEffectivePermissions } from "../lib/permissions";
import { getXpTierForTotal } from "@shared/types";
import { pool } from "../db";
import { backfillUserWallets } from "../lib/wallet-events";
import { enqueue as enqueueIndex } from "../lib/indexing-queue";
import { db } from "../db";
import { userWallets } from "@shared/schema";
import { eq } from "drizzle-orm";

const router = Router();

function toSafeUser(user: any) {
  if (!user) return user;
  const {
    passwordHash,
    twitterOauthToken: _twitterOauthToken,
    twitterOauthTokenSecret: _twitterOauthTokenSecret,
    ...rest
  } = user;
  return { ...rest, hasPassword: Boolean(passwordHash) };
}

/**
 * Kick off a background wallet-event backfill for every wallet this user
 * has linked, AND enqueue each wallet in `indexing_queue` with
 * priority=1 so the cockpit scheduler retries on failure.  Never
 * blocks the request.
 */
function refreshDossierInBackground(userId: number, reason: string) {
  if (!userId) return;
  (async () => {
    try {
      const wallets = await db
        .select({ addr: userWallets.walletAddress })
        .from(userWallets)
        .where(eq(userWallets.userId, userId));
      for (const w of wallets) {
        try {
          await enqueueIndex({
            target: w.addr,
            targetKind: "wallet",
            reason,
            priority: 1,
            userId,
          });
        } catch (queueErr) {
          console.warn(
            `[wallet-events] enqueue failed for ${w.addr}:`,
            queueErr
          );
        }
      }
    } catch (err) {
      console.warn("[wallet-events] login enqueue failed:", err);
    }
  })();
  backfillUserWallets(userId, reason).catch((err) => {
    console.error(
      `[wallet-events] login-triggered backfill failed for user ${userId}:`,
      err
    );
  });
}

/**
 * Local password policy.  Kept consistent across `/register`,
 * `/change-password`, and `/wallet/register` so a user cannot pick a
 * password through one endpoint that they could not later set through
 * another.  The lower bound is dictated by `change-password`; the upper
 * bound is a defence-in-depth check against scrypt CPU/memory abuse via
 * a giant input.
 */
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;

function validatePassword(password: unknown): string | null {
  if (typeof password !== "string") return "Password is required";
  if (password.length < PASSWORD_MIN)
    return `Password must be at least ${PASSWORD_MIN} characters`;
  if (password.length > PASSWORD_MAX) return "Password too long";
  return null;
}

/**
 * Wrap `req.login` in `req.session.regenerate` so the session id we
 * issue after a successful authentication is *not* the one the client
 * may have been using anonymously beforehand.  This kills the
 * classic session-fixation chain where an attacker plants their own
 * session cookie on a victim and waits for them to authenticate.
 *
 * Used on every code-path that establishes a new authenticated
 * identity: local login, OAuth callbacks, wallet verify (existing
 * user), and wallet register / local register (newly created user).
 */
function loginWithSessionRegen(
  req: Request,
  user: any,
  done: (err: any) => void
) {
  req.session.regenerate((regenErr) => {
    if (regenErr) return done(regenErr);
    req.login(user, (loginErr) => {
      if (loginErr) return done(loginErr);
      req.session.save(done);
    });
  });
}

async function toSafeUserWithPermissions(user: any) {
  const safe = toSafeUser(user);
  if (!safe) return safe;
  try {
    safe.effectivePermissions = await getEffectivePermissions(safe.role);
  } catch {
    safe.effectivePermissions = {};
  }
  safe.xpTier = getXpTierForTotal(safe.experiencePoints ?? 0);
  return safe;
}

function profileRedirect(query: string): string {
  const base = getPublicSiteOrigin();
  return base ? `${base}/profile?${query}` : `/profile?${query}`;
}

function oauthVerifyCallback(
  strategy: string,
  successQuery: string,
  failureQuery: string
) {
  return (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate(strategy, (err: Error | null, user: any) => {
      if (err) {
        console.error(`[auth] ${strategy} callback error:`, err);
        return res.redirect(profileRedirect(failureQuery));
      }
      if (!user) {
        return res.redirect(profileRedirect(failureQuery));
      }
      loginWithSessionRegen(req, user, (loginErr) => {
        if (loginErr) {
          console.error(`[auth] ${strategy} callback login error:`, loginErr);
          return res.redirect(profileRedirect(failureQuery));
        }
        refreshDossierInBackground(user?.id, `social-${strategy}`);
        return res.redirect(profileRedirect(successQuery));
      });
    })(req, res, next);
  };
}

/**
 * Variant of `oauthVerifyCallback` for *primary login* flows
 * (Google/GitHub sign-in).  Same session-regeneration guarantee, but
 * routes the user to a configured success path rather than the
 * profile-link UI.
 */
function oauthLoginCallback(
  strategy: string,
  successPath: string,
  failurePath: string
) {
  const base = getPublicSiteOrigin();
  const buildRedirect = (p: string) => (base ? `${base}${p}` : p);
  return (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate(strategy, (err: Error | null, user: any) => {
      if (err) {
        console.error(`[auth] ${strategy} login error:`, err);
        return res.redirect(buildRedirect(failurePath));
      }
      if (!user) return res.redirect(buildRedirect(failurePath));
      loginWithSessionRegen(req, user, (loginErr) => {
        if (loginErr) {
          console.error(`[auth] ${strategy} login session error:`, loginErr);
          return res.redirect(buildRedirect(failurePath));
        }
        refreshDossierInBackground(user?.id, `social-${strategy}`);
        return res.redirect(buildRedirect(successPath));
      });
    })(req, res, next);
  };
}

/** Public: which social link flows are available (for Profile UI). */
router.get("/api/auth/social/config", (_req, res) => {
  res.json({
    github: Boolean(
      process.env.GITHUB_CLIENT_ID?.trim() &&
        process.env.GITHUB_CLIENT_SECRET?.trim()
    ),
    twitter: Boolean(
      process.env.TWITTER_CONSUMER_KEY?.trim() &&
        process.env.TWITTER_CONSUMER_SECRET?.trim()
    ),
    discord: Boolean(
      process.env.DISCORD_CLIENT_ID?.trim() &&
        process.env.DISCORD_CLIENT_SECRET?.trim()
    ),
    publicSiteUrl: getPublicSiteOrigin() || null,
  });
});

router.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, displayName } = req.body;
    const username = typeof req.body.username === "string"
      ? req.body.username.trim().toLowerCase()
      : "";

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }
    if (username.length < 3 || username.length > 50) {
      return res
        .status(400)
        .json({ error: "Username must be 3-50 characters" });
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const existingUser = await getUserByUsername(username);
    if (existingUser) {
      return res.status(409).json({ error: "Username already taken" });
    }

    if (email) {
      const existingEmail = await getUserByEmail(email);
      if (existingEmail) {
        return res.status(409).json({ error: "Email already registered" });
      }
    }

    const passwordHash = await hashPassword(password);
    const user = await createUser({
      username,
      email: email || undefined,
      passwordHash,
      displayName: displayName || username,
      role: "witness",
    });

    loginWithSessionRegen(req, user, (err) => {
      if (err) return res.status(500).json({ error: "Login failed" });
      refreshDossierInBackground(user.id, "register");
      res.status(201).json(toSafeUser(user));
    });
  } catch (err) {
    console.error("Registration error:", err);
    const classified = classifyDbError(err);
    if (classified) {
      return res.status(classified.status).json({ error: classified.error });
    }
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/api/auth/login", (req, res, next) => {
  passport.authenticate(
    "local",
    (err: Error | null, user: any, _info: any) => {
      if (err) {
        console.error("[auth] login strategy error:", err);
        const classified = classifyDbError(err);
        if (classified) {
          return res.status(classified.status).json({ error: classified.error });
        }
        return res.status(500).json({ error: "Login failed" });
      }
      if (!user)
        return res.status(401).json({ error: "Invalid credentials" });
      loginWithSessionRegen(req, user, (loginErr) => {
        if (loginErr) {
          console.error("[auth] session login error:", loginErr);
          const classified = classifyDbError(loginErr);
          if (classified) {
            return res.status(classified.status).json({ error: classified.error });
          }
          return res.status(500).json({ error: "Session creation failed" });
        }
        refreshDossierInBackground(user?.id, "login");
        res.json(toSafeUser(user));
      });
    }
  )(req, res, next);
});

router.post("/api/auth/logout", (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: "Logout failed" });
    }

    req.session.destroy((sessionErr) => {
      if (sessionErr) {
        return res.status(500).json({ error: "Failed to end session" });
      }

      res.clearCookie("connect.sid");
      return res.json({ ok: true });
    });
  });
});

router.get("/api/auth/user", isAuthenticated, async (req, res) => {
  const user = req.user as any;
  res.json(await toSafeUserWithPermissions(user));
});

/**
 * Change (or set, for wallet-only accounts) the local login password.
 *
 * Required body:
 *   • newPassword       — min 8 characters.
 *   • currentPassword   — required *only* if the account already has
 *                         a password hash on file.  Accounts created
 *                         via wallet or social login without a
 *                         password may use this endpoint to set one
 *                         for the first time.
 *
 * On success, other active sessions belonging to this user are
 * best-effort invalidated so a stolen password stops working
 * immediately.  The current session is preserved.
 */
router.post("/api/auth/change-password", isAuthenticated, async (req, res) => {
  try {
    const reqUser = req.user as any;
    if (!reqUser?.id) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const newPassword =
      typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    const currentPassword =
      typeof req.body?.currentPassword === "string"
        ? req.body.currentPassword
        : "";

    if (!newPassword) {
      return res.status(400).json({ error: "New password is required" });
    }
    const newPasswordError = validatePassword(newPassword);
    if (newPasswordError) {
      return res.status(400).json({ error: newPasswordError });
    }

    // Re-fetch the user so we see the current passwordHash (req.user
    // can be stale after earlier updates in the same session).
    const fresh = await getUserById(reqUser.id);
    if (!fresh) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (fresh.passwordHash) {
      if (!currentPassword) {
        return res
          .status(400)
          .json({ error: "Current password is required" });
      }
      const matches = await comparePasswords(
        currentPassword,
        fresh.passwordHash
      );
      if (!matches) {
        return res
          .status(401)
          .json({ error: "Current password is incorrect" });
      }
      if (newPassword === currentPassword) {
        return res
          .status(400)
          .json({ error: "New password must be different from the current one" });
      }
    }

    const newHash = await hashPassword(newPassword);
    await updateUserPassword(fresh.id, newHash);

    // Best-effort: kill every session that belongs to this user except
    // the one we're currently using.  connect-pg-simple stores the
    // Passport user id at sess.passport.user.  Failures here are
    // logged but do not block the password change.
    const currentSid = (req.session as any)?.id || req.sessionID || null;
    try {
      if (currentSid) {
        await pool.query(
          `DELETE FROM session
             WHERE sess->'passport'->>'user' = $1
               AND sid <> $2`,
          [String(fresh.id), currentSid]
        );
      } else {
        await pool.query(
          `DELETE FROM session
             WHERE sess->'passport'->>'user' = $1`,
          [String(fresh.id)]
        );
      }
    } catch (sessionErr) {
      console.warn(
        "[auth] could not invalidate other sessions after password change:",
        sessionErr
      );
    }

    res.json({ ok: true, hasPassword: true });
  } catch (err) {
    console.error("[auth] change-password error:", err);
    const classified = classifyDbError(err);
    if (classified) {
      return res.status(classified.status).json({ error: classified.error });
    }
    res.status(500).json({ error: "Password change failed" });
  }
});

// ─── Wallet Auth (challenge-response) ────────────────────

router.post("/api/auth/wallet/challenge", async (req, res) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress || typeof walletAddress !== "string" || !walletAddress.startsWith("tz")) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }

    const nonce = await createWalletAuthNonce(walletAddress);
    const message = buildChallengeMessage(nonce);

    res.json({ nonce, message });
  } catch (err) {
    console.error("[auth] wallet challenge error:", err);
    res.status(500).json({ error: "Failed to create challenge" });
  }
});

router.post("/api/auth/wallet/verify", async (req, res) => {
  try {
    const { walletAddress, publicKey, signature, nonce } = req.body;

    console.log("[auth] wallet verify attempt:", {
      walletAddress: walletAddress?.slice(0, 10),
      publicKey: publicKey ? `${publicKey.slice(0, 8)}...(${publicKey.length}c)` : "<empty>",
      signature: signature ? `${signature.slice(0, 8)}...(${signature.length}c)` : "<empty>",
      nonce: nonce?.slice(0, 8),
    });

    if (!walletAddress || !signature || !nonce) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!publicKey) {
      return res.status(400).json({ error: "Wallet did not provide a public key. Please try reconnecting your wallet." });
    }

    const derivedAddress = publicKeyToAddress(publicKey);
    const resolvedAddress = derivedAddress || walletAddress;

    console.log("[auth] resolved address:", resolvedAddress, "derived:", derivedAddress, "client:", walletAddress);

    const valid = await consumeWalletAuthNonce(walletAddress, nonce);
    if (!valid) {
      return res.status(401).json({ error: "Invalid or expired nonce" });
    }

    const message = buildChallengeMessage(nonce);
    const sigValid = verifyWalletSignature(message, signature, publicKey);
    if (!sigValid) {
      console.error("[auth] signature verification failed for", walletAddress, "pk:", publicKey.slice(0, 10));
      return res.status(401).json({ error: "Signature verification failed" });
    }

    let existingUser = await getUserByWalletAddress(resolvedAddress);
    if (!existingUser && resolvedAddress !== walletAddress) {
      existingUser = await getUserByWalletAddress(walletAddress);
    }

    if (existingUser) {
      loginWithSessionRegen(req, existingUser, (err) => {
        if (err) {
          console.error("[auth] wallet login session error:", err);
          return res.status(500).json({ error: "Session creation failed" });
        }
        refreshDossierInBackground(existingUser!.id, "wallet-login");
        res.json({ action: "login", user: toSafeUser(existingUser!) });
      });
    } else {
      res.json({
        action: "register",
        walletAddress: resolvedAddress,
        publicKey,
      });
    }
  } catch (err) {
    console.error("[auth] wallet verify error:", err);
    const classified = classifyDbError(err);
    if (classified) return res.status(classified.status).json({ error: classified.error });
    res.status(500).json({ error: "Wallet verification failed" });
  }
});

router.post("/api/auth/wallet/register", async (req, res) => {
  try {
    const { walletAddress, publicKey, signature, nonce, username, password } = req.body;

    if (!walletAddress || !publicKey || !signature || !nonce || !username) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const normalizedUsername = typeof username === "string" ? username.trim().toLowerCase() : "";
    if (!normalizedUsername || normalizedUsername.length < 3 || normalizedUsername.length > 50) {
      return res.status(400).json({ error: "Username must be 3-50 characters" });
    }

    if (password !== undefined && password !== null && password !== "") {
      const passwordError = validatePassword(password);
      if (passwordError) {
        return res.status(400).json({ error: passwordError });
      }
    }

    const derivedAddr = publicKeyToAddress(publicKey);
    const resolvedAddr = derivedAddr || walletAddress;

    const valid = await consumeWalletAuthNonce(walletAddress, nonce);
    if (!valid) {
      return res.status(401).json({ error: "Invalid or expired nonce" });
    }

    const message = buildChallengeMessage(nonce);
    const sigValid = verifyWalletSignature(message, signature, publicKey);
    if (!sigValid) {
      return res.status(401).json({ error: "Signature verification failed" });
    }

    const existingWalletUser = await getUserByWalletAddress(resolvedAddr) || await getUserByWalletAddress(walletAddress);
    if (existingWalletUser) {
      return res.status(409).json({ error: "Wallet is already linked to an account" });
    }

    const existingName = await getUserByUsername(normalizedUsername);
    if (existingName) {
      return res.status(409).json({ error: "Username already taken" });
    }

    const passwordHash = password ? await hashPassword(password) : undefined;
    const user = await createUser({
      username: normalizedUsername,
      passwordHash,
      displayName: normalizedUsername,
      role: "witness",
    });

    const { db: dbRef } = await import("../db");
    const { userWallets } = await import("@shared/schema");
    await dbRef.insert(userWallets).values({
      userId: user.id,
      walletAddress: resolvedAddr,
      isPrimary: true,
    });

    loginWithSessionRegen(req, user, (err) => {
      if (err) {
        console.error("[auth] wallet register session error:", err);
        return res.status(500).json({ error: "Session creation failed" });
      }
      refreshDossierInBackground(user.id, "wallet-register");
      res.status(201).json({ action: "registered", user: toSafeUser(user) });
    });
  } catch (err) {
    console.error("[auth] wallet register error:", err);
    const classified = classifyDbError(err);
    if (classified) return res.status(classified.status).json({ error: classified.error });
    res.status(500).json({ error: "Registration failed" });
  }
});

if (process.env.GITHUB_CLIENT_ID) {
  router.get(
    "/api/auth/github",
    passport.authenticate("github", { scope: ["user:email"] })
  );
  router.get(
    "/api/auth/github/callback",
    oauthLoginCallback("github", "/dashboard", "/login")
  );
}

if (
  process.env.TWITTER_CONSUMER_KEY?.trim() &&
  process.env.TWITTER_CONSUMER_SECRET?.trim()
) {
  router.get(
    "/api/auth/twitter",
    isAuthenticated,
    passport.authenticate("twitter-verify"),
  );
  router.get(
    "/api/auth/twitter/callback",
    oauthVerifyCallback("twitter-verify", "verified=twitter", "error=twitter"),
  );
} else {
  router.get("/api/auth/twitter", isAuthenticated, (_req, res) => {
    res.redirect(profileRedirect("error=twitter_not_configured"));
  });
  router.get("/api/auth/twitter/callback", (_req, res) => {
    res.redirect(profileRedirect("error=twitter_not_configured"));
  });
}

if (
  process.env.DISCORD_CLIENT_ID?.trim() &&
  process.env.DISCORD_CLIENT_SECRET?.trim()
) {
  router.get(
    "/api/auth/discord",
    isAuthenticated,
    passport.authenticate("discord-verify"),
  );
  router.get(
    "/api/auth/discord/callback",
    oauthVerifyCallback("discord-verify", "verified=discord", "error=discord"),
  );
} else {
  router.get("/api/auth/discord", isAuthenticated, (_req, res) => {
    res.redirect(profileRedirect("error=discord_not_configured"));
  });
  router.get("/api/auth/discord/callback", (_req, res) => {
    res.redirect(profileRedirect("error=discord_not_configured"));
  });
}

export default router;
