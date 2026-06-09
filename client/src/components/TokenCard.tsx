import { useState, useCallback } from "react";
import { Button } from "react95";
import styled from "styled-components";
import type { ConsoleTokenProvenance } from "@shared/console-provenance";
import {
  resolveTokenThumbnail,
  resolveTokenArtifact,
  getTokenMimeType,
  isPlayableMime,
  isAudioMime,
  teiaUrl,
  objktUrl,
  tzktTokenUrl,
  shortAddr,
  cacheProxyUrl,
  advanceResolvedMediaFallback,
} from "../lib/media-resolve";
import {
  formatProvenancePrice,
  provenanceCreatorLabel,
  provenanceSupportLinks,
  provenanceXLabel,
  readEmbeddedProvenance,
} from "../lib/provenance";

/* ─── Types ──────────────────────────────────────────── */

export interface TokenCardData {
  id: number;
  contract: string;
  tokenId: string;
  name?: string;
  thumbnail?: string;
  metadata?: Record<string, any>;
  balance?: string;
  mimeType?: string;
  walletAddress?: string;
  creatorName?: string;
  creatorAddress?: string;
  collectionName?: string;
  provenance?: ConsoleTokenProvenance | null;
  onTradeBoard?: boolean;
  tradeBoardQuantity?: number;
}

export interface TokenCardAction {
  label: string;
  icon?: string;
  onClick: (token: TokenCardData) => void;
  disabled?: boolean;
  hidden?: boolean;
}

interface TokenCardProps {
  token: TokenCardData;
  actions?: TokenCardAction[];
  onClick?: (token: TokenCardData) => void;
  selected?: boolean;
  size?: "sm" | "md" | "lg";
}

/* ─── Card Styled Components ─────────────────────────── */

const Card = styled.div<{ $selected?: boolean }>`
  background: var(--wtf-app-surface, #c0c0c0);
  border: 2px outset var(--wtf-app-border, #dfdfdf);
  display: flex;
  flex-direction: column;
  cursor: pointer;
  position: relative;
  box-shadow: ${(p) =>
    p.$selected
      ? "0 0 0 2px var(--wtf-app-primary, #000080)"
      : "1px 1px 0 rgba(0, 0, 0, 0.45)"};
  overflow: hidden;
  color: var(--wtf-app-text, #111);
  min-width: 0;
  &:hover .card-hover-overlay { opacity: 1; }
`;

const ArtArea = styled.div`
  width: 100%;
  aspect-ratio: 1;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
  img, video { width: 100%; height: 100%; object-fit: contain; }
  audio { width: calc(100% - 16px); }
`;

const HoverOverlay = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  opacity: 0;
  transition: opacity 0.15s ease;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 8px;
  color: #ffffff;
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.4;
  pointer-events: none;
`;

const OverlayName = styled.div`
  font-weight: bold;
  font-size: var(--wtf-type-body, 15px);
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const OverlayMeta = styled.div`
  color: #f1f5f9;
  font-family: var(--wtf-mono-font);
  font-size: var(--wtf-type-caption, 13px);
  overflow-wrap: anywhere;
`;

const MimeBadge = styled.span`
  display: inline-block;
  font-size: var(--wtf-type-caption, 13px);
  padding: 2px 6px;
  background: #333;
  color: #88ff88;
  border-radius: 2px;
  margin-top: 2px;
`;

const ProvenanceBadge = styled.span`
  display: inline-block;
  font-size: var(--wtf-type-caption, 13px);
  padding: 2px 6px;
  background: #1f2a56;
  color: #ffe08a;
  border-radius: 2px;
  margin-top: 2px;
`;

const Placeholder = styled.div`
  color: #555;
  font-size: 24px;
  user-select: none;
`;

const AudioCue = styled.div`
  position: absolute;
  left: 8px;
  bottom: 8px;
  right: 8px;
  padding: 4px 6px;
  background: rgba(0, 0, 0, 0.68);
  color: #e8f7ff;
  border: 1px solid rgba(255, 255, 255, 0.32);
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
  text-align: center;
  pointer-events: none;
`;

const ActionBar = styled.div`
  display: flex;
  gap: 4px;
  padding: 6px;
  flex-wrap: wrap;
  border-top: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #c0c0c0);
`;

const ActionButton = styled(Button)`
  min-height: var(--wtf-control-min-height, 34px);
  min-width: var(--wtf-control-min-height, 34px);
  padding: 3px 8px;
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.2;
`;

/* ─── Detail Modal Styled Components ─────────────────── */

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
`;

const ModalWindow = styled.div`
  background: #c0c0c0;
  border: 2px outset #dfdfdf;
  box-shadow: 2px 2px 0 #000;
  max-width: 560px;
  width: 100%;
  max-height: 88vh;
  overflow-y: auto;
`;

const ModalTitleBar = styled.div`
  background: linear-gradient(90deg, #000080, #1084d0);
  color: #fff;
  font-weight: bold;
  font-size: var(--wtf-type-caption, 13px);
  padding: 4px 8px;
  display: flex;
  align-items: center;
  gap: 6px;
`;

const ModalBody = styled.div`
  padding: 12px;
`;

const MediaPreview = styled.div`
  width: 100%;
  max-height: 400px;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px inset #808080;
  margin-bottom: 10px;
  overflow: hidden;
  img, video { max-width: 100%; max-height: 400px; object-fit: contain; }
  audio { width: calc(100% - 24px); }
`;

const DetailRow = styled.div`
  display: flex;
  gap: 6px;
  font-size: var(--wtf-type-caption, 13px);
  margin-bottom: 4px;
  strong { min-width: 80px; color: var(--wtf-app-muted-text, #444); flex-shrink: 0; }
  span { overflow-wrap: anywhere; }
`;

const LinkRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #808080;
`;

const ExternalLinkButton = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 4px 10px;
  border: 2px outset #dfdfdf;
  background: var(--wtf-app-control-bg, #c0c0c0);
  color: var(--wtf-app-text, #000);
  font-family: var(--wtf-ui-font);
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
  line-height: 1;
  text-decoration: none;
  white-space: nowrap;

  &:hover {
    color: #000;
    text-decoration: none;
  }

  &:active {
    border-style: inset;
  }
`;

const ModalActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid #808080;
`;

const BoardBadge = styled.span`
  display: inline-block;
  font-size: var(--wtf-type-caption, 13px);
  padding: 2px 6px;
  background: var(--wtf-app-success, #008000);
  color: #fff;
  border-radius: 2px;
`;

/* ─── TokenCard Component ────────────────────────────── */

export function TokenCard({ token, actions, onClick, selected, size = "md" }: TokenCardProps) {
  const resolved = resolveTokenThumbnail(token);
  const mime = token.mimeType || getTokenMimeType(token.metadata);
  const audio = isAudioMime(mime);
  const displayName = token.name || `Token #${token.tokenId}`;
  const provenance = readEmbeddedProvenance(token);
  const creatorDisplay =
    provenance?.tezosIdentity ||
    token.creatorName ||
    (token.creatorAddress ? shortAddr(token.creatorAddress) : "");
  const collectionDisplay = token.collectionName || "";

  const handleImgError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget;
    if (advanceResolvedMediaFallback(el, resolved)) return;
    el.style.display = "none";
  }, [resolved]);

  const visibleActions = (actions || []).filter((a) => !a.hidden);

  return (
    <Card $selected={selected} onClick={() => onClick?.(token)}>
      <ArtArea>
        {resolved ? (
          <img
            src={resolved.src}
            alt={displayName}
            loading="lazy"
            onError={handleImgError}
          />
        ) : (
          <Placeholder>{audio ? "AUDIO" : "?"}</Placeholder>
        )}
        {audio && <AudioCue>Audio artifact</AudioCue>}
        <HoverOverlay className="card-hover-overlay">
          <OverlayName>{displayName}</OverlayName>
          {creatorDisplay && <OverlayMeta>{creatorDisplay}</OverlayMeta>}
          {collectionDisplay && <OverlayMeta>{collectionDisplay}</OverlayMeta>}
          <OverlayMeta>{shortAddr(token.contract)} · #{token.tokenId}</OverlayMeta>
          {token.balance && <OverlayMeta>Owned: {token.balance}</OverlayMeta>}
          {mime && <MimeBadge>{mime}</MimeBadge>}
          {provenance && <ProvenanceBadge>Provenance</ProvenanceBadge>}
        </HoverOverlay>
      </ArtArea>

      {visibleActions.length > 0 && (
        <ActionBar onClick={(e) => e.stopPropagation()}>
          {visibleActions.map((action) => (
            <ActionButton
              key={action.label}
              size="sm"
              disabled={action.disabled}
              onClick={() => action.onClick(token)}
            >
              {action.icon ? `${action.icon} ` : ""}{action.label}
            </ActionButton>
          ))}
        </ActionBar>
      )}
    </Card>
  );
}

/* ─── TokenDetailModal Component ─────────────────────── */

interface TokenDetailModalProps {
  token: TokenCardData;
  onClose: () => void;
  actions?: TokenCardAction[];
}

export function TokenDetailModal({ token, onClose, actions }: TokenDetailModalProps) {
  const meta = token.metadata || {};
  const description = meta.description || meta.Description || "";
  const tags = Array.isArray(meta.tags) ? meta.tags : [];
  const creators = Array.isArray(meta.creators) ? meta.creators : [];
  const mime = token.mimeType || getTokenMimeType(meta);
  const playable = isPlayableMime(mime);
  const audio = isAudioMime(mime);
  const displayName = token.name || `Token #${token.tokenId}`;
  const provenance = readEmbeddedProvenance(token);
  const provenanceLinks = provenanceSupportLinks(provenance);
  const tokenObjktUrl = objktUrl(token.contract, token.tokenId);
  const hasProvenanceObjktLink = provenanceLinks.some((link) => link.url === tokenObjktUrl);
  const firstCreator = creators.length > 0 ? String(creators[0]) : "";
  const firstCreatorIsAddress = /^(tz1|tz2|tz3|KT1)[A-Za-z0-9]{30,40}$/.test(firstCreator);
  const displayCreatorList = creators.map((creator: unknown) => {
    const value = String(creator);
    return /^(tz1|tz2|tz3|KT1)[A-Za-z0-9]{30,40}$/.test(value)
      ? shortAddr(value)
      : value;
  });
  const pickText = (value: unknown) =>
    typeof value === "string" ? value.trim() : "";
  const collectionName =
    pickText(token.collectionName) ||
    pickText(meta.collectionName) ||
    pickText(meta.collection?.name) ||
    pickText(meta.contract?.name) ||
    "";
  const creatorName =
    pickText(token.creatorName) ||
    pickText(meta.creator) ||
    pickText(meta.artist) ||
    (firstCreator && !firstCreatorIsAddress ? firstCreator : "");

  const resolved = resolveTokenThumbnail(token, { preferVideo: playable });
  const videoResolved = playable
    ? resolveTokenThumbnail(token, { preferVideo: true })
    : null;
  const audioResolved = audio ? resolveTokenArtifact(token) : null;

  const [mediaError, setMediaError] = useState(false);

  const visibleActions = (actions || []).filter((a) => !a.hidden);

  const mediaSrc = audioResolved?.src || videoResolved?.src || resolved?.src;
  const mediaFallback = audioResolved?.fallbackSrc || videoResolved?.fallbackSrc || resolved?.fallbackSrc;

  return (
    <ModalOverlay onClick={onClose}>
      <ModalWindow onClick={(e: any) => e.stopPropagation()}>
        <ModalTitleBar>
          <span>{audio ? "♪" : playable ? "🎬" : "🖼️"}</span>
          Properties: {displayName}
        </ModalTitleBar>
        <ModalBody>
          <MediaPreview>
            {audio && mediaSrc ? (
              <div style={{ width: "100%", display: "grid", gap: 10, placeItems: "center" }}>
                {resolved ? (
                  <img
                    src={resolved.src}
                    alt={displayName}
                    style={{ maxHeight: 260 }}
                    onError={(e) => {
                      const el = e.currentTarget;
                      if (advanceResolvedMediaFallback(el, resolved)) return;
                      el.style.display = "none";
                    }}
                  />
                ) : null}
                <audio
                  src={mediaError && mediaFallback ? mediaFallback : mediaSrc}
                  controls
                  onError={() => {
                    if (mediaFallback && !mediaError) {
                      setMediaError(true);
                    }
                  }}
                />
              </div>
            ) : playable && mediaSrc && !mediaError ? (
              <video
                src={mediaSrc}
                controls
                autoPlay
                muted
                playsInline
                style={{ maxWidth: "100%", maxHeight: 400 }}
                onError={() => {
                  if (mediaFallback && !mediaError) {
                    setMediaError(true);
                  }
                }}
              />
            ) : resolved ? (
              <img
                src={mediaError && mediaFallback ? mediaFallback : (resolved.src)}
                alt={displayName}
                onError={(e) => {
                  const el = e.currentTarget;
                  if (advanceResolvedMediaFallback(el, resolved)) return;
                  el.style.display = "none";
                }}
              />
            ) : (
              <span style={{ fontSize: 32, color: "#808080" }}>?</span>
            )}
          </MediaPreview>

          <DetailRow>
            <strong>Name:</strong>
            <span style={{ fontWeight: "bold" }}>{displayName}</span>
          </DetailRow>
          <DetailRow>
            <strong>Contract:</strong>
            <span style={{ fontFamily: "var(--wtf-mono-font, monospace)", fontSize: "var(--wtf-type-caption, 13px)" }}>{token.contract}</span>
          </DetailRow>
          <DetailRow>
            <strong>Token ID:</strong> <span>{token.tokenId}</span>
          </DetailRow>
          {token.balance && (
            <DetailRow>
              <strong>Balance:</strong> <span>{token.balance}</span>
            </DetailRow>
          )}
          {mime && (
            <DetailRow>
              <strong>Media:</strong> <span>{mime}</span>
            </DetailRow>
          )}
          {(creatorName || token.creatorAddress) && (
            <DetailRow>
              <strong>Creator:</strong>
              <span style={{ fontSize: "var(--wtf-type-caption, 13px)" }} title={token.creatorAddress || undefined}>
                {creatorName || (token.creatorAddress ? shortAddr(token.creatorAddress) : "")}
                {creatorName && token.creatorAddress ? (
                  <span style={{ fontFamily: "var(--wtf-mono-font, monospace)" }}>
                    {" "}
                    ({shortAddr(token.creatorAddress)})
                  </span>
                ) : null}
              </span>
            </DetailRow>
          )}
          {provenance && (
            <DetailRow>
              <strong>Provenance:</strong>
              <span style={{ fontSize: "var(--wtf-type-caption, 13px)" }}>
                Made by {provenanceCreatorLabel(provenance)}
                {provenanceXLabel(provenance)
                  ? ` / ${provenanceXLabel(provenance)}`
                  : ""}
              </span>
            </DetailRow>
          )}
          {creators.length > 0 && !token.creatorAddress && !creatorName && (
            <DetailRow>
              <strong>Creator(s):</strong>
              <span style={{ fontFamily: "var(--wtf-mono-font, monospace)", fontSize: "var(--wtf-type-caption, 13px)" }}>
                {displayCreatorList.join(", ")}
              </span>
            </DetailRow>
          )}
          {collectionName && (
            <DetailRow>
              <strong>Collection:</strong>
              <span>{String(collectionName)}</span>
            </DetailRow>
          )}
          {token.walletAddress && (
            <DetailRow>
              <strong>Wallet:</strong>
              <span
                style={{ fontFamily: "var(--wtf-mono-font, monospace)", fontSize: "var(--wtf-type-caption, 13px)" }}
                title={token.walletAddress}
              >
                {shortAddr(token.walletAddress)}
              </span>
            </DetailRow>
          )}
          {token.onTradeBoard && (
            <DetailRow>
              <strong>Board:</strong>
              <BoardBadge>
                {token.tradeBoardQuantity}/{token.balance} on board
              </BoardBadge>
            </DetailRow>
          )}
          {description && (
            <DetailRow>
              <strong>Description:</strong>
              <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {String(description).slice(0, 500)}
              </span>
            </DetailRow>
          )}
          {tags.length > 0 && (
            <DetailRow>
              <strong>Tags:</strong> <span>{tags.join(", ")}</span>
            </DetailRow>
          )}

          <LinkRow>
            {provenanceLinks.map((link) => {
              const price = formatProvenancePrice(link);
              return (
                <ExternalLinkButton
                  key={`${link.kind}-${link.url}-${link.listingId || link.label}`}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {price ? `${link.label} · ${price}` : link.label}
                </ExternalLinkButton>
              );
            })}
            {!hasProvenanceObjktLink && (
              <ExternalLinkButton href={tokenObjktUrl} target="_blank" rel="noopener noreferrer">
                View on objkt
              </ExternalLinkButton>
            )}
            <ExternalLinkButton href={teiaUrl(token.contract, token.tokenId)} target="_blank" rel="noopener noreferrer">
              View on Teia
            </ExternalLinkButton>
            <ExternalLinkButton href={tzktTokenUrl(token.contract, token.tokenId)} target="_blank" rel="noopener noreferrer">
              View on TzKT
            </ExternalLinkButton>
          </LinkRow>

          {visibleActions.length > 0 && (
            <ModalActions>
              {visibleActions.map((action) => (
                <ActionButton
                  key={action.label}
                  size="sm"
                  disabled={action.disabled}
                  onClick={() => action.onClick(token)}
                >
                  {action.icon ? `${action.icon} ` : ""}{action.label}
                </ActionButton>
              ))}
            </ModalActions>
          )}

          <div style={{ marginTop: 12, textAlign: "right" }}>
            <Button onClick={onClose}>Close</Button>
          </div>
        </ModalBody>
      </ModalWindow>
    </ModalOverlay>
  );
}

/* ─── TokenGrid Layout ───────────────────────────────── */

export const TokenGrid = styled.div<{ $size?: "sm" | "md" | "lg" }>`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(${(p) =>
    p.$size === "sm" ? "140px" : p.$size === "lg" ? "280px" : "200px"
  }, 1fr));
  gap: 8px;
`;
