export type DbHealth = {
  ok: boolean;
  latencyMs: number | null;
  error?: string;
};

export type ContractHealth = {
  ok: boolean;
  network: string;
  tzktBase: string | null;
  tezosRpcUrl: string | null;
  marketplace: string | null;
  barter: string | null;
  inAppMarket: string | null;
  missing: string[];
};

export type JobHealth = {
  ok: boolean;
  registered: number;
  running: number;
  recentErrors: number;
  auditReachable: boolean;
  jobs: Array<{
    name: string;
    intervalMs: number;
    running: boolean;
    lastStartedAt: string | null;
    nextRunAt: string | null;
    latestStatus: string | null;
    latestFinishedAt: string | null;
  }>;
  error?: string;
};

export type HealthSnapshot = {
  status: "ok" | "degraded" | "error";
  ok: boolean;
  service: "wtf-gameshow-api";
  uptime: number;
  version: {
    packageVersion: string | null;
    commitRef: string | null;
    nodeEnv: string | null;
  };
  db: DbHealth;
  chain: ContractHealth;
  jobs: JobHealth;
  timestamp: string;
};

export type HealthDeps = {
  env: NodeJS.ProcessEnv;
  uptime: () => number;
  packageVersion: string | null;
  checkDb: () => Promise<void>;
  listJobs: () => Array<{
    name: string;
    intervalMs: number;
    running: boolean;
    lastStartedAt: Date | string | null;
    nextRunAt?: Date | string | null;
  }>;
  latestPerJob: () => Promise<
    Array<{
      jobName: string;
      status: string;
      finishedAt: Date | string | null;
    }>
  >;
  getContractConfig: () => {
    network: string;
    tzktBase: string;
    marketplace: string | null;
    barter: string | null;
    inAppMarket: string | null;
  };
  now?: () => Date;
};

function isUsableUrl(value: string | null): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readDbHealth(checkDb: () => Promise<void>): Promise<DbHealth> {
  const started = Date.now();
  try {
    await withTimeout(checkDb(), 2_000, "database readiness check");
    return { ok: true, latencyMs: Date.now() - started };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function readContractHealth(deps: HealthDeps): ContractHealth {
  const config = deps.getContractConfig();
  const tezosRpcUrl = (deps.env.TEZOS_RPC_URL || "").trim() || null;
  const missing: string[] = [];

  if (!config.network) missing.push("TEZOS_NETWORK");
  if (!isUsableUrl(config.tzktBase)) missing.push("TZKT_API_URL");
  if (deps.env.NODE_ENV === "production" && !isUsableUrl(tezosRpcUrl)) {
    missing.push("TEZOS_RPC_URL");
  }
  if (!config.marketplace) missing.push("MARKETPLACE_CONTRACT_ADDRESS");
  if (!config.barter) missing.push("BARTER_CONTRACT_ADDRESS");
  if (!config.inAppMarket) missing.push("IN_APP_MARKET_CONTRACT_ADDRESS");

  return {
    ok: missing.length === 0,
    network: config.network,
    tzktBase: config.tzktBase,
    tezosRpcUrl,
    marketplace: config.marketplace,
    barter: config.barter,
    inAppMarket: config.inAppMarket,
    missing,
  };
}

async function readJobHealth(deps: HealthDeps): Promise<JobHealth> {
  try {
    const [jobs, latest] = await Promise.all([
      Promise.resolve(deps.listJobs()),
      withTimeout(deps.latestPerJob(), 2_000, "scheduler audit check"),
    ]);
    const latestByName = new Map(latest.map((row) => [row.jobName, row]));
    const recentErrors = latest.filter((row) => row.status === "error").length;
    const requiresJobs = deps.env.NODE_ENV === "production";
    return {
      ok: (!requiresJobs || jobs.length > 0),
      registered: jobs.length,
      running: jobs.filter((job) => job.running).length,
      recentErrors,
      auditReachable: true,
      jobs: jobs.map((job) => {
        const latestRun = latestByName.get(job.name);
        return {
          name: job.name,
          intervalMs: job.intervalMs,
          running: job.running,
          lastStartedAt: job.lastStartedAt
            ? new Date(job.lastStartedAt).toISOString()
            : null,
          nextRunAt: job.nextRunAt
            ? new Date(job.nextRunAt).toISOString()
            : null,
          latestStatus: latestRun?.status ?? null,
          latestFinishedAt: latestRun?.finishedAt
            ? new Date(latestRun.finishedAt).toISOString()
            : null,
        };
      }),
    };
  } catch (err) {
    return {
      ok: false,
      registered: 0,
      running: 0,
      recentErrors: 0,
      auditReachable: false,
      jobs: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function buildHealthSnapshot(
  deps: HealthDeps
): Promise<HealthSnapshot> {
  const [db, chain, jobs] = await Promise.all([
    readDbHealth(deps.checkDb),
    Promise.resolve(readContractHealth(deps)),
    readJobHealth(deps),
  ]);
  const ok = db.ok && chain.ok && jobs.ok;

  return {
    status: ok ? "ok" : db.ok ? "degraded" : "error",
    ok,
    service: "wtf-gameshow-api",
    uptime: deps.uptime(),
    version: {
      packageVersion: deps.packageVersion,
      commitRef: deps.env.COMMIT_REF ?? null,
      nodeEnv: deps.env.NODE_ENV ?? null,
    },
    db,
    chain,
    jobs,
    timestamp: (deps.now ?? (() => new Date()))().toISOString(),
  };
}
