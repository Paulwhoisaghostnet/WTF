import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";

process.env.DATABASE_URL ||= "postgresql://wtf:wtf@127.0.0.1:1/wtf";

test("30-day login query counts distinct accounts from successful auth sessions", async () => {
  const { loginAccounts30dQuery, LOGIN_ACCOUNTS_WINDOW_DAYS } = await import("./desktop-login-accounts");
  const query = loginAccounts30dQuery().toSQL();

  assert.equal(LOGIN_ACCOUNTS_WINDOW_DAYS, 30);
  assert.match(query.sql, /count\(distinct "user_id"\)::int/);
  assert.match(query.sql, /from "challenge_system_events"/);
  assert.match(query.sql, /"source" = \$1/);
  assert.match(query.sql, /"event_type" in \(\$2, \$3\)/);
  assert.match(query.sql, /"occurred_at" >= now\(\) - \(\$4 \* interval '1 day'\)/);
  assert.match(query.sql, /"occurred_at" <= now\(\)/);
  assert.deepEqual(query.params, [
    "auth",
    "auth.login.succeeded",
    "auth.register.succeeded",
    LOGIN_ACCOUNTS_WINDOW_DAYS,
  ]);
});

test("desktop login-account count rejects anonymous requests before querying", async (t) => {
  const { default: desktopRoutes } = await import("../routes/desktop");
  const app = express();
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => false) as typeof req.isAuthenticated;
    next();
  });
  app.use(desktopRoutes);

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const address = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${address.port}/api/desktop/login-accounts-30d`);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Not authenticated" });
});
