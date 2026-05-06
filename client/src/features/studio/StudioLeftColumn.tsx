import { type ChangeEvent, type RefObject } from "react";
import { Button, GroupBox } from "react95";
import { Column, ErrorBanner } from "./StudioChrome";
import { StudioFileTreePanel } from "./StudioFileTreePanel";
import type { ProjectDetail, StudioFileRow } from "./types";
import { formatBytes } from "./utils";

interface StudioLeftColumnProps {
  activeFileId: number | null;
  activeFile: StudioFileRow | null;
  canEdit: boolean;
  createFolderPending: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onCreateFolder: (name: string) => void;
  onSelectFile: (fileId: number) => void;
  onUploadFile: (file: File, folderId: number | null) => void;
  projectDetail: ProjectDetail;
  roleLabel: string;
  uploadError: string | null;
  uploadPending: boolean;
}

export function StudioLeftColumn({
  activeFileId,
  activeFile,
  canEdit,
  createFolderPending,
  fileInputRef,
  onCreateFolder,
  onSelectFile,
  onUploadFile,
  projectDetail,
  roleLabel,
  uploadError,
  uploadPending,
}: StudioLeftColumnProps) {
  const { project } = projectDetail;

  return (
    <Column>
      <GroupBox label="Project">
        <div style={{ fontSize: 12 }}>
          <div style={{ fontWeight: "bold" }}>{project.name}</div>
          {project.description ? (
            <div style={{ color: "#555", marginTop: 2 }}>
              {project.description}
            </div>
          ) : null}
          <div style={{ color: "#555", marginTop: 4, fontSize: 11 }}>
            {roleLabel} · {formatBytes(project.storageUsedBytes)} /{" "}
            {formatBytes(project.storageQuotaBytes)}
          </div>
        </div>
      </GroupBox>

      <StudioFileTreePanel
        activeFileId={activeFileId}
        files={projectDetail.files}
        folders={projectDetail.folders}
        onSelectFile={onSelectFile}
      />

      {canEdit ? (
        <GroupBox label="Add">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: 4,
            }}
          >
            {uploadError ? <ErrorBanner>{uploadError}</ErrorBanner> : null}
            <div style={{ display: "flex", gap: 4 }}>
              <Button
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadPending}
              >
                {uploadPending ? "Uploading…" : "Upload file"}
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const name = window.prompt("Folder name?");
                  if (!name) return;
                  onCreateFolder(name);
                }}
                disabled={createFolderPending}
              >
                New folder
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: "none" }}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const folderId = activeFile?.folderId ?? null;
                onUploadFile(file, folderId);
                event.target.value = "";
              }}
            />
          </div>
        </GroupBox>
      ) : null}
    </Column>
  );
}
