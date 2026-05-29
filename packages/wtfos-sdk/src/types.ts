/** Public shapes returned by the wtfOS AppView read API. Self-contained (no repo imports). */

export interface AppviewRecord<T = Record<string, unknown>> {
  uri: string;
  cid: string | null;
  did: string;
  collection: string;
  rkey: string;
  domain: string;
  value: T;
  indexedAt: string;
}

export interface ListRecordsResponse<T = Record<string, unknown>> {
  records: AppviewRecord<T>[];
  cursor?: string;
}

export interface ListRecordsFilters {
  collection?: string;
  did?: string;
  domain?: string;
  source?: string;
  limit?: number;
  cursor?: string;
}
