/**
 * Calls the self-hosted mail provisioner on the wtfOS .me box (private network).
 */

export interface RemoteMailboxResult {
  address: string;
  password: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
}

export interface RemoteMailboxConfig {
  baseUrl: string;
  secret: string;
}

export function getRemoteMailboxConfig(env: NodeJS.ProcessEnv = process.env): RemoteMailboxConfig | null {
  const baseUrl = (env.MAIL_PROVISION_URL || "").trim().replace(/\/$/, "");
  const secret = (env.MAIL_PROVISION_SECRET || "").trim();
  if (!baseUrl || !secret) return null;
  return { baseUrl, secret };
}

export async function provisionRemoteMailbox(
  localPart: string,
  config: RemoteMailboxConfig = getRemoteMailboxConfig()!,
): Promise<RemoteMailboxResult> {
  const res = await fetch(`${config.baseUrl}/v1/mailboxes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ localPart }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = typeof body.error === "string" ? body.error : `mail_provision_http_${res.status}`;
    throw new Error(err);
  }
  if (typeof body.address !== "string" || typeof body.password !== "string") {
    throw new Error("mail_provision_invalid_response");
  }
  return {
    address: body.address,
    password: body.password,
    imapHost: String(body.imap_host || body.imapHost || "mail.wtfos.me"),
    imapPort: Number(body.imap_port || body.imapPort || 993),
    smtpHost: String(body.smtp_host || body.smtpHost || "mail.wtfos.me"),
    smtpPort: Number(body.smtp_port || body.smtpPort || 587),
  };
}
