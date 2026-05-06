import type { Dispatch, SetStateAction } from "react";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { StudioPresenceEntry } from "@shared/types";
import type {
  StudioSocketEvent,
  useStudioSocket,
} from "../../lib/studio-socket";
import type { StudioCursorState } from "./types";

interface WindowManagerLike {
  close: (path: string) => void;
}

interface UseStudioSocketEffectsArgs {
  activeFileId: number | null;
  conversationId: number | null;
  projectId: number;
  setCursors: Dispatch<SetStateAction<StudioCursorState>>;
  setPresence: Dispatch<SetStateAction<StudioPresenceEntry[]>>;
  socket: ReturnType<typeof useStudioSocket>;
  windowManager: WindowManagerLike;
}

export function useStudioSocketEffects({
  activeFileId,
  conversationId,
  projectId,
  setCursors,
  setPresence,
  socket,
  windowManager,
}: UseStudioSocketEffectsArgs) {
  const qc = useQueryClient();

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
            const other = prev.filter((presence) => presence.userId !== event.userId);
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
            prev.filter((presence) => presence.userId !== Number(event.userId))
          );
          setCursors((prev) => {
            const next = { ...prev };
            delete next[Number(event.userId)];
            return next;
          });
          break;
        case "studio_presence_updated":
          setPresence((prev) =>
            prev.map((presence) =>
              presence.userId === Number(event.userId)
                ? {
                    ...presence,
                    viewingFileId:
                      event.viewingFileId != null
                        ? Number(event.viewingFileId)
                        : null,
                  }
                : presence
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
            queryKey: ["studio", "project", projectId],
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
            queryKey: ["studio", "project", projectId],
          });
          windowManager.close(`/studio/${projectId}`);
          break;
      }
    });
  }, [
    socket,
    qc,
    projectId,
    activeFileId,
    conversationId,
    windowManager,
    setCursors,
    setPresence,
  ]);

  // Stale-cursor sweep so users who go silent fade away.
  useEffect(() => {
    const id = window.setInterval(() => {
      setCursors((prev) => {
        const cutoff = Date.now() - 4000;
        const next: StudioCursorState = {};
        for (const entry of Object.values(prev)) {
          if (entry.ts >= cutoff) next[entry.userId] = entry;
        }
        return next;
      });
    }, 1500);
    return () => window.clearInterval(id);
  }, [setCursors]);

  useEffect(() => {
    if (activeFileId != null) {
      socket.openFile(activeFileId);
    } else {
      socket.closeFile();
    }
  }, [activeFileId, socket]);
}
