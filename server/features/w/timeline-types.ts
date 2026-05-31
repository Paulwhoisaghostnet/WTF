import type { WTimelineAuthorAccount } from "../../lib/timeline-db";

export type LinkPreview = {
  finalUrl: string;
  canonicalUrl: string;
  domain: string;
  siteName: string | null;
  title: string;
  description: string | null;
  imageUrl: string | null;
  isObjkt: boolean;
};

export type TimelinePayload = {
  source:
    | "x-api-v2"
    | "links-only"
    | "db-cache"
    | "filtered-stream-cache"
    | "scraper-cache"
    | "w-digest-scraper";
  refreshedAt: string;
  canReplyInline: boolean;
  accounts: WTimelineAuthorAccount[];
  timeline: Array<{
    id: string;
    text: string;
    displayText: string;
    createdAt: string;
    url: string;
    media: Array<{
      type: string;
      url: string | null;
      previewUrl: string | null;
      videoUrl: string | null;
      width: number | null;
      height: number | null;
      altText: string | null;
    }>;
    links: Array<{
      url: string;
      expandedUrl: string | null;
      displayUrl: string | null;
      preview: LinkPreview | null;
    }>;
    author: {
      userId: number;
      username: string;
      displayName: string | null;
      twitterHandle: string;
      name: string | null;
      avatarUrl: string | null;
      tezosIdentities?: Array<{
        twitterHandle: string;
        tezosAddress: string;
        alias: string | null;
        tzDomain: string | null;
        source: string;
        confidence: string;
      }>;
    };
    metrics: {
      likes: number;
      replies: number;
      reposts: number;
      quotes: number;
    };
  }>;
  diagnostics?: {
    message?: string;
    skippedAccounts?: number;
    cachedAt?: string;
    fromCache?: boolean;
  };
};
