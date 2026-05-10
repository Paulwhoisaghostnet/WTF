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
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Hourglass } from "react95";
import { AppWindow } from "../components/layout/AppWindow";
import { useAuth } from "../lib/auth-context";
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
import {
  useStudioSocket,
} from "../lib/studio-socket";
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
import { createMarkupAnnotationData } from "../features/studio/markup";
import { categorize } from "../features/studio/utils";
import { useStudioProjectData } from "../features/studio/useStudioProjectData";
import { useStudioProjectMutations } from "../features/studio/useStudioProjectMutations";
import { useStudioSocketEffects } from "../features/studio/useStudioSocketEffects";

void STUDIO_ANNOTATION_KINDS;

/* ── Component ───────────────────────────────────────── */

interface StudioProjectProps {
  projectId: string;
}

export function StudioProject({ projectId }: StudioProjectProps) {
  const numericProjectId = Number(projectId);
  const validProjectId = Number.isInteger(numericProjectId) && numericProjectId > 0;

  const { user } = useAuth();
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
    } else if (
      (tool === "brush" || tool === "highlight") &&
      activeFileCategory === "image"
    ) {
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setSelectedAnnotationId(null);
      setPendingStroke({
        color: brushColor,
        width: brushSize,
        opacity: tool === "highlight" ? 0.34 : 0.92,
        tool,
        points: [{ x, y }],
      });
    }
  }

  function handleStagePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!stageRef.current || !activeFileId) return;
    const rect = stageRef.current.getBoundingClientRect();
    const { x, y } = toFractional(e.clientX, e.clientY, rect);

    if (pendingStroke) {
      setPendingStroke((current) => {
        if (!current) return current;
        const last = current.points[current.points.length - 1];
        if (
          last &&
          Math.hypot(last.x - x, last.y - y) < 0.004
        ) {
          return current;
        }
        return {
          ...current,
          points: [...current.points, { x, y }],
        };
      });
    } else if (pendingRect) {
      setPendingRect({
        ...pendingRect,
        w: x - pendingRect.x,
        h: y - pendingRect.y,
      });
    }
    socket.cursor(activeFileId, x, y);
  }

  function handleStagePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const { x, y } = toFractional(e.clientX, e.clientY, rect);

    if (pendingStroke) {
      const points = [...pendingStroke.points, { x, y }];
      const data = createMarkupAnnotationData({
        color: pendingStroke.color,
        width: pendingStroke.width,
        tool: pendingStroke.tool,
        points,
      });
      setPendingStroke(null);
      if (!activeFileId || !data) return;
      createAnnotationMutation.mutate({
        fileId: activeFileId,
        kind: pendingStroke.tool === "highlight" ? "highlight" : "draw",
        data: { ...data },
      });
      return;
    }

    if (!pendingRect) return;
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
  if (projectQuery.isError || !projectQuery.data?.project) {
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
  const visibleCursors = Object.values(cursors).filter(
    (c) => c.fileId === activeFileId && c.userId !== user.id
  );

  /* ── Render ─────────────────────────────────────── */

  return (
    <AppWindow title={`Studio: ${project.name}`}>
      <Shell>
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
