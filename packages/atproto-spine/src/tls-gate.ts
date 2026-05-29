import type { IncomingMessage, ServerResponse } from "node:http";

export interface TlsGateOptions {
  /** Network handle base, e.g. "wtfos.me". */
  networkDomain: string;
  /** Exact hostnames always allowed (infra: pds.wtfos.me, relay.wtfos.me, ...). */
  infraHosts: string[];
  /** Handle labels that can never belong to a user (also denied as on-demand hosts). */
  reservedHandles: string[];
  /** True when `<label>.<networkDomain>` is a registered user handle. */
  isHandleRegistered: (handle: string) => boolean | Promise<boolean>;
}

export interface TlsDecision {
  allowed: boolean;
  reason?: string;
}

/**
 * Decide whether Caddy should issue an on-demand TLS cert for a hostname. Mirrors TZAT's
 * /internal/tls/allow gate (which checked the noun registry) but generalized: infra hosts
 * are allowed, reserved labels are denied, and any other `<label>.<networkDomain>` is
 * allowed only when it is a registered handle. This prevents cert-issuance abuse on the
 * wildcard `*.<networkDomain>` host block.
 */
export async function evaluateTlsRequest(domain: string, options: TlsGateOptions): Promise<TlsDecision> {
  const host = (domain || "").trim().toLowerCase();
  if (!host) {
    return { allowed: false, reason: "domain required" };
  }
  if (options.infraHosts.map((h) => h.toLowerCase()).includes(host)) {
    return { allowed: true };
  }

  const base = options.networkDomain.toLowerCase();
  const suffix = `.${base}`;
  if (!host.endsWith(suffix)) {
    return { allowed: false, reason: "host outside network domain" };
  }

  const label = host.slice(0, -suffix.length);
  if (label.length === 0 || label.includes(".")) {
    // apex or multi-label subdomain that is not an explicit infra host
    return { allowed: false, reason: "not a single-label handle" };
  }
  if (options.reservedHandles.map((r) => r.toLowerCase()).includes(label)) {
    return { allowed: false, reason: "reserved label" };
  }

  const registered = await options.isHandleRegistered(host);
  return registered ? { allowed: true } : { allowed: false, reason: "handle not registered" };
}

/**
 * Build a Node HTTP handler for Caddy's `on_demand_tls { ask … }` endpoint. Returns 200 on
 * allow and 403 on deny (Caddy treats any non-2xx as deny).
 */
export function createTlsAllowHandler(options: TlsGateOptions) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? "", "http://localhost");
    const domain = url.searchParams.get("domain") ?? "";
    const decision = await evaluateTlsRequest(domain, options);
    res.statusCode = decision.allowed ? 200 : 403;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: decision.allowed, reason: decision.reason }));
  };
}
