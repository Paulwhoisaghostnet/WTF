import type { Dispatch, SetStateAction } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { PendingAnnotation, PendingRect } from "./types";

interface UseStudioProjectMutationsArgs {
  activeFileId: number | null;
  conversationId: number | null;
  projectId: number;
  setChatDraft: Dispatch<SetStateAction<string>>;
  setChatError: Dispatch<SetStateAction<string | null>>;
  setPendingAnnotation: Dispatch<SetStateAction<PendingAnnotation>>;
  setPendingRect: Dispatch<SetStateAction<PendingRect>>;
  setSelectedAnnotationId: Dispatch<SetStateAction<number | null>>;
  setUploadError: Dispatch<SetStateAction<string | null>>;
}

export function useStudioProjectMutations({
  activeFileId,
  conversationId,
  projectId,
  setChatDraft,
  setChatError,
  setPendingAnnotation,
  setPendingRect,
  setSelectedAnnotationId,
  setUploadError,
}: UseStudioProjectMutationsArgs) {
  const qc = useQueryClient();

  const createFolderMutation = useMutation({
    mutationFn: (input: { name: string; parentFolderId: number | null }) =>
      api.post(`/api/studio/projects/${projectId}/folders`, input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["studio", "project", projectId] }),
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
      const resp = await fetch(`/api/studio/projects/${projectId}/files`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }
      return resp.json();
    },
    onSuccess: () => {
      setUploadError(null);
      qc.invalidateQueries({
        queryKey: ["studio", "project", projectId],
      });
    },
    onError: (err: Error) => setUploadError(err.message),
  });

  const deleteFileMutation = useMutation({
    mutationFn: (fileId: number) => api.delete(`/api/studio/files/${fileId}`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["studio", "project", projectId] }),
  });

  const renameFileMutation = useMutation({
    mutationFn: ({ fileId, name }: { fileId: number; name: string }) =>
      api.patch(`/api/studio/files/${fileId}`, { name }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["studio", "project", projectId] }),
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
      api.put(`/api/messages/dms/${conversationId}/messages/${messageId}/pin`, {
        pinned,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["studio", "pins", conversationId] });
      qc.invalidateQueries({ queryKey: ["studio", "chat", conversationId] });
    },
  });

  const inviteMutation = useMutation({
    mutationFn: ({ userId }: { userId: number }) =>
      api.post(`/api/studio/projects/${projectId}/members`, {
        userId,
        role: "editor",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["studio", "project", projectId] });
    },
  });

  return {
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
  };
}
