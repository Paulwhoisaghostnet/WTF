import {
  useEffect,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { Button } from "react95";
import {
  AnnotationOverlay,
  AnnotationPopover,
  CursorGhost,
  CursorLabel,
  PendingRect as PendingRectMarker,
  PinMarker,
  PreviewFrame,
  PreviewMedia,
  PreviewStage,
  RectMarker,
} from "./StudioChrome";
import type {
  Annotation,
  PendingAnnotation,
  PendingRect,
  StudioFileRow,
} from "./types";
import { formatBytes, type StudioFileCategory } from "./utils";

interface VisibleCursor {
  userId: number;
  username: string;
  x: number;
  y: number;
  fileId: number;
  ts: number;
}

interface StudioPreviewSurfaceProps {
  activeFile: StudioFileRow | null;
  activeFileCategory: StudioFileCategory;
  annotations: Annotation[];
  createAnnotationPending: boolean;
  onCancelPendingAnnotation: () => void;
  onDraftBodyChange: (body: string) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onSavePendingAnnotation: (annotation: Exclude<PendingAnnotation, null>) => void;
  onSelectAnnotation: (annotationId: number) => void;
  pendingAnnotation: PendingAnnotation;
  pendingRect: PendingRect;
  selectedAnnotationId: number | null;
  stageRef: RefObject<HTMLDivElement | null>;
  visibleCursors: VisibleCursor[];
}

export function StudioPreviewSurface({
  activeFile,
  activeFileCategory,
  annotations,
  createAnnotationPending,
  onCancelPendingAnnotation,
  onDraftBodyChange,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onSavePendingAnnotation,
  onSelectAnnotation,
  pendingAnnotation,
  pendingRect,
  selectedAnnotationId,
  stageRef,
  visibleCursors,
}: StudioPreviewSurfaceProps) {
  const [useOriginalImage, setUseOriginalImage] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const rawUrl = activeFile ? `/api/studio/files/${activeFile.id}/raw` : "";
  const imageUrl =
    activeFile && activeFileCategory === "image"
      ? useOriginalImage
        ? rawUrl
        : activeFile.previewUrl || rawUrl
      : "";

  useEffect(() => {
    setUseOriginalImage(false);
    setImageFailed(false);
  }, [activeFile?.id]);

  return (
    <PreviewStage
      ref={stageRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
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
              Select media for review.
            </div>
          ) : activeFileCategory === "image" && !imageFailed ? (
            <img
              alt={activeFile.name}
              src={imageUrl}
              draggable={false}
              onError={() => {
                if (activeFile.previewUrl && !useOriginalImage) {
                  setUseOriginalImage(true);
                  return;
                }
                setImageFailed(true);
              }}
            />
          ) : activeFileCategory === "video" ? (
            <video controls src={rawUrl} />
          ) : activeFileCategory === "audio" ? (
            <audio controls src={rawUrl} />
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
              <div style={{ fontWeight: "bold" }}>{activeFile.name}</div>
              <div style={{ fontSize: 11, color: "#555" }}>
                {activeFile.mimeType} · {formatBytes(activeFile.sizeBytes)}
              </div>
              <a href={rawUrl} target="_blank" rel="noopener noreferrer">
                Open original
              </a>
            </div>
          )}
        </PreviewMedia>
      </PreviewFrame>

      {activeFile ? (
        <AnnotationOverlay>
          {annotations
            .filter((annotation) => annotation.kind === "rect")
            .map((annotation) => {
              const pos = annotation.position as {
                x: number;
                y: number;
                w: number;
                h: number;
              };
              return (
                <RectMarker
                  key={`rect-${annotation.id}`}
                  $resolved={annotation.resolved}
                  $selected={selectedAnnotationId === annotation.id}
                  style={{
                    left: `${pos.x * 100}%`,
                    top: `${pos.y * 100}%`,
                    width: `${pos.w * 100}%`,
                    height: `${pos.h * 100}%`,
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    onSelectAnnotation(annotation.id);
                  }}
                />
              );
            })}

          {annotations
            .filter(
              (annotation) =>
                annotation.kind === "pin" || annotation.kind === "sticky_note"
            )
            .map((annotation, index) => {
              const pos = annotation.position as { x: number; y: number };
              return (
                <PinMarker
                  key={`pin-${annotation.id}`}
                  $resolved={annotation.resolved}
                  $selected={selectedAnnotationId === annotation.id}
                  style={{
                    left: `${pos.x * 100}%`,
                    top: `${pos.y * 100}%`,
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    onSelectAnnotation(annotation.id);
                  }}
                  title={String(annotation.data?.body ?? "")}
                >
                  {index + 1}
                </PinMarker>
              );
            })}

          {pendingRect ? (
            <PendingRectMarker
              style={{
                left: `${
                  Math.min(pendingRect.x, pendingRect.x + pendingRect.w) * 100
                }%`,
                top: `${
                  Math.min(pendingRect.y, pendingRect.y + pendingRect.h) * 100
                }%`,
                width: `${Math.abs(pendingRect.w) * 100}%`,
                height: `${Math.abs(pendingRect.h) * 100}%`,
              }}
            />
          ) : null}

          {visibleCursors.map((cursor) => (
            <CursorGhost
              key={cursor.userId}
              style={{
                left: `${cursor.x * 100}%`,
                top: `${cursor.y * 100}%`,
              }}
            >
              <CursorLabel>{cursor.username}</CursorLabel>
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
                {pendingAnnotation.kind === "pin" ? "New pin" : "New box note"}
              </div>
              <textarea
                autoFocus
                value={pendingAnnotation.draftBody}
                placeholder="What should your collaborators see here?"
                onChange={(event) => onDraftBodyChange(event.target.value)}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 4,
                  marginTop: 4,
                }}
              >
                <Button size="sm" onClick={onCancelPendingAnnotation}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  primary
                  disabled={createAnnotationPending}
                  onClick={() => onSavePendingAnnotation(pendingAnnotation)}
                >
                  Save
                </Button>
              </div>
            </AnnotationPopover>
          ) : null}
        </AnnotationOverlay>
      ) : null}
    </PreviewStage>
  );
}
