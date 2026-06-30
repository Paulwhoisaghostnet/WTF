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

import { useEffect, useRef, useState } from "react";
import { Hourglass } from "react95";
import { AppWindow } from "../components/layout/AppWindow";
import { useAuth } from "../lib/auth-context";
import { usePresentationShell } from "../lib/presentation-shell";
import { useWindowManager } from "../lib/window-context";
import {
  STUDIO_ANNOTATION_KINDS,
  STUDIO_MEMBER_ROLE_LABELS,
  studioRoleCanAnnotate,
  studioRoleCanChat,
  studioRoleCanEditFiles,
  studioRoleCanManageProject,
  type StudioMemberSummary,
  type StudioPresenceEntry,
} from "@shared/types";
import { useStudioSocket } from "../lib/studio-socket";
import {
  Column,
  ErrorBanner,
  Shell,
} from "../features/studio/StudioChrome";
import type {
  PendingAnnotation,
  PendingRect as PendingRectDraft,
  PendingStroke,
  StudioCursorState,
  StudioTool,
} from "../features/studio/types";
import { AnnotationDetailPanel } from "../features/studio/AnnotationDetailPanel";
import { StudioCollaborationColumn } from "../features/studio/StudioCollaborationColumn";
import { StudioLeftColumn } from "../features/studio/StudioLeftColumn";
import { StudioPreviewSurface } from "../features/studio/StudioPreviewSurface";
import { StudioWorkspaceHeader } from "../features/studio/StudioWorkspaceHeader";
import { categorize } from "../features/studio/utils";
import { useStudioProjectData } from "../features/studio/useStudioProjectData";
import { useStudioProjectMutations } from "../features/studio/useStudioProjectMutations";
import { useStudioSocketEffects } from "../features/studio/useStudioSocketEffects";
import { useStudioStagePointerHandlers } from "../features/studio/useStudioStagePointerHandlers";

void STUDIO_ANNOTATION_KINDS;

/* ── Component ───────────────────────────────────────── */

interface StudioProjectProps {
  projectId: string;
}

export function StudioProject({ projectId }: StudioProjectProps) {
  const numericProjectId = Number(projectId);
  const validProjectId = Number.isInteger(numericProjectId) && numericProjectId > 0;

  const { user } = useAuth();
  const presentation = usePresentationShell();
  const wm = useWindowManager();

  const [activeFileId, setActiveFileId] = useState<number | null>(null);
  const [tool, setTool] = useState<StudioTool>("cursor");
  const [pendingRect, setPendingRect] = useState<PendingRectDraft>(null);
  const [pendingStroke, setPendingStroke] = useState<PendingStroke>(null);
  const [pendingAnnotation, setPendingAnnotation] =
    useState<PendingAnnotation>(null);
  const [brushColor, setBrushColor] = useState("#ff0033");
  const [brushSize, setBrushSize] = useState(4);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<number | null>(
    null
  );
  const [chatDraft, setChatDraft] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [presence, setPresence] = useState<StudioPresenceEntry[]>([]);
  const [cursors, setCursors] = useState<StudioCursorState>({});
  const stageRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* ── Queries ─────────────────────────────────────── */

  const {
    activeFile,
    annotationsQuery,
    chatQuery,
    conversationId,
    pinsQuery,
    projectQuery,
  } = useStudioProjectData({
    activeFileId,
    enabled: !!user && validProjectId,
    projectId: numericProjectId,
  });
  const activeFileCategory = activeFile
    ? categorize(activeFile.mimeType)
    : "other";
  const socket = useStudioSocket(
    validProjectId && !!user && Boolean(projectQuery.data?.project)
      ? numericProjectId
      : null
  );

  /* ── Mutations ───────────────────────────────────── */

  const {
    addCommentMutation,
    createAnnotationMutation,
    createFolderMutation,
    deleteAnnotationMutation,
    deleteFileMutation,
    inviteMutation,
    renameFileMutation,
    sendChatMutation,
    togglePinMutation,
    uploadMutation,
    updateAnnotationMutation,
  } = useStudioProjectMutations({
    activeFileId,
    conversationId,
    projectId: numericProjectId,
    setChatDraft,
    setChatError,
    setPendingAnnotation,
    setPendingRect,
    setSelectedAnnotationId,
    setUploadError,
  });

  useStudioSocketEffects({
    activeFileId,
    conversationId,
    projectId: numericProjectId,
    setCursors,
    setPresence,
    socket,
    windowManager: wm,
  });

  const {
    handleStagePointerDown,
    handleStagePointerMove,
    handleStagePointerUp,
  } = useStudioStagePointerHandlers({
    activeFileCategory,
    activeFileId,
    brushColor,
    brushSize,
    canAnnotate: projectQuery.data?.role
      ? studioRoleCanAnnotate(projectQuery.data.role)
      : false,
    createAnnotation: createAnnotationMutation.mutate,
    pendingRect,
    pendingStroke,
    setPendingAnnotation,
    setPendingRect,
    setPendingStroke,
    setSelectedAnnotationId,
    socket,
    stageRef,
    tool,
  });

  // Auto-select first file when project loads. Prefer the file most recently
  // persisted for this user in `studio_user_state` so the room opens right
  // where they left off.
  useEffect(() => {
    if (activeFileId != null || !projectQuery.data?.project) return;
    const persisted = projectQuery.data.userState?.state as
      | { lastOpenFileByProject?: Record<string, number> }
      | null
      | undefined;
    const stored = persisted?.lastOpenFileByProject?.[String(numericProjectId)];
    const files = projectQuery.data.files ?? [];
    const fallback = files[0]?.id;
    const candidate =
      stored && files.some((f) => f.id === stored)
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
    if (!projectQuery.data?.project) return;
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

  useEffect(() => {
    setPendingStroke(null);
    if (activeFileCategory !== "image" && (tool === "brush" || tool === "highlight")) {
      setTool("cursor");
    }
  }, [activeFileCategory, activeFileId, tool]);

  /* ── Render guards ───────────────────────────────── */

  if (!validProjectId) {
    return (
      <AppWindow title="Studio">
        <div
          data-studio-presentation-host={presentation.host}
          data-studio-surface="project-guard"
          data-studio-region="guard"
          style={{ padding: 16 }}
        >
          Invalid project id.
        </div>
      </AppWindow>
    );
  }
  if (!user) {
    return (
      <AppWindow title="Studio">
        <div
          data-studio-presentation-host={presentation.host}
          data-studio-surface="project-guard"
          data-studio-region="guard"
          style={{ padding: 16 }}
        >
          Sign in to view this project.
        </div>
      </AppWindow>
    );
  }
  if (projectQuery.isLoading) {
    return (
      <AppWindow title="Studio">
        <div
          data-studio-presentation-host={presentation.host}
          data-studio-surface="project-loading"
          data-studio-region="loading"
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
  if (projectQuery.isError || !projectQuery.data?.project) {
    return (
      <AppWindow title="Studio">
        <ErrorBanner
          data-studio-presentation-host={presentation.host}
          data-studio-surface="project-error"
        >
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
  const visibleCursors = Object.values(cursors).filter(
    (c) => c.fileId === activeFileId && c.userId !== user.id
  );

  /* ── Render ─────────────────────────────────────── */

  return (
    <AppWindow title={`Studio: ${project.name}`}>
      <Shell
        data-studio-presentation-host={presentation.host}
        data-studio-surface="project-workspace"
        data-studio-project-id={project.id}
      >
        {/* ─── LEFT PANEL: Tree / files / upload ─── */}
        <StudioLeftColumn
          activeFileId={activeFileId}
          activeFile={activeFile}
          canEdit={canEdit}
          createFolderPending={createFolderMutation.isPending}
          fileInputRef={fileInputRef}
          onCreateFolder={(name) =>
            createFolderMutation.mutate({
              name,
              parentFolderId: null,
            })
          }
          onSelectFile={setActiveFileId}
          onUploadFile={(file, folderId) =>
            uploadMutation.mutate({ file, folderId })
          }
          projectDetail={projectQuery.data}
          roleLabel={STUDIO_MEMBER_ROLE_LABELS[role]}
          uploadError={uploadError}
          uploadPending={uploadMutation.isPending}
        />

        {/* ─── CENTER PANEL: Preview + annotations ─── */}
        <Column>
          <StudioWorkspaceHeader
            activeFile={activeFile}
            activeFileCategory={activeFileCategory}
            brushColor={brushColor}
            brushSize={brushSize}
            canAnnotate={canAnnotate}
            canEdit={canEdit}
            onDeleteFile={(file) => {
              deleteFileMutation.mutate(file.id);
              setActiveFileId(null);
            }}
            onRenameFile={(file, name) =>
              renameFileMutation.mutate({
                fileId: file.id,
                name,
              })
            }
            onBrushColorChange={setBrushColor}
            onBrushSizeChange={setBrushSize}
            onToolChange={setTool}
            presenceCount={presence.length}
            projectName={project.name}
            tool={tool}
          />

          <StudioPreviewSurface
            activeFile={activeFile}
            activeFileCategory={activeFileCategory}
            annotations={annotations}
            createAnnotationPending={createAnnotationMutation.isPending}
            onCancelPendingAnnotation={() => setPendingAnnotation(null)}
            onDraftBodyChange={(body) =>
              setPendingAnnotation((current) =>
                current ? { ...current, draftBody: body } : current
              )
            }
            onPointerDown={handleStagePointerDown}
            onPointerMove={handleStagePointerMove}
            onPointerUp={handleStagePointerUp}
            onSavePendingAnnotation={(annotation) => {
              if (!activeFileId) return;
              createAnnotationMutation.mutate({
                fileId: activeFileId,
                kind: annotation.kind,
                data: {
                  ...annotation.position,
                  body: annotation.draftBody.trim(),
                },
              });
            }}
            onSelectAnnotation={setSelectedAnnotationId}
            pendingAnnotation={pendingAnnotation}
            pendingRect={pendingRect}
            pendingStroke={pendingStroke}
            selectedAnnotationId={selectedAnnotationId}
            stageRef={stageRef}
            visibleCursors={visibleCursors}
          />

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
        <StudioCollaborationColumn
          canChat={canChat}
          canManage={canManage}
          chatDraft={chatDraft}
          chatError={chatError}
          chatLoading={chatQuery.isLoading}
          chatMessages={chatMessages}
          invitePending={inviteMutation.isPending}
          members={projectQuery.data.members}
          onChatDraftChange={setChatDraft}
          onInvite={(userId) => inviteMutation.mutate({ userId })}
          onSendChat={() => {
            const trimmed = chatDraft.trim();
            if (!trimmed) return;
            sendChatMutation.mutate({ content: trimmed });
          }}
          onTogglePin={(messageId, pinned) =>
            togglePinMutation.mutate({
              messageId,
              pinned,
            })
          }
          onTyping={() => socket.typing()}
          pinnedMessages={pinnedMessages}
          presence={presence}
          sendPending={sendChatMutation.isPending}
          userId={user.id}
        />
      </Shell>
    </AppWindow>
  );
}
