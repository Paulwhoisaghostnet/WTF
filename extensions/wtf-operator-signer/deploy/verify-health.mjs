import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';

const env = process.env;
const auth = env.WTF_OPERATOR_SIGNER_AUTH_TOKEN;
if (!auth) throw new Error('Signer health requires its configured auth token.');

const socketPath = env.WTF_OPERATOR_SIGNER_SOCKET || '/run/wtf/operator-signer.sock';
const timeout = Number(env.WTF_OPERATOR_SIGNER_RESPONSE_TIMEOUT_MS) || 45_000;
const requestId = randomUUID();
const response = await new Promise((resolve, reject) => {
  const socket = createConnection({ path: socketPath });
  let data = '';
  let complete = false;
  const fail = (error) => {
    if (complete) return;
    complete = true;
    socket.destroy();
    reject(error);
  };
  socket.setTimeout(timeout, () => fail(new Error('Signer health timed out.')));
  socket.on('connect', () => socket.write(JSON.stringify({
    version: 1, auth, requestId, intent: 'health', payload: {},
  }) + '\n'));
  socket.on('data', (chunk) => {
    data += chunk.toString();
    const end = data.indexOf('\n');
    if (end < 0 || complete) return;
    complete = true;
    socket.end();
    try { resolve(JSON.parse(data.slice(0, end))); }
    catch { reject(new Error('Signer health returned invalid JSON.')); }
  });
  socket.on('error', fail);
  socket.on('close', () => {
    if (!complete) fail(new Error('Signer health connection closed without a response.'));
  });
});

if (response.ok !== true || response.version !== 1 || response.requestId !== requestId ||
    response.intent !== 'health') throw new Error('Signer health response did not match the request.');
const capabilities = new Set(response.capabilities || []);
for (const action of ['claim_cash', 'claim_lot']) {
  if (!capabilities.has(`wtfiap_sponsor_escrow.${action}`)) {
    throw new Error(`Signer lacks sponsored prize action ${action}.`);
  }
}

for (const [network, prefix, policyPrefix, chainId] of [
  ['Shadownet', 'WTFIAP_SPONSOR_SHADOWNET_', 'WTF_OPERATOR_SIGNER_WTFIAP_', 'NetXsqzbfFenSTS'],
  ['Mainnet', 'WTFIAP_SPONSOR_MAINNET_', 'WTF_OPERATOR_SIGNER_WTFIAP_MAINNET_', 'NetXdQprcVkpaWU'],
]) {
  if (env[prefix + 'ENABLED'] !== '1') continue;
  const contract = env[prefix + 'ESCROW_CONTRACT'];
  const walletId = env[prefix + 'REFEREE_WALLET_ID'];
  const address = env[prefix + 'REFEREE_ADDRESS'];
  const allowlistKey = network === 'Shadownet'
    ? 'WTF_OPERATOR_SIGNER_WTFIAP_SPONSOR_CONTRACTS'
    : 'WTF_OPERATOR_SIGNER_WTFIAP_SPONSOR_MAINNET_CONTRACTS';
  const allowed = (env[allowlistKey] || '').split(',').map((part) => part.trim());
  const wallet = response.wallets?.find((item) => item.id === walletId);
  if (!contract || !walletId || !address || !allowed.includes(contract) ||
      env[policyPrefix + 'WALLET_ID'] !== walletId ||
      env[policyPrefix + 'CHAIN_ID'] !== chainId ||
      wallet?.address !== address || wallet?.chainId !== chainId) {
    throw new Error(`${network} sponsored-room signer policy differs from the enabled room configuration.`);
  }
}

console.log('Signer health and sponsored prize claim capabilities verified.');
