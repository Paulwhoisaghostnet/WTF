import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const studioListSource = readFileSync(new URL("../../pages/Studio.tsx", import.meta.url), "utf8");
const studioProjectSource = readFileSync(new URL("../../pages/StudioProject.tsx", import.meta.url), "utf8");
const studioChromeSource = readFileSync(new URL("./StudioChrome.ts", import.meta.url), "utf8");
const studioPreviewSource = readFileSync(new URL("./StudioPreviewSurface.tsx", import.meta.url), "utf8");
const studioJourneySource = readFileSync(new URL("./StudioProjectJourney.tsx", import.meta.url), "utf8");

test("Studio list and project routes expose a Gamma presentation-host boundary", () => {
  assert.match(studioListSource, /usePresentationShell/);
  assert.match(studioProjectSource, /usePresentationShell/);
  assert.match(studioListSource, /data-studio-surface="project-list"/);
  assert.match(studioProjectSource, /data-studio-surface="project-workspace"/);
  assert.match(studioListSource, /data-studio-presentation-host=\{presentation\.host\}/);
  assert.match(studioProjectSource, /data-studio-presentation-host=\{presentation\.host\}/);
  assert.match(studioChromeSource, /data-studio-region/);
  assert.match(studioChromeSource, /workspace-shell/);
  assert.match(studioJourneySource, /project-journey/);
  assert.match(studioChromeSource, /preview-stage/);
  assert.match(studioChromeSource, /chat-message/);
  assert.match(studioChromeSource, /annotation-popover/);
});

test("Studio Gamma chrome is scoped to presentation styling only", () => {
  assert.match(studioListSource, /data-studio-presentation-host="gamma"/);
  assert.match(studioChromeSource, /data-studio-presentation-host="gamma"/);
  assert.match(studioListSource, /background-image:\s*none\s*!important/);
  assert.match(studioChromeSource, /background-image:\s*none\s*!important/);
  assert.match(studioListSource, /box-shadow:\s*none\s*!important/);
  assert.match(studioChromeSource, /box-shadow:\s*none\s*!important/);
  assert.match(studioListSource, /border-radius:\s*6px\s*!important/);
  assert.match(studioChromeSource, /border-radius:\s*6px\s*!important/);
  assert.match(studioListSource, /#070706/);
  assert.match(studioChromeSource, /#070706/);
  assert.match(studioListSource, /#00d2ff/);
  assert.match(studioChromeSource, /#00d2ff/);
  assert.match(studioListSource, /#f2ead9/);
  assert.match(studioChromeSource, /#f2ead9/);
});

test("Studio keeps shared app behavior, APIs, storage, and realtime paths raw", () => {
  assert.match(studioListSource, /api\.get<ProjectsResponse>\("\/api\/studio\/projects"\)/);
  assert.match(studioListSource, /api\.get<UserStateResponse>\("\/api\/studio\/user-state"\)/);
  assert.match(studioListSource, /api\.get<DriveStatusResponse>\("\/api\/studio\/drive\/status"\)/);
  assert.match(studioListSource, /api\.post<StudioProjectSummary>\("\/api\/studio\/projects"/);
  assert.match(studioListSource, /api\.post<\{ ok: boolean; authorizeUrl: string \}>\(\s*"\/api\/studio\/drive\/start"/);
  assert.match(studioListSource, /window\.open\(data\.authorizeUrl,\s*"_blank",\s*"noopener,noreferrer"\)/);
  assert.match(studioProjectSource, /useStudioSocket/);
  assert.match(studioProjectSource, /fetch\("\/api\/studio\/user-state"/);
  assert.match(studioPreviewSource, /\/api\/studio\/files\/\$\{activeFile\.id\}\/raw/);
  assert.match(studioJourneySource, /\/api\/studio\/projects\/\$\{project\.id\}\/workflow/);
  for (const route of ["/wim?conversation=", "/tools/broot?", "/ipfs-pinning?", "/tools/colander?", "/mint-portal?", "/live?tab=overview&"]) {
    assert.ok(studioJourneySource.includes(route), `${route} must stay connected to Studio`);
  }
  assert.doesNotMatch(studioListSource, /\/api\/gamma/);
  assert.doesNotMatch(studioProjectSource, /\/api\/gamma/);
  assert.doesNotMatch(studioChromeSource, /\/api\/gamma/);
  assert.doesNotMatch(studioPreviewSource, /\/api\/gamma/);
});
