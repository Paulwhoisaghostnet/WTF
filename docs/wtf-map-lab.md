# WTF Map Lab Manual

WTF Map Lab is a WTFOS workflow graph designer for modeling complex systems as living node maps with typed ports, routed pipelines, run state, roadmaps, protocol/data-path maps, and AI workflow diagrams.

## What It Does

- Creates keyed, indexed workflow nodes so every node can be identified by both a stable key and an order index.
- Includes a built-in read-only wtfOS demo map that any user can open to inspect the system graph, pan/zoom around it, select nodes/routes, and run the preview without editing the canonical demo structure.
- Provides a typed node palette for prompt inputs, Hugging Face-style model calls, Gradio Spaces, function steps, routers, agents, memory stores, and artifact outputs.
- Connects output ports to compatible input ports with typed, colored routes for pipelines, fallbacks, conditionals, `serves`, `depends`, `reads`, `writes`, and `blocks`.
- Shows compatible/incompatible port feedback while a route is pending, supports Escape to cancel routing, and prevents mismatched port types from creating routes.
- Supports selected route inspection, route labels, route kind/status, throughput notes, color changes, Delete/Backspace route deletion, and route deletion from the inspector.
- Runs the graph as a living preview: connected nodes receive activity state and active routes pulse on the canvas.
- Supports direct node movement. Users can drag unlocked nodes on the board, nudge the selected node with controls or arrow keys, optionally snap movement to the grid, and lock important nodes so manual movement and layout optimizers leave them fixed.
- Provides a real map viewport. The app canvas scrolls inside the window, supports background panning, zoom in/out, fit-to-map, and reset view controls, and expands with maximized or resized WTF OS windows.
- Supports node locks. Locked nodes stay fixed while the layout resolver optimizes unlocked nodes for flow or compact fit.
- Previews AT Protocol repo and firehose inputs as read-only map material.
- Saves and restores the current design through the WTFOS repo-draft boundary.

## Permissions

- Signed-in users can create, edit, connect, lock, auto-layout, save, and restore maps unless their account is in time-out.
- The wtfOS demo map is read-only for every role. Users can inspect and run the local preview, but the demo's nodes, routes, labels, locks, and saved document structure cannot be edited or overwritten.
- AT repo/firehose ingest preview requires admin access or the `system.maps.ingest` permission.
- MCP users may create map objects through paired-agent tools, but MCP must not use or expose ingested repo/firehose data paths unless a separate role and scope explicitly allows it.
- The paired-agent MCP create surface is `wtf_create_map_lab_document` with the `map-lab:write` scope. It returns a sanitized document payload from explicit node/wire inputs only.
- Canonical user AT repos are not hidden WTFOS system storage. Portable user design saves must remain explicit user map data; internal system state belongs in WTFOS-controlled repos or app storage.

## Node Index And Key Rules

- `index` is the human scanning order. It increments as nodes are created.
- `key` is the durable identifier generated from the label plus index.
- The key should describe the component, not the current canvas position.
- Renaming a label does not automatically rewrite the key in this first version.

## Workflow Designer Model

- Nodes have typed input and output ports. A route starts by clicking an output port and completes by clicking a compatible input port.
- Routes are first-class graph objects with a kind, label, color, status, and throughput note.
- The graph run action is a local preview, not external execution. It marks connected nodes and routes so users can inspect the intended pipeline before wiring real APIs or agents.
- The wtfOS demo map uses the same graph model as user drafts: desktop shell, app registry, auth, WTFOS PDS, SystemEvent spine, inventory coverage, social/realtime/commerce/creator/media/chain surfaces, agents, jobs, database, deploy health, and public app output are represented as locked nodes with typed routed pipelines.
- The overview map is clickable and recenters the scrollable canvas on the chosen region.
- Hugging Face-inspired node categories are represented as local WTFOS templates; Map Lab does not call Hugging Face services by itself.

## AT Protocol Input Model

Map Lab treats AT Protocol inputs as source material:

- Repo import previews can add nodes for commits, lexicon records, and identity links.
- Firehose previews can add nodes for cursors, event routers, and read guards.
- Imported path contents are read-only summaries in the map. They are not granted to paired MCP agents as usable data paths.

## Save And Restore

The first version saves to a local WTFOS repo-draft slot in the browser. The product boundary is intentionally the same shape as a future WTFOS repo save:

1. User explicitly saves the current map document.
2. The document contains only map nodes, ports, routes, labels, notes, indexes, keys, lock state, run metadata, and layout.
3. Ingested repo/firehose path content remains out of the saved design unless represented as a user-visible summary node.
4. Restore loads the last saved map document into the canvas.

## Operator Notes

Register Map Lab as a WTF OS desktop app with the `map-lab` key. Its primary interaction handles are:

- `map_lab.viewed`
- `map_lab.demo.opened`
- `map_lab.node.created`
- `map_lab.node.moved`
- `map_lab.wire.created`
- `map_lab.route.created`
- `map_lab.pipeline.ran`
- `map_lab.ingest.previewed`
- `map_lab.repo.saved`
- `map_lab.repo.restored`
- `map_lab.viewport.changed`
