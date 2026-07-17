import assert from "node:assert/strict";
import test from "node:test";
import { ALL_ADMIN_SURFACES } from "../../admin-os/admin-surface-registry";
import { WTF_CURSE_DEFINITIONS } from "@shared/curses";
import { PERMISSIONS } from "@shared/types";
import { ADMIN_SECTION_CATALOG } from "../admin-section-catalog";
import {
  ADMIN_HELP_TOPICS,
  buildAdminHelpIndex,
  searchAdminHelpTopics,
} from "./admin-help-index";

function topicById(id: string) {
  return ADMIN_HELP_TOPICS.find((topic) => topic.id === id);
}

test("admin help index covers every canonical source with unique stable IDs", () => {
  assert.equal(new Set(ADMIN_HELP_TOPICS.map((topic) => topic.id)).size, ADMIN_HELP_TOPICS.length);

  for (const section of ADMIN_SECTION_CATALOG) {
    const topic = topicById(`section:${section.slug}`);
    assert(topic, `${section.slug} central section must be indexed`);
    assert(topic.destinations.some((destination) => destination.sectionSlug === section.slug));
  }
  for (const surface of ALL_ADMIN_SURFACES) {
    const topic = topicById(`surface:${surface.id}`);
    assert(topic, `${surface.id} surface must be indexed`);
    assert(topic.destinations.length > 0, `${surface.id} must have a human destination`);
    assert.deepEqual(topic.agent.routePatterns, surface.routePatterns);
    assert.deepEqual(topic.agent.nativeSettings, surface.nativeSettings);
    assert.deepEqual(topic.agent.automationHandles, surface.automationHandles);
  }
  for (const permission of PERMISSIONS) {
    assert(topicById(`permission:${permission.key}`), `${permission.key} permission must be indexed`);
  }
  for (const curse of WTF_CURSE_DEFINITIONS) {
    assert(topicById(`curse:${curse.key}`), `${curse.key} curse must be indexed`);
  }
});

test("every registered surface element resolves back to its owning help topic", () => {
  for (const surface of ALL_ADMIN_SURFACES) {
    for (const term of [
      surface.id,
      ...surface.routePatterns,
      ...surface.nativeSettings,
      ...surface.automationHandles,
      ...(surface.adminRoutes ?? []),
    ]) {
      const resultIds = searchAdminHelpTopics(term).map(({ topic }) => topic.id);
      assert(
        resultIds.includes(`surface:${surface.id}`),
        `${surface.id} should be discoverable by ${term}`
      );
    }
  }
});

test("human complaint language routes to the expected acute control", () => {
  assert.equal(searchAdminHelpTopics("screen is green")[0]?.topic.id, "curse:green_lens");
  assert(searchAdminHelpTopics("wrong role level").some(({ topic }) => topic.id === "section:roles"));
  assert(searchAdminHelpTopics("temporary login").some(({ topic }) => topic.id === "section:users"));
  assert(searchAdminHelpTopics("cannot open Studio").some(({ topic }) => topic.id === "section:studio"));
});

test("agent index reports exact source counts and supports filtered queries", () => {
  const full = buildAdminHelpIndex();
  assert.equal(full.sourceCounts.sections, ADMIN_SECTION_CATALOG.length);
  assert.equal(full.sourceCounts.surfaces, ALL_ADMIN_SURFACES.length);
  assert.equal(full.sourceCounts.permissions, PERMISSIONS.length);
  assert.equal(full.sourceCounts.curses, WTF_CURSE_DEFINITIONS.length);
  assert.equal(full.sourceCounts.totalTopics, ADMIN_HELP_TOPICS.length);

  const filtered = buildAdminHelpIndex("green lens");
  assert.equal(filtered.query, "green lens");
  assert(filtered.topics.some((topic) => topic.id === "curse:green_lens"));
});
