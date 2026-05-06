import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type {
  AnnotationsResponse,
  ChatMessage,
  ProjectDetail,
} from "./types";

interface UseStudioProjectDataArgs {
  activeFileId: number | null;
  enabled: boolean;
  projectId: number;
}

export function useStudioProjectData({
  activeFileId,
  enabled,
  projectId,
}: UseStudioProjectDataArgs) {
  const projectQuery = useQuery({
    queryKey: ["studio", "project", projectId],
    queryFn: () => api.get<ProjectDetail>(`/api/studio/projects/${projectId}`),
    enabled,
    staleTime: 5_000,
  });

  const activeFile = useMemo(() => {
    if (!projectQuery.data || activeFileId == null) return null;
    return projectQuery.data.files.find((file) => file.id === activeFileId) ?? null;
  }, [projectQuery.data, activeFileId]);

  const annotationsQuery = useQuery({
    queryKey: ["studio", "annotations", activeFileId],
    queryFn: () =>
      api.get<AnnotationsResponse>(`/api/studio/files/${activeFileId}/annotations`),
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
    queryFn: () => api.get<ChatMessage[]>(`/api/messages/dms/${conversationId}/pins`),
    enabled: conversationId != null,
    staleTime: 10_000,
  });

  return {
    activeFile,
    annotationsQuery,
    chatQuery,
    conversationId,
    pinsQuery,
    projectQuery,
  };
}
