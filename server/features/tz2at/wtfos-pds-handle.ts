import { validateUserSiteLabel } from "../wtf-sites/policy";

export type WtfosPdsHandleSuggestion = {
  handle: string | null;
  source: "wtfos_username" | "canonical_atproto_handle" | "none";
  invalidUsernameReason: string | null;
};

function fallbackHandleFromAtprotoHandle(handle: string | null | undefined, handleDomain: string): string | null {
  const label = String(handle || "")
    .split(".")[0]
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (!label) return null;
  return `${label}.${handleDomain}`;
}

export function suggestWtfosPdsHandle(input: {
  username?: string | null;
  canonicalHandle?: string | null;
  handleDomain: string;
}): WtfosPdsHandleSuggestion {
  const domain = input.handleDomain.replace(/^@/, "").replace(/\/.*$/, "").toLowerCase();
  const userSiteLabel = validateUserSiteLabel(input.username, domain);
  if (userSiteLabel.ok) {
    return {
      handle: userSiteLabel.host,
      source: "wtfos_username",
      invalidUsernameReason: null,
    };
  }

  const fallback = fallbackHandleFromAtprotoHandle(input.canonicalHandle, domain);
  return {
    handle: fallback,
    source: fallback ? "canonical_atproto_handle" : "none",
    invalidUsernameReason: userSiteLabel.reason,
  };
}
