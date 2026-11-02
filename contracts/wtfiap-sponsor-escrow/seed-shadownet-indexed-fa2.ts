#!/usr/bin/env node
/** Move a measured amount of indexed Shadownet Dummy WTF into the hosted test wallet. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { TezosToolkit } from "@taquito/taquito";
import { signerEnv } from "../../scripts/pasta-protocol/shadownet-proof-kit";
import { PlatformWalletKeyring } from "../../extensions/wtf-operator-signer/src/keyring";

const rpc = "https://tezos-shadownet.octez.io/";
const tokenAddress = "KT1U3isJU8p1rtfjZaEWa31FCSKNeLiuL7zg";
const sourceAddress = "tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM";
const destinationAddress = "tz1T9d8Qi4ZmWHNWgtbU6DwArwu191NfRnHe";
const amount = 1000001;

async function main() {
  const [journalPath, mode] = process.argv.slice(2);
  assert(journalPath && (mode === "--preflight" || mode === "--execute"),
    "Usage: seed-shadownet-indexed-fa2 <journal-path> --preflight|--execute");
  const keyring = new PlatformWalletKeyring(await signerEnv(rpc));
  const wallet = (await keyring.listPublicWallets()).find(value => value.address === sourceAddress);
  assert(wallet && wallet.network === "shadownet", "Shadownet source signer is unavailable.");
  const sponsor = await keyring.getSigner(wallet.id);
  const tezos = new TezosToolkit(rpc);
  tezos.setProvider({ signer: sponsor.signer });
  assert.equal(await tezos.rpc.getChainId(), "NetXsqzbfFenSTS");
  const balancesResponse = await fetch("https://api.shadownet.tzkt.io/v1/tokens/balances?account=" +
    sourceAddress + "&token.contract=" + tokenAddress + "&token.tokenId=0");
  assert(balancesResponse.ok);
  const balances = await balancesResponse.json();
  assert.equal(balances[0]?.token?.standard, "fa2");
  assert(BigInt(balances[0]?.balance || "0") >= BigInt(amount), "Test source lacks enough token units.");
  const contract = await tezos.contract.at(tokenAddress);
  const call = contract.methodsObject.transfer([{ from_: sourceAddress,
    txs: [{ to_: destinationAddress, token_id: 0, amount }] }]);
  const estimate = await tezos.estimate.transfer(call.toTransferParams());
  const xtz = await tezos.tz.getBalance(sourceAddress);
  const needed = BigInt(estimate.suggestedFeeMutez) + BigInt(estimate.burnFeeMutez);
  assert(BigInt(xtz.toFixed()) > needed, "Test source lacks Shadownet XTZ for fee.");
  console.log(JSON.stringify({ phase: "preflight", network: "shadownet", tokenAddress,
    sourceAddress, destinationAddress, atomicAmount: amount, sourceTokenBalance: balances[0].balance,
    sourceXtzMutez: xtz.toFixed(), estimatedFeeAndStorageMutez: needed.toString() }));
  if (mode === "--preflight") return;
  let prior: any = null;
  try { prior = JSON.parse(await readFile(journalPath, "utf8")); }
  catch (error: any) { if (error.code !== "ENOENT") throw error; }
  if (prior) throw new Error(`Existing transfer journal has status ${prior.status}; reconcile before retrying.`);
  await writeFile(journalPath, JSON.stringify({ network: "shadownet", tokenAddress,
    sourceAddress, destinationAddress, atomicAmount: amount, status: "prepared" }, null, 2) + "\n",
    { flag: "wx", mode: 0o600 });
  const operation = await call.send();
  await writeFile(journalPath, JSON.stringify({ network: "shadownet", tokenAddress,
    sourceAddress, destinationAddress, atomicAmount: amount, status: "injected", hash: operation.hash }, null, 2) + "\n",
    { mode: 0o600 });
  console.log(JSON.stringify({ phase: "injected", hash: operation.hash }));
  await operation.confirmation(2);
  const transferResponse = await fetch("https://api.shadownet.tzkt.io/v1/tokens/transfers?transactionId=" +
    encodeURIComponent(String((await (await fetch("https://api.shadownet.tzkt.io/v1/operations/transactions/" +
      encodeURIComponent(operation.hash))).json()).find((item: any) => item.target?.address === tokenAddress)?.id)) +
    "&token.contract=" + tokenAddress);
  assert(transferResponse.ok);
  const transfers = await transferResponse.json();
  assert(transfers.some((item: any) => item.from?.address === sourceAddress &&
    item.to?.address === destinationAddress && item.amount === String(amount) &&
    item.token?.contract?.address === tokenAddress && item.token?.standard === "fa2"),
    "Transfer confirmed on chain but not yet indexed as FA2; keep the journal and reconcile.");
  await writeFile(journalPath, JSON.stringify({ network: "shadownet", tokenAddress,
    sourceAddress, destinationAddress, atomicAmount: amount, status: "confirmed", hash: operation.hash }, null, 2) + "\n",
    { mode: 0o600 });
  console.log(JSON.stringify({ phase: "complete", hash: operation.hash, atomicAmount: amount }));
}
void main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
