import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, GroupBox } from "react95";
import { GAMESHOW_ROUND_COUNT, type GameshowCreateResult, type GameshowRoundPlan, type GameshowRoundPlanInput, type GameshowPlanTask } from "@shared/gameshow";
import { GAMESHOW_TOOLS } from "@shared/gameshow-tools";
import { gameshowRoundPlanInputSchema } from "@shared/gameshow-plan-schema";
import { api } from "../../lib/api";
import { useGameshowConnection, useGameshowStage } from "./useGameshowStage";
import { ProductionActions, ProductionCard, ProductionColumns, ProductionPanel, ProductionStack, downloadProductionFile } from "./production-ui";
import { ShowHelp } from "./show-desk-ui";

const toInput = (plan: GameshowRoundPlan): GameshowRoundPlanInput => ({ expectedRevision: plan.revision, name: plan.name, description: plan.description, rules: plan.rules, tasks: plan.tasks });
const emptyTask = (): GameshowPlanTask => ({ title: "", description: "", criteria: "", rules: null, deadline: null, tools: [], tokenMonitor: null });

function NewShow({ onCreated }: { onCreated: (id: number) => void }) {
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const connected = useGameshowConnection();
  const create = useMutation({
    networkMode: "always",
    mutationFn: () => api.post<GameshowCreateResult>("/api/gameshow/seasons", { name, number: Number(number) }),
    onSuccess: result => { setName(""); setNumber(""); onCreated(result.id); },
  });
  return <GroupBox label="Create a show"><ProductionStack>
    <p>Create {GAMESHOW_ROUND_COUNT} empty round slots. Add your games now or later; empty slots cannot go live.</p>
    <ProductionColumns>
      <label>Show name<input value={name} onChange={event => setName(event.target.value)} /></label>
      <label>Season number<input type="number" min="1" step="1" value={number} onChange={event => setNumber(event.target.value)} /></label>
    </ProductionColumns>
    <ProductionActions><Button disabled={!connected || create.isPending || !name.trim() || !Number.isSafeInteger(Number(number)) || Number(number) < 1} onClick={() => create.mutate()}>{create.isPending ? "Creating show…" : "Create ten-round show"}</Button></ProductionActions>
    {create.isError && <p role="alert">{create.error.message}</p>}
  </ProductionStack></GroupBox>;
}

function AgentBrief({ roundId, draft, onImport }: { roundId: number; draft: GameshowRoundPlanInput; onImport: (value: GameshowRoundPlanInput) => void }) {
  const [text, setText] = useState("");
  const [notice, setNotice] = useState("");
  const brief = `Prepare this wtfOS round from my dictated instructions. Use only the supplied tool IDs. Keep unanswered rules explicit; do not invent scoring, prizes, fees, deadlines, or elimination. Return GameshowRoundPlanInput JSON for host review, preserving task IDs and expectedRevision. A paired agent with appropriate account permissions can GET /api/v1/gameshow/rounds/${roundId}/plan and PUT that same path using wtf_api_request (api:read/api:write scopes). Saving edits preparation only; it never starts a round.\n\nTools:\n${JSON.stringify(GAMESHOW_TOOLS, null, 2)}\n\nCurrent round:\n${JSON.stringify(draft, null, 2)}`;
  function importDraft() {
    try {
      const result = gameshowRoundPlanInputSchema.safeParse(JSON.parse(text));
      if (!result.success) throw new Error(result.error.issues.map(issue => `${issue.path.join(".") || "round"}: ${issue.message}`).join("; "));
      const parsed = result.data;
      if (parsed.expectedRevision !== draft.expectedRevision) throw new Error("This agent draft was based on a different saved revision. Export the current round and reconcile its changes first.");
      onImport(parsed); setNotice("Agent draft loaded for your review. Select Save round preparation to persist it.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not read that JSON draft."); }
  }
  return <details><summary>Work with an agent</summary><ProductionStack>
    <p>Dictate your game to your paired agent, together with this brief. Its structured draft uses the same preparation controls and permissions.</p>
    <ProductionActions>
      <Button onClick={() => downloadProductionFile(`round-${roundId}-agent-brief.txt`, brief, "text/plain")}>Export agent brief</Button>
      <Button onClick={() => downloadProductionFile(`round-${roundId}.json`, JSON.stringify(draft, null, 2), "application/json")}>Export round JSON</Button>
    </ProductionActions>
    <label>Agent round draft<textarea value={text} onChange={event => setText(event.target.value)} placeholder="Paste the agent's round-plan JSON here." /></label>
    <ProductionActions><Button disabled={!text.trim()} onClick={importDraft}>Load agent draft for review</Button></ProductionActions>
    {notice && <p role="status">{notice}</p>}
  </ProductionStack></details>;
}

function TaskEditor({ task, index, onChange, onRemove, onMove, first, last }: { task: GameshowPlanTask; index: number; onChange: (value: GameshowPlanTask) => void; onRemove: () => void; onMove: (direction: -1 | 1) => void; first: boolean; last: boolean }) {
  return <GroupBox label={`Step ${index + 1}${task.title ? ` · ${task.title}` : " · new step"}`}><ProductionStack>
    <label>Step {index + 1} name<input value={task.title} onChange={event => onChange({ ...task, title: event.target.value })} placeholder="What should contestants do?" /></label>
    <label>Step {index + 1} instructions<textarea value={task.description} onChange={event => onChange({ ...task, description: event.target.value })} placeholder="Explain the action, the output, and the evidence to submit." /></label>
    <label>Step {index + 1} judging criteria<textarea value={task.criteria} onChange={event => onChange({ ...task, criteria: event.target.value })} placeholder="How will the host decide whether the evidence meets this step?" /></label>
    <fieldset><legend>Tools for step {index + 1}</legend><ProductionColumns>
      {GAMESHOW_TOOLS.map(tool => <label key={tool.id} style={{ display: "flex", alignItems: "start", gap: 8 }} title={tool.handoff}>
        <input type="checkbox" checked={task.tools.includes(tool.id)} onChange={event => onChange({ ...task, tools: event.target.checked ? [...task.tools, tool.id] : task.tools.filter(id => id !== tool.id) })} />
        <span><strong>{tool.label}</strong><br /><small>{tool.description}</small></span>
      </label>)}
    </ProductionColumns></fieldset>
    <details><summary>Deadline, extra rules, and token observation</summary><ProductionStack>
      <label>Step {index + 1} extra rules<textarea value={task.rules || ""} onChange={event => onChange({ ...task, rules: event.target.value || null })} /></label>
      <label>Step {index + 1} deadline (ISO timestamp with timezone)<input value={task.deadline || ""} onChange={event => onChange({ ...task, deadline: event.target.value || null })} placeholder="Optional; leave empty to close entries from Run Show." /></label>
      <label style={{ display: "flex", gap: 8 }}><input type="checkbox" checked={!!task.tokenMonitor} onChange={event => onChange({ ...task, tokenMonitor: event.target.checked ? { network: "mainnet", contract: "", tokenId: null } : null })} />Observe token activity for this step</label>
      {task.tokenMonitor && <ProductionStack>
        <p>Tezos mainnet. The progress sheet shows indexed wallet activity during the round; observations do not automatically grade a contestant.</p>
        <label>Step {index + 1} token contract<input value={task.tokenMonitor.contract} onChange={event => onChange({ ...task, tokenMonitor: { ...task.tokenMonitor!, contract: event.target.value } })} placeholder="KT1…" /></label>
        <label>Step {index + 1} token ID<input value={task.tokenMonitor.tokenId || ""} onChange={event => onChange({ ...task, tokenMonitor: { ...task.tokenMonitor!, tokenId: event.target.value || null } })} placeholder="Leave empty to observe the collection." /></label>
      </ProductionStack>}
    </ProductionStack></details>
    <ProductionActions><Button disabled={first} onClick={() => onMove(-1)}>Move step {index + 1} up</Button><Button disabled={last} onClick={() => onMove(1)}>Move step {index + 1} down</Button><Button onClick={onRemove}>Remove step {index + 1}</Button></ProductionActions>
  </ProductionStack></GroupBox>;
}

function RoundEditor({ roundId, seasonId }: { roundId: number; seasonId: number }) {
  const qc = useQueryClient();
  const connected = useGameshowConnection();
  const plan = useQuery({ queryKey: ["gameshow-plan", roundId], queryFn: () => api.get<GameshowRoundPlan>(`/api/gameshow/rounds/${roundId}/plan`) });
  const [draft, setDraft] = useState<GameshowRoundPlanInput | null>(null);
  const [notice, setNotice] = useState("");
  const save = useMutation({ networkMode: "always", mutationFn: (input: GameshowRoundPlanInput) => api.put<GameshowRoundPlan>(`/api/gameshow/rounds/${roundId}/plan`, input),
    onSuccess: result => { qc.setQueryData(["gameshow-plan", roundId], result); setDraft(null); setNotice("Round preparation saved. It will open only when you start it in Run Show."); qc.invalidateQueries({ queryKey: ["gameshow-stage", seasonId] }); qc.invalidateQueries({ queryKey: ["/api/rounds"] }); },
  });
  if (!plan.data) return <ProductionStack><p role={plan.isError ? "alert" : "status"}>{plan.error?.message || "Loading this round's preparation…"}</p>{plan.isError && <Button onClick={() => plan.refetch()}>Retry round preparation</Button>}</ProductionStack>;
  const value = draft ?? toInput(plan.data);
  const readOnly = plan.data.status !== "upcoming";
  const updateTask = (index: number, task: GameshowPlanTask) => setDraft({ ...value, tasks: value.tasks.map((entry, i) => i === index ? task : entry) });
  return <ProductionStack>
    <ProductionActions><h3>{plan.data.name}</h3><strong>{draft ? "Unsaved changes" : `Saved revision ${plan.data.revision}`}</strong></ProductionActions>
    {readOnly && <p role="status">This round has started. Preparation is locked so instructions and evidence stay consistent.</p>}
    <fieldset disabled={readOnly || save.isPending} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}><ProductionStack>
      <label>Round name<input value={value.name} onChange={event => setDraft({ ...value, name: event.target.value })} /></label>
      <label>Round objective<textarea value={value.description || ""} onChange={event => setDraft({ ...value, description: event.target.value || null })} placeholder="What are contestants trying to achieve?" /></label>
      <label>Round rules, scoring, ties, and elimination<textarea value={value.rules || ""} onChange={event => setDraft({ ...value, rules: event.target.value || null })} placeholder="Publish the rules you intend to use. Leave undecided rules explicit while preparing." /></label>
      <h4>Contestant steps</h4>
      <p>Add the tools and instructions in the order contestants should use them. Each step has its own evidence submission and host review.</p>
      {value.tasks.map((task, index) => <TaskEditor key={task.id ?? `new-${index}`} task={task} index={index} first={index === 0} last={index === value.tasks.length - 1} onChange={task => updateTask(index, task)}
        onRemove={() => setDraft({ ...value, tasks: value.tasks.filter((_, i) => i !== index) })}
        onMove={direction => { const tasks = [...value.tasks]; [tasks[index], tasks[index + direction]] = [tasks[index + direction], tasks[index]]; setDraft({ ...value, tasks }); }} />)}
      <ProductionActions><Button onClick={() => setDraft({ ...value, tasks: [...value.tasks, emptyTask()] })}>Add contestant step</Button></ProductionActions>
      <AgentBrief roundId={roundId} draft={value} onImport={setDraft} />
      <ProductionActions>
        <Button disabled={!connected || !value.name.trim() || !draft} onClick={() => save.mutate(value)}>{save.isPending ? "Saving preparation…" : "Save round preparation"}</Button>
        <Button disabled={plan.isFetching} onClick={async () => { const latest = await plan.refetch(); if (!latest.isError) { setDraft(null); setNotice("Saved round reloaded. Unsaved changes discarded."); } }}>Discard draft & reload saved round</Button>
      </ProductionActions>
    </ProductionStack></fieldset>
    {!connected && <p role="alert">You are offline. Your open draft remains here; reconnect before saving.</p>}
    {save.isError && <p role="alert">{save.error.message} Your draft has been retained.</p>}
    {notice && <p role="status">{notice}</p>}
  </ProductionStack>;
}

export function HostRoundBuilder({ seasonId, onCreated }: { seasonId: number | null; onCreated: (id: number) => void }) {
  const stage = useGameshowStage(seasonId);
  const [selected, setSelected] = useState<number | null>(null);
  const [opened, setOpened] = useState<number[]>([]);
  const selectedId = selected ?? stage.data?.rounds[0]?.id ?? null;
  // Retain open editors across round switches; saved authority remains on the server.
  const editors = [...new Set([...opened, ...(selectedId === null ? [] : [selectedId])])];
  return <ProductionPanel aria-label="Round builder">
    <ProductionActions><h2>Build the rounds</h2><ShowHelp label="How round preparation works">Define the objective, rules, tools, and evidence for each round. Save preparation here; start and close rounds in Run Show. You can export a brief for a paired agent and review its JSON draft here.</ShowHelp></ProductionActions>
    <p>Choose a round, add its steps, and select the software contestants will use. Save each draft before leaving the show.</p>
    <details open={seasonId === null}><summary>Create another ten-round show</summary><NewShow onCreated={onCreated} /></details>
    {stage.isError && <p role="alert">{stage.error.message}</p>}
    {stage.data && <>
      <nav aria-label="Round preparation slots"><ProductionActions>{stage.data.rounds.map(round => <Button key={round.id} aria-pressed={selectedId === round.id} onClick={() => { if (selectedId !== null) setOpened(previous => [...new Set([...previous, selectedId])]); setSelected(round.id); }}>R{round.number} · {round.name}</Button>)}</ProductionActions></nav>
      {stage.data.rounds.length === 0 && <p>This season has no round slots. Create a ten-round show above, or add rounds in the existing season editor.</p>}
      {editors.map(roundId => <ProductionCard key={roundId} hidden={roundId !== selectedId}><RoundEditor roundId={roundId} seasonId={seasonId!} /></ProductionCard>)}
    </>}
  </ProductionPanel>;
}
