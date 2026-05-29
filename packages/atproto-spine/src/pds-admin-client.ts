/**
 * PDS admin/provisioning XRPC client. Generalized verbatim from TZAT's
 * provisioning/pds-admin-client.ts (it was already app-agnostic). Talks raw XRPC so it
 * works against the official Bluesky PDS image without an SDK session.
 */

export interface PdsCreateAccountInput {
  handle: string;
  password: string;
  email: string;
  inviteCode?: string;
}

export interface PdsCreateAccountResult {
  did: string;
  handle: string;
  accessJwt?: string;
  refreshJwt?: string;
}

export interface PdsResolveHandleResult {
  did: string;
}

export interface PdsDescribeServerResult {
  availableUserDomains?: string[];
  inviteCodeRequired?: boolean;
  links?: Record<string, unknown>;
  contact?: Record<string, unknown>;
}

export class PdsAdminClient {
  constructor(
    private readonly service: string,
    private readonly adminPassword?: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async createAccount(input: PdsCreateAccountInput): Promise<PdsCreateAccountResult> {
    const response = await this.fetchImpl(new URL("/xrpc/com.atproto.server.createAccount", this.service), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        handle: input.handle,
        email: input.email,
        password: input.password,
        ...(input.inviteCode ? { inviteCode: input.inviteCode } : {}),
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as Partial<PdsCreateAccountResult> & {
      error?: string;
      message?: string;
    };
    if (!response.ok) {
      throw new Error(`PDS createAccount failed for ${input.handle}: ${payload.message ?? payload.error ?? response.statusText}`);
    }
    if (!payload.did) {
      throw new Error(`PDS createAccount did not return a DID for ${input.handle}`);
    }

    return {
      did: payload.did,
      handle: payload.handle ?? input.handle,
      accessJwt: payload.accessJwt,
      refreshJwt: payload.refreshJwt,
    };
  }

  async resolveHandle(handle: string): Promise<PdsResolveHandleResult | null> {
    const url = new URL("/xrpc/com.atproto.identity.resolveHandle", this.service);
    url.searchParams.set("handle", handle);
    const response = await this.fetchImpl(url, { method: "GET" });
    const payload = (await response.json().catch(() => ({}))) as Partial<PdsResolveHandleResult> & {
      error?: string;
      message?: string;
    };
    if (response.status === 400 || response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`PDS resolveHandle failed for ${handle}: ${payload.message ?? payload.error ?? response.statusText}`);
    }
    if (!payload.did) {
      throw new Error(`PDS resolveHandle did not return a DID for ${handle}`);
    }
    return { did: payload.did };
  }

  async updateAccountPassword(input: { did: string; password: string }): Promise<void> {
    if (!this.adminPassword) {
      throw new Error(`PDS admin password is required to update password for ${input.did}`);
    }
    const response = await this.fetchImpl(new URL("/xrpc/com.atproto.admin.updateAccountPassword", this.service), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: adminAuthHeader(this.adminPassword),
      },
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!response.ok) {
      throw new Error(`PDS updateAccountPassword failed for ${input.did}: ${payload.message ?? payload.error ?? response.statusText}`);
    }
  }

  async describeServer(): Promise<PdsDescribeServerResult> {
    const response = await this.fetchImpl(new URL("/xrpc/com.atproto.server.describeServer", this.service), {
      method: "GET",
      headers: {
        ...(this.adminPassword ? { authorization: adminAuthHeader(this.adminPassword) } : {}),
      },
    });
    const payload = (await response.json().catch(() => ({}))) as PdsDescribeServerResult & {
      error?: string;
      message?: string;
    };
    if (!response.ok) {
      throw new Error(`PDS describeServer failed for ${this.service}: ${payload.message ?? payload.error ?? response.statusText}`);
    }
    return payload;
  }
}

function adminAuthHeader(adminPassword: string): string {
  return `Basic ${Buffer.from(`admin:${adminPassword}`).toString("base64")}`;
}
