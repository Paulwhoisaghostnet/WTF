import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const studioProjectPath = "client/src/pages/StudioProject.tsx";
const studioProject = readFileSync(studioProjectPath, "utf8");
const studioProjectLines = studioProject.split("\n").length;
const dataHook = readFileSync(
  "client/src/features/studio/useStudioProjectData.ts",
  "utf8"
);
const mutationHook = readFileSync(
  "client/src/features/studio/useStudioProjectMutations.ts",
  "utf8"
);
const pointerHook = readFileSync(
  "client/src/features/studio/useStudioStagePointerHandlers.ts",
  "utf8"
);

test("StudioProject page remains a workspace shell over feature-owned panels and hooks", () => {
  assert.ok(
    studioProjectLines < 500,
    `${studioProjectPath} has ${studioProjectLines} lines`
  );

  for (const importPath of [
    "../features/studio/AnnotationDetailPanel",
    "../features/studio/StudioCollaborationColumn",
    "../features/studio/StudioLeftColumn",
    "../features/studio/StudioPreviewSurface",
    "../features/studio/StudioProjectJourney",
    "../features/studio/StudioWorkspaceHeader",
    "../features/studio/useStudioProjectData",
    "../features/studio/useStudioProjectMutations",
    "../features/studio/useStudioSocketEffects",
    "../features/studio/useStudioStagePointerHandlers",
  ]) {
    assert.match(studioProject, new RegExp(importPath.replaceAll("/", "\\/")));
  }
});

test("studio feature modules own workspace panels data mutations sockets and markup", () => {
  for (const path of [
    "client/src/features/studio/AnnotationDetailPanel.tsx",
    "client/src/features/studio/MemberInvitePicker.tsx",
    "client/src/features/studio/StudioChrome.ts",
    "client/src/features/studio/StudioCollaborationColumn.tsx",
    "client/src/features/studio/StudioFileTreePanel.tsx",
    "client/src/features/studio/StudioLeftColumn.tsx",
    "client/src/features/studio/StudioPreviewSurface.tsx",
    "client/src/features/studio/StudioProjectJourney.tsx",
    "client/src/features/studio/StudioWorkspaceHeader.tsx",
    "client/src/features/studio/markup.ts",
    "client/src/features/studio/types.ts",
    "client/src/features/studio/useStudioProjectData.ts",
    "client/src/features/studio/useStudioProjectMutations.ts",
    "client/src/features/studio/useStudioSocketEffects.ts",
    "client/src/features/studio/useStudioStagePointerHandlers.ts",
    "client/src/features/studio/utils.ts",
  ]) {
    assert.ok(existsSync(path), `${path} must exist`);
  }
});

test("studio extraction preserves project query keys and route contracts", () => {
  assert.match(dataHook, /queryKey: \["studio", "project", projectId\]/);
  assert.match(dataHook, /queryKey: \["studio", "annotations", activeFileId\]/);
  assert.match(dataHook, /queryKey: \["studio", "chat", conversationId\]/);
  assert.match(dataHook, /queryKey: \["studio", "pins", conversationId\]/);
  assert.match(dataHook, /\/api\/studio\/projects\/\$\{projectId\}/);
  assert.match(dataHook, /\/api\/studio\/files\/\$\{activeFileId\}\/annotations/);
});

test("studio mutations and pointer annotations stay centralized behind feature hooks", () => {
  for (const route of [
    "/api/studio/projects/${projectId}/folders",
    "/api/studio/projects/${projectId}/files",
    "/api/studio/files/${fileId}",
    "/api/studio/annotations/${input.id}",
    "/api/messages/dms/${conversationId}/messages",
    "/api/messages/dms/${conversationId}/messages/${messageId}/pin",
  ]) {
    assert.ok(mutationHook.includes(route), `${route} must stay in the mutation hook`);
  }

  assert.match(pointerHook, /createMarkupAnnotationData/);
  assert.match(pointerHook, /socket\.cursor\(activeFileId, x, y\)/);
  assert.match(pointerHook, /kind: pendingStroke\.tool === "highlight" \? "highlight" : "draw"/);
  assert.match(pointerHook, /kind: "rect"/);
  assert.doesNotMatch(studioProject, /function handleStagePointerDown/);
  assert.doesNotMatch(studioProject, /createMarkupAnnotationData/);
});
