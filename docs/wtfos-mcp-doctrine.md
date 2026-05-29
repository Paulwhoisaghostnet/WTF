# WTFOS MCP Doctrine

Last reviewed: 2026-05-29

This document defines the doctrine for the WTFOS MCP surface.

The goal is not merely to have an MCP server. The goal is to keep the MCP
surface always current by making app registration mandatory, machine-readable,
and derived from the same source-of-truth contracts that power WTFOS itself.

## Current State

WTFOS already exposes a real MCP endpoint and real paired-agent tooling.

- `server/routes/mcp.ts` hosts the MCP transport, bearer-token auth, and rate
  limiting.
- `server/lib/wtf-mcp.ts` defines the tool set and response formatting.
- `server/lib/wtfos-inventory.ts` turns the live package registry into the
  standard MCP-facing inventory document.
- `server/lib/wtf-access.ts` publishes the standard access manifest and scope
  groups.
- `shared/wtfos-interface.ts` defines the shared inventory schema and pathway
  classification helpers.
- `docs/public-access.md` documents the public boundary and the MCP bearer
  model.

That means the MCP stack exists today. What it does not yet have is a single
universal doctrine document that forces every app, service, or project to
register its agent-facing inventory in a standardized way.

## Doctrine

The MCP surface must obey these rules:

1. Every WTFOS app, service, project, tool, or plugin must register the
   pathways it makes available to agents.
2. Every pathway must be documented in the same normalized interface format.
3. MCP tools must be derived from current registry data, not from stale prose.
4. If a surface is not registered, MCP must treat it as unavailable.
5. If a surface is disabled by admin gate, MCP must fail closed.
6. If a surface changes, the MCP inventory must change in the same pass.
7. Agents must be able to ask one place what a surface makes possible and how
   they can reach it.
8. The canonical discovery tools are `wtf_get_capabilities`,
   `wtf_get_access_manifest`, and `wtf_get_registered_inventory`.

## What Counts As A Pathway

The inventory for each app or service should list every path an agent can use
to interact with it.

Supported pathway categories:

- browser routes
- REST or JSON APIs
- MCP tools
- admin surfaces
- WebSocket channels
- build or publish endpoints
- audit or witness endpoints
- event handles

Each pathway should say what access mode is required, what the pathway does,
and what evidence proves it exists.

## Canonical Agent Inventory

Each registered artifact should expose a machine-readable inventory that
answers the following:

- artifact identity
- domain ownership
- route or API evidence
- paired-agent access mode
- capabilities exposed to agents
- app gate, if any
- data touched
- external systems used
- rollback and uninstall path
- witness and audit path

This inventory should be formatted consistently across all apps so agents can
consume it without per-app parsing rules.

### Suggested inventory shape

```json
{
  "schemaVersion": "wtfos.inventory.v1",
  "id": "app.example.notes",
  "kind": "app",
  "domain": "WTF OS",
  "owner": "Example Creator",
  "appGate": "notes",
  "paths": [
    {
      "kind": "browser",
      "value": "/notes",
      "access": "browser-session"
    },
    {
      "kind": "api",
      "value": "GET /api/notes",
      "access": "browser-session"
    },
    {
      "kind": "mcp",
      "value": "wtf_list_notes",
      "access": "paired-mcp-agent"
    }
  ],
  "capabilities": [
    {
      "handle": "notes.list",
      "description": "List note records",
      "pathways": ["browser", "api", "mcp"],
      "dataTouched": ["notes"]
    }
  ],
  "evidence": ["/notes", "/api/notes", "server/routes/notes.ts"],
  "externalSystems": [],
  "rollback": "Restore the previous deployed commit.",
  "uninstall": "Remove the route and preserve exported user data."
}
```

The live implementation uses the same inventory family with structured
`pathways`, `permissions`, and `witness` fields in
`shared/wtfos-interface.ts` and `server/lib/wtfos-inventory.ts`.

## Handshake Rules For MCP Connected Agents

An MCP-connected agent should be able to follow the same discovery sequence
across all WTFOS surfaces:

1. Ask for the access manifest.
2. Ask for the artifact inventory.
3. Filter by access mode, app gate, and agent scope.
4. Call the relevant MCP tool.
5. Verify the response against the same interface contract.

The agent should not need a custom lookup path for each app.

## Standardized Response Format

WTFOS MCP already supports both Markdown and JSON responses. The doctrine is
that the underlying meaning must stay consistent across both formats.

- `json` is for automation, diffs, and machine ingestion.
- `markdown` is for human review and operator narration.
- Both formats must preserve the same fields and the same object meaning.
- Stable key names matter more than prose polish.

## Current Tooling Contract

The current MCP tool family is already a good example of the intended pattern.
Tool names are scoped, explicit, and domain-oriented:

- `wtf_get_access_manifest`
- `wtf_get_capabilities`
- `wtf_get_registered_inventory`
- `wtf_list_game_studio_projects`
- `wtf_create_game_studio_project`
- `wtf_submit_game_studio_project_to_arcade`

That pattern should remain true for future tools:

- names should describe the action
- names should show the domain
- read tools and write tools should stay clearly separated
- tools should not hide their access mode

## Current Enforcement Hooks

These are the live enforcement surfaces that keep the MCP doctrine honest:

- access manifest generation in `server/lib/wtf-access.ts`
- MCP auth and scope normalization in `server/routes/mcp.ts`
- feature-gated tool execution in `server/lib/wtf-mcp.ts`
- admin gate snapshots in `GET /api/apps/desktop`
- public access documentation in `docs/public-access.md`
- app/package acceptance in `shared/wtf-app-packages.ts`

The doctrine is that these surfaces must stay aligned.

## Registration Checklist

When a new WTFOS app, service, or project is added, the following must happen
in the same pass:

- register the app/package acceptance entry
- register the route or service entrypoint
- register the admin surface, if users or staff need to observe it
- register the MCP inventory rows or tool mapping
- register the access manifest entry
- document the surface in public docs
- preserve rollback and uninstall evidence

If a step is missing, the MCP surface is not current.

## Universal Formatting Rules

The doctrine requires a universal structure that agents can handshake with
across all app families.

- Use one canonical `schemaVersion` per inventory family.
- Keep identifiers stable and deterministic.
- Keep pathways explicit instead of implied.
- Keep access mode labels consistent with WTFOS access docs.
- Keep route evidence literal.
- Keep external system references named, not vague.
- Keep arrays ordered by authority or user flow, not by creation accident.
- Avoid app-specific one-off field names unless they are documented as part of
  the schema.

## What "Always Current" Means

"Always current" does not mean every surface is magically live at all times.
It means:

- the registry is derived from the current source of truth
- the source of truth is updated before the docs drift
- disabled surfaces disappear from the live agent view
- new surfaces become discoverable as soon as they are registered
- agents can trust that the inventory they see reflects the deployed commit

## Open Gap

The repo already has a real MCP server, real tools, and a real access manifest.
The missing piece is a dedicated, universal inventory contract that every
WTFOS app must register against.

This document defines the doctrine for that contract and the handshake rules
that keep it current. The live shape is implemented in
`shared/wtfos-interface.ts` and `server/lib/wtfos-inventory.ts`.
