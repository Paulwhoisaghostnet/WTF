/** Run as the existing signer service user. Never prints or exports secrets. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';
import { TezosToolkit } from '@taquito/taquito';
import { loadEnv } from '../../extensions/wtf-operator-signer/src/env';
import { PlatformWalletKeyring } from '../../extensions/wtf-operator-signer/src/keyring';

async function main() {
  const envFile = process.argv[2];
  assert(envFile, 'Usage: node provision-shadownet-referee.cjs <signer-env-file>');
  Object.assign(process.env, dotenv.parse(readFileSync(envFile)));
  const env = loadEnv();
  const rpcUrl = 'https://tezos-shadownet.octez.io/';
  assert.equal(await new TezosToolkit(rpcUrl).rpc.getChainId(), 'NetXsqzbfFenSTS');
  // Wallet creation is a one-off local operation. The running service stays locked.
  const keyring = new PlatformWalletKeyring({ ...env, WTF_OPERATOR_SIGNER_RPC: rpcUrl,
    WTF_OPERATOR_SIGNER_SECRET: '', WTF_PLATFORM_KEYRING_CREATE_ENABLED: 1 });
  const id = 'wtfiap-shadownet-referee';
  const existing = (await keyring.listPublicWallets()).find(wallet => wallet.id === id);
  const wallet = existing ?? await keyring.createWallet({ id, label: 'WTFIAP Shadownet referee', role: 'testing', network: 'shadownet' });
  assert.equal(wallet.chainId, 'NetXsqzbfFenSTS');
  assert.equal(wallet.network, 'shadownet');
  console.log(JSON.stringify({ created: !existing, wallet }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
