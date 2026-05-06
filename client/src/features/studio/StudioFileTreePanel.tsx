import { useMemo, type ReactElement } from "react";
import { GroupBox } from "react95";
import { FileThumb, PanelBody, TreeNode } from "./StudioChrome";
import type { Folder, StudioFileRow } from "./types";
import { categorize, fileGlyph } from "./utils";

interface StudioFileTreePanelProps {
  activeFileId: number | null;
  files: StudioFileRow[];
  folders: Folder[];
  onSelectFile: (fileId: number) => void;
}

export function StudioFileTreePanel({
  activeFileId,
  files,
  folders,
  onSelectFile,
}: StudioFileTreePanelProps) {
  const folderTree = useMemo(() => {
    const byParent = new Map<number | null, Folder[]>();
    for (const folder of folders) {
      const list = byParent.get(folder.parentFolderId) ?? [];
      list.push(folder);
      byParent.set(folder.parentFolderId, list);
    }

    const filesByFolder = new Map<number | null, StudioFileRow[]>();
    for (const file of files) {
      const list = filesByFolder.get(file.folderId) ?? [];
      list.push(file);
      filesByFolder.set(file.folderId, list);
    }

    return { byParent, filesByFolder };
  }, [files, folders]);

  function renderFolder(parentId: number | null, depth: number): ReactElement[] {
    const children = folderTree.byParent.get(parentId) ?? [];
    const filesHere = folderTree.filesByFolder.get(parentId) ?? [];
    const nodes: ReactElement[] = [];

    for (const folder of children) {
      nodes.push(
        <TreeNode key={`folder-${folder.id}`} $depth={depth}>
          <span>📁</span>
          <span style={{ flex: 1 }}>{folder.name}</span>
        </TreeNode>
      );
      nodes.push(...renderFolder(folder.id, depth + 1));
    }

    for (const file of filesHere) {
      const category = categorize(file.mimeType);
      const isActive = activeFileId === file.id;
      nodes.push(
        <TreeNode
          key={`file-${file.id}`}
          $depth={depth}
          $active={isActive}
          onClick={() => onSelectFile(file.id)}
        >
          <FileThumb>
            {file.thumbnailUrl ? (
              <img src={file.thumbnailUrl} alt="" />
            ) : (
              <span>{fileGlyph(category)}</span>
            )}
          </FileThumb>
          <span
            style={{
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {file.name}
          </span>
        </TreeNode>
      );
    }

    return nodes;
  }

  return (
    <GroupBox label="Files" style={{ flex: 1, minHeight: 0 }}>
      <PanelBody>
        {renderFolder(null, 0)}
        {folderTree.byParent.size === 0 &&
          (folderTree.filesByFolder.get(null) ?? []).length === 0 && (
            <div style={{ fontSize: 11, color: "#666", padding: "6px 4px" }}>
              Nothing here yet. Upload a file or create a folder below.
            </div>
          )}
      </PanelBody>
    </GroupBox>
  );
}
