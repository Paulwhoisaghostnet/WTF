/**
 * Colander — Pasta Protocol ownership / management / discovery control panel.
 *
 * Phase 4. Colander opens any contract by address, detects its Pasta type from the on-chain entrypoints
 * via the composable adapter registry (shared/pasta-protocol/adapters), and renders only the admin /
 * transfer / role workflows that contract actually supports — it hardcodes no per-app logic. It also reads
 * the contract metadata's relationship block and renders the Wallet -> Franchise -> Collection -> Token
 * graph. Reads use the user's configured RPC; writes are signed by the connected wallet. Per Owner
 * Directive #3 it indexes nothing: it reads the public chain + the open contract at runtime only.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { AppWindow } from "../../../components/layout/AppWindow";
import { MOBILE } from "../../../global-styles";
import { presentationRouteHref, usePresentationShell } from "../../../lib/presentation-shell";
import { connectWallet, getActiveAccount, getTezos, withTezosRpcFallback } from "../../../lib/tezos/wallet";
import { getNetwork } from "../../../lib/tezos/loaders";
import { assertNetworkReadyForSend } from "../../../lib/tezos/preflight";
import { logClientSystemEvent } from "../../../lib/system-log";
import {
  availableActions,
  detectPastaContract,
  extractRelationshipMetadata,
  type PastaContractAction,
  type PastaContractAdapter,
} from "@shared/pasta-protocol";
import type { OwnershipRelationshipMetadata } from "@shared/pasta-protocol";
import {
  attachContract,
  COLANDER_WORKSPACE_STORAGE_KEY,
  createPastaProject,
  isPastaProject,
  PASTA_TOOL_STORIES,
  parsePastaProjects,
  pastaToolHandoffPath,
  toolIdForContractKind,
  type PastaToolId,
  type PastaWorkspaceProject,
} from "./colander-workspace";

type OpenedContract = {
  address: string;
  adapter: PastaContractAdapter | null;
  entrypoints: string[];
  actions: PastaContractAction[];
  admin?: string;
  pendingAdmin?: string;
  tokenCount?: number;
  revisionCount?: number;
  relationship?: OwnershipRelationshipMetadata;
  metadataUri?: string;
};

type ColanderTezosHarness = {
  connectWallet?: typeof connectWallet;
  getActiveAccount?: typeof getActiveAccount;
  getTezos?: typeof getTezos;
  assertNetworkReadyForSend?: typeof assertNetworkReadyForSend;
};

const IPFS_GATEWAY = "https://ipfs.fileship.xyz/";

const colanderRegionAttrs = (region: string) =>
  ({ "data-colander-region": region }) as Record<string, string>;

function getColanderTezosHarness(): ColanderTezosHarness | undefined {
  if (typeof window === "undefined") return undefined;
  if (!["localhost", "127.0.0.1"].includes(window.location.hostname)) return undefined;
  return (window as any).__wtfColanderTezosHarness;
}

async function colanderConnectWallet(options?: Parameters<typeof connectWallet>[0]) {
  return (getColanderTezosHarness()?.connectWallet ?? connectWallet)(options);
}

async function colanderGetActiveAccount() {
  return (getColanderTezosHarness()?.getActiveAccount ?? getActiveAccount)();
}

async function colanderGetTezos() {
  return (getColanderTezosHarness()?.getTezos ?? getTezos)();
}

async function colanderAssertNetworkReadyForSend(address?: string) {
  return (getColanderTezosHarness()?.assertNetworkReadyForSend ?? assertNetworkReadyForSend)(address);
}

function explorerUrl(address: string) {
  const net = getNetwork();
  const host = net === "shadownet" ? "shadownet.tzkt.io" : net === "ghostnet" ? "ghostnet.tzkt.io" : "tzkt.io";
  return `https://${host}/${address}`;
}

function short(value: string) {
  return value.length > 14 ? `${value.slice(0, 7)}…${value.slice(-5)}` : value;
}

function isKt(value: string) {
  return /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(value.trim());
}

function bigToNum(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") return value;
  if (typeof value === "object" && typeof (value as any).toNumber === "function") {
    return (value as any).toNumber();
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function hexToUtf8(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  let out = "";
  for (let i = 0; i < clean.length; i += 2) out += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
  try {
    return decodeURIComponent(escape(out));
  } catch {
    return out;
  }
}

function utf8ToHex(value: string): string {
  return Array.from(new TextEncoder().encode(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseJsonDataUri(uri: string): Record<string, unknown> | undefined {
  const match = uri.match(/^data:application\/json(;charset=[^;,]+)?(;base64)?,(.+)$/i);
  if (!match) return undefined;
  const isBase64 = Boolean(match[2]);
  const payload = match[3] ?? "";
  const jsonText = isBase64
    ? new TextDecoder().decode(Uint8Array.from(atob(payload), (char) => char.charCodeAt(0)))
    : decodeURIComponent(payload);
  return JSON.parse(jsonText) as Record<string, unknown>;
}

function metadataFetchUrl(metadataUri: string): string | null {
  if (metadataUri.startsWith("ipfs://")) return `${IPFS_GATEWAY}${metadataUri.slice("ipfs://".length)}`;
  if (/^https:\/\//i.test(metadataUri)) return metadataUri;
  return null;
}

async function fetchRelationship(metadataUri: string): Promise<OwnershipRelationshipMetadata | undefined> {
  if (metadataUri.startsWith("data:application/json")) {
    try {
      const json = parseJsonDataUri(metadataUri);
      return json ? extractRelationshipMetadata(json) : undefined;
    } catch {
      return undefined;
    }
  }
  const url = metadataFetchUrl(metadataUri);
  if (!url) return undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return undefined;
    const json = (await res.json()) as Record<string, unknown>;
    return extractRelationshipMetadata(json);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export function ColanderApp() {
  const presentation = usePresentationShell();
  const [account, setAccount] = useState<string>("");
  const [network] = useState<string>(getNetwork());
  const [addressInput, setAddressInput] = useState("");
  const [opened, setOpened] = useState<OpenedContract | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Colander ready");
  const [error, setError] = useState("");
  const [projects, setProjects] = useState<PastaWorkspaceProject[]>(() => {
    if (typeof window === "undefined") return [];
    return parsePastaProjects(window.localStorage.getItem(COLANDER_WORKSPACE_STORAGE_KEY));
  });
  const [activeProjectId, setActiveProjectId] = useState<string>("");
  const [projectTitle, setProjectTitle] = useState("");
  const [selectedToolId, setSelectedToolId] = useState<PastaToolId>("spaghetti");
  const importInputRef = useRef<HTMLInputElement>(null);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? projects[0] ?? null,
    [activeProjectId, projects],
  );

  useEffect(() => {
    window.localStorage.setItem(COLANDER_WORKSPACE_STORAGE_KEY, JSON.stringify(projects));
    if (!activeProjectId && projects[0]) setActiveProjectId(projects[0].id);
  }, [activeProjectId, projects]);

  useEffect(() => {
    const refreshProjects = () => {
      const stored = parsePastaProjects(window.localStorage.getItem(COLANDER_WORKSPACE_STORAGE_KEY));
      setProjects((current) => JSON.stringify(current) === JSON.stringify(stored) ? current : stored);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === COLANDER_WORKSPACE_STORAGE_KEY) refreshProjects();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refreshProjects);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refreshProjects);
    };
  }, []);

  const groupedActions = useMemo(() => {
    const groups = new Map<string, PastaContractAction[]>();
    for (const action of opened?.actions ?? []) {
      const list = groups.get(action.group) ?? [];
      list.push(action);
      groups.set(action.group, list);
    }
    return [...groups.entries()];
  }, [opened]);

  async function connect() {
    setError("");
    try {
      await colanderConnectWallet({ forcePermissions: true });
      const acc = await colanderGetActiveAccount();
      setAccount(acc?.address ?? "");
      setStatus(acc ? `Connected ${short(acc.address)}` : "Wallet not connected");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connect failed");
    }
  }

  function createProject(toolId: PastaToolId = selectedToolId, launch = false) {
    const project = createPastaProject(projectTitle, toolId, network);
    setProjects((current) => [project, ...current]);
    setActiveProjectId(project.id);
    setProjectTitle("");
    setStatus(`Created ${project.title}`);
    logClientSystemEvent({
      eventType: "colander.project_created",
      message: `Colander created ${project.title}`,
      metadata: { app: "Colander", projectId: project.id, toolId, network },
    });
    if (launch) launchTool(toolId, project);
  }

  function launchTool(toolId: PastaToolId, projectOverride?: PastaWorkspaceProject) {
    const project = projectOverride ?? activeProject;
    if (!project) {
      createProject(toolId, true);
      return;
    }
    const path = pastaToolHandoffPath(toolId, project, network);
    logClientSystemEvent({
      eventType: "colander.tool_launched",
      message: `Colander opened ${toolId} for ${project.title}`,
      metadata: { app: "Colander", projectId: project.id, toolId, path, network },
    });
    window.open(presentationRouteHref(path, presentation.host), "_blank", "noopener");
  }

  function exportProject() {
    if (!activeProject) return;
    const blob = new Blob([JSON.stringify(activeProject, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${activeProject.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pasta-project"}.pasta.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    logClientSystemEvent({
      eventType: "colander.project_exported",
      message: `Colander exported ${activeProject.title}`,
      metadata: { app: "Colander", projectId: activeProject.id },
    });
  }

  async function importProject(file: File) {
    setError("");
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!isPastaProject(parsed)) throw new Error("That file is not a Pasta Project manifest.");
      const imported = { ...parsed, updatedAt: new Date().toISOString() };
      setProjects((current) => [imported, ...current.filter((project) => project.id !== imported.id)]);
      setActiveProjectId(imported.id);
      setStatus(`Imported ${imported.title}`);
      logClientSystemEvent({
        eventType: "colander.project_imported",
        message: `Colander imported ${imported.title}`,
        metadata: { app: "Colander", projectId: imported.id, toolId: imported.toolId },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not import project");
    }
  }

  async function openContract() {
    const kt = addressInput.trim();
    if (!isKt(kt)) {
      setError("Enter a valid KT1 contract address.");
      return;
    }
    setBusy(true);
    setError("");
    setActiveAction(null);
    setStatus(`Reading ${short(kt)}…`);
    try {
      const readContract = async (tezos: any): Promise<OpenedContract> => {
        const contract = await tezos.contract.at(kt);
        const entrypoints = Object.keys((contract as any).entrypoints?.entrypoints ?? {});
        const adapter = detectPastaContract(entrypoints);
        const actions = adapter ? availableActions(adapter, entrypoints) : [];

        let admin: string | undefined;
        let pendingAdmin: string | undefined;
        let tokenCount: number | undefined;
        let revisionCount: number | undefined;
        let relationship: OwnershipRelationshipMetadata | undefined;
        let metadataUri: string | undefined;
        try {
          const st: any = await contract.storage();
          admin = typeof st.administrator === "string" ? st.administrator : undefined;
          pendingAdmin =
            st.pending_administrator && typeof st.pending_administrator === "string"
              ? st.pending_administrator
              : undefined;
          tokenCount = bigToNum(st.next_token_id);
          revisionCount = bigToNum(st.revision_count);
          if (st.metadata && typeof st.metadata.get === "function") {
            const raw = await st.metadata.get("");
            if (typeof raw === "string" && raw.length > 0) {
              metadataUri = hexToUtf8(raw);
              relationship = await fetchRelationship(metadataUri);
            }
          }
        } catch {
          // storage shape varies; the control panel still works from entrypoints alone.
        }

        return {
          address: kt,
          adapter,
          entrypoints,
          actions,
          admin,
          pendingAdmin,
          tokenCount,
          revisionCount,
          relationship,
          metadataUri,
        };
      };

      const next = getColanderTezosHarness()?.getTezos
        ? await readContract(await colanderGetTezos())
        : await withTezosRpcFallback((tezos) => readContract(tezos), { network, attemptTimeoutMs: 10_000 });
      setOpened(next);
      setProjects((current) => {
        const target = current.find((project) => project.id === activeProject?.id);
        if (target) return current.map((project) => project.id === target.id ? attachContract(project, kt) : project);
        const recovered = attachContract(
          createPastaProject(`${next.adapter?.label ?? "Recovered"} ${short(kt)}`, toolIdForContractKind(next.adapter?.kind), network),
          kt,
        );
        setActiveProjectId(recovered.id);
        return [recovered, ...current];
      });
      setStatus(next.adapter ? `Opened ${next.adapter.label}` : "Opened (unrecognized contract)");
      logClientSystemEvent({
        eventType: "colander.contract_opened",
        message: `Colander opened ${kt}`,
        metadata: { app: "Colander", contract: kt, kind: next.adapter?.kind ?? "unknown", network },
      });
      logClientSystemEvent({
        eventType: "colander.graph_viewed",
        message: `Colander rendered relationship graph for ${kt}`,
        metadata: {
          app: "Colander",
          contract: kt,
          hasRelationship: Boolean(next.relationship),
          franchise: next.relationship?.franchise_contract ?? null,
        },
      });
    } catch (e) {
      setOpened(null);
      setError(e instanceof Error ? e.message : "Could not open contract");
    } finally {
      setBusy(false);
    }
  }

  function selectAction(action: PastaContractAction) {
    if (action.external) {
      const params = new URLSearchParams({
        handoff: "colander",
        contract: opened?.address ?? "",
        action: action.id,
        network,
        kind: opened?.adapter?.kind ?? "unknown",
      });
      const path = `/tools/${action.external}?${params.toString()}`;
      logClientSystemEvent({
        eventType: "colander.handoff_opened",
        message: `Colander opened ${action.external} for ${action.id}`,
        metadata: {
          app: "Colander",
          contract: opened?.address ?? null,
          action: action.id,
          destination: action.external,
          kind: opened?.adapter?.kind ?? "unknown",
          path,
        },
      });
      window.open(presentationRouteHref(path, presentation.host), "_blank", "noopener");
      return;
    }
    setActiveAction((cur) => (cur === action.id ? null : action.id));
    setFormValues({});
    setError("");
  }

  function buildCall(c: any, action: PastaContractAction, me: string) {
    const v = formValues;
    const num = (name: string) => Number(v[name] ?? 0);
    const bool = (name: string) => String(v[name] ?? "false") === "true";
    const iso = (name: string) => {
      const raw = (v[name] ?? "").trim();
      return raw ? new Date(raw).toISOString() : null;
    };
    switch (action.id) {
      case "transfer":
        return c.methodsObject.transfer([
          { from_: me, txs: [{ to_: v.to_, token_id: num("token_id"), amount: num("amount") }] },
        ]);
      case "mint":
        return c.methodsObject.mint({ to_: v.to_, token_id: num("token_id"), amount: num("amount") });
      case "burn":
        return c.methodsObject.burn({ token_id: num("token_id"), amount: num("amount") });
      case "add_minter":
        return c.methodsObject.add_minter(v.minter);
      case "remove_minter":
        return c.methodsObject.remove_minter(v.minter);
      case "add_curator":
        return c.methodsObject.add_curator(v.curator);
      case "remove_curator":
        return c.methodsObject.remove_curator(v.curator);
      case "set_sale_active":
        return c.methodsObject.set_sale_active({ token_id: num("token_id"), active: bool("active") });
      case "set_sale":
        return c.methodsObject.set_sale({
          token_id: num("token_id"),
          sale: {
            active: bool("active"),
            seller: me,
            treasury: v.treasury?.trim() || me,
            price: num("price"),
            remaining: num("remaining"),
            start: iso("start"),
            end: iso("end"),
          },
        });
      case "redeem":
        return c.methodsObject.redeem({ token_id: num("token_id"), amount: num("amount") });
      case "set_bundle_contents":
        return c.methodsObject.set_bundle_contents({
          token_id: num("token_id"),
          contents_uri: utf8ToHex(v.contents_uri?.trim() || ""),
        });
      case "open_claim":
        return c.methodsObject.open_claim({ active: bool("active"), start: iso("start"), end: iso("end") });
      case "claim":
        return c.methodsObject.claim(num("token_id"));
      case "set_current_revision":
        return c.methodsObject.set_current_revision(num("rid"));
      case "transfer_administration":
        return c.methodsObject.transfer_administration(v.pending_administrator);
      case "accept_administration":
        return c.methodsObject.accept_administration();
      default:
        throw new Error(`Unsupported action: ${action.id}`);
    }
  }

  async function submitAction(action: PastaContractAction) {
    if (!opened) return;
    setBusy(true);
    setError("");
    try {
      const conn = await colanderConnectWallet();
      const me = conn.address;
      setAccount(me);
      for (const input of action.inputs) {
        if (input.optional) continue;
        if (input.type === "bool") continue;
        if (!(formValues[input.name] ?? "").trim()) throw new Error(`${input.label} is required`);
      }
      await colanderAssertNetworkReadyForSend(me);
      setStatus(`Submitting ${action.label} (sign in wallet)…`);
      const tezos = await colanderGetTezos();
      const c = await tezos.wallet.at(opened.address);
      const op = await buildCall(c, action, me).send();
      await op.confirmation();
      setStatus(`${action.label} confirmed ✓`);

      if (action.id === "transfer") {
        logClientSystemEvent({
          eventType: "colander.transfer_submitted",
          message: `Colander transfer on ${opened.address}`,
          metadata: { app: "Colander", contract: opened.address, token_id: formValues.token_id ?? null },
        });
      } else if (action.group === "role" || action.group === "admin") {
        logClientSystemEvent({
          eventType: "colander.role_updated",
          message: `Colander ${action.id} on ${opened.address}`,
          metadata: { app: "Colander", contract: opened.address, action: action.id },
        });
      }
      logClientSystemEvent({
        eventType: "colander.contract_action_submitted",
        message: `Colander ${action.id} confirmed on ${opened.address}`,
        metadata: {
          app: "Colander",
          contract: opened.address,
          action: action.id,
          group: action.group,
          network: getNetwork(),
        },
      });
      setActiveAction(null);
      setFormValues({});
      await openContract();
    } catch (e) {
      setError(e instanceof Error ? e.message : `${action.label} failed`);
      setStatus(`${action.label} failed`);
    } finally {
      setBusy(false);
    }
  }

  const relationshipNodes = useMemo(() => {
    if (!opened) return [];
    const r = opened.relationship;
    const nodes: Array<{ label: string; value: string; tone: string }> = [];
    if (account) nodes.push({ label: "Wallet", value: short(account), tone: "wallet" });
    else if (opened.admin) nodes.push({ label: "Admin", value: short(opened.admin), tone: "wallet" });
    if (r?.franchise_contract) nodes.push({ label: "Franchise", value: short(r.franchise_contract), tone: "franchise" });
    if (r?.parent_contract) nodes.push({ label: "Parent", value: short(r.parent_contract), tone: "parent" });
    nodes.push({
      label: opened.adapter?.label ?? "Contract",
      value: short(opened.address),
      tone: "contract",
    });
    return nodes;
  }, [opened, account]);

  return (
    <AppWindow title="Colander">
      <Shell
        data-testid="colander-app"
        data-colander-surface="control-panel"
        data-colander-presentation-host={presentation.host}
      >
        <Header>
          <BrandRow>
            <BrandBadge aria-hidden="true">CL</BrandBadge>
            <BrandCopy>
              <AppTitle>Colander</AppTitle>
              <Acronym>
                {presentation.host === "gamma"
                  ? "Pasta Protocol ownership workspace for creating, publishing, selling, and managing work."
                  : "Your local-first workspace for creating, publishing, selling, and managing Pasta Protocol work."}
              </Acronym>
            </BrandCopy>
          </BrandRow>
          <WalletBox>
            <Chip $tone="muted">network: {network}</Chip>
            <Chip $tone={account ? "ok" : "muted"}>{account ? short(account) : "not connected"}</Chip>
            <Button type="button" onClick={connect}>{account ? "Reconnect" : "Connect wallet"}</Button>
          </WalletBox>
        </Header>

        <Workspace data-testid="colander-workspace">
          <WorkspaceHead>
            <div>
              <WorkspaceTitle>Project workspace</WorkspaceTitle>
              <Muted>Choose what you want to make. Colander keeps the project; the matching Pasta app does the specialized work.</Muted>
            </div>
            <WorkspaceActions>
              <Button type="button" onClick={() => importInputRef.current?.click()}>Import manifest</Button>
              <Button type="button" onClick={exportProject} disabled={!activeProject}>Export active</Button>
              <input
                ref={importInputRef}
                hidden
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importProject(file);
                  event.target.value = "";
                }}
              />
            </WorkspaceActions>
          </WorkspaceHead>

          <WorkspaceGrid>
            <ProjectRail aria-label="Pasta projects">
              <Field>
                Project name
                <Input
                  data-testid="colander-project-title"
                  value={projectTitle}
                  onChange={(event) => setProjectTitle(event.target.value)}
                  placeholder="My next release"
                />
              </Field>
              <Field>
                Starting workflow
                <Input
                  as="select"
                  data-testid="colander-project-tool"
                  value={selectedToolId}
                  onChange={(event) => setSelectedToolId(event.target.value as PastaToolId)}
                >
                  {PASTA_TOOL_STORIES.map((tool) => <option key={tool.id} value={tool.id}>{tool.label}</option>)}
                </Input>
              </Field>
              <PrimaryButton data-testid="colander-create-project" type="button" onClick={() => createProject()}>
                Create project
              </PrimaryButton>
              <ProjectList>
                {projects.length ? projects.map((project) => (
                  <ProjectButton
                    key={project.id}
                    type="button"
                    $active={project.id === activeProject?.id}
                    onClick={() => setActiveProjectId(project.id)}
                  >
                    <strong>{project.title}</strong>
                    <span>{project.stage} · {project.contracts.length} contract{project.contracts.length === 1 ? "" : "s"} · {project.artifacts.length} site export{project.artifacts.length === 1 ? "" : "s"}</span>
                  </ProjectButton>
                )) : <Muted>No projects yet. Start with the outcome you want.</Muted>}
              </ProjectList>
              {activeProject?.artifacts.length ? (
                <ArtifactList aria-label="Active project site exports">
                  <strong>Self-hosted sites</strong>
                  {activeProject.artifacts.slice(0, 3).map((artifact) => (
                    <span key={artifact.id}>{artifact.fileName} · {short(artifact.contract)}</span>
                  ))}
                </ArtifactList>
              ) : null}
            </ProjectRail>

            <ToolGrid aria-label="Pasta workflow chooser">
              {PASTA_TOOL_STORIES.map((tool) => (
                <ToolCard key={tool.id} data-colander-tool={tool.id}>
                  <ToolPhase>{tool.phase}</ToolPhase>
                  <ActionName>{tool.label}</ActionName>
                  <Muted>{tool.story}</Muted>
                  <Button type="button" onClick={() => launchTool(tool.id)}>
                    {activeProject ? `Open for ${activeProject.title}` : `Start with ${tool.label}`} ↗
                  </Button>
                </ToolCard>
              ))}
            </ToolGrid>
          </WorkspaceGrid>
        </Workspace>

        <ContractHeading>
          <div>
            <WorkspaceTitle>Contracts</WorkspaceTitle>
            <Muted>Recover or manage any Pasta contract directly from its KT1 address. Opened contracts attach to the active project.</Muted>
          </div>
        </ContractHeading>
        <Toolbar>
          <Field>
            Contract address
            <Input
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              placeholder="KT1…"
              data-testid="colander-address"
            />
          </Field>
          <PrimaryButton type="button" onClick={openContract} disabled={busy}>
            Open contract
          </PrimaryButton>
        </Toolbar>

        {opened ? (
          <Body>
            <Panel>
              <PanelHeader>
                <PanelTitle>
                  {opened.adapter?.label ?? "Unrecognized contract"}
                  <PanelSubtitle>{opened.adapter?.description ?? "No Pasta adapter matched the entrypoints."}</PanelSubtitle>
                </PanelTitle>
                <a href={explorerUrl(opened.address)} target="_blank" rel="noopener noreferrer">explorer ↗</a>
              </PanelHeader>
              <Scroll>
                <FactRow><Muted>Address</Muted><span>{opened.address}</span></FactRow>
                {opened.admin ? <FactRow><Muted>Admin</Muted><span>{opened.admin}</span></FactRow> : null}
                {opened.pendingAdmin ? <FactRow><Muted>Pending admin</Muted><span>{opened.pendingAdmin}</span></FactRow> : null}
                {opened.tokenCount != null ? <FactRow><Muted>Token types</Muted><span>{opened.tokenCount}</span></FactRow> : null}
                {opened.revisionCount != null ? <FactRow><Muted>Revisions</Muted><span>{opened.revisionCount}</span></FactRow> : null}
                {opened.metadataUri ? <FactRow><Muted>Metadata</Muted><span>{opened.metadataUri}</span></FactRow> : null}

                <SectionTitle>Relationship graph</SectionTitle>
                <Graph aria-label="ownership relationship graph">
                  {relationshipNodes.map((node, i) => (
                    <GraphNodeWrap key={`${node.label}-${i}`}>
                      <GraphNode $tone={node.tone}>
                        <NodeLabel>{node.label}</NodeLabel>
                        <NodeValue>{node.value}</NodeValue>
                      </GraphNode>
                      {i < relationshipNodes.length - 1 ? <Arrow aria-hidden="true">→</Arrow> : null}
                    </GraphNodeWrap>
                  ))}
                </Graph>
                {opened.relationship?.collection_group ? (
                  <Muted>group: {opened.relationship.collection_group}</Muted>
                ) : null}
                {!opened.relationship ? (
                  <Muted>No relationship metadata found — showing wallet → contract only.</Muted>
                ) : null}
              </Scroll>
            </Panel>

            <Panel>
              <PanelHeader>
                <PanelTitle>
                  Control panel
                  <PanelSubtitle>Workflows this contract supports. Writes are signed by your wallet.</PanelSubtitle>
                </PanelTitle>
              </PanelHeader>
              <Scroll>
                {opened.actions.length === 0 ? (
                  <Muted>No recognized management actions for this contract.</Muted>
                ) : (
                  groupedActions.map(([group, actions]) => (
                    <ActionGroupBlock key={group}>
                      <SectionTitle>{group}</SectionTitle>
                      {actions.map((action) => (
                        <ActionCard key={action.id} data-colander-action={action.id}>
                          <ActionHead>
                            <div>
                              <ActionName>{action.label}</ActionName>
                              {action.description ? <Muted>{action.description}</Muted> : null}
                            </div>
                            <Button type="button" onClick={() => selectAction(action)}>
                              {action.external ? `Open ${action.external} ↗` : activeAction === action.id ? "Cancel" : "Use"}
                            </Button>
                          </ActionHead>
                          {activeAction === action.id && !action.external ? (
                            <ActionForm
                              data-colander-action-form={action.id}
                              onSubmit={(e) => {
                                e.preventDefault();
                                void submitAction(action);
                              }}
                            >
                              {action.inputs.map((input) => (
                                <Field key={input.name}>
                                  {input.label}
                                  {input.optional ? <Muted> (optional)</Muted> : null}
                                  {input.type === "bool" ? (
                                    <Input
                                      as="select"
                                      value={formValues[input.name] ?? "true"}
                                      onChange={(e) => setFormValues((p) => ({ ...p, [input.name]: e.target.value }))}
                                    >
                                      <option value="true">Yes</option>
                                      <option value="false">No</option>
                                    </Input>
                                  ) : (
                                    <Input
                                      type={input.type === "datetime" ? "datetime-local" : input.type === "nat" || input.type === "amount_mutez" ? "number" : "text"}
                                      value={formValues[input.name] ?? ""}
                                      placeholder={input.placeholder}
                                      onChange={(e) => setFormValues((p) => ({ ...p, [input.name]: e.target.value }))}
                                    />
                                  )}
                                </Field>
                              ))}
                              <PrimaryButton type="submit" disabled={busy}>
                                Submit {action.label}
                              </PrimaryButton>
                            </ActionForm>
                          ) : null}
                        </ActionCard>
                      ))}
                    </ActionGroupBlock>
                  ))
                )}
              </Scroll>
            </Panel>
          </Body>
        ) : (
          <EmptyState>
            <ActionName>Open a contract to manage it</ActionName>
            <Muted>
              Paste any KT1 address. Colander detects whether it is a Spaghetti/Rotini collection, Gnocchi
              open edition, Ravioli bundle, Penne distribution, Lasagna exhibition, or a generic FA2, and
              shows the workflows it supports.
            </Muted>
          </EmptyState>
        )}

        <StatusLine role="status" aria-live="polite" $error={Boolean(error)}>
          {error || status}
        </StatusLine>
      </Shell>
    </AppWindow>
  );
}

export default ColanderApp;

// ---- styles ----

const Shell = styled.div`
  display: grid;
  grid-template-rows: auto auto auto auto minmax(320px, 1fr) auto;
  gap: 10px;
  height: 100%;
  min-height: 0;
  overflow: auto;

  &[data-colander-presentation-host="gamma"] {
    background: #070706;
    background-image: none;
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    gap: 12px;
    padding: 12px;
    box-shadow: none;
    text-shadow: none;
  }

  &[data-colander-presentation-host="gamma"],
  &[data-colander-presentation-host="gamma"] * {
    box-sizing: border-box;
  }

  &[data-colander-presentation-host="gamma"] a {
    color: #00d2ff;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
`;

const Workspace = styled.section`
  display: grid;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #fff);

  [data-colander-presentation-host="gamma"] & {
    background: #11110f;
    border: 1px solid rgba(0, 210, 255, 0.28);
    border-radius: 6px;
  }
`;

const WorkspaceHead = styled.div`
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;

  ${MOBILE} {
    flex-direction: column;
  }
`;

const WorkspaceTitle = styled.h2`
  margin: 0 0 3px;
  font-size: 17px;
`;

const WorkspaceActions = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`;

const WorkspaceGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  gap: 10px;

  ${MOBILE} {
    grid-template-columns: 1fr;
  }
`;

const ProjectRail = styled.div`
  display: grid;
  gap: 8px;
  align-content: start;
  padding-right: 10px;
  border-right: 1px solid var(--wtf-app-border, #d2d2d2);

  [data-colander-presentation-host="gamma"] & {
    border-right-color: rgba(242, 234, 217, 0.16);
  }

  ${MOBILE} {
    padding-right: 0;
    border-right: 0;
  }
`;

const ProjectList = styled.div`
  display: grid;
  gap: 5px;
  max-height: 190px;
  overflow: auto;
`;

const ArtifactList = styled.div`
  display: grid;
  gap: 4px;
  padding-top: 7px;
  border-top: 1px solid var(--wtf-app-border, #d2d2d2);
  font-size: 12px;

  span { color: var(--wtf-app-muted-text, #58616c); overflow-wrap: anywhere; }

  [data-colander-presentation-host="gamma"] & {
    border-top-color: rgba(242, 234, 217, 0.16);
  }
`;

const ProjectButton = styled.button<{ $active: boolean }>`
  display: grid;
  gap: 2px;
  padding: 7px;
  text-align: left;
  border: 1px solid ${(p) => p.$active ? "#0b5cad" : "var(--wtf-app-border, #aaa)"};
  border-left-width: ${(p) => p.$active ? "4px" : "1px"};
  background: ${(p) => p.$active ? "#edf5ff" : "#fff"};
  color: #111;
  cursor: pointer;

  span { font-size: 12px; color: #58616c; }

  [data-colander-presentation-host="gamma"] & {
    background: ${(p) => p.$active ? "#102027" : "#070706"};
    border-color: ${(p) => p.$active ? "#00d2ff" : "rgba(242, 234, 217, 0.18)"};
    color: #f2ead9;
  }
`;

const ToolGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(205px, 1fr));
  gap: 8px;
`;

const ToolCard = styled.article`
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  gap: 5px;
  min-height: 134px;
  padding: 9px;
  border: 1px solid var(--wtf-app-border, #b8c6d4);
  background: #fbfdff;

  [data-colander-presentation-host="gamma"] & {
    background: #070706;
    border-color: rgba(242, 234, 217, 0.14);
    border-radius: 6px;
  }
`;

const ToolPhase = styled.span`
  color: #0b5cad;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .08em;
  text-transform: uppercase;

  [data-colander-presentation-host="gamma"] & { color: #00d2ff; }
`;

const ContractHeading = styled.div`
  padding: 2px 2px 0;
`;

const Header = styled.section.attrs(colanderRegionAttrs("header"))`
  display: grid;
  grid-template-columns: minmax(240px, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: linear-gradient(180deg, #ffffff 0%, #f3f6fb 100%);
  color: var(--wtf-app-text, #111);

  [data-colander-presentation-host="gamma"] & {
    background: #11110f;
    background-image: none;
    border: 1px solid rgba(0, 210, 255, 0.28);
    border-radius: 6px;
    color: #f2ead9;
    box-shadow: none;
    text-shadow: none;
  }

  ${MOBILE} {
    grid-template-columns: 1fr;
  }
`;

const BrandRow = styled.div.attrs(colanderRegionAttrs("brand"))`
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
`;

const BrandBadge = styled.div`
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 1px solid #111;
  background: #111;
  color: #fff;
  font-weight: 800;

  [data-colander-presentation-host="gamma"] & {
    background: #070706;
    background-image: none;
    border: 1px solid #00d2ff;
    border-radius: 4px;
    color: #00d2ff;
    box-shadow: none;
    text-shadow: none;
  }
`;

const BrandCopy = styled.div`
  display: grid;
  gap: 3px;
  min-width: 0;
`;

const AppTitle = styled.h1`
  margin: 0;
  font-size: 26px;
  line-height: 1;

  [data-colander-presentation-host="gamma"] & {
    color: #f2ead9;
    font-size: 20px;
    letter-spacing: 0;
    line-height: 1.15;
    text-shadow: none;
  }
`;

const Acronym = styled.div`
  color: var(--wtf-app-muted-text, #384352);
  font-size: var(--wtf-type-caption, 13px);

  [data-colander-presentation-host="gamma"] & {
    color: rgba(242, 234, 217, 0.72);
    line-height: 1.4;
  }
`;

const WalletBox = styled.div.attrs(colanderRegionAttrs("wallet"))`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
`;

const Toolbar = styled.div.attrs(colanderRegionAttrs("toolbar"))`
  display: flex;
  align-items: end;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #fff);

  [data-colander-presentation-host="gamma"] & {
    background: #11110f;
    background-image: none;
    border: 1px solid rgba(242, 234, 217, 0.16);
    border-radius: 6px;
    color: #f2ead9;
    box-shadow: none;
    text-shadow: none;
  }
`;

const Body = styled.div.attrs(colanderRegionAttrs("body"))`
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(320px, 1.2fr);
  gap: 10px;
  min-height: 0;

  ${MOBILE} {
    grid-template-columns: 1fr;
  }
`;

const Panel = styled.section.attrs(colanderRegionAttrs("panel"))`
  min-height: 0;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #fff);
  display: flex;
  flex-direction: column;

  [data-colander-presentation-host="gamma"] & {
    background: #11110f;
    background-image: none;
    border: 1px solid rgba(242, 234, 217, 0.16);
    border-radius: 6px;
    color: #f2ead9;
    box-shadow: none;
    text-shadow: none;
  }
`;

const PanelHeader = styled.div.attrs(colanderRegionAttrs("panel-header"))`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid var(--wtf-app-border, #808080);
  font-weight: 700;

  a {
    font-size: var(--wtf-type-caption, 13px);
  }

  [data-colander-presentation-host="gamma"] & {
    border-bottom: 1px solid rgba(0, 210, 255, 0.24);
  }
`;

const PanelTitle = styled.div`
  display: grid;
  gap: 2px;
  min-width: 0;
`;

const PanelSubtitle = styled.span`
  color: var(--wtf-app-muted-text, #555);
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 400;

  [data-colander-presentation-host="gamma"] & {
    color: rgba(242, 234, 217, 0.64);
  }
`;

const Scroll = styled.div.attrs(colanderRegionAttrs("scroll"))`
  overflow: auto;
  min-height: 0;
  padding: 8px;
  display: grid;
  gap: 8px;
  align-content: start;
`;

const Field = styled.label.attrs(colanderRegionAttrs("field"))`
  display: grid;
  gap: 4px;
  min-width: 180px;
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-text, #111);

  [data-colander-presentation-host="gamma"] & {
    color: rgba(242, 234, 217, 0.78);
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
  }
`;

const Input = styled.input.attrs(colanderRegionAttrs("input"))`
  min-height: 30px;
  border: 1px solid var(--wtf-app-border, #808080);
  padding: 4px 6px;
  background: #fff;
  color: #111;
  font: inherit;

  &:focus-visible {
    outline: 2px solid #0b5cad;
    outline-offset: 2px;
  }

  [data-colander-presentation-host="gamma"] & {
    background: #070706;
    background-image: none;
    border: 1px solid rgba(0, 210, 255, 0.36);
    border-radius: 4px;
    color: #f2ead9;
    box-shadow: none;
    text-shadow: none;
  }

  [data-colander-presentation-host="gamma"] &:focus-visible {
    outline: 2px solid #00d2ff;
    outline-offset: 2px;
  }
`;

const Button = styled.button.attrs(colanderRegionAttrs("button"))`
  min-height: 32px;
  border: 1px solid #111;
  background: var(--wtf-app-surface-raised, #fff);
  color: var(--wtf-app-text, #111);
  padding: 5px 10px;
  font: inherit;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--wtf-app-surface, #f4f4f4);
  }

  &:disabled {
    color: var(--wtf-app-muted-text, #666);
    cursor: not-allowed;
  }

  [data-colander-presentation-host="gamma"] & {
    background: #070706;
    background-image: none;
    border: 1px solid rgba(0, 210, 255, 0.44);
    border-radius: 4px;
    color: #00d2ff;
    box-shadow: none;
    text-shadow: none;
  }

  [data-colander-presentation-host="gamma"] &:hover:not(:disabled) {
    background: #11110f;
    color: #f2ead9;
  }

  [data-colander-presentation-host="gamma"] &:disabled {
    color: rgba(242, 234, 217, 0.42);
  }
`;

const PrimaryButton = styled(Button).attrs(colanderRegionAttrs("primary-button"))`
  background: #0b5cad;
  border-color: #073f75;
  color: #fff;

  &:hover:not(:disabled) {
    background: #084f96;
  }

  [data-colander-presentation-host="gamma"] & {
    background: #00d2ff;
    background-image: none;
    border: 1px solid #00d2ff;
    color: #070706;
  }

  [data-colander-presentation-host="gamma"] &:hover:not(:disabled) {
    background: #f2ead9;
    color: #070706;
  }
`;

const FactRow = styled.div.attrs(colanderRegionAttrs("fact-row"))`
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 6px;
  font-size: var(--wtf-type-caption, 13px);

  span:last-child {
    overflow-wrap: anywhere;
  }
`;

const SectionTitle = styled.div`
  margin-top: 4px;
  font-weight: 800;
  text-transform: capitalize;
  border-top: 1px solid #e2e2e2;
  padding-top: 6px;

  [data-colander-presentation-host="gamma"] & {
    border-top: 1px solid rgba(0, 210, 255, 0.22);
    color: #f2ead9;
    letter-spacing: 0;
  }
`;

const Muted = styled.span`
  color: var(--wtf-app-muted-text, #555);
  font-size: var(--wtf-type-caption, 13px);

  [data-colander-presentation-host="gamma"] & {
    color: rgba(242, 234, 217, 0.62);
  }
`;

const Graph = styled.div.attrs(colanderRegionAttrs("graph"))`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
`;

const GraphNodeWrap = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
`;

const GraphNode = styled.div.attrs(colanderRegionAttrs("graph-node"))<{ $tone: string }>`
  display: grid;
  gap: 1px;
  border: 1px solid
    ${(p) =>
      p.$tone === "wallet"
        ? "#0b5cad"
        : p.$tone === "franchise"
          ? "#7a4fb0"
          : p.$tone === "parent"
            ? "#a46a00"
            : "#1f7a3f"};
  border-left-width: 4px;
  background: #fff;
  padding: 5px 8px;
  min-width: 96px;

  [data-colander-presentation-host="gamma"] & {
    background: #070706;
    background-image: none;
    border: 1px solid rgba(0, 210, 255, 0.34);
    border-left-width: 1px;
    border-radius: 4px;
    color: #f2ead9;
    box-shadow: none;
    text-shadow: none;
  }
`;

const NodeLabel = styled.div`
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted-text, #555);

  [data-colander-presentation-host="gamma"] & {
    color: rgba(242, 234, 217, 0.62);
  }
`;

const NodeValue = styled.div`
  font-weight: 700;
  font-variant-numeric: tabular-nums;
`;

const Arrow = styled.span`
  color: #888;
  font-weight: 800;

  [data-colander-presentation-host="gamma"] & {
    color: #00d2ff;
  }
`;

const ActionGroupBlock = styled.div`
  display: grid;
  gap: 6px;
`;

const ActionCard = styled.div.attrs(colanderRegionAttrs("action-card"))`
  border: 1px solid var(--wtf-app-border, #b8c6d4);
  background: #fbfdff;
  padding: 8px;
  display: grid;
  gap: 8px;

  [data-colander-presentation-host="gamma"] & {
    background: #070706;
    background-image: none;
    border: 1px solid rgba(242, 234, 217, 0.14);
    border-radius: 6px;
    color: #f2ead9;
    box-shadow: none;
    text-shadow: none;
  }
`;

const ActionHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const ActionName = styled.div`
  font-weight: 700;
`;

const ActionForm = styled.form.attrs(colanderRegionAttrs("action-form"))`
  display: grid;
  gap: 8px;
  border-top: 1px dashed #cdd7e1;
  padding-top: 8px;

  [data-colander-presentation-host="gamma"] & {
    border-top: 1px solid rgba(0, 210, 255, 0.22);
  }
`;

const EmptyState = styled.div.attrs(colanderRegionAttrs("empty"))`
  border: 1px dashed var(--wtf-app-border, #808080);
  background: #fbfbfb;
  display: grid;
  gap: 6px;
  align-content: center;
  padding: 24px;
  text-align: center;

  [data-colander-presentation-host="gamma"] & {
    background: #11110f;
    background-image: none;
    border: 1px solid rgba(242, 234, 217, 0.16);
    border-radius: 6px;
    color: #f2ead9;
    box-shadow: none;
    text-shadow: none;
  }
`;

const StatusLine = styled.div.attrs(colanderRegionAttrs("status"))<{ $error?: boolean }>`
  min-height: 24px;
  padding: 4px 8px;
  color: ${(p) => (p.$error ? "#8b0000" : "var(--wtf-app-muted-text, #444)")};
  font-size: var(--wtf-type-caption, 13px);

  [data-colander-presentation-host="gamma"] & {
    background: #11110f;
    background-image: none;
    border: 1px solid rgba(242, 234, 217, 0.14);
    border-radius: 6px;
    color: ${(p) => (p.$error ? "#ff6f61" : "rgba(242, 234, 217, 0.72)")};
    box-shadow: none;
    text-shadow: none;
  }
`;

const Chip = styled.span.attrs(colanderRegionAttrs("chip"))<{ $tone?: "ok" | "muted" }>`
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 1px 8px;
  border: 1px solid var(--wtf-app-border, #808080);
  font-size: var(--wtf-type-caption, 13px);
  background: ${(p) => (p.$tone === "ok" ? "#e6f5e6" : "#f4f4f4")};

  [data-colander-presentation-host="gamma"] & {
    background: #070706;
    background-image: none;
    border: 1px solid ${(p) => (p.$tone === "ok" ? "#d6ff3f" : "rgba(242, 234, 217, 0.18)")};
    border-radius: 4px;
    color: ${(p) => (p.$tone === "ok" ? "#d6ff3f" : "rgba(242, 234, 217, 0.72)")};
    box-shadow: none;
    text-shadow: none;
  }
`;
