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
test('the duel release preserves the immediately prior funded-room rules only', () => {
  const oldRules = '49e69fb6b0dba17eb58ce63310be746dee29242aed0bbbb94e751a5e81a0f669';
  const duelRelease = '81cc9dff78f5c2342f035238bbdbfdbbcf0ec110805b9f1b0ac3c29e3b2352bd';
  assert.equal(rules.getRuntimeRulesHash(), duelRelease);
  assert.equal(rules.supportsPinnedRules(duelRelease, oldRules), true);
  assert.equal(rules.supportsPinnedRules('future-rules', oldRules), false);
  const record = { ...active, rulesHash: oldRules };
  const lock = { roomCode: record.roomCode, rulesHash: oldRules };
  assert.doesNotThrow(() => assertFundingCompatibility([record], [lock], duelRelease));
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
