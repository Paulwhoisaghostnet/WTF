import assert from "node:assert/strict";
import test from "node:test";
import {
  HEN_MINTER_CONTRACT,
  mintPreparedHen,
  prepareHenMint,
  type HenMintRuntime,
  type PreparedHenMint,
} from "./hen-mint";

const cidA = `Qm${"a".repeat(44)}`;
const cidB = `Qm${"b".repeat(44)}`;

function prepared(): PreparedHenMint {
  return {
    artifactCid: cidA,
    artifactUri: `ipfs://${cidA}`,
    metadataCid: cidB,
    metadataUri: `ipfs://${cidB}`,
    name: "PixAlerce test",
    description: "",
    fileName: "pixalerce.png",
    mimeType: "image/png",
    creator: "tz1burnburnburnburnburnburnburjAYjjX",
    editions: 2,
    royalties: 100,
  };
}

test("prepareHenMint uploads CIDv0 artifact and metadata without wallet activity", async () => {
  const originalFetch = globalThis.fetch;
  const uploads: FormData[] = [];
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    uploads.push(init?.body as FormData);
    return new Response(JSON.stringify({ IpfsHash: uploads.length === 1 ? cidA : cidB }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const result = await prepareHenMint({
      artifact: new Blob(["png"], { type: "image/png" }),
      fileName: "pixalerce.png",
      mimeType: "image/png",
      name: "PixAlerce test",
      description: "test",
      tags: ["animated", "pixel-art"],
      creator: "tz1burnburnburnburnburnburnburjAYjjX",
      editions: 2,
      royalties: 100,
      pinataJwt: "session-jwt",
    });
    assert.equal(uploads.length, 2);
    assert.equal(uploads[0].get("pinataOptions"), JSON.stringify({ cidVersion: 0 }));
    assert.equal(result.metadataUri.length, 53);
    assert.equal(result.artifactCid, cidA);
    assert.equal(result.metadataCid, cidB);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("mintPreparedHen sends the reviewed payload exactly once after Mainnet preflight", async () => {
  const calls: string[] = [];
  let payload: any;
  const runtime: HenMintRuntime = {
    getNetwork: () => "mainnet",
    assertNetworkReadyForSend: async (address) => { calls.push(`preflight:${address}`); },
    getTezos: async () => ({
      rpc: { getChainId: async () => "NetXdQprcVkpaWU" },
      wallet: {
        at: async (contract: string) => {
          calls.push(`contract:${contract}`);
          return {
            methodsObject: {
              mint_OBJKT: (nextPayload: any) => {
                payload = nextPayload;
                return {
                  send: async () => {
                    calls.push("send");
                    return { opHash: "opTestHash", confirmation: async () => calls.push("confirmation") };
                  },
                };
              },
            },
          };
        },
      },
    }),
    trackActivity: async (_context, execute) => execute(),
  };
  const result = await mintPreparedHen(prepared(), runtime);
  assert.deepEqual(calls, [
    `preflight:${prepared().creator}`,
    `contract:${HEN_MINTER_CONTRACT}`,
    "send",
    "confirmation",
  ]);
  assert.equal(payload.address, prepared().creator);
  assert.equal(payload.amount, 2);
  assert.equal(payload.royalties, 100);
  assert.equal(typeof payload.metadata, "string");
  assert.equal(result.opHash, "opTestHash");
});

test("mintPreparedHen fails closed off Mainnet before touching the wallet", async () => {
  let touchedWallet = false;
  const runtime: HenMintRuntime = {
    getNetwork: () => "shadownet",
    assertNetworkReadyForSend: async () => { touchedWallet = true; },
    getTezos: async () => { touchedWallet = true; return {}; },
    trackActivity: async (_context, execute) => execute(),
  };
  await assert.rejects(() => mintPreparedHen(prepared(), runtime), /Mainnet-only/);
  assert.equal(touchedWallet, false);
});
