import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import {
  COCKPIT_SYNC_STATUS_REFRESH_MS,
  cockpitChallengesQueryOptions,
  cockpitQueryKeys,
  cockpitSyncStatusQueryOptions,
  subscribeCockpitSyncStatusPolling,
} from "./cockpit-queries";

const dashboard = readFileSync("client/src/pages/Dashboard.tsx", "utf8");
const missionControl = readFileSync("client/src/pages/MissionControl.tsx", "utf8");

test("Dashboard and Mission Control share the cockpit read hooks", () => {
  for (const source of [dashboard, missionControl]) {
    assert.match(source, /useCockpitChallengesQuery\(\)/);
    assert.match(source, /useCockpitSyncStatusQuery\(\)/);
    assert.doesNotMatch(source, /api\.get<[^>]*>\("\/api\/challenges"\)/);
    assert.doesNotMatch(source, /"\/api\/cockpit\/sync\/status"/);
  }
});

test("the shared query identities coalesce concurrent endpoint reads", async (t) => {
  const originalFetch = globalThis.fetch;
  const requestCounts = new Map<string, number>();

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const path = String(input);
    requestCounts.set(path, (requestCounts.get(path) ?? 0) + 1);
    const body = path.endsWith("/api/challenges") ? [] : { jobs: [] };
    return new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  assert.deepEqual(
    cockpitChallengesQueryOptions().queryKey,
    cockpitQueryKeys.challenges
  );
  assert.deepEqual(
    cockpitSyncStatusQueryOptions().queryKey,
    cockpitQueryKeys.syncStatus
  );

  await Promise.all([
    queryClient.fetchQuery(cockpitChallengesQueryOptions()),
    queryClient.fetchQuery(cockpitChallengesQueryOptions()),
  ]);
  await Promise.all([
    queryClient.fetchQuery(cockpitSyncStatusQueryOptions()),
    queryClient.fetchQuery(cockpitSyncStatusQueryOptions()),
  ]);

  assert.equal(requestCounts.get("/api/challenges"), 1);
  assert.equal(requestCounts.get("/api/cockpit/sync/status"), 1);
});

test("staggered sync observers share one network read per existing cadence", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = 1_000_000;
  let requests = 0;

  Date.now = () => now;
  globalThis.fetch = (async () => {
    requests += 1;
    return new Response(JSON.stringify({ jobs: [] }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  }) as typeof fetch;
  t.after(() => {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
  });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  await queryClient.fetchQuery(cockpitSyncStatusQueryOptions());
  now += 30_000;
  await queryClient.fetchQuery(cockpitSyncStatusQueryOptions());
  assert.equal(requests, 1);

  now += 30_001;
  await queryClient.fetchQuery(cockpitSyncStatusQueryOptions());
  assert.equal(requests, 2);
});

test("mounted sync consumers share one cadence timer per QueryClient", () => {
  const queryClient = new QueryClient();
  let scheduled = 0;
  let cleared = 0;
  let scheduledDelay = 0;
  const handle = 7 as unknown as ReturnType<typeof globalThis.setInterval>;
  const scheduler = {
    setInterval: (_callback: () => void, delayMs: number) => {
      scheduled += 1;
      scheduledDelay = delayMs;
      return handle;
    },
    clearInterval: (received: ReturnType<typeof globalThis.setInterval>) => {
      assert.equal(received, handle);
      cleared += 1;
    },
  };

  const unsubscribeDashboard = subscribeCockpitSyncStatusPolling(
    queryClient,
    scheduler
  );
  const unsubscribeMissionControl = subscribeCockpitSyncStatusPolling(
    queryClient,
    scheduler
  );

  assert.equal(scheduled, 1);
  assert.equal(scheduledDelay, COCKPIT_SYNC_STATUS_REFRESH_MS);
  unsubscribeDashboard();
  assert.equal(cleared, 0);
  unsubscribeMissionControl();
  assert.equal(cleared, 1);
  unsubscribeMissionControl();
  assert.equal(cleared, 1);
});
