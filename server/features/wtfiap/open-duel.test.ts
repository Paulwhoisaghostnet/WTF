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
import { createOpenDuelService } from './open-duel';
import { createOpenDuelHandler } from './open-duel-http';

const url = process.env.WTFIAP_TEST_DATABASE_URL;
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
    const service = createOpenDuelService({ pool, game: authority.funding as any,
      linkedWallet: async (userId, wallet) => userId === '1' ? wallet === hostWallet : userId === '2' && wallet === guestWallet,
      configs: { shadownet: config, mainnet: { ...config, network: 'mainnet', enabled: false } },
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
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await authority.close(); await pool.end(); await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
