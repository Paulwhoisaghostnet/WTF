import type {
  Dispatch,
  PointerEvent as ReactPointerEvent,
  RefObject,
  SetStateAction,
} from "react";
import type { StudioAnnotationKind } from "@shared/types";
import { createMarkupAnnotationData } from "./markup";
import type {
  PendingAnnotation,
  PendingRect,
  PendingStroke,
  StudioTool,
} from "./types";
import type { StudioFileCategory } from "./utils";
import type { StudioSocketHandle } from "../../lib/studio-socket";

interface UseStudioStagePointerHandlersArgs {
  activeFileCategory: StudioFileCategory;
  activeFileId: number | null;
  brushColor: string;
  brushSize: number;
  canAnnotate: boolean;
  createAnnotation: (input: {
    fileId: number;
    kind: StudioAnnotationKind;
    data: Record<string, unknown>;
  }) => void;
  pendingRect: PendingRect;
  pendingStroke: PendingStroke;
  setPendingAnnotation: Dispatch<SetStateAction<PendingAnnotation>>;
  setPendingRect: Dispatch<SetStateAction<PendingRect>>;
  setPendingStroke: Dispatch<SetStateAction<PendingStroke>>;
  setSelectedAnnotationId: Dispatch<SetStateAction<number | null>>;
  socket: StudioSocketHandle;
  stageRef: RefObject<HTMLDivElement | null>;
  tool: StudioTool;
}

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

export function useStudioStagePointerHandlers({
  activeFileCategory,
  activeFileId,
  brushColor,
  brushSize,
  canAnnotate,
  createAnnotation,
  pendingRect,
  pendingStroke,
  setPendingAnnotation,
  setPendingRect,
  setPendingStroke,
  setSelectedAnnotationId,
  socket,
  stageRef,
  tool,
}: UseStudioStagePointerHandlersArgs) {
  function handleStagePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!activeFileId || !stageRef.current) return;
    if (tool === "cursor") return;
    if (!canAnnotate) return;
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
        if (last && Math.hypot(last.x - x, last.y - y) < 0.004) {
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
      createAnnotation({
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

  return {
    handleStagePointerDown,
    handleStagePointerMove,
    handleStagePointerUp,
  };
}
