import { ExternalLink, Film, Globe2, Image as ImageIcon, Sparkles } from "lucide-react";
import styled from "styled-components";
import type { CachedPreview, WLink } from "../types";

type PreviewMediaKind = "image" | "video" | "link";

export type WRichPreviewItem = {
  key: string;
  href: string;
  title: string;
  description: string | null;
  domain: string;
  siteName: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  isObjkt: boolean;
  mediaKind: PreviewMediaKind;
  displayUrl: string;
};

type WRichPreviewListProps = {
  compact?: boolean;
  links: WLink[];
  nightMode: boolean;
};

type PreviewLike = CachedPreview & {
  canonicalUrl?: string;
};

const DIRECT_IMAGE_RE = /\.(avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i;
const DIRECT_VIDEO_RE = /\.(m4v|mov|mp4|webm)(?:[?#].*)?$/i;

const PreviewList = styled.div<{ $compact: boolean }>`
  display: grid;
  gap: ${({ $compact }) => ($compact ? "8px" : "10px")};
  margin: ${({ $compact }) => ($compact ? "6px 0 0" : "10px 0")};
`;

const PreviewCard = styled.a<{
  $compact: boolean;
  $hasMedia: boolean;
  $night: boolean;
  $objkt: boolean;
}>`
  display: grid;
  grid-template-columns: ${({ $compact, $hasMedia }) =>
    $compact && $hasMedia ? "96px minmax(0, 1fr)" : "minmax(0, 1fr)"};
  overflow: hidden;
  text-decoration: none;
  color: ${({ $night }) => ($night ? "#f3f7ff" : "#111820")};
  border: 1px solid
    ${({ $night, $objkt }) =>
      $objkt ? ($night ? "#d79b4c" : "#a96c1d") : $night ? "#384c63" : "#cfd7df"};
  border-radius: 8px;
  background: ${({ $night, $objkt }) =>
    $objkt
      ? $night
        ? "linear-gradient(180deg, #201816 0%, #13100f 100%)"
        : "linear-gradient(180deg, #fff6e9 0%, #fffaf2 100%)"
      : $night
        ? "linear-gradient(180deg, #151a21 0%, #10141a 100%)"
        : "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)"};
  box-shadow: ${({ $night }) =>
    $night ? "0 10px 26px rgba(0, 0, 0, 0.22)" : "0 12px 26px rgba(20, 30, 40, 0.08)"};

  &:hover {
    transform: translateY(-1px);
    border-color: ${({ $night, $objkt }) =>
      $objkt ? ($night ? "#ffc46f" : "#8c5614") : $night ? "#6682a2" : "#aebbc8"};
  }

  @media (max-width: 560px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const MediaStage = styled.div<{ $compact: boolean; $night: boolean }>`
  position: relative;
  min-height: ${({ $compact }) => ($compact ? "96px" : "210px")};
  max-height: ${({ $compact }) => ($compact ? "140px" : "440px")};
  background: ${({ $night }) => ($night ? "#03060a" : "#e9eef3")};
  overflow: hidden;

  @media (max-width: 560px) {
    min-height: 180px;
  }
`;

const PreviewImage = styled.img<{ $compact: boolean }>`
  display: block;
  width: 100%;
  height: 100%;
  max-height: ${({ $compact }) => ($compact ? "140px" : "440px")};
  object-fit: cover;
`;

const PreviewVideo = styled.video<{ $compact: boolean }>`
  display: block;
  width: 100%;
  height: 100%;
  max-height: ${({ $compact }) => ($compact ? "140px" : "440px")};
  object-fit: contain;
  background: #000;
`;

const PreviewBody = styled.div<{ $compact: boolean }>`
  min-width: 0;
  display: grid;
  align-content: center;
  gap: ${({ $compact }) => ($compact ? "5px" : "7px")};
  padding: ${({ $compact }) => ($compact ? "9px 10px" : "12px 14px")};
`;

const DomainRow = styled.div<{ $night: boolean }>`
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  color: ${({ $night }) => ($night ? "#9fb1c8" : "#65717d")};
  text-transform: uppercase;
`;

const DomainText = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const PreviewTitle = styled.div<{ $compact: boolean }>`
  font-size: ${({ $compact }) => ($compact ? "13px" : "15px")};
  font-weight: 800;
  line-height: 1.24;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: ${({ $compact }) => ($compact ? 2 : 3)};
  line-clamp: ${({ $compact }) => ($compact ? 2 : 3)};
  -webkit-box-orient: vertical;
`;

const PreviewDescription = styled.div<{ $compact: boolean; $night: boolean }>`
  font-size: ${({ $compact }) => ($compact ? "11px" : "12px")};
  line-height: 1.38;
  color: ${({ $night }) => ($night ? "#c0cada" : "#4f5b66")};
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: ${({ $compact }) => ($compact ? 2 : 3)};
  line-clamp: ${({ $compact }) => ($compact ? 2 : 3)};
  -webkit-box-orient: vertical;
`;

const OpenHint = styled.span<{ $night: boolean }>`
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  color: ${({ $night }) => ($night ? "#b8c9dd" : "#6b7885")};
`;

function cleanDisplayUrl(value: string): string {
  return value.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/g, "");
}

function parseDomain(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return cleanDisplayUrl(href).split("/")[0] || "link";
  }
}

function directMediaKind(href: string): PreviewMediaKind {
  if (DIRECT_VIDEO_RE.test(href)) return "video";
  if (DIRECT_IMAGE_RE.test(href)) return "image";
  return "link";
}

function fallbackTitle(href: string, displayUrl: string): string {
  const domain = parseDomain(href);
  try {
    const parsed = new URL(href);
    const last = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
    return last ? last.replace(/[-_]+/g, " ") : domain;
  } catch {
    return cleanDisplayUrl(displayUrl || href);
  }
}

export function isMediaLink(link: WLink): boolean {
  const value = `${link.expandedUrl || ""} ${link.displayUrl || ""} ${link.url || ""}`.toLowerCase();
  return (
    value.includes("pic.x.com/") ||
    value.includes("pic.twitter.com/") ||
    value.includes("/photo/") ||
    value.includes("/video/")
  );
}

export function displayLinkText(link: WLink): string {
  return (link.displayUrl || link.expandedUrl || link.url || "").trim();
}

export function linkHref(link: WLink): string {
  return link.preview?.canonicalUrl || link.expandedUrl || link.url;
}

export function previewItemFromLink(link: WLink, key: string): WRichPreviewItem | null {
  const href = linkHref(link);
  if (!href) return null;

  const preview = link.preview as PreviewLike | null;
  const displayUrl = displayLinkText(link) || href;
  const domain = preview?.domain || parseDomain(href);
  const mediaKind = directMediaKind(href);
  const imageUrl = preview?.imageUrl || (mediaKind === "image" ? href : null);
  const videoUrl = mediaKind === "video" ? href : null;
  const title = preview?.title || fallbackTitle(href, displayUrl);

  return {
    key,
    href: preview?.canonicalUrl || preview?.finalUrl || href,
    title,
    description: preview?.description || null,
    domain,
    siteName: preview?.siteName || null,
    imageUrl,
    videoUrl,
    isObjkt: Boolean(preview?.isObjkt || domain === "objkt.com" || domain.endsWith(".objkt.com")),
    mediaKind,
    displayUrl,
  };
}

export function buildPreviewItems(links: WLink[], prefix: string): WRichPreviewItem[] {
  return links
    .map((link, index) => previewItemFromLink(link, `${prefix}-preview-${index}`))
    .filter((item): item is WRichPreviewItem => Boolean(item));
}

function previewIcon(item: WRichPreviewItem) {
  if (item.isObjkt) return <Sparkles size={14} aria-hidden="true" />;
  if (item.mediaKind === "video") return <Film size={14} aria-hidden="true" />;
  if (item.mediaKind === "image") return <ImageIcon size={14} aria-hidden="true" />;
  return <Globe2 size={14} aria-hidden="true" />;
}

export function WRichPreviewCard({
  compact = false,
  item,
  nightMode,
}: {
  compact?: boolean;
  item: WRichPreviewItem;
  nightMode: boolean;
}) {
  const hasMedia = Boolean(item.imageUrl || item.videoUrl);
  const label = item.siteName || item.domain || "Link";
  return (
    <PreviewCard
      $compact={compact}
      $hasMedia={hasMedia}
      $night={nightMode}
      $objkt={item.isObjkt}
      href={item.href}
      target="_blank"
      rel="noopener noreferrer"
      title={item.href}
    >
      {hasMedia ? (
        <MediaStage $compact={compact} $night={nightMode}>
          {item.videoUrl ? (
            <PreviewVideo $compact={compact} src={item.videoUrl} controls playsInline />
          ) : (
            <PreviewImage $compact={compact} src={item.imageUrl || ""} alt={item.title} loading="lazy" />
          )}
        </MediaStage>
      ) : null}
      <PreviewBody $compact={compact}>
        <DomainRow $night={nightMode}>
          {previewIcon(item)}
          <DomainText>{label}</DomainText>
          <OpenHint $night={nightMode}>
            <ExternalLink size={13} aria-hidden="true" />
          </OpenHint>
        </DomainRow>
        <PreviewTitle $compact={compact}>{item.title}</PreviewTitle>
        {item.description ? (
          <PreviewDescription $compact={compact} $night={nightMode}>
            {item.description}
          </PreviewDescription>
        ) : !hasMedia ? (
          <PreviewDescription $compact={compact} $night={nightMode}>
            {cleanDisplayUrl(item.displayUrl || item.href)}
          </PreviewDescription>
        ) : null}
      </PreviewBody>
    </PreviewCard>
  );
}

export function WRichPreviewList({ compact = false, links, nightMode }: WRichPreviewListProps) {
  const items = buildPreviewItems(links, "link");
  if (items.length === 0) return null;
  return (
    <PreviewList $compact={compact}>
      {items.map((item) => (
        <WRichPreviewCard compact={compact} item={item} key={item.key} nightMode={nightMode} />
      ))}
    </PreviewList>
  );
}
