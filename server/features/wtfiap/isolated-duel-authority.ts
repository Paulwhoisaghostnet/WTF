import { createRequire } from "node:module";
import { lstat, open, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import type { Request, RequestHandler } from "express";
import type { Pool, PoolClient } from "pg";
import { createOpenDuelHandler } from "./open-duel-http";
import { monitorFundingHeads, NETWORKS, rpcEndpoints } from "./funding-contract";
import type { createOpenDuelService, openDuelConfigs } from "./open-duel";
import type { FundingGame } from "./funding";

const PARTY = "/api/wtfiap/party";
const OPEN = "/api/wtfiap/open-duel";
const BINDING = ".isolated-duel-authority";
const UUID = "[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}";
const ROOM_CODE = new RegExp(`^${UUID}$`);
const ROOM_FILE = new RegExp(`^${UUID}\\.json$`);
const PARTY_ROOM = new RegExp(`^${PARTY}/rooms/(${UUID})(?:/[a-z-]+)?$`);
const OPEN_ROOM = new RegExp(`^${OPEN}/rooms/(${UUID})(?:/[A-Za-z0-9/-]+)?$`);
const requireFromRepo = createRequire(path.resolve("package.json"));

type Network = keyof typeof NETWORKS;
type Configs = ReturnType<typeof openDuelConfigs>;
type OpenDuelOptions = Parameters<typeof createOpenDuelService>[0];
type PreparationOpened = (event: {
  roomCode: string;
  roundNumber: number;
  recipients: Array<{ userId: string; playerId: string }>;
}) => Promise<void>;

type IsolatedAuthority = {
  ready: Promise<unknown>;
  handler: RequestHandler;
  funding: OpenDuelOptions["game"] & FundingGame;
  close(): Promise<void>;
};

export type IsolatedDuelOptions = {
  pool: Pool;
  database: string;
  schema: string;
  dataDir: string;
  protectedRoomCode?: string;
  configs?: Configs;
  env?: NodeJS.ProcessEnv;
  canAccess(request: Request): boolean | Promise<boolean>;
  canAdmit(network: Network): boolean | Promise<boolean>;
  linkedWallet: OpenDuelOptions["linkedWallet"];
  adapters?: OpenDuelOptions["adapters"];
  blockDelays?: Partial<Record<Network, number>>;
  onPreparationOpened?: PreparationOpened;
  onError?: (error: unknown) => void;
};

async function acquireIsolatedStore({ pool, database, schema }: IsolatedDuelOptions): Promise<PoolClient> {
  if (!schema || schema === "public" || schema.startsWith("pg_")) {
    throw new Error("An explicitly isolated Open Duel schema is required.");
  }
  const client = await pool.connect();
  try {
    const result = await client.query<{
      databaseName: string;
      schemas: string[];
      scopedRole: boolean;
      isolatedTable: boolean;
      ownTableWritable: boolean;
      otherEscrowPrivileges: boolean;
    }>(`SELECT current_database()::text AS "databaseName",
      current_schemas(false)::text[] AS schemas,
      (current_user = session_user AND NOT roles.rolsuper AND NOT roles.rolbypassrls
        AND NOT roles.rolcreaterole) AS "scopedRole",
      COALESCE(to_regclass('wtfiap_open_duels') = own.oid, false) AS "isolatedTable",
      COALESCE(has_table_privilege(current_user, own.oid, 'SELECT')
        AND has_table_privilege(current_user, own.oid, 'INSERT')
        AND has_table_privilege(current_user, own.oid, 'UPDATE'), false) AS "ownTableWritable",
      EXISTS (SELECT 1 FROM pg_class other JOIN pg_namespace namespace ON namespace.oid = other.relnamespace
        WHERE other.relname IN ('wtfiap_open_duels', 'wtfiap_funded_rooms', 'wtfiap_sponsor_funding')
          AND (namespace.nspname <> $1 OR other.relname <> 'wtfiap_open_duels')
          AND (has_table_privilege(current_user, other.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
            OR pg_has_role(current_user, other.relowner, 'MEMBER'))) AS "otherEscrowPrivileges"
      FROM pg_roles roles
      LEFT JOIN pg_namespace scope ON scope.nspname = $1
      LEFT JOIN pg_class own ON own.relnamespace = scope.oid AND own.relname = 'wtfiap_open_duels' AND own.relkind = 'r'
      WHERE roles.rolname = current_user`, [schema]);
    const scope = result.rows[0];
    if (!scope || scope.databaseName !== database || scope.schemas.length !== 1 || scope.schemas[0] !== schema
      || !scope.scopedRole || !scope.isolatedTable || !scope.ownTableWritable || scope.otherEscrowPrivileges) {
      throw new Error("Open Duel database connection does not enforce its isolated escrow scope.");
    }
    const lease = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(hashtextextended('wtfiap-isolated-duel:' || $1, 0)) AS acquired",
      [schema],
    );
    if (!lease.rows[0]?.acquired) throw new Error("Another Open Duel authority already owns this store.");
    return client;
  } catch (error) {
    client.release(true);
    throw error;
  }
}

async function bindRoomDirectory({ dataDir, database, schema }: IsolatedDuelOptions): Promise<string> {
  const directory = await realpath(dataDir);
  if (directory !== path.resolve(dataDir) || !(await lstat(directory)).isDirectory()
    || (process.env.WTFIAP_DATA_DIR && path.resolve(process.env.WTFIAP_DATA_DIR) !== directory)) {
    throw new Error("Open Duel authority requires its dedicated, directly mounted game directory.");
  }
  const filename = path.join(directory, BINDING);
  const expected = JSON.stringify({ version: 1, database, schema }) + "\n";
  try {
    if (!(await lstat(filename)).isFile() || await readFile(filename, "utf8") !== expected) {
      throw new Error("Open Duel game directory belongs to a different escrow store.");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    if ((await readdir(directory)).length > 0) throw new Error("An unbound Open Duel game directory must be empty.");
    const binding = await open(filename, "wx", 0o600);
    try { await binding.writeFile(expected); await binding.sync(); }
    finally { await binding.close(); }
    const parent = await open(directory, "r");
    try { await parent.sync(); } finally { await parent.close(); }
  }
  return directory;
}

export async function createIsolatedDuelAuthority(options: IsolatedDuelOptions) {
  if (options.protectedRoomCode !== undefined && !ROOM_CODE.test(options.protectedRoomCode)) {
    throw new Error("The protected Duel identifier is invalid.");
  }
  const lease = await acquireIsolatedStore(options);
  let authority: IsolatedAuthority | undefined;
  const abort = new AbortController();
  const monitors: ReturnType<typeof monitorFundingHeads>[] = [];
  let work: Promise<void> | undefined;
  let monitorStart: Promise<void[]> | undefined;
  let closeOperation: Promise<void> | undefined;
  let closed = false;
  let pending = false;
  const health = {
    lastReconciledAt: null as string | null,
    reconciliationError: false,
    heads: {
      mainnet: { connected: false, error: null as string | null, lastHeadAt: null as string | null },
      shadownet: { connected: false, error: null as string | null, lastHeadAt: null as string | null },
    },
  };
  const report = options.onError ?? ((error: unknown) => { console.error("[isolated-duel]", error); });
  // Losing the session lease invalidates the only writer's ownership. Stop
  // without a shutdown flush that could race a replacement authority.
  const leaseLost = (error: Error) => { try { report(error); } finally { process.exit(1); } };
  lease.on("error", leaseLost);
  function close() {
    closeOperation ??= (async () => {
      closed = true;
      abort.abort();
      try {
        await monitorStart;
        await Promise.all(monitors.map(monitor => monitor.close()));
        await work;
        await authority?.close();
      } finally {
        lease.off("error", leaseLost);
        lease.release(true);
      }
    })();
    return closeOperation;
  }
  try {
    const dataDir = await bindRoomDirectory(options);
    const savedRooms = (await readdir(dataDir, { withFileTypes: true })).filter(entry => entry.name.endsWith(".json"));
    if (options.protectedRoomCode && savedRooms.some(file => file.name === options.protectedRoomCode + ".json")) {
      throw new Error("The protected Duel cannot mount in the isolated authority.");
    }
    const env = options.env ?? process.env;
    const { createOpenDuelService, openDuelConfigs } = await import("./open-duel");
    const configs = options.configs ?? openDuelConfigs({ ...env, WTFIAP_DATA_DIR: dataDir });
    const networkNames = Object.keys(NETWORKS) as Network[];
    const networks = networkNames.filter(network => configs[network].enabled);
    if (networks.length === 0 || networks.some(network =>
      configs[network].network !== network || configs[network].chainId !== NETWORKS[network].chainId)) {
      throw new Error("Open Duel authority requires verified Tezos network configurations.");
    }
    const pinPrepaid = requireFromRepo(path.resolve("scripts/wtfiap/prepaid-credit-binding.cjs")).assertOrPinPrepaidBinding;
    const mainnet = configs.mainnet;
    pinPrepaid({
      WTFIAP_OPEN_DUEL_MAINNET_ENABLED: mainnet.enabled ? "1" : "0",
      WTFIAP_OPEN_DUEL_MAINNET_PAYOUT_MODE: mainnet.payoutMode === 2 ? "prepaid" : "",
      WTFIAP_OPEN_DUEL_MAINNET_CONTRACT: mainnet.contract,
      WTFIAP_OPEN_DUEL_MAINNET_SCRIPT_HASH: mainnet.scriptHash,
    }, dataDir);

    const savedCodes = new Set<string>();
    for (const file of savedRooms) {
      if (!file.isFile() || !ROOM_FILE.test(file.name)) {
        throw new Error("Open Duel game directory contains a file outside its room scope.");
      }
      const saved = JSON.parse(await readFile(path.join(dataDir, file.name), "utf8"));
      if (saved.roomCode + ".json" !== file.name || saved.config?.roomType !== "duel" || saved.config?.sponsor
        || saved.config?.duelWager?.currency !== "XTZ" || saved.config?.openSeatEscrowVersion !== 1
        || !networks.includes(saved.config?.duelWager?.network)) {
        throw new Error("Open Duel game directory contains a room outside its authority scope.");
      }
      savedCodes.add(saved.roomCode);
    }
    const records = await options.pool.query<{ room_code: string }>("SELECT room_code FROM wtfiap_open_duels");
    if (records.rows.some(record => !savedCodes.has(record.room_code))) {
      throw new Error("An isolated escrow record has no corresponding isolated room.");
    }

    let reconcile: (() => Promise<void>) | undefined;
    const { createWtfiapAuthority } = requireFromRepo(path.resolve("server/features/wtfiap/authority.cjs"));
    const owned: IsolatedAuthority = createWtfiapAuthority({
      dataDir, isEnabled: () => true, openDuelNetworks: networks,
      onRoomChanged: () => wake(), onPreparationOpened: options.onPreparationOpened,
    });
    authority = owned;
    await owned.ready;
    const service = createOpenDuelService({
      pool: options.pool, game: owned.funding, linkedWallet: options.linkedWallet, configs, adapters: options.adapters,
    });
    reconcile = service.reconcileAll;
    const funding = createOpenDuelHandler({ getService: () => service, canAccess: () => true });

    function wake() {
      const reconcileOwnedRooms = reconcile;
      if (closed || !reconcileOwnedRooms) return;
      pending = true;
      if (work) return;
      work = (async () => {
        while (pending && !closed) {
          pending = false;
          try {
            await reconcileOwnedRooms();
            health.lastReconciledAt = new Date().toISOString();
            health.reconciliationError = false;
          } catch (error) {
            health.reconciliationError = true;
            report(error);
          }
        }
      })().finally(() => {
        work = undefined;
        if (pending) wake();
      });
    }

    async function startMonitor(network: Network) {
      const lane = configs[network];
      const state = health.heads[network];
      let minimalBlockDelaySeconds = options.blockDelays?.[network];
      if (!minimalBlockDelaySeconds) {
        for (const rpc of rpcEndpoints({ network, rpcUrl: lane.rpc })) {
          try {
            const response = await fetch(rpc.replace(/\/$/, "") + "/chains/main/blocks/head/context/constants",
              { signal: abort.signal });
            if (!response.ok) continue;
            const constants = await response.json() as { minimal_block_delay: string | number };
            const seconds = Number(constants.minimal_block_delay);
            if (Number.isSafeInteger(seconds) && seconds > 0) { minimalBlockDelaySeconds = seconds; break; }
          } catch (error) {
            if (abort.signal.aborted) return;
            report(error);
          }
        }
      }
      if (abort.signal.aborted) return;
      if (!minimalBlockDelaySeconds || !Number.isSafeInteger(minimalBlockDelaySeconds) || minimalBlockDelaySeconds < 1) {
        state.error = "Could not obtain the verified chain block delay.";
        return;
      }
      monitors.push(monitorFundingHeads({ network, chainId: lane.chainId, rpcUrl: lane.rpc, minimalBlockDelaySeconds }, () => {
        state.lastHeadAt = new Date().toISOString();
        state.error = null;
        wake();
      }, {
        get headStreamConnected() { return state.connected; },
        set headStreamConnected(value: boolean) { state.connected = value; },
        get error() { return state.error; },
        set error(value: string | null) { state.error = value; },
      }));
    }

    const handler: RequestHandler = async (request, response, next) => {
      try {
        const pathname = new URL(request.url, "http://localhost").pathname;
        const collection = pathname === PARTY + "/rooms";
        const party = PARTY_ROOM.exec(pathname);
        const roomFunding = OPEN_ROOM.exec(pathname);
        if (!collection && !party && !roomFunding) return next();
        if (options.protectedRoomCode && (party?.[1] === options.protectedRoomCode || roomFunding?.[1] === options.protectedRoomCode)) {
          return response.status(404).json({ ok: false, reason: "This room is outside the isolated authority." });
        }
        if (closed) return response.status(503).json({ ok: false, reason: "Open Duel authority is shutting down." });
        if (!await options.canAccess(request)) return response.status(403).json({ ok: false, reason: "coLILseum is unavailable for this account." });
        if (collection && request.method === "POST") {
          const room = request.body;
          const wager = room?.duelWager;
          const network = wager?.network ?? "shadownet";
          if (!request.user) return response.status(401).json({ ok: false, reason: "Sign in to create a wagered Duel." });
          if (room?.roomType !== "duel" || wager?.currency !== "XTZ" || room.sponsor
            || (network !== "mainnet" && network !== "shadownet")) {
            return response.status(400).json({ ok: false, reason: "This authority only creates open-seat XTZ Duels." });
          }
          if (!networks.includes(network) || !await options.canAdmit(network)) {
            return response.status(503).json({ ok: false, reason: "New XTZ Duels are unavailable on this network." });
          }
        }
        if (roomFunding) {
          owned.funding.inspect(roomFunding[1]);
          return funding(request, response, next);
        }
        return owned.handler(request, response, next);
      } catch (error) {
        const status = (error as { status?: number }).status;
        if (status === 404) return response.status(404).json({ ok: false, reason: "This room is outside the isolated authority." });
        next(error);
      }
    };

    monitorStart = Promise.all(networks.map(network => startMonitor(network)));
    wake();
    return { handler, health, close };
  } catch (error) {
    await close();
    throw error;
  }
}
