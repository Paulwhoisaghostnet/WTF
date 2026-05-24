import { getMailConfig } from "./config";

export type ResendSendInput = {
  from: string;
  to: string[];
  subject: string;
  text?: string | null;
  html?: string | null;
};

export type ResendSendResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string };

export async function sendWithResend(
  input: ResendSendInput
): Promise<ResendSendResult> {
  const config = getMailConfig();
  if (!config.outboundEnabled) {
    return { ok: false, error: "mail_outbound_disabled" };
  }
  if (!config.resendApiKey) {
    return { ok: false, error: "resend_api_key_missing" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: input.from,
      to: input.to,
      subject: input.subject,
      text: input.text || undefined,
      html: input.html || undefined,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      error:
        typeof payload?.message === "string"
          ? payload.message
          : `resend_http_${response.status}`,
    };
  }
  return {
    ok: true,
    providerMessageId:
      typeof payload?.id === "string" && payload.id.trim() ? payload.id : null,
  };
}
