import { fetchWithCsrf } from "../../lib/api";

export type CreationToolExportAction = "media" | "media-and-mint";
export type CreationToolMediaCategory = "image" | "video" | "game";

export interface CreationToolExportRequest {
  type: "wtfos:creation-tool-export";
  requestId: string;
  toolId: string;
  action: CreationToolExportAction;
  artifact: Blob;
  fileName: string;
  mimeType: string;
  mediaCategory: CreationToolMediaCategory;
  title?: string;
}

export interface SavedCreationToolMedia {
  id: number;
  title: string;
  mimeType: string;
  mediaCategory: CreationToolMediaCategory;
}

export function isCreationToolExportRequest(value: unknown): value is CreationToolExportRequest {
  const message = value as Partial<CreationToolExportRequest> | null;
  return Boolean(
    message &&
      message.type === "wtfos:creation-tool-export" &&
      typeof message.requestId === "string" &&
      typeof message.toolId === "string" &&
      (message.action === "media" || message.action === "media-and-mint") &&
      message.artifact instanceof Blob &&
      typeof message.fileName === "string" &&
      typeof message.mimeType === "string" &&
      ["image", "video", "game"].includes(String(message.mediaCategory))
  );
}

export async function uploadCreationToolArtifact(request: CreationToolExportRequest): Promise<SavedCreationToolMedia> {
  const form = new FormData();
  form.append("file", request.artifact, request.fileName);
  form.append("title", request.title?.trim() || request.fileName);
  form.append("originalFilename", request.fileName);
  form.append("mimeType", request.mimeType);
  form.append("mediaCategory", request.mediaCategory);
  form.append("description", "Created with PixAlerce in wtfOS");
  const response = await fetchWithCsrf("/api/media/upload", {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || `Media save failed (HTTP ${response.status}).`);
  }
  return response.json();
}
