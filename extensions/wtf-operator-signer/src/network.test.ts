import assert from "node:assert/strict";
import test from "node:test";
import {
  probeRpcChainId,
  rpcProbeCandidates,
  TEZOS_RPC_PRIMARY_BY_NETWORK,
} from "./network";

test("default Shadownet probing uses only the configured primary and fallback", () => {
  assert.deepEqual(
    rpcProbeCandidates("shadownet", TEZOS_RPC_PRIMARY_BY_NETWORK.shadownet!),
    [
      "https://tezos-shadownet.octez.io",
      "https://tcinfra.net/rpc/tezos/shadownet",
    ],
  );
  assert.deepEqual(rpcProbeCandidates("custom", "https://rpc.example.test/"), [
    "https://rpc.example.test",
  ]);
});

test("chain-id probing times out a stalled primary and accepts the configured fallback", async () => {
  const result = await probeRpcChainId({
    network: "shadownet",
    rpcUrl: TEZOS_RPC_PRIMARY_BY_NETWORK.shadownet!,
    timeoutMs: 5,
    fetchImpl: (async (url, init) => {
      if (String(url).includes("tezos-shadownet.octez.io")) {
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        });
      }
      assert.match(String(url), /tcinfra\.net\/rpc\/tezos\/shadownet\/chains\/main\/chain_id$/u);
      return new Response(JSON.stringify("NetXsqzbfFenSTS"), { status: 200 });
    }) as typeof fetch,
  });

  assert.deepEqual(result, {
    chainId: "NetXsqzbfFenSTS",
    rpcUrl: "https://tcinfra.net/rpc/tezos/shadownet",
  });
});

test("chain-id probing rejects a named-network mismatch", async () => {
  await assert.rejects(
    probeRpcChainId({
      network: "shadownet",
      rpcUrl: "https://explicit.example.test",
      timeoutMs: 20,
      fetchImpl: (async () =>
        new Response(JSON.stringify("NetXdQprcVkpaWU"), { status: 200 })) as typeof fetch,
    }),
    /expected NetXsqzbfFenSTS, got NetXdQprcVkpaWU/u,
  );
});
