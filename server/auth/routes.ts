import { Router } from "express";
import passport from "passport";
import { hashPassword, isAuthenticated } from "./passport";
import { createUser, getUserByUsername, getUserByEmail } from "./storage";
import { classifyDbError } from "../errors/db-errors";
import { getPublicSiteOrigin } from "./oauth-base";

const router = Router();

function profileRedirect(query: string): string {
  const base = getPublicSiteOrigin();
  return base ? `${base}/profile?${query}` : `/profile?${query}`;
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
      const { passwordHash: _, ...safeUser } = user;
      res.status(201).json(safeUser);
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
        const { passwordHash: _, ...safeUser } = user;
        res.json(safeUser);
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
  const { passwordHash: _, ...safeUser } = user;
  res.json(safeUser);
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
    passport.authenticate("twitter-verify", {
      successRedirect: profileRedirect("verified=twitter"),
      failureRedirect: profileRedirect("error=twitter"),
    }),
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
    passport.authenticate("discord-verify", {
      successRedirect: profileRedirect("verified=discord"),
      failureRedirect: profileRedirect("error=discord"),
    }),
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
