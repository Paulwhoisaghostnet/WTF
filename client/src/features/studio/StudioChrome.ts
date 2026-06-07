import { Button, Panel } from "react95";
import styled from "styled-components";
import { MOBILE } from "../../global-styles";

export const Shell = styled.div`
  display: grid;
  grid-template-columns: 260px 1fr 320px;
  gap: 8px;
  height: 100%;
  min-height: 0;

  ${MOBILE} {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto;
    min-height: 0;
  }
`;

export const Column = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  min-width: 0;
`;

export const PanelBody = styled(Panel).attrs({ variant: "well" })`
  flex: 1;
  min-height: 0;
  padding: 6px;
  overflow: auto;
  font-size: var(--wtf-type-body, 14px);
`;

export const ToolBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 4px;
  background: var(--wtf-control-bg, #e9eaec);
  border: 1px solid var(--wtf-app-border, #8b929a);
`;

export const ToolButton = styled(Button)<{ $active?: boolean }>`
  min-width: 32px;
  min-height: var(--wtf-control-height, 32px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  font-size: var(--wtf-type-caption, 13px) !important;
  ${(p) => p.$active && `font-weight: bold; background: var(--wtf-app-warning-bg, #fff4bf) !important;`}
`;

export const ProjectHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 8px;
  background: var(--wtf-active-title, #000080);
  color: var(--wtf-active-title-text, #fff);
  font-size: var(--wtf-type-caption, 13px);
  font-weight: bold;
`;

export const Breadcrumbs = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-active-title-text, #fff);
`;

export const HeaderMeta = styled.div`
  display: flex;
  gap: 6px;
  font-size: var(--wtf-type-caption, 13px);
  font-weight: normal;
  color: var(--wtf-active-title-text, #fff);
`;

export const TreeNode = styled.div<{ $depth?: number; $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px 2px ${(p) => (p.$depth ?? 0) * 12 + 4}px;
  font-size: var(--wtf-type-caption, 13px);
  min-height: 32px;
  cursor: pointer;
  background: ${(p) => (p.$active ? "var(--wtf-app-link, #000080)" : "transparent")};
  color: ${(p) => (p.$active ? "#fff" : "var(--wtf-app-text, #111)")};

  &:hover {
    background: ${(p) => (p.$active ? "var(--wtf-app-link, #000080)" : "var(--wtf-control-bg, #e4e4e4)")};
  }
`;

export const FileThumb = styled.div`
  width: 18px;
  height: 18px;
  background: #1a1a1a;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--wtf-type-caption, 13px);
  color: #fff;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 2px;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

export const PreviewStage = styled.div`
  flex: 1;
  min-height: 0;
  position: relative;
  background: var(--wtf-app-bg, #f3f4f6);
  border: 1px solid var(--wtf-app-border, #8b929a);
  overflow: hidden;
`;

export const PreviewFrame = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const PreviewMedia = styled.div`
  position: relative;
  max-width: 100%;
  max-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;

  img,
  video {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    display: block;
  }

  iframe,
  audio {
    max-width: 100%;
    max-height: 100%;
    background: #fff;
    border: none;
    display: block;
  }
`;

export const AnnotationOverlay = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: auto;
  cursor: crosshair;
  touch-action: none;
`;

export const PinMarker = styled.button<{ $resolved?: boolean; $selected?: boolean }>`
  position: absolute;
  transform: translate(-50%, -100%);
  background: ${(p) =>
    p.$resolved ? "#6a6a6a" : p.$selected ? "#1fbb38" : "#ff3366"};
  color: #fff;
  border: 2px solid #000;
  border-radius: 50% 50% 50% 0;
  width: 32px;
  height: 32px;
  font-weight: bold;
  cursor: pointer;
  font-size: var(--wtf-type-caption, 13px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  line-height: 0;
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.3);

  &:hover {
    transform: translate(-50%, -104%) scale(1.05);
  }

  &::after {
    content: "";
    position: absolute;
    bottom: -6px;
    left: 50%;
    transform: translateX(-50%) rotate(45deg);
    width: 8px;
    height: 8px;
    background: inherit;
    border: inherit;
    border-top: none;
    border-left: none;
  }
`;

export const RectMarker = styled.div<{ $resolved?: boolean; $selected?: boolean }>`
  position: absolute;
  border: 2px solid
    ${(p) => (p.$resolved ? "#6a6a6a" : p.$selected ? "#1fbb38" : "#ff3366")};
  background: ${(p) =>
    p.$resolved
      ? "rgba(106, 106, 106, 0.12)"
      : "rgba(255, 51, 102, 0.12)"};
  pointer-events: auto;
  cursor: pointer;
`;

export const CursorGhost = styled.div`
  position: absolute;
  width: 10px;
  height: 10px;
  border: 2px solid #fff;
  background: #e91e63;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 0 1px #000;
  pointer-events: none;
  transition: transform 80ms linear;
`;

export const CursorLabel = styled.span`
  position: absolute;
  top: 10px;
  left: 10px;
  background: #000;
  color: #fff;
  font-size: var(--wtf-type-caption, 13px);
  padding: 2px 6px;
  white-space: nowrap;
  border-radius: 2px;
`;

export const PendingRect = styled.div`
  position: absolute;
  border: 2px dashed #0066ff;
  background: rgba(0, 102, 255, 0.1);
  pointer-events: none;
`;

export const AnnotationPopover = styled.div<{ $x: number; $y: number }>`
  position: absolute;
  left: ${(p) => p.$x}px;
  top: ${(p) => p.$y}px;
  transform: translate(8px, 12px);
  background: #fff;
  border: 2px solid #000;
  padding: 6px;
  width: 240px;
  box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.5);
  z-index: 10;

  textarea {
    width: 100%;
    min-height: 60px;
    font-family: inherit;
    font-size: var(--wtf-type-body, 14px);
    padding: 4px;
    box-sizing: border-box;
    resize: vertical;
  }
`;

export const ChatMessageRow = styled.div<{ $system?: boolean }>`
  margin-bottom: 6px;
  padding: 4px 6px;
  background: ${(p) => (p.$system ? "#e9eef7" : "transparent")};
  border: 1px solid ${(p) => (p.$system ? "var(--wtf-app-link, #000080)" : "transparent")};
  font-size: var(--wtf-type-caption, 13px);
`;

export const ChatMeta = styled.div`
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted, #4b5563);
  display: flex;
  justify-content: space-between;
  gap: 6px;
`;

export const ChatBody = styled.div`
  word-break: break-word;
  white-space: pre-wrap;
`;

export const PresenceChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: var(--wtf-type-caption, 13px);
  background: #c3f0c3;
  padding: 1px 6px;
  border: 1px solid #1a6a1a;
`;

export const ErrorBanner = styled.div`
  background: #ffe2e2;
  border: 1px solid #c06060;
  padding: 6px 8px;
  font-size: var(--wtf-type-caption, 13px);
  color: #800;
  margin-bottom: 4px;
`;

export const InvitePicker = styled.div`
  position: relative;
  margin-top: 6px;
`;

export const InviteInputRow = styled.div`
  display: flex;
  gap: 4px;
`;

export const InviteSelectedChip = styled.div`
  margin-top: 4px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px;
  background: #d4f0d4;
  border: 1px solid #1a6a1a;
  font-size: var(--wtf-type-caption, 13px);
`;

export const InviteChipClear = styled.button`
  border: 1px solid #1a6a1a;
  background: #fff;
  cursor: pointer;
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1;
  padding: 0 5px;
  min-width: 32px;
  min-height: 32px;
`;

export const InviteDropdown = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 20;
  background: #fff;
  border: 1px solid #6b6b6b;
  box-shadow: 2px 2px 0 #888;
  max-height: 220px;
  overflow-y: auto;
  margin-top: 1px;
`;

export const InviteItem = styled.div<{ $active?: boolean }>`
  padding: 4px 6px;
  font-size: var(--wtf-type-caption, 13px);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  background: ${(p) => (p.$active ? "#000080" : "transparent")};
  color: ${(p) => (p.$active ? "#fff" : "#000")};
`;

export const InviteItemPrimary = styled.span`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

export const InviteItemHandle = styled.span`
  font-size: var(--wtf-type-caption, 13px);
  opacity: 0.85;
`;

export const InviteItemRole = styled.span`
  font-size: var(--wtf-type-caption, 13px);
  opacity: 0.85;
  text-transform: capitalize;
  white-space: nowrap;
`;

export const InviteEmpty = styled.div`
  padding: 6px 8px;
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted, #4b5563);
  font-style: italic;
`;
