import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Checkbox,
  GroupBox,
  Hourglass,
  Panel,
  TextInput,
  Separator,
  Toolbar,
  Select,
} from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { UserLink } from "../components/UserLink";
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api";
import { ROLE_LABELS, ROLE_ORDER, type UserRole } from "@shared/types";

/* ═══ helpers ═════════════════════════════════════════════ */

function timeAgo(dateStr: string): string {
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(dateStr).toLocaleDateString();
}

function safeAttachmentUrl(raw: string): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

const CHANNEL_ICONS: Record<string, string> = {
  text: "#",
  announcements: "📢",
  forum: "💬",
};

const EMOJI_QUICK = ["👍", "❤️", "😂", "🔥", "👀", "🎉", "💯", "⚡"];

function toggleInList<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

/* ═══ types ═══════════════════════════════════════════════ */

interface Category {
  id: number;
  name: string;
  position: number;
  collapsed: boolean;
}

interface Channel {
  id: number;
  title: string;
  body: string;
  categoryId: number | null;
  channelType: string;
  topic: string | null;
  position: number;
  slowModeSeconds: number;
  viewRoles: UserRole[];
  replyRoles: UserRole[];
  active: boolean;
  pinned: boolean;
  locked: boolean;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Attachment {
  url: string;
  name: string;
  type: string;
  size?: number;
}

interface ReactionGroup {
  emoji: string;
  users: Array<{ id: number; username: string | null }>;
}

interface Message {
  id: number;
  threadId: number;
  userId: number;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  role?: UserRole;
  content: string;
  attachments: Attachment[];
  pinned: boolean;
  parentReplyId: number | null;
  webhookId: number | null;
  createdAt: string;
  editedAt?: string | null;
  reactions: ReactionGroup[];
}

interface ReplyTarget {
  id: number;
  username?: string | null;
  displayName?: string | null;
  content: string;
}

interface ChannelDetail {
  messages: Message[];
  channel: Channel & { canPost: boolean; canManage: boolean };
}

interface WebhookRow {
  id: number;
  channelId: number;
  name: string;
  token: string;
  avatarUrl: string | null;
  active: boolean;
  creatorUsername: string | null;
  createdAt: string;
}

interface PermRow {
  id: number;
  channelId: number;
  targetType: string;
  targetRole: string | null;
  targetUserId: number | null;
  targetUsername: string | null;
  targetDisplayName: string | null;
  allowView: boolean | null;
  allowPost: boolean | null;
  allowManage: boolean | null;
  allowReact: boolean | null;
  allowAttach: boolean | null;
}

/* ═══ styled components ══════════════════════════════════ */

const Shell = styled.div`
  display: flex;
  height: 100%;
  min-height: 500px;

  @media (max-width: 768px) {
    min-height: 0;
  }
`;

/* -- sidebar -- */
const Sidebar = styled.div<{ $mobileHidden?: boolean }>`
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

const SideHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  background: linear-gradient(90deg, #000080, #1084d0);
  color: #fff;
  font-weight: bold;
  font-size: 11px;
`;

const SideScroll = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 2px 0;
`;

const CatHeader = styled.div<{ $collapsed?: boolean }>`
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

const ChanItem = styled.div<{ $active?: boolean; $locked?: boolean }>`
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

const ChanIcon = styled.span`
  font-size: 13px;
  width: 18px;
  text-align: center;
  flex-shrink: 0;
`;

const ChanName = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
`;

const ChanBadge = styled.span`
  font-size: 9px;
  background: #a00;
  color: #fff;
  border-radius: 6px;
  padding: 0 4px;
  min-width: 14px;
  text-align: center;
`;

/* -- main area -- */
const MainCol = styled.div<{ $mobileHidden?: boolean }>`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;

  @media (max-width: 768px) {
    display: ${(p) => (p.$mobileHidden ? "none" : "flex")};
  }
`;

const ChanHeader = styled.div`
  padding: 6px 10px;
  border-bottom: 2px solid #888c8f;
  background: #dfdfdf;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
`;

const MobileBackButton = styled(Button)`
  display: none !important;
  margin-right: 4px;
  padding: 0 6px !important;
  min-width: 0 !important;

  @media (max-width: 768px) {
    display: inline-flex !important;
  }
`;

const ChanTitleBig = styled.span`
  font-weight: bold;
  font-size: 14px;
`;

const TopicText = styled.span`
  font-size: 11px;
  color: #555;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
`;

const MsgScroll = styled(Panel).attrs({ variant: "well" })`
  flex: 1;
  overflow-y: auto;
  padding: 0;
`;

const MsgRow = styled.div<{ $pinned?: boolean; $highlight?: boolean }>`
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

const AvatarCircle = styled.div<{ $color?: string }>`
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

const MsgBody = styled.div`
  flex: 1;
  min-width: 0;
`;

const MsgAuthorLine = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
`;

const MsgAuthor = styled.span`
  font-weight: bold;
  font-size: 12px;
`;

const RolePill = styled.span`
  font-size: 9px;
  padding: 0 4px;
  background: #c3c7cb;
  font-weight: bold;
`;

const MsgTime = styled.span`
  color: #888;
  font-size: 10px;
  margin-left: auto;
`;

const MsgContent = styled.div`
  font-size: 13px;
  margin-top: 2px;
  word-break: break-word;
  white-space: pre-wrap;
  line-height: 1.4;
`;

const ReplyQuote = styled.button`
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

const MsgAttachments = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
`;

const AttachThumb = styled.a`
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

const AttachFile = styled.a`
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

const ReactionBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-top: 4px;
`;

const ReactionChip = styled.button<{ $active?: boolean }>`
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

const MsgActions = styled.div`
  display: flex;
  gap: 4px;
  margin-top: 3px;
`;

const MsgActBtn = styled.button`
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

const EmojiPicker = styled.div`
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

/* -- compose bar -- */
const Compose = styled.div`
  display: flex;
  gap: 4px;
  padding: 6px 10px;
  border-top: 2px solid #888c8f;
  align-items: flex-end;
`;

const ComposeArea = styled.textarea`
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

const StatusText = styled.div`
  font-size: 11px;
  color: #555;
  padding: 4px 10px;
`;

const ReplyingBar = styled.div`
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

/* -- settings panel -- */
const SettingsOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const SettingsWin = styled.div`
  width: 560px;
  max-width: 95vw;
  max-height: 80vh;
  background: #c3c7cb;
  border: 2px solid;
  border-color: #dfdfdf #888c8f #888c8f #dfdfdf;
  display: flex;
  flex-direction: column;
`;

const SettingsTitleBar = styled.div`
  background: linear-gradient(90deg, #000080, #1084d0);
  color: #fff;
  font-weight: bold;
  font-size: 12px;
  padding: 3px 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const SettingsBody = styled.div`
  padding: 10px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const DialogBody = styled.div`
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const FormRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  label {
    min-width: 100px;
    font-weight: bold;
  }
`;

const RoleGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 2px 8px;
`;

const PermTable = styled.table`
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

const EmptyCenter = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: #888;
  font-size: 13px;
  gap: 8px;
`;

/* ═══ sub-components ═════════════════════════════════════ */

const roleOptions = [...ROLE_ORDER];

function ChannelSettings({
  channel,
  onClose,
}: {
  channel: Channel & { canPost: boolean; canManage: boolean };
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"general" | "perms" | "webhooks">("general");

  // General state
  const [title, setTitle] = useState(channel.title);
  const [topic, setTopic] = useState(channel.topic || "");
  const [chType, setChType] = useState(channel.channelType);
  const [slowMode, setSlowMode] = useState(channel.slowModeSeconds);
  const [vRoles, setVRoles] = useState<UserRole[]>(channel.viewRoles);
  const [rRoles, setRRoles] = useState<UserRole[]>(channel.replyRoles);

  const saveMut = useMutation({
    mutationFn: (payload: any) => api.put(`/api/board/channels/${channel.id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board"] });
      onClose();
    },
  });

  // Permissions
  const { data: perms } = useQuery({
    queryKey: ["board", "perms", channel.id],
    queryFn: () => api.get<PermRow[]>(`/api/board/channels/${channel.id}/permissions`),
    enabled: tab === "perms",
  });

  const [newPermType, setNewPermType] = useState<"role" | "user">("role");
  const [newPermRole, setNewPermRole] = useState<UserRole>("witness");
  const [newPermUserId, setNewPermUserId] = useState("");

  const addPermMut = useMutation({
    mutationFn: (payload: any) =>
      api.post(`/api/board/channels/${channel.id}/permissions`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board", "perms", channel.id] }),
  });

  const delPermMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/board/permissions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board", "perms", channel.id] }),
  });

  const updatePermMut = useMutation({
    mutationFn: ({ id, ...payload }: any) => api.put(`/api/board/permissions/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board", "perms", channel.id] }),
  });

  // Webhooks
  const { data: webhooks } = useQuery({
    queryKey: ["board", "webhooks", channel.id],
    queryFn: () => api.get<WebhookRow[]>(`/api/board/channels/${channel.id}/webhooks`),
    enabled: tab === "webhooks",
  });

  const [whName, setWhName] = useState("");
  const addWhMut = useMutation({
    mutationFn: () => api.post(`/api/board/channels/${channel.id}/webhooks`, { name: whName }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board", "webhooks", channel.id] });
      setWhName("");
    },
  });

  const delWhMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/board/webhooks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board", "webhooks", channel.id] }),
  });

  return (
    <SettingsOverlay onClick={onClose}>
      <SettingsWin onClick={(e) => e.stopPropagation()}>
        <SettingsTitleBar>
          <span>Channel Settings — #{channel.title}</span>
          <Button size="sm" onClick={onClose} style={{ fontSize: 10, padding: "1px 6px" }}>
            ✕
          </Button>
        </SettingsTitleBar>
        <Toolbar style={{ padding: "4px 8px", gap: 4 }}>
          <Button size="sm" active={tab === "general"} onClick={() => setTab("general")}>
            General
          </Button>
          <Button size="sm" active={tab === "perms"} onClick={() => setTab("perms")}>
            Permissions
          </Button>
          <Button size="sm" active={tab === "webhooks"} onClick={() => setTab("webhooks")}>
            Webhooks
          </Button>
        </Toolbar>
        <SettingsBody>
          {tab === "general" && (
            <>
              <FormRow>
                <label>Name</label>
                <TextInput
                  value={title}
                  onChange={(e: any) => setTitle(e.target.value)}
                  fullWidth
                />
              </FormRow>
              <FormRow>
                <label>Topic</label>
                <TextInput
                  value={topic}
                  onChange={(e: any) => setTopic(e.target.value)}
                  fullWidth
                />
              </FormRow>
              <FormRow>
                <label>Type</label>
                <Select
                  value={chType}
                  onChange={(e: any) => setChType(e.value)}
                  options={[
                    { label: "Text", value: "text" },
                    { label: "Announcements", value: "announcements" },
                    { label: "Forum", value: "forum" },
                  ]}
                  width={160}
                />
              </FormRow>
              <FormRow>
                <label>Slow Mode</label>
                <TextInput
                  type="number"
                  value={String(slowMode)}
                  onChange={(e: any) => setSlowMode(Math.max(0, Number(e.target.value)))}
                  style={{ width: 80 }}
                />
                <span style={{ fontSize: 11 }}>seconds (0 = off)</span>
              </FormRow>
              <GroupBox label="View Roles">
                <RoleGrid>
                  {roleOptions.map((r) => (
                    <Checkbox
                      key={r}
                      label={ROLE_LABELS[r]}
                      checked={vRoles.includes(r)}
                      onChange={() => setVRoles((p) => toggleInList(p, r))}
                    />
                  ))}
                </RoleGrid>
              </GroupBox>
              <GroupBox label="Post Roles">
                <RoleGrid>
                  {roleOptions.map((r) => (
                    <Checkbox
                      key={r}
                      label={ROLE_LABELS[r]}
                      checked={rRoles.includes(r)}
                      onChange={() => setRRoles((p) => toggleInList(p, r))}
                    />
                  ))}
                </RoleGrid>
              </GroupBox>
              <div>
                <Button
                  onClick={() =>
                    saveMut.mutate({
                      title,
                      topic,
                      channelType: chType,
                      slowModeSeconds: slowMode,
                      viewRoles: vRoles,
                      replyRoles: rRoles,
                    })
                  }
                  disabled={!title.trim() || saveMut.isPending}
                >
                  Save Changes
                </Button>
              </div>
            </>
          )}

          {tab === "perms" && (
            <>
              <div style={{ fontSize: 11, color: "#555" }}>
                Per-channel overrides. <code>null</code> = inherit default.
                User-level overrides beat role-level.
              </div>
              {perms && perms.length > 0 && (
                <PermTable>
                  <thead>
                    <tr>
                      <th>Target</th>
                      <th>View</th>
                      <th>Post</th>
                      <th>Manage</th>
                      <th>React</th>
                      <th>Attach</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {perms.map((p) => (
                      <tr key={p.id}>
                        <td>
                          {p.targetType === "role"
                            ? `Role: ${ROLE_LABELS[p.targetRole as UserRole] ?? p.targetRole}`
                            : `User: ${p.targetDisplayName || p.targetUsername || p.targetUserId}`}
                        </td>
                        {(["allowView", "allowPost", "allowManage", "allowReact", "allowAttach"] as const).map(
                          (field) => (
                            <td key={field}>
                              <select
                                value={String(p[field] ?? "null")}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  updatePermMut.mutate({
                                    id: p.id,
                                    [field]: v === "null" ? null : v === "true",
                                  });
                                }}
                                style={{ fontSize: 10 }}
                              >
                                <option value="null">—</option>
                                <option value="true">✅</option>
                                <option value="false">❌</option>
                              </select>
                            </td>
                          )
                        )}
                        <td>
                          <MsgActBtn onClick={() => delPermMut.mutate(p.id)}>✕</MsgActBtn>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </PermTable>
              )}
              <GroupBox label="Add Override">
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <Select
                    value={newPermType}
                    onChange={(e: any) => setNewPermType(e.value)}
                    options={[
                      { label: "Role", value: "role" },
                      { label: "User", value: "user" },
                    ]}
                    width={100}
                  />
                  {newPermType === "role" ? (
                    <Select
                      value={newPermRole}
                      onChange={(e: any) => setNewPermRole(e.value)}
                      options={roleOptions.map((r) => ({
                        label: ROLE_LABELS[r],
                        value: r,
                      }))}
                      width={160}
                    />
                  ) : (
                    <TextInput
                      value={newPermUserId}
                      onChange={(e: any) => setNewPermUserId(e.target.value)}
                      placeholder="User ID"
                      style={{ width: 100 }}
                    />
                  )}
                  <Button
                    size="sm"
                    onClick={() =>
                      addPermMut.mutate({
                        targetType: newPermType,
                        targetRole: newPermType === "role" ? newPermRole : undefined,
                        targetUserId:
                          newPermType === "user" ? Number(newPermUserId) : undefined,
                      })
                    }
                  >
                    Add
                  </Button>
                </div>
              </GroupBox>
            </>
          )}

          {tab === "webhooks" && (
            <>
              <div style={{ fontSize: 11, color: "#555" }}>
                Incoming webhooks let external services post to this channel.
              </div>
              {webhooks?.map((wh) => (
                <Panel key={wh.id} variant="well" style={{ padding: 6, fontSize: 11 }}>
                  <div>
                    <strong>{wh.name}</strong> by {wh.creatorUsername}
                  </div>
                  <div style={{ fontFamily: "monospace", fontSize: 10, wordBreak: "break-all" }}>
                    POST /api/board/webhook/{wh.token}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <Button size="sm" onClick={() => delWhMut.mutate(wh.id)}>
                      Delete
                    </Button>
                  </div>
                </Panel>
              ))}
              <GroupBox label="New Webhook">
                <div style={{ display: "flex", gap: 6 }}>
                  <TextInput
                    value={whName}
                    onChange={(e: any) => setWhName(e.target.value)}
                    placeholder="Webhook name"
                    fullWidth
                  />
                  <Button
                    disabled={!whName.trim() || addWhMut.isPending}
                    onClick={() => addWhMut.mutate()}
                  >
                    Create
                  </Button>
                </div>
              </GroupBox>
            </>
          )}
        </SettingsBody>
      </SettingsWin>
    </SettingsOverlay>
  );
}

function InlineDialog({
  title,
  onClose,
  width = 420,
  children,
}: {
  title: string;
  onClose: () => void;
  width?: number;
  children: ReactNode;
}) {
  return (
    <SettingsOverlay onClick={onClose}>
      <SettingsWin
        style={{ width, maxWidth: "95vw" }}
        onClick={(e) => e.stopPropagation()}
      >
        <SettingsTitleBar>
          <span>{title}</span>
          <Button size="sm" onClick={onClose}>
            ✕
          </Button>
        </SettingsTitleBar>
        <DialogBody>{children}</DialogBody>
      </SettingsWin>
    </SettingsOverlay>
  );
}

/* ═══ main component ═════════════════════════════════════ */

export function MessageBoard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isMod = !!user && ["admin", "host", "cohost"].includes(user.role);

  const [activeChannelId, setActiveChannelId] = useState<number | null>(null);
  const [msgText, setMsgText] = useState("");
  const [attachUrl, setAttachUrl] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showEmojiFor, setShowEmojiFor] = useState<number | null>(null);
  const [collapsedCats, setCollapsedCats] = useState<Set<number | null>>(new Set());
  const [mobileSidebar, setMobileSidebar] = useState(true);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [highlightReplyId, setHighlightReplyId] = useState<number | null>(null);

  // New channel / category form
  const [showNewCh, setShowNewCh] = useState(false);
  const [newChTitle, setNewChTitle] = useState("");
  const [newChCatId, setNewChCatId] = useState<number | null>(null);
  const [newChType, setNewChType] = useState("text");
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [channelManageTarget, setChannelManageTarget] = useState<Channel | null>(null);
  const [categoryManageTarget, setCategoryManageTarget] = useState<Category | null>(null);
  const [categoryRenameInput, setCategoryRenameInput] = useState("");
  const [editingMessageTarget, setEditingMessageTarget] = useState<Message | null>(null);
  const [editingMessageText, setEditingMessageText] = useState("");
  const [deleteMessageTarget, setDeleteMessageTarget] = useState<Message | null>(null);

  const getAdaptiveInterval = (activeMs: number, idleMs: number) =>
    typeof document !== "undefined" && document.visibilityState === "visible"
      ? activeMs
      : idleMs;

  const msgEndRef = useRef<HTMLDivElement>(null);
  const composeRef = useRef<HTMLTextAreaElement>(null);
  const prevMsgCount = useRef(0);

  // Data fetching
  const { data: categories } = useQuery({
    queryKey: ["board", "categories"],
    queryFn: () => api.get<Category[]>("/api/board/categories"),
  });

  const { data: channelList, isLoading } = useQuery({
    queryKey: ["board", "channels"],
    queryFn: () => api.get<Channel[]>("/api/board/channels"),
    refetchInterval: () => getAdaptiveInterval(12_000, 45_000),
    refetchIntervalInBackground: false,
  });

  const { data: channelData } = useQuery({
    queryKey: ["board", "channel", activeChannelId],
    queryFn: () => api.get<ChannelDetail>(`/api/board/channels/${activeChannelId}/messages`),
    enabled: !!activeChannelId,
    refetchInterval: () => getAdaptiveInterval(8_000, 30_000),
    refetchIntervalInBackground: false,
  });

  const ch = channelData?.channel;
  const messages = channelData?.messages ?? [];
  const messageById = useMemo(() => {
    const map = new Map<number, Message>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  // Auto-select first channel
  useEffect(() => {
    if (!activeChannelId && channelList && channelList.length > 0) {
      const first = channelList.find((c) => c.active);
      if (first) setActiveChannelId(first.id);
    }
  }, [activeChannelId, channelList]);

  useEffect(() => {
    setReplyTo(null);
  }, [activeChannelId]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > prevMsgCount.current) {
      msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMsgCount.current = messages.length;
  }, [messages.length]);

  // Mutations
  const sendMsgMut = useMutation({
    mutationFn: (payload: {
      content: string;
      attachments?: Attachment[];
      parentReplyId?: number | null;
    }) =>
      api.post(`/api/board/channels/${activeChannelId}/messages`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board", "channel", activeChannelId] });
      qc.invalidateQueries({ queryKey: ["board", "channels"] });
      setMsgText("");
      setAttachUrl("");
      setReplyTo(null);
    },
  });

  const deleteMsgMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/board/messages/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board", "channel", activeChannelId] });
      setDeleteMessageTarget(null);
    },
  });

  const editMsgMut = useMutation({
    mutationFn: ({ id, content }: { id: number; content: string }) =>
      api.put(`/api/board/messages/${id}`, { content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board", "channel", activeChannelId] });
      setEditingMessageTarget(null);
      setEditingMessageText("");
    },
  });

  const pinMsgMut = useMutation({
    mutationFn: ({ id, pinned }: { id: number; pinned: boolean }) =>
      api.put(`/api/board/messages/${id}/pin`, { pinned }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board", "channel", activeChannelId] });
    },
  });

  const reactMut = useMutation({
    mutationFn: ({ msgId, emoji }: { msgId: number; emoji: string }) =>
      api.post(`/api/board/messages/${msgId}/reactions`, { emoji }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board", "channel", activeChannelId] });
      setShowEmojiFor(null);
    },
  });

  const createChMut = useMutation({
    mutationFn: () =>
      api.post("/api/board/channels", {
        title: newChTitle,
        body: newChTitle,
        categoryId: newChCatId,
        channelType: newChType,
        viewRoles: [...ROLE_ORDER],
        replyRoles: [...ROLE_ORDER],
      }),
    onSuccess: (created: any) => {
      qc.invalidateQueries({ queryKey: ["board"] });
      setNewChTitle("");
      setShowNewCh(false);
      setActiveChannelId(created.id);
    },
  });

  const createCatMut = useMutation({
    mutationFn: () => api.post("/api/board/categories", { name: newCatName }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board"] });
      setNewCatName("");
      setShowNewCat(false);
    },
  });

  const deleteChMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/board/channels/${id}`),
    onSuccess: (_result, deletedId) => {
      qc.invalidateQueries({ queryKey: ["board"] });
      if (activeChannelId === deletedId) setActiveChannelId(null);
      setChannelManageTarget(null);
    },
  });

  const deleteCatMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/board/categories/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board"] });
      setCategoryManageTarget(null);
    },
  });

  const renameCatMut = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      api.put(`/api/board/categories/${id}`, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board"] });
      setCategoryManageTarget(null);
      setCategoryRenameInput("");
    },
  });

  const modChMut = useMutation({
    mutationFn: ({ id, ...payload }: any) => api.put(`/api/board/channels/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board"] });
      qc.invalidateQueries({ queryKey: ["board", "channel", activeChannelId] });
    },
  });

  const handleSend = useCallback(() => {
    const content = msgText.trim();
    const attachments: Attachment[] = [];
    if (attachUrl.trim()) {
      const url = attachUrl.trim();
      const isImage = /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(url);
      attachments.push({
        url,
        name: url.split("/").pop() || "file",
        type: isImage ? "image" : "file",
      });
    }
    if (!content && attachments.length === 0) return;
    sendMsgMut.mutate({
      content,
      attachments,
      parentReplyId: replyTo?.id ?? null,
    });
  }, [msgText, attachUrl, replyTo, sendMsgMut]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const jumpToReply = useCallback((replyId: number) => {
    const el = document.getElementById(`board-msg-${replyId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightReplyId(replyId);
    window.setTimeout(() => {
      setHighlightReplyId((current) => (current === replyId ? null : current));
    }, 1600);
  }, []);

  const snippet = useCallback((text: string, limit = 90) => {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();
    if (normalized.length <= limit) return normalized;
    return `${normalized.slice(0, limit)}...`;
  }, []);

  // Build sidebar tree
  const catList = useMemo(() => categories ?? [], [categories]);
  const channels = useMemo(() => channelList ?? [], [channelList]);

  const uncategorized = useMemo(
    () => channels.filter((c) => !c.categoryId),
    [channels]
  );

  const catChannels = useMemo(() => {
    const map = new Map<number, Channel[]>();
    for (const c of channels) {
      if (c.categoryId) {
        const list = map.get(c.categoryId) || [];
        list.push(c);
        map.set(c.categoryId, list);
      }
    }
    return map;
  }, [channels]);

  const toggleCat = (catId: number | null) => {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const onKeyboardActivate = (
    event: KeyboardEvent,
    action: () => void
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
  };

  if (isLoading) {
    return (
      <AppWindow title="Message Board">
        <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
          <Hourglass size={32} />
        </div>
      </AppWindow>
    );
  }

  const renderChannel = (c: Channel) => (
    <ChanItem
      key={c.id}
      $active={c.id === activeChannelId}
      $locked={c.locked || !c.active}
      onClick={() => { setActiveChannelId(c.id); setMobileSidebar(false); }}
      role="button"
      tabIndex={0}
      aria-label={`Open channel ${c.title}`}
      onKeyDown={(event) =>
        onKeyboardActivate(event, () => {
          setActiveChannelId(c.id);
          setMobileSidebar(false);
        })
      }
      onContextMenu={(e) => {
        if (!isMod) return;
        e.preventDefault();
        setChannelManageTarget(c);
      }}
    >
      <ChanIcon>{c.locked ? "🔒" : CHANNEL_ICONS[c.channelType] || "#"}</ChanIcon>
      <ChanName style={!c.active ? { fontStyle: "italic", opacity: 0.5 } : undefined}>
        {c.title}
      </ChanName>
      {c.messageCount > 0 && <ChanBadge>{c.messageCount}</ChanBadge>}
    </ChanItem>
  );

  const avatarColor = (name: string) => {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return `hsl(${Math.abs(h) % 360}, 50%, 40%)`;
  };

  return (
    <AppWindow title="Message Board">
      <Shell>
        {/* ─── sidebar ──────────────────────── */}
        <Sidebar $mobileHidden={!mobileSidebar}>
          <SideHeader>
            <span>Channels</span>
            {isMod && (
              <div style={{ display: "flex", gap: 3 }}>
                <Button
                  size="sm"
                  onClick={() => setShowNewCh((p) => !p)}
                  style={{ fontSize: 10, padding: "1px 6px" }}
                >
                  +Ch
                </Button>
                <Button
                  size="sm"
                  onClick={() => setShowNewCat((p) => !p)}
                  style={{ fontSize: 10, padding: "1px 6px" }}
                >
                  +Cat
                </Button>
              </div>
            )}
          </SideHeader>

          {/* new channel inline form */}
          {isMod && showNewCh && (
            <div style={{ padding: 6, background: "#dfdfdf", borderBottom: "1px solid #888" }}>
              <TextInput
                value={newChTitle}
                onChange={(e: any) => setNewChTitle(e.target.value)}
                placeholder="Channel name"
                fullWidth
              />
              <div style={{ display: "flex", gap: 4, marginTop: 4, alignItems: "center" }}>
                <Select
                  value={newChType}
                  onChange={(e: any) => setNewChType(e.value)}
                  options={[
                    { label: "Text", value: "text" },
                    { label: "📢 Announce", value: "announcements" },
                    { label: "💬 Forum", value: "forum" },
                  ]}
                  width={120}
                />
                <Select
                  value={newChCatId ?? 0}
                  onChange={(e: any) => setNewChCatId(e.value || null)}
                  options={[
                    { label: "No category", value: 0 },
                    ...catList.map((c) => ({ label: c.name, value: c.id })),
                  ]}
                  width={120}
                />
              </div>
              <div style={{ marginTop: 4 }}>
                <Button
                  size="sm"
                  disabled={!newChTitle.trim()}
                  onClick={() => createChMut.mutate()}
                >
                  Create
                </Button>
              </div>
            </div>
          )}

          {/* new category inline form */}
          {isMod && showNewCat && (
            <div style={{ padding: 6, background: "#dfdfdf", borderBottom: "1px solid #888" }}>
              <div style={{ display: "flex", gap: 4 }}>
                <TextInput
                  value={newCatName}
                  onChange={(e: any) => setNewCatName(e.target.value)}
                  placeholder="Category name"
                  fullWidth
                />
                <Button
                  size="sm"
                  disabled={!newCatName.trim()}
                  onClick={() => createCatMut.mutate()}
                >
                  Add
                </Button>
              </div>
            </div>
          )}

          <SideScroll>
            {/* uncategorized channels */}
            {uncategorized.length > 0 && (
              <>
                <CatHeader
                  $collapsed={collapsedCats.has(null)}
                  onClick={() => toggleCat(null)}
                  role="button"
                  tabIndex={0}
                  aria-label="Toggle uncategorized channels"
                  onKeyDown={(event) =>
                    onKeyboardActivate(event, () => toggleCat(null))
                  }
                >
                  Channels
                </CatHeader>
                {!collapsedCats.has(null) && uncategorized.map(renderChannel)}
              </>
            )}

            {/* categorized channels */}
            {catList.map((cat) => {
              const chans = catChannels.get(cat.id) || [];
              const isCollapsed = collapsedCats.has(cat.id);
              return (
                <div key={cat.id}>
                  <CatHeader
                    $collapsed={isCollapsed}
                    onClick={() => toggleCat(cat.id)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Toggle category ${cat.name}`}
                    onKeyDown={(event) =>
                      onKeyboardActivate(event, () => toggleCat(cat.id))
                    }
                    onContextMenu={(e) => {
                      if (!isMod) return;
                      e.preventDefault();
                      setCategoryManageTarget(cat);
                      setCategoryRenameInput(cat.name);
                    }}
                  >
                    {cat.name}
                  </CatHeader>
                  {!isCollapsed && chans.map(renderChannel)}
                </div>
              );
            })}

            {channels.length === 0 && (
              <StatusText>No channels yet.</StatusText>
            )}
          </SideScroll>
        </Sidebar>

        {/* ─── main area ────────────────────── */}
        <MainCol $mobileHidden={mobileSidebar}>
          {!ch && (
            <EmptyCenter>
              <span style={{ fontSize: 28 }}>📋</span>
              <span>Select a channel</span>
            </EmptyCenter>
          )}

          {ch && (
            <>
              {/* channel header */}
              <ChanHeader>
                <MobileBackButton
                  size="sm"
                  onClick={() => setMobileSidebar(true)}
                >
                  ←
                </MobileBackButton>
                <ChanIcon style={{ fontSize: 16 }}>
                  {ch.locked ? "🔒" : CHANNEL_ICONS[ch.channelType] || "#"}
                </ChanIcon>
                <ChanTitleBig>{ch.title}</ChanTitleBig>
                {ch.topic && (
                  <>
                    <Separator orientation="vertical" style={{ height: 16 }} />
                    <TopicText title={ch.topic}>{ch.topic}</TopicText>
                  </>
                )}
                <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
                  {ch.canManage && (
                    <>
                      <Button size="sm" onClick={() => modChMut.mutate({ id: ch.id, pinned: !ch.pinned })}>
                        {ch.pinned ? "Unpin" : "📌"}
                      </Button>
                      <Button size="sm" onClick={() => modChMut.mutate({ id: ch.id, locked: !ch.locked })}>
                        {ch.locked ? "🔓" : "🔒"}
                      </Button>
                      <Button size="sm" onClick={() => setShowSettings(true)}>
                        ⚙️
                      </Button>
                    </>
                  )}
                </div>
              </ChanHeader>

              {ch.slowModeSeconds > 0 && (
                <StatusText>
                  🐌 Slow mode: {ch.slowModeSeconds}s between messages
                </StatusText>
              )}

              {/* messages */}
              <MsgScroll>
                {messages.length === 0 && (
                  <EmptyCenter style={{ padding: 32 }}>
                    <span>No messages yet. Start the conversation!</span>
                  </EmptyCenter>
                )}
                {messages.map((msg) => {
                  const authorName =
                    msg.displayName || msg.username || "Unknown";
                  const canDelete =
                    (user && msg.userId === user.id) || isMod;
                  const canPin = ch.canManage;

                  return (
                    <MsgRow
                      id={`board-msg-${msg.id}`}
                      key={msg.id}
                      $pinned={msg.pinned}
                      $highlight={highlightReplyId === msg.id}
                    >
                      <AvatarCircle $color={avatarColor(authorName)}>
                        {msg.avatarUrl ? (
                          <img src={msg.avatarUrl} alt="" />
                        ) : (
                          authorName[0]?.toUpperCase()
                        )}
                      </AvatarCircle>
                      <MsgBody>
                        <MsgAuthorLine>
                          <MsgAuthor>
                            <UserLink
                              username={msg.username}
                              displayName={msg.displayName}
                            />
                          </MsgAuthor>
                          {msg.role && (
                            <RolePill>{ROLE_LABELS[msg.role]}</RolePill>
                          )}
                          {msg.webhookId && <RolePill>WEBHOOK</RolePill>}
                          {msg.pinned && <span style={{ fontSize: 10 }}>📌</span>}
                          {msg.editedAt && (
                            <span style={{ fontSize: 9, color: "#888" }}>(edited)</span>
                          )}
                          <MsgTime title={new Date(msg.createdAt).toLocaleString()}>
                            {timeAgo(msg.createdAt)}
                          </MsgTime>
                        </MsgAuthorLine>

                        {msg.parentReplyId && (
                          <ReplyQuote
                            onClick={() => jumpToReply(msg.parentReplyId as number)}
                            title={`Jump to message #${msg.parentReplyId}`}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(event) =>
                              onKeyboardActivate(event, () =>
                                jumpToReply(msg.parentReplyId as number)
                              )
                            }
                          >
                            {(() => {
                              const parent = messageById.get(msg.parentReplyId as number);
                              if (!parent) {
                                return `↪ Reply to message #${msg.parentReplyId}`;
                              }
                              const parentName =
                                parent.displayName || parent.username || "Unknown";
                              return `↪ Replying to ${parentName}: ${snippet(parent.content)}`;
                            })()}
                          </ReplyQuote>
                        )}

                        <MsgContent>{msg.content}</MsgContent>

                        {msg.attachments.length > 0 && (
                          <MsgAttachments>
                            {msg.attachments.map((att, i) => {
                              const href = safeAttachmentUrl(att.url);
                              if (!href) return null;
                              return att.type === "image" ? (
                                <AttachThumb
                                  key={i}
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <img src={href} alt={att.name} />
                                </AttachThumb>
                              ) : (
                                <AttachFile
                                  key={i}
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  📎 {att.name}
                                </AttachFile>
                              );
                            })}
                          </MsgAttachments>
                        )}

                        {msg.reactions.length > 0 && (
                          <ReactionBar>
                            {msg.reactions.map((r) => (
                              <ReactionChip
                                key={r.emoji}
                                $active={
                                  !!user &&
                                  r.users.some((u) => u.id === user.id)
                                }
                                onClick={() => {
                                  if (!user) return;
                                  reactMut.mutate({
                                    msgId: msg.id,
                                    emoji: r.emoji,
                                  });
                                }}
                                title={r.users
                                  .map((u) => u.username)
                                  .join(", ")}
                              >
                                {r.emoji} {r.users.length}
                              </ReactionChip>
                            ))}
                          </ReactionBar>
                        )}

                        <MsgActions>
                          {user && (
                            <div style={{ position: "relative" }}>
                              <MsgActBtn
                                onClick={() =>
                                  setShowEmojiFor(
                                    showEmojiFor === msg.id ? null : msg.id
                                  )
                                }
                              >
                                React
                              </MsgActBtn>
                              {showEmojiFor === msg.id && (
                                <EmojiPicker>
                                  {EMOJI_QUICK.map((e) => (
                                    <button
                                      key={e}
                                      onClick={() =>
                                        reactMut.mutate({
                                          msgId: msg.id,
                                          emoji: e,
                                        })
                                      }
                                    >
                                      {e}
                                    </button>
                                  ))}
                                </EmojiPicker>
                              )}
                            </div>
                          )}
                          {user && ch.canPost && (
                            <MsgActBtn
                              onClick={() => {
                                setReplyTo({
                                  id: msg.id,
                                  username: msg.username,
                                  displayName: msg.displayName,
                                  content: msg.content,
                                });
                                setTimeout(() => composeRef.current?.focus(), 0);
                              }}
                            >
                              Reply
                            </MsgActBtn>
                          )}
                          {canPin && (
                            <MsgActBtn
                              onClick={() =>
                                pinMsgMut.mutate({
                                  id: msg.id,
                                  pinned: !msg.pinned,
                                })
                              }
                            >
                              {msg.pinned ? "Unpin" : "Pin"}
                            </MsgActBtn>
                          )}
                          {canDelete && user && msg.userId === user.id && (
                            <MsgActBtn
                              onClick={() => {
                                setEditingMessageTarget(msg);
                                setEditingMessageText(msg.content);
                              }}
                            >
                              Edit
                            </MsgActBtn>
                          )}
                          {canDelete && (
                            <MsgActBtn
                              onClick={() => setDeleteMessageTarget(msg)}
                            >
                              Delete
                            </MsgActBtn>
                          )}
                        </MsgActions>
                      </MsgBody>
                    </MsgRow>
                  );
                })}
                <div ref={msgEndRef} />
              </MsgScroll>

              {/* compose */}
              <Compose>
                {!user ? (
                  <StatusText>Log in to post messages.</StatusText>
                ) : !ch.canPost ? (
                  <StatusText>
                    {ch.locked
                      ? "Channel locked."
                      : "Your role cannot post here."}
                  </StatusText>
                ) : (
                  <>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                      {replyTo && (
                        <ReplyingBar>
                          <span>
                            Replying to{" "}
                            <strong>
                              {replyTo.displayName || replyTo.username || `#${replyTo.id}`}
                            </strong>
                            : {snippet(replyTo.content)}
                          </span>
                          <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                            <Button
                              size="sm"
                              onClick={() => jumpToReply(replyTo.id)}
                              style={{ fontSize: 10, padding: "1px 6px" }}
                            >
                              Jump
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => setReplyTo(null)}
                              style={{ fontSize: 10, padding: "1px 6px" }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </ReplyingBar>
                      )}
                      <ComposeArea
                        ref={composeRef}
                        value={msgText}
                        onChange={(e) => setMsgText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={
                          replyTo
                            ? `Reply to ${replyTo.displayName || replyTo.username || "message"}… (Enter send, Shift+Enter newline)`
                            : `Message #${ch.title}… (Enter send, Shift+Enter newline)`
                        }
                        disabled={sendMsgMut.isPending}
                      />
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 3,
                      }}
                    >
                      <TextInput
                        value={attachUrl}
                        onChange={(e: any) => setAttachUrl(e.target.value)}
                        placeholder="Attach URL"
                        style={{ fontSize: 10, width: 120 }}
                      />
                      <Button
                        disabled={
                          (!msgText.trim() && !attachUrl.trim()) ||
                          sendMsgMut.isPending
                        }
                        onClick={handleSend}
                        style={{ minWidth: 64 }}
                      >
                        {sendMsgMut.isPending ? "..." : "Send"}
                      </Button>
                    </div>
                  </>
                )}
              </Compose>
            </>
          )}
        </MainCol>
      </Shell>

      {/* settings modal */}
      {showSettings && ch && (
        <ChannelSettings
          channel={ch}
          onClose={() => setShowSettings(false)}
        />
      )}

      {channelManageTarget && (
        <InlineDialog
          title={`Manage #${channelManageTarget.title}`}
          onClose={() => setChannelManageTarget(null)}
          width={460}
        >
          <div style={{ fontSize: 12 }}>
            Pick an action for <strong>#{channelManageTarget.title}</strong>.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <Button
              size="sm"
              onClick={() =>
                modChMut.mutate({
                  id: channelManageTarget.id,
                  locked: true,
                })
              }
            >
              Lock
            </Button>
            <Button
              size="sm"
              onClick={() =>
                modChMut.mutate({
                  id: channelManageTarget.id,
                  locked: false,
                })
              }
            >
              Unlock
            </Button>
            <Button
              size="sm"
              onClick={() =>
                modChMut.mutate({
                  id: channelManageTarget.id,
                  active: false,
                })
              }
            >
              Archive
            </Button>
            <Button
              size="sm"
              onClick={() =>
                modChMut.mutate({
                  id: channelManageTarget.id,
                  active: true,
                })
              }
            >
              Unarchive
            </Button>
            <Button
              size="sm"
              onClick={() => deleteChMut.mutate(channelManageTarget.id)}
            >
              Delete
            </Button>
            <Button size="sm" onClick={() => setChannelManageTarget(null)}>
              Close
            </Button>
          </div>
        </InlineDialog>
      )}

      {categoryManageTarget && (
        <InlineDialog
          title={`Manage Category: ${categoryManageTarget.name}`}
          onClose={() => setCategoryManageTarget(null)}
          width={460}
        >
          <TextInput
            value={categoryRenameInput}
            onChange={(e: any) => setCategoryRenameInput(e.target.value)}
            placeholder="Category name"
            fullWidth
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <Button
              size="sm"
              disabled={!categoryRenameInput.trim() || renameCatMut.isPending}
              onClick={() =>
                renameCatMut.mutate({
                  id: categoryManageTarget.id,
                  name: categoryRenameInput.trim(),
                })
              }
            >
              Rename
            </Button>
            <Button
              size="sm"
              disabled={deleteCatMut.isPending}
              onClick={() => deleteCatMut.mutate(categoryManageTarget.id)}
            >
              Delete
            </Button>
            <Button size="sm" onClick={() => setCategoryManageTarget(null)}>
              Close
            </Button>
          </div>
        </InlineDialog>
      )}

      {editingMessageTarget && (
        <InlineDialog
          title="Edit Message"
          onClose={() => {
            setEditingMessageTarget(null);
            setEditingMessageText("");
          }}
          width={520}
        >
          <textarea
            value={editingMessageText}
            onChange={(e) => setEditingMessageText(e.target.value)}
            rows={4}
            style={{ width: "100%", fontFamily: "inherit", fontSize: 12 }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            <Button
              size="sm"
              disabled={!editingMessageText.trim() || editMsgMut.isPending}
              onClick={() =>
                editMsgMut.mutate({
                  id: editingMessageTarget.id,
                  content: editingMessageText.trim(),
                })
              }
            >
              Save
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditingMessageTarget(null);
                setEditingMessageText("");
              }}
            >
              Cancel
            </Button>
          </div>
        </InlineDialog>
      )}

      {deleteMessageTarget && (
        <InlineDialog
          title="Delete Message?"
          onClose={() => setDeleteMessageTarget(null)}
          width={420}
        >
          <div style={{ fontSize: 12 }}>
            This will permanently delete the selected message.
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            <Button
              size="sm"
              disabled={deleteMsgMut.isPending}
              onClick={() => deleteMsgMut.mutate(deleteMessageTarget.id)}
            >
              Delete
            </Button>
            <Button size="sm" onClick={() => setDeleteMessageTarget(null)}>
              Cancel
            </Button>
          </div>
        </InlineDialog>
      )}
    </AppWindow>
  );
}
