import assert from "node:assert/strict";
import test from "node:test";
import { sendFundingCallsWithFallback } from "./funding-wallet-adapter";
import type { FundingCall } from "./funding-wallet";

const claim: FundingCall = { contract: "KT1Escrow", entrypoint: "claim", params: "room-id", amountMutez: "0" };
const chainId = "NetXdQprcVkpaWU";

test("a failed primary entrypoints read prepares the same claim on fallback and submits once", async () => {
  const events: string[] = [];
  let sends = 0;
  const fallback = async (task: (tezos: any, context: any) => Promise<any>) => {
    for (const rpcUrl of ["primary", "fallback"]) {
      const toolkit = {
        rpc: { async getChainId() { return chainId; } },
        wallet: {
          batch() { return {
            withTransfer(value: unknown) { events.push(`transfer:${rpcUrl}:${JSON.stringify(value)}`); },
            async send() { sends += 1; events.push(`send:${rpcUrl}`); return { opHash: "ooClaim" }; },
          }; },
          async at(contract: string) {
            events.push(`entrypoints:${rpcUrl}:${contract}`);
            if (rpcUrl === "primary") throw new Error("Failed to fetch");
            return { methodsObject: { claim: (room: string) => ({ toTransferParams: () => ({ room }) }) } };
          },
        },
      };
      try { return await task(toolkit, { network: "mainnet", rpcUrl, attempt: rpcUrl === "primary" ? 1 : 2 }); }
      catch (error) { if (rpcUrl === "fallback" || !/Failed to fetch/.test(String(error))) throw error; }
    }
    throw new Error("No usable RPC");
  };
  const result = await sendFundingCallsWithFallback([claim], "tz1Winner", "mainnet", chainId, {
    fallback: fallback as any,
    async activate(wallet, options) { events.push(`activate:${wallet}:${options?.rpcUrl}`); return { address: wallet!, providerName: "octez.connect" }; },
    async ready(wallet, options) { events.push(`ready:${wallet}:${options?.rpcUrl || "initial"}`); },
    network: () => "mainnet",
  });
  assert.equal(result.opHash, "ooClaim");
  assert.equal(sends, 1);
  assert.deepEqual(events.filter(value => value.startsWith("entrypoints:")), ["entrypoints:primary:KT1Escrow", "entrypoints:fallback:KT1Escrow"]);
  assert.deepEqual(events.filter(value => value.startsWith("transfer:")), ['transfer:fallback:{"room":"room-id"}']);
  assert.ok(events.indexOf("ready:tz1Winner:fallback") < events.indexOf("send:fallback"));
});

test("a chain mismatch cannot reach the wallet submission", async () => {
  let sends = 0;
  await assert.rejects(sendFundingCallsWithFallback([claim], "tz1Winner", "mainnet", chainId, {
    fallback: (async (task: any) => task({ rpc: { getChainId: async () => "NetXsqzbfFenSTS" }, wallet: { batch() { sends += 1; } } }, { rpcUrl: "fallback" })) as any,
    async activate() { throw new Error("Wallet activation must not run"); },
    async ready() {},
    network: () => "mainnet",
  }), /wallet network changed/i);
  assert.equal(sends, 0);
});
