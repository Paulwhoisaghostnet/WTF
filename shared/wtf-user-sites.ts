export const WTF_USER_SITE_PARENT_DOMAIN = "wtfos.me";
export const WTF_USER_SITE_MAX_NAMED_PAGES = 5;
export const WTF_USER_SITE_MAX_TOTAL_PAGES = WTF_USER_SITE_MAX_NAMED_PAGES + 1;
export const WTF_USER_SITE_MAX_ASSET_BYTES = 100 * 1024 * 1024;
export const WTF_USER_SITE_HOME_SLUG = "home";

export type WtfUserSiteStatus = "draft" | "published" | "suspended";
export type WtfUserSiteDidSource = "wtf" | "bsky";

export interface WtfUserSiteEligibilityDto {
  canClaim: boolean;
  label: string | null;
  host: string | null;
  reasons: string[];
  hasWallet: boolean;
  hasOAuthSocial: boolean;
  hasLinkedBluesky: boolean;
  hasActiveWtfDid: boolean;
  canIssueWtfDid: boolean;
  didTarget: {
    did: string;
    source: WtfUserSiteDidSource;
    handle: string | null;
    pdsUrl: string | null;
    atprotoAccountId?: number | null;
    wtfosIdentityId?: number | null;
  } | null;
}

export interface WtfUserSitePageDto {
  id: number;
  slug: string;
  title: string;
  draftHtml: string;
  sortOrder: number;
  updatedAt: string;
}

export interface WtfUserSiteVersionDto {
  id: number;
  versionNumber: number;
  digest: string;
  did: string;
  didSource: WtfUserSiteDidSource;
  pageSlugs: string[];
  assetMediaIds: number[];
  publishedAt: string;
  publishedBy: number | null;
}

export interface WtfUserSiteMediaDto {
  id: number;
  title: string;
  mimeType: string;
  url: string;
  fileSizeBytes: number;
}

export interface WtfUserSiteDto {
  id: number;
  label: string;
  host: string;
  url: string;
  status: WtfUserSiteStatus;
  activeDid: string | null;
  activeDidSource: WtfUserSiteDidSource | null;
  proofGraceUntil: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
  publishedAt: string | null;
  pages: WtfUserSitePageDto[];
  versions: WtfUserSiteVersionDto[];
  assets: WtfUserSiteMediaDto[];
  assetBytes: number;
  maxAssetBytes: number;
  maxNamedPages: number;
}

export interface WtfUserSiteStateDto {
  eligibility: WtfUserSiteEligibilityDto;
  site: WtfUserSiteDto | null;
}
