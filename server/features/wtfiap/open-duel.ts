import type { Pool } from 'pg';
import { createRequire } from 'node:module';
import path from 'node:path';
import { TezosToolkit } from '@taquito/taquito';
import { hashTypedScript } from '../../../contracts/wtfiap-escrow/script-identity';
import { callSigner } from '../operator-signer/client';
import { commitment, demand, type FundingGame } from './funding';
import { NETWORKS } from './funding-contract';

type Network = 'mainnet' | 'shadownet';
type Config = { enabled: boolean; network: Network; chainId: (typeof NETWORKS)[Network]['chainId']; rpc: string; contract: string; scriptHash: string;
  referee: string; walletId: string; treasury: string; reason?: string };
type Candidate = { userId: string; wallet: string; name: string; authorizeHash?: string };
type OpenRecord = { schemaVersion: 2; roomCode: string; roomId: string; termsHash: string; rulesHash: string;
  seedCommitment: string; matchId: string; entryAtomic: string; host: { userId: string; playerId: string; wallet: string };
  candidates: Candidate[]; network: Network; contract: string; scriptHash: string; referee: string; walletId: string;
  treasury: string; createHash?: string; startHash?: string; startDepositCounter?: string;
  finalHash?: string; voidHash?: string;
  voidEvidence?: { reasonHash: string; evidenceHash: string }; guestWallet?: string; status: string; error?: string };
type Chain = { status: 'funding' | 'active' | 'settled' | 'voided' | 'cancelled'; host: string; guest: string | null;
  termsHash: string; rulesHash: string; seedCommitment: string; referee: string; entryAtomic: string;
  held: string; feeHeld: string; deposited: string; refunded: string; paid: string[];
  voidReasonHash: string | null; voidEvidenceHash: string | null;
  claims: Record<string, { amount: string; claimed: boolean }> };
const isAddress = (value: string) => /^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/.test(value);
const nat = (value: any) => String(value?.toFixed ? value.toFixed() : value);
const opt = (value: any): string | null => value == null || value.None !== undefined ? null : String(value.Some ?? value);
const fee = 500000n; // Owner-approved 0.5 XTZ on both Tezos networks.
const runtimeRulesHash: () => string = createRequire(path.resolve('package.json'))(
  path.resolve('server/features/wtfiap/rules.cjs')).getRuntimeRulesHash;

export function openDuelConfigs(env: NodeJS.ProcessEnv = process.env): Record<Network, Config> {
  const build = (network: Network): Config => {
    const prefix = network === 'mainnet' ? 'WTFIAP_OPEN_DUEL_MAINNET_' : 'WTFIAP_OPEN_DUEL_SHADOWNET_';
    const read = (key: string) => env[prefix + key] || '';
    const contract = read('CONTRACT'), scriptHash = read('SCRIPT_HASH'), referee = read('REFEREE_ADDRESS');
    const treasury = read('TREASURY_ADDRESS'), walletId = read('REFEREE_WALLET_ID');
    const enabled = read('ENABLED') === '1' && /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(contract) &&
      /^[a-f0-9]{64}$/.test(scriptHash) && isAddress(referee) && isAddress(treasury) && !!walletId;
    return { enabled, network, chainId: NETWORKS[network].chainId, rpc: read('RPC_URL') || NETWORKS[network].rpc,
      contract, scriptHash, referee, treasury, walletId,
      ...(!enabled ? { reason: `Open-seat ${network} XTZ escrow is not deployed and verified.` } : {}) };
  };
  return { mainnet: build('mainnet'), shadownet: build('shadownet') };
}

export function createOpenDuelService({ pool, game, linkedWallet, configs = openDuelConfigs(), adapters }: {
  pool: Pool; game: FundingGame & { offer(code: string, binding: any): any; updateOffer(code: string, summary: any): void;
    admitGuest(code: string, accountId: string, name: string): { playerId: string }; claimGuestSeat(code: string, accountId: string): any;
    closeOffer(code: string): void; audit(code: string): { ok: boolean; code: string; evidence: any };
    markVoided(code: string, binding: any): void }; linkedWallet(userId: string, address: string): Promise<boolean>;
  configs?: Record<Network, Config>;
  adapters?: { readChain?: (record: OpenRecord) => Promise<{ room: Chain | null; authorized: Set<string> }>;
    sign?: (record: OpenRecord, entrypoint: 'authorize_guest' | 'start_room' | 'finalize_room' | 'void_room',
      params: any, attemptBinding?: string) => Promise<string> };
}) {
  const read = async (code: string): Promise<OpenRecord | null> =>
    (await pool.query('SELECT document FROM wtfiap_open_duels WHERE room_code=$1', [code])).rows[0]?.document || null;
  async function mutate<T>(code: string, fn: (saved: OpenRecord | null) => Promise<{ record: OpenRecord; value: T }>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock_shared(hashtextextended('wtfiap-deployment-gate',0))");
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['wtfiap-open:' + code]);
      const row = await client.query('SELECT document FROM wtfiap_open_duels WHERE room_code=$1 FOR UPDATE', [code]);
      const { record, value } = await fn(row.rows[0]?.document || null);
      await client.query(`INSERT INTO wtfiap_open_duels(room_code,document) VALUES($1,$2::jsonb)
        ON CONFLICT(room_code) DO UPDATE SET document=EXCLUDED.document,updated_at=now()`, [code, JSON.stringify(record)]);
      await client.query('COMMIT'); return value;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async function chain(record: OpenRecord): Promise<{ room: Chain | null; authorized: Set<string> }> {
    if (adapters?.readChain) return adapters.readChain(record);
    const config = configs[record.network];
    demand(!config.enabled || config.contract === record.contract && config.scriptHash === record.scriptHash &&
      config.referee === record.referee && config.treasury === record.treasury,
    'The active escrow configuration differs from this room’s pinned deployment.', 503);
    let error: unknown;
    for (const rpc of [config.rpc, ...(config.rpc.replace(/\/$/, '') === NETWORKS[config.network].rpc.replace(/\/$/, '') ? [NETWORKS[config.network].fallback] : [])]) {
      try {
        const tezos = new TezosToolkit(rpc);
        demand(await tezos.rpc.getChainId() === config.chainId, 'Escrow RPC chain mismatch.');
        const block = await tezos.rpc.getBlockHash({ block: 'head~2' });
        const script = await tezos.rpc.getScript(record.contract, { block: block as any });
        demand(hashTypedScript(script.code) === record.scriptHash, 'Open-seat escrow script differs from its verified deployment.');
        const storage: any = await tezos.contract.getStorage(record.contract, script, block as any);
        demand(String(storage.treasury_address) === record.treasury && nat(storage.house_fee_mutez) === fee.toString() &&
          nat(storage.xtz_quantum) === '10000', 'Open-seat escrow storage differs from approved terms.');
        const raw: any = await storage.rooms.get(record.roomId, block);
        if (!raw) return { room: null, authorized: new Set() };
        const status = ['funding', 'active', 'settled', 'voided', 'cancelled'][Number(nat(raw.status))] as Chain['status'];
        demand(status && String(raw.host) === record.host.wallet && String(raw.terms_hash) === record.termsHash &&
          String(raw.rules_hash) === record.rulesHash && String(raw.seed_commitment) === record.seedCommitment &&
          String(raw.referee) === record.referee && nat(raw.entry_amount) === record.entryAtomic,
        'On-chain offer does not match the immutable room terms.');
        const guest = opt(raw.guest);
        const claims: Chain['claims'] = {};
        for (const wallet of [record.host.wallet, ...(guest ? [guest] : [])]) {
          const value: any = await storage.claims.get({ 0: record.roomId, 1: wallet }, block);
          if (value) claims[wallet] = { amount: nat(value.amount), claimed: value.claimed === true };
        }
        const authorized = new Set<string>();
        for (const candidate of record.candidates) {
          if (await storage.authorized.get({ 0: record.roomId, 1: candidate.wallet }, block) === true) authorized.add(candidate.wallet);
        }
        return { room: { status, host: String(raw.host), guest, termsHash: String(raw.terms_hash),
          rulesHash: String(raw.rules_hash), seedCommitment: String(raw.seed_commitment), referee: String(raw.referee),
          entryAtomic: nat(raw.entry_amount), held: nat(raw.held), feeHeld: nat(raw.fee_held),
          deposited: nat(raw.deposited), refunded: nat(raw.refunded),
          paid: [...raw.paid].map(String), voidReasonHash: opt(raw.void_reason_hash),
          voidEvidenceHash: opt(raw.void_evidence_hash), claims }, authorized };
      } catch (cause) { error = cause; }
    }
    throw error;
  }
  async function signer(record: OpenRecord, entrypoint: 'authorize_guest' | 'start_room' | 'finalize_room' | 'void_room', params: any, attemptBinding?: string) {
    if (adapters?.sign) return adapters.sign(record, entrypoint, params, attemptBinding);
    const requestId = commitment({ roomId: record.roomId, entrypoint, params, attemptBinding });
    const result = await callSigner({ intent: 'wtfiap_escrow', requestId, walletId: record.walletId,
      counterpartyContract: record.contract, chainId: configs[record.network].chainId, entrypoint, params, runId: record.roomId });
    demand(result.opHash, 'Escrow signer has no durable operation hash.');
    return result.opHash;
  }
  async function prepareHost(code: string, userId: string, wallet: string) {
    const room = game.inspect(code), terms = room.config?.duelWager;
    demand(room.phase === 'lobby' && room.config?.roomType === 'duel' && terms?.currency === 'XTZ' &&
      room.players.length === 1 && room.hostPlayerId === room.players[0].playerId && room.players[0].accountId === userId,
      'Only the authenticated creator of an open XTZ duel can establish its wager.', 403);
    demand(isAddress(wallet) && await linkedWallet(userId, wallet), 'Link and verify this wallet before staking.', 403);
    const network = terms.network as Network, config = configs[network];
    demand(config?.enabled, config?.reason || 'Choose a supported Tezos network.', 503);
    return mutate(code, async saved => {
      if (saved) { demand(saved.host.userId === userId && saved.host.wallet === wallet, 'The wager creator wallet is already fixed.'); return { record: saved, value: saved }; }
      const roomId = commitment({ version: 'wtfiap-open-duel-v1', network, contract: config.contract, roomCode: code });
      const termsHash = commitment({ version: 'wtfiap-open-duel-terms-v1', roomId, terms,
        hostWallet: wallet, feeMutez: fee.toString(), treasury: config.treasury });
      const rulesHash = runtimeRulesHash();
      const matchId = commitment({ version: 'wtfiap-open-duel-match-v1', roomId, roomCode: code });
      const offered = game.offer(code, { roomId, termsHash, rulesHash, matchId, network, escrowContract: config.contract });
      const record: OpenRecord = { schemaVersion: 2, roomCode: code, roomId, termsHash, rulesHash,
        seedCommitment: offered.offer.seedCommitment, matchId, entryAtomic: terms.entryAtomic,
        host: { userId, playerId: room.hostPlayerId, wallet }, candidates: [], network,
        contract: config.contract, scriptHash: config.scriptHash, referee: config.referee,
        walletId: config.walletId, treasury: config.treasury, status: 'prepared' };
      return { record, value: record };
    });
  }
  async function prepareGuest(code: string, userId: string, wallet: string, name: string) {
    demand(isAddress(wallet) && await linkedWallet(userId, wallet), 'Link and verify this wallet before staking.', 403);
    demand(typeof name === 'string' && name.trim(), 'Enter your commander name.', 400);
    const record = await mutate(code, async saved => {
      demand(saved && saved.host.userId !== userId && saved.host.wallet !== wallet, 'The creator cannot claim the opposing seat.', 403);
      const room: any = game.inspect(code);
      demand(room.phase === 'lobby' && room.offer && room.players.length === 1,
        'This funded seat is no longer open.');
      const candidate = saved.candidates.find(item => item.userId === userId);
      demand(!candidate || candidate.wallet === wallet, 'Your challenger wallet is already fixed.');
      if (!candidate) saved.candidates.push({ userId, wallet, name: name.trim() });
      return { record: saved, value: saved };
    });
    const onChain = await chain(record);
    demand(onChain.room?.status === 'funding' && !onChain.room.guest, 'The creator must first fund an open offer.');
    if (!onChain.authorized.has(wallet)) {
      const candidate = record.candidates.find(item => item.userId === userId)!;
      if (!candidate.authorizeHash) {
        const opHash = await signer(record, 'authorize_guest', { room_id: record.roomId, guest: wallet });
        await mutate(code, async current => {
          demand(current, 'Offer disappeared.');
          const entry = current.candidates.find(item => item.userId === userId && item.wallet === wallet);
          demand(entry, 'Challenger binding changed.');
          entry.authorizeHash ||= opHash;
          return { record: current, value: undefined };
        });
      }
    }
    return view(code, userId);
  }
  async function reconcile(code: string) {
    const record = await read(code);
    if (!record) return null;
    const observed = await chain(record);
    const room = observed.room;
    if (!room) return record;
    if (room.status === 'funding' && !game.inspect(code).lock) {
      game.updateOffer(code, { status: room.guest ? 'matching' : 'funded-awaiting-opponent', collectedAtomic: room.held });
      if (!room.guest && (record.status !== 'funded-awaiting-opponent' || record.startHash))
        await mutate(code, async current => { demand(current, 'Offer disappeared.'); current.status = 'funded-awaiting-opponent';
          delete current.startHash; delete current.startDepositCounter; delete current.guestWallet;
          return { record: current, value: undefined }; });
    }
    if (room.status === 'cancelled') {
      if ((game.inspect(code) as any).offer && !game.inspect(code).lock) game.closeOffer(code);
      return mutate(code, async current => { demand(current, 'Offer disappeared.'); current.status = 'cancelled'; return { record: current, value: current }; });
    }
    if (room.status === 'voided') {
      demand(record.voidEvidence && record.voidEvidence.reasonHash === room.voidReasonHash &&
        record.voidEvidence.evidenceHash === room.voidEvidenceHash,
      'Voided escrow lacks its recorded authoritative failure proof.');
      if (game.inspect(code).lock) game.markVoided(code, { roomId: record.roomId,
        termsHash: record.termsHash, matchId: record.matchId });
      return mutate(code, async current => { demand(current, 'Offer disappeared.'); current.status = 'voided';
        return { record: current, value: current }; });
    }
    const match = game.inspect(code);
    if (room.guest && room.status === 'funding') {
      const candidate = record.candidates.find(item => item.wallet === room.guest);
      demand(candidate, 'A funded challenger has no verified account binding.');
      if (!record.startHash || record.guestWallet !== room.guest || record.startDepositCounter !== room.deposited) {
        const opHash = await signer(record, 'start_room', { room_id: record.roomId, expected_terms_hash: record.termsHash,
          match_id: record.matchId }, `${room.guest}:${room.deposited}`);
        await mutate(code, async current => { demand(current, 'Offer disappeared.'); current.startHash = opHash; current.guestWallet = room.guest!;
          current.startDepositCounter = room.deposited; current.status = 'starting';
          return { record: current, value: undefined }; });
      }
    }
    if (room.status === 'active') {
      const guest = record.candidates.find(item => item.wallet === room.guest);
      demand(guest, 'Active duel has no verified challenger account.');
      if (record.guestWallet !== room.guest) await mutate(code, async current => { demand(current, 'Offer disappeared.');
        current.guestWallet = room.guest!; current.status = 'active'; return { record: current, value: undefined }; });
      if (!match.lock) {
        game.admitGuest(code, guest.userId, guest.name);
        game.lock(code, { roomId: record.roomId, termsHash: record.termsHash, rulesHash: record.rulesHash,
          matchId: record.matchId, network: record.network, escrowContract: record.contract });
      }
      if (game.inspect(code).phase === 'lobby') game.start(code, { roomId: record.roomId, termsHash: record.termsHash, matchId: record.matchId });
      game.update(code, { status: 'active', collectedAtomic: (BigInt(record.entryAtomic) * 2n).toString() });
      const result: any = game.result(code);
      if (result && !record.finalHash) {
        const binding = game.inspect(code);
        const idByWallet = new Map([[record.host.playerId, record.host.wallet], [binding.players.find(p => p.accountId === guest.userId)!.playerId, guest.wallet]]);
        const ranks = result.groups.flatMap((group: any) => group.playerIds.map((playerId: string) => ({
          player: idByWallet.get(playerId), rank: String(group.placeFrom), group_size: String(group.playerIds.length) })));
        demand(ranks.length === 2 && ranks.every((rank: any) => rank.player), 'Completed duel ranks must identify both funded wallets.');
        const params = { room_id: record.roomId, match_id: record.matchId, transcript_hash: result.receiptsHash,
          result_hash: commitment({ version: 'wtfiap-open-duel-result-v1', roomId: record.roomId, groups: result.groups,
            transcriptHash: result.receiptsHash, ranks }), ranks };
        const opHash = await signer(record, 'finalize_room', params);
        await mutate(code, async current => { demand(current, 'Offer disappeared.'); current.finalHash ||= opHash;
          current.status = 'settling'; return { record: current, value: undefined }; });
      }
    }
    if (room.status === 'settled') {
      game.update(code, { status: 'settled', collectedAtomic: (BigInt(record.entryAtomic) * 2n).toString() });
      return mutate(code, async current => { demand(current, 'Offer disappeared.'); current.status = 'settled'; return { record: current, value: current }; });
    }
    return record;
  }
  async function view(code: string, userId: string | null) {
    const record = await read(code), room = game.inspect(code), terms = room.config?.duelWager;
    demand(room.config?.roomType === 'duel' && terms?.currency === 'XTZ' && room.config.openSeatEscrowVersion === 1,
      'This room uses the prior duel rules.', 400);
    const config = configs[terms.network as Network];
    const observed = record ? await chain(record) : { room: null, authorized: new Set<string>() };
    const self = record && userId === record.host.userId ? record.host : null;
    const candidate = record?.candidates.find(item => item.userId === userId);
    const wallet = self?.wallet || candidate?.wallet || null;
    const chainRoom = observed.room;
    const actions: any = {};
    if (record && wallet) {
      const base = { contract: record.contract, network: record.network, chainId: config.chainId, expectedWallet: wallet };
      if (self && !chainRoom && config.enabled) actions.deposit = { ...base, entrypoint: 'create_offer', amountMutez: (BigInt(record.entryAtomic) + fee).toString(),
        params: { room_id: record.roomId, terms_hash: record.termsHash, rules_hash: record.rulesHash,
          seed_commitment: record.seedCommitment, referee: record.referee, entry_amount: record.entryAtomic } };
      if (candidate && config.enabled && chainRoom?.status === 'funding' && !chainRoom.guest && observed.authorized.has(candidate.wallet))
        actions.deposit = { ...base, entrypoint: 'accept_offer', amountMutez: record.entryAtomic,
          params: { room_id: record.roomId, expected_terms_hash: record.termsHash } };
      if (self && chainRoom?.status === 'funding') actions.refund = { ...base, entrypoint: 'cancel_offer', amountMutez: '0', params: record.roomId };
      if (candidate && chainRoom?.status === 'funding' && chainRoom.guest === candidate.wallet)
        actions.refund = { ...base, entrypoint: 'withdraw_guest', amountMutez: '0', params: record.roomId };
      if (chainRoom?.status === 'voided' && chainRoom.paid.includes(wallet))
        actions.refund = { ...base, entrypoint: 'refund', amountMutez: '0', params: record.roomId };
      if (chainRoom?.status === 'settled' && chainRoom.claims[wallet] && !chainRoom.claims[wallet].claimed &&
        BigInt(chainRoom.claims[wallet].amount) > 0n) actions.claim = { ...base, entrypoint: 'claim', amountMutez: '0', params: record.roomId };
    }
    return { roomCode: code, roomType: 'duel' as const, hostPlayerId: room.hostPlayerId,
      status: chainRoom?.status || record?.status || 'unfunded',
      network: terms.network, chainId: config?.chainId, escrowContract: config?.contract, terms,
      houseFeeAtomic: fee.toString(), treasuryAddress: config?.treasury, roomId: record?.roomId || null,
      termsHash: record?.termsHash || null, chainStatus: chainRoom?.status || null,
      depositedCount: chainRoom?.paid.length || 0, payingEntrants: 2,
      potAtomic: chainRoom?.held || '0', roster: room.players.map(({ playerId, name, isAI }) => ({ playerId, name, isAI })),
      self: { playerId: room.players.find(p => p.accountId === userId)?.playerId || null,
        isHost: Boolean(userId && room.players[0]?.accountId === userId),
        walletAddress: wallet, canBind: Boolean(userId && !wallet && config?.enabled &&
          (room.players[0]?.accountId === userId || chainRoom?.status === 'funding')),
        actions, payout: wallet && chainRoom?.claims[wallet] || null },
      authorized: Boolean(candidate && observed.authorized.has(candidate.wallet)),
      authorizationPending: Boolean(candidate?.authorizeHash && !observed.authorized.has(candidate.wallet)),
      guestDepositVerified: Boolean(candidate && chainRoom?.guest === candidate.wallet),
      guestSeatReady: Boolean(candidate && room.lock && room.players.some(p => p.accountId === userId)),
      config: { enabled: config?.enabled || false, reason: config?.reason || null, rpcUrl: config?.rpc,
        network: config?.network, chainId: config?.chainId, escrowContract: config?.contract,
        houseFeeAtomic: fee.toString(), treasuryAddress: config?.treasury } };
  }
  async function claimSeat(code: string, userId: string) {
    await reconcile(code);
    const record = await read(code), room = game.inspect(code);
    demand(record && record.candidates.some(c => c.userId === userId && c.wallet === record.guestWallet) && room.lock,
      'Your funded challenger seat is not ready.', 403);
    return game.claimGuestSeat(code, userId);
  }
  // Host-internal recovery only. A wallet or room creator cannot request a
  // technical void; the authoritative game audit must reproduce the failure.
  async function requestTechnicalVoid(code: string, operatorId: string) {
    demand(typeof operatorId === 'string' && operatorId.trim(), 'Record the operator identity.');
    const record = await read(code);
    demand(record && !record.finalHash && game.inspect(code).lock,
      'Only an unsettled funded match can be technically voided.');
    const observed = await chain(record);
    demand(observed.room?.status === 'active', 'Only an active escrow can be technically voided.');
    const audit = game.audit(code);
    demand(!audit.ok && audit.code === 'authoritative-game-failure',
      'A reproducible authoritative game failure is required.');
    const reasonHash = commitment('authoritative-game-failure');
    const evidenceHash = commitment({ version: 'wtfiap-open-duel-void-v1', roomId: record.roomId,
      operatorId: operatorId.trim(), audit: audit.evidence });
    await mutate(code, async current => { demand(current && !current.finalHash, 'Room can no longer be voided.');
      current.voidEvidence = { reasonHash, evidenceHash }; current.status = 'voiding';
      return { record: current, value: undefined }; });
    const opHash = await signer(record, 'void_room', { room_id: record.roomId,
      reason_hash: reasonHash, evidence_hash: evidenceHash });
    await mutate(code, async current => { demand(current, 'Offer disappeared.'); current.voidHash = opHash;
      return { record: current, value: undefined }; });
    return { roomCode: code, status: 'voiding', operationHash: opHash };
  }
  async function reconcileAll() {
    const rooms = await pool.query(`SELECT room_code FROM wtfiap_open_duels WHERE document->>'status' NOT IN ('settled','cancelled','voided')`);
    const failures: string[] = [];
    for (const row of rooms.rows) {
      try { await reconcile(row.room_code); }
      catch (cause) {
        failures.push(row.room_code);
        try { await mutate(row.room_code, async current => { demand(current, 'Offer disappeared.');
          current.error = cause instanceof Error ? cause.message : String(cause);
          return { record: current, value: undefined }; }); } catch { /* Preserve original failure. */ }
      }
    }
    if (failures.length) throw new Error(`Open duel reconciliation failed for ${failures.length} room(s).`);
  }
  return { read, view, prepareHost, prepareGuest, reconcile, reconcileAll, claimSeat, requestTechnicalVoid, configs };
}
