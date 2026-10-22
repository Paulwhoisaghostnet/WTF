import assert from 'node:assert/strict';
import { mkdir, open, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { TezosToolkit } from '@taquito/taquito';
import { require as tsxRequire } from 'tsx/cjs/api';
import { verifyWtfiapTransfer } from './wtfiap-chain-evidence.mjs';

const { measuredFundingDeficit, assertFundingReceipt } = tsxRequire('../../../contracts/wtfiap-escrow/shadownet-proof.ts', import.meta.url);
const source = { walletId: 'e2e-bert', address: 'tz1RWvytxhPa5a46c5mbv4omzrU6rMJG8wTZ' };
const recipients = Object.freeze({
  'e2e-ernie': 'tz1g49uR2BF63hfhZzWr1yQRGfVWinycYwBJ',
  'e2e-elmo': 'tz1a5q2EhDdenvyYB95oYtaaBWJ4PStzgBmk',
  'e2e-bigbird': 'tz1UHGz7X3zxuTZDSDZA1gxsscdUZakSYkyL',
  'e2e-thecount': 'tz1X2f9ef19ty5WiQPQU7DDsMwY4f8Dbi3VV',
  'e2e-snuffaluffagus': 'tz1T5wqwh1oH2zH54A34JcnNH3gSMNAzVgDT',
  'e2e-grover': 'tz1XcyoWxxArxigCpyEoCN9cLVkSerV6tCQh',
  'e2e-cookiemonster': 'tz1cqeT8RUQafohYNcQxNTVsW6X9K5FCRLLf',
});
let serial = Promise.resolve();

// Test-only, approved local-wallet lane. The caller must also serialize Bert's
// own game operations with this helper; the separate referee uses the root key.
export function estimateFundedBatch(options) {
  const run = serial.then(() => estimate(options));
  serial = run.catch(() => {});
  return run;
}

async function estimate({ tezos, transfers, actor, configuration, keyring, directory, record = async () => {},
  toolkitFactory = rpc => new TezosToolkit(rpc) }) {
  assert.equal(process.env.WTF_E2E_WTFIAP_CHAIN_WRITES, '1');
  assert.equal(configuration.network, 'shadownet');
  assert.equal(configuration.chainId, 'NetXsqzbfFenSTS');
  assert.equal(await tezos.rpc.getChainId(), configuration.chainId);
  const recipient = actor.walletAddress ?? actor.address;
  assert.equal(actor.chainId, configuration.chainId);
  assert.equal(actor.walletId === source.walletId ? source.address : recipients[actor.walletId], recipient);
  assert.equal(typeof recipient, 'string');
  assert(Array.isArray(transfers) && transfers.length > 0);
  const transferTotal = transfers.reduce((sum, transfer) => {
    assert.equal(transfer.kind, 'transaction'); assert.equal(transfer.mutez, true);
    assert(/^(0|[1-9][0-9]*)$/.test(String(transfer.amount)));
    return sum + BigInt(transfer.amount);
  }, 0n);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, 'bert-exact-topups.json');
  const binding = { schemaVersion: 1, network: configuration.network, chainId: configuration.chainId, source };
  let journal;
  try { journal = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; journal = { ...binding, operations: [] }; }
  assert.deepEqual({ schemaVersion: journal.schemaVersion, network: journal.network, chainId: journal.chainId, source: journal.source }, binding);
  assert(Array.isArray(journal.operations));
  async function save() {
    const temporary = file + '.' + randomUUID() + '.tmp';
    const handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(journal, null, 2) + '\n'); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temporary, file);
    const parent = await open(directory, 'r');
    try { await parent.sync(); } finally { await parent.close(); }
  }
  async function reconcile(item) {
    assert.equal(item.actor, source.address);
    assert(Object.values(recipients).includes(item.destination));
    assert(item.operationHash, 'Prior funding outcome is unknown; reconcile its durable intent before any further funding.');
    const finalHash = await tezos.rpc.getBlockHash({ block: 'head~2' });
    const finalHeader = await tezos.rpc.getBlockHeader({ block: finalHash });
    let found;
    for (let level = item.preparedLevel; level <= finalHeader.level; level += 1) {
      const hash = await tezos.rpc.getBlockHash({ block: `${finalHash}~${finalHeader.level - level}` });
      const block = await tezos.rpc.getBlock({ block: hash });
      const operation = block.operations.flat().find(candidate => candidate.hash === item.operationHash);
      if (operation) { found = { operation, level }; break; }
    }
    assert(found, 'Funding is not finalized on this branch; retain the journal and never resubmit it.');
    assertFundingReceipt(found.operation, item);
    item.transferEvidence = await verifyWtfiapTransfer({ configuration, operationHash: item.operationHash,
      inclusionLevel: found.level, currency: 'XTZ', from: source.address, to: item.destination,
      amountAtomic: item.amountMutez, toolkitFactory });
    item.status = 'confirmed'; await save(); await record({ ...item });
  }
  for (const item of journal.operations) {
    assert(['submission-unknown', 'submitted', 'confirmed'].includes(item.status));
    if (item.status !== 'confirmed') await reconcile(item);
  }
  let funding;
  async function fundTo(target, authority) {
    assert.equal(recipients[actor.walletId], recipient, 'Bert cannot fund itself or an unapproved recipient.');
    const balance = BigInt((await tezos.rpc.getBalance(recipient)).toFixed());
    const deficit = target - balance;
    if (deficit <= 0n) return;
    assert(Number.isSafeInteger(Number(deficit)));
    if (!funding) {
      const { wallet, signer } = await keyring.getSigner(source.walletId);
      assert.equal(wallet.address, source.address); assert.equal(wallet.network, configuration.network);
      assert.equal(await signer.publicKeyHash(), source.address);
      funding = toolkitFactory(configuration.rpcUrl); funding.setProvider({ signer });
    }
    assert.equal(await funding.rpc.getChainId(), configuration.chainId);
    const transfer = { to: recipient, amount: Number(deficit), mutez: true };
    const cost = await funding.estimate.transfer(transfer);
    // These original wallets were revealed by the completed lifecycle proof.
    assert(await funding.rpc.getManagerKey(source.address), 'Funding source must already be revealed.');
    const required = deficit + BigInt(cost.suggestedFeeMutez) + BigInt(cost.burnFeeMutez);
    assert(BigInt((await funding.rpc.getBalance(source.address)).toFixed()) >= required, 'Bert lacks the measured transfer cost; do not fund from another wallet.');
    const item = { actor: source.address, walletId: source.walletId, destination: recipient, recipientWalletId: actor.walletId,
      entrypoint: '__native-funding', amountMutez: String(deficit), status: 'submission-unknown',
      preparedLevel: (await funding.rpc.getBlockHeader()).level, balanceBeforeMutez: String(balance), targetBalanceMutez: String(target),
      authority, estimate: { suggestedFeeMutez: String(cost.suggestedFeeMutez), burnFeeMutez: String(cost.burnFeeMutez), gasLimit: cost.gasLimit, storageLimit: cost.storageLimit } };
    journal.operations.push(item); await save(); await record({ ...item });
    const sent = await funding.contract.transfer({ ...transfer, fee: cost.suggestedFeeMutez, gasLimit: cost.gasLimit, storageLimit: cost.storageLimit });
    item.operationHash = sent.hash; item.status = 'submitted'; await save(); await record({ ...item });
    await sent.confirmation(3);
    await reconcile(item);
  }
  if (BigInt((await tezos.rpc.getBalance(recipient)).toFixed()) === 0n) {
    await fundTo(1n, { kind: 'protocol-minimum-activation', minimumRemainingMutez: '1' });
  }
  while (true) {
    let estimates;
    try { estimates = await tezos.estimate.batch(transfers); }
    catch (error) {
      const shortage = measuredFundingDeficit(error, recipient);
      if (!shortage) throw error;
      const balance = BigInt((await tezos.rpc.getBalance(recipient)).toFixed());
      await fundTo(balance + shortage.deficit + 1n, { kind: 'rpc-simulation-shortage', minimumRemainingMutez: '1', errors: shortage.errors });
      continue;
    }
    const costs = estimates.map(value => {
      assert(Number.isSafeInteger(value.suggestedFeeMutez) && Number.isSafeInteger(value.burnFeeMutez));
      return { feeMutez: String(value.suggestedFeeMutez), storageMutez: String(value.burnFeeMutez) };
    });
    const required = costs.reduce((sum, cost) => sum + BigInt(cost.feeMutez) + BigInt(cost.storageMutez), transferTotal);
    if (BigInt((await tezos.rpc.getBalance(recipient)).toFixed()) < required) {
      await fundTo(required, { kind: 'complete-batch-estimate', transferMutez: String(transferTotal), costs });
      continue; // Re-estimate the exact batch against its funded state.
    }
    return estimates;
  }
}
