import assert from 'node:assert/strict';
import test from 'node:test';
import rules from '../../server/features/wtfiap/rules.cjs';
import { assertFundingCompatibility, guardedReplacement } from './deploy-guard.mjs';

const active = { roomCode: 'funded', hasLock: true, rulesHash: 'old', status: 'active', hasFinalResult: false };
test('active funded rooms and orphan game locks prevent incompatible replacement', () => {
  assert.throws(() => assertFundingCompatibility([active], [{ roomCode: 'funded', rulesHash: 'old' }], 'new'), /pinned rules/);
  assert.throws(() => assertFundingCompatibility([], [{ roomCode: 'orphan', rulesHash: 'old' }], 'new'), /no matching durable/);
  assert.throws(() => assertFundingCompatibility([active], [{ roomCode: 'funded', rulesHash: 'other' }], 'old'), /inconsistent/);
  assert.doesNotThrow(() => assertFundingCompatibility([active], [{ roomCode: 'funded', rulesHash: 'old' }], 'old'));
  assert.doesNotThrow(() => assertFundingCompatibility([{ ...active, status: 'settled', hasFinalResult: true }], [{ roomCode: 'funded', rulesHash: 'old' }], 'new'));
});
test('an active open-seat duel is bound to its durable escrow record before replacement', () => {
  const record = { roomCode: 'open-duel', source: 'open-duel', hasLock: true, rulesHash: 'current',
    status: 'starting', roomId: 'room-id', termsHash: 'terms-hash', matchId: 'match-id',
    network: 'shadownet', escrowContract: 'KT1contract' };
  const lock = { roomCode: record.roomCode, rulesHash: record.rulesHash, version: 3,
    roomId: record.roomId, termsHash: record.termsHash, matchId: record.matchId,
    network: record.network, escrowContract: record.escrowContract };
  assert.doesNotThrow(() => assertFundingCompatibility([record], [lock], 'current'));
  assert.throws(() => assertFundingCompatibility([], [lock], 'current'), /no matching durable/);
  assert.throws(() => assertFundingCompatibility([{ ...record, hasLock: false }], [lock], 'current'), /no matching durable/);
  assert.throws(() => assertFundingCompatibility([record], [{ ...lock, termsHash: 'other' }], 'current'), /inconsistent open-duel/);
  assert.throws(() => assertFundingCompatibility([record], [{ ...lock, version: 2 }], 'current'), /wrong escrow binding version/);
  assert.throws(() => assertFundingCompatibility([record, record], [lock], 'current'), /Duplicate durable/);
  assert.throws(() => assertFundingCompatibility([record], [lock], 'future'), /pinned rules/);
});
test('the current release preserves only its explicitly pinned prior funded-room rules', () => {
  const oldRules = '49e69fb6b0dba17eb58ce63310be746dee29242aed0bbbb94e751a5e81a0f669';
  const currentRelease = 'f24470119652a6b5b0f135fd83af9d9b3f743e24fcfe413a62cc1f1f0740e579';
  assert.equal(rules.getRuntimeRulesHash(), currentRelease);
  assert.equal(rules.supportsPinnedRules(currentRelease, '838117450b955e3f47b35a9fdb714b002b5c99ba5d37911eb506638defd7c612'), true);
  assert.equal(rules.supportsPinnedRules(currentRelease, oldRules), true);
  assert.equal(rules.supportsPinnedRules(currentRelease, 'f6808dd4d3cc63e38b1ab9691826b14e2acc0bc837188aa784f96ff710b107de'), true);
  assert.equal(rules.supportsPinnedRules(currentRelease, 'dd7c9167362f17983d507ba907b8aba87ac6150f01562224d9871c13f6bebb3d'), true);
  assert.equal(rules.supportsPinnedRules(currentRelease, 'unlisted-rules'), false);
  assert.equal(rules.supportsPinnedRules('future-rules', oldRules), false);
  const record = { ...active, rulesHash: oldRules };
  const lock = { roomCode: record.roomCode, rulesHash: oldRules };
  assert.doesNotThrow(() => assertFundingCompatibility([record], [lock], currentRelease));
  assert.throws(() => assertFundingCompatibility([record], [lock], 'future-rules'), /pinned rules/);
});
test('replacement is under the admission lease and failure releases the lease without replacing', async () => {
  const order = [];
  const acquire = async () => { order.push('lock'); return { records: [active], release: async () => { order.push('unlock'); } }; };
  await assert.rejects(guardedReplacement({ incomingRules: 'new', acquire, readLocks: async () => [], replace: async () => order.push('replace') }), /pinned rules/);
  assert.deepEqual(order, ['lock', 'unlock']);
  order.length = 0;
  await guardedReplacement({ incomingRules: 'old', acquire, readLocks: async () => [], replace: async () => { order.push('replace'); } });
  assert.deepEqual(order, ['lock', 'replace', 'unlock']);
});

test('a finalized auditable technical void releases old rules, while requested or altered voids do not', () => {
  const roomId = 'a'.repeat(64), reason = 'authoritative-game-failure';
  const evidence = { roomId, rulesHash: 'old', finalizedBlock: { hash: 'block' }, audit: { error: 'reproduced' } };
  const reasonHash = rules.hashValue(reason), evidenceHash = rules.hashValue(evidence);
  const record = { ...active, roomId, status: 'voided', technicalVoid: { reason, evidence, reasonHash, evidenceHash },
    chain: { status: 'voided', voidReasonHash: reasonHash, voidEvidenceHash: evidenceHash },
    intents: [{ kind: 'void_room', status: 'applied', appliedAtBlock: 'finalized-block', params: { room_id: roomId, reason_hash: reasonHash, evidence_hash: evidenceHash } }] };
  assert.doesNotThrow(() => assertFundingCompatibility([record], [], 'new'));
  for (const invalid of [
    { ...record, status: 'voiding' }, { ...record, chain: { ...record.chain, status: 'active' } },
    { ...record, intents: [] }, { ...record, technicalVoid: { ...record.technicalVoid, evidence: { ...evidence, roomId: 'changed' } } },
  ]) assert.throws(() => assertFundingCompatibility([invalid], [], 'new'), /pinned rules/);
});
