import type {
  StudioAnnotationKind,
  StudioMemberRole,
  StudioMemberSummary,
  StudioStorageBackend,
} from "@shared/types";

export interface Folder {
  id: number;
  name: string;
  parentFolderId: number | null;
  position: number;
}

export interface StudioFileRow {
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

export interface ProjectDetail {
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

export interface AnnotationComment {
  id: number;
  annotationId: number;
  authorId: number;
  authorDisplayName: string | null;
  body: string;
  createdAt: string;
  editedAt: string | null;
}

export interface Annotation {
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

export interface AnnotationsResponse {
  annotations: Annotation[];
}

export interface ChatMessage {
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

export interface InviteSearchUser {
  id: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  experiencePoints?: number;
}

export type PendingRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  stageRect: DOMRect;
} | null;

export type PendingAnnotation = {
  kind: "pin" | "rect";
  position: { x?: number; y?: number; w?: number; h?: number };
  draftBody: string;
} | null;

export type StudioTool = "cursor" | "pin" | "rect";

export type StudioCursorState = Record<
  number,
  {
    userId: number;
    username: string;
    x: number;
    y: number;
    fileId: number;
    ts: number;
  }
>;
