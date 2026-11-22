import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, mkdir, readdir, readFile, realpath, rm, unlink, writeFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import pg from "pg";
import { NETWORKS } from "./funding-contract";
import { createIsolatedDuelAuthority } from "./isolated-duel-authority";

const databaseUrl = process.env.WTFIAP_TEST_DATABASE_URL;

test("exclusive Open Duel authority follows the head stream only for its rooms and gates new admissions independently", {
  skip: !databaseUrl && "Requires isolated local PostgreSQL proof lane.",
}, async () => {
  const database = new URL(databaseUrl!);
  assert(["localhost", "127.0.0.1", "::1"].includes(database.hostname));
  const databaseName = decodeURIComponent(database.pathname.slice(1));
  assert(databaseName);
  const label = randomUUID().replace(/-/g, "");
  const schema = `open_duel_${label}`;
  const legacy = `legacy_duel_${label}`;
  const role = `duel_actor_${label}`;
  const password = randomUUID();
  const newLane = new URL(database);
  newLane.username = role;
  newLane.password = password;
  const admin = new pg.Pool({ connectionString: databaseUrl });
  const pool = new pg.Pool({ connectionString: newLane.href, options: `-c search_path=${schema}` });
  const parent = await realpath(await mkdtemp(path.join(tmpdir(), "isolated-duel-")));
  const ownDir = path.join(parent, "room-store");
  const legacyDir = path.join(parent, "legacy-room-store");
  await Promise.all([mkdir(ownDir), mkdir(legacyDir)]);
  const legacyCode = randomUUID();
  const legacySave = path.join(legacyDir, legacyCode + ".json");
  const oldSave = JSON.stringify({ protection: "legacy room must stay unread and unchanged" });
  await writeFile(legacySave, oldSave);
  const originalEscrow = { schemaVersion: 2, roomCode: legacyCode, status: "active" };
  const hostWallet = "tz1" + "1".repeat(33);
  const reported: unknown[] = [];
  const monitoredCodes = new Set<string>();
  const streams = new Map<string, ServerResponse>();
  const rpc = createServer((request, response) => {
    const url = new URL(request.url!, "http://localhost");
    const network = url.pathname.split("/")[1] as keyof typeof NETWORKS;
    const command = url.pathname.slice(network.length + 1);
    if (!NETWORKS[network]) return response.writeHead(404).end();
    response.setHeader("Content-Type", "application/json");
    if (command === "/chains/main/chain_id") return response.end(JSON.stringify(NETWORKS[network].chainId));
    if (command === "/chains/main/blocks/head/context/constants") return response.end(JSON.stringify({ minimal_block_delay: 1 }));
    if (command === "/monitor/heads/main") {
      streams.set(network, response);
      response.flushHeaders();
      return;
    }
    response.writeHead(404).end();
  });
  let authority: Awaited<ReturnType<typeof createIsolatedDuelAuthority>> | undefined;
  const app = express();
  const http = createServer(app);
  const canSettle: { offer: Record<string, unknown> | null } = { offer: null };
  let mainnetAdmits = false;
  async function waitFor(condition: () => Promise<boolean> | boolean) {
    const bound = AbortSignal.timeout(5000); // Match the existing Open Duel fixture network deadline.
    while (!await condition()) {
      bound.throwIfAborted();
      await new Promise<void>(resolve => setImmediate(resolve));
    }
  }
  try {
    await admin.query(`CREATE SCHEMA "${schema}"; CREATE SCHEMA "${legacy}";
      CREATE ROLE "${role}" LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${password}'`);
    const migration = await readFile("drizzle/0133_wtfiap_open_duels.sql", "utf8");
    for (const namespace of [schema, legacy]) {
      await admin.query(migration.replace("CREATE TABLE IF NOT EXISTS wtfiap_open_duels",
        `CREATE TABLE IF NOT EXISTS "${namespace}".wtfiap_open_duels`));
    }
    await admin.query(`INSERT INTO "${legacy}".wtfiap_open_duels(room_code, document) VALUES($1, $2::jsonb)`,
      [legacyCode, JSON.stringify(originalEscrow)]);
    const legacyRow = async () => (await admin.query(`SELECT * FROM "${legacy}".wtfiap_open_duels`)).rows[0];
    const before = await legacyRow();
    await admin.query(`GRANT USAGE ON SCHEMA "${schema}", "${legacy}" TO "${role}";
      GRANT SELECT, INSERT, UPDATE ON "${schema}".wtfiap_open_duels TO "${role}"`);
    rpc.listen(0, "127.0.0.1");
    await once(rpc, "listening");
    const rpcAddress = rpc.address();
    assert(rpcAddress && typeof rpcAddress !== "string");
    const config = (network: keyof typeof NETWORKS) => ({
      enabled: true, network, chainId: NETWORKS[network].chainId, rpc: `http://127.0.0.1:${rpcAddress.port}/${network}`,
      contract: "KT1" + "3".repeat(33), scriptHash: "a".repeat(64),
      referee: hostWallet, walletId: "fixture-only", treasury: hostWallet, payoutMode: 0 as const,
    });
    const options = {
      database: databaseName, schema, dataDir: ownDir, pool, protectedRoomCode: legacyCode,
      configs: { mainnet: config("mainnet"), shadownet: config("shadownet") },
      canAccess: () => true,
      canAdmit: (network: keyof typeof NETWORKS) => network === "shadownet" || mainnetAdmits,
      linkedWallet: async (userId: string, address: string) => userId === "1" && address === hostWallet,
      adapters: {
        readChain: async ({ roomCode }: { roomCode: string }) => {
          assert.notEqual(roomCode, legacyCode);
          monitoredCodes.add(roomCode);
          return { room: canSettle.offer as any, authorized: new Set<string>() };
        },
        sign: async () => { throw new Error("Fixture must never sign."); },
      },
      onError: (error: unknown) => { reported.push(error); },
    };

    await admin.query(`GRANT SELECT ON "${legacy}".wtfiap_open_duels TO "${role}"`);
    await assert.rejects(createIsolatedDuelAuthority(options), /does not enforce its isolated escrow scope/);
    assert.deepEqual(await readdir(ownDir), []);
    await admin.query(`REVOKE SELECT ON "${legacy}".wtfiap_open_duels FROM "${role}"`);
    await assert.rejects(pool.query(`SELECT * FROM "${legacy}".wtfiap_open_duels`), { code: "42501" });
    await assert.rejects(createIsolatedDuelAuthority({ ...options, dataDir: legacyDir }), /must be empty/);

    const binding = path.join(ownDir, ".isolated-duel-authority");
    const misplacedRoom = path.join(ownDir, legacyCode + ".json");
    await writeFile(binding, JSON.stringify({ version: 1, database: databaseName, schema }) + "\n");
    await writeFile(misplacedRoom, "The isolated service must reject this filename without parsing it.");
    await assert.rejects(createIsolatedDuelAuthority(options), /protected Duel cannot mount/);
    await unlink(misplacedRoom);
    await unlink(binding);

    authority = await createIsolatedDuelAuthority(options);
    await assert.rejects(createIsolatedDuelAuthority(options), /already owns this store/);
    app.use(express.json({ verify(req, _res, bytes) { (req as any).rawBody = bytes; } }));
    app.use((req, _res, next) => {
      if (req.headers["x-fixture-account"]) (req as any).user = { id: 1, username: "Fixture commander" };
      next();
    });
    app.use(authority.handler);
    app.use((_req, res) => res.status(404).json({ ok: false }));
    http.listen(0, "127.0.0.1");
    await once(http, "listening");
    const address = http.address();
    assert(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    async function call(route: string, body?: unknown, signedIn = true) {
      const response = await fetch(base + route, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...(signedIn ? { "x-fixture-account": "yes" } : {}),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(5000),
      });
      return { status: response.status, data: await response.json() as any };
    }
    const directory = "/api/wtfiap/party/rooms";
    const create = (network: keyof typeof NETWORKS) => ({
      roomType: "duel", name: "Fixture", boardMode: "standard", preparationSeconds: 86400,
      duelWager: { currency: "XTZ", entryFee: "1", network },
    });
    assert.equal((await call(directory, create("shadownet"), false)).status, 401);
    assert.equal((await call(directory, { ...create("shadownet"), roomType: "party" })).status, 400);
    assert.equal((await call(directory, create("mainnet"))).status, 503);
    assert.equal((await call(`/api/wtfiap/open-duel/rooms/${legacyCode}/reconcile`, {})).status, 404);
    assert.equal((await call("/api/wtfiap/open-duel/prepaid-credit")).status, 404);
    const created = await call(directory, create("shadownet"));
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const code = created.data.roomCode;
    const route = `/api/wtfiap/open-duel/rooms/${code}`;
    const prepared = await call(route + "/prepare-host", { walletAddress: hostWallet });
    assert.equal(prepared.status, 200, JSON.stringify(prepared.data));
    assert.equal((await call(directory)).data.rooms[0].myPlayerId, created.data.playerId);
    await waitFor(() => streams.has("shadownet") && streams.has("mainnet") && authority!.health.lastReconciledAt !== null);
    const saved = (await admin.query(`SELECT document FROM "${schema}".wtfiap_open_duels WHERE room_code=$1`, [code])).rows[0].document;
    assert.equal(saved.status, "prepared");
    canSettle.offer = {
      status: "funding", host: hostWallet, guest: null, deposited: saved.entryAtomic, held: saved.entryAtomic,
    };
    streams.get("shadownet")!.write(JSON.stringify({ hash: "fixture-verified-head" }) + "\n");
    await waitFor(async () => (await admin.query(`SELECT document->>'status' AS status FROM "${schema}".wtfiap_open_duels WHERE room_code=$1`, [code])).rows[0].status === "funded-awaiting-opponent");
    assert(authority.health.heads.shadownet.lastHeadAt);
    assert.deepEqual([...monitoredCodes], [code]);

    mainnetAdmits = true;
    const mainnet = await call(directory, create("mainnet"));
    assert.equal(mainnet.status, 201, JSON.stringify(mainnet.data));
    mainnetAdmits = false;
    assert.equal((await call(directory, create("mainnet"))).status, 503);
    assert.equal((await call(`${directory}/${mainnet.data.roomCode}/lobby`)).status, 200);
    assert.deepEqual(await legacyRow(), before);
    assert.equal(await readFile(legacySave, "utf8"), oldSave);
    assert.deepEqual(reported, []);
  } finally {
    await authority?.close();
    http.closeAllConnections();
    rpc.closeAllConnections();
    if (http.listening) await new Promise<void>((resolve) => http.close(() => resolve()));
    if (rpc.listening) await new Promise<void>((resolve) => rpc.close(() => resolve()));
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE; DROP SCHEMA IF EXISTS "${legacy}" CASCADE; DROP ROLE IF EXISTS "${role}"`);
    await admin.end();
    await rm(parent, { recursive: true, force: true });
  }
});
