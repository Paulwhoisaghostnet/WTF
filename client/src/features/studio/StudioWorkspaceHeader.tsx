import {
  BoxSelect,
  ExternalLink,
  Highlighter,
  MapPin,
  MousePointer2,
  Paintbrush,
} from "lucide-react";
import { Button, Separator } from "react95";
import {
  Breadcrumbs,
  HeaderMeta,
  PresenceChip,
  ProjectHeader,
  ToolBar,
  ToolButton,
} from "./StudioChrome";
import { STUDIO_MARKUP_COLORS, STUDIO_MARKUP_WIDTHS } from "./markup";
import type { StudioFileRow, StudioTool } from "./types";
import { formatBytes } from "./utils";

interface StudioWorkspaceHeaderProps {
  activeFile: StudioFileRow | null;
  activeFileCategory: string;
  brushColor: string;
  brushSize: number;
  canAnnotate: boolean;
  canEdit: boolean;
  onDeleteFile: (file: StudioFileRow) => void;
  onRenameFile: (file: StudioFileRow, name: string) => void;
  onBrushColorChange: (color: string) => void;
  onBrushSizeChange: (size: number) => void;
  onToolChange: (tool: StudioTool) => void;
  presenceCount: number;
  projectName: string;
  tool: StudioTool;
}

export function StudioWorkspaceHeader({
  activeFile,
  activeFileCategory,
  brushColor,
  brushSize,
  canAnnotate,
  canEdit,
  onDeleteFile,
  onRenameFile,
  onBrushColorChange,
  onBrushSizeChange,
  onToolChange,
  presenceCount,
  projectName,
  tool,
}: StudioWorkspaceHeaderProps) {
  const canPaint = canAnnotate && activeFileCategory === "image";

  return (
    <>
      <ProjectHeader>
        <Breadcrumbs>
          <span>Projects</span>
          <span>›</span>
          <span>{projectName}</span>
          {activeFile ? (
            <>
              <span>›</span>
              <span>{activeFile.name}</span>
            </>
          ) : null}
        </Breadcrumbs>
        <HeaderMeta>
          {presenceCount > 0 ? (
            <PresenceChip>● {presenceCount + 1} here</PresenceChip>
          ) : (
            <PresenceChip>● just you</PresenceChip>
          )}
        </HeaderMeta>
      </ProjectHeader>

      <ToolBar>
        <span style={{ fontSize: 11, fontWeight: "bold" }}>Review</span>
        <ToolButton
          size="sm"
          $active={tool === "cursor"}
          title="Select"
          aria-label="Select"
          onClick={() => onToolChange("cursor")}
        >
          <MousePointer2 size={13} aria-hidden="true" />
        </ToolButton>
        <ToolButton
          size="sm"
          $active={tool === "pin"}
          disabled={!canAnnotate}
          title="Pin note"
          aria-label="Pin note"
          onClick={() => onToolChange("pin")}
        >
          <MapPin size={13} aria-hidden="true" /> Pin
        </ToolButton>
        <ToolButton
          size="sm"
          $active={tool === "rect"}
          disabled={!canAnnotate}
          title="Box note"
          aria-label="Box note"
          onClick={() => onToolChange("rect")}
        >
          <BoxSelect size={13} aria-hidden="true" /> Box
        </ToolButton>
        <ToolButton
          size="sm"
          $active={tool === "brush"}
          disabled={!canPaint}
          title="Paint brush"
          aria-label="Paint brush"
          onClick={() => onToolChange("brush")}
        >
          <Paintbrush size={13} aria-hidden="true" /> Brush
        </ToolButton>
        <ToolButton
          size="sm"
          $active={tool === "highlight"}
          disabled={!canPaint}
          title="Highlighter"
          aria-label="Highlighter"
          onClick={() => onToolChange("highlight")}
        >
          <Highlighter size={13} aria-hidden="true" /> Highlighter
        </ToolButton>
        {(tool === "brush" || tool === "highlight") && canPaint ? (
          <>
            <Separator orientation="vertical" />
            {STUDIO_MARKUP_COLORS.map((color) => (
              <button
                key={color}
                aria-label={`Markup color ${color}`}
                title={color}
                onClick={() => onBrushColorChange(color)}
                style={{
                  width: 18,
                  height: 18,
                  padding: 0,
                  background: color,
                  border:
                    brushColor === color
                      ? "2px solid #000"
                      : "2px outset #dfdfdf",
                  boxShadow:
                    brushColor === color ? "inset 0 0 0 1px #fff" : undefined,
                }}
              />
            ))}
            {STUDIO_MARKUP_WIDTHS.map((size) => (
              <ToolButton
                key={size}
                size="sm"
                $active={brushSize === size}
                title={`Brush size ${size}`}
                onClick={() => onBrushSizeChange(size)}
              >
                {size}
              </ToolButton>
            ))}
          </>
        ) : null}
        <Separator orientation="vertical" />
        {activeFile ? (
          <>
            <span style={{ fontSize: 11, color: "#333" }}>
              {activeFile.name} · {formatBytes(activeFile.sizeBytes)}
            </span>
            <Button
              size="sm"
              onClick={() =>
                window.open(
                  `/api/studio/files/${activeFile.id}/raw`,
                  "_blank",
                  "noopener,noreferrer"
                )
              }
            >
              <ExternalLink size={13} aria-hidden="true" /> Open original
            </Button>
            {canEdit ? (
              <>
                <Button
                  size="sm"
                  onClick={() => {
                    const next = window.prompt("Rename file", activeFile.name);
                    if (!next || next === activeFile.name) return;
                    onRenameFile(activeFile, next);
                  }}
                >
                  Rename
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    if (!window.confirm(`Delete "${activeFile.name}"?`)) return;
                    onDeleteFile(activeFile);
                  }}
                >
                  Delete
                </Button>
              </>
            ) : null}
          </>
        ) : (
          <span style={{ fontSize: 11, color: "#555" }}>
            Select media for review
          </span>
        )}
      </ToolBar>
    </>
  );
}
