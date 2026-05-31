# WTFOS App Creation SDK

Last reviewed: 2026-05-29

This document defines the creator-facing WTFOS SDK boundary.

It is not the SDK for building widgets inside an already-running WTFOS app.
It is the creator SDK for producing new apps, services, and projects on WTFOS
that other users can inspect, test, witness, and then run through the normal
OS publication path.

## What Exists Today

WTFOS already has pieces of the creation stack, but they are distributed across
multiple contracts rather than one named SDK package.

| Surface | What it already provides | Gap relative to a full creator SDK |
| --- | --- | --- |
| `shared/wtf-app-packages.ts` | Canonical app/package acceptance registry with domain, route evidence, provenance, permission summary, rollback, and uninstall metadata. | It is an acceptance registry, not a full creator workflow SDK. |
| `shared/wtfos-interface.ts` | Canonical typed inventory format for WTFOS artifacts, pathways, capabilities, and witness metadata. | It defines the shared schema, but it still depends on the live registry to stay current. |
| `server/lib/wtf-access.ts` | Standard access manifest for browser routes, API routes, and MCP scope groups. | It does not yet describe every creator-capability pathway in one normalized schema. |
| `server/lib/wtf-mcp.ts` | MCP tool definitions, response formatting, and feature-gated tool access. | It exposes creator tools, but not a universal create-app/create-service/create-project SDK contract. |
| `server/lib/wtfos-inventory.ts` | Live registry builder that turns accepted WTFOS packages into a standardized inventory document. | It is the current source for the MCP-facing inventory response. |
| `server/routes/mcp.ts` | MCP transport, bearer auth, rate limiting, and request logging. | Transport exists; the doctrine and inventory source of truth still need to stay explicitly registry-driven. |
| `server/features/game-studio/*` | Real project creation, build, bundle, and submit flows for Game Studio. | Good precedent, but scoped to one creator domain. |
| `client/src/features/admin-os/admin-surface-registry.ts` | Admin discoverability and event handles. | Helpful observability, but not a creator SDK on its own. |

The repo therefore has a creation platform, but not a single documented
WTFOS creator SDK boundary with a standardized interface format.

## What The SDK Must Mean

The WTFOS SDK is the creator-facing contract for:

- creating apps that become first-class WTFOS surfaces
- creating services that other apps can consume through normal WTFOS pathways
- creating projects that can be built, previewed, witnessed, and published
- producing a machine-readable inventory that agents can handshake with
- keeping creation outputs visible to other users through routes, admin views,
  previews, audits, or published artifacts

The SDK should not be confused with runtime APIs inside a single app. A creator
SDK is about producing and registering new WTFOS surfaces.

## Canonical Creation Artifacts

Every WTFOS-created artifact should publish a standardized interface record.
The record should be stable enough for agent ingestion, admin review, test
coverage, and public documentation generation.

Recommended artifact kinds:

- `app`
- `service`
- `project`
- `plugin`
- `tool`

Recommended canonical fields:

- `schemaVersion`
- `id`
- `kind`
- `domain`
- `owner`
- `summary`
- `enabled`
- `pathways`
- `entrypoints`
- `capabilities`
- `permissions`
- `dataTouched`
- `externalSystems`
- `routeEvidence`
- `provenance`
- `rollback`
- `uninstall`
- `witness`
- `format`

## Standard Interface Format

The SDK should normalize all creator-facing outputs into the same interface
shape, regardless of whether the artifact is an app, service, or project.

The interface must answer these questions:

- What is this thing?
- Who owns it?
- Which WTFOS domain does it belong to?
- How do users reach it?
- How do paired MCP agents reach it?
- What data does it touch?
- Which external systems does it depend on?
- How can it be rolled back?
- How can it be uninstalled without destroying user data?
- How can another user witness the creation or validation step?

### Suggested interface shape

```json
{
  "schemaVersion": "wtfos.interface.v1",
  "id": "app.example.notes",
  "kind": "app",
  "domain": "WTF OS",
  "owner": "Example Creator",
  "summary": "A public note-taking app published on WTFOS.",
  "entrypoints": {
    "browserRoutes": ["/notes"],
    "apiRoutes": ["GET /api/notes"],
    "mcpTools": ["wtf_list_notes"]
  },
  "capabilities": [
    {
      "handle": "notes.list",
      "pathways": ["browser", "api", "mcp"],
      "access": "browser-session",
      "userOutcome": "Lists the user's notes",
      "dataTouched": ["notes"]
    }
  ],
  "permissions": {
    "userAccess": "Browser session.",
    "adminAccess": "Admin observability only."
  },
  "externalSystems": [],
  "routeEvidence": ["/notes", "/api/notes"],
  "provenance": {
    "source": "example/notes",
    "evidence": ["client/src/features/notes", "server/routes/notes.ts"]
  },
  "rollback": {
    "method": "Restore the previous deployed commit.",
    "evidence": ["deploy manifest"]
  },
  "uninstall": {
    "method": "Remove the route and preserve exported user data.",
    "preservesUserData": true,
    "evidence": ["export job"]
  },
  "witness": {
    "preview": "/notes/preview",
    "audit": "/admin/audit/notes",
    "publishedArtifact": "/api/notes/package"
  },
  "format": {
    "human": "markdown",
    "machine": "json"
  }
}
```

## Creation Lifecycle

The SDK should model creation as a visible lifecycle rather than a hidden build
step.

1. Draft the artifact and assign an `id`.
2. Attach the domain guide and provenance.
3. Declare every public route, API, and MCP pathway.
4. Declare permissions, data touched, and external systems.
5. Build the artifact or project package.
6. Publish a witnessable preview or audit trail.
7. Register the artifact in the app-package acceptance registry.
8. Register the reachable surfaces in the access manifest and admin registry.
9. Expose the agent inventory through MCP.
10. Preserve rollback and uninstall paths.

## Registration Requirements

Any WTFOS app, service, or project that is meant to be visible to other users
or paired agents should be registered in the same pass across the relevant
system maps:

- `shared/wtf-app-packages.ts`
- `server/lib/wtf-access.ts`
- `server/lib/wtfos-inventory.ts`
- `client/src/features/admin-os/admin-surface-registry.ts`
- `server/lib/wtf-mcp.ts`
- `docs/public-access.md`
- `shared/wtf-browser-routes.ts` (keep synced with `PAGE_DEFS`)
- `docs/wtfos-cli-builder-obligations.md` (CLI/Terminal pathway for app authors)

That registration set is what makes the creation surface discoverable, not just
the code itself.

## CLI / Terminal Pathway (App Authors)

wtfOS apps do **not** add per-app CLI commands. They inherit CLI reachability when their browser route is registered with gate parity.

Machine-readable contract (also exported from `@wtfos/sdk/builder-cli`):

- `shared/wtfos-cli-builder-obligations.ts`
- Human guide: `docs/wtfos-cli-builder-obligations.md`

Required in the same pass as any new gated browser route:

1. `client/src/routes/page-defs.ts` — route, auth, roles, app gate
2. `shared/wtf-browser-routes.ts` — mirror pattern (`shared/wtf-browser-routes.sync.test.ts`)
3. `server/lib/wtf-access.ts` — access manifest row with `appGate` when applicable
4. Start-menu / desktop gates when the app is launcher-visible
5. Interaction inventory + `tests/e2e/inventory/*`
6. Optional rollout logic in `shared/wtf-browser-route-access.ts` only (never CLI-only bypasses)

After registration, users run `open /your-route` (Terminal, `/cli`) or `wtfos open /your-route` (`@wtfos/cli`). Gates are evaluated via `shared/wtf-browser-route-access` or `GET /api/cli/can-open`.

**Forbidden:** validating opens against `GET /api/access` alone; adding app-specific commands to `shared/wtfos-cli/commands.ts` unless OS-wide; server shell execution from CLI.

## Universal Formatting Rules

The SDK should keep creator surfaces easy to parse by humans and agents.

- Prefer stable keys over ad hoc prose.
- Keep identifiers lowercase and delimiter-consistent.
- Keep route evidence literal and exact.
- Keep one artifact per record.
- Return the same information in both human and machine modes.
- Use `markdown` for narration and `json` for automation, but do not change the
  underlying meaning between the two.
- Avoid hidden fields that only exist in one pathway.

The live implementation now lives in `shared/wtfos-interface.ts` and
`server/lib/wtfos-inventory.ts`. Those files keep the inventory schema shared
and derive the current registry document from the accepted package catalog.

## Relationship To Game Studio

Game Studio is the strongest current example of creator tooling on WTFOS.
It already supports project creation, build records, bundle generation, and
submission into Arcade flows.

This SDK, however, must be broader than Game Studio:

- Game Studio creates games and game projects.
- The WTFOS SDK must also cover non-game apps, services, and project systems.
- The SDK must work for creator-published surfaces that other users can test
  and witness directly on WTFOS.

### CRP Nominations live example

`desktop:crp-nominations` demonstrates the full creator registration path for a
social/liveops app:

- browser route `/crp-nominate` and REST API under `/api/crp-nominations/*`
- package acceptance in `shared/wtf-app-packages.ts`
- admin surface + automation handles in `client/src/features/admin-os/admin-surface-registry.ts`
- MCP tools in `server/features/crp-nominations/mcp.ts` with `crp-nominations:read` / `crp-nominations:write`
- builder + user manuals under `docs/crp-nominations-*.md`

Use it as the template when adding another gated desktop app with paired-agent support.

## Open Gap

The main gap is not a lack of creator work. The gap is that the creator work is
not yet wrapped in one canonical, cross-app SDK contract with a shared
interface record.

This document defines that missing boundary.
