import assert from "node:assert/strict";
import { TezosToolkit } from "@taquito/taquito";
import { require as tsxRequire } from "tsx/cjs/api";
import { buildPuppetKeyringEnv } from "./runtime.mjs";
import { verifyWtfiapTransfer } from "./wtfiap-chain-evidence.mjs";
import { fundingCalls } from "../../../client/src/features/wtfiap/funding-wallet.ts";

// Test-only wallet boundary. The native app's Octez adapter, Taquito encoding,
// ownership/network checks and HTTP reconciliation are unchanged. Private keys
// stay in the Node keyring. This does not test a commercial extension's UI.
export async function installWtfiapPuppetWallet({ context, actor, session, baseURL, configuration, record, connected = true }) {
  assert.equal(process.env.WTF_E2E_WTFIAP_CHAIN_WRITES, "1", "Real Shadownet wallet operations require explicit test opt-in");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL).hostname));
  assert.equal(configuration.network, "shadownet"); assert.equal(configuration.chainId, "NetXsqzbfFenSTS");
  assert.equal(configuration.escrowContract, process.env.WTF_E2E_WTFIAP_ESCROW, "Pin the exact approved proof escrow");
  assert.equal(actor.chainId, configuration.chainId);
  const keyringModule = tsxRequire("../../../extensions/wtf-operator-signer/src/keyring.ts", import.meta.url);
  const { PlatformWalletKeyring } = keyringModule.default || keyringModule;
  const keyring = new PlatformWalletKeyring(await buildPuppetKeyringEnv());
  let armed = null, inFlight = false, providerImports = 0;
  const operations = [], providerNetworks = [];
  await context.exposeBinding("__wtfiapPuppetWalletSession", async ({ page, frame }, network) => { assert.equal(frame, page.mainFrame()); assert.ok(["mainnet", "shadownet"].includes(network)); providerNetworks.push(network); });
  await context.exposeBinding("__wtfiapPuppetWalletOperation", async ({ page, frame }, operationDetails, requestedNetwork) => {
    assert.equal(requestedNetwork, configuration.network, "The shared adapter must initialize the operation provider for the room network");
    assert.equal(frame, page.mainFrame(), "Only the native top-level wallet provider may submit");
    assert.equal(new URL(page.url()).origin, new URL(baseURL).origin);
    assert.ok(armed, "No wallet action was authorized by this test step"); assert.equal(inFlight, false);
    const { roomCode, action: kind } = armed; armed = null; inFlight = true;
    const attempt = { actorId: actor.id, walletAddress: actor.walletAddress, roomCode, action: kind, status: "validating" };
    try {
      const response = await session.request.get(`/api/wtfiap/funding/rooms/${roomCode}`); assert.equal(response.ok(), true);
      const { room } = await response.json();
      assert.equal(room.network, configuration.network); assert.equal(room.chainId, configuration.chainId); assert.equal(room.escrowContract, configuration.escrowContract);
      assert.equal(room.self.walletAddress, actor.walletAddress);
      const action = room.self.actions[kind]; assert.ok(action, "The authoritative server must offer this wallet action");
      const calls = fundingCalls({ ...configuration, wtfToken: room.wtfToken }, room, kind, action, actor.walletAddress);
      const { wallet, signer } = await keyring.getSigner(actor.walletId);
      assert.equal(wallet.address, actor.walletAddress); assert.equal(await signer.publicKeyHash(), actor.walletAddress);
      const tezos = new TezosToolkit(configuration.rpcUrl); tezos.setProvider({ signer });
      assert.equal(await tezos.rpc.getChainId(), configuration.chainId);
      const expected = [];
      for (const call of calls) {
        const contract = await tezos.contract.at(call.contract);
        const transfer = contract.methodsObject[call.entrypoint](call.params).toTransferParams({ amount: call.amountMutez, mutez: true });
        expected.push({ kind: "transaction", destination: call.contract, amount: call.amountMutez, parameters: transfer.parameter });
      }
      assert.deepEqual(operationDetails, expected, "The real browser must request exactly the allowed room operation/batch");
      const transfers = expected.map(operation => ({ kind: "transaction", to: operation.destination, amount: operation.amount, mutez: true, parameter: operation.parameters }));
      const finalizedBlockHash = await tezos.rpc.getBlockHash({ block: "head~2" });
      const finalizedBalanceMutez = (await tezos.rpc.getBalance(actor.walletAddress, { block: finalizedBlockHash })).toFixed();
      const estimates = await tezos.estimate.batch(transfers);
      const costs = estimates.map(estimate => {
        assert(Number.isSafeInteger(estimate.suggestedFeeMutez) && Number.isSafeInteger(estimate.burnFeeMutez));
        return { suggestedFeeMutez: String(estimate.suggestedFeeMutez), storageBurnMutez: String(estimate.burnFeeMutez), gasLimit: estimate.gasLimit, storageLimit: estimate.storageLimit };
      });
      const transferMutez = expected.reduce((sum, operation) => sum + BigInt(operation.amount), 0n);
      const requiredMutez = costs.reduce((sum, cost) => sum + BigInt(cost.suggestedFeeMutez) + BigInt(cost.storageBurnMutez), transferMutez);
      const liveBalanceMutez = (await tezos.rpc.getBalance(actor.walletAddress)).toFixed();
      attempt.fundingPreflight = { finalizedBlockHash, finalizedBalanceMutez, liveBalanceMutez, transferMutez: transferMutez.toString(), estimatedRequiredMutez: requiredMutez.toString(), costs, automaticRevealIncluded: estimates.length > expected.length, shortfallMutez: (requiredMutez > BigInt(liveBalanceMutez) ? requiredMutez - BigInt(liveBalanceMutez) : 0n).toString(), estimateAuthority: "Taquito estimate.batch for the exact queued operation, including its SDK fee/storage policy; no extra test funding buffer" };
      await record(attempt);
      assert(BigInt(liveBalanceMutez) >= requiredMutez, `Measured ${kind} funding shortfall for ${actor.id}: ${attempt.fundingPreflight.shortfallMutez} mutez; no wallet operation was sent`);
      Object.assign(attempt, { status: "submission-unknown", network: room.network, chainId: room.chainId, escrowContract: room.escrowContract, roomId: room.roomId, termsHash: room.termsHash, currency: room.terms.currency, from: kind === "deposit" ? actor.walletAddress : room.escrowContract, to: kind === "deposit" ? room.escrowContract : actor.walletAddress, expectedAmountAtomic: kind === "claim" ? room.self.payout.amount : room.terms.entryAtomic, operations: expected });
      await record(attempt); // Preserve the attempt before any chain write; never retry an unknown send.
      const batch = tezos.contract.batch();
      for (const operation of expected) batch.withTransfer({ to: operation.destination, amount: operation.amount, mutez: true, parameter: operation.parameters });
      const sent = await batch.send();
      Object.assign(attempt, { status: "submitted", operationHash: sent.hash }); await record(attempt);
      operations.push({ operation: sent, receipt: attempt });
      return { transactionHash: sent.hash };
    } finally { inFlight = false; }
  });
  const sdkPath = "/__wtfiap_test_wallet_sdk__.js";
  await context.route(`**${sdkPath}`, route => route.fulfill({ contentType: "application/javascript", body: `
    export const BeaconEvent = { ACTIVE_ACCOUNT_SET: "ACTIVE_ACCOUNT_SET" };
    const account = ${JSON.stringify({ address: actor.walletAddress, publicKey: actor.publicKey, network: { type: "shadownet" } })};
    export class DAppClient {
      constructor(options) { this.network = options.network.type; window.__wtfiapPuppetWalletSession(this.network); }
      async subscribeToEvent() {} async getActiveAccount() { return { ...account, network: { type: this.network } }; }
      async requestPermissions() { return account; } async clearActiveAccount() {}
      async requestSignPayload() { throw new Error("Unexpected payload-signing request in scoped WTFIAP proof"); }
      async requestOperation({ operationDetails }) { return window.__wtfiapPuppetWalletOperation(operationDetails, this.network); }
    }
  ` }));
  await context.route(/\/src\/lib\/tezos\/loaders\.ts(?:\?.*)?$/, async route => {
    const response = await route.fetch(), source = await response.text();
    const imports = [...source.matchAll(/import\((['"])[^'"]*octez[^'"]*\1\)/g)];
    assert.equal(imports.length, 1, "Only the local Vite Octez SDK import is replaced; no production hook exists");
    providerImports++;
    await route.fulfill({ response, body: source.replace(imports[0][0], `import(${JSON.stringify(sdkPath)})`) });
  });
  await context.addInitScript(({ walletAddress, connected }) => {
    if (!localStorage.getItem("wtf:network")) localStorage.setItem("wtf:network", "mainnet");
    if (connected) localStorage.setItem("wtf:wallet-session", JSON.stringify({ address: walletAddress, providerName: "octez.connect" }));
  }, { walletAddress: actor.walletAddress, connected });
  return {
    arm(roomCode, action) { assert.equal(armed, null); assert.equal(inFlight, false); armed = { roomCode, action }; },
    assertUsed() { assert.ok(providerImports > 0, "The original native wallet adapter must load through the scoped provider boundary"); assert.ok(operations.length > 0); },
    async finalized() {
      const latest = operations.at(-1); assert.ok(latest, "A real wallet operation must have been submitted");
      await latest.operation.confirmation(3); // Inclusion plus two successors: the server's finalized-read contract.
      latest.receipt.transferEvidence = await verifyWtfiapTransfer({ configuration, operationHash: latest.receipt.operationHash, inclusionLevel: latest.operation.includedInBlock, currency: latest.receipt.currency, from: latest.receipt.from, to: latest.receipt.to, amountAtomic: latest.receipt.expectedAmountAtomic });
      latest.receipt.status = "confirmed"; await record(latest.receipt);
      return latest.receipt.operationHash;
    },
    providerNetworks() { return [...providerNetworks]; },
    receipts() { return operations.map(({ receipt }) => ({ ...receipt })); },
  };
}
