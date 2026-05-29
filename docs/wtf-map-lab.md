# WTF Map Lab Manual

WTF Map Lab is a lightweight WTFOS app for designing word maps, roadmaps, system structures, AI workflow diagrams, and protocol/data-path maps.

## What It Does

- Creates keyed, indexed component shapes so every shape can be identified by both a stable key and an order index.
- Connects shapes with typed, colored wiring for relationships such as `serves`, `depends`, `reads`, `writes`, and `blocks`.
- Supports node locks. Locked nodes stay fixed while the layout resolver optimizes unlocked nodes for flow or compact fit.
- Previews AT Protocol repo and firehose inputs as read-only map material.
- Saves and restores the current design through the WTFOS repo-draft boundary.

## Permissions

- Signed-in users can create, edit, connect, lock, auto-layout, save, and restore maps unless their account is in time-out.
- AT repo/firehose ingest preview requires admin access or the `system.maps.ingest` permission.
- MCP users may create map objects through paired-agent tools, but MCP must not use or expose ingested repo/firehose data paths unless a separate role and scope explicitly allows it.
- The paired-agent MCP create surface is `wtf_create_map_lab_document` with the `map-lab:write` scope. It returns a sanitized document payload from explicit node/wire inputs only.
- Canonical user AT repos are not hidden WTFOS system storage. Portable user design saves must remain explicit user map data; internal system state belongs in WTFOS-controlled repos or app storage.

## Shape Index And Key Rules

- `index` is the human scanning order. It increments as shapes are created.
- `key` is the durable identifier generated from the label plus index.
- The key should describe the component, not the current canvas position.
- Renaming a label does not automatically rewrite the key in this first version.

## AT Protocol Input Model

Map Lab treats AT Protocol inputs as source material:

- Repo import previews can add nodes for commits, lexicon records, and identity links.
- Firehose previews can add nodes for cursors, event routers, and read guards.
- Imported path contents are read-only summaries in the map. They are not granted to paired MCP agents as usable data paths.

## Save And Restore

The first version saves to a local WTFOS repo-draft slot in the browser. The product boundary is intentionally the same shape as a future WTFOS repo save:

1. User explicitly saves the current map document.
2. The document contains only map nodes, wires, labels, notes, indexes, keys, lock state, and layout.
3. Ingested repo/firehose path content remains out of the saved design unless represented as a user-visible summary node.
4. Restore loads the last saved map document into the canvas.

## Operator Notes

Register Map Lab as a WTF OS desktop app with the `map-lab` key. Its primary interaction handles are:

- `map_lab.viewed`
- `map_lab.node.created`
- `map_lab.wire.created`
- `map_lab.ingest.previewed`
- `map_lab.repo.saved`
- `map_lab.repo.restored`
