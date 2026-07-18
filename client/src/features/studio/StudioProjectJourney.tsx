import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowRight,
  Blocks,
  Check,
  Circle,
  Coins,
  MessageCircle,
  Radio,
  Save,
  Sparkles,
} from "lucide-react";
import styled from "styled-components";
import {
  STUDIO_PROJECT_PHASES,
  type StudioProjectPhase,
  type StudioProjectWorkflow,
} from "@shared/types";
import { api } from "../../lib/api";
import { useWindowManager } from "../../lib/window-context";
import type { ProjectDetail } from "./types";

const PHASE_META: Record<
  StudioProjectPhase,
  { label: string; eyebrow: string; prompt: string }
> = {
  concept: {
    label: "Concept",
    eyebrow: "01 · Frame the work",
    prompt: "Name the intent, audience, ownership, and definition of success.",
  },
  collaborate: {
    label: "Collaborate",
    eyebrow: "02 · Assemble the room",
    prompt: "Bring in the people, roles, references, and decisions the work needs.",
  },
  create: {
    label: "Create",
    eyebrow: "03 · Produce the artifact",
    prompt: "Build in broot or another wtfOS tool, then return source and review media here.",
  },
  refine: {
    label: "Refine",
    eyebrow: "04 · Resolve the work",
    prompt: "Review versions, annotations, rights, metadata, and release readiness together.",
  },
  release: {
    label: "Release",
    eyebrow: "05 · Preserve and mint",
    prompt: "Pin durable media first, then package or mint on the explicitly selected Tezos network.",
  },
  activate: {
    label: "Activate",
    eyebrow: "06 · Put it in motion",
    prompt: "Present it live, publish the release destination, and preserve the project record.",
  },
};

const CHECKLIST: Record<StudioProjectPhase, Array<{ id: string; label: string }>> = {
  concept: [
    { id: "brief_ready", label: "Project brief and audience are clear" },
    { id: "ownership_clear", label: "Ownership and permissions are understood" },
  ],
  collaborate: [
    { id: "roles_ready", label: "Collaborator roles are assigned" },
    { id: "decisions_shared", label: "Key decisions are visible in the project conversation" },
  ],
  create: [
    { id: "source_ready", label: "Editable source or build artifacts are attached" },
    { id: "preview_ready", label: "A reviewable preview is available" },
  ],
  refine: [
    { id: "feedback_resolved", label: "Blocking feedback is resolved" },
    { id: "metadata_ready", label: "Title, description, credits, and rights are final" },
  ],
  release: [
    { id: "media_pinned", label: "Release media has durable pin evidence" },
    { id: "contract_verified", label: "Contract or mint result is recorded and verified" },
  ],
  activate: [
    { id: "live_plan_ready", label: "Presentation or launch room is prepared" },
    { id: "release_published", label: "Public release destination is recorded" },
  ],
};

type WorkflowPatch = Partial<Pick<StudioProjectWorkflow, "phase" | "useCase" | "targetNetwork">> & {
  checklist?: Record<string, boolean>;
  references?: Partial<StudioProjectWorkflow["references"]>;
};

interface StudioProjectJourneyProps {
  canEdit: boolean;
  projectDetail: ProjectDetail;
}

export function StudioProjectJourney({ canEdit, projectDetail }: StudioProjectJourneyProps) {
  const { project, members, files } = projectDetail;
  const workflow: StudioProjectWorkflow = project.workflow ?? {
    phase: "concept",
    useCase: "artwork",
    targetNetwork: "shadownet",
    checklist: {},
    references: {},
  };
  const wm = useWindowManager();
  const qc = useQueryClient();
  const [referenceDraft, setReferenceDraft] = useState(workflow.references);

  useEffect(() => setReferenceDraft(workflow.references), [workflow.references]);

  const updateWorkflow = useMutation({
    mutationFn: (patch: WorkflowPatch) =>
      api.patch<{ workflow: StudioProjectWorkflow }>(
        `/api/studio/projects/${project.id}/workflow`,
        patch
      ),
    onSuccess: ({ workflow: next }) => {
      qc.setQueryData<ProjectDetail>(["studio", "project", project.id], (current) =>
        current
          ? { ...current, project: { ...current.project, workflow: next } }
          : current
      );
      qc.invalidateQueries({ queryKey: ["studio", "projects"] });
      qc.invalidateQueries({ queryKey: ["studio", "chat", project.conversationId] });
    },
  });

  const phaseIndex = STUDIO_PROJECT_PHASES.indexOf(workflow.phase);
  const tasks = CHECKLIST[workflow.phase];
  const completedTaskCount = tasks.filter((task) => workflow.checklist[task.id]).length;
  const progress = Math.round(
    ((phaseIndex + completedTaskCount / Math.max(tasks.length, 1)) /
      STUDIO_PROJECT_PHASES.length) *
      100
  );
  const nextTask = tasks.find((task) => !workflow.checklist[task.id]);
  const query = useMemo(() => {
    const params = new URLSearchParams({
      studioProject: String(project.id),
      projectName: project.name,
      network: workflow.targetNetwork,
      useCase: workflow.useCase,
    });
    return params.toString();
  }, [project.id, project.name, workflow.targetNetwork, workflow.useCase]);

  const open = (path: string) => wm.openPage(path);
  const handoffs = [
    {
      id: "wim",
      label: "WIM",
      detail: "Open the durable project conversation and keep decisions attached to the room.",
      action: "Coordinate in WIM",
      icon: MessageCircle,
      path: `/wim?conversation=${project.conversationId ?? ""}&${query}`,
      featured: true,
    },
    {
      id: "broot",
      label: "broot",
      detail: "Build and export Tezos-ready visual assets with the project context carried forward.",
      action: "Create in broot",
      icon: Sparkles,
      path: `/tools/broot?${query}`,
      featured: true,
    },
    {
      id: "pinning",
      label: "IPFS Pinning",
      detail: "Preserve release media and return the CID as durable evidence before minting.",
      action: "Preserve release media",
      icon: Archive,
      path: `/ipfs-pinning?${query}`,
      featured: false,
    },
    {
      id: "pasta",
      label: "Pasta Protocol",
      detail: "Choose a collection or release pattern, inspect ownership, and prepare the contract path.",
      action: "Open Pasta Protocol",
      icon: Blocks,
      path: `/tools/colander?${query}`,
      featured: true,
    },
    {
      id: "mint",
      label: "Mint Portal",
      detail: "Execute an existing mint workflow after checking the target network and pinned media.",
      action: "Open Mint Portal",
      icon: Coins,
      path: `/mint-portal?${query}`,
      featured: false,
    },
    {
      id: "live",
      label: "wtf Live",
      detail: "Rehearse, present, screen-share, or launch the finished project with collaborators.",
      action: "Prepare wtf Live",
      icon: Radio,
      path: `/live?tab=overview&${query}`,
      featured: true,
    },
  ];

  return (
    <JourneyShell data-studio-region="project-journey" data-studio-phase={workflow.phase}>
      <JourneyTop>
        <div>
          <Kicker>{PHASE_META[workflow.phase].eyebrow}</Kicker>
          <JourneyTitle>Project runway</JourneyTitle>
          <JourneyPrompt>{PHASE_META[workflow.phase].prompt}</JourneyPrompt>
        </div>
        <ProgressBlock aria-label={`Project runway ${progress}% complete`}>
          <span>{progress}%</span>
          <ProgressTrack><i style={{ width: `${progress}%` }} /></ProgressTrack>
          <small>{members.length} collaborators · {files.length} files</small>
        </ProgressBlock>
      </JourneyTop>

      <PhaseNav aria-label="Project lifecycle">
        {STUDIO_PROJECT_PHASES.map((phase, index) => {
          const active = phase === workflow.phase;
          const complete = index < phaseIndex;
          return (
            <PhaseButton
              key={phase}
              type="button"
              $active={active}
              $complete={complete}
              aria-current={active ? "step" : undefined}
              disabled={!canEdit || updateWorkflow.isPending}
              onClick={() => updateWorkflow.mutate({ phase })}
            >
              <span>{complete ? <Check size={14} aria-hidden /> : index + 1}</span>
              {PHASE_META[phase].label}
            </PhaseButton>
          );
        })}
      </PhaseNav>

      <JourneyGrid data-studio-region="journey-grid">
        <NextPanel>
          <PanelLabel>Do next</PanelLabel>
          <h3>{nextTask?.label ?? `Advance beyond ${PHASE_META[workflow.phase].label}`}</h3>
          <p>
            Keep the shared record honest. Check a step only when the result is visible to the project team.
          </p>
          <Checklist>
            {tasks.map((task) => (
              <label key={task.id}>
                <input
                  type="checkbox"
                  checked={Boolean(workflow.checklist[task.id])}
                  disabled={!canEdit || updateWorkflow.isPending}
                  onChange={(event) =>
                    updateWorkflow.mutate({ checklist: { [task.id]: event.target.checked } })
                  }
                />
                {workflow.checklist[task.id] ? <Check size={15} aria-hidden /> : <Circle size={15} aria-hidden />}
                <span>{task.label}</span>
              </label>
            ))}
          </Checklist>
          <ContextFields>
            <label>
              Project use case
              <select
                value={workflow.useCase}
                disabled={!canEdit || updateWorkflow.isPending}
                onChange={(event) =>
                  updateWorkflow.mutate({ useCase: event.target.value as StudioProjectWorkflow["useCase"] })
                }
              >
                <option value="artwork">Artwork or media</option>
                <option value="collection">Collection or edition</option>
                <option value="live_experience">Live experience</option>
                <option value="protocol">Protocol or application</option>
                <option value="other">Other Tezos project</option>
              </select>
            </label>
            <label>
              Target network
              <select
                value={workflow.targetNetwork}
                disabled={!canEdit || updateWorkflow.isPending}
                onChange={(event) =>
                  updateWorkflow.mutate({ targetNetwork: event.target.value as StudioProjectWorkflow["targetNetwork"] })
                }
              >
                <option value="shadownet">Shadownet · prove first</option>
                <option value="mainnet">Mainnet · value-bearing</option>
              </select>
            </label>
          </ContextFields>
          {workflow.targetNetwork === "mainnet" ? (
            <NetworkNotice>
              Mainnet is selected. Studio never signs or originates on your behalf—verify wallet, network,
              metadata, cost, and contract in the owner tool before approving an operation.
            </NetworkNotice>
          ) : null}
          {updateWorkflow.isError ? (
            <ErrorText>Could not save the shared runway. Try the change again.</ErrorText>
          ) : null}
        </NextPanel>

        <EcosystemPanel>
          <PanelLabel>Connected wtfOS workflow</PanelLabel>
          <AppGrid>
            {handoffs.map((handoff) => {
              const Icon = handoff.icon;
              return (
                <AppCard key={handoff.id} $featured={handoff.featured}>
                  <AppCardHead><Icon size={17} aria-hidden /><strong>{handoff.label}</strong></AppCardHead>
                  <p>{handoff.detail}</p>
                  <button type="button" onClick={() => open(handoff.path)}>
                    {handoff.action}<ArrowRight size={14} aria-hidden />
                  </button>
                </AppCard>
              );
            })}
          </AppGrid>
        </EcosystemPanel>

        <EvidencePanel>
          <PanelLabel>Release evidence</PanelLabel>
          <p>Paste results from the owner tools so collaborators can recover the release after refresh.</p>
          <label>CID<input value={referenceDraft.pinCid ?? ""} onChange={(event) => setReferenceDraft((current) => ({ ...current, pinCid: event.target.value }))} placeholder="ipfs://bafy…" /></label>
          <label>Contract<input value={referenceDraft.contractAddress ?? ""} onChange={(event) => setReferenceDraft((current) => ({ ...current, contractAddress: event.target.value }))} placeholder="KT1…" /></label>
          <label>wtf Live room<input value={referenceDraft.liveRoomId ?? ""} onChange={(event) => setReferenceDraft((current) => ({ ...current, liveRoomId: event.target.value }))} placeholder="room or stage id" /></label>
          <label>Release URL<input type="url" value={referenceDraft.releaseUrl ?? ""} onChange={(event) => setReferenceDraft((current) => ({ ...current, releaseUrl: event.target.value }))} placeholder="https://…" /></label>
          <EvidenceSave
            type="button"
            disabled={!canEdit || updateWorkflow.isPending}
            onClick={() => updateWorkflow.mutate({ references: referenceDraft })}
          >
            <Save size={14} aria-hidden /> {updateWorkflow.isPending ? "Saving evidence…" : "Save release evidence"}
          </EvidenceSave>
        </EvidencePanel>
      </JourneyGrid>
    </JourneyShell>
  );
}

const JourneyShell = styled.section`
  border: 1px solid var(--wtf-app-border, #7d8792);
  background: color-mix(in srgb, var(--wtf-app-surface-raised, #fff) 90%, #b8f2ff);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: var(--wtf-app-text, #111);
  [data-studio-presentation-host="gamma"] & { background: #0d0d0b; border-color: rgba(0, 210, 255, .35); color: #f2ead9; border-radius: 6px; }
`;
const JourneyTop = styled.div`display:flex;justify-content:space-between;align-items:flex-start;gap:18px;@media(max-width:620px){flex-direction:column;}`;
const Kicker = styled.div`font:700 12px/1.2 "IBM Plex Mono",monospace;color:var(--wtf-app-link,#064f72);text-transform:uppercase;`;
const JourneyTitle = styled.h2`margin:3px 0 2px;font-size:20px;line-height:1.2;`;
const JourneyPrompt = styled.p`margin:0;max-width:72ch;font-size:13px;color:var(--wtf-app-muted-text,#4b5563);`;
const ProgressBlock = styled.div`min-width:180px;text-align:right;font:700 12px/1.3 "IBM Plex Mono",monospace;small{display:block;margin-top:4px;font-weight:400;color:var(--wtf-app-muted-text,#555);}@media(max-width:620px){width:100%;text-align:left;}`;
const ProgressTrack = styled.div`height:7px;margin-top:5px;border:1px solid currentColor;background:transparent;i{display:block;height:100%;background:#00a8c8;transition:width .18s ease;} @media(prefers-reduced-motion:reduce){i{transition:none;}}`;
const PhaseNav = styled.nav`display:grid;grid-template-columns:repeat(6,minmax(90px,1fr));gap:4px;overflow-x:auto;`;
const PhaseButton = styled.button<{ $active:boolean;$complete:boolean }>`min-height:42px;padding:6px 8px;border:1px solid ${p=>p.$active?"#006f8b":"var(--wtf-app-border,#8b929a)"};background:${p=>p.$active?"#d9f7ff":p.$complete?"#e6f4e8":"var(--wtf-app-surface-raised,#fff)"};color:var(--wtf-app-text,#111);font:700 12px/1.2 inherit;display:flex;align-items:center;gap:6px;cursor:pointer;&:focus-visible{outline:2px solid #006f8b;outline-offset:2px;}span{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;border:1px solid currentColor;}[data-studio-presentation-host="gamma"] &{background:${p=>p.$active?"#00d2ff":p.$complete?"#172014":"#11110f"};color:${p=>p.$active?"#070706":"#f2ead9"};border-color:${p=>p.$active?"#00d2ff":"rgba(242,234,217,.22)"};}`;
const JourneyGrid = styled.div`display:grid;grid-template-columns:minmax(260px,.85fr) minmax(420px,1.65fr) minmax(240px,.8fr);gap:10px;@media(max-width:1100px){grid-template-columns:1fr 1.4fr;.evidence{grid-column:1/-1;}}@media(max-width:760px){grid-template-columns:1fr;}`;
const BasePanel = styled.div`border-top:1px solid var(--wtf-app-border,#8b929a);padding-top:9px;min-width:0;p{font-size:12px;line-height:1.45;color:var(--wtf-app-muted-text,#555);}`;
const NextPanel = styled(BasePanel)``;
const EcosystemPanel = styled(BasePanel)``;
const EvidencePanel = styled(BasePanel).attrs({ className:"evidence" })`display:flex;flex-direction:column;gap:6px;label{font-size:12px;font-weight:700;display:grid;gap:3px;}input{min-height:32px;border:1px solid var(--wtf-app-border,#8b929a);padding:5px 7px;background:var(--wtf-app-surface-raised,#fff);color:var(--wtf-app-text,#111);}`;
const PanelLabel = styled.div`font:700 11px/1.2 "IBM Plex Mono",monospace;text-transform:uppercase;color:var(--wtf-app-link,#065f73);margin-bottom:6px;`;
const Checklist = styled.div`display:grid;gap:5px;margin:10px 0;label{display:flex;align-items:center;gap:7px;min-height:30px;font-size:12px;cursor:pointer;}input{position:absolute;opacity:0;}label:has(input:focus-visible){outline:2px solid #006f8b;outline-offset:2px;}`;
const ContextFields = styled.div`display:grid;grid-template-columns:1fr 1fr;gap:7px;label{display:grid;gap:3px;font-size:11px;font-weight:700;}select{min-height:34px;border:1px solid var(--wtf-app-border,#8b929a);background:var(--wtf-app-surface-raised,#fff);color:var(--wtf-app-text,#111);padding:4px;}@media(max-width:520px){grid-template-columns:1fr;}`;
const NetworkNotice = styled.div`margin-top:8px;padding:7px;border:1px solid #aa6300;background:#fff4d7;color:#5c3300;font-size:11px;line-height:1.4;`;
const ErrorText = styled.div`margin-top:6px;color:#b42318;font-size:12px;`;
const AppGrid = styled.div`display:grid;grid-template-columns:repeat(2,minmax(180px,1fr));gap:7px;@media(max-width:560px){grid-template-columns:1fr;}`;
const AppCard = styled.article<{ $featured:boolean }>`border:1px solid ${p=>p.$featured?"#1593ad":"var(--wtf-app-border,#8b929a)"};padding:9px;background:var(--wtf-app-surface-raised,#fff);display:flex;flex-direction:column;min-height:132px;p{flex:1;margin:7px 0;}button{align-self:flex-start;display:flex;align-items:center;gap:5px;min-height:32px;border:1px solid #006f8b;background:${p=>p.$featured?"#d9f7ff":"transparent"};color:#004d61;font-weight:700;cursor:pointer;}[data-studio-presentation-host="gamma"] &{background:#11110f;border-color:${p=>p.$featured?"#00d2ff":"rgba(242,234,217,.2)"};button{background:${p=>p.$featured?"#00d2ff":"#11110f"};color:${p=>p.$featured?"#070706":"#f2ead9"};}}`;
const AppCardHead = styled.div`display:flex;align-items:center;gap:7px;font-size:13px;`;
const EvidenceSave = styled.button`min-height:34px;margin-top:3px;display:flex;align-items:center;justify-content:center;gap:6px;border:1px solid #006f8b;background:#006f8b;color:#fff;font-weight:700;cursor:pointer;&:disabled{opacity:.55;cursor:not-allowed;}`;
