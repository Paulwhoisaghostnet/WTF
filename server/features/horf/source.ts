import { objkt } from "../../lib/upstream";
import {
  approvedHorseTags,
  HORF_CANDIDATE_REGEX,
  type ObjktTag,
  type ObjktTransferEvent,
} from "./model";

// Objkt documents a maximum of 500 results, but a live July 2023 event query
// with nested token tags failed at 500 and succeeded at 100 in 2.8 seconds.
// Use the measured metadata-safe page size; IDs still provide complete scans.
export const OBJKT_PAGE_SIZE = 100;

export const HORF_TAG_QUERY = `query HorfTags($after: bigint!, $candidate: String!, $limit: Int!) {
  tag(
    where: {
      id: { _gt: $after }
      name: { _iregex: $candidate }
      token_count: { _gt: 5 }
    }
    order_by: { id: asc }
    limit: $limit
  ) {
    id
    name
    token_count
  }
}`;

function eventQuery(closedWindow: boolean): string {
  return `query HorfTransfers($after: bigint!, $since: timestamptz!, ${closedWindow ? "$until: timestamptz!, " : ""}$candidate: String!, $limit: Int!) {
  event(
    where: {
      id: { _gt: $after }
      timestamp: { _gte: $since${closedWindow ? ", _lt: $until" : ""} }
      event_type: { _eq: "transfer" }
      reverted: { _eq: false }
      marketplace_event_type: { _is_null: true }
      marketplace_contract: { _is_null: true }
      token: {
        tags: { tag: { name: { _iregex: $candidate } } }
      }
    }
    order_by: { id: asc }
    limit: $limit
  ) {
    id
    ophash
    event_type
    marketplace_event_type
    marketplace_contract
    reverted
    timestamp
    creator_address
    recipient_address
    amount
    token {
      fa_contract
      token_id
      name
      description
      thumbnail_uri
      display_uri
      decimals
      tags { tag { name token_count } }
    }
  }
}`;
}

export const HORF_EVENT_QUERY = eventQuery(false);
export const HORF_CLOSED_EVENT_QUERY = eventQuery(true);

// An older token can acquire a newly qualifying mint tag after its transfer
// was passed by the event ID cursor. Detect the metadata update and replay.
export const HORF_METADATA_UPDATE_QUERY = `query HorfMetadataUpdates($since: timestamptz!, $candidate: String!) {
  token(
    where: {
      last_metadata_update: { _gt: $since }
      timestamp: { _lte: $since }
      tags: { tag: { name: { _iregex: $candidate } } }
    }
    limit: 1
  ) { pk }
}`;

interface GraphqlEnvelope<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

async function query<T>(queryText: string, variables: Record<string, unknown>): Promise<T> {
  const response = await objkt.postJson<GraphqlEnvelope<T>>("", {
    query: queryText,
    variables,
  });
  if (response.errors?.length || !response.data) {
    throw new Error(`Objkt GraphQL: ${response.errors?.map((error) => error.message || "unknown error").join("; ") || "missing data"}`);
  }
  return response.data;
}

export async function discoverApprovedHorseTags(): Promise<string[]> {
  let cursor = 0;
  const matches: ObjktTag[] = [];
  while (true) {
    const result = await query<{ tag: Array<ObjktTag & { id?: number }> }>(HORF_TAG_QUERY, {
      after: cursor,
      candidate: HORF_CANDIDATE_REGEX,
      limit: OBJKT_PAGE_SIZE,
    });
    if (!Array.isArray(result.tag)) throw new Error("Objkt tag page was not an array");
    for (const tag of result.tag) {
      const id = Number(tag.id);
      if (!Number.isSafeInteger(id) || id <= cursor) throw new Error("Objkt tag cursor did not advance");
      cursor = id;
      matches.push(tag);
    }
    if (result.tag.length < OBJKT_PAGE_SIZE) return approvedHorseTags(matches);
  }
}

export async function fetchHorfEventPage(after: number, since: string, until: string | null): Promise<ObjktTransferEvent[]> {
  const result = await query<{ event: ObjktTransferEvent[] }>(
    until ? HORF_CLOSED_EVENT_QUERY : HORF_EVENT_QUERY,
    buildHorfEventVariables(after, since, until),
  );
  if (!Array.isArray(result.event)) throw new Error("Objkt event page was not an array");
  let previous = after;
  for (const event of result.event) {
    const id = Number(event.id);
    if (!Number.isSafeInteger(id) || id <= previous) {
      throw new Error("Objkt transfer cursor did not advance");
    }
    previous = id;
  }
  return result.event;
}

export async function hasCandidateMetadataUpdate(since: string): Promise<boolean> {
  const result = await query<{ token: Array<{ pk?: number }> }>(HORF_METADATA_UPDATE_QUERY, {
    since,
    candidate: HORF_CANDIDATE_REGEX,
  });
  if (!Array.isArray(result.token)) throw new Error("Objkt metadata update page was not an array");
  return result.token.length > 0;
}

export function buildHorfEventVariables(after: number, since: string, until: string | null = null) {
  return {
    after,
    since,
    ...(until ? { until } : {}),
    candidate: HORF_CANDIDATE_REGEX,
    limit: OBJKT_PAGE_SIZE,
  };
}

export function isLastHorfEventPage(page: ObjktTransferEvent[]): boolean {
  return page.length < OBJKT_PAGE_SIZE;
}
