import type { Pool } from 'pg';
import { createRequire } from 'node:module';
import path from 'node:path';
import { TezosToolkit } from '@taquito/taquito';
import { ParameterSchema } from '@taquito/michelson-encoder';
import { hashTypedScript } from '../../../contracts/wtfiap-escrow/script-identity';
import { callSigner } from '../operator-signer/client';
import { commitment, demand, type FundingGame } from './funding';
import { NETWORKS } from './funding-contract';

type Network = 'mainnet' | 'shadownet';
type Config = { enabled: boolean; network: Network; chainId: (typeof NETWORKS)[Network]['chainId']; rpc: string; contract: string; scriptHash: string;
  referee: string; walletId: string; treasury: string; payoutMode?: 0 | 1 | 2; reason?: string };
type Candidate = { userId: string; wallet: string; name: string; authorizeHash?: string };
type OpenRecord = { schemaVersion: 2; roomCode: string; roomId: string; termsHash: string; rulesHash: string;
  seedCommitment: string; matchId: string; entryAtomic: string; host: { userId: string; playerId: string; wallet: string };
  candidates: Candidate[]; network: Network; contract: string; scriptHash: string; referee: string; walletId: string;
  treasury: string; payoutMode?: 0 | 1 | 2; createHash?: string; startHash?: string; startDepositCounter?: string;
  finalHash?: string; voidHash?: string;
  voidEvidence?: { reasonHash: string; evidenceHash: string }; guestWallet?: string; status: string; error?: string };
type Chain = { status: 'funding' | 'active' | 'settled' | 'voided' | 'cancelled'; host: string; guest: string | null;
  termsHash: string; rulesHash: string; seedCommitment: string; referee: string; entryAtomic: string;
  held: string; feeHeld: string; deposited: string; refunded: string; paid: string[]; payoutMode?: 0 | 1 | 2; paidOut?: string;
  prepaidGuest?: boolean;
  voidReasonHash: string | null; voidEvidenceHash: string | null;
  claims: Record<string, { amount: string; claimed: boolean }> };
const isAddress = (value: string) => /^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/.test(value);
const nat = (value: any) => String(value?.toFixed ? value.toFixed() : value);
const opt = (value: any): string | null => value == null || value.None !== undefined ? null : String(value.Some ?? value);
export function classifyOpenDuelOperation(contents: any[], expected: {
  wallet: string; contract: string; entrypoint: string; amountMutez: string; encodedParams: any;
}): 'applied' | 'failed' | 'pending' {
  const exact = contents.filter(content => content.kind === 'transaction' && content.source === expected.wallet &&
    content.destination === expected.contract && String(content.amount) === expected.amountMutez &&
    content.parameters?.entrypoint === expected.entrypoint &&
    commitment(content.parameters.value) === commitment(expected.encodedParams));
  demand(exact.length > 0, 'This operation did not submit the quoted wager action.', 409);
  const statuses = exact.map(content => content.metadata?.operation_result?.status);
  if (statuses.includes('applied')) return 'applied';
  if (statuses.every(status => ['failed', 'backtracked', 'skipped'].includes(status))) return 'failed';
  return 'pending';
}
const fee = 500000n; // Owner-approved 0.5 XTZ on both Tezos networks.
// Canonical typed Michelson hashes of the reviewed v1 claim and v2 direct-payout artifacts.
const approvedScriptHashes = {
  0: 'fa075804205228a3ecc4dbf08ba23fb39a1041bf16d57d4981b68f364652f899',
  1: 'ff8046cf0feca9d027acd111bb2cf656e142a8fd5765a2e711585dd5cb041181',
  2: '26ff7d8db669e2eeefcdeacb8bd38d113ff402a2afb3aed819ace25053161c2f',
} as const;
const runtimeRulesHash: () => string = createRequire(path.resolve('package.json'))(
  path.resolve('server/features/wtfiap/rules.cjs')).getRuntimeRulesHash;
const assertOrPinPrepaidBinding: (env: NodeJS.ProcessEnv, dataDir: string | undefined) => unknown =
  createRequire(path.resolve('package.json'))(path.resolve('scripts/wtfiap/prepaid-credit-binding.cjs')).assertOrPinPrepaidBinding;
// This module is loaded while mounting the game route. Pin before the HTTP
// listener can serve a top-up quote or admit an open challenger seat.
if (process.env.WTFIAP_DATA_DIR || process.env.WTFIAP_OPEN_DUEL_MAINNET_PAYOUT_MODE === 'prepaid')
  assertOrPinPrepaidBinding(process.env, process.env.WTFIAP_DATA_DIR);

export function openDuelConfigs(env: NodeJS.ProcessEnv = process.env): Record<Network, Config> {
  if (env === process.env && (env.WTFIAP_DATA_DIR || env.WTFIAP_OPEN_DUEL_MAINNET_PAYOUT_MODE === 'prepaid'))
    assertOrPinPrepaidBinding(env, env.WTFIAP_DATA_DIR);
  const build = (network: Network): Config => {
    const prefix = network === 'mainnet' ? 'WTFIAP_OPEN_DUEL_MAINNET_' : 'WTFIAP_OPEN_DUEL_SHADOWNET_';
    const read = (key: string) => env[prefix + key] || '';
    const contract = read('CONTRACT'), scriptHash = read('SCRIPT_HASH'), referee = read('REFEREE_ADDRESS');
    const treasury = read('TREASURY_ADDRESS'), walletId = read('REFEREE_WALLET_ID');
    const payoutSetting = read('PAYOUT_MODE');
    const payoutMode: 0 | 1 | 2 = payoutSetting === 'prepaid' ? 2 : payoutSetting === 'auto' ? 1 : 0;
    const enabled = read('ENABLED') === '1' && /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(contract) &&
      scriptHash === approvedScriptHashes[payoutMode] && isAddress(referee) && isAddress(treasury) && !!walletId &&
      ['', 'claim', 'auto', 'prepaid'].includes(payoutSetting) && (payoutMode !== 2 || network === 'mainnet');
    return { enabled, network, chainId: NETWORKS[network].chainId, rpc: read('RPC_URL') || NETWORKS[network].rpc,
      contract, scriptHash, referee, treasury, walletId, payoutMode,
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
    readCredit?: (wallet: string, config: Config) => Promise<string>;
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
  async function chain(record: OpenRecord, creditWallet?: string): Promise<{ room: Chain | null; authorized: Set<string>; creditBalance?: string }> {
    if (adapters?.readChain) return adapters.readChain(record);
    const config = configs[record.network];
    // The room pins its contract and script. Rotating the active deployment must
    // never strand an existing claim-based wager or its open challenger seat.
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
        const creditBalance = record.payoutMode === 2 && creditWallet ?
          nat(await storage.credit.get(creditWallet, block) || 0) : undefined;
        const raw: any = await storage.rooms.get(record.roomId, block);
        if (!raw) return { room: null, authorized: new Set(), creditBalance };
        const status = ['funding', 'active', 'settled', 'voided', 'cancelled'][Number(nat(raw.status))] as Chain['status'];
        demand(status && String(raw.host) === record.host.wallet && String(raw.terms_hash) === record.termsHash &&
          String(raw.rules_hash) === record.rulesHash && String(raw.seed_commitment) === record.seedCommitment &&
          String(raw.referee) === record.referee && nat(raw.entry_amount) === record.entryAtomic &&
          Number(nat(raw.payout_mode)) === (record.payoutMode ?? 0),
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
          paid: [...raw.paid].map(String), payoutMode: Number(nat(raw.payout_mode)) as 0 | 1 | 2,
          prepaidGuest: (record.payoutMode === 2 ? await storage.prepaid_guest.get(record.roomId, block) : false) === true,
          paidOut: nat(raw.paid_out), voidReasonHash: opt(raw.void_reason_hash),
          voidEvidenceHash: opt(raw.void_evidence_hash), claims }, authorized, creditBalance };
      } catch (cause) { error = cause; }
    }
    throw error;
  }
  async function creditView(userId: string, wallet: string) {
    demand(isAddress(wallet) && await linkedWallet(userId, wallet), 'Link and verify this wallet before buying credit.', 403);
    const config = configs.mainnet;
    if (!config.enabled || config.payoutMode !== 2) return { enabled: false, network: 'mainnet' as const,
      chainId: config.chainId, escrowContract: config.contract, balanceAtomic: '0',
      reason: 'Mainnet prepaid duel credit is unavailable.' };
    if (adapters?.readCredit) return { enabled: true, network: 'mainnet' as const,
      chainId: config.chainId, escrowContract: config.contract,
      balanceAtomic: await adapters.readCredit(wallet, config), reason: null };
    let cause: unknown;
    for (const rpc of [config.rpc, ...(config.rpc.replace(/\/$/, '') === NETWORKS.mainnet.rpc.replace(/\/$/, '') ?
      [NETWORKS.mainnet.fallback] : [])]) {
      try {
        const tezos = new TezosToolkit(rpc);
        demand(await tezos.rpc.getChainId() === config.chainId, 'Prepaid credit RPC chain mismatch.');
        const block = await tezos.rpc.getBlockHash({ block: 'head~2' });
        const script = await tezos.rpc.getScript(config.contract, { block: block as any });
        demand(hashTypedScript(script.code) === config.scriptHash, 'Prepaid credit contract differs from its verified deployment.');
        const storage: any = await tezos.contract.getStorage(config.contract, script, block as any);
        demand(String(storage.treasury_address) === config.treasury && nat(storage.house_fee_mutez) === fee.toString() &&
          nat(storage.xtz_quantum) === '10000', 'Prepaid credit storage differs from approved terms.');
        return { enabled: true, network: 'mainnet' as const, chainId: config.chainId,
          escrowContract: config.contract, balanceAtomic: nat(await storage.credit.get(wallet, block) || 0), reason: null };
      } catch (error) { cause = error; }
    }
    throw cause;
  }
  async function quoteCredit(userId: string, wallet: string, amountMutez: string) {
    const credit = await creditView(userId, wallet);
    demand(credit.enabled, credit.reason || 'Mainnet prepaid duel credit is unavailable.', 503);
    demand(typeof amountMutez === 'string' && /^(0|[1-9][0-9]*)$/.test(amountMutez) && BigInt(amountMutez) > 0n,
      'Enter a positive XTZ credit amount in mutez.', 400);
    return { contract: credit.escrowContract, network: credit.network, chainId: credit.chainId,
      expectedWallet: wallet, entrypoint: 'deposit_credit' as const, params: wallet, amountMutez };
  }
  async function creditOperation(userId: string, wallet: string, amountMutez: string, operationHash: string) {
    const quote = await quoteCredit(userId, wallet, amountMutez);
    demand(typeof operationHash === 'string' && /^o[1-9A-HJ-NP-Za-km-z]+$/.test(operationHash),
      'Enter a Tezos operation hash.', 400);
    const base = (process.env.WTFIAP_OPEN_DUEL_MAINNET_INDEXER_URL || 'https://api.tzkt.io/v1').replace(/\/$/, '');
    let located: any[];
    try {
      const response = await fetch(base + '/operations/transactions/' + encodeURIComponent(operationHash));
      if (response.status === 404) return { status: 'pending' as const, operationHash };
      demand(response.ok, 'The Mainnet indexer is temporarily unavailable.', 503);
      const body = await response.json();
      demand(Array.isArray(body), 'The Mainnet indexer returned an invalid operation response.');
      located = body;
    } catch (cause) {
      if ((cause as any)?.status) throw cause;
      throw Object.assign(new Error('The Mainnet indexer is temporarily unavailable.'), { status: 503 });
    }
    const candidates = located.filter(tx => tx.sender?.address === wallet &&
      tx.target?.address === quote.contract && tx.parameter?.entrypoint === 'deposit_credit' &&
      Number.isSafeInteger(tx.level) && tx.level > 0);
    if (!candidates.length) {
      if (located.length) throw Object.assign(new Error('This operation did not target your quoted Mainnet credit.'), { status: 409 });
      return { status: 'pending' as const, operationHash };
    }
    let cause: unknown;
    for (const rpc of [configs.mainnet.rpc, ...(configs.mainnet.rpc.replace(/\/$/, '') === NETWORKS.mainnet.rpc.replace(/\/$/, '') ?
      [NETWORKS.mainnet.fallback] : [])]) {
      try {
        const tezos = new TezosToolkit(rpc);
        demand(await tezos.rpc.getChainId() === quote.chainId, 'Prepaid credit RPC chain mismatch.');
        const finalized = await tezos.rpc.getBlockHeader({ block: 'head~2' });
        const entrypoints: any = await tezos.rpc.getEntrypoints(quote.contract);
        const encoded = new ParameterSchema(entrypoints.entrypoints.deposit_credit).EncodeObject(wallet);
        for (const candidate of candidates) {
          if (candidate.level > finalized.level) continue;
          const blockHash = await tezos.rpc.getBlockHash({ block: String(candidate.level) });
          if (candidate.block !== blockHash) continue;
          const block = await tezos.rpc.getBlock({ block: blockHash });
          const operation: any = block.operations.flat().find((item: any) => item.hash === operationHash);
          if (!operation) continue;
          const exact = operation.contents.filter((content: any) => content.kind === 'transaction' &&
            content.source === wallet && content.destination === quote.contract &&
            String(content.amount) === amountMutez && content.parameters?.entrypoint === 'deposit_credit' &&
            commitment(content.parameters.value) === commitment(encoded));
          if (!exact.length) throw Object.assign(new Error('This operation did not deposit the quoted Mainnet credit.'), { status: 409 });
          const statuses = exact.map((content: any) => content.metadata?.operation_result?.status);
          return { status: statuses.every((status: string) => status === 'applied') ? 'applied' as const :
            statuses.every((status: string) => ['failed', 'backtracked', 'skipped'].includes(status)) ? 'failed' as const : 'pending' as const,
            operationHash, blockHash, level: candidate.level };
        }
        return { status: 'pending' as const, operationHash };
      } catch (error) { cause = error; }
    }
    throw cause;
  }
  async function roomOperation(userId: string, code: string, wallet: string,
    entrypoint: 'create_offer' | 'accept_offer' | 'accept_prepaid' | 'cancel_offer' | 'withdraw_guest' | 'refund' | 'claim',
    operationHash: string) {
    const record = await read(code);
    demand(record, 'This open-seat wager room was not found.', 404);
    const isHost = record.host.userId === userId && record.host.wallet === wallet;
    const isCandidate = record.candidates.some(candidate => candidate.userId === userId && candidate.wallet === wallet);
    demand(isAddress(wallet) && await linkedWallet(userId, wallet) && (isHost || isCandidate),
      'Link the wallet used for this wager seat.', 403);
    demand(['create_offer', 'accept_offer', 'accept_prepaid', 'cancel_offer', 'withdraw_guest', 'refund', 'claim'].includes(entrypoint),
      'Unknown wager action.', 400);
    demand((!['create_offer', 'cancel_offer'].includes(entrypoint) || isHost) &&
      (!['accept_offer', 'accept_prepaid', 'withdraw_guest'].includes(entrypoint) || isCandidate),
    'This wallet cannot verify that wager action.', 403);
    demand(entrypoint !== 'accept_prepaid' || record.payoutMode === 2,
      'This wager does not support prepaid credit.', 400);
    demand(entrypoint !== 'claim' || record.payoutMode === 0,
      'This wager pays automatically and has no claim action.', 400);
    demand(typeof operationHash === 'string' && /^o[1-9A-HJ-NP-Za-km-z]+$/.test(operationHash),
      'Enter a Tezos operation hash.', 400);
    const amountMutez = entrypoint === 'create_offer' ? (BigInt(record.entryAtomic) + fee).toString() :
      entrypoint === 'accept_offer' ? record.entryAtomic : '0';
    const params = entrypoint === 'create_offer' ? { room_id: record.roomId, terms_hash: record.termsHash,
      rules_hash: record.rulesHash, seed_commitment: record.seedCommitment,
      referee: record.referee, entry_amount: record.entryAtomic } :
      entrypoint === 'accept_offer' || entrypoint === 'accept_prepaid' ?
        { room_id: record.roomId, expected_terms_hash: record.termsHash } : record.roomId;
    const indexer = (record.network === 'mainnet' ?
      process.env.WTFIAP_OPEN_DUEL_MAINNET_INDEXER_URL || 'https://api.tzkt.io/v1' :
      process.env.WTFIAP_OPEN_DUEL_SHADOWNET_INDEXER_URL || 'https://api.shadownet.tzkt.io/v1').replace(/\/$/, '');
    let located: any[];
    try {
      const response = await fetch(indexer + '/operations/transactions/' + encodeURIComponent(operationHash));
      if (response.status === 404) return { status: 'pending' as const, operationHash };
      demand(response.ok, 'The wager indexer is temporarily unavailable.', 503);
      located = await response.json();
      demand(Array.isArray(located), 'The wager indexer returned an invalid operation response.', 503);
    } catch (cause) {
      if ((cause as any)?.status) throw cause;
      throw Object.assign(new Error('The wager indexer is temporarily unavailable.'), { status: 503 });
    }
    const candidates = located.filter(tx => tx.sender?.address === wallet && tx.target?.address === record.contract &&
      tx.parameter?.entrypoint === entrypoint && Number.isSafeInteger(tx.level) && tx.level > 0);
    if (!candidates.length) {
      if (located.length) throw Object.assign(new Error('This operation did not target your challenger seat.'), { status: 409 });
      return { status: 'pending' as const, operationHash };
    }
    const config = configs[record.network];
    let cause: unknown;
    for (const rpc of [config.rpc, ...(config.rpc.replace(/\/$/, '') === NETWORKS[record.network].rpc.replace(/\/$/, '') ?
      [NETWORKS[record.network].fallback] : [])]) {
      try {
        const tezos = new TezosToolkit(rpc);
        demand(await tezos.rpc.getChainId() === config.chainId, 'Wager RPC chain mismatch.');
        const finalized = await tezos.rpc.getBlockHeader({ block: 'head~2' });
        const script = await tezos.rpc.getScript(record.contract, { block: 'head~2' });
        demand(hashTypedScript(script.code) === record.scriptHash, 'Wager contract differs from its verified room binding.');
        const entrypoints: any = await tezos.rpc.getEntrypoints(record.contract);
        demand(entrypoints.entrypoints[entrypoint], 'This escrow has no such wager action.', 400);
        const encodedParams = new ParameterSchema(entrypoints.entrypoints[entrypoint]).EncodeObject(params);
        for (const candidate of candidates) {
          if (candidate.level > finalized.level) continue;
          const blockHash = await tezos.rpc.getBlockHash({ block: String(candidate.level) });
          if (candidate.block !== blockHash) continue;
          const block = await tezos.rpc.getBlock({ block: blockHash });
          const operation: any = block.operations.flat().find((item: any) => item.hash === operationHash);
          if (!operation) continue;
          const status = classifyOpenDuelOperation(operation.contents, { wallet, contract: record.contract,
            entrypoint, amountMutez, encodedParams });
          return { status, operationHash, blockHash, level: candidate.level };
        }
        return { status: 'pending' as const, operationHash };
      } catch (error) { cause = error; }
    }
    throw cause;
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
      const payoutMode = config.payoutMode ?? 0;
      const roomId = commitment({ version: payoutMode === 2 ? 'wtfiap-open-duel-v3' : payoutMode === 1 ? 'wtfiap-open-duel-v2' : 'wtfiap-open-duel-v1',
        network, contract: config.contract, roomCode: code });
      const termsHash = commitment({ version: payoutMode === 2 ? 'wtfiap-open-duel-terms-v3' : payoutMode === 1 ? 'wtfiap-open-duel-terms-v2' : 'wtfiap-open-duel-terms-v1',
        roomId, terms, hostWallet: wallet, feeMutez: fee.toString(), treasury: config.treasury,
        ...(payoutMode === 1 ? { payoutMode: 'automatic' } : payoutMode === 2 ? { payoutMode: 'prepaid-credit-or-direct' } : {}) });
      const rulesHash = runtimeRulesHash();
      const matchId = commitment({ version: payoutMode === 2 ? 'wtfiap-open-duel-match-v3' : payoutMode === 1 ? 'wtfiap-open-duel-match-v2' : 'wtfiap-open-duel-match-v1',
        roomId, roomCode: code });
      const offered = game.offer(code, { roomId, termsHash, rulesHash, matchId, network, escrowContract: config.contract });
      const record: OpenRecord = { schemaVersion: 2, roomCode: code, roomId, termsHash, rulesHash,
        seedCommitment: offered.offer.seedCommitment, matchId, entryAtomic: terms.entryAtomic,
        host: { userId, playerId: room.hostPlayerId, wallet }, candidates: [], network,
        contract: config.contract, scriptHash: config.scriptHash, referee: config.referee,
        walletId: config.walletId, treasury: config.treasury, payoutMode, status: 'prepared' };
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
          result_hash: commitment({ version: record.payoutMode === 2 ? 'wtfiap-open-duel-result-v3' : record.payoutMode === 1 ? 'wtfiap-open-duel-result-v2' : 'wtfiap-open-duel-result-v1',
            roomId: record.roomId, groups: result.groups,
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
    const activeConfig = configs[terms.network as Network];
    const config = record ? { ...activeConfig, contract: record.contract, scriptHash: record.scriptHash,
      referee: record.referee, treasury: record.treasury, walletId: record.walletId,
      payoutMode: record.payoutMode ?? 0, enabled: true } : activeConfig;
    const candidate = record?.candidates.find(item => item.userId === userId);
    const observed = record ? await chain(record, candidate?.wallet) : { room: null, authorized: new Set<string>(), creditBalance: undefined };
    const self = record && userId === record.host.userId ? record.host : null;
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
      if (candidate && record.payoutMode === 2 && config.enabled && chainRoom?.status === 'funding' &&
          !chainRoom.guest && observed.authorized.has(candidate.wallet) &&
          BigInt(observed.creditBalance || '0') >= BigInt(record.entryAtomic))
        actions.prepaidJoin = { ...base, entrypoint: 'accept_prepaid', amountMutez: '0',
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
      potAtomic: chainRoom?.status === 'settled' ?
        (BigInt(chainRoom.deposited) - BigInt(chainRoom.refunded)).toString() : chainRoom?.held || '0',
      payoutMode: record?.payoutMode === 1 || record?.payoutMode === 2 ? 'automatic' : 'claim',
      paidOutAtomic: chainRoom?.paidOut || '0',
      self: { playerId: room.players.find(p => p.accountId === userId)?.playerId || null,
        isHost: Boolean(userId && room.players[0]?.accountId === userId),
        walletAddress: wallet, canBind: Boolean(userId && !wallet && config?.enabled &&
          (room.players[0]?.accountId === userId || chainRoom?.status === 'funding')),
        actions, payout: wallet && chainRoom?.claims[wallet] || null,
        creditBalanceAtomic: observed.creditBalance || '0',
        prepaidSeat: Boolean(candidate && chainRoom?.guest === candidate.wallet && chainRoom.prepaidGuest) },
      authorized: Boolean(candidate && observed.authorized.has(candidate.wallet)),
      authorizationPending: Boolean(candidate?.authorizeHash && !observed.authorized.has(candidate.wallet)),
      guestDepositVerified: Boolean(candidate && chainRoom?.guest === candidate.wallet),
      guestSeatReady: Boolean(candidate && room.lock && room.players.some(p => p.accountId === userId)),
      config: { enabled: config?.enabled || false, reason: config?.reason || null, rpcUrl: config?.rpc,
        network: config?.network, chainId: config?.chainId, escrowContract: config?.contract,
        houseFeeAtomic: fee.toString(), treasuryAddress: config?.treasury,
        prepaidEnabled: record?.payoutMode === 2 || !record && config?.payoutMode === 2 } };
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
  return { read, view, creditView, quoteCredit, creditOperation, roomOperation, prepareHost, prepareGuest, reconcile, reconcileAll,
    claimSeat, requestTechnicalVoid, configs };
}
