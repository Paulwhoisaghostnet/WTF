import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { inspectHorseToken, HorseTokenIneligibleError } from "./eligibility";
import { getHorfStablesSnapshot, type ChainReader } from "./chain";
import { issueHorfDepositPermit, packHorfDepositPermit } from "./permit";
import { parseHorfPermitRequest } from "./routes";
import { buildHorfClaimEventParams, fetchHorfClaimEventPage, isLastHorfClaimEventPage } from "./claims";
import { identityMatchesApproval } from "./custody";
import { horfLegacyDepositsClosed } from "./config";

const wallet = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";
const donor = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const stable = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const tokenContract = "KT1U4p17VUNcinntAzUULBhzpPK7f2a4Ht4P";
const tokenId = "23";
const token = {
  fa_contract: tokenContract,
  token_id: tokenId,
  name: "The Mustangs in Sally's Field",
  description: "GM Horsetraders",
  decimals: 0,
  thumbnail_uri: "ipfs://QmYSZCWcof4Ep9ayVSgDDuiKhmE2qEv8V9xuuMYh9fDeUc",
  creators: [{ creator_address: donor, holder: { alias: "Sally" } }],
  tags: [{ tag: { name: "horseofjuly", token_count: 125 } }],
};

test("V3 configuration closes new V2 deposits but leaves legacy reads independent", () => {
  assert.equal(horfLegacyDepositsClosed({ TEZOS_NETWORK: "mainnet" }), false);
  assert.equal(horfLegacyDepositsClosed({ TEZOS_NETWORK: "mainnet", HORF_ROOMS_CONTRACT_ADDRESS: stable }), true);
  assert.equal(horfLegacyDepositsClosed({ TEZOS_NETWORK: "mainnet", HORF_ROOMS_CONTRACT_ADDRESS: "bad-address" }), true);
  assert.equal(horfLegacyDepositsClosed({ TEZOS_NETWORK: "shadownet", HORF_ROOMS_CONTRACT_ADDRESS: stable }), false);
});

test("stable eligibility uses live Objkt metadata and group counts", async () => {
  const exclusionCheck = async () => false;
  const found = await inspectHorseToken(tokenContract, tokenId, async () => token, { exclusionCheck });
  assert.equal(found.name, token.name);
  assert.equal(found.creatorAddress, donor);
  assert.equal(found.creatorName, "Sally");
  assert.match(found.image || "", /^https:\/\//);
  const animated = await inspectHorseToken(tokenContract, tokenId, async () => ({
    ...token,
    display_uri: "ipfs://QmYSZCWcof4Ep9ayVSgDDuiKhmE2qEv8V9xuuMYh9fDeUc",
    artifact_uri: "ipfs://QmYSZCWcof4Ep9ayVSgDDuiKhmE2qEv8V9xuuMYh9fDeUc",
    mime: "image/gif",
  }), { exclusionCheck });
  assert.match(animated.displayUri || "", /^https:\/\//);
  assert.match(animated.artifactUri || "", /^https:\/\//);
  assert.equal(animated.mime, "image/gif");
  const groupOnly = { ...token, name: "Untitled", description: "", tags: [{ tag: { name: "pony", token_count: 6 } }] };
  assert.equal((await inspectHorseToken(tokenContract, tokenId, async () => groupOnly, { exclusionCheck })).tokenId, tokenId);
  await assert.rejects(
    inspectHorseToken(tokenContract, tokenId, async () => ({ ...groupOnly, tags: [{ tag: { name: "pony", token_count: 5 } }] }), { exclusionCheck }),
    HorseTokenIneligibleError,
  );
  await assert.rejects(
    inspectHorseToken(tokenContract, tokenId, async () => ({ ...token, decimals: 2 }), { exclusionCheck }),
    HorseTokenIneligibleError,
  );
});

test("a HAHA-only tag can enter Marshal inspection before it can trade", async () => {
  const candidate = { ...token, name: "The Laughing Clown", description: "HAHA, just joking!",
    tags: [{ tag: { name: "haha", token_count: 100 } }] };
  const reviewed = await inspectHorseToken(tokenContract, tokenId, async () => candidate,
    { forMarshalReview: true, exclusionCheck: async () => false });
  assert.equal(reviewed.name, candidate.name);
});

test("a Marshal-confirmed non-horse cannot pass Stable eligibility", async () => {
  await assert.rejects(inspectHorseToken(tokenContract, tokenId, async () => token,
    { exclusionCheck: async () => true }), /not a horse/i);
});

test("permit input rejects forged identities and preserves natural numbers", () => {
  const parsed = parseHorfPermitRequest({ address: wallet, mode: 2, tokenContract, tokenId, amount: "12345678901234567890" });
  assert.equal(parsed?.amount, "12345678901234567890");
  assert.equal(parseHorfPermitRequest({ address: wallet, mode: 2, tokenContract, tokenId, amount: 0 }), null);
  assert.equal(parseHorfPermitRequest({ address: donor, mode: 3, tokenContract, tokenId, amount: 1 }), null);
  assert.equal(parseHorfPermitRequest({ address: "tz1burnburnburnburnburnburnburjAYjjX", mode: 0, tokenContract, tokenId, amount: 1 }), null);
});

test("permit signs packed chain, contract, sender, stable, token, nonce, and epoch", async () => {
  let signed: string | null = null;
  const fakeReader: ChainReader = { getJson: async (path) => {
    if (path === "/head") return { chainId: "NetXdQprcVkpaWU" } as never;
    if (path.endsWith("/storage")) return { admin: wallet, oracle_key: "edpk-oracle", oracle_epoch: "7", next_listing_id: "12" } as never;
    throw new Error(path);
  } };
  const result = await issueHorfDepositPermit(
    { address: wallet, mode: 1, tokenContract, tokenId, amount: "3" },
    {
      reader: fakeReader,
      loadToken: async () => token,
      signer: {
        publicKey: async () => "edpk-oracle",
        sign: async (bytes) => {
          signed = bytes;
          return { sig: "sig-test", prefixSig: "edsig-test" };
        },
      },
      env: { TEZOS_NETWORK: "mainnet", HORF_STABLES_CONTRACT_ADDRESS: stable },
      nonce: "ab".repeat(32),
      approvalCheck: async () => {},
      exclusionCheck: async () => false,
    },
  );
  assert.equal(result.signature, "edsig-test");
  assert.equal(result.oracleEpoch, "7");
  assert.equal(result.token.name, token.name);
  assert.equal(result.nonce, `0x${"ab".repeat(32)}`);
  assert.equal(signed, packHorfDepositPermit({
    chainId: "NetXdQprcVkpaWU",
    contractAddress: stable,
    address: wallet,
    mode: 1,
    tokenContract,
    tokenId,
    amount: "3",
    nonce: "ab".repeat(32),
    oracleEpoch: "7",
  }));
  assert.match(signed || "", /^05[0-9a-f]+$/);
  await assert.rejects(issueHorfDepositPermit(
    { address: wallet, mode: 1, tokenContract, tokenId, amount: "3" },
    { reader: fakeReader, loadToken: async () => token, signer: { publicKey: async () => "edpk-wrong", sign: async () => { throw new Error("must not sign"); } }, env: { TEZOS_NETWORK: "mainnet", HORF_STABLES_CONTRACT_ADDRESS: stable }, approvalCheck: async () => {} },
  ), /oracle key does not match/i);
});

test("inspected token approval binds exact FA2 origin and full script hash", () => {
  const identity = { contract: tokenContract, creatorAddress: wallet, codeHash: 123,
    codeSha256: "ab".repeat(32), asOf: "2026-11-03T00:00:00Z", source: "Tezos Mainnet TzKT and RPC" as const };
  const approval = { tokenContract, creatorAddress: wallet, codeHash: 123, codeSha256: "ab".repeat(32), active: true };
  assert.equal(identityMatchesApproval(identity, approval), true);
  assert.equal(identityMatchesApproval(identity, { ...approval, active: false }), false);
  assert.equal(identityMatchesApproval(identity, { ...approval, creatorAddress: donor }), false);
  assert.equal(identityMatchesApproval(identity, { ...approval, codeSha256: "cd".repeat(32) }), false);
});

test("Taquito permit bytes equal the independent SmartPy PACK fixture", () => {
  const vector = JSON.parse(readFileSync(
    new URL("../../../../contracts/horf-stables/permit-vector.json", import.meta.url), "utf8",
  ));
  const packed = packHorfDepositPermit({
    chainId: vector.chainId,
    contractAddress: vector.stableAddress,
    address: vector.depositor,
    mode: vector.mode,
    tokenContract: vector.tokenContract,
    tokenId: String(vector.tokenId),
    amount: String(vector.amount),
    nonce: vector.nonce,
    oracleEpoch: String(vector.oracleEpoch),
  });
  assert.equal(packed, vector.packedHex);
});

test("stable inventory reads on-chain credits, listings, and group claim marks", async () => {
  const paths: string[] = [];
  const reader: ChainReader = { getJson: async (path, params) => {
    paths.push(path);
    if (path === "/head") return { chainId: "NetXdQprcVkpaWU", timestamp: "2026-11-03T17:00:00Z" } as never;
    if (path.endsWith("/storage")) return { admin: wallet, oracle_key: "edpk-oracle", oracle_epoch: "0", next_listing_id: "3" } as never;
    if (path.endsWith("/bigmaps/blacklisted/keys")) {
      assert.deepEqual(params, { key: wallet, limit: 2 });
      return [{ key: wallet, active: true, value: false }] as never;
    }
    if (path.endsWith("/bigmaps/listings/keys")) {
      assert.equal(params?.["offset.cr"], 0);
      return [
        { id: 12, key: "1", active: true, value: { owner: donor, mode: 2, token_contract: tokenContract, token_id: tokenId, submitted: "5", remaining: "4" } },
        { id: 13, key: "2", active: true, value: { owner: wallet, mode: 0, token_contract: stable, token_id: "9", submitted: "1", remaining: "1" } },
      ] as never;
    }
    if (path.endsWith("/bigmaps/reciprocal_credits/keys")) {
      assert.deepEqual(params, { key: wallet, limit: 2 });
      return [{ key: wallet, active: true, value: "1" }] as never;
    }
    if (path.endsWith("/bigmaps/group_credits/keys")) {
      assert.deepEqual(params, { key: wallet, limit: 2 });
      return [{ key: wallet, active: true, value: "29" }] as never;
    }
    if (path.endsWith("/bigmaps/group_claimed/keys")) {
      assert.equal(params?.["key.claimant"], wallet);
      return [{ id: 15, active: true, key: { claimant: wallet, token_contract: tokenContract, token_id: tokenId }, value: true }] as never;
    }
    throw new Error(path);
  } };
  const snapshot = await getHorfStablesSnapshot(wallet, reader, {
    TEZOS_NETWORK: "mainnet", HORF_STABLES_CONTRACT_ADDRESS: stable,
  });
  assert.equal(snapshot.status, "ready");
  assert.equal(snapshot.permitReady, false);
  assert.equal(snapshot.adminAddress, wallet);
  assert.equal(snapshot.onChainBlacklisted, false);
  assert.equal(snapshot.groupCredits, "29");
  assert.equal(snapshot.reciprocalCredits, "1");
  assert.equal(snapshot.listings[0]?.id, "2");
  assert.equal(snapshot.listings[1]?.claimedByWallet, true);
  assert.equal(paths.length, 7);
  assert.equal((await getHorfStablesSnapshot(wallet, reader, {})).status, "unconfigured");
});

test("stable inventory treats absent wallet big-map keys as zero credits and no blacklist", async () => {
  const reader: ChainReader = { getJson: async (path, params) => {
    if (path === "/head") return { chainId: "NetXdQprcVkpaWU", timestamp: "2026-11-04T07:00:00Z" } as never;
    if (path.endsWith("/storage")) return { admin: wallet, oracle_key: "edpk-oracle", oracle_epoch: "0", next_listing_id: "0" } as never;
    if (path.endsWith("/bigmaps/listings/keys") || path.endsWith("/bigmaps/group_claimed/keys")) return [] as never;
    if (path.endsWith("/bigmaps/blacklisted/keys") || path.endsWith("/bigmaps/reciprocal_credits/keys") ||
        path.endsWith("/bigmaps/group_credits/keys")) {
      assert.deepEqual(params, { key: wallet, limit: 2 });
      return [] as never;
    }
    throw new Error(`Unexpected singleton or unhandled TzKT path: ${path}`);
  } };
  const snapshot = await getHorfStablesSnapshot(wallet, reader, {
    TEZOS_NETWORK: "mainnet", HORF_STABLES_CONTRACT_ADDRESS: stable,
  });
  assert.equal(snapshot.status, "ready");
  assert.equal(snapshot.onChainBlacklisted, false);
  assert.equal(snapshot.reciprocalCredits, "0");
  assert.equal(snapshot.groupCredits, "0");
});

test("horse claim events are sourced by contract and season without cursor gaps", async () => {
  const since = "2026-11-01T00:00:00.000Z";
  const until = "2026-12-01T00:00:00.000Z";
  const params = buildHorfClaimEventParams(stable, 41, since, until);
  assert.equal(params.contract, stable);
  assert.equal(params.tag, "horse_claimed");
  assert.equal(params["id.gt"], 41);
  assert.equal(params["timestamp.lt"], until);
  const reader: ChainReader = { getJson: async (path, supplied) => {
    assert.equal(path, "/contracts/events");
    if (supplied?.["id.gt"] === 41) assert.deepEqual(supplied, params);
    return [{
      id: 42,
      timestamp: "2026-11-03T17:00:00Z",
      contract: { address: stable },
      tag: "horse_claimed",
      payload: { listing_id: "9", claimant: wallet, owner: donor, mode: 2, token_contract: tokenContract, token_id: tokenId },
    }] as never;
  } };
  const claims = await fetchHorfClaimEventPage(stable, 41, since, until, reader);
  assert.deepEqual(claims, [{
    id: 42,
    timestamp: "2026-11-03T17:00:00.000Z",
    from: donor,
    to: wallet,
    mode: 2,
    token: { contract: tokenContract, tokenId },
  }]);
  assert.equal(isLastHorfClaimEventPage(claims), true);
  await assert.rejects(fetchHorfClaimEventPage(stable, 42, since, until, reader), /cursor did not advance/);
});
