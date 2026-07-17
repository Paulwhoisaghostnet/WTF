import { ALL_ADMIN_SURFACES, getAdminSurfaceDoctrineDomain } from "../../admin-os/admin-surface-registry";
import { WTF_CURSE_DEFINITIONS } from "@shared/curses";
import { PERMISSIONS } from "@shared/types";
import {
  ADMIN_SECTION_CATALOG,
  ADMIN_SECTION_CATALOG_VERSION,
  findAdminSectionForPanelLabel,
  findAdminSectionBySlug,
  type AdminRiskLevel,
  type AdminSectionCatalogEntry,
} from "../admin-section-catalog";

export const ADMIN_HELP_INDEX_SCHEMA_VERSION = "1.0.0";

export type AdminHelpTopicKind = "section" | "surface" | "permission" | "curse";

export type AdminHelpDestination = {
  sectionSlug: string;
  sectionLabel: string;
  href: string;
  reason: string;
};

export type AdminHelpTopic = {
  id: string;
  kind: AdminHelpTopicKind;
  title: string;
  summary: string;
  keywords: string[];
  risk: AdminRiskLevel;
  destinations: AdminHelpDestination[];
  human: {
    whenToUse: string[];
    inspect: string[];
    change: string[];
    suggestedSteps: string[];
  };
  agent: {
    stableId: string;
    sourceOfTruth: string[];
    permissionKeys: string[];
    routePatterns: string[];
    apiRoutes: string[];
    nativeSettings: string[];
    automationHandles: string[];
    adminPanelTabs: string[];
  };
};

export type AdminHelpIndex = {
  schemaVersion: string;
  catalogVersion: string;
  generatedAt: string;
  sourceCounts: {
    sections: number;
    surfaces: number;
    permissions: number;
    curses: number;
    totalTopics: number;
  };
  query: string | null;
  topics: AdminHelpTopic[];
};

export type AdminHelpSearchResult = {
  topic: AdminHelpTopic;
  score: number;
  matchedTerms: string[];
};

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))];
}

function destinationForSection(section: AdminSectionCatalogEntry, reason: string): AdminHelpDestination {
  return {
    sectionSlug: section.slug,
    sectionLabel: section.label,
    href: `/admin?section=${encodeURIComponent(section.slug)}`,
    reason,
  };
}

function buildSectionTopics(): AdminHelpTopic[] {
  return ADMIN_SECTION_CATALOG.map((section) => ({
    id: `section:${section.slug}`,
    kind: "section",
    title: section.title,
    summary: section.description,
    keywords: unique([section.slug, section.label, section.group, ...section.keywords, ...section.tasks]),
    risk: section.risk,
    destinations: [destinationForSection(section, "Canonical central admin workspace")],
    human: {
      whenToUse: section.tasks,
      inspect: section.inspect,
      change: section.change,
      suggestedSteps: [
        `Open ${section.label}.`,
        section.inspect.length ? `Inspect ${section.inspect.slice(0, 3).join(", ")}.` : "Review the available scope.",
        section.change.length ? "Select one record before using state-changing controls." : "Use the read-only evidence to route the next action.",
      ],
    },
    agent: {
      stableId: `section:${section.slug}`,
      sourceOfTruth: ["client/src/features/admin/admin-section-catalog.ts"],
      permissionKeys: section.permissionKeys,
      routePatterns: ["/admin"],
      apiRoutes: section.apiRoutes,
      nativeSettings: [],
      automationHandles: section.automationHandles,
      adminPanelTabs: [section.title],
    },
  }));
}

function buildSurfaceTopics(): AdminHelpTopic[] {
  return ALL_ADMIN_SURFACES.map((surface) => {
    const matchedSections = unique(surface.adminPanelTabs)
      .map(findAdminSectionForPanelLabel)
      .filter((section): section is AdminSectionCatalogEntry => Boolean(section));
    const fallback = findAdminSectionBySlug("os-surfaces");
    const destinations = (matchedSections.length ? matchedSections : fallback ? [fallback] : []).map(
      (section) => destinationForSection(section, `${surface.label} is managed from this workspace`)
    );
    const doctrine = getAdminSurfaceDoctrineDomain(surface);
    return {
      id: `surface:${surface.id}`,
      kind: "surface" as const,
      title: surface.label,
      summary: `${surface.domain} / ${surface.subdomain} · ${surface.kind}`,
      keywords: unique([
        surface.id,
        surface.label,
        surface.domain,
        surface.subdomain,
        surface.kind,
        surface.desktopAppKey,
        ...surface.adminPanelTabs,
        ...surface.routePatterns,
        ...surface.nativeSettings,
        ...surface.automationHandles,
        ...(surface.adminRoutes ?? []),
      ]),
      risk: "controlled-write" as AdminRiskLevel,
      destinations,
      human: {
        whenToUse: [
          `A complaint mentions ${surface.label}, ${surface.domain}, or ${surface.subdomain}.`,
          "An app, route, desktop item, native setting, or automation handle cannot be found.",
        ],
        inspect: unique([
          ...surface.routePatterns.map((route) => `Route ${route}`),
          ...surface.nativeSettings,
          ...surface.automationHandles.map((handle) => `Automation handle ${handle}`),
        ]),
        change: surface.adminPanelTabs.map((panel) => `Controls exposed through ${panel}`),
        suggestedSteps: [
          `Confirm the canonical surface ID is ${surface.id}.`,
          "Open the first listed admin destination and search the surface ID or label.",
          "Check the native setting or automation handle named in the complaint before changing role or app access.",
        ],
      },
      agent: {
        stableId: `surface:${surface.id}`,
        sourceOfTruth: [
          "client/src/features/admin-os/admin-surface-registry.ts",
          doctrine.guide,
        ],
        permissionKeys: [],
        routePatterns: surface.routePatterns,
        apiRoutes: surface.adminRoutes ?? [],
        nativeSettings: surface.nativeSettings,
        automationHandles: surface.automationHandles,
        adminPanelTabs: surface.adminPanelTabs,
      },
    };
  });
}

function buildPermissionTopics(): AdminHelpTopic[] {
  const roles = findAdminSectionBySlug("roles");
  return PERMISSIONS.map((permission) => ({
    id: `permission:${permission.key}`,
    kind: "permission" as const,
    title: permission.label,
    summary: permission.description,
    keywords: unique([permission.key, permission.label, permission.description, permission.category, "grant", "deny", "role"]),
    risk: "sensitive" as AdminRiskLevel,
    destinations: roles ? [destinationForSection(roles, "Permissions are granted and reviewed by role")] : [],
    human: {
      whenToUse: [
        `A user cannot ${permission.description.toLocaleLowerCase()}.`,
        `An operator needs to identify which roles grant ${permission.label}.`,
      ],
      inspect: ["Role permission matrix", "The user’s assigned roles in their WTF Passport"],
      change: ["Role-level permission grant"],
      suggestedSteps: [
        "Open the user’s WTF Passport and confirm their assigned roles.",
        `Open Roles and search ${permission.key}.`,
        "Change the narrowest appropriate role grant, then refresh the Passport to verify effective access.",
      ],
    },
    agent: {
      stableId: `permission:${permission.key}`,
      sourceOfTruth: ["shared/types.ts", "server/lib/permissions.ts"],
      permissionKeys: [permission.key],
      routePatterns: [],
      apiRoutes: ["GET /api/admin/permissions", "PUT /api/admin/permissions"],
      nativeSettings: [],
      automationHandles: [],
      adminPanelTabs: ["Roles"],
    },
  }));
}

function buildCurseTopics(): AdminHelpTopic[] {
  const curses = findAdminSectionBySlug("curses");
  const users = findAdminSectionBySlug("users");
  return WTF_CURSE_DEFINITIONS.map((curse) => ({
    id: `curse:${curse.key}`,
    kind: "curse" as const,
    title: curse.label,
    summary: curse.effect,
    keywords: unique([curse.key, curse.label, curse.summary, curse.effect, "curse", "complaint", "lift", "apply"]),
    risk: "sensitive" as AdminRiskLevel,
    destinations: [
      ...(curses ? [destinationForSection(curses, "Canonical broad and acute curse management")] : []),
      ...(users ? [destinationForSection(users, "A user’s WTF Passport shows their effective curse state")] : []),
    ],
    human: {
      whenToUse: [curse.summary, `A user reports: ${curse.effect}`],
      inspect: ["Affected users", "Assignment reason", "Assigned-by user", "Assignment and expiry timestamps"],
      change: ["Apply this curse", "Lift this curse"],
      suggestedSteps: [
        `Open Curses and select ${curse.label}.`,
        "Open the affected user’s WTF Passport to verify their full access and settings context.",
        "Lift or reapply only after recording the operator reason.",
      ],
    },
    agent: {
      stableId: `curse:${curse.key}`,
      sourceOfTruth: ["shared/curses.ts", "server/lib/user-curses.ts"],
      permissionKeys: ["manage_users"],
      routePatterns: [],
      apiRoutes: ["PUT /api/admin/users/:id/curses/:curseKey"],
      nativeSettings: [curse.effect],
      automationHandles: ["admin.user.curse.updated"],
      adminPanelTabs: ["Curses", "Users"],
    },
  }));
}

export const ADMIN_HELP_TOPICS: AdminHelpTopic[] = [
  ...buildSectionTopics(),
  ...buildSurfaceTopics(),
  ...buildPermissionTopics(),
  ...buildCurseTopics(),
];

function searchableText(topic: AdminHelpTopic) {
  return [
    topic.id,
    topic.kind,
    topic.title,
    topic.summary,
    ...topic.keywords,
    ...topic.human.whenToUse,
    ...topic.human.inspect,
    ...topic.human.change,
    ...topic.agent.permissionKeys,
    ...topic.agent.routePatterns,
    ...topic.agent.apiRoutes,
    ...topic.agent.nativeSettings,
    ...topic.agent.automationHandles,
    ...topic.agent.adminPanelTabs,
  ].join(" \n ").toLocaleLowerCase();
}

function queryTerms(query: string) {
  const stopWords = new Set([
    "a", "an", "and", "are", "cant", "cannot", "doesnt", "for", "i", "is", "it",
    "missing", "my", "not", "of", "on", "open", "page", "problem", "screen", "the",
    "to", "user", "wrong",
  ]);
  const terms = unique(
    query
      .toLocaleLowerCase()
      .replace(/[^a-z0-9_:/.-]+/g, " ")
      .split(/\s+/)
  ).filter((term) => !stopWords.has(term));
  return terms.length ? terms : [query.trim().toLocaleLowerCase()];
}

export function searchAdminHelpTopics(
  query: string,
  topics: AdminHelpTopic[] = ADMIN_HELP_TOPICS
): AdminHelpSearchResult[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) {
    return topics.map((topic, index) => ({
      topic,
      score: topic.kind === "section" ? 1_000 - index : 100 - index,
      matchedTerms: [],
    }));
  }
  const terms = queryTerms(normalized);
  return topics
    .map((topic) => {
      const text = searchableText(topic);
      const id = topic.id.toLocaleLowerCase();
      const title = topic.title.toLocaleLowerCase();
      const keywords = topic.keywords.map((keyword) => keyword.toLocaleLowerCase());
      const matchedTerms = terms.filter((term) => text.includes(term));
      if (matchedTerms.length !== terms.length) return null;
      let score = matchedTerms.length * 10;
      if (id === normalized) score += 500;
      if (title === normalized) score += 420;
      if (title.startsWith(normalized)) score += 240;
      if (title.includes(normalized)) score += 180;
      score += matchedTerms.filter((term) => title.includes(term)).length * 80;
      if (keywords.some((keyword) => keyword === normalized)) score += 160;
      if (topic.kind === "section") score += 35;
      if (topic.kind === "curse" && normalized.includes("curse")) score += 25;
      return { topic, score, matchedTerms };
    })
    .filter((result): result is AdminHelpSearchResult => Boolean(result))
    .sort((left, right) => right.score - left.score || left.topic.title.localeCompare(right.topic.title));
}

export function buildAdminHelpIndex(query?: string | null): AdminHelpIndex {
  const normalizedQuery = query?.trim() || null;
  const topics = normalizedQuery
    ? searchAdminHelpTopics(normalizedQuery).map((result) => result.topic)
    : ADMIN_HELP_TOPICS;
  return {
    schemaVersion: ADMIN_HELP_INDEX_SCHEMA_VERSION,
    catalogVersion: ADMIN_SECTION_CATALOG_VERSION,
    generatedAt: new Date().toISOString(),
    sourceCounts: {
      sections: ADMIN_SECTION_CATALOG.length,
      surfaces: ALL_ADMIN_SURFACES.length,
      permissions: PERMISSIONS.length,
      curses: WTF_CURSE_DEFINITIONS.length,
      totalTopics: ADMIN_HELP_TOPICS.length,
    },
    query: normalizedQuery,
    topics,
  };
}
