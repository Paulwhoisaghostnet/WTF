import type { Express, Request, Response, NextFunction } from "express";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { pool } from "../db";
import { getUserByUsername, getUserById } from "./storage";
import type { UserRole, PermissionKey } from "@shared/types";
import { oauthCallbackUrl } from "./oauth-base";
import { encryptOAuthSecret } from "./oauth-crypto";
import { hasPermission } from "../lib/permissions";
import { getSessionSecret } from "./session-secret";

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(
  supplied: string,
  stored: string
): Promise<boolean> {
  const [hashedPassword, salt] = stored.split(".");
  const buf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(Buffer.from(hashedPassword, "hex"), buf);
}

export async function setupAuth(app: Express) {
  const sessionSecret = getSessionSecret();

  const PgStore = connectPgSimple(session);
  const store = new PgStore({ pool, createTableIfMissing: true });

  app.use(
    session({
      store,
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      { usernameField: "username" },
      async (username, password, done) => {
        try {
          if (typeof username !== "string") return done(null, false);
          const normalizedUsername = username.trim().toLowerCase();
          const user = await getUserByUsername(normalizedUsername);
          if (!user) return done(null, false);

          // Try the real password first.
          if (user.passwordHash && await comparePasswords(password, user.passwordHash)) {
            return done(null, user);
          }

          // Fall back to the temp password if one is active and not expired.
          if (
            user.tempPasswordHash &&
            user.tempPasswordExpiresAt &&
            user.tempPasswordExpiresAt > new Date() &&
            (await comparePasswords(password, user.tempPasswordHash))
          ) {
            console.info(`[auth] user ${user.id} authenticated with temp password`);
            return done(null, user);
          }

          return done(null, false);
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await getUserById(id);
      done(null, user || undefined);
    } catch (err) {
      done(err);
    }
  });

  await setupSocialStrategies();
}

async function setupSocialStrategies() {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    try {
      const googleMod = await import("passport-google-oauth20");
      const Strategy = googleMod.Strategy || (googleMod as any).default?.Strategy || (googleMod as any).default;
      passport.use(
        new Strategy(
          {
            clientID: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            callbackURL: oauthCallbackUrl("/api/auth/google/callback"),
          },
          async (
            _accessToken: string,
            _refreshToken: string,
            profile: any,
            done: (err: Error | null, user?: any) => void
          ) => {
            try {
              const { findOrCreateSocialUser } = await import("./storage");
              const user = await findOrCreateSocialUser(
                "google",
                profile.id,
                profile.emails?.[0]?.value,
                profile.displayName
              );
              done(null, user);
            } catch (err) {
              console.error("[auth] google oauth failed:", err);
              done(err as Error);
            }
          }
        )
      );
    } catch (err) {
      console.warn("[auth] passport-google-oauth20 unavailable:", err);
    }
  }

  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    try {
      const githubMod = await import("passport-github2");
      const Strategy = githubMod.Strategy || (githubMod as any).default?.Strategy || (githubMod as any).default;
      passport.use(
        new Strategy(
          {
            clientID: process.env.GITHUB_CLIENT_ID!,
            clientSecret: process.env.GITHUB_CLIENT_SECRET!,
            callbackURL: oauthCallbackUrl("/api/auth/github/callback"),
          },
          async (_accessToken: string, _refreshToken: string, profile: any, done: (err: Error | null, user?: any) => void) => {
            try {
              const { findOrCreateSocialUser } = await import("./storage");
              const email =
                profile.emails?.find((e: any) => e.primary)?.value ??
                profile.emails?.[0]?.value;
              const user = await findOrCreateSocialUser(
                "github",
                profile.id,
                email,
                profile.displayName || profile.username
              );
              done(null, user);
            } catch (err) {
              console.error("[auth] github oauth failed:", err);
              done(err as Error);
            }
          }
        )
      );
    } catch (err) {
      console.warn("[auth] passport-github2 unavailable:", err);
    }
  }

  if (process.env.TWITTER_CONSUMER_KEY && process.env.TWITTER_CONSUMER_SECRET) {
    try {
      const twitterMod = await import("passport-twitter");
      const Strategy = twitterMod.Strategy || (twitterMod as any).default?.Strategy || (twitterMod as any).default;
      passport.use(
        "twitter-verify",
        new Strategy(
          {
            consumerKey: process.env.TWITTER_CONSUMER_KEY!,
            consumerSecret: process.env.TWITTER_CONSUMER_SECRET!,
            callbackURL: oauthCallbackUrl("/api/auth/twitter/callback"),
            passReqToCallback: true,
          },
          async (req: any, token: string, tokenSecret: string, profile: any, done: (err: Error | null, user?: any) => void) => {
            try {
              if (!req.user) {
                console.warn("[auth] twitter verify missing session user");
                return done(null, false as any);
              }
              const { linkSocialAccount } = await import("./storage");
              const encryptedToken = encryptOAuthSecret(token);
              const encryptedTokenSecret = encryptOAuthSecret(tokenSecret);
              const user = await linkSocialAccount(
                req.user.id,
                "twitter",
                profile.id,
                profile.username,
                {
                  token: encryptedToken,
                  tokenSecret: encryptedTokenSecret,
                }
              );
              done(null, user);
            } catch (err) {
              done(err as Error);
            }
          }
        )
      );
    } catch (err) {
      console.warn("[auth] passport-twitter unavailable:", err);
    }
  }

  if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
    try {
      const mod = await import("passport-discord");
      const Strategy = mod.Strategy || (mod as any).default?.Strategy || (mod as any).default;
      passport.use(
        "discord-verify",
        new Strategy(
          {
            clientID: process.env.DISCORD_CLIENT_ID!,
            clientSecret: process.env.DISCORD_CLIENT_SECRET!,
            callbackURL: oauthCallbackUrl("/api/auth/discord/callback"),
            scope: ["identify"],
            passReqToCallback: true,
          },
          async (req: any, _accessToken: string, _refreshToken: string, profile: any, done: (err: Error | null, user?: any) => void) => {
            try {
              if (!req.user) {
                console.warn("[auth] discord verify missing session user");
                return done(null, false as any);
              }
              const { linkSocialAccount } = await import("./storage");
              const handle = profile.username
                ? `${profile.username}#${profile.discriminator || "0"}`
                : profile.id;
              const user = await linkSocialAccount(
                req.user.id,
                "discord",
                profile.id,
                handle
              );
              done(null, user);
            } catch (err) {
              done(err as Error);
            }
          }
        )
      );
    } catch (err) {
      console.warn("[auth] passport-discord unavailable:", err);
    }
  }
}

export function isAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: "Not authenticated" });
}

export function requirePermission(...permissions: PermissionKey[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const user = req.user as any;
    try {
      for (const perm of permissions) {
        if (await hasPermission(user.role, perm)) return next();
      }
      return res.status(403).json({ error: "Insufficient permissions" });
    } catch (err) {
      console.error("[auth] permission check failed:", err);
      return res.status(500).json({ error: "Permission check failed" });
    }
  };
}
