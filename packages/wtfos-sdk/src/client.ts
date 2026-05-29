import type {
  AppviewRecord,
  ListRecordsFilters,
  ListRecordsResponse,
} from "./types";

export interface WtfosClientOptions {
  /** Base URL of the wtfOS AppView, e.g. https://api.wtfos.app or https://wtfos.app. */
  baseUrl: string;
  /** Injectable fetch (defaults to global fetch). */
  fetchImpl?: typeof fetch;
  /** Optional bearer token for authenticated reads. */
  token?: string;
}

export class WtfosError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "WtfosError";
  }
}

/**
 * Minimal typed client for the wtfOS AppView read API (S3.3). Read-only; mirrors the REST
 * endpoints exposed by createAppViewRouter(). Domain-agnostic generics let callers type the
 * record `value` with their own lexicon types.
 */
export class WtfosClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly token?: string;

  constructor(options: WtfosClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.token = options.token;
  }

  private async get<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && `${value}` !== "") {
        url.searchParams.set(key, String(value));
      }
    }
    const res = await this.fetchImpl(url, {
      headers: {
        accept: "application/json",
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
    });
    if (!res.ok) {
      throw new WtfosError(`wtfOS AppView request failed: ${res.status}`, res.status);
    }
    return (await res.json()) as T;
  }

  /** List records from the AppView read model, filtered + paginated. */
  async listRecords<T = Record<string, unknown>>(
    filters: ListRecordsFilters = {},
  ): Promise<ListRecordsResponse<T>> {
    return this.get<ListRecordsResponse<T>>("/api/atproto/appview/records", {
      collection: filters.collection,
      did: filters.did,
      domain: filters.domain,
      source: filters.source,
      limit: filters.limit,
      cursor: filters.cursor,
    });
  }

  /** Fetch a single record by at:// URI. Returns null on 404. */
  async getRecord<T = Record<string, unknown>>(uri: string): Promise<AppviewRecord<T> | null> {
    try {
      return await this.get<AppviewRecord<T>>("/api/atproto/appview/record", { uri });
    } catch (err) {
      if (err instanceof WtfosError && err.status === 404) return null;
      throw err;
    }
  }

  /** Convenience: async-iterate all records matching filters, following cursors. */
  async *iterateRecords<T = Record<string, unknown>>(
    filters: ListRecordsFilters = {},
  ): AsyncGenerator<AppviewRecord<T>> {
    let cursor = filters.cursor;
    do {
      const page = await this.listRecords<T>({ ...filters, cursor });
      for (const record of page.records) yield record;
      cursor = page.cursor;
    } while (cursor);
  }
}
