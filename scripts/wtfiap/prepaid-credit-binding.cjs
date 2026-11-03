'use strict';
// A prepaid XTZ balance has no withdrawal path. Keep the same contract
// available for new open-seat duels until a separately proven migration exists.
const fs = require('node:fs');
const path = require('node:path');

const FILE_NAME = 'prepaid-credit.binding';
const PREPAID_SCRIPT = '26ff7d8db669e2eeefcdeacb8bd38d113ff402a2afb3aed819ace25053161c2f';
const isKt1 = value => /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(value || '');

function activePrepaidBinding(env) {
  if (env.WTFIAP_OPEN_DUEL_MAINNET_ENABLED !== '1' || env.WTFIAP_OPEN_DUEL_MAINNET_PAYOUT_MODE !== 'prepaid')
    return null;
  const contract = env.WTFIAP_OPEN_DUEL_MAINNET_CONTRACT;
  const scriptHash = env.WTFIAP_OPEN_DUEL_MAINNET_SCRIPT_HASH;
  if (!isKt1(contract) || scriptHash !== PREPAID_SCRIPT)
    throw new Error('Mainnet prepaid-credit deployment is enabled without its approved contract and typed script hash.');
  return { network: 'mainnet', contract, scriptHash };
}

function assertOrPinPrepaidBinding(env, dataDir) {
  if (!dataDir) throw new Error('WTFIAP_DATA_DIR is required to protect prepaid-credit deposits.');
  const candidate = activePrepaidBinding(env);
  const file = path.join(dataDir, FILE_NAME);
  let saved;
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (saved) {
    if (!candidate || candidate.network !== saved.network || candidate.contract !== saved.contract ||
      candidate.scriptHash !== saved.scriptHash)
      throw new Error('Mainnet prepaid-credit binding cannot be disabled or changed while its nonwithdrawable credit may be outstanding. A proven compatible migration is required.');
    return { binding: saved, pinned: true };
  }
  if (!candidate) return { binding: null, pinned: false };
  fs.mkdirSync(dataDir, { recursive: true });
  try {
    const fd = fs.openSync(file, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(candidate) + '\n');
      // The guarded deploy runs as root; the app later reads this mounted
      // file as the volume owner (UID 1000 in production).
      if (process.getuid?.() === 0) {
        const owner = fs.statSync(dataDir);
        fs.fchownSync(fd, owner.uid, owner.gid);
      }
      fs.fsyncSync(fd);
    }
    finally { fs.closeSync(fd); }
    const directory = fs.openSync(dataDir, 'r');
    try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    return assertOrPinPrepaidBinding(env, dataDir);
  }
  return { binding: candidate, pinned: true };
}

module.exports = { activePrepaidBinding, assertOrPinPrepaidBinding, FILE_NAME };
if (require.main === module) {
  try {
    const result = assertOrPinPrepaidBinding(process.env, process.env.WTFIAP_DATA_DIR);
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) { process.stderr.write(`[wtfiap-prepaid-credit] ${error.message}\n`); process.exitCode = 1; }
}
