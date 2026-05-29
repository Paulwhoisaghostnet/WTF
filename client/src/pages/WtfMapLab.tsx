import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { Button, Checkbox, GroupBox, TextField } from "react95";
import { AppWindow } from "../components/layout/AppWindow";
import { useAuth } from "../lib/auth-context";
import { logClientSystemEvent } from "../lib/system-log";

type NodeKind = "system" | "agent" | "data" | "policy" | "repo" | "milestone";
type WireKind = "serves" | "depends" | "reads" | "writes" | "blocks";

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
  notes: string;
};

type MapWire = {
  id: string;
  from: string;
  to: string;
  kind: WireKind;
  color: string;
  label: string;
};

type MapDoc = {
  version: 1;
  title: string;
  nodes: MapNode[];
  wires: MapWire[];
  updatedAt: string;
};

const STORAGE_KEY = "wtfos.map-lab.repo-draft.v1";
const NODE_KINDS: NodeKind[] = ["system", "agent", "data", "policy", "repo", "milestone"];
const WIRE_KINDS: WireKind[] = ["serves", "depends", "reads", "writes", "blocks"];
const PALETTE = ["#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0f766e"];

const SEED_DOC: MapDoc = {
  version: 1,
  title: "WTFOS sovereign system map",
  updatedAt: new Date().toISOString(),
  nodes: [
    {
      id: "node-1",
      key: "wtfos-pds",
      index: 1,
      label: "WTFOS PDS",
      kind: "repo",
      x: 120,
      y: 130,
      locked: true,
      system: "Identity",
      notes: "Sovereign repo boundary for app state.",
    },
    {
      id: "node-2",
      key: "map-lab",
      index: 2,
      label: "Map Lab",
      kind: "system",
      x: 390,
      y: 110,
      locked: false,
      system: "Design",
      notes: "Roadmaps, AI workflow maps, and system structure sketches.",
    },
    {
      id: "node-3",
      key: "mcp-agent",
      index: 3,
      label: "MCP Agent",
      kind: "agent",
      x: 670,
      y: 210,
      locked: false,
      system: "Automation",
      notes: "Can create map objects; cannot consume ingested private paths.",
    },
    {
      id: "node-4",
      key: "at-firehose",
      index: 4,
      label: "AT firehose input",
      kind: "data",
      x: 130,
      y: 360,
      locked: false,
      system: "AT Protocol",
      notes: "Read-only importer for repos, commits, and stream events.",
    },
  ],
  wires: [
    { id: "wire-1", from: "node-1", to: "node-2", kind: "writes", color: "#2563eb", label: "save/restore" },
    { id: "wire-2", from: "node-4", to: "node-2", kind: "reads", color: "#059669", label: "ingest preview" },
    { id: "wire-3", from: "node-3", to: "node-2", kind: "serves", color: "#d97706", label: "create only" },
  ],
};

const Shell = styled.div`
  min-height: 680px;
  width: min(1180px, calc(100vw - 44px));
  display: grid;
  grid-template-columns: 250px minmax(520px, 1fr) 270px;
  gap: 10px;
  color: #101827;
`;

const Panel = styled.div`
  background: #f7f7ef;
  border: 1px solid #4b5563;
  box-shadow: inset 1px 1px 0 #ffffff, inset -1px -1px 0 #9ca3af;
  padding: 10px;
  min-width: 0;
`;

const Canvas = styled.div`
  position: relative;
  min-height: 640px;
  overflow: hidden;
  background:
    linear-gradient(rgba(31, 41, 55, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(31, 41, 55, 0.08) 1px, transparent 1px),
    radial-gradient(circle at 30% 20%, rgba(250, 204, 21, 0.16), transparent 26%),
    #eef2f2;
  background-size: 28px 28px, 28px 28px, 100% 100%;
  border: 1px solid #111827;
`;

const WireSvg = styled.svg`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
`;

const NodeCard = styled.button<{ $x: number; $y: number; $kind: NodeKind; $selected: boolean }>`
  position: absolute;
  left: ${(p) => p.$x}px;
  top: ${(p) => p.$y}px;
  width: 148px;
  min-height: 76px;
  border: 2px solid ${(p) => (p.$selected ? "#111827" : "#334155")};
  background: ${(p) =>
    ({
      system: "#ffffff",
      agent: "#ecfeff",
      data: "#f0fdf4",
      policy: "#fff7ed",
      repo: "#eff6ff",
      milestone: "#fdf2f8",
    })[p.$kind]};
  box-shadow: ${(p) => (p.$selected ? "4px 4px 0 #111827" : "2px 2px 0 rgba(17, 24, 39, 0.22)")};
  padding: 8px;
  text-align: left;
  cursor: grab;
  font-family: "MS Sans Serif", "Segoe UI", Tahoma, sans-serif;
`;

const NodeTop = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 10px;
  text-transform: uppercase;
  color: #475569;
`;

const NodeLabel = styled.div`
  margin-top: 6px;
  font-size: 14px;
  font-weight: 800;
  line-height: 1.1;
  word-break: break-word;
`;

const NodeMeta = styled.div`
  margin-top: 6px;
  font-size: 11px;
  color: #334155;
`;

const Stack = styled.div`
  display: grid;
  gap: 8px;
`;

const Row = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
`;

const Small = styled.p`
  margin: 0;
  color: #475569;
  font-size: 12px;
  line-height: 1.35;
`;

const Label = styled.label`
  display: grid;
  gap: 3px;
  font-size: 12px;
  font-weight: 700;
`;

const Select = styled.select`
  min-height: 28px;
  background: #ffffff;
  border: 1px solid #111827;
`;

const TextArea = styled.textarea`
  min-height: 82px;
  resize: vertical;
  border: 1px solid #111827;
  padding: 6px;
  font-family: inherit;
`;

const ColorDot = styled.button<{ $color: string; $active: boolean }>`
  width: 22px;
  height: 22px;
  border: ${(p) => (p.$active ? "3px solid #111827" : "1px solid #111827")};
  background: ${(p) => p.$color};
`;

function nextNodeIndex(nodes: MapNode[]) {
  return nodes.reduce((max, node) => Math.max(max, node.index), 0) + 1;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "component";
}

function loadDoc(): MapDoc {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return SEED_DOC;
    const parsed = JSON.parse(raw) as MapDoc;
    if (parsed.version !== 1 || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.wires)) {
      return SEED_DOC;
    }
    return parsed;
  } catch {
    return SEED_DOC;
  }
}

function nodeCenter(node: MapNode) {
  return { x: node.x + 74, y: node.y + 38 };
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
    return {
      ...node,
      x: 80 + lane * 210,
      y: 80 + Math.max(0, order) * 132,
    };
  });
}

function createImportedNodes(source: "repo" | "firehose", nodes: MapNode[]): MapNode[] {
  const base = nextNodeIndex(nodes);
  const entries =
    source === "repo"
      ? [
          ["repo.commit", "Repo Commit", "repo"],
          ["lexicon.record", "Lexicon Record", "data"],
          ["identity.link", "Identity Link", "policy"],
        ]
      : [
          ["stream.cursor", "Stream Cursor", "data"],
          ["event.router", "Event Router", "system"],
          ["read.guard", "Read Guard", "policy"],
        ];
  return entries.map(([key, label, kind], offset) => ({
    id: `node-${Date.now()}-${offset}`,
    key: `${source}-${key}`,
    index: base + offset,
    label,
    kind: kind as NodeKind,
    x: 90 + offset * 190,
    y: 430,
    locked: false,
    system: source === "repo" ? "AT Repo Import" : "AT Firehose",
    notes: "Imported as read-only map material. Ingested path contents are not exposed to MCP creation tools.",
  }));
}

export function WtfMapLab() {
  const { user, isAdmin, hasPermission } = useAuth();
  const [doc, setDoc] = useState<MapDoc>(() => loadDoc());
  const [selectedId, setSelectedId] = useState(doc.nodes[0]?.id ?? "");
  const [newLabel, setNewLabel] = useState("New component");
  const [newKind, setNewKind] = useState<NodeKind>("system");
  const [wireFrom, setWireFrom] = useState(doc.nodes[0]?.id ?? "");
  const [wireTo, setWireTo] = useState(doc.nodes[1]?.id ?? "");
  const [wireKind, setWireKind] = useState<WireKind>("serves");
  const [wireColor, setWireColor] = useState(PALETTE[0]);

  const roles = user?.roles ?? (user?.role ? [user.role] : []);
  const canWrite = Boolean(user) && !roles.includes("time_out");
  const canIngest = isAdmin || hasPermission("system.maps.ingest");
  const mcpPolicy = "MCP agents may create nodes, wires, and docs; ingested repo/firehose path contents stay read-only and unavailable to MCP use paths.";

  const selected = doc.nodes.find((node) => node.id === selectedId) ?? doc.nodes[0] ?? null;
  const indexedNodes = useMemo(
    () => [...doc.nodes].sort((a, b) => a.index - b.index),
    [doc.nodes]
  );

  useEffect(() => {
    logClientSystemEvent({
      eventType: "map_lab.viewed",
      metadata: { nodeCount: doc.nodes.length, wireCount: doc.wires.length },
    });
  }, []);

  function updateDoc(updater: (current: MapDoc) => MapDoc) {
    setDoc((current) => ({ ...updater(current), updatedAt: new Date().toISOString() }));
  }

  function addNode() {
    if (!canWrite) return;
    const index = nextNodeIndex(doc.nodes);
    const node: MapNode = {
      id: `node-${Date.now()}`,
      key: `${slugify(newLabel)}-${index}`,
      index,
      label: newLabel.trim() || `Component ${index}`,
      kind: newKind,
      x: 120 + (index % 4) * 160,
      y: 120 + (index % 5) * 90,
      locked: false,
      system: "Unassigned",
      notes: "",
    };
    updateDoc((current) => ({ ...current, nodes: [...current.nodes, node] }));
    setSelectedId(node.id);
    logClientSystemEvent({ eventType: "map_lab.node.created", metadata: { nodeKey: node.key, kind: node.kind } });
  }

  function addWire() {
    if (!canWrite || !wireFrom || !wireTo || wireFrom === wireTo) return;
    const wire: MapWire = {
      id: `wire-${Date.now()}`,
      from: wireFrom,
      to: wireTo,
      kind: wireKind,
      color: wireColor,
      label: wireKind,
    };
    updateDoc((current) => ({ ...current, wires: [...current.wires, wire] }));
    logClientSystemEvent({ eventType: "map_lab.wire.created", metadata: { kind: wire.kind } });
  }

  function patchSelected(patch: Partial<MapNode>) {
    if (!selected || !canWrite) return;
    updateDoc((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === selected.id ? { ...node, ...patch } : node)),
    }));
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
          to: current.nodes[1]?.id ?? current.nodes[0]?.id ?? node.id,
          kind: "reads" as WireKind,
          color: "#059669",
          label: "read-only",
        })),
      ],
    }));
    logClientSystemEvent({ eventType: "map_lab.ingest.previewed", metadata: { source } });
  }

  function saveToRepoDraft() {
    if (!canWrite) return;
    const saved = { ...doc, updatedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    setDoc(saved);
    logClientSystemEvent({ eventType: "map_lab.repo.saved", metadata: { nodeCount: saved.nodes.length } });
  }

  function restoreRepoDraft() {
    const restored = loadDoc();
    setDoc(restored);
    setSelectedId(restored.nodes[0]?.id ?? "");
    logClientSystemEvent({ eventType: "map_lab.repo.restored", metadata: { nodeCount: restored.nodes.length } });
  }

  return (
    <AppWindow title="WTF Map Lab">
      <Shell>
        <Panel>
          <Stack>
            <GroupBox label="Map">
              <Stack>
                <Label>
                  Title
                  <TextField value={doc.title} onChange={(event) => updateDoc((current) => ({ ...current, title: event.currentTarget.value }))} disabled={!canWrite} />
                </Label>
                <Small>{doc.nodes.length} shapes, {doc.wires.length} wires</Small>
                <Row>
                  <Button onClick={saveToRepoDraft} disabled={!canWrite}>Save repo draft</Button>
                  <Button onClick={restoreRepoDraft}>Restore</Button>
                </Row>
              </Stack>
            </GroupBox>

            <GroupBox label="Add shape">
              <Stack>
                <TextField value={newLabel} onChange={(event) => setNewLabel(event.currentTarget.value)} disabled={!canWrite} />
                <Select value={newKind} onChange={(event) => setNewKind(event.currentTarget.value as NodeKind)} disabled={!canWrite}>
                  {NODE_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                </Select>
                <Button onClick={addNode} disabled={!canWrite}>Add component</Button>
              </Stack>
            </GroupBox>

            <GroupBox label="Wire">
              <Stack>
                <Select value={wireFrom} onChange={(event) => setWireFrom(event.currentTarget.value)} disabled={!canWrite}>
                  {indexedNodes.map((node) => <option key={node.id} value={node.id}>{node.key}</option>)}
                </Select>
                <Select value={wireTo} onChange={(event) => setWireTo(event.currentTarget.value)} disabled={!canWrite}>
                  {indexedNodes.map((node) => <option key={node.id} value={node.id}>{node.key}</option>)}
                </Select>
                <Select value={wireKind} onChange={(event) => setWireKind(event.currentTarget.value as WireKind)} disabled={!canWrite}>
                  {WIRE_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                </Select>
                <Row>
                  {PALETTE.map((color) => (
                    <ColorDot key={color} type="button" title={color} $color={color} $active={wireColor === color} onClick={() => setWireColor(color)} />
                  ))}
                </Row>
                <Button onClick={addWire} disabled={!canWrite}>Connect</Button>
              </Stack>
            </GroupBox>
          </Stack>
        </Panel>

        <Canvas aria-label="WTF Map Lab canvas">
          <WireSvg>
            {doc.wires.map((wire) => {
              const from = doc.nodes.find((node) => node.id === wire.from);
              const to = doc.nodes.find((node) => node.id === wire.to);
              if (!from || !to) return null;
              const start = nodeCenter(from);
              const end = nodeCenter(to);
              const midX = (start.x + end.x) / 2;
              return (
                <g key={wire.id}>
                  <path d={`M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`} fill="none" stroke={wire.color} strokeWidth="3" />
                  <circle cx={end.x} cy={end.y} r="5" fill={wire.color} />
                  <text x={midX + 6} y={(start.y + end.y) / 2 - 6} fill="#111827" fontSize="11">{wire.label}</text>
                </g>
              );
            })}
          </WireSvg>
          {indexedNodes.map((node) => (
            <NodeCard
              key={node.id}
              type="button"
              $x={node.x}
              $y={node.y}
              $kind={node.kind}
              $selected={selectedId === node.id}
              onClick={() => setSelectedId(node.id)}
            >
              <NodeTop>
                <span>#{node.index} {node.kind}</span>
                <span>{node.locked ? "LOCK" : "FLOW"}</span>
              </NodeTop>
              <NodeLabel>{node.label}</NodeLabel>
              <NodeMeta>{node.key}</NodeMeta>
              <NodeMeta>{node.system}</NodeMeta>
            </NodeCard>
          ))}
        </Canvas>

        <Panel>
          <Stack>
            <GroupBox label="Layout">
              <Stack>
                <Button onClick={() => updateDoc((current) => ({ ...current, nodes: optimizeFlow(current.nodes, current.wires, "flow") }))} disabled={!canWrite}>Optimize flow</Button>
                <Button onClick={() => updateDoc((current) => ({ ...current, nodes: optimizeFlow(current.nodes, current.wires, "fit") }))} disabled={!canWrite}>Fit unlocked</Button>
                <Small>Locked nodes hold position while unlocked nodes resolve around dependency depth or compact fit lanes.</Small>
              </Stack>
            </GroupBox>

            <GroupBox label="Selected shape">
              {selected ? (
                <Stack>
                  <Small>Index #{selected.index} / key {selected.key}</Small>
                  <Label>Label<TextField value={selected.label} disabled={!canWrite} onChange={(event) => patchSelected({ label: event.currentTarget.value })} /></Label>
                  <Label>System<TextField value={selected.system} disabled={!canWrite} onChange={(event) => patchSelected({ system: event.currentTarget.value })} /></Label>
                  <Label>Kind<Select value={selected.kind} disabled={!canWrite} onChange={(event) => patchSelected({ kind: event.currentTarget.value as NodeKind })}>{NODE_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}</Select></Label>
                  <Checkbox checked={selected.locked} disabled={!canWrite} onChange={(event) => patchSelected({ locked: event.currentTarget.checked })} label="Lock position" />
                  <Row>
                    <Button onClick={() => patchSelected({ x: Math.max(0, selected.x - 24) })} disabled={!canWrite}>Left</Button>
                    <Button onClick={() => patchSelected({ x: selected.x + 24 })} disabled={!canWrite}>Right</Button>
                    <Button onClick={() => patchSelected({ y: Math.max(0, selected.y - 24) })} disabled={!canWrite}>Up</Button>
                    <Button onClick={() => patchSelected({ y: selected.y + 24 })} disabled={!canWrite}>Down</Button>
                  </Row>
                  <Label>Notes<TextArea value={selected.notes} disabled={!canWrite} onChange={(event) => patchSelected({ notes: event.currentTarget.value })} /></Label>
                </Stack>
              ) : <Small>No shape selected.</Small>}
            </GroupBox>

            <GroupBox label="AT inputs">
              <Stack>
                <Button onClick={() => importSource("repo")} disabled={!canIngest}>Import repo map</Button>
                <Button onClick={() => importSource("firehose")} disabled={!canIngest}>Import firehose map</Button>
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
