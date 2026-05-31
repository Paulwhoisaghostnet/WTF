import { randomUUID } from "crypto";
import { and, desc, eq, or } from "drizzle-orm";
import { wtfosAppviewRecords } from "@shared/schema";
import type { CrpNomination } from "@shared/atproto";
import { sourceUrlForAtUri } from "../atproto/identity";
import { db } from "../../db";
import { ingestSystemEvent } from "../../challenges/events/ingest";
import { buildAtUri } from "../atproto-spine/appview/record-shape";
import { buildIndexRef, echoRkeyParts } from "../atproto-spine/echo-router";
import { resolveSpineIdentity } from "../atproto-spine/identity-resolve";
import { echoRecordToMaster, enqueueSpineRecord } from "../atproto-spine/service";
import { isSpineEnabled } from "../atproto-spine/config";
import { bskyPostRkey, buildCrpBskySharePost, CRP_BSKY_POST_COLLECTION_ID } from "./bsky-post";
import { getCrpNominationsRepoConfig, requireCrpNominationsRepoConfig } from "./crp-repo";
import { enqueueCrpOutboxRecord } from "./outbox";
import {
  anonymousNominationRkey,
  buildCrpNominationRecord,
  CRP_NOMINATION_COLLECTION,
  currentCampaignMonth,
  nominationRkey,
  type CrpNominationInput,
} from "./records";
import { countAnonymousNominationCredits, recordAnonymousNominationCredit } from "./reward-credits";

export type PublishedCrpNomination = {
  nomination: CrpNomination;
  nominationUri: string | null;
  bskyPostUri: string | null;
  bskyPostUrl: string | null;
  userEchoUri: string | null;
  anonymous: boolean;
  outboxStatus: string | null;
  repoDid: string;
  repoHandle: string;
};

export async function publishCrpNomination(input: CrpNominationInput): Promise<PublishedCrpNomination> {
  const crpRepo = requireCrpNominationsRepoConfig();
  const anonymous = Boolean(input.anonymous);
  const identity = anonymous ? null : await resolveSpineIdentity(input.nominatorUserId);
  const nominatorDid =
    identity?.repoDid || identity?.canonicalDid || input.nominatorDid || "did:unknown:wtfos";

  const campaignMonth = input.campaignMonth ?? currentCampaignMonth();
  const nominationId = input.nominationId ?? randomUUID();
  const nominationRkeyValue = anonymous
    ? anonymousNominationRkey(nominationId)
    : nominationRkey({
        nominatorUserId: input.nominatorUserId,
        categoryId: input.categoryId,
        tezosAddress: input.nominee.tezosAddress,
        campaignMonth,
      });
  const bskyRkey = bskyPostRkey(nominationRkeyValue);
  const nominationUri = buildAtUri(crpRepo.did, CRP_NOMINATION_COLLECTION, nominationRkeyValue);
  const bskyPostUri = buildAtUri(crpRepo.did, CRP_BSKY_POST_COLLECTION_ID, bskyRkey);
  const bskyPostUrl = sourceUrlForAtUri(bskyPostUri, crpRepo.handle);

  const nominationBody = buildCrpNominationRecord({
    ...input,
    nominationId,
    anonymous,
    nominatorDid: anonymous ? undefined : nominatorDid,
    nominatorHandle: anonymous ? null : input.nominatorHandle,
    campaignMonth,
    shareRefs: {
      nominationUri,
      bskyPostUri,
      bskyPostUrl: bskyPostUrl ?? undefined,
    },
  });

  const bskyPostBody = buildCrpBskySharePost({
    nomination: nominationBody,
    nominationUri,
    createdAt: nominationBody.createdAt,
  });

  const nominationRow = await enqueueCrpOutboxRecord({
    userId: input.nominatorUserId,
    targetType: "primary_wtfos_repo",
    targetDid: crpRepo.did,
    targetHandle: crpRepo.handle,
    targetPdsUrl: crpRepo.pdsUrl,
    collection: CRP_NOMINATION_COLLECTION,
    rkey: nominationRkeyValue,
    record: { $type: CRP_NOMINATION_COLLECTION, ...nominationBody },
    sourceEventType: "crp.nomination.submitted",
    sourceRefType: "crp_nomination",
    sourceRefId: nominationBody.nominationId,
  });

  await enqueueCrpOutboxRecord({
    userId: input.nominatorUserId,
    targetType: "primary_wtfos_repo",
    targetDid: crpRepo.did,
    targetHandle: crpRepo.handle,
    targetPdsUrl: crpRepo.pdsUrl,
    collection: CRP_BSKY_POST_COLLECTION_ID,
    rkey: bskyRkey,
    record: bskyPostBody,
    sourceEventType: "crp.nomination.bsky_post",
    sourceRefType: "crp_nomination",
    sourceRefId: nominationBody.nominationId,
  });

  let userEchoUri: string | null = null;
  if (!anonymous && identity?.hasRepo && identity.repoDid) {
    const echoFact = {
      factRepo: crpRepo.did,
      factCollection: CRP_NOMINATION_COLLECTION,
      factRkey: nominationRkeyValue,
      refKind: "crp_nomination",
      subdomain: "liveops",
      summary: {
        nominationId: nominationBody.nominationId,
        categoryId: nominationBody.categoryId,
        nomineeAddress: nominationBody.nominee.tezosAddress,
        bskyPostUri,
        bskyPostUrl,
      },
      createdAt: nominationBody.createdAt,
    };
    const echoRecord = buildIndexRef(echoFact);
    const echoRkey = echoRkeyParts(echoFact).join("-");
    await enqueueSpineRecord({
      userId: input.nominatorUserId,
      wtfosIdentityId: identity.identityId,
      type: "app.wtfos.index.ref",
      record: echoRecord as unknown as Record<string, unknown>,
      rkeyParts: echoRkeyParts(echoFact),
      targetType: "user_wtfos_repo",
      targetDid: identity.repoDid,
      targetHandle: identity.handle,
      targetPdsUrl: identity.pdsUrl,
      sourceEventType: "crp.nomination.user_echo",
      sourceRefType: "crp_nomination",
      sourceRefId: nominationBody.nominationId,
    });
    userEchoUri = buildAtUri(identity.repoDid, "app.wtfos.index.ref", echoRkey);
  }

  if (!anonymous) {
    await echoRecordToMaster({
      userId: input.nominatorUserId,
      fact: {
        factRepo: crpRepo.did,
        factCollection: CRP_NOMINATION_COLLECTION,
        factRkey: nominationRkeyValue,
        refKind: "crp_nomination",
        subdomain: "liveops",
        summary: {
          nominationId: nominationBody.nominationId,
          nominatorUserId: nominationBody.nominatorUserId,
          bskyPostUri,
        },
      },
      sourceRefType: "crp_nomination",
      sourceRefId: nominationBody.nominationId,
    }).catch(() => undefined);
  } else {
    await echoRecordToMaster({
      userId: input.nominatorUserId,
      fact: {
        factRepo: crpRepo.did,
        factCollection: CRP_NOMINATION_COLLECTION,
        factRkey: nominationRkeyValue,
        refKind: "crp_nomination",
        subdomain: "liveops",
        summary: {
          nominationId: nominationBody.nominationId,
          anonymous: true,
          bskyPostUri,
        },
      },
      sourceRefType: "crp_nomination",
      sourceRefId: nominationBody.nominationId,
    }).catch(() => undefined);
  }

  if (anonymous) {
    await recordAnonymousNominationCredit(input.nominatorUserId);
    await ingestSystemEvent({
      eventType: "crp.nomination.submitted.anonymous",
      userId: input.nominatorUserId,
      source: "crp-nominations",
      sourceModule: "crp-nominations",
      rawRefType: "crp_nomination_anonymous",
      rawRefId: String(input.nominatorUserId),
      metadata: {
        anonymous: true,
        spineEnabled: isSpineEnabled(),
        outboxStatus: nominationRow?.status ?? null,
        repoDid: crpRepo.did,
      },
    });
  } else {
    await ingestSystemEvent({
      eventType: "crp.nomination.submitted",
      userId: input.nominatorUserId,
      source: "crp-nominations",
      sourceModule: "crp-nominations",
      rawRefType: "crp_nomination",
      rawRefId: nominationBody.nominationId,
      metadata: {
        categoryId: nominationBody.categoryId,
        nomineeAddress: nominationBody.nominee.tezosAddress,
        nominationUri,
        bskyPostUri,
        bskyPostUrl,
        userEchoUri,
        spineEnabled: isSpineEnabled(),
        outboxStatus: nominationRow?.status ?? null,
        repoDid: crpRepo.did,
      },
    });
  }

  return {
    nomination: { $type: CRP_NOMINATION_COLLECTION, ...nominationBody },
    nominationUri,
    bskyPostUri,
    bskyPostUrl,
    userEchoUri,
    anonymous,
    outboxStatus: nominationRow?.status ?? null,
    repoDid: crpRepo.did,
    repoHandle: crpRepo.handle,
  };
}

export function crpRepoStatus() {
  const config = getCrpNominationsRepoConfig();
  return {
    configured: Boolean(config?.configured),
    did: config?.did ?? null,
    handle: config?.handle ?? null,
    pdsUrl: config?.pdsUrl ?? null,
    bskyCollection: CRP_BSKY_POST_COLLECTION_ID,
    nominationCollection: CRP_NOMINATION_COLLECTION,
  };
}

export async function listCrpNominationsForUser(userId: number, limit = 50) {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  try {
    const rows = await db
      .select()
      .from(wtfosAppviewRecords)
      .where(
        or(
          eq(wtfosAppviewRecords.collection, CRP_NOMINATION_COLLECTION),
          eq(wtfosAppviewRecords.collection, CRP_BSKY_POST_COLLECTION_ID)
        )
      )
      .orderBy(desc(wtfosAppviewRecords.id))
      .limit(safeLimit * 8);

    const nominations = rows
      .filter((row) => row.collection === CRP_NOMINATION_COLLECTION)
      .map((row) => ({
        uri: row.uri,
        cid: row.cid,
        indexedAt: row.indexedAt,
        value: row.json as CrpNomination,
        bskyPostUri: (row.json as CrpNomination).shareRefs?.bskyPostUri ?? null,
        bskyPostUrl: (row.json as CrpNomination).shareRefs?.bskyPostUrl ?? null,
      }))
      .filter((row) => !row.value?.anonymous && row.value?.nominatorUserId === userId)
      .slice(0, safeLimit);

    return nominations;
  } catch (err) {
    if ((err as { code?: string })?.code === "42P01") return [];
    throw err;
  }
}

export async function getCrpNominationByUri(uri: string, userId: number) {
  try {
    const [row] = await db
      .select()
      .from(wtfosAppviewRecords)
      .where(
        and(
          eq(wtfosAppviewRecords.uri, uri),
          eq(wtfosAppviewRecords.collection, CRP_NOMINATION_COLLECTION)
        )
      )
      .limit(1);
    if (!row) return null;
    const value = row.json as CrpNomination;
    if (value.anonymous || value.nominatorUserId !== userId) return null;
    return {
      uri: row.uri,
      cid: row.cid,
      indexedAt: row.indexedAt,
      value,
      bskyPostUri: value.shareRefs?.bskyPostUri ?? null,
      bskyPostUrl: value.shareRefs?.bskyPostUrl ?? null,
    };
  } catch (err) {
    if ((err as { code?: string })?.code === "42P01") return null;
    throw err;
  }
}
