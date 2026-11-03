import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createServer as httpServer, type Server } from 'node:http';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import express from 'express';
import pg from 'pg';
import { classifyOpenDuelOperation, createOpenDuelService, openDuelConfigs } from './open-duel';
import { createOpenDuelHandler } from './open-duel-http';

const url = process.env.WTFIAP_TEST_DATABASE_URL;
test('duel escrow configuration binds payout mode to its verified script', () => {
  const prefix = 'WTFIAP_OPEN_DUEL_MAINNET_';
  const env: NodeJS.ProcessEnv = {
    [prefix + 'ENABLED']: '1', [prefix + 'CONTRACT']: 'KT1' + '3'.repeat(33),
    [prefix + 'REFEREE_ADDRESS']: 'tz1' + '1'.repeat(33),
    [prefix + 'TREASURY_ADDRESS']: 'tz1' + '2'.repeat(33),
    [prefix + 'REFEREE_WALLET_ID']: 'test-referee',
    [prefix + 'SCRIPT_HASH']: 'ff8046cf0feca9d027acd111bb2cf656e142a8fd5765a2e711585dd5cb041181',
    [prefix + 'PAYOUT_MODE']: 'auto',
  };
  assert.equal(openDuelConfigs(env).mainnet.enabled, true);
  assert.equal(openDuelConfigs(env).mainnet.payoutMode, 1);
  env[prefix + 'PAYOUT_MODE'] = 'claim';
  assert.equal(openDuelConfigs(env).mainnet.enabled, false);
  env[prefix + 'SCRIPT_HASH'] = 'fa075804205228a3ecc4dbf08ba23fb39a1041bf16d57d4981b68f364652f899';
  assert.equal(openDuelConfigs(env).mainnet.enabled, true);
  assert.equal(openDuelConfigs(env).mainnet.payoutMode, 0);
  env[prefix + 'SCRIPT_HASH'] = '26ff7d8db669e2eeefcdeacb8bd38d113ff402a2afb3aed819ace25053161c2f';
  env[prefix + 'PAYOUT_MODE'] = 'prepaid';
  assert.equal(openDuelConfigs(env).mainnet.enabled, true);
  assert.equal(openDuelConfigs(env).mainnet.payoutMode, 2);
  const shadowPrefix = 'WTFIAP_OPEN_DUEL_SHADOWNET_';
  for (const [key, value] of Object.entries(env)) if (key.startsWith(prefix))
    env[shadowPrefix + key.slice(prefix.length)] = value;
  assert.equal(openDuelConfigs(env).shadownet.enabled, false,
    'Prepaid credit cannot be offered to Shadownet players.');
});
test('prepaid credit quote binds the linked Mainnet wallet and accepts fractional XTZ amounts', async () => {
  const wallet = 'tz1' + '1'.repeat(33);
  const config: any = { enabled: true, network: 'mainnet', chainId: 'NetXdQprcVkpaWU',
    rpc: 'https://tezos-mainnet.octez.io/', contract: 'KT1' + '3'.repeat(33),
    scriptHash: '26ff7d8db669e2eeefcdeacb8bd38d113ff402a2afb3aed819ace25053161c2f',
    referee: wallet, walletId: 'test-referee', treasury: wallet, payoutMode: 2 };
  const service = createOpenDuelService({ pool: {} as any, game: {} as any,
    linkedWallet: async (userId, address) => userId === '1' && address === wallet,
    configs: { mainnet: config, shadownet: { ...config, enabled: false, network: 'shadownet' } },
    adapters: { readCredit: async () => '250000' } });
  assert.equal((await service.creditView('1', wallet)).balanceAtomic, '250000');
  assert.deepEqual(await service.quoteCredit('1', wallet, '750000'), {
    contract: config.contract, network: 'mainnet', chainId: config.chainId, expectedWallet: wallet,
    entrypoint: 'deposit_credit', params: wallet, amountMutez: '750000',
  });
  await assert.rejects(service.quoteCredit('2', wallet, '1000000'), /Link and verify/);
  await assert.rejects(service.quoteCredit('1', wallet, '0'), /positive XTZ credit/);
  await assert.rejects(service.quoteCredit('1', wallet, '-1'), /positive XTZ credit/);
});
test('prepaid duel view offers either guest payment and marks credit-funded refunds', async () => {
  const host = 'tz1' + '1'.repeat(33), guest = 'tz1' + '2'.repeat(33);
  const record: any = { schemaVersion: 2, roomCode: 'room', roomId: 'a'.repeat(64),
    termsHash: 'b'.repeat(64), rulesHash: 'c'.repeat(64), seedCommitment: 'd'.repeat(64),
    matchId: 'e'.repeat(64), entryAtomic: '1000000', host: { userId: '1', playerId: 'p1', wallet: host },
    candidates: [{ userId: '2', wallet: guest, name: 'Guest' }], network: 'mainnet',
    contract: 'KT1' + '3'.repeat(33), scriptHash: '26ff7d8db669e2eeefcdeacb8bd38d113ff402a2afb3aed819ace25053161c2f',
    referee: host, walletId: 'test-referee', treasury: host, payoutMode: 2, status: 'funded-awaiting-opponent' };
  const room: any = { status: 'funding', host, guest: null, termsHash: record.termsHash,
    rulesHash: record.rulesHash, seedCommitment: record.seedCommitment, referee: host,
    entryAtomic: record.entryAtomic, held: '1000000', feeHeld: '500000',
    deposited: '1000000', refunded: '0', paid: [host], claims: {}, payoutMode: 2,
    prepaidGuest: false, paidOut: '0' };
  const service = createOpenDuelService({
    pool: { query: async () => ({ rows: [{ document: record }] }) } as any,
    game: { inspect: () => ({ phase: 'lobby', config: { roomType: 'duel',
      duelWager: { currency: 'XTZ', network: 'mainnet', entryAtomic: '1000000' },
      openSeatEscrowVersion: 1 }, hostPlayerId: 'p1', players: [{ accountId: '1', playerId: 'p1' }] }) } as any,
    linkedWallet: async () => true,
    configs: { mainnet: { enabled: true, network: 'mainnet', chainId: 'NetXdQprcVkpaWU',
      rpc: '', contract: record.contract, scriptHash: record.scriptHash,
      referee: host, walletId: 'test-referee', treasury: host, payoutMode: 2 },
      shadownet: { enabled: false, network: 'shadownet' } as any },
    adapters: { readChain: async () => ({ room, authorized: new Set([guest]), creditBalance: '1000000' }) },
  });
  const offer = await service.view('room', '2');
  assert.equal(offer.self.actions.deposit.entrypoint, 'accept_offer');
  assert.equal(offer.self.actions.prepaidJoin.entrypoint, 'accept_prepaid');
  assert.equal(offer.self.actions.prepaidJoin.amountMutez, '0');
  assert.equal(offer.self.creditBalanceAtomic, '1000000');
  room.guest = guest; room.paid.push(guest); room.prepaidGuest = true;
  const funded = await service.view('room', '2');
  assert.equal(funded.self.prepaidSeat, true);
  assert.equal(funded.self.actions.refund.entrypoint, 'withdraw_guest');
});
test('a finalized losing-seat race reports failed only for the exact quoted challenger action', () => {
  const expected = { wallet: 'tz1' + '1'.repeat(33), contract: 'KT1' + '3'.repeat(33),
    entrypoint: 'accept_prepaid', amountMutez: '0',
    encodedParams: { prim: 'Pair', args: [{ bytes: 'a'.repeat(64) }, { bytes: 'b'.repeat(64) }] } };
  const failed = { kind: 'transaction', source: expected.wallet, destination: expected.contract,
    amount: '0', parameters: { entrypoint: expected.entrypoint, value: expected.encodedParams },
    metadata: { operation_result: { status: 'failed', errors: [{ id: 'SEAT_CLOSED' }] } } };
  assert.equal(classifyOpenDuelOperation([failed], expected), 'failed');
  assert.equal(classifyOpenDuelOperation([{ ...failed, metadata: { operation_result: { status: 'backtracked' } } }], expected), 'failed');
  assert.equal(classifyOpenDuelOperation([{ ...failed, metadata: { operation_result: { status: 'applied' } } }], expected), 'applied');
  assert.throws(() => classifyOpenDuelOperation([{ ...failed, source: 'tz1' + '2'.repeat(33) }], expected),
    /did not submit the quoted wager action/);
  assert.throws(() => classifyOpenDuelOperation([{ ...failed, amount: '1000000' }], expected),
    /did not submit the quoted wager action/);
  assert.throws(() => classifyOpenDuelOperation([{ ...failed,
    parameters: { ...failed.parameters, value: { ...expected.encodedParams, args: [{ bytes: 'c'.repeat(64) }, { bytes: 'b'.repeat(64) }] } } }], expected),
  /did not submit the quoted wager action/);
});
test('failed host offer creation releases only the exact host transaction checkpoint', () => {
  const expected = { wallet: 'tz1' + '1'.repeat(33), contract: 'KT1' + '3'.repeat(33),
    entrypoint: 'create_offer', amountMutez: '1500000',
    encodedParams: { prim: 'Pair', args: [{ bytes: 'a'.repeat(64) }, { bytes: 'b'.repeat(64) }] } };
  const failed = { kind: 'transaction', source: expected.wallet, destination: expected.contract,
    amount: expected.amountMutez, parameters: { entrypoint: 'create_offer', value: expected.encodedParams },
    metadata: { operation_result: { status: 'failed', errors: [{ id: 'ROOM_ID' }] } } };
  assert.equal(classifyOpenDuelOperation([failed], expected), 'failed');
  assert.throws(() => classifyOpenDuelOperation([{ ...failed, amount: '1000000' }], expected),
    /did not submit the quoted wager action/);
  assert.throws(() => classifyOpenDuelOperation([{ ...failed, destination: 'KT1' + '4'.repeat(33) }], expected),
    /did not submit the quoted wager action/);
});
test('the room operation endpoint returns a proven failed wallet action without leaving the wager page', async () => {
  const calls: unknown[][] = [];
  const app = express();
  app.use((req: any, _res, next) => { req.user = { id: 9 }; next(); });
  app.use(createOpenDuelHandler({ canAccess: () => true,
    getService: () => ({ roomOperation: async (...args: unknown[]) => {
      calls.push(args); return { status: 'failed', operationHash: args[4], blockHash: 'Bfinal', level: 17 };
    } }) as any }));
  const server = httpServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address(); assert(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/wtfiap/open-duel/rooms/ROOM/operations/oo123` +
      '?walletAddress=' + encodeURIComponent('tz1' + '1'.repeat(33)) + '&entrypoint=create_offer',
    { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).operation.status, 'failed');
    assert.deepEqual(calls, [['9', 'ROOM', 'tz1' + '1'.repeat(33), 'create_offer', 'oo123']]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
test('creator stakes before any challenger; first finalized deposit takes the durable duel seat',
  { skip: !url && 'Requires isolated local PostgreSQL proof lane.' }, async () => {
    assert(['localhost', '127.0.0.1', '::1'].includes(new URL(url!).hostname));
    const schema = 'wtfiap_open_' + randomUUID().replace(/-/g, '');
    const admin = new pg.Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
    await pool.query(readFileSync('drizzle/0133_wtfiap_open_duels.sql', 'utf8'));
    const dataDir = mkdtempSync(path.join(tmpdir(), 'wtfiap-open-duel-'));
    const require = createRequire(import.meta.url);
    const { createWtfiapAuthority } = require('./authority.cjs');
    const authority = createWtfiapAuthority({ dataDir, isEnabled: () => true, openDuelNetworks: ['shadownet'] });
    await authority.ready;
    const hostWallet = 'tz1' + '1'.repeat(33), guestWallet = 'tz1' + '2'.repeat(33);
    const config: any = { enabled: true, network: 'shadownet', chainId: 'NetXsqzbfFenSTS',
      rpc: 'https://tezos-shadownet.octez.io/', contract: 'KT1' + '3'.repeat(33),
      scriptHash: 'a'.repeat(64), referee: hostWallet, walletId: 'test-referee', treasury: hostWallet };
    let chainRoom: any = null;
    const authorized = new Set<string>(), signed: Array<{ entrypoint: string; guest?: string }> = [];
    const configs: any = { shadownet: config, mainnet: { ...config, network: 'mainnet', enabled: false } };
    const service = createOpenDuelService({ pool, game: authority.funding as any,
      linkedWallet: async (userId, wallet) => userId === '1' ? wallet === hostWallet : userId === '2' && wallet === guestWallet,
      configs,
      adapters: { readChain: async () => ({ room: chainRoom, authorized: new Set(authorized) }),
        sign: async (_record, entrypoint, params, guest) => {
          signed.push({ entrypoint, guest });
          if (entrypoint === 'authorize_guest') authorized.add(params.guest);
          return 'o' + String(signed.length).repeat(50);
        } } });
    const app = express(); app.use(express.json({ verify(req: any, _res, buffer) { req.rawBody = buffer.toString('utf8'); } }));
    app.use((req: any, _res, next) => { const id = req.headers['x-test-user'];
      req.user = id ? { id: Number(id), username: 'Account ' + id } : null; next(); });
    app.use(createOpenDuelHandler({ getService: () => service, canAccess: () => true }));
    app.use(authority.handler);
    const server: Server = httpServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + (server.address() as any).port;
    const request = async (method: string, route: string, body: any, user = '1', token?: string) => {
      const response = await fetch(base + route, { method,
        headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          'x-test-user': user, ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, data: await response.json() as any };
    };
    try {
      const created = await request('POST', '/api/wtfiap/party/rooms', { name: 'Host', roomType: 'duel',
        boardMode: 'standard', preparationSeconds: 86400,
        duelWager: { currency: 'XTZ', entryFee: '1', network: 'shadownet' } });
      assert.equal(created.status, 201, JSON.stringify(created.data));
      const code = created.data.roomCode, route = '/api/wtfiap/open-duel/rooms/' + code;
      const prepared = await request('POST', route + '/prepare-host', { walletAddress: hostWallet });
      assert.equal(prepared.status, 200, JSON.stringify(prepared.data));
      assert.equal(prepared.data.room.self.actions.deposit.entrypoint, 'create_offer');
      assert.equal(prepared.data.room.self.actions.deposit.amountMutez, '1500000');
      assert.equal((await request('POST', '/api/wtfiap/party/rooms/' + code + '/join', { name: 'Unfunded' }, '2')).status, 409);
      const saved = await service.read(code); assert(saved);
      chainRoom = { status: 'funding', host: hostWallet, guest: null, termsHash: saved.termsHash,
        rulesHash: saved.rulesHash, seedCommitment: saved.seedCommitment, referee: config.referee,
        entryAtomic: saved.entryAtomic, held: saved.entryAtomic, feeHeld: '500000',
        deposited: saved.entryAtomic, refunded: '0', paid: [hostWallet], claims: {} };
      await service.reconcile(code);
      const candidate = await request('POST', route + '/prepare-guest', { walletAddress: guestWallet, name: 'Challenger' }, '2');
      assert.equal(candidate.status, 200, JSON.stringify(candidate.data));
      assert.equal(candidate.data.room.self.actions.deposit.entrypoint, 'accept_offer');
      assert.deepEqual(signed.map(item => item.entrypoint), ['authorize_guest']);
      chainRoom.guest = guestWallet; chainRoom.paid.push(guestWallet);
      chainRoom.held = '2000000'; chainRoom.deposited = '2000000';
      await service.reconcile(code);
      assert.equal(signed.at(-1)?.entrypoint, 'start_room');
      // A guest withdrawal can invalidate a pending start operation. A later
      // redeposit must receive a fresh signer intent, even from the same wallet.
      chainRoom.guest = null; chainRoom.paid = [hostWallet]; chainRoom.held = '1000000'; chainRoom.refunded = '1000000';
      await service.reconcile(code);
      chainRoom.guest = guestWallet; chainRoom.paid.push(guestWallet);
      chainRoom.held = '2000000'; chainRoom.deposited = '3000000';
      await service.reconcile(code);
      assert.equal(signed.filter(item => item.entrypoint === 'start_room').length, 2);
      assert.notEqual(signed.at(-1)?.guest, signed.at(-2)?.guest);
      chainRoom.status = 'active'; await service.reconcile(code);
      const seat = await request('POST', route + '/claim-seat', {}, '2');
      assert.equal(seat.status, 200, JSON.stringify(seat.data));
      assert.equal(seat.data.seat.roomCode, code);
      const game = await request('GET', '/api/wtfiap/party/rooms/' + code, undefined, '2', seat.data.seat.sessionToken);
      assert.equal(game.status, 200); assert.equal(game.data.view.phase, 'preparation');
      assert.equal(game.data.view.config.earlyStart, true);
      assert.equal((await service.read(code))?.guestWallet, guestWallet);
      (authority.funding as any).result = () => ({
        groups: [{ placeFrom: 1, playerIds: [saved.host.playerId] },
          { placeFrom: 2, playerIds: [seat.data.seat.playerId] }],
        receiptsHash: 'c'.repeat(64),
      });
      await service.reconcile(code);
      assert.equal(signed.at(-1)?.entrypoint, 'finalize_room');
      assert((await service.read(code))?.finalHash);
      // Rotating new admissions to v2 must leave this already funded v1 room
      // bound to its original claim contract and available winner claim.
      configs.shadownet = { ...config, contract: 'KT1' + '4'.repeat(33), scriptHash: 'b'.repeat(64), payoutMode: 1 };
      chainRoom.status = 'settled'; chainRoom.claims = { [guestWallet]: { amount: '2000000', claimed: false } };
      const legacy = await service.view(code, '2');
      assert.equal(legacy.escrowContract, saved.contract);
      assert.equal(legacy.payoutMode, 'claim');
      assert.equal(legacy.self.actions.claim?.contract, saved.contract);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await authority.close(); await pool.end(); await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
