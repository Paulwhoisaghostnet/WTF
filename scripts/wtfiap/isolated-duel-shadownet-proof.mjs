import assert from 'node:assert/strict';
import { open } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import { request } from '@playwright/test';
import { TezosToolkit } from '@taquito/taquito';
import { require as tsxRequire } from 'tsx/cjs/api';
import { actorById, buildPuppetKeyringEnv, readPuppetCredentials } from '../../tests/e2e/puppets/runtime.mjs';
import { playAuthoritativeTournament } from '../../tests/e2e/puppets/wtfiap-match-driver.mjs';
import { verifyWtfiapTransfer } from '../../tests/e2e/puppets/wtfiap-chain-evidence.mjs';

const baseURL = 'https://wtfos.app';
const chainId = 'NetXsqzbfFenSTS';
const rpcUrl = 'https://tezos-shadownet.octez.io/';
const indexer = 'https://api.shadownet.tzkt.io/v1';
const contract = 'KT1R1i4Ay96Eib8nsSs4GaY2vvVnvdaAMPu8';
const referee = 'tz1T9d8Qi4ZmWHNWgtbU6DwArwu191NfRnHe';
const treasury = 'tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt';
const protectedRoom = 'f0d03a0b-1b30-4456-926e-f83ade7a1e9f';
const entry = 10_000n;
const fee = 500_000n;
const configuration = { network: 'shadownet', chainId, rpcUrl };

async function json(response) {
  const body = await response.json();
  const reason = typeof body.reason === 'string' ? `: ${body.reason.split('\n')[0]}` : '';
  assert(response.ok(), `Proof request failed with HTTP ${response.status()}${reason}`);
  return body;
}

function withRateLimitRecovery(context) {
  const send = method => async (route, options) => {
    assert(route.startsWith('/') && !route.startsWith('//') && !route.includes(protectedRoom));
    assert(!route.endsWith('/reconcile') && !route.endsWith('/claim-seat'));
    for (;;) {
      const response = await context[method](route, options);
      if (response.status() !== 429) return response;
      const header = response.headers()['retry-after'];
      assert(header, 'Rate-limited responses must provide recovery timing');
      const delay = /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now();
      assert(Number.isFinite(delay) && delay >= 0);
      await wait(delay);
    }
  };
  return { get: send('get'), post: send('post'), storageState: () => context.storageState(), dispose: () => context.dispose() };
}

async function makeEntrant(actor, keyring) {
  const { wallet, signer } = await keyring.getSigner(actor.walletId);
  assert.equal(wallet.chainId, chainId);
  assert.equal(wallet.network, 'shadownet');
  assert.equal(wallet.address, actor.walletAddress);
  assert.equal(await signer.publicKeyHash(), actor.walletAddress);
  const tezos = new TezosToolkit(rpcUrl);
  tezos.setProvider({ signer });
  assert.equal(await tezos.rpc.getChainId(), chainId);
  return { actor, tezos, balance: BigInt((await tezos.rpc.getBalance(wallet.address)).toFixed()) };
}

async function signIn(entrant) {
  const { actor } = entrant;
  const api = withRateLimitRecovery(await request.newContext({ baseURL, maxRedirects: 0 }));
  try {
    const account = await json(await api.post('/api/auth/login', { data: { username: actor.username, password: actor.password } }));
    assert.equal(String(account.id), String(actor.userId));
    const wallets = await json(await api.get('/api/wallets'));
    assert(wallets.some(wallet => wallet.walletAddress === actor.walletAddress));
    const { csrfToken } = await json(await api.get('/api/auth/csrf-token'));
    assert(csrfToken);
    Object.assign(entrant, { request: api, csrfToken,
      write: async (route, data = {}) => json(await api.post(route, { headers: { 'X-CSRF-Token': csrfToken }, data })) });
  } catch (error) {
    await api.dispose();
    throw error;
  }
}

async function journalAt(filename) {
  // A failed or ambiguous submission requires reconciliation of this file.
  // Running again with the same path will stop before making a new room.
  const file = await open(filename, 'wx', 0o600);
  return { close: () => file.close(), async record(event) {
    const payload = JSON.stringify({ at: new Date().toISOString(), ...event });
    await file.write(`${payload}\n`);
    await file.sync();
    console.log(payload);
  } };
}

async function deposit({ entrant, action, entrypoint, amount, roomId, journal }) {
  assert.equal(action.contract, contract);
  assert.equal(action.network, 'shadownet');
  assert.equal(action.chainId, chainId);
  assert.equal(action.expectedWallet, entrant.actor.walletAddress);
  assert.equal(action.entrypoint, entrypoint);
  assert.equal(action.amountMutez, String(amount));
  assert.equal(action.params.room_id, roomId);
  if (entrypoint === 'create_offer') assert.equal(action.params.referee, referee);
  const tezos = entrant.tezos;
  assert.equal(await tezos.rpc.getChainId(), chainId);
  const escrow = await tezos.contract.at(contract);
  const transfer = escrow.methodsObject[entrypoint](action.params).toTransferParams({ amount: Number(amount), mutez: true });
  const estimate = await tezos.estimate.transfer(transfer);
  const balance = BigInt((await tezos.rpc.getBalance(entrant.actor.walletAddress)).toFixed());
  assert(balance >= amount + BigInt(estimate.suggestedFeeMutez) + BigInt(estimate.burnFeeMutez), 'Measured Shadownet wallet balance does not cover this action');
  await journal.record({ stage: 'intent', roomId, entrypoint, actor: entrant.actor.id, amountMutez: String(amount) });
  const operation = await tezos.contract.transfer({ ...transfer, fee: estimate.suggestedFeeMutez, gasLimit: estimate.gasLimit, storageLimit: estimate.storageLimit });
  await journal.record({ stage: 'submitted', entrypoint, operationHash: operation.hash });
  await operation.confirmation(3);
  const evidence = await verifyWtfiapTransfer({ configuration, operationHash: operation.hash,
    inclusionLevel: operation.includedInBlock, currency: 'XTZ', from: entrant.actor.walletAddress, to: contract, amountAtomic: String(amount) });
  await journal.record({ stage: 'finalized', entrypoint, evidence });
}

async function waitFor(read, predicate, blockDelay) {
  for (;;) {
    const value = await read();
    if (predicate(value)) return value;
    // Poll no faster than the live protocol's minimum block delay.
    await wait(blockDelay);
  }
}

async function settlementEvidence(tezos, roomId, winner, startingLevel, blockDelay) {
  const encoded = new URLSearchParams({ target: contract, sender: referee, entrypoint: 'finalize_room',
    status: 'applied', 'level.ge': String(startingLevel) });
  const containsRoomId = value => {
    if (typeof value === 'string') return value.toLowerCase() === roomId;
    return value && typeof value === 'object' && Object.values(value).some(containsRoomId);
  };
  const finalization = await waitFor(async () => {
    const response = await fetch(`${indexer}/operations/transactions?${encoded}`, { redirect: 'error' });
    assert(response.ok, 'Cannot locate the finalized operation via the configured Shadownet indexer');
    const rows = await response.json();
    const match = rows.find(row => row.parameter?.entrypoint === 'finalize_room' && containsRoomId(row.parameter.value));
    const finalized = await tezos.rpc.getBlockHeader({ block: 'head~2' });
    return match && finalized.level >= match.level ? match : null;
  }, Boolean, blockDelay);
  const evidence = (to, amountAtomic) => verifyWtfiapTransfer({ configuration,
    operationHash: finalization.hash, inclusionLevel: finalization.level, currency: 'XTZ', from: contract, to, amountAtomic });
  return { winner: await evidence(winner, String(entry * 2n)), treasury: await evidence(treasury, String(fee)) };
}

async function main() {
  const [mode, filename] = process.argv.slice(2);
  assert((mode === '--preflight' && !filename || mode === '--execute' && filename) && process.argv.length <= 4,
    'Usage: isolated-duel-shadownet-proof.mjs --preflight | --execute NEW-JOURNAL-PATH');
  assert.equal(process.env.WTF_E2E_LIVE_BASE_URL, baseURL);
  const credentials = await readPuppetCredentials();
  const runtime = tsxRequire('../../extensions/wtf-operator-signer/src/keyring.ts', import.meta.url);
  const { PlatformWalletKeyring } = runtime.default || runtime;
  const keyring = new PlatformWalletKeyring(await buildPuppetKeyringEnv());
  const entrants = await Promise.all(['bert', 'ernie'].map(id => makeEntrant(actorById(credentials, id), keyring)));
  const [host, guest] = entrants;
  console.log(JSON.stringify({ stage: 'preflight', chainId, contract, balancesMutez: entrants.map(({ actor, balance }) => ({ id: actor.id, balance: String(balance) })) }));
  if (mode === '--preflight') return;
  assert.equal(process.env.WTF_E2E_WTFIAP_HOST_WRITES, '1');
  assert.equal(process.env.WTF_E2E_WTFIAP_CHAIN_WRITES, '1');
  assert.equal(process.env.WTF_E2E_WTFIAP_ESCROW, contract);
  assert(host.balance > entry + fee && guest.balance > entry, 'Stake balances must exceed principal before creating a proof room');

  const minimalBlockDelay = Number((await host.tezos.rpc.getConstants()).minimal_block_delay);
  assert(Number.isSafeInteger(minimalBlockDelay) && minimalBlockDelay > 0);
  const blockDelay = minimalBlockDelay * 1000;
  const journal = await journalAt(filename);
  try {
    for (const entrant of entrants) await signIn(entrant);
    const label = `Shadownet Duel proof ${randomUUID().slice(0, 8)}`;
    await journal.record({ stage: 'creating', label, network: 'shadownet', contract });
    const opened = await host.write('/api/wtfiap/party/rooms', { name: label, boardMode: 'standard',
      preparationSeconds: null, roomType: 'duel', rulesPreset: 'ancient',
      duelWager: { currency: 'XTZ', network: 'shadownet', entryFee: '0.01' } });
    const code = opened.roomCode;
    assert(/^[a-f0-9-]{36}$/.test(code) && code !== protectedRoom);
    assert(opened.sessionToken && opened.playerId && opened.view.config.openSeatEscrowVersion === 1);
    Object.assign(host, { playerId: opened.playerId, sessionToken: opened.sessionToken });
    await journal.record({ stage: 'created', roomCode: code });
    const gamePath = `/api/wtfiap/party/rooms/${code}`;
    const funding = `/api/wtfiap/open-duel/rooms/${code}`;
    const lobby = async () => (await json(await host.request.get(`${gamePath}/lobby`))).view;
    const escrow = async entrant => (await json(await entrant.request.get(funding))).room;
    const initial = await escrow(host);
    assert(initial.config.enabled && initial.config.escrowContract === contract && initial.chainId === chainId);
    assert.equal(initial.network, 'shadownet');
    assert.equal(initial.terms.entryAtomic, String(entry));
    assert.equal(initial.houseFeeAtomic, String(fee));
    assert.equal(initial.treasuryAddress, treasury);
    const { room: offer } = await host.write(`${funding}/prepare-host`, { walletAddress: host.actor.walletAddress });
    assert(/^[a-f0-9]{64}$/.test(offer.roomId) && offer.payoutMode === 'automatic');
    const roomId = offer.roomId;
    await deposit({ entrant: host, action: offer.self.actions.deposit, entrypoint: 'create_offer', amount: entry + fee, roomId, journal });
    const funded = await waitFor(lobby, view => view.wager?.fundingStatus === 'funded-awaiting-opponent', blockDelay);
    assert.equal(funded.wager.collectedAtomic, String(entry));
    await journal.record({ stage: 'host-stake-observed-by-authority', roomCode: code, stakeMutez: String(entry) });

    await guest.write(`${funding}/prepare-guest`, { walletAddress: guest.actor.walletAddress, name: guest.actor.displayName });
    const authorized = await waitFor(() => escrow(guest), room => room.authorized && room.self.actions.deposit, blockDelay);
    await deposit({ entrant: guest, action: authorized.self.actions.deposit, entrypoint: 'accept_offer', amount: entry, roomId, journal });
    const active = await waitFor(lobby, view => view.phase === 'preparation' && view.wager?.fundingStatus === 'active', blockDelay);
    assert.equal(active.players.length, 2);
    assert.equal(active.wager.collectedAtomic, String(entry * 2n));
    const seat = await guest.write(`${gamePath}/resume`);
    assert.equal(seat.roomCode, code);
    assert(seat.sessionToken && seat.playerId !== host.playerId);
    Object.assign(guest, { playerId: seat.playerId, sessionToken: seat.sessionToken });
    await journal.record({ stage: 'both-stakes-started-authoritative-match', roomCode: code });
    const startingLevel = (await host.tezos.rpc.getBlockHeader()).level;
    const match = await playAuthoritativeTournament({ baseURL, roomCode: code, entrants,
      onRound: round => journal.record({ stage: 'round', roomCode: code, ...round }) });
    const winner = entrants.find(player => player.playerId === match.view.winnerId);
    assert(winner, 'The winner must be one of the funded human actors');
    const settled = await waitFor(lobby, view => view.wager?.fundingStatus === 'settled', blockDelay);
    assert.equal(settled.phase, 'finished');
    const paid = await escrow(winner);
    assert.equal(paid.paidOutAtomic, String(entry * 2n));
    assert.equal(paid.self.actions.claim, undefined);
    const evidence = await settlementEvidence(host.tezos, roomId, winner.actor.walletAddress, startingLevel, blockDelay);
    await journal.record({ stage: 'complete', roomCode: code, roomId, winner: winner.actor.id, match: match.summary, evidence,
      explicitReconcileRequests: 0, claimRequests: 0 });
  } finally {
    await Promise.all(entrants.map(entrant => entrant.request?.dispose()));
    await journal.close();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
