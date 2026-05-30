export type MailRolloutMode = "staff_alpha" | "all_users" | "disabled";

export type MailConfig = {
  provider: "resend";
  domain: string;
  fromDomain: string;
  inboundEnabled: boolean;
  outboundEnabled: boolean;
  rolloutMode: MailRolloutMode;
  resendApiKey: string | null;
  resendWebhookSecretConfigured: boolean;
};

function truthy(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function rolloutMode(raw: string | undefined): MailRolloutMode {
  if (raw === "all_users" || raw === "disabled" || raw === "staff_alpha") {
    return raw;
  }
  return "staff_alpha";
}

export function isMailProvisioningEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return truthy(env.MAIL_PROVISIONING_ENABLED ?? env.MAIL_ENABLED);
}

export function getMailConfig(env: NodeJS.ProcessEnv = process.env): MailConfig {
  const domain = (env.MAIL_DOMAIN || "wtfos.me").trim().toLowerCase();
  return {
    provider: "resend",
    domain,
    fromDomain: (env.MAIL_FROM_DOMAIN || domain).trim().toLowerCase(),
    inboundEnabled: truthy(env.MAIL_INBOUND_ENABLED),
    outboundEnabled: truthy(env.MAIL_OUTBOUND_ENABLED),
    rolloutMode: rolloutMode(env.MAIL_ROLLOUT_MODE),
    resendApiKey: env.RESEND_API_KEY?.trim() || null,
    resendWebhookSecretConfigured: Boolean(env.RESEND_WEBHOOK_SECRET?.trim()),
  };
}

/** Legacy staff-alpha helper — prefer evaluateUserMailGate + provisionUserMailbox. */
export function userEligibleForMail(user: {
  role?: string | null;
}): boolean {
  const config = getMailConfig();
  if (config.rolloutMode === "disabled") return false;
  if (config.rolloutMode === "all_users") return true;
  return ["admin", "host", "cohost", "resident_wizard"].includes(
    String(user.role || "")
  );
}
