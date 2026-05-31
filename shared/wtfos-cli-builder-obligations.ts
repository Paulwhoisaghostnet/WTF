/**
 * Canonical builder obligations for wtfOS CLI / Terminal route parity.
 * Imported by @wtfos/sdk (builder surface) and enforced by inventory tests.
 */

export type WtfOsCliBuilderChecklistItem = {
  id: string;
  summary: string;
  paths: readonly string[];
  required: boolean;
};

export type WtfOsCliBuilderObligation = {
  schemaVersion: "wtfos.cli.builder.v1";
  summary: string;
  rule: string;
  surfaces: readonly string[];
  nativeCliPackage: string;
  documentation: readonly string[];
  checklist: readonly WtfOsCliBuilderChecklistItem[];
  forbidden: readonly string[];
};

export const WTFOS_CLI_BUILDER_DOCS = {
  obligations: "docs/wtfos-cli-builder-obligations.md",
  creatorSdk: "docs/wtfos-sdk.md",
  wtfOsRegistry: "docs/domains/wtf-os-registry.md",
  publicAccess: "docs/public-access.md",
  lessonsLearned: ".agents/docs/live/LESSONS_LEARNED.md",
} as const;

export const WTFOS_CLI_BUILDER_OBLIGATIONS = {
  schemaVersion: "wtfos.cli.builder.v1",
  summary:
    "New wtfOS apps inherit CLI and Terminal access through browser route registration and gate parity — never through bespoke CLI commands or the public access manifest alone.",
  rule:
    "Register the browser route, mirror it in shared route metadata, declare app gates, and update inventory/E2E in the same pass. Users reach the app with `open /your-route` (Terminal, /cli) or `wtfos open /your-route` (@wtfos/cli) subject to the same session, role, surface, and desktop-app gates as the web UI.",
  surfaces: ["/terminal", "/cli", "@wtfos/cli"],
  nativeCliPackage: "packages/wtfos-cli",
  documentation: Object.values(WTFOS_CLI_BUILDER_DOCS),
  checklist: [
    {
      id: "page-defs-route",
      summary: "Declare the browser route in PAGE_DEFS (auth, roles, app gate, title).",
      paths: ["client/src/routes/page-defs.ts"],
      required: true,
    },
    {
      id: "browser-route-meta",
      summary: "Mirror the route pattern in shared browser route metadata (sync test enforced).",
      paths: ["shared/wtf-browser-routes.ts", "shared/wtf-browser-routes.sync.test.ts"],
      required: true,
    },
    {
      id: "access-manifest",
      summary: "Register the route in the public access manifest with correct access mode and appGate.",
      paths: ["server/lib/wtf-access.ts"],
      required: true,
    },
    {
      id: "start-menu-gate",
      summary: "Wire start-menu / desktop launcher gates when the app is desktop-visible.",
      paths: [
        "client/src/components/layout/start-menu-app-gates.ts",
        "shared/types.ts",
        "shared/desktop-apps.ts",
      ],
      required: true,
    },
    {
      id: "admin-surface",
      summary: "Register admin observability (route patterns, native settings, automation handles).",
      paths: ["client/src/features/admin-os/admin-surface-registry.ts"],
      required: true,
    },
    {
      id: "package-acceptance",
      summary: "Record package acceptance (provenance, permissions, rollback, uninstall).",
      paths: ["shared/wtf-app-packages.ts"],
      required: true,
    },
    {
      id: "inventory-e2e",
      summary: "Update interaction inventory and modular E2E fixtures; run inventory coverage.",
      paths: [
        ".agents/docs/live/user-interaction-inventory.md",
        "tests/e2e/inventory/route-fixtures.mjs",
        "tests/e2e/inventory/domain-workflows.mjs",
      ],
      required: true,
    },
    {
      id: "rollout-gates",
      summary:
        "When rollout/env gates apply (e.g. staff-alpha), extend shared/wtf-browser-route-access.ts — do not bypass in CLI-only code.",
      paths: ["shared/wtf-browser-route-access.ts", "shared/skywire-rollout.ts"],
      required: false,
    },
  ],
  forbidden: [
    "Adding per-app commands to shared/wtfos-cli/commands.ts unless the behavior is OS-wide.",
    "Validating route opens against GET /api/access alone (public manifest lists all paths).",
    "Executing server shell commands or fetching gated page HTML from the CLI kernel.",
    "Skipping auth/role/app gates in /api/cli/can-open or browser CLI runtime.",
  ],
} as const satisfies WtfOsCliBuilderObligation;

/** CLI open handles derived from static browser routes (no parameterized patterns). */
export function cliOpenHandlesForBrowserRoutes(routes: readonly string[]): string[] {
  return routes
    .filter((route) => route.startsWith("/") && !route.includes(":"))
    .map((route) => `open ${route}`);
}
