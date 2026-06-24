import assert from "node:assert/strict";
import test from "node:test";

import { DESKTOP_APPS } from "@shared/types";
import { CREATION_TOOLS } from "../creation-tools/tool-registry";
import {
  BETA_AGENT_RUNS,
  BETA_AGENT_RETEST_SNAPSHOTS,
  BETA_PERSISTENT_AGENTS,
  BETA_PUPPET_CHECKPOINT_LABELS,
  BETA_PUPPET_MEMORY_LEDGER,
  BETA_ROUTE_BRIDGES,
  BETA_VISIBILITY_SIGNALS,
  betaAgentRetestSummary,
  betaVisibilityScore,
} from "./beta-agent-loop";
import {
  BETA_NOW_SIGNAL_SOURCES,
  BETA_PUBLIC_PROOF_SOURCES,
  betaPublicNowSignalSources,
  betaSessionNowSignalSources,
} from "./beta-now-signals";
import {
  BETA_DISCOVERY_TRAILS,
  BETA_TRAIL_STATE_COPY,
  betaDiscoveryTrailRoutes,
} from "./beta-discovery-trails";
import { BETA_COMMUNICATION_MAP, BETA_PEOPLE_DISCOVERY_BOARD, BETA_PEOPLE_PROOF_GAPS } from "./beta-social-map";
import {
  appsForPersona,
  appsForTier,
  BETA_APP_CATALOG,
  BETA_ATTENTION_QUEUE,
  BETA_COUNT_ADMIN_PUPPET,
  BETA_COUNT_ADMIN_SUMMARY_SOURCES,
  BETA_COUNT_ADMIN_STORIES,
  BETA_COUNT_ADMIN_WORKBENCH,
  BETA_COUNT_LIVEOPS_COMMANDS,
  BETA_COUNT_LIVEOPS_RECIPES,
  BETA_CREATOR_PROJECT_PROOF_LADDER,
  BETA_DAILY_RETURN_LOOPS,
  BETA_FRICTION_QUEUE,
  BETA_NOTIFICATION_CONTROL_GUIDE,
  BETA_NOTIFICATION_EVENTS,
  BETA_NOTIFICATION_GROUPS,
  BETA_PERSONAS,
  BETA_PERSONA_COMMAND_CENTER,
  BETA_RELATIONSHIP_NAVIGATOR,
  BETA_ROUTE_GROUP_GUIDE,
  BETA_SECTION_COMPASS,
  BETA_STAGE_LABELS,
  BETA_TIER_LABELS,
  BETA_UNLOCK_GOVERNANCE_MATRIX,
  BETA_UNLOCK_LADDER,
  BETA_UNLOCK_PASSPORTS,
  BETA_UNLOCK_QUESTLINES,
  BETA_WAYFINDER_ACTIONS,
  BETA_XP_LEVELS,
} from "./beta-app-catalog";

test("beta catalog covers every desktop app key", () => {
  const keys = new Set(BETA_APP_CATALOG.flatMap((entry) => (entry.appKey ? [entry.appKey] : [])));
  for (const appKey of DESKTOP_APPS) assert.equal(keys.has(appKey), true, `${appKey} missing from beta catalog`);
});

test("beta catalog covers every creation tool route", () => {
  const routes = new Set(BETA_APP_CATALOG.map((entry) => entry.route));
  for (const tool of CREATION_TOOLS) assert.equal(routes.has(tool.routePath), true, `${tool.routePath} missing from beta catalog`);
});

test("beta app atlas can filter existing apps by tier stage and persona", () => {
  for (const tier of [1, 2, 3, 4, 5] as const) {
    const apps = appsForTier(tier);
    assert.ok(apps.length > 0, `${BETA_TIER_LABELS[tier]} should have atlas entries`);
    assert.equal(apps.every((app) => app.tier === tier), true, `${BETA_TIER_LABELS[tier]} filter leaked another tier`);
  }

  for (const stage of Object.keys(BETA_STAGE_LABELS)) {
    assert.ok(BETA_APP_CATALOG.some((app) => app.stage === stage), `${BETA_STAGE_LABELS[stage as keyof typeof BETA_STAGE_LABELS]} should have atlas entries`);
  }

  for (const persona of BETA_PERSONAS) {
    const apps = appsForPersona(persona.key);
    assert.ok(apps.length > 0, `${persona.label} should have atlas entries`);
    assert.equal(apps.every((app) => app.personas.includes(persona.key)), true, `${persona.label} filter leaked another persona`);
  }
});

test("beta persona command center stitches every puppet to existing route-owned steps", () => {
  assert.deepEqual(
    BETA_PERSONA_COMMAND_CENTER.map((command) => command.key).sort(),
    BETA_PERSONAS.map((persona) => persona.key).sort(),
  );

  const catalogRoutes = new Set(BETA_APP_CATALOG.map((app) => app.route));
  const attentionKeys = new Set(BETA_ATTENTION_QUEUE.map((item) => item.key));
  const dailyKeys = new Set(BETA_DAILY_RETURN_LOOPS.map((loop) => loop.key));
  for (const command of BETA_PERSONA_COMMAND_CENTER) {
    assert.equal(attentionKeys.has(command.attentionKey), true, `${command.label} attention key missing`);
    assert.equal(dailyKeys.has(command.dailyLoopKey), true, `${command.label} daily loop key missing`);
    assert.deepEqual(command.steps.map((step) => step.key), ["orient", "act", "prove", "return", "count"]);
    assert.ok(command.countReview.length > 50, `${command.label} needs Count review copy`);
    assert.ok(command.success.length > 50, `${command.label} needs success copy`);
    for (const step of command.steps) {
      assert.equal(catalogRoutes.has(step.route), true, `${command.label} route ${step.route} missing from beta app catalog`);
      assert.ok(step.action.length > 40, `${command.label} ${step.key} needs action copy`);
      assert.ok(step.proof.length > 35, `${command.label} ${step.key} needs proof copy`);
    }
    assert.equal(command.steps.some((step) => step.access === "admin" && step.route === "/admin"), true, `${command.label} must expose Count review as admin-gated`);
  }
});

test("beta first-minute wayfinder maps questions to existing sections routes and filters", () => {
  assert.equal(BETA_WAYFINDER_ACTIONS.length, 8);
  const sectionIds = new Set(["beta-now", "beta-proof", "beta-attention", "beta-return", "beta-paths", "beta-atlas", "beta-count"]);
  const catalogByRoute = new Map(BETA_APP_CATALOG.map((app) => [app.route, app]));
  const personaKeys = new Set(BETA_PERSONAS.map((persona) => persona.key));
  const stages = new Set(Object.keys(BETA_STAGE_LABELS));
  const tiers = new Set(Object.keys(BETA_TIER_LABELS).map(Number));

  for (const action of BETA_WAYFINDER_ACTIONS) {
    const app = catalogByRoute.get(action.route);
    assert.ok(app, `${action.label} route ${action.route} missing from beta app catalog`);
    assert.equal(app.access, action.access, `${action.label} access hint must match catalog route access`);
    assert.equal(sectionIds.has(action.sectionId), true, `${action.label} section ${action.sectionId} is not a beta wayfinder target`);
    assert.ok(action.question.endsWith("?"), `${action.label} must ask a first-minute question`);
    assert.ok(action.proof.length > 75, `${action.label} needs proof copy`);
    assert.ok(action.nextAction.length > 75, `${action.label} needs next-action copy`);
    if (action.persona) assert.equal(personaKeys.has(action.persona), true, `${action.label} persona is not a beta puppet`);
    if (action.atlasPersona && action.atlasPersona !== "all") assert.equal(personaKeys.has(action.atlasPersona), true, `${action.label} atlas persona is not a beta puppet`);
    if (action.atlasStage && action.atlasStage !== "all") assert.equal(stages.has(action.atlasStage), true, `${action.label} atlas stage is unknown`);
    if (action.atlasTier && action.atlasTier !== "all") assert.equal(tiers.has(action.atlasTier), true, `${action.label} atlas tier is unknown`);
  }

  assert.ok(BETA_WAYFINDER_ACTIONS.some((action) => action.key === "count-review" && action.access === "admin" && action.sectionId === "beta-count"));
  assert.ok(BETA_WAYFINDER_ACTIONS.some((action) => action.key === "find-tool" && action.sectionId === "beta-atlas" && action.atlasTier === "all"));
  assert.ok(BETA_WAYFINDER_ACTIONS.some((action) => action.key === "creator-runway" && action.persona === "creator" && action.atlasStage === "create"));
});

test("beta section compass maps every major beta board before long-page browsing", () => {
  assert.deepEqual(
    BETA_SECTION_COMPASS.map((section) => section.sectionId),
    [
      "beta-now",
      "beta-proof",
      "beta-people",
      "beta-attention",
      "beta-return",
      "beta-passports",
      "beta-questlines",
      "beta-governance",
      "beta-relationships",
      "beta-route-groups",
      "beta-trails",
      "beta-paths",
      "beta-count",
      "beta-atlas",
    ],
  );

  const ids = new Set<string>();
  const keys = new Set<string>();
  const stages = new Set(Object.keys(BETA_STAGE_LABELS));
  const accessValues = new Set(["public", "session", "role", "admin", "mixed"]);
  const audiences = new Set([...BETA_PERSONAS.map((persona) => persona.key), "the-count", "all-users"]);
  for (const section of BETA_SECTION_COMPASS) {
    assert.equal(keys.has(section.key), false, `${section.key} appears more than once`);
    assert.equal(ids.has(section.sectionId), false, `${section.sectionId} appears more than once`);
    keys.add(section.key);
    ids.add(section.sectionId);
    assert.equal(stages.has(section.stage), true, `${section.label} stage is not known`);
    assert.equal(accessValues.has(section.access), true, `${section.label} access is not known`);
    assert.equal(audiences.has(section.audience), true, `${section.label} audience is not known`);
    assert.ok(section.question.endsWith("?"), `${section.label} must ask a user-facing question`);
    assert.ok(section.useWhen.length > 80, `${section.label} needs use-when copy`);
    assert.ok(section.proves.length > 90, `${section.label} needs proof copy`);
    assert.ok(section.nextMove.length > 80, `${section.label} needs next-move copy`);
  }

  assert.equal(BETA_SECTION_COMPASS.length, 14);
  assert.equal(BETA_SECTION_COMPASS.some((section) => section.key === "people-discovery" && section.sectionId === "beta-people"), true);
  assert.equal(BETA_SECTION_COMPASS.some((section) => section.key === "count-runbook" && section.access === "admin" && section.audience === "the-count"), true);
  assert.equal(BETA_SECTION_COMPASS.some((section) => section.key === "app-atlas" && section.sectionId === "beta-atlas"), true);
});

test("beta friction queue turns puppet evidence into no-write UI moves", () => {
  assert.deepEqual(
    BETA_FRICTION_QUEUE.map((item) => item.key).sort(),
    [
      "advanced-app-value",
      "assistant-threshold",
      "count-authority-boundary",
      "creator-project-proof",
      "people-proof-gap",
      "return-loop-clarity",
      "route-name-cluster",
    ],
  );

  const catalogByRoute = new Map(BETA_APP_CATALOG.map((app) => [app.route, app]));
  const sectionIds = new Set(BETA_SECTION_COMPASS.map((section) => section.sectionId));
  const audiences = new Set([...BETA_PERSONAS.map((persona) => persona.key), "the-count", "all-users"]);
  const priorities = new Set(["P1", "P2", "P3"]);
  const statuses = new Set(["strengthen", "watch", "keep"]);

  for (const item of BETA_FRICTION_QUEUE) {
    const app = catalogByRoute.get(item.route);
    assert.ok(app, `${item.label} owner route ${item.route} missing from beta app catalog`);
    assert.equal(app.access, item.access, `${item.label} access hint must match catalog`);
    assert.equal(sectionIds.has(item.sectionId), true, `${item.label} section ${item.sectionId} is not in the compass`);
    assert.equal(audiences.has(item.audience), true, `${item.label} audience is not a beta puppet`);
    assert.equal(priorities.has(item.priority), true, `${item.label} priority is unknown`);
    assert.equal(statuses.has(item.status), true, `${item.label} status is unknown`);
    assert.ok(item.evidence.length > 90, `${item.label} needs evidence copy`);
    assert.ok(item.friction.length > 90, `${item.label} needs friction copy`);
    assert.ok(item.nextUiMove.length > 90, `${item.label} needs next UI move copy`);
    assert.ok(item.successMeasure.length > 90, `${item.label} needs success measure copy`);
    assert.match(item.noWriteRule, /No beta write/i, `${item.label} must keep a no-write boundary`);
    assert.ok(item.relatedRoutes.length >= 4, `${item.label} needs related route context`);
    for (const route of item.relatedRoutes) {
      assert.equal(catalogByRoute.has(route), true, `${item.label} related route ${route} missing from beta app catalog`);
    }
  }

  assert.ok(BETA_FRICTION_QUEUE.some((item) => item.audience === "the-count" && item.route === "/admin"));
  assert.ok(BETA_FRICTION_QUEUE.some((item) => item.key === "people-proof-gap" && item.sectionId === "beta-people"));
  assert.ok(BETA_FRICTION_QUEUE.some((item) => item.key === "assistant-threshold" && item.status === "keep"));
});

test("beta unlock ladder uses existing progression and admin surfaces", () => {
  assert.ok(BETA_XP_LEVELS.length >= 6);
  assert.ok(BETA_UNLOCK_LADDER.some((step) => step.route === "/side-quests"));
  assert.ok(BETA_UNLOCK_LADDER.some((step) => step.route === "/challenges"));
  assert.ok(BETA_UNLOCK_LADDER.some((step) => step.route === "/wtfiam"));
  assert.ok(BETA_UNLOCK_LADDER.some((step) => step.route === "/admin" && /admin role/i.test(step.gate)));
});

test("beta unlock questlines tie discovery to side quests challenges rewards roles and Count review", () => {
  assert.deepEqual(
    BETA_UNLOCK_QUESTLINES.map((questline) => questline.key).sort(),
    ["builder", "collector", "community-member", "creator", "curator", "new-tezos-user", "the-count"],
  );

  const catalogRoutes = new Set(BETA_APP_CATALOG.map((app) => app.route));
  for (const questline of BETA_UNLOCK_QUESTLINES) {
    assert.ok(questline.sideQuest.length > 50, `${questline.label} needs side quest copy`);
    assert.ok(questline.challenge.length > 50, `${questline.label} needs challenge copy`);
    assert.match(questline.reward, /EXP|reward|WTF/i, `${questline.label} needs reward/EXP language`);
    assert.match(questline.roleOrPermission, /role|permission|gate|admin|readiness/i, `${questline.label} needs role/permission boundary`);
    assert.ok(questline.adminSurface.length > 20, `${questline.label} needs admin surface ownership`);
    assert.match(questline.adminReview, /The Count/i, `${questline.label} needs Count review`);
    assert.ok(questline.abuseGuard.length > 50, `${questline.label} needs abuse guard`);
    assert.deepEqual(questline.stages.map((stage) => stage.key), ["notice", "act", "prove", "unlock", "return"]);
    for (const stage of questline.stages) {
      assert.equal(catalogRoutes.has(stage.route), true, `${questline.label} stage route ${stage.route} missing from beta app catalog`);
      assert.ok(stage.action.length > 30, `${questline.label} ${stage.label} needs action copy`);
      assert.ok(stage.proof.length > 30, `${questline.label} ${stage.label} needs proof copy`);
    }
  }

  const countQuestline = BETA_UNLOCK_QUESTLINES.find((questline) => questline.key === "the-count");
  assert.equal(countQuestline?.stages.some((stage) => stage.access === "admin"), true);
  assert.match(countQuestline?.roleOrPermission ?? "", /Explicit admin role/i);
});

test("beta unlock passports make progression readable without changing authority", () => {
  assert.deepEqual(
    BETA_UNLOCK_PASSPORTS.map((passport) => passport.key).sort(),
    ["builder", "collector", "community-member", "creator", "curator", "new-tezos-user", "the-count"],
  );

  const catalogRoutes = new Set(BETA_APP_CATALOG.map((app) => app.route));
  for (const passport of BETA_UNLOCK_PASSPORTS) {
    assert.equal(catalogRoutes.has(passport.primaryRoute), true, `${passport.label} primary route ${passport.primaryRoute} missing from beta app catalog`);
    assert.equal(catalogRoutes.has(passport.proofRoute), true, `${passport.label} proof route ${passport.proofRoute} missing from beta app catalog`);
    assert.equal(catalogRoutes.has(passport.nextRoute), true, `${passport.label} next route ${passport.nextRoute} missing from beta app catalog`);
    assert.ok(passport.question.endsWith("?"), `${passport.label} needs a user question`);
    assert.ok(passport.identity.length > 20, `${passport.label} needs identity copy`);
    assert.match(passport.visibleNow, /Public|Gallery|Studio|Game Studio|W|Admin|people|visible/i, `${passport.label} needs visible-now copy`);
    assert.match(passport.nextSafeAction, /open|sign in|choose|inspect|pick|find/i, `${passport.label} needs an executable next action`);
    assert.match(passport.proofNeeded, /proof|completion|artifact|row|signal|interaction|draft|route/i, `${passport.label} needs proof language`);
    assert.match(passport.unlocksNext, /unlock|open|next|surface|route|review|progress|become/i, `${passport.label} needs unlock-next language`);
    assert.match(passport.staysLocked, /locked|stay|behind|remain|authority|admin|wallet|contract|role|permission/i, `${passport.label} needs locked-state language`);
    assert.match(passport.countReview, /The Count/i, `${passport.label} must name Count review`);
    assert.match(passport.tomorrowReason, /tomorrow|return|Notifications|Digest|fresh|new|daily|again|checking/i, `${passport.label} needs a return loop`);
    assert.ok(passport.relatedRoutes.length >= 4, `${passport.label} needs related route context`);
    for (const route of passport.relatedRoutes) {
      assert.equal(catalogRoutes.has(route), true, `${passport.label} related route ${route} missing from beta app catalog`);
    }
  }

  const countPassport = BETA_UNLOCK_PASSPORTS.find((passport) => passport.key === "the-count");
  assert.equal(countPassport?.access, "admin");
  assert.match(countPassport?.staysLocked ?? "", /Production behavior/i);
  assert.match(countPassport?.countReview ?? "", /EXP and levels as evidence/i);
});

test("beta relationship navigator makes app handoffs route-owned and understandable", () => {
  assert.equal(BETA_RELATIONSHIP_NAVIGATOR.length, 8);

  const catalogByRoute = new Map(BETA_APP_CATALOG.map((app) => [app.route, app]));
  const allowedActors = new Set([...BETA_PERSONAS.map((persona) => persona.key), "the-count", "all-users"]);
  const stepRouteKeys = new Set<string>();

  for (const chain of BETA_RELATIONSHIP_NAVIGATOR) {
    assert.equal(allowedActors.has(chain.actor), true, `${chain.label} actor is not a known puppet or shared chain`);
    assert.equal(Object.prototype.hasOwnProperty.call(BETA_STAGE_LABELS, chain.stage), true, `${chain.label} stage ${chain.stage} is not known`);
    assert.ok(chain.question.endsWith("?"), `${chain.label} needs a user question`);
    assert.ok(chain.startsWhen.length > 70, `${chain.label} needs starts-when context`);
    assert.ok(chain.userBenefit.length > 70, `${chain.label} needs user benefit copy`);
    assert.ok(chain.comesBefore.length > 70, `${chain.label} needs comes-before copy`);
    assert.ok(chain.consumes.length > 70, `${chain.label} needs consumes copy`);
    assert.ok(chain.feedsInto.length > 70, `${chain.label} needs feeds-into copy`);
    assert.ok(chain.comesAfter.length > 70, `${chain.label} needs comes-after copy`);
    assert.match(chain.countWatch, /The Count/i, `${chain.label} must name Count review`);
    assert.ok(chain.steps.length >= 5, `${chain.label} needs enough steps to explain a relationship`);
    assert.ok(chain.relatedRoutes.length >= 3, `${chain.label} needs related route context`);

    for (const step of chain.steps) {
      const app = catalogByRoute.get(step.route);
      assert.ok(app, `${chain.label} step route ${step.route} missing from beta app catalog`);
      assert.equal(step.access, app.access, `${chain.label} step ${step.route} access must match catalog`);
      assert.ok(step.why.length > 60, `${chain.label} ${step.label} needs why copy`);
      assert.ok(step.handoff.length > 45, `${chain.label} ${step.label} needs handoff copy`);
      stepRouteKeys.add(`${chain.key}:${step.route}:${step.key}`);
    }

    for (const route of chain.relatedRoutes) {
      assert.equal(catalogByRoute.has(route), true, `${chain.label} related route ${route} missing from beta app catalog`);
    }
  }

  assert.equal(stepRouteKeys.size, 43);
  const countChain = BETA_RELATIONSHIP_NAVIGATOR.find((chain) => chain.key === "count-liveops-chain");
  assert.equal(countChain?.actor, "the-count");
  assert.equal(countChain?.steps.some((step) => step.access === "admin" && step.route === "/admin"), true);
  assert.match(countChain?.countWatch ?? "", /EXP and levels as review evidence only/i);
});

test("beta route group guide clarifies overlapping route clusters before atlas browsing", () => {
  assert.deepEqual(
    BETA_ROUTE_GROUP_GUIDE.map((group) => group.key).sort(),
    ["builder-output", "collector-economy", "community-comms", "count-liveops", "creator-pipeline", "curator-signal", "first-win"],
  );

  const catalogByRoute = new Map(BETA_APP_CATALOG.map((app) => [app.route, app]));
  const allowedActors = new Set([...BETA_PERSONAS.map((persona) => persona.key), "the-count", "all-users"]);
  const personaKeys = new Set(BETA_PERSONAS.map((persona) => persona.key));
  const stages = new Set(Object.keys(BETA_STAGE_LABELS));
  const tiers = new Set([1, 2, 3, 4, 5, "all"]);
  let routeButtonCount = 0;
  const guideText = BETA_ROUTE_GROUP_GUIDE.map((group) => Object.values(group).flat(2).join(" ")).join(" ");

  for (const expected of ["first", "collector", "creator", "builder", "curator", "community", "Count"]) {
    assert.match(guideText, new RegExp(expected, "i"), `route group guide should explain ${expected} clusters`);
  }

  for (const group of BETA_ROUTE_GROUP_GUIDE) {
    assert.equal(allowedActors.has(group.actor), true, `${group.label} actor is not a known puppet or shared group`);
    assert.equal(stages.has(group.stage), true, `${group.label} stage ${group.stage} is not known`);
    assert.equal(group.atlasPersona === "all" || personaKeys.has(group.atlasPersona), true, `${group.label} atlas persona is not known`);
    assert.equal(group.atlasStage === "all" || stages.has(group.atlasStage), true, `${group.label} atlas stage is not known`);
    assert.equal(tiers.has(group.atlasTier), true, `${group.label} atlas tier is not known`);
    assert.ok(group.userQuestion.endsWith("?"), `${group.label} needs a question`);
    assert.ok(group.confusionResolved.length > 85, `${group.label} needs confusion-resolved copy`);
    assert.ok(group.useFirst.length > 70, `${group.label} needs first-route copy`);
    assert.ok(group.useNext.length > 90, `${group.label} needs next-route copy`);
    assert.ok(group.proofToLookFor.length > 80, `${group.label} needs proof copy`);
    assert.ok(group.quietRule.length > 90, `${group.label} needs quiet-rule copy`);
    assert.match(group.countWatch, /The Count/i, `${group.label} needs Count-watch copy`);
    assert.ok(group.routes.length >= 5, `${group.label} needs enough route buttons to explain the cluster`);

    for (const route of group.routes) {
      const app = catalogByRoute.get(route.route);
      assert.ok(app, `${group.label} route ${route.route} missing from beta app catalog`);
      assert.equal(route.access, app.access, `${group.label} route ${route.route} access must match catalog`);
      assert.ok(route.label.length >= 8, `${group.label} route ${route.route} needs a readable label`);
      assert.ok(route.purpose.length > 45, `${group.label} route ${route.route} needs purpose copy`);
      routeButtonCount += 1;
    }
  }

  assert.ok(routeButtonCount >= 40, "route group guide should expose a broad route-cluster button set");
  const countGroup = BETA_ROUTE_GROUP_GUIDE.find((group) => group.key === "count-liveops");
  assert.equal(countGroup?.atlasTier, 5);
  assert.equal(countGroup?.routes.some((route) => route.route === "/admin" && route.access === "admin"), true);
  assert.match(countGroup?.quietRule ?? "", /do not invent work/i);
});

test("beta unlock governance matrix keeps progression review admin-manageable", () => {
  assert.deepEqual(
    BETA_UNLOCK_GOVERNANCE_MATRIX.map((item) => item.key).sort(),
    ["builder", "collector", "community-member", "creator", "curator", "new-tezos-user", "the-count"],
  );

  const catalogRoutes = new Set(BETA_APP_CATALOG.map((app) => app.route));
  for (const item of BETA_UNLOCK_GOVERNANCE_MATRIX) {
    assert.equal(catalogRoutes.has(item.userRoute), true, `${item.label} user route ${item.userRoute} missing from beta app catalog`);
    assert.equal(catalogRoutes.has(item.adminRoute), true, `${item.label} admin route ${item.adminRoute} missing from beta app catalog`);
    assert.equal(item.adminRoute, "/admin");
    assert.equal(item.adminAccess, "admin");
    assert.ok(item.playerQuestion.endsWith("?"), `${item.label} needs a user/admin question`);
    assert.ok(item.evidence.length > 70, `${item.label} needs evidence copy`);
    assert.match(item.expSignal, /EXP|level/i, `${item.label} must explain EXP or level evidence`);
    assert.match(item.rewardOrMarketSink, /reward|WTFIAM|market|sink|inventory/i, `${item.label} must explain rewards or market sinks`);
    assert.match(item.roleBoundary, /role|permission|gate|admin|authority/i, `${item.label} must explain role or permission boundaries`);
    assert.match(item.countDecision, /The Count/i, `${item.label} must name Count review`);
    assert.match(item.abuseControl, /cap|cooldown|manual|audit|idempotent|review|rate/i, `${item.label} must include an anti-farm control`);
    assert.ok(item.relatedRoutes.length >= 4, `${item.label} needs related route context`);
    for (const route of item.relatedRoutes) {
      assert.equal(catalogRoutes.has(route), true, `${item.label} related route ${route} missing from beta app catalog`);
    }
  }

  const countRow = BETA_UNLOCK_GOVERNANCE_MATRIX.find((item) => item.key === "the-count");
  assert.equal(countRow?.userAccess, "admin");
  assert.match(countRow?.expSignal ?? "", /never become admin authority/i);
});

test("The Count admin puppet stories cover liveops management needs", () => {
  const text = BETA_COUNT_ADMIN_STORIES.map((story) => Object.values(story).join(" ")).join(" ");
  for (const expected of ["Side Quests", "Challenges", "Roles", "Rewards", "In-App Market", "Automation", "XP Log"]) {
    assert.match(text, new RegExp(expected.replace("-", "[- ]")));
  }
});

test("The Count admin workbench maps creation and management jobs to existing owner routes", () => {
  assert.deepEqual(
    BETA_COUNT_ADMIN_WORKBENCH.map((item) => item.key).sort(),
    [
      "automation-verifier-audit",
      "challenge-arc-creation",
      "market-sink-management",
      "reward-configuration",
      "role-permission-gate",
      "sidequest-definition",
      "user-need-triage",
      "visibility-communication-review",
    ],
  );

  const catalogRoutes = new Set(BETA_APP_CATALOG.map((app) => app.route));
  const workbenchText = BETA_COUNT_ADMIN_WORKBENCH.map((item) => Object.values(item).flat().join(" ")).join(" ");
  for (const expected of ["user", "side quest", "challenge", "reward", "role", "market", "automation", "notification"]) {
    assert.match(workbenchText, new RegExp(expected, "i"), `workbench should cover ${expected} management`);
  }

  for (const item of BETA_COUNT_ADMIN_WORKBENCH) {
    assert.equal(item.adminRoute, "/admin", `${item.label} must keep Count decisions in Admin`);
    assert.equal(item.adminAccess, "admin", `${item.label} must be admin-gated`);
    assert.equal(catalogRoutes.has(item.adminRoute), true, `${item.label} admin route missing from beta catalog`);
    assert.equal(catalogRoutes.has(item.playerRoute), true, `${item.label} player route ${item.playerRoute} missing from beta catalog`);
    assert.ok(item.question.endsWith("?"), `${item.label} needs a management question`);
    assert.ok(item.adminJob.length > 80, `${item.label} needs admin job copy`);
    assert.ok(item.playerNeed.length > 70, `${item.label} needs player-need copy`);
    assert.match(item.ownerSurface, /Users|Side Quests|Challenges|Rewards|Market|Roles|Automation|Notifications|App Gates|System Logs/i);
    assert.match(item.sourceOfTruth, /api|row|state|signal|matrix|group|atlas|gate|route/i, `${item.label} needs a source of truth`);
    assert.equal(item.setupChecklist.length, 3, `${item.label} needs three setup checks`);
    for (const check of item.setupChecklist) assert.ok(check.length > 45, `${item.label} setup check is too terse`);
    assert.match(item.decisionGate, /The Count|EXP|admin|role|gate|manual|surface|preferences/i, `${item.label} needs decision gate copy`);
    assert.ok(item.proofToInspect.length > 70, `${item.label} needs proof copy`);
    assert.match(item.riskControl, /cap|cooldown|manual|audit|idempotent|rate|role|gate|lock|review/i, `${item.label} needs risk control`);
    assert.ok(item.successSignal.length > 70, `${item.label} needs a success signal`);
    assert.ok(item.relatedRoutes.length >= 4, `${item.label} needs related routes`);
    for (const route of item.relatedRoutes) {
      assert.equal(catalogRoutes.has(route), true, `${item.label} related route ${route} missing from beta catalog`);
    }
  }

  const roleGate = BETA_COUNT_ADMIN_WORKBENCH.find((item) => item.key === "role-permission-gate");
  assert.match(roleGate?.decisionGate ?? "", /EXP and levels remain evidence only/i);
});

test("The Count liveops recipes turn unlock management into route-owned blueprints", () => {
  assert.deepEqual(
    BETA_COUNT_LIVEOPS_RECIPES.map((recipe) => recipe.key).sort(),
    [
      "builder-surface-recipe",
      "collector-market-recipe",
      "community-return-recipe",
      "creator-publish-recipe",
      "curator-signal-recipe",
      "starter-witness-recipe",
    ],
  );

  const catalogByRoute = new Map(BETA_APP_CATALOG.map((app) => [app.route, app]));
  const allowedActors = new Set([...BETA_PERSONAS.map((persona) => persona.key), "the-count"]);
  const stageKeys = ["detect", "define", "prove", "reward", "gate", "return"];
  const recipeText = JSON.stringify(BETA_COUNT_LIVEOPS_RECIPES);
  for (const expected of ["EXP", "side quest", "challenge", "reward", "role", "permission", "market", "notification", "No beta write"]) {
    assert.match(recipeText, new RegExp(expected, "i"), `liveops recipes should explain ${expected}`);
  }

  let stageCount = 0;
  for (const recipe of BETA_COUNT_LIVEOPS_RECIPES) {
    assert.equal(allowedActors.has(recipe.actor), true, `${recipe.label} actor is not a known puppet`);
    assert.ok(recipe.targetLevel.length > 12, `${recipe.label} needs target level copy`);
    assert.ok(recipe.userNeed.length > 85, `${recipe.label} needs user need copy`);
    assert.match(recipe.expUse, /EXP|level/i, `${recipe.label} needs EXP or level use`);
    assert.match(recipe.sideQuest, /side quest/i, `${recipe.label} needs side quest guidance`);
    assert.match(recipe.challenge, /challenge/i, `${recipe.label} needs challenge guidance`);
    assert.match(recipe.reward, /reward|WTFIAM|EXP/i, `${recipe.label} needs reward guidance`);
    assert.match(recipe.roleOrPermission, /role|permission|gate|authority|access/i, `${recipe.label} needs role or permission boundary`);
    assert.match(recipe.marketOrNotificationEffect, /market|notification|digest|notify|broadcast/i, `${recipe.label} needs market or notification effect`);
    assert.match(recipe.countDecision, /The Count/i, `${recipe.label} needs Count decision copy`);
    assert.match(recipe.antiFarmRule, /cap|cooldown|manual|review|idempotent|rate|lock|duplicate/i, `${recipe.label} needs anti-farm control`);
    assert.ok(recipe.playerReturn.length > 75, `${recipe.label} needs return loop copy`);
    assert.match(recipe.noWriteRule, /No beta write/i, `${recipe.label} must state beta does not write`);
    assert.deepEqual(recipe.stages.map((stage) => stage.key), stageKeys, `${recipe.label} needs the canonical stage order`);

    for (const stage of recipe.stages) {
      const app = catalogByRoute.get(stage.route);
      assert.ok(app, `${recipe.label} stage route ${stage.route} missing from beta app catalog`);
      assert.equal(stage.access, app.access, `${recipe.label} stage ${stage.route} access must match catalog`);
      assert.ok(stage.ownerSurface.length > 10, `${recipe.label} ${stage.label} needs owner surface copy`);
      assert.ok(stage.countAction.length > 60, `${recipe.label} ${stage.label} needs Count action copy`);
      assert.ok(stage.proofRequired.length > 65, `${recipe.label} ${stage.label} needs proof requirement copy`);
      stageCount += 1;
    }
  }

  assert.equal(stageCount, 36);
  const creatorRecipe = BETA_COUNT_LIVEOPS_RECIPES.find((recipe) => recipe.key === "creator-publish-recipe");
  assert.equal(creatorRecipe?.stages.some((stage) => stage.route === "/tools/macaroni" && stage.access === "role"), true);
  const builderRecipe = BETA_COUNT_LIVEOPS_RECIPES.find((recipe) => recipe.key === "builder-surface-recipe");
  assert.equal(builderRecipe?.stages.some((stage) => stage.route === "/admin" && stage.access === "admin"), true);
});

test("The Count command deck makes liveops actions audit-safe", () => {
  assert.equal(BETA_COUNT_LIVEOPS_COMMANDS.length, 6);
  const catalogRoutes = new Set(BETA_APP_CATALOG.map((app) => app.route));
  for (const command of BETA_COUNT_LIVEOPS_COMMANDS) {
    assert.equal(catalogRoutes.has(command.route), true, `${command.route} missing from beta app catalog`);
    assert.ok(command.trigger.length > 20, `${command.label} needs a trigger`);
    assert.ok(command.adminAction.length > 30, `${command.label} needs an admin action`);
    assert.ok(command.playerOutcome.length > 20, `${command.label} needs a player outcome`);
    assert.ok(command.auditProof.length > 20, `${command.label} needs audit proof`);
    assert.ok(command.riskControl.length > 20, `${command.label} needs risk control`);
  }
});

test("The Count admin summary reads only existing admin-gated sources", () => {
  assert.deepEqual(
    BETA_COUNT_ADMIN_SUMMARY_SOURCES.map((source) => source.key).sort(),
    ["automation-definitions", "market-operations", "quest-challenge-load", "reward-settlement", "role-gates", "user-needs"],
  );

  const catalogRoutes = new Set(BETA_APP_CATALOG.map((app) => app.route));
  for (const source of BETA_COUNT_ADMIN_SUMMARY_SOURCES) {
    assert.equal(source.access, "admin");
    assert.match(source.endpoint, /^\/api\/admin\//, `${source.label} must stay behind admin APIs`);
    assert.equal(catalogRoutes.has(source.route), true, `${source.route} missing from beta app catalog`);
    assert.ok(source.countLabel.length > 10, `${source.label} needs a count label`);
    assert.ok(source.purpose.length > 50, `${source.label} needs purpose copy`);
    assert.ok(source.failureCopy.length > 50, `${source.label} needs permission-boundary copy`);
  }
});

test("attention triage board maps signal sources to existing routes and Count controls", () => {
  assert.deepEqual(
    BETA_ATTENTION_QUEUE.map((item) => item.key).sort(),
    ["collector-heat", "count-hot-queue", "creator-recovery", "first-safe-action", "people-moving", "play-builder-output", "tomorrow-catchup"],
  );

  const catalogRoutes = new Set(BETA_APP_CATALOG.map((app) => app.route));
  const signalKeys = new Set(BETA_NOW_SIGNAL_SOURCES.map((source) => source.key));
  for (const item of BETA_ATTENTION_QUEUE) {
    assert.equal(catalogRoutes.has(item.route), true, `${item.label} route ${item.route} missing from beta app catalog`);
    assert.ok(item.question.endsWith("?"), `${item.label} must be phrased as a user question`);
    assert.ok(item.signalKeys.length >= 3, `${item.label} needs at least three proof signals`);
    assert.ok(item.whyItMatters.length > 60, `${item.label} needs why-it-matters copy`);
    assert.ok(item.action.length > 60, `${item.label} needs next-action copy`);
    assert.ok(item.quietFallback.length > 60, `${item.label} needs quiet fallback copy`);
    assert.match(item.countControl, /The Count|admin|EXP/i, `${item.label} needs Count/admin manageability copy`);
    for (const key of item.signalKeys) {
      assert.equal(signalKeys.has(key), true, `${item.label} signal ${key} missing from beta now signals`);
    }
    for (const route of item.relatedRoutes) {
      assert.equal(catalogRoutes.has(route), true, `${item.label} related route ${route} missing from beta app catalog`);
    }
  }

  const countItem = BETA_ATTENTION_QUEUE.find((item) => item.key === "count-hot-queue");
  assert.equal(countItem?.access, "admin");
  assert.equal(countItem?.route, "/admin");
  assert.equal(countItem?.cadence, "admin");
  assert.match(countItem?.countControl ?? "", /Explicit admin role/i);
});

test("daily return loops route retention through existing progression surfaces", () => {
  assert.deepEqual(
    BETA_DAILY_RETURN_LOOPS.map((loop) => loop.key).sort(),
    ["admin", "changes", "object", "people", "project", "quest"],
  );

  const catalogRoutes = new Set(BETA_APP_CATALOG.map((app) => app.route));
  for (const loop of BETA_DAILY_RETURN_LOOPS) {
    assert.equal(catalogRoutes.has(loop.route), true, `${loop.route} missing from beta app catalog`);
    for (const route of loop.relatedRoutes) {
      assert.equal(catalogRoutes.has(route), true, `${loop.label} related route ${route} missing from beta app catalog`);
    }
    assert.ok(loop.question.endsWith("?"), `${loop.label} should ask a user-facing return question`);
    assert.ok(loop.todayAction.length > 60, `${loop.label} needs a today action`);
    assert.ok(loop.tomorrowReason.length > 60, `${loop.label} needs return-tomorrow copy`);
    assert.match(loop.progressionHook, /EXP|role|quest|reward|permission/i, `${loop.label} must tie into progression`);
    assert.ok(loop.visibleProof.length > 50, `${loop.label} needs visible proof`);
    assert.ok(loop.countControl.length > 50, `${loop.label} needs Count/admin manageability copy`);
  }

  const adminLoop = BETA_DAILY_RETURN_LOOPS.find((loop) => loop.key === "admin");
  assert.equal(adminLoop?.access, "admin");
  assert.equal(adminLoop?.route, "/admin");
  assert.match(adminLoop?.progressionHook ?? "", /explicit admin permission/i);
  assert.match(adminLoop?.countControl ?? "", /The Count/i);
});

test("puppet audits record confusion, failure, hesitation, abandonment, and delight", () => {
  for (const persona of BETA_PERSONAS) {
    for (const field of ["confusion", "failure", "hesitation", "abandonment", "delightedBy"] as const) {
      assert.ok(persona[field].length > 10, `${persona.label} missing ${field}`);
    }
  }
  for (const field of ["confusion", "failure", "hesitation", "abandonment", "delightedBy"] as const) {
    assert.ok(BETA_COUNT_ADMIN_PUPPET[field].length > 10, `The Count missing ${field}`);
  }
});

test("persistent beta agents cover every requested puppet role", () => {
  assert.deepEqual(
    BETA_PERSISTENT_AGENTS.map((agent) => agent.key).sort(),
    ["builder", "collector", "community", "creator", "curator", "newuser"],
  );
  const runs = new Set(BETA_AGENT_RUNS.map((run) => run.agent));
  for (const agent of BETA_PERSISTENT_AGENTS) {
    assert.equal(runs.has(agent.key), true, `${agent.key} missing run memory`);
  }
});

test("puppet memory ledger exposes every recorded task outcome", () => {
  assert.equal(BETA_PUPPET_MEMORY_LEDGER.length, BETA_PERSISTENT_AGENTS.length);
  const agents = new Set(BETA_PERSISTENT_AGENTS.map((agent) => agent.key));
  const runs = new Map(BETA_AGENT_RUNS.map((run) => [run.agent, run]));
  const checkpointKeys = new Set(Object.keys(BETA_PUPPET_CHECKPOINT_LABELS));
  const expectedCheckpointCount = checkpointKeys.size;

  for (const item of BETA_PUPPET_MEMORY_LEDGER) {
    const run = runs.get(item.agent);
    assert.equal(agents.has(item.agent), true, `${item.agent} missing persistent agent`);
    assert.ok(run, `${item.agent} missing run memory`);
    assert.equal(item.checkpoints.length, expectedCheckpointCount, `${item.label} must expose every checkpoint`);
    assert.equal(item.checkpoints.every((checkpoint) => checkpointKeys.has(checkpoint.key)), true, `${item.label} has an unknown checkpoint`);
    assert.equal(item.checkpoints.every((checkpoint) => checkpoint.passed), true, `${item.label} must pass all checkpoint memory`);
    assert.ok(item.memory.length > 40, `${item.label} needs persistent memory`);
    assert.ok(item.firstTask.length > 20, `${item.label} needs first task copy`);
    assert.ok(item.successCondition.length > 40, `${item.label} needs success condition copy`);
    assert.ok(item.confusion.length > 25, `${item.label} needs confusion memory`);
    assert.ok(item.hesitation.length > 25, `${item.label} needs hesitation memory`);
    assert.ok(item.deadEnd.length > 25, `${item.label} needs dead-end memory`);
    assert.ok(item.abandonment.length > 25, `${item.label} needs abandonment memory`);
    assert.ok(item.success.length > 25, `${item.label} needs success memory`);
    assert.ok(item.delight.length > 25, `${item.label} needs delight memory`);
    assert.ok(item.unexpectedDiscovery.length > 25, `${item.label} needs unexpected discovery memory`);
    assert.ok(item.remainingFriction.length > 25, `${item.label} needs remaining friction memory`);
    assert.equal(item.decision, "keep", `${item.label} should be kept after retest`);
    assert.ok(item.totalSavedSec > 0, `${item.label} must save time`);
    assert.equal(item.nextStepRoute.startsWith("/"), true, `${item.label} next step must be route-owned`);
  }
});

test("puppet retest snapshots compare production baseline against beta timings", () => {
  assert.equal(BETA_AGENT_RETEST_SNAPSHOTS.length, BETA_PERSISTENT_AGENTS.length);
  const agents = new Set(BETA_PERSISTENT_AGENTS.map((agent) => agent.key));
  const runs = new Set(BETA_AGENT_RUNS.map((run) => run.agent));

  for (const snapshot of BETA_AGENT_RETEST_SNAPSHOTS) {
    assert.equal(agents.has(snapshot.agent), true, `${snapshot.agent} missing persistent agent`);
    assert.equal(runs.has(snapshot.agent), true, `${snapshot.agent} missing current run`);
    assert.equal(snapshot.metrics.length, 6, `${snapshot.label} must compare all required metrics`);
    assert.equal(snapshot.decision, "keep", `${snapshot.label} should improve enough to keep`);
    assert.equal(snapshot.allSuccessChecksPassed, true, `${snapshot.label} must pass all success checks`);
    assert.ok(snapshot.savedSec > 0, `${snapshot.label} must save time`);
    assert.ok(snapshot.percentImproved > 30, `${snapshot.label} needs a meaningful improvement`);
    assert.ok(snapshot.evidence.length > 20, `${snapshot.label} needs evidence copy`);
    assert.ok(snapshot.remainingFriction.length > 20, `${snapshot.label} needs remaining friction`);
    for (const metric of snapshot.metrics) {
      assert.ok(metric.beforeSec > metric.afterSec, `${snapshot.label} ${metric.label} must improve`);
      assert.ok(metric.afterSec <= 60, `${snapshot.label} ${metric.label} must stay under 60 seconds`);
      assert.equal(metric.savedSec, metric.beforeSec - metric.afterSec);
    }
  }

  const summary = betaAgentRetestSummary();
  assert.equal(summary.agents, 6);
  assert.equal(summary.kept, 6);
  assert.equal(summary.allUnderSixty, true);
  assert.equal(summary.underSixtyCount, 36);
  assert.ok(summary.totalSavedSec > 0);
  assert.ok(summary.averageSavedSec > 0);
});

test("visibility radar covers the requested visibility score dimensions", () => {
  const keys = new Set(BETA_VISIBILITY_SIGNALS.map((signal) => signal.key));
  for (const key of [
    "active-users",
    "new-users",
    "creators",
    "collectors",
    "builders",
    "curators",
    "new-art",
    "new-collections",
    "new-projects",
    "new-activity",
    "new-sales",
    "new-mints",
    "community-events",
    "collaboration-opportunities",
    "interesting-wallets",
    "trending-content",
  ]) {
    assert.equal(keys.has(key), true, `${key} missing from beta visibility radar`);
  }
  assert.ok(betaVisibilityScore().percent >= 70);
});

test("route bridges create next-step paths between existing apps", () => {
  assert.ok(BETA_ROUTE_BRIDGES.length >= 8);
  for (const bridge of BETA_ROUTE_BRIDGES) {
    assert.ok(bridge.route.startsWith("/"), `${bridge.to} bridge must target an existing route`);
    assert.ok(bridge.reason.length > 20, `${bridge.to} bridge needs a reason`);
  }
});

test("beta now signals summarize public data before signed-in loops", () => {
  assert.ok(BETA_NOW_SIGNAL_SOURCES.length >= 13);
  assert.ok(betaPublicNowSignalSources().length >= 10);
  assert.ok(betaSessionNowSignalSources().length >= 3);

  for (const source of betaPublicNowSignalSources()) {
    assert.match(source.endpoint, /^\/api\//, `${source.label} must use an existing API route`);
    assert.doesNotMatch(source.endpoint, /^\/api\/notifications|^\/api\/w\/timeline|^\/api\/rat-race\//);
    assert.ok(source.route.startsWith("/"), `${source.label} must route into an existing app`);
  }

  const lockedEndpoints = betaSessionNowSignalSources().map((source) => source.endpoint).join(" ");
  assert.match(lockedEndpoints, /\/api\/notifications/);
  assert.match(lockedEndpoints, /\/api\/w\/timeline/);
  assert.match(lockedEndpoints, /\/api\/rat-race\//);

  const publicEndpoints = betaPublicNowSignalSources().map((source) => source.endpoint).join(" ");
  assert.match(publicEndpoints, /\/api\/wtf-live\/public\/rooms\/wtf-live/);
  assert.match(publicEndpoints, /\/api\/calendar\/events/);
  assert.match(publicEndpoints, /\/api\/tv\/channels/);
  assert.match(publicEndpoints, /\/api\/marketplace\/trade-board/);
  assert.match(publicEndpoints, /\/api\/users\/:username\/activity/);
  assert.doesNotMatch(publicEndpoints, /\/api\/users\/:username(?:\s|$)/);
});

test("public proof board composes existing public sources into object, creator, play, and builder snippets", () => {
  assert.deepEqual(
    BETA_PUBLIC_PROOF_SOURCES.map((source) => source.key).sort(),
    ["builder-output", "creator-channel", "fresh-object", "playable-project"],
  );

  const catalogRoutes = new Set(BETA_APP_CATALOG.map((app) => app.route));
  const signalSources = new Map(BETA_NOW_SIGNAL_SOURCES.map((source) => [source.key, source]));

  for (const source of BETA_PUBLIC_PROOF_SOURCES) {
    assert.equal(catalogRoutes.has(source.route), true, `${source.route} missing from beta app catalog`);
    assert.ok(source.sourceKeys.length > 0, `${source.label} needs at least one proof source`);
    assert.ok(source.userQuestion.length > 10, `${source.label} needs a user question`);
    assert.ok(source.betaUse.length > 50, `${source.label} needs beta-use copy`);
    for (const key of source.sourceKeys) {
      const signal = signalSources.get(key);
      assert.ok(signal, `${source.label} references missing now signal ${key}`);
      assert.equal(signal.access, "public", `${source.label} must only compose public now signals`);
      assert.match(signal.endpoint, /^\/api\//, `${source.label} source ${key} must stay API-backed`);
    }
  }

  const freshObject = BETA_PUBLIC_PROOF_SOURCES.find((source) => source.key === "fresh-object");
  assert.ok(freshObject?.sourceKeys.includes("market-trade-board"));
  assert.ok(freshObject?.sourceKeys.includes("market-listings"));
});

test("creator project proof ladder separates public proof from private and role-gated creator state", () => {
  assert.deepEqual(
    BETA_CREATOR_PROJECT_PROOF_LADDER.map((step) => step.key),
    ["workspace-draft", "asset-prep", "package-drop", "durable-pin", "media-channel", "project-output", "broadcast-signal"],
  );

  const catalogByRoute = new Map(BETA_APP_CATALOG.map((app) => [app.route, app]));
  const signalKeys = new Set(BETA_NOW_SIGNAL_SOURCES.map((source) => source.key));
  const statuses = new Set(["visible", "inspect", "gated"]);

  for (const step of BETA_CREATOR_PROJECT_PROOF_LADDER) {
    const app = catalogByRoute.get(step.route);
    assert.ok(app, `${step.label} route ${step.route} missing from beta app catalog`);
    assert.equal(app.access, step.access, `${step.label} access hint must match beta app catalog`);
    assert.equal(statuses.has(step.status), true, `${step.label} status is unknown`);
    assert.ok(step.ownerSurface.length > 3, `${step.label} needs an owner surface`);
    assert.ok(step.userQuestion.endsWith("?"), `${step.label} needs a creator question`);
    assert.ok(step.visibleProof.length > 80, `${step.label} needs visible proof copy`);
    assert.ok(step.currentLimit.length > 75, `${step.label} needs current-limit copy`);
    assert.ok(step.nextDependency.length > 85, `${step.label} needs next-dependency copy`);
    assert.ok(step.gateBoundary.length > 55, `${step.label} needs gate-boundary copy`);
    assert.match(step.noWriteRule, /No beta write/i, `${step.label} must preserve the no-write boundary`);
    assert.equal(step.signalKeys.length, 3, `${step.label} should stay compact with exactly three proof signals`);
    for (const signalKey of step.signalKeys) {
      assert.equal(signalKeys.has(signalKey), true, `${step.label} signal ${signalKey} missing from now signals`);
    }
  }

  const packageStep = BETA_CREATOR_PROJECT_PROOF_LADDER.find((step) => step.key === "package-drop");
  assert.equal(packageStep?.route, "/tools/macaroni");
  assert.equal(packageStep?.access, "role");
  assert.equal(packageStep?.status, "gated");
  assert.match(packageStep?.gateBoundary ?? "", /EXP and levels are evidence/i);

  const tvStep = BETA_CREATOR_PROJECT_PROOF_LADDER.find((step) => step.key === "media-channel");
  assert.equal(tvStep?.status, "visible");
  assert.equal(tvStep?.access, "session");
  assert.match(tvStep?.gateBoundary ?? "", /public channel proof can be read/i);
});

test("discovery trails turn signals into persona next steps", () => {
  assert.deepEqual(
    BETA_DISCOVERY_TRAILS.map((trail) => trail.key).sort(),
    ["admin", "builder", "collector", "community", "creator"],
  );

  const catalogRoutes = new Set(BETA_APP_CATALOG.map((app) => app.route));
  const signalKeys = new Set(BETA_NOW_SIGNAL_SOURCES.map((source) => source.key));

  for (const trail of BETA_DISCOVERY_TRAILS) {
    assert.equal(trail.steps.length, 5, `${trail.label} should stay scannable in the first-minute path`);
    assert.ok(trail.success.length > 20, `${trail.label} needs a success condition`);
    assert.ok(trail.returnTomorrow.length > 20, `${trail.label} needs a return loop`);
    assert.ok(trail.steps.some((step) => step.sourceKey), `${trail.label} needs at least one live proof source`);
    for (const step of trail.steps) {
      assert.ok(step.route.startsWith("/"), `${trail.label} step route must be a WTFOS route`);
      assert.equal(catalogRoutes.has(step.route), true, `${step.route} missing from beta app catalog`);
      if (step.access !== "public") assert.ok((step.lockedCopy ?? "").length > 40, `${step.route} needs protected-step microcopy`);
      if (step.sourceKey) assert.equal(signalKeys.has(step.sourceKey), true, `${step.sourceKey} missing from now signal sources`);
    }
  }

  assert.ok(betaDiscoveryTrailRoutes().includes("/marketplace"));
  assert.ok(BETA_DISCOVERY_TRAILS.some((trail) => trail.key === "admin" && trail.steps.some((step) => step.route === "/admin")));
});

test("discovery trails include trail-level state copy for quiet, protected, unavailable, and admin-only data", () => {
  for (const trail of BETA_DISCOVERY_TRAILS) {
    const copy = BETA_TRAIL_STATE_COPY[trail.key];
    assert.ok(copy, `${trail.key} missing state copy`);
    assert.ok(copy.quiet.length > 50, `${trail.key} needs quiet-state copy`);
    assert.ok(copy.protected.length > 50, `${trail.key} needs protected-state copy`);
    assert.ok(copy.unavailable.length > 50, `${trail.key} needs unavailable-state copy`);
    assert.ok(copy.adminOnly.length > 50, `${trail.key} needs admin-only-state copy`);
  }

  assert.equal(BETA_TRAIL_STATE_COPY.admin.adminOnly.includes("EXP"), true);
  assert.equal(BETA_TRAIL_STATE_COPY.admin.adminOnly.includes("admin"), true);
});

test("notification groups connect return-loop events to existing surfaces", () => {
  assert.deepEqual(
    BETA_NOTIFICATION_GROUPS.map((group) => group.key).sort(),
    ["admin", "creator", "live", "market", "progress", "social"],
  );
  assert.equal(BETA_NOTIFICATION_EVENTS.length, 7);

  const catalogRoutes = new Set(BETA_APP_CATALOG.map((app) => app.route));
  const groupKeys = new Set(BETA_NOTIFICATION_GROUPS.map((group) => group.key));
  for (const group of BETA_NOTIFICATION_GROUPS) {
    assert.equal(catalogRoutes.has(group.route), true, `${group.route} missing from beta app catalog`);
    assert.ok(group.purpose.length > 30, `${group.label} needs a purpose`);
    assert.ok(group.userQuestion.length > 8, `${group.label} needs a user question`);
    assert.ok(group.returnLoop.length > 30, `${group.label} needs a return loop`);
  }

  for (const event of BETA_NOTIFICATION_EVENTS) {
    assert.equal(groupKeys.has(event.groupKey), true, `${event.label} has unknown group`);
    assert.equal(catalogRoutes.has(event.route), true, `${event.route} missing from beta app catalog`);
    assert.ok(event.retentionValue.length > 30, `${event.label} needs retention value`);
  }
  assert.ok(BETA_NOTIFICATION_EVENTS.some((event) => event.groupKey === "admin" && event.access === "admin"));
});

test("notification control guide routes users to preferences without replacing notification logic", () => {
  assert.deepEqual(
    BETA_NOTIFICATION_CONTROL_GUIDE.map((guide) => guide.key).sort(),
    BETA_NOTIFICATION_GROUPS.map((group) => group.key).sort(),
  );

  const catalogRoutes = new Set(BETA_APP_CATALOG.map((app) => app.route));
  const groupByKey = new Map(BETA_NOTIFICATION_GROUPS.map((group) => [group.key, group]));
  for (const guide of BETA_NOTIFICATION_CONTROL_GUIDE) {
    const group = groupByKey.get(guide.key);
    assert.ok(group, `${guide.key} missing notification group`);
    assert.equal(guide.actionRoute, group.route);
    assert.equal(guide.actionAccess, group.access);
    assert.equal(catalogRoutes.has(guide.actionRoute), true, `${guide.actionRoute} missing from beta app catalog`);
    assert.equal(catalogRoutes.has(guide.preferenceRoute), true, `${guide.preferenceRoute} missing from beta app catalog`);
    assert.equal(catalogRoutes.has(guide.digestRoute), true, `${guide.digestRoute} missing from beta app catalog`);
    assert.equal(guide.preferenceRoute, "/settings");
    assert.equal(guide.preferenceAccess, "session");
    assert.equal(guide.digestRoute, "/digest");
    assert.equal(guide.digestAccess, "session");
    assert.equal(guide.sourceContract, "/api/notifications/preferences");
    assert.ok(guide.signal.length > 40, `${guide.label} needs signal copy`);
    assert.ok(guide.userControl.length > 70, `${guide.label} needs control copy`);
    assert.ok(guide.quietRule.length > 70, `${guide.label} needs quiet-state copy`);
  }

  const adminGuide = BETA_NOTIFICATION_CONTROL_GUIDE.find((guide) => guide.key === "admin");
  assert.equal(adminGuide?.actionAccess, "admin");
  assert.match(adminGuide?.userControl ?? "", /strict admin gate/i);
});

test("people discovery board makes social roles visible through existing signals and routes", () => {
  assert.deepEqual(
    BETA_PEOPLE_DISCOVERY_BOARD.map((card) => card.key).sort(),
    ["active-users", "builders", "collaborators", "collectors", "creators", "curators", "interesting-wallets", "newcomers"],
  );

  const catalogRoutes = new Set(BETA_APP_CATALOG.map((app) => app.route));
  const catalogByRoute = new Map(BETA_APP_CATALOG.map((app) => [app.route, app]));
  const signalKeys = new Set(BETA_NOW_SIGNAL_SOURCES.map((source) => source.key));
  const boardText = BETA_PEOPLE_DISCOVERY_BOARD.map((card) => Object.values(card).flat().join(" ")).join(" ");
  for (const expected of ["active", "new", "creator", "collector", "builder", "curator", "collaborator", "wallet"]) {
    assert.match(boardText, new RegExp(expected, "i"), `people board should explain ${expected} visibility`);
  }

  for (const card of BETA_PEOPLE_DISCOVERY_BOARD) {
    assert.equal(catalogRoutes.has(card.route), true, `${card.label} route ${card.route} missing from beta app catalog`);
    assert.equal(catalogByRoute.get(card.route)?.access, card.access, `${card.label} access hint must match catalog`);
    assert.ok(card.sourceKeys.length >= 3, `${card.label} needs at least three proof signals`);
    for (const sourceKey of card.sourceKeys) {
      assert.equal(signalKeys.has(sourceKey), true, `${card.label} signal ${sourceKey} missing from now signals`);
    }
    assert.ok(card.userQuestion.endsWith("?"), `${card.label} needs a user question`);
    assert.ok(card.visibleProof.length > 70, `${card.label} needs visible proof copy`);
    assert.ok(card.whyCare.length > 55, `${card.label} needs why-care copy`);
    assert.ok(card.nextAction.length > 70, `${card.label} needs next-action copy`);
    assert.ok(card.quietFallback.length > 70, `${card.label} needs quiet fallback copy`);
    assert.ok(card.relatedRoutes.length >= 4, `${card.label} needs related routes`);
    for (const route of card.relatedRoutes) {
      assert.equal(catalogRoutes.has(route), true, `${card.label} related route ${route} missing from beta app catalog`);
    }
  }

  const collaborator = BETA_PEOPLE_DISCOVERY_BOARD.find((card) => card.key === "collaborators");
  assert.equal(collaborator?.access, "session");
  assert.match(collaborator?.quietFallback ?? "", /Calendar and Digest/i);
});

test("people proof gap matrix tracks social visibility weaknesses without adding writes", () => {
  assert.deepEqual(
    BETA_PEOPLE_PROOF_GAPS.map((gap) => gap.key).sort(),
    BETA_PEOPLE_DISCOVERY_BOARD.map((card) => card.key).sort(),
  );

  const boardByKey = new Map(BETA_PEOPLE_DISCOVERY_BOARD.map((card) => [card.key, card]));
  const catalogByRoute = new Map(BETA_APP_CATALOG.map((app) => [app.route, app]));
  const signalKeys = new Set(BETA_NOW_SIGNAL_SOURCES.map((source) => source.key));
  const statuses = new Set(["direct", "routed", "weak"]);

  for (const gap of BETA_PEOPLE_PROOF_GAPS) {
    const boardCard = boardByKey.get(gap.key);
    const catalogEntry = catalogByRoute.get(gap.route);
    assert.ok(boardCard, `${gap.label} must match a people discovery card`);
    assert.ok(catalogEntry, `${gap.label} route ${gap.route} missing from beta app catalog`);
    assert.equal(catalogEntry.access, gap.access, `${gap.label} access hint must match catalog`);
    assert.equal(statuses.has(gap.status), true, `${gap.label} status is unknown`);
    assert.equal(boardCard?.route, gap.route, `${gap.label} proof route should match the primary people-discovery route`);
    assert.equal(boardCard?.access, gap.access, `${gap.label} proof access should match the people-discovery access`);
    assert.ok(gap.userQuestion.endsWith("?"), `${gap.label} needs a user question`);
    assert.ok(gap.visibleProof.length > 70, `${gap.label} needs proof copy`);
    assert.ok(gap.whyItMatters.length > 75, `${gap.label} needs why-it-matters copy`);
    assert.ok(gap.currentWeakness.length > 85, `${gap.label} needs weakness copy`);
    assert.ok(gap.nextBetaMove.length > 85, `${gap.label} needs next beta move copy`);
    assert.ok(gap.quietFallback.length > 75, `${gap.label} needs quiet fallback copy`);
    assert.match(gap.noWriteRule, /No beta write/i, `${gap.label} must preserve the no-write boundary`);
    assert.equal(gap.relatedSignals.length, 3, `${gap.label} should stay compact with exactly three proof signals`);
    for (const signalKey of gap.relatedSignals) {
      assert.equal(signalKeys.has(signalKey), true, `${gap.label} signal ${signalKey} missing from now signals`);
    }
  }

  assert.ok(BETA_PEOPLE_PROOF_GAPS.some((gap) => gap.status === "weak" && gap.key === "curators"), "curator weakness must stay visible until proof improves");
  assert.ok(BETA_PEOPLE_PROOF_GAPS.some((gap) => gap.access === "session" && gap.key === "collaborators"), "collaboration gate must stay explicit");
  assert.ok(BETA_PEOPLE_PROOF_GAPS.some((gap) => gap.noWriteRule.includes("never links wallets")), "wallet proof must not become wallet logic");
});

test("communication map explains the core social surfaces without replacing navigation", () => {
  assert.deepEqual(
    BETA_COMMUNICATION_MAP.map((surface) => surface.label).sort(),
    ["Digest", "Mail", "Skywire", "W Feed", "WIM", "WTF LIVE"],
  );

  const catalogRoutes = new Set(BETA_APP_CATALOG.map((app) => app.route));
  for (const surface of BETA_COMMUNICATION_MAP) {
    assert.ok(catalogRoutes.has(surface.route), `${surface.route} missing from beta app catalog`);
    assert.ok(surface.useWhen.length > 30, `${surface.label} needs use context`);
    assert.ok(surface.before.length > 10, `${surface.label} needs before context`);
    assert.ok(surface.after.length > 10, `${surface.label} needs after context`);
    assert.ok(surface.returnReason.length > 20, `${surface.label} needs return context`);
  }
});
