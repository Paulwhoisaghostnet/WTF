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
  // Old and new engine replays matched serialized state and public views
  // across the deployed two- and eight-player preparation modes. The
  // pinned-duel-parity fixture records the previous runtime's digests.
  'ff9a0853ce61ba222b6414f7c65d960936c909289312b59a4384ef974c0ad135': Object.freeze([
    '49e69fb6b0dba17eb58ce63310be746dee29242aed0bbbb94e751a5e81a0f669',
  ]),
  // Closing an unfunded, unstarted room is a new lifecycle action. Existing
  // escrow-bound waiting and active rooms retain their prior state and view;
  // both phases were replayed through the previous and current authorities.
  'b6685336ab0dbd4b5875774e7fae17a2136003ab8ef8f3c416e967fc6ac3c8d8': Object.freeze([
    'c9b670f86935273edc58cc3ec9565c8095b38246f0623e9ad68fd9f19fe58302',
    'cb522a7d5245560b0aed42218bf283172338f13b2b178bb2c98e6e7f77ca86a9',
    'f4439f387f98e419c2d6cca7825c7730e3442c2f665cefb982ee1da3be1f1711',
    '838117450b955e3f47b35a9fdb714b002b5c99ba5d37911eb506638defd7c612',
    'dd7c9167362f17983d507ba907b8aba87ac6150f01562224d9871c13f6bebb3d',
    'f6808dd4d3cc63e38b1ab9691826b14e2acc0bc837188aa784f96ff710b107de',
    '4415776d4b0db7a07f3346bdf0c4014c68808060d32e974bbf7703ba47ac8d73',
    '81cc9dff78f5c2342f035238bbdbfdbbcf0ec110805b9f1b0ac3c29e3b2352bd',
    '49e69fb6b0dba17eb58ce63310be746dee29242aed0bbbb94e751a5e81a0f669',
  ]),
  // New fortune prices are fixed only on fresh rooms. Existing fortune rooms
  // without fortunePricingVersion replayed byte-identical under the new
  // runtime at 1,132 human-state/view checkpoints and 103 AI checkpoints.
  'c9b670f86935273edc58cc3ec9565c8095b38246f0623e9ad68fd9f19fe58302': Object.freeze([
    'cb522a7d5245560b0aed42218bf283172338f13b2b178bb2c98e6e7f77ca86a9',
    'f4439f387f98e419c2d6cca7825c7730e3442c2f665cefb982ee1da3be1f1711',
    '838117450b955e3f47b35a9fdb714b002b5c99ba5d37911eb506638defd7c612',
    'dd7c9167362f17983d507ba907b8aba87ac6150f01562224d9871c13f6bebb3d',
    'f6808dd4d3cc63e38b1ab9691826b14e2acc0bc837188aa784f96ff710b107de',
    '4415776d4b0db7a07f3346bdf0c4014c68808060d32e974bbf7703ba47ac8d73',
    '81cc9dff78f5c2342f035238bbdbfdbbcf0ec110805b9f1b0ac3c29e3b2352bd',
    '49e69fb6b0dba17eb58ce63310be746dee29242aed0bbbb94e751a5e81a0f669',
  ]),
  // Room variations are pinned only on fresh configs. Two- and eight-player
  // legacy, item, fortune, and Zone Defense rooms replayed byte-identical
  // serialized states and player views at 1,132 checkpoints across six rounds.
  // The previously broken round-five virtual-opponent view now supplies empty
  // item/fortune data; no old serializable state changes at that point.
  'cb522a7d5245560b0aed42218bf283172338f13b2b178bb2c98e6e7f77ca86a9': Object.freeze([
    'f4439f387f98e419c2d6cca7825c7730e3442c2f665cefb982ee1da3be1f1711',
    '838117450b955e3f47b35a9fdb714b002b5c99ba5d37911eb506638defd7c612',
    'dd7c9167362f17983d507ba907b8aba87ac6150f01562224d9871c13f6bebb3d',
    'f6808dd4d3cc63e38b1ab9691826b14e2acc0bc837188aa784f96ff710b107de',
    '4415776d4b0db7a07f3346bdf0c4014c68808060d32e974bbf7703ba47ac8d73',
    '81cc9dff78f5c2342f035238bbdbfdbbcf0ec110805b9f1b0ac3c29e3b2352bd',
    '49e69fb6b0dba17eb58ce63310be746dee29242aed0bbbb94e751a5e81a0f669',
  ]),
  // Fortunes are opt-in for newly created rooms. Legacy and the latest
  // pre-fortune two- and eight-seat rooms replayed three rounds with
  // byte-identical serialized states and player views against the prior runtime.
  'f4439f387f98e419c2d6cca7825c7730e3442c2f665cefb982ee1da3be1f1711': Object.freeze([
    '838117450b955e3f47b35a9fdb714b002b5c99ba5d37911eb506638defd7c612',
    'dd7c9167362f17983d507ba907b8aba87ac6150f01562224d9871c13f6bebb3d',
    'f6808dd4d3cc63e38b1ab9691826b14e2acc0bc837188aa784f96ff710b107de',
    '4415776d4b0db7a07f3346bdf0c4014c68808060d32e974bbf7703ba47ac8d73',
    '81cc9dff78f5c2342f035238bbdbfdbbcf0ec110805b9f1b0ac3c29e3b2352bd',
    '49e69fb6b0dba17eb58ce63310be746dee29242aed0bbbb94e751a5e81a0f669',
  ]),
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
  if (!entries.some(entry => ['game/server/party-server.cjs', 'game/server/party-server.wtfos.cjs'].includes(entry.path)) || !entries.some(entry => entry.path === 'source/engine.js')) throw new Error('Authoritative runtime manifest is incomplete.');
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
