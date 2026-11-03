import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const script = new URL('./verify-health.mjs', import.meta.url).pathname;
const shadownet = {
  WTFIAP_SPONSOR_SHADOWNET_ENABLED: '1',
  WTFIAP_SPONSOR_MAINNET_ENABLED: '0',
  WTFIAP_SPONSOR_SHADOWNET_ESCROW_CONTRACT: 'KT1SponsorShadownet',
  WTFIAP_SPONSOR_SHADOWNET_REFEREE_WALLET_ID: 'shadownet-referee',
  WTFIAP_SPONSOR_SHADOWNET_REFEREE_ADDRESS: 'tz1ShadownetReferee',
  WTF_OPERATOR_SIGNER_WTFIAP_SPONSOR_CONTRACTS: 'KT1SponsorShadownet',
  WTF_OPERATOR_SIGNER_WTFIAP_WALLET_ID: 'shadownet-referee',
  WTF_OPERATOR_SIGNER_WTFIAP_CHAIN_ID: 'NetXsqzbfFenSTS',
};
const wallet = { id: 'shadownet-referee', address: 'tz1ShadownetReferee', chainId: 'NetXsqzbfFenSTS' };
const required = ['wtfiap_sponsor_escrow.claim_cash', 'wtfiap_sponsor_escrow.claim_lot'];

async function probe({ capabilities = required, env = shadownet, wallets = [wallet] } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'wtfiap-signer-health-'));
  const socketPath = join(directory, 'signer.sock');
  const server = createServer((connection) => {
    let input = '';
    connection.on('data', (chunk) => {
      input += chunk.toString();
      const end = input.indexOf('\n');
      if (end < 0) return;
      const request = JSON.parse(input.slice(0, end));
      assert.equal(request.intent, 'health');
      connection.end(JSON.stringify({ ok: true, version: 1, requestId: request.requestId,
        intent: 'health', capabilities, wallets }) + '\n');
    });
  });
  await new Promise((resolve) => server.listen(socketPath, resolve));
  try {
    const child = spawn(process.execPath, [script], { env: {
      ...process.env, WTF_OPERATOR_SIGNER_AUTH_TOKEN: 'test-auth',
      WTF_OPERATOR_SIGNER_SOCKET: socketPath, ...env,
    } });
    let stdout = '', stderr = '';
    child.stdout.on('data', (part) => { stdout += part; });
    child.stderr.on('data', (part) => { stderr += part; });
    const exit = await new Promise((resolve) => child.on('exit', resolve));
    return { exit, stdout, stderr };
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
}

test('deployment probe accepts a live signer with both claim actions and matching lane pins', async () => {
  const result = await probe();
  assert.equal(result.exit, 0, result.stderr);
  assert.match(result.stdout, /capabilities verified/);
});

test('deployment probe rejects the old signer that lacks a prize claim action', async () => {
  const result = await probe({ capabilities: [required[0]] });
  assert.notEqual(result.exit, 0);
  assert.match(result.stderr, /lacks sponsored prize action claim_lot/);
});

test('deployment probe rejects a signer whose enabled room policy pins another wallet', async () => {
  const result = await probe({ env: { ...shadownet,
    WTF_OPERATOR_SIGNER_WTFIAP_WALLET_ID: 'other-referee' } });
  assert.notEqual(result.exit, 0);
  assert.match(result.stderr, /signer policy differs/);
});

test('deployment probe checks Mainnet claim policy independently of Shadownet', async () => {
  const mainnet = {
    ...shadownet,
    WTFIAP_SPONSOR_SHADOWNET_ENABLED: '0',
    WTFIAP_SPONSOR_MAINNET_ENABLED: '1',
    WTFIAP_SPONSOR_MAINNET_ESCROW_CONTRACT: 'KT1SponsorMainnet',
    WTFIAP_SPONSOR_MAINNET_REFEREE_WALLET_ID: 'mainnet-referee',
    WTFIAP_SPONSOR_MAINNET_REFEREE_ADDRESS: 'tz1MainnetReferee',
    WTF_OPERATOR_SIGNER_WTFIAP_SPONSOR_MAINNET_CONTRACTS: 'KT1SponsorMainnet',
    WTF_OPERATOR_SIGNER_WTFIAP_MAINNET_WALLET_ID: 'mainnet-referee',
    WTF_OPERATOR_SIGNER_WTFIAP_MAINNET_CHAIN_ID: 'NetXdQprcVkpaWU',
  };
  const wallets = [{ id: 'mainnet-referee', address: 'tz1MainnetReferee',
    chainId: 'NetXdQprcVkpaWU' }];
  const current = await probe({ env: mainnet, wallets });
  assert.equal(current.exit, 0, current.stderr);
  const wrongContract = await probe({ env: {
    ...mainnet, WTF_OPERATOR_SIGNER_WTFIAP_SPONSOR_MAINNET_CONTRACTS: 'KT1Other',
  }, wallets });
  assert.notEqual(wrongContract.exit, 0);
  assert.match(wrongContract.stderr, /Mainnet sponsored-room signer policy differs/);
});
