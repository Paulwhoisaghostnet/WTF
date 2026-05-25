import type { Express, Request, Response, NextFunction } from "express";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as OAuth2Strategy } from "passport-oauth2";
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
import { listRolesForUserSnapshot } from "../lib/user-roles";
import { getSessionSecret } from "./session-secret";
import {
  legacyTwitterOAuthConfigured,
  legacyTwitterOAuthEnabled,
  legacyTwitterOAuthPackageAvailable,
} from "./twitter-legacy";

const scryptAsync = promisify(scrypt);
const GITHUB_AUTHORIZATION_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";
const GITHUB_EMAILS_URL = "https://api.github.com/user/emails";
const DISCORD_AUTHORIZATION_URL = "https://discord.com/oauth2/authorize";
const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
const DISCORD_USER_URL = "https://discord.com/api/users/@me";

type OAuthProfile = {
  provider: "github" | "discord";
  id: string;
  username?: string | null;
  displayName?: string | null;
  emails?: Array<{ value?: string | null; primary?: boolean | null }>;
  discriminator?: string | null;
};

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
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    passport.use(createGithubStrategy());
  }

  if (legacyTwitterOAuthEnabled()) {
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
  } else if (legacyTwitterOAuthConfigured()) {
    const packageHint = legacyTwitterOAuthPackageAvailable()
      ? "Set ENABLE_LEGACY_TWITTER_OAUTH=1 to re-enable the deprecated flow."
      : "The deprecated passport-twitter package is not installed; use OAuth 2 or add an audited replacement before re-enabling.";
    console.warn(
      "[auth] legacy Twitter OAuth 1.0a credentials are configured but disabled. " +
        packageHint
    );
  }

  if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
    passport.use("discord-verify", createDiscordStrategy());
  }
}

function createGithubStrategy() {
  const strategy = new OAuth2Strategy(
    {
      authorizationURL: GITHUB_AUTHORIZATION_URL,
      tokenURL: GITHUB_TOKEN_URL,
      clientID: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      callbackURL: oauthCallbackUrl("/api/auth/github/callback"),
    },
    async (
      _accessToken: string,
      _refreshToken: string,
      profile: OAuthProfile,
      done: (err: Error | null, user?: any) => void
    ) => {
      try {
        const { findOrCreateSocialUser } = await import("./storage");
        const email =
          profile.emails?.find((e) => e.primary)?.value ??
          profile.emails?.[0]?.value ??
          undefined;
        const user = await findOrCreateSocialUser(
          "github",
          profile.id,
          email,
          profile.displayName || profile.username || profile.id
        );
        done(null, user);
      } catch (err) {
        console.error("[auth] github oauth failed:", err);
        done(err as Error);
      }
    }
  );

  strategy.userProfile = async (accessToken: string, done: (err?: Error | null, profile?: OAuthProfile) => void) => {
    try {
      const profile = await fetchGithubProfile(accessToken);
      done(null, profile);
    } catch (err) {
      done(err as Error);
    }
  };

  return strategy;
}

function createDiscordStrategy() {
  const strategy = new OAuth2Strategy(
    {
      authorizationURL: DISCORD_AUTHORIZATION_URL,
      tokenURL: DISCORD_TOKEN_URL,
      clientID: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      callbackURL: oauthCallbackUrl("/api/auth/discord/callback"),
      scope: ["identify", "guilds", "guilds.members.read", "role_connections.write"],
      passReqToCallback: true,
    } as any,
    async (
      req: any,
      _accessToken: string,
      _refreshToken: string,
      _params: unknown,
      profile: OAuthProfile,
      done: (err: Error | null, user?: any) => void
    ) => {
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
  );

  strategy.userProfile = async (accessToken: string, done: (err?: Error | null, profile?: OAuthProfile) => void) => {
    try {
      const profile = await fetchDiscordProfile(accessToken);
      done(null, profile);
    } catch (err) {
      done(err as Error);
    }
  };

  return strategy;
}

async function fetchGithubProfile(accessToken: string): Promise<OAuthProfile> {
  const user = await oauthJson<any>(GITHUB_USER_URL, accessToken, {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  });
  let emails: Array<{ value?: string | null; primary?: boolean | null }> = [];
  try {
    const rows = await oauthJson<any[]>(GITHUB_EMAILS_URL, accessToken, {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    });
    emails = Array.isArray(rows)
      ? rows
          .filter((row) => row?.email)
          .map((row) => ({ value: String(row.email), primary: Boolean(row.primary) }))
      : [];
  } catch (err) {
    console.warn("[auth] github email fetch failed:", err);
  }

  if (!emails.length && user?.email) {
    emails = [{ value: String(user.email), primary: true }];
  }

  return {
    provider: "github",
    id: String(user.id),
    username: user.login ? String(user.login) : null,
    displayName: user.name ? String(user.name) : user.login ? String(user.login) : null,
    emails,
  };
}

async function fetchDiscordProfile(accessToken: string): Promise<OAuthProfile> {
  const user = await oauthJson<any>(DISCORD_USER_URL, accessToken);
  return {
    provider: "discord",
    id: String(user.id),
    username: user.username ? String(user.username) : null,
    displayName: user.global_name ? String(user.global_name) : user.username ? String(user.username) : null,
    discriminator: user.discriminator ? String(user.discriminator) : null,
  };
}

async function oauthJson<T>(
  url: string,
  accessToken: string,
  headers: Record<string, string> = {}
): Promise<T> {
  const response = await fetch(url, {
    headers: {
      ...headers,
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "WTFGameshow/1.0",
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OAuth profile fetch failed ${response.status}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) as T : {} as T;
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
      const roles = await listRolesForUserSnapshot(user);
      for (const perm of permissions) {
        if (await hasPermission(roles, perm)) return next();
      }
      return res.status(403).json({ error: "Insufficient permissions" });
    } catch (err) {
      console.error("[auth] permission check failed:", err);
      return res.status(500).json({ error: "Permission check failed" });
    }
  };
}
