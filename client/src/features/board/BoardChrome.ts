import type { ButtonHTMLAttributes } from "react";
import { Button, Panel } from "react95";
import styled from "styled-components";

const gammaBoardScope = `[data-board-presentation-host="gamma"]`;

export const BoardSurface = styled.div`
  height: 100%;
  min-height: 0;

  &[data-board-presentation-host="gamma"] {
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
`;

export const Shell = styled.div`
  display: flex;
  height: 100%;
  min-height: 500px;

  ${gammaBoardScope} & {
    background: #070706;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    overflow: hidden;
  }

  @media (max-width: 768px) {
    min-height: 0;
  }
`;

export const Sidebar = styled.div<{ $mobileHidden?: boolean }>`
  width: 240px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: #c3c7cb;
  border-right: 2px solid #888c8f;

  ${gammaBoardScope} & {
    background: #11110f;
    border-right: 1px solid rgba(242, 234, 217, 0.18);
    color: #f2ead9;
  }

  @media (max-width: 768px) {
    width: 100%;
    border-right: none;
    display: ${(p) => (p.$mobileHidden ? "none" : "flex")};
  }
`;

export const SideHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  background: linear-gradient(90deg, #000080, #1084d0);
  color: #fff;
  font-weight: bold;
  font-size: var(--wtf-type-caption, 13px);

  ${gammaBoardScope} & {
    background: #070706;
    background-image: none;
    border-bottom: 1px solid rgba(242, 234, 217, 0.18);
    color: #00d2ff;
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-weight: 800;
    text-transform: uppercase;
  }
`;

export const SideScroll = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 2px 0;
`;

export const CatHeader = styled.div<{ $collapsed?: boolean }>`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px 3px;
  font-size: var(--wtf-type-caption, 13px);
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0;
  color: var(--wtf-app-muted, #374151);
  cursor: pointer;
  user-select: none;

  ${gammaBoardScope} & {
    color: rgba(242, 234, 217, 0.68);
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
  }

  &:hover {
    color: #000;
  }

  ${gammaBoardScope} &:hover {
    color: #00d2ff;
  }

  &::before {
    content: "${(p) => (p.$collapsed ? "▸" : "▾")}";
    font-size: var(--wtf-type-caption, 13px);
    width: 10px;
  }
`;

export const ChanItem = styled.div<{ $active?: boolean; $locked?: boolean }>`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px 3px 20px;
  font-size: var(--wtf-type-caption, 13px);
  min-height: 32px;
  cursor: pointer;
  background: ${(p) => (p.$active ? "#000080" : "transparent")};
  color: ${(p) =>
    p.$active ? "#fff" : p.$locked ? "#888" : "#000"};

  ${gammaBoardScope} & {
    background: ${(p) => (p.$active ? "rgba(0, 210, 255, 0.12)" : "transparent")};
    color: ${(p) => (p.$locked ? "rgba(242, 234, 217, 0.45)" : "#f2ead9")};
    border-left: 2px solid ${(p) => (p.$active ? "#00d2ff" : "transparent")};
  }

  &:hover {
    background: ${(p) => (p.$active ? "#000080" : "#dfdfdf")};
  }

  ${gammaBoardScope} &:hover {
    background: rgba(242, 234, 217, 0.08);
    color: #00d2ff;
  }
`;

export const ChanIcon = styled.span`
  font-size: 13px;
  width: 18px;
  text-align: center;
  flex-shrink: 0;
`;

export const ChanName = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
`;

export const ChanBadge = styled.span`
  font-size: var(--wtf-type-caption, 13px);
  background: #a00;
  color: #fff;
  border-radius: 6px;
  padding: 0 4px;
  min-width: 14px;
  text-align: center;

  ${gammaBoardScope} & {
    background: #d6ff3f;
    color: #070706;
    border-radius: 4px;
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-weight: 800;
  }
`;

export const MainCol = styled.div<{ $mobileHidden?: boolean }>`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;

  @media (max-width: 768px) {
    display: ${(p) => (p.$mobileHidden ? "none" : "flex")};
  }
`;

export const ChanHeader = styled.div`
  padding: 6px 10px;
  border-bottom: 2px solid #888c8f;
  background: #dfdfdf;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;

  ${gammaBoardScope} & {
    background: #11110f;
    border-bottom: 1px solid rgba(242, 234, 217, 0.18);
    color: #f2ead9;
  }
`;

export const MobileBackButton = styled(Button)`
  display: none !important;
  margin-right: 4px;
  padding: 0 6px !important;
  min-width: 0 !important;

  @media (max-width: 768px) {
    display: inline-flex !important;
  }
`;

export const ChanTitleBig = styled.span`
  font-weight: bold;
  font-size: 14px;

  ${gammaBoardScope} & {
    color: #f2ead9;
  }
`;

export const TopicText = styled.span`
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted, #4b5563);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;

  ${gammaBoardScope} & {
    color: rgba(242, 234, 217, 0.68);
  }
`;

export const MsgScroll = styled(Panel).attrs({ variant: "well" })`
  flex: 1;
  overflow-y: auto;
  padding: 0;

  ${gammaBoardScope} & {
    background: #070706;
    border: 0;
    border-radius: 0;
  }
`;

export const MsgRow = styled.div<{ $pinned?: boolean; $highlight?: boolean }>`
  display: flex;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid #e0e0e0;
  background: ${(p) =>
    p.$highlight ? "#e8f0ff" : p.$pinned ? "#fffff0" : "transparent"};

  ${gammaBoardScope} & {
    background: ${(p) =>
      p.$highlight
        ? "rgba(0, 210, 255, 0.12)"
        : p.$pinned
          ? "rgba(214, 255, 63, 0.08)"
          : "transparent"};
    border-bottom: 1px solid rgba(242, 234, 217, 0.1);
    color: #f2ead9;
  }

  &:hover {
    background: ${(p) =>
      p.$highlight ? "#dde8ff" : p.$pinned ? "#fffde0" : "#f4f4f4"};
  }

  ${gammaBoardScope} &:hover {
    background: rgba(242, 234, 217, 0.06);
  }
`;

export const AvatarCircle = styled.div<{ $color?: string }>`
  width: 32px;
  height: 32px;
  border-radius: 4px;
  background: ${(p) => p.$color || "#c3c7cb"};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: bold;
  color: #fff;
  flex-shrink: 0;
  overflow: hidden;

  ${gammaBoardScope} & {
    border: 1px solid rgba(242, 234, 217, 0.2);
    border-radius: 6px;
    color: #070706;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

export const MsgBody = styled.div`
  flex: 1;
  min-width: 0;
`;

export const MsgAuthorLine = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--wtf-type-caption, 13px);
`;

export const MsgAuthor = styled.span`
  font-weight: bold;
  font-size: var(--wtf-type-caption, 13px);

  ${gammaBoardScope} & {
    color: #f2ead9;
  }

  a {
    display: inline-flex;
    align-items: center;
    min-height: 32px;
    padding-inline: 2px;
  }

  @media (max-width: 768px) {
    a {
      min-height: 44px;
    }
  }
`;

export const RolePill = styled.span`
  font-size: var(--wtf-type-caption, 13px);
  padding: 0 4px;
  background: #c3c7cb;
  font-weight: bold;

  ${gammaBoardScope} & {
    background: rgba(0, 210, 255, 0.12);
    border: 1px solid rgba(0, 210, 255, 0.36);
    border-radius: 4px;
    color: #00d2ff;
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
  }
`;

export const MsgTime = styled.span`
  color: var(--wtf-app-muted, #4b5563);
  font-size: var(--wtf-type-caption, 13px);
  margin-left: auto;

  ${gammaBoardScope} & {
    color: rgba(242, 234, 217, 0.58);
  }
`;

export const MsgContent = styled.div`
  font-size: 13px;
  margin-top: 2px;
  word-break: break-word;
  white-space: pre-wrap;
  line-height: 1.4;

  ${gammaBoardScope} & {
    color: #f2ead9;
  }
`;

export const ReplyQuote = styled.button.attrs({ type: "button" })`
  margin-top: 3px;
  margin-bottom: 4px;
  padding: 4px 6px;
  width: 100%;
  text-align: left;
  border: 1px solid #9ea8b8;
  background: #f3f6fb;
  color: #1d3f75;
  box-shadow: inset 0 2px 0 #6d84b3;
  font-size: var(--wtf-type-caption, 13px);
  cursor: pointer;

  ${gammaBoardScope} & {
    background: rgba(0, 210, 255, 0.08);
    border: 1px solid rgba(0, 210, 255, 0.28);
    border-radius: 6px;
    box-shadow: none;
    color: #00d2ff;
  }

  &:hover {
    background: #eaf0fb;
  }

  ${gammaBoardScope} &:hover {
    background: rgba(0, 210, 255, 0.14);
  }
`;

export const MsgAttachments = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
`;

export const AttachThumb = styled.a`
  display: block;
  max-width: 200px;
  max-height: 150px;
  border: 2px solid #888c8f;
  img {
    display: block;
    max-width: 100%;
    max-height: 146px;
    object-fit: contain;
  }
`;

export const AttachFile = styled.a`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 2px solid;
  border-color: #dfdfdf #888c8f #888c8f #dfdfdf;
  background: #c3c7cb;
  font-size: var(--wtf-type-caption, 13px);
  color: #000080;
  text-decoration: none;
  &:hover {
    background: #dfdfdf;
  }
`;

export const ReactionBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-top: 4px;
`;

export const ReactionChip = styled.button.attrs({ type: "button" })<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  font-size: var(--wtf-type-caption, 13px);
  min-width: 32px;
  min-height: 32px;
  border: 1px solid ${(p) => (p.$active ? "#000080" : "#888c8f")};
  background: ${(p) => (p.$active ? "#d0d8ff" : "#dfdfdf")};
  border-radius: 3px;
  cursor: pointer;
  &:hover {
    background: #c3c7cb;
  }

  ${gammaBoardScope} & {
    background: ${(p) => (p.$active ? "rgba(0, 210, 255, 0.14)" : "#11110f")};
    border: 1px solid ${(p) => (p.$active ? "#00d2ff" : "rgba(242, 234, 217, 0.18)")};
    border-radius: 5px;
    color: #f2ead9;
  }

  ${gammaBoardScope} &:hover {
    background: rgba(242, 234, 217, 0.08);
  }
`;

export const MsgActions = styled.div`
  display: flex;
  gap: 4px;
  margin-top: 3px;
`;

export const MsgActBtn = styled.button.attrs({
  type: "button",
  "data-compact-control": "true",
} as ButtonHTMLAttributes<HTMLButtonElement> & { "data-compact-control": string })`
  background: none;
  border: none;
  font-size: var(--wtf-type-caption, 13px);
  color: #000080;
  cursor: pointer;
  text-decoration: underline;
  padding: 0 4px;
  min-width: 32px;
  min-height: 32px;
  &:hover {
    color: #0000cc;
  }

  ${gammaBoardScope} & {
    color: #00d2ff;
    text-underline-offset: 0.18em;
  }

  ${gammaBoardScope} &:hover {
    color: #d6ff3f;
  }

  @media (max-width: 768px) {
    min-width: 44px;
    min-height: 44px;
  }
`;

export const EmojiPicker = styled.div`
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
  padding: 4px;
  background: #dfdfdf;
  border: 2px solid;
  border-color: #dfdfdf #888c8f #888c8f #dfdfdf;
  position: absolute;
  bottom: 100%;
  right: 0;
  z-index: 10;
  font-size: 16px;

  ${gammaBoardScope} & {
    background: #11110f;
    border: 1px solid rgba(242, 234, 217, 0.22);
    border-radius: 6px;
    box-shadow: none;
    color: #f2ead9;
  }

  button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px 4px;
    min-width: 32px;
    min-height: 32px;
    border-radius: 2px;

    ${gammaBoardScope} & {
      color: #f2ead9;
      border-radius: 5px;
    }

    &:hover {
      background: #c3c7cb;
    }

    ${gammaBoardScope} &:hover {
      background: rgba(0, 210, 255, 0.12);
      color: #00d2ff;
    }
  }

  @media (max-width: 768px) {
    button {
      min-width: 44px;
      min-height: 44px;
    }
  }
`;

export const Compose = styled.div`
  display: flex;
  gap: 4px;
  padding: 6px 10px;
  border-top: 2px solid #888c8f;
  align-items: flex-end;

  ${gammaBoardScope} & {
    background: #11110f;
    border-top: 1px solid rgba(242, 234, 217, 0.18);
  }
`;

export const ComposeArea = styled.textarea`
  flex: 1;
  min-height: 40px;
  max-height: 120px;
  resize: vertical;
  font-family: inherit;
  font-size: 13px;
  padding: 6px 8px;
  border: 2px solid;
  border-color: #888c8f #dfdfdf #dfdfdf #888c8f;
  background: #fff;
  &:focus {
    outline: 1px dotted #000;
  }

  ${gammaBoardScope} & {
    background: #070706;
    border: 1px solid rgba(242, 234, 217, 0.22);
    border-radius: 5px;
    color: #f2ead9;
  }

  ${gammaBoardScope} &:focus {
    outline: 2px solid #00d2ff;
    outline-offset: 2px;
  }

  ${gammaBoardScope} &::placeholder {
    color: rgba(242, 234, 217, 0.48);
  }

  &:disabled {
    background: #c3c7cb;
    color: #888;
  }

  ${gammaBoardScope} &:disabled {
    background: rgba(242, 234, 217, 0.08);
    color: rgba(242, 234, 217, 0.48);
  }
`;

export const StatusText = styled.div`
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted, #4b5563);
  padding: 4px 10px;

  ${gammaBoardScope} & {
    color: rgba(242, 234, 217, 0.68);
  }
`;

export const ReplyingBar = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #a1a8b3;
  background: #eef3fb;
  box-shadow: inset 0 2px 0 #6d84b3;
  padding: 4px 6px;
  font-size: var(--wtf-type-caption, 13px);
  color: #1f3556;

  ${gammaBoardScope} & {
    background: rgba(0, 210, 255, 0.08);
    border: 1px solid rgba(0, 210, 255, 0.28);
    border-radius: 6px;
    box-shadow: none;
    color: #f2ead9;
  }
`;

export const SettingsOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;

  ${gammaBoardScope} & {
    background: rgba(7, 7, 6, 0.78);
  }
`;

export const SettingsWin = styled.div`
  width: 560px;
  max-width: 95vw;
  max-height: 80vh;
  background: #c3c7cb;
  border: 2px solid;
  border-color: #dfdfdf #888c8f #888c8f #dfdfdf;
  display: flex;
  flex-direction: column;

  ${gammaBoardScope} & {
    background: #11110f;
    border: 1px solid rgba(242, 234, 217, 0.24);
    border-radius: 6px;
    box-shadow: none;
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
`;

export const SettingsTitleBar = styled.div`
  background: linear-gradient(90deg, #000080, #1084d0);
  color: #fff;
  font-weight: bold;
  font-size: var(--wtf-type-caption, 13px);
  padding: 3px 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;

  ${gammaBoardScope} & {
    background: #070706;
    background-image: none;
    border-bottom: 1px solid rgba(242, 234, 217, 0.18);
    color: #00d2ff;
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-weight: 800;
    padding: 8px 10px;
    text-transform: uppercase;
  }
`;

export const SettingsBody = styled.div`
  padding: 10px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;

  ${gammaBoardScope} & {
    background: #11110f;
    color: #f2ead9;
  }
`;

export const DialogBody = styled.div`
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;

  ${gammaBoardScope} & {
    background: #11110f;
    color: #f2ead9;
  }
`;

export const FormRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--wtf-type-caption, 13px);
  label {
    min-width: 100px;
    font-weight: bold;
  }

  ${gammaBoardScope} & {
    color: #f2ead9;
  }
`;

export const RoleGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 2px 8px;
`;

export const PermTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: var(--wtf-type-caption, 13px);
  th,
  td {
    border: 1px solid #888c8f;
    padding: 3px 6px;
    text-align: center;
  }
  th {
    background: #dfdfdf;
  }

  ${gammaBoardScope} & {
    color: #f2ead9;
  }

  ${gammaBoardScope} & th,
  ${gammaBoardScope} & td {
    border: 1px solid rgba(242, 234, 217, 0.18);
  }

  ${gammaBoardScope} & th {
    background: #070706;
    color: #00d2ff;
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
  }

  td:first-child {
    text-align: left;
  }
`;

export const EmptyCenter = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: #888;
  font-size: 13px;
  gap: 8px;

  ${gammaBoardScope} & {
    color: rgba(242, 234, 217, 0.68);
  }
`;
