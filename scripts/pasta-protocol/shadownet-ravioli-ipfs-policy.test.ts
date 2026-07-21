import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { unpackDataBytes } from "@taquito/michel-codec";
import { ParameterSchema } from "@taquito/michelson-encoder";

import {
  assertRavioliPayloadCommitment,
  buildRavioliGenerativePayload,
  buildRavioliModePayloads,
  buildRavioliRecipeMetadataValues,
  ravioliPayloadCommitment,
  type RavioliUriPlan,
} from "./shadownet-ravioli-e2e";

const uri = (label: string) => `ipfs://bafy${label}`;
const uris: RavioliUriPlan = {
  gnocchiTokenMetadataUris: [uri("gnocchi0"), uri("gnocchi1"), uri("gnocchi2")],
  packTokenMetadataUris: [uri("pack0"), uri("pack1"), uri("pack2"), uri("pack3"), uri("pack4")],
  recipeMetadataUris: [
    uri("recipe0"),
    uri("recipe1"),
    uri("recipe2"),
    uri("recipe3"),
    uri("recipe4"),
  ],
  generatorMetadataUri: uri("generator"),
  previewArtifactUri: uri("png"),
  generated: {
    generative: {
      metadataUri: uri("generated0"),
      artifactUri: uri("png"),
      displayUri: uri("png"),
      thumbnailUri: uri("png"),
      mimeType: "image/png",
      artifactHash: "11".repeat(32),
    },
    hybrid: {
      metadataUri: uri("generated1"),
      artifactUri: uri("png"),
      displayUri: uri("png"),
      thumbnailUri: uri("png"),
      mimeType: "image/png",
      artifactHash: "11".repeat(32),
    },
  },
};

test("strict Ravioli plans commit every allocated and generative adapter payload", () => {
  const modes = buildRavioliModePayloads(
    {
      gnocchi: "KT1Gnocchi",
      gnocchiAdapter: "KT1AllocationAdapter",
      rotiniAdapter: "KT1GenerationAdapter",
    },
    uris,
  );
  for (const mode of [modes[2], modes[3], modes[4]]) {
    for (const recipe of mode.recipes) {
      for (const reservation of recipe.reservations) {
        const adapter = reservation.allocated_mint ?? reservation.generative_mint;
        if (adapter) assert.match(String(adapter.payload_commitment || ""), /^[0-9a-f]{64}$/);
      }
      for (const action of recipe.actions) {
        const adapter = action.allocated_mint ?? action.generative_mint;
        if (adapter) assert.match(String(adapter.payload_commitment || ""), /^[0-9a-f]{64}$/);
      }
    }
  }
});

const addresses = {
  gnocchi: "KT1DxL652xGhAwWnsaC32TcdDP7BL7KwrStw",
  gnocchiAdapter: "KT1BYMrRC1ZvoHJWaSvFpiRsd5ZM2YcRh3Ls",
  rotiniAdapter: "KT1DxL652xGhAwWnsaC32TcdDP7BL7KwrStw",
};

function plans() {
  return buildRavioliModePayloads(addresses, uris);
}

function primitive(value: Record<string, unknown>): string {
  return Object.keys(value)[0];
}

function flattenPackedBytes(value: any): string[] {
  if (typeof value?.bytes === "string") return [value.bytes];
  if (value?.prim === "Pair" && Array.isArray(value.args)) {
    return value.args.flatMap(flattenPackedBytes);
  }
  throw new Error(`unexpected packed node ${JSON.stringify(value)}`);
}

test("five-mode table and exact recipe projections remain stable", () => {
  const modes = plans();
  assert.deepEqual(
    modes.map((mode) => [
      mode.tokenId,
      mode.mode,
      mode.blind,
      mode.itemCount,
      mode.maxSupply,
      mode.recipes.length,
      mode.tokenMetadataUri,
      mode.recipeMetadataUri,
    ]),
    [
      [0, 0, false, 1, 1, 1, uris.packTokenMetadataUris[0], uris.recipeMetadataUris[0]],
      [1, 1, true, 1, 2, 2, uris.packTokenMetadataUris[1], uris.recipeMetadataUris[1]],
      [2, 2, true, 1, 1, 1, uris.packTokenMetadataUris[2], uris.recipeMetadataUris[2]],
      [3, 3, true, 1, 1, 1, uris.packTokenMetadataUris[3], uris.recipeMetadataUris[3]],
      [4, 4, true, 3, 1, 1, uris.packTokenMetadataUris[4], uris.recipeMetadataUris[4]],
    ],
  );
  assert.equal(modes.flatMap((mode) => mode.recipes).length, 6);
  assert.equal(
    modes[0].config.contents_uri,
    Buffer.from(uris.recipeMetadataUris[0], "utf8").toString("hex"),
  );
  assert.ok(modes.slice(1).every((mode) => mode.config.contents_uri === null));
  assert.deepEqual(modes[0].recipes[0].reservations, modes[0].recipes[0].actions);
  assert.deepEqual(
    modes[1].recipes.map((recipe) => recipe.reservations[0].escrow.token_id),
    [0, 2],
  );
  assert.deepEqual(
    modes[4].recipes[0].reservations.map(primitive),
    ["escrow", "allocated_mint", "generative_mint"],
  );
  assert.deepEqual(
    modes[4].recipes[0].actions.map(primitive),
    ["escrow", "allocated_mint", "generative_mint"],
  );
});

test("generative and hybrid payloads decode to exact pinned URI roles", () => {
  const modes = plans();
  for (const [modeIndex, generated] of [
    [3, uris.generated.generative],
    [4, uris.generated.hybrid],
  ] as const) {
    const adapter = modes[modeIndex].recipes[0].actions.at(-1).generative_mint;
    const decoded = flattenPackedBytes(unpackDataBytes({ bytes: adapter.payload }));
    assert.deepEqual(decoded, [
      generated.artifactHash,
      Buffer.from(generated.artifactUri, "utf8").toString("hex"),
      Buffer.from(generated.displayUri, "utf8").toString("hex"),
      Buffer.from(generated.metadataUri, "utf8").toString("hex"),
      Buffer.from(generated.mimeType, "utf8").toString("hex"),
      Buffer.from(generated.thumbnailUri, "utf8").toString("hex"),
    ]);
    assert.equal(adapter.payload_commitment, ravioliPayloadCommitment(adapter.payload));
    assert.doesNotThrow(() =>
      assertRavioliPayloadCommitment(adapter.payload, adapter.payload_commitment),
    );
    assert.ok(decoded.every((bytes) => !Buffer.from(bytes, "hex").toString("utf8").startsWith("data:")));
  }
});

test("payload substitution cannot satisfy the committed allocation, generative, or hybrid recipe", () => {
  const modes = plans();
  for (const modeIndex of [2, 3, 4]) {
    for (const action of modes[modeIndex].recipes[0].actions) {
      const adapter = action.allocated_mint ?? action.generative_mint;
      if (!adapter) continue;
      const reservation = modes[modeIndex].recipes[0].reservations.find(
        (candidate) => primitive(candidate) === primitive(action),
      );
      const committed =
        reservation.allocated_mint?.payload_commitment ??
        reservation.generative_mint?.payload_commitment;
      assert.equal(adapter.payload_commitment, committed);
      const substitutedPayload = `${adapter.payload}00`;
      assert.throws(
        () => assertRavioliPayloadCommitment(substitutedPayload, adapter.payload_commitment),
        /does not match/,
      );
      assert.notEqual(ravioliPayloadCommitment(substitutedPayload), committed);
    }
  }
});

test("recipe metadata records exact payload commitments, especially for hybrid", () => {
  const values = buildRavioliRecipeMetadataValues(uris.generated) as any[];
  assert.equal(values.length, 5);
  assert.match(values[4].commitmentScope, /Some\(blake2b\(actual payload\)\)/);
  assert.deepEqual(
    values[4].recipes[0].items.map((item: any) => item.primitive),
    ["escrowed_fa2", "allocated_mint", "generative_mint"],
  );
  const modePlans = plans();
  for (const modeIndex of [2, 3, 4]) {
    const manifestItems = values[modeIndex].recipes[0].items;
    for (const item of manifestItems) {
      if (!item.payloadCommitment) continue;
      const action = modePlans[modeIndex].recipes[0].actions.find(
        (candidate) => primitive(candidate) === item.primitive,
      );
      const adapter = action?.allocated_mint ?? action?.generative_mint;
      assert.equal(item.payloadCommitment, adapter.payload_commitment);
    }
  }
});

test("every strict commit and open payload encodes against the current router artifact", async () => {
  const artifact = JSON.parse(
    await readFile(
      new URL("../../public/creation-tools/ravioli/contract/pasta-bundle.contract.json", import.meta.url),
      "utf8",
    ),
  );
  const parameter = artifact.find((node: any) => node?.prim === "parameter")?.args?.[0];
  assert.ok(parameter);
  const schema = new ParameterSchema(parameter);
  for (const mode of plans()) {
    for (const recipe of mode.recipes) {
      assert.ok(
        schema.EncodeObject({
          commit_recipe: {
            token_id: mode.tokenId,
            nonce_commitment: "aa".repeat(32),
            reservations: recipe.reservations,
          },
        }),
      );
      assert.ok(
        schema.EncodeObject({
          open_pack: {
            token_id: mode.tokenId,
            nonce: "bb".repeat(32),
            actions: recipe.actions,
          },
        }),
      );
    }
  }
});

test("invalid generative URI, MIME, hash, and display mapping fail before an operation is built", () => {
  const valid = uris.generated.generative;
  assert.throws(
    () => buildRavioliGenerativePayload({ ...valid, metadataUri: "data:application/json,{}" }),
    /ipfs:\/\//,
  );
  assert.throws(
    () => buildRavioliGenerativePayload({ ...valid, mimeType: "image/gif" as "image/png" }),
    /must be a PNG/,
  );
  assert.throws(
    () => buildRavioliGenerativePayload({ ...valid, artifactHash: "11" }),
    /32 lowercase hex bytes/,
  );
  assert.throws(
    () => buildRavioliGenerativePayload({ ...valid, displayUri: uri("other") }),
    /display URI must use the pinned artifact/,
  );
});

test("source policy pins before RPC, rejects partial resume, asserts every URI, and reports durable evidence", async () => {
  const source = await readFile(new URL("./shadownet-ravioli-e2e.ts", import.meta.url), "utf8");
  const routerArtifact = await readFile(
    new URL("../../public/creation-tools/ravioli/contract/pasta-bundle.contract.json", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /data:(?:application|audio|font|image|model|text|video)/);
  assert.doesNotMatch(source, /dataJsonUri|generativePayload\(/);
  for (const helper of [
    "resolveIpfsProofConfig",
    "pinIpfsProofBytes",
    "pinIpfsProofJson",
    "assertContractMetadataUri",
    "assertTokenMetadataUris",
    "assertPackContentsUris",
    "assertRotiniProjectUris",
    "assertRotiniGeneratedUris",
  ]) {
    assert.match(source, new RegExp(`\\b${helper}\\b`));
  }
  const main = source.slice(source.indexOf("async function main"));
  assert.ok(main.indexOf("resolveIpfsProofConfig()") < main.indexOf("buildPinnedEvidence(ipfs)"));
  assert.ok(main.indexOf("buildPinnedEvidence(ipfs)") < main.indexOf("probeRpcChainId()"));
  assert.ok(main.indexOf("probeRpcChainId()") < main.indexOf("await originate("));
  for (const guard of [
    "PASTA_SHADOWNET_RAVIOLI_GNOCCHI_ADDRESS",
    "PASTA_SHADOWNET_RAVIOLI_ROTINI_ADDRESS",
    "PASTA_SHADOWNET_RAVIOLI_GNOCCHI_ADAPTER_ADDRESS",
    "PASTA_SHADOWNET_RAVIOLI_ROTINI_ADAPTER_ADDRESS",
    "PASTA_SHADOWNET_RAVIOLI_ROUTER_ADDRESS",
    "PASTA_SHADOWNET_RAVIOLI_SKIP_SETUP",
    "PASTA_SHADOWNET_RAVIOLI_RECIPE_START",
  ]) {
    assert.match(main, new RegExp(guard));
  }
  assert.match(main, /set_pack_contents/);
  assert.match(main, /Some\(blake2b\(actual payload\)\)/);
  assert.doesNotMatch(main, /not part of the router commitment/);
  assert.match(source, /CID .*pin\.cid/);
  assert.match(source, /pin\.publicGatewayUrl/);
  assert.match(source, /SHA-256 .*pin\.sha256/);
  assert.ok(
    (routerArtifact.match(/payload_commitment/g) || []).length >= 4,
    "the runtime router artifact must expose payload commitments in reservation and action branches",
  );
});
