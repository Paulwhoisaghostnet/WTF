#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Schema } from "@taquito/michelson-encoder";
import {
  MAX_OPERATION_DATA_LENGTH,
  MIN_OPERATION_HEADROOM,
  measureSignedOriginationOperationBytes,
} from "../pasta-protocol/check-smartpy-origination-size.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const source = path.join(
  root,
  "contracts/wtf-collections/MacaroniBlindMintFA2V35.py",
);
const outDir = path.join(root, "build/macaroni-v35-template");
const scenarioName = "deploy_macaroni_blind_mint_v35_template";
const fixtureScenarioName = "macaroni_v35_hash_fixture";
const smartpyBin =
  process.env.SMARTPY_BIN || path.join(root, "scripts/smartpy-cli-wrapper.sh");
const costEvidencePath = path.join(
  root,
  ".agents/docs/archive/contracts/macaroni-v35-shadownet-costs.json",
);
const costEvidence = JSON.parse(readFileSync(costEvidencePath, "utf8"));
const minimumFulfillmentSubsidyMutez = Number(
  costEvidence.recommendedFundingPolicy?.minimumFulfillmentSubsidyMutez,
);
const fiveSettlementStartupMutez = Number(
  costEvidence.recommendedFundingPolicy?.initialContractReserveMutez,
);
const finalizerStartupMutez = Number(
  costEvidence.recommendedFundingPolicy?.finalizerStartupMutez,
);
const maximumObservedOriginationMutez = Math.max(
  ...costEvidence.fixtures.flatMap((fixture) => fixture.operationCosts)
    .filter((operation) => String(operation.label).endsWith(":originate"))
    .map((operation) => Number(operation.totalCostMutez)),
);
if (
  costEvidence.chainId !== "NetXsqzbfFenSTS" ||
  !Number.isSafeInteger(minimumFulfillmentSubsidyMutez) ||
  minimumFulfillmentSubsidyMutez <= 0 ||
  !Number.isSafeInteger(fiveSettlementStartupMutez) ||
  fiveSettlementStartupMutez < minimumFulfillmentSubsidyMutez * 5 ||
  !Number.isSafeInteger(finalizerStartupMutez) ||
  finalizerStartupMutez < fiveSettlementStartupMutez ||
  !Number.isSafeInteger(maximumObservedOriginationMutez) ||
  maximumObservedOriginationMutez <= 0 ||
  Number(costEvidence.observed?.maximumObservedSingletonMutez) >
    minimumFulfillmentSubsidyMutez ||
  Number(costEvidence.observed?.maximumObservedStorageBurnMutez) +
      Number(costEvidence.historicalRevealFeeEvidence?.bakerFeeMutez) !==
    minimumFulfillmentSubsidyMutez
) {
  throw new Error("Macaroni V3.5 measured Shadownet funding evidence is invalid");
}

const destinations = [
  {
    id: "public",
    directory: path.join(root, "public/creation-tools/macaroni/contract"),
  },
  {
    id: "desktop",
    directory: path.join(root, "apps/macaroni-desktop/macaroni/contract"),
  },
  {
    id: "self-hosted-companion",
    directory: path.join(root, "companion/macaroni-v35/contract"),
  },
];

const requiredEntrypoints = [
  "transfer",
  "balance_of",
  "update_operators",
  "add_tokens_v35",
  "append_token_slots_v35",
  "replace_tokens_v35",
  "set_stages",
  "set_allowlist",
  "finalize_setup",
  "arm_fulfillment",
  "activate_sale",
  "close_sale",
  "purchase",
  "settle_claims_v35",
  "fund_fulfillment_reserve",
  "set_pause",
  "transfer_administration",
  "accept_administration",
  "transfer_finalizer",
  "accept_finalizer",
];

const requiredViews = [
  "get_balance",
  "total_supply",
  "get_token_supply",
  "get_token_minted",
  "get_claim",
  "get_claim_token",
  "is_operator",
  "get_minter_pool_count",
  "get_first_minter",
];

const fixtureInputs = {
  allocationDomainUtf8: "macaroni-v35/allocation/v1",
  metadataDomainUtf8: "macaroni-v35/metadata/v1",
  chainDomainUtf8: "macaroni-v35/hash-chain/v1",
  chainIdHex: "af1864d9feee0e1f",
  contractAddress: "KT1XvNYseNDJJ6Kw27qhSEDF8ys8JhDopzfG",
  creator: "tz1fextP23D6Ph2zeGTP8EwkP5Y8TufeFCHA",
  buyer: "tz1Ke2h7sDdakHJQh8WX4Z372du1KChsksyU",
  recipient: "tz1M9CMEtsXm3QxA7FmMU2Qh7xzsuGXVbcDr",
  claimId: "7",
  unit: "2",
  purchaseLevel: "123456",
  entropyPreimageHex: "11".repeat(32),
  tokenId: "12",
  metadataUriUtf8: "ipfs://QmMacaroniV35CrossLanguageFixture",
  metadataNonceHex: "22".repeat(32),
  initialSlotPool: ["4", "9", "12", "12", "15", "21", "30"],
};

function walk(directory, suffix, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, suffix, found);
    else if (entry.isFile() && entry.name.endsWith(suffix)) found.push(full);
  }
  return found;
}

function scenarioArtifact(suffix, selectedScenario = scenarioName) {
  const scenarioDirectory = path.join(outDir, selectedScenario);
  if (!existsSync(scenarioDirectory)) {
    throw new Error(`SmartPy scenario output missing: ${scenarioDirectory}`);
  }
  const found = walk(scenarioDirectory, suffix).sort();
  if (found.length !== 1) {
    throw new Error(
      `Expected exactly one ${selectedScenario} *${suffix} artifact, found ${found.length}`,
    );
  }
  return found[0];
}

function parseMichelineCode(file) {
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error(`${file} is not a Micheline code array`);
  }
  return parsed;
}

function assertByteParity(files, label) {
  const canonical = readFileSync(files[0]);
  for (const file of files.slice(1)) {
    if (!canonical.equals(readFileSync(file))) {
      throw new Error(`${label} drift: ${files[0]} differs from ${file}`);
    }
  }
}

function sha256Hex(hex) {
  return createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex");
}

function natString(value, label) {
  const text = value?.toFixed?.(0) ?? String(value);
  if (!/^\d+$/.test(text)) {
    throw new Error(`Fixture ${label} is not a natural number: ${text}`);
  }
  return text;
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
for (const destination of destinations) {
  mkdirSync(destination.directory, { recursive: true });
}

try {
  // The repository wrapper executes every @sp.add_test scenario before the
  // deployment artifact is accepted, so this is the focused test + compile gate.
  execFileSync(smartpyBin, ["test", source, outDir, "--purge"], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      SMARTPY_PYTHON: process.env.SMARTPY_PYTHON || "python3",
    },
  });
} catch (error) {
  if (error?.code === "ENOENT") {
    console.error(
      `SmartPy compiler not found: ${smartpyBin}. Install SmartPy or set SMARTPY_BIN.`,
    );
    process.exit(1);
  }
  throw error;
}

const compiledContract = scenarioArtifact("_contract.json");
const compiledStorageJson = scenarioArtifact("_storage.json");
const compiledStorageTz = scenarioArtifact("_storage.tz");
const compiledCode = parseMichelineCode(compiledContract);
const compiledStorage = JSON.parse(readFileSync(compiledStorageJson, "utf8"));
const encodedContract = JSON.stringify(compiledCode);

const fixtureContract = scenarioArtifact("_contract.json", fixtureScenarioName);
const fixtureStorageJson = scenarioArtifact("_storage.json", fixtureScenarioName);
const fixtureCode = parseMichelineCode(fixtureContract);
const fixtureStorageType = fixtureCode.find((section) => section.prim === "storage")
  ?.args?.[0];
if (!fixtureStorageType) {
  throw new Error("SmartPy hash fixture is missing its storage type");
}
const fixtureStorage = JSON.parse(readFileSync(fixtureStorageJson, "utf8"));
const decodedFixture = new Schema(fixtureStorageType).Execute(fixtureStorage);
const remainingSlotPool = [...decodedFixture.remaining_slot_pool.entries()]
  .map(([index, tokenId]) => [
    natString(index, "remaining slot index"),
    natString(tokenId, "remaining slot token id"),
  ])
  .sort(([left], [right]) => Number(left) - Number(right));

const hashFixture = {
  source: "SmartPy scenario macaroni_v35_hash_fixture",
  inputs: fixtureInputs,
  allocation: {
    michelsonType:
      "(pair bytes (pair chain_id (pair address (pair address (pair nat (pair address (pair address (pair nat (pair nat bytes)))))))))",
    packTree:
      "(domain, (chain_id, (self, (creator, (claim_id, (buyer, (recipient, (unit, (purchase_level, preimage))))))))))",
    packedBytesHex: decodedFixture.allocation_pack,
    sha256Hex: decodedFixture.allocation_hash,
  },
  metadata: {
    michelsonType: "(pair bytes (pair nat (pair bytes bytes)))",
    packTree: "(domain, (token_id, (metadata_uri, metadata_nonce)))",
    packedBytesHex: decodedFixture.metadata_pack,
    sha256Hex: decodedFixture.metadata_hash,
  },
  chainStep: {
    input: "utf8(chainDomainUtf8) || entropyPreimage",
    sha256Hex: decodedFixture.chain_step,
  },
  swapPop: {
    remainingSlotsBefore: natString(
      decodedFixture.remaining_slots,
      "remaining slots",
    ),
    draw: natString(decodedFixture.draw, "draw"),
    lastIndex: natString(decodedFixture.last, "last index"),
    selectedTokenId: natString(
      decodedFixture.selected_token_id,
      "selected token id",
    ),
    replacementTokenId: natString(
      decodedFixture.replacement_token_id,
      "replacement token id",
    ),
    remainingSlotPool,
  },
};

if (sha256Hex(decodedFixture.allocation_pack) !== decodedFixture.allocation_hash) {
  throw new Error("SmartPy allocation PACK/SHA-256 fixture is inconsistent");
}
if (sha256Hex(decodedFixture.metadata_pack) !== decodedFixture.metadata_hash) {
  throw new Error("SmartPy metadata PACK/SHA-256 fixture is inconsistent");
}
const expectedChainStep = createHash("sha256")
  .update(Buffer.from(fixtureInputs.chainDomainUtf8, "utf8"))
  .update(Buffer.from(fixtureInputs.entropyPreimageHex, "hex"))
  .digest("hex");
if (expectedChainStep !== decodedFixture.chain_step) {
  throw new Error("SmartPy reverse hash-chain fixture is inconsistent");
}
const expectedDraw =
  BigInt(`0x${decodedFixture.allocation_hash}`) %
  BigInt(hashFixture.swapPop.remainingSlotsBefore);
if (expectedDraw.toString() !== hashFixture.swapPop.draw) {
  throw new Error("SmartPy bytes-to-nat swap/pop draw fixture is inconsistent");
}
const expectedRemainingPool = [...fixtureInputs.initialSlotPool];
const drawIndex = Number(hashFixture.swapPop.draw);
const lastIndex = Number(hashFixture.swapPop.lastIndex);
if (
  expectedRemainingPool[drawIndex] !== hashFixture.swapPop.selectedTokenId ||
  expectedRemainingPool[lastIndex] !== hashFixture.swapPop.replacementTokenId
) {
  throw new Error("SmartPy swap/pop selection fixture is inconsistent");
}
if (drawIndex !== lastIndex) {
  expectedRemainingPool[drawIndex] = expectedRemainingPool[lastIndex];
}
expectedRemainingPool.pop();
if (
  JSON.stringify(remainingSlotPool) !==
  JSON.stringify(expectedRemainingPool.map((tokenId, index) => [String(index), tokenId]))
) {
  throw new Error("SmartPy swap/pop remaining-pool fixture is inconsistent");
}

for (const name of [...requiredEntrypoints, ...requiredViews]) {
  if (!encodedContract.includes(name)) {
    throw new Error(`Macaroni V3.5 compiled artifact is missing ${name}`);
  }
}
for (const forbiddenEntrypoint of ["reveal_tokens_v3", "set_release_policy"]) {
  if (encodedContract.includes(`%${forbiddenEntrypoint}`)) {
    throw new Error(
      `Macaroni V3.5 artifact unexpectedly exposes ${forbiddenEntrypoint}`,
    );
  }
}

const signedOriginationBytes = measureSignedOriginationOperationBytes({
  code: compiledCode,
  storage: compiledStorage,
});
const protocolHeadroomBytes = MAX_OPERATION_DATA_LENGTH - signedOriginationBytes;
if (protocolHeadroomBytes < MIN_OPERATION_HEADROOM) {
  throw new Error(
    `Macaroni V3.5 signed origination is ${signedOriginationBytes} bytes, leaving only ${protocolHeadroomBytes} bytes below ${MAX_OPERATION_DATA_LENGTH}`,
  );
}

const writtenContracts = [];
const writtenStorage = [];
const writtenManifests = [];
for (const destination of destinations) {
  const contractArtifact = path.join(
    destination.directory,
    "macaroni-v35.contract.json",
  );
  const storageArtifact = path.join(
    destination.directory,
    "macaroni-v35.storage.tz",
  );
  const manifestArtifact = path.join(
    destination.directory,
    "macaroni-v35.template.json",
  );
  copyFileSync(compiledContract, contractArtifact);
  copyFileSync(compiledStorageTz, storageArtifact);

  const manifest = {
    templateVersion: "macaroni-secure-claim-v3.5",
    source: path.relative(root, source),
    scenario: scenarioName,
    compileAndTestScript: path.relative(root, fileURLToPath(import.meta.url)),
    smartpyBinaryEnv: "SMARTPY_BIN",
    compiledContract: path.relative(root, contractArtifact),
    compiledStorageTemplate: path.relative(root, storageArtifact),
    artifactCopies: destinations.map((item) =>
      path.relative(root, path.join(item.directory, "macaroni-v35.contract.json")),
    ),
    entrypoints: requiredEntrypoints,
    views: requiredViews,
    releasePolicies: [
      "immediate",
      "rolling_delay",
      "scheduled",
      "sellout",
    ],
    claimModel: {
      purchaseParameter: "nat amount only",
      recipient: "transaction sender",
      order: "strict FIFO",
      finalTokenMint: "atomic with settlement; no placeholder or later reveal",
    },
    setupModel: {
      tokenRows: "add_tokens_v35 declares sequential token ids, quantities, and commitments without expanding physical slots",
      physicalSlots: "append_token_slots_v35 fills canonical token-id order in resumable positive-count batches",
      completion: "finalize_setup requires slots_loaded == supply and next_slot_token_id == token_count",
      fulfillmentHandshake:
        "after local custody/readiness preflight, the configured finalizer must call arm_fulfillment before the administrator can activate_sale; pre-activation finalizer rotation resets the handshake",
      fulfillmentArmedStorage:
        "fulfillment_armed originates false, becomes true only through arm_fulfillment, and must be true for activate_sale",
    },
    commitments: {
      hash: "SHA-256",
      hashChainLink:
        "sha256(utf8('macaroni-v35/hash-chain/v1') || 32-byte preimage)",
      allocation:
        "sha256(PACK((domain, (chain_id, (self, (creator, (claim_id, (buyer, (recipient, (unit, (purchase_level, preimage)))))))))))",
      metadata:
        "sha256(PACK((domain, (token_id, (metadata_uri, 32-byte metadata_nonce)))))",
    },
    crossLanguageFixture: hashFixture,
    measuredFundingPolicy: {
      evidence: path.relative(root, costEvidencePath),
      version: costEvidence.measuredAt,
      measuredAt: costEvidence.measuredAt,
      network: costEvidence.network,
      chainId: costEvidence.chainId,
      maximumObservedSingletonMutez:
        costEvidence.observed.maximumObservedSingletonMutez,
      maximumSettlementStorageBurnMutez:
        costEvidence.observed.maximumObservedStorageBurnMutez,
      highestHistoricalAppliedRevealFeeMutez:
        costEvidence.historicalRevealFeeEvidence.bakerFeeMutez,
      fulfillmentSubsidyMutez: minimumFulfillmentSubsidyMutez,
      minimumFulfillmentSubsidyMutez,
      initialContractReserveMutez: fiveSettlementStartupMutez,
      fiveSettlementStartupMutez,
      armFulfillmentCostMutez: costEvidence.observed.maximumArmCostMutez,
      finalizerLiquidStartupFloorMutez: finalizerStartupMutez,
      finalizerStartupMutez,
      maximumObservedOriginationMutez,
      derivation: costEvidence.recommendedFundingPolicy.derivation,
      finalizerStartup:
        "finalizerStartupMutez covers five conservative settlement envelopes plus the measured arm_fulfillment cost; the finalizer must be revealed and retain at least that liquid balance",
      settlementGate:
        "every live estimated singleton settlement cost must fit inside minimumFulfillmentSubsidyMutez and the finalizer's fresh liquid balance",
    },
    fulfillmentAccounting: {
      initialReserveReimbursements: 5,
      activationReserve:
        "paid-only stages require 5 * fulfillment_subsidy; any free stage requires max(5 * fulfillment_subsidy, physical_supply * fulfillment_subsidy)",
      purchaseRetention: "one immutable fulfillment_subsidy per paid unit",
      reimbursement: "one fulfillment_subsidy per successfully settled claim",
      finalSweep:
        "automatic after every created claim is settled and either all physical slots sold or the sale was irreversibly closed; close_sale may permanently cancel before activation and sweep immediately when no claims exist",
    },
    trustDisclosure:
      "Single-custodian precommitted hidden entropy is unpredictable to ordinary buyers who do not know its preimages, but the custodian knows future preimages, can simulate candidate outcomes when the other claim inputs are known, can selectively participate, and can withhold fulfillment. Two-step finalizer rotation preserves the entropy cursor and FIFO queue.",
    signedOriginationBytes,
    protocolHeadroomBytes,
    protocolOperationDataLimitBytes: MAX_OPERATION_DATA_LENGTH,
  };
  writeFileSync(manifestArtifact, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  writtenContracts.push(contractArtifact);
  writtenStorage.push(storageArtifact);
  writtenManifests.push(manifestArtifact);
}

assertByteParity(writtenContracts, "Macaroni V3.5 contract artifact");
assertByteParity(writtenStorage, "Macaroni V3.5 storage template");

console.log(
  `Macaroni V3.5 SmartPy scenarios passed and ${writtenContracts.length} contract copies were synchronized.`,
);
console.log(
  `Macaroni V3.5 artifact: ${signedOriginationBytes} signed-origination bytes; ${protocolHeadroomBytes} bytes protocol headroom.`,
);
for (const manifest of writtenManifests) {
  console.log(`Manifest: ${path.relative(root, manifest)}`);
}
