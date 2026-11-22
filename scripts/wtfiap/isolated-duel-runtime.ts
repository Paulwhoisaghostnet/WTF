import { readFile } from "node:fs/promises";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import pg from "pg";
import { and, eq } from "drizzle-orm";
import { canOpenAppsForRole } from "@shared/types";
import { userWallets } from "@shared/schema";
import { setupAuth } from "../../server/auth/passport";
import { db, pool as platformPool } from "../../server/db";
import { canonicalDomainRedirectMiddleware } from "../../server/lib/canonical-domain";
import { allowedOriginsForRuntime, corsOptionsFor } from "../../server/lib/cors-origins";
import { createRateLimit } from "../../server/lib/create-rate-limit";
import { csrfProtection } from "../../server/lib/csrf";
import { getDesktopAppConfig } from "../../server/lib/desktop-apps";
import { createNotificationsForUsers } from "../../server/lib/notifications";
import { authenticatePublicApi, publicApiRateLimitKey, rewritePublicApiVersion } from "../../server/lib/public-api";
import { listRolesForUserSnapshot } from "../../server/lib/user-roles";
import { createIsolatedDuelAuthority } from "../../server/features/wtfiap/isolated-duel-authority";

function required(value: string | undefined, name: string) {
  if (!value?.trim()) throw new Error(`Missing ${name}.`);
  return value;
}

async function main() {
  const escrowConnectionString = required(process.env.WTFIAP_ISOLATED_DUEL_DB_URL, "isolated escrow database URL");
  const dataDir = required(process.env.WTFIAP_DATA_DIR, "isolated room data directory");
  const policyPath = required(process.env.WTFIAP_ISOLATED_DUEL_POLICY, "isolated admission policy path");
  const protectedRoomCode = required(process.env.WTFIAP_PROTECTED_DUEL, "protected Duel UUID");
  const port = Number(required(process.env.PORT, "isolated authority port"));
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error("Invalid isolated authority port.");

  const scope = await platformPool.query(`
    SELECT current_database() AS database_name, current_user AS role_name,
      has_table_privilege(current_user, 'public.wtfiap_open_duels', 'SELECT,INSERT,UPDATE,DELETE') AS legacy_access,
      has_table_privilege(current_user, 'public.wtfiap_funded_rooms', 'SELECT,INSERT,UPDATE,DELETE') AS funded_access,
      has_table_privilege(current_user, 'public.wtfiap_sponsor_funding', 'SELECT,INSERT,UPDATE,DELETE') AS sponsor_access
  `);
  const platform = scope.rows[0];
  if (!platform || platform.legacy_access || platform.funded_access || platform.sponsor_access) {
    throw new Error("The platform identity role may not access any legacy escrow table.");
  }

  const escrowPool = new pg.Pool({ connectionString: escrowConnectionString, options: "-c search_path=duel_authority" });
  try {
    const escrow = (await escrowPool.query("SELECT current_database() AS database_name, current_user AS role_name")).rows[0];
    if (!escrow || escrow.database_name === platform.database_name || escrow.role_name === platform.role_name) {
      throw new Error("The isolated authority requires a distinct escrow database and role.");
    }
    const canAccess: Parameters<typeof createIsolatedDuelAuthority>[0]["canAccess"] = async request => {
      const apps = await getDesktopAppConfig();
      return apps.wtfiap === true && canOpenAppsForRole(request.user ? await listRolesForUserSnapshot(request.user) : null);
    };
    const authority = await createIsolatedDuelAuthority({
      pool: escrowPool,
      database: "wtfiap_isolated_duels",
      schema: "duel_authority",
      dataDir,
      protectedRoomCode,
      canAccess,
      canAdmit: async network => {
        const policy: unknown = JSON.parse(await readFile(policyPath, "utf8"));
        if (!Array.isArray(policy) || !policy.every(value => value === "mainnet" || value === "shadownet")) return false;
        return policy.includes(network);
      },
      linkedWallet: async (userId, address) => {
        const id = Number(userId);
        if (!Number.isSafeInteger(id) || id <= 0) return false;
        const rows = await db.select({ userId: userWallets.userId }).from(userWallets)
          .where(and(eq(userWallets.userId, id), eq(userWallets.walletAddress, address))).limit(1);
        return rows.length === 1;
      },
      onPreparationOpened: async ({ roomCode, roundNumber, recipients }) => {
        await createNotificationsForUsers(recipients.map(recipient => Number(recipient.userId)), {
          eventKey: `wtfiap.turn.${roomCode}.${roundNumber}`,
          title: "Your coLILseum turn is ready",
          body: `Round ${roundNumber} is open. Return to your room to shop, arrange your lineup, and mark ready.`,
          metadata: { route: `/colilseum/${roomCode}`, roomCode, roundNumber, action: "return-to-room" },
          preferenceKey: "game_turn_alerts",
        });
      },
    });

    const app = express();
    app.set("trust proxy", 1);
    app.use(canonicalDomainRedirectMiddleware);
    app.use(rewritePublicApiVersion);
    app.use(helmet({ crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: { policy: "same-site" } }));
    app.use(cors(corsOptionsFor(allowedOriginsForRuntime())));
    // The native authority's existing JSON boundary and API quota also apply
    // here. Preserve exact signed-in session and versioned bearer processing.
    app.use(express.json({
      limit: process.env.JSON_BODY_LIMIT || "10mb",
      verify: (request, _response, buffer) => { Object.assign(request, { rawBody: buffer.toString("utf8") }); },
    }));
    app.use("/api/", createRateLimit({
      name: "api-generic", windowMs: 60_000, max: 200,
      keyGenerator: request => publicApiRateLimitKey(request) || request.ip || "anonymous",
      message: { error: "Too many requests, please try again later" },
    }));
    await setupAuth(app);
    app.use(authenticatePublicApi);
    app.use(csrfProtection);
    // Private listener health is deliberately outside the public ingress map.
    app.get("/internal/isolated-duel/ready", (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.json({ status: "ready", health: authority.health });
    });
    app.use(authority.handler);
    app.use((_request, response) => response.status(404).json({ ok: false, reason: "Unknown isolated Duel route." }));
    app.use((error: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) => {
      if (response.headersSent) return next(error);
      const status = error instanceof Error && error.message.startsWith("Origin not allowed by CORS") ? 403 : 500;
      response.status(status).json({ ok: false, reason: "The isolated Duel request could not be completed." });
    });

    const listener = app.listen(port, "0.0.0.0", () => console.log("Isolated coLILseum Duel authority listening."));
    listener.once("error", async error => {
      console.error("Isolated coLILseum listener failed:", (error as NodeJS.ErrnoException).code);
      await authority.close();
      await Promise.all([escrowPool.end(), platformPool.end()]);
      process.exitCode = 1;
    });
    let closing = false;
    const close = async () => {
      if (closing) return;
      closing = true;
      const stopped = new Promise<void>(resolve => listener.close(() => resolve()));
      await authority.close();
      await stopped;
      await Promise.all([escrowPool.end(), platformPool.end()]);
    };
    for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => void close().catch(() => { process.exitCode = 1; }));
  } catch (error) {
    await escrowPool.end();
    throw error;
  }
}

void main().catch(error => {
  console.error("Isolated coLILseum Duel authority startup failed:", error instanceof Error ? error.message : "unknown error");
  void platformPool.end().finally(() => { process.exitCode = 1; });
});
