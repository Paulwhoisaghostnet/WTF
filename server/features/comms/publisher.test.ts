import test from "node:test";
import assert from "node:assert/strict";
import { sourceDefinitionByKey } from "./source-registry";
import { resolveBrowserUrlPolicy } from "../browser/policy";

test("source registry exposes bounded source organs", () => {
  assert.equal(sourceDefinitionByKey("mail")?.sourceKind, "mail");
  assert.equal(sourceDefinitionByKey("dm")?.readOnly, false);
  assert.equal(sourceDefinitionByKey("telegram")?.readOnly, true);
  assert.equal(sourceDefinitionByKey("unknown"), null);
});

test("browser policy allows approved source hosts and blocks arbitrary browsing", () => {
  assert.equal(resolveBrowserUrlPolicy("https://objkt.com/tokens").allowed, true);
  assert.equal(resolveBrowserUrlPolicy("https://bsky.app/profile/wtf.test").allowed, true);
  const blocked = resolveBrowserUrlPolicy("https://google.com/search?q=onlyfans");
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "host_not_allowlisted");
});

test("browser policy blocks local/private urls even when someone tries to smuggle them", () => {
  const local = resolveBrowserUrlPolicy("http://127.0.0.1:3000/admin");
  assert.equal(local.allowed, false);
  assert.equal(local.reason, "private_or_local_host");
});
