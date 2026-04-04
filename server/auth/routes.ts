import { Router } from "express";
import passport from "passport";
import { hashPassword, isAuthenticated } from "./passport";
import { createUser, getUserByUsername, getUserByEmail } from "./storage";
import { classifyDbError } from "../errors/db-errors";

const router = Router();

router.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;

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
      if (err) return next(err);
      if (!user)
        return res.status(401).json({ error: "Invalid credentials" });
      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        const { passwordHash: _, ...safeUser } = user;
        res.json(safeUser);
      });
    }
  )(req, res, next);
});

router.post("/api/auth/logout", (req, res) => {
  req.logout(() => {
    res.json({ ok: true });
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

export default router;
