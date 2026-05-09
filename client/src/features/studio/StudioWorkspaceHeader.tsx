import { Button, Separator } from "react95";
import {
  Breadcrumbs,
  HeaderMeta,
  PresenceChip,
  ProjectHeader,
  ToolBar,
  ToolButton,
} from "./StudioChrome";
import type { StudioFileRow, StudioTool } from "./types";
import { formatBytes } from "./utils";

interface StudioWorkspaceHeaderProps {
  activeFile: StudioFileRow | null;
  canAnnotate: boolean;
  canEdit: boolean;
  onDeleteFile: (file: StudioFileRow) => void;
  onRenameFile: (file: StudioFileRow, name: string) => void;
  onToolChange: (tool: StudioTool) => void;
  presenceCount: number;
  projectName: string;
  tool: StudioTool;
}

export function StudioWorkspaceHeader({
  activeFile,
  canAnnotate,
  canEdit,
  onDeleteFile,
  onRenameFile,
  onToolChange,
  presenceCount,
  projectName,
  tool,
}: StudioWorkspaceHeaderProps) {
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
          onClick={() => onToolChange("cursor")}
        >
          ↖
        </ToolButton>
        <ToolButton
          size="sm"
          $active={tool === "pin"}
          disabled={!canAnnotate}
          title="Pin note"
          onClick={() => onToolChange("pin")}
        >
          📍 Pin
        </ToolButton>
        <ToolButton
          size="sm"
          $active={tool === "rect"}
          disabled={!canAnnotate}
          title="Box note"
          onClick={() => onToolChange("rect")}
        >
          ▭ Box
        </ToolButton>
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
              Open original
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
