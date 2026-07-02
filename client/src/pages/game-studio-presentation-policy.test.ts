import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const gameStudioSource = readFileSync(new URL("./GameStudio.tsx", import.meta.url), "utf8");

test("Game Studio exposes a Gamma presentation-host boundary", () => {
  assert.match(gameStudioSource, /usePresentationShell/);
  assert.match(gameStudioSource, /data-game-studio-surface="workspace"/);
  assert.match(gameStudioSource, /data-game-studio-presentation-host=\{presentation\.host\}/);
  assert.match(gameStudioSource, /data-game-studio-region/);
  assert.match(gameStudioSource, /"template-rail"/);
  assert.match(gameStudioSource, /"project-card"/);
  assert.match(gameStudioSource, /"preview-stage"/);
  assert.match(gameStudioSource, /"source-editor"/);
  assert.match(gameStudioSource, /"asset-card"/);
  assert.match(gameStudioSource, /"publish-panel"/);
});

test("Game Studio Gamma chrome is scoped to presentation styling only", () => {
  assert.match(gameStudioSource, /data-game-studio-presentation-host="gamma"/);
  assert.match(gameStudioSource, /background-image:\s*none\s*!important/);
  assert.match(gameStudioSource, /box-shadow:\s*none\s*!important/);
  assert.match(gameStudioSource, /border-radius:\s*6px\s*!important/);
  assert.match(gameStudioSource, /#070706/);
  assert.match(gameStudioSource, /#00d2ff/);
  assert.match(gameStudioSource, /#d6ff3f/);
  assert.match(gameStudioSource, /#f2ead9/);
});

test("Game Studio keeps shared APIs, preview sandboxing, and explicit external exits raw", () => {
  assert.match(gameStudioSource, /api\.get<\{ templates: GameStudioTemplate\[\] \}>\("\/api\/game-studio\/templates"\)/);
  assert.match(gameStudioSource, /api\.get<\{ assets: GameStudioAsset\[\] \}>\("\/api\/game-studio\/assets"\)/);
  assert.match(gameStudioSource, /api\.get<\{ snippets: GameStudioSnippet\[\] \}>\("\/api\/game-studio\/snippets"\)/);
  assert.match(gameStudioSource, /api\.get<ProjectsResponse>\("\/api\/game-studio\/projects"\)/);
  assert.match(gameStudioSource, /api\.get<ArcadeMyGamesResponse>\("\/api\/arcade\/my-games"\)/);
  assert.match(gameStudioSource, /\/api\/game-studio\/templates\/\$\{selectedTemplate\?\.id \|\| "endless-runner"\}\/scaffold/);
  assert.match(gameStudioSource, /\/api\/game-studio\/projects\/\$\{activeProjectId\}\/builds\?limit=8/);
  assert.match(gameStudioSource, /api\.patch<ProjectResponse>\(`\/api\/game-studio\/projects\/\$\{activeProjectId\}`/);
  assert.match(gameStudioSource, /api\.post<ProjectResponse>\("\/api\/game-studio\/projects"/);
  assert.match(gameStudioSource, /api\.post<BuildResponse>\(\s*`\/api\/game-studio\/projects\/\$\{project\.id\}\/build`/);
  assert.match(gameStudioSource, /api\.post<ProjectSubmitResponse>\(\s*`\/api\/game-studio\/projects\/\$\{project\.id\}\/submit`/);
  assert.match(gameStudioSource, /fetch\("\/api\/media\/upload"/);
  assert.match(gameStudioSource, /api\.post<\{\s*game: \{ title: string; slug: string; status: string \};\s*\}>\(\s*"\/api\/arcade\/submit"/);
  assert.match(gameStudioSource, /sandbox="allow-scripts"/);
  assert.match(gameStudioSource, /srcDoc=\{previewDoc\}/);
  assert.match(gameStudioSource, /AssetLink href=\{focusedAsset\.uri\} target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(gameStudioSource, /\/api\/gamma/);
});
