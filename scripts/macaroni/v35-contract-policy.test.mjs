import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ParameterSchema } from "@taquito/michelson-encoder";
import {
  hashMacaroniV35EntropyLink,
  macaroniV35AllocationDigest,
  macaroniV35MetadataCommitment,
  packMacaroniV35Allocation,
  packMacaroniV35MetadataCommitment,
  simulateMacaroniV35SwapPop,
} from "../../server/features/macaroni/v35-crypto.ts";

const publicBase = new URL(
  "../../public/creation-tools/macaroni/contract/",
  import.meta.url,
);
const desktopBase = new URL(
  "../../apps/macaroni-desktop/macaroni/contract/",
  import.meta.url,
);
const companionBase = new URL(
  "../../companion/macaroni-v35/contract/",
  import.meta.url,
);

const [
  publicContractBytes,
  desktopContractBytes,
  publicStorageBytes,
  desktopStorageBytes,
  publicManifestBytes,
  desktopManifestBytes,
  companionContractBytes,
  companionStorageBytes,
  companionManifestBytes,
] = await Promise.all([
  readFile(new URL("macaroni-v35.contract.json", publicBase)),
  readFile(new URL("macaroni-v35.contract.json", desktopBase)),
  readFile(new URL("macaroni-v35.storage.tz", publicBase)),
  readFile(new URL("macaroni-v35.storage.tz", desktopBase)),
  readFile(new URL("macaroni-v35.template.json", publicBase)),
  readFile(new URL("macaroni-v35.template.json", desktopBase)),
  readFile(new URL("macaroni-v35.contract.json", companionBase)),
  readFile(new URL("macaroni-v35.storage.tz", companionBase)),
  readFile(new URL("macaroni-v35.template.json", companionBase)),
]);

const contract = JSON.parse(publicContractBytes.toString("utf8"));
const manifest = JSON.parse(publicManifestBytes.toString("utf8"));
const desktopManifest = JSON.parse(desktopManifestBytes.toString("utf8"));
const companionManifest = JSON.parse(companionManifestBytes.toString("utf8"));

test("Macaroni V3.5 public, desktop, and self-hosted Companion artifacts stay in parity", () => {
  assert.ok(desktopContractBytes.equals(publicContractBytes));
  assert.ok(companionContractBytes.equals(publicContractBytes));
  assert.ok(desktopStorageBytes.equals(publicStorageBytes));
  assert.ok(companionStorageBytes.equals(publicStorageBytes));
  const normalizeManifestDestination = (value) => ({
    ...value,
    compiledContract: "<copy>/macaroni-v35.contract.json",
    compiledStorageTemplate: "<copy>/macaroni-v35.storage.tz",
  });
  assert.deepEqual(
    normalizeManifestDestination(desktopManifest),
    normalizeManifestDestination(manifest),
  );
  assert.deepEqual(
    normalizeManifestDestination(companionManifest),
    normalizeManifestDestination(manifest),
  );
});

test("Macaroni V3.5 purchase cannot carry a token, CID, seed, or recipient choice", () => {
  const parameter = contract.find((node) => node.prim === "parameter")?.args?.[0];
  assert.ok(parameter, "compiled artifact must include a Michelson parameter");
  const schema = new ParameterSchema(parameter);
  const purchaseSignature = schema
    .ExtractSignatures()
    .find(([entrypoint]) => entrypoint === "purchase");

  assert.deepEqual(purchaseSignature, [
    "purchase",
    { __michelsonType: "nat", schema: "nat" },
  ]);
  assert.ok(schema.EncodeObject({ purchase: 1 }));
  assert.throws(() =>
    schema.EncodeObject({ purchase: { amount: 1, token_id: 0 } }),
  );
  assert.equal(JSON.stringify(contract).includes("%reveal"), false);
});

test("Macaroni V3.5 manifest pins the immutable lifecycle and trust boundary", () => {
  assert.equal(manifest.templateVersion, "macaroni-secure-claim-v3.5");
  assert.deepEqual(manifest.releasePolicies, [
    "immediate",
    "rolling_delay",
    "scheduled",
    "sellout",
  ]);
  assert.equal(manifest.claimModel.purchaseParameter, "nat amount only");
  assert.equal(manifest.claimModel.order, "strict FIFO");
  assert.match(manifest.claimModel.finalTokenMint, /no placeholder or later reveal/);
  assert.match(manifest.trustDisclosure, /custodian knows future preimages/i);
  assert.match(manifest.trustDisclosure, /can selectively participate/i);
  assert.match(manifest.trustDisclosure, /can withhold/i);
  assert.match(manifest.trustDisclosure, /rotation preserves the entropy cursor/i);
  assert.ok(manifest.entrypoints.includes("transfer_finalizer"));
  assert.ok(manifest.entrypoints.includes("accept_finalizer"));
  assert.ok(manifest.entrypoints.includes("append_token_slots_v35"));
  assert.ok(manifest.entrypoints.includes("arm_fulfillment"));
  assert.ok(manifest.entrypoints.includes("close_sale"));
  assert.equal(manifest.entrypoints.includes("set_release_policy"), false);
  assert.match(manifest.setupModel.physicalSlots, /canonical token-id order/i);
  assert.match(manifest.setupModel.completion, /slots_loaded == supply/i);
  assert.match(manifest.setupModel.fulfillmentHandshake, /arm_fulfillment before.*activate_sale/i);
  assert.match(manifest.setupModel.fulfillmentHandshake, /rotation resets/i);
  assert.match(manifest.setupModel.fulfillmentArmedStorage, /fulfillment_armed originates false/i);
  assert.match(manifest.fulfillmentAccounting.activationReserve, /physical_supply \* fulfillment_subsidy/i);
  assert.match(manifest.fulfillmentAccounting.finalSweep, /irreversibly closed/i);
  assert.match(manifest.fulfillmentAccounting.finalSweep, /before activation/i);
  assert.equal(manifest.measuredFundingPolicy.minimumFulfillmentSubsidyMutez, 151180);
  assert.equal(manifest.measuredFundingPolicy.fulfillmentSubsidyMutez, 151180);
  assert.equal(manifest.measuredFundingPolicy.fiveSettlementStartupMutez, 755900);
  assert.equal(manifest.measuredFundingPolicy.initialContractReserveMutez, 755900);
  assert.equal(manifest.measuredFundingPolicy.maximumSettlementStorageBurnMutez, 97500);
  assert.equal(manifest.measuredFundingPolicy.highestHistoricalAppliedRevealFeeMutez, 53680);
  assert.equal(manifest.measuredFundingPolicy.armFulfillmentCostMutez, 363);
  assert.equal(manifest.measuredFundingPolicy.finalizerStartupMutez, 756263);
  assert.equal(manifest.measuredFundingPolicy.finalizerLiquidStartupFloorMutez, 756263);
  assert.equal(manifest.measuredFundingPolicy.maximumObservedOriginationMutez, 5896549);
  assert.match(manifest.measuredFundingPolicy.derivation, /historical applied Macaroni V2 reveal baker fee/i);
  assert.ok(
    manifest.measuredFundingPolicy.maximumObservedSingletonMutez <=
      manifest.measuredFundingPolicy.minimumFulfillmentSubsidyMutez,
  );
  assert.match(manifest.measuredFundingPolicy.finalizerStartup, /arm_fulfillment cost/i);
});

test("Macaroni V3.5 SmartPy fixture matches the fulfillment worker implementation", () => {
  const fixture = manifest.crossLanguageFixture;
  const allocationInput = {
    buyer: fixture.inputs.buyer,
    chainId: fixture.inputs.chainIdHex,
    claimId: Number(fixture.inputs.claimId),
    contractAddress: fixture.inputs.contractAddress,
    creator: fixture.inputs.creator,
    entropyPreimage: fixture.inputs.entropyPreimageHex,
    purchaseLevel: Number(fixture.inputs.purchaseLevel),
    recipient: fixture.inputs.recipient,
    unit: Number(fixture.inputs.unit),
  };
  assert.equal(
    packMacaroniV35Allocation(allocationInput),
    fixture.allocation.packedBytesHex,
  );
  assert.equal(
    macaroniV35AllocationDigest(allocationInput),
    fixture.allocation.sha256Hex,
  );

  const metadataInput = {
    metadataNonce: fixture.inputs.metadataNonceHex,
    metadataUri: fixture.inputs.metadataUriUtf8,
    tokenId: Number(fixture.inputs.tokenId),
  };
  assert.equal(
    packMacaroniV35MetadataCommitment(metadataInput),
    fixture.metadata.packedBytesHex,
  );
  assert.equal(
    macaroniV35MetadataCommitment(metadataInput),
    fixture.metadata.sha256Hex,
  );
  assert.equal(
    hashMacaroniV35EntropyLink(fixture.inputs.entropyPreimageHex),
    fixture.chainStep.sha256Hex,
  );

  const draw =
    BigInt(`0x${fixture.allocation.sha256Hex}`) %
    BigInt(fixture.swapPop.remainingSlotsBefore);
  assert.equal(draw.toString(), fixture.swapPop.draw);
  const pool = [...fixture.inputs.initialSlotPool];
  const drawIndex = Number(fixture.swapPop.draw);
  const lastIndex = Number(fixture.swapPop.lastIndex);
  assert.equal(pool[drawIndex], fixture.swapPop.selectedTokenId);
  assert.equal(pool[lastIndex], fixture.swapPop.replacementTokenId);
  if (drawIndex !== lastIndex) pool[drawIndex] = pool[lastIndex];
  pool.pop();
  assert.deepEqual(
    fixture.swapPop.remainingSlotPool,
    pool.map((tokenId, index) => [String(index), tokenId]),
  );

  const workerResult = simulateMacaroniV35SwapPop({
    slots: fixture.inputs.initialSlotPool.map(Number),
    allocationDigest: fixture.allocation.sha256Hex,
  });
  assert.equal(String(workerResult.draw), fixture.swapPop.draw);
  assert.equal(String(workerResult.tokenId), fixture.swapPop.selectedTokenId);
  assert.deepEqual(
    workerResult.remainingSlots.map(String),
    fixture.swapPop.remainingSlotPool.map(([, tokenId]) => tokenId),
  );
});
