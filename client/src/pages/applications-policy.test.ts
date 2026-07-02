import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("client/src/pages/Applications.tsx", "utf8");
const pageDefs = readFileSync("client/src/routes/page-defs.ts", "utf8");
const browserRoutes = readFileSync("shared/wtf-browser-routes.ts", "utf8");

test("Applications page is backed by the apphost launcher API", () => {
  assert.match(source, /api\.get<ApplicationsResponse>\("\/api\/apphost\/apps"\)/);
  assert.match(source, /api\.post<LaunchResponse>\(`\/api\/apphost\/apps\/\$\{encodeURIComponent\(appId\)\}\/stop`, \{\}\)/);
  assert.match(source, /api\.get<StatusResponse>\(`\/api\/apphost\/apps\/\$\{encodeURIComponent\(appId\)\}\/status`\)/);
});

test("Applications open action launches the remote app in a browser play tab", () => {
  assert.match(source, /function applicationPlayPath\(appId: string\)/);
  assert.match(source, /window\.open\(applicationPlayPath\(appId\), "_blank"/);
  assert.doesNotMatch(source, /launchMutation\.mutate\(activeApp\.id\)/);
});

test("Applications page renders manifest-backed external app cards", () => {
  assert.match(source, /data-applications-region="title-carousel"/);
  assert.match(source, /data-applications-region="title-card"/);
  assert.match(source, /data-applications-region="cover-image"/);
  assert.match(source, /coverImageUrl/);
  assert.match(source, /coverImageAlt/);
  assert.match(source, /activeSession/);
  assert.match(source, /selectedBlockedByActiveSession/);
  assert.match(source, /Sorry, try joining user/);
});

test("Applications is a session desktop route", () => {
  assert.match(pageDefs, /pattern: "\/applications"/);
  assert.match(pageDefs, /pattern: "\/applications\/:appId\/play"/);
  assert.match(pageDefs, /title: "Applications"/);
  assert.match(pageDefs, /title: "Remote Application"/);
  assert.match(browserRoutes, /\{ pattern: "\/applications", auth: true, title: "Applications" \}/);
  assert.match(browserRoutes, /\{ pattern: "\/applications\/:appId\/play", auth: true, title: "Remote Application" \}/);
});

test("Applications page keeps Steam hidden from user-facing copy", () => {
  assert.doesNotMatch(source, /Steam/i);
});
