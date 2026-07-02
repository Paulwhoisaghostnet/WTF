import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dearDiarySource = readFileSync(new URL("./DearDiary.tsx", import.meta.url), "utf8");
const crpSource = readFileSync(new URL("./CrpNominate.tsx", import.meta.url), "utf8");
const telegramSource = readFileSync(
  new URL("../features/telegram-digest/IHateTelegramShell.tsx", import.meta.url),
  "utf8"
);

test("Dear Diary exposes Gamma host and measured private-diary regions", () => {
  assert.match(dearDiarySource, /usePresentationShell/);
  assert.match(dearDiarySource, /data-dear-diary-surface="private-diary"/);
  assert.match(dearDiarySource, /data-dear-diary-presentation-host=\{presentation\.host\}/);
  assert.match(dearDiarySource, /\[data-dear-diary-presentation-host="gamma"\]/);
  for (const region of [
    "shell",
    "sidebar",
    "search-panel",
    "stats",
    "entry-list",
    "entry-button",
    "editor",
    "entry-panel",
    "body-input",
    "cross-ref-panel",
    "footer",
    "save-button",
  ]) {
    assert.match(dearDiarySource, new RegExp(`data-dear-diary-region="${region}"`));
  }
});

test("CRP Nominations exposes Gamma host regions without changing AppView behavior", () => {
  assert.match(crpSource, /usePresentationShell/);
  assert.match(crpSource, /data-crp-surface="nomination-appview"/);
  assert.match(crpSource, /data-crp-presentation-host=\{presentation\.host\}/);
  assert.match(crpSource, /\[data-crp-presentation-host="gamma"\]/);
  for (const region of [
    "surface",
    "resolve-panel",
    "query-input",
    "resolve-button",
    "result-panel",
    "card",
    "category-panel",
    "summary-input",
    "submit-button",
    "mine-panel",
    "nomination-card",
    "share-button",
  ]) {
    assert.match(crpSource, new RegExp(`data-crp-region="${region}"`));
  }
});

test("I Hate Telegram exposes Gamma host regions for reader and staff panels", () => {
  assert.match(telegramSource, /usePresentationShell/);
  assert.match(telegramSource, /data-telegram-surface="digest-shell"/);
  assert.match(telegramSource, /data-telegram-presentation-host=\{presentation\.host\}/);
  assert.match(telegramSource, /\[data-telegram-presentation-host="gamma"\]/);
  for (const region of [
    "shell",
    "header",
    "status-strip",
    "layout",
    "section",
    "source-rail",
    "kind-toolbar",
    "message-list",
    "message-row",
    "track-form",
    "source-form",
    "announcement-form",
  ]) {
    assert.match(telegramSource, new RegExp(`data-telegram-region="${region}"`));
  }
});

test("social native Gamma chrome follows the current visual budget", () => {
  for (const source of [dearDiarySource, crpSource, telegramSource]) {
    assert.match(source, /background-image:\s*none\s*!important/);
    assert.match(source, /box-shadow:\s*none\s*!important/);
    assert.match(source, /text-shadow:\s*none\s*!important/);
    assert.match(source, /border-radius:\s*6px/);
    assert.match(source, /letter-spacing:\s*0\s*!important/);
    assert.match(source, /#070706/);
    assert.match(source, /#11110f/);
    assert.match(source, /#00d2ff/);
    assert.match(source, /#f2ead9/);
  }
});

test("social native surfaces keep shared APIs, events, and external exits raw", () => {
  assert.match(dearDiarySource, /\/api\/diary\/entries/);
  assert.match(dearDiarySource, /\/api\/diary\/index/);
  assert.match(dearDiarySource, /api\.post<\{ entry: DiaryEntry \}>\("\/api\/diary\/entries"/);
  assert.match(dearDiarySource, /api\.patch<\{ entry: DiaryEntry \}>/);
  assert.match(dearDiarySource, /api\.delete<\{ ok: true \}>/);

  assert.match(crpSource, /\/api\/crp-nominations\/categories/);
  assert.match(crpSource, /\/api\/crp-nominations\/resolve/);
  assert.match(crpSource, /\/api\/crp-nominations\/submit/);
  assert.match(crpSource, /\/api\/crp-nominations\/mine/);
  assert.match(crpSource, /logClientSystemEvent/);
  assert.match(crpSource, /window\.open\(intent\.url, "_blank", "noopener,noreferrer"\)/);

  assert.match(telegramSource, /\/api\/telegram-digest\/config/);
  assert.match(telegramSource, /\/api\/telegram-digest\/sources/);
  assert.match(telegramSource, /\/api\/telegram-digest\/messages/);
  assert.match(telegramSource, /\/api\/telegram-digest\/me\/farts/);
  assert.match(telegramSource, /\/api\/telegram-digest\/admin\/announcements/);
  assert.match(telegramSource, /\/api\/telegram-digest\/admin\/sources/);

  for (const source of [dearDiarySource, crpSource, telegramSource]) {
    assert.doesNotMatch(source, /\/api\/gamma/);
    assert.doesNotMatch(source, /presentationRouteHref/);
  }
});
