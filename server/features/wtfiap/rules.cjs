'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const stable = value => Array.isArray(value) ? '[' + value.map(stable).join(',') + ']'
  : value !== null && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}' : JSON.stringify(value);
const hashValue = value => crypto.createHash('sha256').update(stable(value)).digest('hex');
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
module.exports = { stable, hashValue, rulesHashFromManifest, getRuntimeRulesHash };
