import { Button, Panel } from "react95";
import styled from "styled-components";

export const Shell = styled.div`
  display: flex;
  height: 100%;
  min-height: 500px;

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
  font-size: 11px;
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
  font-size: 10px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #444;
  cursor: pointer;
  user-select: none;
  &:hover {
    color: #000;
  }
  &::before {
    content: "${(p) => (p.$collapsed ? "▸" : "▾")}";
    font-size: 9px;
    width: 10px;
  }
`;

export const ChanItem = styled.div<{ $active?: boolean; $locked?: boolean }>`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px 3px 20px;
  font-size: 12px;
  cursor: pointer;
  background: ${(p) => (p.$active ? "#000080" : "transparent")};
  color: ${(p) =>
    p.$active ? "#fff" : p.$locked ? "#888" : "#000"};
  &:hover {
    background: ${(p) => (p.$active ? "#000080" : "#dfdfdf")};
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
  font-size: 9px;
  background: #a00;
  color: #fff;
  border-radius: 6px;
  padding: 0 4px;
  min-width: 14px;
  text-align: center;
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
`;

export const TopicText = styled.span`
  font-size: 11px;
  color: #555;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
`;

export const MsgScroll = styled(Panel).attrs({ variant: "well" })`
  flex: 1;
  overflow-y: auto;
  padding: 0;
`;

export const MsgRow = styled.div<{ $pinned?: boolean; $highlight?: boolean }>`
  display: flex;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid #e0e0e0;
  background: ${(p) =>
    p.$highlight ? "#e8f0ff" : p.$pinned ? "#fffff0" : "transparent"};
  &:hover {
    background: ${(p) =>
      p.$highlight ? "#dde8ff" : p.$pinned ? "#fffde0" : "#f4f4f4"};
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
  font-size: 11px;
`;

export const MsgAuthor = styled.span`
  font-weight: bold;
  font-size: 12px;
`;

export const RolePill = styled.span`
  font-size: 9px;
  padding: 0 4px;
  background: #c3c7cb;
  font-weight: bold;
`;

export const MsgTime = styled.span`
  color: #888;
  font-size: 10px;
  margin-left: auto;
`;

export const MsgContent = styled.div`
  font-size: 13px;
  margin-top: 2px;
  word-break: break-word;
  white-space: pre-wrap;
  line-height: 1.4;
`;

export const ReplyQuote = styled.button`
  margin-top: 3px;
  margin-bottom: 4px;
  padding: 4px 6px;
  width: 100%;
  text-align: left;
  border: 1px solid #9ea8b8;
  border-left: 3px solid #6d84b3;
  background: #f3f6fb;
  color: #1d3f75;
  font-size: 11px;
  cursor: pointer;
  &:hover {
    background: #eaf0fb;
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
  font-size: 11px;
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

export const ReactionChip = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  font-size: 12px;
  border: 1px solid ${(p) => (p.$active ? "#000080" : "#888c8f")};
  background: ${(p) => (p.$active ? "#d0d8ff" : "#dfdfdf")};
  border-radius: 3px;
  cursor: pointer;
  &:hover {
    background: #c3c7cb;
  }
`;

export const MsgActions = styled.div`
  display: flex;
  gap: 4px;
  margin-top: 3px;
`;

export const MsgActBtn = styled.button`
  background: none;
  border: none;
  font-size: 10px;
  color: #000080;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
  &:hover {
    color: #0000cc;
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
  button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 2px;
    &:hover {
      background: #c3c7cb;
    }
  }
`;

export const Compose = styled.div`
  display: flex;
  gap: 4px;
  padding: 6px 10px;
  border-top: 2px solid #888c8f;
  align-items: flex-end;
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
  &:disabled {
    background: #c3c7cb;
    color: #888;
  }
`;

export const StatusText = styled.div`
  font-size: 11px;
  color: #555;
  padding: 4px 10px;
`;

export const ReplyingBar = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #a1a8b3;
  border-left: 3px solid #6d84b3;
  background: #eef3fb;
  padding: 4px 6px;
  font-size: 11px;
  color: #1f3556;
`;

export const SettingsOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
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
`;

export const SettingsTitleBar = styled.div`
  background: linear-gradient(90deg, #000080, #1084d0);
  color: #fff;
  font-weight: bold;
  font-size: 12px;
  padding: 3px 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

export const SettingsBody = styled.div`
  padding: 10px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const DialogBody = styled.div`
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const FormRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  label {
    min-width: 100px;
    font-weight: bold;
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
  font-size: 11px;
  th,
  td {
    border: 1px solid #888c8f;
    padding: 3px 6px;
    text-align: center;
  }
  th {
    background: #dfdfdf;
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
`;
