import { test } from "node:test";
import assert from "node:assert/strict";
import {
  anonymousNominationRkey,
  buildCrpNominationRecord,
  detectNomineeQueryKind,
  nominationRkey,
  normalizeXHandle,
} from "./records";
import { bskyPostRkey, buildCrpBskySharePost } from "./bsky-post";
import { buildCrpShareIntents } from "./share-intents";
import { CRP_NOMINATION_COLLECTION } from "./records";

const SAMPLE_WALLET = "tz1U7C2NVwbhdvG3fJixLLUWUyZHuXWNiF7V";

test("detectNomineeQueryKind recognizes wallet, tez domain, x, and bsky inputs", () => {
  assert.equal(detectNomineeQueryKind(SAMPLE_WALLET), "wallet");
  assert.equal(detectNomineeQueryKind("melon.tez"), "tezos_domain");
  assert.equal(detectNomineeQueryKind("@tezos"), "x");
  assert.equal(detectNomineeQueryKind("alice.bsky.social"), "bsky");
});

test("buildCrpNominationRecord stores share refs for the canonical CRP repo records", () => {
  const record = buildCrpNominationRecord({
    nominatorUserId: 7,
    nominatorDid: "did:plc:test",
    nominee: {
      tezosAddress: SAMPLE_WALLET,
      xHandle: "@Nominee",
      bskyHandle: "nominee.bsky.social",
      identitySources: ["objkt", "tzkt"],
    },
    categoryId: "tez-dev",
    shareRefs: {
      nominationUri: `at://did:web:crp/app.wtfos.liveops.crpNomination/test`,
      bskyPostUri: `at://did:web:crp/app.bsky.feed.post/test`,
      bskyPostUrl: "https://bsky.app/profile/crp.wtfos.me/post/test",
    },
    nominationId: "nom-1",
    createdAt: "2026-05-31T00:00:00.000Z",
    campaignMonth: "2026-05",
  });

  assert.equal(record.shareRefs?.bskyPostUrl, "https://bsky.app/profile/crp.wtfos.me/post/test");
  assert.equal(record.categoryLabel, "Tez Dev Award");
});

test("buildCrpNominationRecord omits nominator identity when anonymous", () => {
  const record = buildCrpNominationRecord({
    nominatorUserId: 7,
    anonymous: true,
    nominee: {
      tezosAddress: SAMPLE_WALLET,
      xHandle: "@Nominee",
    },
    categoryId: "tez-dev",
    nominationId: "anon-nom-1",
    createdAt: "2026-05-31T00:00:00.000Z",
    campaignMonth: "2026-05",
  });

  assert.equal(record.anonymous, true);
  assert.equal(record.nominatorUserId, undefined);
  assert.equal(record.nominatorDid, undefined);
  assert.equal(record.nominatorHandle, undefined);
  assert.equal(record.categoryId, "tez-dev");
});

test("anonymousNominationRkey does not embed nominator user id", () => {
  assert.equal(anonymousNominationRkey("abc-123"), "crp-anon-abc-123");
  assert.doesNotMatch(anonymousNominationRkey("abc-123"), /-7-/);
});

test("bsky share post uses app.bsky.feed.post and includes nomination AT URI", () => {
  const nomination = buildCrpNominationRecord({
    nominatorUserId: 1,
    nominatorDid: "did:plc:nominator",
    nominee: { tezosAddress: SAMPLE_WALLET, displayName: "Builder" },
    categoryId: "helping-hand",
    nominationId: "nom-bsky",
    createdAt: "2026-05-31T00:00:00.000Z",
    campaignMonth: "2026-05",
  });
  const nominationUri = `at://did:web:crp/${CRP_NOMINATION_COLLECTION}/post-1`;
  const post = buildCrpBskySharePost({ nomination, nominationUri });
  assert.equal(post.$type, "app.bsky.feed.post");
  assert.match(String(post.text), /#TezosCRP/);
  assert.match(String(post.text), new RegExp(nominationUri.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("bskyPostRkey pairs deterministically with nomination rkey", () => {
  const base = nominationRkey({
    nominatorUserId: 3,
    categoryId: "helping-hand",
    tezosAddress: SAMPLE_WALLET,
    campaignMonth: "2026-05",
  });
  assert.equal(bskyPostRkey(base), base.replace(/^crp-/, "post-"));
});

test("share intents stay within platform limits and use bsky post URL, not fake embed params", () => {
  const nomination = {
    $type: "app.wtfos.liveops.crpNomination" as const,
    ...buildCrpNominationRecord({
      nominatorUserId: 1,
      nominatorDid: "did:plc:nominator",
      nominee: {
        tezosAddress: SAMPLE_WALLET,
        xHandle: normalizeXHandle("tezosbuilder"),
        displayName: "Tezos Builder",
      },
      categoryId: "tez-dev",
      shareRefs: {
        bskyPostUrl: "https://bsky.app/profile/crp.wtfos.me/post/post-1",
        bskyPostUri: "at://did:web:crp/app.bsky.feed.post/post-1",
      },
      nominationId: "nom-share",
      createdAt: "2026-05-31T00:00:00.000Z",
      campaignMonth: "2026-05",
    }),
  };
  const intents = buildCrpShareIntents(nomination, nomination.shareRefs?.bskyPostUrl);
  assert.ok(intents.x.text.includes("#TezosCRP"));
  assert.ok(Array.from(intents.x.text).length <= 280);
  assert.ok(Array.from(intents.bsky.text).length <= 300);
  assert.match(intents.x.url, /^https:\/\/twitter\.com\/intent\/tweet/);
  assert.match(intents.bsky.url, /^https:\/\/bsky\.app\/intent\/compose/);
  assert.ok(intents.bsky.text.includes("https://bsky.app/profile/crp.wtfos.me/post/post-1"));
  assert.equal(new URL(intents.bsky.url).searchParams.get("embed"), null);
});
