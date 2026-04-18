/**
 * Studio project 3-panel workspace.
 *
 *   ┌── Tree ──┬─────── Preview + annotations ───────┬── Chat + notes ──┐
 *   │ folders  │ active file w/ overlay              │ messages         │
 *   │ files    │ annotation toolbar                  │ pins / activity  │
 *   │ uploads  │ cursor / presence                   │ composer         │
 *   └──────────┴─────────────────────────────────────┴──────────────────┘
 *
 * The three panels stay in sync via the `useStudioSocket` hook: tree
 * invalidates on file/member/folder events, preview mounts annotation
 * overlays, chat appends messages as they land.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  GroupBox,
  Hourglass,
  Panel,
  Separator,
  TextInput,
  Tooltip,
} from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { useAuth } from "../lib/auth-context";
import { useWindowManager } from "../lib/window-context";
import { api } from "../lib/api";
import {
  STUDIO_ANNOTATION_KINDS,
  STUDIO_MEMBER_ROLE_LABELS,
  studioRoleCanAnnotate,
  studioRoleCanChat,
  studioRoleCanEditFiles,
  studioRoleCanManageProject,
  type StudioAnnotationKind,
  type StudioMemberRole,
  type StudioMemberSummary,
  type StudioPresenceEntry,
  type StudioStorageBackend,
} from "@shared/types";
import { MOBILE } from "../global-styles";
import {
  useStudioSocket,
  type StudioSocketEvent,
} from "../lib/studio-socket";

void STUDIO_ANNOTATION_KINDS;

/* ── Types ───────────────────────────────────────────── */

interface Folder {
  id: number;
  name: string;
  parentFolderId: number | null;
  position: number;
}

interface StudioFileRow {
  id: number;
  folderId: number | null;
  name: string;
  mimeType: string;
  sizeBytes: number;
  previewUrl: string | null;
  thumbnailUrl: string | null;
  currentVersion: number;
  uploaderId: number | null;
  uploaderDisplayName: string | null;
  metadata: Record<string, unknown> | null;
  position: number;
  updatedAt: string;
}

interface ProjectDetail {
  project: {
    id: number;
    name: string;
    description: string | null;
    ownerUserId: number;
    coverImageUrl: string | null;
    storageBackend: StudioStorageBackend;
    storageContext: unknown;
    storageQuotaBytes: number;
    storageUsedBytes: number;
    conversationId: number | null;
    archived: boolean;
    createdAt: string;
    updatedAt: string;
  };
  role: StudioMemberRole;
  isPlatformModerator: boolean;
  members: StudioMemberSummary[];
  folders: Folder[];
  files: StudioFileRow[];
  userState:
    | {
        lastOpenProjectId: number | null;
        state: Record<string, unknown>;
        updatedAt: string;
      }
    | null;
}

interface AnnotationComment {
  id: number;
  annotationId: number;
  authorId: number;
  authorDisplayName: string | null;
  body: string;
  createdAt: string;
  editedAt: string | null;
}

interface Annotation {
  id: number;
  fileId: number;
  versionId: number | null;
  authorUserId: number;
  authorDisplayName: string | null;
  kind: StudioAnnotationKind;
  position: { x?: number; y?: number; w?: number; h?: number };
  data: { body?: string; [key: string]: unknown };
  color: string | null;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
  comments: AnnotationComment[];
}

interface AnnotationsResponse {
  annotations: Annotation[];
}

interface ChatMessage {
  id: number;
  conversationId: number;
  senderId: number;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  role?: string;
  content: string;
  messageType: string | null;
  metadata: Record<string, unknown> | null;
  pinned: boolean;
  createdAt: string;
  editedAt: string | null;
}

/* ── Styles ──────────────────────────────────────────── */

const Shell = styled.div`
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

const Column = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  min-width: 0;
`;

const PanelBody = styled(Panel).attrs({ variant: "well" })`
  flex: 1;
  min-height: 0;
  padding: 6px;
  overflow: auto;
`;

const ToolBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 4px;
  background: #c3c7cb;
  border: 2px solid #fff;
  border-right-color: #808080;
  border-bottom-color: #808080;
`;

const ToolButton = styled(Button)<{ $active?: boolean }>`
  min-width: 28px;
  ${(p) => p.$active && `font-weight: bold; background: #fffbcc !important;`}
`;

const ProjectHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 8px;
  background: linear-gradient(90deg, #000080, #1084d0);
  color: #fff;
  font-size: 12px;
  font-weight: bold;
`;

const Breadcrumbs = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #fff;
`;

const HeaderMeta = styled.div`
  display: flex;
  gap: 6px;
  font-size: 10px;
  font-weight: normal;
  color: #dce8ff;
`;

const TreeNode = styled.div<{ $depth?: number; $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px 2px ${(p) => (p.$depth ?? 0) * 12 + 4}px;
  font-size: 12px;
  cursor: pointer;
  background: ${(p) => (p.$active ? "#000080" : "transparent")};
  color: ${(p) => (p.$active ? "#fff" : "#000")};

  &:hover {
    background: ${(p) => (p.$active ? "#000080" : "#e4e4e4")};
  }
`;

const FileThumb = styled.div`
  width: 18px;
  height: 18px;
  background: #1a1a1a;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
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

const PreviewStage = styled.div`
  flex: 1;
  min-height: 0;
  position: relative;
  background: repeating-linear-gradient(
    45deg,
    #a9a9a9,
    #a9a9a9 8px,
    #b5b5b5 8px,
    #b5b5b5 16px
  );
  overflow: hidden;
`;

const PreviewFrame = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const PreviewMedia = styled.div`
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

const AnnotationOverlay = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: auto;
  cursor: crosshair;
`;

const PinMarker = styled.button<{ $resolved?: boolean; $selected?: boolean }>`
  position: absolute;
  transform: translate(-50%, -100%);
  background: ${(p) =>
    p.$resolved ? "#6a6a6a" : p.$selected ? "#1fbb38" : "#ff3366"};
  color: #fff;
  border: 2px solid #000;
  border-radius: 50% 50% 50% 0;
  width: 22px;
  height: 22px;
  font-weight: bold;
  cursor: pointer;
  font-size: 11px;
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

const RectMarker = styled.div<{ $resolved?: boolean; $selected?: boolean }>`
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

const CursorGhost = styled.div`
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

const CursorLabel = styled.span`
  position: absolute;
  top: 10px;
  left: 10px;
  background: #000;
  color: #fff;
  font-size: 9px;
  padding: 1px 4px;
  white-space: nowrap;
  border-radius: 2px;
`;

const PendingRect = styled.div`
  position: absolute;
  border: 2px dashed #0066ff;
  background: rgba(0, 102, 255, 0.1);
  pointer-events: none;
`;

const AnnotationPopover = styled.div<{ $x: number; $y: number }>`
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
    font-size: 12px;
    padding: 4px;
    box-sizing: border-box;
    resize: vertical;
  }
`;

const ChatMessageRow = styled.div<{ $system?: boolean }>`
  margin-bottom: 6px;
  padding: 4px 6px;
  background: ${(p) => (p.$system ? "#e9eef7" : "transparent")};
  border-left: ${(p) =>
    p.$system ? "3px solid #000080" : "3px solid transparent"};
  font-size: 12px;
`;

const ChatMeta = styled.div`
  font-size: 10px;
  color: #555;
  display: flex;
  justify-content: space-between;
  gap: 6px;
`;

const ChatBody = styled.div`
  word-break: break-word;
  white-space: pre-wrap;
`;

const PresenceChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  background: #c3f0c3;
  padding: 1px 6px;
  border: 1px solid #1a6a1a;
`;

const ErrorBanner = styled.div`
  background: #ffe2e2;
  border: 1px solid #c06060;
  padding: 6px 8px;
  font-size: 12px;
  color: #800;
  margin-bottom: 4px;
`;

/* ── Helpers ─────────────────────────────────────────── */

function categorize(mime: string): "image" | "video" | "audio" | "pdf" | "other" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  return "other";
}

function fileGlyph(category: ReturnType<typeof categorize>): string {
  switch (category) {
    case "image":
      return "🖼";
    case "video":
      return "🎬";
    case "audio":
      return "🎵";
    case "pdf":
      return "📄";
    default:
      return "📎";
  }
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  return sameDay
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleString();
}

/* ── Component ───────────────────────────────────────── */

interface StudioProjectProps {
  projectId: string;
}

export function StudioProject({ projectId }: StudioProjectProps) {
  const numericProjectId = Number(projectId);
  const validProjectId = Number.isInteger(numericProjectId) && numericProjectId > 0;

  const { user } = useAuth();
  const wm = useWindowManager();
  const qc = useQueryClient();

  const socket = useStudioSocket(validProjectId ? numericProjectId : null);

  const [activeFileId, setActiveFileId] = useState<number | null>(null);
  const [tool, setTool] = useState<"cursor" | "pin" | "rect">("cursor");
  const [pendingRect, setPendingRect] = useState<
    | {
        x: number;
        y: number;
        w: number;
        h: number;
        stageRect: DOMRect;
      }
    | null
  >(null);
  const [pendingAnnotation, setPendingAnnotation] = useState<
    | {
        kind: "pin" | "rect";
        position: { x?: number; y?: number; w?: number; h?: number };
        draftBody: string;
      }
    | null
  >(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<number | null>(
    null
  );
  const [chatDraft, setChatDraft] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [presence, setPresence] = useState<StudioPresenceEntry[]>([]);
  const [cursors, setCursors] = useState<
    Record<
      number,
      { userId: number; username: string; x: number; y: number; fileId: number; ts: number }
    >
  >({});
  const [inviteUserId, setInviteUserId] = useState("");

  const stageRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* ── Queries ─────────────────────────────────────── */

  const projectQuery = useQuery({
    queryKey: ["studio", "project", numericProjectId],
    queryFn: () =>
      api.get<ProjectDetail>(`/api/studio/projects/${numericProjectId}`),
    enabled: !!user && validProjectId,
    staleTime: 5_000,
  });

  const activeFile = useMemo(() => {
    if (!projectQuery.data || activeFileId == null) return null;
    return (
      projectQuery.data.files.find((f) => f.id === activeFileId) ?? null
    );
  }, [projectQuery.data, activeFileId]);

  const annotationsQuery = useQuery({
    queryKey: ["studio", "annotations", activeFileId],
    queryFn: () =>
      api.get<AnnotationsResponse>(
        `/api/studio/files/${activeFileId}/annotations`
      ),
    enabled: activeFileId != null,
    staleTime: 2_000,
  });

  const conversationId = projectQuery.data?.project.conversationId ?? null;

  const chatQuery = useQuery({
    queryKey: ["studio", "chat", conversationId],
    queryFn: () =>
      api.get<ChatMessage[]>(
        `/api/messages/dms/${conversationId}/messages?limit=80`
      ),
    enabled: conversationId != null,
    staleTime: 2_000,
  });

  const pinsQuery = useQuery({
    queryKey: ["studio", "pins", conversationId],
    queryFn: () =>
      api.get<ChatMessage[]>(`/api/messages/dms/${conversationId}/pins`),
    enabled: conversationId != null,
    staleTime: 10_000,
  });

  /* ── Mutations ───────────────────────────────────── */

  const createFolderMutation = useMutation({
    mutationFn: (input: { name: string; parentFolderId: number | null }) =>
      api.post(`/api/studio/projects/${numericProjectId}/folders`, input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["studio", "project", numericProjectId] }),
  });

  const uploadMutation = useMutation({
    mutationFn: async ({
      file,
      folderId,
    }: {
      file: File;
      folderId: number | null;
    }) => {
      const form = new FormData();
      form.append("file", file);
      if (folderId != null) {
        form.append("folderId", String(folderId));
      }
      const resp = await fetch(
        `/api/studio/projects/${numericProjectId}/files`,
        {
          method: "POST",
          credentials: "include",
          body: form,
        }
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }
      return resp.json();
    },
    onSuccess: () => {
      setUploadError(null);
      qc.invalidateQueries({
        queryKey: ["studio", "project", numericProjectId],
      });
    },
    onError: (err: Error) => setUploadError(err.message),
  });

  const deleteFileMutation = useMutation({
    mutationFn: (fileId: number) => api.delete(`/api/studio/files/${fileId}`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["studio", "project", numericProjectId] }),
  });

  const renameFileMutation = useMutation({
    mutationFn: ({ fileId, name }: { fileId: number; name: string }) =>
      api.patch(`/api/studio/files/${fileId}`, { name }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["studio", "project", numericProjectId] }),
  });

  const createAnnotationMutation = useMutation({
    mutationFn: (input: {
      fileId: number;
      kind: "pin" | "rect";
      position: Record<string, unknown>;
      data: Record<string, unknown>;
    }) =>
      api.post(`/api/studio/files/${input.fileId}/annotations`, {
        kind: input.kind,
        position: input.position,
        data: input.data,
      }),
    onSuccess: () => {
      setPendingAnnotation(null);
      setPendingRect(null);
      if (activeFileId != null) {
        qc.invalidateQueries({
          queryKey: ["studio", "annotations", activeFileId],
        });
      }
    },
  });

  const updateAnnotationMutation = useMutation({
    mutationFn: (input: { id: number; patch: Record<string, unknown> }) =>
      api.patch(`/api/studio/annotations/${input.id}`, input.patch),
    onSuccess: () => {
      if (activeFileId != null) {
        qc.invalidateQueries({
          queryKey: ["studio", "annotations", activeFileId],
        });
      }
    },
  });

  const deleteAnnotationMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/studio/annotations/${id}`),
    onSuccess: () => {
      setSelectedAnnotationId(null);
      if (activeFileId != null) {
        qc.invalidateQueries({
          queryKey: ["studio", "annotations", activeFileId],
        });
      }
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: ({
      annotationId,
      body,
    }: {
      annotationId: number;
      body: string;
    }) =>
      api.post(`/api/studio/annotations/${annotationId}/comments`, { body }),
    onSuccess: () => {
      if (activeFileId != null) {
        qc.invalidateQueries({
          queryKey: ["studio", "annotations", activeFileId],
        });
      }
    },
  });

  const sendChatMutation = useMutation({
    mutationFn: ({
      content,
      messageType,
    }: {
      content: string;
      messageType?: string;
    }) =>
      api.post(`/api/messages/dms/${conversationId}/messages`, {
        content,
        messageType: messageType ?? "text",
      }),
    onSuccess: () => {
      setChatDraft("");
      setChatError(null);
      qc.invalidateQueries({ queryKey: ["studio", "chat", conversationId] });
    },
    onError: (err: Error) => setChatError(err.message || "Failed to send"),
  });

  const togglePinMutation = useMutation({
    mutationFn: ({
      messageId,
      pinned,
    }: {
      messageId: number;
      pinned: boolean;
    }) =>
      api.put(
        `/api/messages/dms/${conversationId}/messages/${messageId}/pin`,
        { pinned }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["studio", "pins", conversationId] });
      qc.invalidateQueries({ queryKey: ["studio", "chat", conversationId] });
    },
  });

  const inviteMutation = useMutation({
    mutationFn: ({ userId }: { userId: number }) =>
      api.post(`/api/studio/projects/${numericProjectId}/members`, {
        userId,
        role: "editor",
      }),
    onSuccess: () => {
      setInviteUserId("");
      qc.invalidateQueries({ queryKey: ["studio", "project", numericProjectId] });
    },
  });

  /* ── Socket wiring ────────────────────────────────── */

  useEffect(() => {
    return socket.subscribe((event: StudioSocketEvent) => {
      switch (event.type) {
        case "studio_presence_snapshot":
          setPresence(
            Array.isArray(event.presence)
              ? (event.presence as StudioPresenceEntry[])
              : []
          );
          break;
        case "studio_presence_joined":
          setPresence((prev) => {
            const other = prev.filter((p) => p.userId !== event.userId);
            return [
              ...other,
              {
                userId: Number(event.userId),
                username: String(event.username ?? ""),
                role: (event.role ?? "witness") as any,
                viewingFileId: null,
              },
            ];
          });
          break;
        case "studio_presence_left":
          setPresence((prev) =>
            prev.filter((p) => p.userId !== Number(event.userId))
          );
          setCursors((prev) => {
            const next = { ...prev };
            delete next[Number(event.userId)];
            return next;
          });
          break;
        case "studio_presence_updated":
          setPresence((prev) =>
            prev.map((p) =>
              p.userId === Number(event.userId)
                ? {
                    ...p,
                    viewingFileId:
                      event.viewingFileId != null
                        ? Number(event.viewingFileId)
                        : null,
                  }
                : p
            )
          );
          break;
        case "studio_cursor":
          setCursors((prev) => ({
            ...prev,
            [Number(event.userId)]: {
              userId: Number(event.userId),
              username: String(event.username ?? ""),
              x: Number(event.x ?? 0),
              y: Number(event.y ?? 0),
              fileId: Number(event.fileId ?? 0),
              ts: Date.now(),
            },
          }));
          break;
        case "studio_file_uploaded":
        case "studio_file_updated":
        case "studio_file_deleted":
        case "studio_folder_created":
        case "studio_folder_updated":
        case "studio_folder_deleted":
        case "studio_member_joined":
        case "studio_member_role_changed":
        case "studio_member_removed":
        case "studio_project_updated":
          qc.invalidateQueries({
            queryKey: ["studio", "project", numericProjectId],
          });
          break;
        case "studio_annotation_added":
        case "studio_annotation_updated":
        case "studio_annotation_deleted":
        case "studio_annotation_comment_added":
          if (activeFileId != null && event.fileId === activeFileId) {
            qc.invalidateQueries({
              queryKey: ["studio", "annotations", activeFileId],
            });
          }
          break;
        case "studio_chat_message":
          if (conversationId != null) {
            qc.invalidateQueries({
              queryKey: ["studio", "chat", conversationId],
            });
          }
          break;
        case "studio_chat_pin_changed":
          if (conversationId != null) {
            qc.invalidateQueries({
              queryKey: ["studio", "pins", conversationId],
            });
            qc.invalidateQueries({
              queryKey: ["studio", "chat", conversationId],
            });
          }
          break;
        case "studio_project_deleted":
          qc.removeQueries({
            queryKey: ["studio", "project", numericProjectId],
          });
          wm.close(`/studio/${numericProjectId}`);
          break;
      }
    });
  }, [socket, qc, numericProjectId, activeFileId, conversationId, wm]);

  // Stale-cursor sweep so users who go silent fade away.
  useEffect(() => {
    const id = window.setInterval(() => {
      setCursors((prev) => {
        const cutoff = Date.now() - 4000;
        const next: typeof prev = {};
        for (const entry of Object.values(prev)) {
          if (entry.ts >= cutoff) next[entry.userId] = entry;
        }
        return next;
      });
    }, 1500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (activeFileId != null) {
      socket.openFile(activeFileId);
    } else {
      socket.closeFile();
    }
  }, [activeFileId, socket]);

  // Auto-select first file when project loads. Prefer the file most recently
  // persisted for this user in `studio_user_state` so the room opens right
  // where they left off.
  useEffect(() => {
    if (activeFileId != null || !projectQuery.data) return;
    const persisted = projectQuery.data.userState?.state as
      | { lastOpenFileByProject?: Record<string, number> }
      | null
      | undefined;
    const stored = persisted?.lastOpenFileByProject?.[String(numericProjectId)];
    const fallback = projectQuery.data.files[0]?.id;
    const candidate =
      stored && projectQuery.data.files.some((f) => f.id === stored)
        ? stored
        : fallback;
    if (candidate != null) {
      setActiveFileId(candidate);
    }
  }, [projectQuery.data, activeFileId, numericProjectId]);

  // Persist session state: the active project is "where you were", and the
  // active file is stored under `state.lastOpenFileByProject` so we can
  // resume per-project.  Debounced so tabbing through files doesn't spam.
  useEffect(() => {
    if (!projectQuery.data) return;
    const existingByProject =
      (projectQuery.data.userState?.state as
        | { lastOpenFileByProject?: Record<string, number> }
        | null) ?.lastOpenFileByProject ?? {};
    const nextByProject = { ...existingByProject };
    if (activeFileId != null) {
      nextByProject[String(numericProjectId)] = activeFileId;
    } else {
      delete nextByProject[String(numericProjectId)];
    }
    const handle = window.setTimeout(() => {
      // `/api/studio/user-state` returns 204 so we call fetch directly to
      // avoid the json parse that `api.patch` would attempt.
      fetch("/api/studio/user-state", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lastOpenProjectId: numericProjectId,
          state: { lastOpenFileByProject: nextByProject },
        }),
      }).catch(() => {
        // Non-critical; swallow network failures silently.
      });
    }, 600);
    return () => window.clearTimeout(handle);
  }, [projectQuery.data, activeFileId, numericProjectId]);

  /* ── Stage pointer handlers ──────────────────────── */

  function toFractional(
    clientX: number,
    clientY: number,
    rect: DOMRect
  ): { x: number; y: number } {
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  }

  function handleStagePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!activeFileId || !stageRef.current) return;
    if (tool === "cursor") return;
    const role = projectQuery.data?.role;
    if (!role || !studioRoleCanAnnotate(role)) return;
    const rect = stageRef.current.getBoundingClientRect();
    const { x, y } = toFractional(e.clientX, e.clientY, rect);

    if (tool === "pin") {
      setPendingAnnotation({
        kind: "pin",
        position: { x, y },
        draftBody: "",
      });
    } else if (tool === "rect") {
      setPendingRect({ x, y, w: 0, h: 0, stageRect: rect });
    }
  }

  function handleStagePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!stageRef.current || !activeFileId) return;
    const rect = stageRef.current.getBoundingClientRect();
    const { x, y } = toFractional(e.clientX, e.clientY, rect);

    if (pendingRect) {
      setPendingRect({
        ...pendingRect,
        w: x - pendingRect.x,
        h: y - pendingRect.y,
      });
    }
    socket.cursor(activeFileId, x, y);
  }

  function handleStagePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pendingRect || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const { x, y } = toFractional(e.clientX, e.clientY, rect);
    const x0 = Math.min(pendingRect.x, x);
    const y0 = Math.min(pendingRect.y, y);
    const w = Math.abs(x - pendingRect.x);
    const h = Math.abs(y - pendingRect.y);

    if (w < 0.005 || h < 0.005) {
      setPendingRect(null);
      return;
    }

    setPendingAnnotation({
      kind: "rect",
      position: { x: x0, y: y0, w, h },
      draftBody: "",
    });
    setPendingRect(null);
  }

  /* ── Derived UI data ─────────────────────────────── */

  const folderTree = useMemo(() => {
    const folders = projectQuery.data?.folders ?? [];
    const files = projectQuery.data?.files ?? [];

    const byParent = new Map<number | null, Folder[]>();
    for (const f of folders) {
      const list = byParent.get(f.parentFolderId) ?? [];
      list.push(f);
      byParent.set(f.parentFolderId, list);
    }

    const filesByFolder = new Map<number | null, StudioFileRow[]>();
    for (const file of files) {
      const list = filesByFolder.get(file.folderId) ?? [];
      list.push(file);
      filesByFolder.set(file.folderId, list);
    }

    return { byParent, filesByFolder };
  }, [projectQuery.data]);

  function renderFolder(parentId: number | null, depth: number): ReactElement[] {
    const children = folderTree.byParent.get(parentId) ?? [];
    const filesHere = folderTree.filesByFolder.get(parentId) ?? [];
    const nodes: ReactElement[] = [];

    for (const folder of children) {
      nodes.push(
        <TreeNode key={`folder-${folder.id}`} $depth={depth}>
          <span>📁</span>
          <span style={{ flex: 1 }}>{folder.name}</span>
        </TreeNode>
      );
      nodes.push(...renderFolder(folder.id, depth + 1));
    }

    for (const file of filesHere) {
      const category = categorize(file.mimeType);
      const isActive = activeFileId === file.id;
      nodes.push(
        <TreeNode
          key={`file-${file.id}`}
          $depth={depth}
          $active={isActive}
          onClick={() => setActiveFileId(file.id)}
        >
          <FileThumb>
            {file.thumbnailUrl ? (
              <img src={file.thumbnailUrl} alt="" />
            ) : (
              <span>{fileGlyph(category)}</span>
            )}
          </FileThumb>
          <span
            style={{
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {file.name}
          </span>
        </TreeNode>
      );
    }

    return nodes;
  }

  /* ── Render guards ───────────────────────────────── */

  if (!validProjectId) {
    return (
      <AppWindow title="Studio">
        <div style={{ padding: 16 }}>Invalid project id.</div>
      </AppWindow>
    );
  }
  if (!user) {
    return (
      <AppWindow title="Studio">
        <div style={{ padding: 16 }}>Sign in to view this project.</div>
      </AppWindow>
    );
  }
  if (projectQuery.isLoading) {
    return (
      <AppWindow title="Studio">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
          }}
        >
          <Hourglass size={32} />
        </div>
      </AppWindow>
    );
  }
  if (projectQuery.isError || !projectQuery.data) {
    return (
      <AppWindow title="Studio">
        <ErrorBanner>
          {(projectQuery.error as Error)?.message ||
            "Unable to load this Studio project."}
        </ErrorBanner>
      </AppWindow>
    );
  }

  const project = projectQuery.data.project;
  const role = projectQuery.data.role;
  const canEdit = studioRoleCanEditFiles(role);
  const canAnnotate = studioRoleCanAnnotate(role);
  const canChat = studioRoleCanChat(role);
  const canManage = studioRoleCanManageProject(role);
  const annotations = annotationsQuery.data?.annotations ?? [];
  const chatMessages = chatQuery.data ?? [];
  const pinnedMessages = pinsQuery.data ?? [];
  const activeFileCategory = activeFile
    ? categorize(activeFile.mimeType)
    : "other";
  const visibleCursors = Object.values(cursors).filter(
    (c) => c.fileId === activeFileId && c.userId !== user.id
  );

  /* ── Render ─────────────────────────────────────── */

  return (
    <AppWindow title={`Studio: ${project.name}`}>
      <Shell>
        {/* ─── LEFT PANEL: Tree / files / upload ─── */}
        <Column>
          <GroupBox label="Project">
            <div style={{ fontSize: 12 }}>
              <div style={{ fontWeight: "bold" }}>{project.name}</div>
              {project.description ? (
                <div style={{ color: "#555", marginTop: 2 }}>
                  {project.description}
                </div>
              ) : null}
              <div style={{ color: "#555", marginTop: 4, fontSize: 11 }}>
                {STUDIO_MEMBER_ROLE_LABELS[role]} ·{" "}
                {formatBytes(project.storageUsedBytes)} /{" "}
                {formatBytes(project.storageQuotaBytes)}
              </div>
            </div>
          </GroupBox>

          <GroupBox label="Files" style={{ flex: 1, minHeight: 0 }}>
            <PanelBody>
              {renderFolder(null, 0)}
              {folderTree.byParent.size === 0 &&
                (folderTree.filesByFolder.get(null) ?? []).length === 0 && (
                  <div
                    style={{ fontSize: 11, color: "#666", padding: "6px 4px" }}
                  >
                    Nothing here yet. Upload a file or create a folder below.
                  </div>
                )}
            </PanelBody>
          </GroupBox>

          {canEdit ? (
            <GroupBox label="Add">
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  padding: 4,
                }}
              >
                {uploadError ? (
                  <ErrorBanner>{uploadError}</ErrorBanner>
                ) : null}
                <div style={{ display: "flex", gap: 4 }}>
                  <Button
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadMutation.isPending}
                  >
                    {uploadMutation.isPending ? "Uploading…" : "Upload file"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      const name = window.prompt("Folder name?");
                      if (!name) return;
                      createFolderMutation.mutate({
                        name,
                        parentFolderId: null,
                      });
                    }}
                    disabled={createFolderMutation.isPending}
                  >
                    New folder
                  </Button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: "none" }}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const folderId = activeFile?.folderId ?? null;
                    uploadMutation.mutate({ file, folderId });
                    e.target.value = "";
                  }}
                />
              </div>
            </GroupBox>
          ) : null}
        </Column>

        {/* ─── CENTER PANEL: Preview + annotations ─── */}
        <Column>
          <ProjectHeader>
            <Breadcrumbs>
              <span>Projects</span>
              <span>›</span>
              <span>{project.name}</span>
              {activeFile ? (
                <>
                  <span>›</span>
                  <span>{activeFile.name}</span>
                </>
              ) : null}
            </Breadcrumbs>
            <HeaderMeta>
              {presence.length > 0 ? (
                <PresenceChip>
                  ● {presence.length + 1} here
                </PresenceChip>
              ) : (
                <PresenceChip>● just you</PresenceChip>
              )}
            </HeaderMeta>
          </ProjectHeader>

          <ToolBar>
            <ToolButton
              size="sm"
              $active={tool === "cursor"}
              onClick={() => setTool("cursor")}
            >
              ↖
            </ToolButton>
            <ToolButton
              size="sm"
              $active={tool === "pin"}
              disabled={!canAnnotate}
              onClick={() => setTool("pin")}
            >
              📍 Pin
            </ToolButton>
            <ToolButton
              size="sm"
              $active={tool === "rect"}
              disabled={!canAnnotate}
              onClick={() => setTool("rect")}
            >
              ▭ Box
            </ToolButton>
            <Separator orientation="vertical" />
            {activeFile ? (
              <>
                <span style={{ fontSize: 11, color: "#333" }}>
                  {activeFile.name} · {formatBytes(activeFile.sizeBytes)}
                </span>
                {canEdit ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() => {
                        const next = window.prompt(
                          "Rename file",
                          activeFile.name
                        );
                        if (!next || next === activeFile.name) return;
                        renameFileMutation.mutate({
                          fileId: activeFile.id,
                          name: next,
                        });
                      }}
                    >
                      Rename
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        if (
                          !window.confirm(`Delete "${activeFile.name}"?`)
                        )
                          return;
                        deleteFileMutation.mutate(activeFile.id);
                        setActiveFileId(null);
                      }}
                    >
                      Delete
                    </Button>
                  </>
                ) : null}
              </>
            ) : (
              <span style={{ fontSize: 11, color: "#555" }}>
                Select a file to preview
              </span>
            )}
          </ToolBar>

          <PreviewStage
            ref={stageRef}
            onPointerDown={handleStagePointerDown}
            onPointerMove={handleStagePointerMove}
            onPointerUp={handleStagePointerUp}
          >
            <PreviewFrame>
              <PreviewMedia>
                {!activeFile ? (
                  <div
                    style={{
                      color: "#fff",
                      textShadow: "1px 1px 1px rgba(0,0,0,0.4)",
                    }}
                  >
                    No file selected.
                  </div>
                ) : activeFileCategory === "image" ? (
                  <img
                    alt={activeFile.name}
                    src={
                      activeFile.previewUrl ||
                      `/api/studio/files/${activeFile.id}/raw`
                    }
                    draggable={false}
                  />
                ) : activeFileCategory === "video" ? (
                  <video
                    controls
                    src={`/api/studio/files/${activeFile.id}/raw`}
                  />
                ) : activeFileCategory === "audio" ? (
                  <audio
                    controls
                    src={`/api/studio/files/${activeFile.id}/raw`}
                  />
                ) : activeFileCategory === "pdf" ? (
                  <iframe
                    title={activeFile.name}
                    src={`/api/studio/files/${activeFile.id}/preview`}
                    style={{ width: 600, height: 800 }}
                  />
                ) : (
                  <div
                    style={{
                      background: "#fff",
                      padding: 20,
                      border: "1px solid #666",
                    }}
                  >
                    <div style={{ fontWeight: "bold" }}>
                      {activeFile.name}
                    </div>
                    <div style={{ fontSize: 11, color: "#555" }}>
                      {activeFile.mimeType} ·{" "}
                      {formatBytes(activeFile.sizeBytes)}
                    </div>
                    <a
                      href={`/api/studio/files/${activeFile.id}/raw`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download original
                    </a>
                  </div>
                )}
              </PreviewMedia>
            </PreviewFrame>

            {activeFile ? (
              <AnnotationOverlay>
                {annotations
                  .filter((a) => a.kind === "rect")
                  .map((a) => {
                    const pos = a.position as {
                      x: number;
                      y: number;
                      w: number;
                      h: number;
                    };
                    return (
                      <RectMarker
                        key={`rect-${a.id}`}
                        $resolved={a.resolved}
                        $selected={selectedAnnotationId === a.id}
                        style={{
                          left: `${pos.x * 100}%`,
                          top: `${pos.y * 100}%`,
                          width: `${pos.w * 100}%`,
                          height: `${pos.h * 100}%`,
                        }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setSelectedAnnotationId(a.id);
                        }}
                      />
                    );
                  })}

                {annotations
                  .filter((a) => a.kind === "pin" || a.kind === "sticky_note")
                  .map((a, index) => {
                    const pos = a.position as { x: number; y: number };
                    return (
                      <PinMarker
                        key={`pin-${a.id}`}
                        $resolved={a.resolved}
                        $selected={selectedAnnotationId === a.id}
                        style={{
                          left: `${pos.x * 100}%`,
                          top: `${pos.y * 100}%`,
                        }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setSelectedAnnotationId(a.id);
                        }}
                        title={String(a.data?.body ?? "")}
                      >
                        {index + 1}
                      </PinMarker>
                    );
                  })}

                {pendingRect ? (
                  <PendingRect
                    style={{
                      left: `${
                        Math.min(pendingRect.x, pendingRect.x + pendingRect.w) *
                        100
                      }%`,
                      top: `${
                        Math.min(pendingRect.y, pendingRect.y + pendingRect.h) *
                        100
                      }%`,
                      width: `${Math.abs(pendingRect.w) * 100}%`,
                      height: `${Math.abs(pendingRect.h) * 100}%`,
                    }}
                  />
                ) : null}

                {visibleCursors.map((c) => (
                  <CursorGhost
                    key={c.userId}
                    style={{
                      left: `${c.x * 100}%`,
                      top: `${c.y * 100}%`,
                    }}
                  >
                    <CursorLabel>{c.username}</CursorLabel>
                  </CursorGhost>
                ))}

                {pendingAnnotation ? (
                  <AnnotationPopover
                    $x={
                      (pendingAnnotation.position.x ?? 0) *
                      (stageRef.current?.clientWidth ?? 0)
                    }
                    $y={
                      ((pendingAnnotation.position.y ?? 0) +
                        (pendingAnnotation.position.h ?? 0)) *
                      (stageRef.current?.clientHeight ?? 0)
                    }
                  >
                    <div style={{ fontWeight: "bold", fontSize: 12 }}>
                      {pendingAnnotation.kind === "pin"
                        ? "New pin"
                        : "New box note"}
                    </div>
                    <textarea
                      autoFocus
                      value={pendingAnnotation.draftBody}
                      placeholder="What should your collaborators see here?"
                      onChange={(e) =>
                        setPendingAnnotation({
                          ...pendingAnnotation,
                          draftBody: e.target.value,
                        })
                      }
                    />
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: 4,
                        marginTop: 4,
                      }}
                    >
                      <Button
                        size="sm"
                        onClick={() => setPendingAnnotation(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        primary
                        disabled={createAnnotationMutation.isPending}
                        onClick={() => {
                          if (!activeFileId) return;
                          createAnnotationMutation.mutate({
                            fileId: activeFileId,
                            kind: pendingAnnotation.kind,
                            position: pendingAnnotation.position,
                            data: { body: pendingAnnotation.draftBody.trim() },
                          });
                        }}
                      >
                        Save
                      </Button>
                    </div>
                  </AnnotationPopover>
                ) : null}
              </AnnotationOverlay>
            ) : null}
          </PreviewStage>

          {selectedAnnotationId != null ? (
            <AnnotationDetailPanel
              annotation={
                annotations.find((a) => a.id === selectedAnnotationId) ?? null
              }
              canAnnotate={canAnnotate}
              onClose={() => setSelectedAnnotationId(null)}
              onAddComment={(body) =>
                addCommentMutation.mutate({
                  annotationId: selectedAnnotationId,
                  body,
                })
              }
              onToggleResolved={(resolved) =>
                updateAnnotationMutation.mutate({
                  id: selectedAnnotationId,
                  patch: { resolved },
                })
              }
              onDelete={() => deleteAnnotationMutation.mutate(selectedAnnotationId)}
            />
          ) : null}
        </Column>

        {/* ─── RIGHT PANEL: Chat + notes ─── */}
        <Column>
          <GroupBox label="Project chat" style={{ flex: 1, minHeight: 0 }}>
            <PanelBody>
              {chatQuery.isLoading ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                  }}
                >
                  <Hourglass size={24} />
                </div>
              ) : chatMessages.length === 0 ? (
                <div style={{ fontSize: 12, color: "#555" }}>
                  No messages yet. Kick off the async feedback loop.
                </div>
              ) : (
                chatMessages.map((m) => {
                  const isSystem = m.messageType === "studio_system";
                  return (
                    <ChatMessageRow key={m.id} $system={isSystem}>
                      <ChatMeta>
                        <span>
                          <strong>
                            {m.displayName || m.username || "Someone"}
                          </strong>{" "}
                          {isSystem ? "· system" : ""}
                        </span>
                        <span>{formatTimestamp(m.createdAt)}</span>
                      </ChatMeta>
                      <ChatBody>{m.content}</ChatBody>
                      {!isSystem ? (
                        <div style={{ marginTop: 2, textAlign: "right" }}>
                          <Button
                            size="sm"
                            onClick={() =>
                              togglePinMutation.mutate({
                                messageId: m.id,
                                pinned: !m.pinned,
                              })
                            }
                          >
                            {m.pinned ? "Unpin" : "Pin"}
                          </Button>
                        </div>
                      ) : null}
                    </ChatMessageRow>
                  );
                })
              )}
            </PanelBody>
          </GroupBox>

          {pinnedMessages.length > 0 ? (
            <GroupBox label={`Pinned notes (${pinnedMessages.length})`}>
              <div style={{ maxHeight: 120, overflowY: "auto", padding: 4 }}>
                {pinnedMessages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      fontSize: 11,
                      padding: 4,
                      borderBottom: "1px dashed #888",
                    }}
                  >
                    <strong>{m.displayName || m.username}:</strong> {m.content}
                  </div>
                ))}
              </div>
            </GroupBox>
          ) : null}

          {canChat ? (
            <GroupBox label="Say something">
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  padding: 4,
                }}
              >
                {chatError ? <ErrorBanner>{chatError}</ErrorBanner> : null}
                <TextInput
                  multiline
                  rows={3}
                  value={chatDraft}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                    setChatDraft(e.target.value);
                    socket.typing();
                  }}
                  placeholder="Feedback, references, or just vibes."
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 4,
                  }}
                >
                  <Button
                    size="sm"
                    onClick={() => {
                      const trimmed = chatDraft.trim();
                      if (!trimmed) return;
                      sendChatMutation.mutate({ content: trimmed });
                    }}
                    disabled={sendChatMutation.isPending}
                  >
                    {sendChatMutation.isPending ? "Sending…" : "Send"}
                  </Button>
                </div>
              </div>
            </GroupBox>
          ) : null}

          <GroupBox label="Members">
            <div style={{ padding: 4, fontSize: 12 }}>
              {projectQuery.data.members.map((m) => {
                const isOnline = presence.some((p) => p.userId === m.userId);
                return (
                  <div
                    key={m.userId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "2px 0",
                    }}
                  >
                    <span>
                      <span
                        style={{
                          display: "inline-block",
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: isOnline ? "#1fbb38" : "#c0c0c0",
                          marginRight: 6,
                        }}
                      />
                      <Tooltip
                        text={STUDIO_MEMBER_ROLE_LABELS[m.role]}
                        enterDelay={150}
                      >
                        <span>{m.displayName || m.username}</span>
                      </Tooltip>
                    </span>
                    <span style={{ fontSize: 10, color: "#555" }}>
                      {STUDIO_MEMBER_ROLE_LABELS[m.role]}
                    </span>
                  </div>
                );
              })}
              {canManage ? (
                <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                  <TextInput
                    placeholder="user id"
                    value={inviteUserId}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setInviteUserId(e.target.value.replace(/[^0-9]/g, ""))
                    }
                    style={{ flex: 1 }}
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      const id = Number(inviteUserId);
                      if (!id) return;
                      inviteMutation.mutate({ userId: id });
                    }}
                    disabled={inviteMutation.isPending}
                  >
                    Invite
                  </Button>
                </div>
              ) : null}
            </div>
          </GroupBox>
        </Column>
      </Shell>
    </AppWindow>
  );
}

/* ── Annotation detail panel ─────────────────────── */

function AnnotationDetailPanel({
  annotation,
  canAnnotate,
  onClose,
  onAddComment,
  onToggleResolved,
  onDelete,
}: {
  annotation: Annotation | null;
  canAnnotate: boolean;
  onClose: () => void;
  onAddComment: (body: string) => void;
  onToggleResolved: (resolved: boolean) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState("");

  if (!annotation) return null;

  return (
    <GroupBox label={`${annotation.kind} note`}>
      <div style={{ padding: 4, fontSize: 12 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <strong>
            {annotation.authorDisplayName ?? "Someone"} ·{" "}
            {formatTimestamp(annotation.createdAt)}
          </strong>
          <div style={{ display: "flex", gap: 4 }}>
            <Button size="sm" onClick={onClose}>
              Close
            </Button>
            {canAnnotate ? (
              <>
                <Button
                  size="sm"
                  onClick={() => onToggleResolved(!annotation.resolved)}
                >
                  {annotation.resolved ? "Reopen" : "Resolve"}
                </Button>
                <Button size="sm" onClick={onDelete}>
                  Delete
                </Button>
              </>
            ) : null}
          </div>
        </div>
        {annotation.data?.body ? (
          <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>
            {String(annotation.data.body)}
          </div>
        ) : (
          <div style={{ color: "#555" }}>No body.</div>
        )}

        <Separator />

        <div
          style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 4 }}
        >
          {annotation.comments.map((c) => (
            <div key={c.id} style={{ fontSize: 11 }}>
              <strong>{c.authorDisplayName ?? "Someone"}:</strong> {c.body}{" "}
              <span style={{ color: "#777" }}>
                · {formatTimestamp(c.createdAt)}
              </span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
          <TextInput
            placeholder="Reply"
            value={draft}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setDraft(e.target.value)
            }
            style={{ flex: 1 }}
          />
          <Button
            size="sm"
            onClick={() => {
              const body = draft.trim();
              if (!body) return;
              onAddComment(body);
              setDraft("");
            }}
          >
            Reply
          </Button>
        </div>
      </div>
    </GroupBox>
  );
}
