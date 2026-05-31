import { enqueueWtfosPrimaryActivityEvent } from "../../tz2at/wtfos-outbox";

const W_DIGEST_SYSTEM_USER_ID = Math.max(1, Number(process.env.W_DIGEST_ATPROTO_USER_ID || 1));

export async function enqueueDigestPostAtprotoRecord(input: {
  postUrl: string;
  tweetId: string;
  handle: string;
  postedAt?: Date | null;
}) {
  return enqueueWtfosPrimaryActivityEvent({
    userId: W_DIGEST_SYSTEM_USER_ID,
    eventType: "w.digest.post.scraped",
    source: "w-digest-scraper",
    sourceModule: "w",
    sourceRefType: "x_post",
    sourceRefId: input.tweetId,
    sourceRecordUri: input.postUrl,
    subject: {
      uri: input.postUrl,
      twitterHandle: input.handle,
      tweetId: input.tweetId,
      chain: "tezos",
    },
    metadata: {
      postUrl: input.postUrl,
      handle: input.handle,
    },
    occurredAt: input.postedAt ?? new Date(),
  });
}
