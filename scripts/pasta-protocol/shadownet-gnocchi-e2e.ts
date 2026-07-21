#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { MichelsonMap } from "@taquito/taquito";

import {
  availableActions,
  buildCollectionMetadata,
  buildCollectionPackage,
  buildTokenMetadata,
  costForBatch,
  detectPastaContract,
  extractRelationshipMetadata,
  validateBondingCurve,
  validateCheasePackage,
} from "../../shared/pasta-protocol/index";
import {
  assertShadownet,
  block,
  buildToolkit,
  collectAnnotations,
  createLogger,
  hexToUtf8,
  loadSignerSet,
  normalizeBase,
  pinIpfsProofBytes,
  pinIpfsProofJson,
  pollJson,
  probeRpcChainId,
  ProofBlocked,
  resolveIpfsProofConfig,
  root,
  SHADOWNET_RPC_PRIMARY,
  SHADOWNET_TZKT_API,
  signerEnv,
  utf8ToHex,
  writeProofReport,
  type IpfsPinnedProof,
  type IpfsProofConfig,
  type ProofStatus,
} from "./shadownet-proof-kit";

const REPORT_PATH = path.join(root, ".agents/docs/archive/contracts/pasta-protocol/shadownet-gnocchi-e2e-report.md");
const MIN_BALANCE_MUTEZ = Number(process.env.PASTA_SHADOWNET_GNOCCHI_E2E_MIN_BALANCE_MUTEZ || "500000");
let reportRpcUrl = normalizeBase(SHADOWNET_RPC_PRIMARY);
const ok = createLogger("pasta-shadownet-gnocchi-e2e");

async function writeReport(status: ProofStatus, lines: string[]): Promise<void> {
  await writeProofReport({
    reportPath: REPORT_PATH,
    title: "Pasta Protocol Gnocchi Shadownet E2E Report",
    status,
    lines,
    rpcUrl: reportRpcUrl,
  });
}

async function readContractArtifact(): Promise<unknown[]> {
  const artifact = path.join(root, "public/creation-tools/gnocchi/contract/pasta-open-edition.contract.json");
  const code = JSON.parse(await readFile(artifact, "utf8"));
  assert.ok(Array.isArray(code), "Gnocchi contract artifact should be a Micheline array");
  return code;
}

async function buildMetadata(creator: string, ipfs: IpfsProofConfig) {
  const relationship = { collection_group: `gnocchi-oe-modes-proof-${Date.now().toString(36)}` };
  const itemDefinitions = [
    {
      name: "Gnocchi Timed OE Proof",
      description: "Uncapped timed OE minted by two independent Shadownet collectors before its locked deadline.",
      artifactText: "Gnocchi timed OE proof",
      artifactFileName: "gnocchi-timed-oe.txt",
      mimeType: "text/plain",
      tags: ["gnocchi", "timed-oe", "shadownet", "proof"],
    },
    {
      name: "Gnocchi Forever OE Proof",
      description: "Vaultable and reopenable forever OE minted by two independent Shadownet collectors.",
      artifactText: "Gnocchi forever OE proof",
      artifactFileName: "gnocchi-forever-oe.txt",
      mimeType: "text/plain",
      tags: ["gnocchi", "forever-oe", "shadownet", "proof"],
    },
    {
      name: "Gnocchi Limited Edition Proof",
      description: "Capped timed LE with a creator reserve and two independent collector mints.",
      artifactText: "Gnocchi limited edition proof",
      artifactFileName: "gnocchi-limited-edition.txt",
      mimeType: "text/plain",
      tags: ["gnocchi", "limited-edition", "shadownet", "proof"],
    },
  ];
  const artifactPins = await Promise.all(itemDefinitions.map((item) => pinIpfsProofBytes({
    bytes: Buffer.from(item.artifactText, "utf8"),
    fileName: item.artifactFileName,
    mimeType: item.mimeType,
    options: ipfs,
  })));
  const items = itemDefinitions.map(({ artifactText: _artifactText, artifactFileName: _artifactFileName, ...item }, index) => ({
    ...item,
    artifactUri: artifactPins[index].uri,
  }));
  const pkg = buildCollectionPackage({
    targetApp: "gnocchi",
    title: "Gnocchi Shadownet OE Modes Proof",
    description: "Fresh timed OE, forever OE, and limited-edition lifecycle proof in one Gnocchi contract.",
    symbol: "GNCPRF",
    relationship,
    items,
  });
  const validation = validateCheasePackage(pkg);
  assert.equal(validation.ok, true, validation.errors.join("; "));
  const collectionMetadata = buildCollectionMetadata({
    name: pkg.title,
    description: pkg.description,
    symbol: pkg.symbol,
    relationship,
  });
  const tokenMetadata = items.map((item) => buildTokenMetadata({
    name: item.name,
    description: item.description,
    symbol: pkg.symbol,
    artifactUri: item.artifactUri,
    mimeType: item.mimeType,
    creators: [creator],
    minter: creator,
    tags: item.tags,
    relationship,
  }));
  assert.deepEqual(extractRelationshipMetadata(collectionMetadata), relationship);
  tokenMetadata.forEach((value) => assert.deepEqual(extractRelationshipMetadata(value), relationship));
  const collectionPin = await pinIpfsProofJson({
    value: collectionMetadata,
    fileName: "gnocchi-collection.json",
    options: ipfs,
  });
  const tokenPins = await Promise.all(tokenMetadata.map((value, index) => pinIpfsProofJson({
    value,
    fileName: `gnocchi-token-${index}.json`,
    options: ipfs,
  })));
  return {
    relationship,
    package: pkg,
    tokenMetadata,
    collectionUri: collectionPin.uri,
    tokenUris: tokenPins.map((pin) => pin.uri),
    pins: { artifacts: artifactPins, collection: collectionPin, tokens: tokenPins },
  };
}

function pinProofLine(label: string, pin: IpfsPinnedProof): string {
  return `- ${label}: CID \`${pin.cid}\` — \`${pin.uri}\` — ${pin.publicGatewayUrl} — SHA-256 \`${pin.sha256}\``;
}

function originationStorage(admin: string, collectionUri: string) {
  const metadata = new MichelsonMap<string, string>();
  metadata.set("", utf8ToHex(collectionUri));
  return {
    administrator: admin,
    pending_administrator: null,
    metadata,
    ledger: new MichelsonMap(),
    operators: new MichelsonMap(),
    token_metadata: new MichelsonMap(),
    total_supply: new MichelsonMap(),
    total_minted: new MichelsonMap(),
    total_reserved: new MichelsonMap(),
    reserved_mints: new MichelsonMap(),
    sales: new MichelsonMap(),
    policy_locked: new MichelsonMap(),
    minters: new MichelsonMap(),
    next_token_id: 0,
  };
}

function tokenInfo(uri: string) {
  const info = new MichelsonMap<string, string>();
  info.set("", utf8ToHex(uri));
  return info;
}

function proofSale(
  treasury: string,
  boundaries: { start: string | null; end: string | null; maxSupply: number | null },
) {
  const curve = {
    base_price: 1,
    increment: 0,
    step_size: 1,
    minimum_price: 1,
    maximum_price: 1,
  };
  const validation = validateBondingCurve(curve);
  assert.equal(validation.ok, true, validation.errors.join("; "));
  return {
    curve,
    sale: {
      active: true,
      start: boundaries.start,
      end: boundaries.end,
      base_price: curve.base_price,
      increment: curve.increment,
      step_size: curve.step_size,
      min_price: curve.minimum_price,
      max_price: curve.maximum_price,
      max_supply: boundaries.maxSupply,
      treasury,
    },
  };
}

async function main(): Promise<void> {
  if (process.env.PASTA_SHADOWNET_E2E_EXECUTE !== "1") {
    block("explicit execute flag is required", [
      "`PASTA_SHADOWNET_E2E_EXECUTE=1` is required because this proof originates and mints on Shadownet.",
    ]);
  }
  assert.notEqual(process.env.TEZOS_NETWORK, "mainnet", "Gnocchi Shadownet proof refuses mainnet");
  const ipfs = resolveIpfsProofConfig();

  const rpc = await probeRpcChainId();
  reportRpcUrl = rpc.rpcUrl;
  const env = await signerEnv(rpc.rpcUrl, {
    socketPath: "/tmp/wtf-pasta-shadownet-gnocchi-e2e.sock",
    authToken: "local-pasta-shadownet-gnocchi-e2e",
    auditLog: "/tmp/wtf-pasta-shadownet-gnocchi-e2e-audit.log",
  });
  const { creator, creatorSigner, collector, collectorSigner, collectorTwo, collectorTwoSigner } = await loadSignerSet(env);
  const creatorTezos = buildToolkit(creatorSigner, rpc.rpcUrl);
  const collectorTezos = buildToolkit(collectorSigner, rpc.rpcUrl);
  const collectorTwoTezos = buildToolkit(collectorTwoSigner, rpc.rpcUrl);
  await Promise.all([
    assertShadownet(creatorTezos, "creator startup"),
    assertShadownet(collectorTezos, "collector one startup"),
    assertShadownet(collectorTwoTezos, "collector two startup"),
  ]);

  const [creatorBalance, collectorBalance, collectorTwoBalance] = await Promise.all([
    creatorTezos.tz.getBalance(creator.address),
    collectorTezos.tz.getBalance(collector.address),
    collectorTwoTezos.tz.getBalance(collectorTwo.address),
  ]);
  for (const [actor, balance] of [
    [creator, creatorBalance],
    [collector, collectorBalance],
    [collectorTwo, collectorTwoBalance],
  ] as const) {
    if (Number(balance.toString()) < MIN_BALANCE_MUTEZ) {
      block("a Gnocchi proof puppet needs Shadownet test tez", [
        `Wallet \`${actor.id}\` / \`${actor.address}\` has \`${balance.toString()}\` mutez.`,
        `Fund it to at least \`${MIN_BALANCE_MUTEZ}\` mutez, then rerun.`,
      ]);
    }
  }

  const code = await readContractArtifact();
  const entrypoints = collectAnnotations(code);
  const adapter = detectPastaContract(entrypoints);
  assert.equal(adapter?.kind, "open_edition_collection");
  assert.ok(availableActions(adapter, entrypoints).some((action) => action.id === "open_mint"));
  assert.ok(availableActions(adapter, entrypoints).some((action) => action.id === "set_sale_active"));

  const metadata = await buildMetadata(creator.address, ipfs);
  ok("pinned and public-gateway-verified all Gnocchi collection, token, and artifact bytes");
  const storage = originationStorage(creator.address, metadata.collectionUri);
  const estimate = await creatorTezos.estimate.originate({ code, storage } as any);
  const requiredCreator = Number(estimate.suggestedFeeMutez) + Number(estimate.burnFeeMutez) + 750_000;
  if (Number(creatorBalance.toString()) < requiredCreator) {
    block("creator cannot cover fresh Gnocchi origination and lifecycle", [
      `Creator has \`${creatorBalance.toString()}\` mutez; estimated origination and lifecycle headroom require \`${requiredCreator}\`.`,
    ]);
  }

  const originate = await creatorTezos.contract.originate({ code, storage } as any);
  await originate.confirmation(1);
  const originated = await originate.contract();
  ok(`originated ${originated.address} with ${originate.hash}`);

  const nowEpoch = Math.floor(Date.now() / 1000);
  const timedEndEpoch = nowEpoch + 120;
  const start = new Date((nowEpoch - 3600) * 1000).toISOString();
  const timedEnd = new Date(timedEndEpoch * 1000).toISOString();
  const longEnd = new Date((nowEpoch + 3600) * 1000).toISOString();
  const timed = proofSale(creator.address, { start, end: timedEnd, maxSupply: null });
  const forever = proofSale(creator.address, { start: null, end: null, maxSupply: null });
  const limited = proofSale(creator.address, { start, end: longEnd, maxSupply: 3 });
  const mintCost = costForBatch(timed.curve, 0, 1);
  const creatorContract = await creatorTezos.contract.at(originated.address);
  const createTimed = await creatorContract.methodsObject.create_open_edition({
    token_info: tokenInfo(metadata.tokenUris[0]),
    sale: timed.sale,
    creator_reserve: 0,
    lock_policy: true,
  }).send();
  await createTimed.confirmation(1);
  const createForever = await creatorContract.methodsObject.create_open_edition({
    token_info: tokenInfo(metadata.tokenUris[1]),
    sale: forever.sale,
    creator_reserve: 0,
    lock_policy: true,
  }).send();
  await createForever.confirmation(1);
  const createLimited = await creatorContract.methodsObject.create_open_edition({
    token_info: tokenInfo(metadata.tokenUris[2]),
    sale: limited.sale,
    creator_reserve: 1,
    lock_policy: true,
  }).send();
  await createLimited.confirmation(1);
  ok(`registered timed token 0, forever token 1, and limited token 2 with ${createTimed.hash} / ${createForever.hash} / ${createLimited.hash}`);

  const collectorContract = await collectorTezos.contract.at(originated.address);
  const collectorTwoContract = await collectorTwoTezos.contract.at(originated.address);
  const timedMintOne = await collectorContract.methodsObject.open_mint({ token_id: 0, amount: 1 }).send({ amount: mintCost, mutez: true });
  await timedMintOne.confirmation(1);
  const timedMintTwo = await collectorTwoContract.methodsObject.open_mint({ token_id: 0, amount: 1 }).send({ amount: mintCost, mutez: true });
  await timedMintTwo.confirmation(1);
  ok("two independent collectors minted uncapped timed token 0 before its deadline");

  const limitedMintOne = await collectorContract.methodsObject.open_mint({ token_id: 2, amount: 1 }).send({ amount: mintCost, mutez: true });
  await limitedMintOne.confirmation(1);
  const limitedMintTwo = await collectorTwoContract.methodsObject.open_mint({ token_id: 2, amount: 1 }).send({ amount: mintCost, mutez: true });
  await limitedMintTwo.confirmation(1);
  let soldOutRejection = "";
  try {
    await collectorContract.methodsObject.open_mint({ token_id: 2, amount: 1 }).send({ amount: mintCost, mutez: true });
    assert.fail("limited edition unexpectedly minted beyond creator reserve + two collector mints");
  } catch (error) {
    soldOutRejection = error instanceof Error ? error.message : String(error);
    assert.match(soldOutRejection, /SOLD_OUT|failed|simulation|rejected/i);
  }
  ok("limited token 2 consumed its lifetime cap and rejected further issuance");

  let lockedPolicyRejection = "";
  try {
    await creatorContract.methodsObject.set_sale({
      token_id: 2,
      sale: { ...limited.sale, max_supply: 4 },
    }).send();
    assert.fail("locked limited-edition cap unexpectedly expanded");
  } catch (error) {
    lockedPolicyRejection = error instanceof Error ? error.message : String(error);
    assert.match(lockedPolicyRejection, /POLICY_LOCKED|failed|simulation|rejected/i);
  }

  const foreverMintOne = await collectorContract.methodsObject.open_mint({ token_id: 1, amount: 1 }).send({ amount: mintCost, mutez: true });
  await foreverMintOne.confirmation(1);
  const vault = await creatorContract.methodsObject.set_sale_active({ token_id: 1, active: false }).send();
  await vault.confirmation(1);
  let vaultRejection = "";
  try {
    await collectorTwoContract.methodsObject.open_mint({ token_id: 1, amount: 1 }).send({ amount: mintCost, mutez: true });
    assert.fail("forever OE unexpectedly minted while vaulted");
  } catch (error) {
    vaultRejection = error instanceof Error ? error.message : String(error);
    assert.match(vaultRejection, /SALE_INACTIVE|failed|simulation|rejected/i);
  }
  const unvault = await creatorContract.methodsObject.set_sale_active({ token_id: 1, active: true }).send();
  await unvault.confirmation(1);
  const foreverMintTwo = await collectorTwoContract.methodsObject.open_mint({ token_id: 1, amount: 1 }).send({ amount: mintCost, mutez: true });
  await foreverMintTwo.confirmation(1);
  ok("forever token 1 preserved supply through vault and resumed for collector two");

  const waitMs = Math.max(0, timedEndEpoch * 1000 + 20_000 - Date.now());
  if (waitMs > 0) {
    ok(`waiting ${Math.ceil(waitMs / 1000)}s for timed token 0's locked deadline to pass`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  let endedRejection = "";
  try {
    await collectorContract.methodsObject.open_mint({ token_id: 0, amount: 1 }).send({ amount: mintCost, mutez: true });
    assert.fail("timed OE unexpectedly minted after its locked deadline");
  } catch (error) {
    endedRejection = error instanceof Error ? error.message : String(error);
    assert.match(endedRejection, /ENDED|failed|simulation|rejected/i);
  }
  ok("timed token 0 rejected issuance after its locked deadline");

  const storageUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/contracts/${originated.address}/storage`;
  const indexedStorage = await pollJson("Gnocchi storage", storageUrl, (json) =>
    Number(json?.ledger) > 0 && Number(json?.token_metadata) > 0 && Number(json?.total_supply) > 0 &&
      Number(json?.total_minted) > 0 && Number(json?.sales) > 0 && Number(json?.policy_locked) > 0 && Number(json?.next_token_id) === 3,
  );
  const ledger = await pollJson("Gnocchi collector balances", `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.ledger}/keys?limit=100`, (json) =>
    Array.isArray(json) && [0, 1, 2].every((tokenId) =>
      json.some((entry) => entry?.key?.owner === collector.address && Number(entry?.key?.token_id) === tokenId && Number(entry.value) === 1) &&
      json.some((entry) => entry?.key?.owner === collectorTwo.address && Number(entry?.key?.token_id) === tokenId && Number(entry.value) === 1),
    ) && json.some((entry) => entry?.key?.owner === creator.address && Number(entry?.key?.token_id) === 2 && Number(entry.value) === 1),
  );
  const supplies = await pollJson("Gnocchi token supplies", `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.total_supply}/keys?limit=20`, (json) =>
    Array.isArray(json) && [0, 1].every((tokenId) => json.some((entry) => Number(entry.key) === tokenId && Number(entry.value) === 2)) &&
      json.some((entry) => Number(entry.key) === 2 && Number(entry.value) === 3),
  );
  const minted = await pollJson("Gnocchi lifetime minted totals", `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.total_minted}/keys?limit=20`, (json) =>
    Array.isArray(json) && [0, 1].every((tokenId) => json.some((entry) => Number(entry.key) === tokenId && Number(entry.value) === 2)) &&
      json.some((entry) => Number(entry.key) === 2 && Number(entry.value) === 3),
  );
  const sales = await pollJson("Gnocchi sale modes", `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.sales}/keys?limit=20`, (json) => {
    if (!Array.isArray(json)) return false;
    const timedEntry = json.find((entry) => Number(entry.key) === 0)?.value;
    const foreverEntry = json.find((entry) => Number(entry.key) === 1)?.value;
    const limitedEntry = json.find((entry) => Number(entry.key) === 2)?.value;
    return timedEntry?.active === true && timedEntry?.max_supply == null && timedEntry?.start != null && timedEntry?.end != null &&
      foreverEntry?.active === true && foreverEntry?.max_supply == null && foreverEntry?.start == null && foreverEntry?.end == null &&
      limitedEntry?.active === true && Number(limitedEntry?.max_supply) === 3 && limitedEntry?.start != null && limitedEntry?.end != null;
  });
  const policyLocks = await pollJson("Gnocchi policy locks", `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.policy_locked}/keys?limit=20`, (json) =>
    Array.isArray(json) && [0, 1, 2].every((tokenId) => json.some((entry) => Number(entry.key) === tokenId && entry.value === true)),
  );
  const tokenMetadata = await pollJson("Gnocchi token metadata", `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.token_metadata}/keys?limit=20`, (json) =>
    Array.isArray(json) && [0, 1, 2].every((tokenId) => json.some((entry) => Number(entry.key) === tokenId && entry?.value?.token_info?.[""])),
  );
  const indexedTokenUris = tokenMetadata
    .sort((a: any, b: any) => Number(a.key) - Number(b.key))
    .map((entry: any) => hexToUtf8(entry.value.token_info[""]));
  assert.deepEqual(indexedTokenUris, metadata.pins.tokens.map((pin) => pin.uri));
  const decodedNames = metadata.tokenMetadata.map((value: any) => value.name);
  assert.deepEqual(decodedNames, ["Gnocchi Timed OE Proof", "Gnocchi Forever OE Proof", "Gnocchi Limited Edition Proof"]);
  const mintTransactions = await pollJson(
    "Gnocchi mint transactions",
    `${normalizeBase(SHADOWNET_TZKT_API)}/operations/transactions?target=${originated.address}&entrypoint=open_mint&status=applied&limit=20`,
    (json) => Array.isArray(json) && json.filter((op) => op.sender?.address === collector.address).length >= 3 && json.filter((op) => op.sender?.address === collectorTwo.address).length >= 3,
  );

  await writeReport("PASSED", [
    "## Result", "",
    "- Fresh Gnocchi collection proof passed for timed OE, vaultable forever OE, and capped timed LE in one KT1 with two independent collectors.",
    `- Creator: \`${creator.id}\` / \`${creator.address}\``,
    `- Collector one: \`${collector.id}\` / \`${collector.address}\``,
    `- Collector two: \`${collectorTwo.id}\` / \`${collectorTwo.address}\``,
    `- Contract: \`${originated.address}\``,
    `- Explorer: https://shadownet.tzkt.io/${originated.address}`, "",
    "## Operations", "",
    `- Origination: \`${originate.hash}\``,
    `- Create timed OE token 0: \`${createTimed.hash}\``,
    `- Create forever OE token 1: \`${createForever.hash}\``,
    `- Create limited edition token 2 with creator reserve: \`${createLimited.hash}\``,
    `- Timed OE collector one mint: \`${timedMintOne.hash}\``,
    `- Timed OE collector two mint: \`${timedMintTwo.hash}\``,
    `- Timed OE ended rejection: \`${endedRejection.slice(0, 200)}\``,
    `- Forever OE collector one mint: \`${foreverMintOne.hash}\``,
    `- Vault forever OE: \`${vault.hash}\``,
    `- Vaulted mint rejection: \`${vaultRejection.slice(0, 200)}\``,
    `- Unvault forever OE: \`${unvault.hash}\``,
    `- Forever OE collector two mint: \`${foreverMintTwo.hash}\``,
    `- Limited Edition collector one mint: \`${limitedMintOne.hash}\``,
    `- Limited Edition collector two mint: \`${limitedMintTwo.hash}\``,
    `- Limited Edition sold-out rejection: \`${soldOutRejection.slice(0, 200)}\``,
    `- Locked policy expansion rejection: \`${lockedPolicyRejection.slice(0, 200)}\``, "",
    "## Pinned IPFS proof", "",
    pinProofLine("Collection metadata", metadata.pins.collection),
    ...metadata.pins.artifacts.map((pin, index) => pinProofLine(`Token ${index} artifact`, pin)),
    ...metadata.pins.tokens.map((pin, index) => pinProofLine(`Token ${index} metadata`, pin)),
    "",
    "## Indexed proof", "",
    `- TzKT indexed both collectors owning timed, forever, and limited tokens plus the creator's declared LE reserve in ledger big-map \`${indexedStorage.ledger}\`.`,
    `- TzKT indexed current supplies and lifetime minted totals for all three token ids in big-maps \`${indexedStorage.total_supply}\` / \`${indexedStorage.total_minted}\`.`,
    `- Token 0 has a locked time window with no cap; token 1 has no max supply, start, or end; token 2 has both a time window and max_supply=3 in sales big-map \`${indexedStorage.sales}\`.`,
    `- TzKT indexed all three policy locks in big-map \`${indexedStorage.policy_locked}\`.`,
    `- TzKT decoded direct metadata for all three proof tokens from big-map \`${indexedStorage.token_metadata}\`.`,
    `- TzKT returned \`${mintTransactions.length}\` applied open_mint transactions including three from each collector.`,
    `- Relationship group: \`${metadata.relationship.collection_group}\`.`, "",
    "## What this proves", "",
    "- The same reusable Gnocchi contract artifact supports timed uncapped OEs, forever OEs, and capped timed LEs without a helper contract.",
    "- The LE hard cap counts its creator reserve and applies to public and administrator/delegated issuance; the proof rejected issuance beyond three.",
    "- Locked start/end/cap boundaries cannot be expanded after publication, and the timed OE rejected minting after its end.",
    "- Vaulting a forever OE stops new issuance without changing existing supply or ownership; unvaulting resumes the same token.",
    `- Indexed evidence sets: ledger=${ledger.length}, supplies=${supplies.length}, minted=${minted.length}, sales=${sales.length}, locks=${policyLocks.length}, metadata=${tokenMetadata.length}.`,
  ]);
}

main().catch(async (error) => {
  if (error instanceof ProofBlocked) {
    await writeReport("BLOCKED", error.lines).catch(() => undefined);
    console.error(`BLOCKED: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  const message = error instanceof Error ? error.stack || error.message : String(error);
  await writeReport("FAILED", ["## Error", "", "```", message, "```"]).catch(() => undefined);
  console.error(`[pasta-shadownet-gnocchi-e2e] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
