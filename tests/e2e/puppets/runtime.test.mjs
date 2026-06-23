import assert from "node:assert/strict";
import test from "node:test";
import { assertPuppetCredentialsMatchTarget } from "./runtime.mjs";

test("rejects localhost puppet credentials for a remote live target", () => {
  assert.throws(
    () =>
      assertPuppetCredentialsMatchTarget(
        { database: { hostname: "localhost", host: "localhost:5432" } },
        "/tmp/e2e-puppets.local.json",
        { targetBaseUrl: "https://wtfos.app" }
      ),
    /Refusing to use local puppet credentials/
  );
});

test("allows localhost puppet credentials for a localhost target", () => {
  assert.doesNotThrow(() =>
    assertPuppetCredentialsMatchTarget(
      { database: { hostname: "localhost", host: "localhost:5432" } },
      "/tmp/e2e-puppets.local.json",
      { targetBaseUrl: "http://127.0.0.1:3307" }
    )
  );
});

test("allows remote puppet credentials for a remote live target", () => {
  assert.doesNotThrow(() =>
    assertPuppetCredentialsMatchTarget(
      { database: { hostname: "prod-db.internal", host: "prod-db.internal:5432" } },
      "/tmp/e2e-puppets.production.json",
      { targetBaseUrl: "https://wtfos.app" }
    )
  );
});

test("allows production docker-network credentials when target metadata matches", () => {
  assert.doesNotThrow(() =>
    assertPuppetCredentialsMatchTarget(
      {
        targetBaseUrl: "https://wtfos.app",
        database: { hostname: "postgres", host: "postgres:5432" },
      },
      "/tmp/e2e-puppets.production.json",
      { targetBaseUrl: "https://wtfos.app" }
    )
  );
});

test("rejects production docker-network credentials when target metadata mismatches", () => {
  assert.throws(
    () =>
      assertPuppetCredentialsMatchTarget(
        {
          targetBaseUrl: "https://staging.wtfos.app",
          database: { hostname: "postgres", host: "postgres:5432" },
        },
        "/tmp/e2e-puppets.production.json",
        { targetBaseUrl: "https://wtfos.app" }
      ),
    /Refusing to use local puppet credentials/
  );
});
