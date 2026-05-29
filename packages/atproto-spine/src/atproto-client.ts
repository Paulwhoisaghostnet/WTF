import { AtpAgent } from "@atproto/api";
import type { AtprotoRecordWrite } from "./types";

export interface AtprotoClientOptions {
  /** Base PDS service URL. */
  service: string;
  /** App-password identifier (the repo owner). */
  identifier?: string;
  /** App password. */
  password?: string;
  /** Explicit repo DID to write into (defaults to the logged-in session DID). */
  repoDid?: string;
}

/**
 * Thin authenticated write client for a single PDS repo. Generalized from TZAT's
 * publisher/atproto-client.ts. `validate:false` is intentional: records are validated
 * against our own Zod schemas before publish (see the kernel spine service), and the
 * PDS does not host our lexicons.
 */
export class AtprotoClient {
  readonly agent: AtpAgent;
  private did?: string;
  private loginPromise?: Promise<string>;

  constructor(private readonly options: AtprotoClientOptions) {
    this.agent = new AtpAgent({ service: options.service });
    this.did = options.repoDid;
  }

  async login(): Promise<string> {
    if (this.agent.session) {
      return this.did ?? this.agent.session.did;
    }
    if (this.loginPromise) {
      return this.loginPromise;
    }
    if (!this.options.identifier || !this.options.password) {
      throw new Error("AtprotoClient requires identifier + password to write records");
    }
    this.loginPromise = this.agent
      .login({ identifier: this.options.identifier, password: this.options.password })
      .then((session) => {
        this.did = this.options.repoDid ?? session.data.did;
        return this.did!;
      })
      .finally(() => {
        this.loginPromise = undefined;
      });
    return this.loginPromise;
  }

  async createRecord(write: AtprotoRecordWrite) {
    const repo = await this.login();
    return this.agent.com.atproto.repo.createRecord({
      repo,
      collection: write.collection,
      rkey: write.rkey,
      record: write.record,
      validate: false,
    });
  }

  async putRecord(write: AtprotoRecordWrite) {
    const repo = await this.login();
    return this.agent.com.atproto.repo.putRecord({
      repo,
      collection: write.collection,
      rkey: write.rkey,
      record: write.record,
      validate: false,
    });
  }

  /** Batched create via applyWrites (single signed commit). */
  async applyWrites(writes: AtprotoRecordWrite[]) {
    const repo = await this.login();
    return this.agent.com.atproto.repo.applyWrites({
      repo,
      validate: false,
      writes: writes.map((write) => ({
        $type: "com.atproto.repo.applyWrites#create",
        collection: write.collection,
        rkey: write.rkey,
        value: write.record,
      })),
    });
  }
}
