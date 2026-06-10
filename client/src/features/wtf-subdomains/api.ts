import type {
  HackTezConfig,
  WtfDomainChatConfig,
  WtfDomainsCommitPlan,
  WtfDomainsRegistrationPlan,
  WtfDomainsRegistrarStatus,
  WtfDomainsWalletStatus,
  WtfSubdomainGrantDto,
} from "@shared/wtf-subdomains";
import type { WtfUserSiteStateDto as UserSiteState } from "@shared/wtf-user-sites";
import { api } from "../../lib/api";

export type PrepareRegistrarPayload = {
  label: string;
  targetAddress: string;
};

export function fetchMyWtfSubdomainGrants() {
  return api.get<WtfSubdomainGrantDto[]>("/api/wtf-subdomains/my");
}

export function fetchWtfDomainsRegistrarStatus() {
  return api.get<WtfDomainsRegistrarStatus>(
    "/api/wtf-subdomains/registrar/config"
  );
}

export function prepareWtfDomainRegistration(payload: PrepareRegistrarPayload) {
  return api.post<WtfDomainsRegistrationPlan>(
    "/api/wtf-subdomains/registrar/prepare",
    payload
  );
}

export function commitWtfDomainRegistration(payload: PrepareRegistrarPayload) {
  return api.post<WtfDomainsCommitPlan>(
    "/api/wtf-subdomains/registrar/commit",
    payload
  );
}

export function fetchWalletRegistrarStatus(address: string) {
  return api.get<WtfDomainsWalletStatus>(
    `/api/wtf-subdomains/registrar/status/${encodeURIComponent(address)}`
  );
}

export function fetchHackTezConfig() {
  return api.get<HackTezConfig>("/api/wtf-subdomains/hack-tez/config");
}

export function fetchWtfDomainChatConfig() {
  return api.get<WtfDomainChatConfig>("/api/wtf-subdomains/chat/config");
}

export type MediaLibraryPickerItem = {
  id: number;
  title: string;
  mimeType: string;
  playbackUrl?: string | null;
  sourceUrl?: string | null;
  posterUrl?: string | null;
  fileSizeBytes?: number | null;
  fileSize?: number | null;
};

export function fetchMyWtfUserSite() {
  return api.get<UserSiteState>("/api/wtf-sites/my");
}

export function claimWtfUserSite() {
  return api.post<UserSiteState>("/api/wtf-sites/claim");
}

export function saveWtfUserSitePage(payload: {
  slug: string;
  title: string;
  html: string;
}) {
  return api.put<UserSiteState>(
    `/api/wtf-sites/pages/${encodeURIComponent(payload.slug)}`,
    payload
  );
}

export function createWtfUserSitePage(payload: {
  slug: string;
  title: string;
  html: string;
}) {
  return api.post<UserSiteState>("/api/wtf-sites/pages", payload);
}

export function deleteWtfUserSitePage(slug: string) {
  return api.delete<UserSiteState>(
    `/api/wtf-sites/pages/${encodeURIComponent(slug)}`
  );
}

export function updateWtfUserSiteAssets(mediaIds: number[]) {
  return api.put<UserSiteState>("/api/wtf-sites/assets", { mediaIds });
}

export function publishWtfUserSite() {
  return api.post<UserSiteState>("/api/wtf-sites/publish");
}

export function rollbackWtfUserSite(versionId: number) {
  return api.post<UserSiteState>("/api/wtf-sites/rollback", { versionId });
}

export function fetchMyMediaLibraryForSite() {
  return api.get<MediaLibraryPickerItem[]>("/api/media/mine");
}
