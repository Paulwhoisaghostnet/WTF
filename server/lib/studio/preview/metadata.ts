export type StudioPreviewStatus =
  | "queued"
  | "processing"
  | "ready"
  | "skipped"
  | "quota_skipped"
  | "failed";

export type StudioPreviewMetadata = {
  status: StudioPreviewStatus;
  queuedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  attempts?: number;
  lastError?: string;
  source?: string;
  previewUri?: string | null;
  thumbnailUri?: string | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

export function baseMetadata(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return { ...(input as Record<string, unknown>) };
}

export function previewState(input: unknown): Partial<StudioPreviewMetadata> {
  const meta = baseMetadata(input);
  const state = meta.studioPreview;
  if (!state || typeof state !== "object" || Array.isArray(state)) return {};
  return state as Partial<StudioPreviewMetadata>;
}

export function buildStudioPreviewMetadata(
  input: unknown,
  state: StudioPreviewMetadata,
  generated: Record<string, unknown> = {}
): Record<string, unknown> {
  const meta = baseMetadata(input);
  const previous = previewState(meta);
  return {
    ...meta,
    ...generated,
    studioPreview: {
      ...previous,
      ...state,
    },
  };
}

export function markStudioPreviewQueued(
  input: unknown,
  source = "upload"
): Record<string, unknown> {
  const previous = previewState(input);
  return buildStudioPreviewMetadata(input, {
    status: "queued",
    queuedAt: previous.queuedAt || nowIso(),
    attempts: Number(previous.attempts || 0),
    source,
    previewUri: null,
    thumbnailUri: null,
  });
}
