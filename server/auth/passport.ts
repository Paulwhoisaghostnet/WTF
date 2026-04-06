import type { Express, Request, Response, NextFunction } from "express";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import MemoryStore from "memorystore";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { pool } from "../db";
import { getUserByUsername, getUserById } from "./storage";
import type { UserRole } from "@shared/types";
import { oauthCallbackUrl } from "./oauth-base";

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
  let store: session.Store;

  if (process.env.DATABASE_URL) {
    const PgStore = connectPgSimple(session);
    store = new PgStore({ pool, createTableIfMissing: true });
  } else {
    const MemStore = MemoryStore(session);
    store = new MemStore({ checkPeriod: 86400000 });
  }

  app.use(
    session({
      store,
      secret: process.env.SESSION_SECRET || "wtf-gameshow-dev-secret",
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
          if (!user || !user.passwordHash) return done(null, false);
          if (!(await comparePasswords(password, user.passwordHash)))
            return done(null, false);
          return done(null, user);
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
    const { Strategy } = await import("passport-google-oauth20");
    passport.use(
      new Strategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          callbackURL: oauthCallbackUrl("/api/auth/google/callback"),
        },
        async (_accessToken, _refreshToken, profile, done) => {
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
            done(err as Error);
          }
        }
      )
    );
  }

  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    const { Strategy } = await import("passport-github2");
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
            done(err as Error);
          }
        }
      )
    );
  }

  if (process.env.TWITTER_CONSUMER_KEY && process.env.TWITTER_CONSUMER_SECRET) {
    const { Strategy } = await import("passport-twitter");
    passport.use(
      "twitter-verify",
      new Strategy(
        {
          consumerKey: process.env.TWITTER_CONSUMER_KEY!,
          consumerSecret: process.env.TWITTER_CONSUMER_SECRET!,
          callbackURL: oauthCallbackUrl("/api/auth/twitter/callback"),
          passReqToCallback: true,
        },
        async (req: any, _token: string, _tokenSecret: string, profile: any, done: (err: Error | null, user?: any) => void) => {
          try {
            if (!req.user) return done(new Error("Must be logged in"));
            const { linkSocialAccount } = await import("./storage");
            const user = await linkSocialAccount(
              req.user.id,
              "twitter",
              profile.id,
              profile.username
            );
            done(null, user);
          } catch (err) {
            done(err as Error);
          }
        }
      )
    );
  }

  if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
    const mod = await import("passport-discord");
    const Strategy = mod.Strategy || mod.default?.Strategy || mod.default;
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
            if (!req.user) return done(new Error("Must be logged in"));
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

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const user = req.user as any;
    if (!roles.includes(user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}
