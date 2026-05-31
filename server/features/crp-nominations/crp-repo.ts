import { getSpineConfig } from "../atproto-spine/config";
import { WTFOS_PDS_PUBLIC_URL } from "@shared/platform-branding";

export const CRP_BSKY_POST_COLLECTION = "app.bsky.feed.post" as const;

export type CrpNominationsRepoConfig = {
  did: string;
  pdsUrl: string;
  identifier: string;
  password: string;
  handle: string;
  configured: boolean;
};

function trimSlash(value: string): string {
  return value.replace(/\/$/, "");
}

/** Dedicated CRP nominations repo (canonical facts + Bluesky-compatible share posts). */
export function getCrpNominationsRepoConfig(
  env: NodeJS.ProcessEnv = process.env
): CrpNominationsRepoConfig | null {
  const did = String(env.CRP_NOMINATIONS_REPO_DID || env.WTFOS_CRP_NOMINATIONS_REPO_DID || "").trim();
  if (!did) return null;

  const spine = getSpineConfig(env);
  const pdsUrl = trimSlash(
    env.CRP_NOMINATIONS_REPO_PDS_URL ||
      env.WTFOS_CRP_NOMINATIONS_REPO_PDS_URL ||
      spine.master.url ||
      WTFOS_PDS_PUBLIC_URL
  );
  const identifier = String(
    env.CRP_NOMINATIONS_REPO_IDENTIFIER ||
      env.WTFOS_CRP_NOMINATIONS_REPO_IDENTIFIER ||
      env.CRP_NOMINATIONS_REPO_HANDLE ||
      ""
  ).trim();
  const password = String(
    env.CRP_NOMINATIONS_REPO_PASSWORD || env.WTFOS_CRP_NOMINATIONS_REPO_PASSWORD || ""
  ).trim();
  const handle = String(
    env.CRP_NOMINATIONS_REPO_HANDLE ||
      env.WTFOS_CRP_NOMINATIONS_REPO_HANDLE ||
      identifier
  ).trim();

  return {
    did,
    pdsUrl,
    identifier,
    password,
    handle,
    configured: Boolean(did && pdsUrl && identifier && password),
  };
}

export function requireCrpNominationsRepoConfig(
  env: NodeJS.ProcessEnv = process.env
): CrpNominationsRepoConfig {
  const config = getCrpNominationsRepoConfig(env);
  if (!config?.configured) {
    throw new Error("crp_nominations_repo_not_configured");
  }
  return config;
}
