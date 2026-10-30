import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import express from 'express';
// Shared CSRF imports the public-API registry, whose DB module needs a URL.
// Match the existing public-api.test.ts inert fixture; this test makes no DB calls.
process.env.DATABASE_URL ||= 'postgresql://wtf:wtf@127.0.0.1:1/wtf';
const { csrfProtection } = await import('../../lib/csrf');
import { canOpenAppsForRole } from '../../../shared/types';
const require = createRequire(import.meta.url);
const { createWtfiapAuthority, API_PREFIX } = require('./authority.cjs');

test('hosted WTFIAP preserves authority, privacy, CSRF, live updates and durable room state', async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'wtfiap-authority-'));
  let enabled = true;
  let role = 'contestant';
  let user: any = { id: 41, username: 'canonical-owner', displayName: 'Canonical Owner' };
  const csrfToken = 'test-session-csrf';
  let authority: any;
  let server: Server;
  let base!: string;
  const turnNotifications: Array<{ roomCode: string; roundNumber: number; recipients: Array<{ userId: string; playerId: string }> }> = [];
  let streamReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  async function open() {
    const app = express();
    // Same bytes-preserving host middleware contract as server/app.ts.
    app.use(express.json({ limit: '10mb', verify(req: any, _res, buf) { req.rawBody = buf.toString('utf8'); } }));
    app.use((req: any, _res, next) => {
      req.user = user;
      req.isAuthenticated = () => Boolean(user);
      req.session = { csrfToken };
      next();
    });
    app.use(csrfProtection);
    authority = createWtfiapAuthority({ dataDir,
      isEnabled: () => enabled,
      canAccess: () => canOpenAppsForRole(user ? role : null),
      onPreparationOpened: (notice: any) => { turnNotifications.push(notice); },
    });
    await authority.ready;
    app.use(authority.handler);
    app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  }
  async function close() {
    await authority.close();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  async function request(method: string, endpoint: string, body?: unknown, token?: string, expected = 200, headers: Record<string, string> = {}) {
    const response = await fetch(base + API_PREFIX + endpoint, { method,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const json: any = await response.json();
    assert.equal(response.status, expected, JSON.stringify(json));
    return json;
  }
  try {
    await open();
    const input = { name: 'Forged Admin', boardMode: 'standard', preparationSeconds: null };
    await request('POST', '/rooms', input, undefined, 403, { 'X-CSRF-Token': '' });
    const host = await request('POST', '/rooms', input, undefined, 201);
    assert.equal(host.view.config.balanceVersion, 1);
    assert.equal(host.view.config.fortuneRulesVersion, 1);
    assert.equal(host.view.config.fortunePricingVersion, 1);
    const room = `/rooms/${host.roomCode}`;
    assert.equal(host.sharePath, `/wtfiap?room=${host.roomCode}`);
    assert.equal(host.view.players[0].name, 'canonical-owner');
    const personalizedRooms = await request('GET', '/rooms');
    const myTable = personalizedRooms.rooms.find((table: any) => table.roomCode === host.roomCode);
    assert.equal(myTable.myPlayerId, host.playerId);
    assert.deepEqual(personalizedRooms.identity, { name: 'canonical-owner' });
    assert(!JSON.stringify(personalizedRooms).includes('accountId'));
    await request('POST', `${room}/join`, { name: 'Second seat' }, undefined, 409);
    user = null;
    await request('GET', room, undefined, host.sessionToken, 403);
    const guest = await request('POST', `${room}/join`, { name: 'Guest' }, undefined, 201, { 'X-CSRF-Token': '' });
    assert.equal(guest.view.players[1].name, 'Guest');
    user = { id: 42, username: 'other-account' };
    await request('GET', room, undefined, host.sessionToken, 403);
    // A guest bearer seat remains usable after a guest later signs into wtfOS.
    await request('GET', room, undefined, guest.sessionToken);
    user = { id: 41, username: 'canonical-owner', displayName: 'Canonical Owner' };
    const started = await request('POST', `${room}/start`, { fillAI: true }, host.sessionToken);
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(turnNotifications.length, 1);
    assert.equal(turnNotifications[0].roomCode, host.roomCode);
    assert.equal(turnNotifications[0].roundNumber, 1);
    assert.deepEqual(turnNotifications[0].recipients.map(recipient => recipient.userId), ['41']);
    assert.equal(started.view.players.length, 8);
    assert.equal(started.view.players.filter((p: any) => p.isAI).length, 6);
    assert.equal(started.view.phase, 'preparation');
    assert.equal(started.view.balanceVersion, 1);
    const streamed = await fetch(base + API_PREFIX + room + '/events', { headers: { Authorization: `Bearer ${host.sessionToken}` } });
    assert.equal(streamed.headers.get('content-type'), 'text/event-stream; charset=utf-8');
    streamReader = streamed.body!.getReader();
    const firstChunk = await streamReader.read();
    assert.match(new TextDecoder().decode(firstChunk.value), /event: snapshot/);
    const buy = { commandId: randomUUID(), sequence: started.view.nextCommandSequence, roundNumber: started.view.roundNumber, type: 'buy', index: 0 };
    const bought = await request('POST', `${room}/commands`, buy, host.sessionToken);
    assert.equal(bought.view.self.bench.length, 1);
    assert.equal(bought.view.self.gold, 0);
    const patch = await streamReader.read();
    assert.match(new TextDecoder().decode(patch.value), /event: patch/);
    const deploy = { commandId: randomUUID(), sequence: bought.view.nextCommandSequence, roundNumber: bought.view.roundNumber,
      type: 'deploy', unitId: bought.view.self.bench[0].id, col: 0, row: bought.view.board.rows - 1 };
    const deployed = await request('POST', `${room}/commands`, deploy, host.sessionToken);
    assert.equal(deployed.view.self.field.length, 1);
    const publicLobby = await request('GET', `${room}/lobby`);
    const replay = await request('GET', `${room}/replay`, undefined, host.sessionToken);
    for (const value of [publicLobby, replay, deployed]) {
      const json = JSON.stringify(value);
      assert(!json.includes('accountId'));
      assert(!json.includes(host.sessionToken));
      assert(!json.includes(guest.sessionToken));
    }
    assert.equal(replay.replay.commands.length, 2);
    enabled = false;
    await request('GET', '/health', undefined, undefined, 403);
    await request('GET', room, undefined, host.sessionToken, 403);
    await request('POST', '/rooms', input, undefined, 403);
    enabled = true;
    role = 'time_out';
    await request('GET', room, undefined, host.sessionToken, 403);
    role = 'contestant';
    await request('POST', '/rooms', input, undefined, 403, { Origin: 'https://foreign.example' });
    const wrongPrefix = await fetch(base + '/api/wtfiap/partyevil/health');
    assert.equal(wrongPrefix.status, 404);
    const before = (await request('GET', room, undefined, host.sessionToken)).view;
    await close();
    // Graceful authority shutdown ends its live SSE response, allowing the
    // parent HTTP server to drain without waiting for a client disconnect.
    while (!(await streamReader.read()).done) { /* drain queued patches */ }
    streamReader = undefined;
    const filename = path.join(dataDir, host.roomCode + '.json');
    assert.equal(statSync(filename).mode & 0o777, 0o600);
    assert.equal(statSync(dataDir).mode & 0o777, 0o700);
    const privateRoom = JSON.parse(readFileSync(filename, 'utf8'));
    assert(Object.values(privateRoom.sessions).some((s: any) => s.accountId === '41'));
    assert.equal(readdirSync(dataDir).filter(f => f.endsWith('.json')).length, 1);
    await open();
    const restored = (await request('GET', room, undefined, host.sessionToken)).view;
    assert.equal(restored.balanceVersion, 1);
    assert.notEqual(restored.authorityEpoch, before.authorityEpoch);
    assert.deepEqual(restored.self, before.self);
    assert.equal(restored.nextCommandSequence, before.nextCommandSequence);
    const duplicate = await request('POST', `${room}/commands`, buy, host.sessionToken);
    assert.equal(duplicate.duplicate, true);
    assert.deepEqual(duplicate.view.self, restored.self);
    const resumed = await request('POST', `${room}/resume`, {});
    assert.equal(resumed.playerId, host.playerId);
    await request('GET', room, undefined, resumed.sessionToken);
    await request('GET', room, undefined, host.sessionToken, 401);
    const resumedView = (await request('GET', room, undefined, resumed.sessionToken)).view;
    assert.equal(resumedView.canClose, true);
    user = null;
    await request('GET', room, undefined, resumed.sessionToken, 403);
    await request('POST', `${room}/close`, {}, guest.sessionToken, 403);
    await request('GET', room, undefined, guest.sessionToken);
    user = { id: 41, username: 'canonical-owner', displayName: 'Canonical Owner' };
    const closed = await request('POST', `${room}/close`, {}, resumed.sessionToken);
    assert.equal(closed.view.phase, 'closed');
    assert.equal(closed.view.canClose, undefined);
    await request('POST', `${room}/commands`, { ...buy, commandId: randomUUID(), sequence: closed.view.nextCommandSequence }, resumed.sessionToken, 409);
    assert(!((await request('GET', '/rooms')).rooms.some((table: any) => table.roomCode === host.roomCode)));
    await request('GET', '/health');
    await close();
    const closedArchive = JSON.parse(readFileSync(path.join(dataDir, host.roomCode + '.json'), 'utf8'));
    assert.equal(closedArchive.closedByPlayerId, host.playerId);
    assert.equal(typeof closedArchive.match, 'string');
    await open();
    const reopenedClosed = await request('GET', room, undefined, resumed.sessionToken);
    assert.equal(reopenedClosed.view.phase, 'closed');
    assert.equal((await request('GET', `${room}/lobby`)).view.phase, 'closed');
    assert(!((await request('GET', '/rooms')).rooms.some((table: any) => table.roomCode === host.roomCode)));
  } finally {
    if (streamReader) await streamReader.cancel();
    if (authority) await close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('production wiring retains middleware order, private bind mount and shutdown flush', () => {
  const read = (name: string) => readFileSync(name, 'utf8');
  const app = read('server/app.ts');
  assert(app.indexOf('await setupAuth(app)') < app.indexOf('registerRoutes(app)'));
  assert(app.indexOf('app.use(csrfProtection)') < app.indexOf('registerRoutes(app)'));
  assert.match(app, /\.rawBody = buf\.toString\("utf8"\)/);
  assert.match(read('server/routes.ts'), /app\.use\(wtfiapRoutes\)/);
  assert.match(read('server/index.ts'), /await startWtfiapAuthority\(\)/);
  assert.match(read('server/index.ts'), /stopWtfiapAuthority\(\)\.then\(\(\) => server\.close/);
  assert.match(read('docker-compose.yml'), /WTFIAP_DATA_DIR: \/app\/wtfiap-data/);
  assert.match(read('docker-compose.yml'), /WTFIAP_DATA_DIR_HOST:-\/mnt\/wtf-data\/wtfiap\}:\/app\/wtfiap-data/);
  assert.match(read('Dockerfile'), /COPY --from=builder(?: --chown=node:node)? \/app\/server \.\/server/);
  assert.match(read('Dockerfile'), /\/app\/wtfiap-data/);
  assert.match(read('docker-entrypoint.sh'), /WRITABLE_DIRS="[^"\n]*\/app\/wtfiap-data/);
});

test('a prior-release escrow-bound room cannot be closed before or after match start', async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'wtfiap-funded-close-'));
  const authority = createWtfiapAuthority({ dataDir, isEnabled: () => true,
    canAccess: () => true, resolveActor: (request: any) => ({ id: String(request.headers['x-test-user']),
      name: `Player ${request.headers['x-test-user']}` }) });
  const app = express();
  app.use(express.json({ verify(req: any, _res, buffer) { req.rawBody = buffer.toString('utf8'); } }));
  app.use(authority.handler);
  const server = createServer(app);
  await authority.ready;
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}${API_PREFIX}`;
  const request = async (method: string, route: string, body: unknown, user: string, token?: string) => {
    const response = await fetch(base + route, { method, headers: {
      'Content-Type': 'application/json', 'x-test-user': user,
      ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() as any };
  };
  try {
    const created = await request('POST', '/rooms', { name: 'Host', roomType: 'duel',
      boardMode: 'standard', preparationSeconds: null,
      duelWager: { currency: 'XTZ', entryFee: '1' } }, '1');
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const code = created.body.roomCode;
    const joined = await request('POST', `/rooms/${code}/join`, { name: 'Guest' }, '2');
    assert.equal(joined.status, 201, JSON.stringify(joined.body));
    const binding = { roomId: 'a'.repeat(64), termsHash: 'b'.repeat(64),
      rulesHash: 'f4acaf1dd0f1e0fcfd1d57f3a403e0d503721f94fdc269d1cdc07c26719c67fe',
      matchId: 'c'.repeat(64), network: 'shadownet', escrowContract: 'KT1' + '1'.repeat(33) };
    authority.funding.lock(code, binding);
    const hostToken = created.body.sessionToken;
    const before = await request('GET', `/rooms/${code}`, undefined, '1', hostToken);
    assert.equal(before.status, 200);
    assert.equal(before.body.view.canClose, undefined);
    assert.equal((await request('POST', `/rooms/${code}/close`, {}, '1', hostToken)).status, 409);
    authority.funding.start(code, binding);
    const active = await request('GET', `/rooms/${code}`, undefined, '1', hostToken);
    assert.equal(active.status, 200);
    assert.equal(active.body.view.canClose, undefined);
    assert.equal((await request('POST', `/rooms/${code}/close`, {}, '1', hostToken)).status, 409);
  } finally {
    await authority.close();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    rmSync(dataDir, { recursive: true, force: true });
  }
});
