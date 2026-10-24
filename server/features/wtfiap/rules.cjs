'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const stable = value => Array.isArray(value) ? '[' + value.map(stable).join(',') + ']'
  : value !== null && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}' : JSON.stringify(value);
const hashValue = value => crypto.createHash('sha256').update(stable(value)).digest('hex');
// The October 24 duel release adds an optional network to new duel terms.
// Rooms created by the preceding release have no network field; their
// canonical terms and game transitions are unchanged. This one exact release
// can continue those frozen rooms. Any later rules hash must prove its own
// compatibility before inheriting them.
const compatiblePinnedRules = Object.freeze({
  // Shop hold, battle plans, shared component draft, and supply encounters
  // are enabled only by fresh room config flags. Legacy, item, Cherub, and
  // balanced first-round transcripts and public views, plus a balanced
  // eight-seat eight-round transcript, were replayed byte for byte against
  // the previous runtime before admitting pinned wager rooms.
  '838117450b955e3f47b35a9fdb714b002b5c99ba5d37911eb506638defd7c612': Object.freeze([
    'dd7c9167362f17983d507ba907b8aba87ac6150f01562224d9871c13f6bebb3d',
    'f6808dd4d3cc63e38b1ab9691826b14e2acc0bc837188aa784f96ff710b107de',
    '4415776d4b0db7a07f3346bdf0c4014c68808060d32e974bbf7703ba47ac8d73',
    '81cc9dff78f5c2342f035238bbdbfdbbcf0ec110805b9f1b0ac3c29e3b2352bd',
    '49e69fb6b0dba17eb58ce63310be746dee29242aed0bbbb94e751a5e81a0f669',
  ]),
  // The hero rebalance is fixed on new rooms with balanceVersion 1. Existing
  // rooms have no balanceVersion; old item-free, item-enabled and Cherub
  // transcripts and public views remain byte-identical under this release.
  'dd7c9167362f17983d507ba907b8aba87ac6150f01562224d9871c13f6bebb3d': Object.freeze([
    'f6808dd4d3cc63e38b1ab9691826b14e2acc0bc837188aa784f96ff710b107de',
    '4415776d4b0db7a07f3346bdf0c4014c68808060d32e974bbf7703ba47ac8d73',
    '81cc9dff78f5c2342f035238bbdbfdbbcf0ec110805b9f1b0ac3c29e3b2352bd',
    '49e69fb6b0dba17eb58ce63310be746dee29242aed0bbbb94e751a5e81a0f669',
  ]),
  // Cherub is enabled only in newly created rooms. Prior room configs omit
  // cherubRulesVersion, and both item-free and item-enabled first-round
  // transcripts remained byte-identical under the new runtime.
  'f6808dd4d3cc63e38b1ab9691826b14e2acc0bc837188aa784f96ff710b107de': Object.freeze([
    '4415776d4b0db7a07f3346bdf0c4014c68808060d32e974bbf7703ba47ac8d73',
    '81cc9dff78f5c2342f035238bbdbfdbbcf0ec110805b9f1b0ac3c29e3b2352bd',
    '49e69fb6b0dba17eb58ce63310be746dee29242aed0bbbb94e751a5e81a0f669',
  ]),
  // The item release opts in only new rooms. The older room config omits
  // itemRulesVersion; its serialized state and public views match the prior
  // runtime through complete combats, and configuration preserves that omission.
  '4415776d4b0db7a07f3346bdf0c4014c68808060d32e974bbf7703ba47ac8d73': Object.freeze([
    '81cc9dff78f5c2342f035238bbdbfdbbcf0ec110805b9f1b0ac3c29e3b2352bd',
    '49e69fb6b0dba17eb58ce63310be746dee29242aed0bbbb94e751a5e81a0f669',
  ]),
  '81cc9dff78f5c2342f035238bbdbfdbbcf0ec110805b9f1b0ac3c29e3b2352bd': Object.freeze([
    '49e69fb6b0dba17eb58ce63310be746dee29242aed0bbbb94e751a5e81a0f669',
  ]),
});
const supportsPinnedRules = (incoming, pinned) => incoming === pinned ||
  compatiblePinnedRules[incoming]?.includes(pinned) === true;
const authoritative = entry => /^game\/(core|server)\/.*\.cjs$/.test(entry.sourcePath) ||
  /^source\/(engine|hero-catalog|terrain|zones|zone-policy)\.js$/.test(entry.sourcePath);
function rulesHashFromManifest(manifest) {
  const entries = manifest.files.filter(authoritative).map(entry => ({ path: entry.sourcePath, sha256: entry.sha256 })).sort((a, b) => a.path.localeCompare(b.path));
  if (!entries.some(entry => entry.path === 'game/server/party-server.cjs') || !entries.some(entry => entry.path === 'source/engine.js')) throw new Error('Authoritative runtime manifest is incomplete.');
  return hashValue({ version: 'wtfiap-rules-v1', files: entries });
}
function getRuntimeRulesHash(root = process.cwd()) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'server/features/wtfiap/runtime/release-manifest.json'), 'utf8'));
  for (const entry of manifest.files.filter(authoritative)) {
    const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, entry.path))).digest('hex');
    if (digest !== entry.sha256) throw new Error('Authoritative runtime file differs from its release manifest.');
  }
  return rulesHashFromManifest(manifest);
}
module.exports = { stable, hashValue, rulesHashFromManifest, getRuntimeRulesHash, supportsPinnedRules };
