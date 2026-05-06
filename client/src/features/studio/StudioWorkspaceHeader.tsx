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
        <ToolButton
          size="sm"
          $active={tool === "cursor"}
          onClick={() => onToolChange("cursor")}
        >
          ↖
        </ToolButton>
        <ToolButton
          size="sm"
          $active={tool === "pin"}
          disabled={!canAnnotate}
          onClick={() => onToolChange("pin")}
        >
          📍 Pin
        </ToolButton>
        <ToolButton
          size="sm"
          $active={tool === "rect"}
          disabled={!canAnnotate}
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
            Select a file to preview
          </span>
        )}
      </ToolBar>
    </>
  );
}
