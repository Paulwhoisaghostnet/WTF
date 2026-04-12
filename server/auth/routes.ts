import { Router, type Request, type Response, type NextFunction } from "express";
import passport from "passport";
import { hashPassword, isAuthenticated } from "./passport";
import {
  createUser,
  getUserByUsername,
  getUserByEmail,
  getUserByWalletAddress,
  createWalletAuthNonce,
  consumeWalletAuthNonce,
} from "./storage";
import { classifyDbError } from "../errors/db-errors";
import { getPublicSiteOrigin } from "./oauth-base";
import {
  buildChallengeMessage,
  verifyWalletSignature,
  verifyPublicKeyOwnership,
} from "./wallet-verify";

const router = Router();

function toSafeUser(user: any) {
  if (!user) return user;
  const {
    passwordHash: _passwordHash,
    twitterOauthToken: _twitterOauthToken,
    twitterOauthTokenSecret: _twitterOauthTokenSecret,
    ...safe
  } = user;
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
      req.login(user, (loginErr) => {
        if (loginErr) {
          console.error(`[auth] ${strategy} callback login error:`, loginErr);
          return res.redirect(profileRedirect(failureQuery));
        }
        return res.redirect(profileRedirect(successQuery));
      });
    })(req, res, next);
  };
}

/** Public: which social link flows are available (for Profile UI). */
router.get("/api/auth/social/config", (_req, res) => {
  res.json({
    twitter:
      Boolean(
        process.env.TWITTER_CONSUMER_KEY?.trim() &&
          process.env.TWITTER_CONSUMER_SECRET?.trim(),
      ),
    discord:
      Boolean(
        process.env.DISCORD_CLIENT_ID?.trim() &&
          process.env.DISCORD_CLIENT_SECRET?.trim(),
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
    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
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

    req.login(user, (err) => {
      if (err) return res.status(500).json({ error: "Login failed" });
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
      req.login(user, (loginErr) => {
        if (loginErr) {
          console.error("[auth] session login error:", loginErr);
          const classified = classifyDbError(loginErr);
          if (classified) {
            return res.status(classified.status).json({ error: classified.error });
          }
          return res.status(500).json({ error: "Session creation failed" });
        }
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

router.get("/api/auth/user", isAuthenticated, (req, res) => {
  const user = req.user as any;
  res.json(toSafeUser(user));
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

    if (!walletAddress || !publicKey || !signature || !nonce) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!verifyPublicKeyOwnership(walletAddress, publicKey)) {
      return res.status(401).json({ error: "Public key does not match wallet address" });
    }

    const valid = await consumeWalletAuthNonce(walletAddress, nonce);
    if (!valid) {
      return res.status(401).json({ error: "Invalid or expired nonce" });
    }

    const message = buildChallengeMessage(nonce);
    const sigValid = verifyWalletSignature(message, signature, publicKey);
    if (!sigValid) {
      return res.status(401).json({ error: "Signature verification failed" });
    }

    const existingUser = await getUserByWalletAddress(walletAddress);

    if (existingUser) {
      req.login(existingUser, (err) => {
        if (err) {
          console.error("[auth] wallet login session error:", err);
          return res.status(500).json({ error: "Session creation failed" });
        }
        res.json({ action: "login", user: toSafeUser(existingUser) });
      });
    } else {
      res.json({
        action: "register",
        walletAddress,
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

    if (!verifyPublicKeyOwnership(walletAddress, publicKey)) {
      return res.status(401).json({ error: "Public key does not match wallet address" });
    }

    const valid = await consumeWalletAuthNonce(walletAddress, nonce);
    if (!valid) {
      return res.status(401).json({ error: "Invalid or expired nonce" });
    }

    const message = buildChallengeMessage(nonce);
    const sigValid = verifyWalletSignature(message, signature, publicKey);
    if (!sigValid) {
      return res.status(401).json({ error: "Signature verification failed" });
    }

    const existingWalletUser = await getUserByWalletAddress(walletAddress);
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
      walletAddress,
      isPrimary: true,
    });

    req.login(user, (err) => {
      if (err) {
        console.error("[auth] wallet register session error:", err);
        return res.status(500).json({ error: "Session creation failed" });
      }
      res.status(201).json({ action: "registered", user: toSafeUser(user) });
    });
  } catch (err) {
    console.error("[auth] wallet register error:", err);
    const classified = classifyDbError(err);
    if (classified) return res.status(classified.status).json({ error: classified.error });
    res.status(500).json({ error: "Registration failed" });
  }
});

if (process.env.GOOGLE_CLIENT_ID) {
  router.get(
    "/api/auth/google",
    passport.authenticate("google", { scope: ["profile", "email"] })
  );
  router.get(
    "/api/auth/google/callback",
    passport.authenticate("google", {
      successRedirect: "/dashboard",
      failureRedirect: "/login",
    })
  );
}

if (process.env.GITHUB_CLIENT_ID) {
  router.get(
    "/api/auth/github",
    passport.authenticate("github", { scope: ["user:email"] })
  );
  router.get(
    "/api/auth/github/callback",
    passport.authenticate("github", {
      successRedirect: "/dashboard",
      failureRedirect: "/login",
    })
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
