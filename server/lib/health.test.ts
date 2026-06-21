import assert from "node:assert/strict";
import test from "node:test";
import { buildHealthSnapshot, type HealthDeps } from "./health";

function deps(overrides: Partial<HealthDeps> = {}): HealthDeps {
  const { env: envOverrides, ...rest } = overrides;
  return {
    env: {
      NODE_ENV: "production",
      COMMIT_REF: "abc123",
      TEZOS_RPC_URL: "https://tezos-mainnet.octez.io/",
      ...envOverrides,
    },
    uptime: () => 42,
    packageVersion: "1.0.0-test",
    checkDb: async () => undefined,
    listJobs: () => [
      {
        name: "wallet-events-global",
        intervalMs: 300_000,
        running: false,
        lastStartedAt: new Date("2026-05-11T00:00:00.000Z"),
        nextRunAt: new Date("2026-05-11T00:05:00.000Z"),
      },
    ],
    latestPerJob: async () => [
      {
        jobName: "wallet-events-global",
        status: "success",
        startedAt: new Date("2026-05-11T00:00:00.000Z"),
        finishedAt: new Date("2026-05-11T00:00:01.000Z"),
        durationMs: 1_000,
      },
    ],
    getContractConfig: () => ({
      network: "mainnet",
      tzktBase: "https://api.tzkt.io/v1",
      marketplace: "KT1Jt6gU4fS5UYHdhsYyr2EfpBJtXZLrPPfj",
      barter: "KT1WupvcfcSsfp78JPCc6NwKdkdineGfGNdm",
      inAppMarket: "KT1JYEAg9FSC6mY9KHNR7Z7kpHpwsDnjKkKE",
    }),
    runtime: () => ({
      nodeVersion: "v99.0.0-test",
      platform: "test-os",
      arch: "test-arch",
      pid: 123,
      memory: {
        rssBytes: 10,
        heapUsedBytes: 5,
        heapTotalBytes: 8,
      },
    }),
    now: () => new Date("2026-05-11T00:00:02.000Z"),
    ...rest,
  };
}

test("health snapshot reports db, chain, contract, version, and job readiness", async () => {
  const snapshot = await buildHealthSnapshot(deps());

  assert.equal(snapshot.status, "ok");
  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.version.commitRef, "abc123");
  assert.equal(snapshot.version.packageVersion, "1.0.0-test");
  assert.equal(snapshot.runtime.nodeVersion, "v99.0.0-test");
  assert.equal(snapshot.runtime.memory.rssBytes, 10);
  assert.equal(snapshot.db.ok, true);
  assert.equal(snapshot.chain.ok, true);
  assert.equal(snapshot.chain.network, "mainnet");
  assert.equal(snapshot.chain.marketplace?.startsWith("KT1"), true);
  assert.equal(snapshot.jobs.ok, true);
  assert.equal(snapshot.jobs.registered, 1);
  assert.equal(snapshot.jobs.recentErrors, 0);
  assert.deepEqual(snapshot.jobs.issues, []);
  assert.equal(snapshot.jobs.lastRunAt, "2026-05-11T00:00:01.000Z");
  assert.equal(snapshot.jobs.jobs[0].latestStatus, "success");
  assert.equal(snapshot.jobs.jobs[0].latestStartedAt, "2026-05-11T00:00:00.000Z");
  assert.equal(snapshot.jobs.jobs[0].nextRunAt, "2026-05-11T00:05:00.000Z");
  assert.equal(snapshot.jobs.jobs[0].latestDurationMs, 1_000);
});

test("health snapshot fails closed when production contract or chain config is missing", async () => {
  const snapshot = await buildHealthSnapshot(
    deps({
      env: { NODE_ENV: "production", TEZOS_RPC_URL: "" },
      getContractConfig: () => ({
        network: "mainnet",
        tzktBase: "https://api.tzkt.io/v1",
        marketplace: null,
        barter: null,
        inAppMarket: null,
      }),
    })
  );

  assert.equal(snapshot.ok, false);
  assert.equal(snapshot.status, "degraded");
  assert.deepEqual(snapshot.chain.missing, [
    "TEZOS_RPC_URL",
    "MARKETPLACE_CONTRACT_ADDRESS",
    "BARTER_CONTRACT_ADDRESS",
    "IN_APP_MARKET_CONTRACT_ADDRESS",
  ]);
});

test("health snapshot reports database failure as an error state", async () => {
  const snapshot = await buildHealthSnapshot(
    deps({
      checkDb: async () => {
        throw new Error("database unavailable");
      },
    })
  );

  assert.equal(snapshot.ok, false);
  assert.equal(snapshot.status, "error");
  assert.equal(snapshot.db.ok, false);
  assert.match(snapshot.db.error ?? "", /database unavailable/);
});

test("health snapshot exposes compact job issue summaries", async () => {
  const snapshot = await buildHealthSnapshot(
    deps({
      latestPerJob: async () => [
        {
          jobName: "wallet-events-global",
          status: "error",
          startedAt: new Date("2026-05-11T00:00:00.000Z"),
          finishedAt: new Date("2026-05-11T00:00:01.000Z"),
          durationMs: 1_000,
        },
      ],
    })
  );

  assert.equal(snapshot.jobs.ok, true);
  assert.equal(snapshot.jobs.recentErrors, 1);
  assert.deepEqual(snapshot.jobs.issues, [
    {
      name: "wallet-events-global",
      status: "error",
      message: "latest run failed",
    },
  ]);
});
