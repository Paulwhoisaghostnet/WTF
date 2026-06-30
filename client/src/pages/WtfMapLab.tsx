import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import styled, { css, keyframes } from "styled-components";
import { Button, Checkbox, GroupBox, TextField } from "react95";
import { AppWindow } from "../components/layout/AppWindow";
import { useAuth } from "../lib/auth-context";
import { usePresentationShell } from "../lib/presentation-shell";
import { logClientSystemEvent } from "../lib/system-log";

type NodeKind =
  | "input"
  | "model"
  | "space"
  | "function"
  | "router"
  | "agent"
  | "memory"
  | "output"
  | "system"
  | "data"
  | "policy"
  | "repo"
  | "milestone";
type WireKind = "pipeline" | "fallback" | "conditional" | "serves" | "depends" | "reads" | "writes" | "blocks";
type PortKind = "input" | "output";
type PortDataType = "text" | "image" | "json" | "model" | "state" | "signal" | "artifact";
type NodeStatus = "idle" | "queued" | "running" | "complete" | "blocked";
type RouteStatus = "idle" | "active" | "cached" | "blocked";
type PortCompatibility = "idle" | "source" | "compatible" | "incompatible";

type NodePort = {
  id: string;
  label: string;
  kind: PortKind;
  dataType: PortDataType;
};

type MapNode = {
  id: string;
  key: string;
  index: number;
  label: string;
  kind: NodeKind;
  x: number;
  y: number;
  locked: boolean;
  system: string;
  description: string;
  notes: string;
  status: NodeStatus;
  ports: NodePort[];
  runtimeMs?: number;
};

type MapWire = {
  id: string;
  from: string;
  to: string;
  fromPort?: string;
  toPort?: string;
  kind: WireKind;
  color: string;
  label: string;
  status: RouteStatus;
  throughput?: string;
};

type MapDoc = {
  version: 1;
  title: string;
  nodes: MapNode[];
  wires: MapWire[];
  updatedAt: string;
};

type MapMode = "draft" | "wtfos-demo";

type NodeDragState = {
  nodeId: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type PanState = {
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
};

type PendingConnection = {
  nodeId: string;
  portId: string;
};

type NodeTemplate = {
  id: string;
  label: string;
  kind: NodeKind;
  system: string;
  description: string;
  notes: string;
  ports: NodePort[];
};

const STORAGE_KEY = "wtfos.map-lab.repo-draft.v1";
const NODE_KINDS: NodeKind[] = [
  "input",
  "model",
  "space",
  "function",
  "router",
  "agent",
  "memory",
  "output",
  "system",
  "data",
  "policy",
  "repo",
  "milestone",
];
const WIRE_KINDS: WireKind[] = ["pipeline", "fallback", "conditional", "serves", "depends", "reads", "writes", "blocks"];
const NODE_STATUSES: NodeStatus[] = ["idle", "queued", "running", "complete", "blocked"];
const ROUTE_STATUSES: RouteStatus[] = ["idle", "active", "cached", "blocked"];
const PALETTE = ["#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0f766e"];
const BOARD_WIDTH = 2400;
const BOARD_HEIGHT = 1560;
const NODE_WIDTH = 208;
const NODE_HEIGHT = 142;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.8;
const ZOOM_STEP = 0.1;
const GRID_SIZE = 28;

function makePorts(entries: Array<[string, string, PortKind, PortDataType]>): NodePort[] {
  return entries.map(([id, label, kind, dataType]) => ({ id, label, kind, dataType }));
}

function clonePorts(ports: NodePort[]) {
  return ports.map((port) => ({ ...port }));
}

function cloneDoc(doc: MapDoc): MapDoc {
  return {
    ...doc,
    nodes: doc.nodes.map((node) => ({ ...node, ports: clonePorts(node.ports) })),
    wires: doc.wires.map((wire) => ({ ...wire })),
  };
}

function defaultPortsForKind(kind: NodeKind): NodePort[] {
  switch (kind) {
    case "input":
      return makePorts([
        ["prompt", "Prompt", "output", "text"],
        ["context", "Context", "output", "json"],
      ]);
    case "model":
      return makePorts([
        ["prompt", "Prompt", "input", "text"],
        ["weights", "Model", "input", "model"],
        ["response", "Response", "output", "text"],
      ]);
    case "space":
      return makePorts([
        ["request", "Request", "input", "json"],
        ["result", "Result", "output", "artifact"],
      ]);
    case "function":
      return makePorts([
        ["input", "Input", "input", "json"],
        ["result", "Result", "output", "json"],
      ]);
    case "router":
      return makePorts([
        ["state", "State", "input", "state"],
        ["pass", "Pass", "output", "signal"],
        ["fallback", "Fallback", "output", "signal"],
      ]);
    case "agent":
      return makePorts([
        ["task", "Task", "input", "text"],
        ["tools", "Tools", "input", "json"],
        ["action", "Action", "output", "json"],
      ]);
    case "memory":
      return makePorts([
        ["write", "Write", "input", "json"],
        ["recall", "Recall", "output", "json"],
      ]);
    case "output":
      return makePorts([
        ["result", "Result", "input", "artifact"],
        ["publish", "Publish", "output", "signal"],
      ]);
    case "repo":
      return makePorts([
        ["commit", "Commit", "input", "json"],
        ["record", "Record", "output", "json"],
      ]);
    case "data":
      return makePorts([
        ["source", "Source", "output", "json"],
        ["snapshot", "Snapshot", "output", "artifact"],
      ]);
    case "policy":
      return makePorts([
        ["request", "Request", "input", "json"],
        ["decision", "Decision", "output", "signal"],
      ]);
    case "milestone":
      return makePorts([
        ["evidence", "Evidence", "input", "artifact"],
        ["release", "Release", "output", "signal"],
      ]);
    case "system":
    default:
      return makePorts([
        ["input", "Input", "input", "json"],
        ["output", "Output", "output", "json"],
      ]);
  }
}

function staticNode(config: Omit<MapNode, "locked" | "status" | "ports"> & Partial<Pick<MapNode, "locked" | "status" | "ports" | "runtimeMs">>): MapNode {
  return {
    ...config,
    locked: config.locked ?? true,
    status: config.status ?? "idle",
    ports: clonePorts(config.ports ?? defaultPortsForKind(config.kind)),
  };
}

const NODE_TEMPLATES: NodeTemplate[] = [
  {
    id: "prompt-input",
    label: "Prompt input",
    kind: "input",
    system: "Workflow IO",
    description: "A user, API, or repo event input that starts a pipeline.",
    notes: "Use this for text prompts, payloads, repo commits, or trigger events.",
    ports: defaultPortsForKind("input"),
  },
  {
    id: "hf-model",
    label: "HF model",
    kind: "model",
    system: "Inference",
    description: "A model call node with typed prompt and response ports.",
    notes: "Modeled after Hugging Face inference workflow steps.",
    ports: defaultPortsForKind("model"),
  },
  {
    id: "gradio-space",
    label: "Gradio Space",
    kind: "space",
    system: "Hugging Face Space",
    description: "A hosted or local Space API step that transforms inputs into artifacts.",
    notes: "Use for external tools, demos, and image/audio/model Spaces.",
    ports: defaultPortsForKind("space"),
  },
  {
    id: "function-step",
    label: "Function step",
    kind: "function",
    system: "Transform",
    description: "A deterministic transform, parser, validator, or adapter.",
    notes: "Good for schema cleanup, routing hints, or post-processing.",
    ports: defaultPortsForKind("function"),
  },
  {
    id: "route-branch",
    label: "Router",
    kind: "router",
    system: "Control flow",
    description: "A conditional branch that sends state down one of several routes.",
    notes: "Use this for fallback paths, guard checks, and user approval branches.",
    ports: defaultPortsForKind("router"),
  },
  {
    id: "agent-worker",
    label: "Agent worker",
    kind: "agent",
    system: "Automation",
    description: "An agent/tool node that receives a task and emits actions.",
    notes: "MCP-compatible authoring still cannot use ingested private repo paths.",
    ports: defaultPortsForKind("agent"),
  },
  {
    id: "memory-store",
    label: "Memory store",
    kind: "memory",
    system: "State",
    description: "A stateful cache or memory surface for retrieval and handoff.",
    notes: "Use for intermediate state, cached results, or durable workflow context.",
    ports: defaultPortsForKind("memory"),
  },
  {
    id: "artifact-output",
    label: "Artifact output",
    kind: "output",
    system: "Workflow IO",
    description: "A terminal output, publish step, report, or generated asset.",
    notes: "Use this to mark what the workflow produces.",
    ports: defaultPortsForKind("output"),
  },
];

const SEED_DOC: MapDoc = {
  version: 1,
  title: "WTFOS sovereign workflow map",
  updatedAt: new Date().toISOString(),
  nodes: [
    {
      id: "node-1",
      key: "wtfos-pds",
      index: 1,
      label: "WTFOS PDS",
      kind: "repo",
      x: 120,
      y: 160,
      locked: true,
      system: "Identity",
      description: "Sovereign repo boundary for app state and workflow drafts.",
      notes: "Repo state is inspectable as a source but not handed to paired MCP tools.",
      status: "idle",
      ports: defaultPortsForKind("repo"),
    },
    {
      id: "node-2",
      key: "map-lab",
      index: 2,
      label: "Map Lab graph",
      kind: "system",
      x: 430,
      y: 130,
      locked: false,
      system: "Designer",
      description: "Interactive visual workflow editor for complex systems, nodes, and pipeline routes.",
      notes: "Drag nodes, connect ports, inspect routes, and run a living pipeline preview.",
      status: "idle",
      ports: defaultPortsForKind("system"),
    },
    {
      id: "node-3",
      key: "hf-inference-node",
      index: 3,
      label: "HF inference node",
      kind: "model",
      x: 780,
      y: 220,
      locked: false,
      system: "Inference",
      description: "Model call step with prompt/model inputs and text output.",
      notes: "Represents an inference provider/model call in a workflow graph.",
      status: "idle",
      ports: defaultPortsForKind("model"),
    },
    {
      id: "node-4",
      key: "at-firehose",
      index: 4,
      label: "AT firehose input",
      kind: "data",
      x: 140,
      y: 470,
      locked: false,
      system: "AT Protocol",
      description: "Read-only importer for repos, commits, and stream events.",
      notes: "Imported path contents stay private and unavailable to MCP creation tools.",
      status: "idle",
      ports: defaultPortsForKind("data"),
    },
    {
      id: "node-5",
      key: "policy-router",
      index: 5,
      label: "Policy router",
      kind: "router",
      x: 780,
      y: 500,
      locked: false,
      system: "Control flow",
      description: "Routes approved requests to automation and sends blocked requests to review.",
      notes: "Branching routes make the graph useful for real operational systems.",
      status: "idle",
      ports: defaultPortsForKind("router"),
    },
    {
      id: "node-6",
      key: "artifact-output",
      index: 6,
      label: "Artifact output",
      kind: "output",
      x: 1120,
      y: 330,
      locked: false,
      system: "Workflow IO",
      description: "Terminal output for reports, generated assets, or published workflow products.",
      notes: "Use output nodes to define success conditions for a pipeline.",
      status: "idle",
      ports: defaultPortsForKind("output"),
    },
  ],
  wires: [
    {
      id: "wire-1",
      from: "node-1",
      fromPort: "record",
      to: "node-2",
      toPort: "input",
      kind: "writes",
      color: "#2563eb",
      label: "save/restore",
      status: "idle",
      throughput: "repo draft",
    },
    {
      id: "wire-2",
      from: "node-4",
      fromPort: "source",
      to: "node-5",
      toPort: "state",
      kind: "reads",
      color: "#059669",
      label: "ingest preview",
      status: "idle",
      throughput: "read-only",
    },
    {
      id: "wire-3",
      from: "node-2",
      fromPort: "output",
      to: "node-3",
      toPort: "prompt",
      kind: "pipeline",
      color: "#d97706",
      label: "prompt payload",
      status: "idle",
      throughput: "typed JSON",
    },
    {
      id: "wire-4",
      from: "node-3",
      fromPort: "response",
      to: "node-6",
      toPort: "result",
      kind: "pipeline",
      color: "#7c3aed",
      label: "model result",
      status: "idle",
      throughput: "artifact",
    },
    {
      id: "wire-5",
      from: "node-5",
      fromPort: "pass",
      to: "node-3",
      toPort: "prompt",
      kind: "conditional",
      color: "#0f766e",
      label: "approved path",
      status: "idle",
      throughput: "policy signal",
    },
  ],
};

const WTFOS_DEMO_DOC: MapDoc = {
  version: 1,
  title: "wtfOS living system map (read-only demo)",
  updatedAt: "2026-06-13T00:00:00.000Z",
  nodes: [
    staticNode({
      id: "demo-node-1",
      key: "wtfos-demo-desktop-shell",
      index: 1,
      label: "Desktop shell",
      kind: "system",
      x: 84,
      y: 84,
      system: "Core OS",
      description: "Window manager, taskbar, app chrome, session restore, and launch orchestration.",
      notes: "Every app should feel like an OS citizen here: windowed, focusable, recoverable, and gated.",
    }),
    staticNode({
      id: "demo-node-2",
      key: "wtfos-demo-app-registry",
      index: 2,
      label: "App registry + gates",
      kind: "policy",
      x: 392,
      y: 84,
      system: "Registry",
      description: "Canonical app keys, package acceptance, start menu gates, route metadata, and admin visibility.",
      notes: "Routes, launchers, command palette, docs, and admin surfaces must agree before a feature is real.",
    }),
    staticNode({
      id: "demo-node-3",
      key: "wtfos-demo-auth-roles",
      index: 3,
      label: "Auth + roles",
      kind: "policy",
      x: 700,
      y: 84,
      system: "Access",
      description: "Signed-in identity, strict admin permissions, app availability, and disabled-user boundaries.",
      notes: "Role state is separate from app gates, wallet state, and external provider permission.",
    }),
    staticNode({
      id: "demo-node-4",
      key: "wtfos-demo-pds-repo",
      index: 4,
      label: "WTFOS PDS + repos",
      kind: "repo",
      x: 1008,
      y: 84,
      system: "Sovereign data",
      description: "ATProto-backed repo boundary for identity, records, user-site publishing, and map drafts.",
      notes: "Repo and firehose imports are inspectable map material, but private path contents stay out of MCP creation tools.",
    }),
    staticNode({
      id: "demo-node-5",
      key: "wtfos-demo-system-event-spine",
      index: 5,
      label: "SystemEvent spine",
      kind: "data",
      x: 1316,
      y: 84,
      system: "Telemetry",
      description: "Normalized handles for app activity, rewards, automation, audit, and inventory coverage.",
      notes: "Meaningful interactions should have stable handles when they drive rewards, monitoring, or automation.",
    }),
    staticNode({
      id: "demo-node-6",
      key: "wtfos-demo-inventory-e2e",
      index: 6,
      label: "Inventory E2E",
      kind: "milestone",
      x: 1624,
      y: 84,
      system: "Verification",
      description: "Route smoke, behavior assertions, admin surfaces, domain workflows, and live puppet paths.",
      notes: "Skeleton coverage proves reachability; behavior coverage proves the user-visible result.",
    }),
    staticNode({
      id: "demo-node-7",
      key: "wtfos-demo-map-lab",
      index: 7,
      label: "MapLab",
      kind: "system",
      x: 84,
      y: 360,
      system: "Designer",
      description: "Living workflow canvas for nodes, typed ports, routed pipelines, run state, and system maps.",
      notes: "This read-only demo is itself a MapLab document, proving the graph can model wtfOS.",
    }),
    staticNode({
      id: "demo-node-8",
      key: "wtfos-demo-admin-os",
      index: 8,
      label: "Admin OS",
      kind: "system",
      x: 392,
      y: 360,
      system: "Operations",
      description: "Strict-admin control surfaces, health, app policy, backup, pricing, and governance tools.",
      notes: "Admin surfaces need compact trust states, registry identity, and focused operator recovery paths.",
    }),
    staticNode({
      id: "demo-node-9",
      key: "wtfos-demo-launch-surfaces",
      index: 9,
      label: "Launch surfaces",
      kind: "router",
      x: 700,
      y: 360,
      system: "Navigation",
      description: "Start Menu, desktop icons, command palette, Settings handoffs, and direct URLs.",
      notes: "Stale shortcuts and direct routes must resolve to the same app owner and access gates.",
    }),
    staticNode({
      id: "demo-node-10",
      key: "wtfos-demo-wim",
      index: 10,
      label: "WIM messenger",
      kind: "agent",
      x: 1008,
      y: 360,
      system: "Social desktop",
      description: "Buddy list, modular chat widgets, WTF LIVE attendance actions, and desktop-native messaging.",
      notes: "Messenger widgets belong at desktop level, not trapped inside a nested app window.",
    }),
    staticNode({
      id: "demo-node-11",
      key: "wtfos-demo-skywire-w",
      index: 11,
      label: "Skywire + W",
      kind: "space",
      x: 1316,
      y: 360,
      system: "AT social",
      description: "Bluesky bridge, market feed, OAuth permission states, vault shares, posts, and chat add-ons.",
      notes: "OAuth identity, platform actor intent, and callback completion are risk-bearing boundaries.",
    }),
    staticNode({
      id: "demo-node-12",
      key: "wtfos-demo-live",
      index: 12,
      label: "WTF LIVE",
      kind: "space",
      x: 1624,
      y: 360,
      system: "Realtime rooms",
      description: "Rooms, stages, chat, attendance, private access, media streams, and tip-item redemption.",
      notes: "Signed-in joins preserve the desktop context while guests can use public room envelopes.",
    }),
    staticNode({
      id: "demo-node-13",
      key: "wtfos-demo-marketplace",
      index: 13,
      label: "WTFIAM marketplace",
      kind: "system",
      x: 1932,
      y: 360,
      system: "Commerce",
      description: "In-app market catalog, pricing admin, inventory redemption, tips, and purchasable utilities.",
      notes: "Value-bearing interactions need object, price, wallet, role, and durable side-effect clarity.",
    }),
    staticNode({
      id: "demo-node-14",
      key: "wtfos-demo-macaroni",
      index: 14,
      label: "Macaroni Studio",
      kind: "function",
      x: 84,
      y: 652,
      system: "Creator tools",
      description: "Generative mint-site builder, media policy, wallet setup, user-site publishing, and contract prep.",
      notes: "Creator flows coordinate media limits, subdomains, Shadownet rehearsals, and publish safety.",
    }),
    staticNode({
      id: "demo-node-15",
      key: "wtfos-demo-ipfs-porcupin",
      index: 15,
      label: "IPFS + Porcupin",
      kind: "repo",
      x: 392,
      y: 652,
      system: "Storage",
      description: "PDS-backed pinning, Fileship/Pinata-style providers, manifests, pin policy, and media persistence.",
      notes: "Pinned media needs explicit owner policy, route registration, and inventory coverage.",
    }),
    staticNode({
      id: "demo-node-16",
      key: "wtfos-demo-media-gallery",
      index: 16,
      label: "Media + gallery",
      kind: "output",
      x: 700,
      y: 652,
      system: "Media",
      description: "My media, public gallery, token views, colleKT bridge, previews, and publication outputs.",
      notes: "Media surfaces should separate private library state from public/gallery inspection state.",
    }),
    staticNode({
      id: "demo-node-17",
      key: "wtfos-demo-game-studio",
      index: 17,
      label: "Game Studio + tools",
      kind: "space",
      x: 1008,
      y: 652,
      system: "Creation",
      description: "Game templates, creation tools, particle painters, studios, and app package experiments.",
      notes: "Imported tools need brand-residue scans, app-window conformance, and stable first-open geometry.",
    }),
    staticNode({
      id: "demo-node-18",
      key: "wtfos-demo-tv-tezamp",
      index: 18,
      label: "TV + Tezamp",
      kind: "output",
      x: 1316,
      y: 652,
      system: "Playback",
      description: "TV viewer, creator channels, schedules, bumpers, music playback, and media-source telemetry.",
      notes: "Playback routes need explicit cache, embed, source, and health states.",
    }),
    staticNode({
      id: "demo-node-19",
      key: "wtfos-demo-wallet-tezos",
      index: 19,
      label: "Wallet + Tezos",
      kind: "policy",
      x: 1624,
      y: 652,
      system: "Chain ops",
      description: "Wallet preflight, network guards, marketplace contracts, domains, swaps, and Hoard ownership.",
      notes: "Contract address, payload version, RPC, and chain id must rotate together.",
    }),
    staticNode({
      id: "demo-node-20",
      key: "wtfos-demo-indexers",
      index: 20,
      label: "Indexers + analytics",
      kind: "data",
      x: 1932,
      y: 652,
      system: "External data",
      description: "TzKT, tz2at replay, Objkt supplements, token metadata, market diagnostics, and leaderboard reads.",
      notes: "External scans should disclose coverage, freshness, page caps, and supplemental source boundaries.",
    }),
    staticNode({
      id: "demo-node-21",
      key: "wtfos-demo-mcp-agents",
      index: 21,
      label: "MCP + agents",
      kind: "agent",
      x: 238,
      y: 976,
      system: "Automation",
      description: "Paired agents, browser/native tools, bot workflows, and map-authoring command surfaces.",
      notes: "Agent tools mirror browser authority; they must not bypass roles, gates, or repo privacy.",
    }),
    staticNode({
      id: "demo-node-22",
      key: "wtfos-demo-background-jobs",
      index: 22,
      label: "Background jobs",
      kind: "function",
      x: 546,
      y: 976,
      system: "Runtime",
      description: "Queues, boot seeds, backfills, health checks, retries, and operator-visible degraded states.",
      notes: "Background work needs idempotency, audit status, and recovery paths.",
    }),
    staticNode({
      id: "demo-node-23",
      key: "wtfos-demo-postgres",
      index: 23,
      label: "Supabase/Postgres",
      kind: "memory",
      x: 854,
      y: 976,
      system: "Persistence",
      description: "Schema, migrations, policies, durable app state, inventory records, and event storage.",
      notes: "Seed migrations must honor existing production constraints and run non-interactively.",
    }),
    staticNode({
      id: "demo-node-24",
      key: "wtfos-demo-deploy-health",
      index: 24,
      label: "Hetzner deploy + health",
      kind: "milestone",
      x: 1162,
      y: 976,
      system: "Release",
      description: "Main promotion, Hetzner workflow, health commit checks, smoke tests, and production verification.",
      notes: "Full send means main is pushed, deploy completes, live health matches, and production is smoke-tested.",
    }),
    staticNode({
      id: "demo-node-25",
      key: "wtfos-demo-public-app",
      index: 25,
      label: "Public wtfOS app",
      kind: "output",
      x: 1470,
      y: 976,
      system: "Production",
      description: "The user-facing desktop, public routes, live rooms, creator sites, and commerce surfaces.",
      notes: "The final product is the connected behavior users can actually open, inspect, operate, and trust.",
    }),
  ],
  wires: [
    { id: "demo-wire-1", from: "demo-node-1", fromPort: "output", to: "demo-node-2", toPort: "request", kind: "serves", color: "#2563eb", label: "registers apps", status: "idle", throughput: "app keys" },
    { id: "demo-wire-2", from: "demo-node-2", fromPort: "decision", to: "demo-node-3", toPort: "request", kind: "blocks", color: "#dc2626", label: "gate checks", status: "idle", throughput: "roles + gates" },
    { id: "demo-wire-3", from: "demo-node-3", fromPort: "decision", to: "demo-node-4", toPort: "commit", kind: "writes", color: "#7c3aed", label: "identity records", status: "idle", throughput: "repo state" },
    { id: "demo-wire-4", from: "demo-node-4", fromPort: "record", to: "demo-node-5", toPort: "input", kind: "writes", color: "#059669", label: "events + records", status: "idle", throughput: "normalized handles" },
    { id: "demo-wire-5", from: "demo-node-5", fromPort: "source", to: "demo-node-6", toPort: "evidence", kind: "depends", color: "#d97706", label: "coverage proof", status: "idle", throughput: "inventory rows" },
    { id: "demo-wire-6", from: "demo-node-2", fromPort: "decision", to: "demo-node-7", toPort: "input", kind: "serves", color: "#2563eb", label: "launch MapLab", status: "idle", throughput: "desktop route" },
    { id: "demo-wire-7", from: "demo-node-2", fromPort: "decision", to: "demo-node-8", toPort: "input", kind: "serves", color: "#2563eb", label: "admin surfaces", status: "idle", throughput: "strict admin" },
    { id: "demo-wire-8", from: "demo-node-2", fromPort: "decision", to: "demo-node-9", toPort: "state", kind: "serves", color: "#2563eb", label: "start/menu/cmd", status: "idle", throughput: "launch intent" },
    { id: "demo-wire-9", from: "demo-node-9", fromPort: "pass", to: "demo-node-10", toPort: "task", kind: "pipeline", color: "#0f766e", label: "message handoff", status: "idle", throughput: "desktop widgets" },
    { id: "demo-wire-10", from: "demo-node-9", fromPort: "pass", to: "demo-node-11", toPort: "request", kind: "pipeline", color: "#0f766e", label: "social launch", status: "idle", throughput: "AT app" },
    { id: "demo-wire-11", from: "demo-node-9", fromPort: "pass", to: "demo-node-12", toPort: "request", kind: "pipeline", color: "#0f766e", label: "room launch", status: "idle", throughput: "live session" },
    { id: "demo-wire-12", from: "demo-node-9", fromPort: "pass", to: "demo-node-13", toPort: "input", kind: "pipeline", color: "#0f766e", label: "market launch", status: "idle", throughput: "commerce app" },
    { id: "demo-wire-13", from: "demo-node-13", fromPort: "output", to: "demo-node-12", toPort: "request", kind: "writes", color: "#d97706", label: "tip items", status: "idle", throughput: "redeemable WTF" },
    { id: "demo-wire-14", from: "demo-node-10", fromPort: "action", to: "demo-node-12", toPort: "request", kind: "serves", color: "#059669", label: "attendance actions", status: "idle", throughput: "buddy controls" },
    { id: "demo-wire-15", from: "demo-node-11", fromPort: "result", to: "demo-node-10", toPort: "tools", kind: "writes", color: "#7c3aed", label: "chat permissions", status: "idle", throughput: "OAuth state" },
    { id: "demo-wire-16", from: "demo-node-14", fromPort: "result", to: "demo-node-15", toPort: "commit", kind: "writes", color: "#059669", label: "pin media", status: "idle", throughput: "artifact CIDs" },
    { id: "demo-wire-17", from: "demo-node-15", fromPort: "record", to: "demo-node-16", toPort: "result", kind: "serves", color: "#2563eb", label: "media records", status: "idle", throughput: "gallery assets" },
    { id: "demo-wire-18", from: "demo-node-17", fromPort: "result", to: "demo-node-16", toPort: "result", kind: "writes", color: "#7c3aed", label: "tool output", status: "idle", throughput: "created assets" },
    { id: "demo-wire-19", from: "demo-node-16", fromPort: "publish", to: "demo-node-18", toPort: "result", kind: "serves", color: "#d97706", label: "playback sources", status: "idle", throughput: "media refs" },
    { id: "demo-wire-20", from: "demo-node-19", fromPort: "decision", to: "demo-node-13", toPort: "input", kind: "blocks", color: "#dc2626", label: "wallet preflight", status: "idle", throughput: "chain guard" },
    { id: "demo-wire-21", from: "demo-node-20", fromPort: "source", to: "demo-node-19", toPort: "request", kind: "reads", color: "#059669", label: "chain reads", status: "idle", throughput: "TzKT/tz2at" },
    { id: "demo-wire-22", from: "demo-node-21", fromPort: "action", to: "demo-node-7", toPort: "input", kind: "writes", color: "#7c3aed", label: "agent-authored maps", status: "idle", throughput: "bounded tools" },
    { id: "demo-wire-23", from: "demo-node-22", fromPort: "result", to: "demo-node-23", toPort: "write", kind: "writes", color: "#2563eb", label: "durable jobs", status: "idle", throughput: "queue rows" },
    { id: "demo-wire-24", from: "demo-node-23", fromPort: "recall", to: "demo-node-24", toPort: "evidence", kind: "depends", color: "#d97706", label: "migration proof", status: "idle", throughput: "schema state" },
    { id: "demo-wire-25", from: "demo-node-24", fromPort: "release", to: "demo-node-25", toPort: "result", kind: "pipeline", color: "#0f766e", label: "full-send release", status: "idle", throughput: "live health" },
    { id: "demo-wire-26", from: "demo-node-25", fromPort: "publish", to: "demo-node-5", toPort: "input", kind: "writes", color: "#059669", label: "live telemetry", status: "idle", throughput: "smoke signals" },
  ],
};

const pulseRoute = keyframes`
  from { stroke-dashoffset: 24; }
  to { stroke-dashoffset: 0; }
`;

const mapLabRegionAttrs = (region: string): any => ({
  "data-map-lab-region": region,
});

const Shell = styled.div.attrs(mapLabRegionAttrs("surface"))`
  width: 100%;
  height: 100%;
  min-height: 590px;
  display: grid;
  grid-template-columns: minmax(210px, 260px) minmax(390px, 1fr) minmax(240px, 310px);
  grid-template-rows: minmax(0, 1fr);
  gap: 10px;
  color: #101827;

  &[data-map-lab-presentation-host="gamma"] {
    background: #070706;
    background-image: none;
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    letter-spacing: 0;
  }

  &[data-map-lab-presentation-host="gamma"],
  &[data-map-lab-presentation-host="gamma"] * {
    box-shadow: none !important;
    filter: none !important;
    letter-spacing: 0 !important;
    text-shadow: none !important;
  }

  &[data-map-lab-presentation-host="gamma"] * {
    background-image: none !important;
  }

  &[data-map-lab-presentation-host="gamma"] :where(button, input, textarea, select, p, span, strong, div, section, article, h1, h2, h3, h4, label, legend, fieldset) {
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
  }

  &[data-map-lab-presentation-host="gamma"] :where(code, pre),
  &[data-map-lab-presentation-host="gamma"] [data-map-lab-region="zoom"],
  &[data-map-lab-presentation-host="gamma"] [data-map-lab-region="status-pill"],
  &[data-map-lab-presentation-host="gamma"] [data-map-lab-region="small"],
  &[data-map-lab-presentation-host="gamma"] [data-map-lab-region="node-top"],
  &[data-map-lab-presentation-host="gamma"] [data-map-lab-region="node-meta"] {
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace !important;
  }

  &[data-map-lab-presentation-host="gamma"] :where(p, span, div, label, legend, strong) {
    color: #f2ead9 !important;
  }

  &[data-map-lab-presentation-host="gamma"] [data-map-lab-region] {
    border-radius: 6px !important;
    min-width: 0;
  }

  &[data-map-lab-presentation-host="gamma"] fieldset,
  &[data-map-lab-presentation-host="gamma"] [data-map-lab-region="panel"],
  &[data-map-lab-presentation-host="gamma"] [data-map-lab-region="toolbar"],
  &[data-map-lab-presentation-host="gamma"] [data-map-lab-region="viewport"],
  &[data-map-lab-presentation-host="gamma"] [data-map-lab-region="node-card"],
  &[data-map-lab-presentation-host="gamma"] [data-map-lab-region="template-button"],
  &[data-map-lab-presentation-host="gamma"] [data-map-lab-region="route-list-item"],
  &[data-map-lab-presentation-host="gamma"] [data-map-lab-region="run-metric"],
  &[data-map-lab-presentation-host="gamma"] [data-map-lab-region="minimap"] {
    background: #11110f !important;
    border: 1px solid rgba(242, 234, 217, 0.16) !important;
    color: #f2ead9 !important;
  }

  &[data-map-lab-presentation-host="gamma"] [data-map-lab-region="board"] {
    background: #070706 !important;
    border: 1px solid rgba(0, 210, 255, 0.34) !important;
  }

  &[data-map-lab-presentation-host="gamma"] [data-map-lab-node="true"] {
    border-color: rgba(0, 210, 255, 0.5) !important;
  }

  &[data-map-lab-presentation-host="gamma"] [data-map-lab-region="status-pill"],
  &[data-map-lab-presentation-host="gamma"] [data-map-lab-region="pending-badge"] {
    background: #070706 !important;
    border: 1px solid rgba(0, 210, 255, 0.58) !important;
    color: #00d2ff !important;
  }

  &[data-map-lab-presentation-host="gamma"] [data-map-lab-region="run-metric"] strong {
    color: #d6ff3f !important;
  }

  &[data-map-lab-presentation-host="gamma"] [data-map-lab-region="node-meta"],
  &[data-map-lab-presentation-host="gamma"] [data-map-lab-region="node-description"],
  &[data-map-lab-presentation-host="gamma"] [data-map-lab-region="small"] {
    color: rgba(242, 234, 217, 0.68) !important;
  }

  &[data-map-lab-presentation-host="gamma"] button,
  &[data-map-lab-presentation-host="gamma"] input,
  &[data-map-lab-presentation-host="gamma"] select,
  &[data-map-lab-presentation-host="gamma"] textarea {
    background: #070706 !important;
    border: 1px solid rgba(242, 234, 217, 0.28) !important;
    border-radius: 6px !important;
    color: #f2ead9 !important;
  }

  &[data-map-lab-presentation-host="gamma"] button:not(:disabled):hover,
  &[data-map-lab-presentation-host="gamma"] button:focus-visible,
  &[data-map-lab-presentation-host="gamma"] input:focus-visible,
  &[data-map-lab-presentation-host="gamma"] select:focus-visible,
  &[data-map-lab-presentation-host="gamma"] textarea:focus-visible,
  &[data-map-lab-presentation-host="gamma"] [data-map-lab-region="viewport"]:focus {
    outline: 1px solid #00d2ff !important;
    outline-offset: 2px;
  }

  &[data-map-lab-presentation-host="gamma"] button:not(:disabled) {
    border-color: rgba(0, 210, 255, 0.58) !important;
    color: #00d2ff !important;
  }

  &[data-map-lab-presentation-host="gamma"] button:disabled,
  &[data-map-lab-presentation-host="gamma"] input:disabled,
  &[data-map-lab-presentation-host="gamma"] select:disabled,
  &[data-map-lab-presentation-host="gamma"] textarea:disabled {
    color: rgba(242, 234, 217, 0.42) !important;
    opacity: 1 !important;
  }

  @media (max-width: 920px) {
    height: auto;
    min-height: 0;
    grid-template-columns: 1fr;
  }
`;

const Panel = styled.div.attrs(mapLabRegionAttrs("panel"))`
  background: #f7f7ef;
  border: 1px solid #4b5563;
  box-shadow: inset 1px 1px 0 #ffffff, inset -1px -1px 0 #9ca3af;
  padding: 10px;
  min-width: 0;
  min-height: 0;
  overflow: auto;

  @media (max-width: 920px) {
    overflow: visible;
  }
`;

const Workspace = styled.div.attrs(mapLabRegionAttrs("workspace"))`
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 8px;

  @media (max-width: 920px) {
    order: -1;
    min-height: 650px;
    grid-template-rows: auto 560px;
  }
`;

const CanvasToolbar = styled.div.attrs(mapLabRegionAttrs("toolbar"))`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  background: #f7f7ef;
  border: 1px solid #4b5563;
  box-shadow: inset 1px 1px 0 #ffffff, inset -1px -1px 0 #9ca3af;
  padding: 8px;
`;

const ToolGroup = styled.div.attrs(mapLabRegionAttrs("tool-group"))`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
`;

const ZoomReadout = styled.span.attrs(mapLabRegionAttrs("zoom"))`
  min-width: 46px;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
`;

const PendingBadge = styled.span.attrs(mapLabRegionAttrs("pending-badge"))`
  border: 1px solid #0f766e;
  background: #dcfce7;
  color: #064e3b;
  padding: 3px 6px;
  font-size: 11px;
  font-weight: 700;
`;

const WorkspaceFrame = styled.div.attrs(mapLabRegionAttrs("viewport"))<{ $panning: boolean }>`
  position: relative;
  min-height: 0;
  overflow: auto;
  background: #dfe8e8;
  border: 1px solid #111827;
  scrollbar-gutter: stable both-edges;
  overscroll-behavior: contain;
  cursor: ${(p) => (p.$panning ? "grabbing" : "grab")};
  touch-action: none;

  &:focus {
    outline: 3px solid #2563eb;
    outline-offset: 2px;
  }

  @media (max-width: 920px) {
    height: 560px;
    min-height: 0;
  }
`;

const BoardSpace = styled.div.attrs(mapLabRegionAttrs("board-space"))<{ $zoom: number }>`
  position: relative;
  width: ${(p) => BOARD_WIDTH * p.$zoom}px;
  min-width: ${(p) => BOARD_WIDTH * p.$zoom}px;
  max-width: none;
  height: ${(p) => BOARD_HEIGHT * p.$zoom}px;
`;

const Board = styled.div.attrs(mapLabRegionAttrs("board"))<{ $zoom: number }>`
  position: relative;
  width: ${BOARD_WIDTH}px;
  min-width: ${BOARD_WIDTH}px;
  max-width: none;
  height: ${BOARD_HEIGHT}px;
  transform: scale(${(p) => p.$zoom});
  transform-origin: 0 0;
  background:
    linear-gradient(rgba(31, 41, 55, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(31, 41, 55, 0.08) 1px, transparent 1px),
    linear-gradient(rgba(37, 99, 235, 0.16) 2px, transparent 2px),
    linear-gradient(90deg, rgba(37, 99, 235, 0.16) 2px, transparent 2px),
    #eef2f2;
  background-size: 28px 28px, 28px 28px, 140px 140px, 140px 140px;
`;

const WireSvg = styled.svg.attrs(mapLabRegionAttrs("wire-svg"))`
  position: absolute;
  inset: 0;
  width: ${BOARD_WIDTH}px;
  height: ${BOARD_HEIGHT}px;
`;

const RoutePath = styled.path.attrs(mapLabRegionAttrs("route-path"))<{ $active: boolean; $selected: boolean }>`
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: stroke;
  cursor: pointer;
  stroke-width: ${(p) => (p.$selected ? 6 : 4)};
  filter: ${(p) => (p.$selected ? "drop-shadow(2px 2px 0 rgba(17, 24, 39, 0.3))" : "none")};
  ${(p) =>
    p.$active &&
    css`
      stroke-dasharray: 12 8;
      animation: ${pulseRoute} 950ms linear infinite;
    `}
`;

const RouteHitPath = styled.path.attrs(mapLabRegionAttrs("route-hit-path"))`
  fill: none;
  stroke: transparent;
  stroke-width: 18;
  pointer-events: stroke;
  cursor: pointer;
`;

const NodeCard = styled.div.attrs(mapLabRegionAttrs("node-card"))<{ $x: number; $y: number; $kind: NodeKind; $selected: boolean; $locked: boolean; $dragging: boolean }>`
  position: absolute;
  left: ${(p) => p.$x}px;
  top: ${(p) => p.$y}px;
  width: ${NODE_WIDTH}px;
  height: ${NODE_HEIGHT}px;
  border: 2px solid ${(p) => (p.$selected ? "#111827" : "#334155")};
  background: ${(p) =>
    ({
      input: "#f0fdf4",
      model: "#eff6ff",
      space: "#ecfeff",
      function: "#ffffff",
      router: "#fff7ed",
      agent: "#fdf2f8",
      memory: "#f5f3ff",
      output: "#fefce8",
      system: "#ffffff",
      data: "#f0fdf4",
      policy: "#fff7ed",
      repo: "#eff6ff",
      milestone: "#fdf2f8",
    })[p.$kind]};
  box-shadow: ${(p) => (p.$selected ? "4px 4px 0 #111827" : "2px 2px 0 rgba(17, 24, 39, 0.22)")};
  padding: 10px 12px;
  text-align: left;
  cursor: ${(p) => (p.$locked ? "not-allowed" : p.$dragging ? "grabbing" : "grab")};
  font-family: "MS Sans Serif", "Segoe UI", Tahoma, sans-serif;
  touch-action: none;
  user-select: none;
  overflow: visible;

  &:focus-visible {
    outline: 3px solid #2563eb;
    outline-offset: 2px;
  }
`;

const NodeTop = styled.div.attrs(mapLabRegionAttrs("node-top"))`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 10px;
  text-transform: uppercase;
  color: #475569;
`;

const NodeLabel = styled.div.attrs(mapLabRegionAttrs("node-label"))`
  margin-top: 7px;
  font-size: 14px;
  font-weight: 800;
  line-height: 1.1;
  word-break: break-word;
`;

const NodeMeta = styled.div.attrs(mapLabRegionAttrs("node-meta"))`
  margin-top: 6px;
  font-size: 11px;
  color: #334155;
`;

const NodeDescription = styled.div.attrs(mapLabRegionAttrs("node-description"))`
  margin-top: 6px;
  color: #475569;
  font-size: 10px;
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const StatusPill = styled.span.attrs(mapLabRegionAttrs("status-pill"))<{ $status: NodeStatus | RouteStatus }>`
  display: inline-flex;
  align-items: center;
  min-height: 17px;
  padding: 1px 5px;
  border: 1px solid #334155;
  background: ${(p) =>
    ({
      idle: "#f8fafc",
      queued: "#e0f2fe",
      running: "#dcfce7",
      complete: "#bbf7d0",
      blocked: "#fee2e2",
      active: "#dcfce7",
      cached: "#fef3c7",
    })[p.$status]};
  color: #111827;
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
`;

const PortRail = styled.div.attrs(mapLabRegionAttrs("port-rail"))<{ $side: "left" | "right" }>`
  position: absolute;
  top: 36px;
  ${(p) => (p.$side === "left" ? "left: -11px;" : "right: -11px;")}
  display: grid;
  gap: 13px;
  z-index: 3;
`;

const PortButton = styled.button.attrs(mapLabRegionAttrs("port"))<{ $kind: PortKind; $active: boolean; $dataType: PortDataType; $compatibility: PortCompatibility }>`
  width: 20px;
  height: 20px;
  border: ${(p) =>
    p.$compatibility === "source"
      ? "3px solid #111827"
      : p.$compatibility === "compatible"
        ? "3px solid #047857"
        : p.$compatibility === "incompatible"
          ? "2px solid #dc2626"
          : p.$active
            ? "3px solid #111827"
            : "2px solid #334155"};
  border-radius: 999px;
  background: ${(p) =>
    ({
      text: "#dbeafe",
      image: "#fae8ff",
      json: "#dcfce7",
      model: "#e0e7ff",
      state: "#ffedd5",
      signal: "#fef9c3",
      artifact: "#cffafe",
    })[p.$dataType]};
  box-shadow:
    inset 1px 1px 0 #ffffff,
    ${(p) =>
      p.$compatibility === "compatible"
        ? "0 0 0 3px #bbf7d0"
        : p.$compatibility === "source"
          ? "0 0 0 3px #fde68a"
          : "none"};
  cursor: ${(p) => (p.$compatibility === "incompatible" ? "not-allowed" : "crosshair")};
  opacity: ${(p) => (p.$compatibility === "incompatible" ? 0.58 : 1)};
  padding: 0;

  &:focus-visible {
    outline: 3px solid #2563eb;
    outline-offset: 2px;
  }
`;

const Stack = styled.div.attrs(mapLabRegionAttrs("stack"))`
  display: grid;
  gap: 8px;
`;

const Row = styled.div.attrs(mapLabRegionAttrs("row"))`
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
`;

const Small = styled.p.attrs(mapLabRegionAttrs("small"))`
  margin: 0;
  color: #475569;
  font-size: 12px;
  line-height: 1.35;
`;

const Label = styled.label.attrs(mapLabRegionAttrs("field-label"))`
  display: grid;
  gap: 3px;
  font-size: 12px;
  font-weight: 700;
`;

const Select = styled.select.attrs(mapLabRegionAttrs("select"))`
  min-height: 28px;
  background: #ffffff;
  border: 1px solid #111827;
`;

const TextArea = styled.textarea.attrs(mapLabRegionAttrs("textarea"))`
  min-height: 82px;
  resize: vertical;
  border: 1px solid #111827;
  padding: 6px;
  font-family: inherit;
`;

const ColorDot = styled.button.attrs(mapLabRegionAttrs("color-dot"))<{ $color: string; $active: boolean }>`
  width: 22px;
  height: 22px;
  border: ${(p) => (p.$active ? "3px solid #111827" : "1px solid #111827")};
  background: ${(p) => p.$color};
  cursor: pointer;
`;

const TemplateGrid = styled.div.attrs(mapLabRegionAttrs("template-grid"))`
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
`;

const TemplateButton = styled.button.attrs(mapLabRegionAttrs("template-button"))`
  display: grid;
  gap: 3px;
  text-align: left;
  border: 1px solid #475569;
  background: #ffffff;
  box-shadow: inset 1px 1px 0 #ffffff, 1px 1px 0 rgba(17, 24, 39, 0.18);
  padding: 7px;
  font-family: inherit;
  cursor: pointer;

  strong {
    font-size: 12px;
  }

  span {
    color: #475569;
    font-size: 11px;
    line-height: 1.25;
  }

  &:focus-visible {
    outline: 3px solid #2563eb;
    outline-offset: 2px;
  }
`;

const RouteListButton = styled.button.attrs(mapLabRegionAttrs("route-list-item"))<{ $active: boolean }>`
  width: 100%;
  display: grid;
  grid-template-columns: 12px 1fr auto;
  align-items: center;
  gap: 6px;
  border: 1px solid ${(p) => (p.$active ? "#111827" : "#64748b")};
  background: ${(p) => (p.$active ? "#e0f2fe" : "#ffffff")};
  padding: 6px;
  text-align: left;
  font-family: inherit;
  cursor: pointer;
`;

const RouteSwatch = styled.span.attrs(mapLabRegionAttrs("route-swatch"))<{ $color: string }>`
  width: 10px;
  height: 10px;
  border: 1px solid #111827;
  background: ${(p) => p.$color};
`;

const MiniMapBox = styled.div.attrs(mapLabRegionAttrs("minimap"))`
  height: 112px;
  border: 1px solid #334155;
  background: #e2e8f0;
  overflow: hidden;
`;

const RunMetricGrid = styled.div.attrs(mapLabRegionAttrs("run-metric-grid"))`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
`;

const RunMetric = styled.div.attrs(mapLabRegionAttrs("run-metric"))`
  border: 1px solid #64748b;
  background: #ffffff;
  padding: 5px;
  text-align: center;
  font-size: 11px;

  strong {
    display: block;
    font-size: 15px;
  }
`;

function nextNodeIndex(nodes: MapNode[]) {
  return nodes.reduce((max, node) => Math.max(max, node.index), 0) + 1;
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "component"
  );
}

function normalizeKind(value: unknown): NodeKind {
  return NODE_KINDS.includes(value as NodeKind) ? (value as NodeKind) : "system";
}

function normalizeWireKind(value: unknown): WireKind {
  return WIRE_KINDS.includes(value as WireKind) ? (value as WireKind) : "pipeline";
}

function normalizeNodeStatus(value: unknown): NodeStatus {
  return NODE_STATUSES.includes(value as NodeStatus) ? (value as NodeStatus) : "idle";
}

function normalizeRouteStatus(value: unknown): RouteStatus {
  return ROUTE_STATUSES.includes(value as RouteStatus) ? (value as RouteStatus) : "idle";
}

function normalizeString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function normalizePort(value: Partial<NodePort> | undefined, fallback: NodePort): NodePort {
  const dataTypes: PortDataType[] = ["text", "image", "json", "model", "state", "signal", "artifact"];
  return {
    id: normalizeString(value?.id, fallback.id),
    label: normalizeString(value?.label, fallback.label),
    kind: value?.kind === "input" || value?.kind === "output" ? value.kind : fallback.kind,
    dataType: dataTypes.includes(value?.dataType as PortDataType) ? (value?.dataType as PortDataType) : fallback.dataType,
  };
}

function normalizeNode(value: Partial<MapNode>, fallbackIndex: number): MapNode {
  const kind = normalizeKind(value.kind);
  const fallbackPorts = defaultPortsForKind(kind);
  const rawPorts = Array.isArray(value.ports) && value.ports.length > 0 ? value.ports : fallbackPorts;
  const ports = rawPorts.map((port, index) => normalizePort(port, fallbackPorts[index] ?? fallbackPorts[0]));
  return {
    id: normalizeString(value.id, `node-${fallbackIndex}`),
    key: normalizeString(value.key, `${kind}-${fallbackIndex}`),
    index: typeof value.index === "number" ? value.index : fallbackIndex,
    label: normalizeString(value.label, `Node ${fallbackIndex}`),
    kind,
    x: typeof value.x === "number" ? value.x : 120 + (fallbackIndex % 4) * 240,
    y: typeof value.y === "number" ? value.y : 120 + (fallbackIndex % 5) * 160,
    locked: Boolean(value.locked),
    system: normalizeString(value.system, "Unassigned"),
    description: normalizeString(value.description, normalizeString(value.notes, "")),
    notes: normalizeString(value.notes, ""),
    status: normalizeNodeStatus(value.status),
    ports,
    runtimeMs: typeof value.runtimeMs === "number" ? value.runtimeMs : undefined,
  };
}

function normalizeWire(value: Partial<MapWire>, fallbackIndex: number, nodes: MapNode[]): MapWire {
  const from = normalizeString(value.from, nodes[0]?.id ?? "");
  const to = normalizeString(value.to, nodes[1]?.id ?? nodes[0]?.id ?? "");
  const fromNode = nodes.find((node) => node.id === from);
  const toNode = nodes.find((node) => node.id === to);
  return {
    id: normalizeString(value.id, `wire-${fallbackIndex}`),
    from,
    to,
    fromPort: normalizeString(value.fromPort, firstPortOfKind(fromNode, "output")?.id ?? ""),
    toPort: normalizeString(value.toPort, firstPortOfKind(toNode, "input")?.id ?? ""),
    kind: normalizeWireKind(value.kind),
    color: normalizeString(value.color, PALETTE[fallbackIndex % PALETTE.length]),
    label: normalizeString(value.label, normalizeWireKind(value.kind)),
    status: normalizeRouteStatus(value.status),
    throughput: normalizeString(value.throughput, ""),
  };
}

function normalizeDoc(value: Partial<MapDoc>): MapDoc {
  if (!Array.isArray(value.nodes) || value.nodes.length === 0) {
    return SEED_DOC;
  }
  const nodes = value.nodes.map((node, index) => normalizeNode(node, index + 1));
  const wires = Array.isArray(value.wires) ? value.wires.map((wire, index) => normalizeWire(wire, index + 1, nodes)) : [];
  return {
    version: 1,
    title: normalizeString(value.title, "Untitled workflow map"),
    nodes,
    wires,
    updatedAt: normalizeString(value.updatedAt, new Date().toISOString()),
  };
}

function loadDoc(): MapDoc {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return SEED_DOC;
    const parsed = JSON.parse(raw) as Partial<MapDoc>;
    return normalizeDoc(parsed);
  } catch {
    return SEED_DOC;
  }
}

function firstPortOfKind(node: MapNode | undefined, kind: PortKind) {
  return node?.ports.find((port) => port.kind === kind);
}

function nodeCenter(node: MapNode) {
  return { x: node.x + NODE_WIDTH / 2, y: node.y + NODE_HEIGHT / 2 };
}

function portAnchor(node: MapNode, portId: string | undefined, fallbackKind: PortKind) {
  const ports = node.ports.filter((port) => port.kind === fallbackKind);
  const fallbackIndex = Math.max(0, Math.floor(ports.length / 2));
  const index = Math.max(0, ports.findIndex((port) => port.id === portId));
  const portIndex = index >= 0 ? index : fallbackIndex;
  const gap = Math.min(34, Math.max(22, (NODE_HEIGHT - 58) / Math.max(1, ports.length)));
  const y = node.y + 46 + portIndex * gap;
  return {
    x: fallbackKind === "output" ? node.x + NODE_WIDTH : node.x,
    y,
  };
}

function routePath(from: MapNode, to: MapNode, wire: MapWire) {
  const start = portAnchor(from, wire.fromPort, "output");
  const end = portAnchor(to, wire.toPort, "input");
  const distance = Math.max(96, Math.abs(end.x - start.x) * 0.42);
  return {
    d: `M ${start.x} ${start.y} C ${start.x + distance} ${start.y}, ${end.x - distance} ${end.y}, ${end.x} ${end.y}`,
    labelX: (start.x + end.x) / 2,
    labelY: (start.y + end.y) / 2 - 8,
    end,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampNodePosition(x: number, y: number) {
  return {
    x: clamp(Math.round(x), 0, BOARD_WIDTH - NODE_WIDTH),
    y: clamp(Math.round(y), 0, BOARD_HEIGHT - NODE_HEIGHT),
  };
}

function snapValue(value: number) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function resolveNodePosition(x: number, y: number, snapToGrid: boolean) {
  return clampNodePosition(snapToGrid ? snapValue(x) : x, snapToGrid ? snapValue(y) : y);
}

function overlapsNode(nodes: MapNode[], x: number, y: number) {
  const margin = 32;
  return nodes.some(
    (node) =>
      x < node.x + NODE_WIDTH + margin &&
      x + NODE_WIDTH + margin > node.x &&
      y < node.y + NODE_HEIGHT + margin &&
      y + NODE_HEIGHT + margin > node.y
  );
}

function findOpenNodePosition(nodes: MapNode[], preferredX: number, preferredY: number) {
  const columns = [0, 270, 540, -270, -540, 810, -810];
  const rows = [0, 190, 380, -190, 570, -380];
  for (const row of rows) {
    for (const column of columns) {
      const candidate = clampNodePosition(preferredX + column, preferredY + row);
      if (!overlapsNode(nodes, candidate.x, candidate.y)) {
        return candidate;
      }
    }
  }
  return clampNodePosition(preferredX, preferredY);
}

function zoomText(zoom: number) {
  return `${Math.round(zoom * 100)}%`;
}

function nodeBounds(nodes: MapNode[]) {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: NODE_WIDTH, maxY: NODE_HEIGHT };
  }
  return nodes.reduce(
    (bounds, node) => ({
      minX: Math.min(bounds.minX, node.x),
      minY: Math.min(bounds.minY, node.y),
      maxX: Math.max(bounds.maxX, node.x + NODE_WIDTH),
      maxY: Math.max(bounds.maxY, node.y + NODE_HEIGHT),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: 0,
      maxY: 0,
    }
  );
}

function optimizeFlow(nodes: MapNode[], wires: MapWire[], mode: "flow" | "fit") {
  const locked = new Map(nodes.filter((node) => node.locked).map((node) => [node.id, node]));
  const depth = new Map(nodes.map((node) => [node.id, 0]));
  for (let pass = 0; pass < nodes.length; pass += 1) {
    for (const wire of wires) {
      depth.set(wire.to, Math.max(depth.get(wire.to) ?? 0, (depth.get(wire.from) ?? 0) + 1));
    }
  }
  const lanes = new Map<number, MapNode[]>();
  for (const node of nodes) {
    const lane = mode === "fit" ? node.index % 4 : depth.get(node.id) ?? 0;
    lanes.set(lane, [...(lanes.get(lane) ?? []), node]);
  }
  return nodes.map((node) => {
    if (locked.has(node.id)) return node;
    const lane = mode === "fit" ? node.index % 4 : depth.get(node.id) ?? 0;
    const laneNodes = lanes.get(lane) ?? [];
    const order = laneNodes.findIndex((entry) => entry.id === node.id);
    const next = clampNodePosition(110 + lane * 290, 110 + Math.max(0, order) * 180);
    return {
      ...node,
      ...next,
    };
  });
}

function createImportedNodes(source: "repo" | "firehose", nodes: MapNode[]): MapNode[] {
  const base = nextNodeIndex(nodes);
  const entries: Array<[string, string, NodeKind, string]> =
    source === "repo"
      ? [
          ["repo.commit", "Repo Commit", "repo", "A committed AT repo record source."],
          ["lexicon.record", "Lexicon Record", "data", "A structured lexicon record available as read-only map material."],
          ["identity.link", "Identity Link", "policy", "A guard node for identity-safe workflow routing."],
        ]
      : [
          ["stream.cursor", "Stream Cursor", "data", "A firehose cursor and replay checkpoint."],
          ["event.router", "Event Router", "router", "A branching route node for live stream events."],
          ["read.guard", "Read Guard", "policy", "A policy boundary around ingested path access."],
        ];
  return entries.map(([key, label, kind, description], offset) => ({
    id: `node-${Date.now()}-${offset}`,
    key: `${source}-${key}`,
    index: base + offset,
    label,
    kind,
    ...clampNodePosition(140 + offset * 250, 660),
    locked: false,
    system: source === "repo" ? "AT Repo Import" : "AT Firehose",
    description,
    notes: "Imported as read-only map material. Ingested path contents are not exposed to MCP creation tools.",
    status: "idle" as NodeStatus,
    ports: defaultPortsForKind(kind),
  }));
}

function statusForRoute(kind: WireKind): RouteStatus {
  return kind === "blocks" ? "blocked" : "active";
}

function portsCompatible(fromPort: NodePort | undefined, toPort: NodePort | undefined) {
  if (!fromPort || !toPort || fromPort.kind !== "output" || toPort.kind !== "input") return false;
  if (toPort.dataType === "json" || fromPort.dataType === "json") return true;
  if (fromPort.dataType === toPort.dataType) return true;
  if (fromPort.dataType === "image" && toPort.dataType === "artifact") return true;
  if (fromPort.dataType === "signal" && toPort.dataType === "state") return true;
  return false;
}

export function WtfMapLab() {
  const { user, isAdmin, hasPermission } = useAuth();
  const presentation = usePresentationShell();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragMovedRef = useRef(false);
  const [doc, setDoc] = useState<MapDoc>(() => loadDoc());
  const [mapMode, setMapMode] = useState<MapMode>("draft");
  const [selectedId, setSelectedId] = useState(doc.nodes[0]?.id ?? "");
  const [selectedWireId, setSelectedWireId] = useState("");
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [newLabel, setNewLabel] = useState("New component");
  const [newKind, setNewKind] = useState<NodeKind>("system");
  const [wireFrom, setWireFrom] = useState(doc.nodes[0]?.id ?? "");
  const [wireTo, setWireTo] = useState(doc.nodes[1]?.id ?? "");
  const [wireKind, setWireKind] = useState<WireKind>("pipeline");
  const [wireColor, setWireColor] = useState(PALETTE[0]);
  const [zoom, setZoom] = useState(1);
  const [dragState, setDragState] = useState<NodeDragState | null>(null);
  const [panState, setPanState] = useState<PanState | null>(null);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [runSummary, setRunSummary] = useState("Idle. Run the graph to pulse connected pipeline routes.");

  const roles = user?.roles ?? (user?.role ? [user.role] : []);
  const isDemoMap = mapMode === "wtfos-demo";
  const baseCanEdit = Boolean(user) && !roles.includes("time_out");
  const canEdit = baseCanEdit && !isDemoMap;
  const canPreview = canEdit || isDemoMap;
  const canIngest = !isDemoMap && (isAdmin || hasPermission("system.maps.ingest"));
  const mapModeCopy = isDemoMap
    ? "Read-only demo: any user can inspect, pan, zoom, select, and run the wtfOS system map, but nodes and routes are locked."
    : baseCanEdit
      ? "Editable repo draft: build and save your own living workflow map."
      : "Sign in with an active account to edit the repo draft, or open the read-only wtfOS demo map.";
  const mcpPolicy =
    "MCP agents may create nodes, routes, and docs; ingested repo/firehose path contents stay read-only and unavailable to MCP use paths.";

  const selected = doc.nodes.find((node) => node.id === selectedId) ?? doc.nodes[0] ?? null;
  const selectedWire = doc.wires.find((wire) => wire.id === selectedWireId) ?? null;
  const indexedNodes = useMemo(() => [...doc.nodes].sort((a, b) => a.index - b.index), [doc.nodes]);
  const indexedWires = useMemo(() => [...doc.wires].sort((a, b) => a.id.localeCompare(b.id)), [doc.wires]);
  const pendingNode = pendingConnection ? doc.nodes.find((node) => node.id === pendingConnection.nodeId) : null;
  const pendingPort = pendingNode?.ports.find((port) => port.id === pendingConnection?.portId);
  const graphStats = useMemo(
    () => ({
      completeNodes: doc.nodes.filter((node) => node.status === "complete").length,
      activeRoutes: doc.wires.filter((wire) => wire.status === "active").length,
      blockedRoutes: doc.wires.filter((wire) => wire.status === "blocked").length,
    }),
    [doc.nodes, doc.wires]
  );

  useEffect(() => {
    logClientSystemEvent({
      eventType: "map_lab.viewed",
      metadata: { nodeCount: doc.nodes.length, wireCount: doc.wires.length },
    });
  }, []);

  useEffect(() => {
    if (!dragState) return;

    const handleMove = (event: PointerEvent) => {
      event.preventDefault();
      dragMovedRef.current = true;
      const next = resolveNodePosition(
        dragState.originX + (event.clientX - dragState.startX) / zoom,
        dragState.originY + (event.clientY - dragState.startY) / zoom,
        snapToGrid
      );
      setDoc((current) => ({
        ...current,
        updatedAt: new Date().toISOString(),
        nodes: current.nodes.map((node) =>
          node.id === dragState.nodeId && !node.locked ? { ...node, ...next } : node
        ),
      }));
    };

    const handleUp = () => {
      if (dragMovedRef.current) {
        logClientSystemEvent({
          eventType: "map_lab.node.moved",
          metadata: { nodeId: dragState.nodeId, source: "drag" },
        });
      }
      setDragState(null);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
    window.addEventListener("pointercancel", handleUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [dragState, snapToGrid, zoom]);

  useEffect(() => {
    if (!panState) return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleMove = (event: PointerEvent) => {
      event.preventDefault();
      viewport.scrollLeft = panState.scrollLeft - (event.clientX - panState.startX);
      viewport.scrollTop = panState.scrollTop - (event.clientY - panState.startY);
    };

    const handleUp = () => setPanState(null);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
    window.addEventListener("pointercancel", handleUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [panState]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "Escape" && pendingConnection) {
        event.preventDefault();
        setPendingConnection(null);
        setRunSummary("Route connection canceled.");
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedWireId) {
        event.preventDefault();
        deleteWireById(selectedWireId);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveToRepoDraft();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pendingConnection, selectedWireId, canEdit, doc]);

  function updateDoc(updater: (current: MapDoc) => MapDoc) {
    setDoc((current) => ({ ...updater(current), updatedAt: new Date().toISOString() }));
  }

  function setCanvasZoom(nextZoom: number, source: string) {
    const normalized = Math.round(clamp(nextZoom, MIN_ZOOM, MAX_ZOOM) * 100) / 100;
    setZoom(normalized);
    logClientSystemEvent({ eventType: "map_lab.viewport.changed", metadata: { zoom: normalized, source } });
  }

  function zoomBy(delta: number, source: string) {
    setCanvasZoom(zoom + delta, source);
  }

  function fitMapToViewport() {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const bounds = nodeBounds(doc.nodes);
    const paddedWidth = bounds.maxX - bounds.minX + 180;
    const paddedHeight = bounds.maxY - bounds.minY + 180;
    const fittedZoom = clamp(
      Math.min(viewport.clientWidth / paddedWidth, viewport.clientHeight / paddedHeight),
      MIN_ZOOM,
      MAX_ZOOM
    );
    const nextZoom = Math.round(fittedZoom * 100) / 100;
    setZoom(nextZoom);
    window.requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, (bounds.minX - 90) * nextZoom);
      viewport.scrollTop = Math.max(0, (bounds.minY - 90) * nextZoom);
    });
    logClientSystemEvent({ eventType: "map_lab.viewport.changed", metadata: { zoom: nextZoom, source: "fit" } });
  }

  function resetViewport() {
    const viewport = viewportRef.current;
    setZoom(1);
    if (viewport) {
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    }
    logClientSystemEvent({ eventType: "map_lab.viewport.changed", metadata: { zoom: 1, source: "reset" } });
  }

  function moveNode(nodeId: string, dx: number, dy: number, source: string) {
    if (!canEdit) return;
    const target = doc.nodes.find((node) => node.id === nodeId);
    if (!target || target.locked) return;
    const next = resolveNodePosition(target.x + dx, target.y + dy, snapToGrid);
    updateDoc((current) => ({
      ...current,
      nodes: current.nodes.map((node) => {
        if (node.id !== nodeId || node.locked) return node;
        return { ...node, ...next };
      }),
    }));
    logClientSystemEvent({ eventType: "map_lab.node.moved", metadata: { nodeId, source } });
  }

  function handleNodePointerDown(event: ReactPointerEvent<HTMLDivElement>, node: MapNode) {
    setSelectedId(node.id);
    setSelectedWireId("");
    if (!canEdit || node.locked || event.button !== 0) return;
    if ((event.target as HTMLElement).closest("[data-map-lab-port='true']")) return;
    event.preventDefault();
    event.stopPropagation();
    dragMovedRef.current = false;
    setDragState({
      nodeId: node.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: node.x,
      originY: node.y,
    });
  }

  function handleNodeKeyDown(event: ReactKeyboardEvent<HTMLDivElement>, node: MapNode) {
    if (!canEdit || node.locked) return;
    const step = event.shiftKey ? 48 : 24;
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    moveNode(node.id, delta[0], delta[1], "keyboard");
  }

  function handleBoardPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("[data-map-lab-node='true'], [data-map-lab-route='true']")) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    event.preventDefault();
    setPanState({
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    });
  }

  function handleViewportWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    zoomBy(event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP, "wheel");
  }

  function handleMiniMapPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const mapX = ((event.clientX - rect.left) / rect.width) * BOARD_WIDTH;
    const mapY = ((event.clientY - rect.top) / rect.height) * BOARD_HEIGHT;
    viewport.scrollLeft = clamp(mapX * zoom - viewport.clientWidth / 2, 0, viewport.scrollWidth - viewport.clientWidth);
    viewport.scrollTop = clamp(mapY * zoom - viewport.clientHeight / 2, 0, viewport.scrollHeight - viewport.clientHeight);
    logClientSystemEvent({ eventType: "map_lab.viewport.changed", metadata: { zoom, source: "overview" } });
  }

  function addNode() {
    if (!canEdit) return;
    const index = nextNodeIndex(doc.nodes);
    const node: MapNode = {
      id: `node-${Date.now()}`,
      key: `${slugify(newLabel)}-${index}`,
      index,
      label: newLabel.trim() || `Component ${index}`,
      kind: newKind,
      ...clampNodePosition(160 + (index % 4) * 240, 160 + (index % 5) * 150),
      locked: false,
      system: "Unassigned",
      description: "Custom workflow component.",
      notes: "",
      status: "idle",
      ports: defaultPortsForKind(newKind),
    };
    updateDoc((current) => ({ ...current, nodes: [...current.nodes, node] }));
    setSelectedId(node.id);
    setSelectedWireId("");
    logClientSystemEvent({ eventType: "map_lab.node.created", metadata: { nodeKey: node.key, kind: node.kind } });
  }

  function addTemplateNode(template: NodeTemplate) {
    if (!canEdit) return;
    const index = nextNodeIndex(doc.nodes);
    const viewport = viewportRef.current;
    const viewportX = viewport ? viewport.scrollLeft / zoom + 160 : 180;
    const viewportY = viewport ? viewport.scrollTop / zoom + 120 : 180;
    const position = findOpenNodePosition(doc.nodes, viewportX, viewportY);
    const node: MapNode = {
      id: `node-${Date.now()}-${template.id}`,
      key: `${template.id}-${index}`,
      index,
      label: template.label,
      kind: template.kind,
      ...position,
      locked: false,
      system: template.system,
      description: template.description,
      notes: template.notes,
      status: "idle",
      ports: clonePorts(template.ports),
    };
    updateDoc((current) => ({ ...current, nodes: [...current.nodes, node] }));
    setSelectedId(node.id);
    setSelectedWireId("");
    logClientSystemEvent({
      eventType: "map_lab.node.created",
      metadata: { nodeKey: node.key, kind: node.kind, templateId: template.id },
    });
  }

  function addWire() {
    if (!canEdit || !wireFrom || !wireTo || wireFrom === wireTo) return;
    const fromNode = doc.nodes.find((node) => node.id === wireFrom);
    const toNode = doc.nodes.find((node) => node.id === wireTo);
    const fromPort = firstPortOfKind(fromNode, "output")?.id;
    const toPort = firstPortOfKind(toNode, "input")?.id;
    const wire: MapWire = {
      id: `wire-${Date.now()}`,
      from: wireFrom,
      to: wireTo,
      fromPort,
      toPort,
      kind: wireKind,
      color: wireColor,
      label: wireKind,
      status: "idle",
      throughput: fromPort && toPort ? `${fromPort} to ${toPort}` : "",
    };
    updateDoc((current) => ({ ...current, wires: [...current.wires, wire] }));
    setSelectedWireId(wire.id);
    logClientSystemEvent({ eventType: "map_lab.wire.created", metadata: { kind: wire.kind } });
    logClientSystemEvent({ eventType: "map_lab.route.created", metadata: { kind: wire.kind } });
  }

  function createPortRoute(from: PendingConnection, toNode: MapNode, toPort: NodePort) {
    if (!canEdit || from.nodeId === toNode.id || toPort.kind !== "input") return false;
    const fromNode = doc.nodes.find((node) => node.id === from.nodeId);
    const fromPort = fromNode?.ports.find((port) => port.id === from.portId && port.kind === "output");
    if (!fromNode || !fromPort) return false;
    if (!portsCompatible(fromPort, toPort)) {
      setRunSummary(`Cannot connect ${fromPort.dataType} output to ${toPort.dataType} input.`);
      return false;
    }
    const duplicate = doc.wires.find(
      (wire) => wire.from === fromNode.id && wire.to === toNode.id && wire.fromPort === fromPort.id && wire.toPort === toPort.id
    );
    if (duplicate) {
      setSelectedWireId(duplicate.id);
      setSelectedId(toNode.id);
      setRunSummary("That route already exists; selected the existing route.");
      return true;
    }
    const wire: MapWire = {
      id: `wire-${Date.now()}-${fromPort.id}-${toPort.id}`,
      from: fromNode.id,
      fromPort: fromPort.id,
      to: toNode.id,
      toPort: toPort.id,
      kind: wireKind,
      color: wireColor,
      label: `${fromPort.label} to ${toPort.label}`,
      status: "idle",
      throughput: `${fromPort.dataType} to ${toPort.dataType}`,
    };
    updateDoc((current) => ({ ...current, wires: [...current.wires, wire] }));
    setWireFrom(fromNode.id);
    setWireTo(toNode.id);
    setSelectedId(toNode.id);
    setSelectedWireId(wire.id);
    logClientSystemEvent({
      eventType: "map_lab.wire.created",
      metadata: { kind: wire.kind, fromPort: fromPort.id, toPort: toPort.id },
    });
    logClientSystemEvent({
      eventType: "map_lab.route.created",
      metadata: { kind: wire.kind, fromPort: fromPort.id, toPort: toPort.id },
    });
    return true;
  }

  function handlePortClick(event: ReactPointerEvent<HTMLButtonElement>, node: MapNode, port: NodePort) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(node.id);
    setSelectedWireId("");
    if (!canEdit) return;
    if (port.kind === "output") {
      setPendingConnection({ nodeId: node.id, portId: port.id });
      return;
    }
    if (pendingConnection) {
      if (createPortRoute(pendingConnection, node, port)) {
        setPendingConnection(null);
      }
    }
  }

  function portCompatibility(node: MapNode, port: NodePort): PortCompatibility {
    if (!pendingConnection) return "idle";
    if (pendingConnection.nodeId === node.id && pendingConnection.portId === port.id) return "source";
    if (port.kind !== "input" || pendingConnection.nodeId === node.id) return "idle";
    return portsCompatible(pendingPort, port) ? "compatible" : "incompatible";
  }

  function optimizeLayout(mode: "flow" | "fit") {
    if (!canEdit) return;
    updateDoc((current) => ({ ...current, nodes: optimizeFlow(current.nodes, current.wires, mode) }));
    logClientSystemEvent({ eventType: "map_lab.node.moved", metadata: { source: `optimize-${mode}` } });
  }

  function patchSelected(patch: Partial<MapNode>) {
    if (!selected || !canEdit) return;
    updateDoc((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === selected.id ? { ...node, ...patch } : node)),
    }));
  }

  function patchSelectedWire(patch: Partial<MapWire>) {
    if (!selectedWire || !canEdit) return;
    updateDoc((current) => ({
      ...current,
      wires: current.wires.map((wire) => (wire.id === selectedWire.id ? { ...wire, ...patch } : wire)),
    }));
  }

  function deleteWireById(wireId: string) {
    if (!wireId || !canEdit) return;
    updateDoc((current) => ({
      ...current,
      wires: current.wires.filter((wire) => wire.id !== wireId),
    }));
    setSelectedWireId("");
    setRunSummary("Route deleted.");
  }

  function deleteSelectedWire() {
    if (!selectedWire) return;
    deleteWireById(selectedWire.id);
  }

  function importSource(source: "repo" | "firehose") {
    if (!canIngest) return;
    const additions = createImportedNodes(source, doc.nodes);
    updateDoc((current) => ({
      ...current,
      nodes: [...current.nodes, ...additions],
      wires: [
        ...current.wires,
        ...additions.map((node) => ({
          id: `wire-${Date.now()}-${node.index}`,
          from: node.id,
          fromPort: firstPortOfKind(node, "output")?.id,
          to: current.nodes[1]?.id ?? current.nodes[0]?.id ?? node.id,
          toPort: firstPortOfKind(current.nodes[1] ?? current.nodes[0], "input")?.id,
          kind: "reads" as WireKind,
          color: "#059669",
          label: "read-only route",
          status: "idle" as RouteStatus,
          throughput: "read-only",
        })),
      ],
    }));
    logClientSystemEvent({ eventType: "map_lab.ingest.previewed", metadata: { source } });
  }

  function runPipeline() {
    if (!canPreview) return;
    const connectedNodeIds = new Set<string>();
    for (const wire of doc.wires) {
      connectedNodeIds.add(wire.from);
      connectedNodeIds.add(wire.to);
    }
    const runStartedAt = Date.now();
    updateDoc((current) => ({
      ...current,
      nodes: current.nodes.map((node) => ({
        ...node,
        status: connectedNodeIds.has(node.id) ? (node.kind === "policy" ? "queued" : "complete") : "idle",
        runtimeMs: connectedNodeIds.has(node.id) ? 80 + ((node.index * 37) % 220) : undefined,
      })),
      wires: current.wires.map((wire) => ({
        ...wire,
        status: statusForRoute(wire.kind),
      })),
    }));
    const activeRoutes = doc.wires.filter((wire) => wire.kind !== "blocks").length;
    setRunSummary(`Last run activated ${activeRoutes} routes across ${connectedNodeIds.size} connected nodes.`);
    logClientSystemEvent({
      eventType: "map_lab.pipeline.ran",
      metadata: { nodeCount: connectedNodeIds.size, routeCount: doc.wires.length, runStartedAt, mode: mapMode },
    });
  }

  function clearPipelineActivity() {
    if (!canPreview) return;
    updateDoc((current) => ({
      ...current,
      nodes: current.nodes.map((node) => ({ ...node, status: "idle", runtimeMs: undefined })),
      wires: current.wires.map((wire) => ({ ...wire, status: "idle" })),
    }));
    setRunSummary("Idle. Run the graph to pulse connected pipeline routes.");
  }

  function saveToRepoDraft() {
    if (!canEdit) return;
    const saved = { ...doc, updatedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    setDoc(saved);
    logClientSystemEvent({ eventType: "map_lab.repo.saved", metadata: { nodeCount: saved.nodes.length } });
  }

  function restoreRepoDraft() {
    const restored = loadDoc();
    setMapMode("draft");
    setDoc(restored);
    setSelectedId(restored.nodes[0]?.id ?? "");
    setSelectedWireId("");
    setPendingConnection(null);
    setWireFrom(restored.nodes[0]?.id ?? "");
    setWireTo(restored.nodes[1]?.id ?? "");
    setRunSummary("Editable repo draft restored.");
    logClientSystemEvent({ eventType: "map_lab.repo.restored", metadata: { nodeCount: restored.nodes.length } });
  }

  function openDemoMap() {
    const demo = cloneDoc(WTFOS_DEMO_DOC);
    setMapMode("wtfos-demo");
    setDoc(demo);
    setSelectedId(demo.nodes[0]?.id ?? "");
    setSelectedWireId("");
    setPendingConnection(null);
    setWireFrom(demo.nodes[0]?.id ?? "");
    setWireTo(demo.nodes[1]?.id ?? "");
    setRunSummary("Read-only wtfOS demo loaded. Run the graph to pulse system routes without changing the map.");
    setZoom(0.62);
    window.requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    });
    logClientSystemEvent({
      eventType: "map_lab.demo.opened",
      metadata: { nodeCount: demo.nodes.length, routeCount: demo.wires.length },
    });
  }

  return (
    <AppWindow title="WTF Map Lab">
      <Shell
        data-map-lab-shell="true"
        data-map-lab-surface="workspace"
        data-map-lab-presentation-host={presentation.host}
        data-map-lab-mode={mapMode}
        data-map-lab-readonly={isDemoMap ? "true" : "false"}
      >
        <Panel>
          <Stack>
            <GroupBox label="Workflow map">
              <Stack>
                <Row>
                  <Button onClick={restoreRepoDraft} disabled={mapMode === "draft"} data-map-lab-open-draft="true">
                    Open editable draft
                  </Button>
                  <Button onClick={openDemoMap} disabled={isDemoMap} data-map-lab-open-demo="true">
                    Open wtfOS demo
                  </Button>
                </Row>
                <PendingBadge as="span" data-map-lab-mode-badge="true">
                  {isDemoMap ? "Read-only demo" : "Editable draft"}
                </PendingBadge>
                <Small data-map-lab-mode-copy="true">{mapModeCopy}</Small>
                <Label>
                  Title
                  <TextField
                    value={doc.title}
                    onChange={(event) => updateDoc((current) => ({ ...current, title: event.currentTarget.value }))}
                    disabled={!canEdit}
                  />
                </Label>
                <Small>
                  {doc.nodes.length} nodes, {doc.wires.length} routes
                </Small>
                <Row>
                  <Button onClick={saveToRepoDraft} disabled={!canEdit}>
                    Save repo draft
                  </Button>
                  <Button onClick={restoreRepoDraft}>Restore draft</Button>
                </Row>
              </Stack>
            </GroupBox>

            <GroupBox label="Node palette">
              <TemplateGrid>
                {NODE_TEMPLATES.map((template) => (
                  <TemplateButton
                    key={template.id}
                    type="button"
                    onClick={() => addTemplateNode(template)}
                    disabled={!canEdit}
                    data-map-lab-template={template.id}
                  >
                    <strong>{template.label}</strong>
                    <span>{template.description}</span>
                  </TemplateButton>
                ))}
              </TemplateGrid>
            </GroupBox>

            <GroupBox label="Custom node">
              <Stack>
                <Label>
                  Node label
                  <TextField value={newLabel} onChange={(event) => setNewLabel(event.currentTarget.value)} disabled={!canEdit} />
                </Label>
                <Label>
                  Node kind
                  <Select value={newKind} onChange={(event) => setNewKind(event.currentTarget.value as NodeKind)} disabled={!canEdit}>
                    {NODE_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind}
                      </option>
                    ))}
                  </Select>
                </Label>
                <Button onClick={addNode} disabled={!canEdit}>
                  Add custom node
                </Button>
              </Stack>
            </GroupBox>

            <GroupBox label="Manual route">
              <Stack>
                <Label>
                  From node
                  <Select value={wireFrom} onChange={(event) => setWireFrom(event.currentTarget.value)} disabled={!canEdit}>
                    {indexedNodes.map((node) => (
                      <option key={node.id} value={node.id}>
                        {node.key}
                      </option>
                    ))}
                  </Select>
                </Label>
                <Label>
                  To node
                  <Select value={wireTo} onChange={(event) => setWireTo(event.currentTarget.value)} disabled={!canEdit}>
                    {indexedNodes.map((node) => (
                      <option key={node.id} value={node.id}>
                        {node.key}
                      </option>
                    ))}
                  </Select>
                </Label>
                <Label>
                  Route kind
                  <Select value={wireKind} onChange={(event) => setWireKind(event.currentTarget.value as WireKind)} disabled={!canEdit}>
                    {WIRE_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind}
                      </option>
                    ))}
                  </Select>
                </Label>
                <Row>
                  {PALETTE.map((color) => (
                    <ColorDot
                      key={color}
                      type="button"
                      aria-label={`Use ${color} route color`}
                      title={color}
                      $color={color}
                      $active={wireColor === color}
                      onClick={() => setWireColor(color)}
                    />
                  ))}
                </Row>
                <Button onClick={addWire} disabled={!canEdit}>
                  Connect route
                </Button>
              </Stack>
            </GroupBox>
          </Stack>
        </Panel>

        <Workspace>
          <CanvasToolbar>
            <ToolGroup>
              <strong>{doc.title || "Untitled workflow"}</strong>
              <Small as="span">
                {doc.nodes.length} nodes / {doc.wires.length} routes
              </Small>
              {pendingConnection && pendingNode && pendingPort ? (
                <PendingBadge data-map-lab-pending-route="true">
                  Routing from {pendingNode.label}: {pendingPort.label}
                </PendingBadge>
              ) : null}
            </ToolGroup>
            <ToolGroup>
              <Button onClick={runPipeline} disabled={!canPreview} aria-label="Run workflow map" data-map-lab-run="true">
                Run graph
              </Button>
              <Button onClick={clearPipelineActivity} disabled={!canPreview}>
                Clear activity
              </Button>
              <Checkbox
                checked={snapToGrid}
                disabled={!canEdit}
                onChange={(event) => setSnapToGrid(event.currentTarget.checked)}
                label="Snap"
                data-map-lab-snap="true"
              />
              <Button onClick={() => zoomBy(-ZOOM_STEP, "button")} aria-label="Zoom out Map Lab canvas">
                -
              </Button>
              <ZoomReadout data-map-lab-zoom="true">{zoomText(zoom)}</ZoomReadout>
              <Button onClick={() => zoomBy(ZOOM_STEP, "button")} aria-label="Zoom in Map Lab canvas">
                +
              </Button>
              <Button onClick={fitMapToViewport}>Fit map</Button>
              <Button onClick={resetViewport}>Reset view</Button>
            </ToolGroup>
          </CanvasToolbar>

          <WorkspaceFrame
            ref={viewportRef}
            $panning={Boolean(panState)}
            aria-label="WTF Map Lab scrollable and zoomable workflow canvas"
            data-map-lab-viewport="true"
            tabIndex={0}
            onWheel={handleViewportWheel}
          >
            <BoardSpace $zoom={zoom}>
              <Board $zoom={zoom} onPointerDown={handleBoardPointerDown} data-map-lab-board="true">
                <WireSvg aria-label="Map Lab pipeline routes" viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}>
                  <defs>
                    {doc.wires.map((wire) => (
                      <marker
                        key={wire.id}
                        id={`map-lab-arrow-${wire.id}`}
                        markerWidth="10"
                        markerHeight="10"
                        refX="8"
                        refY="5"
                        orient="auto"
                        markerUnits="strokeWidth"
                      >
                        <path d="M 0 0 L 10 5 L 0 10 z" fill={wire.color} />
                      </marker>
                    ))}
                  </defs>
                  {doc.wires.map((wire) => {
                    const from = doc.nodes.find((node) => node.id === wire.from);
                    const to = doc.nodes.find((node) => node.id === wire.to);
                    if (!from || !to) return null;
                    const path = routePath(from, to, wire);
                    const selectedRoute = selectedWireId === wire.id;
                    const activeRoute = wire.status === "active" || wire.status === "blocked";
                    return (
                      <g key={wire.id}>
                        <RouteHitPath
                          d={path.d}
                          data-map-lab-route="true"
                          data-map-lab-route-id={wire.id}
                          data-map-lab-route-label={wire.label}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            setSelectedWireId(wire.id);
                            setSelectedId(wire.to);
                          }}
                        />
                        <RoutePath
                          d={path.d}
                          stroke={wire.status === "blocked" ? "#dc2626" : wire.color}
                          markerEnd={`url(#map-lab-arrow-${wire.id})`}
                          $active={activeRoute}
                          $selected={selectedRoute}
                          data-map-lab-route="true"
                          data-map-lab-route-id={wire.id}
                          data-map-lab-route-label={wire.label}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            setSelectedWireId(wire.id);
                            setSelectedId(wire.to);
                          }}
                        />
                        <rect
                          x={path.labelX - 6}
                          y={path.labelY - 13}
                          width={Math.max(54, wire.label.length * 6 + 12)}
                          height="18"
                          fill={selectedRoute ? "#e0f2fe" : "#f8fafc"}
                          stroke="#334155"
                          pointerEvents="none"
                        />
                        <text x={path.labelX} y={path.labelY} fill="#111827" fontSize="11" pointerEvents="none">
                          {wire.label}
                        </text>
                      </g>
                    );
                  })}
                </WireSvg>
                {indexedNodes.map((node) => {
                  const inputPorts = node.ports.filter((port) => port.kind === "input");
                  const outputPorts = node.ports.filter((port) => port.kind === "output");
                  return (
                    <NodeCard
                      key={node.id}
                      role="button"
                      tabIndex={0}
                      data-map-lab-node="true"
                      data-map-lab-node-key={node.key}
                      data-map-lab-node-id={node.id}
                      aria-label={`${node.label} ${node.locked ? "locked" : "draggable"} workflow node`}
                      $x={node.x}
                      $y={node.y}
                      $kind={node.kind}
                      $selected={selectedId === node.id && !selectedWire}
                      $locked={node.locked}
                      $dragging={dragState?.nodeId === node.id}
                      onPointerDown={(event) => handleNodePointerDown(event, node)}
                      onKeyDown={(event) => handleNodeKeyDown(event, node)}
                      onClick={() => {
                        setSelectedId(node.id);
                        setSelectedWireId("");
                      }}
                    >
                      <PortRail $side="left">
                        {inputPorts.map((port) => (
                          <PortButton
                            key={port.id}
                            type="button"
                            title={`${node.label} input: ${port.label} (${port.dataType})`}
                            aria-label={`Connect to ${node.label} ${port.label} input port`}
                            data-map-lab-port="true"
                            data-map-lab-port-node-key={node.key}
                            data-map-lab-port-node-id={node.id}
                            data-map-lab-port-id={port.id}
                            data-map-lab-port-kind={port.kind}
                            data-map-lab-port-compatibility={portCompatibility(node, port)}
                            $kind={port.kind}
                            $active={Boolean(pendingConnection && pendingConnection.nodeId !== node.id)}
                            $compatibility={portCompatibility(node, port)}
                            $dataType={port.dataType}
                            onPointerDown={(event) => handlePortClick(event, node, port)}
                            onClick={(event) => event.stopPropagation()}
                          />
                        ))}
                      </PortRail>
                      <PortRail $side="right">
                        {outputPorts.map((port) => (
                          <PortButton
                            key={port.id}
                            type="button"
                            title={`${node.label} output: ${port.label} (${port.dataType})`}
                            aria-label={`Start route from ${node.label} ${port.label} output port`}
                            data-map-lab-port="true"
                            data-map-lab-port-node-key={node.key}
                            data-map-lab-port-node-id={node.id}
                            data-map-lab-port-id={port.id}
                            data-map-lab-port-kind={port.kind}
                            data-map-lab-port-compatibility={portCompatibility(node, port)}
                            $kind={port.kind}
                            $active={pendingConnection?.nodeId === node.id && pendingConnection.portId === port.id}
                            $compatibility={portCompatibility(node, port)}
                            $dataType={port.dataType}
                            onPointerDown={(event) => handlePortClick(event, node, port)}
                            onClick={(event) => event.stopPropagation()}
                          />
                        ))}
                      </PortRail>
                      <NodeTop>
                        <span>
                          #{node.index} {node.kind}
                        </span>
                        <StatusPill $status={node.status}>{node.status}</StatusPill>
                      </NodeTop>
                      <NodeLabel>{node.label}</NodeLabel>
                      <NodeMeta>{node.key}</NodeMeta>
                      <NodeMeta>
                        {node.system} {node.locked ? "/ locked" : "/ draggable"}
                      </NodeMeta>
                      <NodeDescription>{node.description}</NodeDescription>
                    </NodeCard>
                  );
                })}
              </Board>
            </BoardSpace>
          </WorkspaceFrame>
        </Workspace>

        <Panel>
          <Stack>
            <GroupBox label="Run state">
              <Stack>
                <Small data-map-lab-run-summary="true">{runSummary}</Small>
                <RunMetricGrid>
                  <RunMetric>
                    <strong>{graphStats.completeNodes}</strong>
                    complete
                  </RunMetric>
                  <RunMetric>
                    <strong>{graphStats.activeRoutes}</strong>
                    active
                  </RunMetric>
                  <RunMetric>
                    <strong>{graphStats.blockedRoutes}</strong>
                    blocked
                  </RunMetric>
                </RunMetricGrid>
                <Small>Active routes pulse on the canvas. Press Escape to cancel routing, Delete to remove the selected route, or Ctrl/Cmd+S to save.</Small>
              </Stack>
            </GroupBox>

            <GroupBox label="Layout">
              <Stack>
                <Button onClick={() => optimizeLayout("flow")} disabled={!canEdit}>
                  Optimize flow
                </Button>
                <Button onClick={() => optimizeLayout("fit")} disabled={!canEdit}>
                  Fit unlocked
                </Button>
                <Small>Locked nodes hold position while unlocked nodes resolve around dependency depth or compact fit lanes. Drag and nudge movement {snapToGrid ? "snaps to" : "ignores"} the grid.</Small>
              </Stack>
            </GroupBox>

            <GroupBox label="Selected route">
              {selectedWire ? (
                <Stack>
                  <Small>
                    {selectedWire.fromPort || "output"} to {selectedWire.toPort || "input"}
                  </Small>
                  <Label>
                    Label
                    <TextField
                      value={selectedWire.label}
                      disabled={!canEdit}
                      onChange={(event) => patchSelectedWire({ label: event.currentTarget.value })}
                    />
                  </Label>
                  <Label>
                    Kind
                    <Select
                      value={selectedWire.kind}
                      disabled={!canEdit}
                      onChange={(event) => patchSelectedWire({ kind: event.currentTarget.value as WireKind })}
                    >
                      {WIRE_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {kind}
                        </option>
                      ))}
                    </Select>
                  </Label>
                  <Label>
                    Status
                    <Select
                      value={selectedWire.status}
                      disabled={!canEdit}
                      onChange={(event) => patchSelectedWire({ status: event.currentTarget.value as RouteStatus })}
                    >
                      {ROUTE_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </Select>
                  </Label>
                  <Label>
                    Throughput
                    <TextField
                      value={selectedWire.throughput ?? ""}
                      disabled={!canEdit}
                      onChange={(event) => patchSelectedWire({ throughput: event.currentTarget.value })}
                    />
                  </Label>
                  <Row>
                    {PALETTE.map((color) => (
                      <ColorDot
                        key={color}
                        type="button"
                        aria-label={`Set selected route color ${color}`}
                        title={color}
                        $color={color}
                        $active={selectedWire.color === color}
                        onClick={() => patchSelectedWire({ color })}
                      />
                    ))}
                  </Row>
                  <Button onClick={deleteSelectedWire} disabled={!canEdit}>
                    Delete route
                  </Button>
                </Stack>
              ) : (
                <Small>Select a route on the canvas or in the route list.</Small>
              )}
            </GroupBox>

            <GroupBox label="Selected node">
              {selected ? (
                <Stack>
                  <Small>
                    Index #{selected.index} / key {selected.key}
                  </Small>
                  <Label>
                    Label
                    <TextField value={selected.label} disabled={!canEdit} onChange={(event) => patchSelected({ label: event.currentTarget.value })} />
                  </Label>
                  <Label>
                    System
                    <TextField value={selected.system} disabled={!canEdit} onChange={(event) => patchSelected({ system: event.currentTarget.value })} />
                  </Label>
                  <Label>
                    Kind
                    <Select value={selected.kind} disabled={!canEdit} onChange={(event) => patchSelected({ kind: event.currentTarget.value as NodeKind, ports: defaultPortsForKind(event.currentTarget.value as NodeKind) })}>
                      {NODE_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {kind}
                        </option>
                      ))}
                    </Select>
                  </Label>
                  <Label>
                    Status
                    <Select value={selected.status} disabled={!canEdit} onChange={(event) => patchSelected({ status: event.currentTarget.value as NodeStatus })}>
                      {NODE_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </Select>
                  </Label>
                  <Checkbox checked={selected.locked} disabled={!canEdit} onChange={(event) => patchSelected({ locked: event.currentTarget.checked })} label="Lock position" />
                  <Row>
                    <Button onClick={() => moveNode(selected.id, -24, 0, "button")} disabled={!canEdit || selected.locked}>
                      Move left
                    </Button>
                    <Button onClick={() => moveNode(selected.id, 24, 0, "button")} disabled={!canEdit || selected.locked}>
                      Move right
                    </Button>
                    <Button onClick={() => moveNode(selected.id, 0, -24, "button")} disabled={!canEdit || selected.locked}>
                      Move up
                    </Button>
                    <Button onClick={() => moveNode(selected.id, 0, 24, "button")} disabled={!canEdit || selected.locked}>
                      Move down
                    </Button>
                  </Row>
                  <Label>
                    Description
                    <TextArea value={selected.description} disabled={!canEdit} onChange={(event) => patchSelected({ description: event.currentTarget.value })} />
                  </Label>
                  <Label>
                    Notes
                    <TextArea value={selected.notes} disabled={!canEdit} onChange={(event) => patchSelected({ notes: event.currentTarget.value })} />
                  </Label>
                  <Small>
                    Ports: {selected.ports.map((port) => `${port.label} ${port.kind} ${port.dataType}`).join(", ")}
                  </Small>
                </Stack>
              ) : (
                <Small>No node selected.</Small>
              )}
            </GroupBox>

            <GroupBox label="Routes">
              <Stack>
                {indexedWires.slice(0, 8).map((wire) => (
                  <RouteListButton
                    key={wire.id}
                    type="button"
                    $active={selectedWireId === wire.id}
                    onClick={() => {
                      setSelectedWireId(wire.id);
                      setSelectedId(wire.to);
                    }}
                    data-map-lab-route-list-item={wire.id}
                  >
                    <RouteSwatch $color={wire.color} />
                    <span>{wire.label}</span>
                    <StatusPill $status={wire.status}>{wire.status}</StatusPill>
                  </RouteListButton>
                ))}
                {indexedWires.length > 8 ? <Small>{indexedWires.length - 8} more routes on canvas.</Small> : null}
              </Stack>
            </GroupBox>

            <GroupBox label="Overview">
              <MiniMapBox>
                <svg
                  viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
                  width="100%"
                  height="100%"
                  aria-label="Map Lab overview"
                  data-map-lab-minimap="true"
                  onPointerDown={handleMiniMapPointerDown}
                  style={{ cursor: "crosshair" }}
                >
                  {doc.wires.map((wire) => {
                    const from = doc.nodes.find((node) => node.id === wire.from);
                    const to = doc.nodes.find((node) => node.id === wire.to);
                    if (!from || !to) return null;
                    const start = nodeCenter(from);
                    const end = nodeCenter(to);
                    return <line key={wire.id} x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={wire.color} strokeWidth="10" opacity="0.6" />;
                  })}
                  {doc.nodes.map((node) => (
                    <rect
                      key={node.id}
                      x={node.x}
                      y={node.y}
                      width={NODE_WIDTH}
                      height={NODE_HEIGHT}
                      fill={node.id === selectedId ? "#0ea5e9" : "#f8fafc"}
                      stroke="#111827"
                      strokeWidth="8"
                    />
                  ))}
                </svg>
              </MiniMapBox>
            </GroupBox>

            <GroupBox label="AT inputs">
              <Stack>
                <Button onClick={() => importSource("repo")} disabled={!canIngest}>
                  Import repo map
                </Button>
                <Button onClick={() => importSource("firehose")} disabled={!canIngest}>
                  Import firehose map
                </Button>
                <Small>{canIngest ? "Imports add read-only map material." : "AT repo/firehose ingestion requires admin or system map ingest permission."}</Small>
              </Stack>
            </GroupBox>

            <GroupBox label="Policy">
              <Small>{mcpPolicy}</Small>
            </GroupBox>
          </Stack>
        </Panel>
      </Shell>
    </AppWindow>
  );
}
